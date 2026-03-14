import { useState, useMemo } from "react";
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
import {
  Plus, Search, Trash2, ClipboardList, ChevronRight, Loader2, X,
  CheckCircle2, XCircle, Clock, AlertTriangle, Package,
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  rascunho:  { label: "Rascunho",    bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/30" },
  pendente:  { label: "Pendente",    bg: "bg-amber-500/20",  text: "text-amber-300",  border: "border-amber-500/30" },
  cotacao:   { label: "Em Cotação",  bg: "bg-blue-500/20",   text: "text-blue-300",   border: "border-blue-500/30" },
  aprovado:  { label: "Concluído",   bg: "bg-emerald-500/20",text: "text-emerald-300",border: "border-emerald-500/30" },
  recusado:  { label: "Recusado",    bg: "bg-red-500/20",    text: "text-red-300",    border: "border-red-500/30" },
  cancelado: { label: "Cancelado",   bg: "bg-slate-600/20",  text: "text-slate-400",  border: "border-slate-600/30" },
};

const APROV_CFG: Record<string, { label: string; icon: JSX.Element; color: string }> = {
  aguardando: { label: "Aguardando", icon: <Clock className="h-3 w-3" />,        color: "text-amber-400" },
  aprovado:   { label: "Aprovado",   icon: <CheckCircle2 className="h-3 w-3" />, color: "text-emerald-400" },
  recusado:   { label: "Recusado",   icon: <XCircle className="h-3 w-3" />,      color: "text-red-400" },
};

const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];
const PRIORIDADE_CFG: Record<string, string> = {
  baixa: "text-slate-400", normal: "text-blue-400", alta: "text-amber-400", urgente: "text-red-400"
};
const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface ItemForm { descricao: string; unidade: string; quantidade: string; observacoes: string; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", observacoes: "" });

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>{c.label}</span>;
}

function AprovBadge({ status }: { status: string | null }) {
  const s = status ?? "aguardando";
  const c = APROV_CFG[s] ?? APROV_CFG.aguardando;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.color}`}>{c.icon}{c.label}</span>;
}

export default function Solicitacoes() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);

  const [form, setForm] = useState({
    titulo: "", departamento: "", projetoId: "", dataNecessidade: "", prioridade: "normal", observacoes: ""
  });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);
  const [recebQtd, setRecebQtd] = useState<Record<number, string>>({});

  const q = trpc.compras.listarSolicitacoes.useQuery(
    { companyId, busca: busca || undefined, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getSolicitacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const projetosQ = trpc.planejamento.listarProjetos.useQuery({ companyId }, { enabled: companyId > 0 });

  const criar = trpc.compras.criarSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovar = trpc.compras.aprovarSolicitacao.useMutation({
    onSuccess: () => { toast.success("Aprovação registrada!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const receber = trpc.compras.registrarRecebimentoItem.useMutation({
    onSuccess: (res: any) => { toast.success("Recebimento registrado!"); detalheQ.refetch(); q.refetch(); },
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

  function resetForm() {
    setForm({ titulo: "", departamento: "", projetoId: "", dataNecessidade: "", prioridade: "normal", observacoes: "" });
    setItens([newItem()]);
  }

  function handleSalvar() {
    const validos = itens.filter(i => i.descricao.trim());
    if (!form.titulo.trim()) return toast.error("Informe o título da solicitação.");
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");
    criar.mutate({
      companyId,
      solicitanteId: user?.id ? parseInt(String(user.id)) : undefined,
      titulo: form.titulo,
      departamento: form.departamento || undefined,
      projetoId: (form.projetoId && form.projetoId !== "none") ? parseInt(form.projetoId) : undefined,
      dataNecessidade: form.dataNecessidade || undefined,
      prioridade: form.prioridade,
      observacoes: form.observacoes || undefined,
      itens: validos.map(i => ({ descricao: i.descricao, unidade: i.unidade, quantidade: parseFloat(i.quantidade) || 1, observacoes: i.observacoes || undefined })),
    });
  }

  const lista = q.data ?? [];
  const detalhe = detalheQ.data;
  const projetos = projetosQ.data ?? [];

  // KPIs
  const kpis = useMemo(() => {
    const all = lista;
    return {
      pendente:  all.filter(r => r.status === "pendente").length,
      cotacao:   all.filter(r => r.status === "cotacao").length,
      aprovado:  all.filter(r => r.status === "aprovado").length,
      recusado:  all.filter(r => r.status === "recusado" || r.status === "cancelado").length,
    };
  }, [lista]);

  function nomeProjeto(id: number | null | undefined) {
    if (!id) return null;
    return projetos.find((p: any) => p.id === id)?.nome ?? null;
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ClipboardList className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Solicitações de Compra</h1>
            <p className="text-sm text-slate-400">Requisições internas de materiais e serviços</p>
          </div>
        </div>
        <Button onClick={() => setShowNova(true)} className="bg-amber-600 hover:bg-amber-500 text-white gap-2">
          <Plus className="h-4 w-4" /> Nova SC
        </Button>
      </div>

      {/* KPI badges */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Pendente",    count: kpis.pendente,  color: "bg-amber-500/10 border-amber-500/20 text-amber-300",   key: "pendente" },
          { label: "Em Cotação", count: kpis.cotacao,   color: "bg-blue-500/10 border-blue-500/20 text-blue-300",       key: "cotacao" },
          { label: "Concluído",  count: kpis.aprovado,  color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300", key: "aprovado" },
          { label: "Recusado",   count: kpis.recusado,  color: "bg-red-500/10 border-red-500/20 text-red-300",           key: "recusado" },
        ].map(k => (
          <button key={k.key}
            onClick={() => setFiltroStatus(filtroStatus === k.key ? "todos" : k.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${k.color} ${filtroStatus === k.key ? "ring-1 ring-offset-1 ring-offset-slate-900" : "opacity-70 hover:opacity-100"}`}>
            <span className="text-xl font-bold">{k.count}</span>
            <span>{k.label}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Buscar por número, título, setor..." className="pl-9 bg-slate-800 border-slate-700 text-white" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button onClick={() => setFiltroStatus("todos")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === "todos" ? "bg-amber-600 border-amber-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>
          Todos
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent">
              <TableHead className="text-slate-400 text-xs">Número</TableHead>
              <TableHead className="text-slate-400 text-xs">Título / Setor</TableHead>
              <TableHead className="text-slate-400 text-xs">Projeto</TableHead>
              <TableHead className="text-slate-400 text-xs">Necessidade</TableHead>
              <TableHead className="text-slate-400 text-xs">Recebido</TableHead>
              <TableHead className="text-slate-400 text-xs">Aprovação</TableHead>
              <TableHead className="text-slate-400 text-xs">Status</TableHead>
              <TableHead className="text-slate-400 text-xs w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-500">Nenhuma solicitação encontrada</TableCell></TableRow>
            ) : lista.map((sc: any) => {
              const itC = sc._itens ?? { total: 0, atendidos: 0 };
              const pct = itC.total > 0 ? Math.round((itC.atendidos / itC.total) * 100) : 0;
              return (
                <TableRow key={sc.id} className="border-slate-700 hover:bg-slate-800/50 cursor-pointer" onClick={() => setShowDetalhe(sc.id)}>
                  <TableCell className="text-white font-mono font-semibold text-xs">{sc.numeroSc}</TableCell>
                  <TableCell>
                    <div className="text-white text-sm font-medium">{sc.titulo || "—"}</div>
                    {sc.departamento && <div className="text-slate-500 text-xs">{sc.departamento}</div>}
                    {sc.prioridade && sc.prioridade !== "normal" && (
                      <span className={`text-[10px] font-semibold uppercase ${PRIORIDADE_CFG[sc.prioridade] ?? "text-slate-400"}`}>{sc.prioridade}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-400 text-xs">{nomeProjeto(sc.projetoId) ?? "—"}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{sc.dataNecessidade ? new Date(sc.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    {itC.total > 0 ? (
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{itC.atendidos}/{itC.total}</span>
                      </div>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </TableCell>
                  <TableCell><AprovBadge status={sc.aprovacaoStatus} /></TableCell>
                  <TableCell><StatusBadge status={sc.status} /></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-slate-500" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog Nova SC ─────────────────────────────────────────── */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Solicitação de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Título + Projeto */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300 text-xs">Título da Solicitação *</Label>
                <Input className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Materiais de alvenaria - Bloco A" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Projeto / Obra</Label>
                <Select value={form.projetoId} onValueChange={v => setForm(p => ({ ...p, projetoId: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {projetos.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Setor / Departamento</Label>
                <Input className="bg-slate-800 border-slate-700 text-white" placeholder="Ex: Obras, Administrativo..." value={form.departamento} onChange={e => setForm(p => ({ ...p, departamento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Data de Necessidade</Label>
                <Input type="date" className="bg-slate-800 border-slate-700 text-white" value={form.dataNecessidade} onChange={e => setForm(p => ({ ...p, dataNecessidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {PRIORIDADES.map(p => <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300 text-xs">Observações</Label>
                <Textarea className="bg-slate-800 border-slate-700 text-white resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 font-semibold text-xs">Itens Solicitados *</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setItens(p => [...p, newItem()])} className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs h-7 px-2">
                  <Plus className="h-3 w-3" /> Item
                </Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-start p-2.5 rounded-lg bg-slate-800 border border-slate-700">
                    <div className="flex-1 space-y-1.5">
                      <Input className="bg-slate-700 border-slate-600 text-white text-sm h-8" placeholder="Descrição do item *" value={it.descricao} onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} />
                      <div className="flex gap-2">
                        <Select value={it.unidade} onValueChange={v => setItens(p => p.map((x, i) => i === idx ? { ...x, unidade: v } : x))}>
                          <SelectTrigger className="w-20 bg-slate-700 border-slate-600 text-white text-sm h-7"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="w-24 bg-slate-700 border-slate-600 text-white text-sm h-7" type="number" min="0.001" step="0.001" placeholder="Qtd" value={it.quantidade} onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))} />
                        <Input className="flex-1 bg-slate-700 border-slate-600 text-white text-sm h-7" placeholder="Obs..." value={it.observacoes} onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, observacoes: e.target.value } : x))} />
                      </div>
                    </div>
                    {itens.length > 1 && (
                      <button onClick={() => setItens(p => p.filter((_, i) => i !== idx))} className="p-1 text-slate-500 hover:text-red-400 mt-0.5"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criar.isPending} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Solicitação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Detalhe SC ─────────────────────────────────────── */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => { if (!v) { setShowDetalhe(null); setRecebQtd({}); } }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl max-h-[90vh] overflow-y-auto">
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : detalhe ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-widest mb-0.5">Solicitação de Compra</div>
                    <DialogTitle className="text-white text-lg">{detalhe.numeroSc}</DialogTitle>
                    {detalhe.titulo && <p className="text-slate-300 text-sm mt-0.5">{detalhe.titulo}</p>}
                  </div>
                  <StatusBadge status={detalhe.status} />
                </div>
              </DialogHeader>

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-800 rounded-lg p-3">
                {[
                  { label: "Projeto", value: nomeProjeto(detalhe.projetoId) ?? "—" },
                  { label: "Setor", value: detalhe.departamento || "—" },
                  { label: "Necessidade", value: detalhe.dataNecessidade ? new Date(detalhe.dataNecessidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Prioridade", value: detalhe.prioridade ? (detalhe.prioridade.charAt(0).toUpperCase() + detalhe.prioridade.slice(1)) : "Normal" },
                  { label: "Criado em", value: new Date(detalhe.criadoEm).toLocaleDateString("pt-BR") },
                ].map(f => (
                  <div key={f.label}>
                    <span className="text-slate-500">{f.label}</span>
                    <p className="text-white mt-0.5 font-medium">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Widget de Aprovação */}
              <div className="border border-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Aprovação</span>
                  <AprovBadge status={detalhe.aprovacaoStatus} />
                </div>
                <div className="flex gap-2">
                  {[
                    { key: "aguardando", label: "Aguardando", cls: "border-amber-700 text-amber-300 hover:bg-amber-900/30" },
                    { key: "aprovado",   label: "✓ Aprovar",  cls: "border-emerald-700 text-emerald-300 hover:bg-emerald-900/30" },
                    { key: "recusado",   label: "✗ Recusar",  cls: "border-red-700 text-red-300 hover:bg-red-900/30" },
                  ].map(opt => (
                    <Button key={opt.key} size="sm" variant="outline"
                      onClick={() => aprovar.mutate({ id: detalhe.id, aprovacaoStatus: opt.key, aprovadorId: user?.id ? parseInt(String(user.id)) : undefined })}
                      disabled={aprovar.isPending || detalhe.aprovacaoStatus === opt.key}
                      className={`flex-1 text-xs h-8 border ${opt.cls} ${detalhe.aprovacaoStatus === opt.key ? "opacity-50 cursor-not-allowed" : ""}`}>
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              {detalhe.observacoes && (
                <div className="text-sm text-slate-400 bg-slate-800 rounded p-3">{detalhe.observacoes}</div>
              )}

              {/* Itens com recebimento */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-slate-300 font-semibold text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" /> Itens ({detalhe.itens.length})
                  </h3>
                </div>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Descrição</TableHead>
                        <TableHead className="text-slate-400 text-xs w-14">Un.</TableHead>
                        <TableHead className="text-slate-400 text-xs w-20">Solicitado</TableHead>
                        <TableHead className="text-slate-400 text-xs w-28">Recebido</TableHead>
                        <TableHead className="text-slate-400 text-xs w-24">Status</TableHead>
                        <TableHead className="text-slate-400 text-xs w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.itens.map((it: any) => {
                        const qtdAtend = parseFloat(it.quantidadeAtendida || "0");
                        const qtdTotal = parseFloat(it.quantidade);
                        const pct = qtdTotal > 0 ? Math.min(100, Math.round((qtdAtend / qtdTotal) * 100)) : 0;
                        const statusIt = it.statusItem ?? "pendente";
                        const statusColor = statusIt === "recebido" ? "text-emerald-400" : statusIt === "recebido_parcial" ? "text-amber-400" : "text-slate-500";
                        const statusLabel = statusIt === "recebido" ? "Recebido" : statusIt === "recebido_parcial" ? "Parcial" : "Pendente";
                        const inputVal = recebQtd[it.id] ?? "";
                        return (
                          <TableRow key={it.id} className="border-slate-700">
                            <TableCell className="text-white text-sm">{it.descricao}</TableCell>
                            <TableCell className="text-slate-400 text-sm">{it.unidade || "un"}</TableCell>
                            <TableCell className="text-slate-300 text-sm font-mono">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-slate-400">{qtdAtend}/{qtdTotal}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className={`text-xs font-medium ${statusColor}`}>{statusLabel}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 items-center">
                                <Input
                                  className="w-16 h-6 text-xs bg-slate-700 border-slate-600 text-white text-center px-1"
                                  type="number" min="0" step="0.001" max={String(qtdTotal)}
                                  placeholder={String(qtdAtend || "")}
                                  value={inputVal}
                                  onChange={e => setRecebQtd(p => ({ ...p, [it.id]: e.target.value }))}
                                />
                                <Button size="sm" className="h-6 px-2 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white"
                                  disabled={!inputVal || receber.isPending}
                                  onClick={() => {
                                    const v = parseFloat(inputVal);
                                    if (isNaN(v) || v < 0) return;
                                    receber.mutate({ itemId: it.id, solicitacaoId: detalhe.id, quantidadeAtendida: v });
                                    setRecebQtd(p => ({ ...p, [it.id]: "" }));
                                  }}>
                                  OK
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Ações */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                {(detalhe.status === "pendente" || detalhe.status === "rascunho") && (
                  <Button size="sm" variant="outline" onClick={() => cancelar.mutate({ id: detalhe.id, status: "cancelado" })}
                    className="border-red-700 text-red-400 hover:bg-red-900/20 text-xs">
                    <X className="h-3 w-3 mr-1" /> Cancelar SC
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                  className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs ml-auto">
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
