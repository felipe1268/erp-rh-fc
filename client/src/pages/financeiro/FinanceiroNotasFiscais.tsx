import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus, Search, FileText, ExternalLink, Edit2, Trash2, Eye,
  Link, Link2Off, CheckCircle, Clock, AlertTriangle, RefreshCw,
  Building2, Calendar, Banknote, Receipt, X, ChevronDown, ChevronUp,
} from "lucide-react";

function formatBRL(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function maskBRL(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(s: string | null | undefined) {
  if (!s) return "—";
  const t = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : t;
}

function isoToInput(s: string | null | undefined) {
  return s ? String(s).slice(0, 10) : "";
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:   { label: "Pendente",   color: "bg-amber-100 text-amber-800 border-amber-200" },
  recebida:   { label: "Recebida",   color: "bg-blue-100 text-blue-800 border-blue-200" },
  conciliada: { label: "Conciliada", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelada:  { label: "Cancelada",  color: "bg-red-100 text-red-700 border-red-200" },
};

type NF = {
  id: number;
  numeroNf: string;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao: string;
  dataCompetencia?: string | null;
  dataVencimento?: string | null;
  tomadorCnpj?: string | null;
  tomadorRazaoSocial?: string | null;
  obraId?: number | null;
  obraNome?: string | null;
  bmReferencia?: string | null;
  descricaoServico?: string | null;
  valorBruto: string;
  deducoesTotal?: string | null;
  baseCalculoIss?: string | null;
  aliquotaIss?: string | null;
  issRetido?: string | null;
  retencaoInss?: string | null;
  retencaoIrrf?: string | null;
  retencaoPisCofins?: string | null;
  valorLiquido: string;
  status: string;
  entryId?: number | null;
  stmtLineId?: number | null;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  observacoes?: string | null;
};

const emptyForm = (): Omit<NF, "id" | "status" | "createdAt" | "updatedAt"> => ({
  numeroNf: "",
  serie: "",
  chaveAcesso: "",
  dataEmissao: new Date().toISOString().slice(0, 10),
  dataCompetencia: "",
  dataVencimento: "",
  tomadorCnpj: "",
  tomadorRazaoSocial: "",
  obraId: null,
  obraNome: "",
  bmReferencia: "",
  descricaoServico: "",
  valorBruto: "0",
  deducoesTotal: "0",
  baseCalculoIss: null,
  aliquotaIss: null,
  issRetido: "0",
  retencaoInss: "0",
  retencaoIrrf: "0",
  retencaoPisCofins: "0",
  valorLiquido: "0",
  entryId: null,
  stmtLineId: null,
  arquivoUrl: "",
  arquivoNome: "",
  observacoes: "",
});

function calcValorLiquido(form: any) {
  const bruto = parseBRL(String(form.valorBruto || 0));
  const iss = parseBRL(String(form.issRetido || 0));
  const inss = parseBRL(String(form.retencaoInss || 0));
  const irrf = parseBRL(String(form.retencaoIrrf || 0));
  const pis = parseBRL(String(form.retencaoPisCofins || 0));
  return Math.max(0, bruto - iss - inss - irrf - pis);
}

export default function FinanceiroNotasFiscais() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSemVinculo, setFilterSemVinculo] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NF | null>(null);
  const [detalheNf, setDetalheNf] = useState<NF | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [tab, setTab] = useState<"dados" | "tributacao" | "vinculo">("dados");
  const [vincularEntryId, setVincularEntryId] = useState("");
  const [vincularStmtId, setVincularStmtId] = useState("");

  const listQuery = trpc.fiscalNotes.list.useQuery(
    {
      companyId: companyId ?? 0,
      search: search || undefined,
      status: filterStatus !== "todos" ? filterStatus : undefined,
      semVinculo: filterSemVinculo || undefined,
    },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const nfs: NF[] = useMemo(() => (listQuery.data ?? []) as NF[], [listQuery.data]);

  const criarMut = trpc.fiscalNotes.criar.useMutation({
    onSuccess: () => { toast({ title: "NF-e cadastrada!" }); setDialogOpen(false); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarMut = trpc.fiscalNotes.atualizar.useMutation({
    onSuccess: () => { toast({ title: "NF-e atualizada!" }); setDialogOpen(false); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const excluirMut = trpc.fiscalNotes.excluir.useMutation({
    onSuccess: () => { toast({ title: "NF-e cancelada." }); setDeleteTarget(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const vincularEntryMut = trpc.fiscalNotes.vincularLancamento.useMutation({
    onSuccess: () => { toast({ title: "Lançamento vinculado!" }); setDetalheNf(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const vincularStmtMut = trpc.fiscalNotes.vincularExtrato.useMutation({
    onSuccess: () => { toast({ title: "Extrato vinculado!" }); setDetalheNf(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setTab("dados");
    setDialogOpen(true);
  }

  function openEdit(nf: NF) {
    setEditingId(nf.id);
    setForm({
      ...nf,
      valorBruto: formatBRL(nf.valorBruto),
      deducoesTotal: formatBRL(nf.deducoesTotal),
      baseCalculoIss: nf.baseCalculoIss ? formatBRL(nf.baseCalculoIss) : "",
      issRetido: formatBRL(nf.issRetido),
      retencaoInss: formatBRL(nf.retencaoInss),
      retencaoIrrf: formatBRL(nf.retencaoIrrf),
      retencaoPisCofins: formatBRL(nf.retencaoPisCofins),
      valorLiquido: formatBRL(nf.valorLiquido),
    });
    setTab("dados");
    setDialogOpen(true);
  }

  function setF(key: string, val: any) { setForm((p: any) => ({ ...p, [key]: val })); }

  function handleMoneyBlur(key: string) {
    const v = parseBRL(String(form[key] || 0));
    setF(key, formatBRL(v));
    if (key !== "valorLiquido") {
      const liq = calcValorLiquido({ ...form, [key]: String(v) });
      setF("valorLiquido", formatBRL(liq));
    }
  }

  function handleSubmit() {
    if (!companyId) return;
    const payload = {
      companyId,
      numeroNf:           form.numeroNf,
      serie:              form.serie || null,
      chaveAcesso:        form.chaveAcesso || null,
      dataEmissao:        form.dataEmissao,
      dataCompetencia:    form.dataCompetencia || null,
      dataVencimento:     form.dataVencimento || null,
      tomadorCnpj:        form.tomadorCnpj || null,
      tomadorRazaoSocial: form.tomadorRazaoSocial || null,
      obraId:             form.obraId ?? null,
      obraNome:           form.obraNome || null,
      bmReferencia:       form.bmReferencia || null,
      descricaoServico:   form.descricaoServico || null,
      valorBruto:         parseBRL(String(form.valorBruto)),
      deducoesTotal:      parseBRL(String(form.deducoesTotal)),
      baseCalculoIss:     form.baseCalculoIss ? parseBRL(String(form.baseCalculoIss)) : null,
      aliquotaIss:        form.aliquotaIss ? parseFloat(String(form.aliquotaIss)) : null,
      issRetido:          parseBRL(String(form.issRetido)),
      retencaoInss:       parseBRL(String(form.retencaoInss)),
      retencaoIrrf:       parseBRL(String(form.retencaoIrrf)),
      retencaoPisCofins:  parseBRL(String(form.retencaoPisCofins)),
      valorLiquido:       parseBRL(String(form.valorLiquido)),
      arquivoUrl:         form.arquivoUrl || null,
      arquivoNome:        form.arquivoNome || null,
      observacoes:        form.observacoes || null,
    };
    if (editingId) {
      atualizarMut.mutate({ ...payload, id: editingId });
    } else {
      criarMut.mutate(payload);
    }
  }

  const isSaving = criarMut.isPending || atualizarMut.isPending;

  const totais = useMemo(() => {
    const pendente = nfs.filter(n => n.status === "pendente");
    const recebida = nfs.filter(n => n.status === "recebida");
    const conciliada = nfs.filter(n => n.status === "conciliada");
    const somarLiq = (arr: NF[]) => arr.reduce((s, n) => s + parseFloat(String(n.valorLiquido || 0)), 0);
    return {
      total: nfs.length,
      pendente: pendente.length,
      recebida: recebida.length,
      conciliada: conciliada.length,
      valorPendente: somarLiq(pendente),
      valorRecebida: somarLiq(recebida),
      valorConciliada: somarLiq(conciliada),
      valorTotal: somarLiq(nfs),
    };
  }, [nfs]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="h-6 w-6 text-indigo-600" />
              Notas Fiscais de Serviço (NFS-e)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">NFs emitidas pela FC Engenharia — controle e cruzamento com extrato</p>
          </div>
          <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Nova NF-e
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Pendentes", count: totais.pendente, valor: totais.valorPendente, color: "amber" },
            { label: "Recebidas", count: totais.recebida, valor: totais.valorRecebida, color: "blue" },
            { label: "Conciliadas", count: totais.conciliada, valor: totais.valorConciliada, color: "emerald" },
            { label: "Total NFs", count: totais.total, valor: totais.valorTotal, color: "slate" },
          ].map(k => (
            <Card key={k.label} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className={`text-xs font-medium text-${k.color}-600 mb-1`}>{k.label}</div>
                <div className="text-xl font-bold text-slate-900">{k.count}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatBRL(k.valor)}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar NF, tomador, obra..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
              <SelectItem value="conciliada">Conciliada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filterSemVinculo ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1"
            onClick={() => setFilterSemVinculo(v => !v)}
          >
            <Link2Off className="h-3.5 w-3.5" />
            Sem Lançamento
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => listQuery.refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Tabela */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left">NF</th>
                  <th className="px-3 py-2.5 text-left">Emissão</th>
                  <th className="px-3 py-2.5 text-left">Tomador</th>
                  <th className="px-3 py-2.5 text-left">Obra / BM</th>
                  <th className="px-3 py-2.5 text-right">Valor Bruto</th>
                  <th className="px-3 py-2.5 text-right">Valor Líquido</th>
                  <th className="px-3 py-2.5 text-left">Vencimento</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left">Vínculos</th>
                  <th className="px-3 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading && (
                  <tr><td colSpan={10} className="py-10 text-center text-slate-400">Carregando...</td></tr>
                )}
                {!listQuery.isLoading && nfs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-slate-300" />
                        <span className="text-slate-400 text-sm">Nenhuma nota fiscal encontrada.</span>
                        <Button size="sm" onClick={openNew} className="mt-2 gap-1">
                          <Plus className="h-3.5 w-3.5" /> Cadastrar NF-e
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {nfs.map(nf => {
                  const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
                  return (
                    <tr key={nf.id} className="border-b hover:bg-slate-50 transition-colors group">
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-indigo-700">#{nf.numeroNf}</span>
                        {nf.serie && <span className="text-xs text-slate-400 ml-1">/{nf.serie}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{fmtDateBR(nf.dataEmissao)}</td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <div className="truncate text-slate-800 font-medium" title={nf.tomadorRazaoSocial ?? ""}>
                          {nf.tomadorRazaoSocial ?? "—"}
                        </div>
                        {nf.tomadorCnpj && <div className="text-xs text-slate-400">{nf.tomadorCnpj}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700 text-xs">{nf.obraNome ?? "—"}</div>
                        {nf.bmReferencia && (
                          <div className="text-xs text-indigo-500 font-medium">{nf.bmReferencia}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatBRL(nf.valorBruto)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{formatBRL(nf.valorLiquido)}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{fmtDateBR(nf.dataVencimento)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          {nf.entryId
                            ? <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"><Link className="h-3 w-3" />Lan.{nf.entryId}</span>
                            : <span className="text-xs text-slate-300">— lançamento</span>
                          }
                          {nf.stmtLineId
                            ? <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded"><Link className="h-3 w-3" />Ext.{nf.stmtLineId}</span>
                            : null
                          }
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhe / Vincular"
                            onClick={() => { setDetalheNf(nf); setVincularEntryId(String(nf.entryId ?? "")); setVincularStmtId(String(nf.stmtLineId ?? "")); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar"
                            onClick={() => openEdit(nf)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {nf.arquivoUrl && (
                            <a href={nf.arquivoUrl} target="_blank" rel="noopener noreferrer">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver PDF">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {nf.status !== "cancelada" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" title="Cancelar"
                              onClick={() => setDeleteTarget(nf)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─── Dialog Cadastro/Edição ─── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-600" />
                {editingId ? `Editar NF-e #${form.numeroNf}` : "Nova Nota Fiscal de Serviço"}
              </DialogTitle>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex border-b gap-4 px-1 shrink-0">
              {(["dados", "tributacao", "vinculo"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t === "dados" ? "Dados Gerais" : t === "tributacao" ? "Tributação" : "Vínculo / Arquivo"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">

              {/* Tab: Dados Gerais */}
              {tab === "dados" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Label className="text-xs mb-1 block">Número NF *</Label>
                      <Input value={form.numeroNf} onChange={e => setF("numeroNf", e.target.value)} placeholder="55" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Série</Label>
                      <Input value={form.serie ?? ""} onChange={e => setF("serie", e.target.value)} placeholder="NE / 70000" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Data Emissão *</Label>
                      <Input type="date" value={isoToInput(form.dataEmissao)} onChange={e => setF("dataEmissao", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Competência</Label>
                      <Input type="date" value={isoToInput(form.dataCompetencia)} onChange={e => setF("dataCompetencia", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Vencimento</Label>
                      <Input type="date" value={isoToInput(form.dataVencimento)} onChange={e => setF("dataVencimento", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">CNPJ do Tomador</Label>
                      <Input value={form.tomadorCnpj ?? ""} onChange={e => setF("tomadorCnpj", e.target.value)} placeholder="00.000.000/0001-00" />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs mb-1 block">Razão Social do Tomador</Label>
                      <Input value={form.tomadorRazaoSocial ?? ""} onChange={e => setF("tomadorRazaoSocial", e.target.value)} placeholder="Nome do cliente..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Obra</Label>
                      <Input value={form.obraNome ?? ""} onChange={e => setF("obraNome", e.target.value)} placeholder="Nome da obra..." />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">BM (Boletim de Medição)</Label>
                      <Input value={form.bmReferencia ?? ""} onChange={e => setF("bmReferencia", e.target.value)} placeholder="BM 001, BM 002..." />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Descrição do Serviço</Label>
                    <Textarea value={form.descricaoServico ?? ""} onChange={e => setF("descricaoServico", e.target.value)}
                      placeholder="Descreva o serviço prestado..." rows={3} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Chave de Acesso NFS-e</Label>
                    <Input value={form.chaveAcesso ?? ""} onChange={e => setF("chaveAcesso", e.target.value)} placeholder="35 dígitos..." className="font-mono text-xs" />
                  </div>
                </>
              )}

              {/* Tab: Tributação */}
              {tab === "tributacao" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Valor Bruto do Serviço *</Label>
                      <Input
                        value={form.valorBruto}
                        onChange={e => setF("valorBruto", e.target.value)}
                        onBlur={() => handleMoneyBlur("valorBruto")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Deduções (Material / BC ISSQN)</Label>
                      <Input
                        value={form.deducoesTotal}
                        onChange={e => setF("deducoesTotal", e.target.value)}
                        onBlur={() => handleMoneyBlur("deducoesTotal")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">ISS Retido (5%)</Label>
                      <Input
                        value={form.issRetido}
                        onChange={e => setF("issRetido", e.target.value)}
                        onBlur={() => handleMoneyBlur("issRetido")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">INSS Retido</Label>
                      <Input
                        value={form.retencaoInss}
                        onChange={e => setF("retencaoInss", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoInss")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">IRRF Retido</Label>
                      <Input
                        value={form.retencaoIrrf}
                        onChange={e => setF("retencaoIrrf", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoIrrf")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">PIS/COFINS Retidos</Label>
                      <Input
                        value={form.retencaoPisCofins}
                        onChange={e => setF("retencaoPisCofins", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoPisCofins")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <Label className="text-xs font-medium text-emerald-700 block mb-0.5">Valor Líquido (entra no banco)</Label>
                      <div className="text-xl font-bold text-emerald-700">{form.valorLiquido}</div>
                      <p className="text-xs text-emerald-500 mt-0.5">Bruto − ISS − INSS − IRRF − PIS/COFINS</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Observações</Label>
                    <Textarea value={form.observacoes ?? ""} onChange={e => setF("observacoes", e.target.value)} rows={2} />
                  </div>
                </>
              )}

              {/* Tab: Vínculo / Arquivo */}
              {tab === "vinculo" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs mb-1 block">URL do PDF da NF-e</Label>
                    <Input value={form.arquivoUrl ?? ""} onChange={e => setF("arquivoUrl", e.target.value)} placeholder="https://..." />
                    <p className="text-xs text-slate-400 mt-1">Cole a URL pública do PDF ou do upload.</p>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Nome do Arquivo</Label>
                    <Input value={form.arquivoNome ?? ""} onChange={e => setF("arquivoNome", e.target.value)} placeholder="NF_055_NOVA_PLANTA.pdf" />
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-sm text-blue-700">
                    <strong>Dica:</strong> Após salvar a NF, use o botão <Eye className="inline h-3.5 w-3.5 mx-0.5" /> na lista para vincular a um lançamento financeiro ou linha do extrato bancário.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isSaving || !form.numeroNf || !form.dataEmissao} className="gap-2">
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {editingId ? "Salvar Alterações" : "Cadastrar NF-e"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Dialog Detalhe / Vínculos ─── */}
        {detalheNf && (
          <Dialog open={!!detalheNf} onOpenChange={v => !v && setDetalheNf(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-indigo-600" />
                  NF-e #{detalheNf.numeroNf} — Detalhes e Vínculos
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Resumo */}
                <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-2 border">
                  <div><span className="text-slate-500 text-xs">Tomador</span><div className="font-medium truncate">{detalheNf.tomadorRazaoSocial ?? "—"}</div></div>
                  <div><span className="text-slate-500 text-xs">Emissão</span><div>{fmtDateBR(detalheNf.dataEmissao)}</div></div>
                  <div><span className="text-slate-500 text-xs">Valor Bruto</span><div className="font-medium">{formatBRL(detalheNf.valorBruto)}</div></div>
                  <div><span className="text-slate-500 text-xs">Valor Líquido</span><div className="font-bold text-emerald-700">{formatBRL(detalheNf.valorLiquido)}</div></div>
                  {detalheNf.bmReferencia && <div className="col-span-2"><span className="text-slate-500 text-xs">Referência</span><div>{detalheNf.obraNome} — {detalheNf.bmReferencia}</div></div>}
                </div>

                {/* Vínculo com Lançamento */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Lançamento Financeiro (ID)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={vincularEntryId}
                      onChange={e => setVincularEntryId(e.target.value)}
                      placeholder="ID do lançamento..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => vincularEntryMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, entryId: vincularEntryId ? parseInt(vincularEntryId) : null })}
                      disabled={vincularEntryMut.isPending}
                      variant={vincularEntryId ? "default" : "outline"}
                      className="gap-1 shrink-0"
                    >
                      {vincularEntryId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                      {vincularEntryId ? "Vincular" : "Desvincular"}
                    </Button>
                  </div>
                  {detalheNf.entryId && (
                    <p className="text-xs text-blue-600">Atualmente vinculado ao Lançamento #{detalheNf.entryId}</p>
                  )}
                </div>

                {/* Vínculo com Extrato */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Linha do Extrato Bancário (ID)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={vincularStmtId}
                      onChange={e => setVincularStmtId(e.target.value)}
                      placeholder="ID da linha do extrato..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => vincularStmtMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, stmtLineId: vincularStmtId ? parseInt(vincularStmtId) : null })}
                      disabled={vincularStmtMut.isPending}
                      variant={vincularStmtId ? "default" : "outline"}
                      className="gap-1 shrink-0"
                    >
                      {vincularStmtId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                      {vincularStmtId ? "Vincular" : "Desvincular"}
                    </Button>
                  </div>
                  {detalheNf.stmtLineId && (
                    <p className="text-xs text-violet-600">Atualmente vinculada ao Extrato #{detalheNf.stmtLineId}</p>
                  )}
                </div>

                {detalheNf.arquivoUrl && (
                  <a href={detalheNf.arquivoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2 w-full">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF da NF-e
                    </Button>
                  </a>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetalheNf(null)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── AlertDialog Cancelar NF ─── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar NF-e #{deleteTarget?.numeroNf}?</AlertDialogTitle>
              <AlertDialogDescription>
                A nota será marcada como <strong>cancelada</strong>. Nenhum dado será excluído.
                Valor líquido: {formatBRL(deleteTarget?.valorLiquido)} — Tomador: {deleteTarget?.tomadorRazaoSocial ?? "—"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Não cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && excluirMut.mutate({ id: deleteTarget.id, companyId: companyId! })}
              >
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </DashboardLayout>
  );
}
