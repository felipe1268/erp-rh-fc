import { useState, useMemo, useEffect, type ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Search, Building2, CheckCircle, Clock,
  AlertTriangle, TrendingUp, Plus, Paperclip, Trash2, RotateCcw, Loader2,
  HandCoins, Users, Wallet, CalendarDays,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function formatCompactBRL(v: number) {
  if (!v) return "—";
  if (Math.abs(v) < 1000) return formatBRL(v);
  return "R$ " + new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}
function fmtDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const s = String(dateStr).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join("/");
  return s;
}
function num(v: any): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Rev. 3003 — sempre fatiar para "YYYY-MM-DD" antes de parsear: timestamps PG
// quebram new Date() no iOS Safari ("The string did not match the expected pattern").
function getMesFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  a_receber:        { label: "A receber",  cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  recebido_parcial: { label: "Parcial",    cls: "bg-blue-50 text-blue-700 border-blue-200",   dot: "bg-blue-500" },
  recebido:         { label: "Recebido",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

function KCard({ label, value, sub, icon, ring }: { label: string; value: string; sub?: ReactNode; icon: ReactNode; ring: string }) {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${ring}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
          <p className="text-xl font-bold text-slate-800 leading-tight tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceiroContasAReceberTitulos() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [clienteFiltro, setClienteFiltro] = useState<string>("todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showBaixa, setShowBaixa] = useState<any>(null);
  const [showNovo, setShowNovo] = useState(false);
  const [showAnexo, setShowAnexo] = useState<any>(null);

  const { data: titulos, isLoading, refetch } = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  const { data: clientesList } = (trpc as any).clientes.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: contasBancarias } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const clientesOpts: { id: number; nome: string }[] = useMemo(() => {
    const list: any[] = Array.isArray(clientesList) ? clientesList : [];
    return list.map((c) => ({ id: c.id, nome: (c.nomeFantasia || c.razaoSocial || `Cliente ${c.id}`).trim() }));
  }, [clientesList]);

  const linhas: any[] = useMemo(() => (Array.isArray(titulos) ? titulos : []), [titulos]);

  const clienteNomes = useMemo(() => {
    const s = new Set<string>();
    for (const t of linhas) s.add((t.clienteNome || "Sem cliente").trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  // Rev. 3003 — status por mês (bolinha): verde=consolidado (tudo recebido),
  // azul=lançamento (há título em aberto), cinza=sem dados. Vencimento manda no mês.
  const mesesStatus: Record<number, MesStatus> = useMemo(() => {
    const map: Record<number, MesStatus> = {};
    for (let m = 1; m <= 12; m++) map[m] = "sem_dados";
    for (const t of linhas) {
      const m = getMesFromDate(t.dataVencimento);
      if (!m) continue;
      const cur = map[m];
      const isRecebido = t.status === "recebido";
      if (cur === "sem_dados") map[m] = isRecebido ? "consolidado" : "lancamento";
      else if (cur === "consolidado" && !isRecebido) map[m] = "lancamento";
    }
    return map;
  }, [linhas]);

  // Rev. 3004 — valor em aberto por mês (compacto no pill da barra de meses)
  const mesesValor: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    for (const t of linhas) {
      const m = getMesFromDate(t.dataVencimento);
      if (!m || t.status === "recebido") continue;
      map[m] += Math.max(0, num(t.valorPrevisto) - num(t.valorRealizado));
    }
    return map;
  }, [linhas]);

  // Rev. 3004 — resumo do ANO p/ o hero (total, recebido, aberto, % progresso)
  const anoResumo = useMemo(() => {
    let total = 0, recebido = 0, aberto = 0;
    for (const t of linhas) {
      const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
      total += prev;
      recebido += t.status === "recebido" ? (real || prev) : real;
      aberto += t.status === "recebido" ? 0 : Math.max(0, prev - real);
    }
    const pct = total > 0 ? Math.min(100, Math.round((recebido / total) * 100)) : 0;
    return { total, recebido, aberto, pct };
  }, [linhas]);

  const mesData = useMemo(
    () => linhas.filter((t) => getMesFromDate(t.dataVencimento) === mesSel),
    [linhas, mesSel],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mesData.filter((t) => {
      if (statusFiltro !== "todos" && t.status !== statusFiltro) return false;
      const cli = (t.clienteNome || "Sem cliente").trim();
      if (clienteFiltro !== "todos" && cli !== clienteFiltro) return false;
      if (q) {
        const hay = `${t.descricao ?? ""} ${t.obraNome ?? ""} ${cli} ${t.origemDescricao ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mesData, busca, statusFiltro, clienteFiltro]);

  // KPIs do MÊS selecionado (respeita os filtros aplicados)
  const kpis = useMemo(() => {
    let abertoMes = 0, recebidoMes = 0, parcialMes = 0;
    for (const t of filtradas) {
      const prev = num(t.valorPrevisto);
      const real = num(t.valorRealizado);
      if (t.status === "recebido") { recebidoMes += real || prev; continue; }
      abertoMes += Math.max(0, prev - real);
      if (t.status === "recebido_parcial") parcialMes += real;
    }
    return { abertoMes, recebidoMes, parcialMes };
  }, [filtradas]);

  // Acumulado do ANO (todos os meses) — saldo em aberto e vencidos
  const acum = useMemo(() => {
    let aberto = 0, vencido = 0, qtdVenc = 0;
    for (const t of linhas) {
      if (t.status === "recebido") continue;
      const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
      const saldo = Math.max(0, prev - real);
      aberto += saldo;
      if (num(t.diasAtraso) > 0) { vencido += saldo; qtdVenc++; }
    }
    return { aberto, vencido, qtdVenc };
  }, [linhas]);

  // Agrupa por cliente
  const grupos = useMemo(() => {
    const map = new Map<string, { cliente: string; itens: any[]; total: number; aberto: number; recebido: number }>();
    for (const t of filtradas) {
      const cli = (t.clienteNome || "Sem cliente").trim();
      if (!map.has(cli)) map.set(cli, { cliente: cli, itens: [], total: 0, aberto: 0, recebido: 0 });
      const g = map.get(cli)!;
      g.itens.push(t);
      const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
      g.total += prev;
      if (t.status === "recebido") { g.recebido += real || prev; }
      else { g.aberto += Math.max(0, prev - real); g.recebido += real; }
    }
    return Array.from(map.values()).sort((a, b) => b.aberto - a.aberto || a.cliente.localeCompare(b.cliente, "pt-BR"));
  }, [filtradas]);

  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const baixaMut = (trpc as any).financial.darBaixaReceber.useMutation({
    onSuccess: (r: any) => { toast({ title: r?.quitado ? "Título recebido!" : "Baixa parcial registrada!", description: r?.quitado ? undefined : `Saldo restante: ${formatBRL(r?.saldo ?? 0)}` }); setShowBaixa(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro na baixa", description: e.message, variant: "destructive" }),
  });
  const estornarMut = (trpc as any).financial.estornarReceber.useMutation({
    onSuccess: () => { toast({ title: "Recebimento estornado!", description: "Título voltou para 'A receber'." }); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" }),
  });
  const deleteMut = (trpc as any).financial.deleteEntry.useMutation({
    onSuccess: () => { toast({ title: "Título excluído!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });
  const criarMut = (trpc as any).financial.criarTituloReceber.useMutation({
    onSuccess: () => { toast({ title: "Título a receber criado!" }); setShowNovo(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao criar", description: e.message, variant: "destructive" }),
  });
  const anexarMut = (trpc as any).financial.anexarDocumento.useMutation({
    onSuccess: () => { toast({ title: "Documento anexado!" }); setShowAnexo(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao anexar", description: e.message, variant: "destructive" }),
  });

  function onEstornar(t: any) {
    if (!confirm(`Estornar o recebimento do título "${t.descricao}"?`)) return;
    estornarMut.mutate({ id: t.id, companyId });
  }
  function onExcluir(t: any) {
    const motivo = prompt("Motivo da exclusão (mín. 5 caracteres):");
    if (!motivo || motivo.trim().length < 5) { if (motivo !== null) toast({ title: "Motivo muito curto", variant: "destructive" }); return; }
    deleteMut.mutate({ id: t.id, companyId, motivo: motivo.trim() });
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">

        {/* ───────────── HERO ───────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -right-20 top-10 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl" />
          <div className="relative p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur">
                  <HandCoins className="h-3 w-3" /> Financeiro
                </span>
                <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Contas a Receber</h1>
                <p className="text-sm text-emerald-50/90">Títulos por cliente — medições <span className="font-medium">(automático)</span> e lançamentos manuais.</p>
              </div>
              <Button
                onClick={() => setShowNovo(true)}
                className="gap-1.5 bg-white text-emerald-700 hover:bg-emerald-50 shadow-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Novo título
              </Button>
            </div>

            {/* Faixa de resumo do ano */}
            <div className="mt-5 flex flex-col gap-3 rounded-xl bg-white/10 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setAno((a) => a - 1)} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20 transition" aria-label="Ano anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-emerald-100" />
                  <span className="text-lg font-bold tabular-nums">{ano}</span>
                </div>
                <button onClick={() => setAno((a) => a + 1)} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20 transition" aria-label="Próximo ano">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 sm:max-w-md">
                <div className="flex items-center justify-between text-xs text-emerald-50/90">
                  <span>Recebido no ano <b className="text-white">{formatBRL(anoResumo.recebido)}</b></span>
                  <span>Total <b className="text-white">{formatBRL(anoResumo.total)}</b></span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${anoResumo.pct}%` }} />
                </div>
                <div className="text-[11px] text-emerald-50/80">{anoResumo.pct}% recebido · {formatBRL(anoResumo.aberto)} em aberto</div>
              </div>
            </div>
          </div>
        </div>

        {/* ───────────── BARRA DE MESES ───────────── */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-600">Selecione o mês</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
              {MESES.map((m, i) => {
                const numMes = i + 1;
                const status = mesesStatus[numMes];
                const isSelected = mesSel === numMes;
                const valor = mesesValor[numMes];
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(numMes)}
                    className={`relative flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-semibold transition-all
                      ${isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-500/30"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/40"
                      }`}
                  >
                    <span className="flex items-center gap-1">
                      {m}
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        status === "consolidado" ? "bg-emerald-500" :
                        status === "lancamento" ? "bg-blue-500" :
                        "bg-slate-300"
                      }`} />
                    </span>
                    <span className={`text-[10px] font-medium tabular-nums ${isSelected ? "text-emerald-600" : "text-slate-400"}`}>
                      {valor > 0 ? formatCompactBRL(valor) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ───────────── KPIs ───────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KCard label={`A receber em ${MESES[mesSel - 1]}`} value={formatBRL(kpis.abertoMes)} icon={<Clock className="h-5 w-5 text-amber-600" />} ring="bg-amber-100"
            sub={kpis.parcialMes > 0 ? <span className="text-blue-600">parcial {formatBRL(kpis.parcialMes)}</span> : undefined} />
          <KCard label={`Recebido em ${MESES[mesSel - 1]}`} value={formatBRL(kpis.recebidoMes)} icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} ring="bg-emerald-100" />
          <KCard label="Em aberto (ano)" value={formatBRL(acum.aberto)} icon={<TrendingUp className="h-5 w-5 text-indigo-600" />} ring="bg-indigo-100"
            sub={acum.vencido > 0 ? <span className="text-red-600 font-medium">{formatBRL(acum.vencido)} vencido</span> : "em dia"} />
          <KCard label="Títulos vencidos (ano)" value={String(acum.qtdVenc)} icon={<AlertTriangle className="h-5 w-5 text-red-600" />} ring="bg-red-100" />
        </div>

        {/* ───────────── FILTROS ───────────── */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar descrição, obra, cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
            </div>
            <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
              <SelectTrigger className="w-[220px]"><Users className="h-4 w-4 mr-1 text-slate-400" /><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {clienteNomes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="a_receber">A receber</SelectItem>
                <SelectItem value="recebido_parcial">Parcial</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ───────────── LISTA POR CLIENTE ───────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...</div>
        ) : grupos.length === 0 ? (
          <Card className="border-slate-200/80 border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Wallet className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500">Nenhum título a receber em {MESES_LONGO[mesSel - 1]} de {ano}</p>
              <p className="text-xs text-slate-400">para os filtros selecionados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {grupos.map((g) => {
              const open = expanded.has(g.cliente);
              const baseRec = g.total > 0 ? Math.min(100, Math.round((g.recebido / g.total) * 100)) : 0;
              return (
                <Card key={g.cliente} className="overflow-hidden border-slate-200/80 shadow-sm">
                  <button onClick={() => toggle(g.cliente)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 shrink-0">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="font-semibold text-slate-800 truncate">{g.cliente}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{g.itens.length}</Badge>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">Total</span>
                        <span className="text-xs font-medium text-slate-600 tabular-nums">{formatBRL(g.total)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">Em aberto</span>
                        <span className="text-sm font-bold text-amber-600 tabular-nums">{formatBRL(g.aberto)}</span>
                      </div>
                      <div className="hidden md:flex w-24 flex-col gap-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${baseRec}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400 text-right">{baseRec}% recebido</span>
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t divide-y">
                      {g.itens.map((t) => {
                        const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
                        const saldo = Math.max(0, prev - real);
                        const meta = STATUS_META[t.status] ?? { label: t.status, cls: "bg-slate-50 text-slate-700 border-slate-200", dot: "bg-slate-400" };
                        const vencido = num(t.diasAtraso) > 0;
                        const isManual = t.origemModulo === "manual_receber" || !t.origemModulo;
                        return (
                          <div key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-slate-50/70">
                            <div className="flex-1 min-w-[200px]">
                              <div className="text-sm font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                                {t.descricao || t.origemDescricao || "Título"}
                                {t.parcelaTotal > 1 && <Badge variant="outline" className="text-[10px]">{t.parcelaNumero}/{t.parcelaTotal}</Badge>}
                                {t.origemModulo === "revenue" && <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 bg-indigo-50">Medição</Badge>}
                              </div>
                              <div className="text-[11px] text-slate-500">{t.obraNome ?? "—"}{t.contaNome ? ` · ${t.contaNome}` : ""}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-slate-400 uppercase">Vencimento</div>
                              <div className={`text-xs font-medium ${vencido ? "text-red-600" : "text-slate-700"}`}>{fmtDateBR(t.dataVencimento)}{vencido && ` (${t.diasAtraso}d)`}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 uppercase">Valor</div>
                              <div className="text-sm font-bold text-slate-800 tabular-nums">{formatBRL(prev)}</div>
                              {real > 0 && t.status !== "recebido" && <div className="text-[10px] text-blue-600">recebido {formatBRL(real)} · saldo {formatBRL(saldo)}</div>}
                            </div>
                            <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</Badge>
                            <div className="flex items-center gap-1">
                              {t.status !== "recebido" && (
                                <Button size="sm" variant="default" className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowBaixa(t)}>
                                  <HandCoins className="h-3.5 w-3.5" /> Receber
                                </Button>
                              )}
                              {t.status === "recebido" && (
                                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => onEstornar(t)} disabled={estornarMut.isPending}>
                                  <RotateCcw className="h-3.5 w-3.5" /> Estornar
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar documento" onClick={() => setShowAnexo(t)}>
                                <Paperclip className={`h-3.5 w-3.5 ${t.anexoUrl ? "text-emerald-600" : "text-slate-400"}`} />
                              </Button>
                              {isManual && t.status === "a_receber" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => onExcluir(t)} disabled={deleteMut.isPending}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showBaixa && <BaixaDialog titulo={showBaixa} companyId={companyId} contasBancarias={contasBancarias} onClose={() => setShowBaixa(null)} onSubmit={(p: any) => baixaMut.mutate(p)} pending={baixaMut.isPending} />}
      {showNovo && <NovoTituloDialog companyId={companyId} clientesOpts={clientesOpts} onClose={() => setShowNovo(false)} onSubmit={(p: any) => criarMut.mutate(p)} pending={criarMut.isPending} />}
      {showAnexo && <AnexoDialog titulo={showAnexo} companyId={companyId} onClose={() => setShowAnexo(null)} onSubmit={(p: any) => anexarMut.mutate(p)} pending={anexarMut.isPending} />}
    </DashboardLayout>
  );
}

// ─────────────────────────── BAIXA (recebimento) ───────────────────────────
function BaixaDialog({ titulo, companyId, contasBancarias, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const prev = num(titulo.valorPrevisto), real = num(titulo.valorRealizado);
  const saldo = Math.max(0, prev - real);
  const [valor, setValor] = useState(String(saldo.toFixed(2)));
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = useState<string>("");
  const [forma, setForma] = useState<string>("");
  const [obs, setObs] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const contas: any[] = Array.isArray(contasBancarias) ? contasBancarias : [];

  const valorNum = parseFloat(String(valor).replace(",", ".")) || 0;
  const parcial = valorNum > 0 && valorNum < saldo;

  const uploadMut = (trpc as any).financial.uploadComprovante.useMutation();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await uploadMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: file.type });
      setComprovanteUrl(out.url);
      toast({ title: "Comprovante enviado" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message, variant: "destructive" });
    } finally { setUploading(false); }
  }

  function submit() {
    const v = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    onSubmit({
      id: titulo.id, companyId, valorRecebido: v, dataRecebimento: data,
      contaBancariaId: contaId ? Number(contaId) : undefined,
      formaPagamento: forma || undefined,
      comprovanteUrl: comprovanteUrl || undefined,
      observacoes: obs.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-emerald-600" /> Registrar recebimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-3 text-sm">
            <div className="font-semibold text-slate-800">{titulo.descricao}</div>
            <div className="text-xs text-slate-500">{titulo.clienteNome || "Sem cliente"} · venc. {fmtDateBR(titulo.dataVencimento)}</div>
            <div className="mt-2 space-y-0.5">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Valor do título</span><span className="font-bold tabular-nums">{formatBRL(prev)}</span></div>
              {real > 0 && <div className="flex justify-between text-xs text-blue-600"><span>Já recebido</span><span className="tabular-nums">{formatBRL(real)}</span></div>}
              <div className="flex justify-between text-xs font-bold text-amber-700"><span>Saldo em aberto</span><span className="tabular-nums">{formatBRL(saldo)}</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor recebido</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-xs">Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Atalhos:</span>
            <button type="button" onClick={() => setValor(saldo.toFixed(2))} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100">Saldo total</button>
            <button type="button" onClick={() => setValor((saldo / 2).toFixed(2))} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">50%</button>
          </div>
          {valorNum <= 0
            ? <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-1">Informe o valor recebido (ou use um atalho acima).</p>
            : parcial
              ? <p className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">Baixa <b>parcial</b>: título fica "Parcial" com {formatBRL(saldo - valorNum)} em aberto.</p>
              : <p className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">Quita o título integralmente.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Conta bancária</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.descricao || c.banco} {c.conta ? `· ${c.conta}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {["PIX","Transferência","Boleto","Dinheiro","Cheque","Cartão"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Comprovante (opcional)</Label>
            <Input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={handleFile} disabled={uploading} />
            {uploading && <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando...</span>}
            {comprovanteUrl && <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1"><CheckCircle className="h-3 w-3" /> comprovante anexado</span>}
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || uploading} className="bg-emerald-600 hover:bg-emerald-700">
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── NOVO TÍTULO MANUAL ───────────────────────────
function NovoTituloDialog({ companyId, clientesOpts, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [obraNome, setObraNome] = useState("");
  const [contaNome, setContaNome] = useState("Faturamento de Obras");
  const [valor, setValor] = useState("");
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 10));
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [vencTouched, setVencTouched] = useState(false);
  const [parcelas, setParcelas] = useState("1");
  const [obs, setObs] = useState("");

  // Rev. 3004 — automático: o 1º vencimento acompanha a competência enquanto o
  // usuário não editar manualmente o campo de vencimento.
  useEffect(() => {
    if (!vencTouched && comp) setVenc(comp);
  }, [comp, vencTouched]);

  const valorNum = parseFloat(String(valor).replace(",", ".")) || 0;
  const np = Math.max(1, parseInt(parcelas, 10) || 1);
  const valorParcela = np > 0 ? valorNum / np : 0;

  function submit() {
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao.trim()) { toast({ title: "Informe a descrição", variant: "destructive" }); return; }
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    const cli = clientesOpts.find((c: any) => String(c.id) === clienteId);
    onSubmit({
      companyId,
      descricao: descricao.trim(),
      valorPrevisto: v,
      dataCompetencia: comp || undefined,
      dataVencimento: venc || undefined,
      parcelas: np,
      clienteId: cli ? cli.id : undefined,
      clienteNome: cli ? cli.nome : undefined,
      obraNome: obraNome.trim() || undefined,
      contaNome: contaNome.trim() || undefined,
      observacoes: obs.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-600" /> Novo título a receber</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clientesOpts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Medição 03 — Obra X" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Obra (opcional)</Label><Input value={obraNome} onChange={(e) => setObraNome(e.target.value)} /></div>
            <div><Label className="text-xs">Categoria (opcional)</Label><Input value={contaNome} onChange={(e) => setContaNome(e.target.value)} placeholder="Faturamento de Obras" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Valor total</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
            <div><Label className="text-xs">Competência</Label><Input type="date" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
            <div><Label className="text-xs">1º Vencimento</Label><Input type="date" value={venc} onChange={(e) => { setVenc(e.target.value); setVencTouched(true); }} /></div>
          </div>
          <div>
            <Label className="text-xs">Parcelas</Label>
            <Input type="number" min={1} max={120} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className="w-24" />
          </div>
          {/* Rev. 3004 — preview automático das parcelas */}
          {valorNum > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
              {np > 1
                ? <span><b>{np}x</b> de <b>{formatBRL(valorParcela)}</b> · vencimentos mensais a partir de <b>{fmtDateBR(venc)}</b> (resto na última).</span>
                : <span>Parcela única de <b>{formatBRL(valorNum)}</b> com vencimento em <b>{fmtDateBR(venc)}</b>.</span>}
            </div>
          )}
          <div><Label className="text-xs">Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">{pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Criar título</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── ANEXAR DOCUMENTO ───────────────────────────
function AnexoDialog({ titulo, companyId, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [url, setUrl] = useState<string>("");
  const [nome, setNome] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const uploadMut = (trpc as any).financial.uploadComprovante.useMutation();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await uploadMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: file.type });
      setUrl(out.url);
      setNome(file.name);
      toast({ title: "Arquivo enviado", description: "Clique em Anexar para vincular." });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message, variant: "destructive" });
    } finally { setUploading(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Paperclip className="h-5 w-5 text-emerald-600" /> Anexar documento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-slate-600">{titulo.descricao}</div>
          {titulo.anexoUrl && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-emerald-600" /> Já existe um anexo
              <a href={titulo.anexoUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">abrir</a>
            </div>
          )}
          <div>
            <Label className="text-xs">Arquivo (PDF, Word ou imagem)</Label>
            <Input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={handleFile} disabled={uploading} />
            {uploading && <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando...</span>}
            {url && <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1"><CheckCircle className="h-3 w-3" /> {nome}</span>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { if (!url) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; } onSubmit({ id: titulo.id, companyId, anexoUrl: url, anexoNome: nome || undefined }); }} disabled={pending || uploading} className="bg-emerald-600 hover:bg-emerald-700">
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
