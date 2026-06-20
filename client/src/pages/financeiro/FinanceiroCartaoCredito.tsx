import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { BandeiraLogo, ChipCartao, bandeiraGradiente } from "@/components/BandeiraCartao";
import {
  CreditCard, Upload, Loader2, CheckCircle, AlertTriangle, Trash2, Pencil,
  ChevronLeft, ChevronRight, PlusCircle, ListTree, FileText, Building2, ShieldAlert,
  Search, Layers, BarChart3, TrendingUp, TrendingDown, Minus,
  PieChart as PieIcon, Repeat, Percent, Store, Receipt, Wallet, ListFilter,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

function formatBRL(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
// Máscara de moeda BRL (digita centavos → "1.234,56"; ponto p/ milhar, vírgula p/ centavos).
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
function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ANO_ATUAL = new Date().getFullYear();
// Rev. 3331 — cores do gráfico do comparativo: barra colorida por tendência vs o
// mês anterior com fatura (espelha as setas da tabela). Navy = base/1º mês.
const TREND_COLOR: Record<"up" | "down" | "flat", string> = { up: "#dc2626", down: "#059669", flat: "#1B2A4A" };

// Tooltip do gráfico de barras do comparativo (valor BRL + variação vs mês anterior).
function ComparativoTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || !d.total) return null;
  const trendTxt =
    d.pct == null ? "1º mês com fatura"
    : d.trend === "flat" ? "sem variação vs mês anterior"
    : `${d.pct > 0 ? "+" : ""}${d.pct.toFixed(0)}% vs mês anterior`;
  const trendColor = d.trend === "up" ? "text-red-600" : d.trend === "down" ? "text-emerald-600" : "text-gray-500";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-gray-800">{d.mes}</p>
      <p className="text-sm font-bold tabular-nums text-[#1B2A4A]">{formatBRL(d.total)}</p>
      <p className={`text-[11px] ${trendColor}`}>{trendTxt}</p>
    </div>
  );
}

// Célula do comparativo mês a mês: valor da fatura do mês + seta/% vs o mês
// ANTERIOR QUE TEVE FATURA (pula meses sem fatura). Subiu = vermelho (gasto maior);
// abaixou = verde; sem mês anterior = traço.
function renderCelulaComparativo(meses: number[], mes: number) {
  const valor = meses[mes] || 0;
  if (valor === 0) return <span className="text-gray-300">—</span>;
  // procura o mês anterior (1..mes-1) com fatura > 0
  let anterior = 0;
  for (let m = mes - 1; m >= 1; m--) {
    if ((meses[m] || 0) > 0) { anterior = meses[m]; break; }
  }
  let delta: React.ReactNode = null;
  if (anterior > 0) {
    const diff = valor - anterior;
    const pct = (diff / anterior) * 100;
    if (Math.abs(pct) < 0.05) {
      delta = (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
          <Minus className="w-3 h-3" /> 0%
        </span>
      );
    } else {
      const subiu = diff > 0;
      delta = (
        <span className={`inline-flex items-center gap-0.5 text-[10px] ${subiu ? "text-red-600" : "text-emerald-600"}`}>
          {subiu ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {subiu ? "+" : ""}{pct.toFixed(0)}%
        </span>
      );
    }
  }
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-gray-800">{formatBRL(valor)}</span>
      {delta}
    </div>
  );
}

function tipoBadge(t: string) {
  switch (t) {
    case "compra": return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Compra</Badge>;
    case "encargo": return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Encargo</Badge>;
    case "credito": return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Crédito</Badge>;
    default: return <Badge variant="outline">{t || "—"}</Badge>;
  }
}

const CARTAO_FORM_INICIAL = {
  banco: "", bandeira: "", final4: "", titular: "", tipoPessoa: "PJ", status: "ativo",
  diaFechamento: "", diaVencimento: "", limite: "", observacao: "",
};

const STATUS_CARTAO_OPCOES = [
  { value: "ativo", label: "Ativo" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "renegociado", label: "Renegociado" },
  { value: "cancelado", label: "Cancelado" },
  { value: "inativo", label: "Inativo" },
] as const;

function statusCartaoBadge(status?: string) {
  const s = (status || "ativo").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    ativo: { label: "Ativo", cls: "bg-green-100 text-green-700 hover:bg-green-100" },
    bloqueado: { label: "Bloqueado", cls: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
    renegociado: { label: "Renegociado", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
    cancelado: { label: "Cancelado", cls: "bg-red-100 text-red-700 hover:bg-red-100" },
    inativo: { label: "Inativo", cls: "bg-gray-200 text-gray-600 hover:bg-gray-200" },
  };
  const it = map[s] || map.ativo;
  return <Badge className={it.cls}>{it.label}</Badge>;
}

export default function FinanceiroCartaoCredito() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [aba, setAba] = useState<"cartoes" | "faturas" | "comparativo" | "gerencial">("cartoes");

  // ── Cartões ──────────────────────────────────────────────────────────
  const cartoesQ = (trpc as any).cartao.listarCartoes.useQuery(
    { companyId: companyId!, incluirInativos: true },
    { enabled: !!companyId },
  );
  const cartoes = (cartoesQ.data ?? []) as any[];
  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo === 1 || c.ativo === true), [cartoes]);

  const [cartaoModal, setCartaoModal] = useState(false);
  const [cartaoEdit, setCartaoEdit] = useState<any | null>(null);
  const [cartaoForm, setCartaoForm] = useState({ ...CARTAO_FORM_INICIAL });
  const [cartaoExcluir, setCartaoExcluir] = useState<any | null>(null);

  const criarCartao = (trpc as any).cartao.criarCartao.useMutation();
  const atualizarCartao = (trpc as any).cartao.atualizarCartao.useMutation();
  const excluirCartao = (trpc as any).cartao.excluirCartao.useMutation();

  function abrirNovoCartao() {
    setCartaoEdit(null);
    setCartaoForm({ ...CARTAO_FORM_INICIAL });
    setCartaoModal(true);
  }
  function abrirEditarCartao(c: any) {
    setCartaoEdit(c);
    setCartaoForm({
      banco: c.banco ?? "", bandeira: c.bandeira ?? "", final4: c.final4 ?? "",
      titular: c.titular ?? "", tipoPessoa: c.tipoPessoa ?? "PJ", status: c.status ?? "ativo",
      diaFechamento: c.diaFechamento != null ? String(c.diaFechamento) : "",
      diaVencimento: c.diaVencimento != null ? String(c.diaVencimento) : "",
      limite: c.limite != null ? maskBRL(String(Math.round(Number(c.limite) * 100))) : "",
      observacao: c.observacao ?? "",
    });
    setCartaoModal(true);
  }
  async function salvarCartao() {
    if (!companyId) return;
    const base = {
      companyId,
      banco: cartaoForm.banco.trim() || undefined,
      bandeira: cartaoForm.bandeira.trim() || undefined,
      final4: cartaoForm.final4.trim() || undefined,
      titular: cartaoForm.titular.trim() || undefined,
      tipoPessoa: cartaoForm.tipoPessoa as "PF" | "PJ",
      status: cartaoForm.status as "ativo" | "bloqueado" | "renegociado" | "cancelado" | "inativo",
      diaFechamento: cartaoForm.diaFechamento ? parseInt(cartaoForm.diaFechamento, 10) : null,
      diaVencimento: cartaoForm.diaVencimento ? parseInt(cartaoForm.diaVencimento, 10) : null,
      limite: cartaoForm.limite.trim() === "" ? null : parseMaskBRL(cartaoForm.limite),
      observacao: cartaoForm.observacao.trim() || undefined,
    };
    try {
      let novoId: number | null = null;
      if (cartaoEdit) await atualizarCartao.mutateAsync({ id: cartaoEdit.id, ...base });
      else { const r = await criarCartao.mutateAsync(base); novoId = r?.id ?? null; }
      toast({ title: cartaoEdit ? "Cartão atualizado" : "Cartão cadastrado" });
      setCartaoModal(false);
      cartoesQ.refetch();
      // Cadastro vindo do preview do import → vincula na hora a(s) fatura(s) do mesmo final4.
      // Usa o final4 EFETIVAMENTE SALVO (cartaoForm), não o capturado na abertura do modal
      // (o usuário pode ter editado o campo antes de salvar → re-casar pelo valor real).
      if (novoId && importCadastroRef.current) {
        rematchPreview(last4(cartaoForm.final4), novoId);
        importCadastroRef.current = null;
      }
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || String(e), variant: "destructive" });
    }
  }
  async function confirmarExcluirCartao() {
    if (!companyId || !cartaoExcluir) return;
    try {
      await excluirCartao.mutateAsync({ id: cartaoExcluir.id, companyId });
      toast({ title: "Cartão excluído" });
      setCartaoExcluir(null);
      cartoesQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Faturas (régua ano/mês) ──────────────────────────────────────────
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [cartaoFiltro, setCartaoFiltro] = useState<number | null>(null);

  const resumoMensalQ = (trpc as any).cartao.resumoMensal.useQuery(
    { companyId: companyId!, ano, cartaoId: cartaoFiltro ?? undefined },
    { enabled: !!companyId && aba === "faturas" },
  );
  const resumoMensal = (resumoMensalQ.data ?? []) as any[];

  const faturasQ = (trpc as any).cartao.listarFaturas.useQuery(
    { companyId: companyId!, ano, mes: mesSel ?? undefined, cartaoId: cartaoFiltro ?? undefined },
    { enabled: !!companyId && aba === "faturas" },
  );
  const faturas = (faturasQ.data ?? []) as any[];
  const totalFaturasMes = useMemo(() => faturas.reduce((a, f) => a + (f.total ?? 0), 0), [faturas]);

  // ── Comparativo mês a mês (matriz cartão × mês) ──────────────────────
  const comparativoQ = (trpc as any).cartao.comparativoMensal.useQuery(
    { companyId: companyId!, ano },
    { enabled: !!companyId && aba === "comparativo" },
  );
  const comparativoRaw = (comparativoQ.data ?? []) as Array<{ cartaoId: number; mes: number; total: number; qtd: number }>;
  // Monta linhas: uma por cartão (com fatura no ano) + linha "Total geral".
  const comparativo = useMemo(() => {
    // total[cartaoId][mes 1..12] = valor da fatura daquele mês
    const porCartao = new Map<number, number[]>();
    for (const r of comparativoRaw) {
      if (!r.mes || r.mes < 1 || r.mes > 12) continue;
      if (!porCartao.has(r.cartaoId)) porCartao.set(r.cartaoId, Array(13).fill(0));
      const arr = porCartao.get(r.cartaoId)!;
      arr[r.mes] += r.total || 0;
    }
    const labelCartao = (id: number) => {
      const c = cartoes.find((x: any) => x.id === id);
      if (!c) return `Cartão #${id}`;
      const banco = c.banco || "Cartão";
      return c.final4 ? `${banco} · final ${c.final4}` : banco;
    };
    const linhas = Array.from(porCartao.entries())
      .map(([cartaoId, meses]) => ({
        cartaoId,
        label: labelCartao(cartaoId),
        meses,
        totalAno: meses.reduce((a, v) => a + v, 0),
      }))
      .filter((l) => l.totalAno > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    // Linha total geral (soma de todos os cartões por mês)
    const totalGeral = Array(13).fill(0);
    for (const l of linhas) for (let m = 1; m <= 12; m++) totalGeral[m] += l.meses[m];
    return { linhas, totalGeral, totalGeralAno: totalGeral.reduce((a, v) => a + v, 0) };
  }, [comparativoRaw, cartoes]);

  // ── Dados do gráfico de barras (total geral por mês) + KPIs do ano ─────
  const comparativoChart = useMemo(() => {
    const tg = comparativo.totalGeral; // array[13] = total geral por mês
    const data: Array<{ mes: string; total: number; pct: number | null; trend: "up" | "down" | "flat" }> = [];
    let prev = 0;
    for (let m = 1; m <= 12; m++) {
      const total = tg[m] || 0;
      let pct: number | null = null;
      if (total > 0 && prev > 0) pct = ((total - prev) / prev) * 100;
      let trend: "up" | "down" | "flat" = "flat";
      if (pct != null) trend = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
      data.push({ mes: MESES[m], total, pct, trend });
      if (total > 0) prev = total;
    }
    const comMov = data.filter((d) => d.total > 0);
    const maior = comMov.length ? comMov.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const menor = comMov.length ? comMov.reduce((a, b) => (b.total < a.total ? b : a)) : null;
    const mediaMensal = comMov.length ? comMov.reduce((a, b) => a + b.total, 0) / comMov.length : 0;
    return { data, maior, menor, mediaMensal, mesesComMov: comMov.length };
  }, [comparativo]);

  // ── Análise gerencial (itens da fatura) ──────────────────────────────
  const gerencialQ = (trpc as any).cartao.analiseGerencial.useQuery(
    { companyId: companyId!, ano, ...(cartaoFiltro != null ? { cartaoId: cartaoFiltro } : {}) },
    { enabled: !!companyId && aba === "gerencial" },
  );
  const gerencialRaw = gerencialQ.data as {
    porTipo: Array<{ tipo: string; qtd: number; total: number }>;
    porMes: Array<{ mes: number; tipo: string; total: number }>;
    perfilParcelas: Array<{ parcelas: number; qtd: number; total: number }>;
    estabelecimentos: Array<{ est: string; vezes: number; meses: number; total: number; maxParcelas: number }>;
    encargos: Array<{ est: string; qtd: number; total: number }>;
    porObra: Array<{ obra: string; qtd: number; total: number }>;
    porCategoria: Array<{ cat: string; qtd: number; total: number }>;
  } | undefined;

  // Classifica um encargo pela descrição (IOF, Anuidade, Juros, Multa, Outros).
  const classifEncargo = (est: string): string => {
    const s = (est || "").toUpperCase();
    if (s.includes("IOF")) return "IOF";
    if (s.includes("ANUIDADE")) return "Anuidade";
    if (s.includes("JURO")) return "Juros";
    if (s.includes("MULTA") || s.includes("MORA")) return "Multa/Mora";
    if (s.includes("SEGURO")) return "Seguro";
    if (s.includes("TARIFA") || s.includes("TAXA")) return "Tarifas";
    return "Outros encargos";
  };

  const gerencial = useMemo(() => {
    const d = gerencialRaw;
    if (!d) return null;
    // KPIs por tipo (compra positivo; crédito chega negativo no banco).
    const tot = (t: string) => d.porTipo.find((x) => x.tipo === t)?.total ?? 0;
    const qtdT = (t: string) => d.porTipo.find((x) => x.tipo === t)?.qtd ?? 0;
    const totalCompras = tot("compra");
    const totalEncargos = tot("encargo");
    const totalCreditos = Math.abs(tot("credito"));
    const qtdCompras = qtdT("compra");
    const ticketMedio = qtdCompras > 0 ? totalCompras / qtdCompras : 0;

    // Perfil de parcelamento: à vista (1x) vs parcelado (>1x).
    const aVista = d.perfilParcelas.filter((p) => p.parcelas <= 1).reduce((a, p) => a + p.total, 0);
    const parcelado = d.perfilParcelas.filter((p) => p.parcelas > 1).reduce((a, p) => a + p.total, 0);
    const pctParcelado = totalCompras > 0 ? (parcelado / totalCompras) * 100 : 0;

    // Composição por tipo (pizza) — usa valores absolutos.
    const COMPOSICAO_COR: Record<string, string> = { compra: "#1B2A4A", encargo: "#dc2626", credito: "#059669" };
    const COMPOSICAO_LABEL: Record<string, string> = { compra: "Compras", encargo: "Encargos/Juros", credito: "Créditos/Pagamentos" };
    const composicao = d.porTipo
      .map((t) => ({ key: t.tipo, name: COMPOSICAO_LABEL[t.tipo] ?? t.tipo, value: Math.abs(t.total), qtd: t.qtd, color: COMPOSICAO_COR[t.tipo] ?? "#94a3b8" }))
      .filter((x) => x.value > 0);

    // Evolução mês a mês (barras agrupadas): compra × encargo × |crédito|.
    const porMesMap = new Map<number, { mes: string; mesNum: number; compra: number; encargo: number; credito: number }>();
    for (let m = 1; m <= 12; m++) porMesMap.set(m, { mes: MESES[m], mesNum: m, compra: 0, encargo: 0, credito: 0 });
    for (const r of d.porMes) {
      const slot = porMesMap.get(r.mes);
      if (!slot) continue;
      if (r.tipo === "compra") slot.compra += r.total;
      else if (r.tipo === "encargo") slot.encargo += r.total;
      else if (r.tipo === "credito") slot.credito += Math.abs(r.total);
    }
    const evolucao = Array.from(porMesMap.values());
    const evolucaoTemDado = evolucao.some((e) => e.compra || e.encargo || e.credito);

    // Perfil de parcelamento (barras): label "À vista", "2x"..."Nx".
    const perfil = d.perfilParcelas.map((p) => ({
      label: p.parcelas <= 1 ? "À vista" : `${p.parcelas}x`,
      parcelas: p.parcelas,
      qtd: p.qtd,
      total: p.total,
    }));

    // Encargos agrupados por natureza (IOF/Anuidade/Juros/…).
    const encMap = new Map<string, { nome: string; total: number; qtd: number }>();
    for (const e of d.encargos) {
      const nome = classifEncargo(e.est);
      const cur = encMap.get(nome) ?? { nome, total: 0, qtd: 0 };
      cur.total += e.total; cur.qtd += e.qtd;
      encMap.set(nome, cur);
    }
    const encargosNatureza = Array.from(encMap.values()).sort((a, b) => b.total - a.total);

    // Obras: detecta se há classificação real (algo diferente de "(sem obra)").
    const obrasClassificadas = d.porObra.some((o) => o.obra !== "(sem obra)");
    const categoriasClassificadas = d.porCategoria.some((c) => c.cat !== "(sem categoria)");

    const temDados = d.porTipo.length > 0;

    return {
      totalCompras, totalEncargos, totalCreditos, qtdCompras, ticketMedio,
      aVista, parcelado, pctParcelado,
      composicao, evolucao, evolucaoTemDado, perfil,
      estabelecimentos: d.estabelecimentos, encargosNatureza,
      porObra: d.porObra, porCategoria: d.porCategoria,
      obrasClassificadas, categoriasClassificadas, temDados,
    };
  }, [gerencialRaw]);

  // ── Drill-in: clicar num ponto do gráfico abre os lançamentos por trás ──
  const [drill, setDrill] = useState<{ titulo: string; sub: string; filtro: Record<string, any> } | null>(null);
  const abrirDrill = (titulo: string, sub: string, filtro: Record<string, any>) => setDrill({ titulo, sub, filtro });
  const drillQ = (trpc as any).cartao.itensDrill.useQuery(
    { companyId: companyId!, ano, ...(cartaoFiltro != null ? { cartaoId: cartaoFiltro } : {}), ...(drill?.filtro ?? {}) },
    { enabled: !!companyId && !!drill && aba === "gerencial" },
  );
  const drillData = drillQ.data as { itens: any[]; qtd: number; total: number; truncado: boolean } | undefined;

  const excluirFatura = (trpc as any).cartao.excluirFatura.useMutation();
  const [faturaExcluir, setFaturaExcluir] = useState<any | null>(null);
  async function confirmarExcluirFatura() {
    if (!companyId || !faturaExcluir) return;
    try {
      await excluirFatura.mutateAsync({ id: faturaExcluir.id, companyId });
      toast({ title: "Fatura excluída" });
      setFaturaExcluir(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao excluir fatura", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Vincular fatura ⇄ cartão (botão "Vincular" da aba Faturas) ──────────
  const vincularFatura = (trpc as any).cartao.vincularFaturaCartao.useMutation();
  const [faturaVincular, setFaturaVincular] = useState<any | null>(null);
  const [vincularCartaoId, setVincularCartaoId] = useState<string>("none");
  function abrirVincular(f: any) {
    setFaturaVincular(f);
    setVincularCartaoId(f.cartaoId != null ? String(f.cartaoId) : "none");
  }
  async function salvarVincular() {
    if (!companyId || !faturaVincular) return;
    try {
      await vincularFatura.mutateAsync({
        id: faturaVincular.id,
        companyId,
        cartaoId: vincularCartaoId === "none" ? null : parseInt(vincularCartaoId, 10),
      });
      toast({ title: "Fatura vinculada ao cartão" });
      setFaturaVincular(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao vincular", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Importação por IA ────────────────────────────────────────────────
  const [importModal, setImportModal] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  // Rev. 3267 — barra de progresso 0→100% durante a leitura por IA. Como a leitura é UMA
  // chamada só (sem stream), o progresso é ESTIMADO: sobe assintoticamente até 95% enquanto
  // espera e crava 100% ao concluir.
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");
  // Rev. 3375 — import em LOTE: vários PDFs de uma vez. Acompanha "arquivo X de N" e
  // acumula as falhas (arquivos que a IA não conseguiu ler) sem abortar o resto.
  const [importFalhas, setImportFalhas] = useState<{ nome: string; erro: string }[]>([]);
  const progTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Quando o modal de cartão é aberto a partir do preview do import (sugestão de
  // cadastro), guarda o final4 p/ re-casar a(s) fatura(s) assim que o cartão for criado.
  const importCadastroRef = useRef<string | null>(null);
  const importarPreview = (trpc as any).cartao.importarPreview.useMutation();
  const importarConfirmar = (trpc as any).cartao.importarConfirmar.useMutation();

  function pararProgresso() {
    if (progTimer.current) { clearInterval(progTimer.current); progTimer.current = null; }
  }
  function iniciarProgresso(label: string) {
    pararProgresso();
    setImportPct(3);
    setImportLabel(label);
    progTimer.current = setInterval(() => {
      setImportPct((p) => {
        if (p >= 95) return 95;
        const inc = p < 50 ? 4 : p < 80 ? 2 : 1; // desacelera conforme sobe
        return Math.min(95, p + inc);
      });
    }, 350);
  }

  // Rev. 3267 — garante que o timer de progresso seja sempre limpo no unmount
  // (evita setInterval órfão atualizando estado após o componente sair de tela).
  useEffect(() => () => pararProgresso(), []);

  function abrirImport() {
    pararProgresso(); setImportPct(0); setImportLabel("");
    setPreview(null); setArquivoNome(""); setImportFalhas([]); setImportModal(true);
  }

  // Últimos 4 dígitos (normaliza qualquer formato) — usado p/ casar fatura ↔ cartão.
  const last4 = (s: any) => String(s ?? "").replace(/[^0-9]/g, "").slice(-4);

  // Monta o objeto de preview consolidado (várias faturas de N arquivos) com o resumo.
  function montarPreview(faturas: any[], ccAdmin: string | null) {
    return {
      faturas,
      resumo: {
        totalFaturas: faturas.length,
        totalItens: faturas.reduce((a, f) => a + (f.qtdItens ?? (f.itens?.length ?? 0)), 0),
        naoIdentificadas: faturas.filter((f) => !f.cartaoIdentificado).length,
        ccAdministrativo: ccAdmin,
      },
    };
  }

  // Re-casa o preview quando um cartão é cadastrado a partir da sugestão: toda fatura
  // não identificada com o MESMO final4 passa a apontar pro cartão recém-criado.
  function rematchPreview(final4: any, cartaoId: number) {
    const d = last4(final4);
    if (d.length < 4 || !cartaoId) return;
    setPreview((prev: any) => {
      if (!prev) return prev;
      const faturas = prev.faturas.map((f: any) =>
        !f.cartaoIdentificado && last4(f.cartaoFinal4) === d
          ? { ...f, cartaoIdSugerido: cartaoId, cartaoIdentificado: true }
          : f,
      );
      return { faturas, resumo: { ...prev.resumo, naoIdentificadas: faturas.filter((x: any) => !x.cartaoIdentificado).length } };
    });
  }

  // Abre o modal de cartão JÁ PRÉ-PREENCHIDO com os dados extraídos pela IA, pra
  // facilitar o cadastro do cartão que a fatura não reconheceu.
  function cadastrarCartaoDoImport(f: any) {
    setCartaoEdit(null);
    setCartaoForm({
      ...CARTAO_FORM_INICIAL,
      banco: f.banco ?? "",
      bandeira: f.bandeira ?? "",
      final4: last4(f.cartaoFinal4),
      titular: f.cartaoTitular ?? "",
    });
    importCadastroRef.current = last4(f.cartaoFinal4);
    setCartaoModal(true);
  }

  async function onArquivosSelecionados(files: FileList | null) {
    if (!files || files.length === 0 || !companyId) return;
    const arr = Array.from(files);
    setImportBusy(true); setPreview(null); setImportFalhas([]);
    setArquivoNome(arr.length === 1 ? arr[0].name : `${arr.length} arquivos`);
    const todasFaturas: any[] = [];
    const falhas: { nome: string; erro: string }[] = [];
    let ccAdmin: string | null = null;
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      iniciarProgresso(arr.length > 1 ? `Lendo ${i + 1}/${arr.length}: "${file.name}"…` : `Lendo "${file.name}" com a IA…`);
      try {
        const b64 = await fileToBase64(file);
        const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
        const res = await importarPreview.mutateAsync({ companyId, fileBase64: b64, mimeType: mime });
        pararProgresso(); setImportPct(100);
        if (res?.resumo?.ccAdministrativo && !ccAdmin) ccAdmin = res.resumo.ccAdministrativo;
        for (const f of (res?.faturas ?? [])) todasFaturas.push({ ...f, origemArquivo: file.name });
      } catch (e: any) {
        pararProgresso();
        falhas.push({ nome: file.name, erro: e?.message || String(e) });
      }
    }
    pararProgresso();
    setImportBusy(false);
    setImportFalhas(falhas);
    if (todasFaturas.length === 0) {
      setImportPct(0); setImportLabel("");
      toast({
        title: falhas.length ? "Falha ao ler as faturas" : "Nenhuma fatura encontrada",
        description: falhas.length ? `${falhas.length} arquivo(s) não puderam ser lidos.` : "A IA não encontrou faturas nos arquivos.",
        variant: "destructive",
      });
      return;
    }
    setImportLabel("Leitura concluída");
    setPreview(montarPreview(todasFaturas, ccAdmin));
  }
  async function confirmarImport() {
    if (!companyId || !preview?.faturas?.length) return;
    setImportBusy(true);
    try {
      const payload = preview.faturas.map((f: any) => ({
        cartaoId: f.cartaoIdSugerido ?? null,
        origemArquivo: f.origemArquivo ?? null,
        cartaoFinal4: f.cartaoFinal4 ?? null,
        cartaoTitular: f.cartaoTitular ?? null,
        banco: f.banco ?? null, bandeira: f.bandeira ?? null,
        vencimento: f.vencimento ?? null, fechamento: f.fechamento ?? null,
        total: f.total ?? null, totalCompras: f.totalCompras ?? null,
        faturaAnterior: f.faturaAnterior ?? null, pagamentos: f.pagamentos ?? null,
        mesRef: f.mesRef ?? null, anoRef: f.anoRef ?? null,
        itens: (f.itens ?? []).map((it: any) => ({
          data: it.data ?? null, descricao: it.descricao ?? null, cidade: it.cidade ?? null,
          valor: it.valor ?? null, moeda: it.moeda ?? null, cotacao: it.cotacao ?? null,
          valorOrigem: it.valorOrigem ?? null, parcelaAtual: it.parcelaAtual ?? null,
          parcelaTotal: it.parcelaTotal ?? null, tipo: it.tipo ?? null,
          centroCustoSugeridoId: it.centroCustoSugeridoId ?? null,
          centroCustoSugeridoNome: it.centroCustoSugeridoNome ?? null,
        })),
      }));
      const res = await importarConfirmar.mutateAsync({ companyId, origemArquivo: arquivoNome, faturas: payload });
      toast({
        title: "Importação concluída",
        description: `${res.faturasInseridas} fatura(s) · ${res.itensInseridos} item(ns)${res.faturasPuladas ? ` · ${res.faturasPuladas} já existia(m)` : ""}`,
      });
      setImportModal(false); setPreview(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao gravar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setImportBusy(false);
    }
  }

  // ── Itens da fatura (classificação) ──────────────────────────────────
  const [faturaItens, setFaturaItens] = useState<any | null>(null);
  const itensQ = (trpc as any).cartao.listarItens.useQuery(
    { companyId: companyId!, faturaId: faturaItens?.id },
    { enabled: !!companyId && !!faturaItens?.id },
  );
  const itens = (itensQ.data ?? []) as any[];
  const classificarItem = (trpc as any).cartao.classificarItem.useMutation();

  const accountsQ = (trpc as any).financial.getAccounts.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const costCentersQ = (trpc as any).financial.getCostCenters.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const obrasQ = (trpc as any).obras.listActive.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const categorias = (accountsQ.data ?? []) as any[];
  const costCenters = (costCentersQ.data ?? []) as any[];
  const obras = (obrasQ.data ?? []) as any[];

  async function aplicarClassificacao(item: any, patch: any) {
    if (!companyId) return;
    try {
      await classificarItem.mutateAsync({ id: item.id, companyId, ...patch });
      itensQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao classificar", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Filtros, resumo e classificação em massa dos itens da fatura ─────
  const [itemBusca, setItemBusca] = useState("");
  const [itemStatus, setItemStatus] = useState<"todos" | "pendente" | "sugerido" | "confirmado" | "ignorado">("todos");
  const [bulkObra, setBulkObra] = useState("keep");
  const [bulkCC, setBulkCC] = useState("keep");
  const [bulkCat, setBulkCat] = useState("keep");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  function resetFaturaFiltros() {
    setItemBusca(""); setItemStatus("todos");
    setBulkObra("keep"); setBulkCC("keep"); setBulkCat("keep");
    setBulkOpen(false);
  }

  const itensFiltrados = useMemo(() => {
    const q = itemBusca.trim().toLowerCase();
    return itens.filter((it) => {
      if (q && !(`${it.descricao || ""} ${it.cidade || ""}`.toLowerCase().includes(q))) return false;
      if (itemStatus === "pendente") return it.obraId == null;
      if (itemStatus !== "todos") return (it.statusClassificacao || "sugerido") === itemStatus;
      return true;
    });
  }, [itens, itemBusca, itemStatus]);

  const resumoItens = useMemo(() => {
    let classificados = 0, confirmados = 0, pendentes = 0, valorConf = 0, valorPend = 0;
    for (const it of itens) {
      const v = Number(it.valor) || 0;
      if (it.obraId != null) classificados++; else { pendentes++; valorPend += v; }
      if ((it.statusClassificacao || "") === "confirmado") { confirmados++; valorConf += v; }
    }
    const pct = itens.length ? Math.round((classificados / itens.length) * 100) : 0;
    return { total: itens.length, classificados, confirmados, pendentes, valorConf, valorPend, pct };
  }, [itens]);

  async function aplicarBulk() {
    if (!companyId) return;
    const alvos = itensFiltrados;
    if (alvos.length === 0) { setBulkOpen(false); return; }
    const o = obras.find((x) => String(x.id) === bulkObra);
    const cc = costCenters.find((x) => String(x.id) === bulkCC);
    const cat = categorias.find((x) => String(x.id) === bulkCat);
    const patch: any = {};
    if (bulkObra !== "keep") { patch.obraId = bulkObra === "none" ? null : parseInt(bulkObra, 10); patch.obraNome = bulkObra === "none" ? null : (o ? (o.nome ?? o.name ?? null) : null); }
    if (bulkCC !== "keep") { patch.centroCustoId = bulkCC === "none" ? null : parseInt(bulkCC, 10); patch.centroCustoNome = bulkCC === "none" ? null : (cc ? cc.nome : null); }
    if (bulkCat !== "keep") { patch.categoriaId = bulkCat === "none" ? null : parseInt(bulkCat, 10); patch.categoriaNome = bulkCat === "none" ? null : (cat ? cat.nome : null); }
    if (Object.keys(patch).length === 0) { setBulkOpen(false); return; }
    setBulkBusy(true);
    try {
      for (const it of alvos) {
        await classificarItem.mutateAsync({ id: it.id, companyId, ...patch });
      }
      await itensQ.refetch();
      toast({ title: "Classificação aplicada", description: `${alvos.length} item(ns) atualizados.` });
      setBulkOpen(false);
      setBulkObra("keep"); setBulkCC("keep"); setBulkCat("keep");
    } catch (e: any) {
      toast({ title: "Erro ao aplicar em massa", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-700" /> Controle de Cartão de Crédito
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Cadastro de cartões, importação de faturas (PDF lido por IA) e classificação de gastos por obra/centro de custo. O cartão NÃO vira lançamento — é controle.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant={aba === "cartoes" ? "default" : "outline"} size="sm" onClick={() => setAba("cartoes")}>
              <CreditCard className="w-4 h-4 mr-1" /> Cartões
            </Button>
            <Button variant={aba === "faturas" ? "default" : "outline"} size="sm" onClick={() => setAba("faturas")}>
              <FileText className="w-4 h-4 mr-1" /> Faturas
            </Button>
            <Button variant={aba === "comparativo" ? "default" : "outline"} size="sm" onClick={() => setAba("comparativo")}>
              <BarChart3 className="w-4 h-4 mr-1" /> Comparativo
            </Button>
            <Button variant={aba === "gerencial" ? "default" : "outline"} size="sm" onClick={() => setAba("gerencial")}>
              <PieIcon className="w-4 h-4 mr-1" /> Gerencial
            </Button>
          </div>
        </div>

        {/* ───────────── ABA CARTÕES ───────────── */}
        {aba === "cartoes" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Cartões cadastrados ({cartoesAtivos.length})</CardTitle>
              <Button size="sm" onClick={abrirNovoCartao}><PlusCircle className="w-4 h-4 mr-1" /> Novo cartão</Button>
            </CardHeader>
            <CardContent>
              {cartoesQ.isLoading ? (
                <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
              ) : cartoes.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">Nenhum cartão cadastrado. Clique em "Novo cartão".</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cartoes.map((c) => {
                    const ativo = c.ativo === 1 || c.ativo === true;
                    return (
                      <div
                        key={c.id}
                        className={`group rounded-xl border overflow-hidden bg-white shadow-sm transition hover:shadow-md ${c.alertaPessoal ? "border-amber-300" : "border-gray-200"} ${ativo ? "" : "opacity-60"}`}
                      >
                        {/* Faixa superior — estilo cartão físico */}
                        <div className={`relative px-4 pt-3 pb-4 text-white ${bandeiraGradiente(c.bandeira)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm truncate text-white drop-shadow-sm">{c.banco || "Banco —"}</p>
                            <div className="shrink-0 flex items-center min-h-[24px]">
                              <BandeiraLogo bandeira={c.bandeira} />
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <ChipCartao />
                            <span className="font-mono tracking-[0.18em] text-sm text-white/95">
                              ••••&nbsp;••••&nbsp;••••&nbsp;{c.final4 || "????"}
                            </span>
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase tracking-wider text-white/60">Titular</p>
                              <p className="text-xs font-medium truncate text-white/95">{c.titular || "sem titular"}</p>
                            </div>
                            <Badge
                              variant={c.tipoPessoa === "PF" ? "outline" : "secondary"}
                              className={c.tipoPessoa === "PF" ? "border-white/60 text-white bg-white/10" : "bg-white/20 text-white border-transparent hover:bg-white/20"}
                            >
                              {c.tipoPessoa}
                            </Badge>
                          </div>
                        </div>

                        {/* Corpo branco — dados + ações */}
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            {statusCartaoBadge(c.status)}
                            <span className="text-xs text-muted-foreground">
                              Limite: <b className="text-foreground">{c.limite != null ? formatBRL(c.limite) : "—"}</b>
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>Fecha dia: <b className="text-foreground">{c.diaFechamento ?? "—"}</b></span>
                            <span>Vence dia: <b className="text-foreground">{c.diaVencimento ?? "—"}</b></span>
                          </div>
                          {c.alertaPessoal && (
                            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-100/60 rounded p-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>Cartão <b>pessoal (PF)</b> usado pela empresa. Avalie regularização (cartão PJ ou reembolso ao titular).</span>
                            </div>
                          )}
                          <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                            <Button size="sm" variant="ghost" onClick={() => abrirEditarCartao(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setCartaoExcluir(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ───────────── ABA FATURAS ───────────── */}
        {aba === "faturas" && (
          <>
            {/* Navegação Ano + Meses (padrão Contas a Pagar) */}
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
                    <Button size="sm" variant={mesSel == null ? "default" : "outline"} className="ml-2 h-7" onClick={() => setMesSel(null)}>Ano todo</Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Com fatura</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem fatura</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MESES.slice(1).map((m, i) => {
                    const num = i + 1;
                    const r = resumoMensal.find((x) => x.mes === num);
                    const temFatura = !!r && r.qtd > 0;
                    const isSelected = mesSel === num;
                    return (
                      <button
                        key={num}
                        onClick={() => setMesSel(num)}
                        className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                          ${isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        <span>{m}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${temFatura ? "bg-green-500" : "bg-gray-300"}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <div className="text-sm text-muted-foreground">
                    {faturas.length} fatura(s) {mesSel != null ? `em ${MESES[mesSel]}/${ano}` : `em ${ano}`} · total <b className="text-foreground">{formatBRL(totalFaturasMes)}</b>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Select value={cartaoFiltro != null ? String(cartaoFiltro) : "all"} onValueChange={(v) => setCartaoFiltro(v === "all" ? null : parseInt(v, 10))}>
                      <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Todos os cartões" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os cartões</SelectItem>
                        {cartoesAtivos.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.banco || "Banco"} · final {c.final4 || "????"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={abrirImport}><Upload className="w-4 h-4 mr-1" /> Importar fatura</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                {faturasQ.isLoading ? (
                  <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
                ) : faturas.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">Nenhuma fatura no período. Importe um PDF de fatura.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-3">Cartão</th>
                          <th className="py-2 pr-3">Vencimento</th>
                          <th className="py-2 pr-3">Fechamento</th>
                          <th className="py-2 pr-3 text-right">Total</th>
                          <th className="py-2 pr-3 text-center">Itens</th>
                          <th className="py-2 pr-3">Ref.</th>
                          <th className="py-2 pr-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faturas.map((f) => (
                          <tr key={f.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 pr-3">
                              {f.cartaoId ? (
                                <span>{f.cartaoBanco || "Banco"} · final {f.cartaoFinal4 || "????"}
                                  {f.cartaoTipoPessoa === "PF" && <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700 text-[10px]">PF</Badge>}
                                </span>
                              ) : (
                                <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Não identificado</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">{fmtData(f.vencimento)}</td>
                            <td className="py-2 pr-3">{fmtData(f.fechamento)}</td>
                            <td className="py-2 pr-3 text-right font-medium">{formatBRL(f.total)}</td>
                            <td className="py-2 pr-3 text-center">{f.qtdItens}</td>
                            <td className="py-2 pr-3">{f.mes ? `${MESES[f.mes]}/${f.ano}` : (f.ano ?? "—")}</td>
                            <td className="py-2 pr-3 text-right">
                              <Button size="sm" variant="outline" className="h-7" onClick={() => abrirVincular(f)}><Pencil className="w-3.5 h-3.5 mr-1" /> Vincular</Button>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => setFaturaItens(f)}><ListTree className="w-3.5 h-3.5 mr-1" /> Classificar</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => setFaturaExcluir(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ───────────── ABA COMPARATIVO (mês a mês) ───────────── */}
        {aba === "comparativo" && (
          <div className="space-y-4">
            <Card className="border-0 shadow-sm overflow-hidden">
              {/* Cabeçalho navy — padrão FC */}
              <div className="flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold leading-tight text-white">Comparativo mês a mês</h2>
                    <p className="text-xs text-white/70">Evolução da fatura de cada cartão em {ano}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAno((a) => a - 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-sm font-bold text-white">{ano}</span>
                  <button onClick={() => setAno((a) => a + 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <CardContent className="p-4">
                {comparativoQ.isLoading ? (
                  <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
                ) : comparativo.linhas.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">Nenhuma fatura importada em {ano}. Importe faturas na aba "Faturas".</div>
                ) : (
                  <>
                    {/* KPIs do ano */}
                    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-xl bg-gradient-to-br from-[#1B2A4A] to-[#2c3f63] p-3 text-white shadow-sm">
                        <p className="text-[10px] uppercase tracking-wider text-white/60">Total {ano}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">{formatBRL(comparativo.totalGeralAno)}</p>
                        <p className="mt-0.5 text-[10px] text-white/60">{comparativoChart.mesesComMov} {comparativoChart.mesesComMov === 1 ? "mês" : "meses"} com fatura</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Maior fatura</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-red-600">{comparativoChart.maior ? formatBRL(comparativoChart.maior.total) : "—"}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{comparativoChart.maior ? `${comparativoChart.maior.mes}/${ano}` : "—"}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Menor fatura</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">{comparativoChart.menor ? formatBRL(comparativoChart.menor.total) : "—"}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{comparativoChart.menor ? `${comparativoChart.menor.mes}/${ano}` : "—"}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Média mensal</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-800">{formatBRL(comparativoChart.mediaMensal)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">por mês com fatura</p>
                      </div>
                    </div>

                    {/* Legenda */}
                    <div className="mb-2 flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-red-600" /> subiu</span>
                      <span className="inline-flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-emerald-600" /> abaixou</span>
                      <span className="inline-flex items-center gap-1"><Minus className="w-3.5 h-3.5 text-gray-400" /> sem variação</span>
                    </div>

                    {/* Tabela */}
                    <div className="-mx-4 overflow-x-auto px-4">
                      <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="bg-gray-50/70 text-xs text-muted-foreground">
                            <th className="sticky left-0 z-10 min-w-[150px] rounded-l-lg bg-gray-50/70 px-3 py-2.5 text-left font-semibold">Cartão</th>
                            {MESES.slice(1).map((m) => (
                              <th key={m} className="min-w-[96px] whitespace-nowrap px-2 py-2.5 text-right font-medium">{m}</th>
                            ))}
                            <th className="min-w-[110px] whitespace-nowrap rounded-r-lg px-3 py-2.5 text-right font-semibold">Total {ano}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparativo.linhas.map((l) => (
                            <tr key={l.cartaoId} className="border-t transition-colors hover:bg-blue-50/40">
                              <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-gray-800">{l.label}</td>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <td key={m} className="px-2 py-2 text-right tabular-nums">
                                  {renderCelulaComparativo(l.meses, m)}
                                </td>
                              ))}
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{formatBRL(l.totalAno)}</td>
                            </tr>
                          ))}
                          {/* Linha Total geral */}
                          <tr className="border-t-2 border-[#1B2A4A]/20 bg-[#1B2A4A]/[0.04] font-semibold">
                            <td className="sticky left-0 z-10 whitespace-nowrap bg-[#f4f6f9] px-3 py-2.5 text-gray-900">Total geral</td>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                              <td key={m} className="px-2 py-2.5 text-right tabular-nums">
                                {renderCelulaComparativo(comparativo.totalGeral, m)}
                              </td>
                            ))}
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900">{formatBRL(comparativo.totalGeralAno)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Gráfico de barras — total geral por mês (comparativo) */}
            {!comparativoQ.isLoading && comparativo.linhas.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <BarChart3 className="h-4 w-4 text-[#1B2A4A]" /> Total geral por mês — {ano}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-[300px] w-full" role="img" aria-label={`Gráfico de barras do total geral de faturas por mês em ${ano}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparativoChart.data} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                        <YAxis
                          tickFormatter={(v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          axisLine={false}
                          tickLine={false}
                          width={84}
                        />
                        <Tooltip content={<ComparativoTooltip />} cursor={{ fill: "rgba(27,42,74,0.05)" }} />
                        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                          {comparativoChart.data.map((d) => (
                            <Cell key={d.mes} fill={TREND_COLOR[d.trend]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#1B2A4A" }} /> base / 1º mês</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#dc2626" }} /> subiu vs mês anterior</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#059669" }} /> abaixou vs mês anterior</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ───────────── ABA GERENCIAL (análise dos itens) ───────────── */}
        {aba === "gerencial" && (
          <div className="space-y-4">
            {/* Cabeçalho navy + navegação de ano */}
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    <PieIcon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold leading-tight text-white">Análise gerencial do cartão</h2>
                    <p className="text-xs text-white/70">Cada compra mapeada por tipo, parcelamento, recorrência, obra e encargos em {ano}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAno((a) => a - 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-sm font-bold text-white">{ano}</span>
                  <button onClick={() => setAno((a) => a + 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <CardContent className="p-4">
                {gerencialQ.isLoading ? (
                  <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando análise…</div>
                ) : gerencialQ.isError ? (
                  <div className="py-10 text-center text-red-600"><AlertTriangle className="w-5 h-5 inline mr-1" /> Erro ao carregar a análise. Tente novamente.</div>
                ) : !gerencial || !gerencial.temDados ? (
                  <div className="py-10 text-center text-muted-foreground">Nenhum item de fatura importado em {ano}. Importe faturas (PDF) na aba "Faturas".</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-xl bg-gradient-to-br from-[#1B2A4A] to-[#2c3f63] p-3 text-white shadow-sm">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/60"><Wallet className="h-3 w-3" /> Compras {ano}</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums">{formatBRL(gerencial.totalCompras)}</p>
                      <p className="mt-0.5 text-[10px] text-white/60">{gerencial.qtdCompras} {gerencial.qtdCompras === 1 ? "lançamento" : "lançamentos"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><Receipt className="h-3 w-3" /> Encargos / juros</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-red-600">{formatBRL(gerencial.totalEncargos)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">IOF, anuidade, juros, multas…</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><Percent className="h-3 w-3" /> % parcelado</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-800">{gerencial.pctParcelado.toFixed(0)}%</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{formatBRL(gerencial.parcelado)} em parcelas</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><CreditCard className="h-3 w-3" /> Ticket médio</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-800">{formatBRL(gerencial.ticketMedio)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">por compra</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {gerencial && gerencial.temDados && (
              <>
                {/* Linha 1: composição por tipo (pizza) + evolução mês a mês (barras) */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <PieIcon className="h-4 w-4 text-[#1B2A4A]" /> Composição da fatura por tipo
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="h-[280px] w-full" role="img" aria-label="Gráfico de pizza da composição da fatura por tipo">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={gerencial.composicao} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={2}
                              className="cursor-pointer focus:outline-none"
                              onClick={(_: any, idx: number) => { const c = gerencial.composicao[idx]; if (c) abrirDrill(c.name, `${formatBRL(c.value)} · ${c.qtd} ${c.qtd === 1 ? "lançamento" : "lançamentos"}`, { tipo: c.key }); }}
                            >
                              {gerencial.composicao.map((c) => (<Cell key={c.key} fill={c.color} className="cursor-pointer focus:outline-none" />))}
                            </Pie>
                            <Tooltip formatter={(v: any, n: any) => [formatBRL(Number(v)), n]} />
                            <Legend verticalAlign="bottom" height={36} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="mt-1 text-center text-[11px] text-muted-foreground">Créditos/pagamentos em valor absoluto · clique numa fatia para ver os lançamentos.</p>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <BarChart3 className="h-4 w-4 text-[#1B2A4A]" /> Evolução mês a mês — compras × encargos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {gerencial.evolucaoTemDado ? (
                        <div className="h-[280px] w-full" role="img" aria-label="Gráfico de barras de compras, encargos e créditos por mês">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gerencial.evolucao} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                              <YAxis tickFormatter={(v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={84} />
                              <Tooltip formatter={(v: any, n: any) => [formatBRL(Number(v)), n]} cursor={{ fill: "rgba(27,42,74,0.05)" }} />
                              <Legend verticalAlign="top" height={28} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
                              <Bar dataKey="compra" name="Compras" fill="#1B2A4A" radius={[4, 4, 0, 0]} maxBarSize={26} className="cursor-pointer" onClick={(d: any) => { const r = d?.payload ?? d; if (r?.mesNum && r.compra) abrirDrill(`Compras — ${r.mes}/${ano}`, formatBRL(r.compra), { tipo: "compra", mes: r.mesNum }); }} />
                              <Bar dataKey="encargo" name="Encargos" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={26} className="cursor-pointer" onClick={(d: any) => { const r = d?.payload ?? d; if (r?.mesNum && r.encargo) abrirDrill(`Encargos — ${r.mes}/${ano}`, formatBRL(r.encargo), { tipo: "encargo", mes: r.mesNum }); }} />
                              <Bar dataKey="credito" name="Créditos" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={26} className="cursor-pointer" onClick={(d: any) => { const r = d?.payload ?? d; if (r?.mesNum && r.credito) abrirDrill(`Créditos/Pagamentos — ${r.mes}/${ano}`, formatBRL(r.credito), { tipo: "credito", mes: r.mesNum }); }} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="py-16 text-center text-sm text-muted-foreground">Sem movimento mensal em {ano}.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Linha 2: perfil de parcelamento (barras) + encargos por natureza */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <Layers className="h-4 w-4 text-[#1B2A4A]" /> Perfil de compra — em quantas vezes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {gerencial.perfil.length > 0 ? (
                        <div className="h-[280px] w-full" role="img" aria-label="Gráfico de barras do valor de compras por número de parcelas">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gerencial.perfil} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                              <YAxis tickFormatter={(v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={84} />
                              <Tooltip formatter={(v: any) => formatBRL(Number(v))} labelFormatter={(l: any) => `${l}`} cursor={{ fill: "rgba(27,42,74,0.05)" }} />
                              <Bar dataKey="total" name="Valor" radius={[6, 6, 0, 0]} maxBarSize={48} className="cursor-pointer" onClick={(d: any) => { const r = d?.payload ?? d; if (r) abrirDrill(`Compras ${r.label}`, `${formatBRL(r.total)} · ${r.qtd} ${r.qtd === 1 ? "compra" : "compras"}`, { tipo: "compra", parcelas: r.parcelas <= 1 ? 1 : r.parcelas }); }}>
                                {gerencial.perfil.map((p) => (<Cell key={p.parcelas} fill={p.parcelas > 1 ? "#2c3f63" : "#1B2A4A"} className="cursor-pointer" />))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="py-16 text-center text-sm text-muted-foreground">Sem compras classificadas.</div>
                      )}
                      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#1B2A4A" }} /> à vista</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#2c3f63" }} /> parcelado</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <Receipt className="h-4 w-4 text-[#1B2A4A]" /> Encargos &amp; juros por natureza
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {gerencial.encargosNatureza.length > 0 ? (
                        <div className="space-y-2">
                          {gerencial.encargosNatureza.map((e) => {
                            const max = gerencial.encargosNatureza[0].total || 1;
                            const pct = Math.max(3, (e.total / max) * 100);
                            return (
                              <button
                                key={e.nome} type="button"
                                onClick={() => abrirDrill(`Encargos — ${e.nome}`, `${formatBRL(e.total)} · ${e.qtd} ${e.qtd === 1 ? "lançamento" : "lançamentos"}`, { natureza: e.nome })}
                                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-red-50"
                                title={`Ver lançamentos de ${e.nome}`}
                              >
                                <span className="w-28 shrink-0 truncate text-xs text-gray-600" title={e.nome}>{e.nome}</span>
                                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                                  <div className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-red-500 to-red-400" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800">{formatBRL(e.total)}</span>
                              </button>
                            );
                          })}
                          <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                            <span className="text-gray-600">Total de encargos</span>
                            <span className="tabular-nums text-red-600">{formatBRL(gerencial.totalEncargos)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-16 text-center text-sm text-muted-foreground">Nenhum encargo/juros identificado em {ano}.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Estabelecimentos / itens recorrentes */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Repeat className="h-4 w-4 text-[#1B2A4A]" /> O que é comprado recorrentemente
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Estabelecimentos/itens com mais de uma compra no ano — nº de vezes, meses distintos e valor.</p>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {gerencial.estabelecimentos.length > 0 ? (
                      <div className="-mx-4 overflow-x-auto px-4">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr className="bg-gray-50/70 text-xs text-muted-foreground">
                              <th className="rounded-l-lg px-3 py-2.5 text-left font-semibold">Estabelecimento / item</th>
                              <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium"><Store className="mr-1 inline h-3.5 w-3.5" />Vezes</th>
                              <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Meses</th>
                              <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">Parcelas</th>
                              <th className="whitespace-nowrap rounded-r-lg px-3 py-2.5 text-right font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gerencial.estabelecimentos.map((e) => (
                              <tr
                                key={e.est}
                                onClick={() => abrirDrill(e.est, `${e.vezes}x · ${e.meses} ${e.meses === 1 ? "mês" : "meses"} · ${formatBRL(e.total)}`, { tipo: "compra", estabelecimento: e.est })}
                                className="cursor-pointer border-t transition-colors hover:bg-blue-50/40"
                              >
                                <td className="px-3 py-2 font-medium text-gray-800">{e.est}</td>
                                <td className="px-3 py-2 text-center tabular-nums">
                                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{e.vezes}x</Badge>
                                </td>
                                <td className="px-3 py-2 text-center tabular-nums text-gray-600">{e.meses}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-gray-600">{e.maxParcelas > 1 ? `até ${e.maxParcelas}x` : "à vista"}</td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{formatBRL(e.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma compra recorrente identificada em {ano}.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Por obra + por categoria */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <Building2 className="h-4 w-4 text-[#1B2A4A]" /> Qual obra mais compra no cartão
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {!gerencial.obrasClassificadas && (
                        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>As compras ainda não foram classificadas por obra. Classifique os itens em cada fatura (botão "Itens") para este gráfico ganhar detalhe.</span>
                        </div>
                      )}
                      {gerencial.porObra.length > 0 ? (
                        <div className="space-y-2">
                          {gerencial.porObra.map((o) => {
                            const max = gerencial.porObra[0].total || 1;
                            const pct = Math.max(3, (o.total / max) * 100);
                            const semObra = o.obra === "(sem obra)";
                            return (
                              <button
                                key={o.obra} type="button"
                                onClick={() => abrirDrill(semObra ? "Compras sem obra" : `Obra — ${o.obra}`, `${formatBRL(o.total)} · ${o.qtd} ${o.qtd === 1 ? "compra" : "compras"}`, { tipo: "compra", obra: o.obra })}
                                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-blue-50"
                                title={`Ver compras de ${o.obra}`}
                              >
                                <span className={`w-32 shrink-0 truncate text-xs ${semObra ? "italic text-gray-400" : "text-gray-600"}`} title={o.obra}>{o.obra}</span>
                                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                                  <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${pct}%`, background: semObra ? "#cbd5e1" : "linear-gradient(90deg,#1B2A4A,#2c3f63)" }} />
                                </div>
                                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800">{formatBRL(o.total)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">Sem dados de obra em {ano}.</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <ListTree className="h-4 w-4 text-[#1B2A4A]" /> Gasto por categoria
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {!gerencial.categoriasClassificadas && (
                        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>As compras ainda não foram classificadas por categoria. Classifique os itens nas faturas para este gráfico ganhar detalhe.</span>
                        </div>
                      )}
                      {gerencial.porCategoria.length > 0 ? (
                        <div className="space-y-2">
                          {gerencial.porCategoria.map((c) => {
                            const max = gerencial.porCategoria[0].total || 1;
                            const pct = Math.max(3, (c.total / max) * 100);
                            const semCat = c.cat === "(sem categoria)";
                            return (
                              <button
                                key={c.cat} type="button"
                                onClick={() => abrirDrill(semCat ? "Compras sem categoria" : `Categoria — ${c.cat}`, `${formatBRL(c.total)} · ${c.qtd} ${c.qtd === 1 ? "compra" : "compras"}`, { tipo: "compra", categoria: c.cat })}
                                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-blue-50"
                                title={`Ver compras de ${c.cat}`}
                              >
                                <span className={`w-32 shrink-0 truncate text-xs ${semCat ? "italic text-gray-400" : "text-gray-600"}`} title={c.cat}>{c.cat}</span>
                                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                                  <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${pct}%`, background: semCat ? "#cbd5e1" : "linear-gradient(90deg,#1B2A4A,#2c3f63)" }} />
                                </div>
                                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800">{formatBRL(c.total)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">Sem dados de categoria em {ano}.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ───────────── DRILL-IN: lançamentos por trás do gráfico ───────────── */}
      <Dialog open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent resizable={false} className="max-w-4xl p-0 overflow-hidden gap-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <ListFilter className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold text-white">{drill?.titulo}</DialogTitle>
                <DialogDescription className="text-xs text-white/70">{drill?.sub} · {ano}{cartaoFiltro != null ? " · cartão filtrado" : ""}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto">
            {drillQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando lançamentos…
              </div>
            ) : drillQ.isError ? (
              <div className="py-16 text-center text-sm text-red-600">Erro ao carregar os lançamentos. Tente novamente.</div>
            ) : !drillData || drillData.itens.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado para este recorte.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Data</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Descrição</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Cartão</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Obra / Categoria</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">Parcela</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {drillData.itens.map((it: any, idx: number) => {
                    const parc = (it.parcelaTotal ?? 0) > 1 ? `${it.parcelaAtual}/${it.parcelaTotal}` : "À vista";
                    const cartaoLbl = [it.cartaoBanco, it.cartaoFinal4 ? `•${it.cartaoFinal4}` : null].filter(Boolean).join(" ");
                    return (
                      <tr key={idx} className="border-t hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">{fmtData(it.data)}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          <span className="block max-w-[280px] truncate" title={it.descricao}>{it.descricao || "—"}</span>
                          {it.cidade ? <span className="text-[11px] text-gray-400">{it.cidade}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{cartaoLbl || "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          <span className="block max-w-[200px] truncate" title={it.obraNome || ""}>{it.obraNome || <span className="italic text-gray-400">(sem obra)</span>}</span>
                          {it.categoriaNome ? <span className="block max-w-[200px] truncate text-[11px] text-gray-400" title={it.categoriaNome}>{it.categoriaNome}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-gray-500">{parc}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${Number(it.valor) < 0 ? "text-emerald-600" : "text-gray-800"}`}>{formatBRL(Number(it.valor))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="shrink-0 border-t bg-muted/30 px-6 py-3">
            {drillData && drillData.truncado ? (
              <p className="mb-2 text-[11px] text-amber-600">Exibindo os primeiros {drillData.itens.length} lançamentos (recorte muito grande). Refine o filtro para ver todos.</p>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{drillData ? `${drillData.qtd} ${drillData.qtd === 1 ? "lançamento" : "lançamentos"}` : "—"}</span>
              <span className="font-semibold tabular-nums text-[#1B2A4A]">{drillData ? formatBRL(drillData.total) : ""}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL CARTÃO (criar/editar) ───────────── */}
      <Dialog open={cartaoModal} onOpenChange={(v) => { if (!v) importCadastroRef.current = null; setCartaoModal(v); }}>
        <DialogContent resizable={false} className="max-w-xl p-0 overflow-hidden gap-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">{cartaoEdit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
                <DialogDescription className="text-xs text-white/70">Cartões pessoais (PF) usados pela empresa geram alerta de regularização.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 px-6 py-5">
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Identificação</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Banco</Label><Input value={cartaoForm.banco} onChange={(e) => setCartaoForm((f) => ({ ...f, banco: e.target.value }))} placeholder="Ex: Santander" /></div>
                <div className="space-y-1"><Label className="text-xs">Bandeira</Label><Input value={cartaoForm.bandeira} onChange={(e) => setCartaoForm((f) => ({ ...f, bandeira: e.target.value }))} placeholder="Ex: Mastercard" /></div>
                <div className="space-y-1"><Label className="text-xs">Final (4 dígitos)</Label><Input className="tabular-nums" value={cartaoForm.final4} maxLength={4} inputMode="numeric" onChange={(e) => setCartaoForm((f) => ({ ...f, final4: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1234" /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={cartaoForm.tipoPessoa} onValueChange={(v) => setCartaoForm((f) => ({ ...f, tipoPessoa: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PJ">PJ (empresa)</SelectItem>
                      <SelectItem value="PF">PF (pessoal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={cartaoForm.status} onValueChange={(v) => setCartaoForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_CARTAO_OPCOES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Titular</Label><Input value={cartaoForm.titular} onChange={(e) => setCartaoForm((f) => ({ ...f, titular: e.target.value }))} placeholder="Nome impresso no cartão" /></div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Datas & limite</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Dia fechamento</Label><Input className="tabular-nums" type="number" min={1} max={31} value={cartaoForm.diaFechamento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaFechamento: e.target.value }))} placeholder="Ex: 5" /></div>
                <div className="space-y-1"><Label className="text-xs">Dia vencimento</Label><Input className="tabular-nums" type="number" min={1} max={31} value={cartaoForm.diaVencimento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaVencimento: e.target.value }))} placeholder="Ex: 12" /></div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Limite</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">R$</span>
                    <Input className="pl-9 tabular-nums" inputMode="decimal" value={cartaoForm.limite} onChange={(e) => setCartaoForm((f) => ({ ...f, limite: maskBRL(e.target.value) }))} placeholder="10.000,00" />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-1">
              <Label className="text-xs">Observação</Label>
              <Textarea rows={2} value={cartaoForm.observacao} onChange={(e) => setCartaoForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Anotações internas (opcional)" />
            </section>

            {cartaoForm.tipoPessoa === "PF" && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Este é um cartão <b>pessoal</b>. Ele NÃO será convertido em cartão FC automaticamente — o sistema apenas sinaliza para regularização.</span>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-4">
            <Button variant="outline" onClick={() => { importCadastroRef.current = null; setCartaoModal(false); }}>Cancelar</Button>
            <Button onClick={salvarCartao} disabled={criarCartao.isLoading || atualizarCartao.isLoading}>
              {(criarCartao.isLoading || atualizarCartao.isLoading) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL IMPORTAR FATURA ───────────── */}
      <Dialog open={importModal} onOpenChange={(v) => { if (!importBusy) setImportModal(v); }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Importar fatura (PDF)</DialogTitle>
            <DialogDescription>A IA lê o PDF e extrai cabeçalho + itens. Nada é gravado até você confirmar.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {!preview && (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg py-16 cursor-pointer hover:bg-gray-50 ${importBusy ? "opacity-100 pointer-events-none" : ""}`}>
                {importBusy ? (
                  <div className="w-full max-w-md flex flex-col items-center gap-3 px-6">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <span className="text-sm text-muted-foreground text-center">{importLabel || `Lendo "${arquivoNome}" com a IA…`}</span>
                    <div className="w-full flex items-center gap-3">
                      <Progress value={importPct} className="h-2 flex-1" />
                      <span className="text-sm font-semibold tabular-nums text-blue-700 w-12 text-right">{Math.round(importPct)}%</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar os PDFs das faturas</span>
                    <span className="text-xs text-muted-foreground">Pode selecionar vários de uma vez. Cartão reconhecido pelo final → vincula sozinho; não reconhecido → sugere cadastro.</span>
                  </>
                )}
                <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={importBusy} onChange={(e) => onArquivosSelecionados(e.target.files)} />
              </label>
            )}
            {preview && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm bg-blue-50 border border-blue-200 rounded p-3">
                  <span><b>{preview.resumo.totalFaturas}</b> fatura(s)</span>
                  <span><b>{preview.resumo.totalItens}</b> item(ns)</span>
                  {preview.resumo.naoIdentificadas > 0 && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {preview.resumo.naoIdentificadas} cartão(ões) não identificado(s)</span>}
                  {preview.resumo.ccAdministrativo && <span className="text-muted-foreground">Encargos → CC "{preview.resumo.ccAdministrativo}"</span>}
                </div>
                {importFalhas.length > 0 && (
                  <div className="text-sm bg-red-50 border border-red-200 rounded p-3 text-red-700">
                    <div className="flex items-center gap-1 font-semibold mb-1"><AlertTriangle className="w-4 h-4" /> {importFalhas.length} arquivo(s) não puderam ser lidos</div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {importFalhas.map((fa, i) => (<li key={i}><b>{fa.nome}</b>: {fa.erro}</li>))}
                    </ul>
                  </div>
                )}
                {preview.faturas.map((f: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="font-semibold flex items-center gap-2 flex-wrap">
                        <CreditCard className="w-4 h-4" />
                        {f.banco || "Banco"} · final {f.cartaoFinal4 || "????"}
                        {f.cartaoIdentificado ? (
                          <Badge className="bg-green-100 text-green-700">Vínculo automático</Badge>
                        ) : (
                          <>
                            <Badge variant="outline" className="border-amber-400 text-amber-700">Não cadastrado</Badge>
                            <Button size="sm" variant="outline" className="h-7 border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => cadastrarCartaoDoImport(f)}>
                              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Cadastrar cartão
                            </Button>
                          </>
                        )}
                        {f.origemArquivo && <span className="text-[11px] font-normal text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {f.origemArquivo}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">Venc. {fmtData(f.vencimento)} · Total <b className="text-foreground">{formatBRL(f.total)}</b></div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                      <span>{f.qtdCompras} compras</span><span>{f.qtdEncargos} encargos</span><span>{f.qtdCreditos} créditos</span>
                      <span>Soma compras: {formatBRL(f.somaCompras)}</span>
                    </div>
                    <div className="max-h-[28vh] overflow-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-left text-muted-foreground">
                            <th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Tipo</th><th className="p-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(f.itens ?? []).map((it: any, j: number) => (
                            <tr key={j} className="border-t">
                              <td className="p-2">{fmtData(it.data)}</td>
                              <td className="p-2">{it.descricao || "—"}{it.parcelaTotal ? <span className="text-muted-foreground"> ({it.parcelaAtual}/{it.parcelaTotal})</span> : ""}</td>
                              <td className="p-2">{tipoBadge(it.tipo)}</td>
                              <td className="p-2 text-right">{formatBRL(it.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModal(false)} disabled={importBusy}>Cancelar</Button>
            {preview && (
              <Button onClick={confirmarImport} disabled={importBusy}>
                {importBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <CheckCircle className="w-4 h-4 mr-1" /> Gravar {preview.resumo.totalFaturas} fatura(s)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL CLASSIFICAR ITENS ───────────── */}
      <Dialog open={!!faturaItens} onOpenChange={(v) => { if (!v) { setFaturaItens(null); resetFaturaFiltros(); } }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Cabeçalho — faixa azul institucional */}
          <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-4 text-white shrink-0">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-white text-lg">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15"><ListTree className="w-5 h-5" /></span>
                Classificar itens da fatura
              </DialogTitle>
              <DialogDescription className="text-white/70">
                Vincule cada compra a uma obra, centro de custo e categoria. Use a classificação em massa para acelerar.
              </DialogDescription>
            </DialogHeader>
            {faturaItens && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-white/10">{faturaItens.cartaoBanco || "Cartão"} · final {faturaItens.cartaoFinal4 || "????"}</span>
                <span className="px-2.5 py-1 rounded-full bg-white/10">Venc. {fmtData(faturaItens.vencimento)}</span>
                <span className="px-2.5 py-1 rounded-full bg-white/20 font-semibold">Total {formatBRL(faturaItens.total)}</span>
              </div>
            )}
          </div>

          {/* Barra de progresso + filtros + ação em massa */}
          {!itensQ.isLoading && itens.length > 0 && (
            <div className="px-6 py-3 border-b bg-muted/30 shrink-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{resumoItens.classificados}/{resumoItens.total}</span>
                  <span className="text-muted-foreground">com obra</span>
                </div>
                <div className="flex-1 min-w-[120px] max-w-[260px] h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${resumoItens.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{resumoItens.pct}%</span>
                <div className="ml-auto flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">Confirmado: {formatBRL(resumoItens.valorConf)}</span>
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">Sem obra: {formatBRL(resumoItens.valorPend)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input value={itemBusca} onChange={(e) => setItemBusca(e.target.value)} placeholder="Buscar descrição ou cidade…" className="h-8 pl-8 w-[230px]" />
                </div>
                <Select value={itemStatus} onValueChange={(v) => setItemStatus(v as any)}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Sem obra</SelectItem>
                    <SelectItem value="sugerido">Sugerido</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="ignorado">Ignorado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">{itensFiltrados.length} de {itens.length}</span>
                <Button size="sm" variant="outline" className="h-8 ml-auto" disabled={itensFiltrados.length === 0} onClick={() => setBulkOpen(true)}>
                  <Layers className="w-4 h-4 mr-1" /> Classificar em massa
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {itensQ.isLoading ? (
              <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Esta fatura não tem itens.</div>
            ) : itensFiltrados.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Nenhum item corresponde ao filtro.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                  <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wide">
                    <th className="p-2.5">Data</th><th className="p-2.5">Descrição</th><th className="p-2.5">Tipo</th>
                    <th className="p-2.5 text-right">Valor</th><th className="p-2.5">Obra</th><th className="p-2.5">Centro de custo</th>
                    <th className="p-2.5">Categoria</th><th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((it) => {
                    const stt = it.statusClassificacao || "sugerido";
                    const sttCls = stt === "confirmado"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : stt === "ignorado"
                      ? "border-gray-300 bg-gray-50 text-gray-500"
                      : "border-amber-300 bg-amber-50 text-amber-700";
                    const semObra = it.obraId == null;
                    return (
                    <tr key={it.id} className={`border-t align-top hover:bg-blue-50/40 ${semObra ? "bg-amber-50/20" : ""}`}>
                      <td className="p-2.5 whitespace-nowrap">{fmtData(it.data)}</td>
                      <td className="p-2.5 min-w-[160px]"><span className="font-medium text-gray-800">{it.descricao || "—"}</span>{it.parcelaTotal ? <span className="text-muted-foreground"> ({it.parcelaAtual}/{it.parcelaTotal})</span> : ""}{it.cidade ? <div className="text-[10px] text-muted-foreground">{it.cidade}</div> : null}</td>
                      <td className="p-2.5">{tipoBadge(it.tipo)}</td>
                      <td className="p-2.5 text-right whitespace-nowrap tabular-nums font-medium">{formatBRL(it.valor)}</td>
                      <td className="p-2.5">
                        <Select value={it.obraId != null ? String(it.obraId) : "none"} onValueChange={(v) => {
                          const o = obras.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { obraId: v === "none" ? null : parseInt(v, 10), obraNome: o ? (o.nome ?? o.name ?? null) : null });
                        }}>
                          <SelectTrigger className={`h-7 w-[150px] ${semObra ? "border-amber-300 text-amber-700" : ""}`}><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— (sem obra)</SelectItem>
                            {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome ?? o.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={it.centroCustoId != null ? String(it.centroCustoId) : "none"} onValueChange={(v) => {
                          const cc = costCenters.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { centroCustoId: v === "none" ? null : parseInt(v, 10), centroCustoNome: cc ? cc.nome : null });
                        }}>
                          <SelectTrigger className="h-7 w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {costCenters.map((cc) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={it.categoriaId != null ? String(it.categoriaId) : "none"} onValueChange={(v) => {
                          const cat = categorias.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { categoriaId: v === "none" ? null : parseInt(v, 10), categoriaNome: cat ? cat.nome : null });
                        }}>
                          <SelectTrigger className="h-7 w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {categorias.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={stt} onValueChange={(v) => aplicarClassificacao(it, { statusClassificacao: v })}>
                          <SelectTrigger className={`h-7 w-[120px] ${sttCls}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sugerido">Sugerido</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="ignorado">Ignorado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 shrink-0">
            <Button variant="outline" onClick={() => { setFaturaItens(null); resetFaturaFiltros(); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL CLASSIFICAR EM MASSA ───────────── */}
      <AlertDialog open={bulkOpen} onOpenChange={(v) => { if (!bulkBusy) setBulkOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-blue-700" /> Classificar {itensFiltrados.length} item(ns)</AlertDialogTitle>
            <AlertDialogDescription>
              Aplica a definição abaixo a TODOS os itens atualmente filtrados. Deixe "Manter atual" nos campos que não quiser alterar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Obra</Label>
              <Select value={bulkObra} onValueChange={setBulkObra}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (sem obra)</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome ?? o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Centro de custo</Label>
              <Select value={bulkCC} onValueChange={setBulkCC}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (nenhum)</SelectItem>
                  {costCenters.map((cc) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={bulkCat} onValueChange={setBulkCat}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (nenhuma)</SelectItem>
                  {categorias.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancelar</AlertDialogCancel>
            <Button onClick={aplicarBulk} disabled={bulkBusy || (bulkObra === "keep" && bulkCC === "keep" && bulkCat === "keep")}>
              {bulkBusy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Aplicando…</> : <>Aplicar a {itensFiltrados.length}</>}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────────── ALERTS EXCLUIR ───────────── */}
      <AlertDialog open={!!cartaoExcluir} onOpenChange={(v) => { if (!v) setCartaoExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão?</AlertDialogTitle>
            <AlertDialogDescription>O cartão "{cartaoExcluir?.banco} · final {cartaoExcluir?.final4}" será removido (as faturas já importadas permanecem).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluirCartao} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────────── MODAL VINCULAR FATURA ⇄ CARTÃO ───────────── */}
      <Dialog open={!!faturaVincular} onOpenChange={(v) => { if (!v) setFaturaVincular(null); }}>
        <DialogContent resizable={false} className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="border-b bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">Vincular fatura ao cartão</DialogTitle>
                <DialogDescription className="text-xs text-white/70">O vínculo é permanente e também atualiza os itens desta fatura.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            {faturaVincular && (
              <div className="rounded-lg border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                Fatura de {faturaVincular.mes ? `${MESES[faturaVincular.mes]}/${faturaVincular.ano}` : (faturaVincular.ano ?? "—")} ·
                {" "}vencimento {fmtData(faturaVincular.vencimento)} · total <span className="font-medium text-gray-700">{formatBRL(faturaVincular.total)}</span>
                {" "}· {faturaVincular.qtdItens} item(ns)
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Cartão</Label>
              <Select value={vincularCartaoId} onValueChange={setVincularCartaoId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="max-h-[50vh] overflow-y-auto z-[60]">
                  <SelectItem value="none">Não identificado (sem cartão)</SelectItem>
                  {cartoes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.banco || "Banco"} · final {c.final4 || "????"}{c.tipoPessoa === "PF" ? " (PF)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cartoes.length === 0 && (
                <p className="text-[11px] text-amber-700">Nenhum cartão cadastrado. Cadastre um cartão na aba "Cartões" primeiro.</p>
              )}
            </div>
          </div>
          <DialogFooter className="border-t bg-gray-50/50 px-6 py-4 sm:gap-2">
            <Button variant="outline" onClick={() => setFaturaVincular(null)} disabled={vincularFatura.isPending}>Cancelar</Button>
            <Button onClick={salvarVincular} disabled={vincularFatura.isPending} className="bg-[#1B2A4A] hover:bg-[#22315a]">
              {vincularFatura.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Salvar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!faturaExcluir} onOpenChange={(v) => { if (!v) setFaturaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura?</AlertDialogTitle>
            <AlertDialogDescription>A fatura e seus {faturaExcluir?.qtdItens ?? 0} item(ns) serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluirFatura} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
