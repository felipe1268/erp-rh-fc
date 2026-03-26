import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
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

type TabType = "painel" | "documentos" | "arts" | "configuracoes";

export default function GestaoDocumentos() {
  const { activeCompanyId } = useCompany();
  const companyId = activeCompanyId || 0;

  const [location, setLocation] = useLocation();
  const urlTab = new URLSearchParams(window.location.search).get("tab") as TabType | null;
  const [activeTab, setActiveTabState] = useState<TabType>(urlTab && ["painel", "documentos", "arts", "configuracoes"].includes(urlTab) ? urlTab : "painel");
  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    const base = window.location.pathname;
    window.history.replaceState(null, "", tab === "painel" ? base : `${base}?tab=${tab}`);
  };
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabType | null;
    if (t && ["painel", "documentos", "arts", "configuracoes"].includes(t)) {
      setActiveTabState(t);
    }
  }, [location]);
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterDisciplina, setFilterDisciplina] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [showDocModal, setShowDocModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showArtModal, setShowArtModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
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

  const obras = trpc.home.obras.useQuery({ companyId }, { enabled: companyId > 0 });
  const disciplinas = trpc.gestaoDocumentos.listDisciplinas.useQuery({ companyId }, { enabled: companyId > 0 });
  const tipos = trpc.gestaoDocumentos.listTiposDocumento.useQuery({ companyId }, { enabled: companyId > 0 });
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
  const createTipo = trpc.gestaoDocumentos.createTipoDocumento.useMutation({
    onSuccess: () => {
      toast.success("Tipo de documento criado");
      utils.gestaoDocumentos.listTiposDocumento.invalidate();
    },
  });

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

  const discMap = new Map((disciplinas.data || []).map(d => [d.id, d]));
  const tipoMap = new Map((tipos.data || []).map(t => [t.id, t]));

  const kpis = dashboard.data || { totalDocumentos: 0, porStatus: {}, totalRevisoes: 0, revisoesPendentes: 0, totalArts: 0, artsVencendo: 0 };

  return (
    <DashboardLayout title="Gestão de Documentos">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Projetos e Documentos</h1>
            <p className="text-sm text-gray-400 mt-1">Controle de documentos técnicos, revisões e ARTs/RRTs</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedObraId ? String(selectedObraId) : "all"}
              onValueChange={(v) => setSelectedObraId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-[250px] bg-[#1E293B] border-gray-700 text-white">
                <SelectValue placeholder="Todas as obras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {(obras.data || []).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList className="bg-[#1E293B] border border-gray-700">
            <TabsTrigger value="painel" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
              <FileBarChart className="w-4 h-4 mr-2" /> Painel
            </TabsTrigger>
            <TabsTrigger value="documentos" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
              <FolderOpen className="w-4 h-4 mr-2" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="arts" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
              <Shield className="w-4 h-4 mr-2" /> ARTs / RRTs
            </TabsTrigger>
            <TabsTrigger value="configuracoes" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
              <Settings className="w-4 h-4 mr-2" /> Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="painel" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard title="Total de Documentos" value={kpis.totalDocumentos} icon={FileText} color="blue" />
              <KpiCard title="Em Elaboração" value={kpis.porStatus?.em_elaboracao || 0} icon={Clock} color="yellow" />
              <KpiCard title="Aprovados" value={kpis.porStatus?.aprovado || 0} icon={CheckCircle} color="green" />
              <KpiCard title="Total de Revisões" value={kpis.totalRevisoes} icon={History} color="purple" />
              <KpiCard title="Revisões Pendentes" value={kpis.revisoesPendentes} icon={AlertTriangle} color="orange" />
              <KpiCard title="ARTs Vencendo" value={kpis.artsVencendo} icon={Shield} color="red" />
            </div>

            {kpis.totalDocumentos === 0 && (
              <div className="mt-8 text-center py-12 bg-[#1E293B] rounded-lg border border-gray-700">
                <FolderOpen className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-300 mb-2">Nenhum documento cadastrado</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {selectedObraId ? "Selecione a aba Documentos para começar a cadastrar." : "Selecione uma obra para ver os documentos."}
                </p>
                {selectedObraId && (
                  <Button onClick={() => { setActiveTab("documentos"); setShowDocModal(true); }} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]">
                    <Plus className="w-4 h-4 mr-2" /> Cadastrar Documento
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documentos" className="mt-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por código ou título..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 w-[280px] bg-[#1E293B] border-gray-700 text-white"
                  />
                </div>
                <Select value={filterDisciplina} onValueChange={setFilterDisciplina}>
                  <SelectTrigger className="w-[160px] bg-[#1E293B] border-gray-700 text-white">
                    <SelectValue placeholder="Disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(disciplinas.data || []).filter(d => d.ativo).map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.sigla} - {d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-[160px] bg-[#1E293B] border-gray-700 text-white">
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
                  <SelectTrigger className="w-[160px] bg-[#1E293B] border-gray-700 text-white">
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
                className="bg-[#D4A843] text-black hover:bg-[#C49A3B]"
                disabled={!selectedObraId}
              >
                <Plus className="w-4 h-4 mr-2" /> Novo Documento
              </Button>
            </div>

            {!selectedObraId ? (
              <div className="text-center py-12 bg-[#1E293B] rounded-lg border border-gray-700">
                <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
                <p className="text-gray-400">Selecione uma obra no filtro acima para visualizar os documentos.</p>
              </div>
            ) : (
              <div className="bg-[#1E293B] rounded-lg border border-gray-700 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400 w-[12%]">Código</TableHead>
                      <TableHead className="text-gray-400 w-[30%]">Título</TableHead>
                      <TableHead className="text-gray-400 w-[12%]">Disciplina</TableHead>
                      <TableHead className="text-gray-400 w-[12%]">Tipo</TableHead>
                      <TableHead className="text-gray-400 w-[8%] text-center">Rev.</TableHead>
                      <TableHead className="text-gray-400 w-[14%]">Status</TableHead>
                      <TableHead className="text-gray-400 w-[12%] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(documentos.data || []).length === 0 ? (
                      <TableRow className="border-gray-700">
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
                          <TableRow key={doc.id} className="border-gray-700 hover:bg-[#243044] cursor-pointer" onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}>
                            <TableCell className="font-mono text-sm text-[#D4A843]">{doc.codigo}</TableCell>
                            <TableCell className="text-white truncate max-w-[300px]" title={doc.titulo}>{doc.titulo}</TableCell>
                            <TableCell>
                              {disc ? (
                                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${disc.cor}20`, color: disc.cor || "#3b82f6" }}>
                                  {disc.sigla}
                                </span>
                              ) : <span className="text-gray-500">-</span>}
                            </TableCell>
                            <TableCell className="text-gray-300 text-sm">{tipo?.sigla || "-"}</TableCell>
                            <TableCell className="text-center text-white font-medium">{doc.revisaoAtual || "0"}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-white">
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
                                  <DropdownMenuItem className="text-red-400" onClick={() => {
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
            )}
          </TabsContent>

          <TabsContent value="arts" className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">ARTs e RRTs</h2>
              <Button
                onClick={() => { resetArtForm(); setEditingArt(null); setShowArtModal(true); }}
                className="bg-[#D4A843] text-black hover:bg-[#C49A3B]"
                disabled={!selectedObraId}
              >
                <Plus className="w-4 h-4 mr-2" /> Nova ART/RRT
              </Button>
            </div>

            {!selectedObraId ? (
              <div className="text-center py-12 bg-[#1E293B] rounded-lg border border-gray-700">
                <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
                <p className="text-gray-400">Selecione uma obra para visualizar as ARTs/RRTs.</p>
              </div>
            ) : (
              <div className="bg-[#1E293B] rounded-lg border border-gray-700 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400">Tipo</TableHead>
                      <TableHead className="text-gray-400">Número</TableHead>
                      <TableHead className="text-gray-400">Profissional</TableHead>
                      <TableHead className="text-gray-400">CREA/CAU</TableHead>
                      <TableHead className="text-gray-400">Emissão</TableHead>
                      <TableHead className="text-gray-400">Validade</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(arts.data || []).length === 0 ? (
                      <TableRow className="border-gray-700">
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
                          <TableRow key={art.id} className="border-gray-700 hover:bg-[#243044]">
                            <TableCell className="text-white font-medium">{art.tipo}</TableCell>
                            <TableCell className="text-[#D4A843] font-mono">{art.numero}</TableCell>
                            <TableCell className="text-gray-300">{art.profissional}</TableCell>
                            <TableCell className="text-gray-400">{art.creaOuCau || "-"}</TableCell>
                            <TableCell className="text-gray-400">{art.dataEmissao ? new Date(art.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                            <TableCell className={isVencendo ? "text-orange-400 font-medium" : "text-gray-400"}>
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
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditArt(art)}>
                                    <Pencil className="w-4 h-4 mr-2" /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-red-400" onClick={() => {
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
            )}
          </TabsContent>

          <TabsContent value="configuracoes" className="mt-4">
            <ConfigSection
              title="Disciplinas"
              items={disciplinas.data || []}
              onAdd={(nome, sigla) => createDisciplina.mutate({ companyId, nome, sigla })}
              fieldLabel1="Nome da Disciplina"
              fieldLabel2="Sigla"
            />
            <div className="mt-6">
              <ConfigSection
                title="Tipos de Documento"
                items={tipos.data || []}
                onAdd={(nome, sigla) => createTipo.mutate({ companyId, nome, sigla })}
                fieldLabel1="Nome do Tipo"
                fieldLabel2="Sigla"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="max-w-2xl bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Código *</Label>
              <Input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="Ex: PRJ-ARQ-001" />
            </div>
            <div>
              <Label className="text-gray-400">Emitente</Label>
              <Input value={docForm.emitente} onChange={(e) => setDocForm({ ...docForm, emitente: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-400">Título *</Label>
              <Input value={docForm.titulo} onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="Ex: Projeto Arquitetônico - Bloco A" />
            </div>
            <div>
              <Label className="text-gray-400">Disciplina</Label>
              <Select value={docForm.disciplinaId || "none"} onValueChange={(v) => setDocForm({ ...docForm, disciplinaId: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-[#0F172A] border-gray-600 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(disciplinas.data || []).filter(d => d.ativo).map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.sigla} - {d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Tipo de Documento</Label>
              <Select value={docForm.tipoDocumentoId || "none"} onValueChange={(v) => setDocForm({ ...docForm, tipoDocumentoId: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-[#0F172A] border-gray-600 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(tipos.data || []).filter(t => t.ativo).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.sigla} - {t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Data de Emissão</Label>
              <Input type="date" value={docForm.dataEmissao} onChange={(e) => setDocForm({ ...docForm, dataEmissao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div>
              <Label className="text-gray-400">Data de Validade</Label>
              <Input type="date" value={docForm.dataValidade} onChange={(e) => setDocForm({ ...docForm, dataValidade: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-400">Descrição</Label>
              <Textarea value={docForm.descricao} onChange={(e) => setDocForm({ ...docForm, descricao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={3} />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-400">Tags (separadas por vírgula)</Label>
              <Input value={docForm.tags} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="projeto, estrutural, bloco-a" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocModal(false)} className="border-gray-600 text-gray-300">Cancelar</Button>
            <Button onClick={handleSaveDoc} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" disabled={createDoc.isPending || updateDoc.isPending}>
              {createDoc.isPending || updateDoc.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRevModal} onOpenChange={setShowRevModal}>
        <DialogContent className="max-w-lg bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Nova Revisão — {selectedDoc?.codigo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-400">Número da Revisão *</Label>
              <Input value={revForm.numero} onChange={(e) => setRevForm({ ...revForm, numero: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="Ex: 1, A, R01" />
            </div>
            <div>
              <Label className="text-gray-400">Descrição da Revisão</Label>
              <Textarea value={revForm.descricao} onChange={(e) => setRevForm({ ...revForm, descricao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={2} />
            </div>
            <div>
              <Label className="text-gray-400">Motivo da Revisão</Label>
              <Textarea value={revForm.motivoRevisao} onChange={(e) => setRevForm({ ...revForm, motivoRevisao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevModal(false)} className="border-gray-600 text-gray-300">Cancelar</Button>
            <Button onClick={handleSaveRev} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" disabled={createRev.isPending}>
              {createRev.isPending ? "Salvando..." : "Criar Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showArtModal} onOpenChange={setShowArtModal}>
        <DialogContent className="max-w-lg bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingArt ? "Editar ART/RRT" : "Nova ART/RRT"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Tipo *</Label>
                <Select value={artForm.tipo} onValueChange={(v) => setArtForm({ ...artForm, tipo: v })}>
                  <SelectTrigger className="bg-[#0F172A] border-gray-600 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ART">ART</SelectItem>
                    <SelectItem value="RRT">RRT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400">Número *</Label>
                <Input value={artForm.numero} onChange={(e) => setArtForm({ ...artForm, numero: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-gray-400">Profissional Responsável *</Label>
              <Input value={artForm.profissional} onChange={(e) => setArtForm({ ...artForm, profissional: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div>
              <Label className="text-gray-400">CREA / CAU</Label>
              <Input value={artForm.creaOuCau} onChange={(e) => setArtForm({ ...artForm, creaOuCau: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Data de Emissão</Label>
                <Input type="date" value={artForm.dataEmissao} onChange={(e) => setArtForm({ ...artForm, dataEmissao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400">Data de Validade</Label>
                <Input type="date" value={artForm.dataValidade} onChange={(e) => setArtForm({ ...artForm, dataValidade: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-gray-400">Observações</Label>
              <Textarea value={artForm.observacoes} onChange={(e) => setArtForm({ ...artForm, observacoes: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArtModal(false)} className="border-gray-600 text-gray-300">Cancelar</Button>
            <Button onClick={handleSaveArt} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" disabled={createArt.isPending || updateArt.isPending}>
              {createArt.isPending || updateArt.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl bg-[#1E293B] border-gray-700 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#D4A843]" />
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
                  <h4 className="text-sm text-gray-400 mb-1">Descrição</h4>
                  <p className="text-gray-300 text-sm">{selectedDoc.descricao}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <History className="w-4 h-4" /> Histórico de Revisões
                  </h4>
                  <Button size="sm" onClick={() => setShowRevModal(true)} className="bg-[#D4A843] text-black hover:bg-[#C49A3B] h-8">
                    <Plus className="w-3 h-3 mr-1" /> Nova Revisão
                  </Button>
                </div>
                {(revisoes.data || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">Nenhuma revisão registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {(revisoes.data || []).map(rev => (
                      <div key={rev.id} className="flex items-center justify-between bg-[#0F172A] p-3 rounded-lg border border-gray-700">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-[#D4A843]">Rev. {rev.numero}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              rev.status === "aprovada" ? "bg-green-100 text-green-800" :
                              rev.status === "rejeitada" ? "bg-red-100 text-red-800" :
                              "bg-yellow-100 text-yellow-800"
                            }`}>
                              {rev.status === "aprovada" ? "Aprovada" : rev.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                            </span>
                          </div>
                          {rev.descricao && <p className="text-xs text-gray-400 mt-1">{rev.descricao}</p>}
                          <p className="text-xs text-gray-500 mt-1">
                            {rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}
                          </p>
                        </div>
                        {rev.status === "pendente" && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-green-400 border-green-700 hover:bg-green-900/30"
                              onClick={() => aprovarRev.mutate({ id: rev.id, companyId, documentoId: selectedDoc.id })}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-red-400 border-red-700 hover:bg-red-900/30"
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

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/10",
    yellow: "border-yellow-500/30 bg-yellow-500/10",
    green: "border-green-500/30 bg-green-500/10",
    purple: "border-purple-500/30 bg-purple-500/10",
    orange: "border-orange-500/30 bg-orange-500/10",
    red: "border-red-500/30 bg-red-500/10",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    green: "text-green-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
    red: "text-red-400",
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${iconColors[color] || iconColors.blue}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{title}</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm text-gray-200">{value || "-"}</div>
    </div>
  );
}

function ConfigSection({ title, items, onAdd, fieldLabel1, fieldLabel2 }: {
  title: string;
  items: any[];
  onAdd: (nome: string, sigla: string) => void;
  fieldLabel1: string;
  fieldLabel2: string;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");

  return (
    <div className="bg-[#1E293B] rounded-lg border border-gray-700 p-4">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <Label className="text-gray-400 text-sm">{fieldLabel1}</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="bg-[#0F172A] border-gray-600 text-white" />
        </div>
        <div className="w-32">
          <Label className="text-gray-400 text-sm">{fieldLabel2}</Label>
          <Input value={sigla} onChange={(e) => setSigla(e.target.value)} className="bg-[#0F172A] border-gray-600 text-white" />
        </div>
        <Button onClick={() => { if (nome && sigla) { onAdd(nome, sigla); setNome(""); setSigla(""); } }} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]">
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between bg-[#0F172A] p-3 rounded border border-gray-700">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-[#D4A843]/20 text-[#D4A843] rounded text-xs font-mono">{item.sigla}</span>
              <span className="text-gray-300">{item.nome}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${item.ativo !== false ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
              {item.ativo !== false ? "Ativo" : "Inativo"}
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">Nenhum registro cadastrado.</p>
        )}
      </div>
    </div>
  );
}
