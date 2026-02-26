import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import { nowBrasilia, todayBrasiliaLong } from "@/lib/dateUtils";
import {
  Search, FileText, AlertTriangle, ShieldAlert, GraduationCap, Stethoscope,
  Plus, Upload, Download, Eye, Trash2, FileUp, ClipboardList, Calendar, Pencil, Printer, FileDown, CheckSquare, Square, X
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import FullScreenDialog from "@/components/FullScreenDialog";

// ============ HELPERS ============
function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive">VENCIDO</Badge>;
  if (status.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">VÁLIDO</Badge>;
}

function formatTipoASO(tipo: string) {
  const map: Record<string, string> = { Admissional: "Admissional", Periodico: "Periódico", Retorno: "Retorno ao Trabalho", Mudanca_Funcao: "Mudança de Função", Demissional: "Demissional" };
  return map[tipo] || tipo;
}

function formatTipoAdv(tipo: string) {
  const map: Record<string, string> = { Verbal: "Verbal", Escrita: "Escrita", Suspensao: "Suspensão", JustaCausa: "Justa Causa", OSS: "OSS" };
  return map[tipo] || tipo;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

export default function ControleDocumentos() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("aso");
  const [advPreFillApplied, setAdvPreFillApplied] = useState(false);

  // ============ QUERIES ============
  const { data: resumo } = trpc.docs.resumo.useQuery({ companyId }, { enabled: !!companyId });
  const { data: asoList = [], refetch: refetchAso } = trpc.docs.asos.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: treinList = [], refetch: refetchTrein } = trpc.docs.treinamentos.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: atestList = [], refetch: refetchAtest } = trpc.docs.atestados.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: advList = [], refetch: refetchAdv } = trpc.docs.advertencias.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: allEmployees = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });

  // Filtrar APENAS funcionários ativos para os selects
  const activeEmployees = useMemo(() => {
    return (allEmployees as any[]).filter((e: any) => e.status === "Ativo");
  }, [allEmployees]);

  // ============ MUTATIONS ============
  const createAso = trpc.docs.asos.create.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO cadastrado!"); } });
  const updateAso = trpc.docs.asos.update.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO atualizado!"); } });
  const deleteAso = trpc.docs.asos.delete.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO excluído!"); } });
  const uploadAsoDoc = trpc.docs.asos.uploadDoc.useMutation({ onSuccess: () => { refetchAso(); toast.success("Documento anexado!"); } });

  const createTrein = trpc.docs.treinamentos.create.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento cadastrado!"); } });
  const updateTrein = trpc.docs.treinamentos.update.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento atualizado!"); } });
  const deleteTrein = trpc.docs.treinamentos.delete.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento excluído!"); } });
  const uploadTreinDoc = trpc.docs.treinamentos.uploadDoc.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Certificado anexado!"); } });

  const createAtest = trpc.docs.atestados.create.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado cadastrado!"); } });
  const updateAtest = trpc.docs.atestados.update.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado atualizado!"); } });
  const deleteAtest = trpc.docs.atestados.delete.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado excluído!"); } });
  const uploadAtestDoc = trpc.docs.atestados.uploadDoc.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Documento anexado!"); } });

  const createAdv = trpc.docs.advertencias.create.useMutation({ onSuccess: (result: any) => { refetchAdv(); if (result?.alerta) { toast.warning(result.alerta, { duration: 8000 }); } else { toast.success(`Advertência cadastrada! (${result?.sequencia || ''}ª do colaborador)`); } if (result?.id) { setLastCreatedAdvId(result.id); } } });
  const [lastCreatedAdvId, setLastCreatedAdvId] = useState<number | null>(null);
  const deleteAtestBatch = trpc.docs.atestadosDeleteBatch.useMutation({ onSuccess: (r: any) => { refetchAtest(); toast.success(`${r.deletados} atestado(s) excluído(s)!`); setSelectedAtestIds([]); } });
  const { user: authUser } = useAuth();
  const updateAdv = trpc.docs.advertencias.update.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência atualizada!"); } });
  const deleteAdv = trpc.docs.advertencias.delete.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência excluída!"); } });
  const uploadAdvDoc = trpc.docs.advertencias.uploadDoc.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Documento anexado!"); } });

  const importAso = trpc.docs.asos.importBatch.useMutation({ onSuccess: (r) => { refetchAso(); toast.success(`${r.imported} ASOs importados!`); } });

  // ============ DIALOGS ============
  const [showAsoDialog, setShowAsoDialog] = useState(false);
  const [showTreinDialog, setShowTreinDialog] = useState(false);
  const [showAtestDialog, setShowAtestDialog] = useState(false);
  const [showAdvDialog, setShowAdvDialog] = useState(false);
  const [showImportAso, setShowImportAso] = useState(false);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // ============ EDIT MODE (null = criação, number = edição) ============
  const [editingAsoId, setEditingAsoId] = useState<number | null>(null);
  const [editingTreinId, setEditingTreinId] = useState<number | null>(null);
  const [editingAtestId, setEditingAtestId] = useState<number | null>(null);
  const [editingAdvId, setEditingAdvId] = useState<number | null>(null);
  const [selectedAtestIds, setSelectedAtestIds] = useState<number[]>([]);
  const [advEmployeeCount, setAdvEmployeeCount] = useState<{total: number; proximaAcao: string; sugestaoTipo: string} | null>(null);
  const [showAdvPreview, setShowAdvPreview] = useState(false);
  const [previewAdvData, setPreviewAdvData] = useState<any>(null);

  // ============ FORM STATES ============
  const [asoForm, setAsoForm] = useState<any>({});
  const [treinForm, setTreinForm] = useState<any>({});
  const [atestForm, setAtestForm] = useState<any>({});
  const [advForm, setAdvForm] = useState<any>({});

  // ============ PRE-FILL FROM FECHAMENTO DE PONTO ============
  useEffect(() => {
    if (advPreFillApplied) return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const action = params.get("action");
    if (tab === "advertencias") {
      setActiveTab("advertencias");
      if (action === "nova") {
        // Read pre-fill data from sessionStorage
        const raw = sessionStorage.getItem("advPreFill");
        if (raw) {
          try {
            const preFill = JSON.parse(raw);
            setEditingAdvId(null);
            setAdvForm({
              employeeId: preFill.employeeId,
              dataOcorrencia: preFill.dataOcorrencia || "",
              motivo: preFill.motivo || "",
              descricao: preFill.descricao || "",
              tipoAdvertencia: "", // User must choose
            });
            setShowAdvDialog(true);
            sessionStorage.removeItem("advPreFill");
            toast.info(`Advertência para ${preFill.employeeName || "colaborador"} — preencha o tipo e confirme.`, { duration: 6000 });
          } catch { /* ignore parse errors */ }
        } else {
          // Just open new adv dialog without pre-fill
          setEditingAdvId(null);
          setAdvForm({});
          setShowAdvDialog(true);
        }
      }
      // Clean URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
      setAdvPreFillApplied(true);
    }
  }, [advPreFillApplied]);

  // ============ FILTER ============
  const [statusFilter, setStatusFilter] = useState("todos");
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  const handleCardClick = (filter: string) => {
    if (cardFilter === filter) {
      setCardFilter(null);
      setStatusFilter("todos");
      if (filter === "vencido" || filter === "vencer" || filter === "asos") setActiveTab("aso");
    } else {
      setCardFilter(filter);
      if (filter === "asos") { setActiveTab("aso"); setStatusFilter("todos"); }
      else if (filter === "vencido") { setActiveTab("aso"); setStatusFilter("vencido"); }
      else if (filter === "vencer") { setActiveTab("aso"); setStatusFilter("vencer"); }
      else if (filter === "treinamentos") { setActiveTab("treinamentos"); setStatusFilter("todos"); }
      else if (filter === "atestados") { setActiveTab("atestados"); setStatusFilter("todos"); }
      else if (filter === "advertencias") { setActiveTab("advertencias"); setStatusFilter("todos"); }
    }
  };

  const filteredAso = useMemo(() => {
    let list = asoList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s) || a.cpf?.includes(s));
    }
    if (statusFilter === "valido") list = list.filter((a: any) => a.status === "VÁLIDO");
    else if (statusFilter === "vencer") list = list.filter((a: any) => a.status?.includes("DIAS PARA VENCER"));
    else if (statusFilter === "vencido") list = list.filter((a: any) => a.status === "VENCIDO");
    return list;
  }, [asoList, search, statusFilter]);

  const filteredTrein = useMemo(() => {
    let list = treinList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t: any) => t.nomeCompleto?.toLowerCase().includes(s) || t.nome?.toLowerCase().includes(s));
    }
    return list;
  }, [treinList, search]);

  const filteredAtest = useMemo(() => {
    let list = atestList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s));
    }
    return list;
  }, [atestList, search]);

  const filteredAdv = useMemo(() => {
    let list = advList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s));
    }
    return list;
  }, [advList, search]);

  // ============ UPLOAD HANDLER ============
  const handleUploadDoc = async (type: string, id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          if (type === "aso") await uploadAsoDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "trein") await uploadTreinDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "atest") await uploadAtestDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "adv") await uploadAdvDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
        } catch { toast.error("Erro ao enviar documento"); }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ============ OPEN DIALOGS ============
  const openNewAso = () => { setEditingAsoId(null); setAsoForm({}); setShowAsoDialog(true); };
  const openEditAso = (a: any) => {
    setEditingAsoId(a.id);
    setAsoForm({ employeeId: a.employeeId, tipo: a.tipo, dataExame: a.dataExame, validadeDias: a.validadeDias || 365, resultado: a.resultado || "Apto", medico: a.medico || "", crm: a.crm || "", clinica: a.clinica || "", examesRealizados: a.examesRealizados || "", observacoes: a.observacoes || "" });
    setShowAsoDialog(true);
  };

  const openNewTrein = () => { setEditingTreinId(null); setTreinForm({}); setShowTreinDialog(true); };
  const openEditTrein = (t: any) => {
    setEditingTreinId(t.id);
    setTreinForm({ employeeId: t.employeeId, nome: t.nome || "", norma: t.norma || "", cargaHoraria: t.cargaHoraria || "", dataRealizacao: t.dataRealizacao || "", dataValidade: t.dataValidade || "", instrutor: t.instrutor || "", entidade: t.entidade || "", observacoes: t.observacoes || "" });
    setShowTreinDialog(true);
  };

  const openNewAtest = () => { setEditingAtestId(null); setAtestForm({}); setShowAtestDialog(true); };
  const openEditAtest = (a: any) => {
    setEditingAtestId(a.id);
    setAtestForm({ employeeId: a.employeeId, tipo: a.tipo || "", dataEmissao: a.dataEmissao || "", diasAfastamento: a.diasAfastamento || 0, dataRetorno: a.dataRetorno || "", cid: a.cid || "", medico: a.medico || "", crm: a.crm || "", descricao: a.descricao || "", motivo: a.motivo || "", motivoOutro: a.motivoOutro || "" });
    setShowAtestDialog(true);
  };

  const openNewAdv = () => { setEditingAdvId(null); setAdvForm({}); setShowAdvDialog(true); };
  const openEditAdv = (a: any) => {
    setEditingAdvId(a.id);
    setAdvForm({ employeeId: a.employeeId, tipoAdvertencia: a.tipoAdvertencia || "", dataOcorrencia: a.dataOcorrencia || "", motivo: a.motivo || "", descricao: a.descricao || "", testemunhas: a.testemunhas || "" });
    setShowAdvDialog(true);
  };

  // ============ SUBMIT HANDLERS ============
  const handleSubmitAso = () => {
    if (!asoForm.employeeId || !asoForm.tipo || !asoForm.dataExame) { toast.error("Preencha os campos obrigatórios"); return; }
    if (editingAsoId) {
      updateAso.mutate({ id: editingAsoId, ...asoForm, validadeDias: asoForm.validadeDias || 365 });
    } else {
      createAso.mutate({ companyId, ...asoForm, validadeDias: asoForm.validadeDias || 365 });
    }
    setShowAsoDialog(false); setAsoForm({}); setEditingAsoId(null);
  };

  const handleSubmitTrein = () => {
    if (!treinForm.employeeId || !treinForm.nome || !treinForm.dataRealizacao) { toast.error("Preencha os campos obrigatórios"); return; }
    if (editingTreinId) {
      updateTrein.mutate({ id: editingTreinId, ...treinForm });
    } else {
      createTrein.mutate({ companyId, ...treinForm });
    }
    setShowTreinDialog(false); setTreinForm({}); setEditingTreinId(null);
  };

  const handleSubmitAtest = () => {
    if (!atestForm.employeeId || !atestForm.tipo || !atestForm.dataEmissao) { toast.error("Preencha os campos obrigatórios"); return; }
    if (editingAtestId) {
      updateAtest.mutate({ id: editingAtestId, ...atestForm, diasAfastamento: atestForm.diasAfastamento || 0 });
    } else {
      createAtest.mutate({ companyId, ...atestForm, diasAfastamento: atestForm.diasAfastamento || 0 });
    }
    setShowAtestDialog(false); setAtestForm({}); setEditingAtestId(null);
  };

  const handleSubmitAdv = () => {
    if (!advForm.employeeId || !advForm.tipoAdvertencia || !advForm.dataOcorrencia || !advForm.motivo) { toast.error("Preencha os campos obrigatórios"); return; }
    // Montar testemunhas como string JSON estruturada para o backend
    const testemunhasArr = [1, 2, 3].map(n => ({
      nome: advForm[`testemunha${n}Nome`] || "",
      doc: advForm[`testemunha${n}Doc`] || "",
    })).filter(t => t.nome.trim());
    const testemunhasStr = JSON.stringify(testemunhasArr);
    const payload = { ...advForm, testemunhas: testemunhasStr };
    // Remover campos temporarios de testemunha individual
    delete payload.testemunha1Nome; delete payload.testemunha1Doc;
    delete payload.testemunha2Nome; delete payload.testemunha2Doc;
    delete payload.testemunha3Nome; delete payload.testemunha3Doc;
    if (editingAdvId) {
      updateAdv.mutate({ id: editingAdvId, ...payload });
    } else {
      createAdv.mutate({ companyId, ...payload, aplicadoPor: authUser?.name || authUser?.username || undefined });
    }
    if (!editingAdvId && advForm.tipoAdvertencia !== "Verbal") {
      const emp = (allEmployees as any[]).find((e: any) => e.id === advForm.employeeId);
      const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === advForm.employeeId);
      setPreviewAdvData({
        nomeCompleto: emp?.nomeCompleto || "",
        cpf: emp?.cpf || "",
        funcao: emp?.funcao || "",
        setor: emp?.setor || "OBRA",
        tipoAdvertencia: advForm.tipoAdvertencia,
        dataOcorrencia: advForm.dataOcorrencia,
        motivo: advForm.motivo,
        descricao: advForm.descricao,
        testemunhasArr,
        diasSuspensao: advForm.diasSuspensao,
        sequencia: empAdvs.length + 1,
        anteriores: empAdvs.sort((a: any, b: any) => (a.dataOcorrencia || "").localeCompare(b.dataOcorrencia || "")),
        employeeId: advForm.employeeId,
      });
      setTimeout(() => setShowAdvPreview(true), 300);
    }
    setShowAdvDialog(false); setAdvForm({}); setEditingAdvId(null); setAdvEmployeeCount(null);
  };

  // Buscar contagem de advertências quando seleciona funcionário no dialog
  const { data: advCountData } = trpc.docs.contagemAdvertencias.useQuery(
    { employeeId: advForm.employeeId! },
    { enabled: !!advForm.employeeId && showAdvDialog && !editingAdvId }
  );

  const handleDeleteAtestBatch = () => {
    if (selectedAtestIds.length === 0) { toast.error("Selecione ao menos um atestado"); return; }
    if (confirm(`Excluir ${selectedAtestIds.length} atestado(s) selecionado(s)?`)) {
      deleteAtestBatch.mutate({ ids: selectedAtestIds });
    }
  };

  const toggleAtestSelection = (id: number) => {
    setSelectedAtestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllAtest = () => {
    if (selectedAtestIds.length === filteredAtest.length) setSelectedAtestIds([]);
    else setSelectedAtestIds(filteredAtest.map((a: any) => a.id));
  };

  // ============ IMPORT ASO ============
  const [importFile, setImportFile] = useState<File | null>(null);
  const handleImportAso = async () => {
    if (!importFile) { toast.error("Selecione um arquivo"); return; }
    const text = await importFile.text();
    const lines = text.split("\n").filter(l => l.trim());
    const records: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length < 4) continue;
      const name = cols[1]?.trim();
      const tipo = cols[2]?.trim();
      const dataStr = cols[3]?.trim();
      if (!name || !tipo || !dataStr) continue;
      const parts = dataStr.split("/");
      let dataExame = dataStr;
      if (parts.length === 3) dataExame = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      const validadeDias = parseInt(cols[4]) || 365;
      const resultado = cols[7]?.trim() || "Apto";
      const medico = cols[8]?.trim() || "";
      const crm = cols[9]?.trim() || "";
      const jaAtualizou = cols[10]?.trim()?.toUpperCase() === "SIM";
      const examesRealizados = cols[11]?.trim() || "";
      records.push({ employeeName: name, tipo, dataExame, validadeDias, resultado, medico, crm, jaAtualizou, examesRealizados });
    }
    if (records.length === 0) { toast.error("Nenhum registro encontrado no arquivo"); return; }
    importAso.mutate({ companyId, records });
    setShowImportAso(false); setImportFile(null);
  };

  // ============ EMPLOYEE SELECT COMPONENT (com busca por nome/CPF) ============
  const EmployeeSelect = ({ value, onChange }: { value: number | undefined; onChange: (id: number) => void }) => {
    const [empSearch, setEmpSearch] = useState("");
    const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
    const selectedEmp = activeEmployees.find((e: any) => e.id === value);
    const filteredEmps = activeEmployees.filter((e: any) => {
      if (!empSearch) return true;
      const s = empSearch.toLowerCase();
      return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
    });
    return (
      <div className="relative">
        <div
          className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
        >
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          {empDropdownOpen ? (
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none text-sm"
              placeholder="Digite nome ou CPF para buscar..."
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
              {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Digite nome ou CPF para buscar..."}
            </span>
          )}
          {value && (
            <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); onChange(undefined as any); setEmpSearch(""); }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {empDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {filteredEmps.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">{activeEmployees.length === 0 ? "Nenhum colaborador ativo cadastrado" : "Nenhum resultado encontrado"}</div>
              ) : filteredEmps.map((e: any) => (
                <div
                  key={e.id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex items-center justify-between ${value === e.id ? "bg-blue-100 font-medium" : ""}`}
                  onClick={() => { onChange(e.id); setEmpDropdownOpen(false); setEmpSearch(""); }}
                >
                  <span>{e.nomeCompleto}</span>
                  <span className="text-xs text-muted-foreground">{formatCPF(e.cpf)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Controle de Documentos</h1>
            <p className="text-muted-foreground text-sm">Gestão de ASOs, Treinamentos, Atestados e Advertências</p>
          </div>
          <PrintActions title="Controle de Documentos" />
        </div>

        {/* CARDS RESUMO */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { key: "asos", label: "ASOs", value: resumo?.totalASOs || 0, icon: Stethoscope, color: "blue" },
            { key: "vencido", label: "Vencidos", value: resumo?.asosVencidos || 0, icon: AlertTriangle, color: "red" },
            { key: "vencer", label: "A Vencer", value: resumo?.asosAVencer || 0, icon: Calendar, color: "yellow" },
            { key: "treinamentos", label: "Treinamentos", value: resumo?.totalTreinamentos || 0, icon: GraduationCap, color: "green" },
            { key: "atestados", label: "Atestados", value: resumo?.totalAtestados || 0, icon: ClipboardList, color: "purple" },
            { key: "advertencias", label: "Advertências", value: resumo?.totalAdvertencias || 0, icon: ShieldAlert, color: "orange" },
          ].map(c => (
            <Card key={c.key} className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] ${cardFilter === c.key ? `ring-2 ring-${c.color}-500 shadow-lg bg-${c.color}-50/50` : ""}`} onClick={() => handleCardClick(c.key)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg bg-${c.color}-100 flex items-center justify-center`}>
                    <c.icon className={`h-5 w-5 text-${c.color}-600`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${c.color === "red" || c.color === "yellow" ? `text-${c.color}-600` : ""}`}>{c.value}</p>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtro ativo */}
        {cardFilter && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filtro ativo:</span>
            <Badge variant="secondary" className="gap-1">
              {cardFilter === "asos" ? "Todos os ASOs" : cardFilter === "vencido" ? "ASOs Vencidos" : cardFilter === "vencer" ? "ASOs A Vencer" : cardFilter === "treinamentos" ? "Treinamentos" : cardFilter === "atestados" ? "Atestados" : "Advertências"}
              <button onClick={() => { setCardFilter(null); setStatusFilter("todos"); }} className="ml-1 hover:text-foreground">✕</button>
            </Badge>
          </div>
        )}

        {/* SEARCH + FILTER */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {activeTab === "aso" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="valido">Válidos</SelectItem>
                <SelectItem value="vencer">A Vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-12 gap-1 bg-transparent p-0">
            <TabsTrigger value="aso" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "aso" ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-blue-50/50 hover:text-blue-600"}`}>
              <Stethoscope className="h-4 w-4" /> ASO
            </TabsTrigger>
            <TabsTrigger value="treinamentos" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "treinamentos" ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-emerald-50/50 hover:text-emerald-600"}`}>
              <GraduationCap className="h-4 w-4" /> Treinamentos
            </TabsTrigger>
            <TabsTrigger value="atestados" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "atestados" ? "border-purple-500 bg-purple-50 text-purple-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-purple-50/50 hover:text-purple-600"}`}>
              <ClipboardList className="h-4 w-4" /> Atestados
            </TabsTrigger>
            <TabsTrigger value="advertencias" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "advertencias" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-orange-50/50 hover:text-orange-600"}`}>
              <ShieldAlert className="h-4 w-4" /> Advertências
            </TabsTrigger>
          </TabsList>

          {/* ===================== ABA ASO ===================== */}
          <TabsContent value="aso">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Atestados de Saúde Ocupacional</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowImportAso(true)}><Upload className="h-4 w-4 mr-1" /> Importar</Button>
                  <Button size="sm" onClick={openNewAso}><Plus className="h-4 w-4 mr-1" /> Novo ASO</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Nº</th>
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Exame</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Vencimento</th>
                        <th className="pb-2 font-medium">Resultado</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Exames</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAso.length === 0 ? (
                        <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum ASO cadastrado</td></tr>
                      ) : filteredAso.map((a: any, idx: number) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2">
                            <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</div>
                            <div className="text-xs text-muted-foreground">{formatCPF(a.cpf)}</div>
                          </td>
                          <td className="py-2">{formatTipoASO(a.tipo)}</td>
                          <td className="py-2">{formatDate(a.dataExame)}</td>
                          <td className="py-2">{a.validadeDias || 365} dias</td>
                          <td className="py-2"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                          <td className="py-2">{formatDate(a.dataValidade)}</td>
                          <td className="py-2">
                            <span className={a.resultado === "Apto" ? "text-green-600 font-medium" : a.resultado === "Inapto" ? "text-red-600 font-medium" : "text-yellow-600 font-medium"}>
                              {a.resultado === "Apto_Restricao" ? "Apto c/ Restrição" : a.resultado}
                            </span>
                          </td>
                          <td className="py-2">
                            {a.medico && <div className="text-xs">{a.medico}</div>}
                            {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                          </td>
                          <td className="py-2 max-w-[200px]">
                            <div className="text-xs text-muted-foreground truncate" title={a.examesRealizados}>{a.examesRealizados || "-"}</div>
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditAso(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("aso", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este ASO?")) deleteAso.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA TREINAMENTOS ===================== */}
          <TabsContent value="treinamentos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Treinamentos e Capacitações</CardTitle>
                <Button size="sm" onClick={openNewTrein}><Plus className="h-4 w-4 mr-1" /> Novo Treinamento</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Treinamento</th>
                        <th className="pb-2 font-medium">Norma</th>
                        <th className="pb-2 font-medium">Carga Horária</th>
                        <th className="pb-2 font-medium">Realização</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Instrutor/Entidade</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrein.length === 0 ? (
                        <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum treinamento cadastrado</td></tr>
                      ) : filteredTrein.map((t: any) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2">
                            <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(t.employeeId)}>{t.nomeCompleto}</div>
                            <div className="text-xs text-muted-foreground">{t.funcao || "-"}</div>
                          </td>
                          <td className="py-2 font-medium">{t.nome}</td>
                          <td className="py-2">{t.norma || "-"}</td>
                          <td className="py-2">{t.cargaHoraria || "-"}</td>
                          <td className="py-2">{formatDate(t.dataRealizacao)}</td>
                          <td className="py-2">{formatDate(t.dataValidade)}</td>
                          <td className="py-2">
                            {t.dataValidade ? <StatusBadge status={t.statusCalculado} diasRestantes={t.diasRestantes} /> : <span className="text-xs text-muted-foreground">Sem validade</span>}
                          </td>
                          <td className="py-2">
                            {t.instrutor && <div className="text-xs">{t.instrutor}</div>}
                            {t.entidade && <div className="text-xs text-muted-foreground">{t.entidade}</div>}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditTrein(t)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar certificado" onClick={() => handleUploadDoc("trein", t.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {t.certificadoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver certificado" onClick={() => window.open(t.certificadoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este treinamento?")) deleteTrein.mutate({ id: t.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ATESTADOS ===================== */}
          <TabsContent value="atestados">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Atestados Médicos</CardTitle>
                  <div className="flex gap-2">
                    {selectedAtestIds.length > 0 && (
                      <Button size="sm" variant="destructive" onClick={handleDeleteAtestBatch} disabled={deleteAtestBatch.isPending}>
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir {selectedAtestIds.length} selecionado(s)
                      </Button>
                    )}
                    <Button size="sm" onClick={openNewAtest}><Plus className="h-4 w-4 mr-1" /> Novo Atestado</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 w-8">
                          <button onClick={toggleAllAtest} className="p-1 hover:bg-muted rounded" title="Selecionar todos">
                            {selectedAtestIds.length === filteredAtest.length && filteredAtest.length > 0 ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </th>
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Emissão</th>
                        <th className="pb-2 font-medium">Dias Afastamento</th>
                        <th className="pb-2 font-medium">Data Retorno</th>
                        <th className="pb-2 font-medium">CID</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Motivo</th>
                        <th className="pb-2 font-medium">Arquivo</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAtest.length === 0 ? (
                        <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum atestado cadastrado</td></tr>
                      ) : filteredAtest.map((a: any) => (
                        <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${selectedAtestIds.includes(a.id) ? "bg-blue-50" : ""}`}>
                          <td className="py-2">
                            <button onClick={() => toggleAtestSelection(a.id)} className="p-1 hover:bg-muted rounded">
                              {selectedAtestIds.includes(a.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          </td>
                          <td className="py-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">{a.tipo}</td>
                          <td className="py-2">{formatDate(a.dataEmissao)}</td>
                          <td className="py-2 text-center">{a.diasAfastamento || 0}</td>
                          <td className="py-2">{formatDate(a.dataRetorno)}</td>
                          <td className="py-2">{a.cid || "-"}</td>
                          <td className="py-2">
                            {a.medico && <div className="text-xs">{a.medico}</div>}
                            {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                          </td>
                          <td className="py-2">
                            <span className="text-xs">{a.motivo === "Outros" ? a.motivoOutro || "Outros" : a.motivo || "-"}</span>
                          </td>
                          <td className="py-2">
                            {a.documentoUrl ? (
                              <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5" /> Ver
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditAtest(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar Atestado" onClick={() => handleUploadDoc("atest", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este atestado?")) deleteAtest.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ADVERTÊNCIAS ===================== */}
          <TabsContent value="advertencias">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Advertências e Suspensões</CardTitle>
                  <Button size="sm" onClick={openNewAdv}><Plus className="h-4 w-4 mr-1" /> Nova Advertência</Button>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 text-sm text-amber-800">
                  <p className="font-semibold flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Fluxo Progressivo (CLT Art. 482)</p>
                  <p className="text-xs mt-1">1ª Advertência Verbal → 2ª Advertência Escrita → 3ª Advertência Escrita → Suspensão (1-30 dias) → Justa Causa</p>
                  <p className="text-xs mt-0.5 text-amber-600">O sistema sugere automaticamente o próximo passo com base no histórico do colaborador.</p>
                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-amber-200">
                    <span className="text-xs font-medium text-amber-900">Legenda Sequência:</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-green-100 text-green-700 border border-green-300">1ª</span><span className="text-xs">1ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-yellow-100 text-yellow-700 border border-yellow-300">2ª</span><span className="text-xs">2ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-orange-100 text-orange-700 border border-orange-300">3ª</span><span className="text-xs">3ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-red-100 text-red-700 border border-red-300">4ª+</span><span className="text-xs">4ª+ (Crítico)</span></span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Seq.</th>
                        <th className="pb-2 font-medium">Data</th>
                        <th className="pb-2 font-medium">Motivo</th>
                        <th className="pb-2 font-medium">Descrição</th>
                        <th className="pb-2 font-medium">Testemunhas</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdv.length === 0 ? (
                        <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhuma advertência cadastrada</td></tr>
                      ) : filteredAdv.map((a: any) => {
                        const empAdvCount = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).length;
                        const nextStep = empAdvCount >= 3 ? "Suspensão" : empAdvCount >= 4 ? "Justa Causa" : null;
                        return (
                        <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50/50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100/50" : ""}`}>
                          <td className="py-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">
                            <Badge variant={a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"}
                              className={a.tipoAdvertencia === "JustaCausa" ? "bg-red-800" : ""}>
                              {formatTipoAdv(a.tipoAdvertencia)}
                            </Badge>
                          </td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                              (a.sequencia || empAdvCount) >= 4 ? "bg-red-100 text-red-700 border-red-300" :
                              (a.sequencia || empAdvCount) === 3 ? "bg-orange-100 text-orange-700 border-orange-300" :
                              (a.sequencia || empAdvCount) === 2 ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
                              "bg-green-100 text-green-700 border-green-300"
                            }`}>
                              {a.sequencia || empAdvCount}ª
                            </span>
                          </td>
                          <td className="py-2">{formatDate(a.dataOcorrencia)}</td>
                          <td className="py-2 max-w-[180px] truncate" title={a.motivo}>{a.motivo}</td>
                          <td className="py-2 max-w-[180px] truncate" title={a.descricao}>{a.descricao || "-"}</td>
                          <td className="py-2 max-w-[200px] truncate">{(() => { try { const arr = JSON.parse(a.testemunhas || "[]"); if (Array.isArray(arr) && arr.length > 0) { return arr.filter((t: any) => t.nome?.trim()).map((t: any) => t.nome).join(", ") || "-"; } return a.testemunhas || "-"; } catch { return a.testemunhas || "-"; } })()}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              {a.tipoAdvertencia !== "Verbal" && <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="Visualizar Documento CLT" onClick={() => {
                                const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).sort((x: any, y: any) => (x.dataOcorrencia || "").localeCompare(y.dataOcorrencia || ""));
                                const idxAdv = empAdvs.findIndex((x: any) => x.id === a.id);
                                const anteriores = empAdvs.filter((_: any, i: number) => i < idxAdv);
                                let testemunhasArr: {nome: string; doc: string}[] = [];
                                try { testemunhasArr = JSON.parse(a.testemunhas || "[]"); } catch { testemunhasArr = []; }
                                setPreviewAdvData({
                                  nomeCompleto: a.nomeCompleto,
                                  cpf: a.cpf,
                                  funcao: a.funcao,
                                  setor: a.setor || "OBRA",
                                  tipoAdvertencia: a.tipoAdvertencia,
                                  dataOcorrencia: a.dataOcorrencia,
                                  motivo: a.motivo,
                                  descricao: a.descricao,
                                  testemunhasArr,
                                  diasSuspensao: a.diasSuspensao,
                                  sequencia: idxAdv + 1,
                                  anteriores,
                                  employeeId: a.employeeId,
                                });
                                setLastCreatedAdvId(a.id);
                                setShowAdvPreview(true);
                              }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>}
                              {a.tipoAdvertencia !== "Verbal" && <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="Imprimir Documento CLT" onClick={() => {
                                const userName = authUser?.name || authUser?.username || "Usuário";
                                const dataEmissao = nowBrasilia();
                                const logoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
                                const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
                                const tipoTitulo = a.tipoAdvertencia === "Suspensao" ? "SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "RESCISÃO POR JUSTA CAUSA" : a.tipoAdvertencia === "Escrita" ? "ADVERTÊNCIA POR ESCRITO" : "ADVERTÊNCIA VERBAL";
                                const verbo = a.tipoAdvertencia === "Suspensao" ? "SUSPENDER" : a.tipoAdvertencia === "JustaCausa" ? "COMUNICAR A RESCISÃO POR JUSTA CAUSA de" : "ADVERTIR";
                                const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).sort((x: any, y: any) => (x.dataOcorrencia || "").localeCompare(y.dataOcorrencia || ""));
                                const idxAdv = empAdvs.findIndex((x: any) => x.id === a.id);
                                const anteriores = empAdvs.filter((_: any, i: number) => i < idxAdv);
                                const numAdv = idxAdv + 1;
                                let testemunhasArr: {nome: string; doc: string}[] = [];
                                try { testemunhasArr = JSON.parse(a.testemunhas || "[]"); } catch { testemunhasArr = []; }
                                const t1 = testemunhasArr[0] || { nome: "", doc: "" };
                                const t2 = testemunhasArr[1] || { nome: "", doc: "" };
                                const t3 = testemunhasArr[2] || { nome: "", doc: "" };
                                const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tipoTitulo}</title>
                                <style>
                                  @page { size: A4 portrait; margin: 20mm 18mm 25mm 18mm; }
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body { font-family: 'Times New Roman', serif; font-size: 12.5px; color: #000; line-height: 1.7; }
                                  .logo-bar { background: #1e3a6e; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
                                  .logo-bar img { height: 50px; }
                                  .logo-bar .title { color: white; }
                                  .logo-bar .title h1 { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
                                  .logo-bar .title p { font-size: 10px; opacity: 0.8; }
                                  .num-badge { background: #dc2626; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 4px; margin-left: auto; }
                                  .doc-body { text-align: justify; padding: 0 10px; }
                                  .doc-body p { margin-bottom: 14px; text-indent: 35px; }
                                  .motivo-box { background: #f8f8f8; border-left: 4px solid #1e3a6e; padding: 10px 14px; margin: 14px 0; text-indent: 0 !important; font-style: italic; }
                                  .historico { margin: 14px 0; text-indent: 0 !important; }
                                  .historico li { margin-left: 35px; margin-bottom: 3px; }
                                  .signatures { margin-top: 50px; padding: 0 10px; }
                                  .sig-row { display: flex; justify-content: space-between; margin-bottom: 40px; }
                                  .sig-block { text-align: center; width: 45%; }
                                  .sig-block .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                                  .sig-row-3 { display: flex; justify-content: space-between; margin-bottom: 40px; }
                                  .sig-block-3 { text-align: center; width: 30%; }
                                  .sig-block-3 .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                                  .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 18mm; border-top: 2px solid #1e3a6e; font-size: 8.5px; display: flex; justify-content: space-between; background: white; }
                                  .footer .lgpd { color: #dc2626; font-weight: 600; }
                                </style></head><body>
                                <div class="logo-bar">
                                  <img src="${logoUrl}" alt="FC Engenharia" />
                                  <div class="title"><h1>${tipoTitulo}</h1><p>FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</p></div>
                                  <span class="num-badge">${numAdv}ª MEDIDA</span>
                                </div>
                                <div class="doc-body">
                                  <p>Pelo presente instrumento, a empresa <strong>FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</strong>, vem por meio deste ${verbo} o(a) colaborador(a) <strong>${a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>${formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>${a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>${a.setor || "OBRA"}</strong>${a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? `, pelo período de <strong style="color: #dc2626; background: #fef2f2; padding: 2px 6px; border-radius: 3px;">${a.diasSuspensao} dia(s)</strong>, a contar de <strong style="color: #dc2626;">${a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong style="color: #dc2626;">${a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,` : ""} pelo seguinte motivo:</p>
                                  <div class="motivo-box">${a.motivo}${a.descricao ? "<br/><br/>" + a.descricao : ""}</div>
                                  <p>Ocorrido em <strong>${formatDate(a.dataOcorrencia)}</strong>.</p>
                                  <p style="text-indent:0; font-weight:bold; color:#1e3a6e;">Esta é a ${numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>
                                  ${anteriores.length > 0 ? `<p>Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p><div class="historico"><ul>${anteriores.map((prev: any, pi: number) => `<li>${pi + 1}ª ${prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em ${formatDate(prev.dataOcorrencia)} — ${prev.motivo}</li>`).join("")}</ul></div>` : ""}
                                  <p>${a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}</p>
                                  <p>${a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}</p>
                                  <p>O(A) colaborador(a) declara estar ciente desta ${tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                                  <p style="text-indent:0; margin-top: 25px;">_________________, ${todayBrasiliaLong()}.</p>
                                </div>
                                <div class="signatures">
                                  <div class="sig-row">
                                    <div class="sig-block"><div class="line">Empregador / Representante Legal</div></div>
                                    <div class="sig-block"><div class="line">${a.nomeCompleto}<br/>Colaborador(a)</div></div>
                                  </div>
                                  <div class="sig-row-3">
                                    <div class="sig-block-3"><div class="line">Testemunha 1${t1.nome ? "<br/><strong>" + t1.nome + "</strong>" : ""}${t1.doc ? "<br/>" + t1.doc : ""}</div></div>
                                    <div class="sig-block-3"><div class="line">Testemunha 2${t2.nome ? "<br/><strong>" + t2.nome + "</strong>" : ""}${t2.doc ? "<br/>" + t2.doc : ""}</div></div>
                                    <div class="sig-block-3"><div class="line">Testemunha 3${t3.nome ? "<br/><strong>" + t3.nome + "</strong>" : ""}${t3.doc ? "<br/>" + t3.doc : ""}</div></div>
                                  </div>
                                </div>
                                <div class="footer">
                                  <span>ERP RH & DP — FC Engenharia</span>
                                  <span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span>
                                  <span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                                </div>
                                </body></html>`;
                                const w = window.open("", "_blank");
                                if (w) { w.document.write(printHtml); w.document.close(); setTimeout(() => w.print(), 500); }
                              }}>
                                <Printer className="h-3.5 w-3.5" />
                              </Button>}
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditAdv(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("adv", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir esta advertência?")) deleteAdv.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===================== DIALOG: ASO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAsoDialog} onClose={() => { setShowAsoDialog(false); setEditingAsoId(null); }} title={editingAsoId ? "Editar ASO" : "Novo ASO"} icon={<Stethoscope className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador * <span className="text-xs text-muted-foreground">(apenas ativos do cadastro)</span></label>
              <EmployeeSelect value={asoForm.employeeId} onChange={id => setAsoForm({ ...asoForm, employeeId: id })} />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de Exame *</label>
              <Select value={asoForm.tipo || ""} onValueChange={v => setAsoForm({ ...asoForm, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admissional">Admissional</SelectItem>
                  <SelectItem value="Periodico">Periódico</SelectItem>
                  <SelectItem value="Retorno">Retorno ao Trabalho</SelectItem>
                  <SelectItem value="Mudanca_Funcao">Mudança de Função</SelectItem>
                  <SelectItem value="Demissional">Demissional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data do Exame *</label>
              <Input type="date" value={asoForm.dataExame || ""} onChange={e => setAsoForm({ ...asoForm, dataExame: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Validade (dias)</label>
              <Input type="number" value={asoForm.validadeDias || 365} onChange={e => setAsoForm({ ...asoForm, validadeDias: parseInt(e.target.value) || 365 })} />
            </div>
            <div>
              <label className="text-sm font-medium">Resultado</label>
              <Select value={asoForm.resultado || "Apto"} onValueChange={v => setAsoForm({ ...asoForm, resultado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Apto">Apto</SelectItem>
                  <SelectItem value="Inapto">Inapto</SelectItem>
                  <SelectItem value="Apto_Restricao">Apto com Restrição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Médico</label>
              <Input value={asoForm.medico || ""} onChange={e => setAsoForm({ ...asoForm, medico: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CRM</label>
              <Input value={asoForm.crm || ""} onChange={e => setAsoForm({ ...asoForm, crm: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Clínica</label>
              <Input value={asoForm.clinica || ""} onChange={e => setAsoForm({ ...asoForm, clinica: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Exames Realizados</label>
              <Textarea value={asoForm.examesRealizados || ""} onChange={e => setAsoForm({ ...asoForm, examesRealizados: e.target.value })} placeholder="Ex: Acuidade Visual, Audiometria, Hemograma..." rows={2} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea value={asoForm.observacoes || ""} onChange={e => setAsoForm({ ...asoForm, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowAsoDialog(false); setEditingAsoId(null); }}>Cancelar</Button>
            <Button onClick={handleSubmitAso} disabled={createAso.isPending || updateAso.isPending}>
              {(createAso.isPending || updateAso.isPending) ? "Salvando..." : editingAsoId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: TREINAMENTO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showTreinDialog} onClose={() => { setShowTreinDialog(false); setEditingTreinId(null); }} title={editingTreinId ? "Editar Treinamento" : "Novo Treinamento"} icon={<GraduationCap className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador * <span className="text-xs text-muted-foreground">(apenas ativos do cadastro)</span></label>
              <EmployeeSelect value={treinForm.employeeId} onChange={id => setTreinForm({ ...treinForm, employeeId: id })} />
            </div>
            <div>
              <label className="text-sm font-medium">Nome do Treinamento *</label>
              <Input value={treinForm.nome || ""} onChange={e => setTreinForm({ ...treinForm, nome: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Norma Regulamentadora</label>
              <Input value={treinForm.norma || ""} onChange={e => setTreinForm({ ...treinForm, norma: e.target.value })} placeholder="Ex: NR-35, NR-10" />
            </div>
            <div>
              <label className="text-sm font-medium">Carga Horária</label>
              <Input value={treinForm.cargaHoraria || ""} onChange={e => setTreinForm({ ...treinForm, cargaHoraria: e.target.value })} placeholder="Ex: 8h, 40h" />
            </div>
            <div>
              <label className="text-sm font-medium">Data Realização *</label>
              <Input type="date" value={treinForm.dataRealizacao || ""} onChange={e => setTreinForm({ ...treinForm, dataRealizacao: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Validade</label>
              <Input type="date" value={treinForm.dataValidade || ""} onChange={e => setTreinForm({ ...treinForm, dataValidade: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Instrutor</label>
              <Input value={treinForm.instrutor || ""} onChange={e => setTreinForm({ ...treinForm, instrutor: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Entidade/Empresa</label>
              <Input value={treinForm.entidade || ""} onChange={e => setTreinForm({ ...treinForm, entidade: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea value={treinForm.observacoes || ""} onChange={e => setTreinForm({ ...treinForm, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowTreinDialog(false); setEditingTreinId(null); }}>Cancelar</Button>
            <Button onClick={handleSubmitTrein} disabled={createTrein.isPending || updateTrein.isPending}>
              {(createTrein.isPending || updateTrein.isPending) ? "Salvando..." : editingTreinId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: ATESTADO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAtestDialog} onClose={() => { setShowAtestDialog(false); setEditingAtestId(null); }} title={editingAtestId ? "Editar Atestado" : "Novo Atestado"} icon={<FileText className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador * <span className="text-xs text-muted-foreground">(apenas ativos do cadastro)</span></label>
              <EmployeeSelect value={atestForm.employeeId} onChange={id => setAtestForm({ ...atestForm, employeeId: id })} />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo *</label>
              <Select value={atestForm.tipo || ""} onValueChange={v => setAtestForm({ ...atestForm, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                  <SelectItem value="Atestado Odontológico">Atestado Odontológico</SelectItem>
                  <SelectItem value="Declaração de Comparecimento">Declaração de Comparecimento</SelectItem>
                  <SelectItem value="Atestado de Acompanhamento">Atestado de Acompanhamento</SelectItem>
                  <SelectItem value="Licença Maternidade">Licença Maternidade</SelectItem>
                  <SelectItem value="Licença Paternidade">Licença Paternidade</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data Emissão *</label>
              <Input type="date" value={atestForm.dataEmissao || ""} onChange={e => setAtestForm({ ...atestForm, dataEmissao: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Dias de Afastamento</label>
              <Input type="number" value={atestForm.diasAfastamento || 0} onChange={e => setAtestForm({ ...atestForm, diasAfastamento: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Retorno</label>
              <Input type="date" value={atestForm.dataRetorno || ""} onChange={e => setAtestForm({ ...atestForm, dataRetorno: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CID</label>
              <Input value={atestForm.cid || ""} onChange={e => setAtestForm({ ...atestForm, cid: e.target.value })} placeholder="Ex: J11, M54.5" />
            </div>
            <div>
              <label className="text-sm font-medium">Médico</label>
              <Input value={atestForm.medico || ""} onChange={e => setAtestForm({ ...atestForm, medico: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CRM</label>
              <Input value={atestForm.crm || ""} onChange={e => setAtestForm({ ...atestForm, crm: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Motivo do Atestado *</label>
              <Select value={atestForm.motivo || ""} onValueChange={v => setAtestForm({ ...atestForm, motivo: v, motivoOutro: v !== "Outros" ? "" : atestForm.motivoOutro })}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consulta Médica">Consulta Médica</SelectItem>
                  <SelectItem value="Doença">Doença</SelectItem>
                  <SelectItem value="Acidente">Acidente</SelectItem>
                  <SelectItem value="Cirurgia">Cirurgia</SelectItem>
                  <SelectItem value="Acompanhamento Familiar">Acompanhamento Familiar</SelectItem>
                  <SelectItem value="Exame">Exame</SelectItem>
                  <SelectItem value="Tratamento">Tratamento</SelectItem>
                  <SelectItem value="Saúde Mental">Saúde Mental</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {atestForm.motivo === "Outros" && (
              <div>
                <label className="text-sm font-medium">Especifique o Motivo *</label>
                <Input value={atestForm.motivoOutro || ""} onChange={e => setAtestForm({ ...atestForm, motivoOutro: e.target.value })} placeholder="Descreva o motivo" />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={atestForm.descricao || ""} onChange={e => setAtestForm({ ...atestForm, descricao: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowAtestDialog(false); setEditingAtestId(null); }}>Cancelar</Button>
            <Button onClick={handleSubmitAtest} disabled={createAtest.isPending || updateAtest.isPending}>
              {(createAtest.isPending || updateAtest.isPending) ? "Salvando..." : editingAtestId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: ADVERTÊNCIA (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAdvDialog} onClose={() => { setShowAdvDialog(false); setEditingAdvId(null); setAdvEmployeeCount(null); }} title={editingAdvId ? "Editar Advertência" : "Nova Advertência"} icon={<ShieldAlert className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador * <span className="text-xs text-muted-foreground">(apenas ativos do cadastro)</span></label>
              <EmployeeSelect value={advForm.employeeId} onChange={id => setAdvForm({ ...advForm, employeeId: id })} />
            </div>

            {/* ALERTA DE CONTAGEM DE ADVERTÊNCIAS */}
            {advCountData && !editingAdvId && advForm.employeeId && (
              <div className={`col-span-2 rounded-lg p-3 border-2 ${
                advCountData.total >= 3 ? "bg-red-50 border-red-300" : advCountData.total >= 2 ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"
              }`}>
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`h-5 w-5 ${advCountData.total >= 3 ? "text-red-600" : advCountData.total >= 2 ? "text-amber-600" : "text-blue-600"}`} />
                  <div>
                    <p className={`text-sm font-bold ${advCountData.total >= 3 ? "text-red-800" : advCountData.total >= 2 ? "text-amber-800" : "text-blue-800"}`}>
                      Este colaborador já possui {advCountData.total} advertência(s)
                    </p>
                    <p className={`text-xs ${advCountData.total >= 3 ? "text-red-700" : advCountData.total >= 2 ? "text-amber-700" : "text-blue-700"}`}>
                      {advCountData.proximaAcao}
                    </p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Verbais: {advCountData.verbais}</span>
                      <span>Escritas: {advCountData.escritas}</span>
                      <span>Suspensões: {advCountData.suspensoes}</span>
                    </div>
                  </div>
                </div>
                {advCountData.total >= 3 && (
                  <p className="text-xs font-bold text-red-700 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    APÓS A 3ª ADVERTÊNCIA O COLABORADOR ESTÁ APTO A RECEBER SUSPENSÃO (Art. 474 CLT)
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Tipo *</label>
              <Select value={advForm.tipoAdvertencia || ""} onValueChange={v => setAdvForm({ ...advForm, tipoAdvertencia: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verbal">Verbal</SelectItem>
                  <SelectItem value="Escrita">Escrita</SelectItem>
                  <SelectItem value="Suspensao">Suspensão</SelectItem>
                  <SelectItem value="JustaCausa">Justa Causa</SelectItem>
                  <SelectItem value="OSS">OSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data da Ocorrência *</label>
              <Input type="date" value={advForm.dataOcorrencia || ""} onChange={e => setAdvForm({ ...advForm, dataOcorrencia: e.target.value })} />
            </div>
            {advForm.tipoAdvertencia === "Suspensao" && (
              <div>
                <label className="text-sm font-medium">Dias de Suspensão *</label>
                <Input type="number" min={1} max={30} value={advForm.diasSuspensao || ""} onChange={e => setAdvForm({ ...advForm, diasSuspensao: parseInt(e.target.value) || 0 })} placeholder="1 a 30 dias (Art. 474 CLT)" />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-sm font-medium">Motivo *</label>
              <Textarea value={advForm.motivo || ""} onChange={e => setAdvForm({ ...advForm, motivo: e.target.value })} rows={2} placeholder="Descreva o motivo da advertência..." />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Descrição Detalhada</label>
              <Textarea value={advForm.descricao || ""} onChange={e => setAdvForm({ ...advForm, descricao: e.target.value })} rows={3} />
            </div>
            {advForm.tipoAdvertencia !== "Verbal" && (
            <div className="col-span-2 space-y-3">
              <label className="text-sm font-bold text-gray-700">Testemunhas</label>
              {[1, 2, 3].map(n => (
                <div key={n} className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <label className="text-xs text-muted-foreground">Nome Testemunha {n}</label>
                    <Input
                      value={advForm[`testemunha${n}Nome`] || ""}
                      onChange={e => setAdvForm({ ...advForm, [`testemunha${n}Nome`]: e.target.value })}
                      placeholder={`Nome completo da testemunha ${n}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CPF ou RG</label>
                    <Input
                      value={advForm[`testemunha${n}Doc`] || ""}
                      onChange={e => setAdvForm({ ...advForm, [`testemunha${n}Doc`]: e.target.value })}
                      placeholder="CPF ou RG"
                    />
                  </div>
                </div>
              ))}
            </div>
            )}
            {advForm.tipoAdvertencia === "Verbal" && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium">Advertência Verbal — Apenas Registro</p>
                <p className="text-xs mt-1">A advertência verbal será registrada no sistema para controle, sem necessidade de documento formal ou testemunhas.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowAdvDialog(false); setEditingAdvId(null); setAdvEmployeeCount(null); }}>Cancelar</Button>
            <Button onClick={handleSubmitAdv} disabled={createAdv.isPending || updateAdv.isPending}>
              {(createAdv.isPending || updateAdv.isPending) ? "Salvando..." : editingAdvId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: IMPORTAR ASO ===================== */}
      <FullScreenDialog open={showImportAso} onClose={() => setShowImportAso(false)} title="Importar ASOs" icon={<Upload className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
              <p className="font-medium">Como funciona:</p>
              <p>Cole os dados da planilha de ASO (formato TSV/texto tabulado) em um arquivo .txt e faça o upload.</p>
              <p className="mt-1">Colunas esperadas: Nº, Nome, Tipo, Data, Validade(dias), Status, Vencimento, Resultado, Médico, CRM, Já Atualizou, Exames</p>
            </div>
            <Input type="file" accept=".txt,.csv,.tsv" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            {importAso.data && (
              <div className="bg-green-50 p-3 rounded-lg text-sm">
                <p>Importados: <strong>{importAso.data.imported}</strong></p>
                <p>Não encontrados: <strong>{importAso.data.notFound}</strong></p>
                {importAso.data.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600">Ver erros ({importAso.data.errors.length})</summary>
                    <ul className="mt-1 text-xs">{importAso.data.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowImportAso(false)}>Fechar</Button>
            <Button onClick={handleImportAso} disabled={importAso.isPending || !importFile}>
              {importAso.isPending ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
      {/* ===================== DIALOG: VISUALIZAR DOCUMENTO CLT ===================== */}
      {/* ===================== VISUALIZAÇÃO FULL SCREEN DO DOCUMENTO ===================== */}
      {showAdvPreview && previewAdvData && (() => {
        const a = previewAdvData;
        const logoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
        const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        const tipoTitulo = a.tipoAdvertencia === "Suspensao" ? "SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "RESCISÃO POR JUSTA CAUSA" : a.tipoAdvertencia === "Escrita" ? "ADVERTÊNCIA POR ESCRITO" : "ADVERTÊNCIA VERBAL";
        const verbo = a.tipoAdvertencia === "Suspensao" ? "SUSPENDER" : a.tipoAdvertencia === "JustaCausa" ? "COMUNICAR A RESCISÃO POR JUSTA CAUSA de" : "ADVERTIR";
        const anteriores = a.anteriores || [];
        const numAdv = a.sequencia || (anteriores.length + 1);
        const testemunhasArr: {nome: string; doc: string}[] = a.testemunhasArr || ((): {nome: string; doc: string}[] => { try { return JSON.parse(a.testemunhas || "[]"); } catch { return []; } })();
        return (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Header fixo */}
            <div className="bg-[#1e3a6e] text-white px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <img src={logoUrl} alt="FC Engenharia" className="h-12 object-contain" />
                <div>
                  <h2 className="text-lg font-bold">{tipoTitulo}</h2>
                  <p className="text-xs text-blue-200">{numAdv}ª medida disciplinar — {a.nomeCompleto}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-2 bg-white text-blue-800 hover:bg-blue-50" onClick={() => {
                  const userName = authUser?.name || authUser?.username || "Usuário";
                  const dataEmissao = nowBrasilia();
                  const t1 = testemunhasArr[0] || { nome: "", doc: "" };
                  const t2 = testemunhasArr[1] || { nome: "", doc: "" };
                  const t3 = testemunhasArr[2] || { nome: "", doc: "" };
                  const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tipoTitulo}</title>
                  <style>
                    @page { size: A4 portrait; margin: 20mm 18mm 25mm 18mm; }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Times New Roman', serif; font-size: 12.5px; color: #000; line-height: 1.7; }
                    .logo-bar { background: #1e3a6e; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
                    .logo-bar img { height: 50px; }
                    .logo-bar .title { color: white; }
                    .logo-bar .title h1 { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
                    .logo-bar .title p { font-size: 10px; opacity: 0.8; }
                    .num-badge { background: #dc2626; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 4px; margin-left: auto; }
                    .doc-body { text-align: justify; padding: 0 10px; }
                    .doc-body p { margin-bottom: 14px; text-indent: 35px; }
                    .motivo-box { background: #f8f8f8; border-left: 4px solid #1e3a6e; padding: 10px 14px; margin: 14px 0; text-indent: 0 !important; font-style: italic; }
                    .historico { margin: 14px 0; text-indent: 0 !important; }
                    .historico li { margin-left: 35px; margin-bottom: 3px; }
                    .signatures { margin-top: 50px; padding: 0 10px; }
                    .sig-row { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .sig-block { text-align: center; width: 45%; }
                    .sig-block .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                    .sig-row-3 { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .sig-block-3 { text-align: center; width: 30%; }
                    .sig-block-3 .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                    .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 18mm; border-top: 2px solid #1e3a6e; font-size: 8.5px; display: flex; justify-content: space-between; background: white; }
                    .footer .lgpd { color: #dc2626; font-weight: 600; }
                  </style></head><body>
                  <div class="logo-bar">
                    <img src="${logoUrl}" alt="FC Engenharia" />
                    <div class="title"><h1>${tipoTitulo}</h1><p>FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</p></div>
                    <span class="num-badge">${numAdv}ª MEDIDA</span>
                  </div>
                  <div class="doc-body">
                    <p>Pelo presente instrumento, a empresa <strong>FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</strong>, vem por meio deste ${verbo} o(a) colaborador(a) <strong>${a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>${formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>${a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>${a.setor || "OBRA"}</strong>${a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? `, pelo período de <strong style="color: #dc2626; background: #fef2f2; padding: 2px 6px; border-radius: 3px;">${a.diasSuspensao} dia(s)</strong>, a contar de <strong style="color: #dc2626;">${a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong style="color: #dc2626;">${a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,` : ""} pelo seguinte motivo:</p>
                    <div class="motivo-box">${a.motivo}${a.descricao ? "<br/><br/>" + a.descricao : ""}</div>
                    <p>Ocorrido em <strong>${formatDate(a.dataOcorrencia)}</strong>.</p>
                    <p style="text-indent:0; font-weight:bold; color:#1e3a6e;">Esta é a ${numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>
                    ${anteriores.length > 0 ? `<p>Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p><div class="historico"><ul>${anteriores.map((prev: any, pi: number) => `<li>${pi + 1}ª ${prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em ${formatDate(prev.dataOcorrencia)} — ${prev.motivo}</li>`).join("")}</ul></div>` : ""}
                    <p>${a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}</p>
                    <p>${a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}</p>
                    <p>O(A) colaborador(a) declara estar ciente desta ${tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                    <p style="text-indent:0; margin-top: 25px;">_________________, ${todayBrasiliaLong()}.</p>
                  </div>
                  <div class="signatures">
                    <div class="sig-row">
                      <div class="sig-block"><div class="line">Empregador / Representante Legal</div></div>
                      <div class="sig-block"><div class="line">${a.nomeCompleto}<br/>Colaborador(a)</div></div>
                    </div>
                    <div class="sig-row-3">
                      <div class="sig-block-3"><div class="line">Testemunha 1${t1.nome ? "<br/><strong>" + t1.nome + "</strong>" : ""}${t1.doc ? "<br/>" + t1.doc : ""}</div></div>
                      <div class="sig-block-3"><div class="line">Testemunha 2${t2.nome ? "<br/><strong>" + t2.nome + "</strong>" : ""}${t2.doc ? "<br/>" + t2.doc : ""}</div></div>
                      <div class="sig-block-3"><div class="line">Testemunha 3${t3.nome ? "<br/><strong>" + t3.nome + "</strong>" : ""}${t3.doc ? "<br/>" + t3.doc : ""}</div></div>
                    </div>
                  </div>
                  <div class="footer">
                    <span>ERP RH & DP — FC Engenharia</span>
                    <span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span>
                    <span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                  </div>
                  </body></html>`;
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(printHtml); w.document.close(); setTimeout(() => w.print(), 500); }
                }}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                <Button size="sm" variant="outline" className="gap-2 bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={() => {
                  if (lastCreatedAdvId) handleUploadDoc("adv", lastCreatedAdvId);
                  else toast.info("Salve a advertência primeiro para anexar o documento assinado.");
                }}>
                  <Upload className="h-4 w-4" /> Upload Assinado
                </Button>
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => { setShowAdvPreview(false); setPreviewAdvData(null); setLastCreatedAdvId(null); }}>
                  <X className="h-4 w-4" /> Fechar
                </Button>
              </div>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
              <div className="max-w-[800px] mx-auto bg-white shadow-xl" style={{ fontFamily: "'Times New Roman', serif" }}>
                {/* Logo bar */}
                <div className="bg-[#1e3a6e] p-4 flex items-center gap-4">
                  <img src={logoUrl} alt="FC Engenharia" className="h-14 object-contain" />
                  <div className="text-white">
                    <h2 className="text-lg font-bold tracking-widest">{tipoTitulo}</h2>
                    <p className="text-xs text-blue-200">FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</p>
                  </div>
                  <span className="ml-auto bg-red-600 text-white text-xs font-bold px-3 py-1 rounded">{numAdv}ª MEDIDA</span>
                </div>

                {/* Corpo do documento */}
                <div className="p-8 text-justify leading-relaxed text-sm space-y-4">
                  <p className="indent-10">Pelo presente instrumento, a empresa <strong>FC ENGENHARIA PROJETOS E CONSTRUÇÕES LTDA</strong>, vem por meio deste {verbo} o(a) colaborador(a) <strong>{a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>{formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>{a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>{a.setor || "OBRA"}</strong>{a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? <>, pelo período de <strong className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{a.diasSuspensao} dia(s)</strong>, a contar de <strong className="text-red-600">{a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong className="text-red-600">{a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,</> : null} pelo seguinte motivo:</p>
                  
                  <div className="bg-gray-50 border-l-4 border-[#1e3a6e] p-4 italic">
                    <p className="font-semibold">{a.motivo}</p>
                    {a.descricao && <p className="mt-2 text-gray-600">{a.descricao}</p>}
                  </div>

                  <p className="indent-10">Ocorrido em <strong>{formatDate(a.dataOcorrencia)}</strong>.</p>

                  <p className="font-bold text-[#1e3a6e]">Esta é a {numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>

                  {anteriores.length > 0 && (
                    <>
                      <p className="indent-10">Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p>
                      <ul className="ml-10 list-disc space-y-1">
                        {anteriores.map((prev: any, pi: number) => (
                          <li key={pi}>{pi + 1}ª {prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em {formatDate(prev.dataOcorrencia)} — {prev.motivo}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <p className="indent-10">
                    {a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}
                  </p>
                  <p className="indent-10">
                    {a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}
                  </p>
                  <p className="indent-10">O(A) colaborador(a) declara estar ciente desta {tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                  <p className="mt-6">_________________, {todayBrasiliaLong()}.</p>

                  {/* Assinaturas */}
                  <div className="mt-16 space-y-12">
                    <div className="flex justify-between">
                      <div className="text-center w-[45%]"><div className="border-t border-black pt-1 text-xs">Empregador / Representante Legal</div></div>
                      <div className="text-center w-[45%]"><div className="border-t border-black pt-1 text-xs">{a.nomeCompleto}<br />Colaborador(a)</div></div>
                    </div>
                    <div className="flex justify-between">
                      {[0, 1, 2].map(i => {
                        const t = testemunhasArr[i] || { nome: "", doc: "" };
                        return (
                          <div key={i} className="text-center w-[30%]">
                            <div className="border-t border-black pt-1 text-xs">
                              Testemunha {i + 1}
                              {t.nome && <><br /><strong>{t.nome}</strong></>}
                              {t.doc && <><br />{t.doc}</>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer LGPD */}
                  <div className="mt-8 pt-3 border-t-2 border-[#1e3a6e] flex justify-between text-[9px] text-gray-500">
                    <span>ERP RH & DP — FC Engenharia</span>
                    <span>Documento gerado por: <strong>{authUser?.name || authUser?.username || "Usuário"}</strong> em {nowBrasilia()}</span>
                    <span className="text-red-600 font-semibold">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================== RAIO-X DO FUNCIONÁRIO ===================== */}
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
