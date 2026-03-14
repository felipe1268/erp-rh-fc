import React, { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Trash2, UserCheck, Building2, Phone, Mail,
  MapPin, Loader2, RefreshCw, AlertCircle, CheckCircle2, X, User,
} from "lucide-react";

const n = (v: any) => parseFloat(v || "0") || 0;

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

const EMPTY_FORM = {
  tipo: "PJ",
  cnpj: "", cpf: "",
  razaoSocial: "", nomeFantasia: "", situacaoReceita: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
  telefone: "", email: "",
  contatoNome: "", contatoCelular: "", contatoEmail: "",
  observacoes: "",
};

export default function Clientes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [erroCNPJ, setErroCNPJ] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: lista = [], isLoading } = trpc.clientes.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const buscarCNPJQuery = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: form.cnpj.replace(/\D/g, "") },
    { enabled: false }
  );

  const criarMut = trpc.clientes.criar.useMutation({
    onSuccess: () => { utils.clientes.list.invalidate(); fecharModal(); toast.success("Cliente criado com sucesso!"); },
    onError: (e) => toast.error(e.message || "Erro ao criar cliente"),
  });
  const atualizarMut = trpc.clientes.atualizar.useMutation({
    onSuccess: () => { utils.clientes.list.invalidate(); fecharModal(); toast.success("Cliente atualizado!"); },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });
  const excluirMut = trpc.clientes.excluir.useMutation({
    onSuccess: () => { utils.clientes.list.invalidate(); toast.success("Cliente excluído."); },
  });

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    setErroCNPJ(null);
    setForm({ ...EMPTY_FORM });
  }

  function abrirNovo() {
    setForm({ ...EMPTY_FORM });
    setEditandoId(null);
    setErroCNPJ(null);
    setModalAberto(true);
  }

  function abrirEditar(c: any) {
    setForm({
      tipo:            c.tipo ?? "PJ",
      cnpj:            c.cnpj ? formatCNPJ(c.cnpj) : "",
      cpf:             c.cpf ? formatCPF(c.cpf) : "",
      razaoSocial:     c.razaoSocial ?? "",
      nomeFantasia:    c.nomeFantasia ?? "",
      situacaoReceita: c.situacaoReceita ?? "",
      endereco:        c.endereco ?? "",
      numero:          c.numero ?? "",
      complemento:     c.complemento ?? "",
      bairro:          c.bairro ?? "",
      cidade:          c.cidade ?? "",
      estado:          c.estado ?? "",
      cep:             c.cep ?? "",
      telefone:        c.telefone ?? "",
      email:           c.email ?? "",
      contatoNome:     c.contatoNome ?? "",
      contatoCelular:  c.contatoCelular ?? "",
      contatoEmail:    c.contatoEmail ?? "",
      observacoes:     c.observacoes ?? "",
    });
    setEditandoId(c.id);
    setErroCNPJ(null);
    setModalAberto(true);
  }

  async function buscarCNPJ() {
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) { setErroCNPJ("Digite um CNPJ completo (14 dígitos)."); return; }
    setBuscandoCNPJ(true);
    setErroCNPJ(null);
    try {
      const res = await buscarCNPJQuery.refetch();
      const d = res.data;
      if (!d) { setErroCNPJ("CNPJ não encontrado na Receita Federal."); return; }
      const situacaoCod = d.situacaoCodigo ?? 0;
      if (situacaoCod !== 2) {
        setErroCNPJ(`Atenção: situação "${d.situacaoReceita}". Verifique antes de cadastrar.`);
      }
      setForm(prev => ({
        ...prev,
        razaoSocial:     d.razaoSocial     || prev.razaoSocial,
        nomeFantasia:    d.nomeFantasia     || prev.nomeFantasia,
        situacaoReceita: d.situacaoReceita  || prev.situacaoReceita,
        endereco:        d.endereco         || prev.endereco,
        numero:          d.numero           || prev.numero,
        complemento:     d.complemento      || prev.complemento,
        bairro:          d.bairro           || prev.bairro,
        cidade:          d.cidade           || prev.cidade,
        estado:          d.estado           || prev.estado,
        cep:             d.cep              || prev.cep,
        telefone:        d.telefone         || prev.telefone,
        email:           d.email            || prev.email,
      }));
    } catch {
      setErroCNPJ("Erro ao consultar a Receita Federal. Verifique o CNPJ e tente novamente.");
    } finally {
      setBuscandoCNPJ(false);
    }
  }

  function salvar() {
    if (!form.razaoSocial.trim()) { toast.error("Razão Social / Nome é obrigatório."); return; }
    const payload = {
      ...form,
      cnpj:   form.cnpj.replace(/\D/g, "") || undefined,
      cpf:    form.cpf.replace(/\D/g, "")  || undefined,
      cep:    form.cep.replace(/\D/g, "")  || undefined,
    };
    if (editandoId) {
      atualizarMut.mutate({ id: editandoId, ...payload });
    } else {
      criarMut.mutate({ companyId, ...payload });
    }
  }

  const filtrados = useMemo(() =>
    lista.filter((c: any) =>
      [c.razaoSocial, c.nomeFantasia, c.cnpj, c.cpf, c.cidade, c.email].some(v =>
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
            <UserCheck className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Clientes</h1>
              <p className="text-xs text-slate-500 mt-0.5">Cadastro e gerenciamento de clientes PJ e PF</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 w-64"
                placeholder="Buscar por nome, CNPJ, cidade..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <Button onClick={abrirNovo} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Novo Cliente
            </Button>
          </div>
        </div>

        {/* Contagem */}
        <div className="flex gap-4 mb-4">
          {[
            { label: "Total", value: lista.length, color: "text-slate-700" },
            { label: "PJ", value: lista.filter((c: any) => c.tipo === "PJ").length, color: "text-blue-700" },
            { label: "PF", value: lista.filter((c: any) => c.tipo === "PF").length, color: "text-emerald-700" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <UserCheck className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">
              {busca ? "Nenhum cliente encontrado para esta busca" : "Nenhum cliente cadastrado"}
            </p>
            {!busca && (
              <Button variant="outline" size="sm" onClick={abrirNovo} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Cadastrar primeiro cliente
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map((c: any) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
                        {c.razaoSocial}
                      </h3>
                      {c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{c.nomeFantasia}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.tipo === "PJ" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {c.tipo}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500">
                    {(c.cnpj || c.cpf) && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono">{c.cnpj ? formatCNPJ(c.cnpj) : formatCPF(c.cpf)}</span>
                        {c.situacaoReceita && (
                          <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${c.situacaoReceita.toLowerCase().includes("ativa") ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {c.situacaoReceita}
                          </span>
                        )}
                      </div>
                    )}
                    {(c.cidade || c.estado) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{[c.cidade, c.estado].filter(Boolean).join(" / ")}</span>
                      </div>
                    )}
                    {c.telefone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{c.telefone}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.contatoNome && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Contato: {c.contatoNome}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => abrirEditar(c)}
                      className="p-1 rounded hover:bg-amber-50 text-amber-500"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir o cliente "${c.razaoSocial}"?`))
                          excluirMut.mutate({ id: c.id });
                      }}
                      className="p-1 rounded hover:bg-red-50 text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        <Dialog open={modalAberto} onOpenChange={open => { if (!open) fecharModal(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: "#ffffff", color: "#111827" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                {editandoId ? "Editar Cliente" : "Novo Cliente"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Tipo */}
              <div>
                <Label className="text-xs font-medium">Tipo de Pessoa</Label>
                <div className="flex gap-2 mt-1">
                  {["PJ", "PF"].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, tipo: t, cnpj: "", cpf: "" }))}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                        form.tipo === t
                          ? (t === "PJ" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-emerald-500 bg-emerald-50 text-emerald-700")
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {t === "PJ" ? "Pessoa Jurídica (PJ)" : "Pessoa Física (PF)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* CNPJ / CPF */}
              <div>
                <Label className="text-xs font-medium">{form.tipo === "PJ" ? "CNPJ" : "CPF"}</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={form.tipo === "PJ" ? form.cnpj : form.cpf}
                    onChange={e => {
                      const v = form.tipo === "PJ" ? formatCNPJ(e.target.value) : formatCPF(e.target.value);
                      setForm(f => form.tipo === "PJ" ? { ...f, cnpj: v } : { ...f, cpf: v });
                      setErroCNPJ(null);
                    }}
                    placeholder={form.tipo === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"}
                    className="font-mono"
                  />
                  {form.tipo === "PJ" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-3 text-xs shrink-0 gap-1"
                      onClick={buscarCNPJ}
                      disabled={buscandoCNPJ || form.cnpj.replace(/\D/g, "").length !== 14}
                    >
                      {buscandoCNPJ ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {buscandoCNPJ ? "Buscando..." : "Buscar Receita"}
                    </Button>
                  )}
                </div>
                {erroCNPJ && (
                  <div className={`mt-1.5 flex items-start gap-1.5 text-xs rounded px-2 py-1.5 ${erroCNPJ.includes("Atenção") ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {erroCNPJ}
                  </div>
                )}
              </div>

              {/* Razão Social / Nome Fantasia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">{form.tipo === "PJ" ? "Razão Social *" : "Nome Completo *"}</Label>
                  <Input
                    value={form.razaoSocial}
                    onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))}
                    className="mt-1"
                    placeholder={form.tipo === "PJ" ? "Razão social da empresa" : "Nome completo"}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">{form.tipo === "PJ" ? "Nome Fantasia" : "Apelido"}</Label>
                  <Input
                    value={form.nomeFantasia}
                    onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))}
                    className="mt-1"
                    placeholder="Como é conhecido"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Endereço
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs font-medium">Logradouro</Label>
                    <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} className="mt-1" placeholder="Rua, Avenida..." />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Número</Label>
                    <Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Complemento</Label>
                    <Input value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} className="mt-1" placeholder="Sala, Andar..." />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Bairro</Label>
                    <Input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">CEP</Label>
                    <Input value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} className="mt-1" placeholder="00000-000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Cidade</Label>
                    <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Estado (UF)</Label>
                    <Input value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0,2) }))} className="mt-1" maxLength={2} placeholder="SP" />
                  </div>
                </div>
              </div>

              {/* Contato */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Contato
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Telefone</Label>
                    <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="mt-1" placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">E-mail</Label>
                    <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" type="email" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Pessoa de contato</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Nome</Label>
                    <Input value={form.contatoNome} onChange={e => setForm(f => ({ ...f, contatoNome: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Celular</Label>
                    <Input value={form.contatoCelular} onChange={e => setForm(f => ({ ...f, contatoCelular: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">E-mail</Label>
                    <Input value={form.contatoEmail} onChange={e => setForm(f => ({ ...f, contatoEmail: e.target.value }))} className="mt-1" type="email" />
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div>
                <Label className="text-xs font-medium">Observações</Label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
                  placeholder="Informações adicionais..."
                />
              </div>

              <div className="flex gap-2 justify-end pt-1 border-t">
                <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
                <Button
                  onClick={salvar}
                  disabled={!form.razaoSocial.trim() || isPending}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {editandoId ? "Salvar Alterações" : "Criar Cliente"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
