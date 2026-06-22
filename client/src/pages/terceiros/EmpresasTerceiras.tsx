import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { upperCaseEmpresa } from "@shared/normalizeNomeEmpresa";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Plus, Search, Edit, Trash2, Eye, Upload, FileText, CheckCircle, XCircle, Clock, Phone, Mail, MapPin, Loader2, KeyRound, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCNPJ } from "@/lib/formatters";

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// Máscara progressiva para o campo CNPJ: XX.XXX.XXX/XXXX-XX
function cnpjMask(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// Iniciais a partir do nome (avatar)
function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const AVATAR_COLORS = [
  "from-orange-400 to-orange-600", "from-blue-400 to-blue-600",
  "from-emerald-400 to-emerald-600", "from-violet-400 to-violet-600",
  "from-rose-400 to-rose-600", "from-amber-400 to-amber-600",
  "from-cyan-400 to-cyan-600", "from-indigo-400 to-indigo-600",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Use inferred types from tRPC

export default function EmpresasTerceiras() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "documentos" | "bancario">("dados");
  const [form, setForm] = useState<any>({});
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [acessoDialogOpen, setAcessoDialogOpen] = useState(false);
  const [acessoResult, setAcessoResult] = useState<{ senhaTemporaria: string; cnpj: string; nomeEmpresa: string } | null>(null);
  const [acessoEmpresa, setAcessoEmpresa] = useState<any>(null);
  const [emailResp, setEmailResp] = useState("");
  const [nomeResp, setNomeResp] = useState("");
  const gerarAcessoMut = trpc.portalExterno.admin.gerarAcesso.useMutation({
    onSuccess: (data) => { setAcessoResult(data); toast.success("Acesso gerado!"); },
    onError: (e) => toast.error(e.message),
  });
  const handleGerarAcesso = (emp: any) => {
    setAcessoEmpresa(emp); setEmailResp(emp.emailResponsavel || emp.email || ""); setNomeResp(emp.responsavelNome || ""); setAcessoResult(null); setAcessoDialogOpen(true);
  };
  const confirmarGerarAcesso = () => {
    if (!acessoEmpresa || !companyId) return;
    const cnpjLimpo = (acessoEmpresa.cnpj || "").replace(/\D/g, "");
    if (!cnpjLimpo) { toast.error("Esta empresa não possui CNPJ/CPF cadastrado. Cadastre antes de gerar acesso."); return; }
    gerarAcessoMut.mutate({ tipo: "terceiro", empresaTerceiraId: acessoEmpresa.id, companyId, cnpj: cnpjLimpo, emailResponsavel: emailResp, nomeResponsavel: nomeResp, nomeEmpresa: acessoEmpresa.razaoSocial });
  };

  const verificarDup = trpc.terceiros.empresas.verificarCadastroDuplicado.useQuery(
    { companyId: companyId ?? 0, cnpj: (form.cnpj || "").replace(/\D/g, ""), excludeEmpresaTerceiraId: editingId ?? undefined },
    { enabled: false, retry: false }
  );
  const [dupDialog, setDupDialog] = useState<null | { mode: "block-same"; nome: string } | { mode: "replicate-from-fornecedor"; fornecedor: any }>(null);

  const lastCheckedDupCNPJ = useRef("");
  const lastFetchedCnpj = useRef("");
  // Reset do cache ao abrir/fechar o form — evita pular checagem em reabertura.
  useEffect(() => {
    if (!showForm) {
      lastCheckedDupCNPJ.current = "";
      lastFetchedCnpj.current = "";
      setDupDialog(null);
    }
  }, [showForm]);
  // Disparo automático da checagem quando o CNPJ atinge 14 dígitos (debounce 500ms).
  useEffect(() => {
    const cnpjDigits = (form.cnpj || "").replace(/\D/g, "");
    if (!showForm || editingId || !companyId) return;
    if (cnpjDigits.length !== 14) return;
    if (cnpjDigits === lastCheckedDupCNPJ.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await verificarDup.refetch();
        const cnpjAtual = (form.cnpj || "").replace(/\D/g, "");
        if (cancelled || cnpjAtual !== cnpjDigits) return;
        lastCheckedDupCNPJ.current = cnpjDigits;
        const d: any = res.data;
        if (!d?.found) return;
        if (d.empresaTerceira) {
          setDupDialog({ mode: "block-same", nome: `${d.empresaTerceira.razaoSocial} (#${d.empresaTerceira.id})` });
        } else if (d.fornecedor) {
          setDupDialog({ mode: "replicate-from-fornecedor", fornecedor: d.fornecedor });
        }
      } catch { /* silencioso */ }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.cnpj, showForm, editingId, companyId]);

  // Auto-busca na Receita Federal ao atingir 14 dígitos (debounce 600ms).
  useEffect(() => {
    if (!showForm) return;
    const cnpjDigits = (form.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits.length !== 14) return;
    if (cnpjDigits === lastFetchedCnpj.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      lastFetchedCnpj.current = cnpjDigits;
      buscarCNPJ(cnpjDigits);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cnpj, showForm]);

  const checarDuplicidade = async (cnpjDigits: string) => {
    if (!companyId || cnpjDigits.length !== 14 || editingId) return false;
    try {
      const res = await verificarDup.refetch();
      // Proteção contra resposta stale
      const cnpjAtual = (form.cnpj || "").replace(/\D/g, "");
      if (cnpjAtual !== cnpjDigits) return false;
      lastCheckedDupCNPJ.current = cnpjDigits;
      const d: any = res.data;
      if (!d?.found) return false;
      if (d.empresaTerceira) {
        setDupDialog({ mode: "block-same", nome: `${d.empresaTerceira.razaoSocial} (#${d.empresaTerceira.id})` });
        return true;
      }
      if (d.fornecedor) {
        setDupDialog({ mode: "replicate-from-fornecedor", fornecedor: d.fornecedor });
        return true;
      }
      return false;
    } catch { return false; }
  };

  const aplicarDadosDeFornecedor = (f: any) => {
    setForm((prev: any) => ({
      ...prev,
      cnpj: prev.cnpj || (f.cnpj ? cnpjMask(f.cnpj) : prev.cnpj),
      razaoSocial: f.razaoSocial || prev.razaoSocial,
      nomeFantasia: f.nomeFantasia || prev.nomeFantasia,
      inscricaoEstadual: f.inscricaoEstadual || prev.inscricaoEstadual,
      inscricaoMunicipal: f.inscricaoMunicipal || prev.inscricaoMunicipal,
      cep: f.cep || prev.cep,
      logradouro: f.endereco || prev.logradouro,
      numero: f.numero || prev.numero,
      complemento: f.complemento || prev.complemento,
      bairro: f.bairro || prev.bairro,
      cidade: f.cidade || prev.cidade,
      estado: f.estado || prev.estado,
      telefone: f.telefone || prev.telefone,
      celular: f.contatoCelular || prev.celular,
      email: f.email || prev.email,
      emailFinanceiro: f.contatoEmail || prev.emailFinanceiro,
      responsavelNome: f.contatoNome || f.representanteLegal || prev.responsavelNome,
      banco: f.banco || prev.banco,
      agencia: f.agencia || prev.agencia,
      conta: f.conta || prev.conta,
      pixChave: f.pix || prev.pixChave,
    }));
    toast.success("Dados replicados do cadastro de Compras. Revise e salve.");
  };

  const buscarCNPJ = async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;
    // Anti-duplicidade primeiro: se existir, não preenche dados externos
    const dup = await checarDuplicidade(clean);
    if (dup) return;
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const d = await res.json();
      setForm((prev: any) => ({
        ...prev,
        razaoSocial: d.razao_social || prev.razaoSocial,
        nomeFantasia: d.nome_fantasia || prev.nomeFantasia,
        cep: d.cep?.replace(/\D/g, "") || prev.cep,
        logradouro: d.logradouro || prev.logradouro,
        numero: d.numero || prev.numero,
        complemento: d.complemento || prev.complemento,
        bairro: d.bairro || prev.bairro,
        cidade: d.municipio || prev.cidade,
        estado: d.uf || prev.estado,
        telefone: d.ddd_telefone_1 || prev.telefone,
        email: d.email || prev.email,
      }));
      toast.success("Dados do CNPJ preenchidos automaticamente!");
    } catch {
      toast.error("Não foi possível buscar dados do CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  };

  const { data: empresas = [], refetch } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const createMut = trpc.terceiros.empresas.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Empresa cadastrada!"); }, onError: (e) => toast.error(e.message) });
  const updateMut = trpc.terceiros.empresas.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Empresa atualizada!"); }, onError: (e) => toast.error(e.message) });
  const deleteMut = trpc.terceiros.empresas.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa excluída!"); } });
  const uploadMut = trpc.terceiros.empresas.uploadDoc.useMutation({ onSuccess: () => { refetch(); toast.success("Documento enviado!"); } });

  const filtered = useMemo(() => {
    if (!search) return empresas;
    const s = search.toLowerCase();
    return empresas.filter((e: any) =>
      e.razaoSocial?.toLowerCase().includes(s) ||
      e.nomeFantasia?.toLowerCase().includes(s) ||
      e.cnpj?.includes(s) ||
      e.tipoServico?.toLowerCase().includes(s)
    );
  }, [empresas, search]);

  const ativasCount = useMemo(() => empresas.filter((e: any) => (e.status || "ativa") === "ativa").length, [empresas]);

  const openNew = () => {
    setForm({ companyId: companyId ?? 0 });
    setEditingId(null);
    setActiveTab("dados");
    setShowForm(true);
  };

  const openEdit = (emp: any) => {
    setForm({ ...emp, cnpj: cnpjMask(emp.cnpj || "") });
    setEditingId(emp.id);
    setActiveTab("dados");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.razaoSocial || !form.cnpj) { toast.error("Razão Social e CNPJ são obrigatórios"); return; }
    const payload = { ...form, cnpj: form.cnpj.replace(/\D/g, "") };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleUpload = async (field: string, empresaId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ empresaId, field, fileName: file.name, fileBase64: base64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const statusBadge = (status: string | undefined | null) => {
    const st = status || "ativa";
    const map: Record<string, { bg: string; text: string; icon: any }> = {
      ativa: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle },
      suspensa: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
      inativa: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
    };
    const s = map[st] || map.ativa;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{st.charAt(0).toUpperCase() + st.slice(1)}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shrink-0">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Empresas de Serviço</h1>
              <p className="text-sm text-white/70">Fornecedores de material + mão de obra</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white bg-white/10 rounded-full px-2.5 py-0.5">{empresas.length} cadastrada(s)</span>
                {ativasCount > 0 && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/15 rounded-full px-2.5 py-0.5"><CheckCircle className="h-3 w-3" />{ativasCount} ativa(s)</span>}
              </div>
            </div>
          </div>
          <DraggableCommandBar barId="empresas-terceiras" items={[
            { id: "nova", node: <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600 shadow-md"><Plus className="h-4 w-4 mr-1" /> Nova Empresa</Button> },
          ]} />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ ou tipo de serviço..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 rounded-xl bg-card" />
          {search && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{filtered.length} resultado(s)</span>}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card rounded-2xl border border-dashed">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{search ? "Nenhuma empresa encontrada" : "Nenhuma empresa de serviço cadastrada"}</p>
              <p className="text-sm mt-1">{search ? "Tente outro termo de busca." : "Clique em \"Nova Empresa\" para começar."}</p>
            </div>
          ) : (
            filtered.map((emp: any) => (
              <div key={emp.id} className="group bg-card rounded-2xl border border-border/80 p-4 hover:border-orange-200 hover:shadow-md transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/terceiros/empresas/${emp.id}`)}>
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${avatarColor(emp.razaoSocial)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                      {initials(emp.nomeFantasia || emp.razaoSocial)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-orange-600 transition-colors">{emp.razaoSocial}</h3>
                        {statusBadge(emp.status)}
                      </div>
                      {emp.nomeFantasia && <p className="text-sm text-muted-foreground truncate">{emp.nomeFantasia}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="inline-flex items-center text-xs text-muted-foreground bg-muted/60 border border-border/60 rounded-md px-2 py-0.5 font-mono">{formatCNPJ(emp.cnpj)}</span>
                        {emp.tipoServico && <span className="inline-flex items-center text-xs text-muted-foreground bg-muted/60 border border-border/60 rounded-md px-2 py-0.5">{emp.tipoServico}</span>}
                        {emp.cidade && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{emp.cidade}/{emp.estado}</span>}
                        {emp.telefone && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{emp.telefone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate(`/terceiros/empresas/${emp.id}`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Raio-X
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                      <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={() => handleGerarAcesso(emp)}>
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> Portal
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => {
                      if (confirm("Excluir esta empresa?")) deleteMut.mutate({ id: emp.id });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <FullScreenDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title={editingId ? "Editar Empresa Terceira" : "Nova Empresa Terceira"}
          headerColor="bg-orange-500"
        >
          <div className="max-w-4xl mx-auto p-4 space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
              {(["dados", "documentos", "bancario"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {tab === "dados" ? "Dados Cadastrais" : tab === "documentos" ? "Documentos" : "Dados Bancários"}
                </button>
              ))}
            </div>

            {activeTab === "dados" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Razão Social *</Label><Input value={form.razaoSocial || ""} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} onBlur={(e) => setForm({ ...form, razaoSocial: upperCaseEmpresa(e.target.value) })} /></div>
                  <div><Label>Nome Fantasia</Label><Input value={form.nomeFantasia || ""} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} onBlur={(e) => setForm({ ...form, nomeFantasia: upperCaseEmpresa(e.target.value) })} /></div>
                  <div><Label>CNPJ *</Label><div className="flex gap-2"><Input placeholder="00.000.000/0000-00" value={form.cnpj || ""} onChange={(e) => { setForm({ ...form, cnpj: cnpjMask(e.target.value) }); }} className="flex-1 font-mono" />{cnpjLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-500 self-center" />}</div></div>
                  <div><Label>Tipo de Serviço</Label><Input placeholder="Ex: Elétrica, Hidráulica, Gesso..." value={form.tipoServico || ""} onChange={(e) => setForm({ ...form, tipoServico: e.target.value })} /></div>
                  <div><Label>Inscrição Estadual</Label><Input value={form.inscricaoEstadual || ""} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} /></div>
                  <div><Label>Inscrição Municipal</Label><Input value={form.inscricaoMunicipal || ""} onChange={(e) => setForm({ ...form, inscricaoMunicipal: e.target.value })} /></div>
                </div>
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Endereço</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><Label>CEP</Label><Input value={form.cep || ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Logradouro</Label><Input value={form.logradouro || ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                  <div><Label>Número</Label><Input value={form.numero || ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                  <div><Label>Complemento</Label><Input value={form.complemento || ""} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                  <div><Label>Bairro</Label><Input value={form.bairro || ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                  <div><Label>Cidade</Label><Input value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                  <div>
                    <Label>Estado</Label>
                    <Select value={form.estado || ""} onValueChange={(v) => setForm({ ...form, estado: v })}>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{ESTADOS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Contato</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                  <div><Label>Celular/WhatsApp</Label><Input value={form.celular || ""} onChange={(e) => setForm({ ...form, celular: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>E-mail Financeiro</Label><Input value={form.emailFinanceiro || ""} onChange={(e) => setForm({ ...form, emailFinanceiro: e.target.value })} /></div>
                  <div><Label>Responsável</Label><Input value={form.responsavelNome || ""} onChange={(e) => setForm({ ...form, responsavelNome: e.target.value })} /></div>
                  <div><Label>Cargo do Responsável</Label><Input value={form.responsavelCargo || ""} onChange={(e) => setForm({ ...form, responsavelCargo: e.target.value })} /></div>
                </div>
                {editingId && (
                  <>
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Status</h4>
                    <Select value={form.status || "ativa"} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativa">Ativa</SelectItem>
                        <SelectItem value="suspensa">Suspensa</SelectItem>
                        <SelectItem value="inativa">Inativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <div><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} /></div>
              </div>
            )}

            {activeTab === "documentos" && editingId && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Faça upload dos documentos regulatórios da empresa terceira.</p>
                {[
                  { label: "PGR (Programa de Gerenciamento de Riscos)", urlField: "pgrUrl", validadeField: "pgrValidade" },
                  { label: "PCMSO (Programa de Controle Médico)", urlField: "pcmsoUrl", validadeField: "pcmsoValidade" },
                  { label: "Contrato Social", urlField: "contratoSocialUrl", validadeField: null },
                  { label: "Alvará de Funcionamento", urlField: "alvaraUrl", validadeField: "alvaraValidade" },
                  { label: "Seguro de Vida em Grupo", urlField: "seguroVidaUrl", validadeField: "seguroVidaValidade" },
                ].map((doc) => (
                  <div key={doc.urlField} className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">{doc.label}</h4>
                        {form[doc.urlField] ? (
                          <a href={form[doc.urlField]} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1">
                            <FileText className="h-3 w-3" /> Ver documento
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground mt-1">Nenhum documento enviado</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.validadeField && (
                          <Input
                            type="date"
                            className="w-40 text-xs"
                            value={form[doc.validadeField]?.split("T")[0] || ""}
                            onChange={(e) => {
                              setForm({ ...form, [doc.validadeField!]: e.target.value });
                              if (editingId) updateMut.mutate({ id: editingId, [doc.validadeField!]: e.target.value });
                            }}
                          />
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleUpload(doc.urlField, editingId!)}>
                          <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "documentos" && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-8">Salve a empresa primeiro para gerenciar documentos.</p>
            )}

            {activeTab === "bancario" && (
              <div className="space-y-4">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Dados Bancários</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Banco</Label><Input value={form.banco || ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                  <div><Label>Agência</Label><Input value={form.agencia || ""} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                  <div><Label>Conta</Label><Input value={form.conta || ""} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></div>
                  <div>
                    <Label>Tipo de Conta</Label>
                    <Select value={form.tipoConta || ""} onValueChange={(v) => setForm({ ...form, tipoConta: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Corrente</SelectItem>
                        <SelectItem value="poupanca">Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Titular da Conta</Label><Input value={form.titularConta || ""} onChange={(e) => setForm({ ...form, titularConta: e.target.value })} /></div>
                  <div><Label>CPF/CNPJ do Titular</Label><Input value={form.cpfCnpjTitular || ""} onChange={(e) => setForm({ ...form, cpfCnpjTitular: e.target.value })} /></div>
                </div>
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Forma de Pagamento</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select value={form.formaPagamento || ""} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="deposito">Depósito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.formaPagamento === "pix" && (
                    <>
                      <div>
                        <Label>Tipo de Chave PIX</Label>
                        <Select value={form.pixTipoChave || ""} onValueChange={(v) => setForm({ ...form, pixTipoChave: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="cnpj">CNPJ</SelectItem>
                            <SelectItem value="email">E-mail</SelectItem>
                            <SelectItem value="telefone">Telefone</SelectItem>
                            <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2"><Label>Chave PIX</Label><Input value={form.pixChave || ""} onChange={(e) => setForm({ ...form, pixChave: e.target.value })} /></div>
                    </>
                  )}
                </div>

                {/* Ciclo de Fechamento */}
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Ciclo de Fechamento</h4>
                <p className="text-xs text-gray-500 -mt-2">Define como as compras deste fornecedor são agrupadas para pagamento na Conciliação Bancária.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Ciclo de Pagamento</Label>
                    <Select value={form.cicloPagamento || "avista"} onValueChange={(v) => setForm({ ...form, cicloPagamento: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="avista">À vista (sem agrupamento)</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="personalizado">Personalizado (N dias)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.cicloPagamento === "mensal" && (
                    <div>
                      <Label>Dia de Fechamento</Label>
                      <input type="number" min={1} max={28} value={form.cicloDiaFechamento || ""} onChange={(e) => setForm({ ...form, cicloDiaFechamento: Number(e.target.value) || undefined })} placeholder="Ex: 30" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" />
                    </div>
                  )}
                  {form.cicloPagamento === "personalizado" && (
                    <div>
                      <Label>A cada quantos dias</Label>
                      <input type="number" min={1} max={365} value={form.cicloDiaFechamento || ""} onChange={(e) => setForm({ ...form, cicloDiaFechamento: Number(e.target.value) || undefined })} placeholder="Ex: 45" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" />
                    </div>
                  )}
                  {form.cicloPagamento && form.cicloPagamento !== "avista" && (
                    <>
                      <div>
                        <Label>Forma de Pagamento do Fechamento</Label>
                        <Select value={form.cicloFormaPagamento || ""} onValueChange={(v) => setForm({ ...form, cicloFormaPagamento: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="transferencia">Transferência</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Parcelas</Label>
                        <Select value={String(form.cicloNumParcelas || 1)} onValueChange={(v) => setForm({ ...form, cicloNumParcelas: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                              <SelectItem key={n} value={String(n)}>{n === 1 ? "À vista (1×)" : `${n}×`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(form.cicloNumParcelas || 1) > 1 && (
                        <div>
                          <Label>Prazo entre Parcelas (dias)</Label>
                          <input type="number" min={1} max={365} value={form.cicloPrazoParcela || 30} onChange={(e) => setForm({ ...form, cicloPrazoParcela: Number(e.target.value) || 30 })} placeholder="30" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}
      {/* Dialog Gerar Acesso */}
      <Dialog open={acessoDialogOpen} onOpenChange={setAcessoDialogOpen}>
        <DialogContent resizable={false} className="sm:max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-500" /> Gerar Acesso ao Portal</DialogTitle></DialogHeader>
          {!acessoResult ? (
            <div className="space-y-4 overflow-hidden">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-bold">{acessoEmpresa?.razaoSocial}</p>
                <p className="text-xs text-amber-600">CNPJ: {formatCNPJ(acessoEmpresa?.cnpj) || "Não cadastrado"}</p>
              </div>
              {!(acessoEmpresa?.cnpj?.replace(/\D/g, "")) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700 font-semibold">Esta empresa não possui CNPJ/CPF cadastrado. Cadastre o CNPJ antes de gerar o acesso ao portal.</p>
                </div>
              )}
              <div><Label>Nome do Responsável</Label><Input value={nomeResp} onChange={(e) => setNomeResp(e.target.value)} placeholder="Nome" /></div>
              <div><Label>E-mail do Responsável</Label><Input value={emailResp} onChange={(e) => setEmailResp(e.target.value)} placeholder="email@empresa.com" /></div>
              <p className="text-xs text-gray-500">Uma senha temporária será gerada. No primeiro acesso, o terceiro será obrigado a trocar a senha.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcessoDialogOpen(false)}>Cancelar</Button>
                <Button onClick={confirmarGerarAcesso} disabled={gerarAcessoMut.isPending} className="bg-amber-500 hover:bg-amber-600">{gerarAcessoMut.isPending ? "Gerando..." : "Gerar Acesso"}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 overflow-hidden">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-emerald-800">Acesso gerado com sucesso!</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 overflow-hidden">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Login (CNPJ/CPF)</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block">{acessoResult.cnpj || acessoEmpresa?.cnpj || "—"}</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(acessoResult.cnpj || acessoEmpresa?.cnpj || ""); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Senha Temporária</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1 min-w-0 text-amber-600 font-bold">{acessoResult.senhaTemporaria}</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(acessoResult.senhaTemporaria); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-500 mb-1">Link do Portal</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-xs flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block">{window.location.origin}/portal/login</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portal/login`); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => { const loginCnpj = acessoResult.cnpj || acessoEmpresa?.cnpj || ""; const msg = `Portal do Terceiro - FC Gestão Integrada\n\nOlá ${nomeResp},\n\nSeu acesso ao portal foi criado:\n\nLink: ${window.location.origin}/portal/login\nLogin (CNPJ): ${loginCnpj}\nSenha: ${acessoResult.senhaTemporaria}\n\nNo primeiro acesso, você será solicitado a trocar a senha.`; navigator.clipboard.writeText(msg); toast.success("Mensagem copiada!"); }}><Copy className="w-4 h-4 mr-2" /> Copiar Mensagem Completa</Button>
              <Button variant="outline" className="w-full" onClick={() => setAcessoDialogOpen(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo Anti-Duplicidade Cross-Módulo */}
      <Dialog open={!!dupDialog} onOpenChange={v => !v && setDupDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-700">Empresa já cadastrada</DialogTitle>
          </DialogHeader>
          {dupDialog?.mode === "block-same" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Já existe uma empresa terceira cadastrada com este CNPJ:
                <br /><span className="font-semibold">{dupDialog.nome}</span>.
              </p>
              <p className="text-xs text-gray-500">
                Não é permitido duplicar empresas. Use o cadastro existente ou edite-o pela lista.
              </p>
              <DialogFooter>
                <Button onClick={() => { setDupDialog(null); setShowForm(false); }}>Entendi</Button>
              </DialogFooter>
            </div>
          )}
          {dupDialog?.mode === "replicate-from-fornecedor" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Esta empresa já está cadastrada em <strong>Compras</strong>:
                <br /><span className="font-semibold">{dupDialog.fornecedor.razaoSocial}</span>
                {dupDialog.fornecedor.cnpj ? <> — <span className="font-mono">{formatCNPJ(dupDialog.fornecedor.cnpj)}</span></> : null}.
              </p>
              <p className="text-sm text-gray-700">
                Deseja adicioná-la também ao módulo <strong>Terceiros</strong>? Os dados de cadastro serão replicados automaticamente.
              </p>
              <p className="text-xs text-gray-500">
                Ao clicar em <strong>Não</strong>, o cadastro não prosseguirá — empresas não podem ser duplicadas.
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setDupDialog(null); setShowForm(false); }}>Não</Button>
                <Button onClick={() => { aplicarDadosDeFornecedor((dupDialog as any).fornecedor); setDupDialog(null); }}>Sim, replicar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
