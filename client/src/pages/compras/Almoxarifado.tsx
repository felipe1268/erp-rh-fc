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
  AlertTriangle, Loader2, History, X, BarChart2, Boxes,
} from "lucide-react";

const UNIDADES = ["un", "m", "m²", "m³", "kg", "t", "L", "sc", "cx", "pc", "vb", "gl", "barra", "rolo", "pç"];

const EMPTY_ITEM = {
  nome: "", unidade: "un", categoria: "", codigoInterno: "",
  quantidadeAtual: 0, quantidadeMinima: 0, observacoes: "",
  origem: "proprio" as "proprio" | "alugado",
  fornecedorLocacao: "", dataInicioLocacao: "", dataVencimentoLocacao: "",
  valorLocacaoMensal: 0, diasAlertaLocacao: 7, observacoesLocacao: "",
};

const EMPTY_MOV = {
  tipo: "entrada" as "entrada" | "saida" | "ajuste",
  quantidade: 0, obraNome: "", motivo: "", observacoes: "",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }

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

  const { data: itens = [], refetch: refetchItens, isLoading } = trpc.compras.listarItens.useQuery(
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

  // Modal item
  const [modalItem, setModalItem] = useState(false);
  const [editandoItem, setEditandoItem] = useState<number | null>(null);
  const [formItem, setFormItem] = useState({ ...EMPTY_ITEM });

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

  const criarMut    = trpc.compras.criarItem.useMutation({ onSuccess: () => { refetchItens(); setModalItem(false); toast.success("Item criado!"); } });
  const atualizarMut = trpc.compras.atualizarItem.useMutation({ onSuccess: () => { refetchItens(); setModalItem(false); toast.success("Item atualizado!"); } });
  const excluirMut  = trpc.compras.excluirItem.useMutation({ onSuccess: () => { refetchItens(); toast.success("Item removido."); } });
  const movMut      = trpc.compras.registrarMovimento.useMutation({
    onSuccess: () => { refetchItens(); setModalMov(false); toast.success("Movimentação registrada!"); },
    onError: (e) => toast.error(e.message),
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
    if (editandoItem) {
      atualizarMut.mutate({ id: editandoItem, nome: formItem.nome, unidade: formItem.unidade, categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined, quantidadeMinima: formItem.quantidadeMinima, observacoes: formItem.observacoes || undefined, ...locacaoPayload });
    } else {
      criarMut.mutate({ companyId, nome: formItem.nome, unidade: formItem.unidade, categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined, quantidadeAtual: formItem.quantidadeAtual, quantidadeMinima: formItem.quantidadeMinima, observacoes: formItem.observacoes || undefined, ...locacaoPayload } as any);
    }
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
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total de Itens", v: itens.length, icon: Package, color: "text-blue-600" },
            { label: "Itens OK", v: itens.filter(i => n(i.quantidadeMinima) === 0 || n(i.quantidadeAtual) >= n(i.quantidadeMinima)).length, icon: BarChart2, color: "text-emerald-600" },
            { label: "Estoque Baixo", v: itens.filter(i => { const a = n(i.quantidadeAtual), m = n(i.quantidadeMinima); return m > 0 && a < m && a >= m * 0.5; }).length, icon: AlertTriangle, color: "text-yellow-600" },
            { label: "Estoque Crítico", v: totalCriticos, icon: AlertTriangle, color: "text-red-600" },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.v}</p>
            </div>
          ))}
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
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded" />
            Apenas abaixo do mínimo
          </label>
          <span className="text-xs text-slate-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
        </div>

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
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item, idx) => {
                  const atual = n(item.quantidadeAtual);
                  const minimo = n(item.quantidadeMinima);
                  const abaixo = minimo > 0 && atual < minimo;
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
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo/Editar Item */}
      <Dialog open={modalItem} onOpenChange={v => !v && setModalItem(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoItem ? "Editar Item" : "Novo Item de Estoque"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pb-2">
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
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Input value={formItem.categoria} onChange={e => setFormItem(p => ({ ...p, categoria: e.target.value }))} className="mt-1" placeholder="Ex: Cimento e Argamassa" />
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
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={formItem.observacoes} onChange={e => setFormItem(p => ({ ...p, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>

            {/* ── Origem: Próprio / Alugado ── */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
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
                    <Label className="text-xs">Observações do Contrato</Label>
                    <Textarea className="mt-1" rows={2} placeholder="Nº do contrato, condições, etc."
                      value={formItem.observacoesLocacao}
                      onChange={e => setFormItem(p => ({ ...p, observacoesLocacao: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setModalItem(false)}>Cancelar</Button>
              <Button onClick={salvarItem} disabled={criarMut.isPending || atualizarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editandoItem ? "Salvar" : "Criar Item"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Movimentação */}
      <Dialog open={modalMov} onOpenChange={v => !v && setModalMov(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formMov.tipo === "entrada"
                ? <><ArrowDownCircle className="h-5 w-5 text-emerald-600" />Entrada de Material</>
                : <><ArrowUpCircle className="h-5 w-5 text-orange-600" />Saída de Material</>
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pb-2">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-700">{movItemNome}</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Saldo atual: {n(itens.find(i => i.id === movItemId)?.quantidadeAtual)} {movItemUnidade}
              </p>
            </div>
            <div>
              <Label className="text-xs">Quantidade ({movItemUnidade}) *</Label>
              <Input
                type="number" min={0.001} step={0.001}
                value={formMov.quantidade || ""}
                onChange={e => setFormMov(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))}
                className="mt-1 text-lg font-semibold"
              />
            </div>
            {formMov.tipo === "saida" && (
              <div>
                <Label className="text-xs">Obra (destino)</Label>
                <Input value={formMov.obraNome} onChange={e => setFormMov(p => ({ ...p, obraNome: e.target.value }))} className="mt-1" placeholder="Nome da obra" />
              </div>
            )}
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={formMov.motivo} onChange={e => setFormMov(p => ({ ...p, motivo: e.target.value }))} className="mt-1" placeholder="Ex: Compra, Devolução, Ajuste de inventário..." />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={formMov.observacoes} onChange={e => setFormMov(p => ({ ...p, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setModalMov(false)}>Cancelar</Button>
              <Button
                onClick={salvarMovimento}
                disabled={movMut.isPending || formMov.quantidade <= 0}
                className={formMov.tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"}
              >
                {movMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Registrar {formMov.tipo === "entrada" ? "Entrada" : "Saída"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Histórico */}
      <Dialog open={modalHist} onOpenChange={v => !v && setModalHist(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico — {histItemNome}
            </DialogTitle>
          </DialogHeader>
          {loadHist ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : movimentos.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Nenhuma movimentação registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-xs text-slate-400">Data</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400">Tipo</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-400">Qtd.</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400">Obra</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400">Motivo</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map(m => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.tipo === "entrada" ? "bg-emerald-50 text-emerald-700" :
                        m.tipo === "saida"   ? "bg-orange-50 text-orange-700" :
                        "bg-slate-50 text-slate-600"
                      }`}>
                        {m.tipo === "entrada" ? "↓ Entrada" : m.tipo === "saida" ? "↑ Saída" : "≈ Ajuste"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-medium">
                      {m.tipo === "saida" ? "-" : "+"}{n(m.quantidade)}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">{m.obraNome || "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-500">{m.motivo || "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-500">{m.usuarioNome || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
