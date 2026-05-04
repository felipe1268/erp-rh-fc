import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, UserPlus, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Curriculos() {
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) : 0;
  const utils = trpc.useUtils();

  const [funcaoSelecionadaId, setFuncaoSelecionadaId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCurDialog, setShowCurDialog] = useState(false);
  const [showFuncDialog, setShowFuncDialog] = useState(false);
  const [novaFuncao, setNovaFuncao] = useState("");
  const [form, setForm] = useState({ nomeCandidato: "", telefone: "", email: "", observacoes: "" });
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: funcoes = [] } = trpc.curriculos.listarFuncoes.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: curriculos = [], isLoading } = trpc.curriculos.listar.useQuery(
    { companyId, funcaoId: funcaoSelecionadaId || undefined },
    { enabled: companyId > 0 }
  );

  const criarFuncaoMut = trpc.curriculos.criarFuncao.useMutation({
    onSuccess: () => { utils.curriculos.listarFuncoes.invalidate(); toast.success("Função criada"); setShowFuncDialog(false); setNovaFuncao(""); },
    onError: (e) => toast.error(e.message),
  });
  const excluirFuncaoMut = trpc.curriculos.excluirFuncao.useMutation({
    onSuccess: () => { utils.curriculos.listarFuncoes.invalidate(); utils.curriculos.listar.invalidate(); toast.success("Função excluída"); if (funcaoSelecionadaId) setFuncaoSelecionadaId(null); },
    onError: (e) => toast.error(e.message),
  });
  const criarMut = trpc.curriculos.criar.useMutation({
    onSuccess: async (row) => {
      if (pendingFile && row?.id) {
        await uploadFile(row.id, pendingFile);
      }
      utils.curriculos.listar.invalidate();
      toast.success("Currículo cadastrado");
      setShowCurDialog(false);
      setForm({ nomeCandidato: "", telefone: "", email: "", observacoes: "" });
      setPendingFile(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.curriculos.uploadDoc.useMutation({
    onSuccess: () => { utils.curriculos.listar.invalidate(); toast.success("Currículo anexado"); setUploadingId(null); },
    onError: (e) => { toast.error(e.message); setUploadingId(null); },
  });
  const excluirMut = trpc.curriculos.excluir.useMutation({
    onSuccess: () => { utils.curriculos.listar.invalidate(); toast.success("Currículo excluído"); },
    onError: (e) => toast.error(e.message),
  });

  function uploadFile(id: number, file: File): Promise<void> {
    return new Promise((resolve) => {
      setUploadingId(id);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ id, companyId, fileBase64: base64, fileName: file.name }, {
          onSettled: () => resolve(),
        });
      };
      reader.onerror = () => { toast.error("Erro ao ler arquivo"); setUploadingId(null); resolve(); };
      reader.readAsDataURL(file);
    });
  }

  const contagem = useMemo(() => {
    const map = new Map<number, number>();
    // Need to count without filter — but list is already filtered. Quick fix: skip showing counts when filter active.
    return map;
  }, [funcoes]);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return curriculos;
    return curriculos.filter((c: any) =>
      c.nomeCandidato.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.telefone || "").toLowerCase().includes(q)
    );
  }, [curriculos, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Currículos</h1>
            <p className="text-sm text-slate-500">Banco de currículos organizado por função</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar de Funções */}
          <div className="col-span-12 md:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 text-sm">Funções</h3>
                <Button size="sm" variant="outline" onClick={() => setShowFuncDialog(true)} className="h-7 text-xs"><FolderPlus className="h-3 w-3 mr-1" /> Nova</Button>
              </div>
              <div className="space-y-1">
                <button onClick={() => setFuncaoSelecionadaId(null)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${funcaoSelecionadaId === null ? "bg-amber-100 text-amber-900 font-semibold" : "hover:bg-slate-100 text-slate-700"}`}>
                  Todas as funções
                </button>
                {funcoes.map((f: any) => (
                  <div key={f.id} className="group flex items-center gap-1">
                    <button onClick={() => setFuncaoSelecionadaId(f.id)}
                      className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition ${funcaoSelecionadaId === f.id ? "bg-amber-100 text-amber-900 font-semibold" : "hover:bg-slate-100 text-slate-700"}`}>
                      {f.nome}
                    </button>
                    <button onClick={() => { if (confirm(`Excluir função "${f.nome}"? Os currículos não serão excluídos.`)) excluirFuncaoMut.mutate({ id: f.id, companyId }); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lista de Currículos */}
          <div className="col-span-12 md:col-span-9">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Button onClick={() => {
                  if (!funcoes.length) { toast.error("Crie uma função primeiro"); return; }
                  setShowCurDialog(true);
                }} className="bg-amber-600 hover:bg-amber-700"><UserPlus className="h-4 w-4 mr-1" /> Novo Currículo</Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
              ) : filtrados.length === 0 ? (
                <div className="p-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">Nenhum currículo {funcaoSelecionadaId ? "para esta função" : "cadastrado"}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidato</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Função</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Contato</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 w-40">Currículo</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 w-32">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{c.nomeCandidato || "(sem nome)"}</div>
                          {c.observacoes && <div className="text-xs text-slate-500 line-clamp-1">{c.observacoes}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{c.funcaoNome}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.telefone && <div>{c.telefone}</div>}
                          {c.email && <div className="text-slate-500">{c.email}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {c.documentoUrl ? (
                            <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {c.fileName || "Ver"}
                            </a>
                          ) : (
                            <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-600">
                              {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              {uploadingId === c.id ? "Enviando..." : "Anexar"}
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={uploadingId === c.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(c.id, f); }} />
                            </label>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Excluir currículo de ${c.nomeCandidato || "este candidato"}?`)) excluirMut.mutate({ id: c.id, companyId }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog Nova Função */}
      <Dialog open={showFuncDialog} onOpenChange={setShowFuncDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderPlus className="h-5 w-5 text-amber-600" /> Nova Função</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Nome da Função *</Label>
            <Input className="mt-1" placeholder="Ex: SOLDADOR" value={novaFuncao} onChange={e => setNovaFuncao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFuncDialog(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!novaFuncao.trim()) { toast.error("Informe o nome"); return; }
              criarFuncaoMut.mutate({ companyId, nome: novaFuncao.trim() });
            }} disabled={criarFuncaoMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {criarFuncaoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo Currículo */}
      <Dialog open={showCurDialog} onOpenChange={setShowCurDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-amber-600" /> Novo Currículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome do Candidato</Label>
                <Input className="mt-1" value={form.nomeCandidato} onChange={e => setForm({ ...form, nomeCandidato: e.target.value })} />
              </div>
              <div>
                <Label>Função *</Label>
                <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm h-10"
                  value={funcaoSelecionadaId || ""}
                  onChange={e => setFuncaoSelecionadaId(Number(e.target.value) || null)}>
                  <option value="">Selecione a função</option>
                  {funcoes.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Telefone</Label>
                <Input className="mt-1" placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input className="mt-1" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" placeholder="Indicação, experiência relevante, etc." value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            <div>
              <Label>Anexar Currículo (PDF/DOC/Imagem)</Label>
              <Input type="file" className="mt-1" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setPendingFile(e.target.files?.[0] || null)} />
              {pendingFile && <p className="text-xs text-slate-500 mt-1">{pendingFile.name}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCurDialog(false); setPendingFile(null); }}>Cancelar</Button>
            <Button onClick={() => {
              if (!funcaoSelecionadaId) { toast.error("Selecione a função"); return; }
              if (!companyId) { toast.error("Selecione a empresa"); return; }
              criarMut.mutate({
                companyId, funcaoId: funcaoSelecionadaId,
                nomeCandidato: form.nomeCandidato.trim() || undefined,
                telefone: form.telefone || undefined,
                email: form.email || undefined,
                observacoes: form.observacoes || undefined,
              });
            }} disabled={criarMut.isPending || uploadMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {(criarMut.isPending || uploadMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
