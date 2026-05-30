import React, { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Trash2, Network, Building2, Phone, Mail,
  Loader2, Image as ImageIcon, Upload, X, MapPin, Users, BadgeCheck,
} from "lucide-react";

type Socio = { nome?: string; qualificacao?: string };

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatPhone(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

const EMPTY_FORM = {
  nome: "", logoUrl: "", cnpj: "", telefone: "", email: "", observacoes: "",
  razaoSocial: "", nomeFantasia: "", endereco: "", bairro: "", municipio: "",
  uf: "", cep: "", situacaoCadastral: "",
  socios: [] as Socio[],
};

export default function Gerenciadoras() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const lastFetched = useRef<string>("");

  const utils = trpc.useUtils();
  const { data: lista = [], isLoading } = trpc.gerenciadoras.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const criarMut = trpc.gerenciadoras.criar.useMutation({
    onSuccess: () => { utils.gerenciadoras.list.invalidate(); fecharModal(); toast.success("Gerenciadora criada com sucesso!"); },
    onError: (e) => toast.error(e.message || "Erro ao criar gerenciadora"),
  });
  const atualizarMut = trpc.gerenciadoras.atualizar.useMutation({
    onSuccess: () => { utils.gerenciadoras.list.invalidate(); fecharModal(); toast.success("Gerenciadora atualizada!"); },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });
  const excluirMut = trpc.gerenciadoras.excluir.useMutation({
    onSuccess: () => { utils.gerenciadoras.list.invalidate(); toast.success("Gerenciadora excluída."); },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setForm({ ...EMPTY_FORM });
    lastFetched.current = "";
  }

  function abrirNovo() {
    setForm({ ...EMPTY_FORM });
    setEditandoId(null);
    lastFetched.current = "";
    setModalAberto(true);
  }

  function abrirEditar(g: any) {
    setForm({
      nome:              g.nome ?? "",
      logoUrl:           g.logoUrl ?? "",
      cnpj:              g.cnpj ? formatCNPJ(g.cnpj) : "",
      telefone:          g.telefone ?? "",
      email:             g.email ?? "",
      observacoes:       g.observacoes ?? "",
      razaoSocial:       g.razaoSocial ?? "",
      nomeFantasia:      g.nomeFantasia ?? "",
      endereco:          g.endereco ?? "",
      bairro:            g.bairro ?? "",
      municipio:         g.municipio ?? "",
      uf:                g.uf ?? "",
      cep:               g.cep ?? "",
      situacaoCadastral: g.situacaoCadastral ?? "",
      socios:            Array.isArray(g.socios) ? g.socios : [],
    });
    lastFetched.current = (g.cnpj || "").replace(/\D/g, "");
    setEditandoId(g.id);
    setModalAberto(true);
  }

  // Busca automática na Receita Federal (BrasilAPI) — mesmo padrão de Empresas/Clientes
  const fetchCnpjData = useCallback(async (digits: string) => {
    if (digits.length !== 14 || digits === lastFetched.current) return;
    lastFetched.current = digits;
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      const socios: Socio[] = Array.isArray(data.qsa)
        ? data.qsa.map((s: any) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio }))
        : [];
      setForm(prev => ({
        ...prev,
        razaoSocial:       data.razao_social ?? prev.razaoSocial,
        nomeFantasia:      data.nome_fantasia ?? prev.nomeFantasia,
        nome:              prev.nome.trim() ? prev.nome : (data.nome_fantasia || data.razao_social || prev.nome),
        endereco:          [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", ") || prev.endereco,
        bairro:            data.bairro ?? prev.bairro,
        municipio:         data.municipio ?? prev.municipio,
        uf:                data.uf ?? prev.uf,
        cep:               data.cep ? String(data.cep).replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : prev.cep,
        situacaoCadastral: data.descricao_situacao_cadastral ?? prev.situacaoCadastral,
        telefone:          data.ddd_telefone_1 ? formatPhone(data.ddd_telefone_1) : prev.telefone,
        email:             data.email && data.email !== "" ? String(data.email).toLowerCase() : prev.email,
        socios:            socios.length ? socios : prev.socios,
      }));
      toast.success("Dados do CNPJ carregados automaticamente!");
    } catch {
      lastFetched.current = "";
      toast.error("Não foi possível buscar o CNPJ. Preencha manualmente.");
    } finally {
      setCnpjLoading(false);
    }
  }, []);

  function onCnpjChange(value: string) {
    setForm(f => ({ ...f, cnpj: formatCNPJ(value) }));
    const digits = value.replace(/\D/g, "");
    if (digits.length === 14) fetchCnpjData(digits);
  }

  function salvar() {
    if (!form.nome.trim()) { toast.error("Nome da gerenciadora é obrigatório."); return; }
    const payload = {
      nome:              form.nome.trim(),
      cnpj:              form.cnpj.replace(/\D/g, "") || undefined,
      telefone:          form.telefone || undefined,
      email:             form.email || undefined,
      observacoes:       form.observacoes || undefined,
      razaoSocial:       form.razaoSocial || null,
      nomeFantasia:      form.nomeFantasia || null,
      endereco:          form.endereco || null,
      bairro:            form.bairro || null,
      municipio:         form.municipio || null,
      uf:                form.uf || null,
      cep:               form.cep || null,
      situacaoCadastral: form.situacaoCadastral || null,
      socios:            form.socios.length ? form.socios : null,
    };
    if (editandoId) {
      atualizarMut.mutate({ id: editandoId, companyId, ...payload, logoUrl: form.logoUrl || null });
    } else {
      criarMut.mutate({ companyId, ...payload, logoUrl: form.logoUrl || undefined });
    }
  }

  const filtrados = useMemo(() =>
    lista.filter((g: any) =>
      [g.nome, g.razaoSocial, g.cnpj, g.email, g.telefone, g.municipio].some(v =>
        v?.toLowerCase().includes(busca.toLowerCase())
      )
    ),
  [lista, busca]);

  const isPending = criarMut.isPending || atualizarMut.isPending;

  return (
    <DashboardLayout>
      <div className="p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Network className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Gerenciadoras</h1>
              <p className="text-xs text-slate-500 mt-0.5">Cadastro reutilizável de gerenciadoras (nome + logo) usado nas obras</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 w-64"
                placeholder="Buscar por nome, CNPJ, e-mail..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <Button onClick={abrirNovo} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Nova Gerenciadora
            </Button>
          </div>
        </div>

        {/* Contagem */}
        <div className="flex gap-4 mb-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <p className="text-2xl font-bold text-slate-700">{lista.length}</p>
            <p className="text-xs text-slate-500">Total</p>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Network className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">
              {busca ? "Nenhuma gerenciadora encontrada para esta busca" : "Nenhuma gerenciadora cadastrada"}
            </p>
            {!busca && (
              <Button variant="outline" size="sm" onClick={abrirNovo} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Cadastrar primeira gerenciadora
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map((g: any) => (
              <div key={g.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {g.logoUrl ? (
                      <img src={g.logoUrl} alt={g.nome} className="h-12 w-12 object-contain rounded border border-slate-200 bg-white p-1 shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                        <Network className="h-5 w-5 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
                        {g.nome}
                      </h3>
                      {g.razaoSocial && g.razaoSocial !== g.nome && (
                        <p className="text-[11px] text-slate-400 leading-tight line-clamp-1 mt-0.5">{g.razaoSocial}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500">
                    {g.cnpj && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono">{formatCNPJ(g.cnpj)}</span>
                      </div>
                    )}
                    {(g.municipio || g.uf) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{[g.municipio, g.uf].filter(Boolean).join(" - ")}</span>
                      </div>
                    )}
                    {g.telefone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{g.telefone}</span>
                      </div>
                    )}
                    {g.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{g.email}</span>
                      </div>
                    )}
                    {Array.isArray(g.socios) && g.socios.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{g.socios.length} sócio(s)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {g.criadoEm ? new Date(g.criadoEm).toLocaleDateString("pt-BR") : ""}
                  </span>
                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => abrirEditar(g)}
                      className="p-1.5 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center gap-1"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium md:hidden">Editar</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir a gerenciadora "${g.nome}"?`))
                          excluirMut.mutate({ id: g.id, companyId });
                      }}
                      className="p-1.5 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-500 flex items-center gap-1"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium md:hidden">Excluir</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        <Dialog open={modalAberto} onOpenChange={open => { if (!open) fecharModal(); }}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" style={{ background: "#ffffff", color: "#111827" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Network className="h-4 w-4 text-blue-600" />
                {editandoId ? "Editar Gerenciadora" : "Nova Gerenciadora"}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-2 space-y-4">
              {/* CNPJ em destaque — preenche tudo automaticamente */}
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" /> CNPJ
                  <span className="text-[10px] font-normal text-slate-400">— digite e os dados são puxados da Receita</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    className="font-mono pr-9"
                    value={form.cnpj}
                    onChange={e => onCnpjChange(e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                  {cnpjLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500 absolute right-3 top-1/2 -translate-y-1/2" />}
                  {!cnpjLoading && form.situacaoCadastral && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                      <BadgeCheck className="h-3 w-3" /> {form.situacaoCadastral}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid de 2 colunas para caber sem rolagem */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                {/* Nome de exibição */}
                <div className="md:col-span-2">
                  <Label className="text-xs font-medium">Nome da Gerenciadora *</Label>
                  <Input
                    className="mt-1"
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex.: Lótus Projetos e Soluções"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium">Razão Social</Label>
                  <Input className="mt-1" value={form.razaoSocial} onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))} placeholder="Razão social (Receita)" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Nome Fantasia</Label>
                  <Input className="mt-1" value={form.nomeFantasia} onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))} placeholder="Nome fantasia" />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-rose-500" /> Endereço</Label>
                  <Input className="mt-1" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Logradouro, número, complemento" />
                </div>

                <div>
                  <Label className="text-xs font-medium">Bairro</Label>
                  <Input className="mt-1" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Bairro" />
                </div>
                <div className="grid grid-cols-[1fr_70px_110px] gap-2">
                  <div>
                    <Label className="text-xs font-medium">Município</Label>
                    <Input className="mt-1" value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} placeholder="Cidade" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">UF</Label>
                    <Input className="mt-1" maxLength={2} value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))} placeholder="UF" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">CEP</Label>
                    <Input className="mt-1" value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} placeholder="00000-000" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium">Telefone</Label>
                  <Input className="mt-1" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: formatPhone(e.target.value) }))} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <Label className="text-xs font-medium">E-mail</Label>
                  <Input className="mt-1" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@gerenciadora.com" />
                </div>
              </div>

              {/* Sócios (Quadro Societário) */}
              {form.socios.length > 0 && (
                <div>
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-indigo-500" /> Quadro Societário
                    <span className="text-[10px] font-normal text-slate-400">({form.socios.length})</span>
                  </Label>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100 max-h-32 overflow-y-auto">
                    {form.socios.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                        <span className="font-medium text-slate-700 truncate">{s.nome || "—"}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 truncate max-w-[45%]">{s.qualificacao || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logo + Observações lado a lado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-purple-500" /> Logo
                    <span className="text-[10px] font-normal text-slate-400">(aparece nas obras)</span>
                  </Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    {form.logoUrl ? (
                      <div className="relative group">
                        <img src={form.logoUrl} alt="Logo gerenciadora" className="h-14 w-auto max-w-[100px] object-contain rounded border border-slate-200 bg-white p-1" />
                        <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setForm(f => ({ ...f, logoUrl: "" }))}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-14 w-16 rounded border-2 border-dashed border-slate-200 flex items-center justify-center shrink-0">
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 2MB)"); return; }
                        const reader = new FileReader();
                        reader.onload = () => { setForm(f => ({ ...f, logoUrl: reader.result as string })); };
                        reader.readAsDataURL(file);
                      }} />
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-50">
                        <Upload className="h-3.5 w-3.5" />
                        {form.logoUrl ? "Trocar Logo" : "Enviar Logo"}
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium">Observações</Label>
                  <Input
                    className="mt-1"
                    value={form.observacoes}
                    onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                    placeholder="Notas internas (opcional)"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={fecharModal} disabled={isPending}>Cancelar</Button>
                <Button onClick={salvar} disabled={isPending} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editandoId ? "Salvar" : "Cadastrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
