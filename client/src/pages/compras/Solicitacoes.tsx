import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Trash2, Eye, ClipboardList, ChevronRight, Loader2, X } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho:  { label: "Rascunho",    color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  pendente:  { label: "Pendente",    color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  cotacao:   { label: "Em Cotação",  color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  aprovado:  { label: "Aprovado",    color: "bg-green-500/20 text-green-300 border-green-500/30" },
  recusado:  { label: "Recusado",    color: "bg-red-500/20 text-red-300 border-red-500/30" },
  cancelado: { label: "Cancelado",   color: "bg-slate-600/20 text-slate-400 border-slate-600/30" },
};

const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface ItemForm { descricao: string; unidade: string; quantidade: string; observacoes: string; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", observacoes: "" });

export default function Solicitacoes() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({ departamento: "", dataNecessidade: "", observacoes: "" });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);

  const q = trpc.compras.listarSolicitacoes.useQuery({ companyId, busca: busca || undefined, status: filtroStatus === "todos" ? undefined : filtroStatus }, { enabled: companyId > 0 });
  const detalheQ = trpc.compras.getSolicitacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });

  const criar = trpc.compras.criarSolicitacao.useMutation({
    onSuccess: () => { toast.success("Solicitação criada com sucesso!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusSolicitacao.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirSolicitacao.useMutation({
    onSuccess: () => { toast.success("Solicitação excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setForm({ departamento: "", dataNecessidade: "", observacoes: "" });
    setItens([newItem()]);
  }

  function handleSalvar() {
    const validos = itens.filter(i => i.descricao.trim());
    if (!form.departamento.trim()) return toast.error("Informe o departamento/setor solicitante.");
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");
    criar.mutate({
      companyId,
      solicitanteId: user?.id ? parseInt(String(user.id)) : undefined,
      departamento: form.departamento,
      dataNecessidade: form.dataNecessidade || undefined,
      observacoes: form.observacoes || undefined,
      itens: validos.map(i => ({ descricao: i.descricao, unidade: i.unidade, quantidade: parseFloat(i.quantidade) || 1, observacoes: i.observacoes || undefined })),
    });
  }

  function addItem() { setItens(p => [...p, newItem()]); }
  function removeItem(idx: number) { setItens(p => p.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItens(p => p.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const lista = q.data ?? [];
  const detalhe = detalheQ.data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ClipboardList className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Solicitações de Compra</h1>
            <p className="text-sm text-slate-400">Gerencie requisições internas de materiais e serviços</p>
          </div>
        </div>
        <Button onClick={() => setShowNova(true)} className="bg-amber-600 hover:bg-amber-500 text-white gap-2">
          <Plus className="h-4 w-4" /> Nova SC
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar por número, setor..." className="pl-9 bg-slate-800 border-slate-700 text-white" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "pendente", "cotacao", "aprovado", "cancelado"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s ? "bg-amber-600 border-amber-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>
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
              <TableHead className="text-slate-400">Número</TableHead>
              <TableHead className="text-slate-400">Setor / Departamento</TableHead>
              <TableHead className="text-slate-400">Data Necessidade</TableHead>
              <TableHead className="text-slate-400">Itens</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Criado em</TableHead>
              <TableHead className="text-slate-400 w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-500">Nenhuma solicitação encontrada</TableCell></TableRow>
            ) : lista.map(sc => {
              const st = STATUS_LABELS[sc.status] ?? STATUS_LABELS.pendente;
              return (
                <TableRow key={sc.id} className="border-slate-700 hover:bg-slate-800/50 cursor-pointer" onClick={() => setShowDetalhe(sc.id)}>
                  <TableCell className="text-white font-mono font-semibold">{sc.numeroSc}</TableCell>
                  <TableCell className="text-slate-300">{sc.departamento || "—"}</TableCell>
                  <TableCell className="text-slate-400">{sc.dataNecessidade ? new Date(sc.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-slate-400">—</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>{st.label}</span>
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">{new Date(sc.criadoEm).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-slate-500" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Nova SC */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Solicitação de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Setor / Departamento *</Label>
                <Input className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Obras, Administrativo..." value={form.departamento} onChange={e => setForm(p => ({ ...p, departamento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Data de Necessidade</Label>
                <Input type="date" className="bg-slate-800 border-slate-700 text-white" value={form.dataNecessidade} onChange={e => setForm(p => ({ ...p, dataNecessidade: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Observações</Label>
              <Textarea className="bg-slate-800 border-slate-700 text-white resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 font-semibold">Itens Solicitados *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-start p-3 rounded-lg bg-slate-800 border border-slate-700">
                    <div className="flex-1 space-y-2">
                      <Input className="bg-slate-700 border-slate-600 text-white text-sm" placeholder="Descrição do item *" value={it.descricao} onChange={e => updateItem(idx, "descricao", e.target.value)} />
                      <div className="flex gap-2">
                        <Select value={it.unidade} onValueChange={v => updateItem(idx, "unidade", v)}>
                          <SelectTrigger className="w-24 bg-slate-700 border-slate-600 text-white text-sm h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="w-28 bg-slate-700 border-slate-600 text-white text-sm h-8" type="number" min="0.001" step="0.001" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(idx, "quantidade", e.target.value)} />
                        <Input className="flex-1 bg-slate-700 border-slate-600 text-white text-sm h-8" placeholder="Obs..." value={it.observacoes} onChange={e => updateItem(idx, "observacoes", e.target.value)} />
                      </div>
                    </div>
                    {itens.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="p-1 text-slate-500 hover:text-red-400 mt-1"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criar.isPending} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Solicitação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {detalhe?.numeroSc} — Detalhes da SC
            </DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : detalhe ? (
            <div className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400">Setor:</span> <span className="text-white ml-2">{detalhe.departamento || "—"}</span></div>
                <div><span className="text-slate-400">Status:</span> <span className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs border ${STATUS_LABELS[detalhe.status]?.color}`}>{STATUS_LABELS[detalhe.status]?.label}</span></div>
                <div><span className="text-slate-400">Data necessidade:</span> <span className="text-white ml-2">{detalhe.dataNecessidade ? new Date(detalhe.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span></div>
                <div><span className="text-slate-400">Criado em:</span> <span className="text-white ml-2">{new Date(detalhe.criadoEm).toLocaleDateString("pt-BR")}</span></div>
              </div>
              {detalhe.observacoes && <p className="text-sm text-slate-400 bg-slate-800 rounded p-3">{detalhe.observacoes}</p>}

              <div className="space-y-2">
                <h3 className="text-slate-300 font-semibold text-sm">Itens ({detalhe.itens.length})</h3>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Descrição</TableHead>
                        <TableHead className="text-slate-400 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-slate-400 text-xs w-20">Qtd</TableHead>
                        <TableHead className="text-slate-400 text-xs w-24">Atendido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.itens.map((it: any) => (
                        <TableRow key={it.id} className="border-slate-700">
                          <TableCell className="text-white text-sm">{it.descricao}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{parseFloat(it.quantidadeAtendida || "0").toLocaleString("pt-BR")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Ações de status */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                {detalhe.status === "pendente" && (
                  <Button size="sm" variant="outline" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: "cancelado" })}
                    className="border-red-700 text-red-400 hover:bg-red-900/20 text-xs">
                    <X className="h-3 w-3 mr-1" /> Cancelar SC
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { excluir.mutate({ id: detalhe.id }); }}
                  className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs ml-auto">
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
