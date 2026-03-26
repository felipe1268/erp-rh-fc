import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  CheckCircle,
  XCircle,
  Eye,
  Pencil,
  Trash2,
  FolderOpen,
  FolderPlus,
  Shield,
  Settings,
  ChevronLeft,
  Upload,
  History,
  Building2,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  ArrowRight,
  BookOpen,
  Download,
  Paperclip,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  em_elaboracao: { label: "Em Elaboração", color: "bg-yellow-100 text-yellow-800" },
  em_revisao: { label: "Em Revisão", color: "bg-blue-100 text-blue-800" },
  aprovado: { label: "Aprovado", color: "bg-green-100 text-green-800" },
  reprovado: { label: "Reprovado", color: "bg-red-100 text-red-800" },
  cancelado: { label: "Cancelado", color: "bg-gray-200 text-gray-600" },
  obsoleto: { label: "Obsoleto", color: "bg-gray-200 text-gray-500" },
};

const ART_STATUS: Record<string, { label: string; color: string }> = {
  vigente: { label: "Vigente", color: "bg-green-100 text-green-800" },
  vencida: { label: "Vencida", color: "bg-red-100 text-red-800" },
  cancelada: { label: "Cancelada", color: "bg-gray-200 text-gray-600" },
};

const SUBPASTA_EXTENSIONS: Record<string, string[]> = {
  DWG: [".dwg", ".dxf"],
  PDF: [".pdf"],
  DOC: [".doc", ".docx"],
  IFC: [".ifc"],
  REVIT: [".rvt", ".rfa"],
  SKP: [".skp"],
  XLS: [".xls", ".xlsx"],
  FOTOS: [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"],
  BIM: [".ifc", ".rvt", ".rfa", ".nwd", ".nwc"],
  MEMORIAIS: [".doc", ".docx", ".pdf", ".txt"],
};

function getAcceptForSubpasta(subpasta: string | null): string | undefined {
  if (!subpasta) return undefined;
  const exts = SUBPASTA_EXTENSIONS[subpasta.toUpperCase()];
  return exts ? exts.join(",") : undefined;
}

function isExtensionAllowed(fileName: string, subpasta: string | null): boolean {
  if (!subpasta) return true;
  const exts = SUBPASTA_EXTENSIONS[subpasta.toUpperCase()];
  if (!exts) return true;
  const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  return exts.includes(ext);
}

type ViewMode = "obras" | "ficheiro" | "configuracoes" | "arts";

export default function GestaoDocumentos() {
  const { companyId } = useCompany();
  const [location] = useLocation();

  const urlTab = new URLSearchParams(window.location.search).get("tab");

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (urlTab === "configuracoes") return "configuracoes";
    if (urlTab === "arts") return "arts";
    return "obras";
  });
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [activeFicheiroId, setActiveFicheiroId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [selectedDiscId, setSelectedDiscId] = useState<number | null>(null);
  const [selectedSubpasta, setSelectedSubpasta] = useState<string | null>(null);
  const [expandedDiscs, setExpandedDiscs] = useState<Set<number>>(new Set());

  const [showDocModal, setShowDocModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showArtModal, setShowArtModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showNewDiscModal, setShowNewDiscModal] = useState(false);
  const [showNewFicheiroModal, setShowNewFicheiroModal] = useState(false);
  const [ficheiroSearchTerm, setFicheiroSearchTerm] = useState("");
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [editingArt, setEditingArt] = useState<any>(null);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  const [newDiscForm, setNewDiscForm] = useState({ nome: "", sigla: "", cor: "#3B82F6", subpastas: ["DWG", "PDF", "IFC", "DOC"] as string[], newSubpasta: "" });

  const [docForm, setDocForm] = useState({
    codigo: "",
    titulo: "",
    descricao: "",
    disciplinaId: "",
    tipoDocumentoId: "",
    emitente: "",
    dataEmissao: "",
    dataValidade: "",
    tags: "",
  });

  const [revForm, setRevForm] = useState({
    numero: "",
    descricao: "",
    motivoRevisao: "",
    arquivoUrl: "",
    arquivoNome: "",
  });

  const [artForm, setArtForm] = useState({
    tipo: "ART",
    numero: "",
    profissional: "",
    creaOuCau: "",
    dataEmissao: "",
    dataValidade: "",
    observacoes: "",
  });

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "configuracoes") setViewMode("configuracoes");
    else if (t === "arts") setViewMode("arts");
  }, [location]);

  const obrasDisponiveis = trpc.gestaoDocumentos.listObrasDisponiveis.useQuery({ companyId }, { enabled: companyId > 0 });
  const ficheiros = trpc.gestaoDocumentos.listFicheiros.useQuery({ companyId }, { enabled: companyId > 0 });
  const ficheiroDetail = trpc.gestaoDocumentos.getFicheiroDetail.useQuery(
    { id: activeFicheiroId!, companyId },
    { enabled: !!activeFicheiroId && companyId > 0 }
  );
  const disciplinas = trpc.gestaoDocumentos.listDisciplinas.useQuery({ companyId }, { enabled: companyId > 0 });
  const tipos = trpc.gestaoDocumentos.listTiposDocumento.useQuery({ companyId }, { enabled: companyId > 0 });
  const tiposSubpasta = trpc.gestaoDocumentos.listTiposSubpasta.useQuery({ companyId }, { enabled: companyId > 0 });
  const documentos = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
      disciplinaId: selectedDiscId || undefined,
      subpasta: selectedSubpasta || undefined,
      search: search || undefined,
    },
    { enabled: companyId > 0 && !!activeFicheiroId }
  );
  const pdfDocs = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
      disciplinaId: selectedDiscId || undefined,
      subpasta: "PDF",
    },
    { enabled: companyId > 0 && !!activeFicheiroId && selectedSubpasta === "DWG" && !!selectedDiscId }
  );

  const pdfTituloSet = useMemo(() => {
    if (selectedSubpasta !== "DWG") return new Set<string>();
    return new Set((pdfDocs.data || []).map((d: any) => (d.titulo || "").replace(/\.[^.]+$/, "").trim().toLowerCase()));
  }, [pdfDocs.data, selectedSubpasta]);

  const arts = trpc.gestaoDocumentos.listArts.useQuery(
    { companyId, obraId: selectedObraId || undefined },
    { enabled: companyId > 0 }
  );
  const revisoes = trpc.gestaoDocumentos.listRevisoes.useQuery(
    { companyId, documentoId: selectedDoc?.id || 0 },
    { enabled: !!selectedDoc }
  );

  const utils = trpc.useUtils();

  const createFicheiro = trpc.gestaoDocumentos.createFicheiro.useMutation({
    onSuccess: (data) => {
      toast.success("Pasta da obra criada!");
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setActiveFicheiroId(data.id);
      setSelectedObraId(data.obraId);
      setViewMode("ficheiro");
    },
    onError: (e) => toast.error(e.message),
  });

  const createDiscFicheiro = trpc.gestaoDocumentos.createDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Pasta criada!");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setNewDiscForm({ nome: "", sigla: "", cor: "#3B82F6", subpastas: ["DWG", "PDF", "IFC", "DOC"], newSubpasta: "" });
      setShowNewDiscModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePasta = trpc.gestaoDocumentos.deletePasta.useMutation({
    onSuccess: () => {
      toast.success("Sub-pasta removida");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setSelectedSubpasta(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteDiscFicheiro = trpc.gestaoDocumentos.deleteDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Pasta removida");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setSelectedDiscId(null);
      setSelectedSubpasta(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const seedSubpastas = trpc.gestaoDocumentos.seedTiposSubpastaPadrao.useMutation({
    onSuccess: () => utils.gestaoDocumentos.listTiposSubpasta.invalidate(),
  });
  const createTipoSubpasta = trpc.gestaoDocumentos.createTipoSubpasta.useMutation({
    onSuccess: () => { toast.success("Tipo criado"); utils.gestaoDocumentos.listTiposSubpasta.invalidate(); },
  });
  const deleteTipoSubpasta = trpc.gestaoDocumentos.deleteTipoSubpasta.useMutation({
    onSuccess: () => { toast.success("Tipo removido"); utils.gestaoDocumentos.listTiposSubpasta.invalidate(); },
  });
  const updateTipoSubpasta = trpc.gestaoDocumentos.updateTipoSubpasta.useMutation({
    onSuccess: () => { toast.success("Tipo atualizado"); utils.gestaoDocumentos.listTiposSubpasta.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const uploadArquivo = trpc.gestaoDocumentos.uploadArquivoDocumento.useMutation({
    onSuccess: () => {
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error("Erro no upload: " + e.message),
  });

  async function uploadFileToDoc(docId: number, file: File) {
    const reader = new FileReader();
    return new Promise<void>((resolve, reject) => {
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          await uploadArquivo.mutateAsync({
            documentoId: docId,
            companyId,
            fileName: file.name,
            fileBase64: base64,
            contentType: file.type || "application/octet-stream",
            fileSize: file.size,
          });
          resolve();
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleBatchUpload(files: FileList) {
    if (!selectedObraId) { toast.error("Selecione uma obra primeiro"); return; }
    const validFiles = Array.from(files).filter(f => {
      if (f.size > 30 * 1024 * 1024) { toast.error(`${f.name}: muito grande (máx 30MB)`); return false; }
      if (!isExtensionAllowed(f.name, selectedSubpasta)) {
        const allowed = SUBPASTA_EXTENSIONS[selectedSubpasta?.toUpperCase() || ""]?.join(", ") || "";
        toast.error(`${f.name}: extensão não permitida na pasta ${selectedSubpasta}. Aceito: ${allowed}`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;
    setBatchUploading(true);
    setBatchProgress({ current: 0, total: validFiles.length });
    isBatchRef.current = true;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setBatchProgress({ current: i + 1, total: validFiles.length });
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      const discId = selectedDiscId || undefined;
      try {
        const doc = await createDoc.mutateAsync({
          companyId,
          obraId: selectedObraId,
          ficheiroId: activeFicheiroId || undefined,
          disciplinaId: discId,
          pastaId: undefined,
          subpasta: selectedSubpasta || undefined,
          codigo: nameWithoutExt,
          titulo: nameWithoutExt,
          dataEmissao: new Date().toISOString().split("T")[0],
        });
        if (doc?.id) {
          await uploadFileToDoc(doc.id, file);
        }
        ok++;
      } catch {
        fail++;
      }
    }
    isBatchRef.current = false;
    setBatchUploading(false);
    setBatchProgress({ current: 0, total: 0 });
    utils.gestaoDocumentos.listDocumentos.invalidate();
    if (fail === 0) {
      toast.success(`${ok} documento(s) criado(s) com sucesso`);
    } else {
      toast.warning(`${ok} criado(s), ${fail} com erro`);
    }
    if (batchFileInputRef.current) batchFileInputRef.current.value = "";
  }

  const isBatchRef = useRef(false);
  const createDoc = trpc.gestaoDocumentos.createDocumento.useMutation({
    onSuccess: async (data) => {
      if (isBatchRef.current) return;
      if (pendingFile && data?.id) {
        toast.info("Enviando arquivo...");
        try {
          await uploadFileToDoc(data.id, pendingFile);
          toast.success("Documento criado com arquivo");
        } catch { toast.success("Documento criado (falha no upload do arquivo)"); }
      } else {
        toast.success("Documento criado");
      }
      utils.gestaoDocumentos.listDocumentos.invalidate();
      setShowDocModal(false);
      resetDocForm();
      setPendingFile(null);
    },
    onError: (e) => { if (!isBatchRef.current) toast.error(e.message); },
  });
  const updateDoc = trpc.gestaoDocumentos.updateDocumento.useMutation({
    onSuccess: async () => {
      if (pendingFile && editingDoc?.id) {
        toast.info("Enviando arquivo...");
        try {
          await uploadFileToDoc(editingDoc.id, pendingFile);
          toast.success("Documento atualizado com arquivo");
        } catch { toast.success("Documento atualizado (falha no upload do arquivo)"); }
      } else {
        toast.success("Documento atualizado");
      }
      utils.gestaoDocumentos.listDocumentos.invalidate();
      setShowDocModal(false);
      setEditingDoc(null);
      resetDocForm();
      setPendingFile(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDoc = trpc.gestaoDocumentos.deleteDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento removido");
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDocsBatch = trpc.gestaoDocumentos.deleteDocumentosBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} documento(s) removido(s)`);
      setSelectedDocIds(new Set());
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateStatusBatch = trpc.gestaoDocumentos.updateStatusBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Status de ${data.count} documento(s) atualizado`);
      setSelectedDocIds(new Set());
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createRev = trpc.gestaoDocumentos.createRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão criada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.listDocumentos.invalidate();
      setShowRevModal(false);
      setRevForm({ numero: "", descricao: "", motivoRevisao: "", arquivoUrl: "", arquivoNome: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarRev = trpc.gestaoDocumentos.aprovarRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão aprovada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejeitarRev = trpc.gestaoDocumentos.rejeitarRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão rejeitada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.listDocumentos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createArt = trpc.gestaoDocumentos.createArt.useMutation({
    onSuccess: () => {
      toast.success("ART/RRT cadastrada");
      utils.gestaoDocumentos.listArts.invalidate();
      setShowArtModal(false);
      resetArtForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateArt = trpc.gestaoDocumentos.updateArt.useMutation({
    onSuccess: () => {
      toast.success("ART/RRT atualizada");
      utils.gestaoDocumentos.listArts.invalidate();
      setShowArtModal(false);
      setEditingArt(null);
      resetArtForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteArt = trpc.gestaoDocumentos.deleteArt.useMutation({
    onSuccess: () => {
      toast.success("ART/RRT removida");
      utils.gestaoDocumentos.listArts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createDisciplina = trpc.gestaoDocumentos.createDisciplina.useMutation({
    onSuccess: () => { toast.success("Disciplina criada"); utils.gestaoDocumentos.listDisciplinas.invalidate(); },
  });
  const updateDisciplina = trpc.gestaoDocumentos.updateDisciplina.useMutation({
    onSuccess: () => { toast.success("Disciplina atualizada"); utils.gestaoDocumentos.listDisciplinas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteDisciplina = trpc.gestaoDocumentos.deleteDisciplina.useMutation({
    onSuccess: () => { toast.success("Disciplina removida"); utils.gestaoDocumentos.listDisciplinas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createTipo = trpc.gestaoDocumentos.createTipoDocumento.useMutation({
    onSuccess: () => { toast.success("Tipo criado"); utils.gestaoDocumentos.listTiposDocumento.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateTipo = trpc.gestaoDocumentos.updateTipoDocumento.useMutation({
    onSuccess: () => { toast.success("Tipo atualizado"); utils.gestaoDocumentos.listTiposDocumento.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTipo = trpc.gestaoDocumentos.deleteTipoDocumento.useMutation({
    onSuccess: () => { toast.success("Tipo removido"); utils.gestaoDocumentos.listTiposDocumento.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const seedDisciplinas = trpc.gestaoDocumentos.seedDisciplinasPadrao.useMutation({
    onSuccess: () => utils.gestaoDocumentos.listDisciplinas.invalidate(),
  });
  const seedTiposDocs = trpc.gestaoDocumentos.seedTiposDocumentoPadrao.useMutation({
    onSuccess: () => utils.gestaoDocumentos.listTiposDocumento.invalidate(),
  });

  useEffect(() => {
    if (companyId > 0) {
      if (tiposSubpasta.data && tiposSubpasta.data.length === 0) seedSubpastas.mutate({ companyId });
      if (disciplinas.data && disciplinas.data.length === 0) seedDisciplinas.mutate({ companyId });
      if (tipos.data && tipos.data.length === 0) seedTiposDocs.mutate({ companyId });
    }
  }, [companyId, tiposSubpasta.data, disciplinas.data, tipos.data]);

  function generateNextCode(discId?: number) {
    const disc = discId ? discMap.get(discId) : (selectedDiscId ? discMap.get(selectedDiscId) : null);
    const sigla = disc?.sigla || "DOC";
    const obraCode = detail?.obra?.codigo || "OBR";
    const existing = (documentos.data || []).filter(d => d.disciplinaId === (discId || selectedDiscId));
    const nextNum = String(existing.length + 1).padStart(3, "0");
    return `${obraCode}-${sigla}-${nextNum}`;
  }

  function resetDocForm() {
    const today = new Date().toISOString().split("T")[0];
    const discId = selectedDiscId ? String(selectedDiscId) : "";
    setDocForm({
      codigo: generateNextCode(),
      titulo: "",
      descricao: "",
      disciplinaId: discId,
      tipoDocumentoId: "",
      emitente: "",
      dataEmissao: today,
      dataValidade: "",
      tags: "",
    });
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function resetArtForm() {
    setArtForm({ tipo: "ART", numero: "", profissional: "", creaOuCau: "", dataEmissao: "", dataValidade: "", observacoes: "" });
  }

  function openEditDoc(doc: any) {
    setEditingDoc(doc);
    setDocForm({
      codigo: doc.codigo || "",
      titulo: doc.titulo || "",
      descricao: doc.descricao || "",
      disciplinaId: doc.disciplinaId ? String(doc.disciplinaId) : "",
      tipoDocumentoId: doc.tipoDocumentoId ? String(doc.tipoDocumentoId) : "",
      emitente: doc.emitente || "",
      dataEmissao: doc.dataEmissao ? doc.dataEmissao.split("T")[0] : "",
      dataValidade: doc.dataValidade ? doc.dataValidade.split("T")[0] : "",
      tags: doc.tags || "",
    });
    setShowDocModal(true);
  }

  function openEditArt(art: any) {
    setEditingArt(art);
    setArtForm({
      tipo: art.tipo || "ART",
      numero: art.numero || "",
      profissional: art.profissional || "",
      creaOuCau: art.creaOuCau || "",
      dataEmissao: art.dataEmissao ? art.dataEmissao.split("T")[0] : "",
      dataValidade: art.dataValidade ? art.dataValidade.split("T")[0] : "",
      observacoes: art.observacoes || "",
    });
    setShowArtModal(true);
  }

  function handleSaveDoc() {
    if (!docForm.titulo.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (!docForm.codigo.trim()) {
      docForm.codigo = generateNextCode(docForm.disciplinaId ? Number(docForm.disciplinaId) : undefined);
    }
    if (!selectedObraId) {
      toast.error("Selecione uma obra primeiro");
      return;
    }
    const payload = {
      ...docForm,
      companyId,
      obraId: selectedObraId,
      ficheiroId: activeFicheiroId || undefined,
      disciplinaId: docForm.disciplinaId ? Number(docForm.disciplinaId) : undefined,
      tipoDocumentoId: docForm.tipoDocumentoId ? Number(docForm.tipoDocumentoId) : undefined,
      subpasta: selectedSubpasta || undefined,
    };
    if (editingDoc) {
      updateDoc.mutate({ ...payload, id: editingDoc.id });
    } else {
      createDoc.mutate(payload);
    }
  }

  function handleSaveRev() {
    if (!selectedDoc) return;
    createRev.mutate({ ...revForm, companyId, documentoId: selectedDoc.id });
  }

  function handleSaveArt() {
    if (!artForm.numero.trim() || !artForm.profissional.trim()) {
      toast.error("Número e profissional são obrigatórios");
      return;
    }
    if (!selectedObraId && !editingArt) {
      toast.error("Selecione uma obra primeiro");
      return;
    }
    const payload = { ...artForm, companyId, obraId: selectedObraId || (editingArt?.obraId) || 0 };
    if (editingArt) {
      updateArt.mutate({ ...payload, id: editingArt.id });
    } else {
      createArt.mutate(payload);
    }
  }

  function handleAddDiscSubpasta() {
    const val = newDiscForm.newSubpasta.trim().toUpperCase();
    if (val && !newDiscForm.subpastas.includes(val)) {
      setNewDiscForm({ ...newDiscForm, subpastas: [...newDiscForm.subpastas, val], newSubpasta: "" });
    }
  }

  function handleCreateDisc() {
    if (!activeFicheiroId) return;
    const existingDiscs = detail?.disciplinas || [];
    if (existingDiscs.some((ed: any) => ed.sigla === newDiscForm.sigla.trim().toUpperCase())) {
      toast.error(`Pasta "${newDiscForm.sigla.trim().toUpperCase()}" já existe`);
      return;
    }
    createDiscFicheiro.mutate({
      companyId,
      ficheiroId: activeFicheiroId,
      nome: newDiscForm.nome.trim(),
      sigla: newDiscForm.sigla.trim().toUpperCase(),
      cor: newDiscForm.cor,
      subpastas: newDiscForm.subpastas,
    });
  }

  function handleOpenObra(obra: any) {
    setSelectedDiscId(null);
    setSelectedSubpasta(null);
    setExpandedDiscs(new Set());
    setSearch("");
    const fich = ficheirosMap.get(obra.id);
    if (fich) {
      setActiveFicheiroId(fich.id);
      setSelectedObraId(fich.obraId);
      setViewMode("ficheiro");
    } else {
      createFicheiro.mutate({ companyId, obraId: obra.id });
    }
  }

  function toggleDisc(discId: number) {
    const next = new Set(expandedDiscs);
    if (next.has(discId)) {
      next.delete(discId);
      if (selectedDiscId === discId) {
        setSelectedDiscId(null);
        setSelectedSubpasta(null);
      }
    } else {
      next.add(discId);
      setSelectedDiscId(discId);
      setSelectedSubpasta(null);
    }
    setExpandedDiscs(next);
  }

  function selectSubpasta(discId: number, sp: string) {
    setSelectedDiscId(discId);
    setSelectedSubpasta(sp);
  }

  function selectAllDisc(discId: number) {
    setSelectedDiscId(discId);
    setSelectedSubpasta(null);
    if (!expandedDiscs.has(discId)) {
      setExpandedDiscs(new Set([...expandedDiscs, discId]));
    }
  }

  const ficheirosMap = new Map((ficheiros.data || []).map(f => [f.obraId, f]));
  const detail = ficheiroDetail.data;
  const discMap = new Map((disciplinas.data || []).map(d => [d.id, d]));
  const tipoMap = new Map((tipos.data || []).map(t => [t.id, t]));

  const filteredDocs = (documentos.data || []).filter(doc => {
    if (selectedDiscId && doc.disciplinaId !== selectedDiscId) return false;
    return true;
  });

  const breadcrumb = (() => {
    const parts: string[] = [];
    if (viewMode === "ficheiro" && detail) {
      parts.push(detail.obra?.nome || "Obra");
      if (selectedDiscId) {
        const d = detail.disciplinas.find((d: any) => d.id === selectedDiscId);
        if (d) parts.push(d.sigla);
      }
      if (selectedSubpasta) parts.push(selectedSubpasta);
    }
    return parts;
  })();

  return (
    <DashboardLayout title="Proj./Doc. Técnicos" noPadding>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
        {viewMode === "configuracoes" ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
              <Button variant="outline" size="sm" onClick={() => setViewMode("obras")} className="text-gray-600">
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
            </div>
            <ConfiguracoesStandalone
              disciplinas={disciplinas} tipos={tipos} tiposSubpasta={tiposSubpasta}
              companyId={companyId}
              createDisciplina={createDisciplina} updateDisciplina={updateDisciplina} deleteDisciplina={deleteDisciplina}
              createTipo={createTipo} updateTipo={updateTipo} deleteTipo={deleteTipo}
              createTipoSubpasta={createTipoSubpasta} updateTipoSubpasta={updateTipoSubpasta} deleteTipoSubpasta={deleteTipoSubpasta}
            />
          </div>
        ) : viewMode === "arts" ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">ARTs / RRTs</h1>
              <div className="flex items-center gap-2">
                <Button onClick={() => { resetArtForm(); setEditingArt(null); setShowArtModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700" size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Nova ART/RRT
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewMode(activeFicheiroId ? "ficheiro" : "obras")} className="text-gray-600">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
              </div>
            </div>
            <ArtsSection arts={arts.data || []} onEdit={openEditArt} onDelete={(id) => { if (confirm("Remover esta ART/RRT?")) deleteArt.mutate({ id, companyId }); }} />
          </div>
        ) : viewMode === "obras" ? (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Projetos / Documentos Técnicos</h1>
                <p className="text-sm text-gray-500">Ficheiros criados para suas obras</p>
              </div>
              <Button onClick={() => { setFicheiroSearchTerm(""); setShowNewFicheiroModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700" size="sm">
                <Plus className="w-4 h-4 mr-1" /> Novo Ficheiro
              </Button>
            </div>
            {(() => {
              const ficheirosList = (ficheiros.data || []);
              const obrasMap = new Map((obrasDisponiveis.data || []).map((o: any) => [o.id, o]));
              if (ficheirosList.length === 0) {
                return (
                  <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                    <FolderOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Nenhum ficheiro criado</h3>
                    <p className="text-sm text-gray-500 mb-4">Clique em "Novo Ficheiro" para vincular uma obra e começar a organizar seus documentos.</p>
                    <Button onClick={() => { setFicheiroSearchTerm(""); setShowNewFicheiroModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-1" /> Novo Ficheiro
                    </Button>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {ficheirosList.map((fich: any) => {
                    const obra = obrasMap.get(fich.obraId);
                    return (
                      <button
                        key={fich.id}
                        onClick={() => {
                          setActiveFicheiroId(fich.id);
                          setSelectedObraId(fich.obraId);
                          setSelectedDiscId(null);
                          setSelectedSubpasta(null);
                          setExpandedDiscs(new Set());
                          setSearch("");
                          setViewMode("ficheiro");
                        }}
                        className="text-left p-4 rounded-lg border border-blue-200 bg-blue-50/30 hover:border-blue-400 transition-all hover:shadow-md"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <FolderOpen className="w-8 h-8 text-blue-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{obra?.nome || "Obra"}</p>
                            <p className="text-[11px] text-gray-500">{obra?.codigo || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                          <span>{fich.totalDisciplinas || 0} pastas</span>
                          <span>{fich.totalDocumentos || 0} docs</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          /* MODO FICHEIRO — Explorador de Pastas */
          <>
            {/* Barra superior */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <button onClick={() => { setActiveFicheiroId(null); setSelectedObraId(null); setSelectedDiscId(null); setSelectedSubpasta(null); setViewMode("obras"); }} className="text-blue-600 hover:underline font-medium">
                  Obras
                </button>
                {breadcrumb.map((part, i) => (
                  <span key={i} className="flex items-center gap-1 text-gray-500">
                    <ChevronRight className="w-3 h-3" />
                    <span className={i === breadcrumb.length - 1 ? "text-gray-900 font-medium" : ""}>{part}</span>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setViewMode("arts")} className="text-xs text-gray-600">
                  <Shield className="w-3.5 h-3.5 mr-1" /> ARTs
                </Button>
                <Button size="sm" variant="outline" onClick={() => setViewMode("configuracoes")} className="text-xs text-gray-600">
                  <Settings className="w-3.5 h-3.5 mr-1" /> Config
                </Button>
              </div>
            </div>

            {/* Layout duas colunas: árvore + documentos */}
            <div className="flex gap-0 flex-1 overflow-hidden">
              {/* Painel esquerdo — Árvore de Pastas */}
              <div className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-hidden flex flex-col">
                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pastas</span>
                  <button onClick={() => setShowNewDiscModal(true)} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Nova pasta">
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {(detail?.disciplinas || []).map((disc: any) => {
                    const isExpanded = expandedDiscs.has(disc.id);
                    const isSelected = selectedDiscId === disc.id && !selectedSubpasta;
                    const discPastas = (detail?.pastas || []).filter((p: any) => p.disciplinaId === disc.id);

                    return (
                      <div key={disc.id}>
                        <div className="flex items-center group">
                          <button onClick={() => toggleDisc(disc.id)} className="p-0.5 text-gray-400">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => selectAllDisc(disc.id)}
                            className={`flex-1 flex items-center gap-2 px-1.5 py-1.5 rounded text-sm text-left transition-colors ${isSelected ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                          >
                            <Folder className="w-4 h-4 shrink-0" style={{ color: disc.cor || "#3B82F6" }} />
                            <span className="truncate">{disc.sigla} — {disc.nome}</span>
                          </button>
                          <button
                            onClick={() => { if (confirm(`Remover pasta "${disc.sigla}"?`)) deleteDiscFicheiro.mutate({ id: disc.id, companyId, ficheiroId: activeFicheiroId! }); }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {isExpanded && discPastas.length > 0 && (
                          <div className="ml-5 space-y-0.5">
                            {discPastas.map((sp: any) => {
                              const isSp = selectedDiscId === disc.id && selectedSubpasta === sp.nome;
                              return (
                                <div key={sp.id} className="flex items-center group/sp">
                                  <button
                                    onClick={() => selectSubpasta(disc.id, sp.nome)}
                                    className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${isSp ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}
                                  >
                                    <Folder className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                    <span className="truncate">{sp.nome}</span>
                                  </button>
                                  <button
                                    onClick={() => { if (confirm(`Remover sub-pasta "${sp.nome}"?`)) deletePasta.mutate({ id: sp.id, companyId }); }}
                                    className="p-0.5 rounded opacity-0 group-hover/sp:opacity-100 text-gray-400 hover:text-red-500 transition-all shrink-0"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!detail || detail.disciplinas.length === 0) && (
                    <div className="text-center py-6">
                      <p className="text-xs text-gray-400 mb-2">Nenhuma pasta criada</p>
                      <Button size="sm" variant="outline" onClick={() => setShowNewDiscModal(true)} className="text-xs">
                        <FolderPlus className="w-3 h-3 mr-1" /> Criar Pasta
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Painel direito — Documentos */}
              <div className="flex-1 bg-white overflow-hidden flex flex-col">
                <div className="p-3 border-b border-gray-200 flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Buscar documentos..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-8 text-sm bg-gray-50 border-gray-200"
                    />
                  </div>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={getAcceptForSubpasta(selectedSubpasta) || ".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rvt,.ifc"}
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleBatchUpload(e.target.files); }}
                  />
                  <Button size="sm" variant="outline" onClick={() => batchFileInputRef.current?.click()} className="border-blue-200 text-blue-600 hover:bg-blue-50 h-8" disabled={batchUploading}>
                    {batchUploading ? (
                      <><span className="animate-spin mr-1">⏳</span> {batchProgress.current}/{batchProgress.total}</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-1" /> Enviar Vários</>
                    )}
                  </Button>
                  <Button size="sm" onClick={() => { resetDocForm(); setEditingDoc(null); setShowDocModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700 h-8">
                    <Plus className="w-4 h-4 mr-1" /> Novo Documento
                  </Button>
                </div>

                {selectedDocIds.size > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex-wrap">
                    <span className="text-sm text-blue-700 font-medium">{selectedDocIds.size} documento(s) selecionado(s)</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 mr-1">Status:</span>
                      {Object.entries(STATUS_MAP).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => updateStatusBatch.mutate({ ids: Array.from(selectedDocIds), companyId, status: key })}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${val.color} hover:opacity-80 transition-opacity`}
                          disabled={updateStatusBatch.isPending}
                        >
                          {val.label}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => {
                      if (confirm(`Remover ${selectedDocIds.size} documento(s)?`)) {
                        deleteDocsBatch.mutate({ ids: Array.from(selectedDocIds), companyId });
                      }
                    }} disabled={deleteDocsBatch.isPending}>
                      <Trash2 className="w-3 h-3 mr-1" /> Apagar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" onClick={() => setSelectedDocIds(new Set())}>
                      Cancelar
                    </Button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto relative">
                  {batchUploading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                      <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium mb-3">
                          <span className="animate-spin">⏳</span>
                          Enviando {batchProgress.current} de {batchProgress.total}...
                        </div>
                        <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all duration-300 rounded-full" style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {filteredDocs.length === 0 ? (
                    <div
                      className="text-center py-16 border-2 border-dashed border-transparent rounded-lg transition-colors"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-400", "bg-blue-50/50"); e.currentTarget.classList.remove("border-transparent"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("border-blue-400", "bg-blue-50/50"); e.currentTarget.classList.add("border-transparent"); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("border-blue-400", "bg-blue-50/50");
                        e.currentTarget.classList.add("border-transparent");
                        const files = e.dataTransfer.files;
                        if (files.length > 1) {
                          handleBatchUpload(files);
                        } else if (files.length === 1) {
                          const f = files[0];
                          if (f.size > 30 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 30MB)"); return; }
                          if (!isExtensionAllowed(f.name, selectedSubpasta)) {
                            const allowed = SUBPASTA_EXTENSIONS[selectedSubpasta?.toUpperCase() || ""]?.join(", ") || "";
                            toast.error(`Extensão não permitida na pasta ${selectedSubpasta}. Aceito: ${allowed}`);
                            return;
                          }
                          const today = new Date().toISOString().split("T")[0];
                          const discId = selectedDiscId ? String(selectedDiscId) : "";
                          const nameWithoutExt = f.name.replace(/\.[^.]+$/, "");
                          setDocForm({
                            codigo: nameWithoutExt,
                            titulo: nameWithoutExt,
                            descricao: "",
                            disciplinaId: discId,
                            tipoDocumentoId: "",
                            emitente: "",
                            dataEmissao: today,
                            dataValidade: "",
                            tags: "",
                          });
                          setPendingFile(f);
                          setEditingDoc(null);
                          setShowDocModal(true);
                        }
                      }}
                    >
                      <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500 text-sm mb-1">Nenhum documento nesta pasta</p>
                      <p className="text-gray-400 text-xs">Clique em "+ Novo Documento" ou arraste arquivos aqui</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-100 hover:bg-transparent">
                          <TableHead className="w-[40px] text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
                              checked={filteredDocs.length > 0 && filteredDocs.every((d: any) => selectedDocIds.has(d.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDocIds(new Set(filteredDocs.map((d: any) => d.id)));
                                } else {
                                  setSelectedDocIds(new Set());
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead className="text-gray-500 text-xs w-[120px]">Código</TableHead>
                          <TableHead className="text-gray-500 text-xs">Título</TableHead>
                          <TableHead className="text-gray-500 text-xs w-[80px]">Disciplina</TableHead>
                          <TableHead className="text-gray-500 text-xs w-[60px] text-center">Rev.</TableHead>
                          <TableHead className="text-gray-500 text-xs w-[110px]">Status</TableHead>
                          <TableHead className="text-gray-500 text-xs w-[80px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDocs.map((doc) => {
                          const st = STATUS_MAP[doc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao;
                          const disc = doc.disciplinaId ? discMap.get(doc.disciplinaId) : null;
                          const missingPdf = selectedSubpasta === "DWG" && !pdfTituloSet.has((doc.titulo || "").replace(/\.[^.]+$/, "").trim().toLowerCase());
                          return (
                            <TableRow key={doc.id} className={`border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedDocIds.has(doc.id) ? "bg-blue-50" : ""} ${missingPdf ? "bg-red-50/50" : ""}`} onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
                                  checked={selectedDocIds.has(doc.id)}
                                  onChange={(e) => {
                                    const next = new Set(selectedDocIds);
                                    if (e.target.checked) next.add(doc.id);
                                    else next.delete(doc.id);
                                    setSelectedDocIds(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs text-blue-600">{doc.codigo}</TableCell>
                              <TableCell className="text-gray-900 text-sm truncate max-w-[300px]">
                                <span className="flex items-center gap-1.5">
                                  {doc.arquivoUrl && <Paperclip className="w-3 h-3 text-blue-500 shrink-0" />}
                                  {doc.titulo}
                                  {missingPdf && (
                                    <span className="relative group/pdf shrink-0">
                                      <AlertTriangle className="w-4 h-4 text-red-500" />
                                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-red-600 text-white text-[10px] rounded shadow-lg whitespace-nowrap opacity-0 group-hover/pdf:opacity-100 transition-opacity pointer-events-none z-50">
                                        PDF correspondente não encontrado
                                      </span>
                                    </span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell>
                                {disc ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${disc.cor}20`, color: disc.cor || "#3b82f6" }}>
                                    {disc.sigla}
                                  </span>
                                ) : <span className="text-gray-400">—</span>}
                              </TableCell>
                              <TableCell className="text-center text-gray-700 text-sm font-medium">{doc.revisaoAtual || "0"}</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.color} hover:opacity-80 cursor-pointer transition-opacity`}>
                                      {st.label}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="min-w-[140px]">
                                    {Object.entries(STATUS_MAP).map(([key, val]) => (
                                      <DropdownMenuItem
                                        key={key}
                                        onClick={() => updateDoc.mutate({ id: doc.id, companyId, status: key })}
                                        className="text-xs"
                                      >
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${val.color}`}>{val.label}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
                                      <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
                                    </DropdownMenuItem>
                                    {doc.arquivoUrl && /\.(pdf|png|jpg|jpeg|gif|webp)$/i.test(doc.arquivoNome || "") && (
                                      <DropdownMenuItem onClick={() => setPreviewDoc(doc)}>
                                        <Eye className="w-4 h-4 mr-2" /> Visualizar Arquivo
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => openEditDoc(doc)}>
                                      <Pencil className="w-4 h-4 mr-2" /> Editar
                                    </DropdownMenuItem>
                                    {doc.arquivoUrl && (
                                      <DropdownMenuItem onClick={() => {
                                        const a = document.createElement("a");
                                        a.href = doc.arquivoUrl;
                                        a.download = doc.arquivoNome || "arquivo";
                                        a.click();
                                      }}>
                                        <Download className="w-4 h-4 mr-2" /> Baixar Arquivo
                                      </DropdownMenuItem>
                                    )}
                                    {!doc.arquivoUrl && (
                                      <DropdownMenuItem onClick={() => openEditDoc(doc)}>
                                        <Upload className="w-4 h-4 mr-2" /> Anexar Arquivo
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => { setSelectedDoc(doc); setShowRevModal(true); }}>
                                      <History className="w-4 h-4 mr-2" /> Nova Revisão
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600" onClick={() => {
                                      if (confirm("Remover documento?")) deleteDoc.mutate({ id: doc.id, companyId });
                                    }}>
                                      <Trash2 className="w-4 h-4 mr-2" /> Remover
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal — Nova Pasta (Disciplina) */}
      <Dialog open={showNewDiscModal} onOpenChange={setShowNewDiscModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-blue-600" />
              Nova Pasta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-2">Atalhos — clique para preencher automaticamente</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { nome: "Arquitetura", sigla: "ARQ", cor: "#3B82F6" },
                  { nome: "Estrutural", sigla: "EST", cor: "#EF4444" },
                  { nome: "Elétrica", sigla: "ELE", cor: "#F59E0B" },
                  { nome: "Hidrossanitário", sigla: "HID", cor: "#06B6D4" },
                  { nome: "HVAC / Climatização", sigla: "CLI", cor: "#8B5CF6" },
                  { nome: "Incêndio", sigla: "INC", cor: "#DC2626" },
                  { nome: "Fundações", sigla: "FUN", cor: "#78716C" },
                  { nome: "Topografia", sigla: "TOP", cor: "#22C55E" },
                  { nome: "Paisagismo", sigla: "PAI", cor: "#10B981" },
                  { nome: "Geotecnia", sigla: "GEO", cor: "#A16207" },
                  { nome: "Telecom / Dados", sigla: "TEL", cor: "#0EA5E9" },
                  { nome: "Automação", sigla: "AUT", cor: "#6366F1" },
                ].filter(d => !(detail?.disciplinas || []).some((ed: any) => ed.sigla === d.sigla)).map(d => (
                  <button
                    key={d.sigla}
                    type="button"
                    onClick={() => setNewDiscForm({ ...newDiscForm, nome: d.nome, sigla: d.sigla, cor: d.cor })}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm transition-all text-left"
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: d.cor }}>
                      {d.sigla}
                    </span>
                    <span className="text-sm text-gray-700">{d.nome}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-500">Nome *</Label>
                <Input value={newDiscForm.nome} onChange={(e) => setNewDiscForm({ ...newDiscForm, nome: e.target.value })} placeholder="Ex: Arquitetura" className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-500">Sigla *</Label>
                <Input value={newDiscForm.sigla} onChange={(e) => setNewDiscForm({ ...newDiscForm, sigla: e.target.value.toUpperCase() })} placeholder="Ex: ARQ" maxLength={10} className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
            </div>
            <div>
              <Label className="text-gray-500">Cor</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={newDiscForm.cor} onChange={(e) => setNewDiscForm({ ...newDiscForm, cor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-gray-300" />
                <span className="text-xs text-gray-400">{newDiscForm.cor}</span>
              </div>
            </div>
            <div>
              <Label className="text-gray-500 mb-1">Sub-pastas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {newDiscForm.subpastas.map((sp) => (
                  <span key={sp} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    {sp}
                    <button type="button" onClick={() => setNewDiscForm({ ...newDiscForm, subpastas: newDiscForm.subpastas.filter(s => s !== sp) })} className="hover:text-red-600">
                      <XCircle className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newDiscForm.newSubpasta}
                  onChange={(e) => setNewDiscForm({ ...newDiscForm, newSubpasta: e.target.value.toUpperCase() })}
                  placeholder="Nova sub-pasta (ex: REVIT)"
                  className="bg-gray-50 border-gray-300 text-gray-900 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDiscSubpasta(); } }}
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddDiscSubpasta} className="shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-[10px] text-gray-400">Atalhos:</span>
                {["REVIT", "SKP", "XLS", "FOTOS", "BIM", "MEMORIAIS"].filter(s => !newDiscForm.subpastas.includes(s)).map(s => (
                  <button key={s} type="button" onClick={() => setNewDiscForm({ ...newDiscForm, subpastas: [...newDiscForm.subpastas, s] })} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-500">
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDiscModal(false)} className="border-gray-300 text-gray-600">Fechar</Button>
            <Button onClick={handleCreateDisc} className="bg-blue-600 text-white hover:bg-blue-700" disabled={createDiscFicheiro.isPending || !newDiscForm.nome.trim() || !newDiscForm.sigla.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              {createDiscFicheiro.isPending ? "Criando..." : "Criar Pasta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal — Novo/Editar Documento */}
      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 font-medium">Título *</Label>
              <Input
                value={docForm.titulo}
                onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })}
                className="bg-gray-50 border-gray-300 text-gray-900 mt-1"
                placeholder="Ex: Planta Baixa Pavimento Térreo"
                autoFocus
              />
            </div>

            {(detail?.disciplinas || []).length > 0 && (
              <div>
                <Label className="text-gray-500 text-xs">Pasta (Disciplina)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(detail?.disciplinas || []).map((d: any) => {
                    const isActive = docForm.disciplinaId === String(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          const newDiscId = isActive ? "" : String(d.id);
                          const newCode = generateNextCode(isActive ? undefined : d.id);
                          setDocForm({ ...docForm, disciplinaId: newDiscId, codigo: editingDoc ? docForm.codigo : newCode });
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${isActive ? "text-white border-transparent shadow-sm" : "text-gray-600 border-gray-200 hover:border-gray-300 bg-white"}`}
                        style={isActive ? { backgroundColor: d.cor || "#3B82F6" } : {}}
                      >
                        {d.sigla}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(tipos.data || []).filter(t => t.ativo).length > 0 && (
              <div>
                <Label className="text-gray-500 text-xs">Tipo de Documento</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(tipos.data || []).filter(t => t.ativo).map(t => {
                    const isActive = docForm.tipoDocumentoId === String(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDocForm({ ...docForm, tipoDocumentoId: isActive ? "" : String(t.id) })}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${isActive ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 border-gray-200 hover:border-gray-300 bg-white"}`}
                      >
                        {t.sigla} — {t.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase">Código</span>
                <span className="font-mono text-sm text-blue-600 font-medium">{docForm.codigo || "—"}</span>
              </div>
              <div className="w-px h-4 bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase">Emissão</span>
                <span className="text-sm text-gray-700">{docForm.dataEmissao ? new Date(docForm.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR") : "Hoje"}</span>
              </div>
            </div>

            <div>
              <Label className="text-gray-500 text-xs">Arquivo</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={getAcceptForSubpasta(selectedSubpasta) || ".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rvt,.ifc"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 30 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 30MB)"); return; }
                    if (!isExtensionAllowed(f.name, selectedSubpasta)) {
                      const allowed = SUBPASTA_EXTENSIONS[selectedSubpasta?.toUpperCase() || ""]?.join(", ") || "";
                      toast.error(`Extensão não permitida na pasta ${selectedSubpasta}. Aceito: ${allowed}`);
                      return;
                    }
                    setPendingFile(f);
                  }
                }}
              />
              {pendingFile ? (
                <div className="mt-1 flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-blue-800 font-medium truncate">{pendingFile.name}</p>
                    <p className="text-[10px] text-blue-500">{(pendingFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-blue-400 hover:text-red-500">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : editingDoc?.arquivoUrl ? (
                <div className="mt-1 flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                  <Paperclip className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-green-800 font-medium truncate">{editingDoc.arquivoNome || "Arquivo"}</p>
                    {editingDoc.arquivoTamanho && <p className="text-[10px] text-green-500">{(editingDoc.arquivoTamanho / 1024).toFixed(0)} KB</p>}
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-green-600 hover:text-green-800 underline">Substituir</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 w-full border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all group cursor-pointer"
                >
                  <Upload className="w-5 h-5 mx-auto text-gray-300 group-hover:text-blue-500 mb-1" />
                  <p className="text-xs text-gray-400 group-hover:text-blue-600">Clique para anexar arquivo</p>
                  <p className="text-[10px] text-gray-300">PDF, DWG, DXF, DOC, XLS, RVT, IFC — até 30MB</p>
                </button>
              )}
            </div>

            {editingDoc && (
              <div className="space-y-3 border-t border-gray-200 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-500 text-xs">Código</Label>
                    <Input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-gray-500 text-xs">Emitente</Label>
                    <Input value={docForm.emitente} onChange={(e) => setDocForm({ ...docForm, emitente: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-gray-500 text-xs">Data de Emissão</Label>
                    <Input type="date" value={docForm.dataEmissao} onChange={(e) => setDocForm({ ...docForm, dataEmissao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900 h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-500 text-xs">Descrição</Label>
                  <Textarea value={docForm.descricao} onChange={(e) => setDocForm({ ...docForm, descricao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" rows={2} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocModal(false)} className="border-gray-300 text-gray-600">Cancelar</Button>
            <Button onClick={handleSaveDoc} className="bg-blue-600 text-white hover:bg-blue-700" disabled={createDoc.isPending || updateDoc.isPending}>
              {createDoc.isPending || updateDoc.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal — Nova Revisão */}
      <Dialog open={showRevModal} onOpenChange={setShowRevModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>Nova Revisão — {selectedDoc?.codigo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-500">Número da Revisão *</Label>
              <Input value={revForm.numero} onChange={(e) => setRevForm({ ...revForm, numero: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" placeholder="Ex: 1, A, R01" />
            </div>
            <div>
              <Label className="text-gray-500">Descrição</Label>
              <Textarea value={revForm.descricao} onChange={(e) => setRevForm({ ...revForm, descricao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" rows={2} />
            </div>
            <div>
              <Label className="text-gray-500">Motivo</Label>
              <Textarea value={revForm.motivoRevisao} onChange={(e) => setRevForm({ ...revForm, motivoRevisao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevModal(false)} className="border-gray-300 text-gray-600">Cancelar</Button>
            <Button onClick={handleSaveRev} className="bg-blue-600 text-white hover:bg-blue-700" disabled={createRev.isPending}>
              {createRev.isPending ? "Salvando..." : "Criar Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal — ART/RRT */}
      <Dialog open={showArtModal} onOpenChange={setShowArtModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{editingArt ? "Editar ART/RRT" : "Nova ART/RRT"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-500">Tipo *</Label>
                <Select value={artForm.tipo} onValueChange={(v) => setArtForm({ ...artForm, tipo: v })}>
                  <SelectTrigger className="bg-gray-50 border-gray-300 text-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ART">ART</SelectItem>
                    <SelectItem value="RRT">RRT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-500">Número *</Label>
                <Input value={artForm.numero} onChange={(e) => setArtForm({ ...artForm, numero: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
            </div>
            <div>
              <Label className="text-gray-500">Profissional *</Label>
              <Input value={artForm.profissional} onChange={(e) => setArtForm({ ...artForm, profissional: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div>
              <Label className="text-gray-500">CREA / CAU</Label>
              <Input value={artForm.creaOuCau} onChange={(e) => setArtForm({ ...artForm, creaOuCau: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-500">Emissão</Label>
                <Input type="date" value={artForm.dataEmissao} onChange={(e) => setArtForm({ ...artForm, dataEmissao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-500">Validade</Label>
                <Input type="date" value={artForm.dataValidade} onChange={(e) => setArtForm({ ...artForm, dataValidade: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
            </div>
            <div>
              <Label className="text-gray-500">Observações</Label>
              <Textarea value={artForm.observacoes} onChange={(e) => setArtForm({ ...artForm, observacoes: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArtModal(false)} className="border-gray-300 text-gray-600">Cancelar</Button>
            <Button onClick={handleSaveArt} className="bg-blue-600 text-white hover:bg-blue-700" disabled={createArt.isPending || updateArt.isPending}>
              {createArt.isPending || updateArt.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal — Detalhe do Documento */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-4xl bg-white border-gray-200 text-gray-900 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {selectedDoc?.codigo} — {selectedDoc?.titulo}
            </DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).color}`}>
                    {(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Revisão Atual</p>
                  <p className="text-sm text-gray-700">{selectedDoc.revisaoAtual || "0"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Disciplina</p>
                  <p className="text-sm text-gray-700">{selectedDoc.disciplinaId ? discMap.get(selectedDoc.disciplinaId)?.nome : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Tipo</p>
                  <p className="text-sm text-gray-700">{selectedDoc.tipoDocumentoId ? tipoMap.get(selectedDoc.tipoDocumentoId)?.nome : "-"}</p>
                </div>
              </div>
              {selectedDoc.descricao && (
                <div>
                  <h4 className="text-sm text-gray-500 mb-1">Descrição</h4>
                  <p className="text-gray-600 text-sm">{selectedDoc.descricao}</p>
                </div>
              )}
              {selectedDoc.arquivoUrl ? (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Paperclip className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-blue-800 font-medium truncate">{selectedDoc.arquivoNome || "Arquivo"}</p>
                    {selectedDoc.arquivoTamanho && <p className="text-xs text-blue-500">{(selectedDoc.arquivoTamanho / 1024).toFixed(0)} KB</p>}
                  </div>
                  {/\.(pdf|png|jpg|jpeg|gif|webp)$/i.test(selectedDoc.arquivoNome || "") && (
                    <button onClick={() => { setShowDetailModal(false); setPreviewDoc(selectedDoc); }} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors">
                      <Eye className="w-4 h-4" /> Visualizar
                    </button>
                  )}
                  <a href={selectedDoc.arquivoUrl} download={selectedDoc.arquivoNome || "arquivo"} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors">
                    <Download className="w-4 h-4" /> Baixar
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <File className="w-5 h-5 text-gray-400 shrink-0" />
                  <p className="text-sm text-gray-500 flex-1">Nenhum arquivo anexado</p>
                  <button onClick={() => { setShowDetailModal(false); openEditDoc(selectedDoc); }} className="text-xs text-blue-600 hover:text-blue-800 underline">Anexar</button>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <History className="w-4 h-4" /> Histórico de Revisões
                  </h4>
                  <Button size="sm" onClick={() => setShowRevModal(true)} className="bg-blue-600 text-white hover:bg-blue-700 h-8">
                    <Plus className="w-3 h-3 mr-1" /> Nova Revisão
                  </Button>
                </div>
                {(revisoes.data || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">Nenhuma revisão registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {(revisoes.data || []).map(rev => (
                      <div key={rev.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-blue-600">Rev. {rev.numero}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              rev.status === "aprovada" ? "bg-green-100 text-green-800" :
                              rev.status === "rejeitada" ? "bg-red-100 text-red-800" :
                              "bg-yellow-100 text-yellow-800"
                            }`}>
                              {rev.status === "aprovada" ? "Aprovada" : rev.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                            </span>
                          </div>
                          {rev.descricao && <p className="text-xs text-gray-500 mt-1">{rev.descricao}</p>}
                          <p className="text-xs text-gray-400 mt-1">{rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}</p>
                        </div>
                        {rev.status === "pendente" && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => aprovarRev.mutate({ id: rev.id, companyId, documentoId: selectedDoc.id })}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => rejeitarRev.mutate({ id: rev.id, companyId, documentoId: selectedDoc.id })}>
                              <XCircle className="w-3 h-3 mr-1" /> Rejeitar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Modal — Novo Ficheiro (selecionar obra) */}
      <Dialog open={showNewFicheiroModal} onOpenChange={setShowNewFicheiroModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900 max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              Novo Ficheiro
            </DialogTitle>
            <DialogDescription>Selecione uma obra para criar o ficheiro de documentos</DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar obra..."
              value={ficheiroSearchTerm}
              onChange={(e) => setFicheiroSearchTerm(e.target.value)}
              className="pl-9 bg-white border-gray-300 text-gray-900"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {(() => {
              const obrasComFicheiro = new Set((ficheiros.data || []).map((f: any) => f.obraId));
              const obrasSemFicheiro = (obrasDisponiveis.data || []).filter((o: any) => !obrasComFicheiro.has(o.id));
              const filtradas = obrasSemFicheiro.filter((o: any) =>
                !ficheiroSearchTerm || o.nome?.toLowerCase().includes(ficheiroSearchTerm.toLowerCase()) || o.codigo?.toLowerCase().includes(ficheiroSearchTerm.toLowerCase())
              );
              if (filtradas.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {obrasSemFicheiro.length === 0 ? "Todas as obras já possuem ficheiro." : "Nenhuma obra encontrada."}
                  </div>
                );
              }
              return filtradas.map((obra: any) => (
                <button
                  key={obra.id}
                  onClick={() => {
                    setShowNewFicheiroModal(false);
                    handleOpenObra(obra);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center gap-3"
                >
                  <FolderOpen className="w-6 h-6 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{obra.nome}</p>
                    <p className="text-[11px] text-gray-500">{obra.codigo || "—"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Visualização Rápida de Arquivo */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="w-[98vw] max-w-[98vw] h-[95vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-5 h-5 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{previewDoc?.titulo}</p>
                <p className="text-[11px] text-gray-500">{previewDoc?.arquivoNome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {previewDoc?.arquivoUrl && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                  const a = document.createElement("a");
                  a.href = previewDoc.arquivoUrl;
                  a.download = previewDoc.arquivoNome || "arquivo";
                  a.click();
                }}>
                  <Download className="w-3 h-3 mr-1" /> Baixar
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-hidden bg-gray-100">
            {previewDoc?.arquivoUrl && /\.pdf$/i.test(previewDoc.arquivoNome || "") && (
              <iframe
                src={previewDoc.arquivoUrl}
                className="w-full h-full min-h-[70vh]"
                title="Preview PDF"
              />
            )}
            {previewDoc?.arquivoUrl && /\.(png|jpg|jpeg|gif|webp)$/i.test(previewDoc.arquivoNome || "") && (
              <div className="flex items-center justify-center h-full min-h-[70vh] p-4">
                <img
                  src={previewDoc.arquivoUrl}
                  alt={previewDoc.titulo}
                  className="max-w-full max-h-[80vh] object-contain rounded shadow-lg"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ArtsSection({ arts, onEdit, onDelete }: { arts: any[]; onEdit: (art: any) => void; onDelete: (id: number) => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 hover:bg-transparent">
            <TableHead className="text-gray-500">Tipo</TableHead>
            <TableHead className="text-gray-500">Número</TableHead>
            <TableHead className="text-gray-500">Profissional</TableHead>
            <TableHead className="text-gray-500">CREA/CAU</TableHead>
            <TableHead className="text-gray-500">Emissão</TableHead>
            <TableHead className="text-gray-500">Validade</TableHead>
            <TableHead className="text-gray-500">Status</TableHead>
            <TableHead className="text-gray-500 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {arts.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-gray-500 py-8">Nenhuma ART/RRT cadastrada.</TableCell></TableRow>
          ) : (
            arts.map((art) => {
              const as2 = ART_STATUS[art.status || "vigente"] || ART_STATUS.vigente;
              return (
                <TableRow key={art.id} className="border-gray-200 hover:bg-gray-50">
                  <TableCell className="text-gray-900 font-medium">{art.tipo}</TableCell>
                  <TableCell className="text-blue-600 font-mono">{art.numero}</TableCell>
                  <TableCell className="text-gray-600">{art.profissional}</TableCell>
                  <TableCell className="text-gray-500">{art.creaOuCau || "-"}</TableCell>
                  <TableCell className="text-gray-500">{art.dataEmissao ? new Date(art.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  <TableCell className="text-gray-500">{art.dataValidade ? new Date(art.dataValidade).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${as2.color}`}>{as2.label}</span></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(art)}><Pencil className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => onDelete(art.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfiguracoesStandalone({ disciplinas, tipos, tiposSubpasta, companyId, createDisciplina, updateDisciplina, deleteDisciplina, createTipo, updateTipo, deleteTipo, createTipoSubpasta, updateTipoSubpasta, deleteTipoSubpasta }: {
  disciplinas: any; tipos: any; tiposSubpasta: any; companyId: number;
  createDisciplina: any; updateDisciplina: any; deleteDisciplina: any;
  createTipo: any; updateTipo: any; deleteTipo: any;
  createTipoSubpasta: any; updateTipoSubpasta: any; deleteTipoSubpasta: any;
}) {
  return (
    <div className="space-y-4">
      <ConfigSection
        title="Disciplinas" subtitle="Pastas de disciplinas disponíveis para suas obras."
        items={disciplinas.data || []}
        onAdd={(nome, sigla) => createDisciplina.mutate({ companyId, nome, sigla })}
        onUpdate={(id, nome, sigla) => updateDisciplina.mutate({ id, companyId, nome, sigla })}
        onDelete={(id) => { if (window.confirm("Excluir?")) deleteDisciplina.mutate({ id, companyId }); }}
        fieldLabel1="Nome" fieldLabel2="Sigla"
      />
      <ConfigSection
        title="Tipos de Documento" subtitle="Classificações (PE, PB, Memorial, etc.)."
        items={tipos.data || []}
        onAdd={(nome, sigla) => createTipo.mutate({ companyId, nome, sigla })}
        onUpdate={(id, nome, sigla) => updateTipo.mutate({ id, companyId, nome, sigla })}
        onDelete={(id) => { if (window.confirm("Excluir?")) deleteTipo.mutate({ id, companyId }); }}
        fieldLabel1="Nome" fieldLabel2="Sigla"
      />
      <SubpastaConfigSection
        items={tiposSubpasta.data || []}
        onAdd={(nome) => createTipoSubpasta.mutate({ companyId, nome })}
        onUpdate={(id, nome) => updateTipoSubpasta.mutate({ id, companyId, nome })}
        onDelete={(id) => { if (window.confirm("Excluir?")) deleteTipoSubpasta.mutate({ id, companyId }); }}
      />
    </div>
  );
}

function SubpastaConfigSection({ items, onAdd, onUpdate, onDelete }: {
  items: any[]; onAdd: (nome: string) => void; onUpdate: (id: number, nome: string) => void; onDelete: (id: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">Tipos de Sub-pasta</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Tipos de arquivo dentro de cada disciplina (DWG, PDF, IFC...).</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {items.map(item => (
            <span key={item.id} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
              {editingId === item.id ? (
                <>
                  <Input value={editNome} onChange={(e) => setEditNome(e.target.value.toUpperCase())} className="h-5 w-16 text-xs p-1" />
                  <button onClick={() => { if (editNome) { onUpdate(editingId, editNome); setEditingId(null); } }} className="text-green-600"><CheckCircle className="w-3 h-3" /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400"><XCircle className="w-3 h-3" /></button>
                </>
              ) : (
                <>
                  {item.nome}
                  <button onClick={() => { setEditingId(item.id); setEditNome(item.nome); }} className="text-gray-400 hover:text-blue-600"><Pencil className="w-2.5 h-2.5" /></button>
                  <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-2.5 h-2.5" /></button>
                </>
              )}
            </span>
          ))}
        </div>
      )}
      {!showAdd ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="text-xs border-dashed border-gray-300 text-gray-500">
          <Plus className="w-3 h-3 mr-1" /> Adicionar
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} className="h-7 text-xs w-32" placeholder="Ex: REVIT" />
          <Button size="sm" onClick={() => { if (nome) { onAdd(nome); setNome(""); } }} className="h-7 text-xs bg-blue-600 text-white">Criar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNome(""); }} className="h-7 text-xs text-gray-400">Cancelar</Button>
        </div>
      )}
    </div>
  );
}

function ConfigSection({ title, subtitle, items, onAdd, onUpdate, onDelete, fieldLabel1, fieldLabel2 }: {
  title: string; subtitle?: string; items: any[];
  onAdd: (nome: string, sigla: string) => void;
  onUpdate: (id: number, nome: string, sigla: string) => void;
  onDelete: (id: number) => void;
  fieldLabel1: string; fieldLabel2: string;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editSigla, setEditSigla] = useState("");

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{fieldLabel2}</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{fieldLabel1}</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/40`}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-3 py-1.5"><Input value={editSigla} onChange={(e) => setEditSigla(e.target.value.toUpperCase())} className="h-7 text-xs font-mono w-20 bg-white" maxLength={10} /></td>
                      <td className="px-3 py-1.5"><Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-7 text-xs bg-white" /></td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" onClick={() => { if (editNome && editSigla) { onUpdate(editingId!, editNome, editSigla); setEditingId(null); } }} className="h-6 px-2 text-[10px] bg-green-600 text-white">Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 px-2 text-[10px] text-gray-400">Cancelar</Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-bold text-white" style={{ backgroundColor: item.cor || "#3B82F6" }}>{item.sigla}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.nome}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingId(item.id); setEditNome(item.nome); setEditSigla(item.sigla); }} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDelete(item.id)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!showAdd ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="text-xs border-dashed border-gray-300 text-gray-500">
          <Plus className="w-3 h-3 mr-1" /> Adicionar
        </Button>
      ) : (
        <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex-1">
            <Label className="text-gray-500 text-xs">{fieldLabel1}</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="bg-white border-gray-300 text-gray-900 h-8 text-sm" />
          </div>
          <div className="w-28">
            <Label className="text-gray-500 text-xs">{fieldLabel2}</Label>
            <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} className="bg-white border-gray-300 text-gray-900 h-8 text-sm font-mono" maxLength={10} />
          </div>
          <Button size="sm" onClick={() => { if (nome && sigla) { onAdd(nome, sigla); setNome(""); setSigla(""); } }} className="bg-blue-600 text-white h-8 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Criar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNome(""); setSigla(""); }} className="h-8 text-xs text-gray-400">Cancelar</Button>
        </div>
      )}
    </div>
  );
}
