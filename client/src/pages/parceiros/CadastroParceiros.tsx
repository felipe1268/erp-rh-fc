import { useState, useMemo, useCallback } from "react";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Store, Plus, Search, Edit, Trash2, Upload, FileText, CheckCircle, XCircle, Clock, Phone, Mail, MapPin, CreditCard, RefreshCw, Loader2, Building2, Landmark, HandCoins, ShieldCheck, CalendarClock, User, StickyNote } from "lucide-react";

// Rev. 4710 — regra de ouro: dinheiro sempre em formato BR (1.234,56)
const moedaBRMask = (raw: string): string => {
  const d = String(raw || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d) return "";
  const cents = d.padStart(3, "0");
  const int = cents.slice(0, -2);
  const dec = cents.slice(-2);
  return `${Number(int).toLocaleString("pt-BR")},${dec}`;
};
const moedaBRFromDb = (v: any): string => {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const TIPO_CONVENIO_LABELS: Record<string, string> = {
  farmacia: "💊 Farmácia",
  posto_combustivel: "⛽ Posto de Combustível",
  restaurante: "🍽️ Restaurante",
  mercado: "🛒 Mercado",
  outros: "📦 Outros",
};

export default function CadastroParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "bancario" | "convenio" | "documentos">("dados");
  const [form, setForm] = useState<any>({});

  const { data: parceiros = [], refetch } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const createMut = trpc.parceiros.cadastro.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Parceiro cadastrado!"); },
    onError: (e) => toast.error(`Erro ao cadastrar: ${e.message}`),
  });
  const updateMut = trpc.parceiros.cadastro.update.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Parceiro atualizado!"); },
    onError: (e) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
  const deleteMut = trpc.parceiros.cadastro.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Parceiro excluído!"); },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });
  const uploadMut = trpc.parceiros.cadastro.uploadDoc.useMutation({
    onSuccess: () => { refetch(); toast.success("Documento enviado!"); },
    onError: (e) => toast.error(`Erro ao enviar documento: ${e.message}`),
  });

  // ========== BUSCA AUTOMÁTICA CNPJ ==========
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjResult, setCnpjResult] = useState<{ success?: boolean; razaoSocial?: string; nomeFantasia?: string; error?: string } | null>(null);

  const buscarCnpj = useCallback((cnpjDigits: string) => {
    if (cnpjDigits.length !== 14) return;
    setCnpjLoading(true);
    setCnpjResult(null);
    fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`)
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(data => {
        const tel = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : "";
        setForm((f: any) => ({
          ...f,
          razaoSocial: data.razao_social || f.razaoSocial || "",
          nomeFantasia: data.nome_fantasia || f.nomeFantasia || "",
          logradouro: data.logradouro || f.logradouro || "",
          numero: data.numero || f.numero || "",
          complemento: data.complemento || f.complemento || "",
          bairro: data.bairro || f.bairro || "",
          cidade: data.municipio || f.cidade || "",
          estado: data.uf || f.estado || "",
          cep: data.cep ? data.cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : f.cep || "",
          telefone: tel || f.telefone || "",
          emailPrincipal: data.email || f.emailPrincipal || "",
        }));
        setCnpjResult({ success: true, razaoSocial: data.razao_social, nomeFantasia: data.nome_fantasia });
        toast.success(`Dados de "${data.razao_social}" preenchidos automaticamente!`);
      })
      .catch(() => {
        setCnpjResult({ error: "CNPJ não encontrado na base da Receita Federal" });
        toast.error("CNPJ não encontrado");
      })
      .finally(() => setCnpjLoading(false));
  }, []);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  };

  const filtered = useMemo(() => {
    if (!search) return parceiros;
    const s = search.toLowerCase();
    return parceiros.filter((p: any) =>
      p.razaoSocial?.toLowerCase().includes(s) ||
      p.nomeFantasia?.toLowerCase().includes(s) ||
      p.cnpj?.includes(s)
    );
  }, [parceiros, search]);

  const openNew = () => {
    setForm({ companyId: companyId ?? 0, tipoConvenio: "farmacia" });
    setEditingId(null);
    setActiveTab("dados");
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({ ...p, limiteMensalPorColaborador: moedaBRFromDb(p.limiteMensalPorColaborador) });
    setEditingId(p.id);
    setActiveTab("dados");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.razaoSocial || !form.cnpj || !form.tipoConvenio) { toast.error("Razão Social, CNPJ e Tipo de Convênio são obrigatórios"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const handleUpload = (field: string, parceiroId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ parceiroId, field, fileName: file.name, fileBase64: base64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const statusBadge = (status: string | undefined | null) => {
    const st = status || "ativo";
    const map: Record<string, { bg: string; text: string; icon: any }> = {
      ativo: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle },
      suspenso: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
      inativo: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
    };
    const s = map[st] || map.ativo;
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Parceiros Conveniados</h1>
              <p className="text-sm text-muted-foreground">{parceiros.length} parceiro(s)</p>
            </div>
          </div>
          <DraggableCommandBar barId="parceiros" items={[
            { id: "novo", node: <Button onClick={openNew} className="bg-purple-500 hover:bg-purple-600"><Plus className="h-4 w-4 mr-1" /> Novo Parceiro</Button> },
          ]} />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum parceiro conveniado cadastrado</p>
            </div>
          ) : (
            filtered.map((p: any) => (
              <div key={p.id} className="bg-card rounded-xl border p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{p.razaoSocial}</h3>
                      {statusBadge(p.status)}
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{TIPO_CONVENIO_LABELS[p.tipoConvenio] || p.tipoConvenio}</span>
                    </div>
                    {p.nomeFantasia && <p className="text-sm text-muted-foreground">{p.nomeFantasia}</p>}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span>CNPJ: {p.cnpj}</span>
                      {p.cidade && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.cidade}/{p.estado}</span>}
                      {p.telefone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{p.telefone}</span>}
                      {p.formaPagamento && <span className="flex items-center gap-0.5"><CreditCard className="h-3 w-3" />{p.formaPagamento.toUpperCase()}</span>}
                      {p.diaFechamento && <span>Fechamento: dia {p.diaFechamento}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => {
                      if (confirm("Excluir este parceiro?")) deleteMut.mutate({ id: p.id });
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
          title={editingId ? "Editar Parceiro" : "Novo Parceiro Conveniado"}
          headerColor="bg-purple-500"
        >
          <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-28">
            {/* Tabs — segmented pills com ícone */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {([
                { id: "dados", label: "Dados Cadastrais", icon: Building2 },
                { id: "bancario", label: "Dados Bancários", icon: Landmark },
                { id: "convenio", label: "Convênio", icon: HandCoins },
                { id: "documentos", label: "Documentos", icon: FileText },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${active
                      ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-purple-300 hover:text-purple-700"}`}
                  >
                    <Icon className="h-4 w-4" /> {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "dados" && (
              <div className="space-y-5">
                {/* Identificação */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center"><Building2 className="h-5 w-5" /></span>
                    <div>
                      <h3 className="font-semibold text-slate-900 leading-tight">Identificação</h3>
                      <p className="text-xs text-slate-500">Digite o CNPJ e use a lupa para preencher automaticamente</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>CNPJ *</Label>
                      <div className="flex gap-1 mt-1.5">
                        <Input
                          value={form.cnpj || ""}
                          onChange={(e) => {
                            const formatted = formatCnpj(e.target.value);
                            setForm({ ...form, cnpj: formatted });
                            const digits = formatted.replace(/\D/g, "");
                            if (digits.length === 14) {
                              buscarCnpj(digits);
                            } else {
                              setCnpjResult(null);
                            }
                          }}
                          placeholder="00.000.000/0000-00"
                          className="flex-1 h-11"
                        />
                        <Button
                          type="button" size="icon" variant="outline" className="h-11 w-11 shrink-0"
                          disabled={cnpjLoading || (form.cnpj || "").replace(/\D/g, "").length !== 14}
                          onClick={() => buscarCnpj((form.cnpj || "").replace(/\D/g, ""))}
                          title="Buscar dados do CNPJ"
                        >
                          {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      {cnpjResult?.success && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> {cnpjResult.razaoSocial} {cnpjResult.nomeFantasia ? `(${cnpjResult.nomeFantasia})` : ''}</p>}
                      {cnpjResult?.error && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><XCircle className="h-3 w-3" /> {cnpjResult.error}</p>}
                    </div>
                    <div>
                      <Label>Tipo de Convênio *</Label>
                      <Select value={form.tipoConvenio || "farmacia"} onValueChange={(v) => setForm({ ...form, tipoConvenio: v })}>
                        <SelectTrigger className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="farmacia">💊 Farmácia</SelectItem>
                          <SelectItem value="posto_combustivel">⛽ Posto de Combustível</SelectItem>
                          <SelectItem value="restaurante">🍽️ Restaurante</SelectItem>
                          <SelectItem value="mercado">🛒 Mercado</SelectItem>
                          <SelectItem value="outros">📦 Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.tipoConvenio === "outros" && (
                      <div><Label>Especifique</Label><Input className="mt-1.5 h-11" value={form.tipoConvenioOutro || ""} onChange={(e) => setForm({ ...form, tipoConvenioOutro: e.target.value })} /></div>
                    )}
                    <div><Label>Razão Social *</Label><Input className="mt-1.5 h-11" value={form.razaoSocial || ""} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></div>
                    <div><Label>Nome Fantasia</Label><Input className="mt-1.5 h-11" value={form.nomeFantasia || ""} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></div>
                    <div><Label>Inscrição Estadual</Label><Input className="mt-1.5 h-11" value={form.inscricaoEstadual || ""} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} /></div>
                    <div><Label>Inscrição Municipal</Label><Input className="mt-1.5 h-11" value={form.inscricaoMunicipal || ""} onChange={(e) => setForm({ ...form, inscricaoMunicipal: e.target.value })} /></div>
                  </div>
                </section>

                {/* Endereço */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><MapPin className="h-5 w-5" /></span>
                    <h3 className="font-semibold text-slate-900">Endereço</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><Label>CEP</Label><Input className="mt-1.5 h-11" value={form.cep || ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                    <div className="md:col-span-2"><Label>Logradouro</Label><Input className="mt-1.5 h-11" value={form.logradouro || ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                    <div><Label>Número</Label><Input className="mt-1.5 h-11" value={form.numero || ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                    <div><Label>Complemento</Label><Input className="mt-1.5 h-11" value={form.complemento || ""} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                    <div><Label>Bairro</Label><Input className="mt-1.5 h-11" value={form.bairro || ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                    <div><Label>Cidade</Label><Input className="mt-1.5 h-11" value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                    <div>
                      <Label>Estado</Label>
                      <Select value={form.estado || ""} onValueChange={(v) => setForm({ ...form, estado: v })}>
                        <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="UF" /></SelectTrigger>
                        <SelectContent>{ESTADOS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                {/* Contato */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Phone className="h-5 w-5" /></span>
                    <h3 className="font-semibold text-slate-900">Contato</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Telefone</Label><Input className="mt-1.5 h-11" value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                    <div><Label>Celular/WhatsApp</Label><Input className="mt-1.5 h-11" value={form.celular || ""} onChange={(e) => setForm({ ...form, celular: e.target.value })} /></div>
                    <div><Label>E-mail Principal</Label><Input className="mt-1.5 h-11" value={form.emailPrincipal || ""} onChange={(e) => setForm({ ...form, emailPrincipal: e.target.value })} /></div>
                    <div><Label>E-mail Financeiro</Label><Input className="mt-1.5 h-11" value={form.emailFinanceiro || ""} onChange={(e) => setForm({ ...form, emailFinanceiro: e.target.value })} /></div>
                    <div><Label>Responsável</Label><Input className="mt-1.5 h-11" value={form.responsavelNome || ""} onChange={(e) => setForm({ ...form, responsavelNome: e.target.value })} /></div>
                    <div><Label>Cargo</Label><Input className="mt-1.5 h-11" value={form.responsavelCargo || ""} onChange={(e) => setForm({ ...form, responsavelCargo: e.target.value })} /></div>
                  </div>
                </section>

                {/* Status + Observações */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><StickyNote className="h-5 w-5" /></span>
                    <h3 className="font-semibold text-slate-900">Situação e observações</h3>
                  </div>
                  <div className="space-y-4">
                    {editingId && (
                      <div>
                        <Label>Status do parceiro</Label>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {([["ativo", "Ativo", "emerald"], ["suspenso", "Suspenso", "amber"], ["inativo", "Inativo", "slate"]] as const).map(([val, lbl, cor]) => {
                            const ativo = (form.status || "ativo") === val;
                            return (
                              <button key={val} type="button" onClick={() => setForm({ ...form, status: val })}
                                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${ativo
                                  ? cor === "emerald" ? "bg-emerald-600 border-emerald-600 text-white" : cor === "amber" ? "bg-amber-500 border-amber-500 text-white" : "bg-slate-600 border-slate-600 text-white"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div><Label>Observações</Label><Textarea className="mt-1.5" value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} /></div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "bancario" && (
              <div className="space-y-5">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center"><Landmark className="h-5 w-5" /></span>
                    <div>
                      <h3 className="font-semibold text-slate-900 leading-tight">Conta bancária</h3>
                      <p className="text-xs text-slate-500">Para onde vai o repasse do convênio</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Banco</Label><Input className="mt-1.5 h-11" value={form.banco || ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                    <div>
                      <Label>Tipo de Conta</Label>
                      <Select value={form.tipoConta || ""} onValueChange={(v) => setForm({ ...form, tipoConta: v })}>
                        <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrente">Corrente</SelectItem>
                          <SelectItem value="poupanca">Poupança</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Agência</Label><Input className="mt-1.5 h-11" value={form.agencia || ""} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                    <div><Label>Conta</Label><Input className="mt-1.5 h-11" value={form.conta || ""} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></div>
                    <div><Label>Titular</Label><Input className="mt-1.5 h-11" value={form.titularConta || ""} onChange={(e) => setForm({ ...form, titularConta: e.target.value })} /></div>
                    <div><Label>CPF/CNPJ Titular</Label><Input className="mt-1.5 h-11" value={form.cpfCnpjTitular || ""} onChange={(e) => setForm({ ...form, cpfCnpjTitular: e.target.value })} /></div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><CreditCard className="h-5 w-5" /></span>
                    <h3 className="font-semibold text-slate-900">Forma de pagamento</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      {([["pix", "PIX"], ["boleto", "Boleto"], ["transferencia", "Transferência"], ["deposito", "Depósito"]] as const).map(([val, lbl]) => {
                        const ativo = form.formaPagamento === val;
                        return (
                          <button key={val} type="button" onClick={() => setForm({ ...form, formaPagamento: val })}
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${ativo
                              ? "bg-purple-600 border-purple-600 text-white shadow-sm"
                              : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                    {form.formaPagamento === "pix" && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-purple-100 bg-purple-50/50 p-4">
                        <div>
                          <Label>Tipo de Chave PIX</Label>
                          <Select value={form.pixTipoChave || ""} onValueChange={(v) => setForm({ ...form, pixTipoChave: v })}>
                            <SelectTrigger className="mt-1.5 h-11 bg-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="cnpj">CNPJ</SelectItem>
                              <SelectItem value="email">E-mail</SelectItem>
                              <SelectItem value="telefone">Telefone</SelectItem>
                              <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2"><Label>Chave PIX</Label><Input className="mt-1.5 h-11 bg-white" value={form.pixChave || ""} onChange={(e) => setForm({ ...form, pixChave: e.target.value })} /></div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "convenio" && (() => {
              const limiteNum = parseFloat(String(form.limiteMensalPorColaborador || "").replace(/\./g, "").replace(",", ".")) || 0;
              const motorLigado = limiteNum > 0;
              return (
                <div className="space-y-5">
                  {/* Ciclo de pagamento */}
                  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="h-9 w-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><CalendarClock className="h-5 w-5" /></span>
                      <div>
                        <h3 className="font-semibold text-slate-900 leading-tight">Ciclo de pagamento ao parceiro</h3>
                        <p className="text-xs text-slate-500">Quando fecha a conta e quando o parceiro recebe</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Dia de fechamento</Label>
                        <Input type="number" min={1} max={31} className="mt-1.5 h-11" value={form.diaFechamento || ""} onChange={(e) => setForm({ ...form, diaFechamento: parseInt(e.target.value) || null })} placeholder="Ex: 25" />
                        <p className="text-xs text-slate-500 mt-1">Dia do mês em que o período fecha</p>
                      </div>
                      <div>
                        <Label>Prazo para pagamento (dias)</Label>
                        <Input type="number" min={1} max={90} className="mt-1.5 h-11" value={form.prazoPagamento || ""} onChange={(e) => setForm({ ...form, prazoPagamento: parseInt(e.target.value) || null })} placeholder="Ex: 10" />
                        <p className="text-xs text-slate-500 mt-1">Dias após o fechamento para pagar</p>
                      </div>
                    </div>
                    {form.diaFechamento ? (
                      <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-3">
                        Fecha todo dia <strong>{form.diaFechamento}</strong>{form.prazoPagamento ? <> e o parceiro recebe em até <strong>{form.prazoPagamento} dias</strong> depois</> : null}.
                      </p>
                    ) : null}
                  </section>

                  {/* Motor de crédito */}
                  <section className={`rounded-2xl border shadow-sm p-4 sm:p-5 transition-colors ${motorLigado ? "bg-white border-purple-300 ring-1 ring-purple-200" : "bg-white border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className={`h-9 w-9 rounded-xl flex items-center justify-center ${motorLigado ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500"}`}><ShieldCheck className="h-5 w-5" /></span>
                        <div>
                          <h3 className="font-semibold text-slate-900 leading-tight">Controle de crédito por colaborador</h3>
                          <p className="text-xs text-slate-500">Limite mensal + regras automáticas de proteção</p>
                        </div>
                      </div>
                      <span className={`text-xs font-bold rounded-full px-3 py-1.5 ${motorLigado ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {motorLigado ? "● Ligado" : "○ Desligado"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label>Limite mensal por colaborador</Label>
                        <div className="relative mt-1.5">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">R$</span>
                          <Input className="h-12 pl-10 text-lg font-semibold" inputMode="numeric" value={form.limiteMensalPorColaborador || ""} onChange={(e) => setForm({ ...form, limiteMensalPorColaborador: moedaBRMask(e.target.value) })} placeholder="0,00" />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Deixe vazio para <strong>não</strong> usar controle de crédito</p>
                      </div>
                      <div>
                        <Label>Carência (dias de casa)</Label>
                        <Input type="number" min={0} max={365} className={`mt-1.5 h-12 ${!motorLigado ? "opacity-50" : ""}`} disabled={!motorLigado} value={form.carenciaDias ?? 30} onChange={(e) => setForm({ ...form, carenciaDias: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })} placeholder="30" />
                        <p className="text-xs text-slate-500 mt-1">Tempo mínimo de admissão para liberar (0 = sem carência)</p>
                      </div>
                    </div>

                    {/* Toggle débito anterior */}
                    <button
                      type="button"
                      disabled={!motorLigado}
                      onClick={() => setForm({ ...form, travarDebitoAnterior: (form.travarDebitoAnterior ?? 1) === 1 ? 0 : 1 })}
                      className={`w-full mt-4 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition ${!motorLigado ? "opacity-50 cursor-not-allowed border-slate-200" : (form.travarDebitoAnterior ?? 1) === 1 ? "border-purple-300 bg-purple-50/60" : "border-slate-200 bg-white"}`}
                    >
                      <div>
                        <span className="text-sm font-medium text-slate-900">Travar por débito anterior</span>
                        <p className="text-xs text-slate-500 mt-0.5">Bloqueia novo consumo enquanto o mês anterior não for descontado na folha (recomendado)</p>
                      </div>
                      <span className={`shrink-0 h-7 w-12 rounded-full p-1 transition-colors ${(form.travarDebitoAnterior ?? 1) === 1 ? "bg-purple-600" : "bg-slate-300"}`}>
                        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${(form.travarDebitoAnterior ?? 1) === 1 ? "translate-x-5" : "translate-x-0"}`} />
                      </span>
                    </button>

                    {/* Resumo de como funciona */}
                    {motorLigado ? (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                        <p className="text-xs font-semibold text-slate-700 mb-2">Como vai funcionar neste parceiro:</p>
                        <ul className="space-y-1.5 text-xs text-slate-600">
                          <li className="flex gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" /> Cada colaborador pode gastar até <strong>R$ {form.limiteMensalPorColaborador}</strong> por mês</li>
                          {(form.carenciaDias ?? 30) > 0 && <li className="flex gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" /> Só libera após <strong>{form.carenciaDias ?? 30} dias</strong> de admissão</li>}
                          <li className="flex gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" /> Desligados e afastados ficam bloqueados; férias continua liberado</li>
                          {(form.travarDebitoAnterior ?? 1) === 1 && <li className="flex gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" /> Trava enquanto o mês anterior não for descontado na folha</li>}
                          <li className="flex gap-2"><ShieldCheck className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-px" /> Na dúvida ou em erro, o sistema <strong>bloqueia</strong> — nunca libera sem certeza</li>
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
                        Sem limite definido, o parceiro pode lançar sem travas de crédito. Preencha o limite para ativar as proteções automáticas.
                      </p>
                    )}
                  </section>
                </div>
              );
            })()}

            {activeTab === "documentos" && editingId && (
              <div className="space-y-3">
                {[
                  { label: "Contrato de Convênio", field: "contratoConvenioUrl" },
                  { label: "Contrato Social", field: "contratoSocialUrl" },
                  { label: "Alvará de Funcionamento", field: "alvaraUrl" },
                ].map((doc) => (
                  <div key={doc.field} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${form[doc.field] ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm text-slate-900">{doc.label}</h4>
                        {form[doc.field] ? (
                          <a href={form[doc.field]} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:underline">Ver documento</a>
                        ) : (
                          <span className="text-xs text-slate-400">Nenhum documento enviado</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleUpload(doc.field, editingId!)}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Enviar
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "documentos" && !editingId && (
              <p className="text-sm text-slate-500 text-center py-8 bg-white rounded-2xl border border-slate-200">Salve o parceiro primeiro para anexar documentos.</p>
            )}

            {/* Save — barra fixa */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 sm:p-4 z-20">
              <div className="max-w-4xl mx-auto flex justify-end gap-3">
                <Button variant="outline" className="h-11 px-5" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button onClick={handleSave} className="h-11 px-6 bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200" disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </div>
          </div>
        </FullScreenDialog>
      )}
    </DashboardLayout>
  );
}
