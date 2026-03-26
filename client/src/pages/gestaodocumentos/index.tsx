import { useState, useEffect } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  FileCheck,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Pencil,
  Trash2,
  FolderOpen,
  FileBarChart,
  Shield,
  Settings,
  ChevronLeft,
  Upload,
  Download,
  MessageSquare,
  History,
  Users,
  Send,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Gauge,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  CircleDot,
  Layers,
  RefreshCw,
  Zap,
  ArrowRight,
  Building2,
  Rocket,
  BookOpen,
  ChevronRight,
  Lightbulb,
  ListChecks,
  CheckSquare,
  Square,
  FolderPlus,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  em_elaboracao: { label: "Em Elaboração", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  em_revisao: { label: "Em Revisão", color: "bg-blue-100 text-blue-800", icon: FileCheck },
  aprovado: { label: "Aprovado", color: "bg-green-100 text-green-800", icon: CheckCircle },
  reprovado: { label: "Reprovado", color: "bg-red-100 text-red-800", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-800", icon: XCircle },
  obsoleto: { label: "Obsoleto", color: "bg-gray-200 text-gray-600", icon: AlertTriangle },
};

const ART_STATUS: Record<string, { label: string; color: string }> = {
  vigente: { label: "Vigente", color: "bg-green-100 text-green-800" },
  vencida: { label: "Vencida", color: "bg-red-100 text-red-800" },
  cancelada: { label: "Cancelada", color: "bg-gray-100 text-gray-800" },
};

type TabType = "dash" | "painel" | "documentos" | "arts" | "configuracoes";

export default function GestaoDocumentos() {
  const { companyId } = useCompany();

  const [location, setLocation] = useLocation();
  const urlTab = new URLSearchParams(window.location.search).get("tab") as TabType | null;
  const [activeTab, setActiveTabState] = useState<TabType>(urlTab && ["dash", "painel", "documentos", "arts", "configuracoes"].includes(urlTab) ? urlTab : "dash");
  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    const base = window.location.pathname;
    window.history.replaceState(null, "", tab === "dash" ? base : `${base}?tab=${tab}`);
  };
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabType | null;
    if (t && ["dash", "painel", "documentos", "arts", "configuracoes"].includes(t)) {
      setActiveTabState(t);
    }
  }, [location]);

  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [activeFicheiroId, setActiveFicheiroId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterDisciplina, setFilterDisciplina] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [showDocModal, setShowDocModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showArtModal, setShowArtModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showDisciplinasModal, setShowDisciplinasModal] = useState(false);
  const [newDiscForm, setNewDiscForm] = useState({ nome: "", sigla: "", cor: "#3B82F6", subpastas: ["DWG", "PDF", "IFC", "DOC"] as string[], newSubpasta: "" });
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [editingArt, setEditingArt] = useState<any>(null);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);


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

  const obrasDisponiveis = trpc.gestaoDocumentos.listObrasDisponiveis.useQuery({ companyId }, { enabled: companyId > 0 });
  const ficheiros = trpc.gestaoDocumentos.listFicheiros.useQuery({ companyId }, { enabled: companyId > 0 });
  const ficheiroDetail = trpc.gestaoDocumentos.getFicheiroDetail.useQuery(
    { id: activeFicheiroId!, companyId },
    { enabled: !!activeFicheiroId && companyId > 0 }
  );
  const disciplinas = trpc.gestaoDocumentos.listDisciplinas.useQuery({ companyId }, { enabled: companyId > 0 });
  const tipos = trpc.gestaoDocumentos.listTiposDocumento.useQuery({ companyId }, { enabled: companyId > 0 });
  const tiposSubpasta = trpc.gestaoDocumentos.listTiposSubpasta.useQuery({ companyId }, { enabled: companyId > 0 });
  const dashboard = trpc.gestaoDocumentos.getDashboard.useQuery(
    { companyId, obraId: selectedObraId || undefined },
    { enabled: companyId > 0 }
  );
  const documentos = trpc.gestaoDocumentos.listDocumentos.useQuery(
    {
      companyId,
      obraId: selectedObraId || undefined,
      disciplinaId: filterDisciplina !== "all" ? Number(filterDisciplina) : undefined,
      tipoDocumentoId: filterTipo !== "all" ? Number(filterTipo) : undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: search || undefined,
    },
    { enabled: companyId > 0 }
  );
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
      toast.success("Ficheiro criado com sucesso!");
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setActiveFicheiroId(data.id);
      setSelectedObraId(data.obraId);
      setActiveTab("painel");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteFicheiro = trpc.gestaoDocumentos.deleteFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Ficheiro removido");
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setActiveFicheiroId(null);
      setSelectedObraId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const createDiscFicheiro = trpc.gestaoDocumentos.createDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Disciplina criada com sucesso!");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setNewDiscForm({ nome: "", sigla: "", cor: "#3B82F6", subpastas: ["DWG", "PDF", "IFC", "DOC"], newSubpasta: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDiscFicheiro = trpc.gestaoDocumentos.deleteDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Disciplina removida");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const seedSubpastas = trpc.gestaoDocumentos.seedTiposSubpastaPadrao.useMutation({
    onSuccess: () => {
      utils.gestaoDocumentos.listTiposSubpasta.invalidate();
    },
  });
  const createTipoSubpasta = trpc.gestaoDocumentos.createTipoSubpasta.useMutation({
    onSuccess: () => {
      toast.success("Tipo de sub-pasta criado");
      utils.gestaoDocumentos.listTiposSubpasta.invalidate();
    },
  });
  const deleteTipoSubpasta = trpc.gestaoDocumentos.deleteTipoSubpasta.useMutation({
    onSuccess: () => {
      toast.success("Tipo de sub-pasta removido");
      utils.gestaoDocumentos.listTiposSubpasta.invalidate();
    },
  });

  const createDoc = trpc.gestaoDocumentos.createDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento criado com sucesso");
      utils.gestaoDocumentos.listDocumentos.invalidate();
      utils.gestaoDocumentos.getDashboard.invalidate();
      setShowDocModal(false);
      resetDocForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateDoc = trpc.gestaoDocumentos.updateDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento atualizado");
      utils.gestaoDocumentos.listDocumentos.invalidate();
      utils.gestaoDocumentos.getDashboard.invalidate();
      setShowDocModal(false);
      setEditingDoc(null);
      resetDocForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDoc = trpc.gestaoDocumentos.deleteDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento removido");
      utils.gestaoDocumentos.listDocumentos.invalidate();
      utils.gestaoDocumentos.getDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createRev = trpc.gestaoDocumentos.createRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão criada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.listDocumentos.invalidate();
      utils.gestaoDocumentos.getDashboard.invalidate();
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
      utils.gestaoDocumentos.getDashboard.invalidate();
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
      utils.gestaoDocumentos.getDashboard.invalidate();
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
      utils.gestaoDocumentos.getDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createDisciplina = trpc.gestaoDocumentos.createDisciplina.useMutation({
    onSuccess: () => {
      toast.success("Disciplina criada");
      utils.gestaoDocumentos.listDisciplinas.invalidate();
    },
  });
  const updateDisciplina = trpc.gestaoDocumentos.updateDisciplina.useMutation({
    onSuccess: () => {
      toast.success("Disciplina atualizada");
      utils.gestaoDocumentos.listDisciplinas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDisciplina = trpc.gestaoDocumentos.deleteDisciplina.useMutation({
    onSuccess: () => {
      toast.success("Disciplina removida");
      utils.gestaoDocumentos.listDisciplinas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createTipo = trpc.gestaoDocumentos.createTipoDocumento.useMutation({
    onSuccess: () => {
      toast.success("Tipo de documento criado");
      utils.gestaoDocumentos.listTiposDocumento.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateTipo = trpc.gestaoDocumentos.updateTipoDocumento.useMutation({
    onSuccess: () => {
      toast.success("Tipo de documento atualizado");
      utils.gestaoDocumentos.listTiposDocumento.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteTipo = trpc.gestaoDocumentos.deleteTipoDocumento.useMutation({
    onSuccess: () => {
      toast.success("Tipo de documento removido");
      utils.gestaoDocumentos.listTiposDocumento.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateTipoSubpasta = trpc.gestaoDocumentos.updateTipoSubpasta.useMutation({
    onSuccess: () => {
      toast.success("Tipo de sub-pasta atualizado");
      utils.gestaoDocumentos.listTiposSubpasta.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const seedDisciplinas = trpc.gestaoDocumentos.seedDisciplinasPadrao.useMutation({
    onSuccess: () => { utils.gestaoDocumentos.listDisciplinas.invalidate(); },
  });
  const seedTiposDocs = trpc.gestaoDocumentos.seedTiposDocumentoPadrao.useMutation({
    onSuccess: () => { utils.gestaoDocumentos.listTiposDocumento.invalidate(); },
  });

  useEffect(() => {
    if (companyId > 0) {
      if (tiposSubpasta.data && tiposSubpasta.data.length === 0) {
        seedSubpastas.mutate({ companyId });
      }
      if (disciplinas.data && disciplinas.data.length === 0) {
        seedDisciplinas.mutate({ companyId });
      }
      if (tipos.data && tipos.data.length === 0) {
        seedTiposDocs.mutate({ companyId });
      }
    }
  }, [companyId, tiposSubpasta.data, disciplinas.data, tipos.data]);

  function resetDocForm() {
    setDocForm({ codigo: "", titulo: "", descricao: "", disciplinaId: "", tipoDocumentoId: "", emitente: "", dataEmissao: "", dataValidade: "", tags: "" });
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
      dataEmissao: doc.dataEmissao || "",
      dataValidade: doc.dataValidade || "",
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
      dataEmissao: art.dataEmissao || "",
      dataValidade: art.dataValidade || "",
      observacoes: art.observacoes || "",
    });
    setShowArtModal(true);
  }

  function handleSaveDoc() {
    if (!selectedObraId) {
      toast.error("Selecione uma obra primeiro");
      return;
    }
    if (!docForm.codigo || !docForm.titulo) {
      toast.error("Código e título são obrigatórios");
      return;
    }
    const payload = {
      companyId,
      obraId: selectedObraId,
      ficheiroId: activeFicheiroId || undefined,
      codigo: docForm.codigo,
      titulo: docForm.titulo,
      descricao: docForm.descricao || undefined,
      disciplinaId: docForm.disciplinaId ? Number(docForm.disciplinaId) : null,
      tipoDocumentoId: docForm.tipoDocumentoId ? Number(docForm.tipoDocumentoId) : null,
      emitente: docForm.emitente || undefined,
      dataEmissao: docForm.dataEmissao || undefined,
      dataValidade: docForm.dataValidade || undefined,
      tags: docForm.tags || undefined,
    };
    if (editingDoc) {
      updateDoc.mutate({ id: editingDoc.id, ...payload });
    } else {
      createDoc.mutate(payload);
    }
  }

  function handleSaveRev() {
    if (!selectedDoc) return;
    if (!revForm.numero) {
      toast.error("Número da revisão é obrigatório");
      return;
    }
    createRev.mutate({
      companyId,
      documentoId: selectedDoc.id,
      numero: revForm.numero,
      descricao: revForm.descricao || undefined,
      motivoRevisao: revForm.motivoRevisao || undefined,
      arquivoUrl: revForm.arquivoUrl || undefined,
      arquivoNome: revForm.arquivoNome || undefined,
    });
  }

  function handleSaveArt() {
    if (!selectedObraId) {
      toast.error("Selecione uma obra primeiro");
      return;
    }
    if (!artForm.numero || !artForm.profissional) {
      toast.error("Número e profissional são obrigatórios");
      return;
    }
    const payload = {
      companyId,
      obraId: selectedObraId,
      tipo: artForm.tipo,
      numero: artForm.numero,
      profissional: artForm.profissional,
      creaOuCau: artForm.creaOuCau || undefined,
      dataEmissao: artForm.dataEmissao || undefined,
      dataValidade: artForm.dataValidade || undefined,
      observacoes: artForm.observacoes || undefined,
    };
    if (editingArt) {
      updateArt.mutate({ id: editingArt.id, ...payload });
    } else {
      createArt.mutate(payload);
    }
  }

  function openDisciplinasModal() {
    setNewDiscForm({ nome: "", sigla: "", cor: "#3B82F6", subpastas: ["DWG", "PDF", "IFC", "DOC"], newSubpasta: "" });
    setShowDisciplinasModal(true);
  }

  function handleAddDiscToFicheiro() {
    if (!activeFicheiroId) return;
    if (!newDiscForm.nome.trim() || !newDiscForm.sigla.trim()) {
      toast.error("Preencha nome e sigla da disciplina");
      return;
    }
    if (newDiscForm.subpastas.length === 0) {
      toast.error("Adicione ao menos uma sub-pasta");
      return;
    }
    const existingDiscs = detail?.disciplinas || [];
    if (existingDiscs.some((d: any) => d.sigla === newDiscForm.sigla.trim().toUpperCase())) {
      toast.error(`Disciplina "${newDiscForm.sigla.trim().toUpperCase()}" já existe neste ficheiro`);
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

  function handleQuickAddDisc(disc: { nome: string; sigla: string; cor: string }) {
    setNewDiscForm({ ...newDiscForm, nome: disc.nome, sigla: disc.sigla, cor: disc.cor });
  }

  function handleOpenFicheiro(fich: any) {
    setActiveFicheiroId(fich.id);
    setSelectedObraId(fich.obraId);
    setActiveTab("painel");
  }

  function handleCreateFicheiro(obraId: number) {
    createFicheiro.mutate({ companyId, obraId });
  }

  const discMap = new Map((disciplinas.data || []).map(d => [d.id, d]));
  const tipoMap = new Map((tipos.data || []).map(t => [t.id, t]));

  const kpis = dashboard.data || { totalDocumentos: 0, porStatus: {}, totalRevisoes: 0, revisoesPendentes: 0, totalArts: 0, artsVencendo: 0 };

  const hasObra = !!selectedObraId;

  const ficheirosMap = new Map((ficheiros.data || []).map(f => [f.obraId, f]));

  const obraArtsCount = (arts.data || []).length;
  const detail = ficheiroDetail.data;

  return (
    <DashboardLayout title="Proj./Doc. Técnicos">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projetos/Documentos Técnicos</h1>
            <p className="text-sm text-gray-500 mt-1">Controle de documentos técnicos, revisões e ARTs/RRTs</p>
          </div>
          {(activeFicheiroId || activeTab === "configuracoes") && (
            <Button variant="outline" onClick={() => { setActiveFicheiroId(null); setSelectedObraId(null); setActiveTab("dash"); }} className="border-gray-300 text-gray-600 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar às Obras
            </Button>
          )}
        </div>

        {activeTab === "configuracoes" && !activeFicheiroId ? (
          <ConfiguracoesStandalone
            disciplinas={disciplinas}
            tipos={tipos}
            tiposSubpasta={tiposSubpasta}
            companyId={companyId}
            createDisciplina={createDisciplina}
            updateDisciplina={updateDisciplina}
            deleteDisciplina={deleteDisciplina}
            createTipo={createTipo}
            updateTipo={updateTipo}
            deleteTipo={deleteTipo}
            createTipoSubpasta={createTipoSubpasta}
            updateTipoSubpasta={updateTipoSubpasta}
            deleteTipoSubpasta={deleteTipoSubpasta}
          />
        ) : !activeFicheiroId ? (
          <ObrasListing
            obras={obrasDisponiveis.data || []}
            ficheirosMap={ficheirosMap}
            ficheiros={ficheiros.data || []}
            onOpenFicheiro={handleOpenFicheiro}
            onCreateFicheiro={handleCreateFicheiro}
            isCreating={createFicheiro.isPending}
          />
        ) : (
          <>
            {detail && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{detail.obra?.nome || "Obra"}</h2>
                      <p className="text-xs text-gray-500">{detail.obra?.codigo} · {detail.obra?.cliente || "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{detail.disciplinas.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase">Disciplinas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{detail.pastas.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase">Pastas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{detail.docs.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase">Documentos</p>
                  </div>
                  <Button size="sm" onClick={openDisciplinasModal} className="bg-blue-600 text-white hover:bg-blue-700">
                    <FolderPlus className="w-4 h-4 mr-1" /> Disciplinas
                  </Button>
                </div>
              </div>
            )}

            {detail && detail.disciplinas.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <FolderPlus className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800">Ficheiro criado! Agora adicione as disciplinas.</p>
                  <p className="text-xs text-blue-600 mt-0.5">Crie as disciplinas (ARQ, EST, HID...) com suas sub-pastas para organizar os documentos desta obra.</p>
                  <Button size="sm" onClick={openDisciplinasModal} className="mt-2 text-xs h-7 bg-blue-600 text-white hover:bg-blue-700">
                    <Plus className="w-3 h-3 mr-1" /> Adicionar Disciplina
                  </Button>
                </div>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
              <TabsList className="bg-white border border-gray-200">
                <TabsTrigger value="dash" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <BarChart3 className="w-4 h-4 mr-2" /> DASH
                </TabsTrigger>
                <TabsTrigger value="painel" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <FileBarChart className="w-4 h-4 mr-2" /> Painel
                </TabsTrigger>
                <TabsTrigger value="documentos" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <FolderOpen className="w-4 h-4 mr-2" /> Documentos
                </TabsTrigger>
                <TabsTrigger value="arts" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Shield className="w-4 h-4 mr-2" /> ARTs / RRTs
                </TabsTrigger>
                <TabsTrigger value="configuracoes" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Settings className="w-4 h-4 mr-2" /> Configurações
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dash" className="mt-4">
                <DashboardExecutivo kpis={kpis} />
              </TabsContent>

              <TabsContent value="painel" className="mt-4">
                {detail && (
                  <>
                    {obraArtsCount === 0 && (
                      <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                        <Shield className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">ART/RRT obrigatória não cadastrada</p>
                          <p className="text-xs text-red-600 mt-0.5">Toda obra de engenharia precisa de pelo menos uma ART ou RRT cadastrada.</p>
                          <Button size="sm" variant="outline" onClick={() => { setActiveTab("arts"); resetArtForm(); setEditingArt(null); setShowArtModal(true); }} className="mt-2 text-xs h-7 border-red-300 text-red-700 hover:bg-red-100">
                            <Plus className="w-3 h-3 mr-1" /> Cadastrar ART/RRT
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <KpiCard title="Total de Documentos" value={kpis.totalDocumentos} icon={FileText} color="blue" />
                      <KpiCard title="Em Elaboração" value={kpis.porStatus?.em_elaboracao || 0} icon={Clock} color="yellow" />
                      <KpiCard title="Aprovados" value={kpis.porStatus?.aprovado || 0} icon={CheckCircle} color="green" />
                      <KpiCard title="Total de Revisões" value={kpis.totalRevisoes} icon={History} color="purple" />
                      <KpiCard title="Revisões Pendentes" value={kpis.revisoesPendentes} icon={AlertTriangle} color="orange" />
                      <KpiCard title="ARTs Vencendo" value={kpis.artsVencendo} icon={Shield} color="red" />
                    </div>

                    {detail.disciplinas.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-indigo-600" /> Estrutura do Ficheiro
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {detail.disciplinas.map((disc: any) => {
                            const discPastas = detail.pastas.filter((p: any) => p.disciplinaId === disc.id);
                            const discDocs = detail.docs.filter((d: any) => d.disciplinaId === disc.id);
                            return (
                              <div key={disc.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: `${disc.cor || "#3b82f6"}20`, color: disc.cor || "#3b82f6" }}>
                                    {disc.sigla}
                                  </span>
                                  <span className="text-sm font-medium text-gray-800">{disc.nome}</span>
                                  <span className="text-[10px] text-gray-400 ml-auto">{discDocs.length} docs</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {discPastas.map((p: any) => (
                                    <span key={p.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">
                                      {p.nome}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <button
                        onClick={() => { setActiveTab("documentos"); resetDocForm(); setEditingDoc(null); setShowDocModal(true); }}
                        className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                      >
                        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors shrink-0">
                          <Plus className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Novo Documento</p>
                          <p className="text-xs text-gray-500">Cadastrar documento técnico</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors" />
                      </button>
                      <button
                        onClick={() => setActiveTab("arts")}
                        className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                      >
                        <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-200 transition-colors shrink-0">
                          <Shield className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Gerenciar ARTs</p>
                          <p className="text-xs text-gray-500">ARTs e RRTs da obra</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-purple-500 transition-colors" />
                      </button>
                      <button
                        onClick={() => setActiveTab("dash")}
                        className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                      >
                        <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors shrink-0">
                          <BarChart3 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Ver Dashboard</p>
                          <p className="text-xs text-gray-500">Indicadores e métricas</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-emerald-500 transition-colors" />
                      </button>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="documentos" className="mt-4">
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Buscar por código ou título..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-10 w-[280px] bg-white border-gray-200 text-gray-900"
                        />
                      </div>
                      <Select value={filterDisciplina} onValueChange={setFilterDisciplina}>
                        <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-900">
                          <SelectValue placeholder="Disciplina" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {(detail?.disciplinas || []).map((d: any) => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.sigla} - {d.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterTipo} onValueChange={setFilterTipo}>
                        <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-900">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {(tipos.data || []).filter(t => t.ativo).map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.sigla} - {t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-900">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Object.entries(STATUS_MAP).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => { resetDocForm(); setEditingDoc(null); setShowDocModal(true); }}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Novo Documento
                    </Button>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200 hover:bg-transparent">
                          <TableHead className="text-gray-500 w-[12%]">Código</TableHead>
                          <TableHead className="text-gray-500 w-[30%]">Título</TableHead>
                          <TableHead className="text-gray-500 w-[12%]">Disciplina</TableHead>
                          <TableHead className="text-gray-500 w-[12%]">Tipo</TableHead>
                          <TableHead className="text-gray-500 w-[8%] text-center">Rev.</TableHead>
                          <TableHead className="text-gray-500 w-[14%]">Status</TableHead>
                          <TableHead className="text-gray-500 w-[12%] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(documentos.data || []).length === 0 ? (
                          <TableRow className="border-gray-200">
                            <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                              Nenhum documento encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (documentos.data || []).map((doc) => {
                            const st = STATUS_MAP[doc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao;
                            const disc = doc.disciplinaId ? discMap.get(doc.disciplinaId) : null;
                            const tipo = doc.tipoDocumentoId ? tipoMap.get(doc.tipoDocumentoId) : null;
                            return (
                              <TableRow key={doc.id} className="border-gray-200 hover:bg-gray-100 cursor-pointer" onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
                                <TableCell className="font-mono text-sm text-blue-600">{doc.codigo}</TableCell>
                                <TableCell className="text-gray-900 truncate max-w-[300px]" title={doc.titulo}>{doc.titulo}</TableCell>
                                <TableCell>
                                  {disc ? (
                                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${disc.cor}20`, color: disc.cor || "#3b82f6" }}>
                                      {disc.sigla}
                                    </span>
                                  ) : <span className="text-gray-500">-</span>}
                                </TableCell>
                                <TableCell className="text-gray-600 text-sm">{tipo?.sigla || "-"}</TableCell>
                                <TableCell className="text-center text-gray-900 font-medium">{doc.revisaoAtual || "0"}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>
                                    {st.label}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
                                        <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEditDoc(doc)}>
                                        <Pencil className="w-4 h-4 mr-2" /> Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => { setSelectedDoc(doc); setShowRevModal(true); }}>
                                        <Upload className="w-4 h-4 mr-2" /> Nova Revisão
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-red-600" onClick={() => {
                                        if (confirm("Deseja realmente remover este documento?")) {
                                          deleteDoc.mutate({ id: doc.id, companyId });
                                        }
                                      }}>
                                        <Trash2 className="w-4 h-4 mr-2" /> Remover
                                      </DropdownMenuItem>
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
                  {(documentos.data || []).length === 0 && (
                    <div className="mt-6 text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <h3 className="text-base font-medium text-gray-600 mb-1">Nenhum documento nesta obra</h3>
                      <p className="text-sm text-gray-500 mb-4">Comece cadastrando o primeiro documento técnico.</p>
                      <Button onClick={() => { resetDocForm(); setEditingDoc(null); setShowDocModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" /> Cadastrar Primeiro Documento
                      </Button>
                    </div>
                  )}
                </>
              </TabsContent>

              <TabsContent value="arts" className="mt-4">
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">ARTs e RRTs</h2>
                    <Button
                      onClick={() => { resetArtForm(); setEditingArt(null); setShowArtModal(true); }}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Nova ART/RRT
                    </Button>
                  </div>
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
                        {(arts.data || []).length === 0 ? (
                          <TableRow className="border-gray-200">
                            <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                              Nenhuma ART/RRT cadastrada.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (arts.data || []).map((art) => {
                            const as2 = ART_STATUS[art.status || "vigente"] || ART_STATUS.vigente;
                            const isVencendo = art.dataValidade && (() => {
                              const diff = (new Date(art.dataValidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                              return diff >= 0 && diff <= 30;
                            })();
                            return (
                              <TableRow key={art.id} className="border-gray-200 hover:bg-gray-100">
                                <TableCell className="text-gray-900 font-medium">{art.tipo}</TableCell>
                                <TableCell className="text-blue-600 font-mono">{art.numero}</TableCell>
                                <TableCell className="text-gray-600">{art.profissional}</TableCell>
                                <TableCell className="text-gray-500">{art.creaOuCau || "-"}</TableCell>
                                <TableCell className="text-gray-500">{art.dataEmissao ? new Date(art.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                                <TableCell className={isVencendo ? "text-orange-600 font-medium" : "text-gray-500"}>
                                  {art.dataValidade ? new Date(art.dataValidade).toLocaleDateString("pt-BR") : "-"}
                                  {isVencendo && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                                </TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${as2.color}`}>
                                    {as2.label}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openEditArt(art)}>
                                        <Pencil className="w-4 h-4 mr-2" /> Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-red-600" onClick={() => {
                                        if (confirm("Remover esta ART/RRT?")) {
                                          deleteArt.mutate({ id: art.id, companyId });
                                        }
                                      }}>
                                        <Trash2 className="w-4 h-4 mr-2" /> Remover
                                      </DropdownMenuItem>
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
                  {(arts.data || []).length === 0 && (
                    <div className="mt-6 text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <Shield className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <h3 className="text-base font-medium text-gray-600 mb-1">Nenhuma ART/RRT cadastrada</h3>
                      <p className="text-sm text-gray-500 mb-4">Cadastre a primeira ART ou RRT para esta obra.</p>
                      <Button onClick={() => { resetArtForm(); setEditingArt(null); setShowArtModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" /> Cadastrar Primeira ART/RRT
                      </Button>
                    </div>
                  )}
                </>
              </TabsContent>

              <TabsContent value="configuracoes" className="mt-4">
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Cadastro rápido pré-configurado</p>
                    <p className="text-xs text-blue-600 mt-0.5">As disciplinas, tipos de documento e sub-pastas mais comuns da construção civil já vêm cadastrados. Você pode adicionar, remover ou personalizar conforme a necessidade da sua empresa.</p>
                  </div>
                </div>
                <ConfigSection
                  title="Disciplinas"
                  subtitle="Disciplinas de engenharia/arquitetura que sua empresa trabalha. Aparecem como opções ao montar o ficheiro de cada obra."
                  items={disciplinas.data || []}
                  onAdd={(nome, sigla) => createDisciplina.mutate({ companyId, nome, sigla })}
                  onUpdate={(id, nome, sigla) => updateDisciplina.mutate({ id, companyId, nome, sigla })}
                  onDelete={(id) => { if (window.confirm("Excluir esta disciplina?")) deleteDisciplina.mutate({ id, companyId }); }}
                  fieldLabel1="Nome da Disciplina"
                  fieldLabel2="Sigla"
                />
                <div className="mt-4">
                  <ConfigSection
                    title="Tipos de Documento"
                    subtitle="Classificações para os documentos técnicos (PE, PB, Memorial, etc.)."
                    items={tipos.data || []}
                    onAdd={(nome, sigla) => createTipo.mutate({ companyId, nome, sigla })}
                    onUpdate={(id, nome, sigla) => updateTipo.mutate({ id, companyId, nome, sigla })}
                    onDelete={(id) => { if (window.confirm("Excluir este tipo de documento?")) deleteTipo.mutate({ id, companyId }); }}
                    fieldLabel1="Nome do Tipo"
                    fieldLabel2="Sigla"
                  />
                </div>
                <div className="mt-4">
                  <SubpastaConfigSection
                    items={tiposSubpasta.data || []}
                    onAdd={(nome) => createTipoSubpasta.mutate({ companyId, nome })}
                    onUpdate={(id, nome) => updateTipoSubpasta.mutate({ id, companyId, nome })}
                    onDelete={(id) => { if (window.confirm("Excluir este tipo de sub-pasta?")) deleteTipoSubpasta.mutate({ id, companyId }); }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={showDisciplinasModal} onOpenChange={setShowDisciplinasModal}>
        <DialogContent className="max-w-lg bg-white border-gray-200 text-gray-900 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-blue-600" />
              Adicionar Disciplina
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1">Atalhos — clique para preencher</Label>
              <div className="flex flex-wrap gap-1.5">
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
                ].filter(d => {
                  const existingDiscs = detail?.disciplinas || [];
                  return !existingDiscs.some((ed: any) => ed.sigla === d.sigla);
                }).map(d => (
                  <button
                    key={d.sigla}
                    type="button"
                    onClick={() => handleQuickAddDisc(d)}
                    className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                    style={{ borderLeftColor: d.cor, borderLeftWidth: 3 }}
                  >
                    {d.sigla}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-500">Nome *</Label>
                <Input
                  value={newDiscForm.nome}
                  onChange={(e) => setNewDiscForm({ ...newDiscForm, nome: e.target.value })}
                  placeholder="Ex: Arquitetura"
                  className="bg-gray-50 border-gray-300 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-500">Sigla *</Label>
                <Input
                  value={newDiscForm.sigla}
                  onChange={(e) => setNewDiscForm({ ...newDiscForm, sigla: e.target.value.toUpperCase() })}
                  placeholder="Ex: ARQ"
                  maxLength={10}
                  className="bg-gray-50 border-gray-300 text-gray-900"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-500">Cor</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={newDiscForm.cor}
                  onChange={(e) => setNewDiscForm({ ...newDiscForm, cor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <span className="text-xs text-gray-400">{newDiscForm.cor}</span>
              </div>
            </div>

            <div>
              <Label className="text-gray-500 mb-1">Sub-pastas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {newDiscForm.subpastas.map((sp) => (
                  <span key={sp} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    {sp}
                    <button
                      type="button"
                      onClick={() => setNewDiscForm({ ...newDiscForm, subpastas: newDiscForm.subpastas.filter(s => s !== sp) })}
                      className="hover:text-red-600"
                    >
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newDiscForm.newSubpasta.trim()) {
                      e.preventDefault();
                      if (!newDiscForm.subpastas.includes(newDiscForm.newSubpasta.trim())) {
                        setNewDiscForm({ ...newDiscForm, subpastas: [...newDiscForm.subpastas, newDiscForm.newSubpasta.trim()], newSubpasta: "" });
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (newDiscForm.newSubpasta.trim() && !newDiscForm.subpastas.includes(newDiscForm.newSubpasta.trim())) {
                      setNewDiscForm({ ...newDiscForm, subpastas: [...newDiscForm.subpastas, newDiscForm.newSubpasta.trim()], newSubpasta: "" });
                    }
                  }}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Label className="text-[10px] text-gray-400 w-full">Atalhos:</Label>
                {["REVIT", "SKP", "XLS", "FOTOS", "BIM", "MEMORIAIS"].filter(s => !newDiscForm.subpastas.includes(s)).map(sp => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setNewDiscForm({ ...newDiscForm, subpastas: [...newDiscForm.subpastas, sp] })}
                    className="px-2 py-0.5 text-[10px] rounded border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  >
                    + {sp}
                  </button>
                ))}
              </div>
            </div>

            {detail && detail.disciplinas.length > 0 && (
              <div>
                <Label className="text-xs text-gray-400 mb-1">Disciplinas neste ficheiro</Label>
                <div className="space-y-1">
                  {detail.disciplinas.map((disc: any) => (
                    <div key={disc.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: disc.cor || "#6B7280" }} />
                        <span className="text-sm font-medium text-gray-900">{disc.sigla}</span>
                        <span className="text-xs text-gray-500">— {disc.nome}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remover a disciplina "${disc.sigla} - ${disc.nome}" deste ficheiro?`)) {
                            deleteDiscFicheiro.mutate({ id: disc.id, companyId });
                          }
                        }}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDisciplinasModal(false)} className="border-gray-300 text-gray-600">Fechar</Button>
            <Button
              onClick={handleAddDiscToFicheiro}
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={createDiscFicheiro.isPending || !newDiscForm.nome.trim() || !newDiscForm.sigla.trim()}
            >
              <Plus className="w-4 h-4 mr-1" />
              {createDiscFicheiro.isPending ? "Criando..." : "Adicionar Disciplina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="max-w-2xl bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-500">Código *</Label>
              <Input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" placeholder="Ex: PRJ-ARQ-001" />
            </div>
            <div>
              <Label className="text-gray-500">Emitente</Label>
              <Input value={docForm.emitente} onChange={(e) => setDocForm({ ...docForm, emitente: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-500">Título *</Label>
              <Input value={docForm.titulo} onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" placeholder="Ex: Projeto Arquitetônico - Bloco A" />
            </div>
            <div>
              <Label className="text-gray-500">Disciplina</Label>
              <Select value={docForm.disciplinaId || "none"} onValueChange={(v) => setDocForm({ ...docForm, disciplinaId: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-gray-50 border-gray-300 text-gray-900"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(detail?.disciplinas || []).map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.sigla} - {d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-500">Tipo de Documento</Label>
              <Select value={docForm.tipoDocumentoId || "none"} onValueChange={(v) => setDocForm({ ...docForm, tipoDocumentoId: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-gray-50 border-gray-300 text-gray-900"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(tipos.data || []).filter(t => t.ativo).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.sigla} - {t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-500">Data de Emissão</Label>
              <Input type="date" value={docForm.dataEmissao} onChange={(e) => setDocForm({ ...docForm, dataEmissao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div>
              <Label className="text-gray-500">Data de Validade</Label>
              <Input type="date" value={docForm.dataValidade} onChange={(e) => setDocForm({ ...docForm, dataValidade: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-500">Descrição</Label>
              <Textarea value={docForm.descricao} onChange={(e) => setDocForm({ ...docForm, descricao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" rows={3} />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-500">Tags (separadas por vírgula)</Label>
              <Input value={docForm.tags} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" placeholder="projeto, estrutural, bloco-a" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocModal(false)} className="border-gray-300 text-gray-600">Cancelar</Button>
            <Button onClick={handleSaveDoc} className="bg-blue-600 text-white hover:bg-blue-700" disabled={createDoc.isPending || updateDoc.isPending}>
              {createDoc.isPending || updateDoc.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label className="text-gray-500">Descrição da Revisão</Label>
              <Textarea value={revForm.descricao} onChange={(e) => setRevForm({ ...revForm, descricao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" rows={2} />
            </div>
            <div>
              <Label className="text-gray-500">Motivo da Revisão</Label>
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
              <Label className="text-gray-500">Profissional Responsável *</Label>
              <Input value={artForm.profissional} onChange={(e) => setArtForm({ ...artForm, profissional: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div>
              <Label className="text-gray-500">CREA / CAU</Label>
              <Input value={artForm.creaOuCau} onChange={(e) => setArtForm({ ...artForm, creaOuCau: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-500">Data de Emissão</Label>
                <Input type="date" value={artForm.dataEmissao} onChange={(e) => setArtForm({ ...artForm, dataEmissao: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900" />
              </div>
              <div>
                <Label className="text-gray-500">Data de Validade</Label>
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

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl bg-white border-gray-200 text-gray-900 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {selectedDoc?.codigo} — {selectedDoc?.titulo}
            </DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCell label="Status" value={
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).color}`}>
                    {(STATUS_MAP[selectedDoc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao).label}
                  </span>
                } />
                <InfoCell label="Revisão Atual" value={selectedDoc.revisaoAtual || "0"} />
                <InfoCell label="Disciplina" value={selectedDoc.disciplinaId ? discMap.get(selectedDoc.disciplinaId)?.nome : "-"} />
                <InfoCell label="Tipo" value={selectedDoc.tipoDocumentoId ? tipoMap.get(selectedDoc.tipoDocumentoId)?.nome : "-"} />
              </div>
              {selectedDoc.descricao && (
                <div>
                  <h4 className="text-sm text-gray-500 mb-1">Descrição</h4>
                  <p className="text-gray-600 text-sm">{selectedDoc.descricao}</p>
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
                          <p className="text-xs text-gray-500 mt-1">
                            {rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}
                          </p>
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
    </DashboardLayout>
  );
}

function ConfiguracoesStandalone({ disciplinas, tipos, tiposSubpasta, companyId, createDisciplina, updateDisciplina, deleteDisciplina, createTipo, updateTipo, deleteTipo, createTipoSubpasta, updateTipoSubpasta, deleteTipoSubpasta }: {
  disciplinas: any;
  tipos: any;
  tiposSubpasta: any;
  companyId: number;
  createDisciplina: any;
  updateDisciplina: any;
  deleteDisciplina: any;
  createTipo: any;
  updateTipo: any;
  deleteTipo: any;
  createTipoSubpasta: any;
  updateTipoSubpasta: any;
  deleteTipoSubpasta: any;
}) {
  return (
    <div className="space-y-4">
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">Cadastro rápido pré-configurado</p>
          <p className="text-xs text-blue-600 mt-0.5">As disciplinas, tipos de documento e sub-pastas mais comuns da construção civil já vêm cadastrados. Você pode adicionar, remover ou personalizar conforme a necessidade da sua empresa.</p>
        </div>
      </div>
      <ConfigSection
        title="Disciplinas"
        subtitle="Disciplinas de engenharia/arquitetura que sua empresa trabalha. Aparecem como opções ao montar o ficheiro de cada obra."
        items={disciplinas.data || []}
        onAdd={(nome, sigla) => createDisciplina.mutate({ companyId, nome, sigla })}
        onUpdate={(id, nome, sigla) => updateDisciplina.mutate({ id, companyId, nome, sigla })}
        onDelete={(id) => { if (window.confirm("Excluir esta disciplina?")) deleteDisciplina.mutate({ id, companyId }); }}
        fieldLabel1="Nome da Disciplina"
        fieldLabel2="Sigla"
      />
      <ConfigSection
        title="Tipos de Documento"
        subtitle="Classificações para os documentos técnicos (PE, PB, Memorial, etc.)."
        items={tipos.data || []}
        onAdd={(nome, sigla) => createTipo.mutate({ companyId, nome, sigla })}
        onUpdate={(id, nome, sigla) => updateTipo.mutate({ id, companyId, nome, sigla })}
        onDelete={(id) => { if (window.confirm("Excluir este tipo de documento?")) deleteTipo.mutate({ id, companyId }); }}
        fieldLabel1="Nome do Tipo"
        fieldLabel2="Sigla"
      />
      <SubpastaConfigSection
        items={tiposSubpasta.data || []}
        onAdd={(nome) => createTipoSubpasta.mutate({ companyId, nome })}
        onUpdate={(id, nome) => updateTipoSubpasta.mutate({ id, companyId, nome })}
        onDelete={(id) => { if (window.confirm("Excluir este tipo de sub-pasta?")) deleteTipoSubpasta.mutate({ id, companyId }); }}
      />
    </div>
  );
}

function ObrasListing({ obras, ficheirosMap, ficheiros, onOpenFicheiro, onCreateFicheiro, isCreating }: {
  obras: any[];
  ficheirosMap: Map<number, any>;
  ficheiros: any[];
  onOpenFicheiro: (fich: any) => void;
  onCreateFicheiro: (obraId: number) => void;
  isCreating: boolean;
}) {
  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2 mb-2">
        <Building2 className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">Obras em Andamento</h2>
        <span className="text-xs text-gray-500 ml-2">({obras.length} obras)</span>
      </div>

      {obras.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Building2 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">Nenhuma obra em andamento</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">Cadastre obras com status "Em andamento" no módulo de Obras para aparecerem aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {obras.map((obra) => {
            const fich = ficheirosMap.get(obra.id);
            const hasFicheiro = !!fich;
            return (
              <div key={obra.id} className={`bg-white rounded-xl border p-4 transition-all hover:shadow-md ${hasFicheiro ? "border-green-200" : "border-gray-200"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${hasFicheiro ? "bg-green-100" : "bg-gray-100"}`}>
                      <Building2 className={`w-5 h-5 ${hasFicheiro ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{obra.nome}</h3>
                      <p className="text-[11px] text-gray-500">{obra.codigo} · {obra.cliente || "—"}</p>
                    </div>
                  </div>
                  {hasFicheiro && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Ficheiro ativo</span>
                  )}
                </div>

                {hasFicheiro ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-gray-900">{fich.totalDisciplinas || 0}</p>
                        <p className="text-[10px] text-gray-500">Disciplinas</p>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-gray-900">{fich.totalDocumentos || 0}</p>
                        <p className="text-[10px] text-gray-500">Documentos</p>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-gray-900">—</p>
                        <p className="text-[10px] text-gray-500">ARTs</p>
                      </div>
                    </div>
                    <Button onClick={() => onOpenFicheiro(fich)} className="w-full bg-blue-600 text-white hover:bg-blue-700" size="sm">
                      <FolderOpen className="w-4 h-4 mr-1" /> Abrir Ficheiro
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => onCreateFicheiro(obra.id)} className="w-full bg-indigo-600 text-white hover:bg-indigo-700" size="sm" disabled={isCreating}>
                    <FolderPlus className="w-4 h-4 mr-1" /> {isCreating ? "Criando..." : "Criar Ficheiro"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubpastaConfigSection({ items, onAdd, onUpdate, onDelete }: {
  items: any[];
  onAdd: (nome: string) => void;
  onUpdate: (id: number, nome: string) => void;
  onDelete: (id: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">Tipos de Sub-pasta</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length} cadastrado(s)</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Tipos de arquivo/pasta que serão criados dentro de cada disciplina (ex: DWG, PDF, IFC, DOC). Adicione quantos precisar.</p>

      {items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase w-20">Tipo</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/40 transition-colors`}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-3 py-1.5" colSpan={2}>
                        <Input value={editNome} onChange={(e) => setEditNome(e.target.value.toUpperCase())} className="h-7 text-xs font-mono bg-white" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" onClick={() => { if (editNome) { onUpdate(editingId, editNome); setEditingId(null); } }} className="h-6 px-2 text-[10px] bg-green-600 text-white hover:bg-green-700">Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 px-2 text-[10px] text-gray-400">Cancelar</Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className="font-mono font-medium text-gray-800">{item.nome}</span>
                      </td>
                      <td className="px-3 py-2">
                        {item.padrao && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase">padrão</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingId(item.id); setEditNome(item.nome); }} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onDelete(item.id)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {items.length === 0 && (
        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-3">
          <p className="text-gray-400 text-sm">Carregando itens pré-configurados...</p>
        </div>
      )}

      {!showAddForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="text-xs border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-300">
          <Plus className="w-3 h-3 mr-1" /> Adicionar novo
        </Button>
      ) : (
        <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex-1">
            <Label className="text-gray-500 text-xs">Nome do Tipo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} className="bg-white border-gray-300 text-gray-900 h-8 text-sm font-mono" placeholder="Ex: REVIT, SKP, XLS, FOTOS" />
          </div>
          <Button size="sm" onClick={() => { if (nome.trim()) { onAdd(nome.trim()); setNome(""); } }} className="bg-blue-600 text-white hover:bg-blue-700 h-8 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNome(""); }} className="h-8 text-xs text-gray-400">
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function DashboardExecutivo({ kpis }: { kpis: any }) {
  const totalDocs = kpis.totalDocumentos || 0;
  const aprovados = kpis.porStatus?.aprovado || 0;
  const emRevisao = kpis.emRevisao || 0;
  const emElaboracao = kpis.emElaboracao || 0;
  const reprovados = kpis.reprovados || 0;
  const pendentes = kpis.revisoesPendentes || 0;
  const taxaAprovacao = kpis.taxaAprovacao || 0;
  const dpi = kpis.dpi || 0;
  const ftr = kpis.ftr ?? 100;
  const tempoMedio = kpis.tempoMedioRevisaoDias || 0;
  const mediaRevs = kpis.mediaRevisoesPorDoc || 0;
  const docsVencidos = kpis.docsVencidos || 0;
  const docsVencendo = kpis.docsVencendoEm30 || 0;
  const artsVencendo = kpis.artsVencendo || 0;
  const artsVencidas = kpis.artsVencidas || 0;
  const totalArts = kpis.totalArts || 0;
  const docsAtivos = kpis.docsAtivos || 0;
  const tendencia = kpis.tendencia7meses || [];
  const porDisciplina = kpis.porDisciplina || [];
  const docsRecentes = kpis.docsRecentes || [];

  const getGaugeColor = (val: number, type: "high" | "low") => {
    if (type === "high") {
      if (val >= 80) return "text-green-600";
      if (val >= 50) return "text-yellow-600";
      return "text-red-600";
    }
    if (val <= 2) return "text-green-600";
    if (val <= 5) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusBg = (val: number, type: "high" | "low") => {
    if (type === "high") {
      if (val >= 80) return "border-green-200 bg-green-50";
      if (val >= 50) return "border-yellow-200 bg-yellow-50";
      return "border-red-200 bg-red-50";
    }
    if (val <= 2) return "border-green-200 bg-green-50";
    if (val <= 5) return "border-yellow-200 bg-yellow-50";
    return "border-red-200 bg-red-50";
  };

  const maxTendencia = Math.max(...tendencia.map((t: any) => Math.max(t.documentos, t.revisoes)), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Dashboard Executivo — Gestão Documental</h2>
      </div>
      <p className="text-xs text-gray-500 -mt-4 ml-7">Indicadores baseados em ISO 19650, PMBOK 7, AACE RP e Last Planner System</p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <GaugeCard title="DPI — Doc. Performance Index" subtitle="% docs ativos aprovados" value={dpi} suffix="%" icon={Target} color={getGaugeColor(dpi, "high")} bg={getStatusBg(dpi, "high")} tooltip="Baseado em ISO 19650: razão entre docs aprovados e docs ativos (exclui cancelados/obsoletos). Meta: ≥ 80%" />
        <GaugeCard title="Taxa de Aprovação" subtitle="Aprovados / Total" value={taxaAprovacao} suffix="%" icon={CheckCircle} color={getGaugeColor(taxaAprovacao, "high")} bg={getStatusBg(taxaAprovacao, "high")} tooltip="PMBOK 7: razão entre docs aprovados vs total geral. Meta: ≥ 75%" />
        <GaugeCard title="FTR — First Time Right" subtitle="Aprovadas na 1ª revisão" value={ftr} suffix="%" icon={Zap} color={getGaugeColor(ftr, "high")} bg={getStatusBg(ftr, "high")} tooltip="Last Planner System: % revisões aprovadas vs (aprovadas + rejeitadas). Meta: ≥ 85%" />
        <GaugeCard title="Tempo Médio Revisão" subtitle="Dias entre envio e aprovação" value={tempoMedio} suffix=" d" icon={Timer} color={getGaugeColor(tempoMedio, "low")} bg={getStatusBg(tempoMedio, "low")} tooltip="AACE RP: Lead time médio do ciclo de revisão. Meta: ≤ 5 dias úteis" />
        <GaugeCard title="Revisões/Doc" subtitle="Média de revisões por doc" value={mediaRevs} suffix="" icon={RefreshCw} color={getGaugeColor(mediaRevs, "low")} bg={getStatusBg(mediaRevs, "low")} tooltip="Indicador de retrabalho. Valores altos indicam deficiência no controle de qualidade. Meta: ≤ 2.0" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" /> Pipeline Documental
          </h3>
          <div className="space-y-3">
            <PipelineBar label="Em Elaboração" value={emElaboracao} total={totalDocs} color="bg-yellow-500" />
            <PipelineBar label="Em Revisão" value={emRevisao} total={totalDocs} color="bg-blue-500" />
            <PipelineBar label="Aprovados" value={aprovados} total={totalDocs} color="bg-green-500" />
            <PipelineBar label="Reprovados" value={reprovados} total={totalDocs} color="bg-red-500" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Total Ativos</span>
            <span className="text-sm font-bold text-gray-900">{docsAtivos}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" /> Alertas Críticos
          </h3>
          <div className="space-y-2">
            <AlertRow icon={FileText} label="Docs vencidos" value={docsVencidos} severity={docsVencidos > 0 ? "critical" : "ok"} />
            <AlertRow icon={Clock} label="Docs vencendo em 30 dias" value={docsVencendo} severity={docsVencendo > 0 ? "warning" : "ok"} />
            <AlertRow icon={AlertTriangle} label="Revisões pendentes" value={pendentes} severity={pendentes > 3 ? "critical" : pendentes > 0 ? "warning" : "ok"} />
            <AlertRow icon={Shield} label="ARTs vencendo (30 dias)" value={artsVencendo} severity={artsVencendo > 0 ? "warning" : "ok"} />
            <AlertRow icon={Shield} label="ARTs vencidas" value={artsVencidas} severity={artsVencidas > 0 ? "critical" : "ok"} />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Total ARTs</span>
            <span className="text-sm font-bold text-gray-900">{totalArts}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" /> Por Disciplina
          </h3>
          {porDisciplina.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Nenhuma disciplina cadastrada.</p>
          ) : (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {porDisciplina.map((d: any) => {
                const pct = d.total > 0 ? Math.round((d.aprovados / d.total) * 100) : 0;
                return (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="w-8 text-center text-[10px] font-bold rounded py-0.5 shrink-0" style={{ backgroundColor: `${d.cor}25`, color: d.cor }}>
                      {d.sigla}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-500 truncate">{d.nome}</span>
                        <span className="text-[10px] text-gray-500 ml-1 shrink-0">{d.aprovados}/{d.total}</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: d.cor }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-600" /> Tendência — Últimos 7 Meses
          </h3>
          {tendencia.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Sem dados.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-[160px]">
              {tendencia.map((m: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="flex gap-0.5 items-end flex-1 w-full justify-center">
                    <div className="w-3 bg-blue-500 rounded-t transition-all" style={{ height: `${Math.max((m.documentos / maxTendencia) * 120, 3)}px` }} title={`${m.documentos} docs`} />
                    <div className="w-3 bg-purple-500 rounded-t transition-all" style={{ height: `${Math.max((m.revisoes / maxTendencia) * 120, 3)}px` }} title={`${m.revisoes} revs`} />
                  </div>
                  <span className="text-[9px] text-gray-500 leading-none">{m.mesLabel}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-blue-500" />
              <span className="text-[10px] text-gray-500">Documentos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-purple-500" />
              <span className="text-[10px] text-gray-500">Revisões</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> Últimos Documentos
          </h3>
          {docsRecentes.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Nenhum documento cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {docsRecentes.map((doc: any) => {
                const st = doc.status || "em_elaboracao";
                const stInfo: Record<string, { bg: string; text: string; label: string }> = {
                  em_elaboracao: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Elaboração" },
                  em_revisao: { bg: "bg-blue-100", text: "text-blue-700", label: "Revisão" },
                  aprovado: { bg: "bg-green-100", text: "text-green-700", label: "Aprovado" },
                  reprovado: { bg: "bg-red-100", text: "text-red-700", label: "Reprovado" },
                  cancelado: { bg: "bg-gray-500/15", text: "text-gray-500", label: "Cancelado" },
                  obsoleto: { bg: "bg-gray-600/15", text: "text-gray-500", label: "Obsoleto" },
                };
                const s = stInfo[st] || stInfo.em_elaboracao;
                return (
                  <div key={doc.id} className="flex items-center justify-between p-2.5 rounded bg-gray-50 border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-blue-600">{doc.codigo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{doc.titulo}</p>
                    </div>
                    <span className="text-[10px] text-gray-600 shrink-0 ml-2">
                      {doc.criadoEm ? new Date(doc.criadoEm).toLocaleDateString("pt-BR") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
        <p className="text-[10px] text-gray-600 leading-relaxed">
          <strong className="text-gray-500">Referências:</strong> ISO 19650 (Information Management using BIM) · PMBOK 7th Ed. (Project Management Institute) · AACE International Recommended Practices · Last Planner System (Lean Construction Institute) · PRINCE2 Configuration Management · CII Best Practices for Document Control in Capital Projects
        </p>
      </div>
    </div>
  );
}

function GaugeCard({ title, subtitle, value, suffix, icon: Icon, color, bg, tooltip }: {
  title: string; subtitle: string; value: number; suffix: string; icon: any; color: string; bg: string; tooltip: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${bg} group relative`}>
      <div className="flex items-center justify-between mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <Gauge className="w-3 h-3 text-gray-600" />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}{suffix}</p>
      <p className="text-[11px] font-medium text-gray-900 mt-0.5 leading-tight">{title}</p>
      <p className="text-[10px] text-gray-500 leading-tight">{subtitle}</p>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
        <p className="text-[10px] text-gray-600 leading-relaxed">{tooltip}</p>
      </div>
    </div>
  );
}

function PipelineBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-medium text-gray-900">{value} <span className="text-gray-600">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AlertRow({ icon: Icon, label, value, severity }: { icon: any; label: string; value: number; severity: "ok" | "warning" | "critical" }) {
  const colors = {
    ok: "text-green-700 bg-green-100",
    warning: "text-yellow-700 bg-yellow-100",
    critical: "text-red-700 bg-red-100",
  };
  const iconColor = {
    ok: "text-green-500",
    warning: "text-yellow-500",
    critical: "text-red-500",
  };
  return (
    <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${iconColor[severity]}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${colors[severity]}`}>{value}</span>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50",
    yellow: "border-yellow-200 bg-yellow-50",
    green: "border-green-200 bg-green-50",
    purple: "border-purple-200 bg-purple-50",
    orange: "border-orange-200 bg-orange-50",
    red: "border-red-200 bg-red-50",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-600",
    yellow: "text-yellow-600",
    green: "text-green-600",
    purple: "text-purple-600",
    orange: "text-orange-600",
    red: "text-red-600",
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${iconColors[color] || iconColors.blue}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{title}</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm text-gray-700">{value || "-"}</div>
    </div>
  );
}

function ConfigSection({ title, subtitle, items, onAdd, onUpdate, onDelete, fieldLabel1, fieldLabel2 }: {
  title: string;
  subtitle?: string;
  items: any[];
  onAdd: (nome: string, sigla: string) => void;
  onUpdate: (id: number, nome: string, sigla: string) => void;
  onDelete: (id: number) => void;
  fieldLabel1: string;
  fieldLabel2: string;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editSigla, setEditSigla] = useState("");

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditNome(item.nome);
    setEditSigla(item.sigla);
  };

  const saveEdit = () => {
    if (editingId && editNome && editSigla) {
      onUpdate(editingId, editNome, editSigla);
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNome("");
    setEditSigla("");
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length} cadastrado(s)</span>
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
                <tr key={item.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/40 transition-colors`}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-3 py-1.5">
                        <Input value={editSigla} onChange={(e) => setEditSigla(e.target.value.toUpperCase())} className="h-7 text-xs font-mono w-20 bg-white" maxLength={10} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-7 text-xs bg-white" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" onClick={saveEdit} className="h-6 px-2 text-[10px] bg-green-600 text-white hover:bg-green-700">Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-6 px-2 text-[10px] text-gray-400">Cancelar</Button>
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
                          <button onClick={() => startEdit(item)} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onDelete(item.id)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {items.length === 0 && (
        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-3">
          <p className="text-gray-400 text-sm">Carregando itens pré-configurados...</p>
        </div>
      )}

      {!showAddForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="text-xs border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-300">
          <Plus className="w-3 h-3 mr-1" /> Adicionar novo
        </Button>
      ) : (
        <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex-1">
            <Label className="text-gray-500 text-xs">{fieldLabel1}</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="bg-white border-gray-300 text-gray-900 h-8 text-sm" placeholder={`Nome do item...`} />
          </div>
          <div className="w-28">
            <Label className="text-gray-500 text-xs">{fieldLabel2}</Label>
            <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} className="bg-white border-gray-300 text-gray-900 h-8 text-sm font-mono" maxLength={10} />
          </div>
          <Button size="sm" onClick={() => { if (nome && sigla) { onAdd(nome, sigla); setNome(""); setSigla(""); } }} className="bg-blue-600 text-white hover:bg-blue-700 h-8 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNome(""); setSigla(""); }} className="h-8 text-xs text-gray-400">
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
