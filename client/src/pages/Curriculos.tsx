import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, UserPlus, FolderPlus, Sparkles, AlertTriangle, ShieldAlert, Ban, CheckCircle, XCircle, Info, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type IAResultado = {
  fileName: string;
  status: "ok" | "erro" | "duplicado" | "blacklist" | "desligado";
  dados: { nome: string; telefone: string; email: string; dataNascimento: string | null; endereco: string; cidade: string; estado: string; funcaoDetectada: string; experiencia: string } | null;
  alertas: { tipo: "duplicado" | "desligado" | "blacklist"; mensagem: string; detalhes?: string }[];
  curriculoId: number | null;
  funcaoId: number | null;
  funcaoNome: string | null;
  erro: string | null;
};

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
  const [form, setForm] = useState({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", observacoes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogFuncaoId, setDialogFuncaoId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [showIADialog, setShowIADialog] = useState(false);
  const [iaFiles, setIAFiles] = useState<File[]>([]);
  const [iaProcessing, setIAProcessing] = useState(false);
  const [iaResults, setIAResults] = useState<IAResultado[] | null>(null);
  const [iaProgress, setIAProgress] = useState("");

  const { data: funcoes = [] } = trpc.curriculos.listarFuncoes.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: curriculosList = [], isLoading } = trpc.curriculos.listar.useQuery(
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
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.curriculos.uploadDoc.useMutation({
    onSuccess: () => { utils.curriculos.listar.invalidate(); toast.success("Currículo anexado"); setUploadingId(null); },
    onError: (e) => { toast.error(e.message); setUploadingId(null); },
  });
  function closeDialog() {
    setShowCurDialog(false);
    setEditingId(null);
    setDialogFuncaoId(null);
    setForm({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", observacoes: "" });
    setPendingFile(null);
  }

  const atualizarMut = trpc.curriculos.atualizar.useMutation({
    onSuccess: () => {
      utils.curriculos.listar.invalidate();
      toast.success("Currículo atualizado");
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.curriculos.excluir.useMutation({
    onSuccess: () => { utils.curriculos.listar.invalidate(); toast.success("Currículo excluído"); },
    onError: (e) => toast.error(e.message),
  });
  const processarIAMut = trpc.curriculos.processarArquivosIA.useMutation();

  function calcularIdade(dataNasc: string | null | undefined): number | null {
    if (!dataNasc) return null;
    const nascimento = new Date(dataNasc + "T00:00:00");
    if (isNaN(nascimento.getTime())) return null;
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mesAtual = hoje.getMonth();
    const mesNasc = nascimento.getMonth();
    if (mesAtual < mesNasc || (mesAtual === mesNasc && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade >= 0 ? idade : null;
  }

  function openEditDialog(c: any) {
    setEditingId(c.id);
    setDialogFuncaoId(c.funcaoId);
    setForm({
      nomeCandidato: c.nomeCandidato || "",
      telefone: c.telefone || "",
      email: c.email || "",
      endereco: c.endereco || "",
      cidade: c.cidade || "",
      estado: c.estado || "",
      dataNascimento: c.dataNascimento || "",
      observacoes: c.observacoes || "",
    });
    setPendingFile(null);
    setShowCurDialog(true);
  }

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

  async function handleIAUpload() {
    if (iaFiles.length === 0) { toast.error("Selecione ao menos um arquivo"); return; }
    setIAProcessing(true);
    setIAResults(null);
    setIAProgress(`Lendo ${iaFiles.length} arquivo(s)...`);

    try {
      const arquivos: { fileBase64: string; fileName: string }[] = [];
      for (const file of iaFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = () => reject(new Error("Erro ao ler " + file.name));
          reader.readAsDataURL(file);
        });
        arquivos.push({ fileBase64: base64, fileName: file.name });
      }

      setIAProgress(`Enviando para IA analisar ${arquivos.length} currículo(s)... Isso pode levar alguns segundos.`);

      const result = await processarIAMut.mutateAsync({ companyId, arquivos });
      setIAResults(result.resultados as IAResultado[]);
      utils.curriculos.listar.invalidate();
      utils.curriculos.listarFuncoes.invalidate();

      const ok = result.resultados.filter((r: any) => r.status === "ok").length;
      const alertas = result.resultados.filter((r: any) => r.status !== "ok" && r.status !== "erro").length;
      const erros = result.resultados.filter((r: any) => r.status === "erro").length;
      setIAProgress(`Concluído: ${ok} cadastrado(s), ${alertas} com alerta(s), ${erros} erro(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivos");
      setIAProgress("Erro no processamento");
    } finally {
      setIAProcessing(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return curriculosList;
    return curriculosList.filter((c: any) =>
      (c.nomeCandidato || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.telefone || "").toLowerCase().includes(q) ||
      (c.cidade || "").toLowerCase().includes(q) ||
      (c.endereco || "").toLowerCase().includes(q) ||
      (c.estado || "").toLowerCase().includes(q)
    );
  }, [curriculosList, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel/rh")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Currículos</h1>
            <p className="text-sm text-slate-500">Banco de currículos organizado por função</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
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

          <div className="col-span-12 md:col-span-9">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input className="pl-9" placeholder="Buscar por nome, telefone, cidade ou região..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => {
                    setIAFiles([]);
                    setIAResults(null);
                    setIAProgress("");
                    setShowIADialog(true);
                  }} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                    <Sparkles className="h-4 w-4 mr-1" /> Upload com IA
                  </Button>
                  <Button onClick={() => {
                    if (!funcoes.length) { toast.error("Crie uma função primeiro"); return; }
                    setEditingId(null);
                    setDialogFuncaoId(funcaoSelecionadaId);
                    setForm({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", observacoes: "" });
                    setPendingFile(null);
                    setShowCurDialog(true);
                  }} className="bg-amber-600 hover:bg-amber-700"><UserPlus className="h-4 w-4 mr-1" /> Novo Currículo</Button>
                </div>
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
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Cidade/Região</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Currículo</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {c.nomeCandidato || "(sem nome)"}
                            {(() => { const idade = calcularIdade(c.dataNascimento); return idade !== null ? <span className="ml-2 text-xs font-normal text-slate-500">{idade} anos</span> : null; })()}
                          </div>
                          {c.observacoes && <div className="text-xs text-slate-500 line-clamp-1">{c.observacoes}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{c.funcaoNome}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.telefone && <div>{c.telefone}</div>}
                          {c.email && <div className="text-slate-500">{c.email}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.cidade ? (
                            <div className="font-medium">{c.cidade}{c.estado ? ` - ${c.estado}` : ""}</div>
                          ) : c.estado ? (
                            <div className="font-medium">{c.estado}</div>
                          ) : null}
                          {c.endereco && <div className="text-slate-400 line-clamp-1">{c.endereco}</div>}
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
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Editar" onClick={() => openEditDialog(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" title="Excluir" onClick={() => { if (confirm(`Excluir currículo de ${c.nomeCandidato || "este candidato"}?`)) excluirMut.mutate({ id: c.id, companyId }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Dialog Novo / Editar Currículo */}
      <Dialog open={showCurDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? <Pencil className="h-5 w-5 text-blue-600" /> : <UserPlus className="h-5 w-5 text-amber-600" />}
              {editingId ? "Editar Currículo" : "Novo Currículo"}
            </DialogTitle>
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
                  value={dialogFuncaoId || ""}
                  onChange={e => setDialogFuncaoId(Number(e.target.value) || null)}>
                  <option value="">Selecione a função</option>
                  {funcoes.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Telefone</Label>
                <Input className="mt-1" placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input className="mt-1" type="date" value={form.dataNascimento} onChange={e => setForm({ ...form, dataNascimento: e.target.value })} />
                {form.dataNascimento && (() => { const idade = calcularIdade(form.dataNascimento); return idade !== null ? <p className="text-xs text-slate-500 mt-1">{idade} anos</p> : null; })()}
              </div>
              <div>
                <Label>E-mail</Label>
                <Input className="mt-1" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input className="mt-1" placeholder="Rua, número, bairro" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input className="mt-1" placeholder="Ex: Guaratinguetá" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div>
                <Label>Estado (UF)</Label>
                <Input className="mt-1" placeholder="SP" maxLength={2} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" placeholder="Indicação, experiência relevante, etc." value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            {!editingId && (
              <div>
                <Label>Anexar Currículo (PDF/DOC/Imagem)</Label>
                <Input type="file" className="mt-1" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setPendingFile(e.target.files?.[0] || null)} />
                {pendingFile && <p className="text-xs text-slate-500 mt-1">{pendingFile.name}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog()}>Cancelar</Button>
            {editingId ? (
              <Button onClick={() => {
                if (!dialogFuncaoId) { toast.error("Selecione a função"); return; }
                atualizarMut.mutate({
                  id: editingId, companyId, funcaoId: dialogFuncaoId,
                  nomeCandidato: form.nomeCandidato.trim(),
                  telefone: form.telefone,
                  email: form.email,
                  endereco: form.endereco,
                  cidade: form.cidade,
                  estado: form.estado,
                  dataNascimento: form.dataNascimento || null,
                  observacoes: form.observacoes,
                });
              }} disabled={atualizarMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            ) : (
              <Button onClick={() => {
                if (!dialogFuncaoId) { toast.error("Selecione a função"); return; }
                if (!companyId) { toast.error("Selecione a empresa"); return; }
                criarMut.mutate({
                  companyId, funcaoId: dialogFuncaoId,
                  nomeCandidato: form.nomeCandidato.trim() || undefined,
                  telefone: form.telefone || undefined,
                  email: form.email || undefined,
                  endereco: form.endereco || undefined,
                  cidade: form.cidade || undefined,
                  estado: form.estado || undefined,
                  dataNascimento: form.dataNascimento || undefined,
                  observacoes: form.observacoes || undefined,
                });
              }} disabled={criarMut.isPending || uploadMut.isPending} className="bg-amber-600 hover:bg-amber-700">
                {(criarMut.isPending || uploadMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Cadastrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Upload com IA */}
      <Dialog open={showIADialog} onOpenChange={(open) => { if (!iaProcessing) setShowIADialog(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Upload com IA
            </DialogTitle>
          </DialogHeader>

          {!iaResults ? (
            <div className="space-y-4 py-2">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="text-sm text-purple-800">
                  Selecione um ou mais currículos (PDF ou imagem). A IA vai ler cada arquivo, extrair os dados automaticamente, verificar duplicidades, ex-funcionários e lista negra.
                </p>
              </div>
              <div>
                <Label>Selecionar Currículos (PDF/JPG/PNG) - Múltiplos</Label>
                <Input
                  type="file"
                  className="mt-1"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  disabled={iaProcessing}
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setIAFiles(files);
                  }}
                />
                {iaFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {iaFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <FileText className="h-3 w-3" />
                        <span>{f.name}</span>
                        <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {iaProgress && (
                <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {iaProgress}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="text-sm text-slate-600 font-medium">{iaProgress}</div>
              {iaResults.map((r, i) => (
                <div key={i} className={`rounded-xl border-2 p-4 ${
                  r.status === "blacklist" ? "border-red-500 bg-red-50" :
                  r.status === "desligado" ? "border-orange-400 bg-orange-50" :
                  r.status === "duplicado" ? "border-yellow-400 bg-yellow-50" :
                  r.status === "erro" ? "border-slate-300 bg-slate-50" :
                  "border-green-400 bg-green-50"
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 mb-2">
                      {r.status === "blacklist" && <Ban className="h-5 w-5 text-red-600" />}
                      {r.status === "desligado" && <AlertTriangle className="h-5 w-5 text-orange-600" />}
                      {r.status === "duplicado" && <Info className="h-5 w-5 text-yellow-600" />}
                      {r.status === "erro" && <XCircle className="h-5 w-5 text-slate-500" />}
                      {r.status === "ok" && <CheckCircle className="h-5 w-5 text-green-600" />}
                      <span className="font-medium text-sm">{r.fileName}</span>
                    </div>
                    {r.status === "ok" && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">Cadastrado</span>}
                    {r.status === "duplicado" && <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-medium">Cadastrado (com alerta)</span>}
                    {r.status === "desligado" && <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium">Cadastrado (ex-funcionário)</span>}
                    {r.status === "blacklist" && <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-semibold">BLOQUEADO</span>}
                    {r.status === "erro" && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">Erro</span>}
                  </div>

                  {r.dados && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                      <div><span className="text-slate-500">Nome:</span> <span className="font-medium">{r.dados.nome || "-"}</span></div>
                      <div><span className="text-slate-500">Função:</span> <span className="font-medium">{r.funcaoNome || r.dados.funcaoDetectada || "-"}</span></div>
                      <div><span className="text-slate-500">Telefone:</span> <span>{r.dados.telefone || "-"}</span></div>
                      <div><span className="text-slate-500">E-mail:</span> <span>{r.dados.email || "-"}</span></div>
                      <div><span className="text-slate-500">Nascimento:</span> <span>{r.dados.dataNascimento ? `${r.dados.dataNascimento.split("-").reverse().join("/")}${(() => { const i = calcularIdade(r.dados.dataNascimento); return i !== null ? ` (${i} anos)` : ""; })()}` : "-"}</span></div>
                      <div><span className="text-slate-500">Cidade:</span> <span>{r.dados.cidade ? `${r.dados.cidade}${r.dados.estado ? ` - ${r.dados.estado}` : ""}` : "-"}</span></div>
                      <div><span className="text-slate-500">Endereço:</span> <span>{r.dados.endereco || "-"}</span></div>
                      {r.dados.experiencia && (
                        <div className="col-span-2"><span className="text-slate-500">Experiência:</span> <span>{r.dados.experiencia}</span></div>
                      )}
                    </div>
                  )}

                  {r.alertas.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {r.alertas.map((a, ai) => (
                        <div key={ai} className={`rounded-lg p-3 text-sm ${
                          a.tipo === "blacklist" ? "bg-red-100 border border-red-300" :
                          a.tipo === "desligado" ? "bg-orange-100 border border-orange-300" :
                          "bg-yellow-100 border border-yellow-300"
                        }`}>
                          <div className="flex items-center gap-2 font-semibold">
                            {a.tipo === "blacklist" && <><ShieldAlert className="h-4 w-4 text-red-700" /><span className="text-red-800">{a.mensagem}</span></>}
                            {a.tipo === "desligado" && <><AlertTriangle className="h-4 w-4 text-orange-700" /><span className="text-orange-800">{a.mensagem}</span></>}
                            {a.tipo === "duplicado" && <><Info className="h-4 w-4 text-yellow-700" /><span className="text-yellow-800">{a.mensagem}</span></>}
                          </div>
                          {a.detalhes && <p className="text-xs mt-1 opacity-80">{a.detalhes}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {r.status === "blacklist" && (
                    <div className="mt-3 p-3 bg-red-200 border-2 border-red-500 rounded-lg">
                      <p className="text-red-900 font-bold text-sm flex items-center gap-2">
                        <Ban className="h-5 w-5" />
                        CANDIDATO NA LISTA NEGRA - CADASTRO BLOQUEADO
                      </p>
                      <p className="text-red-800 text-xs mt-1">Este candidato NÃO foi cadastrado. Consulte o RH antes de prosseguir.</p>
                    </div>
                  )}

                  {r.erro && <p className="text-xs text-slate-500 mt-2">{r.erro}</p>}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            {!iaResults ? (
              <>
                <Button variant="outline" onClick={() => setShowIADialog(false)} disabled={iaProcessing}>Cancelar</Button>
                <Button
                  onClick={handleIAUpload}
                  disabled={iaProcessing || iaFiles.length === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {iaProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {iaProcessing ? "Processando..." : `Processar ${iaFiles.length} arquivo(s)`}
                </Button>
              </>
            ) : (
              <Button onClick={() => { setShowIADialog(false); setIAResults(null); setIAFiles([]); setIAProgress(""); }}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
