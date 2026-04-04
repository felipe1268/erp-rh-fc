import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CheckSquare, Plus, Loader2, Trash2, ArrowLeft,
  CheckCircle, XCircle, MinusCircle, Camera, Eye,
} from "lucide-react";

const DISCIPLINAS = ["Civil", "Elétrica", "Hidráulica", "Estrutura", "Acabamento", "Fundação", "Impermeabilização", "Pintura", "Segurança"];

export default function Checklists() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const obras = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const [obraId, setObraId] = useState<number>(obraIdParam);
  const selectedObraId = obraId || obraIdParam || (obras.data as any)?.[0]?.id || 0;

  const [view, setView] = useState<"lista" | "preencher" | "templates" | "novoTemplate">("lista");
  const [selectedChecklistId, setSelectedChecklistId] = useState<number | null>(null);

  const checklists = trpc.operacional.listarChecklists.useQuery(
    { companyId, obraId: selectedObraId },
    { enabled: !!companyId && !!selectedObraId },
  );
  const templates = trpc.operacional.listarTemplatesChecklist.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  const respostas = trpc.operacional.getChecklistRespostas.useQuery(
    { checklistId: selectedChecklistId!, companyId },
    { enabled: !!selectedChecklistId && !!companyId },
  );

  const criarTemplate = trpc.operacional.criarTemplateChecklist.useMutation({
    onSuccess: () => { toast.success("Template criado!"); templates.refetch(); setView("templates"); },
  });
  const criarChecklist = trpc.operacional.criarChecklistPreenchido.useMutation({
    onSuccess: (data) => {
      toast.success("Checklist iniciado!");
      setSelectedChecklistId(data.id);
      setView("preencher");
      checklists.refetch();
    },
  });
  const responder = trpc.operacional.responderChecklist.useMutation({
    onSuccess: () => respostas.refetch(),
  });

  const [novoTemplate, setNovoTemplate] = useState({ nome: "", disciplina: "", descricao: "", itens: [{ descricao: "", categoria: "", fotoObrigatoria: false, criticidade: "normal" }] as any[] });
  const [dialogNovoChecklist, setDialogNovoChecklist] = useState(false);
  const [novoChecklistForm, setNovoChecklistForm] = useState({ templateId: 0, local: "", pavimento: "" });

  if (view === "preencher" && selectedChecklistId) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView("lista"); setSelectedChecklistId(null); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold">Preencher Checklist</h1>
        </div>

        {respostas.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
        ) : (
          <div className="space-y-2">
            {(respostas.data as any[])?.map((r: any) => (
              <Card key={r.id} className={r.resposta === "nc" ? "border-red-300 bg-red-50" : r.resposta === "conforme" ? "border-green-200 bg-green-50" : ""}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{r.descricao_item}</p>
                      {r.categoria && <p className="text-xs text-gray-500">{r.categoria}</p>}
                      {r.criticidade === "critico" && <Badge variant="destructive" className="text-xs mt-1">Crítico</Badge>}
                      {r.observacao && <p className="text-xs text-gray-400 mt-1">Obs: {r.observacao}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={r.resposta === "conforme" ? "default" : "outline"}
                        className={r.resposta === "conforme" ? "bg-green-600" : ""}
                        onClick={() => responder.mutate({ respostaId: r.id, companyId, resposta: "conforme" })}
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={r.resposta === "nc" ? "default" : "outline"}
                        className={r.resposta === "nc" ? "bg-red-600" : ""}
                        onClick={() => responder.mutate({ respostaId: r.id, companyId, resposta: "nc" })}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={r.resposta === "na" ? "default" : "outline"}
                        className={r.resposta === "na" ? "bg-gray-600" : ""}
                        onClick={() => responder.mutate({ respostaId: r.id, companyId, resposta: "na" })}
                      >
                        <MinusCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "novoTemplate") {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("templates")}><ArrowLeft className="w-4 h-4" /></Button>
          <h1 className="text-xl font-bold">Novo Template de Checklist</h1>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={novoTemplate.nome} onChange={(e) => setNovoTemplate({ ...novoTemplate, nome: e.target.value })} placeholder="Ex: Checklist de Concretagem" /></div>
              <div><Label>Disciplina</Label>
                <Select value={novoTemplate.disciplina} onValueChange={(v) => setNovoTemplate({ ...novoTemplate, disciplina: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Descrição</Label><Textarea value={novoTemplate.descricao} onChange={(e) => setNovoTemplate({ ...novoTemplate, descricao: e.target.value })} /></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Itens do Checklist</Label>
                <Button size="sm" variant="outline" onClick={() => setNovoTemplate({ ...novoTemplate, itens: [...novoTemplate.itens, { descricao: "", categoria: "", fotoObrigatoria: false, criticidade: "normal" }] })}>
                  <Plus className="w-3 h-3 mr-1" /> Item
                </Button>
              </div>
              <div className="space-y-2">
                {novoTemplate.itens.map((item: any, idx: number) => (
                  <div key={idx} className="border rounded p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input className="flex-1" placeholder="Descrição do item" value={item.descricao} onChange={(e) => {
                        const itens = [...novoTemplate.itens];
                        itens[idx] = { ...item, descricao: e.target.value };
                        setNovoTemplate({ ...novoTemplate, itens });
                      }} />
                      <Input className="w-32" placeholder="Categoria" value={item.categoria} onChange={(e) => {
                        const itens = [...novoTemplate.itens];
                        itens[idx] = { ...item, categoria: e.target.value };
                        setNovoTemplate({ ...novoTemplate, itens });
                      }} />
                      <Button variant="ghost" size="sm" onClick={() => {
                        const itens = novoTemplate.itens.filter((_: any, i: number) => i !== idx);
                        setNovoTemplate({ ...novoTemplate, itens });
                      }}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={item.fotoObrigatoria} onChange={(e) => {
                          const itens = [...novoTemplate.itens];
                          itens[idx] = { ...item, fotoObrigatoria: e.target.checked };
                          setNovoTemplate({ ...novoTemplate, itens });
                        }} /> <Camera className="w-3 h-3" /> Foto obrigatória
                      </label>
                      <select className="text-xs border rounded px-2 py-1" value={item.criticidade} onChange={(e) => {
                        const itens = [...novoTemplate.itens];
                        itens[idx] = { ...item, criticidade: e.target.value };
                        setNovoTemplate({ ...novoTemplate, itens });
                      }}>
                        <option value="normal">Normal</option>
                        <option value="critico">Crítico</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" disabled={!novoTemplate.nome || novoTemplate.itens.length === 0 || criarTemplate.isPending}
              onClick={() => criarTemplate.mutate({ companyId, ...novoTemplate })}>
              {criarTemplate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Template
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "templates") {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("lista")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-xl font-bold">Templates de Checklist</h1>
          </div>
          <Button onClick={() => { setNovoTemplate({ nome: "", disciplina: "", descricao: "", itens: [{ descricao: "", categoria: "", fotoObrigatoria: false, criticidade: "normal" }] }); setView("novoTemplate"); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo Template
          </Button>
        </div>
        {templates.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
        ) : (templates.data as any[])?.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <CheckSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Nenhum template criado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(templates.data as any[])?.map((t: any) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t.nome}</CardTitle>
                </CardHeader>
                <CardContent>
                  {t.disciplina && <Badge variant="outline" className="mb-2">{t.disciplina}</Badge>}
                  <p className="text-xs text-gray-500">{t.total_itens || 0} itens</p>
                  {t.descricao && <p className="text-xs text-gray-400 mt-1">{t.descricao}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checklists de Obra</h1>
          <p className="text-sm text-gray-500">Verificações de qualidade e conformidade</p>
        </div>
        <div className="flex gap-3">
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
            <SelectContent>
              {(obras.data as any[])?.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setView("templates")}>Templates</Button>
          <Button onClick={() => setDialogNovoChecklist(true)} disabled={!selectedObraId}>
            <Plus className="w-4 h-4 mr-2" /> Novo Checklist
          </Button>
        </div>
      </div>

      {checklists.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (checklists.data as any[])?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CheckSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhum checklist preenchido</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(checklists.data as any[])?.map((c: any) => (
            <div key={c.id} className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
              onClick={() => { setSelectedChecklistId(c.id); setView("preencher"); }}>
              <div>
                <p className="font-medium">{c.template_nome || "Checklist"}</p>
                <p className="text-xs text-gray-500">{new Date(c.data).toLocaleDateString("pt-BR")} • {c.local || ""} {c.pavimento || ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {c.template_disciplina && <Badge variant="outline">{c.template_disciplina}</Badge>}
                <Badge variant={c.status === "concluido" ? "default" : "secondary"}>
                  {c.status === "concluido" ? "Concluído" : "Em Andamento"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogNovoChecklist} onOpenChange={setDialogNovoChecklist}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Checklist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select value={String(novoChecklistForm.templateId || "")} onValueChange={(v) => setNovoChecklistForm({ ...novoChecklistForm, templateId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione o template" /></SelectTrigger>
                <SelectContent>
                  {(templates.data as any[])?.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Local</Label><Input value={novoChecklistForm.local} onChange={(e) => setNovoChecklistForm({ ...novoChecklistForm, local: e.target.value })} placeholder="Ex: Bloco A" /></div>
            <div><Label>Pavimento</Label><Input value={novoChecklistForm.pavimento} onChange={(e) => setNovoChecklistForm({ ...novoChecklistForm, pavimento: e.target.value })} placeholder="Ex: Térreo" /></div>
            <Button className="w-full" disabled={!novoChecklistForm.templateId || criarChecklist.isPending}
              onClick={() => {
                criarChecklist.mutate({ companyId, obraId: selectedObraId, templateId: novoChecklistForm.templateId, local: novoChecklistForm.local, pavimento: novoChecklistForm.pavimento, responsavelNome: user?.nome || user?.email });
                setDialogNovoChecklist(false);
              }}>
              Iniciar Checklist
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
