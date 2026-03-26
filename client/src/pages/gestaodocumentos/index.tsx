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
  History,
  Building2,
  Folder,
  FolderPlus,
  ArrowLeft,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  em_elaboracao: { label: "Em Elaboração", color: "bg-yellow-500/20 text-yellow-400", icon: Clock },
  em_revisao: { label: "Em Revisão", color: "bg-blue-500/20 text-blue-400", icon: FileCheck },
  aprovado: { label: "Aprovado", color: "bg-green-500/20 text-green-400", icon: CheckCircle },
  reprovado: { label: "Reprovado", color: "bg-red-500/20 text-red-400", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-gray-500/20 text-gray-400", icon: XCircle },
  obsoleto: { label: "Obsoleto", color: "bg-gray-600/30 text-gray-500", icon: AlertTriangle },
};

const ART_STATUS: Record<string, { label: string; color: string }> = {
  vigente: { label: "Vigente", color: "bg-green-500/20 text-green-400" },
  vencida: { label: "Vencida", color: "bg-red-500/20 text-red-400" },
  cancelada: { label: "Cancelada", color: "bg-gray-500/20 text-gray-400" },
};

const PASTA_ICONS: Record<string, string> = {
  DWG: "text-orange-400",
  PDF: "text-red-400",
  IFC: "text-blue-400",
  DOC: "text-green-400",
};

export default function GestaoDocumentos() {
  const { activeCompanyId } = useCompany();
  const companyId = activeCompanyId || 0;
  const [location, setLocation] = useLocation();

  const urlTab = new URLSearchParams(window.location.search).get("tab") as string | null;
  const [activeTab, setActiveTabState] = useState<string>(urlTab || "ficheiros");
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const base = window.location.pathname;
    window.history.replaceState(null, "", tab === "ficheiros" ? base : `${base}?tab=${tab}`);
  };
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setActiveTabState(t);
  }, [location]);

  const [selectedFicheiroId, setSelectedFicheiroId] = useState<number | null>(null);
  const [selectedDisciplinaId, setSelectedDisciplinaId] = useState<number | null>(null);
  const [selectedPastaId, setSelectedPastaId] = useState<number | null>(null);
  const [selectedPastaNome, setSelectedPastaNome] = useState<string>("");

  const [showCreateFicheiro, setShowCreateFicheiro] = useState(false);
  const [showCreateDisciplina, setShowCreateDisciplina] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showArtModal, setShowArtModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [editingArt, setEditingArt] = useState<any>(null);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const [discForm, setDiscForm] = useState({ nome: "", sigla: "", cor: "#3b82f6" });
  const [docForm, setDocForm] = useState({
    codigo: "", titulo: "", descricao: "", emitente: "",
    dataEmissao: "", dataValidade: "", tags: "",
  });
  const [revForm, setRevForm] = useState({ numero: "", descricao: "", motivoRevisao: "" });
  const [artForm, setArtForm] = useState({
    tipo: "ART", numero: "", profissional: "", creaOuCau: "",
    dataEmissao: "", dataValidade: "", observacoes: "",
  });

  const obrasDisponiveis = trpc.gestaoDocumentos.listObrasDisponiveis.useQuery(
    { companyId }, { enabled: companyId > 0 }
  );
  const ficheiros = trpc.gestaoDocumentos.listFicheiros.useQuery(
    { companyId }, { enabled: companyId > 0 }
  );
  const ficheiroDetail = trpc.gestaoDocumentos.getFicheiroDetail.useQuery(
    { id: selectedFicheiroId!, companyId },
    { enabled: !!selectedFicheiroId && companyId > 0 }
  );
  const arts = trpc.gestaoDocumentos.listArts.useQuery(
    { companyId, obraId: ficheiroDetail.data?.ficheiro?.obraId },
    { enabled: !!ficheiroDetail.data?.ficheiro?.obraId }
  );
  const revisoes = trpc.gestaoDocumentos.listRevisoes.useQuery(
    { companyId, documentoId: selectedDoc?.id || 0 },
    { enabled: !!selectedDoc }
  );

  const utils = trpc.useUtils();

  const createFicheiro = trpc.gestaoDocumentos.createFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Ficheiro de obra criado");
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setShowCreateFicheiro(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createDisciplinaMut = trpc.gestaoDocumentos.createDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Disciplina criada com pastas padrão (DWG, PDF, IFC, DOC)");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      utils.gestaoDocumentos.listFicheiros.invalidate();
      setShowCreateDisciplina(false);
      setDiscForm({ nome: "", sigla: "", cor: "#3b82f6" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteDisciplinaMut = trpc.gestaoDocumentos.deleteDisciplinaFicheiro.useMutation({
    onSuccess: () => {
      toast.success("Disciplina removida");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createDoc = trpc.gestaoDocumentos.createDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento criado");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      setShowDocModal(false);
      setDocForm({ codigo: "", titulo: "", descricao: "", emitente: "", dataEmissao: "", dataValidade: "", tags: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const updateDoc = trpc.gestaoDocumentos.updateDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento atualizado");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      setShowDocModal(false);
      setEditingDoc(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDoc = trpc.gestaoDocumentos.deleteDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento removido");
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createRev = trpc.gestaoDocumentos.createRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão criada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
      setShowRevModal(false);
      setRevForm({ numero: "", descricao: "", motivoRevisao: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarRev = trpc.gestaoDocumentos.aprovarRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão aprovada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejeitarRev = trpc.gestaoDocumentos.rejeitarRevisao.useMutation({
    onSuccess: () => {
      toast.success("Revisão rejeitada");
      utils.gestaoDocumentos.listRevisoes.invalidate();
      utils.gestaoDocumentos.getFicheiroDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const createArt = trpc.gestaoDocumentos.createArt.useMutation({
    onSuccess: () => {
      toast.success("ART/RRT cadastrada");
      utils.gestaoDocumentos.listArts.invalidate();
      setShowArtModal(false);
      setArtForm({ tipo: "ART", numero: "", profissional: "", creaOuCau: "", dataEmissao: "", dataValidade: "", observacoes: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const updateArt = trpc.gestaoDocumentos.updateArt.useMutation({
    onSuccess: () => {
      toast.success("ART/RRT atualizada");
      utils.gestaoDocumentos.listArts.invalidate();
      setShowArtModal(false);
      setEditingArt(null);
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

  const [selectedObraId, setSelectedObraId] = useState<string>("");
  const obrasJaCadastradas = new Set((ficheiros.data || []).map((f: any) => f.obraId));
  const obrasParaCadastrar = (obrasDisponiveis.data || []).filter((o: any) => !obrasJaCadastradas.has(o.id));

  function handleSaveDoc() {
    if (!docForm.codigo || !docForm.titulo || !selectedFicheiroId) return;
    const detail = ficheiroDetail.data;
    if (!detail) return;
    const payload: any = {
      companyId,
      obraId: detail.ficheiro.obraId,
      ficheiroId: selectedFicheiroId,
      disciplinaId: selectedDisciplinaId || undefined,
      pastaId: selectedPastaId || undefined,
      codigo: docForm.codigo,
      titulo: docForm.titulo,
      descricao: docForm.descricao || undefined,
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
    if (!revForm.numero || !selectedDoc) return;
    createRev.mutate({
      companyId,
      documentoId: selectedDoc.id,
      numero: revForm.numero,
      descricao: revForm.descricao || undefined,
      motivoRevisao: revForm.motivoRevisao || undefined,
    });
  }

  function handleSaveArt() {
    if (!artForm.numero || !artForm.profissional) return;
    const detail = ficheiroDetail.data;
    if (!detail) return;
    const payload: any = {
      companyId,
      obraId: detail.ficheiro.obraId,
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

  function openEditDoc(doc: any) {
    setEditingDoc(doc);
    setDocForm({
      codigo: doc.codigo || "",
      titulo: doc.titulo || "",
      descricao: doc.descricao || "",
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

  const detail = ficheiroDetail.data;
  const docsInCurrentFolder = selectedPastaId && detail
    ? detail.docs.filter((d: any) => d.pastaId === selectedPastaId)
    : [];

  return (
    <DashboardLayout title="Proj./Doc. Técnicos">
      <div className="space-y-6">
        {!selectedFicheiroId ? (
          <FicheirosListView
            ficheiros={ficheiros.data || []}
            isLoading={ficheiros.isLoading}
            onSelect={(id) => { setSelectedFicheiroId(id); setSelectedDisciplinaId(null); setSelectedPastaId(null); }}
            onCreateNew={() => setShowCreateFicheiro(true)}
          />
        ) : !detail ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : (
          <FicheiroDetailView
            detail={detail}
            selectedDisciplinaId={selectedDisciplinaId}
            selectedPastaId={selectedPastaId}
            selectedPastaNome={selectedPastaNome}
            docsInCurrentFolder={docsInCurrentFolder}
            arts={arts.data || []}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onBack={() => { setSelectedFicheiroId(null); setSelectedDisciplinaId(null); setSelectedPastaId(null); setActiveTab("ficheiros"); }}
            onSelectDisciplina={(id) => { setSelectedDisciplinaId(id); setSelectedPastaId(null); }}
            onSelectPasta={(id, nome) => { setSelectedPastaId(id); setSelectedPastaNome(nome); }}
            onBackToDisciplinas={() => { setSelectedDisciplinaId(null); setSelectedPastaId(null); }}
            onBackToPastas={() => setSelectedPastaId(null)}
            onCreateDisciplina={() => setShowCreateDisciplina(true)}
            onDeleteDisciplina={(id) => {
              if (confirm("Remover esta disciplina e suas pastas?")) {
                deleteDisciplinaMut.mutate({ id, companyId });
              }
            }}
            onCreateDoc={() => { setEditingDoc(null); setDocForm({ codigo: "", titulo: "", descricao: "", emitente: "", dataEmissao: "", dataValidade: "", tags: "" }); setShowDocModal(true); }}
            onEditDoc={openEditDoc}
            onDeleteDoc={(id) => { if (confirm("Remover este documento?")) deleteDoc.mutate({ id, companyId }); }}
            onViewDoc={(doc) => { setSelectedDoc(doc); setShowDetailModal(true); }}
            onCreateArt={() => { setEditingArt(null); setArtForm({ tipo: "ART", numero: "", profissional: "", creaOuCau: "", dataEmissao: "", dataValidade: "", observacoes: "" }); setShowArtModal(true); }}
            onEditArt={openEditArt}
            onDeleteArt={(id) => { if (confirm("Remover esta ART/RRT?")) deleteArt.mutate({ id, companyId }); }}
          />
        )}
      </div>

      {/* Create Ficheiro Dialog */}
      <Dialog open={showCreateFicheiro} onOpenChange={setShowCreateFicheiro}>
        <DialogContent className="max-w-md bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#D4A843]" />
              Criar Ficheiro de Obra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-400">Selecione a Obra (Em Andamento)</Label>
              <Select value={selectedObraId} onValueChange={setSelectedObraId}>
                <SelectTrigger className="bg-[#0F172A] border-gray-600 text-white mt-1">
                  <SelectValue placeholder="Selecione uma obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obrasParaCadastrar.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhuma obra disponível</SelectItem>
                  ) : (
                    obrasParaCadastrar.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.codigo ? `${o.codigo} - ` : ""}{o.nome}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {obrasParaCadastrar.length === 0 && (
                <p className="text-xs text-gray-500 mt-2">Todas as obras em andamento já possuem ficheiro.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFicheiro(false)} className="border-gray-600 text-gray-300">Cancelar</Button>
            <Button
              onClick={() => { if (selectedObraId) createFicheiro.mutate({ companyId, obraId: Number(selectedObraId) }); }}
              className="bg-[#D4A843] text-black hover:bg-[#C49A3B]"
              disabled={!selectedObraId || createFicheiro.isPending}
            >
              {createFicheiro.isPending ? "Criando..." : "Criar Ficheiro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Disciplina Dialog */}
      <Dialog open={showCreateDisciplina} onOpenChange={setShowCreateDisciplina}>
        <DialogContent className="max-w-md bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#D4A843]" />
              Nova Disciplina
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-400">Nome da Disciplina *</Label>
              <Input
                value={discForm.nome}
                onChange={(e) => setDiscForm({ ...discForm, nome: e.target.value })}
                className="bg-[#0F172A] border-gray-600 text-white mt-1"
                placeholder="Ex: Estrutural, Elétrica, Hidráulica..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Sigla *</Label>
                <Input
                  value={discForm.sigla}
                  onChange={(e) => setDiscForm({ ...discForm, sigla: e.target.value.toUpperCase() })}
                  className="bg-[#0F172A] border-gray-600 text-white mt-1"
                  placeholder="Ex: EST, ELE, HID"
                  maxLength={10}
                />
              </div>
              <div>
                <Label className="text-gray-400">Cor</Label>
                <Input
                  type="color"
                  value={discForm.cor}
                  onChange={(e) => setDiscForm({ ...discForm, cor: e.target.value })}
                  className="bg-[#0F172A] border-gray-600 text-white mt-1 h-9"
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-700 bg-[#0F172A] p-3">
              <p className="text-xs text-gray-400 mb-2">Ao criar a disciplina, as seguintes pastas serão criadas automaticamente:</p>
              <div className="flex items-center gap-3">
                {["DWG", "PDF", "IFC", "DOC"].map(p => (
                  <div key={p} className="flex items-center gap-1.5">
                    <Folder className={`w-4 h-4 ${PASTA_ICONS[p]}`} />
                    <span className="text-sm text-white font-medium">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDisciplina(false)} className="border-gray-600 text-gray-300">Cancelar</Button>
            <Button
              onClick={() => {
                if (discForm.nome && discForm.sigla && selectedFicheiroId) {
                  createDisciplinaMut.mutate({
                    companyId,
                    ficheiroId: selectedFicheiroId,
                    nome: discForm.nome,
                    sigla: discForm.sigla,
                    cor: discForm.cor,
                  });
                }
              }}
              className="bg-[#D4A843] text-black hover:bg-[#C49A3B]"
              disabled={!discForm.nome || !discForm.sigla || createDisciplinaMut.isPending}
            >
              {createDisciplinaMut.isPending ? "Criando..." : "Criar Disciplina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Dialog */}
      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="max-w-2xl bg-[#1E293B] border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Código *</Label>
              <Input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="Ex: PRJ-EST-001" />
            </div>
            <div>
              <Label className="text-gray-400">Emitente</Label>
              <Input value={docForm.emitente} onChange={(e) => setDocForm({ ...docForm, emitente: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-400">Título *</Label>
              <Input value={docForm.titulo} onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="Ex: Projeto Estrutural - Bloco A" />
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
              <Textarea value={docForm.descricao} onChange={(e) => setDocForm({ ...docForm, descricao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={2} />
            </div>
            <div className="col-span-2">
              <Label className="text-gray-400">Tags</Label>
              <Input value={docForm.tags} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" placeholder="projeto, estrutural" />
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

      {/* Revision Dialog */}
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
              <Label className="text-gray-400">Descrição</Label>
              <Textarea value={revForm.descricao} onChange={(e) => setRevForm({ ...revForm, descricao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" rows={2} />
            </div>
            <div>
              <Label className="text-gray-400">Motivo</Label>
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

      {/* ART Dialog */}
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
              <Label className="text-gray-400">Profissional *</Label>
              <Input value={artForm.profissional} onChange={(e) => setArtForm({ ...artForm, profissional: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div>
              <Label className="text-gray-400">CREA / CAU</Label>
              <Input value={artForm.creaOuCau} onChange={(e) => setArtForm({ ...artForm, creaOuCau: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Emissão</Label>
                <Input type="date" value={artForm.dataEmissao} onChange={(e) => setArtForm({ ...artForm, dataEmissao: e.target.value })} className="bg-[#0F172A] border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400">Validade</Label>
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

      {/* Doc Detail Dialog */}
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
                <InfoCell label="Emitente" value={selectedDoc.emitente || "-"} />
                <InfoCell label="Emissão" value={selectedDoc.dataEmissao ? new Date(selectedDoc.dataEmissao).toLocaleDateString("pt-BR") : "-"} />
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
                    {(revisoes.data || []).map((rev: any) => (
                      <div key={rev.id} className="flex items-center justify-between bg-[#0F172A] p-3 rounded-lg border border-gray-700">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-[#D4A843]">Rev. {rev.numero}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              rev.status === "aprovada" ? "bg-green-500/20 text-green-400" :
                              rev.status === "rejeitada" ? "bg-red-500/20 text-red-400" :
                              "bg-yellow-500/20 text-yellow-400"
                            }`}>
                              {rev.status === "aprovada" ? "Aprovada" : rev.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                            </span>
                          </div>
                          {rev.descricao && <p className="text-xs text-gray-400 mt-1">{rev.descricao}</p>}
                          <p className="text-xs text-gray-500 mt-1">{rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}</p>
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

function FicheirosListView({ ficheiros, isLoading, onSelect, onCreateNew }: {
  ficheiros: any[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  onCreateNew: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Proj./Doc. Técnicos</h1>
          <p className="text-sm text-gray-400 mt-1">Ficheiros de obra — Disciplinas — Documentos — ARTs/RRTs</p>
        </div>
        <Button onClick={onCreateNew} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]">
          <Plus className="w-4 h-4 mr-2" /> Novo Ficheiro de Obra
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando ficheiros...
        </div>
      ) : ficheiros.length === 0 ? (
        <div className="text-center py-16 bg-[#1E293B] rounded-lg border border-gray-700">
          <FolderOpen className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">Nenhum ficheiro de obra criado</h3>
          <p className="text-sm text-gray-500 mb-4">Crie um ficheiro vinculado a uma obra em andamento para iniciar.</p>
          <Button onClick={onCreateNew} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]">
            <Plus className="w-4 h-4 mr-2" /> Criar Primeiro Ficheiro
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ficheiros.map((f: any) => (
            <div
              key={f.id}
              className="bg-[#1E293B] rounded-lg border border-gray-700 hover:border-[#D4A843]/40 transition-all cursor-pointer group"
              onClick={() => onSelect(f.id)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-[#D4A843]/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-[#D4A843]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm leading-tight">
                        {f.obra?.nome || "Obra não encontrada"}
                      </h3>
                      {f.obra?.codigo && (
                        <p className="text-xs text-gray-500">{f.obra.codigo}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-[#D4A843] transition-colors shrink-0" />
                </div>

                {f.obra?.cliente && (
                  <p className="text-xs text-gray-400 mb-2">{f.obra.cliente}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3.5 h-3.5" />
                    {f.totalDisciplinas} disciplina{f.totalDisciplinas !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {f.totalDocumentos} documento{f.totalDocumentos !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-700 px-4 py-2">
                <span className="text-[10px] text-gray-600">
                  Criado em {f.criadoEm ? new Date(f.criadoEm).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FicheiroDetailView({
  detail, selectedDisciplinaId, selectedPastaId, selectedPastaNome,
  docsInCurrentFolder, arts, activeTab, setActiveTab,
  onBack, onSelectDisciplina, onSelectPasta, onBackToDisciplinas, onBackToPastas,
  onCreateDisciplina, onDeleteDisciplina,
  onCreateDoc, onEditDoc, onDeleteDoc, onViewDoc,
  onCreateArt, onEditArt, onDeleteArt,
}: any) {
  const { obra, disciplinas, pastas, docs } = detail;
  const selectedDisc = disciplinas.find((d: any) => d.id === selectedDisciplinaId);
  const discPastas = pastas.filter((p: any) => p.disciplinaId === selectedDisciplinaId);

  const breadcrumb = [];
  breadcrumb.push({ label: obra?.nome || "Obra", onClick: onBackToDisciplinas });
  if (selectedDisc) {
    breadcrumb.push({ label: `${selectedDisc.sigla} - ${selectedDisc.nome}`, onClick: onBackToPastas });
  }
  if (selectedPastaId) {
    breadcrumb.push({ label: selectedPastaNome, onClick: null });
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="border-gray-600 text-gray-300 hover:bg-gray-700">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600" />}
                  {b.onClick ? (
                    <button onClick={b.onClick} className="hover:text-[#D4A843] transition-colors">{b.label}</button>
                  ) : (
                    <span className="text-white font-medium">{b.label}</span>
                  )}
                </span>
              ))}
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {selectedPastaId ? `Pasta ${selectedPastaNome}` : selectedDisc ? `${selectedDisc.sigla} - ${selectedDisc.nome}` : obra?.nome || "Ficheiro"}
            </h1>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#1E293B] border border-gray-700">
          <TabsTrigger value="ficheiros" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
            <FolderOpen className="w-4 h-4 mr-2" /> Disciplinas
          </TabsTrigger>
          <TabsTrigger value="arts" className="data-[state=active]:bg-[#D4A843] data-[state=active]:text-black">
            <Shield className="w-4 h-4 mr-2" /> ARTs / RRTs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ficheiros" className="mt-4">
          {!selectedDisciplinaId ? (
            <DisciplinasView
              disciplinas={disciplinas}
              pastas={pastas}
              docs={docs}
              onSelect={onSelectDisciplina}
              onCreate={onCreateDisciplina}
              onDelete={onDeleteDisciplina}
            />
          ) : !selectedPastaId ? (
            <PastasView
              disc={selectedDisc}
              pastas={discPastas}
              docs={docs}
              onSelectPasta={onSelectPasta}
              onBack={onBackToDisciplinas}
            />
          ) : (
            <DocumentosView
              docs={docsInCurrentFolder}
              pastaNome={selectedPastaNome}
              onCreate={onCreateDoc}
              onEdit={onEditDoc}
              onDelete={onDeleteDoc}
              onView={onViewDoc}
            />
          )}
        </TabsContent>

        <TabsContent value="arts" className="mt-4">
          <ArtsView
            arts={arts}
            onCreate={onCreateArt}
            onEdit={onEditArt}
            onDelete={onDeleteArt}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function DisciplinasView({ disciplinas, pastas, docs, onSelect, onCreate, onDelete }: any) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">Disciplinas ({disciplinas.length})</h2>
        <Button onClick={onCreate} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" size="sm">
          <FolderPlus className="w-4 h-4 mr-1" /> Nova Disciplina
        </Button>
      </div>

      {disciplinas.length === 0 ? (
        <div className="text-center py-16 bg-[#1E293B] rounded-lg border border-gray-700">
          <FolderPlus className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <h3 className="text-base font-medium text-gray-300 mb-2">Nenhuma disciplina criada</h3>
          <p className="text-sm text-gray-500 mb-4">Crie disciplinas como Estrutural, Elétrica, Hidráulica, etc.<br />Cada uma receberá automaticamente as pastas DWG, PDF, IFC e DOC.</p>
          <Button onClick={onCreate} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]">
            <FolderPlus className="w-4 h-4 mr-2" /> Criar Primeira Disciplina
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {disciplinas.map((d: any) => {
            const discPastas = pastas.filter((p: any) => p.disciplinaId === d.id);
            const discDocs = docs.filter((doc: any) => doc.disciplinaId === d.id);
            return (
              <div
                key={d.id}
                className="bg-[#1E293B] rounded-lg border border-gray-700 hover:border-blue-500/40 transition-all cursor-pointer group"
                onClick={() => onSelect(d.id)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: `${d.cor || "#3b82f6"}30` }}
                      >
                        <span style={{ color: d.cor || "#3b82f6" }}>{d.sigla}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-sm">{d.nome}</h3>
                        <p className="text-xs text-gray-500">{discDocs.length} documento{discDocs.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
                        className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remover disciplina"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {discPastas.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-1 rounded bg-[#0F172A] px-2 py-1 border border-gray-700">
                        <Folder className={`w-3 h-3 ${PASTA_ICONS[p.nome] || "text-gray-400"}`} />
                        <span className="text-[10px] text-gray-400 font-medium">{p.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PastasView({ disc, pastas, docs, onSelectPasta, onBack }: any) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-semibold text-gray-300">
          Pastas de <span style={{ color: disc?.cor || "#3b82f6" }}>{disc?.sigla}</span> — {disc?.nome}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pastas.map((p: any) => {
          const pastaDocCount = docs.filter((d: any) => d.pastaId === p.id).length;
          return (
            <div
              key={p.id}
              className="bg-[#1E293B] rounded-lg border border-gray-700 hover:border-blue-500/40 transition-all cursor-pointer p-5 text-center group"
              onClick={() => onSelectPasta(p.id, p.nome)}
            >
              <Folder className={`w-12 h-12 mx-auto mb-3 ${PASTA_ICONS[p.nome] || "text-gray-400"} group-hover:scale-110 transition-transform`} />
              <h3 className="text-lg font-bold text-white mb-1">{p.nome}</h3>
              <p className="text-xs text-gray-500">{pastaDocCount} documento{pastaDocCount !== 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DocumentosView({ docs, pastaNome, onCreate, onEdit, onDelete, onView }: any) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">
          Documentos na pasta <span className="text-white">{pastaNome}</span> ({docs.length})
        </h2>
        <Button onClick={onCreate} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Novo Documento
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-12 bg-[#1E293B] rounded-lg border border-gray-700">
          <FileText className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 mb-3">Nenhum documento nesta pasta.</p>
          <Button onClick={onCreate} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Adicionar Documento
          </Button>
        </div>
      ) : (
        <div className="bg-[#1E293B] rounded-lg border border-gray-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700 hover:bg-transparent">
                <TableHead className="text-gray-400 w-[15%]">Código</TableHead>
                <TableHead className="text-gray-400 w-[35%]">Título</TableHead>
                <TableHead className="text-gray-400 w-[10%] text-center">Rev.</TableHead>
                <TableHead className="text-gray-400 w-[15%]">Status</TableHead>
                <TableHead className="text-gray-400 w-[15%]">Emissão</TableHead>
                <TableHead className="text-gray-400 w-[10%] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc: any) => {
                const st = STATUS_MAP[doc.status || "em_elaboracao"] || STATUS_MAP.em_elaboracao;
                return (
                  <TableRow key={doc.id} className="border-gray-700 hover:bg-[#243044] cursor-pointer" onClick={() => onView(doc)}>
                    <TableCell className="font-mono text-sm text-[#D4A843]">{doc.codigo}</TableCell>
                    <TableCell className="text-white truncate max-w-[300px]">{doc.titulo}</TableCell>
                    <TableCell className="text-center text-white font-medium">{doc.revisaoAtual || "0"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {doc.dataEmissao ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-white">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onView(doc)}>
                            <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(doc)}>
                            <Pencil className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400" onClick={() => onDelete(doc.id)}>
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
        </div>
      )}
    </>
  );
}

function ArtsView({ arts, onCreate, onEdit, onDelete }: any) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">ARTs e RRTs ({arts.length})</h2>
        <Button onClick={onCreate} className="bg-[#D4A843] text-black hover:bg-[#C49A3B]" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Nova ART/RRT
        </Button>
      </div>

      {arts.length === 0 ? (
        <div className="text-center py-12 bg-[#1E293B] rounded-lg border border-gray-700">
          <Shield className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">Nenhuma ART/RRT cadastrada.</p>
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
              {arts.map((art: any) => {
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
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${as2.color}`}>{as2.label}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(art)}>
                            <Pencil className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400" onClick={() => onDelete(art.id)}>
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
        </div>
      )}
    </>
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
