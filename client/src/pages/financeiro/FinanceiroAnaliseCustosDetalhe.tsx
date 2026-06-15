// Rev. 3017 — Análise de Custos · DETALHE (drill-down)
// Tela aberta ao clicar em QUALQUER KPI / barra / fatia / linha da
// "Análise de Custos". Lê os params da URL (ano, mes, tipo, valor),
// re-busca `financial.getContasAPagarByYear` e mostra os lançamentos
// PERTINENTES ao item clicado: KPIs do recorte, distribuição por mês,
// quebra por uma dimensão secundária e a tabela detalhada completa.
// 100% client-side (ZERO novo backend).
import { useMemo, useState } from "react";
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
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechTooltip, LabelList,
} from "recharts";
import { classificarGrupoCusto } from "@shared/custosCategorias";

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
  centro: (r) => (r.obraNome || "Sem centro de custo"),
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

  // Rev. 3134 — base CAIXA: espelha o gráfico "Custo por Mês" (pago → data de
  // pagamento; em aberto → vencimento), pra o drill-down bater com as barras.
  const { data, isLoading } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano, baseData: "caixa" },
    { enabled: !!companyId }
  );
  // Rev. 3019 — Espelha a tela-mãe: SÓ CUSTOS REAIS. Exclui a projeção do
  // cronograma (origem 'cronograma_atividade' = valor de contrato distribuído
  // mês a mês), que duplicaria as despesas reais e inflava os totais.
  const rowsAll: any[] = useMemo(
    () => (Array.isArray(data) ? data : []).filter(
      (r) => String(r?.origemModulo ?? "") !== "cronograma_atividade"
    ),
    [data]
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

  // Distribuição por mês (12 meses) do recorte.
  const porMes = useMemo(() => {
    const arr = MESES_ABREV.map((m) => ({ mes: m, value: 0 }));
    for (const r of rows) {
      const mn = mesNumDe(r);
      if (mn < 1 || mn > 12) continue;
      arr[mn - 1].value += valorEfetivo(r);
    }
    return arr;
  }, [rows]);

  // Quebra secundária pertinente: escolhe a 1ª dimensão AINDA NÃO filtrada
  // (fornecedor → centro → categoria), considerando o filtro primário e os drills.
  const breakdown = useMemo(() => {
    const usados = new Set<string>([tipo, ...extra.map((f) => f.t)]);
    const dim = ["fornecedor", "centro", "categoria"].find((d) => !usados.has(d)) || null;
    if (!dim) return { titulo: null as string | null, icon: Tag, dim: null as string | null, data: [] as { name: string; value: number }[] };
    const kf = keyOf[dim];
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = kf(r);
      map.set(k, (map.get(k) ?? 0) + valorEfetivo(r));
    }
    const data = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    const meta = DIM_META[dim];
    return { titulo: meta.titulo, icon: meta.icon, dim, data };
  }, [rows, tipo, extra]);

  // Lançamentos detalhados (ordenados por valor desc).
  const lancamentos = useMemo(() => {
    return [...rows].sort((a, b) => valorEfetivo(b) - valorEfetivo(a));
  }, [rows]);

  // ───────── Rev. 3025 — Edição inline + reclassificação em massa ─────────
  const { toast } = useToast();
  const utils = (trpc as any).useUtils();
  const KEEP = "__keep__";
  const CLEAR = "__clear__";

  // Opções dos seletores: Categoria = Plano de Contas (financial_accounts);
  // Centro de Custo = OBRA (segue o que a coluna desta tela exibe).
  const { data: accountsData } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId }
  );
  const { data: obrasData } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
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
  const obraOpcoes: { id: number; nome: string }[] = useMemo(() => {
    const list: any[] = Array.isArray(obrasData) ? obrasData : [];
    return list
      .map((o: any) => ({ id: o.id as number, nome: String(o?.nome ?? "").trim() }))
      .filter((o) => o.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [obrasData]);

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

  // Barra de ações em massa.
  const [bulkCat, setBulkCat] = useState<string>(KEEP);
  const [bulkObra, setBulkObra] = useState<string>(KEEP);

  // Dialog de edição de UMA linha.
  const [editRow, setEditRow] = useState<any | null>(null);
  const [ef, setEf] = useState<{
    descricao: string; fornecedorNome: string; contaSel: string; obraSel: string;
    dataCompetencia: string; dataVencimento: string; valor: string;
  } | null>(null);
  const rowLocked = (r: any) => r?.status === "pago" || r?.status === "recebido";
  const abrirEdicao = (r: any) => {
    const cur = String(r.contaNome ?? "").trim();
    const catMatch = categoriaOpcoes.find((c) => c.nome.toLowerCase() === cur.toLowerCase());
    const obraCur = String(r.obraNome ?? "").trim();
    const obraMatch = obraOpcoes.find((o) => o.nome.toLowerCase() === obraCur.toLowerCase());
    const p = parseLanc(r);
    setEditRow(r);
    setEf({
      descricao: p.livre || r.descricao || r.origemDescricao || "",
      fornecedorNome: r.fornecedorNome || p.fornecedorDesc || "",
      contaSel: catMatch ? String(catMatch.id) : (cur ? "-1" : CLEAR),
      obraSel: obraMatch ? String(obraMatch.id) : (obraCur ? "-1" : CLEAR),
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
  const obraOpcoesDialog = useMemo(() => {
    const cur = String(editRow?.obraNome ?? "").trim();
    const has = cur && obraOpcoes.some((o) => o.nome.toLowerCase() === cur.toLowerCase());
    return cur && !has ? [{ id: -1, nome: cur }, ...obraOpcoes] : obraOpcoes;
  }, [editRow, obraOpcoes]);

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
      setBulkCat(KEEP); setBulkObra(KEEP);
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
  const resolveObra = (sel: string, fallback?: any): { obraNome: string; obraId: number | null } => {
    if (sel === CLEAR) return { obraNome: "", obraId: null };
    if (sel === "-1") return { obraNome: fallback?.obraNome || "", obraId: fallback?.obraId ?? null };
    const o = obraOpcoes.find((x) => String(x.id) === sel);
    return { obraNome: o?.nome ?? "", obraId: o?.id ?? null };
  };

  const salvarEdicao = () => {
    if (!editRow || !ef) return;
    const cat = resolveCat(ef.contaSel, editRow);
    const obra = resolveObra(ef.obraSel, editRow);
    if (rowLocked(editRow)) {
      // Pago/recebido: só reclassifica categoria/centro (não toca valor/datas).
      bulkMut.mutate({ companyId, ids: [editRow.id], ...cat, ...obra });
    } else {
      updateEntryMut.mutate({
        id: editRow.id, companyId,
        descricao: ef.descricao,
        fornecedorNome: ef.fornecedorNome,
        ...cat, ...obra,
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
    if (bulkObra !== KEEP) { temAlgo = true; Object.assign(payload, resolveObra(bulkObra)); }
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
          {[
            { label: "Custo do recorte", value: kpis.total, icon: CircleDollarSign, color: "text-rose-600", bg: "bg-rose-50", fmt: "brl" },
            { label: "Pago", value: kpis.pago, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", fmt: "brl" },
            { label: "Em aberto", value: kpis.aberto, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50", fmt: "brl" },
            { label: "Vencido", value: kpis.vencido, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", fmt: "brl", badge: kpis.qtdVencido },
            { label: "Lançamentos", value: kpis.qtd, icon: ListChecks, color: "text-indigo-600", bg: "bg-indigo-50", fmt: "int" },
          ].map((c) => {
            const I = c.icon;
            const isInt = c.fmt === "int";
            return (
              <Card key={c.label} className="border-0 shadow-sm">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <I className={`w-4 h-4 ${c.color}`} />
                    </div>
                    {c.badge !== undefined && c.badge > 0 && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5">{c.badge}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium">{c.label}</p>
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

        {semDados ? (
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
                    <Select value={bulkObra} onValueChange={setBulkObra}>
                      <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Centro de custo…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Centro de custo — manter</SelectItem>
                        <SelectItem value={CLEAR}>Sem centro de custo</SelectItem>
                        {obraOpcoes.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="h-9" onClick={aplicarBulk} disabled={salvando || (bulkCat === KEEP && bulkObra === KEEP)}>
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
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <ListChecks className="w-4 h-4" /> Lançamentos detalhados
                  <span className="text-xs font-normal text-gray-400">({lancamentos.length})</span>
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
                                  <span className="break-words leading-snug" title={r.obraNome || ""}>{r.obraNome || "Sem centro de custo"}</span>
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
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td colSpan={4} className="py-2.5 pr-2 text-right font-semibold text-gray-600">Total do recorte</td>
                        <td className="py-2.5 px-2 text-center text-[11px] text-gray-400 font-medium whitespace-nowrap">{lancamentos.length} lanç.</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-bold text-rose-600 whitespace-nowrap">{formatBRL(kpis.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

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
                  <Label className="text-xs font-medium text-gray-600">Centro de Custo (obra)</Label>
                  <Select value={ef.obraSel} onValueChange={(v) => setEf({ ...ef, obraSel: v })}>
                    <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="Selecione o centro de custo…" /></SelectTrigger>
                    <SelectContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)]">
                      <SelectItem value={CLEAR}>Sem centro de custo</SelectItem>
                      {obraOpcoesDialog.map((o) => (
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
