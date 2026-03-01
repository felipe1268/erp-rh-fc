import { useState, useMemo } from "react";
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
import { Store, Plus, Search, Edit, Trash2, Upload, FileText, CheckCircle, XCircle, Clock, Phone, Mail, MapPin, CreditCard } from "lucide-react";

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
  const createMut = trpc.parceiros.cadastro.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Parceiro cadastrado!"); } });
  const updateMut = trpc.parceiros.cadastro.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Parceiro atualizado!"); } });
  const deleteMut = trpc.parceiros.cadastro.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Parceiro excluído!"); } });
  const uploadMut = trpc.parceiros.cadastro.uploadDoc.useMutation({ onSuccess: () => { refetch(); toast.success("Documento enviado!"); } });

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
    setForm({ ...p });
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

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: any }> = {
      ativo: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle },
      suspenso: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
      inativo: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
    };
    const s = map[status] || map.ativo;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{status.charAt(0).toUpperCase() + status.slice(1)}
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
          <Button onClick={openNew} className="bg-purple-500 hover:bg-purple-600">
            <Plus className="h-4 w-4 mr-1" /> Novo Parceiro
          </Button>
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
                      {statusBadge(p.statusParceiro)}
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
          <div className="max-w-4xl mx-auto p-4 space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 border-b pb-2 overflow-x-auto">
              {(["dados", "bancario", "convenio", "documentos"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab ? "bg-purple-500 text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {tab === "dados" ? "Dados Cadastrais" : tab === "bancario" ? "Dados Bancários" : tab === "convenio" ? "Convênio" : "Documentos"}
                </button>
              ))}
            </div>

            {activeTab === "dados" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Razão Social *</Label><Input value={form.razaoSocial || ""} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></div>
                  <div><Label>Nome Fantasia</Label><Input value={form.nomeFantasia || ""} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></div>
                  <div><Label>CNPJ *</Label><Input value={form.cnpj || ""} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
                  <div>
                    <Label>Tipo de Convênio *</Label>
                    <Select value={form.tipoConvenio || "farmacia"} onValueChange={(v) => setForm({ ...form, tipoConvenio: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="farmacia">Farmácia</SelectItem>
                        <SelectItem value="posto_combustivel">Posto de Combustível</SelectItem>
                        <SelectItem value="restaurante">Restaurante</SelectItem>
                        <SelectItem value="mercado">Mercado</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.tipoConvenio === "outros" && (
                    <div><Label>Especifique</Label><Input value={form.tipoConvenioOutro || ""} onChange={(e) => setForm({ ...form, tipoConvenioOutro: e.target.value })} /></div>
                  )}
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
                  <div><Label>E-mail Principal</Label><Input value={form.emailPrincipal || ""} onChange={(e) => setForm({ ...form, emailPrincipal: e.target.value })} /></div>
                  <div><Label>E-mail Financeiro</Label><Input value={form.emailFinanceiro || ""} onChange={(e) => setForm({ ...form, emailFinanceiro: e.target.value })} /></div>
                  <div><Label>Responsável</Label><Input value={form.responsavelNome || ""} onChange={(e) => setForm({ ...form, responsavelNome: e.target.value })} /></div>
                  <div><Label>Cargo</Label><Input value={form.responsavelCargo || ""} onChange={(e) => setForm({ ...form, responsavelCargo: e.target.value })} /></div>
                </div>
                {editingId && (
                  <>
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider pt-2">Status</h4>
                    <Select value={form.status || form.statusParceiro || "ativo"} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="suspenso">Suspenso</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <div><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} /></div>
              </div>
            )}

            {activeTab === "bancario" && (
              <div className="space-y-4">
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
                  <div><Label>Titular</Label><Input value={form.titularConta || ""} onChange={(e) => setForm({ ...form, titularConta: e.target.value })} /></div>
                  <div><Label>CPF/CNPJ Titular</Label><Input value={form.cpfCnpjTitular || ""} onChange={(e) => setForm({ ...form, cpfCnpjTitular: e.target.value })} /></div>
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

            {activeTab === "convenio" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Dia de Fechamento</Label>
                    <Input type="number" min={1} max={31} value={form.diaFechamento || ""} onChange={(e) => setForm({ ...form, diaFechamento: parseInt(e.target.value) || null })} placeholder="Ex: 25" />
                    <p className="text-xs text-muted-foreground mt-1">Dia do mês para fechamento do período</p>
                  </div>
                  <div>
                    <Label>Prazo para Pagamento (dias)</Label>
                    <Input type="number" min={1} max={90} value={form.prazoPagamento || ""} onChange={(e) => setForm({ ...form, prazoPagamento: parseInt(e.target.value) || null })} placeholder="Ex: 10" />
                    <p className="text-xs text-muted-foreground mt-1">Dias após o fechamento para pagamento</p>
                  </div>
                  <div>
                    <Label>Limite Mensal por Colaborador</Label>
                    <Input value={form.limiteMensalPorColaborador || ""} onChange={(e) => setForm({ ...form, limiteMensalPorColaborador: e.target.value })} placeholder="Ex: 500.00" />
                    <p className="text-xs text-muted-foreground mt-1">Valor máximo por colaborador/mês (deixe vazio se sem limite)</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "documentos" && editingId && (
              <div className="space-y-4">
                {[
                  { label: "Contrato de Convênio", field: "contratoConvenioUrl" },
                  { label: "Contrato Social", field: "contratoSocialUrl" },
                  { label: "Alvará de Funcionamento", field: "alvaraUrl" },
                ].map((doc) => (
                  <div key={doc.field} className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">{doc.label}</h4>
                        {form[doc.field] ? (
                          <a href={form[doc.field]} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1">
                            <FileText className="h-3 w-3" /> Ver documento
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nenhum documento</span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleUpload(doc.field, editingId!)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "documentos" && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-8">Salve o parceiro primeiro para gerenciar documentos.</p>
            )}

            {/* Save */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-purple-500 hover:bg-purple-600" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}
    </DashboardLayout>
  );
}
