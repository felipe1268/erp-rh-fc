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
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Package, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, Loader2, History, X, BarChart2, Boxes, Sparkles, DollarSign,
  Truck, ChevronDown, ChevronRight, RefreshCcw, PackageX,
} from "lucide-react";

const UNIDADES = ["un", "m", "m²", "m³", "kg", "t", "L", "sc", "cx", "pc", "vb", "gl", "barra", "rolo", "pç"];

const EMPTY_ITEM = {
  nome: "", unidade: "un", categoria: "", codigoInterno: "",
  quantidadeAtual: 0, quantidadeMinima: 0, observacoes: "",
  valorUnitario: "" as string | number,
  corrigirEstoque: "" as string | number,
  origem: "proprio" as "proprio" | "alugado",
  fornecedorLocacao: "", dataInicioLocacao: "", dataVencimentoLocacao: "",
  valorLocacaoMensal: 0, diasAlertaLocacao: 7, observacoesLocacao: "",
};

const EMPTY_MOV = {
  tipo: "entrada" as "entrada" | "saida" | "ajuste",
  quantidade: 0, obraNome: "", motivo: "", observacoes: "",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function brl(v: any) {
  const num = n(v);
  if (!num) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SemaforoEstoque({ atual, minimo }: { atual: number; minimo: number }) {
  if (minimo === 0) return <span className="text-slate-400 text-xs">—</span>;
  const pct = minimo > 0 ? atual / minimo : 1;
  if (pct >= 1) return <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />OK</span>;
  if (pct >= 0.5) return <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-medium"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Baixo</span>;
  return <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Crítico</span>;
}

export default function Almoxarifado() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAbaixo, setApenasAbaixo] = useState(false);
  // Rev. 1608 — Itens zerados (saldo = 0) somem da lista principal por padrão.
  // Toggle "Apenas zerados" mostra somente eles. Card de KPI dedicado leva ao filtro.
  const [apenasZerados, setApenasZerados] = useState(false);
  // Rev. 1606 — Ordenação: nome (A→Z padrão), valor total estoque (maior/menor),
  // quantidade em estoque (maior/menor) e valor unitário (maior/menor).
  type SortKey = "nome_asc" | "nome_desc" | "valor_desc" | "valor_asc" | "qtd_desc" | "qtd_asc" | "unit_desc" | "unit_asc";
  const [sortBy, setSortBy] = useState<SortKey>("nome_asc");

  const { data: itens = [], refetch: refetchItens, isLoading } = trpc.compras.listarItens.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  // Rev. 1607 — itens classificados pela IA como "aplicação direta na obra"
  // (ex.: concreto usinado, argamassa pronta). Não aparecem na lista normal acima.
  const { data: itensAplicDireta = [], refetch: refetchAplicDireta } =
    trpc.compras.listarItens.useQuery(
      { companyId, apenasAplicacaoDireta: true },
      { enabled: !!companyId }
    );
  const [showAplicDireta, setShowAplicDireta] = useState(false);
  const reclassificarMut = trpc.compras.reclassificarTipoControleIA.useMutation({
    onSuccess: (data) => {
      toast.success(`IA reclassificou: ${data.tipoControle === "aplicacao_direta" ? "Aplicação Direta" : "Estoque"} — ${data.justificativa}`);
      refetchItens(); refetchAplicDireta();
    },
    onError: (e) => toast.error("Erro na IA: " + e.message),
  });
  const { data: categorias = [] } = trpc.compras.listarCategoriasAlmoxarifado.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const lista = useMemo(() => {
    let r = itens;
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(i => i.nome.toLowerCase().includes(b) || i.codigoInterno?.toLowerCase().includes(b) || i.categoria?.toLowerCase().includes(b));
    }
    if (filtroCateg !== "todas") r = r.filter(i => i.categoria === filtroCateg);
    // Rev. 1608 — Por padrão, itens com saldo zero somem da lista principal.
    // Toggle "Apenas zerados" inverte: mostra SOMENTE quem está em 0.
    if (apenasZerados) {
      r = r.filter(i => n(i.quantidadeAtual) <= 0);
    } else {
      r = r.filter(i => n(i.quantidadeAtual) > 0);
    }
    if (apenasAbaixo) r = r.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima));
    // Rev. 1606 — Ordenação configurável (valor/quantidade/nome).
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    const valorTotal = (i: any) => n((i as any).valorUnitario) * n(i.quantidadeAtual);
    const valorUnit = (i: any) => n((i as any).valorUnitario);
    const qtd = (i: any) => n(i.quantidadeAtual);
    const sorted = [...r];
    switch (sortBy) {
      case "nome_asc":   sorted.sort((a, b) => cmpStr(a.nome, b.nome)); break;
      case "nome_desc":  sorted.sort((a, b) => cmpStr(b.nome, a.nome)); break;
      case "valor_desc": sorted.sort((a, b) => valorTotal(b) - valorTotal(a) || cmpStr(a.nome, b.nome)); break;
      case "valor_asc":  sorted.sort((a, b) => valorTotal(a) - valorTotal(b) || cmpStr(a.nome, b.nome)); break;
      case "qtd_desc":   sorted.sort((a, b) => qtd(b) - qtd(a) || cmpStr(a.nome, b.nome)); break;
      case "qtd_asc":    sorted.sort((a, b) => qtd(a) - qtd(b) || cmpStr(a.nome, b.nome)); break;
      case "unit_desc":  sorted.sort((a, b) => valorUnit(b) - valorUnit(a) || cmpStr(a.nome, b.nome)); break;
      case "unit_asc":   sorted.sort((a, b) => valorUnit(a) - valorUnit(b) || cmpStr(a.nome, b.nome)); break;
    }
    return sorted;
  }, [itens, busca, filtroCateg, apenasAbaixo, apenasZerados, sortBy]);

  const totalCriticos = useMemo(() =>
    itens.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima)).length,
    [itens]
  );

  // Rev. 1608 — Itens com saldo zero (escondidos da lista principal por padrão).
  const totalZerados = useMemo(() =>
    itens.filter(i => n(i.quantidadeAtual) <= 0).length,
    [itens]
  );

  // Rev. 1608 — Item mais caro em estoque (alerta de capital "parado").
  const itemMaisCaro = useMemo(() => {
    let topo: any = null;
    let topoVal = 0;
    for (const i of itens) {
      const v = n((i as any).valorUnitario) * n(i.quantidadeAtual);
      if (v > topoVal) { topoVal = v; topo = i; }
    }
    return topo ? { nome: topo.nome, valor: topoVal } : null;
  }, [itens]);

  const valorTotalEstoque = useMemo(() =>
    itens.reduce((acc, i) => acc + n((i as any).valorUnitario) * n(i.quantidadeAtual), 0),
    [itens]
  );

  // Modal item
  const [modalItem, setModalItem] = useState(false);
  const [editandoItem, setEditandoItem] = useState<number | null>(null);
  const [formItem, setFormItem] = useState({ ...EMPTY_ITEM });
  const [iaLoading, setIaLoading] = useState(false);

  // Modal movimentação
  const [modalMov, setModalMov]   = useState(false);
  const [movItemId, setMovItemId] = useState<number | null>(null);
  const [movItemNome, setMovItemNome] = useState("");
  const [movItemUnidade, setMovItemUnidade] = useState("un");
  const [formMov, setFormMov]     = useState({ ...EMPTY_MOV });

  // Modal histórico
  const [modalHist, setModalHist] = useState(false);
  const [histItemId, setHistItemId] = useState<number | null>(null);
  const [histItemNome, setHistItemNome] = useState("");
  const { data: movimentos = [], isLoading: loadHist } = trpc.compras.listarMovimentos.useQuery(
    { companyId, itemId: histItemId ?? 0 },
    { enabled: !!histItemId && modalHist }
  );

  const criarMut    = trpc.compras.criarItem.useMutation({
    onSuccess: (item: any) => {
      refetchItens(); refetchAplicDireta(); setModalItem(false);
      if (item?.tipoControle === "aplicacao_direta") {
        toast.success(`Item criado como APLICAÇÃO DIRETA (IA): ${item.tipoControleJustificativa || "consumido na obra, não entra no estoque"}`, { duration: 6000 });
      } else {
        toast.success("Item criado!");
      }
    }
  });
  const atualizarMut = trpc.compras.atualizarItem.useMutation({ onSuccess: () => { refetchItens(); refetchAplicDireta(); setModalItem(false); toast.success("Item atualizado!"); } });
  const excluirMut  = trpc.compras.excluirItem.useMutation({ onSuccess: () => { refetchItens(); refetchAplicDireta(); toast.success("Item removido."); } });
  const movMut      = trpc.compras.registrarMovimento.useMutation({
    onSuccess: () => { refetchItens(); setModalMov(false); toast.success("Movimentação registrada!"); },
    onError: (e) => toast.error(e.message),
  });
  const sugerirPrecoMut = trpc.compras.sugerirPrecoIA.useMutation({
    onSuccess: (data) => {
      setFormItem(p => ({ ...p, valorUnitario: data.precoSugerido?.toFixed(2) ?? p.valorUnitario }));
      toast.success(`IA sugere R$ ${data.precoSugerido?.toFixed(2)} — ${data.justificativa}`);
    },
    onError: (e) => toast.error("Erro na IA: " + e.message),
  });

  function abrirNovoItem() {
    setFormItem({ ...EMPTY_ITEM });
    setEditandoItem(null);
    setModalItem(true);
  }
  function abrirEditarItem(i: any) {
    setFormItem({
      nome: i.nome, unidade: i.unidade, categoria: i.categoria ?? "", codigoInterno: i.codigoInterno ?? "",
      quantidadeAtual: n(i.quantidadeAtual), quantidadeMinima: n(i.quantidadeMinima), observacoes: i.observacoes ?? "",
      valorUnitario: i.valorUnitario ? parseFloat(i.valorUnitario).toFixed(2) : "",
      corrigirEstoque: "",
      origem: (i.origem === "alugado" ? "alugado" : "proprio") as "proprio" | "alugado",
      fornecedorLocacao: i.fornecedorLocacao ?? "", dataInicioLocacao: i.dataInicioLocacao ?? "",
      dataVencimentoLocacao: i.dataVencimentoLocacao ?? "",
      valorLocacaoMensal: parseFloat(i.valorLocacaoMensal ?? "0") || 0,
      diasAlertaLocacao: (i.diasAlertaLocacao ?? 7) as number,
      observacoesLocacao: i.observacoesLocacao ?? "",
    });
    setEditandoItem(i.id);
    setModalItem(true);
  }
  function salvarItem() {
    if (!formItem.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    const locacaoPayload = formItem.origem === "alugado" ? {
      origem: "alugado" as const,
      fornecedorLocacao: formItem.fornecedorLocacao || undefined,
      dataInicioLocacao: formItem.dataInicioLocacao || undefined,
      dataVencimentoLocacao: formItem.dataVencimentoLocacao || undefined,
      valorLocacaoMensal: formItem.valorLocacaoMensal || undefined,
      diasAlertaLocacao: formItem.diasAlertaLocacao || 7,
      observacoesLocacao: formItem.observacoesLocacao || undefined,
    } : { origem: "proprio" as const, fornecedorLocacao: null, dataInicioLocacao: null, dataVencimentoLocacao: null, valorLocacaoMensal: null, diasAlertaLocacao: null, observacoesLocacao: null };

    const valorUnitarioNum = formItem.valorUnitario !== "" ? parseFloat(String(formItem.valorUnitario)) || 0 : undefined;

    if (editandoItem) {
      const corrigirQtd = formItem.corrigirEstoque !== "" ? parseFloat(String(formItem.corrigirEstoque)) : null;
      atualizarMut.mutate({
        id: editandoItem,
        nome: formItem.nome,
        unidade: formItem.unidade,
        categoria: formItem.categoria || undefined,
        codigoInterno: formItem.codigoInterno || undefined,
        quantidadeMinima: formItem.quantidadeMinima,
        observacoes: formItem.observacoes || undefined,
        valorUnitario: valorUnitarioNum,
        ...(corrigirQtd !== null ? { quantidadeAtual: corrigirQtd } : {}),
        ...locacaoPayload,
      } as any);
    } else {
      criarMut.mutate({
        companyId,
        nome: formItem.nome,
        unidade: formItem.unidade,
        categoria: formItem.categoria || undefined,
        codigoInterno: formItem.codigoInterno || undefined,
        quantidadeAtual: formItem.quantidadeAtual,
        quantidadeMinima: formItem.quantidadeMinima,
        observacoes: formItem.observacoes || undefined,
        valorUnitario: valorUnitarioNum,
        ...locacaoPayload,
      } as any);
    }
  }

  async function sugerirPrecoIA() {
    if (!formItem.nome.trim()) { toast.error("Informe o nome do item primeiro."); return; }
    setIaLoading(true);
    sugerirPrecoMut.mutate(
      { nome: formItem.nome, unidade: formItem.unidade, categoria: formItem.categoria },
      { onSettled: () => setIaLoading(false) }
    );
  }

  function abrirMovimento(i: any, tipo: "entrada" | "saida") {
    setMovItemId(i.id);
    setMovItemNome(i.nome);
    setMovItemUnidade(i.unidade);
    setFormMov({ tipo, quantidade: 0, obraNome: "", motivo: "", observacoes: "" });
    setModalMov(true);
  }
  function salvarMovimento() {
    if (!movItemId) return;
    if (formMov.quantidade <= 0) { toast.error("Quantidade deve ser maior que zero."); return; }
    movMut.mutate({ companyId, itemId: movItemId, tipo: formMov.tipo, quantidade: formMov.quantidade, obraNome: formMov.obraNome || undefined, motivo: formMov.motivo || undefined, observacoes: formMov.observacoes || undefined });
  }

  function abrirHistorico(i: any) {
    setHistItemId(i.id);
    setHistItemNome(i.nome);
    setModalHist(true);
  }

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-600" />
              Almoxarifado Central
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{itens.length} ite{itens.length !== 1 ? "ns" : "m"} no estoque</p>
          </div>
          <DraggableCommandBar barId="almoxarifado" items={[
            ...(totalCriticos > 0 ? [{ id: "criticos", node: <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"><AlertTriangle className="h-4 w-4 text-red-500" /><span className="text-xs font-semibold text-red-700">{totalCriticos} item{totalCriticos !== 1 ? "s" : ""} abaixo do mínimo</span></div> }] : []),
            { id: "novo-item", node: <Button onClick={abrirNovoItem} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" /> Novo Item</Button> },
          ]} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
        {/* KPIs — Rev. 1608: cards clicáveis aplicam filtro correspondente */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {(() => {
            const cards: Array<{ label: string; v: string; sub?: string; color: string; bg: string; border: string; onClick?: () => void; active?: boolean; icon: any }> = [
              {
                label: "Total de Itens",
                v: itens.length.toString(),
                color: "text-blue-600", bg: "bg-blue-50/40", border: "border-blue-100",
                icon: Package,
                onClick: () => { setApenasAbaixo(false); setApenasZerados(false); },
                active: !apenasAbaixo && !apenasZerados,
              },
              {
                label: "Itens OK",
                v: itens.filter(i => n(i.quantidadeAtual) > 0 && (n(i.quantidadeMinima) === 0 || n(i.quantidadeAtual) >= n(i.quantidadeMinima))).length.toString(),
                color: "text-emerald-600", bg: "bg-emerald-50/40", border: "border-emerald-100",
                icon: BarChart2,
              },
              {
                label: "Estoque Baixo",
                v: itens.filter(i => { const a = n(i.quantidadeAtual), m = n(i.quantidadeMinima); return m > 0 && a < m && a >= m * 0.5; }).length.toString(),
                color: "text-yellow-600", bg: "bg-yellow-50/40", border: "border-yellow-100",
                icon: AlertTriangle,
              },
              {
                label: "Estoque Crítico",
                v: totalCriticos.toString(),
                color: "text-red-600", bg: "bg-red-50/40", border: "border-red-100",
                icon: AlertTriangle,
                onClick: () => { setApenasZerados(false); setApenasAbaixo(true); },
                active: apenasAbaixo && !apenasZerados,
              },
              {
                label: "Itens Zerados",
                v: totalZerados.toString(),
                sub: totalZerados > 0 ? "ocultos da lista" : "—",
                color: "text-rose-600", bg: "bg-rose-50/40", border: "border-rose-100",
                icon: PackageX,
                onClick: () => { setApenasAbaixo(false); setApenasZerados(true); },
                active: apenasZerados,
              },
              {
                label: "Aplicação Direta",
                v: itensAplicDireta.length.toString(),
                sub: "IA — não estoca",
                color: "text-amber-600", bg: "bg-amber-50/40", border: "border-amber-100",
                icon: Truck,
                onClick: () => { setShowAplicDireta(true); setTimeout(() => document.getElementById("secao-aplic-direta")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); },
              },
              {
                label: "Valor Total em Estoque",
                v: valorTotalEstoque > 0 ? valorTotalEstoque.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—",
                sub: itemMaisCaro ? `Topo: ${itemMaisCaro.nome.length > 20 ? itemMaisCaro.nome.slice(0, 20) + "…" : itemMaisCaro.nome}` : undefined,
                color: "text-violet-600", bg: "bg-violet-50/40", border: "border-violet-100",
                icon: DollarSign,
                onClick: () => { setApenasAbaixo(false); setApenasZerados(false); setSortBy("valor_desc"); },
              },
            ];
            return cards.map((k, i) => {
              const Icon = k.icon;
              const Wrap: any = k.onClick ? "button" : "div";
              return (
                <Wrap
                  key={i}
                  type={k.onClick ? "button" : undefined}
                  onClick={k.onClick}
                  className={`text-left bg-white rounded-xl border shadow-sm p-3 transition ${k.border} ${k.onClick ? "hover:shadow-md hover:border-slate-300 cursor-pointer" : ""} ${k.active ? `ring-2 ring-offset-1 ring-current ${k.color}` : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                    <Icon className={`h-4 w-4 ${k.color} opacity-70`} />
                  </div>
                  <p className={`text-xl font-bold mt-1 ${k.color} ${k.v.length > 10 ? "text-sm" : ""}`}>{k.v}</p>
                  {k.sub && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{k.sub}</p>}
                </Wrap>
              );
            });
          })()}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <select
            value={filtroCateg}
            onChange={e => setFiltroCateg(e.target.value)}
            className="h-9 text-sm border border-slate-200 rounded-md px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="todas">Todas categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Rev. 1606 — Ordenar por valor / quantidade */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="h-9 text-sm border border-slate-200 rounded-md px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title="Ordenar a lista"
          >
            <optgroup label="Nome">
              <option value="nome_asc">Nome (A → Z)</option>
              <option value="nome_desc">Nome (Z → A)</option>
            </optgroup>
            <optgroup label="Valor total em estoque">
              <option value="valor_desc">Maior valor primeiro</option>
              <option value="valor_asc">Menor valor primeiro</option>
            </optgroup>
            <optgroup label="Quantidade em estoque">
              <option value="qtd_desc">Maior quantidade primeiro</option>
              <option value="qtd_asc">Menor quantidade primeiro</option>
            </optgroup>
            <optgroup label="Valor unitário">
              <option value="unit_desc">Maior valor unit. primeiro</option>
              <option value="unit_asc">Menor valor unit. primeiro</option>
            </optgroup>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded" />
            Apenas abaixo do mínimo
          </label>
          {/* Rev. 1608 — Toggle dedicado p/ itens com saldo zerado */}
          <label className={`flex items-center gap-2 text-sm cursor-pointer select-none px-2 py-1 rounded-md border ${apenasZerados ? "bg-rose-50 border-rose-200 text-rose-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
            <input type="checkbox" checked={apenasZerados} onChange={e => setApenasZerados(e.target.checked)} className="rounded" />
            <PackageX className="h-3.5 w-3.5" />
            Apenas zerados {totalZerados > 0 && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold">{totalZerados}</span>}
          </label>
          <span className="text-xs text-slate-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Rev. 1608 — Aviso quando há itens zerados ocultos da lista normal */}
        {!apenasZerados && totalZerados > 0 && (
          <div className="flex items-center gap-2 bg-rose-50/60 border border-rose-100 rounded-lg px-3 py-2">
            <PackageX className="h-4 w-4 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 flex-1">
              <strong>{totalZerados}</strong> item{totalZerados !== 1 ? "ns" : ""} com saldo zerado {totalZerados !== 1 ? "estão ocultos" : "está oculto"} desta lista.
            </p>
            <button
              type="button"
              onClick={() => { setApenasAbaixo(false); setApenasZerados(true); }}
              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline underline-offset-2"
            >
              Ver apenas zerados
            </button>
          </div>
        )}

        {/* Tabela */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /></div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
            <Boxes className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum item no almoxarifado</p>
            <p className="text-sm text-slate-400 mt-1">Clique em "Novo Item" para cadastrar seu primeiro item de estoque</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Item</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Código</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estoque Atual</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mínimo</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor Unit.</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Estoque</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item, idx) => {
                  const atual = n(item.quantidadeAtual);
                  const minimo = n(item.quantidadeMinima);
                  const abaixo = minimo > 0 && atual < minimo;
                  const vu = n((item as any).valorUnitario);
                  const totalItem = vu * atual;
                  return (
                    <tr key={item.id} className={`border-b border-slate-50 hover:bg-slate-50/70 ${abaixo ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800">{item.nome}</p>
                          {(item as any).origem === "alugado" && (
                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-300">LOCADO</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-slate-400">{item.unidade}</p>
                          {(item as any).origem === "alugado" && (item as any).dataVencimentoLocacao && (() => {
                            const dias = Math.ceil((new Date((item as any).dataVencimentoLocacao).getTime() - Date.now()) / 86400000);
                            return <p className={`text-[10px] font-medium ${dias <= 0 ? "text-red-600" : dias <= 7 ? "text-orange-600" : "text-amber-600"}`}>{dias <= 0 ? "⚠ Vencido" : `Vence em ${dias}d`} — {(item as any).fornecedorLocacao || "Fornecedor"}</p>;
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {item.categoria ? (
                          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{item.categoria}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{item.codigoInterno || "—"}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${abaixo ? "text-red-600" : "text-slate-700"}`}>
                        {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)} {item.unidade}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500 text-sm">
                        {minimo > 0 ? `${minimo % 1 === 0 ? minimo.toFixed(0) : minimo.toFixed(2)} ${item.unidade}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-slate-600">
                        {vu > 0 ? vu.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-3 py-3 text-right text-sm font-medium ${totalItem > 0 ? "text-violet-700" : "text-slate-300"}`}>
                        {totalItem > 0 ? totalItem.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <SemaforoEstoque atual={atual} minimo={minimo} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs" onClick={() => abrirMovimento(item, "entrada")}>
                            <ArrowDownCircle className="h-3.5 w-3.5 mr-1" />Entrada
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-orange-700 border-orange-200 hover:bg-orange-50 text-xs" onClick={() => abrirMovimento(item, "saida")}>
                            <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />Saída
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirHistorico(item)} title="Histórico">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEditarItem(item)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => excluirMut.mutate({ id: item.id })} title="Remover">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer com totais */}
              {lista.some(i => n((i as any).valorUnitario) > 0) && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-slate-500 text-right">
                      Total dos {lista.length} item(ns) filtrado(s):
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-violet-700">
                      {lista.reduce((acc, i) => acc + n((i as any).valorUnitario) * n(i.quantidadeAtual), 0)
                        .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Rev. 1607 — Itens de Aplicação Direta (IA) — não entram no almoxarifado */}
        {itensAplicDireta.length > 0 && (
          <div id="secao-aplic-direta" className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden scroll-mt-24">
            <button
              type="button"
              onClick={() => setShowAplicDireta(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50/60 hover:bg-amber-50 transition border-b border-amber-100"
            >
              {showAplicDireta ? <ChevronDown className="h-4 w-4 text-amber-600" /> : <ChevronRight className="h-4 w-4 text-amber-600" />}
              <Truck className="h-4 w-4 text-amber-600" />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-amber-800">
                  Itens de Aplicação Direta (IA) — {itensAplicDireta.length}
                </p>
                <p className="text-[11px] text-amber-700/80">
                  Recebidos e aplicados na obra na mesma operação. NÃO entram no estoque (ex.: concreto usinado, argamassa pronta, asfalto). Classificados automaticamente pela IA.
                </p>
              </div>
            </button>
            {showAplicDireta && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50/30 border-b border-amber-100">
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Item</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Categoria</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Justificativa IA</th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itensAplicDireta.map((it: any) => (
                    <tr key={it.id} className="border-b border-amber-50 hover:bg-amber-50/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800">{it.nome}</p>
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-300">APLICAÇÃO DIRETA</span>
                          {it.tipoControleClassificadoIa && (
                            <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-violet-300 flex items-center gap-0.5">
                              <Sparkles className="h-2.5 w-2.5" />IA
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{it.unidade}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {it.categoria ? <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{it.categoria}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 max-w-md">
                        {it.tipoControleJustificativa || <span className="text-slate-400 italic">— sem justificativa —</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-violet-700 border-violet-200 hover:bg-violet-50 text-xs"
                            onClick={() => reclassificarMut.mutate({ itemId: it.id, companyId })}
                            disabled={reclassificarMut.isPending}
                            title="Reclassificar com IA"
                          >
                            {reclassificarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCcw className="h-3.5 w-3.5 mr-1" />Reclassificar</>}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirHistorico(it)} title="Histórico de consumo">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEditarItem(it)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => excluirMut.mutate({ id: it.id })} title="Remover">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal: Novo/Editar Item */}
      <Dialog open={modalItem} onOpenChange={v => !v && setModalItem(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoItem ? "Editar Item" : "Novo Item de Estoque"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pb-2">
            {/* Rev. 1607 — Classificação IA do tipo de controle (visível ao editar) */}
            {editandoItem && (() => {
              const it: any = [...itens, ...itensAplicDireta].find(x => x.id === editandoItem);
              if (!it) return null;
              const isAD = it.tipoControle === "aplicacao_direta";
              return (
                <div className={`rounded-lg border p-3 ${isAD ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                  <div className="flex items-center gap-2">
                    {isAD ? <Truck className="h-4 w-4 text-amber-600" /> : <Package className="h-4 w-4 text-emerald-600" />}
                    <p className={`text-xs font-bold uppercase tracking-wide ${isAD ? "text-amber-800" : "text-emerald-800"}`}>
                      {isAD ? "Aplicação Direta na obra" : "Estoque normal"}
                    </p>
                    {it.tipoControleClassificadoIa && (
                      <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-violet-300 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />IA
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 px-2 text-[10px] text-violet-700 hover:bg-violet-100"
                      onClick={() => reclassificarMut.mutate({ itemId: editandoItem, companyId })}
                      disabled={reclassificarMut.isPending}
                      title="Pedir à IA para reclassificar"
                    >
                      {reclassificarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCcw className="h-3 w-3 mr-1" />Reclassificar IA</>}
                    </Button>
                  </div>
                  {it.tipoControleJustificativa && (
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">{it.tipoControleJustificativa}</p>
                  )}
                  {isAD && (
                    <p className="text-[10px] text-amber-700 mt-1 italic">⚠ Este item NÃO entra no estoque. Recebimentos via OC geram movimentação de consumo direto na obra.</p>
                  )}
                </div>
              );
            })()}

            <div>
              <Label className="text-xs">Nome do Item *</Label>
              <Input value={formItem.nome} onChange={e => setFormItem(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Ex: Cimento CP-II 50kg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unidade</Label>
                <select
                  value={formItem.unidade}
                  onChange={e => setFormItem(p => ({ ...p, unidade: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-3 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{u} — {u === "un" ? "Unidade" : u === "m" ? "Metro" : u === "m²" ? "Metro²" : u === "m³" ? "Metro³" : u === "kg" ? "Quilograma" : u === "t" ? "Tonelada" : u === "L" ? "Litro" : u === "sc" ? "Saco" : u === "cx" ? "Caixa" : u === "pc" ? "Peça" : u === "vb" ? "Verba" : u === "gl" ? "Global" : u}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Input value={formItem.categoria} onChange={e => setFormItem(p => ({ ...p, categoria: e.target.value }))} className="mt-1" placeholder="Ex: Ferramentas" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Código Interno</Label>
                <Input value={formItem.codigoInterno} onChange={e => setFormItem(p => ({ ...p, codigoInterno: e.target.value }))} className="mt-1" placeholder="Opcional" />
              </div>
              <div>
                <Label className="text-xs">Qtd. Mínima (alerta)</Label>
                <Input type="number" min={0} value={formItem.quantidadeMinima} onChange={e => setFormItem(p => ({ ...p, quantidadeMinima: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>
            {!editandoItem && (
              <div>
                <Label className="text-xs">Quantidade Inicial em Estoque</Label>
                <Input type="number" min={0} value={formItem.quantidadeAtual} onChange={e => setFormItem(p => ({ ...p, quantidadeAtual: parseFloat(e.target.value) || 0 }))} className="mt-1" />
              </div>
            )}
            {editandoItem && (
              <div>
                <Label className="text-xs text-amber-700 font-semibold">Corrigir Estoque Atual</Label>
                <p className="text-[10px] text-amber-600 mb-1">⚠ Altera diretamente o saldo em estoque. Use apenas para correções de inventário.</p>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={formItem.corrigirEstoque}
                  onChange={e => setFormItem(p => ({ ...p, corrigirEstoque: e.target.value }))}
                  className="mt-0.5 border-amber-300 bg-amber-50 focus:border-amber-500"
                  placeholder={`Ex: ${n(formItem.quantidadeAtual)} (atual)`}
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={formItem.observacoes} onChange={e => setFormItem(p => ({ ...p, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>

            {/* Valor Unitário com IA */}
            <div>
              <Label className="text-xs font-semibold">Valor Unitário (R$)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formItem.valorUnitario}
                  onChange={e => setFormItem(p => ({ ...p, valorUnitario: e.target.value }))}
                  placeholder="0,00"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={sugerirPrecoIA}
                  disabled={iaLoading || sugerirPrecoMut.isPending}
                  className="border-violet-300 text-violet-700 hover:bg-violet-50 px-3"
                  title="Estimar preço com IA"
                >
                  {iaLoading || sugerirPrecoMut.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Sparkles className="h-4 w-4 mr-1" />IA</>}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Usado no cálculo do valor total do estoque. O botão IA estima o preço de mercado automaticamente.
              </p>
            </div>

            {/* ── Origem: Próprio / Alugado — só para Equipamentos e Escoramento ── */}
            {(formItem.categoria === "Equipamentos" || formItem.categoria === "Escoramento") && <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-2 block">Origem do Equipamento/Insumo</Label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setFormItem(p => ({ ...p, origem: "proprio" }))}
                    className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "proprio" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    🏢 Próprio da Empresa
                  </button>
                  <button type="button"
                    onClick={() => setFormItem(p => ({ ...p, origem: "alugado" }))}
                    className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "alugado" ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    🔑 Alugado / Locado
                  </button>
                </div>
              </div>
              {formItem.origem === "alugado" && (
                <div className="space-y-3 pt-2 border-t border-amber-100">
                  <div>
                    <Label className="text-xs">Fornecedor / Locadora</Label>
                    <Input className="mt-1" placeholder="Ex: Locamig Equipamentos"
                      value={formItem.fornecedorLocacao}
                      onChange={e => setFormItem(p => ({ ...p, fornecedorLocacao: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Início da Locação</Label>
                      <Input type="date" className="mt-1"
                        value={formItem.dataInicioLocacao}
                        onChange={e => setFormItem(p => ({ ...p, dataInicioLocacao: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-amber-700 font-semibold">⚠ Vencimento</Label>
                      <Input type="date" className="mt-1 border-amber-300 bg-amber-50"
                        value={formItem.dataVencimentoLocacao}
                        onChange={e => setFormItem(p => ({ ...p, dataVencimentoLocacao: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor Mensal (R$)</Label>
                      <Input type="number" step="0.01" min="0" className="mt-1" placeholder="0,00"
                        value={formItem.valorLocacaoMensal || ""}
                        onChange={e => setFormItem(p => ({ ...p, valorLocacaoMensal: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-amber-700">Alertar X dias antes</Label>
                      <p className="text-[10px] text-slate-400">1d = diário · 30d = anual</p>
                      <Input type="number" min="0" className="mt-0.5 border-amber-200 bg-amber-50" placeholder="7"
                        value={formItem.diasAlertaLocacao || ""}
                        onChange={e => setFormItem(p => ({ ...p, diasAlertaLocacao: parseInt(e.target.value) || 7 }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Obs. da Locação</Label>
                    <Textarea className="mt-1" rows={2}
                      value={formItem.observacoesLocacao}
                      onChange={e => setFormItem(p => ({ ...p, observacoesLocacao: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalItem(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={criarMut.isPending || atualizarMut.isPending}
                onClick={salvarItem}
              >
                {criarMut.isPending || atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editandoItem ? "Salvar Alterações" : "Criar Item"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Movimentação */}
      <Dialog open={modalMov} onOpenChange={v => !v && setModalMov(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${formMov.tipo === "entrada" ? "text-emerald-700" : "text-orange-700"}`}>
              {formMov.tipo === "entrada" ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
              {formMov.tipo === "entrada" ? "Registrar Entrada" : "Registrar Saída"} — {movItemNome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pb-2">
            <div>
              <Label className="text-xs">Quantidade ({movItemUnidade})</Label>
              <Input type="number" min={0.001} step="0.001" value={formMov.quantidade || ""} onChange={e => setFormMov(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Obra / Destino</Label>
              <Input value={formMov.obraNome} onChange={e => setFormMov(p => ({ ...p, obraNome: e.target.value }))} className="mt-1" placeholder="Ex: Residencial Sol Poente" />
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={formMov.motivo} onChange={e => setFormMov(p => ({ ...p, motivo: e.target.value }))} className="mt-1" placeholder="Ex: Uso na concretagem" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={formMov.observacoes} onChange={e => setFormMov(p => ({ ...p, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setModalMov(false)}>Cancelar</Button>
              <Button
                className={`flex-1 ${formMov.tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"} text-white`}
                disabled={movMut.isPending}
                onClick={salvarMovimento}
              >
                {movMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmar {formMov.tipo === "entrada" ? "Entrada" : "Saída"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Histórico */}
      <Dialog open={modalHist} onOpenChange={v => !v && setModalHist(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Histórico — {histItemNome}
            </DialogTitle>
          </DialogHeader>
          {loadHist ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : movimentos.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-center">Tipo</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-left">Obra / Destino</th>
                    <th className="px-3 py-2 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m: any) => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-xs text-slate-500">{m.criadoEm ? new Date(m.criadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const t = m.tipo;
                          const cfg =
                            t === "entrada" ? { label: "Entrada", cls: "border-emerald-300 text-emerald-700" } :
                            t === "saida" ? { label: "Saída", cls: "border-orange-300 text-orange-700" } :
                            t === "consumo_direto" ? { label: "Aplicação Direta", cls: "border-amber-300 text-amber-700 bg-amber-50" } :
                            t === "estorno_consumo_direto" ? { label: "Estorno Aplic. Direta", cls: "border-amber-300 text-amber-700" } :
                            { label: "Ajuste", cls: "border-blue-300 text-blue-700" };
                          return <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>;
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${
                        m.tipo === "saida" || m.tipo === "consumo_direto" ? "text-orange-600" :
                        m.tipo === "estorno_consumo_direto" ? "text-amber-700" :
                        "text-emerald-700"
                      }`}>
                        {(m.tipo === "saida" || m.tipo === "consumo_direto") ? "-" : "+"}{n(m.quantidade).toFixed(2)}
                        {(m.tipo === "consumo_direto" || m.tipo === "estorno_consumo_direto") && (
                          <span className="ml-1 text-[10px] text-slate-400 font-normal">(s/ saldo)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{m.obraNome || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{m.motivo || m.observacoes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
