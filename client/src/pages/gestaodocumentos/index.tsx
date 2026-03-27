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

type ViewMode = "obras" | "ficheiro" | "configuracoes" | "arts" | "painel";

export default function GestaoDocumentos() {
  const { companyId } = useCompany();
  const [location] = useLocation();

  const [urlTab, setUrlTab] = useState<string | null>(() => {
    const stored = sessionStorage.getItem('_navParams');
    if (stored) {
      const p = new URLSearchParams(stored);
      return p.get("tab");
    }
    return new URLSearchParams(window.location.search).get("tab");
  });

  useEffect(() => {
    const readTab = () => {
      const stored = sessionStorage.getItem('_navParams');
      if (stored) {
        const p = new URLSearchParams(stored);
        setUrlTab(p.get("tab"));
      } else {
        setUrlTab(new URLSearchParams(window.location.search).get("tab"));
      }
    };
    window.addEventListener("navParamsUpdated", readTab);
    window.addEventListener("popstate", readTab);
    const orig = window.history.pushState.bind(window.history);
    window.history.pushState = function (...args: any[]) {
      orig(...args);
      readTab();
    };
    return () => {
      window.removeEventListener("navParamsUpdated", readTab);
      window.removeEventListener("popstate", readTab);
      window.history.pushState = orig;
    };
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (urlTab === "configuracoes") return "configuracoes";
    if (urlTab === "arts") return "arts";
    if (urlTab === "painel") return "painel";
    if (urlTab === "documentos") return "obras";
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

  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; codigo: string; titulo: string; isRevision: boolean; existingDocId?: number }[]>([]);

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
    if (urlTab === "configuracoes") setViewMode("configuracoes");
    else if (urlTab === "arts") setViewMode("arts");
    else if (urlTab === "painel") setViewMode("painel");
    else if (urlTab === "documentos" || urlTab === null) setViewMode("obras");
  }, [urlTab]);

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
  const allObraDocs = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
    },
    { enabled: companyId > 0 && !!selectedObraId }
  );

  const pdfDocs = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
      disciplinaId: selectedDiscId || undefined,
      subpasta: "PDF",
    },
    { enabled: companyId > 0 && !!activeFicheiroId && (selectedSubpasta === "DWG" || selectedSubpasta === "PDF") && !!selectedDiscId }
  );

  const dwgDocs = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
      disciplinaId: selectedDiscId || undefined,
      subpasta: "DWG",
    },
    { enabled: companyId > 0 && !!activeFicheiroId && selectedSubpasta === "PDF" && !!selectedDiscId }
  );

  const pdfTituloMap = useMemo(() => {
    if (selectedSubpasta !== "DWG" && selectedSubpasta !== "PDF") return new Map<string, number>();
    return new Map((pdfDocs.data || []).map((d: any) => {
      const p = parseRevision((d.titulo || "").replace(/\.[^.]+$/, "").trim());
      return [p.base.toLowerCase(), p.rev] as [string, number];
    }));
  }, [pdfDocs.data, selectedSubpasta]);

  const dwgTituloMap = useMemo(() => {
    if (selectedSubpasta !== "PDF" && selectedSubpasta !== "DWG") return new Map<string, number>();
    return new Map((dwgDocs.data || []).map((d: any) => {
      const p = parseRevision((d.titulo || "").replace(/\.[^.]+$/, "").trim());
      return [p.base.toLowerCase(), p.rev] as [string, number];
    }));
  }, [dwgDocs.data, selectedSubpasta]);

  const arts = trpc.gestaoDocumentos.listArts.useQuery(
    { companyId, obraId: selectedObraId || undefined },
    { enabled: companyId > 0 }
  );
  const revisoes = trpc.gestaoDocumentos.listRevisoes.useQuery(
    { companyId, documentoId: selectedDoc?.id || 0 },
    { enabled: !!selectedDoc }
  );

  const dashStats = trpc.gestaoDocumentos.getDashboardStats.useQuery(
    { companyId },
    { enabled: companyId > 0 && viewMode === "painel" }
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

  function parseRevision(filename: string): { base: string; rev: number; revStr: string } {
    const name = filename.replace(/\.[^.]+$/, "");
    const match = name.match(/^(.+)-R(\d{2,3})$/i);
    if (match) return { base: match[1], rev: parseInt(match[2], 10), revStr: match[2] };
    return { base: name, rev: -1, revStr: "" };
  }

  const createRevisao = trpc.gestaoDocumentos.createRevisao.useMutation();

  function handleBatchUpload(files: FileList) {
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

    const currentDocs: any[] = documentos.data || [];
    const allDocs: any[] = allObraDocs.data || [];

    const prepared: typeof pendingFiles = [];
    for (const file of validFiles) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      const { base, rev, revStr } = parseRevision(nameWithoutExt);

      const exactDup = currentDocs.find((d: any) => {
        const dName = (d.titulo || d.codigo || "").replace(/\.[^.]+$/, "").trim().toLowerCase();
        return dName === nameWithoutExt.toLowerCase();
      });
      if (exactDup) {
        toast.error(`"${file.name}" já está cadastrado nesta pasta. Use uma revisão diferente.`);
        continue;
      }

      const existingDoc = rev >= 0
        ? currentDocs.find((d: any) => {
            const p = parseRevision(d.titulo || d.codigo || "");
            return p.base.toLowerCase() === base.toLowerCase() && p.rev < rev;
          })
        : null;

      let autoTitle = "";
      if (base) {
        const matchAnyDoc = allDocs.find((d: any) => {
          const p = parseRevision(d.titulo || d.codigo || "");
          return p.base.toLowerCase() === base.toLowerCase() && d.descricao;
        });
        if (matchAnyDoc?.descricao) autoTitle = matchAnyDoc.descricao;
        if (!autoTitle && existingDoc?.descricao) autoTitle = existingDoc.descricao;
      }

      prepared.push({
        file,
        codigo: nameWithoutExt,
        titulo: autoTitle,
        isRevision: !!existingDoc,
        existingDocId: existingDoc?.id,
      });
    }

    if (prepared.length === 0) {
      if (batchFileInputRef.current) batchFileInputRef.current.value = "";
      return;
    }
    setPendingFiles(prepared);
    setShowUploadConfirm(true);
    if (batchFileInputRef.current) batchFileInputRef.current.value = "";
  }

  async function handleConfirmUpload() {
    if (!selectedObraId) return;
    setShowUploadConfirm(false);
    setBatchUploading(true);
    setBatchProgress({ current: 0, total: pendingFiles.length });
    isBatchRef.current = true;
    let ok = 0;
    let fail = 0;
    let revised = 0;

    const currentDocs: any[] = documentos.data || [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      setBatchProgress({ current: i + 1, total: pendingFiles.length });
      const discId = selectedDiscId || undefined;
      const { rev, revStr } = parseRevision(pf.codigo);

      try {
        if (pf.isRevision && pf.existingDocId) {
          const existingDoc = currentDocs.find((d: any) => d.id === pf.existingDocId);
          if (existingDoc) {
            const oldParsed = parseRevision(existingDoc.titulo || existingDoc.codigo || "");
            const oldRevStr = oldParsed.revStr || "00";
            await createRevisao.mutateAsync({
              companyId,
              documentoId: existingDoc.id,
              numero: oldRevStr,
              descricao: `Arquivo da revisão R${oldRevStr} (substituído por R${revStr})`,
              arquivoUrl: existingDoc.arquivoUrl || undefined,
              arquivoNome: existingDoc.arquivoNome || undefined,
              arquivoTamanho: existingDoc.arquivoTamanho || undefined,
              motivoRevisao: `Substituído por revisão R${revStr}`,
            });
            await uploadFileToDoc(existingDoc.id, pf.file);
            await updateDoc.mutateAsync({
              id: existingDoc.id,
              companyId,
              titulo: pf.codigo,
              codigo: pf.codigo,
              descricao: pf.titulo || undefined,
              status: "em_elaboracao",
              revisaoAtual: revStr || "00",
            });
            existingDoc.titulo = pf.codigo;
            existingDoc.codigo = pf.codigo;
            revised++;
          }
          ok++;
        } else {
          const doc = await createDoc.mutateAsync({
            companyId,
            obraId: selectedObraId,
            ficheiroId: activeFicheiroId || undefined,
            disciplinaId: discId,
            pastaId: undefined,
            subpasta: selectedSubpasta || undefined,
            codigo: pf.codigo,
            titulo: pf.codigo,
            descricao: pf.titulo || undefined,
            dataEmissao: new Date().toISOString().split("T")[0],
          });
          if (doc?.id) {
            await uploadFileToDoc(doc.id, pf.file);
          }
          ok++;
        }
      } catch {
        fail++;
      }
    }
    isBatchRef.current = false;
    setBatchUploading(false);
    setBatchProgress({ current: 0, total: 0 });
    setPendingFiles([]);
    utils.gestaoDocumentos.listDocumentos.invalidate();
    if (fail === 0) {
      const msg = revised > 0
        ? `${ok} processado(s): ${ok - revised} novo(s), ${revised} revisão(ões) atualizada(s)`
        : `${ok} documento(s) criado(s) com sucesso`;
      toast.success(msg);
    } else {
      toast.warning(`${ok} processado(s), ${fail} com erro`);
    }
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
  const syncCounterpart = trpc.gestaoDocumentos.syncCounterpartStatus.useMutation({
    onSuccess: (data) => {
      if (data.synced > 0) {
        toast.success(`Status sincronizado com ${data.synced} documento(s) correspondente(s)`);
        utils.gestaoDocumentos.listDocumentos.invalidate();
      }
    },
  });
  const updateStatusBatch = trpc.gestaoDocumentos.updateStatusBatch.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Status de ${data.count} documento(s) atualizado`);
      syncCounterpart.mutate({ companyId: variables.companyId, docIds: variables.ids, status: variables.status });
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
  const deleteRev = trpc.gestaoDocumentos.deleteRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão apagada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
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

  function normalize(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
  }

  const filteredDocs = selectedSubpasta ? (documentos.data || []).filter(doc => {
    if (selectedDiscId && doc.disciplinaId !== selectedDiscId) return false;
    if (search.trim()) {
      const s = normalize(search.trim());
      const fields = normalize([doc.titulo, doc.codigo, doc.descricao, doc.arquivoNome].filter(Boolean).join(" "));
      if (!s.split(/\s+/).every(word => fields.includes(word))) return false;
    }
    return true;
  }) : [];

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
        {viewMode === "painel" ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">Painel de Controle</h1>
              <Button variant="outline" size="sm" onClick={() => setViewMode("obras")} className="text-gray-600">
                <FolderOpen className="w-4 h-4 mr-1" /> Ir para Documentos
              </Button>
            </div>

            {dashStats.isLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">Carregando...</div>
            ) : dashStats.isError ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <p>Erro ao carregar dados do painel.</p>
                <Button variant="outline" size="sm" onClick={() => dashStats.refetch()}>Tentar novamente</Button>
              </div>
            ) : dashStats.data ? (() => {
              const s = dashStats.data;
              const stMap: Record<string, { label: string; color: string; bg: string }> = {
                em_elaboracao: { label: "Em Elaboracao", color: "bg-blue-100 text-blue-700", bg: "bg-blue-500" },
                em_revisao: { label: "Em Revisao", color: "bg-amber-100 text-amber-700", bg: "bg-amber-500" },
                aprovado: { label: "Aprovado", color: "bg-green-100 text-green-700", bg: "bg-green-500" },
                reprovado: { label: "Reprovado", color: "bg-red-100 text-red-700", bg: "bg-red-500" },
                cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-600", bg: "bg-gray-400" },
              };
              const now = new Date();
              const expArts = (s.expiringArts || []) as any[];
              const expDocs = (s.expiringDocs || []) as any[];
              const allExpiring = [
                ...expArts.map((a: any) => ({ ...a, _type: "art" as const, _label: `${a.tipo} ${a.numero}`, _sub: a.profissional, _obra: a.obraNome, _date: a.dataValidade })),
                ...expDocs.map((d: any) => ({ ...d, _type: "doc" as const, _label: d.titulo || d.codigo, _sub: d.descricao || d.subpasta, _obra: d.obraNome, _date: d.dataValidade })),
              ].sort((a, b) => new Date(a._date).getTime() - new Date(b._date).getTime());
              const expiredCount = allExpiring.filter(e => new Date(e._date) < now).length;
              const aprovPct = s.totalDocs > 0 ? Math.round(((s as any).docsAprovados / s.totalDocs) * 100) : 0;
              const revMediaPorDoc = s.totalDocs > 0 ? (s.totalRevisoes / s.totalDocs).toFixed(1) : "0";
              const obraDetailsSorted = ((s as any).obraDetails || []).sort((a: any, b: any) => b.total - a.total);

              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Documentos</p>
                      <p className="text-3xl font-bold text-gray-900">{s.totalDocs}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {s.subpastaCounts.map((sp: any) => (
                          <span key={sp.subpasta} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{sp.subpasta}: {sp.count}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Taxa de Aprovacao</p>
                      <p className="text-3xl font-bold text-green-600">{aprovPct}%</p>
                      <p className="text-[10px] text-gray-400 mt-2">{(s as any).docsAprovados || 0} de {s.totalDocs} aprovados</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Revisoes / Doc</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-indigo-600">{revMediaPorDoc}</p>
                        <p className="text-sm text-gray-400">media</p>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2">{s.totalRevisoes} revisoes total · {(s as any).docsR0 || 0} docs sem revisao</p>
                    </div>
                    <div className={`border rounded-xl p-4 shadow-sm ${expiredCount > 0 ? "bg-red-50 border-red-200" : allExpiring.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Alertas</p>
                      <p className={`text-3xl font-bold ${expiredCount > 0 ? "text-red-600" : allExpiring.length > 0 ? "text-amber-600" : "text-gray-400"}`}>{allExpiring.length}</p>
                      <p className="text-[10px] mt-2">{expiredCount > 0 ? <span className="text-red-600 font-semibold">{expiredCount} vencido(s)</span> : <span className="text-gray-400">Nenhum vencido</span>} · {s.totalArts} ARTs</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Status dos Documentos</h3>
                      <div className="space-y-2.5">
                        {s.statusCounts.map((sc) => {
                          const sm = stMap[sc.status || "em_elaboracao"] || { label: sc.status, color: "bg-gray-100 text-gray-600", bg: "bg-gray-400" };
                          const pct = s.totalDocs > 0 ? Math.round((sc.count / s.totalDocs) * 100) : 0;
                          return (
                            <div key={sc.status}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sm.color}`}>{sm.label}</span>
                                <span className="text-xs font-semibold text-gray-700">{sc.count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${sm.bg}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Resumo por Obra</h3>
                      {obraDetailsSorted.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Nenhuma obra com documentos</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                <th className="text-left py-2 font-medium">Obra</th>
                                <th className="text-center py-2 font-medium w-14">Total</th>
                                <th className="text-center py-2 font-medium w-14">DWG</th>
                                <th className="text-center py-2 font-medium w-14">PDF</th>
                                <th className="text-center py-2 font-medium w-20">Aprovados</th>
                                <th className="text-center py-2 font-medium w-20">Revisao</th>
                                <th className="text-center py-2 font-medium w-16">Progresso</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {obraDetailsSorted.map((od: any) => {
                                const pctAprov = od.total > 0 ? Math.round((od.aprovados / od.total) * 100) : 0;
                                return (
                                  <tr key={od.obraId} className="hover:bg-gray-50/50">
                                    <td className="py-2 text-gray-800 font-medium truncate max-w-[200px]">{od.obraNome}</td>
                                    <td className="py-2 text-center font-semibold text-gray-700">{od.total}</td>
                                    <td className="py-2 text-center text-gray-600">{od.dwgs || 0}</td>
                                    <td className="py-2 text-center text-gray-600">{od.pdfs || 0}</td>
                                    <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-xs font-medium">{od.aprovados || 0}</span></td>
                                    <td className="py-2 text-center"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs font-medium">{od.emRevisao || 0}</span></td>
                                    <td className="py-2">
                                      <div className="flex items-center gap-1.5">
                                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                          <div className="h-full rounded-full bg-green-500" style={{ width: `${pctAprov}%` }} />
                                        </div>
                                        <span className="text-[10px] text-gray-500 w-8 text-right">{pctAprov}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {allExpiring.length > 0 && (
                    <div className={`border rounded-xl p-4 shadow-sm ${expiredCount > 0 ? "bg-red-50/50 border-red-200" : "bg-amber-50/50 border-amber-200"}`}>
                      <h3 className="text-xs font-semibold text-gray-800 mb-1 flex items-center gap-2 uppercase tracking-wider">
                        <AlertTriangle className={`w-4 h-4 ${expiredCount > 0 ? "text-red-500" : "text-amber-500"}`} />
                        Documentos / ARTs Vencendo ou Vencidos (30 dias)
                      </h3>
                      <p className="text-[10px] text-gray-500 mb-3">Documentos vencidos podem causar paralizacao de obras. Providencie a renovacao.</p>
                      <div className="divide-y divide-gray-200/50">
                        {allExpiring.map((item: any, idx: number) => {
                          const dt = new Date(item._date);
                          const isExpired = dt < now;
                          const daysLeft = Math.ceil((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div key={`${item._type}-${item.id}-${idx}`} className="flex items-center justify-between py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item._type === "art" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                    {item._type === "art" ? item.tipo || "ART" : item.subpasta || "DOC"}
                                  </span>
                                  <span className="text-sm text-gray-800 font-medium truncate">{item._label}</span>
                                </div>
                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{item._obra} — {item._sub}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <span className="text-[10px] text-gray-500">{dt.toLocaleDateString("pt-BR")}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isExpired ? "bg-red-100 text-red-700" : daysLeft <= 7 ? "bg-amber-100 text-amber-700" : "bg-yellow-50 text-yellow-700"}`}>
                                  {isExpired ? `Vencido ha ${Math.abs(daysLeft)}d` : `${daysLeft}d`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(s.recentRevisions || []).length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
                          <History className="w-3.5 h-3.5 text-indigo-500" />
                          Atividade de Revisoes
                        </h3>
                        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                          {(s.recentRevisions as any[]).map((rv: any) => (
                            <div key={rv.id} className="flex items-center justify-between py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">R{rv.numero}</span>
                                  <span className="text-xs text-gray-800 font-mono truncate">{rv.docTitulo}</span>
                                </div>
                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{rv.obraNome}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${rv.status === "aprovada" ? "bg-green-100 text-green-700" : rv.status === "rejeitada" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                                  {rv.status === "aprovada" ? "Aprov." : rv.status === "rejeitada" ? "Rej." : "Pend."}
                                </span>
                                <span className="text-[10px] text-gray-400">{rv.criadoEm ? new Date(rv.criadoEm).toLocaleDateString("pt-BR") : ""}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(s.recentDocs || []).length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Ultimos Documentos</h3>
                        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                          {(s.recentDocs as any[]).map((rd: any) => {
                            const sm = stMap[rd.status || "em_elaboracao"] || stMap.em_elaboracao;
                            return (
                              <div key={rd.id} className="flex items-center justify-between py-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-mono text-gray-700 truncate">{rd.titulo}</p>
                                  <p className="text-[10px] text-gray-500 truncate">{rd.obraNome}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[10px] text-gray-400 font-mono">{rd.subpasta}</span>
                                  {rd.revisaoAtual && rd.revisaoAtual !== "0" && <span className="text-[10px] text-indigo-600 font-bold">R{rd.revisaoAtual}</span>}
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sm.color}`}>{sm.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })() : null}
          </div>
        ) : viewMode === "configuracoes" ? (
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
                  <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Buscar documentos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-8 text-sm bg-gray-50 border-gray-200"
                      />
                    </div>
                    {selectedSubpasta && (
                      <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
                        {filteredDocs.length} doc{filteredDocs.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={getAcceptForSubpasta(selectedSubpasta) || ".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rvt,.ifc"}
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleBatchUpload(e.target.files); }}
                  />
                  <Button size="sm" onClick={() => batchFileInputRef.current?.click()} className="bg-blue-600 text-white hover:bg-blue-700 h-8" disabled={batchUploading}>
                    {batchUploading ? (
                      <><span className="animate-spin mr-1">⏳</span> Enviando {batchProgress.current}/{batchProgress.total}</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-1" /> Enviar Documentos</>
                    )}
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
                  {!selectedSubpasta && selectedDiscId ? (
                    <div className="text-center py-16">
                      <Folder className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500 text-sm mb-1">Selecione uma subpasta</p>
                      <p className="text-gray-400 text-xs">Clique em DWG, PDF ou DOC para visualizar os documentos</p>
                    </div>
                  ) : filteredDocs.length === 0 ? (
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
                      <p className="text-gray-400 text-xs">Clique em "Enviar Documentos" ou arraste arquivos aqui</p>
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
                          <TableHead className="text-gray-500 text-xs">Título / Código</TableHead>
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
                          const docParsed = parseRevision((doc.titulo || "").replace(/\.[^.]+$/, "").trim());
                          const docBase = docParsed.base.toLowerCase();
                          const docRev = docParsed.rev;
                          const missingPdf = selectedSubpasta === "DWG" && !pdfTituloMap.has(docBase);
                          const missingDwg = selectedSubpasta === "PDF" && !dwgTituloMap.has(docBase);
                          const pdfRev = pdfTituloMap.get(docBase);
                          const dwgRev = dwgTituloMap.get(docBase);
                          const revMismatch = selectedSubpasta === "DWG" && !missingPdf && pdfRev !== undefined && docRev >= 0 && pdfRev !== docRev
                            ? pdfRev
                            : selectedSubpasta === "PDF" && !missingDwg && dwgRev !== undefined && docRev >= 0 && dwgRev !== docRev
                            ? dwgRev
                            : null;
                          const missingCounterpart = missingPdf || missingDwg || revMismatch !== null;
                          return (
                            <TableRow key={doc.id} className={`border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedDocIds.has(doc.id) ? "bg-blue-50" : ""} ${missingCounterpart ? "bg-red-50/50" : ""}`} onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
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
                              <TableCell className="text-gray-900 text-sm overflow-visible">
                                <div className="flex items-start gap-1.5 flex-nowrap">
                                  {doc.arquivoUrl && <Paperclip className="w-3 h-3 text-blue-500 shrink-0 mt-1" />}
                                  <div className="min-w-0">
                                    <span className="flex items-center gap-1.5 flex-nowrap">
                                      <span className="truncate text-xs font-mono text-gray-600">{doc.titulo}</span>
                                      {missingPdf && (
                                        <span className="shrink-0 inline-flex items-center gap-1 ml-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded-full border border-red-300 whitespace-nowrap">
                                          <AlertTriangle className="w-3 h-3" />
                                          Sem PDF
                                        </span>
                                      )}
                                      {missingDwg && (
                                        <span className="shrink-0 inline-flex items-center gap-1 ml-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded-full border border-orange-300 whitespace-nowrap">
                                          <AlertTriangle className="w-3 h-3" />
                                          Sem DWG
                                        </span>
                                      )}
                                      {revMismatch !== null && (
                                        <span className="shrink-0 inline-flex items-center gap-1 ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full border border-amber-300 whitespace-nowrap">
                                          <AlertTriangle className="w-3 h-3" />
                                          {selectedSubpasta === "DWG" ? "PDF" : "DWG"} R{String(revMismatch).padStart(2, "0")}
                                        </span>
                                      )}
                                    </span>
                                    {doc.descricao && (
                                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{doc.descricao}</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {disc ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${disc.cor}20`, color: disc.cor || "#3b82f6" }}>
                                    {disc.sigla}
                                  </span>
                                ) : <span className="text-gray-400">—</span>}
                              </TableCell>
                              <TableCell className="text-center text-gray-700 text-sm font-medium">{(() => {
                                const p = parseRevision(doc.titulo || doc.codigo || "");
                                return p.rev >= 0 ? p.rev : (doc.revisaoAtual || "0");
                              })()}</TableCell>
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
                                        onClick={() => {
                                          updateDoc.mutate({ id: doc.id, companyId, status: key });
                                          syncCounterpart.mutate({ companyId, docIds: [doc.id], status: key });
                                        }}
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

      {/* Modal — Confirmação de Upload */}
      <Dialog open={showUploadConfirm} onOpenChange={(open) => { if (!open) { setShowUploadConfirm(false); setPendingFiles([]); } }}>
        <DialogContent resizable={false} className="w-[95vw] max-w-[900px] max-h-[85vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Upload className="w-5 h-5 text-blue-600" />
              Confirmar Upload — {pendingFiles.length} arquivo(s)
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">Preencha o título da planta para cada documento. Se já existir um DWG/PDF cadastrado com o mesmo nome, o título é preenchido automaticamente.</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-3">
              {pendingFiles.map((pf, idx) => (
                <div key={idx} className={`p-4 rounded-xl border ${pf.isRevision ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 mt-1">
                      {pf.isRevision ? (
                        <span className="px-2 py-1 rounded text-[10px] font-bold bg-amber-100 text-amber-700">REVISÃO</span>
                      ) : (
                        <span className="px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-700">NOVO</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Código (arquivo)</p>
                        <p className="text-xs font-mono text-gray-600 truncate">{pf.codigo}</p>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5 block">Título da Planta</label>
                        <input
                          type="text"
                          value={pf.titulo}
                          onChange={(e) => {
                            const updated = [...pendingFiles];
                            updated[idx] = { ...updated[idx], titulo: e.target.value };
                            const { base } = parseRevision(pf.codigo);
                            updated.forEach((uf, uidx) => {
                              if (uidx !== idx && !uf.titulo) {
                                const ub = parseRevision(uf.codigo);
                                if (ub.base.toLowerCase() === base.toLowerCase()) {
                                  updated[uidx] = { ...updated[uidx], titulo: e.target.value };
                                }
                              }
                            });
                            setPendingFiles(updated);
                          }}
                          placeholder="Ex: Planta Baixa Layout 5° Pavimento"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                        />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <button
                        onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
            <p className="text-xs text-gray-400">
              {pendingFiles.filter(f => f.isRevision).length > 0 && (
                <span className="text-amber-600 font-medium">{pendingFiles.filter(f => f.isRevision).length} revisão(ões) detectada(s)</span>
              )}
              {pendingFiles.filter(f => !f.isRevision).length > 0 && (
                <span className="text-green-600 font-medium ml-2">{pendingFiles.filter(f => !f.isRevision).length} novo(s)</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => { setShowUploadConfirm(false); setPendingFiles([]); }} className="border-gray-300 text-gray-600">
                Cancelar
              </Button>
              <Button onClick={handleConfirmUpload} className="bg-blue-600 text-white hover:bg-blue-700" disabled={pendingFiles.length === 0}>
                <Upload className="w-4 h-4 mr-1" /> Confirmar e Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Detalhe do Documento */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent resizable={false} className="w-[98vw] max-w-[98vw] h-[95vh] max-h-[95vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-8 pt-6 pb-4 border-b border-gray-100 shrink-0">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <FileText className="w-6 h-6 text-blue-600" />
              {selectedDoc?.descricao || selectedDoc?.titulo}
            </DialogTitle>
            <p className="text-xs font-mono text-gray-400 mt-1 ml-9">{selectedDoc?.titulo}</p>
          </DialogHeader>
          {selectedDoc && (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Status</p>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).color}`}>
                      {(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).label}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Revisão Atual</p>
                    <p className="text-lg font-semibold text-gray-800">{selectedDoc.revisaoAtual || "0"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Disciplina</p>
                    <p className="text-sm text-gray-700">{selectedDoc.disciplinaId ? discMap.get(selectedDoc.disciplinaId)?.nome : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Tipo</p>
                    <p className="text-sm text-gray-700">{selectedDoc.tipoDocumentoId ? tipoMap.get(selectedDoc.tipoDocumentoId)?.nome : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Subpasta</p>
                    <p className="text-sm text-gray-700">{selectedDoc.subpasta || "-"}</p>
                  </div>
                </div>
                {selectedDoc.descricao && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Descrição</h4>
                    <p className="text-gray-700 text-sm leading-relaxed">{selectedDoc.descricao}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Arquivo Atual</h4>
                  {selectedDoc.arquivoUrl ? (
                    <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                        <Paperclip className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-blue-800 font-semibold truncate">{selectedDoc.arquivoNome || "Arquivo"}</p>
                        {selectedDoc.arquivoTamanho && <p className="text-xs text-blue-500 mt-0.5">{(selectedDoc.arquivoTamanho / 1024).toFixed(0)} KB</p>}
                      </div>
                      {/\.(pdf|png|jpg|jpeg|gif|webp)$/i.test(selectedDoc.arquivoNome || "") && (
                        <button onClick={() => { setShowDetailModal(false); setPreviewDoc(selectedDoc); }} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                          <Eye className="w-4 h-4" /> Visualizar
                        </button>
                      )}
                      <a href={selectedDoc.arquivoUrl} download={selectedDoc.arquivoNome || "arquivo"} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                        <Download className="w-4 h-4" /> Baixar
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                        <File className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500 flex-1">Nenhum arquivo anexado</p>
                      <button onClick={() => { setShowDetailModal(false); openEditDoc(selectedDoc); }} className="text-sm text-blue-600 hover:text-blue-800 font-medium underline">Anexar arquivo</button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <History className="w-4 h-4" /> Histórico Completo de Revisões
                    </h4>
                    <Button size="sm" onClick={() => setShowRevModal(true)} className="bg-blue-600 text-white hover:bg-blue-700 h-9 px-4">
                      <Plus className="w-4 h-4 mr-1" /> Nova Revisão
                    </Button>
                  </div>
                  {(() => {
                    const dbRevs = revisoes.data || [];
                    const parsed = parseRevision(selectedDoc.titulo || selectedDoc.codigo || "");
                    const currentRevNum = parsed.rev >= 0 ? parsed.rev : 0;
                    const dbRevMap = new Map<number, typeof dbRevs[0]>();
                    dbRevs.forEach(r => {
                      const num = parseInt(r.numero, 10);
                      if (!isNaN(num)) dbRevMap.set(num, r);
                    });
                    const allRevNums: number[] = [];
                    for (let i = 0; i <= currentRevNum; i++) allRevNums.push(i);
                    dbRevMap.forEach((_, k) => { if (!allRevNums.includes(k)) allRevNums.push(k); });
                    allRevNums.sort((a, b) => b - a);

                    return (
                      <div className="space-y-2">
                        {allRevNums.map(revNum => {
                          const dbRev = dbRevMap.get(revNum);
                          const isCurrent = revNum === currentRevNum;
                          const revLabel = revNum.toString().padStart(2, "0");

                          if (isCurrent) {
                            return (
                              <div key={`rev-${revNum}`} className="flex items-center justify-between p-4 rounded-xl border-2 border-blue-300 bg-blue-50">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-sm font-bold text-white bg-blue-600 px-3 py-1 rounded">R{revLabel}</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Atual</span>
                                  </div>
                                  <p className="text-sm text-blue-700 mt-2 font-medium">{selectedDoc.arquivoNome || selectedDoc.titulo}</p>
                                  {selectedDoc.arquivoTamanho && <p className="text-xs text-blue-500 mt-0.5">{(selectedDoc.arquivoTamanho / 1024).toFixed(0)} KB</p>}
                                </div>
                                {selectedDoc.arquivoUrl && (
                                  <a href={selectedDoc.arquivoUrl} download={selectedDoc.arquivoNome || "arquivo"} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                                    <Download className="w-3 h-3" /> Baixar
                                  </a>
                                )}
                              </div>
                            );
                          }

                          if (dbRev) {
                            return (
                              <div key={`rev-${revNum}`} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-sm font-semibold text-gray-700 bg-gray-200 px-3 py-1 rounded">R{revLabel}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      dbRev.status === "aprovada" ? "bg-green-100 text-green-800" :
                                      dbRev.status === "rejeitada" ? "bg-red-100 text-red-800" :
                                      "bg-yellow-100 text-yellow-800"
                                    }`}>
                                      {dbRev.status === "aprovada" ? "Aprovada" : dbRev.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                                    </span>
                                  </div>
                                  {dbRev.descricao && <p className="text-sm text-gray-600 mt-2">{dbRev.descricao}</p>}
                                  {dbRev.arquivoNome && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <Paperclip className="w-3 h-3 text-gray-400" />
                                      <span className="text-xs text-gray-500">{dbRev.arquivoNome}</span>
                                      {dbRev.arquivoUrl && (
                                        <a href={dbRev.arquivoUrl} download={dbRev.arquivoNome} className="text-xs text-blue-600 hover:text-blue-800 underline ml-1">Baixar</a>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-xs text-gray-400 mt-1">{dbRev.criadoEm ? new Date(dbRev.criadoEm).toLocaleString("pt-BR") : ""}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {dbRev.status === "pendente" && (
                                    <>
                                      <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-300 hover:bg-green-50"
                                        onClick={() => aprovarRev.mutate({ id: dbRev.id, companyId, documentoId: selectedDoc.id })}>
                                        <CheckCircle className="w-3 h-3 mr-1" /> Aprovar
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300 hover:bg-red-50"
                                        onClick={() => rejeitarRev.mutate({ id: dbRev.id, companyId, documentoId: selectedDoc.id })}>
                                        <XCircle className="w-3 h-3 mr-1" /> Rejeitar
                                      </Button>
                                    </>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                      if (confirm("Apagar esta revisão permanentemente?")) {
                                        deleteRev.mutate({ id: dbRev.id, companyId });
                                      }
                                    }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={`rev-${revNum}`} className="flex items-center p-3 rounded-xl border border-dashed border-gray-200 bg-white">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded">R{revLabel}</span>
                                <span className="text-xs text-gray-400 italic">Sem registro — anterior ao cadastro no sistema</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
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
        <DialogContent resizable={false} className="w-[98vw] max-w-[98vw] h-[95vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
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
