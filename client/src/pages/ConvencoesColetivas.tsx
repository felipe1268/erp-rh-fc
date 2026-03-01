import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Scale, Search, Building2, Landmark, Eye, Plus, ChevronDown, ChevronUp, Pencil, Trash2, Loader2, FileUp, Brain, FileText, CheckCircle2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";
import { toast } from "sonner";

const EMPTY_FORM = {
  companyId: 0,
  obraId: 0,
  abrangencia: "sede" as "sede" | "obra",
  nome: "",
  sindicato: "",
  cnpjSindicato: "",
  dataBase: "",
  vigenciaInicio: "",
  vigenciaFim: "",
  pisoSalarial: "",
  percentualReajuste: "",
  adicionalInsalubridade: "",
  adicionalPericulosidade: "",
  horaExtraDiurna: "",
  horaExtraNoturna: "",
  horaExtraDomingo: "",
  adicionalNoturno: "",
  valeRefeicao: "",
  valeAlimentacao: "",
  valeTransporte: "",
  cestaBasica: "",
  auxilioFarmacia: "",
  planoSaude: "",
  seguroVida: "",
  outrosBeneficios: "",
  clausulasEspeciais: "",
  isMatriz: false,
  status: "vigente" as string,
  observacoes: "",
};

export default function ConvencoesColetivas() {
  const { companies, selectedCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("todas");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: convencoes, isLoading, refetch } = trpc.sprint1.convencao.listGlobal.useQuery();

  // Get obras for the selected company in the form
  const { data: obrasEmpresa } = trpc.obras.listActive.useQuery(
    { companyId: form.companyId },
    { enabled: form.companyId > 0 && dialogOpen }
  );

  const createMut = trpc.sprint1.convencao.create.useMutation({
    onSuccess: () => { toast.success("Convenção cadastrada com sucesso!"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sprint1.convencao.update.useMutation({
    onSuccess: () => { toast.success("Convenção atualizada com sucesso!"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sprint1.convencao.delete.useMutation({
    onSuccess: () => { toast.success("Convenção excluída!"); refetch(); setDeletingId(null); },
    onError: (e) => toast.error(e.message),
  });

  // PDF extraction with AI
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfExtracted, setPdfExtracted] = useState(false);
  const extractPdfMut = trpc.sprint1.convencao.extractPdf.useMutation();

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    setPdfFileName(file.name);
    setExtractingPdf(true);
    setPdfExtracted(false);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const res = await extractPdfMut.mutateAsync({
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
          });
          if (res.success && res.data) {
            const d = res.data;
            setForm(prev => ({
              ...prev,
              nome: d.nome || prev.nome,
              sindicato: d.sindicato || prev.sindicato,
              cnpjSindicato: d.cnpjSindicato || prev.cnpjSindicato,
              dataBase: d.dataBase || prev.dataBase,
              vigenciaInicio: d.vigenciaInicio || prev.vigenciaInicio,
              vigenciaFim: d.vigenciaFim || prev.vigenciaFim,
              pisoSalarial: d.pisoSalarial || prev.pisoSalarial,
              percentualReajuste: d.percentualReajuste || prev.percentualReajuste,
              adicionalInsalubridade: d.adicionalInsalubridade || prev.adicionalInsalubridade,
              adicionalPericulosidade: d.adicionalPericulosidade || prev.adicionalPericulosidade,
              horaExtraDiurna: d.horaExtraDiurna || prev.horaExtraDiurna,
              horaExtraNoturna: d.horaExtraNoturna || prev.horaExtraNoturna,
              horaExtraDomingo: d.horaExtraDomingo || prev.horaExtraDomingo,
              adicionalNoturno: d.adicionalNoturno || prev.adicionalNoturno,
              valeRefeicao: d.valeRefeicao || prev.valeRefeicao,
              valeAlimentacao: d.valeAlimentacao || prev.valeAlimentacao,
              valeTransporte: d.valeTransporte || prev.valeTransporte,
              cestaBasica: d.cestaBasica || prev.cestaBasica,
              auxilioFarmacia: d.auxilioFarmacia || prev.auxilioFarmacia,
              planoSaude: d.planoSaude || prev.planoSaude,
              seguroVida: d.seguroVida || prev.seguroVida,
              outrosBeneficios: d.outrosBeneficios || prev.outrosBeneficios,
              clausulasEspeciais: d.clausulasEspeciais || prev.clausulasEspeciais,
              observacoes: d.observacoes || prev.observacoes,
            }));
            // Store documentoUrl for saving
            if (res.documentoUrl) {
              (window as any).__convencaoDocUrl = res.documentoUrl;
            }
            setPdfExtracted(true);
            toast.success("PDF analisado com sucesso! Campos preenchidos automaticamente pela IA.");
          } else {
            toast.error(res.error || "Erro ao processar PDF.");
          }
        } catch (err: any) {
          toast.error("Erro ao enviar PDF para análise: " + (err.message || "erro desconhecido"));
        } finally {
          setExtractingPdf(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Erro ao ler o arquivo.");
      setExtractingPdf(false);
    }
    // Reset input
    e.target.value = '';
  };

  // CNPJ lookup
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0,2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8)}`;
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  };

  const lookupCnpj = useCallback(async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.ok) {
        const data = await res.json();
        const nome = data.razao_social || data.nome_fantasia || "";
        if (nome) {
          setForm(prev => ({ ...prev, sindicato: nome }));
          toast.success(`Sindicato encontrado: ${nome}`);
        }
      } else {
        toast.error("CNPJ não encontrado na base da Receita Federal");
      }
    } catch {
      toast.error("Erro ao consultar CNPJ");
    } finally {
      setBuscandoCnpj(false);
    }
  }, []);

  const handleCnpjChange = (value: string) => {
    const formatted = formatCnpj(value);
    setField("cnpjSindicato", formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 14) {
      lookupCnpj(formatted);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setPdfFileName(null);
    setPdfExtracted(false);
    (window as any).__convencaoDocUrl = undefined;
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, companyId: selectedCompanyId || 0 });
    setDialogOpen(true);
  };

  const openEdit = (conv: any) => {
    setEditingId(conv.id);
    setForm({
      companyId: conv.companyId,
      obraId: conv.obraId || 0,
      abrangencia: conv.obraId ? "obra" : "sede",
      nome: conv.nome || "",
      sindicato: conv.sindicato || "",
      cnpjSindicato: conv.cnpjSindicato || "",
      dataBase: conv.dataBase || "",
      vigenciaInicio: conv.vigenciaInicio || "",
      vigenciaFim: conv.vigenciaFim || "",
      pisoSalarial: conv.pisoSalarial || "",
      percentualReajuste: conv.percentualReajuste || "",
      adicionalInsalubridade: conv.adicionalInsalubridade || "",
      adicionalPericulosidade: conv.adicionalPericulosidade || "",
      horaExtraDiurna: conv.horaExtraDiurna || "",
      horaExtraNoturna: conv.horaExtraNoturna || "",
      horaExtraDomingo: conv.horaExtraDomingo || "",
      adicionalNoturno: conv.adicionalNoturno || "",
      valeRefeicao: conv.valeRefeicao || "",
      valeAlimentacao: conv.valeAlimentacao || "",
      valeTransporte: conv.valeTransporte || "",
      cestaBasica: conv.cestaBasica || "",
      auxilioFarmacia: conv.auxilioFarmacia || "",
      planoSaude: conv.planoSaude || "",
      seguroVida: conv.seguroVida || "",
      outrosBeneficios: conv.outrosBeneficios || "",
      clausulasEspeciais: conv.clausulasEspeciais || "",
      isMatriz: conv.isMatriz || false,
      status: conv.status || "vigente",
      observacoes: conv.observacoes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.companyId) { toast.error("Selecione a empresa"); return; }
    if (!form.nome.trim()) { toast.error("Nome da convenção é obrigatório"); return; }

    const payload: any = {
      companyId: Number(form.companyId),
      nome: form.nome,
      sindicato: form.sindicato || undefined,
      cnpjSindicato: form.cnpjSindicato || undefined,
      dataBase: form.dataBase || undefined,
      vigenciaInicio: form.vigenciaInicio || undefined,
      vigenciaFim: form.vigenciaFim || undefined,
      pisoSalarial: form.pisoSalarial || undefined,
      percentualReajuste: form.percentualReajuste || undefined,
      adicionalInsalubridade: form.adicionalInsalubridade || undefined,
      adicionalPericulosidade: form.adicionalPericulosidade || undefined,
      horaExtraDiurna: form.horaExtraDiurna || undefined,
      horaExtraNoturna: form.horaExtraNoturna || undefined,
      horaExtraDomingo: form.horaExtraDomingo || undefined,
      adicionalNoturno: form.adicionalNoturno || undefined,
      valeRefeicao: form.valeRefeicao || undefined,
      valeAlimentacao: form.valeAlimentacao || undefined,
      valeTransporte: form.valeTransporte || undefined,
      cestaBasica: form.cestaBasica || undefined,
      auxilioFarmacia: form.auxilioFarmacia || undefined,
      planoSaude: form.planoSaude || undefined,
      seguroVida: form.seguroVida || undefined,
      outrosBeneficios: form.outrosBeneficios || undefined,
      clausulasEspeciais: form.clausulasEspeciais || undefined,
      isMatriz: form.isMatriz,
      status: form.status as any,
      observacoes: form.observacoes || undefined,
      obraId: form.abrangencia === "obra" && form.obraId > 0 ? Number(form.obraId) : undefined,
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const filtered = useMemo(() => {
    if (!convencoes) return [];
    return convencoes.filter((c: any) => {
      if (filtroEmpresa !== "todas" && String(c.companyId) !== filtroEmpresa) return false;
      if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
      if (filtroTipo === "sede" && c.obraId) return false;
      if (filtroTipo === "obra" && !c.obraId) return false;
      if (search) {
        const term = removeAccents(search.toLowerCase());
        const nome = removeAccents((c.nome || "").toLowerCase());
        const sindicato = removeAccents((c.sindicato || "").toLowerCase());
        const empresa = removeAccents((c.nomeEmpresa || "").toLowerCase());
        const obra = removeAccents((c.nomeObra || "").toLowerCase());
        if (!nome.includes(term) && !sindicato.includes(term) && !empresa.includes(term) && !obra.includes(term)) return false;
      }
      return true;
    });
  }, [convencoes, search, filtroEmpresa, filtroStatus, filtroTipo]);

  const stats = useMemo(() => {
    if (!convencoes) return { total: 0, vigentes: 0, vencidas: 0, negociacao: 0, sede: 0, obra: 0 };
    return {
      total: convencoes.length,
      vigentes: convencoes.filter((c: any) => c.status === "vigente").length,
      vencidas: convencoes.filter((c: any) => c.status === "vencida").length,
      negociacao: convencoes.filter((c: any) => c.status === "em_negociacao").length,
      sede: convencoes.filter((c: any) => !c.obraId).length,
      obra: convencoes.filter((c: any) => !!c.obraId).length,
    };
  }, [convencoes]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      vigente: { label: "Vigente", cls: "bg-green-100 text-green-700" },
      vencida: { label: "Vencida", cls: "bg-red-100 text-red-700" },
      em_negociacao: { label: "Em Negociação", cls: "bg-amber-100 text-amber-700" },
    };
    const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
    return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${s.cls}`}>{s.label}</span>;
  };

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Scale className="h-6 w-6 text-indigo-600" />
              Convenções Coletivas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão geral de todas as convenções coletivas cadastradas nas empresas
            </p>
          </div>
          <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" /> Nova Convenção
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.vigentes}</p>
            <p className="text-[11px] text-muted-foreground">Vigentes</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
            <p className="text-[11px] text-muted-foreground">Vencidas</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.negociacao}</p>
            <p className="text-[11px] text-muted-foreground">Em Negociação</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.sede}</p>
            <p className="text-[11px] text-muted-foreground">Sede</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.obra}</p>
            <p className="text-[11px] text-muted-foreground">Por Obra</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, sindicato, empresa ou obra..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Empresas</SelectItem>
                {(companies || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="em_negociacao">Em Negociação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="sede">Padrão (Sede)</SelectItem>
                <SelectItem value="obra">Por Obra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Carregando convenções...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma convenção encontrada</p>
            <p className="text-xs mt-1">Clique em "Nova Convenção" para cadastrar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conv: any) => {
              const isExpanded = expandedId === conv.id;
              return (
                <div key={conv.id} className="bg-white border rounded-lg overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{conv.nome}</p>
                          {!conv.obraId ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">SEDE</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">OBRA</span>
                          )}
                          {conv.isMatriz ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full">MATRIZ</span>
                          ) : null}
                          {statusBadge(conv.status)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {conv.nomeEmpresa}
                          </span>
                          {conv.nomeObra ? (
                            <span className="flex items-center gap-1">
                              <Landmark className="h-3 w-3" /> {conv.nomeObra}
                            </span>
                          ) : null}
                          {conv.sindicato ? <span>{conv.sindicato}</span> : null}
                          {conv.vigenciaInicio && conv.vigenciaFim ? (
                            <span>
                              Vigência: {new Date(conv.vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")} a {new Date(conv.vigenciaFim + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={(e) => { e.stopPropagation(); openEdit(conv); }}>
                          <Pencil className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" onClick={(e) => { e.stopPropagation(); setDeletingId(conv.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                        {conv.documentoUrl ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver Documento" onClick={(e) => { e.stopPropagation(); window.open(conv.documentoUrl, "_blank"); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t px-4 pb-4 pt-3 bg-muted/10">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                        <DetailItem label="Piso Salarial" value={conv.pisoSalarial ? `R$ ${conv.pisoSalarial}` : null} />
                        <DetailItem label="Reajuste" value={conv.percentualReajuste ? `${conv.percentualReajuste}%` : null} />
                        <DetailItem label="Data Base" value={conv.dataBase} />
                        <DetailItem label="Adic. Insalubridade" value={conv.adicionalInsalubridade ? `${conv.adicionalInsalubridade}%` : null} />
                        <DetailItem label="Adic. Periculosidade" value={conv.adicionalPericulosidade ? `${conv.adicionalPericulosidade}%` : null} />
                        <DetailItem label="HE Diurna" value={conv.horaExtraDiurna ? `${conv.horaExtraDiurna}%` : null} />
                        <DetailItem label="HE Noturna" value={conv.horaExtraNoturna ? `${conv.horaExtraNoturna}%` : null} />
                        <DetailItem label="HE Domingo" value={conv.horaExtraDomingo ? `${conv.horaExtraDomingo}%` : null} />
                        <DetailItem label="Adic. Noturno" value={conv.adicionalNoturno ? `${conv.adicionalNoturno}%` : null} />
                        <DetailItem label="Vale Refeição" value={conv.valeRefeicao ? `R$ ${conv.valeRefeicao}` : null} />
                        <DetailItem label="Vale Alimentação" value={conv.valeAlimentacao ? `R$ ${conv.valeAlimentacao}` : null} />
                        <DetailItem label="Vale Transporte" value={conv.valeTransporte ? `R$ ${conv.valeTransporte}` : null} />
                        <DetailItem label="Cesta Básica" value={conv.cestaBasica ? `R$ ${conv.cestaBasica}` : null} />
                        <DetailItem label="Auxílio Farmácia" value={conv.auxilioFarmacia ? `R$ ${conv.auxilioFarmacia}` : null} />
                        <DetailItem label="Seguro de Vida" value={conv.seguroVida ? `R$ ${conv.seguroVida}` : null} />
                        <DetailItem label="Plano de Saúde" value={conv.planoSaude} className="sm:col-span-2" />
                      </div>
                      {conv.outrosBeneficios ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Outros Benefícios</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.outrosBeneficios}</p>
                        </div>
                      ) : null}
                      {conv.clausulasEspeciais ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Cláusulas Especiais</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.clausulasEspeciais}</p>
                        </div>
                      ) : null}
                      {conv.observacoes ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Observações</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.observacoes}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog Nova/Editar Convenção */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none" style={{ top: 0, left: 0, transform: 'none', display: 'flex', flexDirection: 'column' }}>
          <DialogHeader className="border-b pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Scale className="h-6 w-6 text-indigo-600" />
              {editingId ? "Editar Convenção Coletiva" : "Nova Convenção Coletiva"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
            {/* Empresa e Abrangência */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold">Empresa *</Label>
                <Select value={form.companyId ? String(form.companyId) : "0"} onValueChange={v => setField("companyId", Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0" disabled>Selecione a empresa</SelectItem>
                    {(companies || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Abrangência</Label>
                <Select value={form.abrangencia} onValueChange={v => { setField("abrangencia", v); if (v === "sede") setField("obraId", 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sede">Padrão (Sede)</SelectItem>
                    <SelectItem value="obra">Por Obra/Região</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.abrangencia === "obra" && (
                <div>
                  <Label className="text-xs font-semibold">Obra</Label>
                  <Select value={form.obraId ? String(form.obraId) : "0"} onValueChange={v => setField("obraId", Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0" disabled>Selecione a obra</SelectItem>
                      {(obrasEmpresa || []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Upload PDF com IA */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2.5 rounded-lg">
                    <Brain className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900">Importar PDF com IA</p>
                    <p className="text-xs text-indigo-600">Faça upload do PDF da convenção e a IA preencherá os campos automaticamente</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {pdfExtracted && (
                    <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Campos preenchidos
                    </div>
                  )}
                  {extractingPdf ? (
                    <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                      <span className="text-xs font-medium text-indigo-700">Analisando PDF com IA...</span>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                      <div className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 transition-colors">
                        <FileUp className="h-4 w-4" />
                        <span className="text-xs font-medium">{pdfFileName ? "Trocar PDF" : "Selecionar PDF"}</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>
              {pdfFileName && (
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-700">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{pdfFileName}</span>
                </div>
              )}
            </div>

            {/* Dados Principais */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">Dados Principais</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-4">
                  <Label className="text-xs font-semibold">Nome da Convenção *</Label>
                  <Input value={form.nome} onChange={e => setField("nome", e.target.value)} placeholder="Ex: CCT Construção Civil 2024/2025" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">Sindicato {buscandoCnpj && <span className="text-blue-500 text-[10px]">(buscando...)</span>}</Label>
                  <Input value={form.sindicato} onChange={e => setField("sindicato", e.target.value)} placeholder="Nome do sindicato" className={buscandoCnpj ? "animate-pulse bg-blue-50" : ""} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">CNPJ do Sindicato</Label>
                  <div className="relative">
                    <Input value={form.cnpjSindicato} onChange={e => handleCnpjChange(e.target.value)} placeholder="00.000.000/0000-00" />
                    {buscandoCnpj && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-blue-500" />}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Data Base</Label>
                  <Input value={form.dataBase} onChange={e => setField("dataBase", e.target.value)} placeholder="Ex: Maio" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select value={form.status} onValueChange={v => setField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vigente">Vigente</SelectItem>
                      <SelectItem value="vencida">Vencida</SelectItem>
                      <SelectItem value="em_negociacao">Em Negociação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Vigência Início</Label>
                  <Input type="date" value={form.vigenciaInicio} onChange={e => setField("vigenciaInicio", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Vigência Fim</Label>
                  <Input type="date" value={form.vigenciaFim} onChange={e => setField("vigenciaFim", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Valores */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">Valores e Percentuais</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                <div>
                  <Label className="text-[11px]">Piso Salarial (R$)</Label>
                  <Input value={form.pisoSalarial} onChange={e => setField("pisoSalarial", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Reajuste (%)</Label>
                  <Input value={form.percentualReajuste} onChange={e => setField("percentualReajuste", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-[11px]">Adic. Insalubridade (%)</Label>
                  <Input value={form.adicionalInsalubridade} onChange={e => setField("adicionalInsalubridade", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-[11px]">Adic. Periculosidade (%)</Label>
                  <Input value={form.adicionalPericulosidade} onChange={e => setField("adicionalPericulosidade", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-[11px]">HE Diurna (%)</Label>
                  <Input value={form.horaExtraDiurna} onChange={e => setField("horaExtraDiurna", e.target.value)} placeholder="50" />
                </div>
                <div>
                  <Label className="text-[11px]">HE Noturna (%)</Label>
                  <Input value={form.horaExtraNoturna} onChange={e => setField("horaExtraNoturna", e.target.value)} placeholder="70" />
                </div>
                <div>
                  <Label className="text-[11px]">HE Domingo (%)</Label>
                  <Input value={form.horaExtraDomingo} onChange={e => setField("horaExtraDomingo", e.target.value)} placeholder="100" />
                </div>
                <div>
                  <Label className="text-[11px]">Adic. Noturno (%)</Label>
                  <Input value={form.adicionalNoturno} onChange={e => setField("adicionalNoturno", e.target.value)} placeholder="20" />
                </div>
              </div>
            </div>

            {/* Benefícios */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">Benefícios</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-[11px]">Vale Refeição (R$)</Label>
                  <Input value={form.valeRefeicao} onChange={e => setField("valeRefeicao", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Vale Alimentação (R$)</Label>
                  <Input value={form.valeAlimentacao} onChange={e => setField("valeAlimentacao", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Vale Transporte (R$)</Label>
                  <Input value={form.valeTransporte} onChange={e => setField("valeTransporte", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Cesta Básica (R$)</Label>
                  <Input value={form.cestaBasica} onChange={e => setField("cestaBasica", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Auxílio Farmácia (R$)</Label>
                  <Input value={form.auxilioFarmacia} onChange={e => setField("auxilioFarmacia", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[11px]">Seguro de Vida (R$)</Label>
                  <Input value={form.seguroVida} onChange={e => setField("seguroVida", e.target.value)} placeholder="0,00" />
                </div>
                <div className="sm:col-span-3 lg:col-span-4">
                  <Label className="text-[11px]">Plano de Saúde</Label>
                  <Input value={form.planoSaude} onChange={e => setField("planoSaude", e.target.value)} placeholder="Detalhes do plano" />
                </div>
              </div>
            </div>

            {/* Campos texto */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">Informações Adicionais</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold">Outros Benefícios</Label>
                <textarea className="w-full border rounded-md p-2 text-sm min-h-[60px]" value={form.outrosBeneficios} onChange={e => setField("outrosBeneficios", e.target.value)} placeholder="Descreva outros benefícios previstos..." />
              </div>
              <div>
                <Label className="text-xs font-semibold">Cláusulas Especiais</Label>
                <textarea className="w-full border rounded-md p-2 text-sm min-h-[60px]" value={form.clausulasEspeciais} onChange={e => setField("clausulasEspeciais", e.target.value)} placeholder="Cláusulas relevantes..." />
              </div>
              <div>
                <Label className="text-xs font-semibold">Observações</Label>
                <textarea className="w-full border rounded-md p-2 text-sm min-h-[60px]" value={form.observacoes} onChange={e => setField("observacoes", e.target.value)} placeholder="Observações gerais..." />
              </div>
            </div>

            {/* Checkbox Matriz */}
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="isMatriz" checked={form.isMatriz} onChange={e => setField("isMatriz", e.target.checked)} className="rounded" />
              <Label htmlFor="isMatriz" className="text-xs cursor-pointer">Convenção da Matriz (referência principal)</Label>
            </div>
          </div>

          <DialogFooter className="border-t pt-4 shrink-0">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Excluir Convenção
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta convenção coletiva? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (deletingId) deleteMut.mutate({ id: deletingId }); }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}

function DetailItem({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}
