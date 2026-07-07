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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Search, Building2, CheckCircle, Clock,
  AlertTriangle, TrendingUp, Plus, Paperclip, Trash2, RotateCcw, Loader2,
  HandCoins, Users, Wallet, CalendarDays, ChevronsUpDown, Check, Tag,
  X, CheckSquare, SlidersHorizontal, Landmark, Upload, FileText,
} from "lucide-react";

// Rev. 3007 — categorias de Contas a Receber (literatura de gestão de contratos
// de engenharia/construção civil): faturamento por medição + serviços extras etc.
const CATEGORIAS_RECEBER = [
  "Medição",
  "SEC — Serviços Extras Contratuais",
  "Aditivo Contratual",
  "Mobilização / Adiantamento",
  "Reajuste / Reequilíbrio",
  "Liberação de Retenção (Caução)",
  "Reembolso de Despesas",
  "Outros",
];

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

function bancoCor(banco?: string): { bg: string; text: string; border: string } {
  const b = (banco ?? "").toLowerCase();
  if (b.includes("caixa"))     return { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300" };
  if (b.includes("santander")) return { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300" };
  if (b.includes("ita"))       return { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" };
  if (b.includes("bradesco"))  return { bg: "bg-pink-100",   text: "text-pink-700",   border: "border-pink-300" };
  if (b.includes("brasil"))    return { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" };
  if (b.includes("sicoob") || b.includes("sicredi")) return { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" };
  if (b.includes("inter"))     return { bg: "bg-orange-50",  text: "text-orange-600", border: "border-orange-200" };
  if (b.includes("nubank") || b.includes("nu ")) return { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" };
  return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
}

function bancoBadge(banco?: string, apelido?: string): string {
  if (apelido) {
    const words = apelido.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return apelido.slice(0, 2).toUpperCase();
  }
  if (!banco) return "??";
  const b = banco.toLowerCase();
  if (b.includes("caixa economica") || b.includes("caixa econômica")) return "CEF";
  if (b.includes("caixa")) return "CX";
  if (b.includes("santander")) return "SAN";
  if (b.includes("itaú") || b.includes("itau")) return "ITÁ";
  if (b.includes("bradesco")) return "BRD";
  if (b.includes("brasil")) return "BB";
  if (b.includes("sicoob")) return "SCB";
  if (b.includes("sicredi")) return "SCR";
  if (b.includes("inter")) return "INT";
  if (b.includes("nubank") || b.includes("nu ")) return "NU";
  const words = banco.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return banco.slice(0, 3).toUpperCase();
}

// Rev. 3007 — normaliza nome p/ casar `obras.cliente` (texto) com a razão social /
// nome fantasia do cliente: minúsculas, SEM acentos e espaços colapsados (dados
// cadastrais costumam divergir em acentuação/espaçamento).
function normName(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

function KCard({ label, value, sub, icon, accent, valueColor, onClick, active, activeRing }: {
  label: string; value: string; sub?: ReactNode; icon: ReactNode; accent: string; valueColor: string;
  onClick?: () => void; active?: boolean; activeRing?: string;
}) {
  return (
    <Card
      className={`border-0 shadow-sm border-l-4 ${accent} transition-all
        ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}
        ${active ? `ring-2 ring-offset-2 ${activeRing ?? "ring-slate-400"}` : ""}
      `}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">{icon}{label}
          {active && <span className="ml-auto text-[10px] font-semibold bg-slate-800/10 px-1.5 py-0.5 rounded">filtrado</span>}
        </p>
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

  const [cardAtivo, setCardAtivo] = useState<"a_receber_mes" | "recebido_mes" | "em_aberto_ano" | "vencidos_ano" | null>(null);

  const [showBaixa, setShowBaixa] = useState<any>(null);
  const [showNovo, setShowNovo] = useState(false);
  const [showAnexo, setShowAnexo] = useState<any>(null);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkAjustar, setShowBulkAjustar] = useState(false);

  function ativarCard(card: "a_receber_mes" | "recebido_mes" | "em_aberto_ano" | "vencidos_ano") {
    if (cardAtivo === card) {
      setCardAtivo(null);
      setStatusFiltro("todos");
      return;
    }
    setCardAtivo(card);
    if (card === "a_receber_mes") {
      setStatusFiltro("em_aberto");
    } else if (card === "recebido_mes") {
      setStatusFiltro("recebido");
    } else if (card === "em_aberto_ano") {
      setMesSel(0);
      setStatusFiltro("em_aberto");
    } else if (card === "vencidos_ano") {
      setMesSel(0);
      setStatusFiltro("vencido");
    }
  }

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

  const clientesOpts: { id: number; nome: string; matchNames: string[] }[] = useMemo(() => {
    const list: any[] = Array.isArray(clientesList) ? clientesList : [];
    return list.map((c) => ({
      id: c.id,
      nome: (c.nomeFantasia || c.razaoSocial || `Cliente ${c.id}`).trim(),
      // nomes possíveis usados em `obras.cliente` (vínculo é por texto, não FK)
      matchNames: [c.razaoSocial, c.nomeFantasia]
        .filter(Boolean)
        .map((n: any) => normName(n)),
    }));
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

  // Rev. 3180 — mesSel === 0 => "Ano todo" (não filtra por mês; mostra o ano inteiro).
  const mesData = useMemo(
    () => (mesSel === 0 ? linhas : linhas.filter((t) => getMesFromDate(t.dataVencimento) === mesSel)),
    [linhas, mesSel],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mesData.filter((t) => {
      if (statusFiltro === "em_aberto") {
        if (t.status === "recebido") return false;
      } else if (statusFiltro === "vencido") {
        if (t.status === "recebido") return false;
        if (!(num(t.diasAtraso) > 0)) return false;
      } else if (statusFiltro !== "todos" && t.status !== statusFiltro) {
        return false;
      }
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

  // Rev. 3743 — baixa via histórico unificado (financial_entry_baixas): parcial/total + estorno por baixa.
  const baixaMut = (trpc as any).financial.registrarBaixa.useMutation({
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
  const bulkReclassificarMut = (trpc as any).financial.bulkReclassificar.useMutation({
    onSuccess: (r: any) => { toast({ title: `${r.changed} título(s) reclassificado(s)!` }); setShowBulkAjustar(false); setSelectedIds(new Set()); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao reclassificar", description: e.message, variant: "destructive" }),
  });
  const bulkVencimentoMut = (trpc as any).financial.bulkAtualizarVencimento.useMutation({
    onSuccess: (r: any) => { toast({ title: `Vencimento atualizado em ${r.changed} título(s)!` }); setShowBulkAjustar(false); setSelectedIds(new Set()); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao atualizar vencimento", description: e.message, variant: "destructive" }),
  });
  const bulkBaixaMut = (trpc as any).financial.bulkBaixa.useMutation({
    onSuccess: (r: any) => { toast({ title: `${r.updated ?? 0} título(s) marcado(s) como recebido!` }); setShowBulkAjustar(false); setSelectedIds(new Set()); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao receber em lote", description: e.message, variant: "destructive" }),
  });

  const itensSelecionados = useMemo(() => linhas.filter((t) => selectedIds.has(t.id)), [linhas, selectedIds]);
  const valorSelecionado = useMemo(() => itensSelecionados.reduce((s, t) => s + num(t.valorPrevisto), 0), [itensSelecionados]);

  function toggleSelecao() {
    setModoSelecao((p) => {
      if (p) setSelectedIds(new Set());
      else setExpanded(new Set(grupos.map((g) => g.cliente)));
      return !p;
    });
  }
  function toggleItem(id: number) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selecionarTodos() {
    setSelectedIds(new Set(filtradas.map((t: any) => t.id)));
  }
  function deselecionarTodos() { setSelectedIds(new Set()); }

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
          <div className="flex items-center gap-2">
            <Button
              variant={modoSelecao ? "default" : "outline"}
              onClick={toggleSelecao}
              className={`gap-1.5 ${modoSelecao ? "bg-slate-800 hover:bg-slate-900 text-white" : ""}`}
            >
              <CheckSquare className="h-4 w-4" />
              {modoSelecao ? `Selecionando${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}` : "Selecionar"}
            </Button>
            <Button onClick={() => setShowNovo(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" /> Novo título
            </Button>
          </div>
        </div>

        {/* ───────────── NAVEGAÇÃO ANO + MESES (padrão Contas a Pagar) ───────────── */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { setAno((a) => a - 1); setCardAtivo(null); setStatusFiltro("todos"); }} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => { setAno((a) => a + 1); setCardAtivo(null); setStatusFiltro("todos"); }} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
                {/* Rev. 3180 — atalho "Ano todo": vê TODOS os lançamentos do ano de uma vez. */}
                <button
                  onClick={() => { setMesSel((m) => (m === 0 ? new Date().getMonth() + 1 : 0)); setCardAtivo(null); setStatusFiltro("todos"); }}
                  className={`ml-1 px-3 py-1 rounded-lg border text-xs font-semibold transition-all
                    ${mesSel === 0
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  Ano todo
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
                    onClick={() => { setMesSel(numMes); setCardAtivo(null); setStatusFiltro("todos"); }}
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

        {/* ───────────── KPIs — cards clicáveis filtram a lista abaixo ───────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KCard
            label={mesSel === 0 ? "A receber no ano" : `A receber em ${MESES[mesSel - 1]}`}
            value={formatBRL(kpis.abertoMes)}
            icon={<Clock className="w-3 h-3 text-amber-500" />}
            accent="border-l-amber-500" valueColor="text-amber-600"
            sub={kpis.parcialMes > 0 ? <span className="text-blue-600">parcial {formatBRL(kpis.parcialMes)}</span> : undefined}
            onClick={() => ativarCard("a_receber_mes")}
            active={cardAtivo === "a_receber_mes"}
            activeRing="ring-amber-400"
          />
          <KCard
            label={mesSel === 0 ? "Recebido no ano" : `Recebido em ${MESES[mesSel - 1]}`}
            value={formatBRL(kpis.recebidoMes)}
            icon={<CheckCircle className="w-3 h-3 text-emerald-500" />}
            accent="border-l-emerald-500" valueColor="text-emerald-700"
            onClick={() => ativarCard("recebido_mes")}
            active={cardAtivo === "recebido_mes"}
            activeRing="ring-emerald-400"
          />
          <KCard
            label="Em aberto (ano)"
            value={formatBRL(acum.aberto)}
            icon={<TrendingUp className="w-3 h-3 text-indigo-500" />}
            accent="border-l-indigo-500" valueColor="text-indigo-700"
            sub={acum.vencido > 0 ? <span className="text-red-600 font-medium">{formatBRL(acum.vencido)} vencido</span> : "em dia"}
            onClick={() => ativarCard("em_aberto_ano")}
            active={cardAtivo === "em_aberto_ano"}
            activeRing="ring-indigo-400"
          />
          <KCard
            label="Títulos vencidos (ano)"
            value={String(acum.qtdVenc)}
            icon={<AlertTriangle className="w-3 h-3 text-red-500" />}
            accent="border-l-red-500" valueColor="text-red-600"
            onClick={() => ativarCard("vencidos_ano")}
            active={cardAtivo === "vencidos_ano"}
            activeRing="ring-red-400"
          />
        </div>

        {/* ── Chip de filtro ativo (via card) ────────────────────────────────── */}
        {cardAtivo && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Filtro ativo:</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border
              ${cardAtivo === "a_receber_mes"  ? "bg-amber-50  text-amber-700  border-amber-200"  : ""}
              ${cardAtivo === "recebido_mes"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}
              ${cardAtivo === "em_aberto_ano"  ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}
              ${cardAtivo === "vencidos_ano"   ? "bg-red-50    text-red-700    border-red-200"    : ""}
            `}>
              {cardAtivo === "a_receber_mes"  && <><Clock className="w-3 h-3" />{mesSel > 0 ? `A receber em ${MESES[mesSel - 1]}` : "A receber no ano"}</>}
              {cardAtivo === "recebido_mes"   && <><CheckCircle className="w-3 h-3" />{mesSel > 0 ? `Recebido em ${MESES[mesSel - 1]}` : "Recebido no ano"}</>}
              {cardAtivo === "em_aberto_ano"  && <><TrendingUp className="w-3 h-3" />Em aberto — ano todo</>}
              {cardAtivo === "vencidos_ano"   && <><AlertTriangle className="w-3 h-3" />Títulos vencidos — ano todo</>}
              <button onClick={() => { setCardAtivo(null); setStatusFiltro("todos"); }} className="ml-1 hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
            <span className="text-xs text-slate-400">{filtradas.length} título{filtradas.length !== 1 ? "s" : ""}</span>
          </div>
        )}

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
            <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setCardAtivo(null); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="em_aberto">Em aberto</SelectItem>
                <SelectItem value="a_receber">A receber</SelectItem>
                <SelectItem value="recebido_parcial">Parcial</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ───────────── BARRA SELECIONAR TODOS ───────────── */}
        {modoSelecao && (
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm">
            <CheckSquare className="h-4 w-4 text-slate-300" />
            <span className="font-medium">{selectedIds.size} de {filtradas.length} selecionado{filtradas.length !== 1 ? "s" : ""}</span>
            <button onClick={selecionarTodos} className="text-xs text-emerald-300 hover:text-emerald-200 underline">Selecionar todos</button>
            {selectedIds.size > 0 && <button onClick={deselecionarTodos} className="text-xs text-slate-400 hover:text-slate-200 underline">Limpar</button>}
            {selectedIds.size > 0 && (
              <span className="ml-auto text-emerald-300 font-mono text-sm font-semibold">{formatBRL(valorSelecionado)}</span>
            )}
          </div>
        )}

        {/* ───────────── LISTA POR CLIENTE ───────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...</div>
        ) : grupos.length === 0 ? (
          <Card className="border-slate-200/80 border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Wallet className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500">Nenhum título a receber {mesSel === 0 ? `em ${ano}` : `em ${MESES_LONGO[mesSel - 1]} de ${ano}`}</p>
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
                        const isSelected = selectedIds.has(t.id);
                        return (
                          <div
                            key={t.id}
                            className={`px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-slate-50/70 transition-colors ${isSelected ? "bg-emerald-50/60" : ""} ${modoSelecao ? "cursor-pointer" : ""}`}
                            onClick={modoSelecao ? () => toggleItem(t.id) : undefined}
                          >
                            {modoSelecao && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleItem(t.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-[200px]">
                              <div className="text-sm font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                                {t.descricao || t.origemDescricao || "Título"}
                                {t.parcelaTotal > 1 && <Badge variant="outline" className="text-[10px]">{t.parcelaNumero}/{t.parcelaTotal}</Badge>}
                                {t.origemModulo === "revenue" && <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 bg-indigo-50">Medição</Badge>}
                                {t.nfseNumero && <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-200 bg-blue-50 gap-0.5"><FileText className="h-2.5 w-2.5" />NFS-e {t.nfseNumero}</Badge>}
                                {Number(t.dupCount) > 1 && (
                                  <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50" title={`${t.dupCount} títulos com mesmo valor e vencimento — verifique se há duplicata e estorne o desnecessário.`}>
                                    ⚠ Possível duplicata
                                  </Badge>
                                )}
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

      {showBaixa && <BaixaDialog titulo={showBaixa} companyId={companyId} contasBancarias={contasBancarias} onClose={() => setShowBaixa(null)} onSubmit={(p: any) => baixaMut.mutate(p)} pending={baixaMut.isPending} onRefetch={refetch} />}
      {showNovo && <NovoTituloDialog companyId={companyId} clientesOpts={clientesOpts} contasBancarias={contasBancarias} onClose={() => setShowNovo(false)} onSubmit={(p: any) => criarMut.mutate(p)} pending={criarMut.isPending} />}
      {showAnexo && <AnexoDialog titulo={showAnexo} companyId={companyId} onClose={() => setShowAnexo(null)} onSubmit={(p: any) => anexarMut.mutate(p)} pending={anexarMut.isPending} />}
      {showBulkAjustar && (
        <BulkAjustarDialog
          companyId={companyId}
          itens={itensSelecionados}
          bulkReclassificarMut={bulkReclassificarMut}
          bulkVencimentoMut={bulkVencimentoMut}
          bulkBaixaMut={bulkBaixaMut}
          onClose={() => setShowBulkAjustar(false)}
        />
      )}

      {/* ───────────── BARRA FLUTUANTE DE SELEÇÃO ───────────── */}
      {modoSelecao && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-2xl border border-white/10">
          <span className="text-sm font-semibold">{selectedIds.size} título{selectedIds.size !== 1 ? "s" : ""}</span>
          <span className="text-slate-500 text-xs">·</span>
          <span className="text-emerald-300 font-mono text-sm font-semibold">{formatBRL(valorSelecionado)}</span>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={() => setShowBulkAjustar(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Ajustar seleção
          </Button>
          <button
            onClick={deselecionarTodos}
            className="text-slate-400 hover:text-white transition-colors"
            title="Limpar seleção"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}

// ─────────────────────────── BAIXA (recebimento) ───────────────────────────
function BaixaDialog({ titulo, companyId, contasBancarias, onClose, onSubmit, pending, onRefetch }: any) {
  const { toast } = useToast();
  const prev = num(titulo.valorPrevisto), real = num(titulo.valorRealizado);
  const saldo = Math.max(0, prev - real);
  // Rev. 3743 — histórico de baixas do título (parciais) + estorno por baixa.
  const baixasQuery = (trpc as any).financial.getEntryBaixas.useQuery(
    { entryId: titulo.id, companyId },
    { enabled: !!companyId && !!titulo.id }
  );
  const estornoBaixaMut = (trpc as any).financial.estornarBaixaItem.useMutation({
    onSuccess: () => { toast({ title: "Baixa estornada!" }); baixasQuery.refetch(); onRefetch?.(); },
    onError: (e: any) => toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" }),
  });
  const [valor, setValor] = useState(maskBRL(String(Math.round(saldo * 100))));
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = useState<string>("");
  const [forma, setForma] = useState<string>("");
  const [obs, setObs] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const contas: any[] = Array.isArray(contasBancarias) ? contasBancarias : [];

  const valorNum = parseMaskBRL(valor);
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

  function basePayload() {
    return {
      id: titulo.id, companyId,
      valor: parseMaskBRL(valor),
      data,
      contaBancariaId: contaId ? Number(contaId) : undefined,
      formaPagamento: forma || undefined,
      comprovanteUrl: comprovanteUrl || undefined,
      observacoes: obs.trim() || undefined,
    };
  }
  function submit() {
    const v = parseMaskBRL(valor);
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    onSubmit(basePayload());
  }
  // Opção C — fecha o título mesmo com saldo (sobra de centavo / desconto não recebido).
  function quitarSaldo() {
    onSubmit({ ...basePayload(), quitarTotal: true });
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
            <div><Label className="text-xs">Valor recebido</Label><div className="relative"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span><Input className="pl-8 tabular-nums" value={valor} onChange={(e) => setValor(maskBRL(e.target.value))} inputMode="decimal" /></div></div>
            <div><Label className="text-xs">Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Atalhos:</span>
            <button type="button" onClick={() => setValor(maskBRL(String(Math.round(saldo * 100))))} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100">Saldo total</button>
            <button type="button" onClick={() => setValor(maskBRL(String(Math.round((saldo / 2) * 100))))} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">50%</button>
          </div>
          {valorNum <= 0
            ? <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-1">Informe o valor recebido (ou use um atalho acima).</p>
            : parcial
              ? <p className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">Baixa <b>parcial</b>: título fica "Parcial" com {formatBRL(saldo - valorNum)} em aberto.</p>
              : <p className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">Quita o título integralmente.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Conta bancária</Label>
              <Combobox
                value={contaId}
                onChange={setContaId}
                options={contas.map((c) => ({ value: String(c.id), label: `${c.descricao || c.banco}${c.conta ? ` · ${c.conta}` : ""}` }))}
                placeholder="Selecione"
                searchPlaceholder="Buscar conta..."
                emptyText="Nenhuma conta."
              />
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Combobox
                value={forma}
                onChange={setForma}
                options={["PIX","Transferência","Boleto","Dinheiro","Cheque","Cartão"].map((f) => ({ value: f, label: f }))}
                placeholder="—"
                searchPlaceholder="Buscar forma..."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Comprovante (opcional)</Label>
            <Input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={handleFile} disabled={uploading} />
            {uploading && <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando...</span>}
            {comprovanteUrl && <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1"><CheckCircle className="h-3 w-3" /> comprovante anexado</span>}
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>

          {/* Rev. 3743 — Histórico de baixas (parciais) + estorno por baixa */}
          {Array.isArray(baixasQuery.data) && baixasQuery.data.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
              <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Histórico de baixas</p>
              <div className="space-y-1.5">
                {baixasQuery.data.map((b: any) => {
                  const estornada = !!b.estornadaEm;
                  return (
                    <div key={b.id} className={`flex items-center justify-between gap-2 text-xs rounded px-2 py-1.5 border ${estornada ? "bg-slate-100 border-slate-200 opacity-60" : "bg-white border-slate-200"}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold tabular-nums ${estornada ? "line-through text-slate-400" : "text-emerald-700"}`}>{formatBRL(num(b.valor))}</span>
                          <span className="text-slate-500">{fmtDateBR(b.data)}</span>
                          {b.formaPagamento && <span className="text-slate-400 uppercase text-[10px]">{String(b.formaPagamento).replace(/_/g, " ")}</span>}
                          {b.quitouTotal === 1 && !estornada && <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">quitação total</span>}
                          {estornada && <span className="text-[10px] px-1 rounded bg-red-100 text-red-600 border border-red-200">estornada</span>}
                        </div>
                        {b.observacoes && <p className="text-[10px] text-slate-400 break-words">{b.observacoes}</p>}
                        {estornada && b.estornoMotivo && <p className="text-[10px] text-red-400 break-words">motivo: {b.estornoMotivo}</p>}
                      </div>
                      {!estornada && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                          disabled={estornoBaixaMut.isPending}
                          onClick={() => { if (confirm("Estornar esta baixa? O saldo do título será reaberto.")) estornoBaixaMut.mutate({ baixaId: b.id, companyId }); }}>
                          Estornar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {/* Opção C — Quitar saldo: fecha o título mesmo com saldo restante */}
          <Button variant="outline" onClick={quitarSaldo} disabled={pending || uploading} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            Quitar saldo
          </Button>
          <Button onClick={submit} disabled={pending || uploading} className="bg-emerald-600 hover:bg-emerald-700">
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Registrar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── NOVO TÍTULO MANUAL ───────────────────────────
const PARCELA_PRESETS = [1, 2, 3, 4, 6, 12];

// Rev. 3007 — combobox pesquisável (corrige o dropdown de cliente que ficava
// cortado/sobreposto dentro do modal e melhora a busca em listas grandes).
function Combobox({
  value, onChange, options, placeholder, searchPlaceholder, emptyText,
  disabled, allowCustom, icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : (allowCustom && value ? value : "");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`flex items-center gap-1.5 truncate ${label ? "" : "text-muted-foreground"}`}>
            {icon}
            <span className="truncate">{label || placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder || "Buscar..."} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>
              {allowCustom && q.trim() ? (
                <button
                  type="button"
                  onClick={() => { onChange(q.trim()); setOpen(false); setQ(""); }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  Usar "{q.trim()}"
                </button>
              ) : (
                <span className="block px-2 py-3 text-center text-sm text-muted-foreground">{emptyText || "Nada encontrado."}</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => { onChange(o.value); setOpen(false); setQ(""); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === o.value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function NovoTituloDialog({ companyId, clientesOpts, contasBancarias, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [descTouched, setDescTouched] = useState(false);
  const [obraNome, setObraNome] = useState("");
  const [contaNome, setContaNome] = useState("Medição");
  const [valor, setValor] = useState("");
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 10));
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [vencTouched, setVencTouched] = useState(false);
  const [parcelas, setParcelas] = useState("1");
  const [obs, setObs] = useState("");
  // Rev. 4084 — conta bancária de recebimento + NFS-e
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [nfseNumero, setNfseNumero] = useState("");
  const [nfseSerie, setNfseSerie] = useState("");
  const [nfseChave, setNfseChave] = useState("");
  const [nfseValorServico, setNfseValorServico] = useState("");
  const [nfseValorMaterial, setNfseValorMaterial] = useState("");
  const [nfseXmlNome, setNfseXmlNome] = useState("");
  const [nfseXmlConteudo, setNfseXmlConteudo] = useState("");
  const [nfseUploading, setNfseUploading] = useState(false);
  const contas: any[] = Array.isArray(contasBancarias) ? contasBancarias : [];

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

  // Rev. 3007 — obras ATIVAS do cliente selecionado (vínculo por texto:
  // `obras.cliente` == razão social/nome fantasia do cliente).
  const { data: obrasList } = (trpc as any).obras.listActive.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  const obrasDoCliente = useMemo(() => {
    const list: any[] = Array.isArray(obrasList) ? obrasList : [];
    if (!cliSel) return [] as { value: string; label: string }[];
    const names = new Set<string>(cliSel.matchNames || []);
    return list
      .filter((o) => o.cliente && names.has(normName(o.cliente)))
      .map((o) => ({ value: String(o.nome), label: String(o.nome) }));
  }, [obrasList, cliSel]);

  // ao trocar de cliente, limpa a obra (as obras pertencem ao cliente anterior)
  useEffect(() => { setObraNome(""); }, [clienteId]);

  // Rev. 4084 — extrai campos do XML da NFS-e (NFS-e Nacional, ABRASF, SIL, GIAP)
  function parseNfseXml(xmlText: string) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const get = (...tags: string[]) => {
        for (const tag of tags) {
          const el = doc.querySelector(tag);
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return "";
      };
      return {
        numero: get("Numero", "NumeroNfse", "NNfse", "numeroNfse"),
        serie: get("Serie", "SerieNfse"),
        chave: get("CodigoVerificacao", "ChaveNFSe", "chaveNFSe", "CodigoAutenticacao"),
        valorServico: get("ValorServicos", "ValorServico", "vServico"),
        valorMaterial: get("ValorMaterialFornecido", "ValorMaterial", "vMaterial"),
      };
    } catch { return { numero: "", serie: "", chave: "", valorServico: "", valorMaterial: "" }; }
  }

  async function handleXmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNfseUploading(true);
    try {
      const text = await file.text();
      setNfseXmlConteudo(text);
      setNfseXmlNome(file.name);
      const p = parseNfseXml(text);
      if (p.numero) setNfseNumero(p.numero);
      if (p.serie) setNfseSerie(p.serie);
      if (p.chave) setNfseChave(p.chave);
      if (p.valorServico) {
        const cents = Math.round(parseFloat(p.valorServico.replace(",", ".")) * 100);
        if (cents > 0) setNfseValorServico(maskBRL(String(cents)));
      }
      if (p.valorMaterial) {
        const cents = Math.round(parseFloat(p.valorMaterial.replace(",", ".")) * 100);
        if (cents > 0) setNfseValorMaterial(maskBRL(String(cents)));
      }
      toast({ title: "XML carregado", description: `NFS-e nº ${p.numero || "—"} detectada — campos preenchidos.` });
    } catch (err: any) {
      toast({ title: "Erro ao ler XML", description: String(err?.message || err), variant: "destructive" });
    } finally { setNfseUploading(false); e.target.value = ""; }
  }

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
      // Rev. 4084 — novos campos
      contaBancariaId: contaBancariaId ? Number(contaBancariaId) : undefined,
      nfseNumero: nfseNumero.trim() || undefined,
      nfseSerie: nfseSerie.trim() || undefined,
      nfseChave: nfseChave.trim() || undefined,
      nfseValorServico: nfseValorServico ? parseMaskBRL(nfseValorServico) : undefined,
      nfseValorMaterial: nfseValorMaterial ? parseMaskBRL(nfseValorMaterial) : undefined,
      nfseXmlConteudo: nfseXmlConteudo || undefined,
      nfseXmlNome: nfseXmlNome || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
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
              <Combobox
                value={clienteId}
                onChange={setClienteId}
                options={clientesOpts.map((c: any) => ({ value: String(c.id), label: c.nome }))}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
                emptyText="Nenhum cliente encontrado."
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Descrição</Label>
              <Input className="mt-1" value={descricao} onChange={(e) => { setDescricao(e.target.value); setDescTouched(true); }} placeholder="Ex.: Medição 03 — Obra X" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-emerald-600" /> Obra <span className="text-slate-400 font-normal">(opcional)</span></Label>
                <Combobox
                  value={obraNome}
                  onChange={setObraNome}
                  options={obrasDoCliente}
                  placeholder={clienteId ? "Selecione a obra" : "Selecione o cliente primeiro"}
                  searchPlaceholder="Buscar obra..."
                  emptyText={clienteId ? "Nenhuma obra ativa para este cliente." : "Selecione o cliente primeiro."}
                  disabled={!clienteId}
                  allowCustom
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-emerald-600" /> Categoria</Label>
                <Combobox
                  value={contaNome}
                  onChange={setContaNome}
                  options={CATEGORIAS_RECEBER.map((c) => ({ value: c, label: c }))}
                  placeholder="Selecione a categoria"
                  searchPlaceholder="Buscar categoria..."
                />
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
            <div className="grid grid-cols-1 gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-emerald-600" /> Competência</Label>
                <Input className="mt-1 block w-full min-w-0" type="date" value={comp} onChange={(e) => setComp(e.target.value)} />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium text-slate-600">1º Vencimento</Label>
                <Input className="mt-1 block w-full min-w-0" type="date" value={venc} onChange={(e) => { setVenc(e.target.value); setVencTouched(true); }} />
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

          {/* Rev. 4084 — Conta bancária de recebimento (cards visuais) */}
          {contas.length > 0 && (
            <div>
              <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-emerald-600" />
                Conta bancária de recebimento
                <span className="text-slate-400 font-normal">(opcional)</span>
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {/* "Não definir" card */}
                <button
                  type="button"
                  onClick={() => setContaBancariaId("")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                    contaBancariaId === ""
                      ? "border-slate-400 bg-slate-100 ring-1 ring-slate-400"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">—</span>
                  <span className="text-xs text-slate-500 font-medium">Não definir</span>
                </button>

                {contas.map((c: any) => {
                  const cor = bancoCor(c.banco);
                  const badge = bancoBadge(c.banco, c.apelido || c.nome);
                  const selected = contaBancariaId === String(c.id);
                  const label = c.apelido || c.nome || c.banco || "Conta";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setContaBancariaId(String(c.id))}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                        selected
                          ? `${cor.border} ${cor.bg} ring-1 ${cor.border}`
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${cor.bg} ${cor.text}`}>
                        {badge}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-xs font-semibold leading-tight truncate max-w-[120px] ${selected ? cor.text : "text-slate-700"}`}>
                          {label}
                        </span>
                        {(c.banco || c.agencia) && (
                          <span className="block text-[10px] text-slate-400 leading-tight truncate max-w-[120px]">
                            {[c.banco, c.agencia ? `Ag. ${c.agencia}` : ""].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {c.conta && (
                          <span className="block text-[10px] text-slate-400 leading-tight">
                            CC {c.conta}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <span className={`ml-auto shrink-0 h-4 w-4 rounded-full flex items-center justify-center ${cor.bg}`}>
                          <Check className={`h-2.5 w-2.5 ${cor.text}`} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rev. 4084 — NFS-e vinculada */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-800 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> NFS-e vinculada <span className="font-normal text-blue-600">(opcional)</span></span>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-blue-700 hover:text-blue-900 transition">
                {nfseUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {nfseXmlNome ? nfseXmlNome : "Carregar XML"}
                <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={handleXmlFile} disabled={nfseUploading} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-[10px] text-slate-500">Número da NFS-e</Label>
                <Input className="mt-0.5 h-8 text-sm" value={nfseNumero} onChange={(e) => setNfseNumero(e.target.value)} placeholder="Ex.: 000123" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-500">Série</Label>
                <Input className="mt-0.5 h-8 text-sm" value={nfseSerie} onChange={(e) => setNfseSerie(e.target.value)} placeholder="Ex.: A" />
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">Chave / Código de verificação</Label>
              <Input className="mt-0.5 h-8 text-sm font-mono" value={nfseChave} onChange={(e) => setNfseChave(e.target.value)} placeholder="Código de autenticação" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-slate-500">Valor de serviço (R$)</Label>
                <div className="relative mt-0.5">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <Input className="h-8 pl-7 text-sm tabular-nums" value={nfseValorServico} onChange={(e) => setNfseValorServico(maskBRL(e.target.value))} inputMode="numeric" placeholder="0,00" />
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-slate-500">Valor de material (R$)</Label>
                <div className="relative mt-0.5">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <Input className="h-8 pl-7 text-sm tabular-nums" value={nfseValorMaterial} onChange={(e) => setNfseValorMaterial(maskBRL(e.target.value))} inputMode="numeric" placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

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

// ─────────────────────────── AJUSTE EM LOTE ───────────────────────────
function BulkAjustarDialog({ companyId, itens, bulkReclassificarMut, bulkVencimentoMut, bulkBaixaMut, onClose }: any) {
  const { toast } = useToast();
  const [aba, setAba] = useState<"classificar" | "vencimento" | "receber">("classificar");
  const [contaNome, setContaNome] = useState("");
  const [obraNome, setObraNome] = useState("");
  const [dataVenc, setDataVenc] = useState("");
  const [dataReceber, setDataReceber] = useState(new Date().toISOString().slice(0, 10));
  const [forma, setForma] = useState("");

  const ids = itens.map((t: any) => t.id);
  const naoRecebidos = itens.filter((t: any) => t.status !== "recebido");
  const isPending = bulkReclassificarMut.isPending || bulkVencimentoMut.isPending || bulkBaixaMut.isPending;

  function submitClassificar() {
    if (!contaNome.trim() && !obraNome.trim()) {
      toast({ title: "Preencha ao menos Categoria ou Obra", variant: "destructive" }); return;
    }
    bulkReclassificarMut.mutate({
      companyId, ids,
      ...(contaNome.trim() ? { contaNome: contaNome.trim(), contaId: null } : {}),
      ...(obraNome.trim() ? { obraNome: obraNome.trim(), obraId: null } : {}),
    });
  }
  function submitVencimento() {
    if (!dataVenc) { toast({ title: "Informe a nova data de vencimento", variant: "destructive" }); return; }
    bulkVencimentoMut.mutate({ companyId, ids, dataVencimento: dataVenc });
  }
  function submitReceber() {
    if (naoRecebidos.length === 0) { toast({ title: "Todos já estão recebidos", variant: "destructive" }); return; }
    bulkBaixaMut.mutate({
      companyId,
      ids: naoRecebidos.map((t: any) => t.id),
      dataPagamento: dataReceber,
      ...(forma ? { formaPagamento: forma } : {}),
    });
  }

  const ABAS = [
    { key: "classificar", label: "Categoria / Obra" },
    { key: "vencimento",  label: "Vencimento" },
    { key: "receber",     label: `Receber (${naoRecebidos.length})` },
  ] as const;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
            Ajustar {itens.length} título{itens.length !== 1 ? "s" : ""}
          </DialogTitle>
          <p className="text-xs text-slate-500">Total: {formatBRL(itens.reduce((s: number, t: any) => s + num(t.valorPrevisto), 0))}</p>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 border-b pb-0">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                aba === a.key
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >{a.label}</button>
          ))}
        </div>

        <div className="space-y-4 pt-1">
          {aba === "classificar" && (
            <>
              <p className="text-xs text-slate-500">Altera categoria e/ou obra dos {itens.length} títulos. Deixe em branco o que não quiser alterar.</p>
              <div>
                <Label className="text-xs">Categoria (conta)</Label>
                <Combobox
                  value={contaNome}
                  onChange={setContaNome}
                  options={CATEGORIAS_RECEBER.map((c) => ({ value: c, label: c }))}
                  placeholder="Manter atual"
                  searchPlaceholder="Buscar categoria..."
                  allowCustom
                  icon={<Tag className="h-3.5 w-3.5 text-slate-400" />}
                />
              </div>
              <div>
                <Label className="text-xs">Obra / Centro de custo</Label>
                <Input
                  placeholder="Manter atual"
                  value={obraNome}
                  onChange={(e) => setObraNome(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button onClick={submitClassificar} disabled={isPending || (!contaNome.trim() && !obraNome.trim())} className="bg-emerald-600 hover:bg-emerald-700">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Aplicar classificação
                </Button>
              </DialogFooter>
            </>
          )}

          {aba === "vencimento" && (
            <>
              <p className="text-xs text-slate-500">Define a mesma data de vencimento para todos os {itens.length} títulos selecionados.</p>
              <div>
                <Label className="text-xs">Nova data de vencimento</Label>
                <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} className="mt-1" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button onClick={submitVencimento} disabled={isPending || !dataVenc} className="bg-emerald-600 hover:bg-emerald-700">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Atualizar vencimento
                </Button>
              </DialogFooter>
            </>
          )}

          {aba === "receber" && (
            <>
              {naoRecebidos.length === 0 ? (
                <p className="text-sm text-slate-500 py-2 text-center">Todos os títulos selecionados já estão recebidos.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">Marca {naoRecebidos.length} título{naoRecebidos.length !== 1 ? "s" : ""} como recebido (valor total: {formatBRL(naoRecebidos.reduce((s: number, t: any) => s + num(t.valorPrevisto), 0))}).</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Data de recebimento</Label>
                      <Input type="date" value={dataReceber} onChange={(e) => setDataReceber(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Forma de pagamento</Label>
                      <Combobox
                        value={forma}
                        onChange={setForma}
                        options={["PIX","Transferência","Boleto","Dinheiro","Cheque","Cartão"].map((f) => ({ value: f, label: f }))}
                        placeholder="—"
                        searchPlaceholder="Buscar..."
                      />
                    </div>
                  </div>
                </>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                {naoRecebidos.length > 0 && (
                  <Button onClick={submitReceber} disabled={isPending || !dataReceber} className="bg-emerald-600 hover:bg-emerald-700">
                    {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Marcar recebido
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </div>
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
