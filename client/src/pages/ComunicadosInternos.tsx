import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function ComunicadosInternos() {
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) : 0;
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [anoFiltro, setAnoFiltro] = useState<number | "todos">("todos");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" });
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const { data: comunicados = [], isLoading } = trpc.comunicadosInternos.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMut = trpc.comunicadosInternos.criar.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado criado"); setShowDialog(false); setForm({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.comunicadosInternos.uploadDoc.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Documento anexado"); setUploadingId(null); },
    onError: (e) => { toast.error(e.message); setUploadingId(null); },
  });
  const excluirMut = trpc.comunicadosInternos.excluir.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado excluído"); },
    onError: (e) => toast.error(e.message),
  });

  const anos = useMemo(() => {
    const set = new Set<number>(comunicados.map((c: any) => c.ano));
    return Array.from(set).sort((a, b) => b - a);
  }, [comunicados]);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    return comunicados.filter((c: any) => {
      if (anoFiltro !== "todos" && c.ano !== anoFiltro) return false;
      if (!q) return true;
      return c.numero.toLowerCase().includes(q) || c.titulo.toLowerCase().includes(q);
    });
  }, [comunicados, search, anoFiltro]);

  async function handleFileUpload(id: number, file: File) {
    setUploadingId(id);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate({ id, companyId, fileBase64: base64, fileName: file.name });
    };
    reader.onerror = () => { toast.error("Erro ao ler arquivo"); setUploadingId(null); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
            <Megaphone className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Comunicados Internos</h1>
            <p className="text-sm text-slate-500">Numeração automática por ano (ex: 001/{new Date().getFullYear()})</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Buscar por número ou título..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={String(anoFiltro)} onChange={e => setAnoFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))}>
              <option value="todos">Todos os anos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setShowDialog(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-1" /> Novo Comunicado</Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">Nenhum comunicado encontrado</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-220px)]">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-slate-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Nº</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Título</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Documento</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 w-28">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">{c.numero}</td>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="font-medium text-slate-800 truncate">{c.titulo}</div>
                        {c.conteudo && <div className="text-xs text-slate-500 truncate">{c.conteudo}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{new Date(c.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        {c.documentoUrl ? (
                          <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                            <FileText className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{c.fileName || "Ver"}</span>
                          </a>
                        ) : (
                          <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                            {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            {uploadingId === c.id ? "Enviando..." : "Anexar"}
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx" disabled={uploadingId === c.id}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(c.id, f); }} />
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.documentoUrl && (
                          <label className="cursor-pointer inline-block mr-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild><span><Upload className="h-3.5 w-3.5" /></span></Button>
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx" disabled={uploadingId === c.id}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(c.id, f); }} />
                          </label>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Excluir comunicado ${c.numero}?`)) excluirMut.mutate({ id: c.id, companyId }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-600" /> Novo Comunicado Interno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" placeholder="Ex: Registro de Ponto" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div>
              <Label>Data de Emissão *</Label>
              <Input type="date" className="mt-1" value={form.dataEmissao} onChange={e => setForm({ ...form, dataEmissao: e.target.value })} />
              <p className="text-xs text-slate-500 mt-1">A numeração ({String((comunicados.filter((c:any)=>c.ano===new Date(form.dataEmissao+"T12:00:00").getFullYear()).length)+1).padStart(3,"0")}/{new Date(form.dataEmissao+"T12:00:00").getFullYear()}) é gerada automaticamente.</p>
            </div>
            <div>
              <Label>Conteúdo (resumo)</Label>
              <Textarea className="mt-1 min-h-[120px]" placeholder="Resumo do comunicado..." value={form.conteudo} onChange={e => setForm({ ...form, conteudo: e.target.value })} />
              <p className="text-xs text-slate-500 mt-1">Após criar, você poderá anexar o arquivo (PDF/DOC) na lista.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!companyId) { toast.error("Selecione a empresa"); return; }
              criarMut.mutate({ companyId, titulo: form.titulo.trim(), dataEmissao: form.dataEmissao, conteudo: form.conteudo || undefined });
            }} disabled={criarMut.isPending} className="bg-blue-600 hover:bg-blue-700">
              {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Comunicado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
