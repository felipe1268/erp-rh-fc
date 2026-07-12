// Rev. 3017 — Análise de Custos · DETALHE (drill-down)
// Tela aberta ao clicar em QUALQUER KPI / barra / fatia / linha da
// "Análise de Custos". Lê os params da URL (ano, mes, tipo, valor),
// re-busca `financial.getContasAPagarByYear` e mostra os lançamentos
// PERTINENTES ao item clicado: KPIs do recorte, distribuição por mês,
// quebra por uma dimensão secundária e a tabela detalhada completa.
// 100% client-side (ZERO novo backend).
import { useEffect, useMemo, useState, Fragment } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/ui/money-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, CircleDollarSign, CheckCircle2, Receipt, AlertTriangle,
  BarChart2, Layers, Tag, Building2, Calendar, ListChecks, Pencil, X, Loader2, Lock, ExternalLink,
  ChevronDown, ChevronRight, Package, ShoppingCart, TrendingUp, TrendingDown, Minus, CreditCard, MapPin, Hash,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechTooltip, LabelList, LineChart, Line, ReferenceLine,
} from "recharts";
import { classificarGrupoCusto } from "@shared/custosCategorias";
import { OcMiniDialog } from "@/components/compras/ItemCatalogo";
import { buildCentroCustoMaps, centroCustoNomeDe, SEM_CENTRO_CUSTO } from "@shared/centroCusto";
import AnaliseDashPanel from "./AnaliseDashPanel";
import { Search } from "lucide-react";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), sem abreviar.
function BRLk(v: number): string {
  return formatBRL(v || 0);
}
function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function valorEfetivo(r: any): number {
  const real = Number(r.valorRealizado ?? 0);
  if (real > 0) return real;
  return Number(r.valorPrevisto ?? 0);
}
// Rev. 3134 — base CAIXA (espelha a tela-mãe): mês = data de PAGAMENTO (pago)
// ou vencimento (em aberto). Mantém o drill-down consistente com o gráfico.
function dataEfetivaDe(r: any): string {
  // Pago → data de pagamento; se faltar (legado/manual), cai p/ vencimento →
  // competência (espelha o fallback COALESCE do backend, p/ não sumir do ano).
  if (r.status === "pago") return String(r.dataPagamento || r.dataVencimento || r.dataCompetencia || "");
  return String(r.dataVencimento || r.dataCompetencia || "");
}
function mesNumDe(r: any): number {
  const s = dataEfetivaDe(r);
  if (!s || s.length < 7) return 0;
  const m = parseInt(s.slice(5, 7), 10);
  return isNaN(m) ? 0 : m;
}
function isVencido(r: any): boolean {
  return Number(r.diasAtraso ?? 0) > 0 && r.status !== "pago";
}
function fmtData(s?: string): string {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Rev. 3029 — Lançamentos detalhados: parse do texto pra (1) número de documento
// limpo (OC/OS/FD-AAAA-NNN), (2) fornecedor embutido após o "—" e (3) texto livre
// sem poluição (sem "OC #OC", sem "*", sem espaços duplos).
function parseLanc(r: any): { docTipo: string; docNumero: string; fornecedorDesc: string; livre: string } {
  const raw = String(r?.descricao || r?.origemDescricao || "").trim();
  const numMatch = raw.match(/(OC|OS|FD)-\d{4}-\d+/i);
  const docNumero = numMatch ? numMatch[0].toUpperCase() : "";
  const docTipo = numMatch ? numMatch[1].toUpperCase() : "";
  const dashIdx = raw.indexOf("—");
  const fornecedorDesc = (dashIdx >= 0 ? raw.slice(dashIdx + 1) : "")
    .replace(/\*/g, "").replace(/\s{2,}/g, " ").trim();
  let livre = dashIdx >= 0 ? raw.slice(0, dashIdx) : raw;
  if (docNumero) {
    livre = livre.replace(new RegExp(`(OC|OS|FD)?\\s*#?\\s*${docNumero.replace(/-/g, "\\-")}`, "i"), "");
  }
  livre = livre.replace(/#/g, "").replace(/\*/g, " ")
    .replace(/\s{2,}/g, " ").replace(/^[\s—–-]+|[\s—–-]+$/g, "").trim();
  return { docTipo, docNumero, fornecedorDesc, livre };
}
// Fornecedor "de verdade": coluna persistida OU o nome embutido na descrição.
function fornecedorDe(r: any): string {
  const direto = String(r?.fornecedorNome || "").trim();
  return direto || parseLanc(r).fornecedorDesc;
}
// Deep-link pra origem do lançamento (hoje: OC de compras → tela de Ordens).
function linkDeOrigem(r: any): string | null {
  const mod = String(r?.origemModulo || "").toLowerCase();
  const id = Number(r?.origemId);
  if (!Number.isFinite(id) || !id) return null;
  if (mod === "compras" || mod === "compra_oc") return `/compras/ordens?destaque=${id}`;
  return null;
}

// Rev. 3024 — chaves canônicas de cada dimensão (espelham os rótulos das barras,
// inclusive os sentinelas "Sem ..."), pra o clique numa barra filtrar exatamente
// o que ela representa (inclusive "Sem fornecedor").
const keyOf: Record<string, (r: any) => string> = {
  fornecedor: (r) => ((r.fornecedorNome || "").trim()) || "Sem fornecedor",
  centro: (r) => (r.__centroNome || "Sem centro de custo"), // Rev. 3135 — centro de custo cadastrado (resolvido)
  categoria: (r) => (r.contaNome || "Sem categoria"),
  // Rev. 3027 — categoria PADRONIZADA (grupo canônico sem duplicatas).
  grupo: (r) => classificarGrupoCusto(r.contaNome, r.origemModulo),
};
function aplicaFiltro(base: any[], t: string, v: string): any[] {
  if (t === "status") {
    if (v === "pago") return base.filter((r) => r.status === "pago");
    if (v === "aberto") return base.filter((r) => r.status !== "pago");
    if (v === "vencido") return base.filter((r) => isVencido(r));
    return base;
  }
  if (t === "mes") {
    const mn = parseInt(v, 10);
    return base.filter((r) => mesNumDe(r) === mn);
  }
  const kf = keyOf[t];
  if (!kf) return base;
  return base.filter((r) => kf(r) === v);
}
type DrillStep = { t: string; v: string };
function parseExtra(raw: string | null): DrillStep[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(arr) ? arr.filter((x) => x && x.t && typeof x.v === "string") : [];
  } catch { return []; }
}
const DIM_META: Record<string, { titulo: string; icon: any }> = {
  fornecedor: { titulo: "Por Fornecedor", icon: Building2 },
  centro: { titulo: "Por Centro de Custo", icon: Layers },
  categoria: { titulo: "Por Categoria", icon: Tag },
  grupo: { titulo: "Por Categoria (padronizada)", icon: Tag },
};

function statusTheme(r: any): { label: string; cls: string } {
  if (isVencido(r)) return { label: "Vencido", cls: "bg-red-100 text-red-700" };
  if (r.status === "pago") return { label: "Pago", cls: "bg-emerald-100 text-emerald-700" };
  if (r.status === "parcial") return { label: "Parcial", cls: "bg-amber-100 text-amber-700" };
  return { label: "Em aberto", cls: "bg-amber-100 text-amber-700" };
}

function DetTooltip({ active, payload, label, totalRef }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      {label != null && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 text-gray-600">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatBRL(p.value)}</span>
          {totalRef ? <span className="text-gray-400">({pct(p.value, totalRef).toFixed(1)}%)</span> : null}
        </p>
      ))}
    </div>
  );
}

export default function FinanceiroAnaliseCustosDetalhe() {
  const { companyId } = useCompany();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const ano = parseInt(params.get("ano") || String(new Date().getFullYear()), 10);
  const mes = parseInt(params.get("mes") || "0", 10); // 0 = ano inteiro
  const tipo = params.get("tipo") || "status"; // status | mes | categoria | centro | fornecedor
  const valor = params.get("valor") || "total";
  // Rev. 3024 — cadeia de drills FEITOS NESTA tela (clique numa barra). A tela-mãe
  // passa só tipo/valor; cada clique aqui empilha um filtro em `extra`.
  const extra = useMemo(() => parseExtra(params.get("extra")), [params]);

  // Navega aplicando uma nova cadeia de drills (preserva ano/mes/tipo/valor).
  const irPara = (proxExtra: DrillStep[]) => {
    const sp = new URLSearchParams(search);
    if (proxExtra.length) sp.set("extra", encodeURIComponent(JSON.stringify(proxExtra)));
    else sp.delete("extra");
    setLocation(`${location}?${sp.toString()}`);
  };
  // Clique numa barra da quebra → empilha o filtro daquela dimensão/valor.
  const drillBarra = (dim: string, nome: string) => {
    if (!dim || !nome) return;
    irPara([...extra, { t: dim, v: nome }]);
  };
  // Clique numa barra de mês → empilha o mês na cadeia de drills (reversível pelo
  // "Voltar", igual aos demais drills — preserva o contexto anterior, ex.: categoria).
  const drillMes = (mn: number) => {
    if (!mn) return;
    irPara([...extra, { t: "mes", v: String(mn) }]);
  };

  // ─── Rev. 4158 — Aba de análise por item (só exibida quando tipo === 'fornecedor')
  const [aba, setAba] = useState<'lancamentos' | 'itens'>('lancamentos');
  // Derived: nome do fornecedor que está em foco (primário ou último drill de fornecedor)
  const fornecedorFoco: string | null = useMemo(() => {
    if (tipo === 'fornecedor') return valor;
    const step = [...extra].reverse().find((f) => f.t === 'fornecedor');
    return step ? step.v : null;
  }, [tipo, valor, extra]);
  // Linha de OC expandida na aba de itens
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpandedItems((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  // Item selecionado para mini-chart de evolução de preço
  const [chartItem, setChartItem] = useState<string | null>(null);
  // Filtro de obra para aba de itens
  const [obraIdFiltro, setObraIdFiltro] = useState<number | null>(null);
  // OC selecionada para mini-dialog
  const [selectedOcId, setSelectedOcId] = useState<number | null>(null);
  // Busca de produto na tabela de itens
  const [searchTerm, setSearchTerm] = useState("");

  const { data: analiseData, isLoading: analiseLoading } = (trpc as any).compras.getAnaliseFornecedor.useQuery(
    { companyId, fornecedorNome: fornecedorFoco ?? '', ano, ...(obraIdFiltro ? { obraId: obraIdFiltro } : {}) },
    { enabled: !!companyId && !!fornecedorFoco }
  );

  // Rev. 3134 — base CAIXA: espelha o gráfico "Custo por Mês" (pago → data de
  // pagamento; em aberto → vencimento), pra o drill-down bater com as barras.
  const { data, isLoading } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano, baseData: "caixa" },
    { enabled: !!companyId }
  );
  // Rev. 3135 — Centros de Custo CADASTRADOS (financial_cost_centers) + categorias
  // (p/ derivar o centro pelo vínculo categoria→centro de custo). Substitui obra.
  const { data: accountsData } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId }
  );
  const { data: costCentersData } = (trpc as any).financial.getCostCenters.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const ccMaps = useMemo(
    () => buildCentroCustoMaps(
      Array.isArray(costCentersData) ? costCentersData : [],
      Array.isArray(accountsData) ? accountsData : [],
    ),
    [costCentersData, accountsData]
  );
  // Rev. 3019 — Espelha a tela-mãe: SÓ CUSTOS REAIS. Exclui a projeção do
  // cronograma (origem 'cronograma_atividade' = valor de contrato distribuído
  // mês a mês), que duplicaria as despesas reais e inflava os totais.
  // Rev. 3135 — enriquece cada linha com __centroNome (centro de custo resolvido).
  const rowsAll: any[] = useMemo(
    () => (Array.isArray(data) ? data : [])
      .filter((r) => String(r?.origemModulo ?? "") !== "cronograma_atividade")
      .map((r) => ({ ...r, __centroNome: centroCustoNomeDe(r, ccMaps) })),
    [data, ccMaps]
  );

  // Recorte: filtro de mês herdado da tela-mãe + filtro primário (tipo/valor)
  // + cadeia de drills feitos nesta tela (extra).
  const rows = useMemo(() => {
    let base = rowsAll;
    // tipo=mes define o próprio mês; senão respeita o filtro herdado.
    if (tipo === "mes") {
      base = base.filter((r) => mesNumDe(r) === parseInt(valor, 10));
    } else if (mes > 0) {
      base = base.filter((r) => mesNumDe(r) === mes);
    }
    base = aplicaFiltro(base, tipo, valor);
    for (const f of extra) base = aplicaFiltro(base, f.t, f.v);
    return base;
  }, [rowsAll, tipo, valor, mes, extra]);

  const kpis = useMemo(() => {
    let total = 0, pago = 0, aberto = 0, vencido = 0, qtdVencido = 0;
    for (const r of rows) {
      const ef = valorEfetivo(r);
      total += ef;
      if (r.status === "pago") pago += Number(r.valorRealizado ?? 0) || ef;
      else aberto += Number(r.valorPrevisto ?? 0) || ef;
      if (isVencido(r)) { vencido += ef; qtdVencido++; }
    }
    return { total, pago, aberto, vencido, qtdVencido, qtd: rows.length };
  }, [rows]);

  // Rev. 3151 — Filtro por card de status (clique no KPI). Os cards seguem
  // mostrando o resumo COMPLETO do recorte; este filtro só restringe a seção
  // de baixo (gráficos + tabela) ao status escolhido. "Custo do recorte" e
  // "Lançamentos" = limpar (mostrar tudo). Espelha a classificação dos kpis:
  // pago = status pago · aberto = não pago · vencido = isVencido (subconjunto).
  const [cardFiltro, setCardFiltro] = useState<null | "pago" | "aberto" | "vencido">(null);
  const matchCardFiltro = (r: any): boolean => {
    if (cardFiltro === "pago") return r.status === "pago";
    if (cardFiltro === "aberto") return r.status !== "pago";
    if (cardFiltro === "vencido") return isVencido(r);
    return true;
  };
  const rowsView = useMemo(
    () => (cardFiltro ? rows.filter(matchCardFiltro) : rows),
    [rows, cardFiltro]
  );
  const cardFiltroLabel = cardFiltro === "pago" ? "Pago" : cardFiltro === "aberto" ? "Em aberto" : cardFiltro === "vencido" ? "Vencido" : null;
  // Total da visão exibida (= kpis.total quando sem filtro; subconjunto quando filtrado).
  const viewTotal = useMemo(
    () => (cardFiltro ? rowsView.reduce((s, r) => s + valorEfetivo(r), 0) : kpis.total),
    [rowsView, cardFiltro, kpis.total]
  );
  const toggleCardFiltro = (fk: "all" | "pago" | "aberto" | "vencido") => {
    if (fk === "all") { setCardFiltro(null); return; }
    setCardFiltro((cur) => (cur === fk ? null : fk));
  };

  // Distribuição por mês (12 meses) do recorte (respeita o filtro de card).
  const porMes = useMemo(() => {
    const arr = MESES_ABREV.map((m) => ({ mes: m, value: 0 }));
    for (const r of rowsView) {
      const mn = mesNumDe(r);
      if (mn < 1 || mn > 12) continue;
      arr[mn - 1].value += valorEfetivo(r);
    }
    return arr;
  }, [rowsView]);

  // Quebra secundária pertinente: escolhe a 1ª dimensão AINDA NÃO filtrada
  // (fornecedor → centro → categoria), considerando o filtro primário e os drills.
  const breakdown = useMemo(() => {
    const usados = new Set<string>([tipo, ...extra.map((f) => f.t)]);
    const dim = ["fornecedor", "centro", "categoria"].find((d) => !usados.has(d)) || null;
    if (!dim) return { titulo: null as string | null, icon: Tag, dim: null as string | null, data: [] as { name: string; value: number }[] };
    const kf = keyOf[dim];
    const map = new Map<string, number>();
    for (const r of rowsView) {
      const k = kf(r);
      map.set(k, (map.get(k) ?? 0) + valorEfetivo(r));
    }
    const data = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    const meta = DIM_META[dim];
    return { titulo: meta.titulo, icon: meta.icon, dim, data };
  }, [rowsView, tipo, extra]);

  // Lançamentos detalhados (ordenados por valor desc · respeita o filtro de card).
  const lancamentos = useMemo(() => {
    return [...rowsView].sort((a, b) => valorEfetivo(b) - valorEfetivo(a));
  }, [rowsView]);

  // ───────── Rev. 3025 — Edição inline + reclassificação em massa ─────────
  const { toast } = useToast();
  const utils = (trpc as any).useUtils();
  const KEEP = "__keep__";
  const CLEAR = "__clear__";

  // Opções dos seletores: Categoria = Plano de Contas (financial_accounts);
  // Centro de Custo = CADASTRO de Centros de Custo (financial_cost_centers) — Rev. 3135.
  const categoriaOpcoes: { id: number; nome: string }[] = useMemo(() => {
    const list: any[] = Array.isArray(accountsData) ? accountsData : [];
    const seen = new Set<string>();
    const out: { id: number; nome: string }[] = [];
    for (const a of list) {
      const nome = String(a?.nome ?? "").trim();
      if (!nome) continue;
      const k = nome.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: a.id, nome });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [accountsData]);
  const centroOpcoes: { id: number; nome: string }[] = useMemo(() => {
    const list: any[] = Array.isArray(costCentersData) ? costCentersData : [];
    return list
      .map((o: any) => ({ id: o.id as number, nome: String(o?.nome ?? "").trim() }))
      .filter((o) => o.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [costCentersData]);

  // Seleção múltipla (cancelados não são selecionáveis).
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selecionaveis = useMemo(
    () => lancamentos.filter((r) => typeof r.id === "number" && r.status !== "cancelado"),
    [lancamentos]
  );
  const allSelected = selecionaveis.length > 0 && selecionaveis.every((r) => selected.has(r.id));
  const toggleId = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      selecionaveis.length > 0 && selecionaveis.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(selecionaveis.map((r) => r.id))
    );
  const limparSelecao = () => setSelected(new Set());
  // Rev. 3151 — ao trocar o filtro de card, limpa a seleção em massa: senão
  // ficariam selecionados itens OCULTOS pelo filtro e uma ação em lote
  // (reclassificar) atingiria linhas que o usuário nem está vendo.
  useEffect(() => { setSelected(new Set()); }, [cardFiltro]);

  // Barra de ações em massa.
  const [bulkCat, setBulkCat] = useState<string>(KEEP);
  const [bulkCentro, setBulkCentro] = useState<string>(KEEP);

  // Dialog de edição de UMA linha.
  const [editRow, setEditRow] = useState<any | null>(null);
  const [ef, setEf] = useState<{
    descricao: string; fornecedorNome: string; contaSel: string; centroSel: string;
    dataCompetencia: string; dataVencimento: string; valor: string;
  } | null>(null);
  const rowLocked = (r: any) => r?.status === "pago" || r?.status === "recebido";
  const abrirEdicao = (r: any) => {
    const cur = String(r.contaNome ?? "").trim();
    const catMatch = categoriaOpcoes.find((c) => c.nome.toLowerCase() === cur.toLowerCase());
    // Rev. 3135 — centro de custo cadastrado já resolvido em __centroNome.
    const ccCur = String(r.__centroNome ?? "").trim();
    const ccMatch = ccCur && ccCur !== SEM_CENTRO_CUSTO
      ? centroOpcoes.find((o) => o.nome.toLowerCase() === ccCur.toLowerCase())
      : undefined;
    const p = parseLanc(r);
    setEditRow(r);
    setEf({
      descricao: p.livre || r.descricao || r.origemDescricao || "",
      fornecedorNome: r.fornecedorNome || p.fornecedorDesc || "",
      contaSel: catMatch ? String(catMatch.id) : (cur ? "-1" : CLEAR),
      // Rev. 3135 — se o centro atual não casa com a lista (centro inativo/legado),
      // mantém o valor ATUAL via "-1" (não limpa implicitamente ao salvar).
      centroSel: ccMatch ? String(ccMatch.id) : (ccCur && ccCur !== SEM_CENTRO_CUSTO ? "-1" : CLEAR),
      dataCompetencia: (r.dataCompetencia || "").slice(0, 10),
      dataVencimento: (r.dataVencimento || "").slice(0, 10),
      valor: String(Number(r.valorPrevisto ?? valorEfetivo(r)) || 0),
    });
  };
  const fecharEdicao = () => { setEditRow(null); setEf(null); };

  // Opções do dialog incluem o valor ATUAL (id=-1) se ele não casar com a lista.
  const catOpcoesDialog = useMemo(() => {
    const cur = String(editRow?.contaNome ?? "").trim();
    const has = cur && categoriaOpcoes.some((c) => c.nome.toLowerCase() === cur.toLowerCase());
    return cur && !has ? [{ id: -1, nome: cur }, ...categoriaOpcoes] : categoriaOpcoes;
  }, [editRow, categoriaOpcoes]);

  // Rev. 3135 — inclui o centro de custo ATUAL (id=-1) se não casar com a lista
  // (centro inativo/legado) p/ exibir e preservar sem limpar implicitamente.
  const centroOpcoesDialog = useMemo(() => {
    const cur = String((editRow as any)?.__centroNome ?? "").trim();
    if (!cur || cur === SEM_CENTRO_CUSTO) return centroOpcoes;
    const has = centroOpcoes.some((o) => o.nome.toLowerCase() === cur.toLowerCase());
    return has ? centroOpcoes : [{ id: -1, nome: cur }, ...centroOpcoes];
  }, [editRow, centroOpcoes]);

  const updateEntryMut = (trpc as any).financial.updateEntry.useMutation({
    onSuccess: () => {
      toast({ title: "Lançamento atualizado!" });
      fecharEdicao();
      utils.financial.getContasAPagarByYear.invalidate();
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" }),
  });
  const bulkMut = (trpc as any).financial.bulkReclassificar.useMutation({
    onSuccess: (res: any) => {
      toast({ title: `Reclassificado(s) ${res?.changed ?? 0} lançamento(s)` });
      fecharEdicao();
      limparSelecao();
      setBulkCat(KEEP); setBulkCentro(KEEP);
      utils.financial.getContasAPagarByYear.invalidate();
    },
    onError: (e: any) => toast({ title: "Erro ao aplicar", description: e?.message, variant: "destructive" }),
  });
  const salvando = updateEntryMut.isPending || bulkMut.isPending;

  // Resolve um Select de categoria/obra → { nome, id } a gravar.
  const resolveCat = (sel: string, fallback?: any): { contaNome: string; contaId: number | null } => {
    if (sel === CLEAR) return { contaNome: "", contaId: null };
    if (sel === "-1") return { contaNome: fallback?.contaNome || "", contaId: fallback?.contaId ?? null };
    const o = categoriaOpcoes.find((c) => String(c.id) === sel);
    return { contaNome: o?.nome ?? "", contaId: o?.id ?? null };
  };
  // Rev. 3135 — Centro de custo CADASTRADO (financial_cost_centers) → { nome, id }.
  // "-1" = manter o centro ATUAL do lançamento (centro inativo/legado fora da lista),
  // espelhando o padrão da categoria; evita limpar o CC sem o usuário pedir.
  const resolveCentro = (sel: string, fallback?: any): { centroCustoNome: string; centroCustoId: number | null } => {
    if (sel === CLEAR) return { centroCustoNome: "", centroCustoId: null };
    if (sel === "-1") return {
      centroCustoNome: fallback?.centroCustoNome || fallback?.__centroNome || "",
      centroCustoId: fallback?.centroCustoId ?? null,
    };
    const o = centroOpcoes.find((x) => String(x.id) === sel);
    return { centroCustoNome: o?.nome ?? "", centroCustoId: o?.id ?? null };
  };

  const salvarEdicao = () => {
    if (!editRow || !ef) return;
    const cat = resolveCat(ef.contaSel, editRow);
    const centro = resolveCentro(ef.centroSel, editRow);
    if (rowLocked(editRow)) {
      // Pago/recebido: só reclassifica categoria/centro (não toca valor/datas).
      bulkMut.mutate({ companyId, ids: [editRow.id], ...cat, ...centro });
    } else {
      updateEntryMut.mutate({
        id: editRow.id, companyId,
        descricao: ef.descricao,
        fornecedorNome: ef.fornecedorNome,
        ...cat, ...centro,
        dataCompetencia: ef.dataCompetencia || undefined,
        dataVencimento: ef.dataVencimento || undefined,
        valorPrevisto: parseFloat(ef.valor) || 0,
      });
    }
  };

  const aplicarBulk = () => {
    if (selected.size === 0) return;
    const payload: any = { companyId, ids: Array.from(selected) };
    let temAlgo = false;
    if (bulkCat !== KEEP) { temAlgo = true; Object.assign(payload, resolveCat(bulkCat)); }
    if (bulkCentro !== KEEP) { temAlgo = true; Object.assign(payload, resolveCentro(bulkCentro)); }
    if (!temAlgo) {
      toast({ title: "Escolha categoria e/ou centro de custo", variant: "destructive" });
      return;
    }
    bulkMut.mutate(payload);
  };

  // Rótulo legível de cada dimensão (pro título e pro breadcrumb dos drills).
  const rotuloDim: Record<string, string> = {
    fornecedor: "Fornecedor", centro: "Centro de custo", categoria: "Categoria", grupo: "Categoria", mes: "Mês",
  };
  // Rótulo legível de um passo de drill (mês vira nome do mês; demais usam o próprio valor).
  const rotuloStep = (f: DrillStep) =>
    f.t === "mes" ? (MESES_FULL[parseInt(f.v, 10) - 1] || `Mês ${f.v}`) : f.v;

  // Cabeçalho descritivo do recorte.
  const { titulo, subtitulo, Icon } = useMemo(() => {
    const periodo = mes > 0 && tipo !== "mes" ? `${MESES_FULL[mes - 1]} de ${ano}` : `Ano de ${ano}`;
    // Se há drills, o título passa a ser o ÚLTIMO drill e o subtítulo monta a trilha.
    if (extra.length) {
      const ultimo = extra[extra.length - 1];
      const primarioLbl =
        tipo === "categoria" || tipo === "centro" || tipo === "fornecedor" || tipo === "grupo" ? valor
        : tipo === "mes" ? (MESES_FULL[parseInt(valor, 10) - 1] || `Mês ${valor}`)
        : (valor === "pago" ? "Pago" : valor === "aberto" ? "Em aberto" : valor === "vencido" ? "Vencido" : "Custo total");
      const trilha = [primarioLbl, ...extra.map(rotuloStep)].join(" › ");
      const ic = ultimo.t === "fornecedor" ? Building2 : ultimo.t === "centro" ? Layers : ultimo.t === "mes" ? Calendar : Tag;
      return { titulo: rotuloStep(ultimo), subtitulo: `${rotuloDim[ultimo.t] || "Recorte"} · ${trilha} · ${periodo}`, Icon: ic };
    }
    switch (tipo) {
      case "mes": {
        const mn = parseInt(valor, 10);
        return { titulo: MESES_FULL[mn - 1] ? `${MESES_FULL[mn - 1]} de ${ano}` : `Mês ${valor}`, subtitulo: "Lançamentos do mês", Icon: Calendar };
      }
      case "categoria":
        return { titulo: valor, subtitulo: `Categoria · ${periodo}`, Icon: Tag };
      case "grupo":
        return { titulo: valor, subtitulo: `Categoria padronizada · ${periodo}`, Icon: Tag };
      case "centro":
        return { titulo: valor, subtitulo: `Centro de custo · ${periodo}`, Icon: Layers };
      case "fornecedor":
        return { titulo: valor, subtitulo: `Fornecedor · ${periodo}`, Icon: Building2 };
      default: {
        const lbl = valor === "pago" ? "Pago" : valor === "aberto" ? "Em aberto" : valor === "vencido" ? "Vencido" : "Custo total";
        return { titulo: lbl, subtitulo: `Visão geral · ${periodo}`, Icon: CircleDollarSign };
      }
    }
  }, [tipo, valor, mes, ano, extra]);

  const semDados = !isLoading && rows.length === 0;
  // Voltar: se há drills, sobe UM nível; senão volta à tela-mãe.
  const voltar = () => {
    if (extra.length) irPara(extra.slice(0, -1));
    else setLocation("/financeiro/analise-custos");
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={voltar}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2 min-w-0">
                <Icon className="w-5 h-5 md:w-6 md:h-6 text-rose-600 shrink-0" />
                <span className="truncate" title={titulo}>{titulo}</span>
              </h1>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitulo}</p>
            </div>
          </div>
        </div>

        {/* KPIs do recorte */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {([
            { label: "Custo do recorte", value: kpis.total, icon: CircleDollarSign, color: "text-rose-600", bg: "bg-rose-50", fmt: "brl", fk: "all" as const, ring: "ring-rose-400" },
            { label: "Pago", value: kpis.pago, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", fmt: "brl", fk: "pago" as const, ring: "ring-emerald-400" },
            { label: "Em aberto", value: kpis.aberto, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50", fmt: "brl", fk: "aberto" as const, ring: "ring-amber-400" },
            { label: "Vencido", value: kpis.vencido, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", fmt: "brl", badge: kpis.qtdVencido, fk: "vencido" as const, ring: "ring-red-400" },
            { label: "Lançamentos", value: kpis.qtd, icon: ListChecks, color: "text-indigo-600", bg: "bg-indigo-50", fmt: "int", fk: "all" as const, ring: "ring-indigo-400" },
          ] as Array<{ label: string; value: number; icon: any; color: string; bg: string; fmt: string; badge?: number; fk: "all" | "pago" | "aberto" | "vencido"; ring: string }>).map((c) => {
            const I = c.icon;
            const isInt = c.fmt === "int";
            const ativo = c.fk !== "all" && cardFiltro === c.fk;
            return (
              <Card
                key={c.label}
                role="button"
                tabIndex={0}
                aria-pressed={ativo}
                onClick={() => toggleCardFiltro(c.fk)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCardFiltro(c.fk); } }}
                className={`border-0 shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${ativo ? `ring-2 ${c.ring} ring-offset-1` : ""}`}
                title={c.fk === "all" ? "Mostrar todos os lançamentos" : ativo ? `Remover filtro · ${c.label}` : `Filtrar por ${c.label}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <I className={`w-4 h-4 ${c.color}`} />
                    </div>
                    {c.badge !== undefined && c.badge > 0 && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5">{c.badge}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                    {c.label}
                    {ativo && <span className="text-[9px] font-semibold text-gray-400">• filtrando</span>}
                  </p>
                  <p
                    className={`text-sm lg:text-base font-bold ${c.color} mt-0.5 tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis`}
                    title={isLoading ? undefined : isInt ? c.value.toLocaleString("pt-BR") : formatBRL(c.value)}
                  >
                    {isLoading ? "..." : isInt ? c.value.toLocaleString("pt-BR") : formatBRL(c.value)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ─── Rev. 4158 — Seletor de abas (só para fornecedor) ─── */}
        {fornecedorFoco && (
          <div className="flex gap-1 border-b border-gray-200 pb-0 -mb-1">
            {([
              { id: 'lancamentos' as const, label: 'Lançamentos Financeiros', icon: ListChecks },
              { id: 'itens' as const, label: 'Itens & Preços (OCs)', icon: Package },
            ] as { id: 'lancamentos' | 'itens'; label: string; icon: any }[]).map((t) => {
              const I = t.icon;
              const ativo = aba === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAba(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-colors ${
                    ativo
                      ? 'bg-white border-gray-200 text-indigo-700 shadow-sm -mb-px'
                      : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <I className="w-3.5 h-3.5" />
                  {t.label}
                  {t.id === 'itens' && analiseData?.resumo && (
                    <span className="ml-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 leading-none">
                      {analiseData.resumo.qtdItensdistintos}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Aba: Lançamentos (conteúdo original) ─── */}
        {(aba === 'lancamentos' || !fornecedorFoco) && (semDados ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <CircleDollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhum lançamento neste recorte.</p>
              <p className="text-xs text-gray-400 mt-1">Volte e selecione outro item.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Gráficos pertinentes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Distribuição por mês — só faz sentido quando NÃO há mês fixo (herdado, primário ou drillado) */}
              {tipo !== "mes" && mes <= 0 && !extra.some((f) => f.t === "mes") && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" /> Distribuição por Mês — {ano}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-4">
                    <p className="text-[11px] text-gray-400 px-2 -mt-1 mb-1">Toque numa barra para ver só aquele mês</p>
                    <div style={{ width: "100%", height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart data={porMes} margin={{ top: 22, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                          <RechTooltip content={<DetTooltip />} cursor={{ fill: "#f8fafc" }} />
                          <Bar
                            dataKey="value"
                            name="Custo"
                            fill="#6366f1"
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(_d: any, idx: number) => drillMes(idx + 1)}
                          />
                          {/* Rev. 3069: rótulos de valor no topo das barras REMOVIDOS — em meses
                              com valores iguais eles se sobrepunham e ficavam ilegíveis; o valor
                              aparece ao tocar na barra (tooltip DetTooltip). */}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quebra por dimensão secundária */}
              <Card className={`border-0 shadow-sm ${tipo === "mes" ? "lg:col-span-2" : ""}`}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                    <breakdown.icon className="w-4 h-4" /> {breakdown.titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-4">
                  {breakdown.data.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-12">Sem dados para esta quebra</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-gray-400 px-2 mb-1">Toque numa barra para abrir só aquele recorte</p>
                      <div style={{ width: "100%", height: Math.max(220, breakdown.data.length * 46 + 24) }}>
                        <ResponsiveContainer>
                          <BarChart data={breakdown.data} layout="vertical" margin={{ top: 4, right: 132, left: 8, bottom: 0 }} barCategoryGap="22%">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                            <XAxis type="number" tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={150}
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              tickFormatter={(v: string) => (v && v.length > 22 ? v.slice(0, 21) + "…" : v)}
                              axisLine={false}
                              tickLine={false}
                            />
                            <RechTooltip content={<DetTooltip totalRef={kpis.total} />} cursor={{ fill: "#f8fafc" }} />
                            <Bar
                              dataKey="value"
                              name="Custo"
                              fill="#06b6d4"
                              radius={[0, 4, 4, 0]}
                              maxBarSize={26}
                              cursor="pointer"
                              onClick={(d: any) => breakdown.dim && drillBarra(breakdown.dim, d?.name ?? d?.payload?.name)}
                            >
                              <LabelList dataKey="value" position="right" formatter={formatBRL} style={{ fontSize: 10, fill: "#475569" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Barra de ações em massa — aparece com ≥1 selecionado */}
            {selected.size > 0 && (
              <div className="sticky top-2 z-20 rounded-xl border border-indigo-200 bg-indigo-50/95 backdrop-blur shadow-sm px-3 py-2.5 flex flex-col lg:flex-row lg:items-center gap-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800 shrink-0">
                  <ListChecks className="w-4 h-4" />
                  {selected.size} selecionado{selected.size > 1 ? "s" : ""}
                </div>
                <div className="flex flex-1 flex-col sm:flex-row gap-2">
                  <div className="flex-1 min-w-[160px]">
                    <Select value={bulkCat} onValueChange={setBulkCat}>
                      <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Categoria…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Categoria — manter</SelectItem>
                        <SelectItem value={CLEAR}>Sem categoria</SelectItem>
                        {categoriaOpcoes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Select value={bulkCentro} onValueChange={setBulkCentro}>
                      <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Centro de custo…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Centro de custo — manter</SelectItem>
                        <SelectItem value={CLEAR}>Sem centro de custo</SelectItem>
                        {centroOpcoes.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="h-9" onClick={aplicarBulk} disabled={salvando || (bulkCat === KEEP && bulkCentro === KEEP)}>
                    {salvando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                    Aplicar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={limparSelecao} disabled={salvando}>
                    <X className="w-4 h-4 mr-1" /> Limpar
                  </Button>
                </div>
              </div>
            )}

            {/* Tabela detalhada */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex flex-wrap items-center gap-2">
                  <ListChecks className="w-4 h-4" /> Lançamentos detalhados
                  <span className="text-xs font-normal text-gray-400">({lancamentos.length})</span>
                  {cardFiltroLabel && (
                    <button
                      type="button"
                      onClick={() => setCardFiltro(null)}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-0.5 text-[11px] font-medium"
                      title="Remover filtro"
                    >
                      Filtrando: {cardFiltroLabel}
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-5 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[680px]">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-200">
                        <th className="py-2.5 pl-1 pr-2 w-8">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleAll}
                            aria-label="Selecionar todos"
                            disabled={selecionaveis.length === 0}
                          />
                        </th>
                        <th className="text-left font-medium py-2.5 pr-3">Lançamento</th>
                        <th className="text-left font-medium py-2.5 px-2">Classificação</th>
                        <th className="text-left font-medium py-2.5 px-2 whitespace-nowrap">Datas</th>
                        <th className="text-center font-medium py-2.5 px-2">Status</th>
                        <th className="text-right font-medium py-2.5 pl-2">Valor</th>
                        <th className="text-center font-medium py-2.5 px-2 w-10">Editar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentos.map((r, i) => {
                        const st = statusTheme(r);
                        const temId = typeof r.id === "number";
                        const cancelado = r.status === "cancelado";
                        const sel = temId && selected.has(r.id);
                        const p = parseLanc(r);
                        const link = linkDeOrigem(r);
                        const forn = fornecedorDe(r);
                        return (
                          <tr
                            key={r.id ?? i}
                            className={`border-b border-gray-100 cursor-pointer transition-colors ${sel ? "bg-indigo-50/70" : "hover:bg-gray-50"}`}
                            onClick={() => temId && abrirEdicao(r)}
                          >
                            <td className="py-3 pl-1 pr-2 align-top" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={!!sel}
                                onCheckedChange={() => temId && toggleId(r.id)}
                                disabled={!temId || cancelado}
                                aria-label="Selecionar lançamento"
                                className="mt-0.5"
                              />
                            </td>
                            {/* Lançamento: nº doc + descrição (linha 1) · fornecedor (linha 2) */}
                            <td className="py-3 pr-3 align-top max-w-[320px]">
                              <div className="min-w-0">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  {p.docNumero ? (
                                    link ? (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setLocation(link); }}
                                        className="shrink-0 inline-flex items-center gap-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                                        title={`Abrir ${p.docNumero}`}
                                      >
                                        {p.docNumero}
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                    ) : (
                                      <span className="shrink-0 inline-flex items-center rounded-md bg-gray-100 text-gray-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{p.docNumero}</span>
                                    )
                                  ) : null}
                                  <span className="font-medium text-gray-800 leading-snug break-words" title={p.livre || forn || ""}>
                                    {p.livre || (p.docNumero ? "" : <span className="text-gray-400 font-normal">—</span>)}
                                  </span>
                                </div>
                                {forn ? (
                                  <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1 min-w-0">
                                    <Building2 className="w-3 h-3 shrink-0 text-gray-400" />
                                    <span className="break-words leading-snug" title={forn}>{forn}</span>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            {/* Classificação: categoria (chip) + centro de custo */}
                            <td className="py-3 px-2 align-top max-w-[220px]">
                              <div className="min-w-0">
                                <span className="inline-flex items-start gap-1 rounded-md bg-gray-100 text-gray-700 px-1.5 py-0.5 text-[11px] font-medium max-w-full">
                                  <Tag className="w-3 h-3 shrink-0 text-gray-400 mt-px" />
                                  <span className="break-words leading-snug" title={r.contaNome || ""}>{r.contaNome || "Sem categoria"}</span>
                                </span>
                                <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1 min-w-0">
                                  <Layers className="w-3 h-3 shrink-0 text-gray-400" />
                                  <span className="break-words leading-snug" title={r.__centroNome || ""}>{r.__centroNome || "Sem centro de custo"}</span>
                                </div>
                              </div>
                            </td>
                            {/* Datas: competência + vencimento empilhadas e rotuladas */}
                            <td className="py-3 px-2 align-top whitespace-nowrap">
                              <div className="text-[11px] tabular-nums leading-snug">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 w-9 shrink-0">Comp.</span>
                                  <span className="text-gray-600">{fmtData(r.dataCompetencia)}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-gray-400 w-9 shrink-0">Venc.</span>
                                  <span className={isVencido(r) ? "text-red-600 font-semibold" : "text-gray-600"}>{fmtData(r.dataVencimento)}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center align-top">
                              <span className={`inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="py-3 pl-2 text-right align-top tabular-nums font-bold text-gray-800 whitespace-nowrap">{formatBRL(valorEfetivo(r))}</td>
                            <td className="py-3 px-2 text-center align-top" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-indigo-600"
                                disabled={!temId}
                                onClick={() => temId && abrirEdicao(r)}
                                title="Editar lançamento"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {lancamentos.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-sm text-gray-400">
                            Nenhum lançamento {cardFiltroLabel ? `com status "${cardFiltroLabel}"` : ""} neste recorte.
                            {cardFiltroLabel && (
                              <button
                                type="button"
                                onClick={() => setCardFiltro(null)}
                                className="ml-2 text-indigo-600 hover:underline font-medium"
                              >
                                Mostrar tudo
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td colSpan={4} className="py-2.5 pr-2 text-right font-semibold text-gray-600">Total do recorte</td>
                        <td className="py-2.5 px-2 text-center text-[11px] text-gray-400 font-medium whitespace-nowrap">{lancamentos.length} lanç.</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-bold text-rose-600 whitespace-nowrap">{formatBRL(viewTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ))}

        {/* ─── Aba: Itens & Preços (OCs) — Rev. 4158 ─── */}
        {aba === 'itens' && fornecedorFoco && (() => {
          if (analiseLoading) return (
            <div className="flex items-center justify-center py-20 gap-2 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Carregando análise de itens…
            </div>
          );
          if (!analiseData) return (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-16 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Sem dados de OC para este fornecedor.</p>
                <p className="text-xs text-gray-400 mt-1">As análises de itens requerem Ordens de Compra registradas no módulo de Compras.</p>
              </CardContent>
            </Card>
          );
          const { resumo, itens, formasPagamento } = analiseData;

          // Helper: badge de variação de preço
          const VariacaoBadge = ({ pct, reason }: { pct: number; reason?: string }) => {
            if (reason === 'unidade_mista') return (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 rounded-full px-1.5 py-0.5 ring-1 ring-purple-200" title="Unidades diferentes foram compradas — comparação de preços não é válida">
                <AlertTriangle className="w-2.5 h-2.5" />unid. mista
              </span>
            );
            if (pct <= 2) return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5"><Minus className="w-2.5 h-2.5" />{pct.toFixed(1)}%</span>;
            if (pct <= 10) return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5"><TrendingUp className="w-2.5 h-2.5" />{pct.toFixed(1)}%</span>;
            return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 rounded-full px-1.5 py-0.5 ring-1 ring-red-200"><TrendingUp className="w-2.5 h-2.5" />{pct.toFixed(1)}%</span>;
          };

          // Dados do mini-chart de preço do item selecionado
          const chartItemData = chartItem
            ? (itens.find((it: any) => `${it.descricao}|||${it.unidade ?? ''}` === chartItem)?.ocorrencias ?? [])
                .slice()
                .reverse()
                .map((oc: any) => ({ data: oc.data ?? '', preco: oc.precoUnitario, oc: oc.numeroOc }))
            : [];

          // Itens filtrados pela busca
          const searchLow = searchTerm.trim().toLowerCase();
          const itensFiltrados = searchLow
            ? itens.filter((it: any) => it.descricao?.toLowerCase().includes(searchLow))
            : itens;

          return (
            <div className="space-y-4">
              {/* ── KPIs da análise de OCs ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total em OCs', value: formatBRL(resumo.totalGasto), icon: CircleDollarSign, color: 'text-rose-600', bg: 'bg-rose-50' },
                  { label: 'Ordens de Compra', value: resumo.qtdOcs.toString(), icon: ShoppingCart, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'Itens distintos', value: resumo.qtdItensdistintos.toString(), icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
                  { label: 'Obras atendidas', value: resumo.obrasAtendidas.length.toString(), icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50', tooltip: resumo.obrasAtendidas.map((o: any) => o.nome ?? o).join(', ') },
                ].map((c) => {
                  const I = c.icon;
                  return (
                    <Card key={c.label} className="border-0 shadow-sm" title={(c as any).tooltip}>
                      <CardContent className="p-3.5">
                        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                          <I className={`w-4 h-4 ${c.color}`} />
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">{c.label}</p>
                        <p className={`text-sm font-bold ${c.color} mt-0.5 tabular-nums`}>{c.value}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* ── Painel de Análise (full-width, separado) ── */}
              <AnaliseDashPanel itens={itens} totalGasto={resumo.totalGasto} />

              {/* ── Tabela de itens (full-width) ── */}
              <div>
                  <Card className="border-0 shadow-sm">
                    {/* Barra de busca + filtro de obra */}
                    <div className="px-5 pt-4 pb-0 flex flex-wrap items-center gap-2">
                      {/* Busca por produto */}
                      <div className="relative flex-1 min-w-[180px] max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar produto…"
                          className="w-full h-8 pl-8 pr-3 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        />
                        {searchTerm && (
                          <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {/* Filtro de obra */}
                      {resumo.obrasAtendidas.length > 1 && (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <Select
                            value={obraIdFiltro !== null ? String(obraIdFiltro) : 'todas'}
                            onValueChange={(v) => {
                              const newId = v === 'todas' ? null : Number(v);
                              setObraIdFiltro(newId);
                              setExpandedItems(new Set());
                              setChartItem(null);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs border-gray-200 bg-white w-auto min-w-[160px] max-w-full">
                              <SelectValue placeholder="Filtrar por obra…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todas" className="text-xs">Todas as obras</SelectItem>
                              {resumo.obrasAtendidas.map((ob: { id: number | null; nome: string }) => (
                                <SelectItem key={ob.id ?? 'null'} value={String(ob.id ?? 0)} className="text-xs">
                                  {ob.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {obraIdFiltro !== null && (
                            <button
                              onClick={() => { setObraIdFiltro(null); setExpandedItems(new Set()); setChartItem(null); }}
                              className="text-[10px] text-gray-400 hover:text-gray-600 underline whitespace-nowrap"
                            >
                              Limpar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <CardHeader className="pb-2 pt-3 px-5">
                      <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2 flex-wrap">
                        <Package className="w-4 h-4" /> Produtos comprados
                        <span className="text-xs font-normal text-gray-400">
                          {searchLow ? `${itensFiltrados.length} de ${itens.length}` : itens.length}
                        </span>
                        {itens.some((it: any) => it.variacaoPct > 10 && it.variacaoReason !== 'unidade_mista') && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 rounded-full px-2 py-0.5 ring-1 ring-red-200">
                            <AlertTriangle className="w-3 h-3" />
                            {itens.filter((it: any) => it.variacaoPct > 10 && it.variacaoReason !== 'unidade_mista').length} variação alta
                          </span>
                        )}
                        {itens.some((it: any) => it.variacaoReason === 'unidade_mista') && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5 ring-1 ring-purple-200">
                            <AlertTriangle className="w-3 h-3" />
                            {itens.filter((it: any) => it.variacaoReason === 'unidade_mista').length} unid. mista
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-4 pb-4">
                      {itensFiltrados.length === 0 ? (
                        <div className="text-center py-10">
                          <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">
                            {searchLow
                              ? `Nenhum produto encontrado para "${searchTerm}"`
                              : `Nenhum item${resumo.qtdOcs === 0 ? ' — sem OCs no período' : ''}`}
                          </p>
                          {searchLow && (
                            <button onClick={() => setSearchTerm("")} className="text-xs text-indigo-500 underline mt-1">Limpar busca</button>
                          )}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs min-w-[640px]">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-200">
                                <th className="py-2 pr-2 w-6" />
                                <th className="text-left font-medium py-2 pr-3">Produto</th>
                                <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Qtd. total</th>
                                <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Preço mín.</th>
                                <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Preço máx.</th>
                                <th className="text-center font-medium py-2 px-2">Variação</th>
                                <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Total gasto</th>
                                <th className="text-center font-medium py-2 px-2">OCs</th>
                                <th className="text-left font-medium py-2 pl-2 whitespace-nowrap">Última compra</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itensFiltrados.map((item: any, idx: number) => {
                                const ikey = `${item.descricao}|||${item.unidade ?? ''}`;
                                const expanded = expandedItems.has(ikey);
                                const isChartSel = chartItem === ikey;
                                return (
                                  <Fragment key={ikey}>
                                    <tr
                                      className={`border-b border-gray-100 cursor-pointer transition-colors ${expanded ? 'bg-indigo-50/40' : 'hover:bg-gray-50'} ${item.variacaoReason === 'unidade_mista' ? 'border-l-2 border-l-purple-400' : item.variacaoPct > 10 ? 'border-l-2 border-l-amber-400' : ''}`}
                                      onClick={() => toggleExpand(ikey)}
                                    >
                                      <td className="py-3 pr-1 pl-1 text-gray-400">
                                        {expanded
                                          ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                                          : <ChevronRight className="w-3.5 h-3.5" />}
                                      </td>
                                      <td className="py-3 pr-3 align-top">
                                        <div className="font-medium text-gray-800 break-words leading-snug">{item.descricao}</div>
                                        {item.unidade && <span className="text-[10px] text-gray-400 mt-0.5">{item.unidade}</span>}
                                      </td>
                                      <td className="py-3 px-2 text-right tabular-nums text-gray-700">
                                        {item.qtdMixed
                                          ? <span className="text-gray-400 text-[11px]">unid. var.</span>
                                          : <>
                                              {item.qtdTotal % 1 === 0
                                                ? item.qtdTotal.toLocaleString('pt-BR')
                                                : item.qtdTotal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                                              {item.unidade ? <span className="text-gray-400 ml-0.5">{item.unidade}</span> : null}
                                            </>
                                        }
                                      </td>
                                      <td className="py-3 px-2 text-right tabular-nums text-gray-700 whitespace-nowrap">
                                        {formatBRL(item.precoMin)}
                                        {item.unidade && !item.qtdMixed && (
                                          <div className="text-[10px] text-gray-400 leading-none mt-0.5">/{item.unidade}</div>
                                        )}
                                      </td>
                                      <td className="py-3 px-2 text-right tabular-nums text-gray-700 whitespace-nowrap">
                                        {formatBRL(item.precoMax)}
                                        {item.unidade && !item.qtdMixed && (
                                          <div className="text-[10px] text-gray-400 leading-none mt-0.5">/{item.unidade}</div>
                                        )}
                                      </td>
                                      <td className="py-3 px-2 text-center"><VariacaoBadge pct={item.variacaoPct} reason={item.variacaoReason} /></td>
                                      <td className="py-3 px-2 text-right tabular-nums font-bold text-gray-800 whitespace-nowrap">{formatBRL(item.valorTotal)}</td>
                                      <td className="py-3 px-2 text-center tabular-nums text-gray-600">{item.qtdOcs}</td>
                                      <td className="py-3 pl-2 text-left tabular-nums text-gray-500 whitespace-nowrap">
                                        {item.ultimaCompra ? fmtData(item.ultimaCompra) : '—'}
                                      </td>
                                    </tr>
                                    {/* Sub-linha: ocorrências expandidas */}
                                    {expanded && (
                                      <tr key={`${ikey}-expanded`} className="bg-indigo-50/30">
                                        <td />
                                        <td colSpan={8} className="pb-3 pt-1 px-2">
                                          {/* Mini-chart botão */}
                                          <div className="flex items-center justify-between mb-2 px-1">
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                              {item.ocorrencias.length} ocorrência{item.ocorrencias.length !== 1 ? 's' : ''}
                                            </p>
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); setChartItem(isChartSel ? null : ikey); }}
                                              className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors ${isChartSel ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                                            >
                                              <TrendingUp className="w-3 h-3" /> Evolução de preço
                                            </button>
                                          </div>
                                          {/* Diagnóstico de variação */}
                                          {(item.variacaoReason !== 'ok' || item.mesesSpan > 1) && (
                                            <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                                              {item.variacaoReason === 'unidade_mista' && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-50 rounded px-2 py-0.5 border border-purple-200">
                                                  <AlertTriangle className="w-2.5 h-2.5" />
                                                  Unidades diferentes: comparação de preços inválida
                                                </span>
                                              )}
                                              {item.temPrecoZero && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 bg-orange-50 rounded px-2 py-0.5 border border-orange-200">
                                                  <AlertTriangle className="w-2.5 h-2.5" />
                                                  Contém OC com preço R$0,00 (excluída do % de variação)
                                                </span>
                                              )}
                                              {item.mesesSpan > 1 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 rounded px-2 py-0.5 border border-blue-200">
                                                  Intervalo de {item.mesesSpan} mês{item.mesesSpan !== 1 ? 'es' : ''} entre compras
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          {/* Mini-chart de evolução de preço */}
                                          {isChartSel && chartItemData.length >= 2 && (
                                            <div className="mb-3 rounded-lg bg-white border border-gray-100 p-3" onClick={(e) => e.stopPropagation()}>
                                              <p className="text-[10px] text-gray-400 mb-1">Preço unitário por OC (mais antigas → mais recentes)</p>
                                              <div style={{ width: '100%', height: 120 }}>
                                                <ResponsiveContainer>
                                                  <LineChart data={chartItemData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="data" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(5) : ''} />
                                                    <YAxis tickFormatter={(v: number) => `R$${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={60} />
                                                    <RechTooltip
                                                      formatter={(v: any, _n: any, p: any) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, p.payload.oc]}
                                                      labelFormatter={(l: string) => `Data: ${l}`}
                                                      contentStyle={{ fontSize: 11 }}
                                                    />
                                                    <ReferenceLine y={item.precoAvg} stroke="#6366f1" strokeDasharray="4 2" label={{ value: 'Média', fontSize: 9, fill: '#6366f1' }} />
                                                    <Line type="monotone" dataKey="preco" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 4 }} name="Preço" />
                                                  </LineChart>
                                                </ResponsiveContainer>
                                              </div>
                                            </div>
                                          )}
                                          {/* Tabela de ocorrências */}
                                          <div className="rounded-lg border border-gray-100 overflow-hidden bg-white" onClick={(e) => e.stopPropagation()}>
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="bg-gray-50 text-gray-400 border-b border-gray-100">
                                                  <th className="text-left font-medium py-1.5 px-3 whitespace-nowrap">Nº OC</th>
                                                  <th className="text-left font-medium py-1.5 px-2 whitespace-nowrap">Data</th>
                                                  <th className="text-left font-medium py-1.5 px-2">Obra</th>
                                                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Qtd</th>
                                                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Preço unit.</th>
                                                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Total</th>
                                                  <th className="text-left font-medium py-1.5 px-2 whitespace-nowrap">Pagamento</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {item.ocorrencias.map((oc: any, oi: number) => {
                                                  const isZero = oc.precoUnitario === 0;
                                                  return (
                                                  <tr key={oi} className={`border-b border-gray-50 ${isZero ? 'bg-orange-50/60' : 'hover:bg-indigo-50/30'}`}>
                                                    <td className="py-2 px-3 whitespace-nowrap">
                                                      {oc.ordemId
                                                        ? <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedOcId(oc.ordemId); }} className="font-mono font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 transition-colors">{oc.numeroOc || '—'}</button>
                                                        : <span className="font-mono font-semibold text-indigo-700">{oc.numeroOc || '—'}</span>
                                                      }
                                                    </td>
                                                    <td className="py-2 px-2 tabular-nums text-gray-600 whitespace-nowrap">{fmtData(oc.data)}</td>
                                                    <td className="py-2 px-2 text-gray-600 break-words max-w-[160px]">{oc.obraNome || '—'}</td>
                                                    <td className="py-2 px-2 text-right tabular-nums text-gray-700">
                                                      {oc.quantidade % 1 === 0
                                                        ? oc.quantidade.toLocaleString('pt-BR')
                                                        : oc.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                                                    </td>
                                                    <td className={`py-2 px-2 text-right tabular-nums font-semibold whitespace-nowrap ${isZero ? 'text-orange-600' : 'text-gray-800'}`}>
                                                      {isZero
                                                        ? <span className="inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />R$0,00</span>
                                                        : formatBRL(oc.precoUnitario)}
                                                    </td>
                                                    <td className="py-2 px-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{formatBRL(oc.total)}</td>
                                                    <td className="py-2 px-2">
                                                      {oc.formaPagamento
                                                        ? <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-1.5 py-0.5 text-[10px] font-medium"><CreditCard className="w-2.5 h-2.5" />{oc.formaPagamento}{oc.condicaoPagamento ? ` · ${oc.condicaoPagamento}` : ''}</span>
                                                        : <span className="text-gray-300">—</span>}
                                                    </td>
                                                  </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-200">
                                <td colSpan={6} className="py-2.5 pr-2 text-right font-semibold text-gray-600 text-xs">
                                  {searchLow ? `Total filtrado` : `Total em OCs`}
                                </td>
                                <td className="py-2.5 px-2 text-right tabular-nums font-bold text-rose-600 text-xs whitespace-nowrap">
                                  {formatBRL(itensFiltrados.reduce((s: number, it: any) => s + it.valorTotal, 0))}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

              </div>

              {/* ── Formas de Pagamento + Obras Atendidas (full-width, abaixo da tabela) ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Formas de pagamento */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Formas de Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {formasPagamento.length === 0 ? (
                      <p className="text-xs text-gray-400 py-6 text-center">Sem dados de pagamento</p>
                    ) : (
                      <div className="space-y-2.5">
                        {formasPagamento.map((fp: any, i: number) => (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-gray-700 break-words">{fp.forma}</span>
                                {fp.condicao && <span className="text-[10px] text-gray-400 ml-1.5">{fp.condicao}</span>}
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <span className="text-xs font-bold text-gray-800 tabular-nums">{fp.pct}%</span>
                                <span className="text-[10px] text-gray-400 ml-1">({fp.qtdOcs} OC{fp.qtdOcs !== 1 ? 's' : ''})</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-400 transition-all"
                                style={{ width: `${fp.pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-gray-400 tabular-nums">{formatBRL(fp.valorTotal)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Obras atendidas */}
                {resumo.obrasAtendidas.length > 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Obras Atendidas
                        {obraIdFiltro !== null && (
                          <span className="text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">filtrada</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="space-y-1">
                        {resumo.obrasAtendidas.map((ob: { id: number | null; nome: string }, i: number) => {
                          const isAtiva = obraIdFiltro !== null && obraIdFiltro === ob.id;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                if (isAtiva) { setObraIdFiltro(null); setExpandedItems(new Set()); setChartItem(null); }
                                else if (ob.id != null) { setObraIdFiltro(ob.id); setExpandedItems(new Set()); setChartItem(null); }
                              }}
                              disabled={ob.id == null}
                              className={`w-full flex items-start gap-1.5 text-xs rounded px-1 py-0.5 transition-colors text-left ${isAtiva ? 'bg-amber-100 text-amber-800 font-medium' : ob.id != null ? 'hover:bg-gray-50 text-gray-600' : 'text-gray-400 cursor-default'}`}
                            >
                              <MapPin className={`w-3 h-3 shrink-0 mt-0.5 ${isAtiva ? 'text-amber-500' : 'text-gray-400'}`} />
                              <span className="break-words">{ob.nome}</span>
                              {isAtiva && <span className="ml-auto text-[10px] text-amber-500 shrink-0">✓ ativo</span>}
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : <div />}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Dialog de detalhe da OC */}
      {selectedOcId !== null && companyId && (
        <OcMiniDialog
          companyId={companyId}
          ordemId={selectedOcId}
          onClose={() => setSelectedOcId(null)}
        />
      )}

      {/* Dialog de edição de UMA linha */}
      <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) fecharEdicao(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-indigo-600" /> Editar lançamento
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ajuste a descrição, classificação, datas e valor deste título.
            </DialogDescription>
          </DialogHeader>
          {ef && editRow && (
            <div className="space-y-4">
              {(() => {
                const p = parseLanc(editRow);
                if (!p.docNumero) return null;
                const link = linkDeOrigem(editRow);
                return (
                  <div className="flex items-center gap-2 rounded-lg bg-indigo-50/70 border border-indigo-100 px-3 py-2">
                    <span className="text-[11px] text-gray-500">Documento de origem:</span>
                    {link ? (
                      <button
                        type="button"
                        onClick={() => setLocation(link)}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-0.5 text-xs font-semibold tabular-nums"
                        title={`Abrir ${p.docNumero}`}
                      >
                        {p.docNumero}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-semibold tabular-nums">{p.docNumero}</span>
                    )}
                  </div>
                );
              })()}
              {rowLocked(editRow) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Lançamento já {editRow.status === "recebido" ? "recebido" : "pago"} — só é possível corrigir <b>categoria</b> e <b>centro de custo</b>. Para alterar valor/datas, estorne antes.</span>
                </div>
              )}
              {/* Identificação */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Descrição</Label>
                  <Input
                    value={ef.descricao}
                    onChange={(e) => setEf({ ...ef, descricao: e.target.value })}
                    disabled={rowLocked(editRow)}
                    placeholder="Ex.: Aluguel Escritório Central"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Fornecedor / Pagador</Label>
                  <Input
                    value={ef.fornecedorNome}
                    onChange={(e) => setEf({ ...ef, fornecedorNome: e.target.value })}
                    disabled={rowLocked(editRow)}
                    placeholder="Nome do fornecedor ou pagador"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Classificação — full width p/ não cortar nomes longos */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Classificação</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Categoria</Label>
                  <Select value={ef.contaSel} onValueChange={(v) => setEf({ ...ef, contaSel: v })}>
                    <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="Selecione a categoria…" /></SelectTrigger>
                    <SelectContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)]">
                      <SelectItem value={CLEAR}>Sem categoria</SelectItem>
                      {catOpcoesDialog.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)} className="whitespace-normal leading-snug">{c.id === -1 ? `${c.nome} (atual)` : c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Centro de Custo</Label>
                  <Select value={ef.centroSel} onValueChange={(v) => setEf({ ...ef, centroSel: v })}>
                    <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="Selecione o centro de custo…" /></SelectTrigger>
                    <SelectContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)]">
                      <SelectItem value={CLEAR}>Sem centro de custo</SelectItem>
                      {centroOpcoesDialog.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)} className="whitespace-normal leading-snug">{o.id === -1 ? `${o.nome} (atual)` : o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Datas e valor */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">Competência</Label>
                    <Input
                      type="date"
                      value={ef.dataCompetencia}
                      onChange={(e) => setEf({ ...ef, dataCompetencia: e.target.value })}
                      disabled={rowLocked(editRow)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">Vencimento</Label>
                    <Input
                      type="date"
                      value={ef.dataVencimento}
                      onChange={(e) => setEf({ ...ef, dataVencimento: e.target.value })}
                      disabled={rowLocked(editRow)}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Valor (R$)</Label>
                  <MoneyInput
                    value={ef.valor}
                    onChange={(v) => setEf({ ...ef, valor: v })}
                    className="h-10"
                  />
                  {rowLocked(editRow) && <p className="text-[11px] text-gray-400">Valor bloqueado (lançamento {editRow.status}).</p>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={fecharEdicao} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
