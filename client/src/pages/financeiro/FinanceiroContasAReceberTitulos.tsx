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

// Rev. 3005 — máscara de moeda BRL automática (digita centavos → "1.234,56").
function maskBRL(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMaskBRL(masked: string): number {
  const digits = String(masked).replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}
// Rev. 3005 — soma de meses iOS-safe (construtor numérico, clampando o dia ao
// último dia do mês-alvo). Espelha o cálculo de vencimentos do backend.
function addMonthsISO(iso: string, months: number): string {
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  let y = +m[1];
  let mo = +m[2] - 1 + months;
  const d = +m[3];
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  const last = new Date(y, mo + 1, 0).getDate();
  const day = Math.min(d, last);
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function KCard({ label, value, sub, icon, accent, valueColor }: { label: string; value: string; sub?: ReactNode; icon: ReactNode; accent: string; valueColor: string }) {
  return (
    <Card className={`border-0 shadow-sm border-l-4 ${accent}`}>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">{icon}{label}</p>
        <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
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

        {/* ───────────── HEADER (padrão Contas a Pagar) ───────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
            <p className="text-sm text-gray-500 mt-1">Títulos por cliente — medições (automático) e lançamentos manuais.</p>
          </div>
          <Button onClick={() => setShowNovo(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> Novo título
          </Button>
        </div>

        {/* ───────────── NAVEGAÇÃO ANO + MESES (padrão Contas a Pagar) ───────────── */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno((a) => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno((a) => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES.map((m, i) => {
                const numMes = i + 1;
                const status = mesesStatus[numMes];
                const isSelected = mesSel === numMes;
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(numMes)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento" ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ───────────── KPIs (padrão Contas a Pagar) ───────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KCard label={`A receber em ${MESES[mesSel - 1]}`} value={formatBRL(kpis.abertoMes)} icon={<Clock className="w-3 h-3 text-amber-500" />} accent="border-l-amber-500" valueColor="text-amber-600"
            sub={kpis.parcialMes > 0 ? <span className="text-blue-600">parcial {formatBRL(kpis.parcialMes)}</span> : undefined} />
          <KCard label={`Recebido em ${MESES[mesSel - 1]}`} value={formatBRL(kpis.recebidoMes)} icon={<CheckCircle className="w-3 h-3 text-emerald-500" />} accent="border-l-emerald-500" valueColor="text-emerald-700" />
          <KCard label="Em aberto (ano)" value={formatBRL(acum.aberto)} icon={<TrendingUp className="w-3 h-3 text-indigo-500" />} accent="border-l-indigo-500" valueColor="text-indigo-700"
            sub={acum.vencido > 0 ? <span className="text-red-600 font-medium">{formatBRL(acum.vencido)} vencido</span> : "em dia"} />
          <KCard label="Títulos vencidos (ano)" value={String(acum.qtdVenc)} icon={<AlertTriangle className="w-3 h-3 text-red-500" />} accent="border-l-red-500" valueColor="text-red-600" />
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
const PARCELA_PRESETS = [1, 2, 3, 4, 6, 12];

function NovoTituloDialog({ companyId, clientesOpts, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [descTouched, setDescTouched] = useState(false);
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

  // Rev. 3005 — automático: sugere a descrição a partir da obra/cliente enquanto
  // o usuário não digitar manualmente o campo.
  const cliSel = useMemo(
    () => clientesOpts.find((c: any) => String(c.id) === clienteId),
    [clientesOpts, clienteId],
  );
  useEffect(() => {
    if (descTouched) return;
    const alvo = obraNome.trim() || (cliSel ? cliSel.nome : "");
    setDescricao(alvo ? `Faturamento — ${alvo}` : "");
  }, [obraNome, cliSel, descTouched]);

  const valorNum = parseMaskBRL(valor);
  const np = Math.max(1, parseInt(parcelas, 10) || 1);

  // Rev. 3005 — cronograma completo das parcelas (datas + valores), espelhando o
  // backend: base truncada em centavos e o resto consolidado na última parcela.
  const schedule = useMemo(() => {
    if (valorNum <= 0 || !venc) return [] as { n: number; date: string; value: number }[];
    const base = Math.floor((valorNum / np) * 100) / 100;
    const arr: { n: number; date: string; value: number }[] = [];
    let acc = 0;
    for (let i = 0; i < np; i++) {
      const isLast = i === np - 1;
      const value = isLast ? Math.round((valorNum - acc) * 100) / 100 : base;
      acc += base;
      arr.push({ n: i + 1, date: addMonthsISO(venc, i), value });
    }
    return arr;
  }, [valorNum, np, venc]);

  function submit() {
    if (!descricao.trim()) { toast({ title: "Informe a descrição", variant: "destructive" }); return; }
    if (valorNum <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    onSubmit({
      companyId,
      descricao: descricao.trim(),
      valorPrevisto: valorNum,
      dataCompetencia: comp || undefined,
      dataVencimento: venc || undefined,
      parcelas: np,
      clienteId: cliSel ? cliSel.id : undefined,
      clienteNome: cliSel ? cliSel.nome : undefined,
      obraNome: obraNome.trim() || undefined,
      contaNome: contaNome.trim() || undefined,
      observacoes: obs.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* ───── header em gradiente ───── */}
        <DialogHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-left space-y-1">
          <DialogTitle className="flex items-center gap-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">Novo título a receber</span>
          </DialogTitle>
          <p className="text-[13px] text-emerald-50/90 pl-12">Lance um título manual — com parcelas e vencimentos automáticos.</p>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {/* Cliente + descrição */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-emerald-600" /> Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clientesOpts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Descrição</Label>
              <Input className="mt-1" value={descricao} onChange={(e) => { setDescricao(e.target.value); setDescTouched(true); }} placeholder="Ex.: Medição 03 — Obra X" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-emerald-600" /> Obra <span className="text-slate-400 font-normal">(opcional)</span></Label>
                <Input className="mt-1" value={obraNome} onChange={(e) => setObraNome(e.target.value)} placeholder="Nome da obra" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Categoria <span className="text-slate-400 font-normal">(opcional)</span></Label>
                <Input className="mt-1" value={contaNome} onChange={(e) => setContaNome(e.target.value)} placeholder="Faturamento de Obras" />
              </div>
            </div>
          </div>

          {/* Valor com destaque + datas */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <div>
              <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-emerald-600" /> Valor total</Label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
                <Input
                  value={valor}
                  onChange={(e) => setValor(maskBRL(e.target.value))}
                  inputMode="numeric"
                  placeholder="0,00"
                  className="pl-9 text-lg font-bold tabular-nums text-emerald-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-emerald-600" /> Competência</Label>
                <Input className="mt-1" type="date" value={comp} onChange={(e) => setComp(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">1º Vencimento</Label>
                <Input className="mt-1" type="date" value={venc} onChange={(e) => { setVenc(e.target.value); setVencTouched(true); }} />
                {!vencTouched && <p className="mt-0.5 text-[10px] text-emerald-600">Acompanha a competência automaticamente.</p>}
              </div>
            </div>
          </div>

          {/* Parcelas com presets */}
          <div>
            <Label className="text-xs font-medium text-slate-600">Parcelas</Label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {PARCELA_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setParcelas(String(p))}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${np === p ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {p}x
                </button>
              ))}
              <Input type="number" min={1} max={120} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className="h-8 w-16 text-center" />
            </div>
          </div>

          {/* Rev. 3005 — cronograma automático completo das parcelas */}
          {schedule.length > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-100 bg-emerald-50">
                <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Cronograma de recebimento</span>
                <span className="text-[11px] font-semibold text-emerald-700">{np}x · {formatBRL(valorNum)}</span>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-emerald-100/70">
                {schedule.map((s) => (
                  <div key={s.n} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">{s.n}</span>
                      {fmtDateBR(s.date)}
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-700">{formatBRL(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium text-slate-600">Observações</Label>
            <Textarea className="mt-1" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Detalhes adicionais (opcional)" />
          </div>
        </div>

        <DialogFooter className="border-t border-slate-100 px-6 py-3 bg-slate-50/50">
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
