import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { normalizarTexto } from "@shared/textNormalization";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, ShoppingBag, ChevronRight, Loader2, CheckCircle, Truck, PackageCheck, Building2, AlertTriangle, Clock, CircleDot, Phone, Mail, User, Smartphone, FileDown, Printer, Receipt, DollarSign, Wrench, ExternalLink } from "lucide-react";
import { calcularSemaforo, semaforoCor, semaforoTooltip, type SemaforoResult } from "@/lib/semaforoEntrega";
import { PurchaseTimeline } from "@/components/compras/PurchaseTimeline";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pendente:         { label: "Pendente",           cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovada:         { label: "Aprovada",            cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aguardando_aprovacao_extra: { label: "Aguardando Admin", cls: "bg-red-50 text-red-700 border-red-200" },
  entregue_parcial: { label: "Entrega Parcial",     cls: "bg-orange-50 text-orange-700 border-orange-200" },
  entregue:         { label: "Entregue",            cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelada:        { label: "Cancelada",           cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface FornecedorContatoData {
  contatoNome?: string | null;
  telefone?: string | null;
  contatoCelular?: string | null;
  contatoEmail?: string | null;
  email?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
}

function FornecedorContatoCard({ contato }: { contato: FornecedorContatoData | null | undefined }) {
  if (!contato) return null;
  const hasAnyContact = contato.contatoNome || contato.telefone || contato.contatoCelular || contato.contatoEmail || contato.email;
  const hasPhone = !!(contato.telefone || contato.contatoCelular);
  const hasEmail = !!(contato.contatoEmail || contato.email);
  const isIncomplete = !hasPhone || !hasEmail;

  if (!hasAnyContact) return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-xs text-amber-700 font-medium">Cadastro incompleto - sem dados de contato</span>
    </div>
  );

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <User className="h-3.5 w-3.5 text-blue-500" />
        <span className="font-semibold text-blue-800 text-xs">Contato do Fornecedor</span>
        {isIncomplete && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> Incompleto
          </span>
        )}
      </div>
      {contato.contatoNome && (
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="text-gray-700 text-xs">{contato.contatoNome}</span>
        </div>
      )}
      {contato.telefone && (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.telefone}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.telefone}</a>
        </div>
      )}
      {contato.contatoCelular && (
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.contatoCelular}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.contatoCelular}</a>
        </div>
      )}
      {(contato.contatoEmail || contato.email) && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`mailto:${contato.contatoEmail || contato.email}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.contatoEmail || contato.email}</a>
        </div>
      )}
    </div>
  );
}

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "" });

export default function Ordens() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [abaAtiva, setAbaAtiva] = useState<"oc" | "os">("oc");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroAtrasadas, setFiltroAtrasadas] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [showFdDialog, setShowFdDialog] = useState<any>(null);
  const [fdForm, setFdForm] = useState({ modalidade: "fd_cliente" as "fd_cliente" | "fd_terceiro", valor: "", bdiItemId: 0, contractId: 0 });

  const [autoSwitchedForCompany, setAutoSwitchedForCompany] = useState<number | null>(null);
  const urlTabHandled = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("destaque");
    if (d) {
      const id = parseInt(d);
      if (!isNaN(id)) setShowDetalhe(id);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("tab") === "os") {
      setAbaAtiva("os");
      urlTabHandled.current = true;
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [form, setForm] = useState({
    obraId: "", fornecedorId: "", dataEntregaPrevista: "", dataVencimento: "", observacoes: "",
    frete: "", outrasDespesas: "", impostos: "", desconto: "",
    condicaoPagamento: "", prazoEntregaDias: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);

  const q = trpc.compras.listarOrdens.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus, apenasAtrasadas: filtroAtrasadas || undefined },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getOrdem.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const parcelasQ = trpc.purchase.listarParcelasOC.useQuery(
    { ordemId: showDetalhe!, companyId },
    { enabled: showDetalhe !== null && companyId > 0 }
  );
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const contratosOS = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const allOCsQ = trpc.compras.listarOrdens.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  useEffect(() => {
    if (urlTabHandled.current) return;
    if (autoSwitchedForCompany === companyId) return;
    if (allOCsQ.data && contratosOS.data) {
      if (allOCsQ.data.length === 0 && contratosOS.data.length > 0) {
        setAbaAtiva("os");
      }
      setAutoSwitchedForCompany(companyId);
    }
  }, [allOCsQ.data, contratosOS.data, companyId, autoSwitchedForCompany]);

  const criarManual = trpc.compras.criarOrdemManual.useMutation({
    onSuccess: () => { toast.success("Ordem de Compra criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusOrdem.useMutation({
    onSuccess: (res: any) => {
      if (res?.almoxarifado) {
        toast.success(`OC entregue! ${res.itens ?? 0} ite${res.itens === 1 ? "m enviado" : "ns enviados"} ao Almoxarifado automaticamente.`);
      } else {
        toast.success("Status atualizado!");
      }
      q.refetch();
      detalheQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirOrdem.useMutation({
    onSuccess: () => { toast.success("OC excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirLote = trpc.compras.excluirOrdensEmLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.count} OC(s) excluída(s)!`); q.refetch(); setSelectedIds(new Set()); setConfirmExcluirLote(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarEntregaMut = trpc.compras.atualizarDadosEntregaOC.useMutation({
    onSuccess: () => { toast.success("Dados de entrega atualizados!"); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const marcarFd = trpc.compras.marcarOcComoFd.useMutation({
    onSuccess: () => { toast.success("OC marcada como Faturamento Direto!"); q.refetch(); detalheQ.refetch(); setShowFdDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarFd = trpc.compras.aprovarFdCliente.useMutation({
    onSuccess: () => { toast.success("FD aprovado pelo cliente!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarExtra = trpc.compras.aprovarOcExtra.useMutation({
    onSuccess: (res) => {
      toast.success(`OC aprovada pelo administrador ${res.adminNome}!`);
      if (res.docsPendentes && res.docsPendentes.length > 0) {
        toast.warning(`Atenção: Documentos PJ pendentes para o prestador: ${res.docsPendentes.join(", ")}. Regularize antes do pagamento.`, { duration: 8000 });
      }
      if (res.contratoGerado) {
        toast.info(res.contratoGerado.tipo === "aditivo" ? "Contrato PJ existente atualizado via aditivo." : "Contrato PJ gerado automaticamente.", { duration: 5000 });
      }
      q.refetch(); detalheQ.refetch(); setShowAprovacaoExtra(null); setAprovExtraForm({ adminEmail: "", adminSenha: "", justificativa: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const [showAprovacaoExtra, setShowAprovacaoExtra] = useState<any>(null);
  const [aprovExtraForm, setAprovExtraForm] = useState({ adminEmail: "", adminSenha: "", justificativa: "" });
  const [editTransp, setEditTransp] = useState("");
  const [editRastreio, setEditRastreio] = useState("");

  function resetForm() {
    setForm({ obraId: "", fornecedorId: "", dataEntregaPrevista: "", dataVencimento: "", observacoes: "", frete: "", outrasDespesas: "", impostos: "", desconto: "", condicaoPagamento: "", prazoEntregaDias: "" });
    setItens([newItem()]);
  }

  function handleSalvar() {
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta ordem de compra.");
    if (!form.condicaoPagamento.trim()) return toast.error("Informe a Condição de Pagamento para gerar a OC.");
    if (!(form as any).prazoEntregaDias && !form.dataEntregaPrevista) return toast.error("Informe o Prazo de Entrega para gerar a OC.");
    const validos = itens.filter(i => i.descricao.trim());
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");
    criarManual.mutate({
      companyId,
      obraId: parseInt(form.obraId),
      fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
      condicaoPagamento: form.condicaoPagamento,
      prazoEntregaDias: parseInt((form as any).prazoEntregaDias) || undefined,
      dataEntregaPrevista: form.dataEntregaPrevista || undefined,
      dataVencimento: form.dataVencimento || undefined,
      observacoes: form.observacoes || undefined,
      frete: parseFloat(form.frete) || 0,
      outrasDespesas: parseFloat(form.outrasDespesas) || 0,
      impostos: parseFloat(form.impostos) || 0,
      desconto: parseFloat(form.desconto) || 0,
      itens: validos.map(i => ({
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
      })),
    });
  }

  function addItem() { setItens(p => [...p, newItem()]); }
  function removeItem(idx: number) { setItens(p => p.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItens(p => p.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const fornecedores = fornQ.data ?? [];
  const obras = obrasQ.data ?? [];
  const lista = q.data ?? [];
  const filt = lista.filter(o => !busca || o.numeroOc?.toLowerCase().includes(busca.toLowerCase()));
  const detalhe = detalheQ.data;

  const allFilteredIds = filt.map(o => o.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allSelected) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(allFilteredIds)); }
  }

  const totalItens = itens.reduce((s, it) => s + (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0), 0);
  const totalOC = totalItens + (parseFloat(form.frete) || 0) + (parseFloat(form.outrasDespesas) || 0) + (parseFloat(form.impostos) || 0) - (parseFloat(form.desconto) || 0);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  const pend = lista.filter(o => o.status === "pendente").length;
  const aprov = lista.filter(o => o.status === "aprovada").length;
  const entregue = lista.filter(o => o.status === "entregue").length;
  const totalVal = lista.reduce((s, o) => s + parseFloat(o.total ?? "0"), 0);
  const atrasadas = lista.filter(o => {
    const sem = calcularSemaforo(o.dataEntregaPrevista, o.dataEntregaReal, o.status, o.proximaEntregaProgramada);
    return sem.status === "atrasado";
  }).length;

  interface KpiCard {
    label: string;
    value: string | number;
    icon: typeof ShoppingBag;
    cls: string;
    onClick?: () => void;
  }
  const kpiCards: KpiCard[] = [
    { label: "Pendentes",    value: pend,    icon: ShoppingBag,  cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Aprovadas",   value: aprov,   icon: CheckCircle,  cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Atrasadas",   value: atrasadas, icon: AlertTriangle, cls: atrasadas > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500", onClick: () => { setFiltroAtrasadas(!filtroAtrasadas); setFiltroStatus("todos"); } },
    { label: "Entregues",   value: entregue, icon: PackageCheck, cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Total em OCs", value: totalVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icon: Truck, cls: "bg-purple-50 border-purple-200 text-purple-700" },
  ];

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ordens de Compra / Serviço</h1>
            <p className="text-sm text-gray-500">Acompanhe OCs de material e contratos de serviço (OS)</p>
          </div>
        </div>
        {abaAtiva === "oc" && (
          <DraggableCommandBar barId="ordens-compra" items={[
            { id: "nova", node: <Button onClick={() => setShowNova(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova OC Manual</Button> },
          ]} />
        )}
      </div>

      {/* Tabs OC / OS */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-fit">
        <button
          onClick={() => { setAbaAtiva("oc"); setBusca(""); setFiltroStatus("todos"); setFiltroAtrasadas(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === "oc" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
          <ShoppingBag className="h-4 w-4" />
          Ordens de Compra (Material)
          {(q.data?.length ?? 0) > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${abaAtiva === "oc" ? "bg-emerald-500" : "bg-gray-200 text-gray-600"}`}>{q.data?.length ?? 0}</span>}
        </button>
        <button
          onClick={() => { setAbaAtiva("os"); setBusca(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === "os" ? "bg-purple-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
          <Wrench className="h-4 w-4" />
          Contratos de Serviço (OS)
          {(contratosOS.data?.length ?? 0) > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${abaAtiva === "os" ? "bg-purple-500" : "bg-gray-200 text-gray-600"}`}>{contratosOS.data?.length ?? 0}</span>}
        </button>
      </div>

      {abaAtiva === "oc" && <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiCards.map((k, i) => (
          <div key={i} className={`rounded-xl border p-4 ${k.cls} ${k.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={k.onClick}>
            <div className="flex items-center gap-2 mb-1">
              <k.icon className="h-4 w-4" />
              <span className="text-xs font-medium text-gray-500">{k.label}</span>
            </div>
            <div className="text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "pendente", "aprovada", "entregue_parcial", "entregue", "cancelada"].map(s => (
            <button key={s} onClick={() => { setFiltroStatus(s); setFiltroAtrasadas(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s && !filtroAtrasadas ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
              {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label}
            </button>
          ))}
          <button onClick={() => { setFiltroAtrasadas(!filtroAtrasadas); setFiltroStatus("todos"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${filtroAtrasadas ? "bg-red-600 border-red-500 text-white" : "bg-white border-red-300 text-red-600 hover:border-red-400"}`}>
            <AlertTriangle className="h-3 w-3" /> Atrasadas
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} OC(s) selecionada(s)</span>
          <Button size="sm" variant="destructive" className="gap-1.5 ml-auto" onClick={() => setConfirmExcluirLote(true)} disabled={excluirLote.isPending}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionadas
          </Button>
          <Button size="sm" variant="outline" className="text-gray-600" onClick={() => setSelectedIds(new Set())}>Cancelar</Button>
        </div>
      )}

      {/* Tabela */}
      <TooltipProvider>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10 px-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas" />
              </TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Número OC</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Obra</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Fornecedor</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Origem</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Total</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Entrega Prevista</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400">Nenhuma ordem encontrada</TableCell></TableRow>
            ) : filt.map(oc => {
              const st = STATUS_LABELS[oc.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === oc.fornecedorId);
              const semaforo = calcularSemaforo(oc.dataEntregaPrevista, oc.dataEntregaReal, oc.status, oc.proximaEntregaProgramada);
              const semCor = semaforoCor(semaforo.status);
              const semTip = semaforoTooltip(semaforo);
              return (
                <TableRow key={oc.id} className={`border-gray-100 cursor-pointer ${selectedIds.has(oc.id) ? "bg-blue-50/60" : oc.status === "entregue" ? "bg-emerald-50/40 hover:bg-emerald-50/70" : oc.status === "cancelada" ? "bg-gray-50/60 hover:bg-gray-100/60 opacity-60" : "hover:bg-gray-50"}`} onClick={() => setShowDetalhe(oc.id)}>
                  <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(oc.id)} onCheckedChange={() => toggleSelect(oc.id)} aria-label={`Selecionar ${oc.numeroOc}`} />
                  </TableCell>
                  <TableCell className="text-center px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex justify-center">
                          <CircleDot className={`h-5 w-5 ${semCor}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-gray-900 text-white text-xs max-w-48 whitespace-pre-line">
                        {semTip}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className={`font-mono font-semibold text-sm ${oc.status === "entregue" ? "text-emerald-700" : oc.status === "cancelada" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    <div className="flex items-center gap-1.5">
                      {oc.numeroOc}
                      {((oc as any).tipo === "servico" || (oc as any).tipo === "pacote") && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded ${(oc as any).tipo === "pacote" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
                          {(oc as any).tipo === "servico" ? "SERVIÇO" : "PACOTE"}
                        </span>
                      )}
                    </div>
                    {(oc as any).modalidadeFd && (oc as any).modalidadeFd !== "normal" && (
                      <span className={`px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded ${(oc as any).fdStatus === "aprovado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        FD {(oc as any).modalidadeFd === "fd_cliente" ? "CLIENTE" : "TERCEIRO"}
                      </span>
                    )}
                    {oc.status === "entregue" && <span className="block text-[10px] font-sans font-normal text-emerald-500">OC concluída</span>}
                    {((oc as any).tipo === "servico" || (oc as any).tipo === "pacote") && (oc as any).contratoId && (
                      <span className="block text-[10px] font-sans font-normal text-blue-500">Contrato PJ vinculado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(oc as any).obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra((oc as any).obraId) ?? `#${(oc as any).obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-600 text-sm">
                    <div className="flex items-center gap-1.5">
                      {forn?.nomeFantasia || forn?.razaoSocial || "—"}
                      {forn && (() => {
                        const hasAny = forn.contatoNome || forn.telefone || forn.contatoCelular || forn.contatoEmail || forn.email;
                        const hasPhoneCh = !!(forn.telefone || forn.contatoCelular);
                        const hasEmailCh = !!(forn.contatoEmail || forn.email);
                        const incomplete = !hasPhoneCh || !hasEmailCh;
                        if (!hasAny) return <span title="Cadastro incompleto"><AlertTriangle className="h-3 w-3 text-amber-400" /></span>;
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" onClick={e => e.stopPropagation()} className={`p-0.5 transition ${incomplete ? "text-amber-500 hover:text-amber-700" : "text-blue-400 hover:text-blue-600"}`} title={incomplete ? "Cadastro incompleto" : "Contato"}>
                                {incomplete ? <AlertTriangle className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3 bg-white border-gray-200 shadow-lg" side="bottom" align="start" onClick={e => e.stopPropagation()}>
                              <FornecedorContatoCard contato={forn} />
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-400 text-xs">{oc.cotacaoId ? `COT #${oc.cotacaoId}` : "Manual"}</TableCell>
                  <TableCell className="text-emerald-700 font-semibold text-sm">
                    {parseFloat(oc.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{oc.dataEntregaPrevista ? new Date(oc.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      {(oc as any).pendenteCoberturaOrcamentaria && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200" title="Itens sem verba orçamentária — pendente de realocação">
                          S/ VERBA
                        </span>
                      )}
                      {oc.status === "aguardando_aprovacao_extra" && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse" title="Compra acima do orçamento — necessita aprovação de administrador">
                          ADMIN
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>

      {/* Dialog Nova OC Manual */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Nova Ordem de Compra (Manual)</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Obra obrigatória */}
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-emerald-600" /> Obra / Centro de Custo *
              </Label>
              <Select value={form.obraId} onValueChange={v => setForm(p => ({ ...p, obraId: v }))}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecione a obra vinculada..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {obras.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.codigo ? `[${o.codigo}] ` : ""}{o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Obrigatório — o custo desta OC será apropriado à obra selecionada.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Fornecedor</Label>
              <Select value={form.fornecedorId} onValueChange={v => setForm(p => ({ ...p, fornecedorId: v }))}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="none">Nenhum</SelectItem>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.nomeFantasia || f.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">
                Condição de Pagamento *
              </Label>
              <Input className="bg-white border-gray-300 text-gray-900" placeholder="Ex: 30/60/90 dias, à vista, boleto 28 dias..."
                value={form.condicaoPagamento} onChange={e => setForm(p => ({ ...p, condicaoPagamento: e.target.value }))} />
              <p className="text-xs text-gray-400">Obrigatório — informe a forma/condição de pagamento negociada.</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Prazo Entrega (dias) *</Label>
                <Input type="number" min="1" className="bg-white border-gray-300 text-gray-900" value={(form as any).prazoEntregaDias ?? ""} onChange={e => {
                  const dias = e.target.value;
                  setForm(p => {
                    const upd: any = { ...p, prazoEntregaDias: dias };
                    if (dias && parseInt(dias) > 0) {
                      const dt = new Date();
                      dt.setDate(dt.getDate() + parseInt(dias));
                      upd.dataEntregaPrevista = dt.toISOString().split("T")[0];
                    }
                    return upd;
                  });
                }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Previsão de Entrega</Label>
                <Input type="date" className="bg-white border-gray-300 text-gray-900" value={form.dataEntregaPrevista} onChange={e => {
                  const dataStr = e.target.value;
                  setForm(p => {
                    const upd: any = { ...p, dataEntregaPrevista: dataStr };
                    if (dataStr) {
                      const hoje = new Date();
                      hoje.setHours(0, 0, 0, 0);
                      const dt = new Date(dataStr + "T00:00:00");
                      const diffDias = Math.max(0, Math.round((dt.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
                      upd.prazoEntregaDias = String(diffDias);
                    }
                    return upd;
                  });
                }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium text-orange-700">Vencimento do Pagamento</Label>
                <Input type="date" className="bg-white border-orange-300 text-gray-900 focus:border-orange-500" value={form.dataVencimento} onChange={e => setForm(p => ({ ...p, dataVencimento: e.target.value }))} />
                <p className="text-xs text-orange-500">Data que o pagamento deve ser efetuado ao fornecedor.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Observações</Label>
              <Textarea className="bg-white border-gray-300 text-gray-900 resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-700 font-semibold text-sm">Itens *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="border-gray-300 text-gray-600 hover:bg-gray-50 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex gap-2">
                      <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm" placeholder="Descrição *" value={it.descricao} onChange={e => updateItem(idx, "descricao", e.target.value)} onBlur={e => updateItem(idx, "descricao", normalizarTexto(e.target.value))} />
                      {itens.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Select value={it.unidade} onValueChange={v => updateItem(idx, "unidade", v)}>
                        <SelectTrigger className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white border-gray-200">
                          {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="w-24 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(idx, "quantidade", e.target.value)} />
                      <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" step="0.01" placeholder="Preço unit. (R$)" value={it.precoUnitario} onChange={e => updateItem(idx, "precoUnitario", e.target.value)} />
                      <span className="text-emerald-700 text-sm font-medium w-28 text-right">
                        {((parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totalizadores */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-3">Totalizadores</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-gray-500 text-xs">Subtotal (Itens)</Label>
                  <div className="text-gray-900 font-mono text-sm">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </div>
                {[
                  { label: "+ Frete (R$)",            key: "frete" as const },
                  { label: "+ Outras Despesas (R$)",  key: "outrasDespesas" as const },
                  { label: "+ Impostos (R$)",          key: "impostos" as const },
                  { label: "− Desconto (R$)",         key: "desconto" as const },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-gray-500 text-xs">{f.label}</Label>
                    <Input type="number" min="0" step="0.01" className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                      value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-2">
                <span className="text-gray-700 font-semibold text-sm">Total da OC</span>
                <span className="text-emerald-700 font-bold text-lg">{totalOC.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criarManual.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white">
                {criarManual.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar OC"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe OC */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="border-gray-200 w-screen h-screen max-w-none max-h-none rounded-none overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {detalhe?.numeroOc} — {((detalhe as any)?.tipo === "servico" || (detalhe as any)?.tipo === "pacote") ? "Ordem de Serviço" : "Ordem de Compra"}
              {((detalhe as any)?.tipo === "servico" || (detalhe as any)?.tipo === "pacote") && (
                <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded ${(detalhe as any).tipo === "pacote" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
                  {(detalhe as any).tipo === "servico" ? "SERVIÇO" : "PACOTE"}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (() => {
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const semaforoDetalhe = calcularSemaforo(detalhe.dataEntregaPrevista, detalhe.dataEntregaReal, detalhe.status, detalhe.proximaEntregaProgramada);
            return (
              <div className="space-y-5 pt-2">
                {semaforoDetalhe.status === "atrasado" && (
                  <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Entrega atrasada</p>
                      <p className="text-xs text-red-600">
                        {semaforoDetalhe.dias} dia{semaforoDetalhe.dias !== 1 ? "s" : ""} de atraso
                        {semaforoDetalhe.dataReferencia && ` — prevista para ${new Date(semaforoDetalhe.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>
                )}
                {semaforoDetalhe.status === "proximo" && (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Entrega próxima</p>
                      <p className="text-xs text-amber-600">
                        {semaforoDetalhe.dias === 0 ? "Entrega prevista para hoje" : `Faltam ${semaforoDetalhe.dias} dia${semaforoDetalhe.dias !== 1 ? "s" : ""} para a entrega`}
                        {semaforoDetalhe.dataReferencia && ` — ${new Date(semaforoDetalhe.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>
                )}
                {(detalhe as any).pendenteCoberturaOrcamentaria && (
                  <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 print:border-red-500">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-800">⚠ PREJUÍZO — Itens Acima do Orçado ou Sem Verba</p>
                      <p className="text-xs text-red-600">Esta OC contém itens sem verba disponível no orçamento. Os itens sinalizados geram prejuízo para a obra. É necessário realizar uma realocação de verba para cobrir o custo.</p>
                    </div>
                  </div>
                )}
                {detalhe.status === "aguardando_aprovacao_extra" && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-800">Compra Acima do Orçamento — Aprovação Admin Necessária</p>
                        <p className="text-xs text-red-600">{(detalhe as any).aprovacaoExtraMotivo || "Esta OC contém insumos que excedem a quantidade orçada. É necessário aprovação de um administrador para liberar."}</p>
                      </div>
                    </div>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5" onClick={() => setShowAprovacaoExtra(detalhe)}>
                      <CheckCircle className="h-3.5 w-3.5" /> Aprovar com Senha Admin
                    </Button>
                  </div>
                )}
                {(detalhe as any).aprovacaoExtraAdminNome && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>Aprovação extra concedida por <strong>{(detalhe as any).aprovacaoExtraAdminNome}</strong> em {(detalhe as any).aprovacaoExtraEm ? new Date((detalhe as any).aprovacaoExtraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div><span className="text-gray-400 text-xs">Obra</span><p className="text-gray-900 font-medium flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" />{nomeObra((detalhe as any).obraId) ?? "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.cls}`}>{st.label}</span></p></div>
                  <div><span className="text-gray-400 text-xs">Fornecedor</span><p className="text-gray-900 font-medium">{(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor?.nomeFantasia || (detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor?.razaoSocial || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Entrega prevista</span><p className="text-gray-900 font-medium">{detalhe.dataEntregaPrevista ? new Date(detalhe.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Entrega real</span><p className="text-gray-900 font-medium">{detalhe.dataEntregaReal ? new Date(detalhe.dataEntregaReal + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Origem</span><p className="text-gray-900 font-medium">{detalhe.cotacaoId ? `Cotação #${detalhe.cotacaoId}` : "Manual"}</p></div>
                  <div><span className="text-gray-400 text-xs">Criado em</span><p className="text-gray-900 font-medium">{new Date(detalhe.criadoEm).toLocaleDateString("pt-BR")}</p></div>
                  {((detalhe as any).freteTipo || (detalhe as any).transportadora || (detalhe as any).codigoRastreamento) && (
                    <>
                      <div>
                        <span className="text-gray-400 text-xs">Tipo de Frete</span>
                        <p className="text-gray-900 font-medium">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${(detalhe as any).freteTipo === "fob" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                            {((detalhe as any).freteTipo ?? "cif").toUpperCase()}
                          </span>
                          {parseFloat((detalhe as any).frete ?? "0") > 0 && (
                            <span className="ml-2 text-sm text-gray-600">
                              {parseFloat((detalhe as any).frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </p>
                      </div>
                      {(detalhe as any).transportadora && (
                        <div>
                          <span className="text-gray-400 text-xs">Transportadora</span>
                          <p className="text-gray-900 font-medium flex items-center gap-1"><Truck className="h-3 w-3 text-gray-400" />{(detalhe as any).transportadora}</p>
                        </div>
                      )}
                      {(detalhe as any).codigoRastreamento && (
                        <div>
                          <span className="text-gray-400 text-xs">Rastreamento</span>
                          <p className="text-gray-900 font-medium font-mono text-sm">{(detalhe as any).codigoRastreamento}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor && (
                  <FornecedorContatoCard contato={(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor} />
                )}

                {/* Composição */}
                {(() => {
                  const subtotal = parseFloat((detalhe as any).subtotal ?? detalhe.total ?? "0");
                  const frete = parseFloat((detalhe as any).frete ?? "0");
                  const outrasDespesas = parseFloat((detalhe as any).outrasDespesas ?? "0");
                  const impostos = parseFloat((detalhe as any).impostos ?? "0");
                  const desconto = parseFloat((detalhe as any).desconto ?? "0");
                  const total = parseFloat(detalhe.total ?? "0");
                  const hasExtras = frete > 0 || outrasDespesas > 0 || impostos > 0 || desconto > 0;
                  if (!hasExtras) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1.5">
                      <div className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2">Composição do Total</div>
                      {[
                        { label: "Subtotal itens", value: subtotal, neg: false },
                        { label: "+ Frete", value: frete, neg: false },
                        { label: "+ Outras despesas", value: outrasDespesas, neg: false },
                        { label: "+ Impostos", value: impostos, neg: false },
                        { label: "− Desconto", value: desconto, neg: true },
                      ].filter(r => r.value !== 0).map(r => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-gray-500">{r.label}</span>
                          <span className={r.neg ? "text-red-600" : "text-gray-700"}>{r.neg ? `-${fmt(r.value)}` : fmt(r.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                        <span className="text-gray-900 font-semibold">Total</span>
                        <span className="text-emerald-700 font-bold text-base">{fmt(total)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
                        <TableHead className="text-gray-500 text-xs">Descrição</TableHead>
                        <TableHead className="text-gray-500 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-gray-500 text-xs w-20">Qtd</TableHead>
                        <TableHead className="text-gray-500 text-xs w-24">Entregue</TableHead>
                        <TableHead className="text-gray-500 text-xs w-28">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detalhe.itens as any[]).map((it: any) => (
                        <TableRow key={it.id} className={`border-gray-100 ${it.semVerba ? "bg-red-50 print:bg-red-50" : ""}`}>
                          <TableCell className="text-gray-900 text-sm">
                            {it.descricao}
                            {it.semVerba && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 print:border-red-400">PREJUÍZO</span>}
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-gray-500 text-sm">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-gray-500 text-sm">{parseFloat(it.quantidadeEntregue || "0").toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-emerald-700 text-sm font-medium">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <PurchaseTimeline companyId={companyId} ordemId={detalhe.id} />
                </div>

                {(parcelasQ.data ?? []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Parcelas</p>
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
                            <TableHead className="text-gray-500 text-xs w-16">#</TableHead>
                            <TableHead className="text-gray-500 text-xs">Valor</TableHead>
                            <TableHead className="text-gray-500 text-xs">Vencimento</TableHead>
                            <TableHead className="text-gray-500 text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(parcelasQ.data ?? []).map((p: any) => (
                            <TableRow key={p.id} className="border-gray-100">
                              <TableCell className="text-gray-500 text-sm">{p.parcelaNumero ?? 1}/{p.parcelaTotal ?? 1}</TableCell>
                              <TableCell className="text-emerald-700 text-sm font-medium">{parseFloat(p.valorTotal || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                              <TableCell className="text-gray-700 text-sm">{p.dataVencimento ? new Date(p.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                              <TableCell className="text-sm"><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${p.status === "pago" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : p.status === "liberado" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{p.status}</span></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* PDF */}
                <div className="flex gap-3 border-t border-gray-200 pt-4">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const resp = await fetch(`/api/download/oc/${detalhe.id}?regen=1`);
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({ error: "Erro ao gerar PDF" }));
                          toast.error(err.error || "Erro ao gerar PDF");
                          return;
                        }
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${detalhe.numeroOc || "OC"}.pdf`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success("PDF exportado com sucesso!");
                      } catch {
                        toast.error("Erro ao exportar PDF");
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                  >
                    <FileDown className="h-3.5 w-3.5" /> Exportar PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`/api/download/oc/${detalhe.id}?mode=view&regen=1`, "_blank");
                    }}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                </div>

                {/* Alterar Status */}
                {!["entregue", "cancelada"].includes(detalhe.status) && (
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold">Atualizar Status</Label>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { s: "aprovada",         label: "Aprovar",           icon: CheckCircle,  cls: "bg-blue-600 hover:bg-blue-500 text-white" },
                        { s: "entregue_parcial", label: "Entrega Parcial",   icon: Truck,        cls: "bg-orange-500 hover:bg-orange-400 text-white" },
                        { s: "entregue",         label: "Marcar Entregue",   icon: PackageCheck, cls: "bg-emerald-600 hover:bg-emerald-500 text-white" },
                        { s: "cancelada",        label: "Cancelar",          icon: Trash2,       cls: "border border-red-200 text-red-600 hover:bg-red-50 bg-transparent" },
                      ].filter(a => a.s !== detalhe.status).filter(a => !(detalhe.status === "aguardando_aprovacao_extra" && a.s === "aprovada")).map(a => (
                        <Button key={a.s} size="sm" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: a.s })}
                          disabled={atualizarStatus.isPending}
                          className={`text-xs gap-1 ${a.cls}`}>
                          <a.icon className="h-3 w-3" /> {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* FD Section */}
                {(detalhe as any).modalidadeFd && (detalhe as any).modalidadeFd !== "normal" ? (
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5 text-gray-400" /> Faturamento Direto
                    </Label>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Modalidade</span><span className="font-medium">{(detalhe as any).modalidadeFd === "fd_cliente" ? "FD Cliente" : "FD Terceiro"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Valor FD</span><span className="font-medium">{parseFloat((detalhe as any).fdValor ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Status FD</span><span className={`font-medium ${(detalhe as any).fdStatus === "aprovado" ? "text-emerald-600" : "text-amber-600"}`}>{(detalhe as any).fdStatus === "aprovado" ? "Aprovado" : "Pendente aprovação"}</span></div>
                      {(detalhe as any).fdAprovadoPor && <div className="flex justify-between"><span className="text-gray-500">Aprovado por</span><span className="font-medium">{(detalhe as any).fdAprovadoPor}</span></div>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(detalhe as any).fdStatus === "pendente_aprovacao" && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1"
                          onClick={() => aprovarFd.mutate({ ocId: detalhe.id, companyId, aprovadoPor: "Cliente" })}
                          disabled={aprovarFd.isPending}>
                          <CheckCircle className="h-3 w-3" /> Registrar Aprovação FD
                        </Button>
                      )}
                      {(detalhe as any).modalidadeFd === "fd_cliente" && (
                        <Button size="sm" variant="outline" className="text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          onClick={() => window.open(`/api/download/fd/${detalhe.id}?mode=view`, "_blank")}>
                          <FileDown className="h-3 w-3" /> PDF Aprovação FD
                        </Button>
                      )}
                    </div>
                  </div>
                ) : !["cancelada", "entregue"].includes(detalhe.status) && (detalhe as any).tipo !== "servico" && (detalhe as any).tipo !== "pacote" && (
                  <div className="border-t border-gray-200 pt-4">
                    <Button size="sm" variant="outline" className="text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => { setShowFdDialog(detalhe); setFdForm({ modalidade: "fd_cliente", valor: "", bdiItemId: 0, contractId: 0 }); }}>
                      <Receipt className="h-3 w-3" /> Marcar como Faturamento Direto
                    </Button>
                  </div>
                )}

                {!["cancelada"].includes(detalhe.status) && (
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-gray-400" /> Dados de Entrega / Rastreamento
                    </Label>
                    <div className="flex gap-3 items-end flex-wrap">
                      <div className="space-y-1 flex-1 min-w-[180px]">
                        <Label className="text-gray-500 text-xs">Transportadora</Label>
                        <Input className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                          placeholder="Nome da transportadora"
                          value={editTransp || (detalhe as any).transportadora || ""}
                          onChange={e => setEditTransp(e.target.value)} />
                      </div>
                      <div className="space-y-1 flex-1 min-w-[180px]">
                        <Label className="text-gray-500 text-xs">Código de Rastreamento</Label>
                        <Input className="bg-white border-gray-300 text-gray-900 h-8 text-sm font-mono"
                          placeholder="Código de rastreio"
                          value={editRastreio || (detalhe as any).codigoRastreamento || ""}
                          onChange={e => setEditRastreio(e.target.value)} />
                      </div>
                      <Button size="sm"
                        disabled={atualizarEntregaMut.isPending || (!editTransp && !editRastreio)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1 h-8"
                        onClick={() => {
                          atualizarEntregaMut.mutate({
                            id: detalhe.id, companyId,
                            transportadora: editTransp || (detalhe as any).transportadora || undefined,
                            codigoRastreamento: editRastreio || (detalhe as any).codigoRastreamento || undefined,
                          });
                          setEditTransp(""); setEditRastreio("");
                        }}>
                        {atualizarEntregaMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex pt-2 border-t border-gray-200">
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-gray-200 text-gray-500 hover:bg-gray-50 text-xs ml-auto gap-1">
                    <Trash2 className="h-3 w-3" /> Excluir OC
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmExcluirLote} onOpenChange={setConfirmExcluirLote}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> ordem(ns) de compra? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmExcluirLote(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-1.5" disabled={excluirLote.isPending} onClick={() => excluirLote.mutate({ ids: [...selectedIds], companyId })}>
              {excluirLote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir {selectedIds.size} OC(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showAprovacaoExtra} onOpenChange={(v) => { if (!v) setShowAprovacaoExtra(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Aprovação Extra-Orçamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {showAprovacaoExtra?.aprovacaoExtraMotivo && (
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2.5 text-red-700 whitespace-pre-wrap">{showAprovacaoExtra.aprovacaoExtraMotivo}</div>
            )}
            <p className="text-sm text-gray-600">Esta OC contém insumos que ultrapassam a quantidade orçada. Um administrador deve autorizar a compra extra-orçamento.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Email do Administrador *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="email" placeholder="admin@empresa.com" value={aprovExtraForm.adminEmail} onChange={e => setAprovExtraForm(p => ({ ...p, adminEmail: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Senha do Administrador *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="password" placeholder="••••••" value={aprovExtraForm.adminSenha} onChange={e => setAprovExtraForm(p => ({ ...p, adminSenha: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Justificativa *</Label>
                <Textarea className="text-sm bg-white text-gray-900 border-gray-300 min-h-[60px]" placeholder="Motivo da compra extra-orçamento..." value={aprovExtraForm.justificativa} onChange={e => setAprovExtraForm(p => ({ ...p, justificativa: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAprovacaoExtra(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5" disabled={aprovarExtra.isPending || !aprovExtraForm.adminEmail || !aprovExtraForm.adminSenha || !aprovExtraForm.justificativa} onClick={() => {
                if (!showAprovacaoExtra) return;
                aprovarExtra.mutate({ ocId: showAprovacaoExtra.id, companyId, adminEmail: aprovExtraForm.adminEmail, adminSenha: aprovExtraForm.adminSenha, justificativa: aprovExtraForm.justificativa });
              }}>
                {aprovarExtra.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Aprovar OC
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* FD Dialog */}
      <Dialog open={!!showFdDialog} onOpenChange={v => { if (!v) setShowFdDialog(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-indigo-700 flex items-center gap-2"><Receipt className="h-5 w-5" /> Marcar Faturamento Direto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">Defina a modalidade e o valor do faturamento direto para esta OC.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Modalidade *</Label>
                <Select value={fdForm.modalidade} onValueChange={v => setFdForm(p => ({ ...p, modalidade: v as any }))}>
                  <SelectTrigger className="h-8 text-sm bg-white text-gray-900 border-gray-300"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fd_cliente">FD Cliente</SelectItem>
                    <SelectItem value="fd_terceiro">FD Terceiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Valor FD (R$) *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="number" step="0.01" placeholder="0.00" value={fdForm.valor} onChange={e => setFdForm(p => ({ ...p, valor: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowFdDialog(null)}>Cancelar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                disabled={marcarFd.isPending || !fdForm.valor || parseFloat(fdForm.valor) <= 0}
                onClick={() => {
                  if (!showFdDialog) return;
                  marcarFd.mutate({
                    ocId: showFdDialog.id,
                    companyId,
                    modalidade: fdForm.modalidade,
                    valor: parseFloat(fdForm.valor),
                    bdiItemId: fdForm.bdiItemId || undefined,
                  });
                }}>
                {marcarFd.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                Confirmar FD
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>}

      {abaAtiva === "os" && <ContratosServicoTab companyId={companyId} />}
    </div>
    </DashboardLayout>
  );
}

const OS_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ativo:     { label: "Ativo",     cls: "bg-green-100 text-green-800 border-green-200" },
  encerrado: { label: "Encerrado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  suspenso:  { label: "Suspenso",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  concluido: { label: "Concluído", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};

const BRL_OS = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
};

const fmtDateOS = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

function ContratosServicoTab({ companyId }: { companyId: number }) {
  const [, navigate] = useLocation();
  const [buscaOS, setBuscaOS] = useState("");
  const [filtroStatusOS, setFiltroStatusOS] = useState("todos");
  const [selectedOS, setSelectedOS] = useState<Set<number>>(new Set());
  const [confirmExcluirOS, setConfirmExcluirOS] = useState(false);

  const { data: contratos = [], isLoading, refetch } = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const excluirLoteOS = trpc.terceiroContratos.excluirContratosLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.deleted} contrato(s) excluído(s)`); setSelectedOS(new Set()); setConfirmExcluirOS(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtrados = contratos.filter((c: any) => {
    const b = buscaOS.toLowerCase();
    const matchBusca = !buscaOS || (c.descricao || "").toLowerCase().includes(b) || (c.numeroContrato || "").toLowerCase().includes(b);
    const matchStatus = filtroStatusOS === "todos" || c.status === filtroStatusOS;
    return matchBusca && matchStatus;
  });

  const toggleSelectOS = (id: number) => {
    setSelectedOS(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const allSelectedOS = filtrados.length > 0 && filtrados.every((c: any) => selectedOS.has(c.id));
  const toggleSelectAllOS = () => {
    if (allSelectedOS) setSelectedOS(new Set());
    else setSelectedOS(new Set(filtrados.map((c: any) => c.id)));
  };

  const totalAtivos = contratos.filter((c: any) => c.status === "ativo").length;
  const totalValor = contratos.reduce((s: number, c: any) => s + parseFloat(c.valorTotal ?? "0"), 0);
  const totalMedido = contratos.reduce((s: number, c: any) => s + parseFloat(c.valorPago ?? "0"), 0);

  return (
    <>
      {selectedOS.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-medium text-red-700">{selectedOS.size} contrato(s) selecionado(s)</span>
          <Button size="sm" variant="destructive" className="ml-auto gap-1.5" onClick={() => setConfirmExcluirOS(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionados
          </Button>
        </div>
      )}

      {confirmExcluirOS && (
        <div className="flex items-center gap-3 p-3 bg-red-100 border border-red-300 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-800">Excluir <strong>{selectedOS.size}</strong> contrato(s)? Medições, itens e documentos vinculados também serão excluídos. Esta ação não pode ser desfeita.</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setConfirmExcluirOS(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={excluirLoteOS.isPending} onClick={() => excluirLoteOS.mutate({ ids: Array.from(selectedOS), companyId })}>
              {excluirLoteOS.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirmar
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4 bg-purple-50 border-purple-200 text-purple-700">
          <div className="flex items-center gap-2 mb-1"><Wrench className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Total Contratos</span></div>
          <div className="text-xl font-bold">{contratos.length}</div>
        </div>
        <div className="rounded-xl border p-4 bg-green-50 border-green-200 text-green-700">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Ativos</span></div>
          <div className="text-xl font-bold">{totalAtivos}</div>
        </div>
        <div className="rounded-xl border p-4 bg-indigo-50 border-indigo-200 text-indigo-700">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Valor Total</span></div>
          <div className="text-xl font-bold">{BRL_OS(totalValor)}</div>
        </div>
        <div className="rounded-xl border p-4 bg-amber-50 border-amber-200 text-amber-700">
          <div className="flex items-center gap-2 mb-1"><Receipt className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Total Pago</span></div>
          <div className="text-xl font-bold">{BRL_OS(totalMedido)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por descrição ou número..." className="pl-9 bg-white border-gray-300 text-gray-900" value={buscaOS} onChange={e => setBuscaOS(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "ativo", "encerrado", "suspenso", "concluido"].map(s => (
            <button key={s} onClick={() => setFiltroStatusOS(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatusOS === s ? "bg-purple-600 border-purple-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
              {s === "todos" ? "Todos" : OS_STATUS_MAP[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10"><Checkbox checked={allSelectedOS} onCheckedChange={toggleSelectAllOS} aria-label="Selecionar todos" /></TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Nº Contrato</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Descrição</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Empresa</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Valor Total</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Pago</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Vigência</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">Nenhum contrato de serviço encontrado</TableCell></TableRow>
            ) : filtrados.map((c: any) => {
              const pct = parseFloat(c.valorTotal ?? "0") > 0
                ? ((parseFloat(c.valorPago ?? "0") / parseFloat(c.valorTotal ?? "1")) * 100).toFixed(1)
                : "0.0";
              return (
                <TableRow key={c.id} className={`hover:bg-purple-50/30 cursor-pointer border-gray-100 ${selectedOS.has(c.id) ? "bg-purple-50/50" : ""}`} onClick={() => navigate(`/terceiros/contratos/${c.id}`)}>
                  <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selectedOS.has(c.id)} onCheckedChange={() => toggleSelectOS(c.id)} aria-label={`Selecionar ${c.numeroContrato}`} /></TableCell>
                  <TableCell className="font-mono text-xs text-purple-700 font-medium">{c.numeroContrato || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-900 max-w-60 truncate">{c.descricao || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-600">{(c as any).empresaNome || "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-gray-900">{BRL_OS(c.valorTotal)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-600">{BRL_OS(c.valorPago)} ({pct}%)</span>
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{fmtDateOS(c.dataInicio)} → {fmtDateOS(c.dataTermino)}</TableCell>
                  <TableCell>
                    {OS_STATUS_MAP[c.status]
                      ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${OS_STATUS_MAP[c.status].cls}`}>{OS_STATUS_MAP[c.status].label}</span>
                      : <span className="text-xs text-gray-400">{c.status}</span>}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-center">
        <button onClick={() => navigate("/terceiros/contratos")} className="text-sm text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1 mx-auto">
          <Wrench className="h-3.5 w-3.5" /> Gerenciar contratos completos no módulo Terceiros
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}
