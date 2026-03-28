import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Search, Trash2, ClipboardList, ChevronRight, ChevronDown, Loader2,
  CheckCircle2, XCircle, Clock, Building2, ListTree, CalendarDays, ShoppingCart, AlertTriangle, Zap, FileText, Package,
  Camera, ImageIcon, X, Briefcase, History, ShoppingBag,
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: "Rascunho",    cls: "bg-gray-100 text-gray-600 border-gray-200" },
  pendente:  { label: "Pendente",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cotacao:   { label: "Em Cotação",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aprovado:  { label: "Concluído",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  recusado:  { label: "Recusado",    cls: "bg-red-50 text-red-700 border-red-200" },
  cancelado: { label: "Cancelado",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const APROV_CFG: Record<string, { label: string; icon: JSX.Element; cls: string }> = {
  aguardando: { label: "Aguardando", icon: <Clock className="h-3 w-3" />,        cls: "text-amber-600" },
  aprovado:   { label: "Aprovada",   icon: <CheckCircle2 className="h-3 w-3" />, cls: "text-emerald-600" },
  aprovada:   { label: "Aprovada",   icon: <CheckCircle2 className="h-3 w-3" />, cls: "text-emerald-600" },
  recusado:   { label: "Recusada",   icon: <XCircle className="h-3 w-3" />,      cls: "text-red-600" },
  recusada:   { label: "Recusada",   icon: <XCircle className="h-3 w-3" />,      cls: "text-red-600" },
};

const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];
const PRIORIDADE_COR: Record<string, string> = {
  baixa: "text-gray-500", normal: "text-blue-600", alta: "text-amber-600", urgente: "text-red-600"
};
const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface ItemForm {
  descricao: string; unidade: string; quantidade: string; observacoes: string;
  orcamentoItemId?: number; eapCodigo?: string;
  insumoCodigo?: string; composicaoCodigo?: string; precoMeta?: number;
  quantidadeServico?: number; coeficiente?: number; origemEap?: boolean;
}
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", observacoes: "" });

function UltimaCompraCard({ companyId, descricao, insumoCodigo }: { companyId: number; descricao: string; insumoCodigo?: string }) {
  const trimmed = descricao.replace(/^\[[\d.]+\]\s*/, "").trim();
  const hasInput = trimmed.length >= 3 || (insumoCodigo && insumoCodigo.length > 0);
  const histQ = trpc.compras.getHistoricoRecompra.useQuery(
    { companyId, descricao: trimmed || undefined, insumoCodigo: insumoCodigo || undefined },
    { enabled: companyId > 0 && !!hasInput }
  );

  if (!histQ.data || !hasInput) return null;

  const h = histQ.data;
  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
      <ShoppingBag className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-blue-700 flex items-center gap-1">
          <History className="h-3 w-3" /> Última compra
        </div>
        <div className="text-blue-600 mt-0.5">
          <span className="font-medium">{h.fornecedorNome || "Fornecedor não identificado"}</span>
          <span className="mx-1">·</span>
          <span className="font-bold">{h.precoUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          <span className="text-blue-400 mx-1">/{h.unidade || "un"}</span>
        </div>
        <div className="text-blue-400 text-[10px] mt-0.5">
          {h.dataOc ? new Date(h.dataOc).toLocaleDateString("pt-BR") : "—"}
          <span className="mx-1">·</span>
          OC {h.numeroOc}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`}>{c.label}</span>;
}
function AprovBadge({ status }: { status: string | null }) {
  const s = status ?? "aguardando";
  const c = APROV_CFG[s] ?? APROV_CFG.aguardando;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.cls}`}>{c.icon}{c.label}</span>;
}

export default function Solicitacoes() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);

  const [form, setForm] = useState({
    titulo: "", obraId: "", dataNecessidade: "", prioridade: "normal", observacoes: ""
  });
  const [obraSearch, setObraSearch] = useState("");
  const [obraOpen, setObraOpen] = useState(false);
  const obraRef = useRef<HTMLDivElement>(null);
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);
  const [recebQtd, setRecebQtd] = useState<Record<number, string>>({});
  const [selectedEapIds, setSelectedEapIds] = useState<Set<number>>(new Set());
  const [eapSearch, setEapSearch] = useState("");
  const [modoSC, setModoSC] = useState<"eap" | "manual">("eap");
  const [eapExpanded, setEapExpanded] = useState<number | null>(null);
  const [eapQtdServico, setEapQtdServico] = useState<Record<number, string>>({});
  const [eapInsumos, setEapInsumos] = useState<Record<number, any[]>>({});
  const [loadingInsumos, setLoadingInsumos] = useState<number | null>(null);
  const [saldoData, setSaldoData] = useState<Record<number, any>>({});
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [imagemBase64, setImagemBase64] = useState<string | null>(null);
  const [imagemNome, setImagemNome] = useState<string>("");
  const [uploadingImagem, setUploadingImagem] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const q = trpc.compras.listarSolicitacoes.useQuery(
    { companyId, busca: busca || undefined, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getSolicitacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const eapQ = trpc.compras.getEapParaObra.useQuery(
    { obraId: parseInt(form.obraId), companyId },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 }
  );

  const uploadImagem = trpc.compras.uploadImagemReferenciaSC.useMutation();
  const criar = trpc.compras.criarSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovar = trpc.compras.aprovarSolicitacao.useMutation({
    onSuccess: (data) => {
      if (data.cotacaoCriada) {
        toast.success(`SC aprovada! Cotação ${data.cotacaoCriada.numeroCotacao} criada automaticamente.`);
      } else {
        toast.success("Status de aprovação atualizado!");
      }
      q.refetch(); detalheQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const receber = trpc.compras.registrarRecebimentoItem.useMutation({
    onSuccess: () => { toast.success("Recebimento registrado!"); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const cancelar = trpc.compras.atualizarStatusSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC cancelada!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const criarCotacao = trpc.compras.criarCotacao.useMutation({
    onSuccess: (data) => {
      toast.success(`Cotação ${data.numeroCotacao} criada! Redirecionando...`);
      q.refetch();
      setShowDetalhe(null);
      setTimeout(() => navigate("/compras/cotacoes"), 800);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleEnviarParaCotacao(tipo: "material" | "servico") {
    if (!detalhe) return;
    const itens = (detalhe.itens as any[]).map((it: any) => ({
      solicitacaoItemId: it.id,
      descricao: it.descricao,
      unidade: it.unidade || "un",
      quantidade: parseFloat(it.quantidade) || 1,
      precoUnitario: 0,
    }));
    criarCotacao.mutate({
      companyId,
      descricao: detalhe.titulo || detalhe.numeroSc,
      prioridade: detalhe.prioridade || "normal",
      tipo,
      obraId: detalhe.obraId ?? null,
      solicitacaoId: detalhe.id,
      itens,
    });
  }

  const trpcCtx = trpc.useUtils();

  function resetForm() {
    setForm({ titulo: "", obraId: "", dataNecessidade: "", prioridade: "normal", observacoes: "" });
    setObraSearch(""); setObraOpen(false);
    setItens([newItem()]);
    setSelectedEapIds(new Set());
    setEapSearch(""); setModoSC("eap");
    setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({});
    setImagemPreview(null); setImagemBase64(null); setImagemNome("");
  }

  function handleImagemFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 10 MB)."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagemPreview(dataUrl);
      setImagemBase64(dataUrl.split(",")[1]);
      setImagemNome(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function handleEapExpand(it: any) {
    if (eapExpanded === it.id) { setEapExpanded(null); return; }
    setEapExpanded(it.id);

    if (!eapInsumos[it.id] && it.servicoCodigo) {
      setLoadingInsumos(it.id);
      try {
        const insumos = await trpcCtx.compras.getInsumosComposicao.fetch({ companyId, servicoCodigo: it.servicoCodigo });
        setEapInsumos(prev => ({ ...prev, [it.id]: insumos }));
      } catch { setEapInsumos(prev => ({ ...prev, [it.id]: [] })); }
      setLoadingInsumos(null);
    }

    if (!saldoData[it.id]) {
      try {
        const saldo = await trpcCtx.compras.getSaldoOrcamentario.fetch({ companyId, orcamentoItemId: it.id, obraId: parseInt(form.obraId) });
        if (saldo) setSaldoData(prev => ({ ...prev, [it.id]: saldo }));
      } catch {}
    }
  }

  function handleEapQtdChange(orcItemId: number, qtdStr: string, eapItem: any) {
    setEapQtdServico(prev => ({ ...prev, [orcItemId]: qtdStr }));
    const qtdServ = parseFloat(qtdStr) || 0;
    const insumosList = eapInsumos[orcItemId] || [];

    if (qtdServ > 0) {
      let newItems: ItemForm[];
      if (insumosList.length > 0) {
        newItems = insumosList.map(ins => ({
          descricao: ins.descricao,
          unidade: ins.unidade,
          quantidade: String(Math.ceil((qtdServ * ins.coeficiente) * 1000) / 1000),
          observacoes: "",
          orcamentoItemId: orcItemId,
          eapCodigo: eapItem.eapCodigo,
          insumoCodigo: ins.insumoCodigo,
          composicaoCodigo: eapItem.servicoCodigo,
          precoMeta: ins.precoUnitario,
          quantidadeServico: qtdServ,
          coeficiente: ins.coeficiente,
          origemEap: true,
        }));
      } else {
        newItems = [{
          descricao: `[${eapItem.eapCodigo}] ${eapItem.descricao}`,
          unidade: eapItem.unidade || "vb",
          quantidade: String(qtdServ),
          observacoes: "",
          orcamentoItemId: orcItemId,
          eapCodigo: eapItem.eapCodigo,
          origemEap: true,
        }];
      }

      setItens(prev => {
        const semEsteOrc = prev.filter(x => x.orcamentoItemId !== orcItemId);
        const semVazios = semEsteOrc.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
        return [...semVazios, ...newItems];
      });
      setSelectedEapIds(prev => { const n = new Set(prev); n.add(orcItemId); return n; });
    } else {
      setItens(prev => prev.filter(x => x.orcamentoItemId !== orcItemId));
      setSelectedEapIds(prev => { const n = new Set(prev); n.delete(orcItemId); return n; });
    }
  }

  function toggleEapItem(it: any) {
    setSelectedEapIds(prev => {
      const next = new Set(prev);
      if (next.has(it.id)) {
        next.delete(it.id);
        setItens(p => p.filter(x => x.orcamentoItemId !== it.id));
        setEapQtdServico(prev => { const n = { ...prev }; delete n[it.id]; return n; });
      } else {
        next.add(it.id);
        const novoItem: ItemForm = {
          descricao: `[${it.eapCodigo}] ${it.descricao}`,
          unidade: it.unidade || "vb",
          quantidade: String(parseFloat(it.quantidade || "1") || 1),
          observacoes: "",
          orcamentoItemId: it.id,
          eapCodigo: it.eapCodigo,
        };
        setItens(p => {
          const semVazio = p.filter(x => x.descricao.trim() !== "" || x.orcamentoItemId);
          return [...semVazio, novoItem];
        });
      }
      return next;
    });
  }

  async function handleSalvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título da solicitação.");
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta solicitação.");
    const validos = itens.filter(i => i.descricao.trim());
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");

    const consolidados = new Map<string, ItemForm>();
    for (const it of validos) {
      const key = it.insumoCodigo || it.descricao;
      if (consolidados.has(key)) {
        const prev = consolidados.get(key)!;
        prev.quantidade = String(parseFloat(prev.quantidade) + parseFloat(it.quantidade));
      } else {
        consolidados.set(key, { ...it });
      }
    }

    const saldoProblems: string[] = [];
    for (const [orcId, saldo] of Object.entries(saldoData)) {
      const qtdServ = parseFloat(eapQtdServico[parseInt(orcId)] || "0");
      if (qtdServ > 0 && saldo.saldoDisponivel < qtdServ) {
        const excesso = ((qtdServ - saldo.saldoDisponivel) / saldo.qtdOrcada * 100).toFixed(0);
        saldoProblems.push(`${saldo.descricao}: excede saldo em ${excesso}%`);
      }
    }

    if (saldoProblems.length > 0) {
      const msg = `Atenção: ${saldoProblems.join("; ")}. Deseja continuar mesmo assim?`;
      if (!confirm(msg)) return;
    }

    let imgUrl: string | undefined;
    if (imagemBase64 && imagemNome) {
      setUploadingImagem(true);
      try {
        const res = await uploadImagem.mutateAsync({ companyId, fileBase64: imagemBase64, fileName: imagemNome });
        imgUrl = res.url;
      } catch { toast.error("Erro ao enviar imagem de referência."); }
      setUploadingImagem(false);
    }

    criar.mutate({
      companyId,
      solicitanteId: user?.id ? parseInt(String(user.id)) : undefined,
      titulo: form.titulo,
      obraId: parseInt(form.obraId),
      dataNecessidade: form.dataNecessidade || undefined,
      prioridade: form.prioridade,
      observacoes: form.observacoes || undefined,
      imagemReferenciaUrl: imgUrl,
      itens: Array.from(consolidados.values()).map(i => ({
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        observacoes: i.observacoes || undefined,
        orcamentoItemId: i.orcamentoItemId,
        eapCodigo: i.eapCodigo,
        insumoCodigo: i.insumoCodigo,
        composicaoCodigo: i.composicaoCodigo,
        precoMeta: i.precoMeta,
        quantidadeServico: i.quantidadeServico,
        coeficiente: i.coeficiente,
        origemEap: i.origemEap,
      })),
    });
  }

  const lista = q.data ?? [];
  const detalhe = detalheQ.data;
  const obras = obrasQ.data ?? [];
  const obrasFiltradas = obras.filter((o: any) =>
    `${o.codigo ?? ""} ${o.nome}`.toLowerCase().includes(obraSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (obraRef.current && !obraRef.current.contains(e.target as Node)) setObraOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const kpis = useMemo(() => ({
    pendente: lista.filter(r => r.status === "pendente").length,
    cotacao:  lista.filter(r => r.status === "cotacao").length,
    aprovado: lista.filter(r => r.status === "aprovado").length,
    recusado: lista.filter(r => r.status === "recusado" || r.status === "cancelado").length,
  }), [lista]);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  return (
    <DashboardLayout>
    <div className="p-6 space-y-5 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
            <ClipboardList className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Solicitações de Compra</h1>
            <p className="text-sm text-gray-500">Requisições internas de materiais e serviços</p>
          </div>
        </div>
        <DraggableCommandBar barId="solicitacoes-compra" items={[
          { id: "nova-sc", node: <Button onClick={() => setShowNova(true)} className="bg-amber-600 hover:bg-amber-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova SC</Button> },
        ]} />
      </div>

      {/* KPI badges */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Pendente",    count: kpis.pendente,  cls: "bg-amber-50 border-amber-200 text-amber-700",    key: "pendente" },
          { label: "Em Cotação", count: kpis.cotacao,   cls: "bg-blue-50 border-blue-200 text-blue-700",        key: "cotacao" },
          { label: "Concluído",  count: kpis.aprovado,  cls: "bg-emerald-50 border-emerald-200 text-emerald-700", key: "aprovado" },
          { label: "Recusado",   count: kpis.recusado,  cls: "bg-red-50 border-red-200 text-red-700",            key: "recusado" },
        ].map(k => (
          <button key={k.key}
            onClick={() => setFiltroStatus(filtroStatus === k.key ? "todos" : k.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${k.cls} ${filtroStatus === k.key ? "ring-2 ring-offset-1 ring-amber-400" : "opacity-80 hover:opacity-100"}`}>
            <span className="text-xl font-bold">{k.count}</span>
            <span>{k.label}</span>
          </button>
        ))}
      </div>

      {/* Busca + filtro */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número, título, setor..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button onClick={() => setFiltroStatus("todos")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === "todos" ? "bg-amber-600 border-amber-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
          Todos
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Número</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Título / Setor</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Obra</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Necessidade</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Recebido</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Aprovação</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400">Nenhuma solicitação encontrada</TableCell></TableRow>
            ) : lista.map((sc: any) => {
              const itC = sc._itens ?? { total: 0, atendidos: 0 };
              const pct = itC.total > 0 ? Math.round((itC.atendidos / itC.total) * 100) : 0;
              return (
                <TableRow key={sc.id} className="border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setShowDetalhe(sc.id)}>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">{sc.numeroSc}</TableCell>
                  <TableCell>
                    <div className="text-gray-900 text-sm font-medium flex items-center gap-1.5">
                      {sc.titulo || "—"}
                      {sc.imagemReferenciaUrl && <ImageIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" title="Possui imagem de referência" />}
                    </div>
                    {sc.departamento && <div className="text-gray-400 text-xs">{sc.departamento}</div>}
                    {sc.prioridade && sc.prioridade !== "normal" && (
                      <span className={`text-[10px] font-semibold uppercase ${PRIORIDADE_COR[sc.prioridade] ?? "text-gray-400"}`}>{sc.prioridade}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {sc.obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra(sc.obraId) ?? `#${sc.obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">{sc.dataNecessidade ? new Date(sc.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    {itC.total > 0 ? (
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{itC.atendidos}/{itC.total}</span>
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell><AprovBadge status={sc.aprovacaoStatus} /></TableCell>
                  <TableCell><StatusBadge status={sc.status} /></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog Nova SC ─────────────────────────────────────────── */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent
          className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0 gap-0"
          style={{ background: '#ffffff', color: '#111827' }}
        >
          {/* Header fixo */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
            <DialogTitle style={{ color: '#111827' }} className="text-base font-semibold">Nova Solicitação de Compra</DialogTitle>
          </DialogHeader>

          {/* Corpo rolável */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {/* Título */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Título da Solicitação *</label>
              <input
                className="w-full h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                placeholder="Ex: Materiais de alvenaria - Bloco A"
                value={form.titulo}
                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              />
            </div>

            {/* Obra — combobox com busca */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Building2 className="h-3 w-3 text-amber-600" /> Obra / Centro de Custo *
              </label>
              <div className="relative" ref={obraRef}>
                <input
                  className="w-full h-8 px-3 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  placeholder={obrasQ.isLoading ? "Carregando obras..." : "Digite para buscar a obra..."}
                  value={obraOpen
                    ? obraSearch
                    : form.obraId
                      ? (obras.find((o: any) => String(o.id) === form.obraId) as any)
                          ? `${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.codigo ? `[${(obras.find((o: any) => String(o.id) === form.obraId) as any).codigo}] ` : ""}${(obras.find((o: any) => String(o.id) === form.obraId) as any)?.nome}`
                          : ""
                      : ""
                  }
                  onFocus={() => { setObraOpen(true); setObraSearch(""); }}
                  onChange={e => { setObraSearch(e.target.value); setObraOpen(true); }}
                />
                {obraOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {obrasFiltradas.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">Nenhuma obra encontrada</div>
                    ) : obrasFiltradas.map((o: any) => (
                      <div
                        key={o.id}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-amber-50 hover:text-amber-700 ${String(o.id) === form.obraId ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-900"}`}
                        onMouseDown={e => {
                          e.preventDefault();
                          setForm(p => ({ ...p, obraId: String(o.id) }));
                          setSelectedEapIds(new Set());
                          setItens([newItem()]);
                          setObraSearch("");
                          setObraOpen(false);
                          setEapExpanded(null); setEapQtdServico({}); setEapInsumos({}); setSaldoData({});
                        }}
                      >
                        {o.codigo ? <span className="text-gray-400 mr-1">[{o.codigo}]</span> : null}{o.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modo SC: EAP ou Manual */}
            {form.obraId && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setModoSC("eap")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoSC === "eap" ? "bg-white text-amber-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <Zap className="h-3 w-3" /> Via EAP (Inteligente)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoSC("manual")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoSC === "manual" ? "bg-white text-gray-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    <FileText className="h-3 w-3" /> Manual / Avulso
                  </button>
                </div>

                {modoSC === "eap" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <ListTree className="h-3.5 w-3.5 text-amber-600" />
                        Serviços da EAP — clique para explodir insumos
                      </label>
                      {selectedEapIds.size > 0 && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {selectedEapIds.size} serviço{selectedEapIds.size > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {eapQ.data?.semOrcamento ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Esta obra não possui orçamento vinculado. Use o modo Manual.
                      </div>
                    ) : eapQ.data && eapQ.data.items.length > 0 ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <input
                            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
                            placeholder="Filtrar serviços da EAP..."
                            value={eapSearch}
                            onChange={e => setEapSearch(e.target.value)}
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                          {eapQ.data.items
                            .filter(it => it.nivel >= 2 && it.tipo !== "grupo")
                            .filter(it => !eapSearch || `${it.eapCodigo} ${it.descricao}`.toLowerCase().includes(eapSearch.toLowerCase()))
                            .map(it => {
                              const expanded = eapExpanded === it.id;
                              const insLista = eapInsumos[it.id];
                              const saldo = saldoData[it.id];
                              const qtdStr = eapQtdServico[it.id] || "";
                              const qtdVal = parseFloat(qtdStr) || 0;
                              const estouro = saldo && qtdVal > 0 && qtdVal > saldo.saldoDisponivel;

                              return (
                                <div key={it.id} className="group">
                                  <div
                                    onClick={() => handleEapExpand(it)}
                                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${expanded ? "bg-amber-50 border-l-2 border-l-amber-500" : "hover:bg-gray-50"}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedEapIds.has(it.id) || qtdVal > 0}
                                      readOnly
                                      className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer accent-amber-600 pointer-events-none"
                                    />
                                    {expanded ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-gray-900 truncate">
                                        <span className="font-semibold text-amber-700 mr-1.5">{it.eapCodigo}</span>
                                        {it.descricao}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                                      <span>{parseFloat(String(it.quantidade ?? "0")).toLocaleString("pt-BR")} {it.unidade || "vb"}</span>
                                      {qtdVal > 0 && <span className="text-amber-600 font-medium">✓</span>}
                                    </div>
                                  </div>

                                  {expanded && (
                                    <div className="px-4 py-3 bg-gray-50 border-l-2 border-l-amber-500 space-y-3">
                                      {saldo && (
                                        <div className="grid grid-cols-4 gap-2 text-[10px]">
                                          <div className="bg-white rounded px-2 py-1.5 border border-gray-200 text-center">
                                            <div className="text-gray-400 uppercase font-medium">Orçado</div>
                                            <div className="text-gray-900 font-bold text-xs">{parseFloat(String(saldo.qtdOrcada)).toLocaleString("pt-BR")}</div>
                                          </div>
                                          <div className="bg-white rounded px-2 py-1.5 border border-gray-200 text-center">
                                            <div className="text-gray-400 uppercase font-medium">Solicitado</div>
                                            <div className="text-blue-600 font-bold text-xs">{parseFloat(String(saldo.qtdJaSolicitada)).toLocaleString("pt-BR")}</div>
                                          </div>
                                          <div className={`rounded px-2 py-1.5 border text-center ${estouro ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
                                            <div className={`uppercase font-medium ${estouro ? "text-red-500" : "text-gray-400"}`}>Saldo</div>
                                            <div className={`font-bold text-xs ${estouro ? "text-red-600" : "text-emerald-600"}`}>{parseFloat(String(saldo.saldoDisponivel)).toLocaleString("pt-BR")}</div>
                                          </div>
                                          <div className="bg-amber-50 rounded px-2 py-1.5 border border-amber-200 text-center">
                                            <div className="text-amber-500 uppercase font-medium">Solicitando</div>
                                            <div className="text-amber-700 font-bold text-xs">{qtdVal.toLocaleString("pt-BR")}</div>
                                          </div>
                                        </div>
                                      )}

                                      {estouro && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                                          <AlertTriangle className="h-3 w-3 shrink-0" />
                                          <span>Estouro de saldo! Quantidade excede o orçado em {((qtdVal - saldo.saldoDisponivel) / parseFloat(String(saldo.qtdOrcada)) * 100).toFixed(0)}%</span>
                                        </div>
                                      )}

                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">Qtd. serviço a executar:</label>
                                        <input
                                          type="number" min="0" step="0.01"
                                          className={`w-28 h-7 px-2 text-xs rounded border bg-white text-gray-900 outline-none focus:ring-1 ${estouro ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-300 focus:border-amber-400 focus:ring-amber-200"}`}
                                          placeholder="0"
                                          value={qtdStr}
                                          onChange={e => handleEapQtdChange(it.id, e.target.value, it)}
                                        />
                                        <span className="text-xs text-gray-400">{it.unidade || "vb"}</span>
                                        {saldo && saldo.saldoDisponivel > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => handleEapQtdChange(it.id, String(saldo.saldoDisponivel), it)}
                                            className="text-[10px] text-amber-600 hover:text-amber-700 underline font-medium"
                                          >
                                            Compra total
                                          </button>
                                        )}
                                      </div>

                                      {loadingInsumos === it.id ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando insumos da composição...
                                        </div>
                                      ) : insLista && insLista.length > 0 ? (
                                        <div className="space-y-1">
                                          <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide flex items-center gap-1">
                                            <Package className="h-3 w-3" /> Insumos da composição ({insLista.length})
                                          </div>
                                          <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                                            {insLista.map((ins: any, idx: number) => {
                                              const qtdCalc = qtdVal > 0 ? Math.ceil((qtdVal * ins.coeficiente) * 1000) / 1000 : 0;
                                              return (
                                                <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-gray-900 truncate">{ins.descricao}</div>
                                                    <div className="text-[10px] text-gray-400">Coef: {ins.coeficiente} | Meta: R$ {parseFloat(ins.precoUnitario || "0").toFixed(2)}</div>
                                                  </div>
                                                  <div className="text-right shrink-0">
                                                    <div className="font-semibold text-gray-700">{qtdCalc.toLocaleString("pt-BR")} {ins.unidade}</div>
                                                    {qtdCalc > 0 && <div className="text-[10px] text-gray-400">R$ {(qtdCalc * parseFloat(ins.precoUnitario || "0")).toFixed(2)}</div>}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : insLista && insLista.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-1">Nenhum insumo cadastrado para esta composição. Use o modo Manual.</div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          }
                          {eapQ.data.items.filter(it => it.nivel >= 2 && it.tipo !== "grupo").length === 0 && (
                            <div className="px-3 py-4 text-xs text-center text-gray-400">Nenhum serviço encontrado na EAP</div>
                          )}
                        </div>
                      </div>
                    ) : eapQ.isLoading ? (
                      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando EAP...
                      </div>
                    ) : eapQ.isError ? (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        Erro ao carregar EAP — use o modo Manual.
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        Nenhum serviço encontrado para esta obra.
                      </div>
                    )}
                  </div>
                )}

                {modoSC === "manual" && (
                  <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                    Modo manual — adicione os itens livremente na seção abaixo.
                  </div>
                )}
              </div>
            )}

            {/* Data | Prioridade */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Data de Necessidade</label>
                <input
                  type="date"
                  className="w-full h-8 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                  value={form.dataNecessidade}
                  onChange={e => setForm(p => ({ ...p, dataNecessidade: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Prioridade</label>
                <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger className="h-8 text-sm border-gray-300 bg-white text-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Observações</label>
              <textarea
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 resize-none"
                rows={2}
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              />
            </div>

            {/* Imagem de Referência */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Imagem de Referência (opcional)</label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImagemFile(f); e.target.value = ""; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImagemFile(f); e.target.value = ""; }} />
              {imagemPreview ? (
                <div className="relative inline-block">
                  <img src={imagemPreview} alt="Referência" className="h-24 w-auto rounded-lg border border-gray-200 object-cover" />
                  <button type="button" onClick={() => { setImagemPreview(null); setImagemBase64(null); setImagemNome(""); }} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                  <div className="text-[10px] text-gray-500 mt-1 truncate max-w-[200px]">{imagemNome}</div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <ImageIcon className="h-3.5 w-3.5" /> Anexar Foto
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    <Camera className="h-3.5 w-3.5" /> Câmera
                  </button>
                </div>
              )}
            </div>

            {/* Itens Solicitados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">
                  Itens Solicitados * {itens.filter(i => i.descricao.trim()).length > 0 && (
                    <span className="text-gray-400 font-normal ml-1">({itens.filter(i => i.descricao.trim()).length} ite{itens.filter(i => i.descricao.trim()).length === 1 ? "m" : "ns"})</span>
                  )}
                </label>
                {modoSC === "manual" && (
                  <button
                    type="button"
                    onClick={() => setItens(p => [...p, newItem()])}
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 transition"
                  >
                    <Plus className="h-3 w-3" /> Item
                  </button>
                )}
              </div>

              {modoSC === "eap" && itens.filter(i => i.origemEap).length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {(() => {
                    const consolidados = new Map<string, { descricao: string; unidade: string; qtdTotal: number; precoMeta: number; origens: string[]; insumoCodigo?: string }>();
                    for (const it of itens.filter(i => i.origemEap)) {
                      const key = it.insumoCodigo || it.descricao;
                      if (consolidados.has(key)) {
                        const prev = consolidados.get(key)!;
                        prev.qtdTotal += parseFloat(it.quantidade) || 0;
                        if (it.eapCodigo && !prev.origens.includes(it.eapCodigo)) prev.origens.push(it.eapCodigo);
                      } else {
                        consolidados.set(key, {
                          descricao: it.descricao,
                          unidade: it.unidade,
                          qtdTotal: parseFloat(it.quantidade) || 0,
                          precoMeta: it.precoMeta || 0,
                          origens: it.eapCodigo ? [it.eapCodigo] : [],
                          insumoCodigo: it.insumoCodigo,
                        });
                      }
                    }
                    return Array.from(consolidados.entries()).map(([key, c]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 border border-amber-200/50 text-xs">
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 truncate">{c.descricao}</div>
                            {c.origens.length > 1 && (
                              <div className="text-[10px] text-amber-600">Consolidado de {c.origens.length} serviços: {c.origens.join(", ")}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-gray-700">{c.qtdTotal.toLocaleString("pt-BR")} {c.unidade}</div>
                            {c.precoMeta > 0 && <div className="text-[10px] text-gray-400">Meta: R$ {(c.qtdTotal * c.precoMeta).toFixed(2)}</div>}
                          </div>
                        </div>
                        <UltimaCompraCard companyId={companyId} descricao={c.descricao} insumoCodigo={c.insumoCodigo} />
                      </div>
                    ));
                  })()}
                </div>
              ) : modoSC === "eap" && itens.filter(i => i.origemEap).length === 0 ? (
                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center">
                  Selecione um serviço acima e informe a quantidade para gerar os itens automaticamente.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {itens.map((it, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex gap-2 items-center p-2 rounded-lg bg-gray-50 border border-gray-200">
                        <input
                          className="flex-1 h-7 px-2 text-xs rounded border border-gray-300 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400"
                          placeholder="Descrição do item *"
                          value={it.descricao}
                          onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))}
                        />
                        <Select value={it.unidade} onValueChange={v => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: v } : x))}>
                          <SelectTrigger className="w-16 h-7 text-xs border-gray-300 bg-white text-gray-900"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white border-gray-200">
                            {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <input
                          className="w-20 h-7 px-2 text-xs rounded border border-gray-300 bg-white text-gray-900 outline-none focus:border-amber-400"
                          type="number" min="0.001" step="0.001" placeholder="Qtd"
                          value={it.quantidade}
                          onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))}
                        />
                        {itens.length > 1 && (
                          <button onClick={() => setItens(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {it.descricao.trim().length >= 3 && (
                        <UltimaCompraCard companyId={companyId} descricao={it.descricao} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>{/* fim space-y-3 */}
          </div>{/* fim corpo rolável */}

          {/* Rodapé fixo com botões */}
          <div className="px-5 py-3 border-t border-gray-100 bg-white shrink-0 flex gap-2">
              <button
                onClick={() => { setShowNova(false); resetForm(); }}
                className="flex-1 h-9 text-sm border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={criar.isPending || uploadingImagem}
                className="flex-1 h-9 text-sm rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {(criar.isPending || uploadingImagem) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Solicitação"}
              </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Detalhe SC ─────────────────────────────────────── */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => { if (!v) { setShowDetalhe(null); setRecebQtd({}); } }}>
        <DialogContent className="border-gray-200 w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Solicitação de Compra</div>
                    <DialogTitle className="text-gray-900 text-lg">{detalhe.numeroSc}</DialogTitle>
                    {detalhe.titulo && <p className="text-gray-600 text-sm mt-0.5">{detalhe.titulo}</p>}
                  </div>
                  <StatusBadge status={detalhe.status} />
                </div>
              </DialogHeader>

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-gray-50 rounded-lg p-3 border border-gray-200">
                {[
                  { label: "Obra", value: nomeObra(detalhe.obraId) ?? "—" },
                  { label: "Setor", value: detalhe.departamento || "—" },
                  { label: "Necessidade", value: detalhe.dataNecessidade ? new Date(detalhe.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Prioridade", value: detalhe.prioridade ? (detalhe.prioridade.charAt(0).toUpperCase() + detalhe.prioridade.slice(1)) : "Normal" },
                  { label: "Criado em", value: new Date(detalhe.criadoEm).toLocaleDateString("pt-BR") },
                ].map(f => (
                  <div key={f.label}>
                    <span className="text-gray-400">{f.label}</span>
                    <p className="text-gray-900 mt-0.5 font-medium">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Imagem de Referência */}
              {detalhe.imagemReferenciaUrl && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Imagem de Referência</span>
                  <a href={detalhe.imagemReferenciaUrl} target="_blank" rel="noopener noreferrer">
                    <img src={detalhe.imagemReferenciaUrl} alt="Referência" className="h-32 w-auto rounded-lg border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition" />
                  </a>
                </div>
              )}

              {/* Aprovação */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Aprovação</span>
                  <AprovBadge status={detalhe.aprovacaoStatus} />
                </div>
                {detalhe.status === "cotacao" || detalhe.status === "aprovado" ? (
                  <p className="text-xs text-gray-500">Esta solicitação já está em andamento no fluxo de compras.</p>
                ) : (
                <div className="flex gap-2">
                  {[
                    ...(detalhe.aprovacaoStatus !== "aguardando" ? [{ key: "aguardando", label: "Voltar p/ Aguardando", cls: "border-amber-300 text-amber-700 hover:bg-amber-50" }] : []),
                    ...(detalhe.aprovacaoStatus !== "aprovada" ? [{ key: "aprovada", label: "Aprovar", cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" }] : []),
                    ...(detalhe.aprovacaoStatus !== "recusada" ? [{ key: "recusada", label: "Recusar", cls: "border-red-300 text-red-700 hover:bg-red-50" }] : []),
                  ].map(a => (
                    <Button key={a.key} size="sm" variant="outline"
                      onClick={() => aprovar.mutate({ id: detalhe.id, aprovacaoStatus: a.key, aprovadorId: user?.id ? parseInt(String(user.id)) : undefined })}
                      disabled={aprovar.isPending}
                      className={`text-xs ${a.cls}`}>
                      {a.label}
                    </Button>
                  ))}
                </div>
                )}
              </div>

              {/* Itens */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Itens</div>
                {(detalhe.itens as any[]).map((it: any) => {
                  const qtdTotal = parseFloat(it.quantidade);
                  const qtdAtend = parseFloat(it.quantidadeAtendida ?? "0");
                  const pct = qtdTotal > 0 ? Math.round((qtdAtend / qtdTotal) * 100) : 0;
                  return (
                    <div key={it.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-gray-900 text-sm font-medium">{it.descricao}</p>
                          <p className="text-gray-400 text-xs">{it.unidade || "un"} · Qtd: {qtdTotal.toLocaleString("pt-BR")}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded border ${it.statusItem === "recebido" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : it.statusItem === "recebido_parcial" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {it.statusItem === "recebido" ? "Recebido" : it.statusItem === "recebido_parcial" ? `Parcial (${pct}%)` : "Pendente"}
                        </span>
                      </div>
                      {qtdTotal > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{qtdAtend}/{qtdTotal}</span>
                        </div>
                      )}
                      {!["aprovado"].includes(detalhe.status) && (
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number" min="0" max={qtdTotal} step="0.01"
                            className="w-28 h-7 text-sm bg-white border-gray-300 text-gray-900"
                            placeholder={`Máx ${qtdTotal}`}
                            value={recebQtd[it.id] ?? ""}
                            onChange={e => setRecebQtd(p => ({ ...p, [it.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline"
                            onClick={() => receber.mutate({ itemId: it.id, solicitacaoId: detalhe.id, quantidadeAtendida: parseFloat(recebQtd[it.id] ?? "0") || 0 })}
                            disabled={receber.isPending || !recebQtd[it.id]}
                            className="h-7 text-xs border-gray-300 text-gray-600 hover:bg-gray-50">
                            Registrar Recebimento
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Ações */}
              {detalhe.status === "cotacao" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">
                    Esta solicitação já possui cotação em andamento. Não é possível enviar novamente.
                  </span>
                </div>
              )}
              {!["cotacao", "cancelado"].includes(detalhe.status) && detalhe.aprovacaoStatus !== "aprovada" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs text-blue-700 font-medium">
                    Aguardando aprovação. Só é possível enviar para cotação após a aprovação da solicitação.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {!["cotacao", "aprovado", "cancelado"].includes(detalhe.status) && detalhe.aprovacaoStatus === "aprovada" && (
                  <>
                    <Button size="sm"
                      onClick={() => handleEnviarParaCotacao("material")}
                      disabled={criarCotacao.isPending || (detalhe.itens as any[]).length === 0}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1.5">
                      {criarCotacao.isPending
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Criando cotação...</>
                        : <><ShoppingCart className="h-3 w-3" /> Cotação de Material</>}
                    </Button>
                    <Button size="sm"
                      onClick={() => handleEnviarParaCotacao("servico")}
                      disabled={criarCotacao.isPending || (detalhe.itens as any[]).length === 0}
                      className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5">
                      {criarCotacao.isPending
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Criando cotação...</>
                        : <><Briefcase className="h-3 w-3" /> Cotação de Mão de Obra</>}
                    </Button>
                  </>
                )}
                {!["cancelado", "aprovado"].includes(detalhe.status) && (
                  <Button size="sm" variant="outline"
                    onClick={() => cancelar.mutate({ id: detalhe.id, status: "cancelado" })}
                    disabled={cancelar.isPending}
                    className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs">
                    Cancelar SC
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => excluir.mutate({ id: detalhe.id })}
                  disabled={excluir.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50 text-xs ml-auto gap-1">
                  <Trash2 className="h-3 w-3" /> Excluir
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
