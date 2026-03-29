import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState } from "react";
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
import { Plus, Search, Trash2, ShoppingBag, ChevronRight, Loader2, CheckCircle, Truck, PackageCheck, Building2, AlertTriangle, Clock, CircleDot, Phone, Mail, User, Smartphone, FileDown, Printer } from "lucide-react";
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

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroAtrasadas, setFiltroAtrasadas] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);

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
  const aprovarExtra = trpc.compras.aprovarOcExtra.useMutation({
    onSuccess: (res) => { toast.success(`OC aprovada pelo administrador ${res.adminNome}!`); q.refetch(); detalheQ.refetch(); setShowAprovacaoExtra(null); setAprovExtraForm({ adminEmail: "", adminSenha: "", justificativa: "" }); },
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
            <h1 className="text-xl font-bold text-gray-900">Ordens de Compra</h1>
            <p className="text-sm text-gray-500">Acompanhe pedidos emitidos aos fornecedores</p>
          </div>
        </div>
        <DraggableCommandBar barId="ordens-compra" items={[
          { id: "nova", node: <Button onClick={() => setShowNova(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova OC Manual</Button> },
        ]} />
      </div>

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
                    {oc.numeroOc}
                    {oc.status === "entregue" && <span className="block text-[10px] font-sans font-normal text-emerald-500">OC concluída</span>}
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
            <DialogTitle className="text-gray-900">{detalhe?.numeroOc} — Ordem de Compra</DialogTitle>
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
                  <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Pendente de Cobertura Orçamentária</p>
                      <p className="text-xs text-red-600">Esta OC contém itens sem verba disponível no orçamento. É necessário realizar uma realocação de verba para cobrir o custo.</p>
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
                        <TableRow key={it.id} className="border-gray-100">
                          <TableCell className="text-gray-900 text-sm">{it.descricao}</TableCell>
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
    </div>
    </DashboardLayout>
  );
}
