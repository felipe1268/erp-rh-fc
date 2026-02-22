import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, Plus, Pencil, Trash2, Search, Loader2, Star, ArrowLeft, Upload, ImageIcon } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useCallback, useRef } from "react";
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
};

const emptyForm: CompanyForm = {
  cnpj: "", razaoSocial: "", nomeFantasia: "", endereco: "",
  cidade: "", estado: "", cep: "", telefone: "", email: "",
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

export default function Empresas() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const { defaultCompanyId, setDefaultCompany, clearDefaultCompany, isDefault } = useDefaultCompany();

  const utils = trpc.useUtils();
  const { data: companies, isLoading } = trpc.companies.list.useQuery();
  const createMut = trpc.companies.create.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); setDialogOpen(false); toast.success("Empresa cadastrada com sucesso!"); },
    onError: (e) => toast.error("Erro ao cadastrar: " + e.message),
  });
  const updateMut = trpc.companies.update.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); setDialogOpen(false); toast.success("Empresa atualizada!"); },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });
  const deleteMut = trpc.companies.delete.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); toast.success("Empresa excluída!"); },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });
  const uploadLogoMut = trpc.companies.uploadLogo.useMutation({
    onSuccess: () => { utils.companies.list.invalidate(); toast.success("Logo atualizado com sucesso!"); },
    onError: (e) => toast.error("Erro ao enviar logo: " + e.message),
  });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoCompanyId, setLogoCompanyId] = useState<number | null>(null);

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
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
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

      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Empresa" : "Nova Empresa"} icon={<Building2 className="h-5 w-5 text-white" />}>
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
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
          </div>
          {/* Upload de Logo */}
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
        </div>
      </FullScreenDialog>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => logoCompanyId && handleLogoUpload(e, logoCompanyId)}
      />
    </DashboardLayout>
  );
}
