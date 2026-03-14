import DashboardLayout from "@/components/DashboardLayout";
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
import { toast } from "sonner";
import { Plus, Search, Trash2, ChevronRight, Loader2, ShoppingBag, CheckCircle, Truck, PackageCheck } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente:          { label: "Pendente",         color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  aprovada:          { label: "Aprovada",          color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  entregue_parcial:  { label: "Entregue Parcial",  color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  entregue:          { label: "Entregue",          color: "bg-green-500/20 text-green-300 border-green-500/30" },
  cancelada:         { label: "Cancelada",         color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "0" });

export default function Ordens() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [showStatus, setShowStatus] = useState<{ id: number; atual: string } | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [dataEntregaReal, setDataEntregaReal] = useState("");

  const [form, setForm] = useState({ fornecedorId: "", dataEntregaPrevista: "", observacoes: "", frete: "", outrasDespesas: "", impostos: "", desconto: "" });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);

  const q = trpc.compras.listarOrdens.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getOrdem.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });

  const criarManual = trpc.compras.criarOrdemManual.useMutation({
    onSuccess: () => { toast.success("Ordem de Compra criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusOrdem.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); setShowStatus(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirOrdem.useMutation({
    onSuccess: () => { toast.success("OC excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setForm({ fornecedorId: "", dataEntregaPrevista: "", observacoes: "", frete: "", outrasDespesas: "", impostos: "", desconto: "" });
    setItens([newItem()]);
  }

  function handleSalvar() {
    const validos = itens.filter(i => i.descricao.trim());
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");
    criarManual.mutate({
      companyId,
      fornecedorId: form.fornecedorId ? parseInt(form.fornecedorId) : undefined,
      dataEntregaPrevista: form.dataEntregaPrevista || undefined,
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
  const lista = q.data ?? [];
  const filt = lista.filter(o => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return o.numeroOc?.toLowerCase().includes(b);
  });
  const detalhe = detalheQ.data;

  const totalItens = itens.reduce((s, it) => s + (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0), 0);

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <ShoppingBag className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Ordens de Compra</h1>
            <p className="text-sm text-slate-400">Acompanhe pedidos emitidos aos fornecedores</p>
          </div>
        </div>
        <Button onClick={() => setShowNova(true)} className="bg-green-700 hover:bg-green-600 text-white gap-2">
          <Plus className="h-4 w-4" /> Nova OC Manual
        </Button>
      </div>

      {/* KPIs rápidos */}
      {(() => {
        const pend = lista.filter(o => o.status === "pendente").length;
        const aprov = lista.filter(o => o.status === "aprovada").length;
        const entregue = lista.filter(o => o.status === "entregue").length;
        const totalVal = lista.reduce((s, o) => s + parseFloat(o.total ?? "0"), 0);
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pendentes", value: pend, icon: ShoppingBag, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
              { label: "Aprovadas", value: aprov, icon: CheckCircle, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
              { label: "Entregues", value: entregue, icon: PackageCheck, color: "text-green-400 bg-green-500/10 border-green-500/20" },
              { label: "Total em OCs", value: totalVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icon: Truck, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
            ].map((k, i) => (
              <div key={i} className={`rounded-xl border p-4 ${k.color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className="h-4 w-4" />
                  <span className="text-xs text-slate-400">{k.label}</span>
                </div>
                <div className="text-xl font-bold">{k.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar por número..." className="pl-9 bg-slate-800 border-slate-700 text-white" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "pendente", "aprovada", "entregue_parcial", "entregue", "cancelada"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s ? "bg-green-700 border-green-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent">
              <TableHead className="text-slate-400">Número OC</TableHead>
              <TableHead className="text-slate-400">Fornecedor</TableHead>
              <TableHead className="text-slate-400">Origem</TableHead>
              <TableHead className="text-slate-400">Total</TableHead>
              <TableHead className="text-slate-400">Entrega Prevista</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-500">Nenhuma ordem encontrada</TableCell></TableRow>
            ) : filt.map(oc => {
              const st = STATUS_LABELS[oc.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === oc.fornecedorId);
              return (
                <TableRow key={oc.id} className="border-slate-700 hover:bg-slate-800/50 cursor-pointer" onClick={() => setShowDetalhe(oc.id)}>
                  <TableCell className="text-white font-mono font-semibold">{oc.numeroOc}</TableCell>
                  <TableCell className="text-slate-300 text-sm">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{oc.cotacaoId ? `COT #${oc.cotacaoId}` : "Manual"}</TableCell>
                  <TableCell className="text-green-400 font-semibold">
                    {parseFloat(oc.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">{oc.dataEntregaPrevista ? new Date(oc.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>{st.label}</span></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-slate-500" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Nova OC Manual */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Ordem de Compra (Manual)</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Fornecedor</Label>
                <Select value={form.fornecedorId} onValueChange={v => setForm(p => ({ ...p, fornecedorId: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="">Nenhum</SelectItem>
                    {fornecedores.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nomeFantasia || f.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Previsão de Entrega</Label>
                <Input type="date" className="bg-slate-800 border-slate-700 text-white" value={form.dataEntregaPrevista} onChange={e => setForm(p => ({ ...p, dataEntregaPrevista: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Observações</Label>
              <Textarea className="bg-slate-800 border-slate-700 text-white resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 font-semibold">Itens *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-800 border border-slate-700 space-y-2">
                    <div className="flex gap-2">
                      <Input className="flex-1 bg-slate-700 border-slate-600 text-white text-sm" placeholder="Descrição *" value={it.descricao} onChange={e => updateItem(idx, "descricao", e.target.value)} />
                      {itens.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Select value={it.unidade} onValueChange={v => updateItem(idx, "unidade", v)}>
                        <SelectTrigger className="w-20 bg-slate-700 border-slate-600 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="w-24 bg-slate-700 border-slate-600 text-white text-sm h-8" type="number" min="0" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(idx, "quantidade", e.target.value)} />
                      <Input className="flex-1 bg-slate-700 border-slate-600 text-white text-sm h-8" type="number" min="0" step="0.01" placeholder="Preço unit. (R$)" value={it.precoUnitario} onChange={e => updateItem(idx, "precoUnitario", e.target.value)} />
                      <span className="text-green-400 text-sm font-medium w-28 text-right">
                        {((parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totalizadores */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-2">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-3">Totalizadores</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Subtotal (Itens)</Label>
                  <div className="text-white font-mono text-sm">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </div>
                {[
                  { label: "Frete (R$)", key: "frete" as const, sign: "+" },
                  { label: "Outras Despesas (R$)", key: "outrasDespesas" as const, sign: "+" },
                  { label: "Impostos (R$)", key: "impostos" as const, sign: "+" },
                  { label: "Desconto (R$)", key: "desconto" as const, sign: "−" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-slate-400 text-xs">{f.sign} {f.label}</Label>
                    <Input type="number" min="0" step="0.01" className="bg-slate-700 border-slate-600 text-white h-8 text-sm"
                      value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-600 mt-2">
                <span className="text-slate-300 font-semibold text-sm">Total da OC</span>
                <span className="text-green-400 font-bold text-lg">
                  {(totalItens + (parseFloat(form.frete) || 0) + (parseFloat(form.outrasDespesas) || 0) + (parseFloat(form.impostos) || 0) - (parseFloat(form.desconto) || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criarManual.isPending} className="flex-1 bg-green-700 hover:bg-green-600 text-white">
                {criarManual.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar OC"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe OC */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{detalhe?.numeroOc} — Ordem de Compra</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : detalhe ? (() => {
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            return (
              <div className="space-y-5 pt-2">
                <div className="grid grid-cols-2 gap-3 text-sm bg-slate-800 rounded-lg p-3">
                  <div><span className="text-slate-400 text-xs">Fornecedor</span><p className="text-white font-medium">{(detalhe as any).fornecedor?.nomeFantasia || (detalhe as any).fornecedor?.razaoSocial || "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.color}`}>{st.label}</span></p></div>
                  <div><span className="text-slate-400 text-xs">Entrega prevista</span><p className="text-white font-medium">{detalhe.dataEntregaPrevista ? new Date(detalhe.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Entrega real</span><p className="text-white font-medium">{detalhe.dataEntregaReal ? new Date(detalhe.dataEntregaReal + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Origem</span><p className="text-white font-medium">{detalhe.cotacaoId ? `Cotação #${detalhe.cotacaoId}` : "Manual"}</p></div>
                  <div><span className="text-slate-400 text-xs">Criado em</span><p className="text-white font-medium">{new Date(detalhe.criadoEm).toLocaleDateString("pt-BR")}</p></div>
                </div>

                {/* Totais */}
                {(() => {
                  const subtotal = parseFloat((detalhe as any).subtotal ?? detalhe.total ?? "0");
                  const frete = parseFloat((detalhe as any).frete ?? "0");
                  const outrasDespesas = parseFloat((detalhe as any).outrasDespesas ?? "0");
                  const impostos = parseFloat((detalhe as any).impostos ?? "0");
                  const desconto = parseFloat((detalhe as any).desconto ?? "0");
                  const total = parseFloat(detalhe.total ?? "0");
                  const hasExtras = frete > 0 || outrasDespesas > 0 || impostos > 0 || desconto > 0;
                  if (!hasExtras) return null;
                  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                  return (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3 text-sm space-y-1.5">
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-2">Composição do Total</div>
                      {[
                        { label: "Subtotal itens", value: subtotal, sign: "" },
                        { label: "Frete", value: frete, sign: "+" },
                        { label: "Outras despesas", value: outrasDespesas, sign: "+" },
                        { label: "Impostos", value: impostos, sign: "+" },
                        { label: "Desconto", value: desconto, sign: "−", neg: true },
                      ].filter(r => r.value !== 0).map(r => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-slate-400">{r.sign ? `${r.sign} ` : ""}{r.label}</span>
                          <span className={r.neg ? "text-red-400" : "text-slate-300"}>{r.neg ? `-${fmt(r.value)}` : fmt(r.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-600 pt-2 mt-1">
                        <span className="text-white font-semibold">Total</span>
                        <span className="text-green-400 font-bold text-base">{fmt(total)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Descrição</TableHead>
                        <TableHead className="text-slate-400 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-slate-400 text-xs w-20">Qtd</TableHead>
                        <TableHead className="text-slate-400 text-xs w-24">Entregue</TableHead>
                        <TableHead className="text-slate-400 text-xs w-28">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detalhe.itens as any[]).map((it: any) => (
                        <TableRow key={it.id} className="border-slate-700">
                          <TableCell className="text-white text-sm">{it.descricao}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.quantidadeEntregue || "0").toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-green-400 text-sm font-medium">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Alterar Status */}
                {!["entregue", "cancelada"].includes(detalhe.status) && (
                  <div className="space-y-3 border-t border-slate-700 pt-4">
                    <Label className="text-slate-300 text-sm font-semibold">Atualizar Status</Label>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { s: "aprovada", label: "Aprovar", icon: CheckCircle, color: "bg-blue-700 hover:bg-blue-600" },
                        { s: "entregue_parcial", label: "Entrega Parcial", icon: Truck, color: "bg-orange-700 hover:bg-orange-600" },
                        { s: "entregue", label: "Marcar Entregue", icon: PackageCheck, color: "bg-green-700 hover:bg-green-600" },
                        { s: "cancelada", label: "Cancelar", icon: Trash2, color: "bg-red-800 hover:bg-red-700" },
                      ].filter(a => a.s !== detalhe.status).map(a => (
                        <Button key={a.s} size="sm" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: a.s })}
                          disabled={atualizarStatus.isPending}
                          className={`text-white text-xs gap-1 ${a.color}`}>
                          <a.icon className="h-3 w-3" /> {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex pt-2 border-t border-slate-700">
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs ml-auto gap-1">
                    <Trash2 className="h-3 w-3" /> Excluir OC
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
