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
import { Plus, Search, Trash2, ChevronRight, Loader2, FileText, CheckCircle, X } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente:  { label: "Pendente",   color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  aprovada:  { label: "Aprovada",   color: "bg-green-500/20 text-green-300 border-green-500/30" },
  recusada:  { label: "Recusada",   color: "bg-red-500/20 text-red-300 border-red-500/30" },
  expirada:  { label: "Expirada",   color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];
const COND_PAG = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias", "90 dias"];

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; descontoPct: string; solicitacaoItemId?: number | null; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "0", descontoPct: "0" });

function calcTotal(it: ItemForm) {
  const q = parseFloat(it.quantidade) || 0;
  const p = parseFloat(it.precoUnitario) || 0;
  const d = parseFloat(it.descontoPct) || 0;
  return q * p * (1 - d / 100);
}

export default function Cotacoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);

  const [form, setForm] = useState({
    descricao: "", solicitacaoId: "", fornecedorId: "", dataValidade: "",
    condicaoPagamento: "", prazoEntregaDias: "", observacoes: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);

  const q = trpc.compras.listarCotacoes.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getCotacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const scsQ = trpc.compras.listarSolicitacoes.useQuery({ companyId }, { enabled: companyId > 0 });
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });

  const criar = trpc.compras.criarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const gerarOC = trpc.compras.criarOrdemDeCotacao.useMutation({
    onSuccess: () => { toast.success("Ordem de Compra gerada com sucesso!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusCotacao.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setForm({ descricao: "", solicitacaoId: "", fornecedorId: "", dataValidade: "", condicaoPagamento: "", prazoEntregaDias: "", observacoes: "" });
    setItens([newItem()]);
  }

  function handleScChange(scId: string) {
    setForm(p => ({ ...p, solicitacaoId: scId }));
    if (!scId) return;
    const sc = scsQ.data?.find(s => s.id === parseInt(scId));
    if (!sc) return;
    // Não precisa buscar itens da SC aqui porque a cotação pode ter seus próprios itens
  }

  function handleSalvar() {
    const validos = itens.filter(i => i.descricao.trim() && parseFloat(i.precoUnitario) > 0);
    if (validos.length === 0) return toast.error("Adicione pelo menos um item com preço.");
    criar.mutate({
      companyId,
      descricao: form.descricao || undefined,
      solicitacaoId: form.solicitacaoId ? parseInt(form.solicitacaoId) : undefined,
      fornecedorId: form.fornecedorId ? parseInt(form.fornecedorId) : undefined,
      dataValidade: form.dataValidade || undefined,
      condicaoPagamento: form.condicaoPagamento || undefined,
      prazoEntregaDias: form.prazoEntregaDias ? parseInt(form.prazoEntregaDias) : undefined,
      observacoes: form.observacoes || undefined,
      itens: validos.map(i => ({
        solicitacaoItemId: i.solicitacaoItemId ?? undefined,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
        descontoPct: parseFloat(i.descontoPct) || 0,
      })),
    });
  }

  function addItem() { setItens(p => [...p, newItem()]); }
  function removeItem(idx: number) { setItens(p => p.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItens(p => p.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const lista = q.data ?? [];
  const filt = lista.filter(c => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return c.numeroCotacao?.toLowerCase().includes(b);
  });

  const fornecedores = fornQ.data ?? [];
  const detalhe = detalheQ.data;

  const totalItens = itens.reduce((s, it) => s + calcTotal(it), 0);

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Cotações</h1>
            <p className="text-sm text-slate-400">Registre propostas de fornecedores e compare preços</p>
          </div>
        </div>
        <Button onClick={() => setShowNova(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
          <Plus className="h-4 w-4" /> Nova Cotação
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar por número..." className="pl-9 bg-slate-800 border-slate-700 text-white" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {["todos", "pendente", "aprovada", "recusada", "expirada"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>
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
              <TableHead className="text-slate-400 text-xs">Número</TableHead>
              <TableHead className="text-slate-400 text-xs">Descrição / SC</TableHead>
              <TableHead className="text-slate-400 text-xs">Fornecedor</TableHead>
              <TableHead className="text-slate-400 text-xs">Total</TableHead>
              <TableHead className="text-slate-400 text-xs">Validade</TableHead>
              <TableHead className="text-slate-400 text-xs">Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-500">Nenhuma cotação encontrada</TableCell></TableRow>
            ) : filt.map(cot => {
              const st = STATUS_LABELS[cot.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === cot.fornecedorId);
              return (
                <TableRow key={cot.id} className="border-slate-700 hover:bg-slate-800/50 cursor-pointer" onClick={() => setShowDetalhe(cot.id)}>
                  <TableCell className="text-white font-mono font-semibold text-xs">{cot.numeroCotacao}</TableCell>
                  <TableCell>
                    <div className="text-white text-sm">{(cot as any).descricao || "—"}</div>
                    {cot.solicitacaoId && <div className="text-slate-500 text-xs">SC #{cot.solicitacaoId}</div>}
                  </TableCell>
                  <TableCell className="text-slate-300 text-sm">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</TableCell>
                  <TableCell className="text-green-400 font-semibold">
                    {parseFloat(cot.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">{cot.dataValidade ? new Date(cot.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>{st.label}</span></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-slate-500" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Nova Cotação */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Cotação</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Descrição da Cotação</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Cotação de materiais de elétrica - Forn. XYZ" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">SC Vinculada (opcional)</Label>
                <Select value={form.solicitacaoId} onValueChange={handleScChange}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Selecione uma SC..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="">Nenhuma</SelectItem>
                    {(scsQ.data ?? []).filter(s => ["pendente", "cotacao"].includes(s.status)).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.numeroSc}{(s as any).titulo ? ` — ${(s as any).titulo}` : s.departamento ? ` — ${s.departamento}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                <Label className="text-slate-300">Validade da Cotação</Label>
                <Input type="date" className="bg-slate-800 border-slate-700 text-white" value={form.dataValidade} onChange={e => setForm(p => ({ ...p, dataValidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Condição de Pagamento</Label>
                <Select value={form.condicaoPagamento} onValueChange={v => setForm(p => ({ ...p, condicaoPagamento: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {COND_PAG.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Prazo Entrega (dias)</Label>
                <Input type="number" min="0" className="bg-slate-800 border-slate-700 text-white" value={form.prazoEntregaDias} onChange={e => setForm(p => ({ ...p, prazoEntregaDias: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Observações</Label>
              <Textarea className="bg-slate-800 border-slate-700 text-white resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 font-semibold">Itens da Cotação *</Label>
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
                    <div className="flex gap-2">
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
                      <Input className="w-20 bg-slate-700 border-slate-600 text-white text-sm h-8" type="number" min="0" max="100" placeholder="Desc%" value={it.descontoPct} onChange={e => updateItem(idx, "descontoPct", e.target.value)} />
                      <div className="w-28 flex items-center text-green-400 text-sm font-medium">
                        {calcTotal(it).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <span className="text-slate-400 text-sm">Total: <span className="text-green-400 font-bold text-base">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criar.isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Cotação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe Cotação */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{detalhe?.numeroCotacao} — Detalhes</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : detalhe ? (() => {
            const forn = fornecedores.find(f => f.id === detalhe.fornecedorId);
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            return (
              <div className="space-y-5 pt-2">
                {(detalhe as any).descricao && (
                  <div className="text-slate-300 text-sm bg-slate-800 rounded-lg px-3 py-2">{(detalhe as any).descricao}</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-slate-800 rounded-lg p-3">
                  <div><span className="text-slate-400 text-xs">Fornecedor</span><p className="text-white font-medium">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.color}`}>{st.label}</span></p></div>
                  <div><span className="text-slate-400 text-xs">Cond. Pagamento</span><p className="text-white font-medium">{detalhe.condicaoPagamento || "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Prazo Entrega</span><p className="text-white font-medium">{detalhe.prazoEntregaDias ? `${detalhe.prazoEntregaDias} dias` : "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Validade</span><p className="text-white font-medium">{detalhe.dataValidade ? new Date(detalhe.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-slate-400 text-xs">Total</span><p className="text-green-400 font-bold">{parseFloat(detalhe.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                </div>

                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Descrição</TableHead>
                        <TableHead className="text-slate-400 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-slate-400 text-xs w-20">Qtd</TableHead>
                        <TableHead className="text-slate-400 text-xs w-28">Preço Unit.</TableHead>
                        <TableHead className="text-slate-400 text-xs w-16">Desc%</TableHead>
                        <TableHead className="text-slate-400 text-xs w-28">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detalhe.itens as any[]).map((it: any) => (
                        <TableRow key={it.id} className="border-slate-700">
                          <TableCell className="text-white text-sm">{it.descricao}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-slate-300 text-sm">{parseFloat(it.precoUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.descontoPct || "0")}%</TableCell>
                          <TableCell className="text-green-400 text-sm font-medium">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                  {detalhe.status === "pendente" && (
                    <>
                      <Button size="sm" onClick={() => gerarOC.mutate({ companyId, cotacaoId: detalhe.id })} disabled={gerarOC.isPending}
                        className="bg-green-700 hover:bg-green-600 text-white text-xs gap-1">
                        <CheckCircle className="h-3 w-3" /> Aprovar e Gerar OC
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: "recusada" })}
                        className="border-red-700 text-red-400 hover:bg-red-900/20 text-xs gap-1">
                        <X className="h-3 w-3" /> Recusar
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs ml-auto">
                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
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
