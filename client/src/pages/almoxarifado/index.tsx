import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Package, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, Loader2, History, X, BarChart2, Boxes,
  LayoutGrid, List, Camera, Trash2, ImageOff,
} from "lucide-react";

const UNIDADES = ["un", "m", "m²", "m³", "kg", "t", "L", "sc", "cx", "pc", "vb", "gl", "barra", "rolo", "pç"];

const EMPTY_ITEM = {
  nome: "", unidade: "un", categoria: "", codigoInterno: "",
  quantidadeAtual: 0, quantidadeMinima: 0, observacoes: "", fotoUrl: "",
};
const EMPTY_MOV = {
  tipo: "entrada" as "entrada" | "saida" | "ajuste",
  quantidade: 0, obraNome: "", motivo: "", observacoes: "",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ atual, minimo }: { atual: number; minimo: number }) {
  if (minimo === 0) return <span className="text-xs text-gray-400">Sem mínimo</span>;
  const pct = atual / minimo;
  if (pct >= 1) return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />OK</span>;
  if (pct >= 0.5) return <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Baixo</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Crítico</span>;
}

export default function AlmoxarifadoPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAbaixo, setApenasAbaixo] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const { data: itens = [], refetch, isLoading } = trpc.compras.listarItens.useQuery(
    { companyId }, { enabled: !!companyId }
  );
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
    if (apenasAbaixo) r = r.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima));
    return r;
  }, [itens, busca, filtroCateg, apenasAbaixo]);

  const totalCriticos = useMemo(() =>
    itens.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima)).length,
    [itens]
  );

  // ── Modal Item ──────────────────────────────────────────────────
  const [modalItem, setModalItem] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formItem, setFormItem] = useState({ ...EMPTY_ITEM });
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function abrirNovo() { setFormItem({ ...EMPTY_ITEM }); setEditandoId(null); setModalItem(true); }
  function abrirEditar(i: any) {
    setFormItem({ nome: i.nome, unidade: i.unidade, categoria: i.categoria ?? "", codigoInterno: i.codigoInterno ?? "", quantidadeAtual: n(i.quantidadeAtual), quantidadeMinima: n(i.quantidadeMinima), observacoes: i.observacoes ?? "", fotoUrl: i.fotoUrl ?? "" });
    setEditandoId(i.id);
    setModalItem(true);
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const compressed = await compressImage(file);
      setFormItem(p => ({ ...p, fotoUrl: compressed }));
    } catch { toast.error("Erro ao processar imagem."); }
    finally { setUploadingFoto(false); e.target.value = ""; }
  }

  const criarMut = trpc.compras.criarItem.useMutation({
    onSuccess: () => { refetch(); setModalItem(false); toast.success("Item criado!"); },
  });
  const atualizarMut = trpc.compras.atualizarItem.useMutation({
    onSuccess: () => { refetch(); setModalItem(false); toast.success("Item atualizado!"); },
  });
  const excluirMut = trpc.compras.excluirItem.useMutation({
    onSuccess: () => { refetch(); toast.success("Item removido."); },
  });

  function salvarItem() {
    if (!formItem.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    if (editandoId) {
      atualizarMut.mutate({
        id: editandoId, nome: formItem.nome, unidade: formItem.unidade,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        quantidadeMinima: formItem.quantidadeMinima, observacoes: formItem.observacoes || undefined,
        fotoUrl: formItem.fotoUrl || null,
      });
    } else {
      criarMut.mutate({
        companyId, ...formItem,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        observacoes: formItem.observacoes || undefined, fotoUrl: formItem.fotoUrl || undefined,
      });
    }
  }

  // ── Modal Movimentação ──────────────────────────────────────────
  const [modalMov, setModalMov] = useState(false);
  const [movItem, setMovItem] = useState<any>(null);
  const [formMov, setFormMov] = useState({ ...EMPTY_MOV });
  const movMut = trpc.compras.registrarMovimento.useMutation({
    onSuccess: () => { refetch(); setModalMov(false); toast.success("Movimentação registrada!"); },
    onError: (e) => toast.error(e.message),
  });

  function abrirMovimento(i: any, tipo: "entrada" | "saida") {
    setMovItem(i);
    setFormMov({ tipo, quantidade: 0, obraNome: "", motivo: "", observacoes: "" });
    setModalMov(true);
  }
  function salvarMovimento() {
    if (!movItem) return;
    if (formMov.quantidade <= 0) { toast.error("Quantidade deve ser maior que zero."); return; }
    movMut.mutate({ companyId, itemId: movItem.id, tipo: formMov.tipo, quantidade: formMov.quantidade, obraNome: formMov.obraNome || undefined, motivo: formMov.motivo || undefined, observacoes: formMov.observacoes || undefined });
  }

  // ── Modal Histórico ─────────────────────────────────────────────
  const [modalHist, setModalHist] = useState(false);
  const [histItem, setHistItem] = useState<any>(null);
  const { data: movimentos = [], isLoading: loadHist } = trpc.compras.listarMovimentos.useQuery(
    { companyId, itemId: histItem?.id ?? 0 },
    { enabled: !!histItem && modalHist }
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Boxes className="h-5 w-5 text-emerald-600" />
                Almoxarifado Central
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{itens.length} ite{itens.length !== 1 ? "ns" : "m"} cadastrado{itens.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              {totalCriticos > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-700">{totalCriticos} abaixo do mínimo</span>
                </div>
              )}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "cards" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "table" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  <List className="h-3.5 w-3.5" /> Tabela
                </button>
              </div>
              <button onClick={abrirNovo} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
                <Plus className="h-4 w-4" /> Novo Item
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total de Itens", v: itens.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Estoque OK", v: itens.filter(i => n(i.quantidadeMinima) === 0 || n(i.quantidadeAtual) >= n(i.quantidadeMinima)).length, icon: BarChart2, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Estoque Baixo", v: itens.filter(i => { const a = n(i.quantidadeAtual), m = n(i.quantidadeMinima); return m > 0 && a < m && a >= m * 0.5; }).length, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Estoque Crítico", v: totalCriticos, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`${k.bg} p-2 rounded-lg`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.v}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                placeholder="Buscar por nome, código ou categoria..."
                value={busca} onChange={e => setBusca(e.target.value)}
              />
            </div>
            <select
              value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}
              className="h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-emerald-400"
            >
              <option value="todas">Todas categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded border-gray-300" />
              Apenas abaixo do mínimo
            </label>
            <span className="text-xs text-gray-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
          ) : lista.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <Boxes className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum item no almoxarifado</p>
              <p className="text-sm text-gray-400 mt-1">Clique em "Novo Item" para cadastrar</p>
            </div>
          ) : viewMode === "cards" ? (
            /* ── CARD VIEW ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {lista.map(item => {
                const atual = n(item.quantidadeAtual);
                const minimo = n(item.quantidadeMinima);
                const abaixo = minimo > 0 && atual < minimo;
                return (
                  <div key={item.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${abaixo ? "border-red-200" : "border-gray-100"}`}>
                    {/* Foto */}
                    <div
                      className="relative bg-gray-50 flex items-center justify-center cursor-pointer group"
                      style={{ height: 140 }}
                      onClick={() => abrirEditar(item)}
                    >
                      {(item as any).fotoUrl ? (
                        <>
                          <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                            <Pencil className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-400 transition">
                          <Camera className="h-8 w-8" />
                          <span className="text-[10px]">Adicionar foto</span>
                        </div>
                      )}
                      {abaixo && (
                        <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{item.nome}</p>
                        {item.categoria && <p className="text-[11px] text-gray-400 mt-0.5">{item.categoria}</p>}
                        {item.codigoInterno && <p className="text-[11px] font-mono text-gray-400">{item.codigoInterno}</p>}
                      </div>
                      <div className="mt-auto">
                        <p className={`text-lg font-bold ${abaixo ? "text-red-600" : "text-gray-900"}`}>
                          {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ml-1">{item.unidade}</span>
                        </p>
                        <StatusBadge atual={atual} minimo={minimo} />
                      </div>
                      {/* Actions */}
                      <div className="flex gap-1 pt-1 border-t border-gray-50">
                        <button onClick={() => abrirMovimento(item, "entrada")} title="Entrada" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 rounded transition">
                          <ArrowDownCircle className="h-3.5 w-3.5" />In
                        </button>
                        <button onClick={() => abrirMovimento(item, "saida")} title="Saída" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-orange-700 hover:bg-orange-50 rounded transition">
                          <ArrowUpCircle className="h-3.5 w-3.5" />Out
                        </button>
                        <button onClick={() => { setHistItem(item); setModalHist(true); }} title="Histórico" className="px-1.5 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition">
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`Remover "${item.nome}"?`)) excluirMut.mutate({ id: item.id }); }} title="Remover" className="px-1.5 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── TABLE VIEW ── */
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estoque</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mínimo</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(item => {
                    const atual = n(item.quantidadeAtual);
                    const minimo = n(item.quantidadeMinima);
                    const abaixo = minimo > 0 && atual < minimo;
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/70 ${abaixo ? "bg-red-50/20" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                            {(item as any).fotoUrl
                              ? <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                              : <ImageOff className="h-4 w-4 text-gray-300" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{item.nome}</p>
                          <p className="text-xs text-gray-400">{item.unidade}</p>
                        </td>
                        <td className="px-3 py-3">
                          {item.categoria ? <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{item.categoria}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-500">{item.codigoInterno || "—"}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${abaixo ? "text-red-600" : "text-gray-700"}`}>
                          {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)} {item.unidade}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500 text-sm">
                          {minimo > 0 ? `${minimo % 1 === 0 ? minimo.toFixed(0) : minimo.toFixed(2)} ${item.unidade}` : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge atual={atual} minimo={minimo} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => abrirMovimento(item, "entrada")} className="flex items-center gap-1 h-7 px-2 text-xs text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 transition">
                              <ArrowDownCircle className="h-3.5 w-3.5" />Entrada
                            </button>
                            <button onClick={() => abrirMovimento(item, "saida")} className="flex items-center gap-1 h-7 px-2 text-xs text-orange-700 border border-orange-200 rounded hover:bg-orange-50 transition">
                              <ArrowUpCircle className="h-3.5 w-3.5" />Saída
                            </button>
                            <button onClick={() => { setHistItem(item); setModalHist(true); }} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Histórico">
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => abrirEditar(item)} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (confirm(`Remover "${item.nome}"?`)) excluirMut.mutate({ id: item.id }); }} className="h-7 w-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition" title="Remover">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Novo/Editar Item ──────────────────────────────────── */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalItem(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editandoId ? "Editar Item" : "Novo Item de Estoque"}</h2>
              <button onClick={() => setModalItem(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Foto */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Foto do Produto</label>
                <div className="flex items-start gap-4">
                  <div
                    className="relative w-28 h-28 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-400 transition group"
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    {uploadingFoto ? (
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    ) : formItem.fotoUrl ? (
                      <>
                        <img src={formItem.fotoUrl} alt="Produto" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                          <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-400 transition">
                        <Camera className="h-8 w-8" />
                        <span className="text-[10px] text-center">Clique para<br/>adicionar foto</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-xs text-gray-500">Adicione uma foto para identificar visualmente o produto no almoxarifado.</p>
                    <button type="button" onClick={() => fotoInputRef.current?.click()} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition">
                      {formItem.fotoUrl ? "Trocar foto" : "Escolher imagem"}
                    </button>
                    {formItem.fotoUrl && (
                      <button type="button" onClick={() => setFormItem(p => ({ ...p, fotoUrl: "" }))} className="text-xs text-red-500 hover:text-red-700 ml-2">
                        Remover
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400">JPG, PNG ou WEBP • Max. comprimido automaticamente</p>
                  </div>
                </div>
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
              </div>

              {/* Nome */}
              <div>
                <label className="text-xs font-medium text-gray-700">Nome do Item *</label>
                <input
                  className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                  placeholder="Ex: Cimento CP-II 50kg"
                  value={formItem.nome} onChange={e => setFormItem(p => ({ ...p, nome: e.target.value }))}
                />
              </div>

              {/* Unidade + Categoria */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Unidade</label>
                  <select
                    value={formItem.unidade} onChange={e => setFormItem(p => ({ ...p, unidade: e.target.value }))}
                    className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-emerald-400"
                  >
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Categoria</label>
                  <select
                    className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-emerald-400 text-gray-900"
                    value={formItem.categoria} onChange={e => setFormItem(p => ({ ...p, categoria: e.target.value }))}
                  >
                    <option value="">— Selecionar —</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Código + Mínimo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Código Interno</label>
                  <input
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400"
                    placeholder="Opcional"
                    value={formItem.codigoInterno} onChange={e => setFormItem(p => ({ ...p, codigoInterno: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Qtd. Mínima (alerta)</label>
                  <input
                    type="number" min={0}
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    value={formItem.quantidadeMinima}
                    onChange={e => setFormItem(p => ({ ...p, quantidadeMinima: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Qtd Inicial (só no novo) */}
              {!editandoId && (
                <div>
                  <label className="text-xs font-medium text-gray-700">Quantidade Inicial em Estoque</label>
                  <input
                    type="number" min={0}
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    value={formItem.quantidadeAtual}
                    onChange={e => setFormItem(p => ({ ...p, quantidadeAtual: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="text-xs font-medium text-gray-700">Observações</label>
                <textarea
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 resize-none"
                  rows={2} value={formItem.observacoes}
                  onChange={e => setFormItem(p => ({ ...p, observacoes: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalItem(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button onClick={salvarItem} disabled={criarMut.isPending || atualizarMut.isPending} className="flex-1 h-9 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editandoId ? "Salvar Alterações" : "Criar Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Movimentação ──────────────────────────────────────── */}
      {modalMov && movItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalMov(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {formMov.tipo === "entrada"
                  ? <><ArrowDownCircle className="h-5 w-5 text-emerald-600" />Entrada de Material</>
                  : <><ArrowUpCircle className="h-5 w-5 text-orange-600" />Saída de Material</>}
              </h2>
              <button onClick={() => setModalMov(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Item info */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                {(movItem as any).fotoUrl ? (
                  <img src={(movItem as any).fotoUrl} alt={movItem.nome} className="w-12 h-12 rounded-lg object-cover border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="h-6 w-6 text-gray-300" /></div>
                )}
                <div>
                  <p className="font-medium text-gray-800 text-sm">{movItem.nome}</p>
                  <p className="text-xs text-gray-500">Saldo atual: <strong>{n(movItem.quantidadeAtual) % 1 === 0 ? n(movItem.quantidadeAtual).toFixed(0) : n(movItem.quantidadeAtual).toFixed(2)}</strong> {movItem.unidade}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Quantidade ({movItem.unidade}) *</label>
                <input
                  type="number" min={0.001} step={0.001}
                  className="mt-1 w-full h-10 px-3 text-lg font-semibold rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                  value={formMov.quantidade || ""}
                  onChange={e => setFormMov(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              {formMov.tipo === "saida" && (
                <div>
                  <label className="text-xs font-medium text-gray-700">Obra (destino)</label>
                  <input className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400" placeholder="Nome da obra" value={formMov.obraNome} onChange={e => setFormMov(p => ({ ...p, obraNome: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-700">Motivo</label>
                <input className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400" placeholder="Ex: Compra, Devolução, Ajuste..." value={formMov.motivo} onChange={e => setFormMov(p => ({ ...p, motivo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Observações</label>
                <textarea className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 resize-none" rows={2} value={formMov.observacoes} onChange={e => setFormMov(p => ({ ...p, observacoes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalMov(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button
                  onClick={salvarMovimento}
                  disabled={movMut.isPending || formMov.quantidade <= 0}
                  className={`flex-1 h-9 text-sm rounded-lg text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${formMov.tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}
                >
                  {movMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar {formMov.tipo === "entrada" ? "Entrada" : "Saída"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Histórico ─────────────────────────────────────────── */}
      {modalHist && histItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalHist(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <History className="h-5 w-5" /> Histórico — {histItem.nome}
              </h2>
              <button onClick={() => setModalHist(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadHist ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : movimentos.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">Nenhuma movimentação registrada.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Data", "Tipo", "Qtd.", "Obra", "Motivo", "Usuário"].map(h => (
                        <th key={h} className="text-left py-2.5 px-3 text-xs text-gray-500 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map(m => (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                          {m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            m.tipo === "entrada" ? "bg-emerald-50 text-emerald-700" :
                            m.tipo === "saida"   ? "bg-orange-50 text-orange-700" :
                            "bg-gray-50 text-gray-600"}`}>
                            {m.tipo === "entrada" ? "↓ Entrada" : m.tipo === "saida" ? "↑ Saída" : "≈ Ajuste"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm font-semibold">
                          {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "-" : ""}
                          {n(m.quantidade) % 1 === 0 ? n(m.quantidade).toFixed(0) : n(m.quantidade).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.obraNome || "—"}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.motivo || "—"}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.usuarioNome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
