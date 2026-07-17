import React, { useState, useMemo, useEffect, useRef } from "react";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Trophy, ShieldCheck, BarChart3, BarChart2, ShoppingCart, Package, Star,
  Settings, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, DollarSign, Loader2, Wrench,
  Users, HardHat, RefreshCw, Info, Calendar, Activity, FileText,
  ClipboardCheck, Heart, Shield, UserCheck, Maximize2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RcTooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const fmt  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPct = (v: number) => `${v.toFixed(1)}%`;
const fDate = (d: any): string => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  if (s.length < 10) return s;
  const [y, m, dd] = s.split("-");
  return `${dd}/${m}/${y}`;
};
const MESES_BR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ─── ScoreGauge ──────────────────────────────────────────────────────────────
function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const r = 45; const cx = 60; const cy = 60;
  const circ = 2 * Math.PI * r;
  const clr = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="12" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={clr} strokeWidth="12"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fontWeight="900" fill={clr}>{score}</text>
    </svg>
  );
}

function MiniGauge({ score }: { score: number }) {
  const clr = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${clr}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function getBonusFatorLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "100% (máximo)", color: "text-green-600" };
  if (score >= 75) return { label: "80%",            color: "text-lime-600"  };
  if (score >= 60) return { label: "50%",            color: "text-amber-600" };
  if (score >= 40) return { label: "20%",            color: "text-orange-600"};
  return              { label: "0% (sem bônus)",  color: "text-red-600"   };
}

const DIMENSAO_META = [
  { key: "seguranca",    label: "SST",          icon: <HardHat className="w-4 h-4" />,      color: "text-red-600",    bg: "bg-red-50 border-red-100" },
  { key: "planejamento", label: "Prazo",        icon: <BarChart3 className="w-4 h-4" />,    color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
  { key: "compras",      label: "Compras",      icon: <ShoppingCart className="w-4 h-4" />, color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
  { key: "almox",        label: "Almoxarifado", icon: <Package className="w-4 h-4" />,      color: "text-teal-600",   bg: "bg-teal-50 border-teal-100" },
  { key: "qualidade",    label: "Qualidade",    icon: <Star className="w-4 h-4" />,         color: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
];

const EVENTO_ICONS: Record<string, React.ReactNode> = {
  acidente:    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  advertencia: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />,
  refi:        <TrendingDown className="w-3.5 h-3.5 text-blue-500" />,
  retrabalho:  <Wrench className="w-3.5 h-3.5 text-amber-500" />,
  seguranca:   <HardHat className="w-3.5 h-3.5 text-red-500" />,
  planejamento:<BarChart3 className="w-3.5 h-3.5 text-blue-500" />,
  compras:     <ShoppingCart className="w-3.5 h-3.5 text-violet-500" />,
  almox:       <Package className="w-3.5 h-3.5 text-teal-500" />,
  qualidade:   <Star className="w-3.5 h-3.5 text-amber-500" />,
  dds:         <ShieldCheck className="w-3.5 h-3.5 text-green-500" />,
  ferramenta:  <Wrench className="w-3.5 h-3.5 text-teal-500" />,
  bonus:       <DollarSign className="w-3.5 h-3.5 text-green-500" />,
};

// ─── ConfigModal ─────────────────────────────────────────────────────────────
function ConfigModal({ open, onClose, companyId, obraId, currentConfig, onSaved }: any) {
  const existing = currentConfig;
  const [bonusTipo,     setBonusTipo]     = useState<"percentual_lucro" | "valor_fixo">(existing?.bonus_tipo ?? "percentual_lucro");
  const [bonusValor,    setBonusValor]    = useState<string>(String(existing?.bonus_valor ?? "5"));
  const [pesoSeg,       setPesoSeg]       = useState<string>(String(existing?.peso_seguranca    ?? "30"));
  const [pesoPlan,      setPesoPlan]      = useState<string>(String(existing?.peso_planejamento ?? "20"));
  const [pesoComp,      setPesoComp]      = useState<string>(String(existing?.peso_compras      ?? "20"));
  const [pesoAlmox,     setPesoAlmox]     = useState<string>(String(existing?.peso_almox        ?? "15"));
  const [pesoQual,      setPesoQual]      = useState<string>(String(existing?.peso_qualidade    ?? "15"));
  const [aliquota,      setAliquota]      = useState<string>(String(existing?.aliquota_impostos ?? "0"));
  const [pctFixos,      setPctFixos]      = useState<string>(String(existing?.pct_custos_fixos  ?? "0"));

  const saveConfig = trpc.scorecard.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const totalPeso = [pesoSeg, pesoPlan, pesoComp, pesoAlmox, pesoQual].reduce((s, v) => s + parseInt(v || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Configurar Scorecard</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Bônus do Gestor</p>
            <div className="flex gap-2 mb-2">
              {(["percentual_lucro", "valor_fixo"] as const).map(t => (
                <button key={t} onClick={() => setBonusTipo(t)}
                  className={`flex-1 py-1.5 rounded border text-xs font-medium ${bonusTipo === t ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600"}`}>
                  {t === "percentual_lucro" ? "% do Lucro Líquido" : "Valor Fixo (R$)"}
                </button>
              ))}
            </div>
            <input type="number" min="0" max={bonusTipo === "percentual_lucro" ? 100 : 9999999}
              value={bonusValor} onChange={e => setBonusValor(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder={bonusTipo === "percentual_lucro" ? "Ex: 5 (5% do LL)" : "Ex: 10000"} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Pesos das Dimensões
              <span className={`ml-2 font-mono ${totalPeso === 100 ? "text-green-600" : "text-red-500"}`}>({totalPeso}/100)</span>
            </p>
            {[
              { label: "Segurança (%)",    v: pesoSeg,  set: setPesoSeg  },
              { label: "Prazo (%)",        v: pesoPlan, set: setPesoPlan },
              { label: "Compras (%)",      v: pesoComp, set: setPesoComp },
              { label: "Almoxarifado (%)", v: pesoAlmox,set: setPesoAlmox },
              { label: "Qualidade (%)",    v: pesoQual, set: setPesoQual  },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3 mb-1.5">
                <label className="w-40 text-xs text-gray-500">{f.label}</label>
                <input type="number" min="0" max="100" value={f.v} onChange={e => f.set(e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm" />
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Deduções Financeiras</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 block mb-0.5">Alíquota Impostos (%)</label>
                <input type="number" min="0" max="30" step="0.1" value={aliquota} onChange={e => setAliquota(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 block mb-0.5">Overhead/Custos Fixos (%)</label>
                <input type="number" min="0" max="30" step="0.1" value={pctFixos} onChange={e => setPctFixos(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" disabled={totalPeso !== 100 || saveConfig.isPending}
            onClick={() => saveConfig.mutate({
              companyId, obraId,
              bonusTipo, bonusValor: parseFloat(bonusValor),
              pesoSeguranca: parseInt(pesoSeg), pesoPlanejamento: parseInt(pesoPlan),
              pesoCompras: parseInt(pesoComp), pesoAlmox: parseInt(pesoAlmox), pesoQualidade: parseInt(pesoQual),
              aliquotaImpostos: parseFloat(aliquota), pctCustosFixos: parseFloat(pctFixos),
            })}>
            {saveConfig.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NovoRetrabalhoModal ──────────────────────────────────────────────────────
function NovoRetrabalhoModal({ open, onClose, companyId, obraId, onSaved }: any) {
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const save = trpc.scorecard.retrabalhoCreate.useMutation({
    onSuccess: () => { toast.success("Retrabalho registrado!"); onSaved(); onClose(); setDescricao(""); setResponsavel(""); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Registrar Retrabalho</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">Descrição do problema *</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm resize-none"
              placeholder="Ex: Retrabalho no reboco da parede norte — argamassa mal preparada" />
          </div>
          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">Responsável</label>
            <input value={responsavel} onChange={e => setResponsavel(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="Nome do responsável (opcional)" />
          </div>
          <p className="text-[10px] text-red-500">⚠ Cada retrabalho deduz 5 pontos da dimensão Qualidade.</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={!descricao.trim() || save.isPending}
            onClick={() => save.mutate({ companyId, obraId, descricao: descricao.trim(), responsavel: responsavel.trim() || undefined })}>
            {save.isPending ? "Salvando…" : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Principal ───────────────────────────────────────────────────────────────
export default function ScorecardTab({ proj }: { proj: any }) {
  const { user } = useAuth();
  const isAdmin = ["admin", "admin_master"].includes(user?.role ?? "");
  const isAdminMaster = user?.role === "admin_master";
  const obraId   = proj?.obraId ?? null;
  const companyId = proj?.companyId ?? 0;

  const [showConfig,    setShowConfig]    = useState(false);
  const [showRetrabalho,setShowRetrabalho]= useState(false);
  const [deleteId,      setDeleteId]      = useState<number | null>(null);
  const [showMemoria,   setShowMemoria]   = useState(false);
  const [tabScore,      setTabScore]      = useState<"resultado"|"metas"|"rh"|"seguranca"|"compras"|"operacional">("resultado");
  const [abaAnalise,    setAbaAnalise]    = useState<"compras"|"ferramentas"|"locacoes">("compras");
  const [abaRH,         setAbaRH]         = useState<"folha"|"banco">("folha");
  const [expandedRH,    setExpandedRH]    = useState<Set<number>>(new Set());
  const [filtroFuncao,  setFiltroFuncao]  = useState<string>("");
  const [rhSortBy,      setRhSortBy]      = useState<"custo" | "nome">("custo");
  const [expandedBanco, setExpandedBanco] = useState<Set<number>>(new Set());
  const [rhAno,         setRhAno]         = useState(new Date().getFullYear());
  const [rhMes,         setRhMes]         = useState<string>("all");
  // Período da obra — inicializa rhAno com o ano de início da obra
  const obraIniMes = proj?.dataInicio            ? String(proj.dataInicio).slice(0, 7)            : null; // "2026-06"
  const obraFimMes = proj?.dataTerminoContratual ? String(proj.dataTerminoContratual).slice(0, 7) : null; // "2026-12"
  // Rastreia o obraId já inicializado — garante re-init ao trocar de obra
  const _rhPeriodInit = useRef<number | null>(null);
  useEffect(() => {
    if (!obraIniMes || !obraId) return;
    if (_rhPeriodInit.current === obraId) return; // mesma obra, não sobrescreve escolha manual
    const y = parseInt(obraIniMes.slice(0, 4));
    if (!isNaN(y)) {
      setRhAno(y);
      setRhMes("all");
      _rhPeriodInit.current = obraId;
    }
  }, [obraIniMes, obraId]);
  const [bhAno,         setBhAno]         = useState(new Date().getFullYear());
  const [bhMes,         setBhMes]         = useState<number | null>(null);
  const [segAno,        setSegAno]        = useState(new Date().getFullYear());
  const [segMes,        setSegMes]        = useState<number | null>(new Date().getMonth() + 1);
  const [sstExpandChart,setSstExpandChart]= useState<string | null>(null);
  const [sstOpenSections,setSstOpenSections] = useState<Set<string>>(new Set());
  const [sstPhotoLightbox,setSstPhotoLightbox] = useState<{url:string|null,nome:string,initials:string}|null>(null);

  const enabled = !!obraId;

  const score = trpc.scorecard.getScore.useQuery(
    { companyId, obraId: obraId!, orcamentoId: proj?.orcamentoId ?? undefined },
    { enabled, refetchInterval: 60_000 }
  );
  const ferramentas = trpc.scorecard.ferramentasList.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && tabScore === "operacional" }
  );
  const analise = trpc.scorecard.getAnalise.useQuery(
    { companyId, obraId: obraId! },
    { enabled: enabled && (tabScore === "compras" || tabScore === "operacional"), staleTime: 120_000 }
  );
  const segMesRef = segMes === null ? undefined : `${segAno}-${String(segMes).padStart(2, "0")}`;
  const analiseSeguranca = trpc.scorecard.getSeguranca.useQuery(
    { companyId, obraId: obraId!, mesRef: segMesRef },
    { enabled: enabled && tabScore === "seguranca", staleTime: 120_000 }
  );
  // monthStatus para o PeriodSelectorCard — bolinhas nos meses com dados SST
  const segMonthStatus = useMemo(() => {
    const hist: any[] = analiseSeguranca.data?.historico ?? [];
    const result: Record<number, "data" | "consolidated" | "none"> = {};
    // Preenche TODOS os 12 meses como "none" primeiro
    for (let m = 1; m <= 12; m++) result[m] = "none";
    hist.forEach((h) => {
      const [y, mm] = String(h.mes ?? "").split("-");
      if (parseInt(y) !== segAno) return;
      const numMes = parseInt(mm);
      const hasData = parseInt(String(h.atestados ?? 0)) > 0
        || parseInt(String(h.dds ?? 0)) > 0
        || parseInt(String(h.acidentes ?? 0)) > 0
        || parseInt(String(h.epi_entregas ?? 0)) > 0;
      if (hasData) result[numMes] = "data";
    });
    return result;
  }, [analiseSeguranca.data, segAno]);
  // "Ano todo" respeita os limites da obra para o ano selecionado
  const _anoStr = String(rhAno);
  const rhMesInicio = rhMes === "all"
    ? (obraIniMes?.startsWith(_anoStr) ? obraIniMes : `${_anoStr}-01`)
    : `${_anoStr}-${rhMes}`;
  const rhMesFim = rhMes === "all"
    ? (obraFimMes?.startsWith(_anoStr) ? obraFimMes : `${_anoStr}-12`)
    : `${_anoStr}-${rhMes}`;
  const analiseRH = trpc.scorecard.getCustosRH.useQuery(
    { companyId, obraId: obraId!, mesInicio: rhMesInicio, mesFim: rhMesFim },
    { enabled: enabled && tabScore === "rh", staleTime: 120_000 }
  );
  // Filtro de cargo para a tabela "Custo por Funcionário"
  const rhCargoOptions = useMemo(() => {
    const cargos = (analiseRH.data?.funcionarios ?? [])
      .map((f: any) => (f.cargo || f.razao_social || "Sem função").trim())
      .filter(Boolean);
    return Array.from(new Set(cargos)).sort() as string[];
  }, [analiseRH.data]);

  const rhFuncsFiltrados = useMemo(() => {
    const all: any[] = analiseRH.data?.funcionarios ?? [];
    const filtered = filtroFuncao
      ? all.filter((f: any) => (f.cargo || f.razao_social || "Sem função").trim() === filtroFuncao)
      : all;
    if (rhSortBy === "nome") {
      return [...filtered].sort((a: any, b: any) =>
        (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", { sensitivity: "base" })
      );
    }
    return filtered; // "custo" — servidor já entrega ordenado por custo desc
  }, [analiseRH.data, filtroFuncao, rhSortBy]);

  const rhResumoFiltrado = useMemo(() => {
    const base = { salarioBruto: 0, he: 0, va: 0, ferias: 0, seguroVida: 0, fgts: 0, custoTotal: 0 };
    return rhFuncsFiltrados.reduce((acc: typeof base, f: any) => ({
      salarioBruto: acc.salarioBruto + Number(f.salario_bruto_total ?? 0),
      he:           acc.he           + Number(f.he_total          ?? 0),
      va:           acc.va           + Number(f.va_total          ?? 0),
      ferias:       acc.ferias       + Number(f.ferias_total      ?? 0),
      seguroVida:   acc.seguroVida   + Number(f.seguro_vida_total ?? 0),
      fgts:         acc.fgts         + Number(f.fgts_total        ?? 0),
      custoTotal:   acc.custoTotal   + Number(f.custo_total_empresa ?? 0),
    }), base);
  }, [rhFuncsFiltrados]);

  // Agrupamento por função para visão não-admin (LGPD — sem nome/valor individual)
  const rhPorFuncao = useMemo(() => {
    const map = new Map<string, { cargo: string; qtd: number; salarioBruto: number; he: number; va: number; ferias: number; seguroVida: number; fgts: number; custoTotal: number }>();
    for (const f of rhFuncsFiltrados) {
      const cargo = (f.cargo || f.razao_social || "Sem função").trim();
      const prev = map.get(cargo) ?? { cargo, qtd: 0, salarioBruto: 0, he: 0, va: 0, ferias: 0, seguroVida: 0, fgts: 0, custoTotal: 0 };
      map.set(cargo, {
        cargo,
        qtd:          prev.qtd          + 1,
        salarioBruto: prev.salarioBruto + Number(f.salario_bruto_total  ?? 0),
        he:           prev.he           + Number(f.he_total             ?? 0),
        va:           prev.va           + Number(f.va_total             ?? 0),
        ferias:       prev.ferias       + Number(f.ferias_total         ?? 0),
        seguroVida:   prev.seguroVida   + Number(f.seguro_vida_total    ?? 0),
        fgts:         prev.fgts         + Number(f.fgts_total           ?? 0),
        custoTotal:   prev.custoTotal   + Number(f.custo_total_empresa  ?? 0),
      });
    }
    return Array.from(map.values()).sort((a, b) => b.custoTotal - a.custoTotal);
  }, [rhFuncsFiltrados]);

  // Query dedicada ao ano inteiro — usada APENAS para calcular quais meses têm dados
  // (bolinhas azuis no seletor de período). Não muda com o filtro de mês selecionado.
  const analiseRHAnoTodo = trpc.scorecard.getCustosRH.useQuery(
    { companyId, obraId: obraId!, mesInicio: `${rhAno}-01`, mesFim: `${rhAno}-12` },
    { enabled: enabled && tabScore === "rh", staleTime: 300_000 }
  );
  const analiseMetasDesvios = trpc.scorecard.getMetasDesvios.useQuery(
    { companyId, obraId: obraId!, orcamentoId: proj?.orcamentoId ?? undefined },
    { enabled: enabled && tabScore === "metas", staleTime: 120_000 }
  );
  const analiseBancoHoras = trpc.scorecard.getBancoHorasObra.useQuery(
    { companyId, obraId: obraId!, ano: bhAno, mes: bhMes },
    { enabled: enabled && tabScore === "rh" && abaRH === "banco", staleTime: 120_000 }
  );

  const utils = trpc.useUtils();
  const refetch = () => {
    utils.scorecard.getScore.invalidate();
    utils.scorecard.ferramentasList.invalidate();
    utils.scorecard.getMetasDesvios.invalidate();
    utils.scorecard.getAnalise.invalidate();
    utils.scorecard.getSeguranca.invalidate();
    utils.scorecard.getCustosRH.invalidate();
  };

  const deleteRetrabalho = trpc.scorecard.retrabalhoDelete.useMutation({
    onSuccess: () => { toast.success("Retrabalho removido."); refetch(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  if (!obraId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        <div className="text-center space-y-2">
          <Trophy className="w-10 h-10 mx-auto text-gray-300" />
          <p>Este projeto não tem uma obra vinculada.</p>
          <p className="text-xs">Vincule uma obra para ativar o Scorecard do Gestor.</p>
        </div>
      </div>
    );
  }

  if (score.isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  if (score.isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 text-center px-4">
      <AlertTriangle className="w-8 h-8 text-amber-500" />
      <p className="text-sm font-medium text-gray-700">Erro ao carregar o Scorecard</p>
      <p className="text-xs text-gray-400">{(score.error as any)?.message ?? "Erro desconhecido"}</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={refetch}><RefreshCw className="w-3.5 h-3.5 mr-1" />Tentar novamente</Button>
    </div>
  );

  const data = score.data;
  if (!data) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Sem dados disponíveis.</div>;

  const { scores, detalhes, financeiro, bonus, eventos, config } = data;
  const total      = scores.total;
  const fatorInfo  = getBonusFatorLabel(total);
  const scoreColor = total >= 80 ? "text-green-600" : total >= 60 ? "text-amber-600" : total >= 40 ? "text-orange-600" : "text-red-600";

  return (
    <div className="p-4 space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-gray-800">Scorecard do Gestor</h2>
          {proj?.responsavel && <Badge variant="outline" className="text-xs font-normal">{proj.responsavel}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={refetch}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowConfig(true)}>
              <Settings className="w-3.5 h-3.5 mr-1" />Configurar
            </Button>
          )}
        </div>
      </div>

      {/* ── Score + Bônus ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-6">
              <ScoreGauge score={total} size={120} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium mb-1">Score Total</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-4xl font-black ${scoreColor}`}>{total}</span>
                  <span className="text-sm text-gray-400">/ 100</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {total >= 90 && <Badge className="bg-green-100 text-green-700 text-[10px]">Excelente</Badge>}
                  {total >= 75 && total < 90 && <Badge className="bg-lime-100 text-lime-700 text-[10px]">Muito Bom</Badge>}
                  {total >= 60 && total < 75 && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Regular</Badge>}
                  {total >= 40 && total < 60 && <Badge className="bg-orange-100 text-orange-700 text-[10px]">Atenção</Badge>}
                  {total < 40 && <Badge className="bg-red-100 text-red-700 text-[10px]">Crítico</Badge>}
                </div>
                <div className="mt-3 space-y-0.5">
                  <p className="text-[11px] text-gray-400">Fator de bônus: <span className={`font-bold ${fatorInfo.color}`}>{fatorInfo.label}</span></p>
                  {total < 90 && <p className="text-[10px] text-gray-400">+{90 - total} pts para bônus 100%</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-green-600" />
              <p className="text-xs font-semibold text-gray-700">Bônus do Gestor</p>
              {!config && isAdmin && <button onClick={() => setShowConfig(true)} className="ml-auto text-[10px] text-blue-600 underline">Configurar</button>}
            </div>
            {!config ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Info className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Nenhuma meta configurada.</p>
                {isAdmin && <button onClick={() => setShowConfig(true)} className="text-xs text-blue-600 underline mt-1">Configurar agora</button>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">Tipo</span>
                  <span className="text-[11px] font-medium text-gray-700">{bonus.bonusTipo === "percentual_lucro" ? `${bonus.bonusValorConfig}% do LL` : "Valor fixo"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">Bônus máximo</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(bonus.bonusMaximo)}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Bônus projetado</span>
                  <span className={`text-lg font-black ${total >= 60 ? "text-green-600" : "text-red-600"}`}>{fmt(bonus.bonusProjetado)}</span>
                </div>
                {bonus.bonusMaximo > 0 && bonus.bonusProjetado < bonus.bonusMaximo && (
                  <p className="text-[10px] text-gray-400 text-right">Perda potencial: <span className="text-red-500 font-medium">{fmt(bonus.bonusMaximo - bonus.bonusProjetado)}</span></p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 5 Dimensões ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {DIMENSAO_META.map(d => {
          const s = scores[d.key as keyof typeof scores] as number;
          const peso = config ? parseInt(String((config as any)[`peso_${d.key}`] ?? "0")) : null;
          return (
            <Card key={d.key} className={`border ${d.bg} shadow-sm`}>
              <CardContent className="p-3">
                <div className={`flex items-center gap-1.5 mb-2 ${d.color}`}>
                  {d.icon}
                  <span className="text-[11px] font-semibold">{d.label}</span>
                  {peso !== null && <span className="ml-auto text-[9px] text-gray-400">{peso}%</span>}
                </div>
                <div className={`text-2xl font-black mb-1.5 ${d.color}`}>{s}<span className="text-sm font-normal text-gray-400">/100</span></div>
                <MiniGauge score={s} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── KPI Strip ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Acidentes",          value: detalhes.acidentesCount,                                        icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,    bad: detalhes.acidentesCount > 0 },
          { label: "Advertências",       value: detalhes.warningsCount,                                         icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />, bad: detalhes.warningsCount > 0 },
          { label: "OCs Emerg.",         value: `${detalhes.totalEmergenciais} (${detalhes.pctEmergencial}%)`, icon: <ShoppingCart className="w-3.5 h-3.5 text-violet-500" />,  bad: detalhes.pctEmergencial > 10 },
          { label: "DDS Realiz.",        value: detalhes.ddsCount,                                              icon: <Users className="w-3.5 h-3.5 text-blue-500" />,           bad: false },
          { label: "Retrabalhos",        value: detalhes.retrabalhos,                                           icon: <Wrench className="w-3.5 h-3.5 text-amber-500" />,         bad: detalhes.retrabalhos > 0 },
          { label: "Ferramentas Perdidas", value: detalhes.ferramentasPerdidas,                                 icon: <Package className="w-3.5 h-3.5 text-teal-500" />,        bad: detalhes.ferramentasPerdidas > 0 },
        ].map((item, i) => (
          <div key={i} className={`rounded-lg border p-2 text-center ${item.bad ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
            <div className="flex justify-center mb-1">{item.icon}</div>
            <div className={`text-base font-black ${item.bad ? "text-red-600" : "text-gray-700"}`}>{item.value}</div>
            <div className="text-[9px] text-gray-500 leading-tight">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto -mx-1 px-1">
        {([
          { key: "resultado",   label: "📊 Resultado"       },
          { key: "metas",       label: "🎯 Metas & Desvios" },
          { key: "rh",          label: "👥 RH / Folha"      },
          { key: "seguranca",   label: "🦺 SST"             },
          { key: "compras",     label: "📦 Compras"         },
          { key: "operacional", label: "🔧 Operacional"     },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTabScore(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0
              ${tabScore === t.key
                ? "border-indigo-600 text-indigo-700 bg-indigo-50/60"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════ TAB: RESULTADO ════════════ */}
      {tabScore === "resultado" && (
        <div className="space-y-4">

          {/* SPI / CPI */}
          {(detalhes.spi !== null || detalhes.cpi !== null) && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "SPI (Prazo)", val: detalhes.spi, suffix: detalhes.refisCount > 0 ? `${detalhes.refisCount} REFI(s) emitido(s)` : null },
                { label: "CPI (Custo)", val: detalhes.cpi, suffix: null },
              ].map((kpi, i) => {
                if (kpi.val === null) return null;
                const good = kpi.val >= 0.9;
                return (
                  <div key={i} className={`rounded-lg border p-3 ${good ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                    <p className="text-[11px] text-gray-500 mb-0.5">{kpi.label}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-black ${good ? "text-green-600" : "text-red-600"}`}>{kpi.val.toFixed(2)}</span>
                      {good ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                    </div>
                    {kpi.suffix && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.suffix}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DRE Redesenhado ── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                Resultado Financeiro da Obra
                {isAdmin && (
                  <button onClick={() => setShowConfig(true)} className="ml-auto text-[10px] text-blue-500 underline font-normal">
                    {financeiro.aliquotaImpostos === 0 && financeiro.pctCustosFixos === 0 ? "⚙ Configurar impostos/overhead" : "⚙ Configurar"}
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-4 space-y-5">

              {financeiro.valorContrato === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
                  <p className="text-sm font-medium text-amber-700">Nenhum orçamento vinculado a esta obra</p>
                  <p className="text-xs text-amber-500 mt-0.5">Vincule um orçamento para ativar o Resultado Financeiro.</p>
                </div>
              ) : (
                <>
                  {/* PREVISTO */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Previsto (orçamento aprovado)
                    </p>
                    {/* Linha 1 — sempre: Receita - Custo Direto = Lucro Bruto */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center shadow-sm">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">Receita (Contrato)</p>
                        <p className="text-lg font-black text-gray-800 leading-tight">{fmt(financeiro.valorContrato)}</p>
                      </div>
                      <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-center shadow-sm">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">(−) Custo Direto</p>
                        <p className="text-lg font-black text-red-600 leading-tight">{fmt(financeiro.custoPrevisto)}</p>
                        <p className="text-[9px] text-red-400 mt-0.5">{fPct(financeiro.custoPrevisto / financeiro.valorContrato * 100)}</p>
                      </div>
                      <div className={`rounded-xl border px-3 py-3 text-center shadow-sm ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "border-amber-200 bg-amber-50" : (financeiro.lucroBrutoPrevisto >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}`}>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">= Lucro Bruto</p>
                        <p className={`text-lg font-black leading-tight ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "text-amber-700" : (financeiro.lucroBrutoPrevisto >= 0 ? "text-green-700" : "text-red-600")}`}>
                          {fmt(financeiro.lucroBrutoPrevisto ?? (financeiro.valorContrato - financeiro.custoPrevisto))}
                        </p>
                        <p className={`text-[9px] mt-0.5 font-semibold ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "text-amber-500" : "text-green-500"}`}>
                          {financeiro.valorContrato > 0 ? (((financeiro.lucroBrutoPrevisto ?? (financeiro.valorContrato - financeiro.custoPrevisto)) / financeiro.valorContrato) * 100).toFixed(1) : "0.0"}% bruto
                        </p>
                      </div>
                    </div>
                    {/* Linha 2 — se há deduções: mostra impostos + overhead → Lucro Líquido */}
                    {(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? (
                      <div className="mt-2 ml-1 border-l-2 border-amber-200 pl-3">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {financeiro.aliquotaImpostos > 0 && (
                            <span className="text-[10px] bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-gray-600">
                              (−) Impostos <strong className="text-orange-600">{financeiro.aliquotaImpostos}%</strong> = <strong className="text-orange-700">{fmt(financeiro.impostosPrevistos)}</strong>
                            </span>
                          )}
                          {financeiro.pctCustosFixos > 0 && (
                            <span className="text-[10px] bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-gray-600">
                              (−) Overhead <strong className="text-orange-600">{financeiro.pctCustosFixos}%</strong> = <strong className="text-orange-700">{fmt(financeiro.custosFixosPrevistos)}</strong>
                            </span>
                          )}
                        </div>
                        <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between shadow-sm ${financeiro.lucroLiquidoPrevisto >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide font-bold">= Lucro Líquido Previsto</p>
                          <div className="text-right">
                            <p className={`text-lg font-black leading-tight ${financeiro.lucroLiquidoPrevisto >= 0 ? "text-green-700" : "text-red-600"}`}>
                              {fmt(financeiro.lucroLiquidoPrevisto)}
                            </p>
                            <p className={`text-[9px] font-semibold ${financeiro.margemPrevista >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {financeiro.margemPrevista.toFixed(1)}% margem líquida
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Sem impostos/overhead configurados — Lucro Bruto = Lucro Líquido.
                        {isAdmin && <button onClick={() => setShowConfig(true)} className="underline text-blue-500 ml-1">Configurar deduções</button>}
                      </p>
                    )}
                  </div>

                  {/* REALIZADO */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                      Realizado (compras + financeiro)
                      <span className="ml-auto text-[9px] font-normal text-gray-300 normal-case tracking-normal">Atualizado em tempo real</span>
                    </p>

                    {financeiro.custoRealizado === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center space-y-1.5">
                        <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto" />
                        <p className="text-sm font-semibold text-amber-700">Custo realizado: R$ 0,00</p>
                        <p className="text-[11px] text-amber-600 leading-snug">
                          Nenhuma despesa paga/liquidada encontrada em <span className="font-mono bg-amber-100 px-0.5 rounded">financial_entries</span> para esta obra.
                          O lucro real será calculado automaticamente conforme os custos forem registrados.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center shadow-sm">
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">Contrato</p>
                            <p className="text-lg font-black text-gray-800 leading-tight">{fmt(financeiro.valorContrato)}</p>
                          </div>
                          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-center shadow-sm">
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">(−) Custo Real</p>
                            <p className="text-lg font-black text-red-600 leading-tight">{fmt(financeiro.custoRealizado)}</p>
                            <p className={`text-[9px] mt-0.5 font-semibold ${financeiro.custoRealizado > financeiro.custoPrevisto ? "text-red-500" : "text-gray-400"}`}>
                              {fPct(financeiro.custoRealizado / financeiro.custoPrevisto * 100)} do previsto
                            </p>
                          </div>
                          <div className={`rounded-xl border px-3 py-3 text-center shadow-sm ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "border-amber-200 bg-amber-50" : (financeiro.lucroBrutoRealizado >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}`}>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1.5">= Lucro Bruto</p>
                            <p className={`text-lg font-black leading-tight ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "text-amber-700" : (financeiro.lucroBrutoRealizado >= 0 ? "text-green-700" : "text-red-600")}`}>
                              {fmt(financeiro.lucroBrutoRealizado ?? (financeiro.valorContrato - financeiro.custoRealizado))}
                            </p>
                            <p className={`text-[9px] mt-0.5 font-semibold ${(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) ? "text-amber-500" : "text-green-500"}`}>
                              {financeiro.valorContrato > 0 ? (((financeiro.lucroBrutoRealizado ?? (financeiro.valorContrato - financeiro.custoRealizado)) / financeiro.valorContrato) * 100).toFixed(1) : "0.0"}% bruto
                            </p>
                          </div>
                        </div>
                        {/* Linha 2 — deduções → Lucro Líquido Real */}
                        {(financeiro.aliquotaImpostos > 0 || financeiro.pctCustosFixos > 0) && (
                          <div className="ml-1 border-l-2 border-amber-200 pl-3">
                            <div className="flex flex-wrap gap-2 mb-2">
                              {financeiro.aliquotaImpostos > 0 && (
                                <span className="text-[10px] bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-gray-600">
                                  (−) Impostos <strong className="text-orange-600">{financeiro.aliquotaImpostos}%</strong> = <strong className="text-orange-700">{fmt(financeiro.impostosRealizados)}</strong>
                                </span>
                              )}
                              {financeiro.pctCustosFixos > 0 && (
                                <span className="text-[10px] bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-gray-600">
                                  (−) Overhead <strong className="text-orange-600">{financeiro.pctCustosFixos}%</strong> = <strong className="text-orange-700">{fmt(financeiro.custosFixosRealizados)}</strong>
                                </span>
                              )}
                            </div>
                            <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between shadow-sm ${financeiro.lucroLiquidoRealizado >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-bold">= Lucro Líquido Real</p>
                              <div className="text-right">
                                <p className={`text-lg font-black leading-tight ${financeiro.lucroLiquidoRealizado >= 0 ? "text-green-700" : "text-red-600"}`}>
                                  {fmt(financeiro.lucroLiquidoRealizado)}
                                </p>
                                <p className={`text-[9px] font-semibold ${financeiro.margemRealizada >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  {financeiro.margemRealizada.toFixed(1)}% margem líquida
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Progress bar */}
                        <div>
                          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                            <span>Custo realizado vs. previsto</span>
                            <span className={`font-semibold ${financeiro.custoRealizado > financeiro.custoPrevisto ? "text-red-500" : "text-gray-500"}`}>
                              {fPct(financeiro.custoRealizado / financeiro.custoPrevisto * 100)}
                            </span>
                          </div>
                          <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${financeiro.custoRealizado / financeiro.custoPrevisto > 1 ? "bg-red-500" : financeiro.custoRealizado / financeiro.custoPrevisto > 0.85 ? "bg-amber-500" : "bg-blue-500"}`}
                              style={{ width: `${Math.min((financeiro.custoRealizado / financeiro.custoPrevisto) * 100, 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                            <span>Restante: {fmt(Math.max(0, financeiro.custoPrevisto - financeiro.custoRealizado))}</span>
                            <span>Previsto: {fmt(financeiro.custoPrevisto)}</span>
                          </div>
                        </div>
                        {/* Breakdown colapsável */}
                        {financeiro.custoPorCategoria?.length > 0 && (
                          <div className="border border-gray-100 rounded-lg overflow-hidden">
                            <button className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-600 transition-colors"
                              onClick={() => setShowMemoria(v => !v)}>
                              <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-blue-500" />Composição do custo realizado</span>
                              {showMemoria ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {showMemoria && (
                              <div className="px-3 py-2.5 space-y-0.5 max-h-48 overflow-y-auto">
                                {financeiro.custoPorCategoria.map((cat: any, i: number) => (
                                  <div key={i} className="flex justify-between text-[10px] py-0.5 border-b border-gray-50 last:border-0">
                                    <span className="text-gray-500 truncate max-w-[65%]"><span className="text-blue-500">[{cat.origem}]</span> {cat.conta}</span>
                                    <span className="font-semibold text-gray-700 shrink-0">{fmt(cat.total)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {financeiro.orcamentoInfo && (
                    <p className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                      📄 Orçamento: <span className="font-mono text-blue-600">{financeiro.orcamentoInfo.codigo}</span> — {financeiro.orcamentoInfo.status}
                      {" · "}Contrato via <span className="font-mono">{financeiro.orcamentoInfo.fonteContrato}</span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Log de Eventos */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-gray-500" />
                Log de Eventos do Score ({eventos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {eventos.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nenhum evento — score limpo! 🎉</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {eventos.map((ev, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${ev.pontos >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                      <span className="mt-0.5 shrink-0">{EVENTO_ICONS[ev.tipo] ?? <Info className="w-3.5 h-3.5 text-gray-400" />}</span>
                      <span className="flex-1 text-gray-700">{ev.descricao}</span>
                      <span className={`shrink-0 font-bold ${ev.pontos >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {ev.pontos >= 0 ? "+" : ""}{ev.pontos} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════ TAB: METAS & DESVIOS ════════════ */}
      {tabScore === "metas" && (
        <div className="space-y-4">
          {analiseMetasDesvios.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />Carregando análise de metas…
            </div>
          ) : !analiseMetasDesvios.data ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-amber-700">Nenhum orçamento vinculado a esta obra</p>
              <p className="text-xs text-amber-500 mt-1">Vincule um orçamento para ativar a análise de metas.</p>
            </div>
          ) : (
            <>
              {/* KPIs orçamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2 font-semibold">Orçamento vs. Custo Comprometido</p>
                    <div className="flex items-end gap-3 mb-2">
                      <div>
                        <p className="text-[10px] text-gray-400">Orçado (custo)</p>
                        <p className="text-xl font-black text-gray-800">{fmt(analiseMetasDesvios.data.resumo.totalOrcamento)}</p>
                      </div>
                      <div className="flex-1 text-right">
                        <p className="text-[10px] text-gray-400">Total comprometido</p>
                        <p className={`text-xl font-black ${(analiseMetasDesvios.data.resumo.totalCustoComprometido ?? analiseMetasDesvios.data.resumo.totalGastoOC) > analiseMetasDesvios.data.resumo.totalOrcamento ? "text-red-600" : "text-blue-700"}`}>
                          {fmt(analiseMetasDesvios.data.resumo.totalCustoComprometido ?? analiseMetasDesvios.data.resumo.totalGastoOC)}
                        </p>
                      </div>
                    </div>
                    {/* Detalhamento OC + Terceiros */}
                    <div className="flex gap-3 mb-2 text-[10px]">
                      <div className="flex-1 bg-blue-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-gray-400">OCs de Material/Serviço</p>
                        <p className="font-bold text-blue-700">{fmt(analiseMetasDesvios.data.resumo.totalGastoOC)}</p>
                      </div>
                      <div className="flex-1 bg-purple-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-gray-400">Contratos de Terceiros</p>
                        <p className="font-bold text-purple-700">{fmt(analiseMetasDesvios.data.resumo.totalTerceiros ?? 0)}</p>
                      </div>
                    </div>
                    <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden mb-1">
                      <div className={`h-full rounded-full transition-all ${analiseMetasDesvios.data.resumo.pctConsumido > 100 ? "bg-red-500" : analiseMetasDesvios.data.resumo.pctConsumido > 85 ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(analiseMetasDesvios.data.resumo.pctConsumido, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 text-right">{analiseMetasDesvios.data.resumo.pctConsumido.toFixed(1)}% do orçamento comprometido</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3 font-semibold">Situação dos Itens de Compra</p>
                    <div className="space-y-2">
                      {[
                        { label: "✅ Dentro da meta", v: analiseMetasDesvios.data.resumo.numItensDentroMeta,    color: "text-green-700", bg: "bg-green-100" },
                        { label: "❌ Acima da meta",  v: analiseMetasDesvios.data.resumo.numItensAcimaMeta,     color: "text-red-700",   bg: "bg-red-100"   },
                        { label: "⚠ Sem referência", v: analiseMetasDesvios.data.resumo.numItensSemReferencia,  color: "text-amber-700", bg: "bg-amber-100" },
                      ].map((k, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{k.label}</span>
                          <span className={`text-sm font-black px-2 py-0.5 rounded-full ${k.bg} ${k.color}`}>{k.v}</span>
                        </div>
                      ))}
                    </div>
                    {analiseMetasDesvios.data.resumo.maiorDesvioNome && (
                      <p className="text-[10px] text-red-500 mt-2 border-t border-red-100 pt-2">
                        ⚠ Maior desvio: <strong>{analiseMetasDesvios.data.resumo.maiorDesvioNome}</strong> (+{analiseMetasDesvios.data.resumo.maiorDesvioPct.toFixed(1)}% acima)
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Acompanhamento mensal */}
              {analiseMetasDesvios.data.mensal.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
                      Acompanhamento Mensal de Compras
                      {analiseMetasDesvios.data.resumo.metaMensal > 0 && (
                        <span className="ml-auto text-[10px] font-normal text-gray-400">
                          Meta: {fmt(analiseMetasDesvios.data.resumo.metaMensal)}/mês
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-2">
                    <div className="space-y-1.5">
                      {analiseMetasDesvios.data.mensal.map((m, i) => {
                        const all = analiseMetasDesvios.data!.mensal;
                        const maxV = Math.max(...all.map(x => x.total_compras));
                        const pct  = maxV > 0 ? (m.total_compras / maxV) * 100 : 0;
                        const metaPct = analiseMetasDesvios.data!.resumo.metaMensal > 0 ? (analiseMetasDesvios.data!.resumo.metaMensal / maxV) * 100 : null;
                        const barColor = m.status === "critico" ? "bg-red-500" : m.status === "alerta" ? "bg-amber-500" : "bg-blue-500";
                        const isLast    = i === all.length - 2;
                        const isThis    = i === all.length - 1;
                        return (
                          <div key={m.mes} className="flex items-center gap-2 text-xs">
                            <span className="w-14 text-right text-gray-500 shrink-0 text-[10px] font-mono">{m.mes}</span>
                            <div className="relative flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                              <div className={`h-full rounded ${barColor} transition-all flex items-center pl-1.5`} style={{ width: `${pct}%` }}>
                                {pct > 25 && <span className="text-white text-[9px] font-semibold">{fmt(m.total_compras)}</span>}
                              </div>
                              {metaPct !== null && (
                                <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-600 opacity-40" style={{ left: `${Math.min(metaPct, 99)}%` }} />
                              )}
                            </div>
                            <span className="shrink-0 text-[10px] text-gray-500">{m.num_ocs} OC(s)</span>
                            {pct <= 25 && <span className="shrink-0 text-[10px] text-gray-700 font-semibold">{fmt(m.total_compras)}</span>}
                            {m.status === "critico" && <span className="shrink-0 text-[9px] text-red-600 font-bold">❌</span>}
                            {m.status === "alerta"  && <span className="shrink-0 text-[9px] text-amber-600 font-bold">⚠</span>}
                            {isLast && <span className="shrink-0 text-[9px] text-gray-400 border border-gray-200 px-1 rounded">mês passado</span>}
                            {isThis && <span className="shrink-0 text-[9px] text-indigo-600 border border-indigo-200 bg-indigo-50 px-1 rounded">este mês</span>}
                          </div>
                        );
                      })}
                    </div>
                    {analiseMetasDesvios.data.resumo.metaMensal > 0 && (
                      <p className="text-[10px] text-gray-400 mt-2">
                        linha tracejada = meta mensal ({fmt(analiseMetasDesvios.data.resumo.metaMensal)}/mês — {fmt(analiseMetasDesvios.data.resumo.totalOrcamento)} ÷ {analiseMetasDesvios.data.resumo.tempoMeses} meses)
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Tabela desvios */}
              {analiseMetasDesvios.data.desvios.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                      Análise Item a Item — OC vs Meta do Orçamento
                      <Badge className="ml-auto bg-gray-100 text-gray-600 text-[9px]">{analiseMetasDesvios.data.desvios.length} itens</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-2">
                    <div className="rounded border border-gray-100 overflow-hidden overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-2.5 py-2 text-gray-500 font-semibold">Item</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-20">Meta (un.)</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-20">OC Médio</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-16">Desvio</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-20">Total Gasto</th>
                            <th className="text-center px-2.5 py-2 text-gray-500 font-semibold w-10">OCs</th>
                            <th className="text-center px-2.5 py-2 text-gray-500 font-semibold w-16">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analiseMetasDesvios.data.desvios.map((d, i) => (
                            <tr key={i} className={`border-t border-gray-50 ${d.status_meta === "acima" ? "bg-red-50/40" : d.status_meta === "sem_referencia" ? "bg-amber-50/30" : ""}`}>
                              <td className="px-2.5 py-1.5 text-gray-700 max-w-[140px]"><span className="line-clamp-2">{d.descricao}</span></td>
                              <td className="px-2.5 py-1.5 text-right text-gray-500">{d.precoMeta > 0 ? fmt(d.precoMeta) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold text-gray-700">{d.precoOC > 0 ? fmt(d.precoOC) : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-right font-bold">
                                {d.desvio_pct === null ? <span className="text-gray-300">—</span> : d.desvio_pct > 0 ? <span className="text-red-600">+{d.desvio_pct.toFixed(1)}%</span> : <span className="text-green-600">{d.desvio_pct.toFixed(1)}%</span>}
                              </td>
                              <td className="px-2.5 py-1.5 text-right font-semibold text-gray-700">{fmt(d.total_gasto)}</td>
                              <td className="px-2.5 py-1.5 text-center text-gray-500">{d.num_ocs}</td>
                              <td className="px-2.5 py-1.5 text-center">
                                {d.status_meta === "dentro"         && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✓ Meta</span>}
                                {d.status_meta === "acima"          && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">⬆ Acima</span>}
                                {d.status_meta === "sem_referencia" && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">? Sem ref.</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      <span className="text-green-600 font-semibold">✓ Meta</span> = preço OC ≤ meta orçamento &nbsp;
                      <span className="text-red-600 font-semibold">⬆ Acima</span> = preço OC &gt; meta &nbsp;
                      <span className="text-amber-600 font-semibold">? Sem ref.</span> = item sem correspondência no orçamento (match por nome exato)
                    </p>
                  </CardContent>
                </Card>
              )}
              {analiseMetasDesvios.data.desvios.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Nenhuma OC registrada com itens para esta obra.</p>
              )}

              {/* Contratos de Terceiros */}
              {(analiseMetasDesvios.data.terceiros ?? []).length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <span className="text-purple-600">🏗</span>
                      Contratos de Terceiros (Empreiteiras / Subcontratados)
                      <span className="ml-auto text-[10px] font-normal text-gray-400">
                        {(analiseMetasDesvios.data.terceiros ?? []).length} contrato(s)
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-2">
                    <div className="rounded border border-gray-100 overflow-hidden overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-2.5 py-2 text-gray-500 font-semibold">Contrato / Empresa</th>
                            <th className="text-center px-2.5 py-2 text-gray-500 font-semibold w-20">Tipo</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-24">Valor Contrato</th>
                            <th className="text-right px-2.5 py-2 text-gray-500 font-semibold w-24">Medido (aprov.)</th>
                            <th className="text-center px-2.5 py-2 text-gray-500 font-semibold w-16">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analiseMetasDesvios.data.terceiros ?? []).map((tc, i) => {
                            const pctMedido = tc.valorContrato > 0 ? (tc.valorMedido / tc.valorContrato) * 100 : 0;
                            const statusColor =
                              tc.status === "concluido" ? "bg-green-100 text-green-700" :
                              tc.status === "encerrado" ? "bg-gray-100 text-gray-600" :
                              tc.status === "suspenso"  ? "bg-red-100 text-red-700" :
                              "bg-blue-100 text-blue-700";
                            const statusLabel =
                              tc.status === "concluido" ? "Concluído" :
                              tc.status === "encerrado" ? "Encerrado" :
                              tc.status === "suspenso"  ? "Suspenso"  :
                              "Ativo";
                            return (
                              <tr key={tc.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                <td className="px-2.5 py-2 text-gray-700 max-w-[180px]">
                                  <span className="line-clamp-2 font-medium">{tc.descricao}</span>
                                  {tc.natureza && tc.natureza !== "mao_de_obra" && (
                                    <span className="text-gray-400 text-[9px] block">
                                      {tc.natureza === "material" ? "Material" : tc.natureza === "mao_de_obra_material" ? "MDO + Material" : tc.natureza}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 text-center text-gray-500">
                                  {tc.tipoContrato === "preco_unitario" ? "Preço Unit." : tc.tipoContrato === "misto" ? "Misto" : "Global"}
                                </td>
                                <td className="px-2.5 py-2 text-right font-semibold text-purple-700">{fmt(tc.valorContrato)}</td>
                                <td className="px-2.5 py-2 text-right">
                                  <span className="font-semibold text-gray-700">{fmt(tc.valorMedido)}</span>
                                  {tc.valorContrato > 0 && (
                                    <span className="block text-[9px] text-gray-400">{pctMedido.toFixed(1)}%</span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 text-center">
                                  <span className={`px-1.5 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                          <tr>
                            <td colSpan={2} className="px-2.5 py-2 font-bold text-gray-600 text-[10px]">Total Contratos</td>
                            <td className="px-2.5 py-2 text-right font-black text-purple-700">
                              {fmt((analiseMetasDesvios.data.terceiros ?? []).reduce((s, r) => s + r.valorContrato, 0))}
                            </td>
                            <td className="px-2.5 py-2 text-right font-black text-gray-700">
                              {fmt((analiseMetasDesvios.data.terceiros ?? []).reduce((s, r) => s + r.valorMedido, 0))}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      Medido = soma das medições com status <strong>aprovada</strong> ou <strong>paga</strong>.
                      O valor do contrato representa o comprometido total.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════ TAB: RH / FOLHA ════════════ */}
      {tabScore === "rh" && (
        <div className="space-y-4">
          {/* Sub-abas RH */}
          <div className="flex gap-1 border-b border-gray-200 pb-0">
            {([
              { key: "folha", label: "Folha / Custos" },
              { key: "banco", label: "Banco de Horas" },
            ] as { key: "folha"|"banco", label: string }[]).map(t => (
              <button key={t.key} onClick={() => setAbaRH(t.key)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-t border-b-2 transition-colors ${
                  abaRH === t.key
                    ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Sub-aba: Folha ── */}
          {abaRH === "folha" && (() => {
            const MES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            const rhMonthStatus: Record<number, "data" | "none"> = Object.fromEntries(
              Array.from({ length: 12 }, (_, i) => [i + 1, "none" as const])
            );
            // Usa analiseRHAnoTodo (sempre ano completo) para que as bolinhas
            // permaneçam acesas independentemente do mês filtrado atualmente.
            // Só marca "data" se houver funcionários com payroll no mês (qtdFuncionarios>0).
            // Meses com apenas férias órfãs (sem entrada de payroll) ficam como "none".
            for (const entry of (analiseRHAnoTodo.data?.mensal ?? analiseRH.data?.mensal ?? [])) {
              const [y, mm] = (entry.mes as string).split('-');
              if (y === String(rhAno) && (entry.qtdFuncionarios ?? 0) > 0) {
                rhMonthStatus[parseInt(mm)] = "data";
              }
            }
            return (
          <div className="space-y-4">
            {/* Seletor padronizado PeriodSelectorCard */}
            <PeriodSelectorCard
              ano={rhAno}
              mes={rhMes === "all" ? null : parseInt(rhMes)}
              onAno={(a) => setRhAno(a)}
              onMes={(m) => setRhMes(String(m).padStart(2, '0'))}
              onAnoTodo={() => setRhMes("all")}
              monthStatus={rhMonthStatus}
              actions={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Com dados</div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Sem dados</div>
                </div>
              }
            />
            {/* Info: período efetivo da obra quando "Ano todo" está ativo */}
            {rhMes === "all" && (obraIniMes || obraFimMes) && (() => {
              const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
              const fmtMes = (ym: string) => {
                const [y, m] = ym.split("-");
                return `${MESES_ABREV[parseInt(m)-1]}/${String(y).slice(2)}`;
              };
              const de  = obraIniMes?.startsWith(_anoStr) ? obraIniMes : `${_anoStr}-01`;
              const ate = obraFimMes?.startsWith(_anoStr) ? obraFimMes : `${_anoStr}-12`;
              const isFullYear = de === `${_anoStr}-01` && ate === `${_anoStr}-12`;
              if (isFullYear) return null;
              return (
                <p className="text-xs text-muted-foreground text-center -mt-2">
                  Exibindo <strong>{fmtMes(de)} → {fmtMes(ate)}</strong> (período da obra)
                </p>
              );
            })()}

            {analiseRH.isLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />Calculando custos da folha…
              </div>
            ) : !analiseRH.data || analiseRH.data.funcionarios.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">Sem dados de folha para esta obra no período selecionado.</p>
            ) : (
              <div className="space-y-4">
                {/* KPI resumo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Funcionários",      v: String(analiseRH.data.resumo.totalFuncionarios),                                            color: "text-indigo-700" },
                    { label: "Custo Total",        v: fmt(analiseRH.data.resumo.custoTotalEmpresa),                                               color: "text-violet-700 font-bold" },
                    { label: "Salário Bruto",      v: fmt(analiseRH.data.resumo.salarioBrutoTotal),                                               color: "text-gray-800" },
                    { label: "VR/VA",              v: fmt(analiseRH.data.resumo.vaTotal),                                                        color: "text-teal-700" },
                    { label: "Férias",             v: fmt(analiseRH.data.resumo.feriasTotal ?? 0),                                                color: (analiseRH.data.resumo.feriasTotal ?? 0) > 0 ? "text-orange-700" : "text-gray-300" },
                    { label: "Seg. de Vida",       v: fmt(analiseRH.data.resumo.seguroVidaTotal ?? 0),                                            color: (analiseRH.data.resumo.seguroVidaTotal ?? 0) > 0 ? "text-rose-700" : "text-gray-300" },
                    { label: "HE",                 v: fmt(analiseRH.data.resumo.heTotal),                                                         color: analiseRH.data.resumo.heTotal > 0 ? "text-amber-700" : "text-gray-300" },
                    { label: "FGTS",               v: fmt(analiseRH.data.resumo.fgtsTotal),                                                       color: "text-blue-700" },
                  ].map((k, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                      <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* Tabela mensal */}
                {analiseRH.data.mensal.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Custo por Mês — clique para filtrar</p>
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-gray-50 text-[9px] uppercase tracking-wide text-gray-500">
                            <th className="text-left px-2 py-1.5 font-semibold">Mês</th>
                            <th className="text-center px-2 py-1.5 font-semibold">Funcs</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Salário</th>
                            <th className="text-right px-2 py-1.5 font-semibold">HE</th>
                            <th className="text-right px-2 py-1.5 font-semibold">VR/VA</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Férias</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Seg.Vida</th>
                            <th className="text-right px-2 py-1.5 font-semibold">FGTS</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-indigo-600">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analiseRH.data.mensal.map((m: any) => {
                            const [yy, mm] = (m.mes as string).split('-');
                            const mesLabel = MES_LABELS[parseInt(mm) - 1] + '/' + yy.slice(2);
                            const isActive = rhMes !== 'all' && `${rhAno}-${rhMes}` === m.mes;
                            return (
                              <tr key={m.mes}
                                onClick={() => setRhMes(isActive ? 'all' : mm)}
                                className={`border-t border-gray-100 cursor-pointer transition-colors hover:bg-indigo-50/40 ${isActive ? 'bg-indigo-50' : ''}`}>
                                <td className="px-2 py-1.5 font-semibold text-gray-700">{mesLabel}</td>
                                <td className="px-2 py-1.5 text-center text-gray-500">{m.qtdFuncionarios}</td>
                                <td className="px-2 py-1.5 text-right text-gray-700">{fmt(m.salarioBruto)}</td>
                                <td className="px-2 py-1.5 text-right text-amber-700">{m.he > 0 ? fmt(m.he) : <span className="text-gray-200">—</span>}</td>
                                <td className="px-2 py-1.5 text-right text-teal-700">{m.va > 0 ? fmt(m.va) : <span className="text-gray-200">—</span>}</td>
                                <td className="px-2 py-1.5 text-right text-orange-700">{m.ferias > 0 ? fmt(m.ferias) : <span className="text-gray-200">—</span>}</td>
                                <td className="px-2 py-1.5 text-right text-rose-700">{m.seguroVida > 0 ? fmt(m.seguroVida) : <span className="text-gray-200">—</span>}</td>
                                <td className="px-2 py-1.5 text-right text-blue-700">{fmt(m.fgts)}</td>
                                <td className="px-2 py-1.5 text-right font-bold text-indigo-700">{fmt(m.custoTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                          <tr className="font-semibold text-[10px] text-gray-700">
                            <td className="px-2 py-1.5 uppercase tracking-wide text-gray-500">Total</td>
                            <td className="px-2 py-1.5 text-center">{analiseRH.data.resumo.totalFuncionarios}</td>
                            <td className="px-2 py-1.5 text-right">{fmt(analiseRH.data.resumo.salarioBrutoTotal)}</td>
                            <td className="px-2 py-1.5 text-right text-amber-700">{fmt(analiseRH.data.resumo.heTotal)}</td>
                            <td className="px-2 py-1.5 text-right text-teal-700">{fmt(analiseRH.data.resumo.vaTotal)}</td>
                            <td className="px-2 py-1.5 text-right text-orange-700">{fmt(analiseRH.data.resumo.feriasTotal ?? 0)}</td>
                            <td className="px-2 py-1.5 text-right text-rose-700">{fmt(analiseRH.data.resumo.seguroVidaTotal ?? 0)}</td>
                            <td className="px-2 py-1.5 text-right text-blue-700">{fmt(analiseRH.data.resumo.fgtsTotal)}</td>
                            <td className="px-2 py-1.5 text-right font-bold text-indigo-700">{fmt(analiseRH.data.resumo.custoTotalEmpresa)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 italic bg-blue-50 border border-blue-100 rounded px-2 py-1.5 leading-snug">
                  Custo proporcional ao período de alocação. Funcionário com 15 dias aqui e 15 dias em outra obra tem <strong>50% do custo alocado aqui</strong>.
                  Férias = períodos lançados no RH com custo real. Seg. Vida = custo mensal cadastrado × meses ativos.
                  VT não incluso (depende de presença diária — consultar Folha).
                </p>

                {/* Tabela: individual (admin_master) ou por função (demais — LGPD) */}
                {isAdminMaster ? (
                  /* ── Visão Admin Master: detalhamento individual ── */
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Custo por Funcionário{rhMes !== 'all' ? ` — ${MES_LABELS[parseInt(rhMes)-1]}/${String(rhAno).slice(2)}` : ''}
                        {' — '}
                        {rhSortBy === "nome" ? "A → Z" : "ordenado por custo total"}
                        {filtroFuncao && <span className="ml-1 normal-case text-indigo-500">· {rhFuncsFiltrados.length} func.</span>}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setRhSortBy(s => s === "custo" ? "nome" : "custo")}
                          className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors cursor-pointer select-none"
                          title={rhSortBy === "custo" ? "Ordenar por nome (A→Z)" : "Ordenar por custo (maior primeiro)"}
                        >
                          {rhSortBy === "custo" ? "A → Z" : "Custo ↓"}
                        </button>
                        {rhCargoOptions.length > 0 && (
                          <>
                            <select
                              value={filtroFuncao}
                              onChange={(e) => setFiltroFuncao(e.target.value)}
                              className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                            >
                              <option value="">Todas as funções ({(analiseRH.data.funcionarios ?? []).length})</option>
                              {rhCargoOptions.map((c) => {
                                const cnt = (analiseRH.data.funcionarios ?? []).filter((f: any) =>
                                  (f.cargo || f.razao_social || "Sem função").trim() === c).length;
                                return <option key={c} value={c}>{c} ({cnt})</option>;
                              })}
                            </select>
                            {filtroFuncao && (
                              <button onClick={() => setFiltroFuncao("")}
                                className="text-[11px] text-indigo-500 hover:text-indigo-700 underline">
                                limpar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                            <th className="text-left px-2 py-1.5 font-semibold">Funcionário</th>
                            <th className="text-center px-2 py-1.5 font-semibold">Dias</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Sal. Bruto</th>
                            <th className="text-right px-2 py-1.5 font-semibold">HE</th>
                            <th className="text-right px-2 py-1.5 font-semibold">VR/VA</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Férias</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Seg.</th>
                            <th className="text-right px-2 py-1.5 font-semibold">FGTS</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Total</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {rhFuncsFiltrados.map((f: any) => {
                            const empId = Number(f.employee_id);
                            const isOpen = expandedRH.has(empId);
                            const toggle = () => setExpandedRH(prev => {
                              const ns = new Set(prev);
                              if (ns.has(empId)) ns.delete(empId); else ns.add(empId);
                              return ns;
                            });
                            const hist: any[] = Array.isArray(f.historico_mensal) ? f.historico_mensal : [];
                            const histFiltered = rhMes === 'all' ? hist : hist.filter((h: any) => h.mes === `${rhAno}-${rhMes}`);
                            const va = Number(f.va_total ?? 0);
                            return (
                              <React.Fragment key={empId}>
                                <tr onClick={toggle} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      {(() => {
                                        const initials = (f.nome ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("");
                                        return f.foto_url ? (
                                          <img
                                            src={f.foto_url} alt={f.nome}
                                            className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-indigo-400 transition-all"
                                            onClick={(ev) => { ev.stopPropagation(); setSstPhotoLightbox({ url: f.foto_url, nome: f.nome ?? "—", initials }); }}
                                          />
                                        ) : (
                                          <div
                                            className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200 cursor-zoom-in hover:ring-2 hover:ring-indigo-400 transition-all"
                                            onClick={(ev) => { ev.stopPropagation(); setSstPhotoLightbox({ url: null, nome: f.nome ?? "—", initials }); }}
                                          >
                                            <span className="text-[9px] font-bold text-indigo-600">{initials}</span>
                                          </div>
                                        );
                                      })()}
                                      <div>
                                        <div className="flex items-center gap-1 leading-tight">
                                          <p className="font-medium text-gray-800">{f.nome}</p>
                                          {f.tipo_pessoa === 'PJ' && (
                                            <span className="px-1 py-0 rounded text-[8px] font-bold bg-purple-100 text-purple-700 border border-purple-200">PJ</span>
                                          )}
                                        </div>
                                        <p className="text-[8px] text-gray-500 font-mono leading-tight">{f.matricula ?? "—"}</p>
                                        {f.tipo_pessoa === 'PJ' && f.razao_social && (
                                          <p className="text-[8px] text-purple-500 font-medium leading-tight">{f.razao_social}</p>
                                        )}
                                        {f.tipo_pessoa !== 'PJ' && f.cargo && <p className="text-[8px] text-indigo-500 font-medium leading-tight">{f.cargo}</p>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="text-center px-2 py-1.5 text-gray-600">{f.total_dias_na_obra}</td>
                                  <td className="text-right px-2 py-1.5 text-gray-700">{fmt(Number(f.salario_bruto_total))}</td>
                                  <td className="text-right px-2 py-1.5 text-amber-700">{Number(f.he_total) > 0 ? fmt(Number(f.he_total)) : <span className="text-gray-300">—</span>}</td>
                                  <td className="text-right px-2 py-1.5 text-teal-700">{va > 0 ? fmt(va) : <span className="text-gray-300">—</span>}</td>
                                  <td className="text-right px-2 py-1.5 text-orange-700">{Number(f.ferias_total) > 0 ? fmt(Number(f.ferias_total)) : <span className="text-gray-300">—</span>}</td>
                                  <td className="text-right px-2 py-1.5 text-rose-700">{Number(f.seguro_vida_total) > 0 ? fmt(Number(f.seguro_vida_total)) : <span className="text-gray-300">—</span>}</td>
                                  <td className="text-right px-2 py-1.5 text-blue-700">{fmt(Number(f.fgts_total))}</td>
                                  <td className="text-right px-2 py-1.5 font-semibold text-indigo-700">{fmt(Number(f.custo_total_empresa))}</td>
                                  <td className="px-1 py-1.5 text-gray-400">{isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</td>
                                </tr>
                                {isOpen && histFiltered.length > 0 && (
                                  <tr className="bg-indigo-50/40">
                                    <td colSpan={10} className="px-3 py-2">
                                      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Detalhamento mensal — {f.nome}</p>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                          <thead>
                                            <tr className="text-gray-400 border-b border-indigo-100">
                                              <th className="text-left py-1 pr-3 font-semibold">Mês</th>
                                              <th className="text-center py-1 pr-3 font-semibold">Dias/Tot</th>
                                              <th className="text-center py-1 pr-3 font-semibold">Fração</th>
                                              <th className="text-right py-1 pr-3 font-semibold">Sal. Bruto</th>
                                              <th className="text-right py-1 pr-3 font-semibold">HE</th>
                                              <th className="text-right py-1 pr-3 font-semibold">VR/VA</th>
                                              <th className="text-right py-1 pr-3 font-semibold">Férias</th>
                                              <th className="text-right py-1 pr-3 font-semibold">Seg.</th>
                                              <th className="text-right py-1 pr-3 font-semibold">FGTS</th>
                                              <th className="text-right py-1 font-semibold">Total</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {histFiltered.map((hm: any, mi: number) => (
                                              <tr key={mi} className="border-b border-indigo-100/50 hover:bg-indigo-100/30">
                                                <td className="py-1 pr-3 text-gray-700 font-medium">{hm.mes}</td>
                                                <td className="py-1 pr-3 text-center text-gray-500">{hm.diasNaObra}/{hm.diasNoMes}</td>
                                                <td className="py-1 pr-3 text-center">
                                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${Number(hm.fracao) < 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                                    {(Number(hm.fracao) * 100).toFixed(0)}%
                                                  </span>
                                                </td>
                                                <td className="py-1 pr-3 text-right text-gray-700">{fmt(Number(hm.salarioBruto))}</td>
                                                <td className="py-1 pr-3 text-right text-amber-700">{Number(hm.horasExtras) > 0 ? fmt(Number(hm.horasExtras)) : <span className="text-gray-300">—</span>}</td>
                                                <td className="py-1 pr-3 text-right text-teal-700">{Number(hm.va) > 0 ? fmt(Number(hm.va)) : <span className="text-gray-300">—</span>}</td>
                                                <td className="py-1 pr-3 text-right text-orange-700">{Number(hm.ferias) > 0 ? fmt(Number(hm.ferias)) : <span className="text-gray-300">—</span>}</td>
                                                <td className="py-1 pr-3 text-right text-rose-700">{Number(hm.seguroVida) > 0 ? fmt(Number(hm.seguroVida)) : <span className="text-gray-300">—</span>}</td>
                                                <td className="py-1 pr-3 text-right text-blue-700">{fmt(Number(hm.fgts))}</td>
                                                <td className="py-1 text-right font-semibold text-indigo-700">{fmt(Number(hm.custoTotal))}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs text-gray-700">
                            <td className="px-2 py-2 text-[10px] uppercase tracking-wide">
                              {filtroFuncao ? <span className="text-indigo-600">SUBTOTAL — {filtroFuncao}</span> : "TOTAL"}
                            </td>
                            <td className="text-center px-2 py-2 text-gray-500">{rhFuncsFiltrados.length}</td>
                            <td className="text-right px-2 py-2">{fmt(rhResumoFiltrado.salarioBruto)}</td>
                            <td className="text-right px-2 py-2 text-amber-700">{fmt(rhResumoFiltrado.he)}</td>
                            <td className="text-right px-2 py-2 text-teal-700">{fmt(rhResumoFiltrado.va)}</td>
                            <td className="text-right px-2 py-2 text-orange-700">{fmt(rhResumoFiltrado.ferias)}</td>
                            <td className="text-right px-2 py-2 text-rose-700">{fmt(rhResumoFiltrado.seguroVida)}</td>
                            <td className="text-right px-2 py-2 text-blue-700">{fmt(rhResumoFiltrado.fgts)}</td>
                            <td className="text-right px-2 py-2 font-bold text-indigo-700">{fmt(rhResumoFiltrado.custoTotal)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* ── Visão Engenheiro / Gestor: custo agregado por função (LGPD) ── */
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Custo por Função{rhMes !== 'all' ? ` — ${MES_LABELS[parseInt(rhMes)-1]}/${String(rhAno).slice(2)}` : ''}
                        {' — '}{rhPorFuncao.length} {rhPorFuncao.length === 1 ? "função" : "funções"}
                      </p>
                      {rhCargoOptions.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <select
                            value={filtroFuncao}
                            onChange={(e) => setFiltroFuncao(e.target.value)}
                            className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                          >
                            <option value="">Todas as funções ({(analiseRH.data.funcionarios ?? []).length})</option>
                            {rhCargoOptions.map((c) => {
                              const cnt = (analiseRH.data.funcionarios ?? []).filter((f: any) =>
                                (f.cargo || f.razao_social || "Sem função").trim() === c).length;
                              return <option key={c} value={c}>{c} ({cnt})</option>;
                            })}
                          </select>
                          {filtroFuncao && (
                            <button onClick={() => setFiltroFuncao("")}
                              className="text-[11px] text-indigo-500 hover:text-indigo-700 underline">
                              limpar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                            <th className="text-left px-2 py-1.5 font-semibold">Função / Cargo</th>
                            <th className="text-center px-2 py-1.5 font-semibold">Qtd</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Sal. Bruto</th>
                            <th className="text-right px-2 py-1.5 font-semibold">HE</th>
                            <th className="text-right px-2 py-1.5 font-semibold">VR/VA</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Férias</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Seg.</th>
                            <th className="text-right px-2 py-1.5 font-semibold">FGTS</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rhPorFuncao.map((g) => (
                            <tr key={g.cargo} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="px-2 py-1.5 font-medium text-gray-800">{g.cargo}</td>
                              <td className="text-center px-2 py-1.5 text-gray-500">{g.qtd}</td>
                              <td className="text-right px-2 py-1.5 text-gray-700">{fmt(g.salarioBruto)}</td>
                              <td className="text-right px-2 py-1.5 text-amber-700">{g.he > 0 ? fmt(g.he) : <span className="text-gray-300">—</span>}</td>
                              <td className="text-right px-2 py-1.5 text-teal-700">{g.va > 0 ? fmt(g.va) : <span className="text-gray-300">—</span>}</td>
                              <td className="text-right px-2 py-1.5 text-orange-700">{g.ferias > 0 ? fmt(g.ferias) : <span className="text-gray-300">—</span>}</td>
                              <td className="text-right px-2 py-1.5 text-rose-700">{g.seguroVida > 0 ? fmt(g.seguroVida) : <span className="text-gray-300">—</span>}</td>
                              <td className="text-right px-2 py-1.5 text-blue-700">{fmt(g.fgts)}</td>
                              <td className="text-right px-2 py-1.5 font-semibold text-indigo-700">{fmt(g.custoTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs text-gray-700">
                            <td className="px-2 py-2 text-[10px] uppercase tracking-wide">
                              {filtroFuncao ? <span className="text-indigo-600">SUBTOTAL — {filtroFuncao}</span> : "TOTAL"}
                            </td>
                            <td className="text-center px-2 py-2 text-gray-500">{rhFuncsFiltrados.length}</td>
                            <td className="text-right px-2 py-2">{fmt(rhResumoFiltrado.salarioBruto)}</td>
                            <td className="text-right px-2 py-2 text-amber-700">{fmt(rhResumoFiltrado.he)}</td>
                            <td className="text-right px-2 py-2 text-teal-700">{fmt(rhResumoFiltrado.va)}</td>
                            <td className="text-right px-2 py-2 text-orange-700">{fmt(rhResumoFiltrado.ferias)}</td>
                            <td className="text-right px-2 py-2 text-rose-700">{fmt(rhResumoFiltrado.seguroVida)}</td>
                            <td className="text-right px-2 py-2 text-blue-700">{fmt(rhResumoFiltrado.fgts)}</td>
                            <td className="text-right px-2 py-2 font-bold text-indigo-700">{fmt(rhResumoFiltrado.custoTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 italic mt-1.5 flex items-center gap-1">
                      <span>🔒</span>
                      Detalhamento individual restrito — valores agrupados por função conforme política de privacidade (LGPD).
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
            );
          })()}
          {/* ── Sub-aba: Banco de Horas ── */}
          {abaRH === "banco" && (
            <div className="space-y-4">
              {/* Seletor de período — regra de ouro PeriodSelectorCard */}
              <PeriodSelectorCard
                ano={bhAno}
                mes={bhMes}
                onAno={setBhAno}
                onMes={setBhMes}
                onAnoTodo={() => setBhMes(null)}
                monthStatus={(analiseBancoHoras.data?.mesesComDados ?? []).reduce(
                  (acc: Record<number,"data"|"none">, m: number) => { acc[m] = "data"; return acc; }, {} as Record<number,"data"|"none">
                )}
              />

              {analiseBancoHoras.isLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />Carregando banco de horas…
                </div>
              ) : !analiseBancoHoras.data || analiseBancoHoras.data.funcionarios.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">
                  Nenhum funcionário desta obra com saldo ou movimento no banco de horas{bhMes ? ` em ${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][bhMes-1]}/${bhAno}` : ` em ${bhAno}`}.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* KPI strip */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: "Funcionários",
                        v: String(analiseBancoHoras.data.resumo.totalFuncionarios),
                        color: "text-indigo-700",
                      },
                      {
                        label: bhMes ? "Movimento no Mês" : "Movimento no Ano",
                        v: (() => {
                          const m = analiseBancoHoras.data!.resumo.totalMovimentoMins;
                          const sign = m >= 0 ? "+" : "−";
                          return `${sign}${(Math.abs(m)/60).toFixed(1)}h`;
                        })(),
                        color: analiseBancoHoras.data.resumo.totalMovimentoMins >= 0 ? "text-blue-700" : "text-green-700",
                      },
                      {
                        label: "Saldo Acumulado",
                        v: (() => {
                          const s = analiseBancoHoras.data!.resumo.totalSaldoMins;
                          const sign = s >= 0 ? "+" : "−";
                          return `${sign}${(Math.abs(s)/60).toFixed(1)}h`;
                        })(),
                        color: analiseBancoHoras.data.resumo.totalSaldoMins > 0 ? "text-orange-700 font-bold" : analiseBancoHoras.data.resumo.totalSaldoMins < 0 ? "text-green-700 font-bold" : "text-gray-400",
                      },
                    ].map((k, i) => (
                      <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                        <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-gray-400 italic bg-blue-50 border border-blue-100 rounded px-2 py-1.5 leading-snug">
                    Saldo acumulado = soma de todos os lançamentos até o fim do período. Positivo = deve horas à empresa; Negativo = empresa deve horas.
                    Filtra funcionários do histórico desta obra (transferências + alocação atual).
                  </p>

                  {/* Tabela por funcionário */}
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                          <th className="text-left px-2 py-1.5 font-semibold">Funcionário</th>
                          <th className="text-right px-2 py-1.5 font-semibold">{bhMes ? "Mov. Mês" : "Mov. Ano"}</th>
                          <th className="text-right px-2 py-1.5 font-semibold">Saldo Acum.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analiseBancoHoras.data.funcionarios.map((f: any) => {
                          const saldo     = Number(f.saldoMinutos);
                          const movimento = Number(f.movimentoMinutos);
                          const saldoH    = (Math.abs(saldo) / 60).toFixed(1);
                          const movH      = (Math.abs(movimento) / 60).toFixed(1);
                          const saldoPos  = saldo >= 0;
                          const movPos    = movimento >= 0;
                          return (
                            <tr key={f.employeeId} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="px-2 py-1.5">
                                <p className="font-medium text-gray-800 leading-tight">{f.nome}</p>
                                <p className="text-[8px] text-gray-500 font-mono leading-tight">{f.matricula ?? "—"}</p>
                                {f.cargo && <p className="text-[8px] text-indigo-500 font-medium leading-tight">{f.cargo}</p>}
                              </td>
                              <td className="text-right px-2 py-1.5">
                                {movimento !== 0 ? (
                                  <span className={`text-xs font-medium ${movPos ? "text-blue-700" : "text-green-700"}`}>
                                    {movPos ? "+" : "−"}{movH}h
                                  </span>
                                ) : <span className="text-gray-300 text-[10px]">—</span>}
                              </td>
                              <td className="text-right px-2 py-1.5">
                                {saldo !== 0 ? (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${saldoPos ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                    {saldoPos ? "+" : "−"}{saldoH}h
                                  </span>
                                ) : <span className="text-gray-300 text-[10px]">Zerado</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs text-gray-700">
                          <td className="px-2 py-2 text-[10px] uppercase tracking-wide">TOTAL OBRA</td>
                          <td className="text-right px-2 py-2">
                            {(() => {
                              const m = analiseBancoHoras.data!.resumo.totalMovimentoMins;
                              return (
                                <span className={m >= 0 ? "text-blue-700" : "text-green-700"}>
                                  {m >= 0 ? "+" : "−"}{(Math.abs(m)/60).toFixed(1)}h
                                </span>
                              );
                            })()}
                          </td>
                          <td className="text-right px-2 py-2">
                            {(() => {
                              const s = analiseBancoHoras.data!.resumo.totalSaldoMins;
                              return (
                                <span className={s > 0 ? "text-orange-700" : s < 0 ? "text-green-700" : "text-gray-400"}>
                                  {s >= 0 ? "+" : "−"}{(Math.abs(s)/60).toFixed(1)}h
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB: SEGURANÇA ════════════ */}
      {tabScore === "seguranca" && (
        <div className="space-y-3">

          {/* ── Seletor de Período (padrão PeriodSelectorCard) ─────────── */}
          <PeriodSelectorCard
            ano={segAno}
            mes={segMes}
            onAno={setSegAno}
            onMes={setSegMes}
            onAnoTodo={() => setSegMes(null)}
            monthStatus={segMonthStatus}
            showLegend
          />

          {analiseSeguranca.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />Carregando dados de segurança…
            </div>
          ) : !analiseSeguranca.data ? (
            <p className="text-xs text-gray-400 py-8 text-center">Sem dados disponíveis.</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const d = analiseSeguranca.data!;
                const r = d.resumo;

                // ── CID lookup ──────────────────────────────────────────────────
                const CID_LOOKUP: Record<string, string> = {
                  "J00":"Resfriado comum","J06":"Inf. resp. superior","J11":"Influenza/gripe",
                  "J20":"Bronquite aguda","J22":"Inf. resp. inferior","J45":"Asma","J40":"Bronquite",
                  "R51":"Cefaleia/enxaqueca","M54":"Dorsalgia/lombar","M79":"Transt. musculares",
                  "M75":"Lesão ombro","M77":"Tendinite","M50":"Lesão cervical",
                  "K30":"Dispepsia","K59":"Alt. intestinal","K21":"Refluxo","K29":"Gastrite",
                  "A09":"Diarreia/gastroenterite","F32":"Episódio depressivo","F41":"Ansiedade",
                  "I10":"Hipertensão","L30":"Dermatose/alergia","R10":"Dor abdominal","R53":"Fadiga",
                  "S":"Lesão/traumatismo","Z":"Consulta preventiva",
                };
                const getCidDesc = (cid: string | null): string => {
                  if (!cid) return "";
                  const c = String(cid).toUpperCase().trim();
                  return CID_LOOKUP[c] || CID_LOOKUP[c.slice(0,3)] || CID_LOOKUP[c[0]] || "";
                };

                // ── Chart data ──────────────────────────────────────────────────
                const chartData = (d.historico ?? []).map((h: any) => {
                  const [y, mm] = String(h.mes ?? "").split("-");
                  return {
                    mesKey      : String(h.mes ?? ""),
                    mes         : `${MESES_BR[parseInt(mm ?? "1") - 1]}/${String(y ?? "").slice(2)}`,
                    atestados   : parseInt(String(h.atestados ?? 0)),
                    dds         : parseInt(String(h.dds ?? 0)),
                    acidentes   : parseInt(String(h.acidentes ?? 0)),
                    dias_ates   : parseInt(String(h.dias_ates ?? 0)),
                    custo_ates  : parseFloat(String(h.custo_ates ?? 0)),
                    epi_unidades: parseInt(String(h.epi_unidades ?? 0)),
                    epi_custo   : parseFloat(String(h.epi_custo ?? 0)),
                  };
                });

                // ── Atestados aggregation ────────────────────────────────────────
                const atEstMap: Record<string, {nome:string;foto:string|null;cargo:string|null;count:number;dias:number;cids:string[]}> = {};
                (d.atestados ?? []).forEach((a: any) => {
                  const k = String(a.funcionario_nome ?? a.funcionarioNome ?? "?");
                  if (!atEstMap[k]) atEstMap[k] = { nome:k, foto:a.foto_url??null, cargo:a.cargo??null, count:0, dias:0, cids:[] };
                  atEstMap[k].count++;
                  atEstMap[k].dias += parseInt(String(a.diasAfastamento ?? 0));
                  if (a.cid) atEstMap[k].cids.push(String(a.cid));
                });
                const topAtestados = Object.values(atEstMap).sort((a,b) => b.count - a.count).slice(0,5);
                const cidMap: Record<string, {cid:string;count:number;dias:number}> = {};
                (d.atestados ?? []).forEach((a: any) => {
                  const c = a.cid ? String(a.cid).toUpperCase().trim().slice(0,3) : "S/CID";
                  if (!cidMap[c]) cidMap[c] = { cid:c, count:0, dias:0 };
                  cidMap[c].count++;
                  cidMap[c].dias += parseInt(String(a.diasAfastamento ?? 0));
                });
                const cidList = Object.values(cidMap).sort((a,b) => b.count - a.count).slice(0,6);

                // ── Comparativo ──────────────────────────────────────────────────
                const curMesKey  = segMes !== null ? `${segAno}-${String(segMes).padStart(2,"0")}` : null;
                const prevDate   = segMes !== null ? new Date(segAno, segMes - 2, 1) : null;
                const prevMesKey = prevDate ? `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}` : null;
                const curH  = curMesKey  ? chartData.find(c => c.mesKey === curMesKey)  : null;
                const prevH = prevMesKey ? chartData.find(c => c.mesKey === prevMesKey) : null;
                const prevLabel = prevMesKey ? `${MESES_BR[parseInt(prevMesKey.split("-")[1])-1]}/${prevMesKey.split("-")[0].slice(2)}` : "—";
                const curLabel  = curMesKey  ? `${MESES_BR[parseInt(curMesKey.split("-")[1])-1]}/${curMesKey.split("-")[0].slice(2)}`  : "—";

                // ── EPI ──────────────────────────────────────────────────────────
                const topEpiFunc  = [...(d.epiPorFuncionario ?? [])].sort((a:any,b:any) => parseFloat(String(b.custo_total??0))-parseFloat(String(a.custo_total??0))).slice(0,5);
                const maxEpiCusto = Math.max(1, ...topEpiFunc.map((e:any)=>parseFloat(String(e.custo_total??0))));
                const epiEstoque  = d.epiEstoque ?? [];
                const estoqueTotal= epiEstoque.reduce((s:number,e:any)=>s+parseInt(String(e.estoque_obra??0)),0);
                const epiCriticos = epiEstoque.filter((e:any)=>parseInt(String(e.estoque_obra??0))===0).length;
                const epiBarData  = (d.epiPorTipo ?? []).slice(0,10).map((ep:any) => ({
                  nome  : String(ep.epi_nome ?? "").slice(0,20),
                  custo : parseFloat(String(ep.custo_total ?? 0)),
                  un    : parseInt(String(ep.total_unidades ?? 0)),
                  classe: ep.classe_abc ?? "C",
                }));

                // ── Compliance ASO ───────────────────────────────────────────────
                const totalClt = r.totalClt ?? 0;
                const asoOkQty = Math.max(0, totalClt - (r.cltSemAso??0) - (r.cltAsoVencido??0));
                const asoPct   = totalClt > 0 ? Math.round((asoOkQty / totalClt) * 100) : 0;

                // ── Expanded chart renderer ───────────────────────────────────────
                const renderBigChart = (key: string, height = 260) => {
                  const configs: Record<string,{label:string;color:string;dataKey:string;isR$?:boolean}> = {
                    dds       : { label:"DDS Realizados",     color:"#16a34a", dataKey:"dds"          },
                    atestados : { label:"Atestados",          color:"#f59e0b", dataKey:"atestados"    },
                    acidentes : { label:"Acidentes",          color:"#dc2626", dataKey:"acidentes"    },
                    dias_ates : { label:"Dias Afastamento",   color:"#9333ea", dataKey:"dias_ates"    },
                    epi_un    : { label:"EPIs Entregues",     color:"#6366f1", dataKey:"epi_unidades" },
                    epi_custo : { label:"Custo EPI",          color:"#a855f7", dataKey:"epi_custo", isR$:true },
                    custo_ates: { label:"Custo Atestados",    color:"#f97316", dataKey:"custo_ates", isR$:true },
                  };
                  const cfg = configs[key]; if (!cfg) return null;
                  return (
                    <ResponsiveContainer width="100%" height={height}>
                      <BarChart data={chartData} barSize={26} margin={{top:8,right:16,left:-4,bottom:20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                        <XAxis dataKey="mes" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} allowDecimals={false}
                          tickFormatter={(v:number)=>v>999?`${(v/1000).toFixed(0)}k`:String(v)}/>
                        <RcTooltip contentStyle={{fontSize:12,borderRadius:8}} formatter={(v:any)=>[cfg.isR$?fmt(Number(v)):v, cfg.label]}/>
                        <Bar dataKey={cfg.dataKey} radius={[5,5,0,0]}>
                          {chartData.map((cd:any,i:number)=><Cell key={i} fill={(cd[cfg.dataKey] as number)>0?cfg.color:"#e5e7eb"}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  );
                };

                return (
                  <>
                    {/* ═══ BLOCO 1: KPI HERO 2×4 ════════════════════════════════ */}
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { label:"Efetivo CLT",   v: r.totalClt??0,          sub:`+${r.totalTerceiros??0} terceiros`,                      icon:"👷",  vc:"text-gray-800",   bc:"bg-white border-gray-200"                                                                  },
                        { label:"Acidentes",     v: r.totalAcidentes??0,    sub:`${r.totalGraves??0} grave(s)`,                           icon:"⚠️", vc:(r.totalAcidentes??0)>0?"text-red-600":"text-gray-400",   bc:(r.totalAcidentes??0)>0?"bg-red-50 border-red-200":"bg-gray-50 border-gray-100"   },
                        { label:"DDS Realizados",v: r.totalDds??0,          sub:"diálogos diários de segurança",                          icon:"📋",  vc:(r.totalDds??0)>0?"text-green-700":"text-gray-400",       bc:(r.totalDds??0)>0?"bg-green-50 border-green-200":"bg-gray-50 border-gray-100"     },
                        { label:"APR / PT",      v:`${r.totalApr??0} / ${r.totalPt??0}`, sub:`${(r.aprAbertas??0)+(r.ptAbertas??0)} ativas`, icon:"🛡️", vc:"text-blue-700",  bc:"bg-blue-50 border-blue-100"                                                                },
                      ] as const).map((k,i) => (
                        <div key={i} className={`rounded-2xl border px-4 py-3 ${k.bc}`}>
                          <div className="flex items-start gap-2.5">
                            <span className="text-2xl mt-0.5">{k.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-3xl font-black leading-none ${k.vc}`}>{k.v}</p>
                              <p className="text-[8px] text-gray-400 mt-1 leading-tight">{k.sub}</p>
                              <p className="text-[10px] font-bold text-gray-500 mt-1">{k.label}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ═══ BLOCO 1b: KPI HERO ROW 2 ═════════════════════════════ */}
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { label:"Atestados",      v: r.totalAtestados??0,         sub:`${r.totalDiasAtestado??0} dias afastamento`,             icon:"🏥",  vc:(r.totalAtestados??0)>0?"text-amber-600":"text-gray-400",   bc:(r.totalAtestados??0)>0?"bg-amber-50 border-amber-200":"bg-gray-50 border-gray-100"   },
                        { label:"Custo Atestados",v: fmt(r.custoTotalAtestados??0),sub:"salário + encargos + benefícios",                          icon:"💰",  vc:"text-orange-700",  bc:"bg-orange-50 border-orange-100"  },
                        { label:"EPIs Entregues", v: r.totalEntregasEpi??0,        sub:`${r.totalUnidadesEpi??0} unidades — ${fmt(r.totalCustoEpi??0)}`, icon:"🦺", vc:"text-indigo-700",  bc:"bg-indigo-50 border-indigo-100"  },
                        { label:"Advertências",   v: r.totalAdvertencias??0,       sub:`${r.terceirosSemDoc??0} terceiros sem documentação`,      icon:"🚨",  vc:(r.totalAdvertencias??0)>0?"text-red-700":"text-gray-400",   bc:(r.totalAdvertencias??0)>0?"bg-red-50 border-red-200":"bg-gray-50 border-gray-100"   },
                      ] as const).map((k,i) => (
                        <div key={i} className={`rounded-2xl border px-4 py-3 ${k.bc}`}>
                          <div className="flex items-start gap-2.5">
                            <span className="text-2xl mt-0.5">{k.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-2xl font-black leading-none ${k.vc}`}>{k.v}</p>
                              <p className="text-[8px] text-gray-400 mt-1 leading-tight">{k.sub}</p>
                              <p className="text-[10px] font-bold text-gray-500 mt-1">{k.label}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ═══ BLOCO 2: COMPLIANCE + TREINAMENTOS + CUSTO ══════════════ */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* ── 2a: Compliance ASO ── */}
                      <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Compliance ASO</p>
                        <div className="flex items-center gap-3">
                          {(() => {
                            const r2=40, cx=50, cy=50, circ=2*Math.PI*r2;
                            const clr=asoPct>=80?"#16a34a":asoPct>=60?"#f59e0b":"#dc2626";
                            const dash=(asoPct/100)*circ;
                            return (
                              <svg width={100} height={100} viewBox="0 0 100 100" className="shrink-0">
                                <circle cx={cx} cy={cy} r={r2} fill="none" stroke="#f3f4f6" strokeWidth={11}/>
                                <circle cx={cx} cy={cy} r={r2} fill="none" stroke={clr} strokeWidth={11}
                                  strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                                  transform={`rotate(-90 ${cx} ${cy})`}/>
                                <text x={cx} y={cy-4} textAnchor="middle" fontSize="20" fontWeight="900" fill={clr}>{asoPct}%</text>
                                <text x={cx} y={cy+12} textAnchor="middle" fontSize="9" fill="#9ca3af">compliance</text>
                              </svg>
                            );
                          })()}
                          <div className="flex-1 space-y-2">
                            {([
                              { label:"ASO Válido",  v:asoOkQty,            clr:"text-green-700", bg:"bg-green-100" },
                              { label:"ASO Vencido", v:r.cltAsoVencido??0,  clr:"text-red-600",   bg:"bg-red-100"   },
                              { label:"Sem ASO",     v:r.cltSemAso??0,      clr:"text-amber-600", bg:"bg-amber-100" },
                            ] as const).map((x,i)=>(
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-[9px] text-gray-500">{x.label}</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${x.bg} ${x.clr}`}>{x.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* ── 2b: Treinamentos por norma ── */}
                      <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Treinamentos por Norma</p>
                        {(d.treinamentosNorma?.length ?? 0) === 0 ? (
                          <p className="text-xs text-gray-300 text-center py-6">Sem dados de treinamentos</p>
                        ) : (
                          <div className="space-y-2.5">
                            {(d.treinamentosNorma ?? []).slice(0,5).map((n:any, i:number) => {
                              const tot = parseInt(String(n.total_funcionarios ?? 0));
                              const val = parseInt(String(n.validos ?? 0));
                              const pct = tot > 0 ? Math.round((val/tot)*100) : 0;
                              const clr = pct>=80?"bg-green-500":pct>=50?"bg-amber-500":"bg-red-500";
                              return (
                                <div key={i}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[9px] text-gray-700 font-medium truncate max-w-[115px]">{n.norma}</span>
                                    <span className="text-[9px] font-bold text-gray-600 shrink-0 ml-1">{val}/{tot}</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-2 rounded-full transition-all ${clr}`} style={{width:`${pct}%`}}/>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* ── 2c: Custo estimado atestados ── */}
                      <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Custo Est. Atestados</p>
                        {(r.totalAtestados??0)===0 ? (
                          <p className="text-xs text-gray-300 text-center py-6">Nenhum atestado no período</p>
                        ) : (
                          <div className="space-y-2">
                            {([
                              { label:"Salário proporcional", v:r.custoSalarioAtestados??0,  clr:"text-amber-700",  bg:"bg-amber-50"  },
                              { label:"+ Encargos (33%)",     v:r.custoEncargosAtestados??0,  clr:"text-orange-700", bg:"bg-orange-50" },
                              { label:"+ Benefícios (VA/VR)",  v:r.custoVrAtestados??0,        clr:"text-yellow-700", bg:"bg-yellow-50" },
                            ] as const).map((x,i)=>(
                              <div key={i} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${x.bg}`}>
                                <span className="text-[8px] text-gray-500">{x.label}</span>
                                <span className={`text-[10px] font-bold ${x.clr}`}>{fmt(x.v)}</span>
                              </div>
                            ))}
                            <div className="border-t-2 border-red-200 pt-2 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-red-700 uppercase">TOTAL</span>
                              <span className="text-base font-black text-red-700">{fmt(r.custoTotalAtestados??0)}</span>
                            </div>
                            <p className="text-[7px] text-gray-400">* (sal.bruto×1,33 + benefícios) ÷ dias do mês × dias empresa (máx. 15)</p>
                            <p className="text-[7px] text-blue-400 font-medium">Lei 8.213/91 art.59 — do 16º dia o custo passa ao INSS</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ═══ BLOCO 3: 6 GRÁFICOS EXPANDÍVEIS ════════════════════════ */}
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { key:"dds",       label:"DDS Realizados",     color:"#16a34a", title:"text-green-700",  head:"bg-green-50",  dataKey:"dds"          },
                        { key:"atestados", label:"Atestados",           color:"#f59e0b", title:"text-amber-700",  head:"bg-amber-50",  dataKey:"atestados"    },
                        { key:"acidentes", label:"Acidentes",           color:"#dc2626", title:"text-red-600",    head:"bg-red-50",    dataKey:"acidentes"    },
                        { key:"dias_ates", label:"Dias Afastamento",    color:"#9333ea", title:"text-purple-700", head:"bg-purple-50", dataKey:"dias_ates"    },
                        { key:"epi_un",    label:"EPIs Entregues/Mês",  color:"#6366f1", title:"text-indigo-700", head:"bg-indigo-50", dataKey:"epi_unidades" },
                        { key:"epi_custo", label:"Custo EPI/Mês (R$)", color:"#a855f7", title:"text-purple-700", head:"bg-purple-50", dataKey:"epi_custo",  isR$:true },
                      ] as const).map(g => (
                        <div key={g.key}
                             className="bg-white border border-gray-100 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all group"
                             onClick={()=>setSstExpandChart(g.key)}>
                          <div className={`flex items-center justify-between px-3 py-2.5 ${g.head}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide ${g.title}`}>{g.label}</p>
                            <Maximize2 className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                          </div>
                          <div className="px-1 pt-1 pb-0.5">
                            <ResponsiveContainer width="100%" height={90}>
                              <BarChart data={chartData} barSize={14} margin={{top:4,right:4,left:-22,bottom:0}}>
                                <XAxis dataKey="mes" tick={{fontSize:7,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                                <YAxis tick={{fontSize:7,fill:"#9ca3af"}} axisLine={false} tickLine={false} allowDecimals={false}
                                  tickFormatter={(v:number)=>v>999?`${(v/1000).toFixed(0)}k`:String(v)}/>
                                <RcTooltip contentStyle={{fontSize:10}} formatter={(v:any)=>[(g as any).isR$?fmt(Number(v)):v, g.label]}/>
                                <Bar dataKey={g.dataKey} radius={[3,3,0,0]}>
                                  {chartData.map((cd:any,i:number)=><Cell key={i} fill={(cd[g.dataKey] as number)>0?g.color:"#e5e7eb"}/>)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-[8px] text-gray-300 px-3 pb-1.5 text-center">clique para expandir</p>
                        </div>
                      ))}
                    </div>

                    {/* Dialog — gráfico expandido */}
                    {sstExpandChart && (
                      <Dialog open onOpenChange={()=>setSstExpandChart(null)}>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>
                              {({dds:"DDS Realizados / Mês",atestados:"Atestados / Mês",acidentes:"Acidentes / Mês",dias_ates:"Dias de Afastamento / Mês",epi_un:"EPIs Entregues / Mês",epi_custo:"Custo EPI / Mês (R$)",custo_ates:"Custo Atestados / Mês"} as Record<string,string>)[sstExpandChart] ?? sstExpandChart}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="pt-2">{renderBigChart(sstExpandChart, 300)}</div>
                        </DialogContent>
                      </Dialog>
                    )}

                    {/* Dialog — foto ampliada do funcionário */}
                    {sstPhotoLightbox && (
                      <Dialog open onOpenChange={()=>setSstPhotoLightbox(null)}>
                        <DialogContent className="max-w-xs p-0 overflow-hidden rounded-2xl">
                          <div className="flex flex-col items-center">
                            {sstPhotoLightbox.url
                              ? <img src={sstPhotoLightbox.url} alt={sstPhotoLightbox.nome} className="w-full aspect-square object-cover"/>
                              : <div className="w-full aspect-square bg-amber-100 flex items-center justify-center">
                                  <span className="text-7xl font-black text-amber-500">{sstPhotoLightbox.initials}</span>
                                </div>}
                            <div className="px-4 py-3 w-full bg-white">
                              <p className="text-sm font-bold text-gray-800 text-center">{sstPhotoLightbox.nome}</p>
                              {!sstPhotoLightbox.url && (
                                <p className="text-[10px] text-gray-400 text-center mt-1">Foto não cadastrada</p>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    {/* ═══ BLOCO 4: COMPARATIVO MÊS ATUAL × MÊS ANTERIOR ══════════ */}
                    {curH && (
                      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-gray-400"/>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Comparativo: {prevLabel} → {curLabel}</p>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-gray-50">
                          {([
                            { label:"DDS",          prev:prevH?.dds??0,          cur:curH.dds,          better:true,  isR$:false },
                            { label:"Atestados",    prev:prevH?.atestados??0,    cur:curH.atestados,    better:false, isR$:false },
                            { label:"Acidentes",    prev:prevH?.acidentes??0,    cur:curH.acidentes,    better:false, isR$:false },
                            { label:"Dias Afast.",  prev:prevH?.dias_ates??0,    cur:curH.dias_ates,    better:false, isR$:false, unit:"d" },
                            { label:"EPIs",         prev:prevH?.epi_unidades??0, cur:curH.epi_unidades, better:true,  isR$:false },
                            { label:"Custo Ates.",  prev:prevH?.custo_ates??0,   cur:curH.custo_ates,   better:false, isR$:true  },
                          ] as const).map((row,i)=>{
                            const diff = (row.cur as number)-(row.prev as number);
                            const up=diff>0, eq=diff===0;
                            const good=eq?null:(up===row.better);
                            const clr=eq?"text-gray-300":good?"text-green-600":"text-red-600";
                            const fv=(v:number)=>row.isR$?fmt(v):`${v}${(row as any).unit??""}`; 
                            return (
                              <div key={i} className="px-3 py-3 text-center">
                                <p className="text-[8px] text-gray-400 uppercase tracking-wide">{row.label}</p>
                                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                                  <span className="text-[9px] text-gray-400">{fv(row.prev as number)}</span>
                                  <span className="text-[9px] text-gray-300">→</span>
                                  <span className="text-[13px] font-black text-gray-800">{fv(row.cur as number)}</span>
                                </div>
                                {!eq && <p className={`text-[9px] font-bold mt-0.5 ${clr}`}>{up?"▲":"▼"} {fv(Math.abs(diff))}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ═══ BLOCO 5: EPI DASHBOARD ══════════════════════════════════ */}
                    {(epiBarData.length>0||epiEstoque.length>0) && (
                      <div className="bg-white rounded-2xl border border-indigo-100 overflow-hidden">
                        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">🦺 EPI — Dashboard Completo</p>
                          <div className="flex items-center gap-2 text-[9px]">
                            {epiCriticos>0 && <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{epiCriticos} sem estoque</span>}
                            <span className="text-gray-400">{estoqueTotal} un. no estoque</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                          {/* Curva ABC horizontal */}
                          <div className="p-4">
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-2">Curva ABC — Custo por Tipo (Top 10)</p>
                            <div className="flex items-center gap-2 mb-2">
                              {[{c:"A",bg:"bg-indigo-500"},{c:"B",bg:"bg-blue-400"},{c:"C",bg:"bg-slate-400"}].map(x=>(
                                <div key={x.c} className="flex items-center gap-1">
                                  <div className={`w-2 h-2 rounded-sm ${x.bg}`}/>
                                  <span className="text-[8px] text-gray-500">Classe {x.c}</span>
                                </div>
                              ))}
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={epiBarData} layout="vertical" barSize={12} margin={{top:0,right:40,left:0,bottom:0}}>
                                <XAxis type="number" tick={{fontSize:7,fill:"#9ca3af"}} axisLine={false} tickLine={false}
                                  tickFormatter={(v:number)=>v>999?`R$${(v/1000).toFixed(0)}k`:`R$${v}`}/>
                                <YAxis type="category" dataKey="nome" tick={{fontSize:8,fill:"#6b7280"}} axisLine={false} tickLine={false} width={95}/>
                                <RcTooltip contentStyle={{fontSize:10,borderRadius:8}} formatter={(v:any,_:any,p:any)=>[`${fmt(Number(v))} — ${p.payload.un} un.`,"Custo"]}/>
                                <Bar dataKey="custo" radius={[0,4,4,0]}>
                                  {epiBarData.map((ep,i)=>(
                                    <Cell key={i} fill={ep.classe==="A"?"#6366f1":ep.classe==="B"?"#60a5fa":"#94a3b8"}/>
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Top 5 maior uso + estoque */}
                          <div className="p-4 space-y-4">
                            {topEpiFunc.length>0 && (
                              <div>
                                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wide mb-2">🏆 Top 5 — Maior Custo EPI</p>
                                <div className="space-y-2">
                                  {topEpiFunc.map((e:any,i:number)=>{
                                    const nome=String(e.funcionario_nome??e.nome??"?");
                                    const initials=nome.split(" ").filter(Boolean).slice(0,2).map((n:string)=>n[0]).join("");
                                    const custo=parseFloat(String(e.custo_total??0));
                                    const pct=maxEpiCusto>0?(custo/maxEpiCusto)*100:0;
                                    return (
                                      <div key={i} className="flex items-center gap-2">
                                        {e.foto_url?(<img src={e.foto_url} alt={nome} className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-indigo-200"/>)
                                          :(<div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[7px] font-bold flex items-center justify-center shrink-0">{initials}</div>)}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[9px] font-semibold text-gray-700 truncate">{nome.split(" ").slice(0,2).join(" ")}</p>
                                          <div className="h-1.5 bg-gray-100 rounded-full mt-0.5">
                                            <div className="h-1.5 bg-indigo-400 rounded-full" style={{width:`${pct}%`}}/>
                                          </div>
                                        </div>
                                        <span className="text-[9px] font-bold text-indigo-700 shrink-0">{fmt(custo)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {epiEstoque.length>0 && (
                              <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Estoque nesta Obra</p>
                                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                  {epiEstoque.map((ep:any,i:number)=>{
                                    const qtd=parseInt(String(ep.estoque_obra??0));
                                    const central=parseInt(String(ep.estoque_central??0));
                                    return (
                                      <div key={i} className={`flex items-center justify-between text-[9px] px-2 py-1 rounded-lg ${qtd===0?"bg-red-50":"bg-gray-50"}`}>
                                        <span className={`truncate max-w-[120px] font-medium ${qtd===0?"text-red-700":"text-gray-700"}`}>{ep.nome}</span>
                                        <div className="text-right shrink-0 ml-1">
                                          <span className={`font-bold ${qtd===0?"text-red-600":"text-indigo-700"}`}>{qtd} un.</span>
                                          {central>0&&<span className="text-gray-400 ml-1">+{central}C</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ═══ BLOCO 6: ACIDENTES ══════════════════════════════════════ */}
                    {d.acidentes.length>0 && (
                      <div className="rounded-2xl border-2 border-red-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-red-50 hover:bg-red-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("acidentes")?n.delete("acidentes"):n.add("acidentes");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-red-600"/>
                            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide">Acidentes / Incidentes</p>
                            <span className="bg-red-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.acidentes.length}</span>
                            {(r.totalGraves??0)>0&&<span className="bg-red-100 text-red-700 text-[9px] font-bold px-2 py-0.5 rounded-full">{r.totalGraves} grave(s)</span>}
                          </div>
                          {sstOpenSections.has("acidentes")?<ChevronUp className="w-4 h-4 text-red-500"/>:<ChevronDown className="w-4 h-4 text-red-400"/>}
                        </button>
                        {sstOpenSections.has("acidentes")&&(
                          <div className="p-4 space-y-2">
                            {d.acidentes.map((a:any,i:number)=>{
                              const grave=a.gravidade==="Grave"||a.gravidade==="Com Afastamento";
                              const acNome=String(a.funcionario_nome??"?");
                              const acInitials=acNome.split(" ").filter(Boolean).slice(0,2).map((n:string)=>n[0]).join("");
                              return (
                                <div key={i} className={`rounded-xl border px-3 py-2.5 text-[10px] ${grave?"border-red-300 bg-red-50":"border-orange-200 bg-orange-50"}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                      {a.foto_url
                                        ?<img src={a.foto_url} alt={acNome} className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm mt-0.5"/>
                                        :<div className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${grave?"bg-red-200 text-red-700":"bg-orange-200 text-orange-700"}`}>{acInitials}</div>}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`font-bold text-sm ${grave?"text-red-600":"text-orange-600"}`}>{a.gravidade}</span>
                                          {parseInt(String(a.diasAfastamento??0))>0&&<span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 rounded">{a.diasAfastamento}d afastamento</span>}
                                        </div>
                                        <p className="font-semibold text-gray-800 mt-0.5 text-[11px]">{acNome}</p>
                                        <div className="flex gap-2 text-gray-500 mt-0.5 flex-wrap text-[9px]">
                                          {a.tipoAcidente&&<span>{a.tipoAcidente}</span>}
                                          {a.localAcidente&&<span>· {a.localAcidente}</span>}
                                          <span className={a.status_acao==="Concluída"?"text-green-600":"text-amber-600"}>· Ação: {a.status_acao??"Pendente"}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <span className="text-gray-400 shrink-0 text-[9px]">{fDate(a.dataAcidente)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ═══ BLOCO 7: ATESTADOS ══════════════════════════════════════ */}
                    {d.atestados.length>0 && (
                      <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-amber-50 hover:bg-amber-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("atestados")?n.delete("atestados"):n.add("atestados");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <Heart className="w-4 h-4 text-amber-600"/>
                            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Atestados Médicos</p>
                            <span className="bg-amber-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.atestados.length}</span>
                            <span className="text-[9px] text-amber-600 font-medium">{r.totalDiasAtestado??0}d afastamento · {fmt(r.custoTotalAtestados??0)}</span>
                          </div>
                          {sstOpenSections.has("atestados")?<ChevronUp className="w-4 h-4 text-amber-500"/>:<ChevronDown className="w-4 h-4 text-amber-400"/>}
                        </button>
                        {sstOpenSections.has("atestados")&&(
                          <div className="p-4 space-y-3">
                            {topAtestados.length>0&&(
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide mb-2">🏥 Top 5 — Mais Atestados</p>
                                  <div className="space-y-2">
                                    {topAtestados.map((p,i)=>{
                                      const initials=p.nome.split(" ").filter(Boolean).slice(0,2).map(n=>n[0]).join("");
                                      return (
                                        <div key={i} className="flex items-center gap-2">
                                          <span className="text-[8px] font-bold text-amber-300 w-3 shrink-0">{i+1}</span>
                                          <button
                                            type="button"
                                            title="Clique para ampliar a foto"
                                            onClick={()=>setSstPhotoLightbox({url:p.foto??null,nome:p.nome,initials})}
                                            className="shrink-0 focus:outline-none hover:ring-2 hover:ring-amber-400 rounded-full transition-all"
                                          >
                                            {p.foto
                                              ?<img src={p.foto} alt={p.nome} className="w-7 h-7 rounded-full object-cover ring-2 ring-amber-200"/>
                                              :<div className="w-7 h-7 rounded-full bg-amber-200 text-amber-700 text-[9px] font-bold flex items-center justify-center">{initials}</div>}
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-semibold text-gray-800 truncate">{p.nome.split(" ").slice(0,2).join(" ")}</p>
                                            <div className="flex gap-0.5 flex-wrap">
                                              {[...new Set(p.cids)].slice(0,2).map((cid,ci)=>(
                                                <span key={ci} className="text-[7px] bg-amber-100 text-amber-700 px-1 rounded font-mono" title={getCidDesc(cid)}>{cid}</span>
                                              ))}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className="text-[11px] font-bold text-amber-700">{p.count}×</p>
                                            {p.dias>0&&<p className="text-[8px] text-gray-400">{p.dias}d</p>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide mb-2">CID — Causas de Afastamento</p>
                                  <div className="space-y-1.5">
                                    {cidList.map((c,i)=>{
                                      const desc=getCidDesc(c.cid);
                                      const maxC=Math.max(1,...cidList.map(cc=>cc.count));
                                      const pct=(c.count/maxC)*100;
                                      return (
                                        <div key={i} className="flex items-center gap-2">
                                          <span className="text-[8px] font-bold font-mono text-amber-700 w-9 shrink-0">{c.cid}</span>
                                          <div className="flex-1">
                                            <p className="text-[7px] text-gray-500 truncate">{desc||"—"}</p>
                                            <div className="h-1.5 bg-amber-100 rounded-full">
                                              <div className="h-1.5 bg-amber-400 rounded-full" style={{width:`${pct}%`}}/>
                                            </div>
                                          </div>
                                          <span className="text-[9px] font-bold text-amber-700 shrink-0">{c.count}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="rounded-xl border border-amber-100 overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead className="bg-amber-50">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Funcionário</th>
                                    <th className="text-left px-1.5 py-1.5 text-gray-500 font-semibold w-14">CID</th>
                                    <th className="text-center px-1.5 py-1.5 text-gray-500 font-semibold w-16">Data</th>
                                    <th className="text-center px-1.5 py-1.5 text-gray-500 font-semibold w-10">Dias</th>
                                    <th className="text-right px-1.5 py-1.5 text-amber-700 font-bold w-22">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.atestados.map((a:any,i:number)=>{
                                    const dias=parseInt(String(a.diasAfastamento??0));
                                    const diasInss=parseInt(String(a.dias_inss??0));
                                    const diasEmpresa=parseInt(String(a.dias_empresa??Math.min(dias,15)));
                                    const cTotal=parseFloat(String(a.custo_total??0));
                                    const horas=parseFloat(String(a.horas_afastamento??0));
                                    const custoHoras=parseFloat(String(a.custo_horas??0));
                                    const isHoras=dias===0&&horas>0;
                                    const nome=String(a.funcionario_nome??"").split(" ").slice(0,2).join(" ");
                                    const initials=String(a.funcionario_nome??"?").split(" ").filter(Boolean).slice(0,2).map((n:string)=>n[0]).join("");
                                    const isInss=diasInss>0;
                                    return (
                                      <tr key={i} className={`border-t border-amber-100 hover:bg-amber-50/40${isInss?" bg-blue-50/30":""}`}>
                                        <td className="px-2 py-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              title="Clique para ampliar a foto"
                                              onClick={()=>setSstPhotoLightbox({url:a.foto_url??null,nome:String(a.funcionario_nome??""),initials})}
                                              className="shrink-0 focus:outline-none hover:ring-2 hover:ring-amber-300 rounded-full transition-all"
                                            >
                                              {a.foto_url
                                                ?<img src={a.foto_url} alt={nome} className="w-6 h-6 rounded-full object-cover"/>
                                                :<div className="w-6 h-6 rounded-full bg-amber-200 text-amber-700 text-[8px] font-bold flex items-center justify-center">{initials}</div>}
                                            </button>
                                            <div className="flex items-center gap-1 min-w-0">
                                              <p className="font-medium text-gray-800 truncate">{nome}</p>
                                              {isInss&&<span className="shrink-0 text-[7px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-1 py-0.5 rounded" title="A partir do 16º dia o custo passa ao INSS (art. 59 Lei 8.213/91)">INSS</span>}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-1.5 py-1.5">{a.cid?<span className="font-mono text-[8px] text-amber-700 bg-amber-100 px-1 py-0.5 rounded" title={getCidDesc(a.cid)}>{String(a.cid).toUpperCase()}</span>:<span className="text-gray-300">—</span>}</td>
                                        <td className="px-1.5 py-1.5 text-center text-gray-400">{fDate(a.dataEmissao??a.dataemissao)}</td>
                                        <td className="px-1.5 py-1.5 text-center">
                                          {dias>0?(
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span className="text-amber-600 font-bold">{dias}</span>
                                              {isInss&&(
                                                <div className="flex flex-col items-center gap-0.5">
                                                  <span className="text-[7px] text-amber-600 leading-none">{diasEmpresa}d emp.</span>
                                                  <span className="text-[7px] font-bold text-blue-600 bg-blue-50 px-1 rounded leading-none">{diasInss}d INSS</span>
                                                </div>
                                              )}
                                            </div>
                                          ):isHoras?(
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span className="text-teal-700 font-bold bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded text-[9px]" title="Atestado em horas — custo calculado proporcionalmente">{horas}h</span>
                                              <span className="text-[7px] text-teal-500 leading-none">proporcional</span>
                                            </div>
                                          ):<span className="text-gray-300 cursor-help" title="Horas não informadas no registro">—</span>}
                                        </td>
                                        <td className="px-1.5 py-1.5 text-right">
                                          {cTotal>0?(
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-bold text-amber-700">{fmt(cTotal)}</span>
                                              {isInss&&<span className="text-[7px] text-blue-500 leading-none">só empresa</span>}
                                            </div>
                                          ):isHoras&&custoHoras>0?(
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="font-bold text-teal-700">{fmt(custoHoras)}</span>
                                              <span className="text-[7px] text-teal-500 leading-none">{horas}h × valor/h</span>
                                            </div>
                                          ):<span className="text-gray-300">—</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                {d.atestados.length>1&&(
                                  <tfoot className="bg-amber-100">
                                    <tr>
                                      <td colSpan={3} className="px-2 py-1.5 font-bold text-amber-800 text-[9px] uppercase">Total {d.atestados.length} atestados · {r.totalDiasAtestado??0}d</td>
                                      <td></td>
                                      <td className="px-1.5 py-1.5 text-right font-bold text-amber-800">{fmt(r.custoTotalAtestados??0)}</td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ═══ BLOCO 8: ADVERTÊNCIAS ═══════════════════════════════════ */}
                    {(d.advertencias.length+d.advertenciasTerceiros.length)>0&&(
                      <div className="rounded-2xl border border-red-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-red-50 hover:bg-red-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("adv")?n.delete("adv"):n.add("adv");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-red-500"/>
                            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide">Advertências</p>
                            <span className="bg-red-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{r.totalAdvertencias??0}</span>
                          </div>
                          {sstOpenSections.has("adv")?<ChevronUp className="w-4 h-4 text-red-400"/>:<ChevronDown className="w-4 h-4 text-red-300"/>}
                        </button>
                        {sstOpenSections.has("adv")&&(
                          <div className="p-4 space-y-1.5 max-h-72 overflow-y-auto">
                            {[...d.advertencias.map((w:any)=>({...w,_tipo:"clt"})),...d.advertenciasTerceiros.map((w:any)=>({...w,_tipo:"terceiro"}))]
                              .sort((a:any,b:any)=>(b.data_ocorrencia??"").localeCompare(a.data_ocorrencia??""))
                              .map((w:any,i:number)=>(
                                <div key={i} className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-[10px]">
                                  {(() => {
                                    const wNome=String(w.funcionario_nome??"?");
                                    const wInit=wNome.split(" ").filter(Boolean).slice(0,2).map((n:string)=>n[0]).join("");
                                    return w.foto_url
                                      ?<img src={w.foto_url} alt={wNome} className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-red-200 mt-0.5"/>
                                      :<div className="w-7 h-7 rounded-full bg-red-200 text-red-700 text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5">{wInit}</div>;
                                  })()}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-red-700">{w.tipo_advertencia}</span>
                                      <span className="text-gray-700 break-words">· {w.funcionario_nome}</span>
                                      {w._tipo==="terceiro"&&w.empresa_nome&&<span className="text-gray-400">({w.empresa_nome})</span>}
                                    </div>
                                    {w.motivo&&<p className="text-gray-500 mt-0.5 break-words">{w.motivo}</p>}
                                  </div>
                                  <span className="text-gray-400 shrink-0">{fDate(w.data_ocorrencia)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ═══ BLOCO 9: DDS ════════════════════════════════════════════ */}
                    {d.dds.length>0&&(
                      <div className="rounded-2xl border border-green-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-green-50 hover:bg-green-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("dds")?n.delete("dds"):n.add("dds");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <ClipboardCheck className="w-4 h-4 text-green-600"/>
                            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide">DDS — Diálogo Diário de Segurança</p>
                            <span className="bg-green-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.dds.length}</span>
                          </div>
                          {sstOpenSections.has("dds")?<ChevronUp className="w-4 h-4 text-green-500"/>:<ChevronDown className="w-4 h-4 text-green-400"/>}
                        </button>
                        {sstOpenSections.has("dds")&&(
                          <table className="w-full text-[10px]">
                            <thead className="bg-green-50 border-t border-green-100">
                              <tr>
                                <th className="text-left px-3 py-1.5 text-gray-500 font-semibold">Tema</th>
                                <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-24">Instrutor</th>
                                <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-20">Data</th>
                                <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-18">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.dds.slice(0,20).map((dd:any,i:number)=>(
                                <tr key={i} className="border-t border-green-50">
                                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]">{dd.titulo_tema??"—"}</td>
                                  <td className="px-2 py-1.5 text-gray-400 truncate">{dd.instrutor??"—"}</td>
                                  <td className="px-2 py-1.5 text-center text-gray-400">{fDate(dd.data)}</td>
                                  <td className="px-2 py-1.5 text-center">
                                    <span className={`font-semibold ${dd.status==="finalizada"?"text-green-600":"text-amber-600"}`}>{dd.status==="finalizada"?"✓ Final.":dd.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* ═══ BLOCO 10: APR + PT ══════════════════════════════════════ */}
                    {(d.apr.length>0||d.pt.length>0)&&(
                      <div className="rounded-2xl border border-blue-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-blue-50 hover:bg-blue-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("apr")?n.delete("apr"):n.add("apr");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <Shield className="w-4 h-4 text-blue-600"/>
                            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">APR / PT — Análise de Risco e Permissão de Trabalho</p>
                            <span className="bg-blue-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.apr.length+d.pt.length}</span>
                            {((r.aprAbertas??0)+(r.ptAbertas??0))>0&&<span className="bg-blue-100 text-blue-700 text-[9px] font-semibold px-2 py-0.5 rounded-full">{(r.aprAbertas??0)+(r.ptAbertas??0)} ativas</span>}
                          </div>
                          {sstOpenSections.has("apr")?<ChevronUp className="w-4 h-4 text-blue-500"/>:<ChevronDown className="w-4 h-4 text-blue-400"/>}
                        </button>
                        {sstOpenSections.has("apr")&&(
                          <div className="p-4 space-y-3">
                            {d.apr.length>0&&(
                              <>
                                <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">APR — {d.apr.length} registros</p>
                                <div className="rounded-xl border border-blue-100 overflow-hidden">
                                  <table className="w-full text-[10px]">
                                    <thead className="bg-blue-50"><tr>
                                      <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Atividade</th>
                                      <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-24">Responsável</th>
                                      <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-20">Data</th>
                                      <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-16">Status</th>
                                    </tr></thead>
                                    <tbody>
                                      {d.apr.slice(0,12).map((a:any,i:number)=>(
                                        <tr key={i} className="border-t border-blue-50">
                                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[140px]">{a.atividade??a.numero??"—"}</td>
                                          <td className="px-2 py-1.5 text-gray-400 truncate">{a.responsavel_nome??"—"}</td>
                                          <td className="px-2 py-1.5 text-center text-gray-400">{fDate(a.data_emissao)}</td>
                                          <td className="px-2 py-1.5 text-center"><span className={`font-semibold capitalize ${a.status==="aprovada"||a.status==="aberta"?"text-blue-600":a.status==="fechada"?"text-green-600":"text-gray-400"}`}>{a.status}</span></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                            {d.pt.length>0&&(
                              <>
                                <p className="text-[9px] font-bold text-purple-700 uppercase tracking-wide">PT — {d.pt.length} registros</p>
                                <div className="rounded-xl border border-purple-100 overflow-hidden">
                                  <table className="w-full text-[10px]">
                                    <thead className="bg-purple-50"><tr>
                                      <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Descrição</th>
                                      <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-24">Responsável</th>
                                      <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-20">Data</th>
                                      <th className="text-center px-2 py-1.5 text-gray-500 font-semibold w-16">Status</th>
                                    </tr></thead>
                                    <tbody>
                                      {d.pt.slice(0,12).map((p:any,i:number)=>(
                                        <tr key={i} className="border-t border-purple-50">
                                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[140px]">{p.descricao_trabalho??p.numero??"—"}</td>
                                          <td className="px-2 py-1.5 text-gray-400 truncate">{p.responsavel_nome??"—"}</td>
                                          <td className="px-2 py-1.5 text-center text-gray-400">{fDate(p.data_emissao)}</td>
                                          <td className="px-2 py-1.5 text-center"><span className={`font-semibold capitalize ${p.status==="aprovada"||p.status==="aberta"?"text-purple-600":p.status==="fechada"?"text-green-600":"text-gray-400"}`}>{p.status}</span></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ═══ BLOCO 11: EQUIPE CLT ════════════════════════════════════ */}
                    {d.clt.length>0&&(()=>{
                      const statusInfo=(st:string)=>{
                        switch(st){
                          case "Ativo":       return {label:"Ativo",        bg:"bg-green-100",  text:"text-green-700",  cardBg:"bg-white border-gray-100",      opacity:""};
                          case "Ferias":
                          case "Férias":      return {label:"De Férias",    bg:"bg-blue-100",   text:"text-blue-700",   cardBg:"bg-blue-50 border-blue-200",    opacity:""};
                          case "Afastado":    return {label:"Afastado",     bg:"bg-purple-100", text:"text-purple-700", cardBg:"bg-purple-50 border-purple-200",opacity:""};
                          case "Aviso":       return {label:"Aviso Prévio", bg:"bg-orange-100", text:"text-orange-700", cardBg:"bg-orange-50 border-orange-200",opacity:""};
                          case "Desligado":   return {label:"Desligado",    bg:"bg-red-100",    text:"text-red-600",    cardBg:"bg-gray-50 border-gray-200",    opacity:"opacity-60"};
                          case "Inativo":     return {label:"Inativo",      bg:"bg-gray-100",   text:"text-gray-500",   cardBg:"bg-gray-50 border-gray-100",    opacity:"opacity-50"};
                          case "Lista_Negra": return {label:"Lista Negra",  bg:"bg-red-200",    text:"text-red-800",    cardBg:"bg-red-50 border-red-200",      opacity:"opacity-50"};
                          default:            return {label:st,             bg:"bg-gray-100",   text:"text-gray-500",   cardBg:"bg-white border-gray-100",      opacity:""};
                        }
                      };
                      const ativoC    =d.clt.filter((x:any)=>x.status==="Ativo").length;
                      const feriasC   =d.clt.filter((x:any)=>x.status==="Ferias"||x.status==="Férias").length;
                      const desligC   =d.clt.filter((x:any)=>["Desligado","Inativo","Lista_Negra"].includes(x.status??"")).length;
                      return (
                        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                          <button className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                            onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("equipe")?n.delete("equipe"):n.add("equipe");return n;})}>
                            <div className="flex items-center gap-2.5">
                              <UserCheck className="w-4 h-4 text-gray-500"/>
                              <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Equipe CLT — Histórico da Obra</p>
                              <span className="bg-gray-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.clt.length}</span>
                              {ativoC>0&&<span className="text-[9px] text-green-600 font-semibold">{ativoC} ativos</span>}
                              {feriasC>0&&<span className="text-[9px] text-blue-600 font-semibold">{feriasC} férias</span>}
                              {desligC>0&&<span className="text-[9px] text-red-500 font-semibold">{desligC} deslig.</span>}
                            </div>
                            {sstOpenSections.has("equipe")?<ChevronUp className="w-4 h-4 text-gray-400"/>:<ChevronDown className="w-4 h-4 text-gray-400"/>}
                          </button>
                          {sstOpenSections.has("equipe")&&(
                            <div className="p-3 grid grid-cols-3 gap-1.5">
                              {d.clt.map((e:any,i:number)=>{
                                const st=statusInfo(e.status??"Ativo");
                                const asoOk2=e.aso_status==="valido";
                                const asoVenc2=e.aso_status==="vencido";
                                const adv2=parseInt(String(e.num_advertencias??0));
                                const prNome=String(e.nome??"").split(" ").slice(0,2).join(" ");
                                const sobrenome=String(e.nome??"").split(" ").slice(2).join(" ");
                                const initials=String(e.nome??"?").split(" ").filter(Boolean).slice(0,2).map((n:string)=>n[0]).join("");
                                const isDes=["Desligado","Inativo","Lista_Negra"].includes(e.status??"");
                                return (
                                  <div key={i} className={`flex items-start gap-2 rounded-xl border px-2 py-2 ${st.cardBg} ${st.opacity}`}>
                                    <div className="shrink-0">
                                      {e.foto_url?(<img src={e.foto_url} alt={prNome} className={`w-8 h-8 rounded-full object-cover ring-2 ${isDes?"ring-red-300 grayscale":asoOk2?"ring-green-300":asoVenc2?"ring-amber-300":"ring-gray-200"}`}/>)
                                        :(<div className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ${isDes?"bg-gray-300 text-gray-500 ring-red-200 grayscale":adv2>0?"bg-red-200 text-red-700 ring-red-300":!asoOk2?"bg-amber-200 text-amber-700 ring-amber-300":"bg-indigo-100 text-indigo-700 ring-indigo-200"}`}>{initials}</div>)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-[9px] font-bold leading-tight truncate ${isDes?"text-gray-400 line-through":"text-gray-800"}`}>{prNome}</p>
                                      {sobrenome&&<p className={`text-[7px] leading-tight truncate ${isDes?"text-gray-300":"text-gray-400"}`}>{sobrenome}</p>}
                                      {e.cargo&&<p className="text-[7px] text-gray-400 leading-tight truncate">{e.cargo}</p>}
                                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                                        <span className={`text-[6px] px-1 py-0.5 rounded font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                                        {e.periodo_experiencia==="exp1"&&<span className="text-[6px] px-1 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700">Exp.1º</span>}
                                        {e.periodo_experiencia==="exp2"&&<span className="text-[6px] px-1 py-0.5 rounded font-bold bg-amber-100 text-amber-700">Exp.2º</span>}
                                        {e.cargo_cipa&&<span className="text-[6px] px-1 py-0.5 rounded font-bold bg-indigo-100 text-indigo-700">CIPA</span>}
                                        <span className={`text-[6px] px-1 py-0.5 rounded font-bold ${asoOk2?"bg-green-100 text-green-700":asoVenc2?"bg-red-100 text-red-600":"bg-gray-100 text-gray-400"}`}>{asoOk2?"ASO✓":asoVenc2?"ASO!":"S/ASO"}</span>
                                        {adv2>0&&<span className="text-[6px] px-1 py-0.5 rounded font-bold bg-red-100 text-red-700">{adv2}adv</span>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ═══ BLOCO 12: TERCEIROS ═════════════════════════════════════ */}
                    {d.terceiros.length>0&&(
                      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                        <button className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                          onClick={()=>setSstOpenSections(s=>{const n=new Set(s);n.has("terceiros")?n.delete("terceiros"):n.add("terceiros");return n;})}>
                          <div className="flex items-center gap-2.5">
                            <HardHat className="w-4 h-4 text-gray-500"/>
                            <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Terceiros</p>
                            <span className="bg-gray-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{d.terceiros.length}</span>
                            {(r.terceirosSemDoc??0)>0&&<span className="bg-amber-100 text-amber-700 text-[9px] font-semibold px-2 py-0.5 rounded-full">{r.terceirosSemDoc} sem doc</span>}
                          </div>
                          {sstOpenSections.has("terceiros")?<ChevronUp className="w-4 h-4 text-gray-400"/>:<ChevronDown className="w-4 h-4 text-gray-400"/>}
                        </button>
                        {sstOpenSections.has("terceiros")&&(
                          <div className="p-3 space-y-1.5">
                            {d.terceiros.map((t:any,i:number)=>{
                              const docs=parseInt(String(t.docs_preenchidos??0));
                              const adv=parseInt(String(t.num_advertencias??0));
                              return (
                                <div key={i} className={`rounded-xl border px-3 py-2 text-[10px] flex items-center gap-2 ${docs===0?"border-amber-200 bg-amber-50":adv>0?"border-red-200 bg-red-50":"border-gray-100 bg-gray-50"}`}>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-800">{t.nome}</span>
                                    {t.empresa_nome&&<span className="text-gray-400 ml-1.5">· {t.empresa_nome}</span>}
                                  </div>
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${t.aso_status==="valido"?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>ASO {t.aso_status==="valido"?"✓":"!"}</span>
                                  {docs===0?<span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">Sem docs</span>:<span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">{docs} doc</span>}
                                  {adv>0&&<span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full shrink-0">{adv} adv</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {d.clt.length===0&&d.terceiros.length===0&&(
                      <p className="text-xs text-gray-400 text-center py-8">Nenhum colaborador cadastrado nesta obra.</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB: COMPRAS ════════════ */}
      {tabScore === "compras" && (
        <div className="space-y-4">
          {/* Sub-abas */}
          <div className="flex gap-1 border-b border-gray-100 pb-0">
            {(["compras", "ferramentas", "locacoes"] as const).map(aba => (
              <button key={aba} onClick={() => setAbaAnalise(aba)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${abaAnalise === aba ? "border-violet-500 text-violet-700 bg-violet-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {aba === "compras" ? "📦 Compras" : aba === "ferramentas" ? "🔧 Equip. Próprios" : "🔑 Locações"}
              </button>
            ))}
          </div>

          {analise.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />Carregando análise de compras…
            </div>
          ) : !analise.data ? (
            <p className="text-xs text-gray-400 py-8 text-center">Sem dados disponíveis.</p>
          ) : (
            <>
              {/* ─── Sub-aba: Compras ─── */}
              {abaAnalise === "compras" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Gasto em Compras",    v: fmt(analise.data.resumo.totalGastoCompras),    color: "text-gray-800" },
                      { label: "OC sem entrada almox", v: String(analise.data.resumo.alertasDesvio),    color: analise.data.resumo.alertasDesvio > 0    ? "text-red-600 font-bold"   : "text-gray-500" },
                      { label: "Alertas Recompra",     v: String(analise.data.resumo.alertasRecorrencia),color: analise.data.resumo.alertasRecorrencia > 0 ? "text-amber-700 font-bold" : "text-gray-500" },
                    ].map((k, i) => (
                      <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                        <p className={`text-sm font-bold ${k.color}`}>{k.v}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{k.label}</p>
                      </div>
                    ))}
                  </div>
                  {analise.data.mensal.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Gastos por mês</p>
                      <div className="space-y-1">
                        {(() => {
                          const maxV = Math.max(...analise.data!.mensal.map((m: any) => parseFloat(String(m.total_compras ?? 0))));
                          return analise.data!.mensal.map((m: any, i: number) => {
                            const v = parseFloat(String(m.total_compras ?? 0));
                            const pct = maxV > 0 ? (v / maxV) * 100 : 0;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-14 text-right text-gray-500 shrink-0">{m.mes}</span>
                                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                                  <div className="h-full bg-violet-400 rounded transition-all flex items-center pl-1.5" style={{ width: `${pct}%` }}>
                                    {pct > 20 && <span className="text-white text-[9px] font-semibold truncate">{fmt(v)}</span>}
                                  </div>
                                </div>
                                {pct <= 20 && <span className="text-gray-600 shrink-0 text-[10px]">{fmt(v)}</span>}
                                <span className="text-gray-400 shrink-0 text-[10px]">{m.num_ocs} OC(s)</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                  {analise.data.recorrencia.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />Alertas de Recompra Excessiva (≥3 OCs/mês)
                      </p>
                      <div className="space-y-1">
                        {analise.data.recorrencia.map((r: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 rounded bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-xs">
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="flex-1 text-gray-700 truncate font-medium">{r.item}</span>
                            <span className="text-amber-700 shrink-0 font-bold">{r.num_ocs}× em {r.mes}</span>
                            <span className="text-gray-400 shrink-0">{fmt(parseFloat(String(r.total_mes)))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {analise.data.ocsSemAlmox.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />OCs entregues sem entrada no almox
                      </p>
                      <div className="space-y-1">
                        {analise.data.ocsSemAlmox.map((oc: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 rounded bg-red-50 border border-red-100 px-2.5 py-1.5 text-xs">
                            <span className="text-red-700 font-mono font-bold shrink-0">{oc.numero_oc}</span>
                            <span className="flex-1 text-gray-600 truncate">{oc.fornecedor_nome ?? "—"}</span>
                            <span className="text-gray-400 text-[10px] shrink-0">{oc.num_itens} iten(s)</span>
                            <span className="text-red-700 font-semibold shrink-0">{fmt(parseFloat(String(oc.total ?? 0)))}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-red-600 mt-1">⚠ Material entregue diretamente ao campo sem passar pelo almox — risco de desvio.</p>
                    </div>
                  )}
                  {analise.data.curvaMat.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Curva ABC de Materiais</p>
                      <div className="rounded border border-gray-100 overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-2 py-1.5 text-gray-500 font-semibold w-6">Cl.</th>
                              <th className="text-left px-2 py-1.5 text-gray-500 font-semibold">Item</th>
                              <th className="text-right px-2 py-1.5 text-gray-500 font-semibold">Valor</th>
                              <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">%</th>
                              <th className="text-right px-2 py-1.5 text-gray-500 font-semibold w-10">OCs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analise.data.curvaMat.map((m: any, i: number) => (
                              <tr key={i} className="border-t border-gray-50">
                                <td className="px-2 py-1"><span className={`font-bold text-xs ${m.classe_abc === "A" ? "text-green-600" : m.classe_abc === "B" ? "text-blue-600" : "text-gray-400"}`}>{m.classe_abc}</span></td>
                                <td className="px-2 py-1 text-gray-700 max-w-[140px] truncate">{m.item}</td>
                                <td className="px-2 py-1 text-right font-semibold text-gray-700">{fmt(parseFloat(String(m.total_valor)))}</td>
                                <td className="px-2 py-1 text-right text-gray-400">{m.pct}%</td>
                                <td className="px-2 py-1 text-right text-gray-400">{m.num_ocs}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        <span className="text-green-600 font-bold">A</span>=80% do gasto &nbsp;
                        <span className="text-blue-600 font-bold">B</span>=15% &nbsp;
                        <span className="text-gray-400 font-bold">C</span>=5%
                      </p>
                    </div>
                  )}
                  {analise.data.curvaMat.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhuma OC registrada para esta obra.</p>
                  )}
                </div>
              )}

              {/* ─── Sub-aba: Ferramentas Almox ─── */}
              {abaAnalise === "ferramentas" && (
                <div className="space-y-2">
                  {analise.data.ferramentasAlmox.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhuma ferramenta cadastrada no almox desta obra.</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-gray-400">{analise.data.ferramentasAlmox.length} item(s) · toque para ampliar</p>
                      <div className="space-y-2">
                        {analise.data.ferramentasAlmox.map((f: any, i: number) => {
                          const qtdAlmox  = parseFloat(String(f.quantidade_atual ?? 0));
                          const emUso     = parseInt(String(f.em_uso_cnt ?? 0));
                          const suspeita  = f.suspeita_desvio === true || f.suspeita_desvio === "true";
                          const ehProprio = f.equipamento_vinculado_tipo === "proprio";
                          const ehLocado  = f.equipamento_vinculado_tipo === "locado";
                          const borderCls = suspeita ? "border-red-200 bg-red-50" : emUso > 0 ? "border-indigo-100 bg-indigo-50/60" : "border-gray-200 bg-white";
                          return (
                            <div key={i} className={`rounded-xl border ${borderCls} overflow-hidden`}>
                              <div className="flex gap-3 p-3">
                                {/* Foto / placeholder */}
                                <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                                  {f.foto_url
                                    ? <img src={f.foto_url} alt={f.nome} className="w-full h-full object-cover" />
                                    : <Wrench className="w-6 h-6 text-gray-300" />}
                                </div>
                                {/* Dados */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-start gap-1 mb-1">
                                    <span className="font-semibold text-[11px] text-gray-900 break-words">{f.nome}</span>
                                    <div className="flex flex-wrap gap-1 ml-auto">
                                      {ehProprio && <Badge className="bg-indigo-100 text-indigo-700 text-[8px] px-1.5">🏗️ Equipamento Próprio</Badge>}
                                      {ehLocado  && <Badge className="bg-amber-100 text-amber-700 text-[8px] px-1.5">🚜 Locado</Badge>}
                                      {suspeita  && <Badge className="bg-red-100 text-red-700 text-[8px] px-1.5">⚠ Possível Desvio</Badge>}
                                      {!suspeita && emUso > 0 && <Badge className="bg-indigo-100 text-indigo-700 text-[8px] px-1.5">Em Uso</Badge>}
                                      {!suspeita && emUso === 0 && qtdAlmox > 0 && <Badge className="bg-green-100 text-green-700 text-[8px] px-1.5">No Almox</Badge>}
                                      {!suspeita && emUso === 0 && qtdAlmox <= 0 && <Badge className="bg-gray-100 text-gray-500 text-[8px] px-1.5">Zerado</Badge>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                                    {f.categoria && (
                                      <span className="flex items-center gap-1">
                                        <Package className="w-3 h-3 flex-shrink-0" />{f.categoria}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <span className="text-gray-400">Qtd almox:</span>
                                      <strong className="text-gray-700">{qtdAlmox}</strong>
                                    </span>
                                    {emUso > 0 && (
                                      <span className="col-span-2 flex items-center gap-1 text-indigo-600 font-medium">
                                        <Users className="w-3 h-3 flex-shrink-0" />
                                        Com: {f.em_uso_pessoas || `${emUso} pessoa(s)`}
                                      </span>
                                    )}
                                    {f.criado_por_nome && (
                                      <span className="flex items-center gap-1">
                                        <span className="text-gray-400">Registrado por:</span> {f.criado_por_nome}
                                      </span>
                                    )}
                                    {f.criado_em && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3 flex-shrink-0 text-gray-400" />
                                        {String(f.criado_em).slice(0, 10).split("-").reverse().join("/")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ─── Sub-aba: Locações ─── */}
              {abaAnalise === "locacoes" && (
                <div className="space-y-2">
                  {analise.data.locacoes.length === 0 ? (
                    <div className="text-center py-6 space-y-1">
                      <p className="text-xs text-gray-400">Nenhum equipamento locado ativo nesta obra.</p>
                      <p className="text-[10px] text-gray-300">Cadastre locações no módulo Almoxarifado → Equipamentos Locados.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] text-gray-400">{analise.data.locacoes.length} equipamento(s) locado(s) ativo(s)</p>
                      <div className="space-y-2">
                        {analise.data.locacoes.map((l: any, i: number) => {
                          const dias   = parseInt(String(l.dias_locado ?? 0));
                          const custo  = parseFloat(String(l.custo_estimado ?? 0));
                          const vm     = parseFloat(String(l.valor_mensal ?? 0));
                          const atrasado = l.status === "atrasado";
                          const borderCls = atrasado ? "border-red-200 bg-red-50" : "border-amber-100 bg-amber-50/40";
                          return (
                            <div key={i} className={`rounded-xl border ${borderCls} overflow-hidden`}>
                              <div className="flex gap-3 p-3">
                                {/* Foto / placeholder */}
                                <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                                  {l.foto_url
                                    ? <img src={l.foto_url} alt={l.descricao} className="w-full h-full object-cover" />
                                    : <Wrench className="w-6 h-6 text-amber-300" />}
                                </div>
                                {/* Dados */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-start gap-1 mb-1">
                                    <span className="font-semibold text-[11px] text-gray-900 break-words">{l.descricao}</span>
                                    <span className={`ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full ${atrasado ? "bg-red-200 text-red-800" : "bg-amber-200 text-amber-800"}`}>
                                      🚜 {atrasado ? "ATRASADO" : "Em uso"}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                                    {l.fornecedor_nome && (
                                      <span className="col-span-2 font-medium text-gray-700">{l.fornecedor_nome}</span>
                                    )}
                                    {l.funcionario_responsavel_nome && (
                                      <span className="col-span-2 flex items-center gap-1 text-indigo-600">
                                        <Users className="w-3 h-3 flex-shrink-0" />Com: {l.funcionario_responsavel_nome}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 flex-shrink-0 text-gray-400" />
                                      Início: {l.data_inicio ? String(l.data_inicio).slice(0, 10).split("-").reverse().join("/") : "—"}
                                    </span>
                                    <span>{dias} dia(s) na obra</span>
                                    {l.data_fim_prevista && (
                                      <span className={`flex items-center gap-1 ${atrasado ? "text-red-600 font-semibold" : ""}`}>
                                        Prev. devolução: {String(l.data_fim_prevista).slice(0, 10).split("-").reverse().join("/")}
                                      </span>
                                    )}
                                    {vm > 0 && (
                                      <span className="text-indigo-700 font-semibold">
                                        {fmt(vm)}/mês
                                        {custo > 0 && <span className="text-gray-400 font-normal"> · {fmt(custo)} total</span>}
                                      </span>
                                    )}
                                    {l.numero_contrato_fornecedor && (
                                      <span>Contrato: {l.numero_contrato_fornecedor}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════ TAB: OPERACIONAL ════════════ */}
      {tabScore === "operacional" && (
        <div className="space-y-4">
          {/* Ferramentas (warehouse_loans) */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="w-4 h-4 text-teal-600" />
                Controle de Ferramentas e Equipamentos
                {detalhes.ferramentasPerdidas > 0 && (
                  <Badge className="ml-1 bg-red-100 text-red-700 text-[9px]">{detalhes.ferramentasPerdidas} perdida(s)</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {ferramentas.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : (ferramentas.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nenhuma ferramenta/equipamento registrado nesta obra.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="text-left pb-1.5 font-medium">Item</th>
                        <th className="text-left pb-1.5 font-medium">Com quem</th>
                        <th className="text-left pb-1.5 font-medium">Desde</th>
                        <th className="text-left pb-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ferramentas.data ?? []).map((f: any) => (
                        <tr key={f.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-gray-800">{f.item_nome}</td>
                          <td className="py-1.5 pr-2 text-gray-600">{f.funcionario_nome || "—"}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{f.data_emprestimo || "—"}</td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${f.status === "devolvido" ? "bg-green-100 text-green-700" : f.status === "perdido" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                              {f.status === "emprestado" ? "Em uso" : f.status === "devolvido" ? "Devolvido" : "Perdido"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retrabalhos */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Retrabalhos Registrados ({detalhes.retrabalhos})
                {isAdmin && (
                  <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setShowRetrabalho(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Registrar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {detalhes.retrabalhos === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nenhum retrabalho registrado. 👍</p>
              ) : (
                <div className="space-y-2">
                  {(score.data?.eventos ?? [])
                    .filter(ev => ev.tipo === "qualidade" && ev.descricao.startsWith("Retrabalho:"))
                    .map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700">{ev.descricao.replace("Retrabalho: ", "")}</p>
                      </div>
                      <span className="text-[10px] text-red-500 font-bold shrink-0">−5 pts</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modais ───────────────────────────────────────────────────────────── */}
      {showConfig && (
        <ConfigModal open={showConfig} onClose={() => setShowConfig(false)} companyId={companyId} obraId={obraId!} currentConfig={config} onSaved={refetch} />
      )}
      {showRetrabalho && (
        <NovoRetrabalhoModal open={showRetrabalho} onClose={() => setShowRetrabalho(false)} companyId={companyId} obraId={obraId!} onSaved={refetch} />
      )}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir retrabalho?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação removerá o retrabalho do scorecard e aumentará a pontuação de Qualidade.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteRetrabalho.mutate({ id: deleteId, companyId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
