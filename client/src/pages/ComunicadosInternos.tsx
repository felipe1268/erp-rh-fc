import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, Printer, Eye, ChevronLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export default function ComunicadosInternos() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) : 0;
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [anoFiltro, setAnoFiltro] = useState<number | "todos">("todos");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" });
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [viewComunicadoId, setViewComunicadoId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ titulo: "", conteudo: "" });

  const { data: comunicados = [], isLoading } = trpc.comunicadosInternos.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMut = trpc.comunicadosInternos.criar.useMutation({
    onSuccess: (_data) => {
      utils.comunicadosInternos.listar.invalidate();
      toast.success("Comunicado criado");
      setShowDialog(false);
      setForm({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.comunicadosInternos.uploadDoc.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Documento anexado"); setUploadingId(null); },
    onError: (e) => { toast.error(e.message); setUploadingId(null); },
  });
  const atualizarMut = trpc.comunicadosInternos.atualizar.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado atualizado"); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.comunicadosInternos.excluir.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado excluído"); },
    onError: (e) => toast.error(e.message),
  });

  const viewComunicado = useMemo(() => {
    if (viewComunicadoId === null) return null;
    return comunicados.find((c: any) => c.id === viewComunicadoId) || null;
  }, [comunicados, viewComunicadoId]);

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

  if (viewComunicado) {
    const c = viewComunicado;
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA";
    const cnpj = selectedCompany?.cnpj || "";
    const logoUrl = selectedCompany?.logoUrl;
    const endereco = selectedCompany?.endereco || "";
    const cidade = selectedCompany?.cidade || "";
    const estado = selectedCompany?.estado || "";

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setViewComunicadoId(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => {
              const oldTitle = document.title;
              document.title = `Comunicado ${c.numero} - ${c.titulo}`;
              window.print();
              setTimeout(() => { document.title = oldTitle; }, 500);
            }}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            {c.documentoUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(c.documentoUrl, '_blank')}>
                <FileText className="h-4 w-4 mr-1" /> Ver Anexo
              </Button>
            )}
            {!c.documentoUrl && (
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-1" /> Anexar Arquivo</span>
                </Button>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(c.id, f); }} />
              </label>
            )}
          </div>

          <div className="bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4 print:max-w-none">
            <div className="mb-6">
              <div className="flex flex-col items-center justify-center mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt={nomeEmpresa} className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                ) : (
                  <img src="/fc-logo.png" alt="FC Engenharia" className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                )}
                <h2 className="text-lg font-bold text-[#1B2A4A] tracking-wide text-center">
                  {nomeEmpresa}
                </h2>
                {cnpj && <p className="text-[10px] text-gray-500">CNPJ: {cnpj}</p>}
                {(endereco || cidade) && (
                  <p className="text-[10px] text-gray-400">
                    {[endereco, cidade, estado].filter(Boolean).join(" - ")}
                  </p>
                )}
              </div>

              <div className="bg-[#1B2A4A] text-white py-2.5 px-4 text-center rounded-sm">
                <span className="text-sm font-bold tracking-wider">COMUNICADO INTERNO</span>
              </div>

              <div className="flex justify-between mt-3 text-[11px] text-gray-600 px-1">
                <div>
                  <span className="font-semibold text-[#1B2A4A]">Nº {c.numero}</span>
                </div>
                <div className="text-right">
                  <span>Data de Emissão: {formatDateBR(c.dataEmissao)}</span>
                </div>
              </div>
            </div>

            <div className="border border-gray-300 rounded p-4 mb-6">
              <div className="mb-3">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Assunto:</span>
                <h3 className="text-base font-bold text-[#1B2A4A] mt-0.5">{c.titulo}</h3>
              </div>
            </div>

            <div className="border border-gray-200 rounded p-6 mb-6 min-h-[200px]">
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {c.conteudo || ""}
              </div>
            </div>

            <div className="mt-12 pt-6">
              <div className="flex justify-between gap-12">
                <div className="flex-1 text-center">
                  <div className="border-t border-gray-400 pt-2 mx-4">
                    <p className="text-[10px] text-gray-500">Departamento de Recursos Humanos</p>
                  </div>
                </div>
                <div className="flex-1 text-center">
                  <div className="border-t border-gray-400 pt-2 mx-4">
                    <p className="text-[10px] text-gray-500">Direção</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between text-[9px] text-gray-400">
              <span>Documento gerado pelo ERP - Gestão Integrada</span>
              <span>
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                {c.criadoPor ? ` | Por: ${c.criadoPor}` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel/rh")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
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
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 w-36">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">{c.numero}</td>
                      <td className="px-4 py-3 overflow-hidden max-w-0">
                        <div className="font-medium text-slate-800 truncate">{c.titulo}</div>
                        {c.conteudo && <div className="text-xs text-slate-500 truncate">{c.conteudo.length > 100 ? c.conteudo.substring(0, 100) + "..." : c.conteudo}</div>}
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Visualizar / Imprimir"
                          onClick={() => setViewComunicadoId(c.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" title="Editar"
                          onClick={() => { setEditId(c.id); setEditForm({ titulo: c.titulo, conteudo: c.conteudo || "" }); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {c.documentoUrl && (
                          <label className="cursor-pointer inline-block">
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-600" /> Novo Comunicado Interno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
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
              <Label>Conteúdo</Label>
              <Textarea className="mt-1 min-h-[120px] max-h-[250px] resize-y" placeholder="Texto do comunicado..." value={form.conteudo} onChange={e => setForm({ ...form, conteudo: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
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

      <Dialog open={editId !== null} onOpenChange={(open) => { if (!open) setEditId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-amber-600" /> Editar Comunicado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" value={editForm.titulo} onChange={e => setEditForm({ ...editForm, titulo: e.target.value })} />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea className="mt-1 min-h-[120px] max-h-[250px] resize-y" placeholder="Texto do comunicado..." value={editForm.conteudo} onChange={e => setEditForm({ ...editForm, conteudo: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!editForm.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!editId) return;
              atualizarMut.mutate({ id: editId, companyId, titulo: editForm.titulo.trim(), conteudo: editForm.conteudo || null });
            }} disabled={atualizarMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
