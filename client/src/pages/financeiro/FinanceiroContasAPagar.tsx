import { useState, useMemo, useEffect, Fragment } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle, AlertTriangle, Search, Calendar, ShoppingCart, FileText,
  ChevronLeft, ChevronRight, CreditCard, Banknote, Clock, Hash, Tag,
  Users, Truck, Briefcase, Scale, Package, Receipt, Wallet,
  Download, Copy, TrendingDown, TrendingUp, Zap, Activity, X
} from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// Rev. 1619 — dd/MM/aaaa (regra de ouro do projeto)
function fmtDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const s = String(dateStr).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join("/");
  return s;
}

const ORIGEM_LABELS: Record<string, string> = {
  compras: "Compras",
  folha: "Folha CLT",
  pj: "Contrato PJ",
  terceiros: "Terceiros",
  frota: "Frota",
  beneficios: "Benefícios",
  tributario: "Tributário",
  juridico: "Jurídico",
  almoxarifado: "Almoxarifado",
  manual: "Manual",
};

const ORIGEM_ICONS: Record<string, any> = {
  compras: ShoppingCart,
  folha: Users,
  pj: Briefcase,
  terceiros: Users,
  frota: Truck,
  beneficios: Receipt,
  tributario: Scale,
  juridico: Scale,
  almoxarifado: Package,
  manual: Wallet,
};

const ORIGEM_COLORS: Record<string, string> = {
  compras: "bg-blue-50 text-blue-700 border-blue-200",
  folha: "bg-purple-50 text-purple-700 border-purple-200",
  pj: "bg-indigo-50 text-indigo-700 border-indigo-200",
  terceiros: "bg-cyan-50 text-cyan-700 border-cyan-200",
  frota: "bg-amber-50 text-amber-700 border-amber-200",
  beneficios: "bg-pink-50 text-pink-700 border-pink-200",
  tributario: "bg-red-50 text-red-700 border-red-200",
  juridico: "bg-rose-50 text-rose-700 border-rose-200",
  almoxarifado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual: "bg-gray-50 text-gray-700 border-gray-200",
};

// Rev. 1619 — Extrai nº OC/OS/MED/Folha de origem ou descrição
function extractOcNumero(c: any): string {
  const candidates = [c.origemDescricao, c.descricao, c.contaNome].filter(Boolean) as string[];
  for (const txt of candidates) {
    // OC-2026-0078, OS-123, MED-2026-012, NF 1234, SC-2026-0001
    const m = txt.match(/\b(OC|OS|MED|SC|NF|PO|RC|RPS)[\s-]*\d{2,4}[\s/-]*\d+\b/i);
    if (m) return m[0].toUpperCase().replace(/\s+/g, "-").replace(/\/+/g, "-");
  }
  // Fallbacks por origem + id
  if (c.origemModulo === "folha" && c.origemId) {
    const ref = c.dataVencimento ? c.dataVencimento.slice(0, 7).split("-").reverse().join("/") : "";
    return `FOLHA${ref ? "-" + ref : ""}`;
  }
  if (c.origemModulo === "pj" && c.origemId) return `PJ-${c.origemId}`;
  if (c.origemModulo === "frota" && c.origemId) return `FROTA-${c.origemId}`;
  if (c.origemModulo === "terceiros" && c.origemId) return `MED-${c.origemId}`;
  if (c.origemModulo === "tributario") return `TRIB${c.origemId ? "-" + c.origemId : ""}`;
  if (c.origemModulo === "beneficios" && c.origemId) return `BEN-${c.origemId}`;
  if (c.origemModulo === "almoxarifado" && c.origemId) return `ALM-${c.origemId}`;
  if (c.origemId) return `#${c.origemId}`;
  return "—";
}

// Rev. 1619 — Descrição com fallback inteligente
function describeEntry(c: any): string {
  const desc = (c.descricao ?? "").trim();
  if (desc && desc !== "—") return desc;
  const orig = (c.origemDescricao ?? "").trim();
  if (orig) return orig;
  if (c.contaNome && c.obraNome) return `${c.contaNome} — ${c.obraNome}`;
  if (c.contaNome) return c.contaNome;
  if (c.obraNome) return c.obraNome;
  if (c.origemModulo) return `Lançamento ${ORIGEM_LABELS[c.origemModulo] ?? c.origemModulo}`;
  return "—";
}

// Rev. 1619 — Categoria (plano de contas) + fallback por origem
function categoriaFor(c: any): string {
  if (c.contaNome && String(c.contaNome).trim()) return c.contaNome;
  return ORIGEM_LABELS[c.origemModulo] ?? "Sem categoria";
}

// Rev. 1619 — Agrupamento por horizonte de vencimento (gestão de caixa Bragg/Brealey)
function bucketKey(c: any, hojeStr: string): { key: string; order: number; label: string } {
  if (c.status === "pago") return { key: "pago", order: 9, label: "Pagos no mês" };
  if (!c.dataVencimento) return { key: "sem_data", order: 8, label: "Sem data definida" };
  const venc = c.dataVencimento.slice(0, 10);
  if (venc < hojeStr) return { key: "vencidas", order: 0, label: "Vencidas" };
  if (venc === hojeStr) return { key: "hoje", order: 1, label: "Vence hoje" };
  // Esta semana = próximos 7 dias incluindo hoje
  const hoje = new Date(hojeStr + "T00:00:00");
  const v = new Date(venc + "T00:00:00");
  const diff = Math.round((v.getTime() - hoje.getTime()) / 86400000);
  if (diff <= 7) return { key: "semana", order: 2, label: "Esta semana (7 dias)" };
  if (diff <= 15) return { key: "quinzena", order: 3, label: "Próximos 15 dias" };
  if (diff <= 30) return { key: "mes", order: 4, label: "Próximos 30 dias" };
  return { key: "depois", order: 5, label: "Após 30 dias" };
}

function getMesFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return d.getMonth() + 1;
}

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

export default function FinanceiroContasAPagar() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pendentes");
  const [showPay, setShowPay] = useState<any | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hoje.toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  // Rev. 1620 — seleção em lote (Onda 2)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [bulkDataPagamento, setBulkDataPagamento] = useState(hoje.toISOString().split("T")[0]);
  const [bulkFormaPagamento, setBulkFormaPagamento] = useState("pix");

  const { data: allContas, isLoading, refetch } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  const payMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Pagamento registrado!" }); setShowPay(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 1620 — limpar seleção ao mudar mês/ano para evitar pagar item de outro escopo
  useEffect(() => { setSelectedIds(new Set()); }, [mesSel, ano]);

  const bulkPayMut = (trpc as any).financial.bulkUpdateStatus.useMutation({
    onSuccess: (r: any) => {
      toast({ title: `${r.updated} título(s) marcados como pagos!` });
      setShowBulkPay(false);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const mesesStatus: Record<number, MesStatus> = useMemo(() => {
    const map: Record<number, MesStatus> = {};
    for (let m = 1; m <= 12; m++) map[m] = "sem_dados";
    if (!allContas) return map;
    for (const c of allContas) {
      const m = getMesFromDate(c.dataVencimento);
      if (!m) continue;
      const cur = map[m];
      const isPago = c.status === "pago";
      if (cur === "sem_dados") {
        map[m] = isPago ? "consolidado" : "lancamento";
      } else if (cur === "consolidado" && !isPago) {
        map[m] = "lancamento";
      }
    }
    return map;
  }, [allContas]);

  const mesData = useMemo(() => {
    if (!allContas) return [];
    return allContas.filter((c: any) => getMesFromDate(c.dataVencimento) === mesSel);
  }, [allContas, mesSel]);

  const hojeStr = hoje.toISOString().split("T")[0];

  const filtered = useMemo(() => {
    let list = mesData;
    if (statusFilter === "pendentes") list = list.filter((c: any) => c.status !== "pago");
    if (statusFilter === "pagos") list = list.filter((c: any) => c.status === "pago");
    if (origemFilter !== "all") list = list.filter((c: any) => c.origemModulo === origemFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        (c.descricao ?? "").toLowerCase().includes(q) ||
        (c.contaNome ?? "").toLowerCase().includes(q) ||
        (c.obraNome ?? "").toLowerCase().includes(q) ||
        (c.origemDescricao ?? "").toLowerCase().includes(q) ||
        extractOcNumero(c).toLowerCase().includes(q)
      );
    }
    // Ordena por: bucket (vencidas primeiro) → data → valor desc
    return list.slice().sort((a: any, b: any) => {
      const ba = bucketKey(a, hojeStr).order;
      const bb = bucketKey(b, hojeStr).order;
      if (ba !== bb) return ba - bb;
      const da = (a.dataVencimento || "9999-12-31").slice(0, 10);
      const db = (b.dataVencimento || "9999-12-31").slice(0, 10);
      if (da !== db) return da.localeCompare(db);
      return Number(b.valorPrevisto ?? 0) - Number(a.valorPrevisto ?? 0);
    });
  }, [mesData, statusFilter, origemFilter, search, hojeStr]);

  // Rev. 1619 — agrupamento por horizonte de vencimento (cabeçalhos sticky)
  const grupos = useMemo(() => {
    const map = new Map<string, { label: string; order: number; items: any[]; total: number }>();
    for (const c of filtered) {
      const b = bucketKey(c, hojeStr);
      if (!map.has(b.key)) map.set(b.key, { label: b.label, order: b.order, items: [], total: 0 });
      const g = map.get(b.key)!;
      g.items.push(c);
      g.total += Number(c.valorPrevisto ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [filtered, hojeStr]);

  const pendentes = mesData.filter((c: any) => c.status !== "pago");
  const pagos = mesData.filter((c: any) => c.status === "pago");
  const vencidos = pendentes.filter((c: any) => c.dataVencimento && c.dataVencimento < hojeStr);

  const totalMes = mesData.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalPago = pagos.reduce((s: number, c: any) => s + Number(c.valorRealizado ?? c.valorPrevisto ?? 0), 0);
  const totalPendente = pendentes.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalVencido = vencidos.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);

  const origensDisponiveis = useMemo(() => {
    if (!mesData.length) return [];
    const s = new Set(mesData.map((c: any) => c.origemModulo).filter(Boolean));
    return Array.from(s) as string[];
  }, [mesData]);

  // ─────────────────────────────────────────────────────────────────
  // Rev. 1620 — Onda 2/3: anti-duplicidade, aging, projeção, KPIs Hackett
  // ─────────────────────────────────────────────────────────────────

  // Anti-duplicidade: chaves repetidas no ano (descricao+valor+vencimento)
  const duplicateKeys = useMemo(() => {
    if (!allContas) return new Set<string>();
    const cnt = new Map<string, number>();
    for (const c of allContas as any[]) {
      const key = `${(c.descricao ?? c.origemDescricao ?? c.contaNome ?? "").toLowerCase().trim()}|${Number(c.valorPrevisto ?? 0).toFixed(2)}|${(c.dataVencimento ?? "").slice(0, 10)}`;
      if (!key.startsWith("|")) cnt.set(key, (cnt.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(cnt.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [allContas]);

  const dupKeyOf = (c: any) =>
    `${(c.descricao ?? c.origemDescricao ?? c.contaNome ?? "").toLowerCase().trim()}|${Number(c.valorPrevisto ?? 0).toFixed(2)}|${(c.dataVencimento ?? "").slice(0, 10)}`;

  // Aging Hackett (apenas pendentes vencidos): 1-15, 16-30, 31-60, 61-90, >90
  const agingBuckets = useMemo(() => {
    const buckets = [
      { label: "1-15 dias", min: 1, max: 15, total: 0, count: 0, color: "amber" },
      { label: "16-30 dias", min: 16, max: 30, total: 0, count: 0, color: "orange" },
      { label: "31-60 dias", min: 31, max: 60, total: 0, count: 0, color: "red" },
      { label: "61-90 dias", min: 61, max: 90, total: 0, count: 0, color: "rose" },
      { label: "+90 dias", min: 91, max: 99999, total: 0, count: 0, color: "purple" },
    ];
    for (const c of vencidos) {
      const dias = Number(c.diasAtraso ?? 0);
      const b = buckets.find(x => dias >= x.min && dias <= x.max);
      if (b) { b.total += Number(c.valorPrevisto ?? 0); b.count += 1; }
    }
    return buckets;
  }, [vencidos]);

  // Projeção de caixa (Brealey/Myers — short-term cash forecast)
  const cashProjection = useMemo(() => {
    const horizons = [7, 15, 30, 60, 90];
    const result: { dias: number; total: number; count: number }[] = [];
    if (!allContas) return horizons.map(d => ({ dias: d, total: 0, count: 0 }));
    const today = new Date(hojeStr);
    for (const dias of horizons) {
      const limite = new Date(today);
      limite.setDate(limite.getDate() + dias);
      const limiteStr = limite.toISOString().slice(0, 10);
      const items = (allContas as any[]).filter(c =>
        c.status !== "pago" && c.dataVencimento &&
        c.dataVencimento.slice(0, 10) >= hojeStr &&
        c.dataVencimento.slice(0, 10) <= limiteStr
      );
      result.push({
        dias,
        total: items.reduce((s, c) => s + Number(c.valorPrevisto ?? 0), 0),
        count: items.length,
      });
    }
    return result;
  }, [allContas, hojeStr]);

  // KPIs Hackett: DPO (Days Payable Outstanding), % on-time, % eletrônico
  const kpisHackett = useMemo(() => {
    if (!allContas || allContas.length === 0) return { dpo: 0, onTime: 0, eletronico: 0, totalPagos: 0 };
    const pgs = (allContas as any[]).filter(c => c.status === "pago" && c.dataPagamento && c.dataVencimento);
    if (pgs.length === 0) return { dpo: 0, onTime: 0, eletronico: 0, totalPagos: 0 };
    // DPO simplificado: média de dias entre competência e pagamento
    let somaDias = 0;
    let onTimeCount = 0;
    let eletronicoCount = 0;
    for (const c of pgs) {
      const comp = new Date((c.dataCompetencia ?? c.dataVencimento).slice(0, 10) + "T00:00:00");
      const pag = new Date(c.dataPagamento.slice(0, 10) + "T00:00:00");
      const venc = new Date(c.dataVencimento.slice(0, 10) + "T00:00:00");
      somaDias += Math.max(0, Math.round((pag.getTime() - comp.getTime()) / 86400000));
      if (pag.getTime() <= venc.getTime()) onTimeCount += 1;
      const f = (c.formaPagamento ?? "").toLowerCase();
      if (f === "pix" || f === "ted" || f === "debito_automatico") eletronicoCount += 1;
    }
    return {
      dpo: Math.round(somaDias / pgs.length),
      onTime: Math.round((onTimeCount / pgs.length) * 100),
      eletronico: Math.round((eletronicoCount / pgs.length) * 100),
      totalPagos: pgs.length,
    };
  }, [allContas]);

  // Seleção em lote
  const selectableIds = useMemo(
    () => filtered.filter((c: any) => c.status !== "pago").map((c: any) => c.id as number),
    [filtered]
  );
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableIds.forEach(id => next.delete(id));
      else selectableIds.forEach(id => next.add(id));
      return next;
    });
  };
  const selectedTotal = useMemo(() => {
    if (!allContas || selectedIds.size === 0) return 0;
    return (allContas as any[])
      .filter(c => selectedIds.has(c.id))
      .reduce((s, c) => s + Number(c.valorPrevisto ?? 0), 0);
  }, [allContas, selectedIds]);

  // Exportar CSV (Excel-friendly, BOM + ; separador padrão BR)
  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ["Vencimento", "Nº OC/OS", "Descrição", "Categoria", "Origem", "Obra", "Valor Previsto", "Valor Pago", "Status", "Data Pagamento", "Forma Pagamento"];
    const rows = filtered.map((c: any) => [
      fmtDateBR(c.dataVencimento),
      extractOcNumero(c),
      (describeEntry(c) ?? "").replace(/[\r\n;]/g, " "),
      (categoriaFor(c) ?? "").replace(/[\r\n;]/g, " "),
      ORIGEM_LABELS[c.origemModulo] ?? c.origemModulo ?? "",
      (c.obraNome ?? "").replace(/[\r\n;]/g, " "),
      Number(c.valorPrevisto ?? 0).toFixed(2).replace(".", ","),
      c.valorRealizado ? Number(c.valorRealizado).toFixed(2).replace(".", ",") : "",
      c.status === "pago" ? "Pago" : (c.dataVencimento && c.dataVencimento.slice(0, 10) < hojeStr ? "Vencido" : "A Pagar"),
      fmtDateBR(c.dataPagamento),
      c.formaPagamento ?? "",
    ]);
    const csv = "\uFEFF" + [header, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-a-pagar_${MESES[mesSel - 1]}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `CSV exportado: ${rows.length} linhas` });
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Pagar</h1>
          <p className="text-sm text-gray-500 mt-1">Despesas e obrigações financeiras por mês</p>
        </div>

        {/* Navegação Ano + Meses */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES.map((m, i) => {
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = mesSel === num;
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(num)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-gray-400">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Banknote className="w-3 h-3" />Total {MESES[mesSel-1]}</p>
              <p className="text-lg font-bold text-gray-800">{formatBRL(totalMes)}</p>
              <p className="text-xs text-gray-400">{mesData.length} conta(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />A Pagar</p>
              <p className="text-lg font-bold text-orange-600">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-gray-400">{pendentes.length} pendente(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(totalVencido)}</p>
              <p className="text-xs text-gray-400">{vencidos.length} em atraso</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Pago</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(totalPago)}</p>
              <p className="text-xs text-gray-400">{pagos.length} quitado(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Rev. 1620 — Onda 3: Projeção de Caixa (Brealey short-term forecast) */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-500" />
              Projeção de Saídas — próximos dias
              <span className="text-xs font-normal text-gray-400 ml-1">(a partir de hoje, {fmtDateBR(hojeStr)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {cashProjection.map(p => (
                <div key={p.dias} className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3">
                  <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" />Próx. {p.dias}d
                  </div>
                  <div className="text-base font-bold text-slate-800 tabular-nums mt-1">{formatBRL(p.total)}</div>
                  <div className="text-[10px] text-slate-400">{p.count} título(s)</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rev. 1620 — Onda 3: Aging Hackett + KPIs */}
        {(vencidos.length > 0 || kpisHackett.totalPagos > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {vencidos.length > 0 && (
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2 px-5 pt-4">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-500" />
                    Aging — Idade dos Vencidos
                    <span className="text-xs font-normal text-gray-400 ml-1">(padrão Hackett)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <div className="grid grid-cols-5 gap-2">
                    {agingBuckets.map(b => {
                      const colorMap: Record<string, string> = {
                        amber: "border-amber-200 bg-amber-50 text-amber-700",
                        orange: "border-orange-200 bg-orange-50 text-orange-700",
                        red: "border-red-200 bg-red-50 text-red-700",
                        rose: "border-rose-300 bg-rose-50 text-rose-700",
                        purple: "border-purple-300 bg-purple-50 text-purple-700",
                      };
                      return (
                        <div key={b.label} className={`rounded-lg border p-2.5 ${colorMap[b.color]}`}>
                          <div className="text-[10px] font-semibold uppercase tracking-wide">{b.label}</div>
                          <div className="text-sm font-bold tabular-nums mt-0.5">{formatBRL(b.total)}</div>
                          <div className="text-[10px] opacity-70">{b.count} título(s)</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            {kpisHackett.totalPagos > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 px-5 pt-4">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-500" />
                    Performance AP
                    <span className="text-xs font-normal text-gray-400 ml-1">(base: {kpisHackett.totalPagos} pagos)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">DPO</div>
                    <div className="text-base font-bold text-indigo-900 tabular-nums mt-0.5">{kpisHackett.dpo}d</div>
                    <div className="text-[10px] text-indigo-500">prazo médio</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">No prazo</div>
                    <div className="text-base font-bold text-emerald-900 tabular-nums mt-0.5">{kpisHackett.onTime}%</div>
                    <div className="text-[10px] text-emerald-500">on-time pay</div>
                  </div>
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700">Eletrônico</div>
                    <div className="text-base font-bold text-cyan-900 tabular-nums mt-0.5">{kpisHackett.eletronico}%</div>
                    <div className="text-[10px] text-cyan-500">PIX/TED/DA</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[["pendentes","A Pagar"],["pagos","Pagos"],["all","Todos"]].map(([v,l]) => (
                <button key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {l}
                </button>
              ))}
            </div>
            {origensDisponiveis.length > 0 && (
              <Select value={origemFilter} onValueChange={setOrigemFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {origensDisponiveis.map((o: string) => (
                    <SelectItem key={o} value={o}>{ORIGEM_LABELS[o] ?? o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9 h-8 text-sm" placeholder="Buscar conta, OC/OS, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 text-xs gap-1" disabled={!filtered.length}>
              <Download className="w-3.5 h-3.5" />Exportar CSV
            </Button>
          </CardContent>
        </Card>

        {/* Rev. 1620 — Barra de ações em lote */}
        {selectedIds.size > 0 && (
          <div className="sticky top-2 z-20 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span className="font-semibold">{selectedIds.size} título(s) selecionado(s)</span>
              <span className="text-blue-100">· Total {formatBRL(selectedTotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-white text-blue-700 hover:bg-blue-50 h-8 text-xs gap-1"
                onClick={() => setShowBulkPay(true)}>
                <Zap className="w-3.5 h-3.5" />Pagar selecionados
              </Button>
              <button onClick={() => setSelectedIds(new Set())}
                className="p-1.5 rounded hover:bg-blue-700 text-white" title="Limpar seleção">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-500" />
              {MESES[mesSel-1]} {ano} — {filtered.length} conta(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma conta em {MESES[mesSel-1]} {ano}</p>
                {(search || origemFilter !== "all" || statusFilter !== "all") && (
                  <button onClick={() => { setSearch(""); setOrigemFilter("all"); setStatusFilter("all"); }}
                    className="mt-2 text-xs text-blue-600 hover:underline">Limpar filtros</button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2.5 text-center w-8">
                        <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAllVisible} aria-label="Selecionar todos" />
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Data</span></th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />Nº OC/OS</span></th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Descrição</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />Categoria</span></th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Valor</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <Fragment key={g.label}>
                        {/* Cabeçalho de grupo */}
                        <tr className="bg-gradient-to-r from-slate-100 to-transparent border-y border-slate-200">
                          <td colSpan={8} className="px-3 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${
                                g.order === 0 ? "text-red-700" :
                                g.order === 1 ? "text-orange-700" :
                                g.order === 2 ? "text-amber-700" :
                                g.order === 9 ? "text-green-700" :
                                "text-slate-700"
                              }`}>
                                {g.order === 0 && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                {g.order === 1 && <Clock className="w-3 h-3 inline mr-1" />}
                                {g.order === 9 && <CheckCircle className="w-3 h-3 inline mr-1" />}
                                {g.label} <span className="text-slate-400 font-normal ml-1">· {g.items.length} {g.items.length === 1 ? "conta" : "contas"}</span>
                              </span>
                              <span className="text-xs font-bold text-slate-700">{formatBRL(g.total)}</span>
                            </div>
                          </td>
                        </tr>
                        {g.items.map((c: any) => {
                          const vencida = c.dataVencimento && c.dataVencimento.slice(0,10) < hojeStr && c.status !== "pago";
                          const Icon = ORIGEM_ICONS[c.origemModulo] ?? FileText;
                          const colorCls = ORIGEM_COLORS[c.origemModulo] ?? "bg-gray-50 text-gray-700 border-gray-200";
                          const oc = extractOcNumero(c);
                          const desc = describeEntry(c);
                          const cat = categoriaFor(c);
                          const isDup = duplicateKeys.has(dupKeyOf(c));
                          const isSelected = selectedIds.has(c.id);
                          return (
                            <tr key={c.id} className={`hover:bg-slate-50 border-b border-slate-100 ${isSelected ? "bg-blue-50/40" : vencida ? "bg-red-50/30" : ""}`}>
                              {/* Checkbox */}
                              <td className="px-2 py-2.5 text-center">
                                {c.status !== "pago" && (
                                  <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} aria-label={`Selecionar ${oc}`} />
                                )}
                              </td>
                              {/* Data */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {c.dataVencimento ? (
                                  <div className="flex flex-col leading-tight">
                                    <span className={`text-sm font-semibold tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-800"}`}>
                                      {fmtDateBR(c.dataVencimento)}
                                    </span>
                                    {vencida && <span className="text-[10px] text-red-500 font-medium">{c.diasAtraso}d atraso</span>}
                                    {!vencida && c.status === "pago" && c.dataPagamento && (
                                      <span className="text-[10px] text-green-600">pago {fmtDateBR(c.dataPagamento)}</span>
                                    )}
                                    {!vencida && c.status !== "pago" && c.dataVencimento.slice(0,10) === hojeStr && (
                                      <span className="text-[10px] text-orange-600 font-medium">vence hoje</span>
                                    )}
                                  </div>
                                ) : <span className="text-xs text-gray-400">Sem data</span>}
                              </td>
                              {/* Nº OC/OS */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                  {oc}
                                </span>
                              </td>
                              {/* Descrição */}
                              <td className="px-3 py-2.5 max-w-md">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-slate-800 truncate" title={desc}>{desc}</p>
                                  {isDup && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 whitespace-nowrap"
                                      title="Possível duplicidade: mesmo descrição, valor e vencimento já consta no ano">
                                      <Copy className="w-2.5 h-2.5" />DUP
                                    </span>
                                  )}
                                </div>
                                {c.obraNome && (
                                  <p className="text-[11px] text-slate-400 truncate" title={c.obraNome}>📍 {c.obraNome}</p>
                                )}
                              </td>
                              {/* Categoria */}
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-medium text-slate-700 truncate max-w-[180px]" title={cat}>{cat}</span>
                                  {c.origemModulo && (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border self-start ${colorCls}`}>
                                      <Icon className="w-2.5 h-2.5" />
                                      {ORIGEM_LABELS[c.origemModulo] ?? c.origemModulo}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Valor */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <span className={`text-sm font-bold tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-800"}`}>
                                  {formatBRL(Number(c.valorPrevisto ?? 0))}
                                </span>
                                {c.status === "pago" && c.valorRealizado && Number(c.valorRealizado) !== Number(c.valorPrevisto) && (
                                  <div className="text-[10px] text-green-600">pago: {formatBRL(Number(c.valorRealizado))}</div>
                                )}
                              </td>
                              {/* Status */}
                              <td className="px-3 py-2.5 text-center">
                                {c.status === "pago" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                    <CheckCircle className="w-3 h-3" />Pago
                                  </span>
                                ) : vencida ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                    <AlertTriangle className="w-3 h-3" />Vencido
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                    <Clock className="w-3 h-3" />A Pagar
                                  </span>
                                )}
                              </td>
                              {/* Ações */}
                              <td className="px-3 py-2.5 text-right">
                                {c.status !== "pago" && (
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 text-xs"
                                    onClick={() => setShowPay(c)}>
                                    <CheckCircle className="w-3 h-3 mr-1" />Pagar
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo anual */}
        {allContas && allContas.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Resumo Anual {ano}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Mês</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Pago</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">A Pagar</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Vencido</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {MESES.map((m, i) => {
                      const num = i + 1;
                      const entries = allContas.filter((c: any) => getMesFromDate(c.dataVencimento) === num);
                      if (entries.length === 0) return null;
                      const totM = entries.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const pgM = entries.filter((c: any) => c.status === "pago").reduce((s: number, c: any) => s + Number(c.valorRealizado ?? c.valorPrevisto ?? 0), 0);
                      const pdM = entries.filter((c: any) => c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const vcM = entries.filter((c: any) => c.dataVencimento && c.dataVencimento < hojeStr && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const st = mesesStatus[num];
                      return (
                        <tr key={m}
                          className={`hover:bg-gray-50 cursor-pointer ${mesSel === num ? "bg-blue-50/40" : ""}`}
                          onClick={() => setMesSel(num)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{m}/{ano}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatBRL(totM)}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{formatBRL(pgM)}</td>
                          <td className="px-4 py-2.5 text-right text-orange-600">{formatBRL(pdM)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{vcM > 0 ? formatBRL(vcM) : "—"}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              st === "consolidado" ? "bg-green-100 text-green-700" :
                              st === "lancamento" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                st === "consolidado" ? "bg-green-500" :
                                st === "lancamento" ? "bg-blue-500" : "bg-gray-400"
                              }`} />
                              {st === "consolidado" ? "Consolidado" : st === "lancamento" ? "Lançamento" : "Sem dados"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rev. 1620 — Modal pagamento em lote (Onda 2) */}
        <Dialog open={showBulkPay} onOpenChange={setShowBulkPay}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" />Pagamento em Lote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs text-blue-700 font-medium">Você está prestes a marcar como pagos:</p>
                <p className="text-2xl font-bold text-blue-900 tabular-nums mt-1">{selectedIds.size} <span className="text-sm font-normal">títulos</span></p>
                <p className="text-base font-semibold text-blue-800 tabular-nums">{formatBRL(selectedTotal)}</p>
              </div>
              <div>
                <Label>Data do Pagamento</Label>
                <Input type="date" value={bulkDataPagamento} onChange={e => setBulkDataPagamento(e.target.value)} />
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={bulkFormaPagamento} onValueChange={setBulkFormaPagamento}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pix","ted","boleto","cheque","dinheiro","cartao_credito","debito_automatico"].map(v => (
                      <SelectItem key={v} value={v}>{v.replace(/_/g," ").toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Atenção:</strong> A operação aplicará a mesma data e forma de pagamento a todos os títulos. Será registrado no log de auditoria.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkPay(false)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={bulkPayMut.isPending || selectedIds.size === 0}
                onClick={() => {
                  // Garantir que só enviamos IDs ainda visíveis/válidos no mês corrente
                  const validIds = Array.from(selectedIds).filter(id =>
                    (mesData as any[]).some((c: any) => c.id === id && c.status !== "pago")
                  );
                  if (validIds.length === 0) {
                    toast({ title: "Nenhum título válido na seleção", variant: "destructive" });
                    return;
                  }
                  bulkPayMut.mutate({
                    ids: validIds,
                    companyId,
                    status: "pago",
                    dataPagamento: bulkDataPagamento,
                    formaPagamento: bulkFormaPagamento,
                  });
                }}>
                {bulkPayMut.isPending ? "Processando..." : `Confirmar ${selectedIds.size} pagamento(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal pagar */}
        <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
            {showPay && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800">{showPay.descricao ?? showPay.contaNome ?? "—"}</p>
                  {showPay.obraNome && <p className="text-xs text-gray-500">{showPay.obraNome}</p>}
                  <p className="text-lg font-bold text-orange-700 mt-1">{formatBRL(Number(showPay.valorPrevisto))}</p>
                </div>
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pix","ted","boleto","cheque","dinheiro","cartao_credito","debito_automatico"].map(v => (
                        <SelectItem key={v} value={v}>{v.replace(/_/g," ").toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPay(null)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={payMut.isPending}
                onClick={() => payMut.mutate({ id: showPay.id, companyId, status: "pago", dataPagamento, formaPagamento })}>
                {payMut.isPending ? "Registrando..." : "Confirmar Pagamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
