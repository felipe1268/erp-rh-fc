import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Building2, Phone, Mail, MapPin,
  CheckCircle2, XCircle, AlertTriangle, Loader2, X, ChevronDown, ChevronUp, Users,
} from "lucide-react";

const CATEGORIAS_PADRAO = [
  "Cimento e Argamassa", "Aço e Ferro", "Madeira e Compensado", "Elétrico",
  "Hidráulico", "Pintura", "Ferragens", "Locação de Equipamentos",
  "Mão de Obra", "Concreto e Blocos", "Impermeabilização", "EPI e Segurança", "Outros",
];

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function situacaoBadge(s?: string | null) {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.includes("ATIVA")) return <Badge className="bg-emerald-100 text-emerald-700 border-0">ATIVA</Badge>;
  if (upper.includes("SUSPENSA")) return <Badge className="bg-yellow-100 text-yellow-700 border-0">SUSPENSA</Badge>;
  if (upper.includes("INAPTA")) return <Badge className="bg-red-100 text-red-700 border-0">INAPTA</Badge>;
  if (upper.includes("BAIXADA")) return <Badge className="bg-slate-100 text-slate-600 border-0">BAIXADA</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

const EMPTY_FORM = {
  cnpj: "", razaoSocial: "", nomeFantasia: "", situacaoReceita: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
  telefone: "", email: "", contatoNome: "", contatoCelular: "", contatoEmail: "",
  banco: "", agencia: "", conta: "", pix: "", categorias: [] as string[], observacoes: "",
};

export default function Fornecedores() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca]       = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAtivos, setApenasAtivos] = useState(true);

  const { data: fornecedores = [], refetch, isLoading } = trpc.compras.listarFornecedores.useQuery(
    { companyId, ativo: apenasAtivos || undefined },
    { enabled: !!companyId }
  );

  const { data: categorias = [] } = trpc.compras.listarCategoriasFornecedores.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const lista = useMemo(() => {
    let r = fornecedores;
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(f =>
        f.razaoSocial?.toLowerCase().includes(b) ||
        f.nomeFantasia?.toLowerCase().includes(b) ||
        f.cnpj?.includes(b) ||
        f.cidade?.toLowerCase().includes(b)
      );
    }
    if (filtroCateg !== "todas") {
      r = r.filter(f => Array.isArray(f.categorias) && (f.categorias as string[]).includes(filtroCateg));
    }
    return r;
  }, [fornecedores, busca, filtroCateg]);

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]       = useState<number | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [erroCNPJ, setErroCNPJ]       = useState<string | null>(null);
  const [detalheId, setDetalheId]     = useState<number | null>(null);

  const buscarCNPJQuery = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: form.cnpj.replace(/\D/g, "") },
    { enabled: false, retry: false }
  );

  const criarMut    = trpc.compras.criarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Fornecedor cadastrado!"); } });
  const atualizarMut = trpc.compras.atualizarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Fornecedor atualizado!"); } });
  const excluirMut  = trpc.compras.excluirFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Fornecedor desativado."); } });

  function abrirNovo() {
    setForm({ ...EMPTY_FORM });
    setEditando(null);
    setErroCNPJ(null);
    setModalAberto(true);
  }

  function abrirEditar(f: any) {
    setForm({
      cnpj: f.cnpj ?? "", razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia ?? "",
      situacaoReceita: f.situacaoReceita ?? "", endereco: f.endereco ?? "", numero: f.numero ?? "",
      complemento: f.complemento ?? "", bairro: f.bairro ?? "", cidade: f.cidade ?? "",
      estado: f.estado ?? "", cep: f.cep ?? "", telefone: f.telefone ?? "", email: f.email ?? "",
      contatoNome: f.contatoNome ?? "", contatoCelular: f.contatoCelular ?? "", contatoEmail: f.contatoEmail ?? "",
      banco: f.banco ?? "", agencia: f.agencia ?? "", conta: f.conta ?? "", pix: f.pix ?? "",
      categorias: Array.isArray(f.categorias) ? f.categorias : [], observacoes: f.observacoes ?? "",
    });
    setEditando(f.id);
    setErroCNPJ(null);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setErroCNPJ(null);
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
        setErroCNPJ(`Atenção: situação na Receita é "${d.situacaoReceita}". Cadastro bloqueado para situações irregulares.`);
        if ([3, 4, 8].includes(situacaoCod)) return;
      }

      setForm(prev => ({
        ...prev,
        razaoSocial: d.razaoSocial || prev.razaoSocial,
        nomeFantasia: d.nomeFantasia || prev.nomeFantasia,
        situacaoReceita: d.situacaoReceita || prev.situacaoReceita,
        endereco: d.endereco || prev.endereco,
        numero: d.numero || prev.numero,
        complemento: d.complemento || prev.complemento,
        bairro: d.bairro || prev.bairro,
        cidade: d.cidade || prev.cidade,
        estado: d.estado || prev.estado,
        cep: d.cep || prev.cep,
        telefone: d.telefone || prev.telefone,
        email: d.email || prev.email,
      }));
    } catch {
      setErroCNPJ("Erro ao consultar a Receita Federal. Verifique o CNPJ e tente novamente.");
    } finally {
      setBuscandoCNPJ(false);
    }
  }

  function toggleCategoria(c: string) {
    setForm(prev => ({
      ...prev,
      categorias: prev.categorias.includes(c)
        ? prev.categorias.filter(x => x !== c)
        : [...prev.categorias, c],
    }));
  }

  function salvar() {
    if (!form.razaoSocial.trim()) { toast.error("Razão Social é obrigatória."); return; }
    if (editando) {
      atualizarMut.mutate({ id: editando, ...form });
    } else {
      criarMut.mutate({ companyId, ...form });
    }
  }

  const todasCategorias = useMemo(() => {
    const set = new Set([...CATEGORIAS_PADRAO, ...categorias]);
    return Array.from(set).sort();
  }, [categorias]);

  const detalhe = detalheId !== null ? fornecedores.find(f => f.id === detalheId) : null;

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Fornecedores
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""} cadastrado{fornecedores.length !== 1 ? "s" : ""}
            </p>
          </div>
          <DraggableCommandBar barId="fornecedores" items={[
            { id: "novo", node: <Button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4 mr-2" /> Novo Fornecedor</Button> },
          ]} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, CNPJ ou cidade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <select
            value={filtroCateg}
            onChange={e => setFiltroCateg(e.target.value)}
            className="h-9 text-sm border border-slate-200 rounded-md px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas categorias</option>
            {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={apenasAtivos}
              onChange={e => setApenasAtivos(e.target.checked)}
              className="rounded"
            />
            Apenas ativos
          </label>
          <span className="text-xs text-slate-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
            <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum fornecedor encontrado</p>
            <p className="text-sm text-slate-400 mt-1">Cadastre seu primeiro fornecedor clicando em "Novo Fornecedor"</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {lista.map(f => (
              <div
                key={f.id}
                className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow ${!f.ativo ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 truncate">{f.nomeFantasia || f.razaoSocial}</span>
                      {situacaoBadge(f.situacaoReceita)}
                      {!f.ativo && <Badge variant="outline" className="text-slate-400 border-slate-300">Inativo</Badge>}
                    </div>
                    {f.nomeFantasia && f.nomeFantasia !== f.razaoSocial && (
                      <p className="text-xs text-slate-500 mt-0.5">{f.razaoSocial}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                      {f.cnpj && <span className="font-mono">{formatCNPJ(f.cnpj)}</span>}
                      {f.cidade && f.estado && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.cidade}/{f.estado}</span>}
                      {f.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{f.telefone}</span>}
                      {f.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{f.email}</span>}
                    </div>
                    {Array.isArray(f.categorias) && f.categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(f.categorias as string[]).map(c => (
                          <span key={c} className="bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetalheId(detalheId === f.id ? null : f.id)}>
                      {detalheId === f.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => abrirEditar(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {f.ativo && (
                      <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => excluirMut.mutate({ id: f.id })}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Detalhe expandido */}
                {detalheId === f.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Contato Comercial</p>
                      <p className="text-slate-700">{f.contatoNome || "—"}</p>
                      <p className="text-slate-500">{f.contatoCelular || ""}</p>
                      <p className="text-slate-500">{f.contatoEmail || ""}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Endereço</p>
                      <p className="text-slate-700">{[f.endereco, f.numero, f.complemento].filter(Boolean).join(", ") || "—"}</p>
                      <p className="text-slate-500">{f.bairro || ""}</p>
                      <p className="text-slate-500">{f.cep ? `CEP ${f.cep}` : ""}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Dados Bancários</p>
                      <p className="text-slate-700">{f.banco || "—"}</p>
                      {f.agencia && <p className="text-slate-500">Ag. {f.agencia} / C. {f.conta}</p>}
                      {f.pix && <p className="text-slate-500">PIX: {f.pix}</p>}
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Observações</p>
                      <p className="text-slate-700">{f.observacoes || "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Cadastro/Edição */}
      <Dialog open={modalAberto} onOpenChange={v => !v && fecharModal()}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">{editando ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Linha 1: CNPJ + Razão Social */}
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-3">
                <Label className="text-xs text-slate-500">CNPJ</Label>
                <div className="flex gap-1 mt-0.5">
                  <Input
                    value={form.cnpj}
                    onChange={e => setForm(p => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                    placeholder="00.000.000/0000-00"
                    className="font-mono h-8 text-xs"
                    maxLength={18}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs shrink-0" onClick={buscarCNPJ} disabled={buscandoCNPJ || form.cnpj.replace(/\D/g, "").length !== 14}>
                    {buscandoCNPJ ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
              </div>
              <div className="col-span-6">
                <Label className="text-xs text-slate-500">Razão Social *</Label>
                <Input value={form.razaoSocial} onChange={e => setForm(p => ({ ...p, razaoSocial: e.target.value }))} className="mt-0.5 h-8 text-xs" />
              </div>
              <div className="col-span-3">
                <Label className="text-xs text-slate-500">Nome Fantasia</Label>
                <Input value={form.nomeFantasia} onChange={e => setForm(p => ({ ...p, nomeFantasia: e.target.value }))} className="mt-0.5 h-8 text-xs" />
              </div>
            </div>

            {erroCNPJ && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {erroCNPJ}
              </div>
            )}

            {/* Linha 2: Endereço */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Endereço</p>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <Label className="text-xs text-slate-500">Logradouro</Label>
                  <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs text-slate-500">Nº</Label>
                  <Input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Complemento</Label>
                  <Input value={form.complemento} onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Bairro</Label>
                  <Input value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">CEP</Label>
                  <Input value={form.cep} onChange={e => setForm(p => ({ ...p, cep: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-4">
                  <Label className="text-xs text-slate-500">Cidade</Label>
                  <Input value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Estado</Label>
                  <Input value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))} className="mt-0.5 h-8 text-xs" maxLength={2} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs text-slate-500">Situação Receita</Label>
                  <Input value={form.situacaoReceita} readOnly className="mt-0.5 h-8 text-xs bg-slate-50" />
                </div>
              </div>
            </div>

            {/* Linha 3: Contato */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Contato</p>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Telefone</Label>
                  <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-4">
                  <Label className="text-xs text-slate-500">E-mail</Label>
                  <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-0.5 h-8 text-xs" type="email" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Contato Comercial</Label>
                  <Input value={form.contatoNome} onChange={e => setForm(p => ({ ...p, contatoNome: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Celular</Label>
                  <Input value={form.contatoCelular} onChange={e => setForm(p => ({ ...p, contatoCelular: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">E-mail Contato</Label>
                  <Input value={form.contatoEmail} onChange={e => setForm(p => ({ ...p, contatoEmail: e.target.value }))} className="mt-0.5 h-8 text-xs" type="email" />
                </div>
              </div>
            </div>

            {/* Linha 4: Dados bancários */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Dados Bancários</p>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <Label className="text-xs text-slate-500">Banco</Label>
                  <Input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Agência</Label>
                  <Input value={form.agencia} onChange={e => setForm(p => ({ ...p, agencia: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Conta</Label>
                  <Input value={form.conta} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} className="mt-0.5 h-8 text-xs" />
                </div>
                <div className="col-span-5">
                  <Label className="text-xs text-slate-500">Chave PIX</Label>
                  <Input value={form.pix} onChange={e => setForm(p => ({ ...p, pix: e.target.value }))} className="mt-0.5 h-8 text-xs" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                </div>
              </div>
            </div>

            {/* Linha 5: Categorias + Observações lado a lado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Categorias de Fornecimento</p>
                <div className="flex flex-wrap gap-1.5">
                  {todasCategorias.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCategoria(c)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                        form.categorias.includes(c)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className="mt-1.5 text-xs resize-none" rows={3} />
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={fecharModal}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={criarMut.isPending || atualizarMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {(criarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                {editando ? "Salvar Alterações" : "Cadastrar Fornecedor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
