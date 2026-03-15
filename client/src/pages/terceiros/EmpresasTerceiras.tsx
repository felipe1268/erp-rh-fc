import { useState, useMemo } from "react";
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

// Use inferred types from tRPC

export default function EmpresasTerceiras() {
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
    gerarAcessoMut.mutate({ tipo: "terceiro", empresaTerceiraId: acessoEmpresa.id, companyId, cnpj: acessoEmpresa.cnpj, emailResponsavel: emailResp, nomeResponsavel: nomeResp, nomeEmpresa: acessoEmpresa.razaoSocial });
  };

  const buscarCNPJ = async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Empresas Terceiras</h1>
              <p className="text-sm text-muted-foreground">{empresas.length} empresa(s) cadastrada(s)</p>
            </div>
          </div>
          <DraggableCommandBar barId="empresas-terceiras" items={[
            { id: "nova", node: <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600"><Plus className="h-4 w-4 mr-1" /> Nova Empresa</Button> },
          ]} />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ ou tipo de serviço..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma empresa terceira cadastrada</p>
            </div>
          ) : (
            filtered.map((emp: any) => (
              <div key={emp.id} className="bg-card rounded-xl border p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{emp.razaoSocial}</h3>
                      {statusBadge(emp.status)}
                    </div>
                    {emp.nomeFantasia && <p className="text-sm text-muted-foreground">{emp.nomeFantasia}</p>}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">CNPJ: {formatCNPJ(emp.cnpj)}</span>
                      {emp.tipoServico && <span>| {emp.tipoServico}</span>}
                      {emp.cidade && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{emp.cidade}/{emp.estado}</span>}
                      {emp.telefone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{emp.telefone}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                      <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="text-amber-600 hover:bg-amber-50" onClick={() => handleGerarAcesso(emp)}>
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> Acesso Portal
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => {
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
                  <div><Label>Razão Social *</Label><Input value={form.razaoSocial || ""} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></div>
                  <div><Label>Nome Fantasia</Label><Input value={form.nomeFantasia || ""} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></div>
                  <div><Label>CNPJ *</Label><div className="flex gap-2"><Input placeholder="00.000.000/0000-00" value={form.cnpj || ""} onChange={(e) => { setForm({ ...form, cnpj: cnpjMask(e.target.value) }); }} onBlur={(e) => buscarCNPJ(e.target.value)} className="flex-1 font-mono" />{cnpjLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-500 self-center" />}</div></div>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-500" /> Gerar Acesso ao Portal</DialogTitle></DialogHeader>
          {!acessoResult ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-bold">{acessoEmpresa?.razaoSocial}</p>
                <p className="text-xs text-amber-600">CNPJ: {formatCNPJ(acessoEmpresa?.cnpj)}</p>
              </div>
              <div><Label>Nome do Responsável</Label><Input value={nomeResp} onChange={(e) => setNomeResp(e.target.value)} placeholder="Nome" /></div>
              <div><Label>E-mail do Responsável</Label><Input value={emailResp} onChange={(e) => setEmailResp(e.target.value)} placeholder="email@empresa.com" /></div>
              <p className="text-xs text-gray-500">Uma senha temporária será gerada. No primeiro acesso, o terceiro será obrigado a trocar a senha.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcessoDialogOpen(false)}>Cancelar</Button>
                <Button onClick={confirmarGerarAcesso} disabled={gerarAcessoMut.isPending} className="bg-amber-500 hover:bg-amber-600">{gerarAcessoMut.isPending ? "Gerando..." : "Gerar Acesso"}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-emerald-800">Acesso gerado com sucesso!</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div><p className="text-xs text-gray-500">Login (CNPJ)</p><div className="flex items-center gap-2"><code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1">{acessoResult.cnpj}</code><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(acessoResult.cnpj); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button></div></div>
                <div><p className="text-xs text-gray-500">Senha Temporária</p><div className="flex items-center gap-2"><code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1 text-amber-600 font-bold">{acessoResult.senhaTemporaria}</code><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(acessoResult.senhaTemporaria); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button></div></div>
                <div className="pt-2 border-t"><p className="text-xs text-gray-500 mb-1">Link do Portal</p><div className="flex items-center gap-2"><code className="bg-white border rounded px-2 py-1 text-xs flex-1 truncate">{window.location.origin}/portal/login</code><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portal/login`); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button></div></div>
              </div>
              <Button className="w-full" onClick={() => { const msg = `Portal do Terceiro - FC Gestão Integrada\n\nOlá ${nomeResp},\n\nSeu acesso ao portal foi criado:\n\nLink: ${window.location.origin}/portal/login\nLogin (CNPJ): ${acessoResult.cnpj}\nSenha: ${acessoResult.senhaTemporaria}\n\nNo primeiro acesso, você será solicitado a trocar a senha.`; navigator.clipboard.writeText(msg); toast.success("Mensagem copiada!"); }}><Copy className="w-4 h-4 mr-2" /> Copiar Mensagem Completa</Button>
              <Button variant="outline" className="w-full" onClick={() => setAcessoDialogOpen(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
