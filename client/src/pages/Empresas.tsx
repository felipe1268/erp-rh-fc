import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Building2, Plus, Pencil, Trash2, Search, Loader2, Star, Upload, ImageIcon, FileText, Shield, Landmark, Eye, Download, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useDefaultCompany } from "@/hooks/useDefaultCompany";
import { formatCNPJ, formatTelefone } from "@/lib/formatters";

type CompanyForm = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
};

const emptyForm: CompanyForm = {
  cnpj: "", razaoSocial: "", nomeFantasia: "", endereco: "",
  cidade: "", estado: "", cep: "", telefone: "", email: "",
  inscricaoEstadual: "", inscricaoMunicipal: "",
};

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

const DOC_TYPES = [
  { value: "PGR", label: "PGR - Programa de Gerenciamento de Riscos" },
  { value: "PCMSO", label: "PCMSO - Programa de Controle Médico" },
  { value: "LTCAT", label: "LTCAT - Laudo Técnico Condições Ambientais" },
  { value: "AET", label: "AET - Análise Ergonômica do Trabalho" },
  { value: "LAUDO_INSALUBRIDADE", label: "Laudo de Insalubridade" },
  { value: "LAUDO_PERICULOSIDADE", label: "Laudo de Periculosidade" },
  { value: "ALVARA", label: "Alvará de Funcionamento" },
  { value: "CONTRATO_SOCIAL", label: "Contrato Social" },
  { value: "CNPJ_CARTAO", label: "Cartão CNPJ" },
  { value: "CERTIDAO_NEGATIVA", label: "Certidão Negativa de Débitos" },
  { value: "OUTRO", label: "Outro" },
] as const;

const DOC_STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  vigente: { label: "Vigente", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  vencido: { label: "Vencido", color: "text-red-600 bg-red-50", icon: AlertTriangle },
  pendente: { label: "Pendente", color: "text-amber-600 bg-amber-50", icon: Clock },
  em_renovacao: { label: "Em Renovação", color: "text-blue-600 bg-blue-50", icon: Clock },
};

type DocForm = {
  tipo: string;
  nome: string;
  descricao: string;
  dataEmissao: string;
  dataValidade: string;
  elaboradoPor: string;
  status: string;
  observacoes: string;
};

const emptyDocForm: DocForm = {
  tipo: "", nome: "", descricao: "", dataEmissao: "", dataValidade: "",
  elaboradoPor: "", status: "pendente", observacoes: "",
};

type ConvForm = {
  nome: string;
  sindicato: string;
  cnpjSindicato: string;
  dataBase: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  pisoSalarial: string;
  percentualReajuste: string;
  adicionalInsalubridade: string;
  adicionalPericulosidade: string;
  horaExtraDiurna: string;
  horaExtraNoturna: string;
  horaExtraDomingo: string;
  adicionalNoturno: string;
  valeRefeicao: string;
  valeAlimentacao: string;
  valeTransporte: string;
  cestaBasica: string;
  auxilioFarmacia: string;
  planoSaude: string;
  seguroVida: string;
  outrosBeneficios: string;
  clausulasEspeciais: string;
  isMatriz: boolean;
  status: string;
  observacoes: string;
  obraId: number | null;
};

const emptyConvForm: ConvForm = {
  nome: "", sindicato: "", cnpjSindicato: "", dataBase: "",
  vigenciaInicio: "", vigenciaFim: "", pisoSalarial: "", percentualReajuste: "",
  adicionalInsalubridade: "", adicionalPericulosidade: "",
  horaExtraDiurna: "", horaExtraNoturna: "", horaExtraDomingo: "", adicionalNoturno: "",
  valeRefeicao: "", valeAlimentacao: "", valeTransporte: "", cestaBasica: "",
  auxilioFarmacia: "", planoSaude: "", seguroVida: "",
  outrosBeneficios: "", clausulasEspeciais: "",
  isMatriz: false, status: "vigente", observacoes: "", obraId: null,
};

export default function Empresas() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const { defaultCompanyId, setDefaultCompany, clearDefaultCompany, isDefault } = useDefaultCompany();
  const [dialogTab, setDialogTab] = useState<"dados" | "documentos" | "convencao">("dados");

  // Doc states
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [docForm, setDocForm] = useState<DocForm>(emptyDocForm);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  // Conv states
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [editingConvId, setEditingConvId] = useState<number | null>(null);
  const [convForm, setConvForm] = useState<ConvForm>(emptyConvForm);
  const convFileRef = useRef<HTMLInputElement>(null);
  const [convFile, setConvFile] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: companies, isLoading } = trpc.companies.list.useQuery();
  const createMut = trpc.companies.create.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); setDialogOpen(false); toast.success("Empresa cadastrada com sucesso!"); },
    onError: (e: any) => toast.error("Erro ao cadastrar: " + e.message),
  });
  const updateMut = trpc.companies.update.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); setDialogOpen(false); toast.success("Empresa atualizada!"); },
    onError: (e: any) => toast.error("Erro ao atualizar: " + e.message),
  });
  const deleteMut = trpc.companies.delete.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); toast.success("Empresa excluída!"); },
    onError: (e: any) => toast.error("Erro ao excluir: " + e.message),
  });
  const uploadLogoMut = trpc.companies.uploadLogo.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); toast.success("Logo atualizado com sucesso!"); },
    onError: (e: any) => toast.error("Erro ao enviar logo: " + e.message),
  });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoCompanyId, setLogoCompanyId] = useState<number | null>(null);

  // Company Docs queries
  const { data: companyDocs } = trpc.sprint1.companyDocs.list.useQuery(
    { companyId: editingId! },
    { enabled: !!editingId && dialogOpen }
  );
  const createDocMut = trpc.sprint1.companyDocs.create.useMutation({
    onSuccess: () => { utils.sprint1.companyDocs.list.invalidate(); setDocDialogOpen(false); toast.success("Documento cadastrado!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  const updateDocMut = trpc.sprint1.companyDocs.update.useMutation({
    onSuccess: () => { utils.sprint1.companyDocs.list.invalidate(); setDocDialogOpen(false); toast.success("Documento atualizado!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  const deleteDocMut = trpc.sprint1.companyDocs.delete.useMutation({
    onSuccess: () => { utils.sprint1.companyDocs.list.invalidate(); toast.success("Documento excluído!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Obras query for convencao obra selector
  const { data: obrasEmpresa } = trpc.obras.listActive.useQuery(
    { companyId: editingId! },
    { enabled: !!editingId && dialogOpen }
  );

  // Convencao queries
  const { data: convencoes } = trpc.sprint1.convencao.list.useQuery(
    { companyId: editingId! },
    { enabled: !!editingId && dialogOpen }
  );
  const createConvMut = trpc.sprint1.convencao.create.useMutation({
    onSuccess: () => { utils.sprint1.convencao.list.invalidate(); setConvDialogOpen(false); toast.success("Convenção cadastrada!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  const updateConvMut = trpc.sprint1.convencao.update.useMutation({
    onSuccess: () => { utils.sprint1.convencao.list.invalidate(); setConvDialogOpen(false); toast.success("Convenção atualizada!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  const deleteConvMut = trpc.sprint1.convencao.delete.useMutation({
    onSuccess: () => { utils.sprint1.convencao.list.invalidate(); toast.success("Convenção excluída!"); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, companyId: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogoMut.mutate({ companyId, base64, mimeType: file.type, fileName: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const fetchCnpjData = useCallback(async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        razaoSocial: data.razao_social ?? prev.razaoSocial,
        nomeFantasia: data.nome_fantasia ?? prev.nomeFantasia,
        endereco: [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", ") || prev.endereco,
        cidade: data.municipio ?? prev.cidade,
        estado: data.uf ?? prev.estado,
        cep: data.cep ? data.cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : prev.cep,
        telefone: data.ddd_telefone_1 ? formatPhone(data.ddd_telefone_1) : prev.telefone,
        email: data.email && data.email !== "" ? data.email.toLowerCase() : prev.email,
      }));
      toast.success("Dados do CNPJ carregados automaticamente!");
    } catch {
      toast.error("Não foi possível buscar os dados do CNPJ. Preencha manualmente.");
    } finally {
      setCnpjLoading(false);
    }
  }, []);

  const handleCnpjChange = (value: string) => {
    const formatted = formatCnpj(value);
    setForm(prev => ({ ...prev, cnpj: formatted }));
    const digits = value.replace(/\D/g, "");
    if (digits.length === 14) {
      fetchCnpjData(digits);
    }
  };

  const handleSubmit = () => {
    if (!form.cnpj || !form.razaoSocial) {
      toast.error("CNPJ e Razão Social são obrigatórios.");
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const openEdit = (company: any) => {
    setEditingId(company.id);
    setForm({
      cnpj: company.cnpj ?? "",
      razaoSocial: company.razaoSocial ?? "",
      nomeFantasia: company.nomeFantasia ?? "",
      endereco: company.endereco ?? "",
      cidade: company.cidade ?? "",
      estado: company.estado ?? "",
      cep: company.cep ?? "",
      telefone: company.telefone ?? "",
      email: company.email ?? "",
      inscricaoEstadual: company.inscricaoEstadual ?? "",
      inscricaoMunicipal: company.inscricaoMunicipal ?? "",
    });
    setDialogTab("dados");
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogTab("dados");
    setDialogOpen(true);
  };

  const toggleDefault = (companyId: number) => {
    const id = String(companyId);
    if (isDefault(id)) {
      clearDefaultCompany();
      toast.info("Empresa padrão removida.");
    } else {
      setDefaultCompany(id);
      const company = companies?.find(c => c.id === companyId);
      toast.success(`"${company?.nomeFantasia || company?.razaoSocial}" definida como empresa padrão!`);
    }
  };

  const set = (field: keyof CompanyForm, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const setDoc = (field: keyof DocForm, value: string) => setDocForm(prev => ({ ...prev, [field]: value }));
  const setConv = (field: keyof ConvForm, value: any) => setConvForm(prev => ({ ...prev, [field]: value }));

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo deve ter no máximo 10MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setDocFile({ base64: (reader.result as string).split(",")[1], mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleConvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo deve ter no máximo 10MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setConvFile({ base64: (reader.result as string).split(",")[1], mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDocSubmit = () => {
    if (!docForm.tipo || !docForm.nome) {
      toast.error("Tipo e nome do documento são obrigatórios.");
      return;
    }
    const payload: any = {
      companyId: editingId!,
      ...docForm,
    };
    if (docFile) {
      payload.documentoBase64 = docFile.base64;
      payload.documentoMimeType = docFile.mimeType;
      payload.documentoNomeOriginal = docFile.name;
    }
    if (editingDocId) {
      updateDocMut.mutate({ id: editingDocId, ...payload });
    } else {
      createDocMut.mutate(payload);
    }
  };

  const handleConvSubmit = () => {
    if (!convForm.nome) {
      toast.error("Nome da convenção é obrigatório.");
      return;
    }
    const { obraId, ...convFormRest } = convForm;
    const payload: any = {
      companyId: editingId!,
      ...convFormRest,
      obraId: obraId && obraId > 0 ? obraId : undefined,
    };
    if (convFile) {
      payload.documentoBase64 = convFile.base64;
      payload.documentoMimeType = convFile.mimeType;
      payload.documentoNomeOriginal = convFile.name;
    }
    if (editingConvId) {
      updateConvMut.mutate({ id: editingConvId, ...payload });
    } else {
      createConvMut.mutate(payload);
    }
  };

  const openDocEdit = (doc: any) => {
    setEditingDocId(doc.id);
    setDocForm({
      tipo: doc.tipo ?? "",
      nome: doc.nome ?? "",
      descricao: doc.descricao ?? "",
      dataEmissao: doc.dataEmissao ?? "",
      dataValidade: doc.dataValidade ?? "",
      elaboradoPor: doc.elaboradoPor ?? "",
      status: doc.status ?? "pendente",
      observacoes: doc.observacoes ?? "",
    });
    setDocFile(null);
    setDocDialogOpen(true);
  };

  const openConvEdit = (conv: any) => {
    setEditingConvId(conv.id);
    setConvForm({
      nome: conv.nome ?? "",
      sindicato: conv.sindicato ?? "",
      cnpjSindicato: conv.cnpjSindicato ?? "",
      dataBase: conv.dataBase ?? "",
      vigenciaInicio: conv.vigenciaInicio ?? "",
      vigenciaFim: conv.vigenciaFim ?? "",
      pisoSalarial: conv.pisoSalarial ?? "",
      percentualReajuste: conv.percentualReajuste ?? "",
      adicionalInsalubridade: conv.adicionalInsalubridade ?? "",
      adicionalPericulosidade: conv.adicionalPericulosidade ?? "",
      horaExtraDiurna: conv.horaExtraDiurna ?? "",
      horaExtraNoturna: conv.horaExtraNoturna ?? "",
      horaExtraDomingo: conv.horaExtraDomingo ?? "",
      adicionalNoturno: conv.adicionalNoturno ?? "",
      valeRefeicao: conv.valeRefeicao ?? "",
      valeAlimentacao: conv.valeAlimentacao ?? "",
      valeTransporte: conv.valeTransporte ?? "",
      cestaBasica: conv.cestaBasica ?? "",
      auxilioFarmacia: conv.auxilioFarmacia ?? "",
      planoSaude: conv.planoSaude ?? "",
      seguroVida: conv.seguroVida ?? "",
      outrosBeneficios: conv.outrosBeneficios ?? "",
      clausulasEspeciais: conv.clausulasEspeciais ?? "",
      isMatriz: !!conv.isMatriz,
      status: conv.status ?? "vigente",
      observacoes: conv.observacoes ?? "",
      obraId: conv.obraId ?? null,
    });
    setConvFile(null);
    setConvDialogOpen(true);
  };

  // Docs summary
  const docsSummary = useMemo(() => {
    if (!companyDocs) return { total: 0, vigentes: 0, vencidos: 0, pendentes: 0 };
    return {
      total: companyDocs.length,
      vigentes: companyDocs.filter((d: any) => d.status === "vigente").length,
      vencidos: companyDocs.filter((d: any) => d.status === "vencido").length,
      pendentes: companyDocs.filter((d: any) => d.status === "pendente" || d.status === "em_renovacao").length,
    };
  }, [companyDocs]);

  const tabs = [
    { key: "dados" as const, label: "Dados Cadastrais", icon: Building2 },
    ...(editingId ? [
      { key: "documentos" as const, label: "Documentos Regulatórios", icon: Shield },
      { key: "convencao" as const, label: "Convenção Coletiva", icon: Landmark },
    ] : []),
  ];

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie as empresas do grupo</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Empresas" />
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Empresa
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="bg-card border-border animate-pulse">
                <CardContent className="h-32" />
              </Card>
            ))}
          </div>
        ) : companies && companies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map(c => {
              const isDefaultCompany = isDefault(c.id);
              return (
                <Card key={c.id} className={`bg-card group relative ${isDefaultCompany ? "border-primary/50 ring-1 ring-primary/20" : "border-border"}`}>
                  {isDefaultCompany ? (
                    <div className="absolute top-0 left-0 right-0 bg-primary/10 text-primary text-[10px] font-semibold text-center py-0.5 rounded-t-lg uppercase tracking-wider">
                      Empresa Padrão
                    </div>
                  ) : null}
                  <CardHeader className={`flex flex-row items-start justify-between pb-2 ${isDefaultCompany ? "pt-7" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden relative group/logo cursor-pointer"
                        onClick={() => { setLogoCompanyId(c.id); logoInputRef.current?.click(); }}
                        title="Clique para alterar o logo"
                      >
                        {(c as any).logoUrl ? (
                          <img src={(c as any).logoUrl} alt="Logo" className="h-full w-full object-contain" />
                        ) : (
                          <Building2 className="h-5 w-5 text-primary" />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                          <Upload className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{c.nomeFantasia || c.razaoSocial}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatCNPJ(c.cnpj)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${isDefaultCompany ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground/40 hover:text-yellow-500 opacity-0 group-hover:opacity-100"} transition-all`}
                        onClick={() => toggleDefault(c.id)}
                        title={isDefaultCompany ? "Remover como padrão" : "Definir como empresa padrão"}
                      >
                        <Star className={`h-4 w-4 ${isDefaultCompany ? "fill-yellow-500" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta empresa?")) deleteMut.mutate({ id: c.id });
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    {c.razaoSocial ? <p>{c.razaoSocial}</p> : null}
                    {c.cidade ? <p>{c.cidade}{c.estado ? ` - ${c.estado}` : ""}</p> : null}
                    {c.telefone ? <p>{formatTelefone(c.telefone)}</p> : null}
                    {c.email ? <p>{c.email}</p> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma empresa cadastrada</h3>
              <p className="text-muted-foreground text-sm mb-4">Cadastre a primeira empresa para começar.</p>
              <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Empresa</Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* FullScreen Dialog with Tabs */}
      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Empresa" : "Nova Empresa"} icon={<Building2 className="h-5 w-5 text-white" />}>
        <div className="w-full">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setDialogTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  dialogTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Dados Cadastrais */}
          {dialogTab === "dados" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <div className="sm:col-span-2">
                  <Label>CNPJ *</Label>
                  <div className="relative">
                    <Input
                      value={form.cnpj}
                      onChange={e => handleCnpjChange(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="bg-input pr-10"
                      maxLength={18}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {cnpjLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Search className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cnpjLoading ? "Buscando dados do CNPJ..." : "Digite o CNPJ completo para preencher automaticamente"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Razão Social *</Label>
                  <Input value={form.razaoSocial} onChange={e => set("razaoSocial", e.target.value)} placeholder="Razão Social" className="bg-input" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Nome Fantasia</Label>
                  <Input value={form.nomeFantasia} onChange={e => set("nomeFantasia", e.target.value)} placeholder="Nome Fantasia" className="bg-input" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.endereco} onChange={e => set("endereco", e.target.value)} placeholder="Endereço completo" className="bg-input" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={e => set("cidade", e.target.value)} placeholder="Cidade" className="bg-input" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>UF</Label>
                    <Input value={form.estado} onChange={e => set("estado", e.target.value)} placeholder="UF" maxLength={2} className="bg-input" />
                  </div>
                  <div>
                    <Label>CEP</Label>
                    <Input value={form.cep} onChange={e => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                      const formatted = raw.length > 5 ? raw.slice(0, 5) + "-" + raw.slice(5) : raw;
                      set("cep", formatted);
                    }} placeholder="00000-000" maxLength={9} className="bg-input" />
                  </div>
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={e => {
                    const v = formatPhone(e.target.value);
                    set("telefone", v);
                  }} placeholder="(00) 0000-0000" maxLength={15} className="bg-input" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@empresa.com" className="bg-input" />
                </div>
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input value={form.inscricaoEstadual} onChange={e => set("inscricaoEstadual", e.target.value)} placeholder="Inscrição Estadual" className="bg-input" />
                </div>
                <div>
                  <Label>Inscrição Municipal</Label>
                  <Input value={form.inscricaoMunicipal} onChange={e => set("inscricaoMunicipal", e.target.value)} placeholder="Inscrição Municipal" className="bg-input" />
                </div>
              </div>
              {editingId && (
                <div className="mt-4 p-4 border border-dashed border-border rounded-lg">
                  <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                    <ImageIcon className="h-4 w-4" /> Logo da Empresa
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">O logo será usado em relatórios, impressões e cabeçalhos do sistema.</p>
                  <div className="flex items-center gap-4">
                    {companies?.find(c => c.id === editingId) && (companies.find(c => c.id === editingId) as any)?.logoUrl ? (
                      <img src={(companies.find(c => c.id === editingId) as any).logoUrl} alt="Logo atual" className="h-16 w-16 object-contain border rounded" />
                    ) : (
                      <div className="h-16 w-16 border rounded flex items-center justify-center bg-muted">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLogoCompanyId(editingId); logoInputRef.current?.click(); }} disabled={uploadLogoMut.isPending}>
                        {uploadLogoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploadLogoMut.isPending ? "Enviando..." : "Enviar Logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG. Máx 5MB.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending || cnpjLoading}>
                  {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </>
          )}

          {/* Tab: Documentos Regulatórios */}
          {dialogTab === "documentos" && editingId && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{docsSummary.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{docsSummary.vigentes}</p>
                  <p className="text-xs text-green-600">Vigentes</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{docsSummary.vencidos}</p>
                  <p className="text-xs text-red-600">Vencidos</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{docsSummary.pendentes}</p>
                  <p className="text-xs text-amber-600">Pendentes</p>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Documentos da Empresa</h3>
                <Button size="sm" className="gap-2" onClick={() => { setEditingDocId(null); setDocForm(emptyDocForm); setDocFile(null); setDocDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Novo Documento
                </Button>
              </div>

              {companyDocs && companyDocs.length > 0 ? (
                <div className="space-y-2">
                  {companyDocs.map((doc: any) => {
                    const statusInfo = DOC_STATUS_MAP[doc.status] || DOC_STATUS_MAP.pendente;
                    const StatusIcon = statusInfo.icon;
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded ${statusInfo.color}`}>
                            <StatusIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.nome}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium">{DOC_TYPES.find(t => t.value === doc.tipo)?.label?.split(" - ")[0] || doc.tipo}</span>
                              {doc.dataValidade && (
                                <span className={doc.dataValidade < new Date().toISOString().split('T')[0] ? "text-red-500 font-semibold" : ""}>
                                  Val: {new Date(doc.dataValidade + "T12:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {doc.documentoUrl && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(doc.documentoUrl, "_blank")}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => openDocEdit(doc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => {
                            if (confirm("Excluir este documento?")) deleteDocMut.mutate({ id: doc.id });
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum documento regulatório cadastrado.</p>
                  <p className="text-xs mt-1">Cadastre PGR, PCMSO, LTCAT e outros documentos obrigatórios.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Convenção Coletiva */}
          {dialogTab === "convencao" && editingId && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Convenções Coletivas</h3>
                <Button size="sm" className="gap-2" onClick={() => { setEditingConvId(null); setConvForm(emptyConvForm); setConvFile(null); setConvDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Nova Convenção
                </Button>
              </div>

              {(() => {
                const renderConvCard = (conv: any, obraNome: string | null) => (
                  <div key={conv.id} className="p-4 bg-muted/30 rounded-lg border border-border group mb-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{conv.nome}</p>
                          {!conv.obraId ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">SEDE</span>
                          ) : null}
                          {conv.isMatriz ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full">MATRIZ</span>
                          ) : null}
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            conv.status === 'vigente' ? 'bg-green-100 text-green-700' :
                            conv.status === 'vencida' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {conv.status === 'vigente' ? 'Vigente' : conv.status === 'vencida' ? 'Vencida' : 'Em Negociação'}
                          </span>
                        </div>
                        {obraNome ? <p className="text-xs text-orange-600 font-medium mt-1">Obra: {obraNome}</p> : null}
                        {conv.sindicato ? <p className="text-xs text-muted-foreground mt-1">{conv.sindicato}</p> : null}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {conv.vigenciaInicio && conv.vigenciaFim ? (
                            <span>Vigência: {new Date(conv.vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")} a {new Date(conv.vigenciaFim + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                          ) : null}
                          {conv.pisoSalarial ? <span>Piso: R$ {conv.pisoSalarial}</span> : null}
                          {conv.percentualReajuste ? <span>Reajuste: {conv.percentualReajuste}%</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {conv.documentoUrl ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(conv.documentoUrl, "_blank")}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => openConvEdit(conv)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => {
                          if (confirm("Excluir esta convenção?")) deleteConvMut.mutate({ id: conv.id });
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
                const obraMap = Object.fromEntries((obrasEmpresa || []).map((o: any) => [o.id, o.nome]));
                if (!convencoes || convencoes.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <Landmark className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma convenção coletiva cadastrada.</p>
                      <p className="text-xs mt-1">Cadastre a convenção padrão (sede) e as convenções das obras em outras regiões.</p>
                    </div>
                  );
                }
                const sede = convencoes.filter((c: any) => !c.obraId);
                const porObra = convencoes.filter((c: any) => !!c.obraId);
                return (
                  <div className="space-y-4">
                    {sede.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-4 w-4 text-blue-600" />
                          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Padrão (Sede da Empresa)</span>
                        </div>
                        {sede.map((conv: any) => renderConvCard(conv, null))}
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                        <p className="text-xs text-blue-700">Nenhuma convenção padrão (sede) definida. Cadastre uma convenção sem vincular a obra.</p>
                      </div>
                    )}
                    {porObra.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Landmark className="h-4 w-4 text-orange-600" />
                          <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">Por Obra / Região</span>
                        </div>
                        {porObra.map((conv: any) => renderConvCard(conv, obraMap[conv.obraId] || `Obra #${conv.obraId}`))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </FullScreenDialog>

      {/* Dialog: Novo/Editar Documento */}
      <FullScreenDialog
        open={docDialogOpen}
        onClose={() => setDocDialogOpen(false)}
        title={editingDocId ? "Editar Documento" : "Novo Documento Regulatório"}
        icon={<Shield className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-emerald-700 to-emerald-500"
      >
        <div className="w-full space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Tipo de Documento *</Label>
              <Select value={docForm.tipo || "none"} onValueChange={v => setDoc("tipo", v === "none" ? "" : v)}>
                <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione</SelectItem>
                  {DOC_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Nome / Descrição Curta *</Label>
              <Input value={docForm.nome} onChange={e => setDoc("nome", e.target.value)} placeholder="Ex: PGR 2026 - Obra QIU 2" className="bg-input" />
            </div>
            <div>
              <Label>Data de Emissão</Label>
              <Input type="date" value={docForm.dataEmissao} onChange={e => setDoc("dataEmissao", e.target.value)} className="bg-input" />
            </div>
            <div>
              <Label>Data de Validade</Label>
              <Input type="date" value={docForm.dataValidade} onChange={e => setDoc("dataValidade", e.target.value)} className="bg-input" />
            </div>
            <div>
              <Label>Elaborado Por</Label>
              <Input value={docForm.elaboradoPor} onChange={e => setDoc("elaboradoPor", e.target.value)} placeholder="Nome do responsável técnico" className="bg-input" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={docForm.status || "pendente"} onValueChange={v => setDoc("status", v)}>
                <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_renovacao">Em Renovação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={docForm.observacoes} onChange={e => setDoc("observacoes", e.target.value)} placeholder="Observações adicionais..." className="bg-input" rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Label>Arquivo do Documento (PDF)</Label>
              <div className="mt-1 flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => docFileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {docFile ? "Trocar Arquivo" : "Selecionar Arquivo"}
                </Button>
                {docFile && <span className="text-xs text-muted-foreground">{docFile.name}</span>}
              </div>
              <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleDocFileChange} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleDocSubmit} disabled={createDocMut.isPending || updateDocMut.isPending}>
              {createDocMut.isPending || updateDocMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Nova/Editar Convenção */}
      <FullScreenDialog
        open={convDialogOpen}
        onClose={() => setConvDialogOpen(false)}
        title={editingConvId ? "Editar Convenção Coletiva" : "Nova Convenção Coletiva"}
        icon={<Landmark className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-indigo-700 to-indigo-500"
      >
        <div className="w-full space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Nome da Convenção *</Label>
              <Input value={convForm.nome} onChange={e => setConv("nome", e.target.value)} placeholder="Ex: CCT Construção Civil SP 2025/2026" className="bg-input" />
            </div>
            <div>
              <Label>Sindicato</Label>
              <Input value={convForm.sindicato} onChange={e => setConv("sindicato", e.target.value)} placeholder="Nome do sindicato" className="bg-input" />
            </div>
            <div>
              <Label>CNPJ do Sindicato</Label>
              <Input value={convForm.cnpjSindicato} onChange={e => setConv("cnpjSindicato", formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} className="bg-input" />
            </div>
            <div>
              <Label>Data Base</Label>
              <Input value={convForm.dataBase} onChange={e => setConv("dataBase", e.target.value)} placeholder="Ex: Janeiro, Maio" className="bg-input" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={convForm.status || "vigente"} onValueChange={v => setConv("status", v)}>
                <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="em_negociacao">Em Negociação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vigência Início</Label>
              <Input type="date" value={convForm.vigenciaInicio} onChange={e => setConv("vigenciaInicio", e.target.value)} className="bg-input" />
            </div>
            <div>
              <Label>Vigência Fim</Label>
              <Input type="date" value={convForm.vigenciaFim} onChange={e => setConv("vigenciaFim", e.target.value)} className="bg-input" />
            </div>
          </div>

          {/* Valores da Convenção */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-lg">💰</span> Valores e Percentuais
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Piso Salarial (R$)</Label>
                <Input value={convForm.pisoSalarial} onChange={e => setConv("pisoSalarial", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Reajuste (%)</Label>
                <Input value={convForm.percentualReajuste} onChange={e => setConv("percentualReajuste", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Adic. Insalubridade (%)</Label>
                <Input value={convForm.adicionalInsalubridade} onChange={e => setConv("adicionalInsalubridade", e.target.value)} placeholder="20" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Adic. Periculosidade (%)</Label>
                <Input value={convForm.adicionalPericulosidade} onChange={e => setConv("adicionalPericulosidade", e.target.value)} placeholder="30" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">HE Diurna (%)</Label>
                <Input value={convForm.horaExtraDiurna} onChange={e => setConv("horaExtraDiurna", e.target.value)} placeholder="50" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">HE Noturna (%)</Label>
                <Input value={convForm.horaExtraNoturna} onChange={e => setConv("horaExtraNoturna", e.target.value)} placeholder="100" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">HE Domingo (%)</Label>
                <Input value={convForm.horaExtraDomingo} onChange={e => setConv("horaExtraDomingo", e.target.value)} placeholder="100" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Adic. Noturno (%)</Label>
                <Input value={convForm.adicionalNoturno} onChange={e => setConv("adicionalNoturno", e.target.value)} placeholder="20" className="bg-input" />
              </div>
            </div>
          </div>

          {/* Benefícios */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-lg">🎁</span> Benefícios
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Vale Refeição (R$)</Label>
                <Input value={convForm.valeRefeicao} onChange={e => setConv("valeRefeicao", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Vale Alimentação (R$)</Label>
                <Input value={convForm.valeAlimentacao} onChange={e => setConv("valeAlimentacao", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Vale Transporte (R$)</Label>
                <Input value={convForm.valeTransporte} onChange={e => setConv("valeTransporte", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Cesta Básica (R$)</Label>
                <Input value={convForm.cestaBasica} onChange={e => setConv("cestaBasica", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Auxílio Farmácia (R$)</Label>
                <Input value={convForm.auxilioFarmacia} onChange={e => setConv("auxilioFarmacia", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div>
                <Label className="text-xs">Seguro de Vida (R$)</Label>
                <Input value={convForm.seguroVida} onChange={e => setConv("seguroVida", e.target.value)} placeholder="0,00" className="bg-input" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <Label className="text-xs">Plano de Saúde</Label>
                <Input value={convForm.planoSaude} onChange={e => setConv("planoSaude", e.target.value)} placeholder="Detalhes do plano" className="bg-input" />
              </div>
            </div>
          </div>

          {/* Cláusulas e Observações */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Outros Benefícios</Label>
                <Textarea value={convForm.outrosBeneficios} onChange={e => setConv("outrosBeneficios", e.target.value)} placeholder="Outros benefícios previstos na convenção..." className="bg-input" rows={2} />
              </div>
              <div>
                <Label>Cláusulas Especiais</Label>
                <Textarea value={convForm.clausulasEspeciais} onChange={e => setConv("clausulasEspeciais", e.target.value)} placeholder="Cláusulas especiais ou diferenciadas..." className="bg-input" rows={2} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={convForm.observacoes} onChange={e => setConv("observacoes", e.target.value)} placeholder="Observações gerais..." className="bg-input" rows={2} />
              </div>
              {/* Abrangência: Sede vs Obra */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Abrangência
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de Abrangência</Label>
                    <Select value={convForm.obraId !== null ? "obra" : "sede"} onValueChange={v => {
                      if (v === "sede") { setConv("obraId", null); }
                      else { setConv("obraId", 0 as any); }
                    }}>
                      <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sede">Padrão (Sede da Empresa)</SelectItem>
                        <SelectItem value="obra">Específica por Obra</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {!convForm.obraId ? "Convenção da região onde a empresa está situada" : "Convenção específica para obra em outra região"}
                    </p>
                  </div>
                  {convForm.obraId !== null ? (
                    <div>
                      <Label>Obra *</Label>
                      <Select value={convForm.obraId && convForm.obraId > 0 ? String(convForm.obraId) : "none"} onValueChange={v => setConv("obraId", v === "none" ? 0 as any : parseInt(v))}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione a obra</SelectItem>
                          {(obrasEmpresa || []).map((o: any) => (
                            <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={convForm.isMatriz} onChange={e => setConv("isMatriz", e.target.checked)} className="rounded" />
                  <span className="text-sm font-medium">Convenção Matriz (referência principal para comparação IA)</span>
                </label>
              </div>
              <div>
                <Label>Arquivo da Convenção (PDF)</Label>
                <div className="mt-1 flex items-center gap-3">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => convFileRef.current?.click()}>
                    <Upload className="h-4 w-4" /> {convFile ? "Trocar Arquivo" : "Selecionar Arquivo"}
                  </Button>
                  {convFile && <span className="text-xs text-muted-foreground">{convFile.name}</span>}
                </div>
                <input ref={convFileRef} type="file" accept=".pdf" className="hidden" onChange={handleConvFileChange} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setConvDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConvSubmit} disabled={createConvMut.isPending || updateConvMut.isPending}>
              {createConvMut.isPending || updateConvMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => logoCompanyId && handleLogoUpload(e, logoCompanyId)}
      />
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
