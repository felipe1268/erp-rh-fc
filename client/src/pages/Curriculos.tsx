import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, UserPlus, FolderPlus, Sparkles, AlertTriangle, ShieldAlert, Ban, CheckCircle, XCircle, Info, Pencil, Save, ThumbsDown, RotateCcw, X, Phone, Mail, MapPin, GraduationCap, Wrench, Calendar, Clock, Building2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import FullScreenDialog from "@/components/FullScreenDialog";

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

type Experiencia = {
  empresa: string;
  cargo: string;
  periodo: string;
  duracao: string;
  descricao: string;
};

type StatusTab = "ativo" | "reprovado" | "todos";

export default function Curriculos() {
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) : 0;
  const utils = trpc.useUtils();

  const [funcoesSelecionadas, setFuncoesSelecionadas] = useState<number[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>("ativo");
  const [search, setSearch] = useState("");
  const [showCurDialog, setShowCurDialog] = useState(false);
  const [showFuncDialog, setShowFuncDialog] = useState(false);
  const [novaFuncao, setNovaFuncao] = useState("");
  const [form, setForm] = useState({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", habilidades: "", escolaridade: "", cursoFormacao: "", observacoes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogFuncaoId, setDialogFuncaoId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showReprovDialog, setShowReprovDialog] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");

  const [fichaAberta, setFichaAberta] = useState<any | null>(null);

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
    { companyId, funcaoIds: funcoesSelecionadas.length > 0 ? funcoesSelecionadas : undefined, statusCandidato: statusTab },
    { enabled: companyId > 0 }
  );

  useEffect(() => {
    if (fichaAberta && curriculosList.length > 0) {
      const updated = curriculosList.find((c: any) => c.id === fichaAberta.id);
      if (updated && (updated.documentoUrl !== fichaAberta.documentoUrl || updated.fileName !== fichaAberta.fileName)) {
        setFichaAberta({ ...updated });
      }
    }
  }, [curriculosList, fichaAberta]);

  const criarFuncaoMut = trpc.curriculos.criarFuncao.useMutation({
    onSuccess: () => { utils.curriculos.listarFuncoes.invalidate(); toast.success("Função criada"); setShowFuncDialog(false); setNovaFuncao(""); },
    onError: (e) => toast.error(e.message),
  });
  const excluirFuncaoMut = trpc.curriculos.excluirFuncao.useMutation({
    onSuccess: (_, vars) => { utils.curriculos.listarFuncoes.invalidate(); utils.curriculos.listar.invalidate(); toast.success("Função excluída"); setFuncoesSelecionadas(prev => prev.filter(id => id !== vars.id)); },
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
    setForm({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", habilidades: "", escolaridade: "", cursoFormacao: "", observacoes: "" });
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
  const excluirVariosMut = trpc.curriculos.excluirVarios.useMutation({
    onSuccess: (data) => {
      utils.curriculos.listar.invalidate();
      toast.success(`${data.count} currículo(s) excluído(s)`);
      setSelectedIds([]);
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatusMut = trpc.curriculos.atualizarStatus.useMutation({
    onSuccess: (data) => {
      utils.curriculos.listar.invalidate();
      toast.success(`Status atualizado para ${data.count} candidato(s)`);
      setSelectedIds([]);
      setShowReprovDialog(false);
      setMotivoReprovacao("");
    },
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

  function formatDate(d: string | null | undefined): string {
    if (!d) return "-";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  }

  function parseExperiencias(json: string | null | undefined): Experiencia[] {
    if (!json) return [];
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
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
      habilidades: c.habilidades || "",
      escolaridade: c.escolaridade || "",
      cursoFormacao: c.cursoFormacao || "",
      observacoes: c.observacoes || "",
    });
    setPendingFile(null);
    setFichaAberta(null);
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

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    if (selectedIds.length === filtrados.length) setSelectedIds([]);
    else setSelectedIds(filtrados.map((c: any) => c.id));
  }
  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Excluir ${selectedIds.length} currículo(s) selecionado(s)?`)) return;
    excluirVariosMut.mutate({ ids: selectedIds, companyId });
  }
  function handleBulkReprovar() {
    if (selectedIds.length === 0) return;
    setMotivoReprovacao("");
    setShowReprovDialog(true);
  }
  function handleBulkReativar() {
    if (selectedIds.length === 0) return;
    atualizarStatusMut.mutate({ ids: selectedIds, companyId, statusCandidato: "ativo" });
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
      (c.estado || "").toLowerCase().includes(q) ||
      (c.habilidades || "").toLowerCase().includes(q)
    );
  }, [curriculosList, search]);

  const statusBadge = (status: string, motivo?: string | null) => {
    if (status === "reprovado") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium" title={motivo || ""}>
          <ThumbsDown className="h-3 w-3" /> Reprovado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
        <CheckCircle className="h-3 w-3" /> Ativo
      </span>
    );
  };

  function isImageFile(url: string | null | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") || lower.includes(".webp");
  }

  return (
    <>
    <FullScreenDialog
      open={!!fichaAberta}
      onClose={() => setFichaAberta(null)}
      title={fichaAberta?.nomeCandidato || "Ficha do Candidato"}
      subtitle={`${fichaAberta?.funcaoNome || ""}${(() => { const i = calcularIdade(fichaAberta?.dataNascimento); return i !== null ? ` · ${i} anos` : ""; })()}`}
      icon={<Eye className="h-5 w-5 text-white" />}
      headerActions={
        <Button size="sm" variant="ghost" onClick={() => { if (fichaAberta) { setFichaAberta(null); openEditDialog(fichaAberta); } }} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      }
    >
      {fichaAberta && (
        <div className="space-y-6">
          {fichaAberta.statusCandidato === "reprovado" && fichaAberta.motivoReprovacao && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                <span className="font-semibold text-red-800 text-sm">Candidato Reprovado</span>
              </div>
              <p className="text-sm text-red-700">{fichaAberta.motivoReprovacao}</p>
              {fichaAberta.statusAtualizadoPor && (
                <p className="text-xs text-red-500 mt-1">Por: {fichaAberta.statusAtualizadoPor}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 pb-4 border-b border-primary/20">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-lg">
              {(fichaAberta.nomeCandidato || "?")[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{fichaAberta.nomeCandidato || "(sem nome)"}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">{fichaAberta.funcaoNome}</span>
                {statusBadge(fichaAberta.statusCandidato, fichaAberta.motivoReprovacao)}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Dados Pessoais</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Nome Completo</Label>
                <p className="text-sm font-medium mt-0.5">{fichaAberta.nomeCandidato || "-"}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Data de Nascimento</Label>
                <p className="text-sm font-medium mt-0.5">
                  {formatDate(fichaAberta.dataNascimento)}
                  {(() => { const i = calcularIdade(fichaAberta.dataNascimento); return i !== null ? ` (${i} anos)` : ""; })()}
                </p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Telefone</Label>
                <p className="text-sm font-medium mt-0.5">{fichaAberta.telefone ? <a href={`tel:${fichaAberta.telefone}`} className="text-blue-600 hover:underline">{fichaAberta.telefone}</a> : "-"}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                <p className="text-sm font-medium mt-0.5 break-all">{fichaAberta.email ? <a href={`mailto:${fichaAberta.email}`} className="text-blue-600 hover:underline">{fichaAberta.email}</a> : "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Endereço</Label>
                <p className="text-sm font-medium mt-0.5">
                  {fichaAberta.endereco || "-"}
                  {fichaAberta.cidade ? ` - ${fichaAberta.cidade}` : ""}
                  {fichaAberta.estado ? `/${fichaAberta.estado}` : ""}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Formação e Qualificações</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Escolaridade</Label>
                <p className="text-sm font-medium mt-0.5">{fichaAberta.escolaridade || "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Cursos / Formações / Certificações</Label>
                <p className="text-sm font-medium mt-0.5">{fichaAberta.cursoFormacao || "-"}</p>
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs font-medium text-muted-foreground">Habilidades</Label>
                {fichaAberta.habilidades ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {fichaAberta.habilidades.split(";").map((h: string, i: number) => h.trim() && (
                      <span key={i} className="inline-block px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{h.trim()}</span>
                    ))}
                  </div>
                ) : <p className="text-sm font-medium mt-0.5">-</p>}
              </div>
            </div>
          </div>

          {(() => {
            const exps = parseExperiencias(fichaAberta.experienciasJson);
            if (exps.length === 0 && !fichaAberta.observacoes) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h4 className="text-base font-semibold text-primary">Experiência Profissional</h4>
                </div>
                {exps.length > 0 ? (
                  <div className="space-y-3">
                    {exps.map((exp, i) => (
                      <div key={i} className="bg-card rounded-lg p-4 border">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                          <div>
                            <p className="font-semibold text-sm">{exp.cargo || "Cargo não informado"}</p>
                            <p className="text-sm text-muted-foreground">{exp.empresa || "Empresa não informada"}</p>
                          </div>
                          <div className="sm:text-right text-xs text-muted-foreground flex-shrink-0">
                            {exp.periodo && <div className="flex items-center gap-1 sm:justify-end"><Calendar className="h-3 w-3" /> {exp.periodo}</div>}
                            {exp.duracao && <div className="flex items-center gap-1 sm:justify-end mt-0.5"><Clock className="h-3 w-3" /> {exp.duracao}</div>}
                          </div>
                        </div>
                        {exp.descricao && <p className="text-xs text-muted-foreground mt-2">{exp.descricao}</p>}
                      </div>
                    ))}
                  </div>
                ) : fichaAberta.observacoes ? (
                  <div className="bg-card rounded-lg p-4 border">
                    <p className="text-sm">{fichaAberta.observacoes}</p>
                  </div>
                ) : null}
                {exps.length > 0 && fichaAberta.observacoes && (
                  <div className="mt-3">
                    <Label className="text-xs font-medium text-muted-foreground">Observações adicionais</Label>
                    <p className="text-sm bg-card rounded-lg p-3 border mt-1">{fichaAberta.observacoes}</p>
                  </div>
                )}
              </div>
            );
          })()}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Currículo Anexado</h4>
            </div>
            {fichaAberta.documentoUrl ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <a href={fichaAberta.documentoUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition text-sm font-medium">
                    <Eye className="h-4 w-4" />
                    {fichaAberta.fileName || "Abrir Currículo"}
                  </a>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2.5 bg-card border rounded-lg text-muted-foreground hover:bg-accent transition text-xs">
                    <Upload className="h-3.5 w-3.5" /> Substituir arquivo
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(fichaAberta.id, f); }} />
                  </label>
                </div>
                {isImageFile(fichaAberta.documentoUrl) && (
                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <img src={fichaAberta.documentoUrl} alt="Currículo" className="w-full h-auto object-contain max-h-[70vh]" />
                  </div>
                )}
                {fichaAberta.documentoUrl.toLowerCase().includes(".pdf") && (
                  <div className="border rounded-lg overflow-hidden bg-muted" style={{ height: "70vh" }}>
                    <iframe src={fichaAberta.documentoUrl} className="w-full h-full" title="Currículo PDF" />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-muted/50 border-2 border-dashed rounded-lg p-10 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">Nenhum currículo anexado</p>
                <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 border border-primary/20 rounded-lg text-primary hover:bg-primary/20 transition text-sm font-medium">
                  <Upload className="h-4 w-4" /> Anexar Currículo
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(fichaAberta.id, f); }} />
                </label>
              </div>
            )}
          </div>

          <div className="border-t pt-4 text-xs text-muted-foreground flex items-center justify-between">
            <span>Cadastrado por: {fichaAberta.criadoPor || "-"} em {fichaAberta.createdAt ? new Date(fichaAberta.createdAt).toLocaleDateString("pt-BR") : "-"}</span>
            <span>ID: #{fichaAberta.id}</span>
          </div>
        </div>
      )}
    </FullScreenDialog>

    <div className={fichaAberta ? "hidden" : ""}>
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
                <button onClick={() => setFuncoesSelecionadas([])}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${funcoesSelecionadas.length === 0 ? "bg-amber-100 text-amber-900 font-semibold" : "hover:bg-slate-100 text-slate-700"}`}>
                  Todas as funções
                </button>
                {funcoes.map((f: any) => {
                  const checked = funcoesSelecionadas.includes(f.id);
                  return (
                    <div key={f.id} className="group flex items-center gap-1">
                      <button onClick={() => { setFuncoesSelecionadas(prev => checked ? prev.filter(id => id !== f.id) : [...prev, f.id]); setSelectedIds([]); }}
                        className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 ${checked ? "bg-amber-100 text-amber-900 font-semibold" : "hover:bg-slate-100 text-slate-700"}`}>
                        <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-xs flex-shrink-0 ${checked ? "bg-amber-600 border-amber-600 text-white" : "border-slate-300"}`}>
                          {checked && "✓"}
                        </span>
                        {f.nome}
                      </button>
                      <button onClick={() => { if (confirm(`Excluir função "${f.nome}"? Os currículos não serão excluídos.`)) excluirFuncaoMut.mutate({ id: f.id, companyId }); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {funcoesSelecionadas.length > 1 && (
                  <div className="pt-2 border-t mt-2">
                    <p className="text-xs text-slate-500 px-3">{funcoesSelecionadas.length} funções selecionadas</p>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">Status</h3>
              <div className="space-y-1">
                {([
                  { key: "ativo" as StatusTab, label: "Ativos", icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-green-700" },
                  { key: "reprovado" as StatusTab, label: "Reprovados", icon: <ThumbsDown className="h-3.5 w-3.5" />, color: "text-red-600" },
                  { key: "todos" as StatusTab, label: "Todos", icon: <Briefcase className="h-3.5 w-3.5" />, color: "text-slate-600" },
                ]).map(tab => (
                  <button key={tab.key} onClick={() => { setStatusTab(tab.key); setSelectedIds([]); }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 ${statusTab === tab.key ? "bg-amber-100 text-amber-900 font-semibold" : "hover:bg-slate-100 text-slate-700"}`}>
                    <span className={statusTab === tab.key ? "text-amber-700" : tab.color}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-9">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input className="pl-9" placeholder="Buscar por nome, telefone, cidade, habilidade..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => {
                    setIAFiles([]); setIAResults(null); setIAProgress(""); setShowIADialog(true);
                  }} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                    <Sparkles className="h-4 w-4 mr-1" /> Upload com IA
                  </Button>
                  <Button onClick={() => {
                    if (!funcoes.length) { toast.error("Crie uma função primeiro"); return; }
                    setEditingId(null);
                    setDialogFuncaoId(funcoesSelecionadas.length === 1 ? funcoesSelecionadas[0] : null);
                    setForm({ nomeCandidato: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", dataNascimento: "", habilidades: "", escolaridade: "", cursoFormacao: "", observacoes: "" });
                    setPendingFile(null);
                    setShowCurDialog(true);
                  }} className="bg-amber-600 hover:bg-amber-700"><UserPlus className="h-4 w-4 mr-1" /> Novo Currículo</Button>
                </div>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-blue-800">{selectedIds.length} selecionado(s)</span>
                <div className="flex gap-2 ml-auto">
                  {(statusTab === "ativo" || statusTab === "todos") && (
                    <Button size="sm" variant="outline" onClick={handleBulkReprovar} disabled={atualizarStatusMut.isPending}
                      className="border-red-300 text-red-700 hover:bg-red-50 h-8 text-xs">
                      <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reprovar
                    </Button>
                  )}
                  {(statusTab === "reprovado" || statusTab === "todos") && (
                    <Button size="sm" variant="outline" onClick={handleBulkReativar} disabled={atualizarStatusMut.isPending}
                      className="border-green-300 text-green-700 hover:bg-green-50 h-8 text-xs">
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reativar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleBulkDelete} disabled={excluirVariosMut.isPending}
                    className="border-red-400 text-red-700 hover:bg-red-100 h-8 text-xs">
                    {excluirVariosMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    Excluir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="h-8 text-xs text-slate-500">Limpar</Button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
              ) : filtrados.length === 0 ? (
                <div className="p-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">
                    {statusTab === "reprovado" ? "Nenhum candidato reprovado" :
                     funcoesSelecionadas.length > 0 ? "Nenhum currículo para esta(s) função(ões)" : "Nenhum currículo cadastrado"}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-3 w-10">
                        <input type="checkbox" className="rounded border-slate-300 accent-amber-600"
                          checked={filtrados.length > 0 && selectedIds.length === filtrados.length}
                          onChange={toggleSelectAll} />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidato</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Função</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Contato</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Currículo</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c: any) => (
                      <tr key={c.id} className={`border-b hover:bg-slate-50 ${selectedIds.includes(c.id) ? "bg-blue-50/50" : ""} ${c.statusCandidato === "reprovado" ? "opacity-75" : ""}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox" className="rounded border-slate-300 accent-amber-600"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setFichaAberta(c)} className="text-left group">
                            <div className="font-medium text-blue-700 group-hover:text-blue-900 group-hover:underline cursor-pointer">
                              {c.nomeCandidato || "(sem nome)"}
                              {(() => { const idade = calcularIdade(c.dataNascimento); return idade !== null ? <span className="ml-2 text-xs font-normal text-slate-500 no-underline">{idade} anos</span> : null; })()}
                            </div>
                          </button>
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
                          {statusBadge(c.statusCandidato, c.motivoReprovacao)}
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

      <FullScreenDialog
        open={showCurDialog}
        onClose={() => closeDialog()}
        title={editingId ? "Editar Currículo" : "Novo Currículo"}
        subtitle={editingId ? form.nomeCandidato : "Preencha os dados do candidato"}
        icon={editingId ? <Pencil className="h-5 w-5 text-white" /> : <UserPlus className="h-5 w-5 text-white" />}
        footer={
          <>
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
                  habilidades: form.habilidades || null,
                  escolaridade: form.escolaridade || null,
                  cursoFormacao: form.cursoFormacao || null,
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
                  habilidades: form.habilidades || undefined,
                  escolaridade: form.escolaridade || undefined,
                  cursoFormacao: form.cursoFormacao || undefined,
                  observacoes: form.observacoes || undefined,
                });
              }} disabled={criarMut.isPending || uploadMut.isPending} className="bg-amber-600 hover:bg-amber-700">
                {(criarMut.isPending || uploadMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Cadastrar
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Dados Pessoais</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Nome do Candidato</Label>
                <Input className="mt-1 bg-input" value={form.nomeCandidato} onChange={e => setForm({ ...form, nomeCandidato: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Função *</Label>
                <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm h-10 bg-input"
                  value={dialogFuncaoId || ""}
                  onChange={e => setDialogFuncaoId(Number(e.target.value) || null)}>
                  <option value="">Selecione a função</option>
                  {funcoes.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Telefone</Label>
                <Input className="mt-1 bg-input" placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Data de Nascimento</Label>
                <Input className="mt-1 bg-input" type="date" value={form.dataNascimento} onChange={e => setForm({ ...form, dataNascimento: e.target.value })} />
                {form.dataNascimento && (() => { const idade = calcularIdade(form.dataNascimento); return idade !== null ? <p className="text-xs text-muted-foreground mt-1">{idade} anos</p> : null; })()}
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                <Input className="mt-1 bg-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Escolaridade</Label>
                <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm h-10 bg-input"
                  value={form.escolaridade}
                  onChange={e => setForm({ ...form, escolaridade: e.target.value })}>
                  <option value="">Selecione</option>
                  <option value="Ensino Fundamental">Ensino Fundamental</option>
                  <option value="Ensino Fundamental Incompleto">Ensino Fundamental Incompleto</option>
                  <option value="Ensino Médio">Ensino Médio</option>
                  <option value="Ensino Médio Incompleto">Ensino Médio Incompleto</option>
                  <option value="Técnico">Técnico</option>
                  <option value="Superior Completo">Superior Completo</option>
                  <option value="Superior Incompleto">Superior Incompleto</option>
                  <option value="Pós-Graduação">Pós-Graduação</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Endereço</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Endereço</Label>
                <Input className="mt-1 bg-input" placeholder="Rua, número, bairro" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Cidade</Label>
                <Input className="mt-1 bg-input" placeholder="Ex: Guaratinguetá" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Estado (UF)</Label>
                <Input className="mt-1 bg-input" placeholder="SP" maxLength={2} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-5 w-5 text-primary" />
              <h4 className="text-base font-semibold text-primary">Qualificações</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Habilidades</Label>
                <Textarea className="mt-1 bg-input" placeholder="Separar por ponto-e-vírgula. Ex: Leitura de projetos; NR-35; Operação de betoneira" value={form.habilidades} onChange={e => setForm({ ...form, habilidades: e.target.value })} rows={3} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Cursos / Formações / Certificações</Label>
                <Textarea className="mt-1 bg-input" placeholder="Cursos técnicos, NRs, treinamentos..." value={form.cursoFormacao} onChange={e => setForm({ ...form, cursoFormacao: e.target.value })} rows={3} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Observações</Label>
                <Textarea className="mt-1 bg-input" placeholder="Indicação, experiência relevante, etc." value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>
          </div>

          {!editingId && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Upload className="h-5 w-5 text-primary" />
                <h4 className="text-base font-semibold text-primary">Anexo</h4>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Anexar Currículo (PDF/DOC/Imagem)</Label>
                <Input type="file" className="mt-1 bg-input" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setPendingFile(e.target.files?.[0] || null)} />
                {pendingFile && <p className="text-xs text-muted-foreground mt-1">{pendingFile.name}</p>}
              </div>
            </div>
          )}
        </div>
      </FullScreenDialog>

      <Dialog open={showReprovDialog} onOpenChange={(open) => { if (!open) { setShowReprovDialog(false); setMotivoReprovacao(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ThumbsDown className="h-5 w-5" />
              Reprovar {selectedIds.length} candidato(s)
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-800">
                Os candidatos selecionados serão marcados como <strong>reprovados</strong> e ficarão em uma lista separada para evitar novas entrevistas.
              </p>
            </div>
            <div>
              <Label>Motivo da reprovação *</Label>
              <Textarea className="mt-1"
                placeholder="Ex: Não possui experiência na área, não compareceu à entrevista, não tem perfil para a vaga..."
                value={motivoReprovacao}
                onChange={e => setMotivoReprovacao(e.target.value)}
                rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReprovDialog(false); setMotivoReprovacao(""); }}>Cancelar</Button>
            <Button onClick={() => {
              if (!motivoReprovacao.trim()) { toast.error("Informe o motivo da reprovação"); return; }
              atualizarStatusMut.mutate({ ids: selectedIds, companyId, statusCandidato: "reprovado", motivoReprovacao: motivoReprovacao.trim() });
            }} disabled={atualizarStatusMut.isPending} className="bg-red-600 hover:bg-red-700">
              {atualizarStatusMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ThumbsDown className="h-4 w-4 mr-1" />}
              Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Input type="file" className="mt-1" accept=".pdf,.jpg,.jpeg,.png" multiple disabled={iaProcessing}
                  onChange={e => setIAFiles(Array.from(e.target.files || []))} />
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
                      <div><span className="text-slate-500">Nascimento:</span> <span>{r.dados.dataNascimento ? `${formatDate(r.dados.dataNascimento)}${(() => { const i = calcularIdade(r.dados.dataNascimento); return i !== null ? ` (${i} anos)` : ""; })()}` : "-"}</span></div>
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
                <Button onClick={handleIAUpload} disabled={iaProcessing || iaFiles.length === 0} className="bg-purple-600 hover:bg-purple-700">
                  {iaProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {iaProcessing ? "Processando..." : `Processar ${iaFiles.length} arquivo(s)`}
                </Button>
              </>
            ) : (
              <Button onClick={() => { setShowIADialog(false); setIAResults(null); setIAFiles([]); setIAProgress(""); }}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
