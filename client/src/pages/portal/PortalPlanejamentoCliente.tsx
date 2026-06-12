import { Fragment, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, Calendar, MapPin, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, Building2, ListTree, Activity, BarChart3, History,
  CalendarDays, User, CalendarCheck, FileText, GitBranch, HardHat,
  DollarSign, Cloud, Droplets, Wind, Loader2, ClipboardList, ChevronRight,
  ChevronDown, Search, Menu, X, PanelLeftClose, PanelLeftOpen, Users, Handshake, Home,
  AlertOctagon, Printer, CalendarRange, ShieldCheck, MessageSquare, Star, Layers, Check,
  TrendingDown, Zap, FileCheck2, FileX2, GraduationCap, Eye,
} from "lucide-react";
import { getNrDescricao } from "@shared/trainingRules";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, Bar, Cell,
  Line, Area, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, LabelList,
} from "recharts";
import { PORTAL_CLIENTE_ABAS, type PortalClienteAbaKey } from "@shared/portalClienteAbas";
import { proximaJanelaAvaliacao } from "../../../../shared/portalAvaliacao";
import { ProgramacaoSemanal } from "@/pages/planejamento/ProgramacaoSemanal";
import { EfetivoObraView } from "@/pages/planejamento/PlanejamentoDetalhe";
import { DiagramaRede as DiagramaRedeInterno } from "@/pages/planejamento/DiagramaRede";
import PortalPrintHeader from "@/components/PortalPrintHeader";
import PrintActions from "@/components/PrintActions";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipProvider as UiTooltipProvider, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import { Popover as UiPopover, PopoverContent as UiPopoverContent, PopoverTrigger as UiPopoverTrigger } from "@/components/ui/popover";
import { Info as InfoIcon } from "lucide-react";
import { PersonPhoto } from "@/components/PersonPhoto";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");
const fmtPct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;

const ABA_ICONS: Record<string, any> = {
  visao_geral: TrendingUp,
  cronograma: ListTree,
  avanco_semanal: Activity,
  prog_semanal: CalendarDays,
  curva_s: BarChart3,
  revisoes: History,
  gantt: CalendarCheck,
  refis: FileText,
  caminho_critico: GitBranch,
  efetivo: HardHat,
  crono_financeiro: DollarSign,
  prev_medicao: FileText,
  diagrama_rede: GitBranch,
  custo_rh: DollarSign,
  bim_3d: BarChart3,
};

// Rev. 1637 — Recebe o cutoff oficial (Status Date PMBOK/EVM). Quando o
// portal não conseguir resolver o cutoff (raro), cai em today() para não
// quebrar a interface — mas o caso normal é SEMPRE usar o cutoff vindo do
// backend, idêntico ao denominador de PV/EV. Assim o cliente nunca vê
// "Atrasada" entre uma quinta e a próxima atualização do cronograma.
function statusBadge(realizado: number, dataFim: string | null, dataInicio?: string | null, cutoff?: string) {
  const ref = cutoff || new Date().toISOString().slice(0, 10);
  if (realizado >= 100) return { label: "Concluída", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  // Marcos (duração zero) não entram como Atrasada — são pontos de referência
  // do cronograma (ex.: "Início", "Fim do projeto"), não atividades executáveis.
  const isMarco = dataInicio && dataFim && dataInicio === dataFim;
  if (!isMarco && dataFim && dataFim < ref && realizado < 100) return { label: "Atrasada", cls: "bg-red-100 text-red-700 border-red-200" };
  if (isMarco && dataFim && dataFim < ref) return { label: "Marco", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (realizado > 0) return { label: "Em execução", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Prevista", cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

function fmtBRDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

export default function PortalPlanejamentoCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ obraId: string }>("/portal/cliente/obra/:obraId");
  const obraId = params?.obraId ? Number(params.obraId) : 0;
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo, navigate]);

  const { data, isLoading, error } = trpc.portalExterno.cliente.planejamentoObra.useQuery(
    { token, obraId },
    { enabled: !!token && tipo === "cliente" && obraId > 0 }
  );

  const obra = data?.obra as any;
  const projeto = data?.projeto as any;
  const kpis = data?.kpis as any;
  const semanaAtual = (data?.semanaAtual || []) as any[];
  const atrasadas = (data?.atrasadas || []) as any[];
  const proximas = (data?.proximas || []) as any[];
  const progSemanal = ((data as any)?.progSemanal || []) as any[];
  const curvaS = ((data as any)?.curvaS || []) as { semana: string; previsto: number; realizado: number }[];
  const curvaData = ((data as any)?.curvaData || null) as null | {
    curvaBaseline: { semana: string; acumulado: number }[];
    curvaPlanejada: { semana: string; acumulado: number }[];
    curvaRealizada: { semana: string; acumulado: number }[];
    curvaTendencia: { semana: string; acumulado: number }[];
  };
  const atividadesTodas = ((data as any)?.atividadesTodas || []) as any[];
  const refisLista = ((data as any)?.refisLista || []) as any[];
  const curvaMedicoes = ((data as any)?.curvaMedicoes || []) as { competencia: string; valorMedido: number; valorAcumulado: number; status: string }[];
  const caminhoCritico = ((data as any)?.caminhoCritico || []) as any[];
  const efetivoMensal = ((data as any)?.efetivoMensal || []) as any[];
  const revisoes = ((data as any)?.revisoes || []) as any[];
  const abasLiberadas = ((data as any)?.abasLiberadas || ["visao_geral"]) as PortalClienteAbaKey[];
  // Rev. 1637 — Data de Corte (Status Date PMBOK/EVM) vinda do backend.
  // Portal SEMPRE usa este cutoff como referência — entre uma quinta e a
  // próxima atualização do cronograma os indicadores ficam congelados,
  // evitando o "atraso fantasma" típico de denominador rolando sozinho.
  const dataCorteInfo = ((data as any)?.dataCorte || null) as null | {
    oficial: string;
    atualizadoEm: string | null;
    atualizadoPor: string | null;
    proximaAtualizacao: string;
    nuncaFechado: boolean;
    hoje: string;
  };
  const cutoffOficial = dataCorteInfo?.oficial;

  // Rev. 1564 — módulos liberados pelo admin (filtra a lista lateral "Outros módulos").
  const { data: liberacoes } = trpc.portalExterno.cliente.liberacoes.useQuery(
    { token }, { enabled: !!token, staleTime: 60_000 }
  );

  // Rev. 1591 — Avaliação Anônima desativada após envio no período corrente.
  const { data: avalStatus } = trpc.portalExterno.cliente.podeAvaliarEsteMes.useQuery(
    { token }, { enabled: !!token, staleTime: 60_000 }
  );
  const avalJaFeita = !!avalStatus?.jaAvaliou;
  const avalPeriodicidade = (avalStatus?.periodicidade as "mensal" | "anual" | undefined) ?? "mensal";
  const avalProximaJanela = avalStatus?.anoMes
    ? proximaJanelaAvaliacao(avalStatus.anoMes, avalPeriodicidade)
    : "";
  const idsModulosLiberados = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, string> = {
      mod_planejamento: "planejamento",
      mod_rh_documentos: "rh-documentos",
      mod_proj_doc: "proj-doc",
      mod_avaliacao: "avaliacao",
    };
    const keys = liberacoes?.modulos || (["mod_planejamento","mod_rh_documentos","mod_proj_doc","mod_avaliacao"] as string[]);
    for (const k of keys) { const id = map[k]; if (id) set.add(id); }
    return set;
  }, [liberacoes]);

  // Rev. 1603 — Ordem das abas vem do servidor (definida pelo Admin Master
  // na tela "Liberações do Portal — Módulos e Abas"). O cliente ainda pode
  // arrastar para reordenar localmente (persistido em localStorage).
  const abasVisiveisBase = useMemo(() => {
    const byKey = new Map(PORTAL_CLIENTE_ABAS.map((a) => [a.key, a] as const));
    return abasLiberadas
      .map((k) => byKey.get(k as PortalClienteAbaKey))
      .filter((a): a is typeof PORTAL_CLIENTE_ABAS[number] => !!a);
  }, [abasLiberadas]);

  const [aba, setAba] = useState<PortalClienteAbaKey>("visao_geral");
  // Rev. 1580 — Em telas até 1279px (iPad portrait/landscape e tablets) o
  // menu lateral começa em modo ÍCONE (rail w-16). Em desktop (>=1280px)
  // continua começando aberto (w-64). SSR-safe.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1280
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [buscaAba, setBuscaAba] = useState("");
  // Rev. 1516 — abre/fecha o seletor de obra+módulo embutido na pílula
  const [obraSwitcherOpen, setObraSwitcherOpen] = useState(false);

  // Rev. 1584 — Toggle "Global (c/ Indiretas)" elevado para o componente
  // pai. Antes vivia só dentro de AbaRefis, então a barra "Avanço Físico"
  // do topo continuava mostrando os valores oficiais sem indiretas mesmo
  // com o toggle ligado, criando divergência visível com o card REFIS.
  // Agora a mesma fórmula do REFIS é aplicada à barra do topo quando
  // `incluirIndiretas` está on. Mantém a regra de ouro Portal × ERP.
  const [incluirIndiretas, setIncluirIndiretas] = useState(false);

  // Recalcula previsto/realizado do topo SEMPRE com a mesma fórmula da
  // aba REFIS quando `incluirIndiretas` está ligado (universo único de
  // folhas com datas, indiretas no realizado pela curva prevista linear).
  const { topPrevisto, topRealizado } = useMemo(() => {
    if (!incluirIndiretas || !atividadesTodas?.length || !refisLista?.length) {
      return {
        topPrevisto: Number((kpis as any)?.previsto ?? 0),
        topRealizado: Number((kpis as any)?.realizado ?? 0),
      };
    }
    const refisOrd = [...refisLista].sort((a, b) => String(a.semana).localeCompare(String(b.semana)));
    const refisAtual = refisOrd[refisOrd.length - 1];
    const semanaRef = String(refisAtual?.semana || "");
    if (!semanaRef) {
      return {
        topPrevisto: Number((kpis as any)?.previsto ?? 0),
        topRealizado: Number((kpis as any)?.realizado ?? 0),
      };
    }
    const semanaFimRef = (() => {
      const d = new Date(semanaRef + "T12:00:00");
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })();
    const progPrevistoNa = (a: any, dataStr: string) => {
      if (!a.dataInicio || !a.dataFim) return 0;
      if (dataStr >= a.dataFim) return 100;
      if (dataStr < a.dataInicio) return 0;
      const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
      const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
      const tod = new Date(dataStr + "T12:00:00Z").getTime();
      return ((tod - ini) / (fim - ini)) * 100;
    };
    const folhas = (atividadesTodas || []).filter(
      (a: any) => !a.isGrupo && !a.disabled && (incluirIndiretas || !a.isIndireta)
    );
    const folhasComDatas = folhas.filter((a: any) => a.dataInicio && a.dataFim);
    const pesoBruto = folhasComDatas.reduce((s: number, a: any) => s + (Number(a.pesoFinanceiro) || 0), 0);
    const semPeso = pesoBruto === 0;
    const denom = semPeso ? (folhasComDatas.length || 1) : pesoBruto;
    const prev = folhasComDatas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : (Number(a.pesoFinanceiro) || 0);
      return s + (progPrevistoNa(a, semanaFimRef) * peso) / denom;
    }, 0);
    const real = folhasComDatas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : (Number(a.pesoFinanceiro) || 0);
      const val = a.isIndireta ? progPrevistoNa(a, semanaFimRef) : (Number(a.percentRealizado) || 0);
      return s + (val * peso) / denom;
    }, 0);
    return { topPrevisto: prev, topRealizado: real };
  }, [incluirIndiretas, atividadesTodas, refisLista, kpis]);

  // Lista de obras às quais o cliente tem acesso (para o seletor da pílula)
  const { data: minhasObras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery(
    { token },
    { enabled: !!token, staleTime: 60_000 }
  );

  // Módulos do cliente (mesma lista do PortalHubCliente). Mantemos local
  // aqui para evitar acoplar o componente ao Hub e poder pular o módulo atual.
  // Rev. 1552 — accentFrom/accentTo seguem o mesmo padrão visual do
  // ModuleHub do ERP (client/src/pages/ModuleHub.tsx) para que o
  // troca-de-módulo do portal use o mesmo desenho.
  const MODULOS_CLIENTE_NAV = [
    { id: "planejamento",   title: "Planejamento",  subtitle: "Cronograma e Avanço",        icon: CalendarRange,  accentFrom: "#22C55E", accentTo: "#16A34A", route: (oid: number) => `/portal/cliente/obra/${oid}` },
    { id: "rh-documentos",  title: "RH & Docs",     subtitle: "Controle de Documentos",     icon: ShieldCheck,    accentFrom: "#10B981", accentTo: "#059669", route: (oid: number) => `/portal/cliente/rh/${oid}` },
    { id: "proj-doc",       title: "Proj./Doc.",    subtitle: "Documentos Técnicos",        icon: FileText,       accentFrom: "#6366F1", accentTo: "#4338CA", route: (oid: number) => `/portal/cliente/projdoc/${oid}` },
    { id: "avaliacao",      title: "Avaliação",     subtitle: "Avaliação anônima mensal",   icon: Star,           accentFrom: "#F59E0B", accentTo: "#D97706", route: (_oid: number) => `/portal/cliente/dashboard?tab=avaliacao` },
  ];
  const moduloAtualId = "planejamento";
  // Cores fixas para obras (diferenciam visualmente do bloco de módulos):
  // gradiente âmbar (combina com a logo FC) — Rev. 1552.
  const OBRA_ACCENT_FROM = "#F59E0B";
  const OBRA_ACCENT_TO = "#EA580C";

  // Ordem customizada das abas (persistida no localStorage por obra).
  // Rev. 1606 — A ordem definida pelo Admin (em "Liberações do Portal —
  // Módulos e Abas") é a FONTE DA VERDADE. Guardamos junto com a ordem
  // local um snapshot da ordem do servidor que valia quando o cliente
  // arrastou. Se o servidor mudou (qualquer aba adicionada/removida ou
  // ordem alterada pelo admin), a ordem local fica obsoleta e é
  // descartada automaticamente — assim o portal sempre reflete o que
  // foi configurado no admin.
  const ordemKey = `portalCliente_ordemAbas_${obraId}`;
  const [ordemAbas, setOrdemAbas] = useState<string[]>([]);
  const baseServerOrder = useMemo(() => abasVisiveisBase.map((a) => a.key).join("|"), [abasVisiveisBase]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ordemKey);
      if (!raw) { setOrdemAbas([]); return; }
      const parsed = JSON.parse(raw);
      // Formato novo: { baseline, ordem }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.ordem) && typeof parsed.baseline === "string") {
        if (parsed.baseline === baseServerOrder) {
          setOrdemAbas(parsed.ordem);
        } else {
          // Admin mudou a configuração → descarta a ordem local antiga.
          localStorage.removeItem(ordemKey);
          setOrdemAbas([]);
        }
        return;
      }
      // Formato legado (array puro) — descarta para forçar adoção da nova ordem do admin.
      localStorage.removeItem(ordemKey);
      setOrdemAbas([]);
    } catch { setOrdemAbas([]); }
  }, [ordemKey, baseServerOrder]);

  const persistOrdem = (nova: string[]) => {
    setOrdemAbas(nova);
    try {
      localStorage.setItem(ordemKey, JSON.stringify({ baseline: baseServerOrder, ordem: nova }));
    } catch {/* ignora */}
  };

  const abasVisiveis = useMemo(() => {
    if (!ordemAbas.length) return abasVisiveisBase;
    const idx = (k: string) => {
      const i = ordemAbas.indexOf(k);
      return i === -1 ? 9999 : i;
    };
    return [...abasVisiveisBase].sort((a, b) => idx(a.key) - idx(b.key));
  }, [abasVisiveisBase, ordemAbas]);

  useEffect(() => {
    if (abasVisiveis.length > 0 && !abasVisiveis.find((a) => a.key === aba)) {
      setAba(abasVisiveis[0].key);
    }
  }, [abasVisiveis, aba]);

  const abasFiltradas = useMemo(() => {
    const q = buscaAba.trim().toLowerCase();
    if (!q) return abasVisiveis;
    return abasVisiveis.filter((a) => a.label.toLowerCase().includes(q));
  }, [abasVisiveis, buscaAba]);

  // Drag-and-drop para reordenar (só ativo quando não há busca)
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const podeDrag = buscaAba.trim() === "";
  const onDropAba = (alvoKey: string) => {
    if (!dragKey || dragKey === alvoKey) { setDragKey(null); setOverKey(null); return; }
    const keys = abasVisiveis.map((a) => a.key);
    const fromIdx = keys.indexOf(dragKey);
    const toIdx = keys.indexOf(alvoKey);
    if (fromIdx === -1 || toIdx === -1) { setDragKey(null); setOverKey(null); return; }
    const nova = [...keys];
    nova.splice(fromIdx, 1);
    nova.splice(toIdx, 0, dragKey);
    persistOrdem(nova);
    setDragKey(null);
    setOverKey(null);
  };

  // Dias restantes (estilo interno)
  const diasRestantes = useMemo(() => {
    const fim = projeto?.dataTerminoContratual || obra?.dataPrevisaoFim;
    if (!fim) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fimD = new Date((fim as string).slice(0, 10) + "T00:00:00");
    return Math.ceil((fimD.getTime() - hoje.getTime()) / 86400000);
  }, [projeto, obra]);

  const renderSidebarItem = (a: typeof PORTAL_CLIENTE_ABAS[number]) => {
    const Icon = ABA_ICONS[a.key] || TrendingUp;
    const isActive = aba === a.key;
    const isEmBreve = a.status === "em_breve";
    const isDragging = dragKey === a.key;
    const isOver = overKey === a.key && dragKey && dragKey !== a.key;
    return (
      <div
        key={a.key}
        draggable={podeDrag}
        onDragStart={(e) => {
          if (!podeDrag) return;
          setDragKey(a.key);
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", a.key); } catch {/* ignora */}
        }}
        onDragOver={(e) => {
          if (!podeDrag || !dragKey) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (overKey !== a.key) setOverKey(a.key);
        }}
        onDragLeave={() => { if (overKey === a.key) setOverKey(null); }}
        onDrop={(e) => { if (!podeDrag) return; e.preventDefault(); onDropAba(a.key); }}
        onDragEnd={() => { setDragKey(null); setOverKey(null); }}
        className={`relative ${isDragging ? "opacity-40" : ""} ${isOver ? "before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-blue-400 before:rounded-full" : ""}`}
      >
        <button
          onClick={() => { setAba(a.key); setMobileSidebarOpen(false); }}
          className={`group flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-medium rounded-lg text-left transition-all duration-150 ${
            isActive
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-200 hover:bg-slate-700/60 hover:text-white"
          } ${podeDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
          title={podeDrag ? `${a.label} — arraste para reordenar` : a.label}
        >
          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
          <span className="truncate flex-1">{a.label}</span>
          {isEmBreve && (
            <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">em breve</span>
          )}
        </button>
      </div>
    );
  };

  const sidebarContent = (
    <>
      {/* Header logo / título */}
      <div className="px-4 py-4 border-b border-slate-700/60">
        <div className="flex items-start gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow text-slate-900 font-bold text-sm shrink-0">
            FC
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Portal do Cliente</p>
            <p className="text-sm font-bold text-white leading-tight truncate">FC Engenharia</p>
          </div>
          {/* Botão recolher menu (desktop) — Rev. 1515: vive aqui na barra lateral, em vez de no header da página, para manter o padrão usado no resto do sistema */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors shrink-0"
            title="Recolher menu lateral"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => navigate("/portal/cliente/hub")}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 text-[12px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
          title="Voltar para a tela inicial do portal"
        >
          <Home className="h-3.5 w-3.5" />
          Tela Inicial do Portal
        </button>
      </div>

      {/* Pílula da obra — Rev. 1516: agora é um botão que abre seletor de OBRA + MÓDULO */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => setObraSwitcherOpen((v) => !v)}
          className={`w-full text-left bg-slate-700/50 rounded-lg px-3 py-2.5 ring-1 transition-all hover:bg-slate-700/70 ${
            obraSwitcherOpen ? "ring-blue-500/60 bg-slate-700/80" : "ring-slate-600/50"
          }`}
          title="Trocar de obra ou de módulo"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                Obra
                <span className="text-blue-300 normal-case tracking-normal font-normal">· clique para trocar</span>
              </p>
              <p className="text-sm font-bold text-white leading-tight line-clamp-2">{obra?.nome || "—"}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${obraSwitcherOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {/* Painel expansível: cards de obras + cards de módulos.
            Rev. 1552 — Mesmo desenho do ModuleHub interno do ERP:
            tile com ícone em gradiente colorido, borda accent e glow.
            Obras = gradiente âmbar (logo FC). Módulos = cor própria. */}
        {obraSwitcherOpen && (
          <div className="mt-2 bg-slate-900/60 ring-1 ring-slate-700/60 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {/* ═══ OBRAS ═══ */}
            <div className="px-3 pt-3 pb-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Outras obras
                {minhasObras.length > 0 && (
                  <span className="ml-auto text-slate-500 normal-case tracking-normal">
                    {minhasObras.length} disponíve{minhasObras.length === 1 ? "l" : "is"}
                  </span>
                )}
              </p>
            </div>
            <div className="max-h-56 overflow-y-auto px-2 pb-2 space-y-1">
              {minhasObras.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic px-2 py-3 text-center">Nenhuma outra obra disponível</p>
              ) : (
                minhasObras.map((o: any) => {
                  const isAtual = o.id === obraId;
                  return (
                    <button
                      key={o.id}
                      onClick={() => {
                        if (isAtual) { setObraSwitcherOpen(false); return; }
                        setObraSwitcherOpen(false);
                        setMobileSidebarOpen(false);
                        navigate(`/portal/cliente/obra/${o.id}`);
                      }}
                      className={`group w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                        isAtual
                          ? "bg-slate-700/60"
                          : "hover:bg-slate-700/40"
                      }`}
                      title={o.nome}
                    >
                      <span
                        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${OBRA_ACCENT_FROM}, ${OBRA_ACCENT_TO})`,
                        }}
                      >
                        <Building2 className="h-3.5 w-3.5 text-white" />
                      </span>
                      <span className={`flex-1 truncate text-[12px] ${isAtual ? "text-white font-semibold" : "text-slate-200"}`}>{o.nome}</span>
                      {isAtual && <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })
              )}
            </div>

            {/* ═══ MÓDULOS ═══ */}
            <div className="border-t border-slate-700/60 px-3 pt-2.5 pb-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> Outros módulos
              </p>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {MODULOS_CLIENTE_NAV.filter((m) => idsModulosLiberados.has(m.id)).map((m) => {
                const isAtual = m.id === moduloAtualId;
                // Rev. 1591 — Avaliação desativada quando já feita no período
                const desativado = m.id === "avaliacao" && avalJaFeita;
                const Icon = m.icon;
                const subtitleEfetivo = desativado
                  ? (avalProximaJanela ? `Disponível em ${avalProximaJanela}` : "Concluída neste período")
                  : m.subtitle;
                return (
                  <button
                    key={m.id}
                    disabled={desativado}
                    onClick={() => {
                      if (desativado) return;
                      if (isAtual) { setObraSwitcherOpen(false); return; }
                      setObraSwitcherOpen(false);
                      setMobileSidebarOpen(false);
                      navigate(m.route(obraId));
                    }}
                    className={`group w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                      desativado
                        ? "opacity-50 cursor-not-allowed"
                        : isAtual
                          ? "bg-slate-700/60"
                          : "hover:bg-slate-700/40"
                    }`}
                    title={desativado
                      ? `Avaliação deste ${avalPeriodicidade === "anual" ? "ano" : "mês"} já registrada${avalProximaJanela ? ` — disponível em ${avalProximaJanela}` : ""}.`
                      : `${m.title} — ${m.subtitle}`}
                  >
                    <span
                      className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${desativado ? "grayscale" : ""}`}
                      style={{
                        background: `linear-gradient(135deg, ${m.accentFrom}, ${m.accentTo})`,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block truncate text-[12px] leading-tight ${desativado ? "text-slate-400" : isAtual ? "text-white font-semibold" : "text-slate-200"}`}>{m.title}</span>
                      <span className={`block truncate text-[10px] leading-tight ${desativado ? "text-emerald-400" : "text-slate-500"}`}>{subtitleEfetivo}</span>
                    </span>
                    {isAtual && !desativado && (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} style={{ color: m.accentFrom }} />
                    )}
                    {desativado && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={buscaAba}
            onChange={(e) => setBuscaAba(e.target.value)}
            placeholder="Buscar no menu..."
            className="w-full pl-8 pr-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-[12px] text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40"
          />
        </div>
        {/* Rev. 1603 — botão para descartar a ordem local e voltar ao padrão
            definido pelo Admin Master (em "Liberações do Portal — Módulos e Abas"). */}
        {ordemAbas.length > 0 && (
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem(ordemKey); } catch {/* ignora */}
              setOrdemAbas([]);
            }}
            className="mt-1.5 w-full text-[10px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700/40 transition flex items-center justify-center gap-1"
            title="Descartar a ordem que você arrastou e voltar à ordem padrão definida pela FC Engenharia."
          >
            ↺ Restaurar ordem padrão
          </button>
        )}
      </div>

      {/* Grupo: Abas do Projeto */}
      <div className="px-3 pb-3 flex-1 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-2 py-2">Abas do Projeto</p>
        <div className="space-y-0.5">
          {abasFiltradas.map((a) => renderSidebarItem(a))}
          {abasFiltradas.length === 0 && (
            <p className="text-[11px] text-slate-500 italic px-2 py-3 text-center">Nenhuma aba encontrada</p>
          )}
        </div>
      </div>

      {/* Voltar */}
      <div className="border-t border-slate-700/60 p-3 space-y-1.5">
        <button
          onClick={() => navigate("/portal/cliente/hub")}
          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
        >
          <Home className="h-3.5 w-3.5" />
          Tela Inicial do Portal
        </button>
        <button
          onClick={() => navigate("/portal/cliente/modulo/planejamento")}
          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] font-semibold rounded-lg text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Trocar de Obra
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex">
      {/* ── Sidebar (desktop) ────────────────────────────────────────
           Rev. 1517: ao recolher, a barra NÃO some mais — vira um rail
           estreito (w-16) com apenas os ícones, igual ao padrão do ERP. */}
      <aside className={`hidden md:flex flex-col bg-slate-800 border-r border-slate-700 sticky top-0 h-screen shrink-0 shadow-xl transition-[width] duration-200 ${sidebarOpen ? "w-64" : "w-16"}`}>
        {sidebarOpen ? sidebarContent : (
          // ── Variante "rail" / só ícones ────────────────────────────
          <>
            {/* Topo: logo + botão expandir */}
            <div className="px-2 pt-3 pb-2 border-b border-slate-700/60 flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow text-slate-900 font-bold text-xs" title="FC Engenharia — Portal do Cliente">
                FC
              </div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
                title="Expandir menu lateral"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>

            {/* Atalhos rápidos */}
            <div className="px-2 py-2 border-b border-slate-700/60 flex flex-col items-center gap-1.5">
              <button
                onClick={() => navigate("/portal/cliente/hub")}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
                title="Tela Inicial do Portal"
              >
                <Home className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSidebarOpen(true)}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
                title={`Obra atual: ${obra?.nome || "—"} — clique para trocar`}
              >
                <Building2 className="h-4 w-4" />
              </button>
            </div>

            {/* Lista de abas (só ícone) */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {abasVisiveis.map((a) => {
                const Icon = ABA_ICONS[a.key] || TrendingUp;
                const isActive = aba === a.key;
                const isEmBreve = a.status === "em_breve";
                return (
                  <button
                    key={a.key}
                    onClick={() => setAba(a.key)}
                    className={`relative h-9 w-full flex items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-700/60 hover:text-white"
                    }`}
                    title={a.label + (isEmBreve ? " (em breve)" : "")}
                  >
                    <Icon className="h-4 w-4" />
                    {isEmBreve && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  </button>
                );
              })}
            </div>

            {/* Rodapé */}
            <div className="border-t border-slate-700/60 px-2 py-2 flex flex-col items-center gap-1.5">
              <button
                onClick={() => navigate("/portal/cliente/modulo/planejamento")}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
                title="Trocar de Obra"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Sidebar (mobile overlay) ───────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 w-72 bg-slate-800 border-r border-slate-700 flex flex-col z-50 shadow-2xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-slate-700/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto p-3 sm:p-5">
        {/* ── Cabeçalho exclusivo de impressão (logos cliente + FC + gerenciadora) ── */}
        <PortalPrintHeader obra={obra} titulo={`Portal do Cliente — ${PORTAL_CLIENTE_ABAS.find(x=>x.key===aba)?.label || "Planejamento"}`} />

        {/* ── Faixa de logos (visível em tela, escondida na impressão pois o
              PortalPrintHeader acima já cumpre esse papel no PDF). Mostra os
              3 atores envolvidos: Construtora (executora) · Cliente · Gerenciadora.
              Ocultada quando NENHUM logo está disponível. ─────────────── */}
        {(((obra as any)?.empresaLogoUrl) || ((obra as any)?.clienteLogoUrl) || ((obra as any)?.gerenciadoraLogoUrl)) && (
          <div className="mb-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm px-4 py-3 print:hidden">
            {/* Rev. 1602 — 3 logos com tamanho idêntico (mesma caixa) e
                object-contain para preservar a forma original de cada um. */}
            <div className="grid grid-cols-3 gap-4 items-center">
              {/* Executora (FC) */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Executora</span>
                <div className="h-20 w-full max-w-[200px] flex items-center justify-center">
                  {(obra as any)?.empresaLogoUrl ? (
                    <img src={(obra as any).empresaLogoUrl} alt={(obra as any)?.empresaNome || "Executora"} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs font-semibold text-slate-700 truncate text-center">{(obra as any)?.empresaNome || "FC Engenharia"}</span>
                  )}
                </div>
              </div>
              {/* Cliente */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cliente</span>
                <div className="h-20 w-full max-w-[200px] flex items-center justify-center">
                  {(obra as any)?.clienteLogoUrl ? (
                    <img src={(obra as any).clienteLogoUrl} alt={obra?.cliente || "Cliente"} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs font-semibold text-slate-700 truncate text-center">{obra?.cliente || "—"}</span>
                  )}
                </div>
              </div>
              {/* Gerenciadora */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Gerenciadora</span>
                <div className="h-20 w-full max-w-[200px] flex items-center justify-center">
                  {(obra as any)?.gerenciadoraLogoUrl ? (
                    <img src={(obra as any).gerenciadoraLogoUrl} alt={(obra as any)?.gerenciadoraNome || "Gerenciadora"} className="max-h-full max-w-full object-contain" />
                  ) : (obra as any)?.gerenciadoraNome ? (
                    <span className="text-xs font-semibold text-slate-700 truncate text-center">{(obra as any).gerenciadoraNome}</span>
                  ) : (
                    <span className="text-[10px] italic text-slate-300">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Header moderno ──────────────────────────────────────────── */}
        <div className="relative bg-white rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-4 sm:p-5 mb-4 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Rev. 1517: o botão de expandir agora vive na própria barra rail (w-16),
                  então não precisamos mais de botão flutuante no header da página. */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 mt-0.5 flex-shrink-0"
                title="Abrir menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    Planejamento
                  </span>
                  {projeto?.revisaoNumero != null && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Rev. {String(projeto.revisaoNumero).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight break-words tracking-tight">
                  {obra?.nome || "Carregando..."}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500">
                  {obra?.cliente && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{obra.cliente}</span>
                    </span>
                  )}
                  {obra?.responsavel && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{obra.responsavel}</span>
                    </span>
                  )}
                  {(obra?.cidade || obra?.estado) && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{[obra.cidade, obra.estado].filter(Boolean).join(" / ")}</span>
                    </span>
                  )}
                  {diasRestantes !== null && (
                    <span className={`flex items-center gap-1.5 font-semibold ${diasRestantes < 0 ? "text-red-600" : diasRestantes < 30 ? "text-amber-600" : "text-emerald-600"}`}>
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 portal-no-print">
              <PrintActions />
              <button
                onClick={() => navigate("/portal/cliente/hub")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
                title="Voltar para a tela inicial do portal"
              >
                <Home className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tela Inicial do Portal</span>
                <span className="sm:hidden">Início</span>
              </button>
              {obra?.status && (
                <Badge className="text-[10px] uppercase tracking-wider font-semibold bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                  {obra.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* ── Avanço Físico (modernizado) ─────────────────────────── */}
        {kpis && (() => {
          // Rev. 1584 — usa os valores recalculados quando `incluirIndiretas`
          // está ligado para manter paridade com o card REFIS abaixo.
          const realizado = topRealizado;
          const previsto = topPrevisto;
          const desvio = realizado - previsto;
          const desvioPositivo = desvio > 0;
          const fonte = kpis.fonte as string | undefined;
          const refisNumero = kpis.refisNumero as number | null | undefined;
          const refisSemana = kpis.refisSemana as string | undefined;
          return (
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-5 mb-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Avanço Físico</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Math.abs(desvio) >= 0.1 ? (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${desvioPositivo ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
                      {desvioPositivo ? "+" : ""}{desvio.toFixed(2)}% {desvioPositivo ? "adiantado" : "atrasado"}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">No prazo</span>
                  )}
                  <span
                    title="Avanço previsto ponderado pelo peso financeiro de cada atividade."
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  >
                    💰 Peso Financeiro
                  </span>
                  {incluirIndiretas && (
                    <span
                      title="Indiretas (canteiro, mob/desmob) entram nos cálculos pela curva prevista linear."
                      className="text-[10px] font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                    >
                      🌐 Global (c/ Indiretas)
                    </span>
                  )}
                </div>
              </div>
              {/* Previsto — dourado moderno */}
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-20 shrink-0" style={{ color: "#9A7408" }}>Previsto</span>
                  <div className="flex-1 rounded-full h-3 overflow-hidden shadow-inner" style={{ background: "#FAF1D4" }}>
                    <div className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                      style={{
                        width: `${Math.min(100, previsto)}%`,
                        background: "linear-gradient(90deg, #E5C463 0%, #D4AF37 100%)",
                      }} />
                  </div>
                  <span className="text-sm font-bold w-16 text-right shrink-0 tabular-nums" style={{ color: "#9A7408" }}>
                    {fmtPct(previsto)}
                  </span>
                </div>
              </div>
              {/* Realizado — azul moderno */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-20 shrink-0" style={{ color: "#1B3A8A" }}>Realizado</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                      style={{
                        width: `${Math.min(100, realizado)}%`,
                        background: "linear-gradient(90deg, #2C58C5 0%, #1B3A8A 100%)",
                      }} />
                  </div>
                  <span className="text-sm font-bold w-16 text-right shrink-0 tabular-nums" style={{ color: "#1B3A8A" }}>
                    {fmtPct(realizado)}
                  </span>
                </div>
              </div>
              {/* Rev. 1637 — Banner de Status Date (PMBOK/EVM). Cliente agora
                  vê EXPLICITAMENTE qual é a data de corte oficial e quando é
                  a próxima atualização. Indicadores acima (PV/EV/Desvio/SPI)
                  são calculados em relação a essa data — entre uma quinta e a
                  próxima eles ficam congelados, evitando o "atraso fantasma"
                  típico de denominador rolando sozinho. */}
              {dataCorteInfo && (
                <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-semibold">
                    <CalendarCheck className="w-3 h-3" />
                    Status oficial — atualizado em {fmtBRDate(dataCorteInfo.oficial)}
                  </span>
                  <span className="text-slate-500">
                    Próxima atualização: <strong className="text-slate-700">{fmtBRDate(dataCorteInfo.proximaAtualizacao)}</strong> (quinta-feira)
                  </span>
                  {dataCorteInfo.nuncaFechado && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded-full">
                      Cutoff estimado (sem fechamento manual)
                    </span>
                  )}
                </div>
              )}
              {refisNumero != null && (
                <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Último REFIS oficial: Nº {String(refisNumero).padStart(3, "0")}
                  {refisSemana ? ` · semana ${refisSemana.split("-").reverse().join("/")}` : ""}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Barra horizontal de navegação por pílulas (2ª opção de navegação,
              em adição à sidebar lateral). Funciona bem em desktop, tablet e
              celular — em telas estreitas vira scroll horizontal. ─────── */}
        {abasVisiveis.length > 1 && (
          <div className="mb-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm p-2 print:hidden">
            <div className="flex flex-wrap gap-1.5">
              {abasVisiveis.map((a) => {
                const Icon = ABA_ICONS[a.key] || TrendingUp;
                const isActive = aba === a.key;
                const isEmBreve = a.status === "em_breve";
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setAba(a.key)}
                    className={`group inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200 shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                    title={a.label}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                    <span>{a.label}</span>
                    {isEmBreve && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">em breve</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Conteúdo ───────────────────────────────────────────── */}
        {isLoading && (
          <div className="bg-white border rounded-xl p-12 text-center text-slate-400">Carregando planejamento...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 text-sm">
            {error.message || "Erro ao carregar planejamento"}
          </div>
        )}

        {!isLoading && !error && obra && !projeto && (
          <Aviso>Esta obra ainda não possui um cronograma de planejamento publicado.</Aviso>
        )}
        {!isLoading && !error && projeto && !kpis && (
          <Aviso>O cronograma desta obra está em elaboração — nenhuma revisão consolidada ainda.</Aviso>
        )}

        {!isLoading && !error && kpis && (() => {
          const abaInfo = PORTAL_CLIENTE_ABAS.find((x) => x.key === aba);
          if (abaInfo?.status === "em_breve") {
            return (
              <div className="bg-white border rounded-xl p-12 text-center">
                <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">Aba "{abaInfo.label}" em breve</p>
                <p className="text-xs text-slate-500 mt-1">Esta visão está sendo preparada para o Portal do Cliente.</p>
              </div>
            );
          }
          if (aba === "visao_geral") return <AbaVisaoGeral kpis={kpis} projeto={projeto} obra={obra} semanaAtual={semanaAtual} atrasadas={atrasadas} proximas={proximas} atividadesTodas={atividadesTodas} refisLista={refisLista} />;
          if (aba === "cronograma") return <AbaCronograma atividades={atividadesTodas} />;
          if (aba === "avanco_semanal") return <AbaAvancoSemanal kpis={kpis} semanaAtual={semanaAtual} atrasadas={atrasadas} curvaData={curvaData} recoveryWindow={projeto?.recoveryWindowSemanas ?? 4} cutoffOficial={cutoffOficial} />;
          if (aba === "prog_semanal") return (
            <AbaProgSemanal
              atividadesTodas={atividadesTodas}
              refisLista={refisLista}
              nomeProjeto={obra?.nome ?? ""}
              nomeCliente={obra?.cliente ?? ""}
              curvaData={curvaData}
              recoveryWindow={projeto?.recoveryWindowSemanas ?? 4}
              calendarioJson={(data as any)?.calendarioJson ?? null}
              // Rev. 1682 — replicar ao Portal os mesmos dados que o
              // módulo Planejamento usa: cabeçalho LOTUS (logos), cutoff
              // oficial e datas do projeto (paridade absoluta no rodapé
              // ACUMULADO da Programação Semanal LOTUS).
              gerenciadoraNome={(obra as any)?.gerenciadoraNome ?? null}
              gerenciadoraLogoUrl={(obra as any)?.gerenciadoraLogoUrl ?? null}
              clienteLogoUrl={(obra as any)?.clienteLogoUrl ?? null}
              engenheiroResponsavel={(obra as any)?.responsavel ?? null}
              projetoStart={projeto?.dataInicio ?? null}
              projetoFinish={projeto?.dataTerminoContratual ?? null}
              cutoffIso={(data as any)?.dataCorte?.oficial ?? null}
              avancosLista={(data as any)?.avancosLista ?? null}
            />
          );
          if (aba === "curva_s") return <AbaCurvaS curvaData={curvaData} kpis={kpis} projeto={projeto} curvaMedicoes={curvaMedicoes} />;
          if (aba === "gantt") return <AbaGantt atividades={atividadesTodas} />;
          if (aba === "refis") return <AbaRefis refisLista={refisLista} atividades={atividadesTodas} curvaData={curvaData} curvaMedicoes={curvaMedicoes} obra={obra} projeto={projeto} incluirIndiretas={incluirIndiretas} setIncluirIndiretas={setIncluirIndiretas} topPrevisto={topPrevisto} topRealizado={topRealizado} />;
          if (aba === "caminho_critico") return <AbaCaminhoCritico atividades={atividadesTodas} projeto={projeto} />;
          if (aba === "efetivo") return <AbaEfetivo token={token} obraId={obraId} />;
          // Rev. 1535 — Mesma regra da aba Curva S Financeira: prefere o
          // total de venda do orçamento vinculado e cai no valorContrato
          // cadastrado só como fallback, garantindo que o cliente veja R$
          // em obras com orçamento bem definido mas sem valorContrato.
          if (aba === "crono_financeiro") return <AbaCronoFinanceiro curvaS={curvaS} valorContrato={Number(projeto?.orcamentoTotalVenda) || Number(projeto?.valorContrato) || 0} />;
          if (aba === "prev_medicao") return <AbaPrevMedicao curvaS={curvaS} valorContrato={Number(projeto?.orcamentoTotalVenda) || Number(projeto?.valorContrato) || 0} />;
          if (aba === "diagrama_rede") return <AbaDiagramaRede atividades={atividadesTodas} />;
          if (aba === "custo_rh") return <AbaCustoRh efetivoMensal={efetivoMensal} />;
          if (aba === "bim_3d") return <AbaBim3D obra={obra} />;
          if (aba === "revisoes") return <AbaRevisoes revisoes={revisoes} />;
          return null;
        })()}
        </div>
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800 text-sm">{children}</div>
  );
}

function AbaVisaoGeral({ kpis, projeto: _projeto, obra, semanaAtual: _sa, atrasadas: _atr, proximas: _prox, atividadesTodas, refisLista }: any) {
  const localTempo = obra?.cidade || obra?.endereco || null;

  // ── Lógica idêntica à VisaoGeral interna (PlanejamentoDetalhe.tsx ~1297) ──
  const totalAtiv  = (atividadesTodas || []).filter((a: any) => !a.isGrupo && !a.isIndireta && !a.disabled).length;
  const concluidas = (atividadesTodas || []).filter((a: any) => !a.isGrupo && !a.isIndireta && !a.disabled && (a.percentRealizado ?? 0) >= 100).length;
  const ultimoRefis = (refisLista || [])[0];
  const cpi = ultimoRefis ? Number(ultimoRefis.cpi || 0) : 1;
  const realizado = kpis.realizado as number;
  const previsto  = kpis.previsto as number;
  const spi = (previsto && previsto > 0) ? realizado / previsto : (realizado > 0 ? 1 : 0);
  const spiValido = previsto !== null && previsto > 0;

  // Atividades em atraso (deveria > realizado)
  const hoje = new Date().toISOString().split("T")[0];
  const progressoEsperadoHoje = (a: any): number => {
    if (!a.dataInicio || !a.dataFim) return a.dataFim && a.dataFim <= hoje ? 100 : 0;
    const ini = new Date(a.dataInicio).getTime();
    const fim = new Date(a.dataFim).getTime();
    const ag  = new Date(hoje).getTime();
    if (ag >= fim) return 100;
    if (ag <= ini) return 0;
    return Math.round(((ag - ini) / (fim - ini)) * 100);
  };
  const criticas = (atividadesTodas || []).filter((a: any) => {
    if (a.isGrupo || a.disabled) return false;
    const real = a.percentRealizado ?? 0;
    if (real >= 100) return false;
    return progressoEsperadoHoje(a) > real;
  });

  const kpiCards = [
    {
      label: "Atividades",
      value: `${concluidas}/${totalAtiv}`,
      color: "text-blue-600",
      bg: "bg-blue-50",
      icon: <ClipboardList className="h-4 w-4" />,
      titulo: "Atividades concluídas / total",
      explicacao: "Mostra quantas atividades já chegaram a 100% de avanço (numerador) em relação ao total cadastrado no cronograma (denominador). Quanto mais alto, mais perto do encerramento da obra.",
    },
    {
      label: "Avanço Físico",
      value: fmtPct(realizado),
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      icon: <TrendingUp className="h-4 w-4" />,
      titulo: "Avanço Físico Realizado",
      explicacao: "Percentual ponderado de execução acumulada da obra, calculado pela média do progresso de cada atividade multiplicado pelo seu peso financeiro. Representa o quanto, em valor, da obra já foi efetivamente entregue.",
    },
    {
      label: "SPI (prazo)",
      value: spiValido ? spi.toFixed(2) : "—",
      color: !spiValido ? "text-slate-400" : spi >= 1 ? "text-emerald-600" : "text-red-600",
      bg: !spiValido ? "bg-slate-100" : spi >= 1 ? "bg-emerald-50" : "bg-red-50",
      icon: <Activity className="h-4 w-4" />,
      detail: spiValido ? `${realizado.toFixed(1)}% ÷ ${previsto.toFixed(1)}%` : undefined,
      titulo: "SPI — Schedule Performance Index (prazo)",
      explicacao: "Indicador de desempenho de prazo: divide o avanço Realizado pelo avanço Previsto na data de hoje. SPI = 1,00 → no prazo. SPI > 1,00 → adiantado. SPI < 1,00 → atrasado. Ex.: 0,57 significa que a obra está executando apenas 57% do que deveria nesta data.",
    },
    {
      label: "CPI (custo)",
      value: cpi.toFixed(2),
      color: cpi >= 1 ? "text-emerald-600" : "text-red-600",
      bg: cpi >= 1 ? "bg-emerald-50" : "bg-red-50",
      icon: <DollarSign className="h-4 w-4" />,
      titulo: "CPI — Cost Performance Index (custo)",
      explicacao: "Indicador de desempenho de custo: divide o valor agregado (trabalho entregue convertido em R$) pelo custo real gasto até a data. CPI = 1,00 → orçamento exato. CPI > 1,00 → economia. CPI < 1,00 → estouro de orçamento.",
    },
    {
      label: "REFIs emitidos",
      value: String((refisLista || []).length),
      color: "text-purple-600",
      bg: "bg-purple-50",
      icon: <FileText className="h-4 w-4" />,
      titulo: "REFIs (Relatórios Físicos) Emitidos",
      explicacao: "Total de Relatórios Físicos semanais já emitidos e consolidados pela equipe da obra. Cada REFI é o documento oficial assinado contendo o avanço físico e financeiro daquela semana de referência. Acesse a aba REFIS para ver todos.",
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs (idênticos ao interno) — clicáveis: abrem popover com explicação
          (funciona em desktop por hover/clique e em iPad/celular por toque). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map((k, i) => (
          <UiPopover key={i}>
            <UiPopoverTrigger asChild>
              <button
                type="button"
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-col gap-2 cursor-pointer transition-shadow hover:shadow-md hover:border-slate-200 active:scale-[0.98] text-left relative w-full"
                aria-label={`${k.label}: tocar para ver explicação`}
              >
                {/* Ícone "ℹ" no canto superior direito — deixa claro que é tocável */}
                <span className="absolute top-2 right-2 text-slate-300">
                  <InfoIcon className="h-3.5 w-3.5" />
                </span>
                <div className={`w-8 h-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center`}>{k.icon}</div>
                <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
                <p className={`text-base font-bold ${k.color} leading-tight`}>{k.value}</p>
                {(k as any).detail && <p className="text-[9px] text-slate-400 leading-tight -mt-1">{(k as any).detail}</p>}
              </button>
            </UiPopoverTrigger>
            <UiPopoverContent side="bottom" align="start" className="max-w-[300px] p-4 bg-slate-900 text-white border-slate-700 shadow-xl">
              <p className="font-semibold text-[13px] mb-2 leading-tight text-white">{(k as any).titulo}</p>
              <p className="text-[12px] leading-snug text-slate-200">{(k as any).explicacao}</p>
              <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-700">Toque fora para fechar</p>
            </UiPopoverContent>
          </UiPopover>
        ))}
      </div>

      {/* Atividades em Atraso (com barras Deveria/Hoje) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Atividades em Atraso ({criticas.length})
          </p>
        </div>
        {criticas.length === 0 ? (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Nenhuma atividade em atraso
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {criticas.map((a: any) => {
              const real = a.percentRealizado ?? 0;
              const esperado = progressoEsperadoHoje(a);
              const desvio = real - esperado;
              return (
                <div key={a.id} className="p-2 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center gap-1 mb-1.5">
                    {a.eapCodigo && <span className="text-[10px] text-red-400 font-mono shrink-0">{a.eapCodigo}</span>}
                    <span className="text-xs text-slate-700 truncate font-medium">{a.nome}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 w-16 shrink-0">Deveria:</span>
                      <div className="flex-1 bg-blue-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(esperado, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 w-8 text-right shrink-0">{esperado.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 w-16 shrink-0">Hoje:</span>
                      <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(real, 100)}%`,
                          background: real === 0 ? '#d1d5db' : desvio >= -5 ? '#22c55e' : desvio >= -20 ? '#f59e0b' : '#ef4444',
                        }} />
                      </div>
                      <span className="text-[10px] font-bold text-red-700 w-8 text-right shrink-0">{real.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Previsão do tempo */}
      <WeatherWidget local={localTempo} />

      {/* Histórico de REFIs */}
      {(refisLista || []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 overflow-x-auto">
          <p className="text-sm font-semibold text-slate-700 mb-3">Histórico de REFIs</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="py-2 px-3 text-left">Nº</th>
                <th className="py-2 px-3 text-left">Semana</th>
                <th className="py-2 px-3 text-right">Prev. %</th>
                <th className="py-2 px-3 text-right">Real. %</th>
                <th className="py-2 px-3 text-right">SPI</th>
                <th className="py-2 px-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {refisLista.slice(0, 8).map((r: any, i: number) => {
                const prev = Number(r.avancoPrevisto || 0);
                const reali = Number(r.avancoRealizado || 0);
                const spiR = Number(r.spi || 0);
                return (
                  <tr key={r.id ?? i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="py-1.5 px-3 font-mono text-slate-600">{String(r.numero ?? i + 1).padStart(3, "0")}</td>
                    <td className="py-1.5 px-3 text-slate-700">{fmtBR(r.semana)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-600">{fmtPct(prev)}</td>
                    <td className="py-1.5 px-3 text-right font-semibold text-emerald-700">{fmtPct(reali)}</td>
                    <td className={`py-1.5 px-3 text-right font-bold ${prev === 0 ? "text-slate-400" : spiR >= 1 ? "text-emerald-700" : "text-red-600"}`}>
                      {prev === 0 ? "—" : spiR.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium w-fit inline-block ${r.status === "consolidado" ? "bg-emerald-600 text-white" : r.status === "emitido" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WEATHER WIDGET — Previsão do Tempo (cópia funcional da tela interna)
// ═════════════════════════════════════════════════════════════════════════════
const CIDADES_BR_PORTAL: Record<string, [number, number]> = {
  "rio de janeiro": [-22.9, -43.17], "sao paulo": [-23.55, -46.63], "são paulo": [-23.55, -46.63],
  "belo horizonte": [-19.92, -43.94], "brasilia": [-15.78, -47.93], "brasília": [-15.78, -47.93],
  "salvador": [-12.97, -38.5], "fortaleza": [-3.72, -38.54], "recife": [-8.05, -34.88],
  "porto alegre": [-30.03, -51.23], "manaus": [-3.12, -60.02], "belem": [-1.46, -48.49],
  "belém": [-1.46, -48.49], "goiania": [-16.68, -49.25], "goiânia": [-16.68, -49.25],
  "curitiba": [-25.43, -49.27], "campinas": [-22.9, -47.06], "niteroi": [-22.88, -43.1],
  "niterói": [-22.88, -43.1], "aparecida": [-22.85, -45.23],
};
function getCoordsFromLocalPortal(local: string | null | undefined): [number, number] {
  if (!local) return [-22.9, -43.17];
  const lower = local.toLowerCase();
  for (const [key, coords] of Object.entries(CIDADES_BR_PORTAL)) {
    if (lower.includes(key)) return coords;
  }
  return [-22.9, -43.17];
}
const WMO_PORTAL: Record<number, { label: string; icon: string; crit: boolean }> = {
  0: { label: "Céu limpo", icon: "☀️", crit: false },
  1: { label: "Predomin. limpo", icon: "🌤️", crit: false },
  2: { label: "Parcialmente nublado", icon: "⛅", crit: false },
  3: { label: "Nublado", icon: "☁️", crit: false },
  45: { label: "Neblina", icon: "🌫️", crit: false },
  48: { label: "Geada", icon: "🌫️", crit: false },
  51: { label: "Garoa leve", icon: "🌦️", crit: true },
  53: { label: "Garoa moderada", icon: "🌦️", crit: true },
  55: { label: "Garoa intensa", icon: "🌧️", crit: true },
  61: { label: "Chuva leve", icon: "🌧️", crit: true },
  63: { label: "Chuva moderada", icon: "🌧️", crit: true },
  65: { label: "Chuva forte", icon: "🌧️", crit: true },
  80: { label: "Pancadas leves", icon: "🌦️", crit: true },
  81: { label: "Pancadas moderadas", icon: "🌧️", crit: true },
  82: { label: "Pancadas fortes", icon: "⛈️", crit: true },
  95: { label: "Tempestade", icon: "⛈️", crit: true },
  96: { label: "Tempestade c/ granizo", icon: "⛈️", crit: true },
  99: { label: "Tempestade c/ granizo", icon: "⛈️", crit: true },
};
const wmoInfoPortal = (code: number) => WMO_PORTAL[code] ?? { label: `Cód ${code}`, icon: "🌡️", crit: false };
const DIAS_PT_PORTAL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function WeatherWidget({ local }: { local: string | null | undefined }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [coords, setCoords] = useState<[number, number]>(getCoordsFromLocalPortal(local));

  useEffect(() => { setCoords(getCoordsFromLocalPortal(local)); }, [local]);

  useEffect(() => {
    const [lat, lon] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=America%2FSao_Paulo&forecast_days=7`;
    fetch(url).then(r => r.json()).then(d => setDados(d)).catch(() => setErro(true));
  }, [coords]);

  if (erro) return null;
  if (!dados) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando previsão do tempo...
    </div>
  );
  const { daily } = dados;
  if (!daily) return null;

  const diasUteis = daily.time.map((dt: string, i: number) => {
    const d = new Date(dt + "T12:00:00");
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return null;
    return {
      dt, dow,
      code: daily.weather_code[i],
      chuva: parseFloat(daily.precipitation_sum[i] ?? "0"),
      probChuva: parseInt(daily.precipitation_probability_max[i] ?? "0"),
      vento: parseFloat(daily.wind_speed_10m_max[i] ?? "0"),
    };
  }).filter(Boolean).slice(0, 5);

  const alertas: string[] = [];
  diasUteis.forEach((d: any) => {
    const dayName = DIAS_PT_PORTAL[d.dow];
    if (d.code >= 95) alertas.push(`⛈️ ${dayName}: Tempestade prevista — recomendável paralisar operações externas e içamentos`);
    else if (d.chuva > 10) alertas.push(`🌧️ ${dayName}: Chuva > 10mm — atividades externas e armação impactadas`);
    else if (d.probChuva > 70) alertas.push(`🌦️ ${dayName}: Alta probabilidade de chuva (${d.probChuva}%) — planeje atividades internas como alternativa`);
    if (d.vento > 50) alertas.push(`💨 ${dayName}: Ventos muito fortes (${d.vento.toFixed(0)} km/h) — paralisar içamentos e andaimes`);
    else if (d.vento > 30) alertas.push(`💨 ${dayName}: Ventos fortes (${d.vento.toFixed(0)} km/h) — atenção com guindaste e estruturas temporárias`);
  });

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blue-500" />
          Previsão do Tempo — Semana Útil
        </p>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {local ?? "Rio de Janeiro"}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {diasUteis.map((d: any) => {
          const info = wmoInfoPortal(d.code);
          const isCrit = info.crit || d.probChuva > 70 || d.vento > 30;
          return (
            <div key={d.dt} className={`rounded-lg p-2 text-center border ${isCrit ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
              <p className="text-[10px] font-semibold text-slate-500">{DIAS_PT_PORTAL[d.dow]}</p>
              <p className="text-[10px] text-slate-400">{new Date(d.dt + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
              <p className="text-2xl my-1">{info.icon}</p>
              <p className="text-[9px] text-slate-600 leading-tight">{info.label}</p>
              <div className="mt-1 space-y-0.5">
                {d.probChuva > 0 && (
                  <p className="text-[9px] text-blue-600 flex items-center justify-center gap-0.5">
                    <Droplets className="h-2.5 w-2.5" />{d.probChuva}%
                  </p>
                )}
                {d.chuva > 0 && (
                  <p className="text-[9px] text-blue-700 font-semibold">{d.chuva.toFixed(1)}mm</p>
                )}
                <p className="text-[9px] text-slate-500 flex items-center justify-center gap-0.5">
                  <Wind className="h-2.5 w-2.5" />{d.vento.toFixed(0)} km/h
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Pontos de Atenção ({alertas.length})
          </p>
          {alertas.map((a, i) => (
            <p key={i} className="text-xs text-amber-700">{a}</p>
          ))}
        </div>
      )}
      {alertas.length === 0 && (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Sem alertas meteorológicos para a semana — condições favoráveis para trabalhos externos
        </p>
      )}
    </div>
  );
}

// ── Helpers de período (espelhados do módulo interno) ──────────────────────
type PeriodoFiltroPortal = "tudo" | "dia" | "semana" | "mes" | "ano" | "intervalo";

function getPeriodoRangePortal(p: PeriodoFiltroPortal, customIni?: string, customFim?: string): [string, string] | null {
  if (p === "tudo") return null;
  if (p === "intervalo") {
    if (customIni && customFim && customIni <= customFim) return [customIni, customFim];
    if (customIni && !customFim) return [customIni, customIni];
    return null;
  }
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (p === "dia") return [fmt(hoje), fmt(hoje)];
  if (p === "semana") {
    const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay() + 1);
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    return [fmt(ini), fmt(fim)];
  }
  if (p === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return [fmt(ini), fmt(fim)];
  }
  if (p === "ano") {
    return [`${hoje.getFullYear()}-01-01`, `${hoje.getFullYear()}-12-31`];
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// AbaCronograma — Espelho somente-leitura da Cronograma do módulo interno
// (PlanejamentoDetalhe.tsx ~2429). Preserva: filtro de período, níveis N1..Nx,
// Tudo/Recolher, busca EAP/nome, soma do peso%, hierarquia colapsável, marcos,
// tag Indireta, destaque de atrasadas (linha vermelha + alerta) e concluídas
// (verde). NÃO inclui edição, importação, exclusão, consolidação ou seleção
// em bloco — cliente é apenas visualizador.
// ──────────────────────────────────────────────────────────────────────────────
function AbaCronograma({ atividades }: { atividades: any[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [nivelAtivo, setNivelAtivo] = useState<number | null>(null);
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltroPortal>("tudo");
  const [intervaloIni, setIntervaloIni] = useState("");
  const [intervaloFim, setIntervaloFim] = useState("");
  const [busca, setBusca] = useState("");

  // Atividades ordenadas por EAP (numeric collation)
  const ativOrdenadas = useMemo(() =>
    atividades.slice().sort((a, b) =>
      (a.eapCodigo || "").localeCompare(b.eapCodigo || "", "pt-BR", { numeric: true })
    ),
    [atividades]
  );

  // Mapa de sucessoras (EAP → EAPs que a têm como predecessora)
  const sucessorasMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    ativOrdenadas.forEach((a: any) => {
      if (!a.predecessora) return;
      a.predecessora.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean).forEach((p: string) => {
        if (!m[p]) m[p] = [];
        if (a.eapCodigo && !m[p].includes(a.eapCodigo)) m[p].push(a.eapCodigo);
      });
    });
    return m;
  }, [ativOrdenadas]);

  // Nível máximo de grupos + lista de EAPs de grupos
  const maxNivel = useMemo(() =>
    ativOrdenadas.filter((a: any) => a.isGrupo).reduce((m: number, a: any) => Math.max(m, a.nivel ?? 1), 1),
    [ativOrdenadas]
  );
  const gruposEap = useMemo(() =>
    ativOrdenadas.filter((a: any) => a.isGrupo && a.eapCodigo).map((a: any) => a.eapCodigo as string),
    [ativOrdenadas]
  );

  function toggleCollapse(eap: string) {
    setCollapsed(s => {
      const ns = new Set(s);
      ns.has(eap) ? ns.delete(eap) : ns.add(eap);
      return ns;
    });
  }

  function isHidden(eap: string) {
    if (!eap) return false;
    if (busca.trim()) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join(".");
      if (collapsed.has(parent)) return true;
    }
    return false;
  }

  function expandirAteNivel(nivel: number) {
    setCollapsed(new Set(
      ativOrdenadas
        .filter((a: any) => a.isGrupo && a.eapCodigo && (a.nivel ?? 1) >= nivel)
        .map((a: any) => a.eapCodigo as string)
    ));
  }

  const periodoRange = useMemo(
    () => getPeriodoRangePortal(periodoFiltro, intervaloIni, intervaloFim),
    [periodoFiltro, intervaloIni, intervaloFim]
  );

  // Aplicar filtros de período + busca, mantendo grupos pais visíveis
  const displayAtiv = useMemo(() => {
    let base = ativOrdenadas;
    if (periodoRange) {
      const [ini, fim] = periodoRange;
      const matchIds = new Set(
        base.filter((a: any) => {
          if (!a.dataInicio) return false;
          const inicioNoPeriodo = a.dataInicio >= ini && a.dataInicio <= fim;
          const fimNoPeriodo = a.dataFim && a.dataFim >= ini && a.dataFim <= fim;
          return inicioNoPeriodo || fimNoPeriodo;
        }).map((a: any) => a.id)
      );
      if (matchIds.size === 0) return [];
      const parentEaps = new Set<string>();
      base.filter((a: any) => matchIds.has(a.id) && a.eapCodigo).forEach((a: any) => {
        const parts = String(a.eapCodigo).split(".");
        for (let i = 1; i < parts.length; i++) parentEaps.add(parts.slice(0, i).join("."));
      });
      base = base.filter((a: any) => matchIds.has(a.id) || (a.isGrupo && a.eapCodigo && parentEaps.has(a.eapCodigo)));
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      const matchIds = new Set(
        base.filter((a: any) => {
          const nome = (a.nome || "").toLowerCase();
          const eap = (a.eapCodigo || "").toLowerCase();
          return nome.includes(q) || eap.includes(q);
        }).map((a: any) => a.id)
      );
      if (matchIds.size === 0) return [];
      const parentEaps = new Set<string>();
      base.filter((a: any) => matchIds.has(a.id) && a.eapCodigo).forEach((a: any) => {
        const parts = String(a.eapCodigo).split(".");
        for (let i = 1; i < parts.length; i++) parentEaps.add(parts.slice(0, i).join("."));
      });
      base = base.filter((a: any) => matchIds.has(a.id) || (a.isGrupo && a.eapCodigo && parentEaps.has(a.eapCodigo)));
    }
    return base;
  }, [ativOrdenadas, periodoRange, busca]);

  const folhasTotal = ativOrdenadas.filter((a: any) => !a.isGrupo).length;
  const folhasFiltradas = displayAtiv.filter((a: any) => !a.isGrupo).length;
  const hoje = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-3">
      {/* Linha 1 — título + contador */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">Cronograma completo</p>
          <span className="text-xs text-slate-400">
            {(periodoRange || busca.trim())
              ? <>{folhasFiltradas} <span className="text-blue-500">de {folhasTotal}</span> atividades</>
              : <>{ativOrdenadas.length} itens</>}
          </span>
        </div>
      </div>

      {/* Linha 2 — período + níveis + Tudo/Recolher + busca */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Período */}
        <div className="flex items-center gap-1 flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {(["tudo", "dia", "semana", "mes", "ano", "intervalo"] as PeriodoFiltroPortal[]).map(p => (
            <button key={p} onClick={() => setPeriodoFiltro(p)}
              className={`h-6 px-2 text-[11px] font-semibold rounded border transition-colors ${periodoFiltro === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {p === "tudo" ? "Tudo" : p === "dia" ? "Hoje" : p === "semana" ? "Semana" : p === "mes" ? "Mês" : p === "ano" ? "Ano" : "Intervalo"}
            </button>
          ))}
          {periodoFiltro === "intervalo" && (
            <div className="flex items-center gap-1 ml-1">
              <input type="date" value={intervaloIni} onChange={e => setIntervaloIni(e.target.value)}
                className="h-6 border border-slate-200 rounded px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700" />
              <span className="text-[10px] text-slate-400">até</span>
              <input type="date" value={intervaloFim} onChange={e => setIntervaloFim(e.target.value)}
                className="h-6 border border-slate-200 rounded px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700" />
              {(intervaloIni || intervaloFim) && (
                <button onClick={() => { setIntervaloIni(""); setIntervaloFim(""); }}
                  className="h-6 w-6 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-red-50 hover:border-red-300 text-slate-400 hover:text-red-500 transition-colors"
                  title="Limpar intervalo">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {periodoFiltro !== "tudo" && !(periodoFiltro === "intervalo" && !periodoRange) && (
            <span className="text-[10px] text-blue-600 font-medium ml-1">{folhasFiltradas} atividades</span>
          )}
        </div>

        {/* Níveis */}
        {gruposEap.length > 0 && <div className="w-px h-4 bg-slate-200" />}
        {gruposEap.length > 0 && <span className="text-[11px] text-slate-500 font-medium">Nível:</span>}
        {Array.from({ length: maxNivel }, (_, i) => i + 1).map(lvl => {
          const isAtivo = nivelAtivo === lvl;
          return (
            <button key={lvl} title={`Expandir até nível ${lvl}`}
              onClick={() => { expandirAteNivel(lvl + 1); setNivelAtivo(lvl); }}
              className={`h-6 min-w-[28px] px-1.5 text-[11px] font-semibold rounded border transition-colors
                ${isAtivo ? "bg-slate-700 text-white border-slate-700 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-400"}`}>
              N{lvl}
            </button>
          );
        })}

        {/* Tudo / Recolher */}
        {gruposEap.length > 0 && (
          <>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button onClick={() => { setCollapsed(new Set()); setNivelAtivo(null); }}
              className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
              <ChevronDown className="h-3 w-3" /> Tudo
            </button>
            <button onClick={() => { setCollapsed(new Set(gruposEap)); setNivelAtivo(0); }}
              className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-400 text-slate-600 flex items-center gap-1 transition-colors">
              <ChevronRight className="h-3 w-3" /> Recolher
            </button>
            {nivelAtivo !== null && (
              <span className="text-[10px] text-slate-400 ml-1">
                {nivelAtivo === 0 ? "Tudo recolhido" : `Mostrando até N${nivelAtivo}`}
              </span>
            )}
          </>
        )}

        {/* Busca */}
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar Item ou atividade..." value={busca} onChange={e => setBusca(e.target.value)}
            className="h-7 w-56 pl-7 pr-7 text-[11px] border border-slate-200 rounded-md bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors" />
          {busca && (
            <button onClick={() => setBusca("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Limpar busca">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {busca.trim() && (
          <span className="text-[10px] text-blue-600 font-medium">
            {folhasFiltradas} resultado{folhasFiltradas !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Indicador de soma de Peso% */}
      {ativOrdenadas.length > 0 && (() => {
        const folhas = ativOrdenadas.filter((a: any) => !a.isGrupo && !a.disabled);
        const soma = folhas.reduce((s: number, a: any) => s + Number(a.pesoFinanceiro || 0), 0);
        const ok = Math.abs(soma - 100) < 0.1;
        const overshot = soma > 100.05;
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold w-fit
            ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : overshot ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            <span className="text-[11px] font-normal text-inherit opacity-70">Soma Peso%:</span>
            <span className="tabular-nums text-sm">{ok ? "100,00" : soma.toFixed(2).replace(".", ",")}%</span>
            {ok
              ? <span className="text-[10px] font-bold tracking-wide">✓ 100%</span>
              : <span className="text-[10px]">{overshot ? "▲ acima de 100%" : `▼ faltam ${(100 - soma).toFixed(2).replace(".", ",")}%`}</span>}
          </div>
        );
      })()}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="py-2 px-2 text-left text-[11px]">Item</th>
              <th className="py-2 px-2 text-left text-[11px]">Atividade</th>
              <th className="py-2 px-2 text-left text-[11px] whitespace-nowrap">Início</th>
              <th className="py-2 px-2 text-left text-[11px] whitespace-nowrap">Fim</th>
              <th className="py-2 px-2 text-right text-[11px]">Dur.</th>
              <th className="py-2 px-2 text-center w-16 text-[11px]">Pred.</th>
              <th className="py-2 px-2 text-center w-16 text-[11px]">Suc.</th>
              <th className="py-2 px-2 text-right text-[11px] whitespace-nowrap min-w-[64px]">Peso%</th>
              <th className="py-2 px-2 text-left text-[11px]">Recurso</th>
              <th className="py-2 px-3 text-right w-20 text-[11px]">Avanço</th>
            </tr>
          </thead>
          <tbody>
            {displayAtiv.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">
                  {(busca.trim() || periodoRange)
                    ? <>Nenhuma atividade encontrada para os filtros aplicados.</>
                    : <>Nenhuma atividade cadastrada.</>}
                </td>
              </tr>
            )}
            {displayAtiv.map((a: any, idx: number) => {
              if (isHidden(a.eapCodigo)) return null;
              const hasChildren = displayAtiv.some((b: any) =>
                b.eapCodigo && a.eapCodigo && b.eapCodigo.startsWith(a.eapCodigo + "."));
              const isCollapsed = collapsed.has(a.eapCodigo);
              const indent = a.nivel ? (a.nivel - 1) * 16 : 0;
              const avanco = Number(a.percentRealizado ?? 0);
              const isMarco = a.dataInicio && a.dataFim && a.dataInicio === a.dataFim;
              const atrasada = !hasChildren && !isMarco && a.dataFim && a.dataFim < hoje && avanco < 100;
              const concluida = !hasChildren && avanco >= 100;
              const nivel = a.nivel ?? 1;

              const rowBg = a.disabled
                ? "bg-slate-100 opacity-60 border-l-4 border-l-slate-400"
                : concluida
                  ? "bg-emerald-50 border-l-4 border-l-emerald-400"
                  : atrasada
                    ? "bg-red-50 border-l-4 border-l-red-400"
                    : a.isMarco
                      ? "bg-purple-50/40 border-l-4 border-l-purple-400"
                      : a.isIndireta
                        ? "bg-gray-100 border-l-4 border-l-gray-400"
                        : a.isGrupo && nivel === 1
                          ? "bg-yellow-50 border-l-4 border-l-yellow-400"
                          : a.isGrupo && nivel === 2
                            ? "bg-amber-50/60 border-l-4 border-l-amber-300"
                            : a.isGrupo
                              ? "bg-slate-50 border-l-4 border-l-slate-300"
                              : idx % 2 === 0 ? "bg-white" : "bg-slate-50/30";

              return (
                <tr key={a.id ?? idx}
                  className={`group border-b border-slate-100 ${rowBg} ${a.isGrupo ? "font-semibold" : ""} ${a.disabled ? "line-through text-slate-400" : ""}`}>
                  <td className="py-1.5 px-2 font-mono text-slate-500 text-[11px]">{a.eapCodigo ?? ""}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                      {hasChildren && (
                        <button onClick={() => toggleCollapse(a.eapCodigo)}
                          className="p-0.5 rounded hover:bg-slate-100 shrink-0">
                          {isCollapsed
                            ? <ChevronRight className="h-3 w-3 text-slate-400" />
                            : <ChevronDown className="h-3 w-3 text-slate-400" />}
                        </button>
                      )}
                      <span className={`text-[12px] leading-tight ${a.isGrupo ? "text-slate-900 font-bold uppercase tracking-wide" : "text-slate-700"} ${atrasada ? "text-red-700" : ""} ${concluida ? "text-emerald-800" : ""}`}>
                        {a.nome}
                      </span>
                      {a.isMarco && (
                        <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-semibold shrink-0">
                          ◆ Marco
                        </span>
                      )}
                      {a.isIndireta && (
                        <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-semibold shrink-0">
                          Indireta
                        </span>
                      )}
                      {a.isExterna && (
                        <span
                          title={`Atividade externa — executada por terceiro fora do escopo da FC.${a.externaResponsavel ? ` Responsável: ${a.externaResponsavel}` : ""}`}
                          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-semibold shrink-0 border border-amber-300 cursor-help"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" /> EXTERNA
                        </span>
                      )}
                      {concluida && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-1 shrink-0" />
                      )}
                      {atrasada && (
                        <span title={`Atividade atrasada — fim: ${fmtBR(a.dataFim)} · avanço: ${avanco.toFixed(1)}%`}>
                          <AlertTriangle className="h-3 w-3 text-red-500 ml-1 shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                  <td className="py-1.5 px-2 text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-500 text-[11px] tabular-nums">
                    {a.duracaoDias ? `${a.duracaoDias}d` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center align-middle">
                    {(() => {
                      const raw = (a.predecessora ?? "").toString();
                      const arr = raw ? raw.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [];
                      if (arr.length === 0) return <span className="text-slate-300 text-[11px]">—</span>;
                      return (
                        <UiPopover>
                          <UiPopoverTrigger asChild>
                            <button
                              type="button"
                              title={`Clique para ver as ${arr.length} predecessoras`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-200 hover:bg-blue-100 active:bg-blue-200 transition cursor-pointer"
                            >
                              ← {arr.length}
                            </button>
                          </UiPopoverTrigger>
                          <UiPopoverContent side="bottom" align="center" className="w-auto max-w-[260px] p-3">
                            <div className="text-[11px] font-semibold text-slate-700 mb-2">
                              Predecessoras ({arr.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {arr.map((p: string, i: number) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono border border-blue-200">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </UiPopoverContent>
                        </UiPopover>
                      );
                    })()}
                  </td>
                  <td className="py-1.5 px-2 text-center align-middle">
                    {(() => {
                      const sucs = a.eapCodigo ? (sucessorasMap[a.eapCodigo] ?? []) : [];
                      if (sucs.length === 0) return <span className="text-slate-300 text-[11px]">—</span>;
                      return (
                        <UiPopover>
                          <UiPopoverTrigger asChild>
                            <button
                              type="button"
                              title={`Clique para ver as ${sucs.length} sucessoras`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold border border-violet-200 hover:bg-violet-100 active:bg-violet-200 transition cursor-pointer"
                            >
                              {sucs.length} →
                            </button>
                          </UiPopoverTrigger>
                          <UiPopoverContent side="bottom" align="center" className="w-auto max-w-[260px] p-3">
                            <div className="text-[11px] font-semibold text-slate-700 mb-2">
                              Sucessoras ({sucs.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {sucs.map((s: string, i: number) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-mono border border-violet-200">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </UiPopoverContent>
                        </UiPopover>
                      );
                    })()}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{Number(a.pesoFinanceiro || 0).toFixed(2)}%</td>
                  <td className="py-1.5 px-2 text-slate-500 text-[11px] truncate max-w-[120px]">{a.recursoPrincipal || <span className="text-slate-300">—</span>}</td>
                  <td className="py-1.5 px-3 text-right">
                    {!a.isGrupo && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-[11px] font-bold tabular-nums ${avanco >= 100 ? "text-emerald-700" : avanco > 0 ? "text-blue-700" : "text-slate-400"}`}>
                          {fmtPct(avanco)}
                        </span>
                        {avanco > 0 && avanco < 100 && (
                          <div className="w-12 h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${avanco}%` }} />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaAvancoSemanal({ kpis, semanaAtual, atrasadas, curvaData, recoveryWindow, cutoffOficial }: any) {
  // Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02). CONGELADA pro cliente:
  // exibe só a meta diluída + data de convergência que o engenheiro definiu.
  const janelaRecuperacao = Math.max(1, recoveryWindow ?? 4);
  // Rev. 1528 — KPIs corretos por SEMANA (delta da Curva S), não por atividade ativa.
  // O "Previsto na semana" é o quanto o projeto DEVE avançar nesta semana (delta da
  // curva planejada). O "Realizado na semana" é o quanto efetivamente avançou.
  // O peso bruto das atividades ativas é informativo e foi mantido como nota auxiliar.
  const semIni: string | undefined = kpis?.semanaInicio;
  const acumAt = (arr: { semana: string; acumulado: number }[] | undefined, semFim: string | undefined): number => {
    if (!arr || !arr.length || !semFim) return 0;
    const ord = arr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
    let last = 0;
    for (const p of ord) { if (p.semana <= semFim) last = p.acumulado; else break; }
    return last;
  };
  const semIniDate = semIni ? new Date(semIni + "T12:00:00") : null;
  const semAntStr = semIniDate ? new Date(semIniDate.getTime() - 7 * 86400000).toISOString().slice(0, 10) : undefined;
  const planejadaArr = (curvaData?.curvaPlanejada?.length ? curvaData.curvaPlanejada : curvaData?.curvaBaseline) as { semana: string; acumulado: number }[] | undefined;
  const realizadaArr = curvaData?.curvaRealizada as { semana: string; acumulado: number }[] | undefined;
  const planAtual = acumAt(planejadaArr, semIni);
  const planAntes = acumAt(planejadaArr, semAntStr);
  const realAtual = acumAt(realizadaArr, semIni);
  const realAntes = acumAt(realizadaArr, semAntStr);
  const previstoSemana = Math.max(0, planAtual - planAntes);
  const realizadoSemana = Math.max(0, realAtual - realAntes);
  const aderencia = previstoSemana > 0 ? (realizadoSemana / previstoSemana) * 100 : null;
  const adOk = aderencia == null ? null : aderencia >= 95;
  const pesoAtivas = semanaAtual.reduce((s: number, a: any) => s + (a.pesoFinanceiro || 0), 0);
  // Rev. 1533 — Débito acumulado + Meta de recuperação (PMBOK 7ª/AACE 23R-02).
  // PV é IMUTÁVEL (baseline). Débito = Schedule Variance negativo até o fim da semana anterior.
  // Meta = Previsto baseline + Débito → o quanto entregar HOJE para zerar atraso.
  const debitoAcumulado = Math.max(0, planAntes - realAntes);
  const metaRecuperacao = previstoSemana + debitoAcumulado;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Atividades na semana" value={String(semanaAtual.length)} icon={<Activity className="w-5 h-5 text-blue-600" />} />
        <KpiCard label="Previsto na semana" value={fmtPct(previstoSemana)} icon={<TrendingUp className="w-5 h-5 text-orange-600" />} />
        <KpiCard label="Realizado na semana" value={fmtPct(realizadoSemana)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} />
        <KpiCard
          label="Aderência (SPI sem.)"
          value={aderencia == null ? "—" : `${aderencia.toFixed(0)}%`}
          icon={<Activity className={`w-5 h-5 ${adOk ? "text-emerald-600" : "text-red-600"}`} />}
        />
      </div>
      {/* Rev. 1534 — Recovery Schedule CONGELADO pro cliente (AACE 23R-02):
          meta DILUÍDA + data de convergência. Sem seletor, sem meta agressiva. */}
      {debitoAcumulado > 0.01 && (() => {
        const metaDiluida = previstoSemana + (debitoAcumulado / janelaRecuperacao);
        const semIniDate = semIni ? new Date(semIni + "T12:00:00") : new Date();
        const semFim = new Date(semIniDate.getTime() + 6 * 86400000);
        const dataConv = new Date(semFim.getTime() + janelaRecuperacao * 7 * 86400000).toLocaleDateString("pt-BR");
        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-1.5" title="Quanto a obra ficou devendo das semanas anteriores. Métrica gerencial; o baseline (PV) permanece imutável.">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-[11px] text-slate-700 font-medium">Atraso a recuperar:</span>
                <span className="text-sm font-bold text-red-600 tabular-nums">{fmtPct(debitoAcumulado)}</span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5" title={`Compromisso semanal diluído em ${janelaRecuperacao} semanas = Previsto baseline + (Débito ÷ ${janelaRecuperacao}). Plano de recuperação factível.`}>
                <Zap className="h-4 w-4 text-blue-700" />
                <span className="text-[11px] text-slate-700 font-medium">Compromisso ({janelaRecuperacao} sem):</span>
                <span className="text-sm font-bold text-blue-700 tabular-nums">{fmtPct(metaDiluida)}</span>
                <span className="text-[10px] text-slate-500">por semana</span>
              </div>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-600" title={`Mantendo o compromisso semanal, o atraso acumulado zera nesta data.`}>
                📅 Atraso zerado em <strong className="text-slate-800">{dataConv}</strong>
              </span>
            </div>
          </div>
        );
      })()}
      <p className="text-[11px] text-slate-400 px-1">
        <strong>Como ler:</strong> &quot;Previsto&quot; e &quot;Realizado&quot; são o <strong>delta da Curva S nesta semana</strong> (o quanto a obra deve / efetivamente avançou de seg a dom).
        Atividades multi-semana contribuem proporcionalmente.
        {debitoAcumulado > 0.01 && <> O <strong>baseline (PV) é imutável</strong>; o compromisso semanal acima é o <strong>plano de recuperação</strong> diluído em {janelaRecuperacao} semanas.</>}
        {" "}Peso bruto das atividades ativas: <strong>{pesoAtivas.toFixed(2).replace(".", ",")}%</strong> (informativo).
      </p>
      <SecaoAtividades titulo={`Semana ${fmtBR(kpis.semanaInicio)} a ${fmtBR(kpis.semanaFim)}`} vazio="Nenhuma atividade nesta semana." itens={semanaAtual} cor="border-blue-200" cutoffOficial={cutoffOficial} />
      {atrasadas.length > 0 && <SecaoAtividades titulo={`Atrasadas (${atrasadas.length})`} vazio="" itens={atrasadas} cor="border-red-200" cutoffOficial={cutoffOficial} />}
    </div>
  );
}

function AbaProgSemanal({
  atividadesTodas, refisLista, nomeProjeto, nomeCliente, curvaData, recoveryWindow,
  calendarioJson: calendarioJsonPortal = null,
  gerenciadoraNome = null, gerenciadoraLogoUrl = null, clienteLogoUrl = null,
  engenheiroResponsavel = null, projetoStart = null, projetoFinish = null,
  cutoffIso = null, avancosLista = null,
}: {
  atividadesTodas: any[];
  refisLista: any[];
  nomeProjeto: string;
  nomeCliente: string;
  curvaData?: any;
  recoveryWindow?: number;
  calendarioJson?: string | null;
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
  engenheiroResponsavel?: string | null;
  projetoStart?: string | null;
  projetoFinish?: string | null;
  cutoffIso?: string | null;
  avancosLista?: any[] | null;
}) {
  const avancosMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const a of atividadesTodas) {
      m[a.id] = Number(a.percentRealizado ?? 0);
    }
    return m;
  }, [atividadesTodas]);

  return (
    <ProgramacaoSemanal
      portalMode
      projetoId={0}
      revisaoId={0}
      orcamentoId={null}
      companyId={0}
      nomeProjeto={nomeProjeto}
      nomeCliente={nomeCliente}
      atividades={atividadesTodas}
      avancosMap={avancosMap}
      refisLista={refisLista}
      curvaData={curvaData}
      recoveryWindow={recoveryWindow ?? 4}
      calendarioJson={calendarioJsonPortal}
      gerenciadoraNome={gerenciadoraNome}
      gerenciadoraLogoUrl={gerenciadoraLogoUrl}
      clienteLogoUrl={clienteLogoUrl}
      engenheiroResponsavel={engenheiroResponsavel}
      projetoStart={projetoStart}
      projetoFinish={projetoFinish}
      cutoffIso={cutoffIso}
      avancosLista={avancosLista}
    />
  );
}

// ── Rev. 1523 — Banner de Tendência × Prazo Contratual ────────────────
// Mostra ao cliente, em destaque, se o ritmo atual da obra projeta
// conclusão dentro ou fora do prazo contratual. 4 níveis (verde/amarelo/
// laranja/vermelho) + caso "sem dados" (cinza) quando ainda não há previsto.
function AlertaTendenciaBanner({ alerta }: { alerta: any }) {
  if (!alerta) return null;
  if (alerta.nivel === "sem_dados") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3 text-xs text-slate-500">
        <Activity className="h-4 w-4 shrink-0" />
        <span>Tendência indisponível — aguardando primeiros lançamentos de avanço para projetar conclusão.</span>
      </div>
    );
  }
  // Rev. 1568 — vide PlanejamentoDetalhe.tsx: SPI não é confiável p/
  // projetar conclusão em fase inicial (< 20% previsto). Mostramos
  // referência sem alarmar o cliente.
  if (alerta.nivel === "fase_inicial") {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 flex items-start gap-3">
        <Activity className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-sky-800">
            Fase inicial · SPI {alerta.spi.toFixed(2)} (referência)
          </p>
          <p className="text-xs text-sky-800/80 mt-0.5">
            Avanço previsto até hoje: {alerta.previstoPct.toFixed(2)}% · Realizado: {alerta.realizadoPct.toFixed(2)}%.
            Com menos de 20% executado, projeções de prazo a partir do SPI não são estatisticamente confiáveis (referência: PMBOK / Earned Schedule).
            A tendência de conclusão ganha precisão à medida que a obra avança.
          </p>
        </div>
      </div>
    );
  }
  const cfg: Record<string, { bg: string; bd: string; tx: string; ic: any; titulo: string; sub: string }> = {
    ok:      { bg: "bg-emerald-50",  bd: "border-emerald-200",  tx: "text-emerald-800", ic: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
               titulo: `No prazo · SPI ${alerta.spi.toFixed(2)}`,
               sub: `Conclusão estimada: ${alerta.etaStr} (prazo contratual: ${alerta.fimStr}). Mantendo o ritmo atual a obra entrega ${Math.abs(alerta.diffDias)} dia(s) ${alerta.diffDias < 0 ? "antes" : "no"} do prazo.` },
    atencao: { bg: "bg-amber-50",    bd: "border-amber-200",    tx: "text-amber-800",   ic: <AlertTriangle className="h-5 w-5 text-amber-600" />,
               titulo: `Atenção · SPI ${alerta.spi.toFixed(2)} · ${alerta.diffDias} dia(s) de atraso projetado`,
               sub: `Conclusão estimada: ${alerta.etaStr} (prazo contratual: ${alerta.fimStr}). Pequeno desvio recuperável; intensificar frente crítica recomenda-se.` },
    alerta:  { bg: "bg-orange-50",   bd: "border-orange-200",   tx: "text-orange-800",  ic: <AlertTriangle className="h-5 w-5 text-orange-600" />,
               titulo: `Alerta · SPI ${alerta.spi.toFixed(2)} · ${alerta.diffDias} dia(s) de atraso projetado`,
               sub: `Conclusão estimada: ${alerta.etaStr} (prazo contratual: ${alerta.fimStr}). Risco de estouro do prazo contratual — replanejamento sugerido.` },
    critico: { bg: "bg-red-50",      bd: "border-red-300",      tx: "text-red-800",     ic: <AlertTriangle className="h-5 w-5 text-red-600" />,
               titulo: `Crítico · SPI ${alerta.spi.toFixed(2)} · ${alerta.diffDias} dia(s) de atraso projetado`,
               sub: `Conclusão estimada: ${alerta.etaStr} (prazo contratual: ${alerta.fimStr}). Tendência de estouro severo — ação corretiva imediata.` },
  };
  const c = cfg[alerta.nivel];
  return (
    <div className={`rounded-xl border ${c.bd} ${c.bg} px-4 py-3 flex items-start gap-3`}>
      <div className="mt-0.5">{c.ic}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${c.tx}`}>{c.titulo}</p>
        <p className={`text-xs ${c.tx} opacity-80 mt-0.5`}>{c.sub}</p>
      </div>
    </div>
  );
}

function AbaCurvaS({ curvaData, kpis, projeto, curvaMedicoes = [] }: any) {
  // Réplica visual da Curva S de Trabalho interna (PlanejamentoDetalhe.tsx ~3697).
  // Mantém: switcher Trabalho/Financeira (Financeira desabilitada no portal),
  // legenda dinâmica com toggles de séries (baseline/realizado/tendência),
  // gráfico com Hoje, e bloco "Como interpretar".
  const [curvaTipo, setCurvaTipo] = useState<"trabalho" | "financeira">("trabalho");
  const [seriesVisiveis, setSeriesVisiveis] = useState<Record<string, boolean>>({
    baseline: true, planejada: true, realizada: true, tendencia: true,
  });
  const toggleSerie = (key: string) =>
    setSeriesVisiveis((prev) => ({ ...prev, [key]: !prev[key] }));

  const merged = useMemo(() => {
    if (!curvaData) return [];
    const map: Record<string, any> = {};
    const add = (arr: any[], key: string) => arr?.forEach((p: any) => {
      if (!map[p.semana]) map[p.semana] = { semana: p.semana };
      map[p.semana][key] = p.acumulado;
    });
    add(curvaData.curvaBaseline, "baseline");
    add(curvaData.curvaPlanejada, "planejada");
    add(curvaData.curvaRealizada, "realizada");
    add(curvaData.curvaTendencia, "tendencia");
    return Object.values(map).sort((a: any, b: any) => a.semana.localeCompare(b.semana));
  }, [curvaData]);

  const semanaLabel = useMemo(() => {
    const m: Record<string, string> = {};
    merged.forEach((p: any, i: number) => { m[p.semana] = `S${i + 1}`; });
    return m;
  }, [merged]);

  const semanas = merged.map((p: any) => p.semana);
  const hoje = new Date().toISOString().slice(0, 10);
  const refHoje = semanas.find((s: string) => s >= hoje) || semanas[semanas.length - 1];
  const hasBaseline   = merged.some((p: any) => p.baseline   != null);
  const hasPlanejada  = merged.some((p: any) => p.planejada  != null);
  const hasRealizada  = merged.some((p: any) => p.realizada  != null);
  const hasTendencia  = merged.some((p: any) => p.tendencia  != null);

  // ── Rev. 1523 — Alerta de Tendência × Prazo Contratual ────────────────
  // Calcula a data estimada de conclusão (ETA) com base no SPI atual:
  //   SPI = realizado / previsto. Se SPI < 1 a obra tende a estourar prazo.
  //   ETA = dataInicio + (duração contratual / SPI). Comparado a
  //   dataTerminoContratual gera 4 níveis de alerta:
  //   - "ok" verde:    no prazo ou antecipado
  //   - "atencao" amarelo: até 30 dias de atraso projetado
  //   - "alerta" laranja:  31 a 90 dias de atraso projetado
  //   - "critico" vermelho: > 90 dias de atraso projetado
  //   - "sem_dados": prev/real ainda não disponíveis
  const alertaTendencia = useMemo(() => {
    const dIni = projeto?.dataInicio;
    const dFim = projeto?.dataTerminoContratual;
    if (!dIni || !dFim) return null;
    const prev = Number(kpis?.previsto || 0);
    const real = Number(kpis?.realizado || 0);
    if (prev <= 0) return { nivel: "sem_dados" as const };
    const spi = real / prev;
    const ini = new Date(dIni + "T12:00:00").getTime();
    const fim = new Date(dFim + "T12:00:00").getTime();
    if (!Number.isFinite(ini) || !Number.isFinite(fim)) return null;
    if (fim <= ini) return null;
    // Rev. 1568 — Guarda de FASE INICIAL (PMBOK / Lipke 2003).
    // Vide comentário em PlanejamentoDetalhe.tsx.
    if (prev < 20) {
      return {
        nivel: "fase_inicial" as const,
        spi: +spi.toFixed(2),
        previstoPct: prev,
        realizadoPct: real,
      };
    }
    const duracaoMs = fim - ini;
    const etaMs = ini + duracaoMs / Math.max(spi, 0.0001);
    const etaDate = new Date(etaMs);
    const diffDias = Math.round((etaMs - fim) / 86400000);
    let nivel: "ok" | "atencao" | "alerta" | "critico";
    if (diffDias <= 0)       nivel = "ok";
    else if (diffDias <= 30) nivel = "atencao";
    else if (diffDias <= 90) nivel = "alerta";
    else                     nivel = "critico";
    return {
      nivel,
      spi: +spi.toFixed(2),
      diffDias,
      etaStr: etaDate.toLocaleDateString("pt-BR"),
      fimStr: new Date(fim).toLocaleDateString("pt-BR"),
    };
  }, [projeto?.dataInicio, projeto?.dataTerminoContratual, kpis?.previsto, kpis?.realizado]);

  return (
    <div className="space-y-4">
      {/* KPIs resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Rev. 1789 — Previsto azul, Realizado verde (consistente com convenção do app: azul = planejado, verde = realizado/sucesso). */}
        <KpiCard label="Previsto"  value={fmtPct(kpis.previsto)}  icon={<TrendingUp  className="w-5 h-5 text-blue-600" />} accent="bg-gradient-to-br from-blue-50/50 to-white"      valueClassName="text-blue-700" />
        <KpiCard label="Realizado" value={fmtPct(kpis.realizado)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} accent="bg-gradient-to-br from-emerald-50/50 to-white" valueClassName="text-emerald-700" />
        <KpiCard
          label="Desvio"
          value={`${kpis.desvio >= 0 ? "+" : ""}${fmtPct(kpis.desvio)}`}
          icon={<AlertTriangle className={`w-5 h-5 ${kpis.desvio < 0 ? "text-red-600" : "text-emerald-600"}`} />}
          accent={kpis.desvio < 0 ? "bg-gradient-to-br from-red-50/50 to-white" : "bg-gradient-to-br from-emerald-50/50 to-white"}
          sub={kpis.desvio < 0 ? "atrasado" : kpis.desvio > 0 ? "adiantado" : "no prazo"}
          // Rev. 1788 — destaque vermelho para atraso (desvio negativo), verde para adiantado.
          valueClassName={kpis.desvio < 0 ? "text-red-600" : kpis.desvio > 0 ? "text-emerald-600" : "text-slate-900"}
          subClassName={kpis.desvio < 0 ? "text-red-600 font-semibold" : kpis.desvio > 0 ? "text-emerald-700 font-semibold" : "text-slate-500"}
        />
      </div>

      {/* Switcher Trabalho / Financeira — Rev. 1722: aba "Curva S Financeira"
          REMOVIDA do portal do cliente (informação financeira sensível, fica
          só no app interno). Mantemos só "Curva S de Trabalho" (físico). */}
      <div className="flex bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {[
          { id: "trabalho",   label: "Curva S de Trabalho",  icon: "📐", disabled: false },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => !tab.disabled && setCurvaTipo(tab.id as "trabalho" | "financeira")}
            disabled={tab.disabled}
            title={tab.disabled ? "Disponível apenas no app interno" : undefined}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all
              ${curvaTipo === tab.id
                ? "bg-blue-600 text-white"
                : tab.disabled
                  ? "text-slate-300 cursor-not-allowed bg-slate-50"
                  : "text-slate-500 hover:bg-slate-50"}`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {curvaTipo === "trabalho" && ((!curvaData || merged.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="text-sm">Sem dados suficientes para gerar a Curva S de Trabalho.</p>
        </div>
      ) : (
        <>
          {/* Banner de alerta de tendência × prazo contratual */}
          <AlertaTendenciaBanner alerta={alertaTendencia} />

          {/* Legenda dinâmica com toggles */}
          <div className="flex flex-wrap gap-4 text-xs bg-white rounded-xl border border-slate-100 shadow-sm p-3">
            {[
              { key: "baseline",  show: hasBaseline,  color: "#1e40af", dash: false, width: 2,   label: "Baseline (Rev 00)" },
              { key: "planejada", show: hasPlanejada, color: "#ef4444", dash: false, width: 2,   label: "Revisão Atual" },
              { key: "realizada", show: hasRealizada, color: "#22c55e", dash: false, width: 3,   label: "Realizado" },
              { key: "tendencia", show: hasTendencia, color: "#16a34a", dash: true,  width: 2,   label: "Tendência (projeção)" },
            ].filter((l) => l.show).map((l, i) => {
              const ativo = seriesVisiveis[l.key] !== false;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleSerie(l.key)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all cursor-pointer select-none ${ativo ? "border-transparent" : "border-slate-200 bg-slate-50 opacity-40"}`}
                  title={ativo ? `Ocultar ${l.label}` : `Mostrar ${l.label}`}
                >
                  <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
                    stroke={ativo ? l.color : "#94a3b8"} strokeWidth={l.width} strokeDasharray={l.dash ? "4 2" : "0"} /></svg>
                  <span className={ativo ? "text-slate-600" : "text-slate-400 line-through"}>{l.label}</span>
                </button>
              );
            })}
          </div>

          {/* Gráfico */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 relative">
            <p className="text-sm font-semibold text-slate-700 mb-1">
              Curva S de Trabalho — Avanço Físico Acumulado (%)
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Realizado atual: <strong className="text-slate-700">{fmtPct(kpis.realizado)}</strong>
            </p>
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={merged} margin={{ left: 5, right: 20, top: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 10, fill: "#64748b" }} angle={-45} textAnchor="end"
                  height={55} interval={0} stroke="#cbd5e1"
                  tickFormatter={(v) => semanaLabel[v] ?? v} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} unit="%" stroke="#cbd5e1" />
                <Tooltip
                  cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "3 3" }}
                  content={({ payload, label }: any) => {
                    if (!payload?.length) return null;
                    const [y, m, d] = String(label).split("-");
                    const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                    const items = [
                      { k: "baseline",  lbl: "Baseline",     color: "#1e40af" },
                      { k: "planejada", lbl: "Revisão Atual", color: "#ef4444" },
                      { k: "realizada", lbl: "Realizado",    color: "#22c55e" },
                      { k: "tendencia", lbl: "Tendência",    color: "#16a34a" },
                    ].filter((it) => get(it.k) != null && seriesVisiveis[it.k] !== false);
                    if (items.length === 0) return null;
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-[220px]">
                        <p className="font-bold text-slate-900 mb-2 pb-2 border-b border-slate-100">
                          {semanaLabel[label] ?? label}
                          <span className="text-slate-400 font-normal ml-2">({d}/{m}/{y})</span>
                        </p>
                        {items.map((it) => (
                          <p key={it.k} className="flex items-center justify-between py-0.5" style={{ color: it.color }}>
                            <span>● {it.lbl}</span>
                            <strong className="tabular-nums">{Number(get(it.k)).toFixed(2)}%</strong>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {refHoje && (
                  <ReferenceLine x={refHoje} stroke="#94a3b8" strokeDasharray="2 2"
                    label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                )}
                {seriesVisiveis.baseline  !== false && <Line type="monotone" dataKey="baseline"  name="Baseline"      stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls />}
                {seriesVisiveis.planejada !== false && <Line type="monotone" dataKey="planejada" name="Revisão Atual" stroke="#ef4444" strokeWidth={2}   dot={false} connectNulls />}
                {seriesVisiveis.realizada !== false && <Line type="monotone" dataKey="realizada" name="Realizado"     stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />}
                {seriesVisiveis.tendencia !== false && <Line type="monotone" dataKey="tendencia" name="Tendência"     stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Interpretação */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
            {hasBaseline  && <p>🔵 <strong>Baseline</strong>: Plano original congelado (Rev 00). Referência imutável.</p>}
            {hasPlanejada && <p>🔴 <strong>Revisão Atual</strong>: Cronograma vigente aprovado.</p>}
            {hasRealizada && <p>🟢 <strong>Realizado</strong>: Progresso físico lançado semanalmente. Acima da revisão = adiantado.</p>}
            {hasTendencia && <p>🟢 <strong>Tendência</strong>: Projeção baseada no ritmo atual. Indica data estimada de conclusão.</p>}
          </div>
        </>
      ))}

      {curvaTipo === "financeira" && (() => {
        // Rev. 1535 — Mesma regra do PlanejamentoDetalhe interno: prefere o
        // total de venda do orçamento (vem do cruzamento EAP × Orçamento) e
        // só cai no valorContrato cadastrado quando não há orçamento ligado.
        // Antes o portal mostrava "Sem valor de contrato cadastrado." mesmo
        // com orçamento bem definido (ex: REVTE-CIVIL R$ 1.359.798,88).
        const totalContrato =
          Number(projeto?.orcamentoTotalVenda ?? 0) ||
          Number(projeto?.valorContrato ?? 0);
        if (!totalContrato || merged.length === 0) {
          return (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 flex flex-col items-center gap-3 text-slate-400">
              <DollarSign className="h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold text-slate-500">Curva S Financeira</p>
              <p className="text-xs text-center max-w-md">
                {!totalContrato ? "Sem valor de contrato cadastrado." : "Sem dados suficientes para gerar a Curva S Financeira."}
              </p>
            </div>
          );
        }
        const fatPorSemana = new Map<string, number>();
        for (const m of (curvaMedicoes as any[])) {
          const [yy, mm] = String(m.competencia).split("-");
          if (!yy || !mm) continue;
          const lastDay = new Date(Number(yy), Number(mm), 0).toISOString().slice(0, 10);
          fatPorSemana.set(lastDay, m.valorAcumulado);
        }
        const dataFin = merged.map((r: any) => {
          let fat: number | null = null;
          for (const [d, v] of fatPorSemana.entries()) if (d <= r.semana) fat = v;
          return {
            semana: r.semana,
            baseline:  r.baseline  != null ? +(r.baseline  * totalContrato / 100).toFixed(2) : null,
            planejada: r.planejada != null ? +(r.planejada * totalContrato / 100).toFixed(2) : null,
            realizada: r.realizada != null ? +(r.realizada * totalContrato / 100).toFixed(2) : null,
            tendencia: r.tendencia != null ? +(r.tendencia * totalContrato / 100).toFixed(2) : null,
            faturado:  fat,
          };
        });
        const cfHasFaturado = (curvaMedicoes as any[]).length > 0;
        const faturadoAcumulado = cfHasFaturado ? (curvaMedicoes as any[])[(curvaMedicoes as any[]).length - 1].valorAcumulado : 0;
        const prevAcumFin = totalContrato * Number(kpis.previsto || 0) / 100;
        const realAcumFin = totalContrato * Number(kpis.realizado || 0) / 100;
        const desvioFin = realAcumFin - prevAcumFin;
        const brl = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const finTickFmt = (v: number) => v === 0 ? "0" : v.toLocaleString("pt-BR");
        return (
          <>
            {/* Banner de alerta de tendência × prazo contratual */}
            <AlertaTendenciaBanner alerta={alertaTendencia} />

            {/* Legenda dinâmica financeira */}
            <div className="flex flex-wrap gap-4 text-xs bg-white rounded-xl border border-slate-100 shadow-sm p-3">
              {[
                { key: "baseline",  show: hasBaseline,  color: "#1e40af", dash: false, width: 2,   label: "Baseline (Rev 00)" },
                { key: "planejada", show: hasPlanejada, color: "#ef4444", dash: false, width: 2,   label: "Faturamento Previsto" },
                { key: "realizada", show: hasRealizada, color: "#22c55e", dash: false, width: 3,   label: "Faturamento Realizado (Físico)" },
                { key: "faturado",  show: cfHasFaturado, color: "#7c3aed", dash: false, width: 2.5, label: "Faturado Real (Medições)" },
                { key: "tendencia", show: hasTendencia, color: "#16a34a", dash: true,  width: 2,   label: "Tendência (projeção)" },
              ].filter((l) => l.show).map((l, i) => {
                const ativo = seriesVisiveis[l.key] !== false;
                return (
                  <button key={i} type="button" onClick={() => toggleSerie(l.key)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all cursor-pointer select-none ${ativo ? "border-transparent" : "border-slate-200 bg-slate-50 opacity-40"}`}
                    title={ativo ? `Ocultar ${l.label}` : `Mostrar ${l.label}`}>
                    <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
                      stroke={ativo ? l.color : "#94a3b8"} strokeWidth={l.width} strokeDasharray={l.dash ? "4 2" : "0"} /></svg>
                    <span className={ativo ? "text-slate-600" : "text-slate-400 line-through"}>{l.label}</span>
                  </button>
                );
              })}
            </div>

            {/* KPIs financeiros */}
            <div className={`grid gap-2 ${cfHasFaturado ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Contrato Total</p>
                <p className="text-base font-bold text-slate-700">{brl(totalContrato)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Previsto</p>
                <p className="text-base font-bold text-red-600">{brl(prevAcumFin)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Realizado (Físico)</p>
                <p className="text-base font-bold text-emerald-700">{brl(realAcumFin)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio (Real − Prev)</p>
                <p className={`text-base font-bold ${desvioFin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {desvioFin >= 0 ? "+" : ""}{brl(desvioFin)}
                </p>
              </div>
              {cfHasFaturado && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturado Real</p>
                  <p className="text-base font-bold" style={{ color: "#7c3aed" }}>{brl(faturadoAcumulado)}</p>
                </div>
              )}
            </div>

            {/* Gráfico financeiro */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 relative">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Curva S Financeira — Faturamento Acumulado (R$)
              </p>
              <p className="text-xs text-slate-400 mb-3">
                Baseado em Curva S × Valor de Contrato ({brl(totalContrato)})
              </p>
              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart data={dataFin} margin={{ left: 5, right: 20, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 10, fill: "#64748b" }} angle={-45} textAnchor="end"
                    height={55} interval={0} stroke="#cbd5e1"
                    tickFormatter={(v) => semanaLabel[v] ?? v} />
                  <YAxis tickFormatter={finTickFmt} tick={{ fontSize: 10, fill: "#64748b" }} width={90} stroke="#cbd5e1" />
                  <Tooltip
                    cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "3 3" }}
                    content={({ payload, label }: any) => {
                      if (!payload?.length) return null;
                      const [y, m, d] = String(label).split("-");
                      const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                      const items = [
                        { k: "baseline",  lbl: "Baseline",                       color: "#1e40af" },
                        { k: "planejada", lbl: "Faturamento Previsto",           color: "#ef4444" },
                        { k: "realizada", lbl: "Faturamento Realizado (Físico)", color: "#22c55e" },
                        { k: "faturado",  lbl: "Faturado Real",                  color: "#7c3aed" },
                        { k: "tendencia", lbl: "Tendência",                      color: "#16a34a" },
                      ].filter((it) => get(it.k) != null && seriesVisiveis[it.k] !== false);
                      if (items.length === 0) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-[260px]">
                          <p className="font-bold text-slate-900 mb-2 pb-2 border-b border-slate-100">
                            {semanaLabel[label] ?? label}
                            <span className="text-slate-400 font-normal ml-2">({d}/{m}/{y})</span>
                          </p>
                          {items.map((it) => (
                            <p key={it.k} className="flex items-center justify-between py-0.5" style={{ color: it.color }}>
                              <span>● {it.lbl}</span>
                              <strong className="tabular-nums">{brl(get(it.k))}</strong>
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {refHoje && (
                    <ReferenceLine x={refHoje} stroke="#94a3b8" strokeDasharray="2 2"
                      label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                  )}
                  {seriesVisiveis.baseline  !== false && hasBaseline  && <Line type="monotone" dataKey="baseline"  name="Baseline"               stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls />}
                  {seriesVisiveis.planejada !== false && hasPlanejada && <Line type="monotone" dataKey="planejada" name="Faturamento Previsto"   stroke="#ef4444" strokeWidth={2}   dot={false} connectNulls />}
                  {seriesVisiveis.realizada !== false && hasRealizada && <Line type="monotone" dataKey="realizada" name="Faturamento Realizado"  stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />}
                  {seriesVisiveis.faturado  !== false && cfHasFaturado && <Line type="monotone" dataKey="faturado"  name="Faturado Real"          stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />}
                  {seriesVisiveis.tendencia !== false && hasTendencia && <Line type="monotone" dataKey="tendencia" name="Tendência"              stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Interpretação financeira */}
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
              {hasBaseline   && <p>🔵 <strong>Baseline</strong>: Curva financeira do plano original (Rev 00) × valor de contrato.</p>}
              {hasPlanejada  && <p>🔴 <strong>Faturamento Previsto</strong>: Cronograma vigente convertido em R$.</p>}
              {hasRealizada  && <p>🟢 <strong>Faturamento Realizado (Físico)</strong>: Avanço físico real × valor de contrato.</p>}
              {cfHasFaturado && <p>🟣 <strong>Faturado Real</strong>: Boletins de medição efetivamente emitidos/aprovados.</p>}
              {hasTendencia  && <p>🟢 <strong>Tendência</strong>: Projeção financeira baseada no ritmo atual.</p>}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function AbaRevisoes({ revisoes }: { revisoes: any[] }) {
  if (revisoes.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">Nenhuma revisão cadastrada.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Controle de Revisões do Cronograma</p>
      </div>

      <div className="space-y-3">
        {revisoes.map((r: any) => (
          <div
            key={r.id}
            className={`bg-white rounded-xl border shadow-sm p-4 ${r.ativa ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-100"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${r.isBaseline ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {r.isBaseline ? "B" : `R${r.numero}`}
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {r.isBaseline ? "Baseline (Rev 00)" : `Rev. ${String(r.numero).padStart(2, "0")}`}
                    {r.descricao && !r.isBaseline && ` — ${r.descricao}`}
                    {r.ativa && (
                      <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">ATIVA</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{fmtBR(r.dataRevisao)} · {r.responsavel ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  r.status === "aprovada" ? "bg-emerald-100 text-emerald-700"
                  : r.status === "cancelada" ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-700"
                }`}>
                  {r.status ?? "aprovada"}
                </span>
              </div>
            </div>
            {r.motivo && <p className="text-xs text-slate-500 mt-2 pl-10">Motivo: {r.motivo}</p>}
            {r.observacao && <p className="text-xs text-slate-400 mt-1 pl-10">{r.observacao}</p>}
            {r.aprovadoPor && <p className="text-xs text-slate-400 mt-1 pl-10">Aprovado por: {r.aprovadoPor}</p>}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Sobre o controle de revisões</p>
        <p>• Rev 00 (Baseline) é criada automaticamente e nunca pode ser alterada.</p>
        <p>• Cada nova revisão exige upload de um novo cronograma (MS Project) e torna-se o cronograma oficial imediatamente.</p>
        <p>• A Curva S compara Baseline × todas as revisões × Realizado.</p>
        <p>• Todos os outros módulos (Gantt, Avanço, REFIS, Caminho Crítico etc.) usam sempre a revisão ativa.</p>
        <p>• A criação, edição e exclusão de revisões é feita pela equipe da gerenciadora — este portal mostra o histórico oficial em tempo real.</p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, sub, accent, valueClassName, subClassName }: { label: string; value: string; icon: React.ReactNode; sub?: string; accent?: string; valueClassName?: string; subClassName?: string }) {
  return (
    <div className={`relative border border-slate-200/70 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_20px_-6px_rgba(15,23,42,0.10)] transition-shadow ${accent || "bg-white"} overflow-hidden`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">{icon}</div>
      </div>
      {/* Rev. 1788 — `valueClassName` permite cor explícita (ex: vermelho para desvios negativos / atrasos). */}
      <div className={`text-2xl font-bold tabular-nums ${valueClassName || "text-slate-900"}`}>{value}</div>
      {sub && <p className={`text-[11px] font-medium mt-0.5 capitalize ${subClassName || "text-slate-500"}`}>{sub}</p>}
    </div>
  );
}

// ─────────────────────── ABA: GANTT ─────────────────────────────────────
type ZoomGantt = "semana" | "mes" | "trimestre";

function AbaGantt({ atividades }: { atividades: any[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [nivelAtivo, setNivelAtivo] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomGantt>("mes");
  const [hoverId, setHoverId] = useState<number | null>(null);

  const dayPx = zoom === "semana" ? 28 : zoom === "mes" ? 10 : 3;
  const ROW_H = 30;
  const HEADER_H = 46;
  const LEFT_W = 310;

  // Avanço folhas (a partir de percentRealizado)
  const avMap = useMemo(() => {
    const m: Record<number, number> = {};
    atividades.forEach((a: any) => {
      if (!a.isGrupo) m[a.id] = Number(a.percentRealizado ?? 0);
    });
    return m;
  }, [atividades]);

  // Avanço grupos (média simples das folhas descendentes)
  const groupAvMap = useMemo(() => {
    const m: Record<number, number> = {};
    atividades.filter((a: any) => a.isGrupo && a.eapCodigo).forEach((g: any) => {
      const leaves = atividades.filter((a: any) =>
        !a.isGrupo && !a.disabled && a.eapCodigo && a.eapCodigo.startsWith(g.eapCodigo + ".")
      );
      if (leaves.length === 0) return;
      const total = leaves.reduce((s: number, l: any) => s + (avMap[l.id] ?? 0), 0);
      m[g.id] = total / leaves.length;
    });
    return m;
  }, [atividades, avMap]);

  const { minDate, maxDate } = useMemo(() => {
    const folhas = atividades.filter((a: any) => a.dataInicio && a.dataFim);
    if (folhas.length === 0) {
      const now = new Date();
      return { minDate: new Date(now.getFullYear(), now.getMonth(), 1), maxDate: new Date(now.getFullYear(), now.getMonth() + 3, 0) };
    }
    const times = folhas.flatMap((a: any) => [
      new Date(a.dataInicio + "T12:00:00").getTime(),
      new Date(a.dataFim + "T12:00:00").getTime(),
    ]);
    const mn = new Date(Math.min(...times));
    const mx = new Date(Math.max(...times));
    mn.setDate(1);
    mx.setMonth(mx.getMonth() + 1, 0);
    return { minDate: mn, maxDate: mx };
  }, [atividades]);

  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 1;
  const totalWidth = totalDays * dayPx;

  const dateToX = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return Math.round((d.getTime() - minDate.getTime()) / 86400000) * dayPx;
  };

  const todayX = dateToX(new Date().toISOString().split("T")[0]);

  const monthCells = useMemo(() => {
    const cells: { label: string; x: number; w: number }[] = [];
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const x = Math.max(0, Math.round((cur.getTime() - minDate.getTime()) / 86400000) * dayPx);
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const endX = Math.round((Math.min(next.getTime() - 86400000, maxDate.getTime()) - minDate.getTime()) / 86400000) * dayPx + dayPx;
      cells.push({ label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), x, w: endX - x });
      cur.setMonth(cur.getMonth() + 1);
    }
    return cells;
  }, [minDate, maxDate, dayPx]);

  const weekTicks = useMemo(() => {
    if (zoom === "trimestre") return [];
    const ticks: { x: number; label: string }[] = [];
    const cur = new Date(minDate);
    while (cur.getDay() !== 1) cur.setDate(cur.getDate() + 1);
    while (cur <= maxDate) {
      const x = Math.round((cur.getTime() - minDate.getTime()) / 86400000) * dayPx;
      ticks.push({ x, label: `${cur.getDate()}/${cur.getMonth() + 1}` });
      cur.setDate(cur.getDate() + 7);
    }
    return ticks;
  }, [minDate, maxDate, dayPx, zoom]);

  const gruposEap = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo && a.eapCodigo).map((a: any) => a.eapCodigo as string),
  [atividades]);

  const maxNivel = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo).reduce((m: number, a: any) => Math.max(m, a.nivel ?? 1), 1),
  [atividades]);

  function toggleCollapse(eap: string) {
    setCollapsed(s => { const ns = new Set(s); ns.has(eap) ? ns.delete(eap) : ns.add(eap); return ns; });
  }
  function isHidden(eap: string | null) {
    if (!eap) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join("."))) return true;
    }
    return false;
  }
  function expandirAteNivel(nivel: number) {
    setCollapsed(new Set(
      atividades.filter((a: any) => a.isGrupo && a.eapCodigo && (a.nivel ?? 1) >= nivel).map((a: any) => a.eapCodigo)
    ));
  }

  const visibleAtiv = useMemo(() =>
    atividades.filter((a: any) => !isHidden(a.eapCodigo ?? "")),
  [atividades, collapsed]);

  if (atividades.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem atividades para exibir o Gantt.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5">
          {(["semana", "mes", "trimestre"] as ZoomGantt[]).map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`h-6 px-2.5 text-[11px] font-semibold rounded transition-colors ${zoom === z ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {z === "semana" ? "Semana" : z === "mes" ? "Mês" : "Trimestre"}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-200" />

        {gruposEap.length > 0 && <span className="text-[11px] text-slate-500 font-medium">Nível:</span>}
        {Array.from({ length: maxNivel }, (_, i) => i + 1).map(lvl => (
          <button key={lvl} onClick={() => { expandirAteNivel(lvl + 1); setNivelAtivo(lvl); }}
            className={`h-6 min-w-[28px] px-1.5 text-[11px] font-semibold rounded border transition-colors ${nivelAtivo === lvl ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            N{lvl}
          </button>
        ))}
        <button onClick={() => { setCollapsed(new Set()); setNivelAtivo(null); }}
          className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
          <ChevronDown className="h-3 w-3" /> Tudo
        </button>
        <button onClick={() => { setCollapsed(new Set(gruposEap)); setNivelAtivo(0); }}
          className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center gap-1 transition-colors">
          <ChevronRight className="h-3 w-3" /> Recolher
        </button>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#1e293b" }} /> Grupo</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#1A3461" }} /> Atividade</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#7c3aed" }} /> ◆ Marco</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500" /> Concluída</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-3 rounded-sm bg-red-500" /> Hoje</span>
        </div>
      </div>

      {/* Gantt grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto"
        style={{ maxHeight: "calc(100vh - 260px)" }}>
        {/* Sticky header */}
        <div className="flex sticky top-0 z-20 border-b border-slate-200">
          <div style={{ width: LEFT_W, minWidth: LEFT_W, height: HEADER_H }}
            className="bg-slate-700 text-white text-[11px] font-semibold flex items-center px-3 gap-1.5 border-r border-slate-600 shrink-0 sticky left-0 z-30">
            <CalendarCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Atividade / Item</span>
          </div>
          <div style={{ width: totalWidth, minWidth: totalWidth, height: HEADER_H, position: "relative" }}
            className="bg-slate-700 shrink-0">
            {monthCells.map((m, i) => (
              <div key={i} style={{ position: "absolute", left: m.x, top: 0, width: m.w, height: 26 }}
                className="border-r border-slate-600 flex items-center px-1.5 overflow-hidden">
                <span className="text-[10px] font-semibold text-slate-200 uppercase tracking-wide whitespace-nowrap">{m.label}</span>
              </div>
            ))}
            {weekTicks.map((w, i) => (
              <div key={i} style={{ position: "absolute", left: w.x, top: 26, height: 20 }}
                className="border-r border-slate-600/30 pl-0.5">
                <span className="text-[8px] text-slate-400 whitespace-nowrap">{w.label}</span>
              </div>
            ))}
            {todayX >= 0 && todayX <= totalWidth && (
              <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2 }}
                className="bg-red-400/60 pointer-events-none" />
            )}
          </div>
        </div>

        {/* Body */}
        {visibleAtiv.map((a: any) => {
          const isGrupo = !!a.isGrupo;
          const isMarco = !!a.isMarco;
          const isExterna = !!a.isExterna;
          const nivel = a.nivel ?? 1;
          const avanc = isGrupo ? (groupAvMap[a.id] ?? 0) : (avMap[a.id] ?? 0);
          const isCollapsed = collapsed.has(a.eapCodigo ?? "");
          const hasChildren = atividades.some((b: any) =>
            b.eapCodigo && a.eapCodigo &&
            b.eapCodigo.startsWith(a.eapCodigo + ".") &&
            b.eapCodigo.split(".").length === a.eapCodigo.split(".").length + 1
          );
          const isHovered = hoverId === a.id;

          const hasBar = !!(a.dataInicio && a.dataFim);
          const barX = hasBar ? Math.max(0, dateToX(a.dataInicio)) : 0;
          const endX = hasBar ? dateToX(a.dataFim) + dayPx : 0;
          const barW = hasBar ? Math.max(endX - barX, 4) : 0;
          const fillW = barW * (avanc / 100);

          const isDone = avanc >= 100;
          const barColor = isDone ? "#059669" : isGrupo ? "#1e293b" : isExterna ? "#b45309" : isMarco ? "#7c3aed" : "#1A3461";
          const fillColor = isDone ? "#10b981" : isExterna ? "#f59e0b" : isMarco ? "#a855f7" : "#3b82f6";
          const barH = isGrupo ? 10 : isMarco ? 12 : 14;
          const barTop = (ROW_H - barH) / 2;

          return (
            <div key={a.id} className="flex" style={{ height: ROW_H }}
              onMouseEnter={() => setHoverId(a.id)}
              onMouseLeave={() => setHoverId(null)}>
              <div style={{ width: LEFT_W, minWidth: LEFT_W, height: ROW_H }}
                className={`sticky left-0 z-10 border-b border-r border-slate-100 flex items-center px-2 gap-1 shrink-0 transition-colors
                  ${isDone ? (isHovered ? "bg-emerald-100" : "bg-emerald-50/70") : isGrupo ? "bg-slate-50" : isMarco ? (isHovered ? "bg-purple-50" : "bg-purple-50/40") : isHovered ? "bg-blue-50/60" : "bg-white"}`}>
                <div style={{ width: (nivel - 1) * 10 }} className="shrink-0" />
                {hasChildren ? (
                  <button onClick={() => toggleCollapse(a.eapCodigo)}
                    className="h-4 w-4 flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0">
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
                <span className={`text-[8px] font-mono shrink-0 px-1 rounded leading-4 ${isDone ? "bg-emerald-100 text-emerald-700" : isGrupo ? "bg-slate-200 text-slate-600" : isMarco ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-600"}`}>
                  {a.eapCodigo ?? "—"}
                </span>
                <span className={`text-[11px] truncate flex-1 ${isDone ? (isGrupo ? "font-semibold text-emerald-800" : "text-emerald-800 font-medium") : isGrupo ? "font-semibold text-slate-700" : isExterna ? "text-amber-800 font-medium" : isMarco ? "text-purple-800 font-medium" : "text-slate-600"}`}
                  title={isExterna ? `${a.nome} — EXTERNA${a.externaResponsavel ? ` (${a.externaResponsavel})` : ""}` : a.nome}>
                  {isMarco && <span className="mr-0.5 text-purple-500">◆</span>}
                  {isExterna && <AlertTriangle className="inline h-3 w-3 text-amber-600 mr-0.5 shrink-0" />}
                  {a.nome}
                </span>
                {avanc > 0 && (
                  <span className={`text-[9px] font-bold shrink-0 ${avanc >= 100 ? "text-emerald-600" : isGrupo ? "text-slate-500" : isMarco ? "text-purple-600" : "text-blue-600"}`}>
                    {avanc.toFixed(0)}%
                  </span>
                )}
              </div>

              <div style={{ width: totalWidth, minWidth: totalWidth, height: ROW_H, position: "relative" }}
                className={`border-b border-slate-100 shrink-0 ${isDone ? (isHovered ? "bg-emerald-50/40" : "bg-emerald-50/20") : isGrupo ? "bg-slate-50/40" : isHovered ? "bg-blue-50/20" : ""}`}>
                {monthCells.map((m, i) => (
                  <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1 }}
                    className="bg-slate-100 pointer-events-none" />
                ))}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2 }}
                    className="bg-red-500/50 pointer-events-none" />
                )}
                {hasBar && (
                  <div style={{
                    position: "absolute", left: barX, top: barTop, width: barW, height: barH,
                    backgroundColor: barColor, borderRadius: isGrupo ? "2px" : "3px", overflow: "hidden",
                  }}>
                    {fillW > 0 && (
                      <div style={{ position: "absolute", left: 0, top: 0, width: fillW, height: "100%", backgroundColor: fillColor, opacity: 0.9 }} />
                    )}
                    {barW > 32 && avanc > 0 && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 3 }}>
                        <span style={{ fontSize: 8, color: "white", fontWeight: 700 }}>{avanc.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                )}
                {hasBar && isHovered && barW > 0 && (
                  <div style={{
                    position: "absolute", left: barX + barW + 4, top: "50%", transform: "translateY(-50%)",
                    fontSize: 9, color: "#64748b", whiteSpace: "nowrap", pointerEvents: "none",
                    background: "rgba(255,255,255,0.95)", padding: "0 3px", borderRadius: 2,
                    border: "1px solid #e2e8f0", zIndex: 5,
                  }}>
                    {fmtBR(a.dataInicio)} → {fmtBR(a.dataFim)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400 px-1">
        <span>{visibleAtiv.length} itens visíveis de {atividades.length} total</span>
        <span>·</span>
        <span>{fmtBR(minDate.toISOString().split("T")[0])} → {fmtBR(maxDate.toISOString().split("T")[0])}</span>
        <span>·</span>
        <span>{totalDays} dias de projeto</span>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: REFIS ─────────────────────────────────────
// Réplica visual da tela interna (PlanejamentoDetalhe.tsx → função Refis)
// Read-only: sem toolbar, sem edição, sem IA, sem observações.
function AbaRefis({ refisLista, atividades, curvaData, curvaMedicoes, obra, projeto, incluirIndiretas, setIncluirIndiretas, topPrevisto, topRealizado }: {
  refisLista: any[];
  atividades: any[];
  curvaData: null | {
    curvaBaseline: { semana: string; acumulado: number }[];
    curvaPlanejada: { semana: string; acumulado: number }[];
    curvaRealizada: { semana: string; acumulado: number }[];
    curvaTendencia: { semana: string; acumulado: number }[];
  };
  curvaMedicoes: { competencia: string; valorMedido: number; valorAcumulado: number; status: string }[];
  obra: any;
  projeto: any;
  incluirIndiretas: boolean;
  setIncluirIndiretas: (v: boolean) => void;
  topPrevisto: number;
  topRealizado: number;
}) {
  if (!refisLista || refisLista.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Nenhum REFIS emitido ainda.</div>;
  }

  // ── Refis ordenados (mais antigo → mais recente) e refis "atual" = mais recente
  const refisOrd = [...refisLista].sort((a, b) => String(a.semana).localeCompare(String(b.semana)));
  const refisAtual = refisOrd[refisOrd.length - 1];
  const refisAnterior = refisOrd.length > 1 ? refisOrd[refisOrd.length - 2] : null;

  const semanaRef = refisAtual.semana as string;          // "YYYY-MM-DD"
  const numeroRef = refisAtual.numero ?? refisOrd.length;
  const mesSemana = semanaRef.slice(0, 7);                 // "YYYY-MM"

  const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fPct_ = (v: number) => `${Number(v || 0).toFixed(2)}%`;

  // Rev. 1535 — Curva S Financeira do REFIS também precisa do fallback p/
  // orcamentoTotalVenda; antes ocultava o bloco financeiro em obras com
  // orçamento ligado mas sem valorContrato preenchido.
  const totalContrato = Number(projeto?.orcamentoTotalVenda ?? 0) || Number(projeto?.valorContrato ?? 0);

  // ── Rev. 1513: Estados do toolbar de análise/impressão
  // - incluirIndiretas: vem por props (Rev. 1584 — elevado ao componente
  //   pai para que a barra "Avanço Físico" do topo da página acompanhe)
  // - orientacaoPdf: define @page size para impressão (retrato/paisagem)
  const [orientacaoPdf, setOrientacaoPdf]       = useState<"portrait" | "landscape">("portrait");

  // Conta indiretas existentes para mostrar contador no toggle
  const qtdIndiretas = (atividades || []).filter((a: any) => !a.isGrupo && a.isIndireta && !a.disabled).length;

  // ── Reconstroi grupos/etapas a partir das atividades + valores acumulados na semanaRef
  // (replica a lógica de cálculo de "grupos" da função interna usando acumPrev/acumReal já gravados em refis)
  // Quando "incluirIndiretas" estiver ligado, as atividades indiretas entram nos cálculos.
  const folhas = (atividades || []).filter((a: any) =>
    !a.isGrupo && !a.disabled && (incluirIndiretas || !a.isIndireta)
  );

  // Helper: progresso previsto linear em data específica
  const progPrevistoNa = (a: any, dataStr: string) => {
    if (!a.dataInicio || !a.dataFim) return 0;
    if (dataStr >= a.dataFim) return 100;
    if (dataStr < a.dataInicio) return 0;
    const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
    const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
    const tod = new Date(dataStr + "T12:00:00Z").getTime();
    return ((tod - ini) / (fim - ini)) * 100;
  };

  // Agrupa por nível-1 do EAP
  const grupoMap = new Map<string, { id: string; eapCodigo: string; nome: string; dataInicio: string | null; dataFim: string | null; pesos: number; pPrev: number; pReal: number; etapasMap: Map<string, any> }>();
  for (const a of folhas) {
    const eap = String(a.eapCodigo || "").trim();
    const partes = eap.split(".");
    const grpKey = partes[0] || "—";
    const etpKey = partes.slice(0, 2).join(".") || grpKey;
    const peso = Number(a.pesoFinanceiro ?? 0) || 0;
    const realA = Number(a.percentRealizado ?? 0);
    const prevA = progPrevistoNa(a, semanaRef);

    if (!grupoMap.has(grpKey)) {
      // Nome do grupo: tenta achar atividade pai (isGrupo) com mesmo eap_codigo = grpKey
      const pai = (atividades || []).find((x: any) => x.eapCodigo === grpKey && x.isGrupo);
      grupoMap.set(grpKey, {
        id: grpKey, eapCodigo: grpKey,
        nome: pai?.nome || a.grupo || `Grupo ${grpKey}`,
        dataInicio: null, dataFim: null,
        pesos: 0, pPrev: 0, pReal: 0,
        etapasMap: new Map(),
      });
    }
    const g = grupoMap.get(grpKey)!;
    g.pesos += peso;
    g.pPrev += peso * prevA;
    g.pReal += peso * realA;
    if (a.dataInicio && (!g.dataInicio || a.dataInicio < g.dataInicio)) g.dataInicio = a.dataInicio;
    if (a.dataFim && (!g.dataFim || a.dataFim > g.dataFim)) g.dataFim = a.dataFim;

    if (!g.etapasMap.has(etpKey)) {
      const paiE = (atividades || []).find((x: any) => x.eapCodigo === etpKey && x.isGrupo);
      g.etapasMap.set(etpKey, {
        id: etpKey, eapCodigo: etpKey,
        nome: paiE?.nome || (partes.length >= 2 ? `Etapa ${etpKey}` : a.nome),
        pesos: 0, pPrev: 0, pReal: 0,
      });
    }
    const e = g.etapasMap.get(etpKey)!;
    e.pesos += peso;
    e.pPrev += peso * prevA;
    e.pReal += peso * realA;
  }
  const grupos = Array.from(grupoMap.values()).map((g) => {
    const previsto = g.pesos > 0 ? g.pPrev / g.pesos : 0;
    const realizado = g.pesos > 0 ? g.pReal / g.pesos : 0;
    const etapas = Array.from(g.etapasMap.values()).map((e: any) => ({
      id: e.id, eapCodigo: e.eapCodigo, nome: e.nome,
      previsto: e.pesos > 0 ? e.pPrev / e.pesos : 0,
      realizado: e.pesos > 0 ? e.pReal / e.pesos : 0,
    })).sort((a, b) => String(a.eapCodigo).localeCompare(String(b.eapCodigo)));
    return {
      id: g.id, eapCodigo: g.eapCodigo, nome: g.nome,
      dataInicio: g.dataInicio, dataFim: g.dataFim,
      previsto, realizado, etapas,
    };
  }).sort((a, b) => String(a.eapCodigo).localeCompare(String(b.eapCodigo)));

  // ── Métricas globais
  // Quando "Só Diretas" → usa os valores oficiais salvos no REFIS (paridade com o emitido).
  // Quando "Global (c/ Indiretas)" → recalcula a partir das folhas (média ponderada por peso),
  // refletindo o impacto das indiretas no avanço da obra.
  //
  // Rev. 1582 — REGRA DE OURO: Portal NUNCA pode divergir do módulo
  // Planejamento. Toda a lógica de cálculo agora replica EXATAMENTE
  // `refisPrevistoComInd` e `refisRealComInd` em PlanejamentoDetalhe.tsx
  // (linhas ~10024 e ~10032 após Rev. 1581):
  //   1. Universo único de atividades = folhas COM dataInicio E dataFim
  //      (mesmo filtro nos dois numeradores e nos dois denominadores).
  //      Sem isso, indiretas sem datas inflavam o denominador do realizado
  //      com numerador 0 e o "Realizado (Global)" CAÍA no Portal mesmo
  //      depois de já termos corrigido o ERP — o usuário viu 1,19% no
  //      Portal vs 1,88% no ERP para a mesma semana/obra.
  //   2. Para INDIRETAS no realizado, usa a curva PREVISTA linear no tempo
  //      (`progPrevistoNa(a, semanaFimRef)`), igual ao ERP. Indiretas
  //      (canteiro/mob/desmob) não têm apontamento físico — convenção é
  //      considerá-las "no cronograma" para fins de avanço global.
  //   3. Mantido o fallback `semPeso=true` quando a soma de pesoFinanceiro
  //      é zero, replicando `calcPesoTotal` do ERP.
  const folhasComDatas = folhas.filter((a: any) => a.dataInicio && a.dataFim);
  const pesoBrutoFolhas = folhasComDatas.reduce((s: number, a: any) => s + (Number(a.pesoFinanceiro) || 0), 0);
  const semPesoFolhas   = pesoBrutoFolhas === 0;
  const denomFolhas     = semPesoFolhas ? (folhasComDatas.length || 1) : pesoBrutoFolhas;
  // Rev. 1521-fix2 — Usar FIM da semana (segunda + 7 dias) como referência
  // do previsto. O módulo Planejamento (PlanejamentoDetalhe.tsx 4266-4272 e
  // 9442-9448) calcula `semanaFim = semanas[idx+1]` ou `semana + 7` quando
  // não há próxima. Sem isto, todas as atividades retornam 0% previsto na
  // segunda-feira de início → Portal mostra 0,00% em vez de 2,28%.
  const semanaFimRef = (() => {
    const d = new Date(semanaRef + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  })();
  const previstoRecalc = folhasComDatas.reduce(
    (s: number, a: any) => {
      const peso = semPesoFolhas ? 1 : (Number(a.pesoFinanceiro) || 0);
      return s + (progPrevistoNa(a, semanaFimRef) * peso) / denomFolhas;
    }, 0);
  const realizadoRecalc = folhasComDatas.reduce(
    (s: number, a: any) => {
      const peso = semPesoFolhas ? 1 : (Number(a.pesoFinanceiro) || 0);
      // Indiretas no realizado seguem a curva prevista linear (mesma
      // convenção de `refisRealComInd` no ERP). Diretas usam o avanço real
      // apontado em `percentRealizado`.
      const val = a.isIndireta
        ? progPrevistoNa(a, semanaFimRef)
        : (Number(a.percentRealizado) || 0);
      return s + (val * peso) / denomFolhas;
    }, 0);
  // Rev. 2991 — REGRA DE OURO Portal × ERP: em "Só Diretas" (incluirIndiretas
  // OFF, padrão) o REFIS deve ESPELHAR a barra "Avanço Físico" do topo da
  // página (`topPrevisto`/`topRealizado` = `kpis.previsto`/`kpis.realizado` =
  // snapshot MSP da raiz UID=0), EXATAMENTE como o módulo Planejamento do ERP
  // faz (PlanejamentoDetalhe.tsx, Rev. 2272/2273: `rReal = avancoAtual`,
  // `rPrev = avancoPrevisto`). Antes o Portal lia os valores SALVOS no registro
  // do REFIS (`refisAtual.avancoPrevisto/avancoRealizado`), congelados na
  // emissão por uma fórmula legada (ponderação folha-a-folha) → divergia do
  // topo (ex.: topo 8,00%/19,62% vs REFIS 9,00%/9,00%, SPI 1,00, desvio 0,00%).
  // No modo "Global (c/ Indiretas)" mantém o recálculo proprietário
  // (`previstoRecalc`/`realizadoRecalc`) — idêntico ao `topPrevisto/topRealizado`
  // do pai nesse modo, pois usam a MESMA fórmula sobre o MESMO universo.
  const avancoPrevisto  = incluirIndiretas ? previstoRecalc  : Number(topPrevisto ?? 0);
  const avancoRealAtual = incluirIndiretas ? realizadoRecalc : Number(topRealizado ?? 0);

  // Rev. 1583 — Quando "Global (c/ Indiretas)" ligado, o semanal TAMBÉM
  // precisa ser recalculado, senão fica divergente (cabeçalho mostra
  // acumulado com indiretas mas semanal mostra valor oficial sem indiretas).
  // Para a primeira semana (sem REFIS anterior), semanal = acumulado.
  // Para semanas seguintes, recalcula o acumulado da semana anterior pela
  // mesma fórmula e tira a diferença.
  const avancoSemPrev = useMemo(() => {
    if (!incluirIndiretas) {
      return Number(refisAtual.avancoSemanalPrevisto ?? (refisAnterior ? avancoPrevisto - Number(refisAnterior.avancoPrevisto) : 0));
    }
    if (!refisAnterior) return previstoRecalc;
    const semAntFim = (() => {
      const d = new Date((refisAnterior.semana as string) + "T12:00:00");
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })();
    const prevAntes = folhasComDatas.reduce((s: number, a: any) => {
      const peso = semPesoFolhas ? 1 : (Number(a.pesoFinanceiro) || 0);
      return s + (progPrevistoNa(a, semAntFim) * peso) / denomFolhas;
    }, 0);
    return Math.max(0, previstoRecalc - prevAntes);
  }, [incluirIndiretas, refisAtual, refisAnterior, avancoPrevisto, previstoRecalc, folhasComDatas, semPesoFolhas, denomFolhas]);

  const avancoSemReal = useMemo(() => {
    if (!incluirIndiretas) {
      return Number(refisAtual.avancoSemanalRealizado ?? (refisAnterior ? avancoRealAtual - Number(refisAnterior.avancoRealizado) : 0));
    }
    if (!refisAnterior) return realizadoRecalc;
    // Para o realizado anterior recalculado: diretas usam o último apontamento
    // disponível ATÉ a semana anterior (não temos snapshot histórico, então
    // aproximamos usando refisAnterior.avancoRealizado como base oficial das
    // diretas e somamos a contribuição das indiretas pela curva prevista
    // naquela data). É a mesma lógica de "indireta no realizado = curva
    // prevista" aplicada no acumulado.
    const semAntFim = (() => {
      const d = new Date((refisAnterior.semana as string) + "T12:00:00");
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })();
    // Recalcula o acumulado anterior usando os mesmos apontamentos atuais
    // (snapshot histórico de percentRealizado não está disponível no Portal —
    // aceita pequena distorção em caso de apontamento retroativo).
    const realAntes = folhasComDatas.reduce((s: number, a: any) => {
      const peso = semPesoFolhas ? 1 : (Number(a.pesoFinanceiro) || 0);
      const val = a.isIndireta
        ? progPrevistoNa(a, semAntFim)
        : (Number(a.percentRealizado) || 0);
      return s + (val * peso) / denomFolhas;
    }, 0);
    return Math.max(0, realizadoRecalc - realAntes);
  }, [incluirIndiretas, refisAtual, refisAnterior, avancoRealAtual, realizadoRecalc, folhasComDatas, semPesoFolhas, denomFolhas]);
  const desvioFisico    = avancoRealAtual - avancoPrevisto;
  // Rev. 2991 — SPI SEMPRE recalculado a partir do acumulado exibido (que agora
  // espelha o topo), nunca o `refisAtual.spi` salvo (congelado na emissão pela
  // fórmula legada) — senão SPI/desvio contradiziam o acumulado (SPI 1,00 ao
  // lado de 8,00%/19,62%). Mesma régua do ERP (`rSpi = rReal/rPrev`).
  const spi = avancoPrevisto > 0 ? avancoRealAtual / avancoPrevisto : 0;

  // ── Curva S Física: usa curvaData do backend, recortando até o último ponto realizado/projetado
  const curvaFiltrada = (() => {
    if (!curvaData) return [] as any[];
    const semanasSet = new Set<string>();
    [...curvaData.curvaBaseline, ...curvaData.curvaPlanejada, ...curvaData.curvaRealizada, ...curvaData.curvaTendencia]
      .forEach(p => semanasSet.add(p.semana));
    const semanas = Array.from(semanasSet).sort();
    const baseMap = new Map(curvaData.curvaBaseline.map(p => [p.semana, p.acumulado]));
    const planMap = new Map(curvaData.curvaPlanejada.map(p => [p.semana, p.acumulado]));
    const realMap = new Map(curvaData.curvaRealizada.map(p => [p.semana, p.acumulado]));
    const tendMap = new Map(curvaData.curvaTendencia.map(p => [p.semana, p.acumulado]));
    return semanas.map((s, i) => ({
      semana: s,
      label: `S${i + 1}`,
      baseline: baseMap.get(s) ?? null,
      planejada: planMap.get(s) ?? null,
      realizada: realMap.get(s) ?? null,
      tendencia: tendMap.get(s) ?? null,
    }));
  })();
  const cfHasBaseline  = curvaFiltrada.some((r: any) => r.baseline != null);
  const cfHasPlanejada = curvaFiltrada.some((r: any) => r.planejada != null);
  const today = new Date().toISOString().slice(0, 10);
  const cfHojeRow = curvaFiltrada.find((r: any) => r.semana >= today) || curvaFiltrada[curvaFiltrada.length - 1];
  const cfHojeLabel = cfHojeRow?.label;
  const rPrev = avancoPrevisto;
  const rReal = avancoRealAtual;

  // ── Curva S Financeira: escala % * totalContrato; usa curvaMedicoes p/ "faturado"
  const fatPorSemana = new Map<string, number>();
  for (const m of curvaMedicoes) {
    // converte competência YYYY-MM em fim de mês como semana de referência
    const [yy, mm] = m.competencia.split("-");
    if (!yy || !mm) continue;
    const lastDay = new Date(Number(yy), Number(mm), 0).toISOString().slice(0, 10);
    fatPorSemana.set(lastDay, m.valorAcumulado);
  }
  const curvaFinanceiraFull = curvaFiltrada.map((r: any) => {
    // pega o último "faturado" cuja data <= r.semana
    let fat: number | null = null;
    for (const [d, v] of fatPorSemana.entries()) {
      if (d <= r.semana) fat = v;
    }
    return {
      ...r,
      baseline:  r.baseline  != null ? +(r.baseline  * totalContrato / 100).toFixed(2) : null,
      planejada: r.planejada != null ? +(r.planejada * totalContrato / 100).toFixed(2) : null,
      realizada: r.realizada != null ? +(r.realizada * totalContrato / 100).toFixed(2) : null,
      tendencia: r.tendencia != null ? +(r.tendencia * totalContrato / 100).toFixed(2) : null,
      faturado:  fat,
    };
  });
  const faturadoAcumulado = curvaMedicoes.length > 0 ? curvaMedicoes[curvaMedicoes.length - 1].valorAcumulado : 0;
  const cfHasFaturado = curvaMedicoes.length > 0;
  const cfFinHasBaseline  = cfHasBaseline;
  const cfFinHasPlanejada = cfHasPlanejada;

  // ── Estado collapse por bloco (apenas UI)
  const [colBloco3A, setColBloco3A] = useState(false);
  // Rev. 1524 — toggles individuais por série nas Curvas S do REFIS (Física + Financeira)
  const [serRefis, setSerRefis] = useState<Record<string, boolean>>({
    baseline: true, planejada: true, realizada: true, tendencia: true, faturado: true,
  });
  const tglRefis = (k: string) => setSerRefis(p => ({ ...p, [k]: !p[k] }));
  const [colBloco3B, setColBloco3B] = useState(false);
  const [colBloco4, setColBloco4]   = useState(false);
  const [collapsedGrupos, setCollapsedGrupos] = useState<Set<string>>(new Set());
  const toggleGrupo = (id: string) => setCollapsedGrupos(prev => {
    const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s;
  });

  const stBadgeAtual = refisAtual.status === "consolidado" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : refisAtual.status === "emitido" ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  const TRUNC4 = 36;
  const gruposChart = grupos.map((g: any) => ({
    ...g,
    nomeChart: g.nome?.length > TRUNC4 ? g.nome.substring(0, TRUNC4 - 1) + "…" : (g.nome ?? ""),
  }));
  const maxLenG = Math.max(8, ...gruposChart.map((g: any) => (g.nomeChart || "").length));
  const yWidthG = Math.min(260, Math.max(140, maxLenG * 6.4));
  const rowHG = 72;

  return (
    <div className="space-y-4" id="refis-portal-print-area">
      {/* ── Rev. 1513: TOOLBAR DE ANÁLISE / IMPRESSÃO ─────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 refis-no-print">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">REFIS — Análise</p>
          {qtdIndiretas > 0 && (
            <label className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-blue-100 transition-colors select-none">
              <input
                type="checkbox"
                checked={incluirIndiretas}
                onChange={e => setIncluirIndiretas(e.target.checked)}
                className="accent-blue-600 h-3.5 w-3.5"
              />
              <span className="text-[11px] font-semibold text-blue-700">
                {incluirIndiretas ? "Global (c/ Indiretas)" : "Só Diretas"}
              </span>
              <span className="text-[9px] text-blue-500">({qtdIndiretas} ind.)</span>
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
            <button
              type="button"
              title="Retrato (vertical)"
              onClick={() => setOrientacaoPdf("portrait")}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${orientacaoPdf === "portrait" ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <svg width="10" height="14" viewBox="0 0 10 14"><rect x="1" y="1" width="8" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              Retrato
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              type="button"
              title="Paisagem (horizontal)"
              onClick={() => setOrientacaoPdf("landscape")}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${orientacaoPdf === "landscape" ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <svg width="14" height="10" viewBox="0 0 14 10"><rect x="1" y="1" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              Paisagem
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* ── Rev. 1513: Estilos de impressão dedicados (orientação dinâmica + layout limpo) */}
      <style>{`
        @media print {
          @page { size: A4 ${orientacaoPdf}; margin: 10mm 10mm 12mm 10mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #refis-portal-print-area, #refis-portal-print-area * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          #refis-portal-print-area {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            background: white !important;
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif !important;
            font-size: 8pt !important;
            color: #1e293b !important;
            z-index: 99999 !important;
          }
          .refis-no-print { display: none !important; }
          /* Cards/blocos: sem sombra, borda mais leve, evitar quebra no meio */
          #refis-portal-print-area .shadow-sm,
          #refis-portal-print-area .shadow,
          #refis-portal-print-area .shadow-md,
          #refis-portal-print-area .shadow-lg,
          #refis-portal-print-area .shadow-xl { box-shadow: none !important; }
          #refis-portal-print-area .rounded-xl,
          #refis-portal-print-area .rounded-lg { border-radius: 4pt !important; }
          #refis-portal-print-area .border { border-color: #cbd5e1 !important; }
          #refis-portal-print-area .bg-white { background: #ffffff !important; }
          #refis-portal-print-area > div { page-break-inside: avoid !important; break-inside: avoid !important; }
          #refis-portal-print-area .space-y-4 > * + * { margin-top: 6pt !important; }
          /* Cabeçalhos de bloco mais compactos */
          #refis-portal-print-area .px-5 { padding-left: 8pt !important; padding-right: 8pt !important; }
          #refis-portal-print-area .py-3 { padding-top: 4pt !important; padding-bottom: 4pt !important; }
          #refis-portal-print-area .py-4 { padding-top: 5pt !important; padding-bottom: 5pt !important; }
          /* Gráficos: garantir que tomem largura cheia da página */
          #refis-portal-print-area .recharts-responsive-container,
          #refis-portal-print-area .recharts-wrapper,
          #refis-portal-print-area svg { max-width: 100% !important; }
          /* Tabelas mais legíveis em P&B */
          #refis-portal-print-area table { font-size: 7.5pt !important; border-collapse: collapse !important; }
          #refis-portal-print-area th, #refis-portal-print-area td { padding: 3pt 5pt !important; }
        }
      `}</style>

      {/* ══════ BLOCO 1 — CABEÇALHO ══════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-5 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-300" />
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-300">Relatório Evolução Física</p>
              <p className="text-sm font-bold">Nº {String(numeroRef).padStart(3, "0")} · Semana {fmtBR(semanaRef)}</p>
            </div>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${stBadgeAtual}`}>{refisAtual.status || "—"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="px-5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Obra / Cliente</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">{obra?.nome || "—"}</p>
            <p className="text-[11px] text-slate-500">{obra?.cliente || "—"}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Local</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">{obra?.cidade || obra?.endereco || "—"}</p>
          </div>
          <div className="px-5 py-3 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] uppercase text-slate-400">Início</p>
              <p className="text-xs font-semibold text-slate-700">{fmtBR(projeto?.dataInicio)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400">Status em</p>
              <p className="text-xs font-semibold text-slate-700">{fmtBR(semanaRef)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400">Término</p>
              <p className="text-xs font-semibold text-slate-700">{fmtBR(projeto?.dataTerminoContratual)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ BLOCO 2 — EVOLUÇÃO FÍSICA GLOBAL ══════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Evolução Física Global</p>
        </div>
        <div className="p-4 space-y-4">
          {/* Barras Previsto/Realizado */}
          <div className="space-y-2">
            {/* Rev. 1604 — Padronização de cores: amarelo = Previsto, azul =
                Realizado (mesmo padrão do card "Avanço Físico" no topo). */}
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-slate-500 font-medium">Previsto Acumulado</span>
                <span className="font-bold text-amber-700 tabular-nums">{fPct_(avancoPrevisto)}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.min(100, avancoPrevisto)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-slate-500 font-medium">Realizado Acumulado</span>
                <span className="font-bold text-blue-700 tabular-nums">{fPct_(avancoRealAtual)}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, avancoRealAtual)}%` }} />
              </div>
            </div>
          </div>
          {/* 4 KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold">Av. Sem. Previsto</p>
              <p className="text-base font-bold text-amber-800 mt-0.5">{fPct_(avancoSemPrev)}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wide text-blue-700 font-semibold">Av. Sem. Realizado</p>
              <p className="text-base font-bold text-blue-800 mt-0.5">{fPct_(avancoSemReal)}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${spi >= 1 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[9px] uppercase tracking-wide font-semibold ${spi >= 1 ? "text-emerald-700" : "text-red-700"}`}>SPI</p>
              <p className={`text-base font-bold mt-0.5 ${spi >= 1 ? "text-emerald-800" : "text-red-800"}`}>{spi.toFixed(2).replace(".", ",")}</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${desvioFisico >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[9px] uppercase tracking-wide font-semibold ${desvioFisico >= 0 ? "text-emerald-700" : "text-red-700"}`}>Desvio Físico</p>
              <p className={`text-base font-bold mt-0.5 ${desvioFisico >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ BLOCO 3A — Curva S Física ══════ */}
      {curvaFiltrada.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-700 border-b border-slate-600 px-5 py-2.5 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco3A(v => !v)}>
            <p className="text-xs font-bold uppercase tracking-wider text-white">Curva S Física — Avanço Acumulado (%)</p>
            <div className="flex gap-3 text-[11px] text-slate-300 flex-wrap items-center" onClick={(e) => e.stopPropagation()}>
              {cfHasBaseline && (
                <button type="button" onClick={() => tglRefis("baseline")}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.baseline ? "" : "opacity-40"}`}
                  title={serRefis.baseline ? "Ocultar Baseline" : "Mostrar Baseline"}>
                  <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#1e40af" }} />
                  <span className={serRefis.baseline ? "" : "line-through"}>Baseline</span>
                </button>
              )}
              {cfHasPlanejada && (
                <button type="button" onClick={() => tglRefis("planejada")}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.planejada ? "" : "opacity-40"}`}
                  title={serRefis.planejada ? "Ocultar Revisão Atual" : "Mostrar Revisão Atual"}>
                  <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#ef4444" }} />
                  <span className={serRefis.planejada ? "" : "line-through"}>Revisão Atual</span>
                </button>
              )}
              <button type="button" onClick={() => tglRefis("realizada")}
                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.realizada ? "" : "opacity-40"}`}
                title={serRefis.realizada ? "Ocultar Realizado" : "Mostrar Realizado"}>
                <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#22c55e" }} />
                <span className={serRefis.realizada ? "" : "line-through"}>Realizado</span>
              </button>
              <button type="button" onClick={() => tglRefis("tendencia")}
                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.tendencia ? "" : "opacity-40"}`}
                title={serRefis.tendencia ? "Ocultar Tendência" : "Mostrar Tendência"}>
                <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" /></svg>
                <span className={serRefis.tendencia ? "" : "line-through"}>Tendência</span>
              </button>
              <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform cursor-pointer ${colBloco3A ? "" : "rotate-90"}`} onClick={() => setColBloco3A(v => !v)} />
            </div>
          </div>
          {!colBloco3A && (
            <>
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Revisão Atual</p>
                  <p className="text-lg font-bold text-red-600">{fPct_(avancoPrevisto)}</p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Realizado</p>
                  <p className="text-lg font-bold text-emerald-700">{fPct_(avancoRealAtual)}</p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio Físico</p>
                  <p className={`text-lg font-bold ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
                  </p>
                </div>
              </div>
              <div className="px-5 py-4" style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curvaFiltrada} margin={{ top: 5, right: 60, bottom: curvaFiltrada.length > 10 ? 55 : 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={55}
                      interval={0} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip
                      content={({ payload, label }: any) => {
                        if (!payload?.length) return null;
                        const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                        const base = get("baseline"); const plan = get("planejada"); const real = get("realizada"); const tend = get("tendencia");
                        const row = curvaFiltrada.find((r: any) => r.label === label);
                        const [y, m, d] = String(row?.semana ?? "").split("-");
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[210px]">
                            <p className="font-semibold text-slate-700 mb-2">{label}{row?.semana ? ` (${d}/${m}/${y})` : ""}</p>
                            {base != null && <p style={{ color: "#1e40af" }}>Baseline : <strong>{Number(base).toFixed(1)}%</strong></p>}
                            {plan != null && <p style={{ color: "#ef4444" }}>Revisão Atual : <strong>{Number(plan).toFixed(1)}%</strong></p>}
                            {real != null && <p style={{ color: "#22c55e" }}>Realizado : <strong>{Number(real).toFixed(1)}%</strong></p>}
                            {tend != null && <p style={{ color: "#16a34a" }}>Tendência : <strong>{Number(tend).toFixed(1)}%</strong></p>}
                          </div>
                        );
                      }}
                    />
                    {cfHojeLabel && (
                      <ReferenceLine x={cfHojeLabel} stroke="#94a3b8" strokeDasharray="2 2"
                        label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                    )}
                    <ReferenceLine y={rPrev} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: `${rPrev.toFixed(1)}%`, position: "right", fontSize: 9, fill: "#dc2626", fontWeight: 700 }} />
                    <ReferenceLine y={rReal} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: `${rReal.toFixed(1)}%`, position: "right", fontSize: 9, fill: "#16a34a", fontWeight: 700 }} />
                    {cfHasBaseline  && serRefis.baseline  && <Line type="monotone" dataKey="baseline"  stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls name="baseline" />}
                    {cfHasPlanejada && serRefis.planejada && <Line type="monotone" dataKey="planejada" stroke="#ef4444" strokeWidth={3.5} dot={false} connectNulls name="planejada" />}
                    {serRefis.realizada && <Line type="monotone" dataKey="realizada" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls name="realizada" />}
                    {serRefis.tendencia && <Line type="monotone" dataKey="tendencia" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════ BLOCO 3B — Curva S Financeira (REFIS) ══════
          Rev. 1722: OCULTO no portal do cliente (informação financeira
          sensível). Mantido só no app interno (PlanejamentoDetalhe.tsx). */}
      {false && curvaFinanceiraFull.length > 1 && totalContrato > 0 && (() => {
        const prevAcumFin = totalContrato * avancoPrevisto / 100;
        const realAcumFin = totalContrato * avancoRealAtual / 100;
        const desvioFin = realAcumFin - prevAcumFin;
        const desvioFatVsReal = cfHasFaturado ? faturadoAcumulado - realAcumFin : null;
        const finTickFmt = (v: number) => v === 0 ? "0" : v.toLocaleString("pt-BR");
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-700 border-b border-slate-600 px-5 py-2.5 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco3B(v => !v)}>
              <p className="text-xs font-bold uppercase tracking-wider text-white">Curva S Financeira — Faturamento Acumulado (R$)</p>
              <div className="flex gap-3 text-[11px] text-slate-300 flex-wrap items-center" onClick={(e) => e.stopPropagation()}>
                {cfFinHasBaseline && (
                  <button type="button" onClick={() => tglRefis("baseline")}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.baseline ? "" : "opacity-40"}`}
                    title={serRefis.baseline ? "Ocultar Baseline" : "Mostrar Baseline"}>
                    <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#1e40af" }} />
                    <span className={serRefis.baseline ? "" : "line-through"}>Baseline</span>
                  </button>
                )}
                {cfFinHasPlanejada && (
                  <button type="button" onClick={() => tglRefis("planejada")}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.planejada ? "" : "opacity-40"}`}
                    title={serRefis.planejada ? "Ocultar Faturamento Previsto" : "Mostrar Faturamento Previsto"}>
                    <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#ef4444" }} />
                    <span className={serRefis.planejada ? "" : "line-through"}>Faturamento Previsto</span>
                  </button>
                )}
                <button type="button" onClick={() => tglRefis("realizada")}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.realizada ? "" : "opacity-40"}`}
                  title={serRefis.realizada ? "Ocultar Faturamento Realizado" : "Mostrar Faturamento Realizado"}>
                  <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#22c55e" }} />
                  <span className={serRefis.realizada ? "" : "line-through"}>Faturamento Realizado (Físico)</span>
                </button>
                {cfHasFaturado && (
                  <button type="button" onClick={() => tglRefis("faturado")}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.faturado ? "" : "opacity-40"}`}
                    title={serRefis.faturado ? "Ocultar Faturado Real" : "Mostrar Faturado Real"}>
                    <span className="inline-block w-7 h-0.5 rounded" style={{ background: "#7c3aed" }} />
                    <span className={serRefis.faturado ? "" : "line-through"}>Faturado Real</span>
                  </button>
                )}
                <button type="button" onClick={() => tglRefis("tendencia")}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity ${serRefis.tendencia ? "" : "opacity-40"}`}
                  title={serRefis.tendencia ? "Ocultar Tendência" : "Mostrar Tendência"}>
                  <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" /></svg>
                  <span className={serRefis.tendencia ? "" : "line-through"}>Tendência</span>
                </button>
                <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform cursor-pointer ${colBloco3B ? "" : "rotate-90"}`} onClick={() => setColBloco3B(v => !v)} />
              </div>
            </div>
            {!colBloco3B && (
              <>
                <div className={`grid divide-x divide-slate-100 border-b border-slate-100 ${cfHasFaturado ? "grid-cols-6" : "grid-cols-4"}`}>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Contrato Total</p>
                    <p className="text-base font-bold text-slate-700">{fmt(totalContrato)}</p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Previsto</p>
                    <p className="text-base font-bold text-red-600">{fmt(prevAcumFin)}</p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Realizado (Físico)</p>
                    <p className="text-base font-bold text-emerald-700">{fmt(realAcumFin)}</p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio (Prev. − Real.)</p>
                    <p className={`text-base font-bold ${desvioFin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {desvioFin >= 0 ? "+" : ""}{fmt(desvioFin)}
                    </p>
                  </div>
                  {cfHasFaturado && (
                    <>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturado Real</p>
                        <p className="text-base font-bold" style={{ color: "#7c3aed" }}>{fmt(faturadoAcumulado)}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Fat. vs Físico</p>
                        <p className={`text-base font-bold ${(desvioFatVsReal ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {(desvioFatVsReal ?? 0) >= 0 ? "+" : ""}{fmt(desvioFatVsReal ?? 0)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="px-5 py-4" style={{ height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={curvaFinanceiraFull as any[]} margin={{ top: 5, right: 90, bottom: (curvaFinanceiraFull as any[]).length > 10 ? 55 : 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={55}
                        interval={0} />
                      <YAxis tickFormatter={finTickFmt} tick={{ fontSize: 10 }} width={90} />
                      <Tooltip
                        content={({ payload, label }: any) => {
                          if (!payload?.length) return null;
                          const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                          const base = get("baseline"); const plan = get("planejada"); const real = get("realizada"); const fat = get("faturado"); const tend = get("tendencia");
                          const row = (curvaFinanceiraFull as any[]).find((r: any) => r.label === label);
                          const [y, m, d] = String(row?.semana ?? "").split("-");
                          const brl = (v: any) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs min-w-[230px]">
                              <p className="font-bold text-slate-700 mb-2 pb-1.5 border-b border-slate-100">{label}{row?.semana ? ` · ${d}/${m}/${y}` : ""}</p>
                              {base != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#1e40af" }}>Baseline</span><strong>{brl(base)}</strong></p>}
                              {plan != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#ef4444" }}>Faturamento Previsto</span><strong>{brl(plan)}</strong></p>}
                              {real != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#22c55e" }}>Faturamento Realizado (Físico)</span><strong>{brl(real)}</strong></p>}
                              {fat  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#7c3aed" }}>Faturado Real</span><strong>{brl(fat)}</strong></p>}
                              {tend != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#16a34a" }}>Tendência</span><strong>{brl(tend)}</strong></p>}
                            </div>
                          );
                        }}
                      />
                      {cfHojeLabel && (
                        <ReferenceLine x={cfHojeLabel} stroke="#94a3b8" strokeDasharray="2 2"
                          label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                      )}
                      <ReferenceLine y={prevAcumFin} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1}
                        label={{ value: finTickFmt(prevAcumFin), position: "right", fontSize: 9, fill: "#dc2626", fontWeight: 700 }} />
                      <ReferenceLine y={realAcumFin} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}
                        label={{ value: finTickFmt(realAcumFin), position: "right", fontSize: 9, fill: "#16a34a", fontWeight: 700 }} />
                      {cfFinHasBaseline  && serRefis.baseline  && <Line type="monotone" dataKey="baseline"  stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls name="baseline" />}
                      {cfFinHasPlanejada && serRefis.planejada && <Line type="monotone" dataKey="planejada" stroke="#ef4444" strokeWidth={3.5} dot={false} connectNulls name="planejada" />}
                      {serRefis.realizada && <Line type="monotone" dataKey="realizada" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls name="realizada" />}
                      {serRefis.tendencia && <Line type="monotone" dataKey="tendencia" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />}
                      {cfHasFaturado && serRefis.faturado && (
                        <Line type="stepAfter" dataKey="faturado" stroke="#7c3aed" strokeWidth={2.5}
                          dot={{ r: 5, fill: "#7c3aed", strokeWidth: 0 }} activeDot={{ r: 7 }}
                          connectNulls name="faturado" />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ══════ BLOCO 4 — Avanço Físico por Grupo ══════ */}
      {grupos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco4(v => !v)}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Avanço Físico por Grupo</p>
            <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${colBloco4 ? "" : "rotate-90"}`} />
          </div>
          {!colBloco4 && (
            <div className="px-4 py-3" style={{ height: Math.max(200, grupos.length * rowHG + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gruposChart} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap="28%" barGap={3}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nomeChart" tick={{ fontSize: 10, fill: "#475569" }} width={yWidthG} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]}
                    labelFormatter={(label: string) => {
                      const g = grupos.find((x: any) => x.nome?.substring(0, TRUNC4 - 1) + "…" === label || x.nome === label);
                      return g?.nome ?? label;
                    }}
                  />
                  <Bar dataKey="previsto" name="previsto" fill="#FFB800" radius={[0, 3, 3, 0]} maxBarSize={14}>
                    <LabelList dataKey="previsto" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: "#CC9000", fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="realizado" name="realizado" fill="#1A3461" radius={[0, 3, 3, 0]} maxBarSize={14}>
                    <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: "#1A3461", fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ══════ BLOCO 5 — Avanço por Etapa dentro de cada Grupo ══════ */}
      {grupos.filter((g: any) => g.etapas?.length > 0).map((g: any) => {
        const isCollapsed = collapsedGrupos.has(g.id);
        const TRUNC5 = 32;
        const etapasChart = g.etapas.map((e: any) => ({
          ...e,
          nomeChart: e.nome?.length > TRUNC5 ? e.nome.substring(0, TRUNC5 - 1) + "…" : (e.nome ?? ""),
        }));
        const maxLenE = Math.max(8, ...etapasChart.map((e: any) => (e.nomeChart || "").length));
        const yWidthE = Math.min(240, Math.max(130, maxLenE * 6.2));
        const rowHE = 64;
        return (
          <div key={g.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-700 text-white px-5 py-2.5 flex items-center justify-between cursor-pointer select-none" onClick={() => toggleGrupo(g.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono bg-slate-600 rounded px-2 py-0.5 shrink-0">{g.eapCodigo}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-wide">{g.nome}</p>
                  {(g.dataInicio || g.dataFim) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {g.dataInicio && (
                        <span className="inline-flex items-center gap-1 bg-slate-600 rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <CalendarDays className="h-2.5 w-2.5" />
                          Início: {fmtBR(g.dataInicio)}
                        </span>
                      )}
                      {g.dataInicio && g.dataFim && <span className="text-slate-500 text-[10px] font-bold">→</span>}
                      {g.dataFim && (
                        <span className="inline-flex items-center gap-1 bg-slate-600 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                          <CalendarDays className="h-2.5 w-2.5" />
                          Fim: {fmtBR(g.dataFim)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex gap-4 text-xs">
                  <span className="text-blue-300">Previsto: <strong className="text-white">{fPct_(g.previsto)}</strong></span>
                  <span className="text-emerald-300">Realizado: <strong className="text-white">{fPct_(g.realizado)}</strong></span>
                  <span className={g.realizado >= g.previsto ? "text-emerald-300" : "text-red-300"}>
                    Desvio: <strong className="text-white">{g.realizado >= g.previsto ? "+" : ""}{fPct_(g.realizado - g.previsto)}</strong>
                  </span>
                </div>
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-600 hover:bg-slate-500 transition-colors text-white font-bold text-sm shrink-0">
                  {isCollapsed ? "+" : "−"}
                </div>
              </div>
            </div>
            {!isCollapsed && (
              <>
                <div className="px-4 py-3" style={{ height: Math.max(160, g.etapas.length * rowHE + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={etapasChart} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap="26%" barGap={3}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f8fafc" />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="nomeChart" tick={{ fontSize: 10, fill: "#475569" }} width={yWidthE} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]}
                        labelFormatter={(label: string) => {
                          const e = g.etapas.find((x: any) => x.nome?.substring(0, TRUNC5 - 1) + "…" === label || x.nome === label);
                          return e?.nome ?? label;
                        }}
                      />
                      <Bar dataKey="previsto" name="previsto" fill="#6097f8" radius={[0, 3, 3, 0]} maxBarSize={12}>
                        <LabelList dataKey="previsto" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fill: "#3b82f6", fontWeight: 600 }} />
                      </Bar>
                      <Bar dataKey="realizado" name="realizado" fill="#34d399" radius={[0, 3, 3, 0]} maxBarSize={12}>
                        <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fill: "#059669", fontWeight: 600 }} />
                        {etapasChart.map((e: any) => (
                          <Cell key={e.id} fill={e.realizado >= e.previsto ? "#34d399" : e.previsto - e.realizado > 10 ? "#f87171" : "#fbbf24"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {g.etapas.some((e: any) => e.previsto - e.realizado > 5) && (
                  <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap gap-2">
                    {g.etapas.filter((e: any) => e.previsto - e.realizado > 5).map((e: any) => (
                      <span key={e.id} className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">
                        ⚠ {e.nome}: −{fPct_(e.previsto - e.realizado)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* ══════ BLOCO 7 — Histórico de REFIs Anteriores (mantido) ══════ */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-800 text-white px-5 py-2.5 flex items-center gap-2">
          <History className="h-4 w-4 text-slate-300" />
          <p className="text-xs font-bold uppercase tracking-wider">Histórico de Relatórios Emitidos</p>
          <span className="text-[10px] text-slate-400 ml-auto">{refisLista.length} emitidos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr className="text-slate-500">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Nº</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Semana</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Emissão</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Prev. Acum.</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real. Acum.</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">SPI</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">CPI</th>
                <th className="text-center px-4 py-2.5 font-semibold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {refisLista.map((r: any) => {
                const desvio = r.avancoRealizado - r.avancoPrevisto;
                const cls = desvio >= 0 ? "text-emerald-700" : "text-red-700";
                const stBadge = r.status === "consolidado" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : r.status === "emitido" ? "bg-blue-100 text-blue-700 border-blue-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">#{r.numero || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{fmtBR(r.semana)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtBR(r.dataEmissao)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(r.avancoPrevisto)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${cls}`}>{fmtPct(r.avancoRealizado)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{Number(r.spi).toFixed(2).replace(".", ",")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{Number(r.cpi).toFixed(2).replace(".", ",")}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${stBadge}`}>{r.status || "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: CAMINHO CRÍTICO ───────────────────────────
// Espelha a função interna `CaminhoCritico` em PlanejamentoDetalhe.tsx (~7945)
// em modo SOMENTE LEITURA: 3 categorias (Crítico / Quase Crítico / Com Folga),
// cada categoria com mini-Gantt visual por atividade, expandir/recolher (ver mais),
// linha "Hoje", barras de avanço e legenda.
function AbaCaminhoCritico({ atividades, projeto }: { atividades: any[]; projeto: any }) {
  const folhas = useMemo(
    () => (atividades || []).filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim),
    [atividades]
  );

  const projectStart = useMemo(() => {
    const datas = folhas.map((a: any) => a.dataInicio).sort();
    return datas[0] ?? projeto?.dataInicio ?? null;
  }, [folhas, projeto]);

  const projectEnd = useMemo(() => {
    const datas = folhas.map((a: any) => a.dataFim).sort();
    return datas[datas.length - 1] ?? projeto?.dataTerminoContratual ?? null;
  }, [folhas, projeto]);

  const totalDays = useMemo(() => {
    if (!projectStart || !projectEnd) return 1;
    return Math.max(1, (new Date(projectEnd).getTime() - new Date(projectStart).getTime()) / 86400000);
  }, [projectStart, projectEnd]);

  const atividadesComFloat = useMemo(() => {
    if (!projectEnd) return [];
    return folhas.map((a: any) => {
      const float = Math.round((new Date(projectEnd).getTime() - new Date(a.dataFim).getTime()) / 86400000);
      const dur = Math.round((new Date(a.dataFim).getTime() - new Date(a.dataInicio).getTime()) / 86400000) + 1;
      return { ...a, float, dur, avanco: Number(a.percentRealizado ?? 0) };
    }).sort((a: any, b: any) => a.float - b.float);
  }, [folhas, projectEnd]);

  const criticas  = atividadesComFloat.filter((a: any) => a.float === 0);
  const quaseCrit = atividadesComFloat.filter((a: any) => a.float > 0 && a.float <= 14);
  const comFolga  = atividadesComFloat.filter((a: any) => a.float > 14);

  // Rev. 1520: filtro por card. null = mostrar todas as 3 listas.
  const [filtroCategoria, setFiltroCategoria] = useState<null | "critico" | "quase" | "folga">(null);
  const toggleFiltro = (k: "critico" | "quase" | "folga") => setFiltroCategoria((prev) => (prev === k ? null : k));
  const mostrarCriticas = filtroCategoria === null || filtroCategoria === "critico";
  const mostrarQuase = filtroCategoria === null || filtroCategoria === "quase";
  const mostrarFolga = filtroCategoria === null || filtroCategoria === "folga";

  const hoje = new Date().toISOString().split("T")[0];

  function GanttBar({ a }: { a: any }) {
    if (!projectStart || !projectEnd) return null;
    const startPct = Math.max(0, (new Date(a.dataInicio).getTime() - new Date(projectStart).getTime()) / 86400000 / totalDays * 100);
    const widthPct = Math.min(100 - startPct, a.dur / totalDays * 100);
    const color = a.float === 0 ? "bg-red-500" : a.float <= 14 ? "bg-amber-400" : "bg-blue-300";
    const avancoPct = a.avanco;
    return (
      <div className="relative w-full h-5 bg-slate-100 rounded overflow-hidden">
        <div className={`absolute h-full rounded ${color} opacity-60`} style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}>
          <div className="h-full bg-current opacity-60 rounded" style={{ width: `${avancoPct}%` }} />
        </div>
        {a.dataFim >= hoje && a.dataInicio <= hoje && (
          <div className="absolute top-0 h-full w-0.5 bg-slate-700 z-10 opacity-60"
            style={{ left: `${Math.max(0, (new Date(hoje).getTime() - new Date(projectStart).getTime()) / 86400000 / totalDays * 100)}%` }} />
        )}
      </div>
    );
  }

  function AtivList({ list, badgeClass }: { list: any[]; badgeClass: string }) {
    const [exp, setExp] = useState(false);
    const shown = exp ? list : list.slice(0, 15);
    return (
      <div className="space-y-1">
        {shown.map((a: any) => (
          <div key={a.id} className="grid gap-x-2 items-center text-xs" style={{ gridTemplateColumns: "2.5rem minmax(0,1fr) 6rem 4.5rem 5rem" }}>
            <span className="font-mono text-slate-400 truncate">{a.eapCodigo ?? ""}</span>
            <span className="text-slate-700 truncate" title={a.nome}>{a.nome}</span>
            <GanttBar a={a} />
            <span className="text-right text-slate-500 whitespace-nowrap">{fmtBR(a.dataFim)}</span>
            <div className="flex items-center justify-end gap-1">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden min-w-[40px]">
                <div className={`h-full rounded-full ${a.avanco >= 100 ? "bg-emerald-500" : a.float === 0 ? "bg-red-400" : "bg-blue-400"}`} style={{ width: `${Math.min(100, a.avanco)}%` }} />
              </div>
              <span className={`font-semibold shrink-0 tabular-nums ${badgeClass}`}>{a.avanco.toFixed(0)}%</span>
            </div>
          </div>
        ))}
        {list.length > 15 && (
          <button className="text-[10px] text-blue-600 hover:underline mt-1" onClick={() => setExp(v => !v)}>
            {exp ? "Ver menos" : `Ver mais ${list.length - 15} atividades...`}
          </button>
        )}
      </div>
    );
  }

  if (folhas.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem atividades para calcular o Caminho Crítico.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Rev. 1518: bloco didático no topo, em linguagem técnica de engenharia. */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 leading-relaxed">
          <strong className="block mb-1 text-sm">Caminho Crítico — método CPM</strong>
          O Caminho Crítico é calculado pelo <strong>CPM (Critical Path Method)</strong> considerando o <strong>float total</strong> de cada atividade — folga, em dias, entre o término planejado da atividade e o término planejado do projeto. As atividades com float zerado definem o <strong>prazo contratual da obra</strong>: qualquer desvio negativo nessas atividades produz atraso direto na entrega final, sem absorção pela rede de precedências.
        </div>
      </div>

      {/* 3 cards de KPI por categoria — Rev. 1520: clicáveis. Clicar filtra a lista
          abaixo só para aquela categoria; clicar de novo volta a mostrar todas. */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => toggleFiltro("critico")}
          className={`text-center rounded-xl p-3 transition-all border-2 ${
            filtroCategoria === "critico"
              ? "bg-red-100 border-red-500 shadow-md ring-2 ring-red-300/50"
              : "bg-red-50 border-red-200 hover:border-red-400 hover:shadow-sm"
          }`}
          title={filtroCategoria === "critico" ? "Clique para mostrar todas as categorias" : "Clique para ver só as atividades do Caminho Crítico"}
        >
          <p className="text-2xl font-bold text-red-600">{criticas.length}</p>
          <p className="text-xs text-red-700 mt-0.5 font-medium">Caminho Crítico</p>
          <p className="text-[10px] text-red-400">Float = 0 dias</p>
          {filtroCategoria === "critico" && <p className="text-[10px] text-red-700 mt-1 font-semibold">✓ filtrando</p>}
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro("quase")}
          className={`text-center rounded-xl p-3 transition-all border-2 ${
            filtroCategoria === "quase"
              ? "bg-amber-100 border-amber-500 shadow-md ring-2 ring-amber-300/50"
              : "bg-amber-50 border-amber-200 hover:border-amber-400 hover:shadow-sm"
          }`}
          title={filtroCategoria === "quase" ? "Clique para mostrar todas as categorias" : "Clique para ver só as atividades Quase Críticas"}
        >
          <p className="text-2xl font-bold text-amber-600">{quaseCrit.length}</p>
          <p className="text-xs text-amber-700 mt-0.5 font-medium">Quase Crítico</p>
          <p className="text-[10px] text-amber-400">Float ≤ 14 dias</p>
          {filtroCategoria === "quase" && <p className="text-[10px] text-amber-700 mt-1 font-semibold">✓ filtrando</p>}
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro("folga")}
          className={`text-center rounded-xl p-3 transition-all border-2 ${
            filtroCategoria === "folga"
              ? "bg-blue-100 border-blue-500 shadow-md ring-2 ring-blue-300/50"
              : "bg-blue-50 border-blue-200 hover:border-blue-400 hover:shadow-sm"
          }`}
          title={filtroCategoria === "folga" ? "Clique para mostrar todas as categorias" : "Clique para ver só as atividades Com Folga"}
        >
          <p className="text-2xl font-bold text-blue-600">{comFolga.length}</p>
          <p className="text-xs text-blue-700 mt-0.5 font-medium">Com Folga</p>
          <p className="text-[10px] text-blue-400">Float &gt; 14 dias</p>
          {filtroCategoria === "folga" && <p className="text-[10px] text-blue-700 mt-1 font-semibold">✓ filtrando</p>}
        </button>
      </div>

      {/* Banner do filtro ativo (com botão limpar) */}
      {filtroCategoria !== null && (
        <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
          <span>
            Filtrando por:{" "}
            <strong className={
              filtroCategoria === "critico" ? "text-red-700" :
              filtroCategoria === "quase" ? "text-amber-700" : "text-blue-700"
            }>
              {filtroCategoria === "critico" ? "Caminho Crítico" : filtroCategoria === "quase" ? "Quase Crítico" : "Com Folga"}
            </strong>
          </span>
          <button onClick={() => setFiltroCategoria(null)} className="text-blue-600 hover:underline font-medium">
            Limpar filtro · ver todas
          </button>
        </div>
      )}

      {/* Rev. 1518: legendas explicativas por categoria — sempre visíveis,
          em linguagem de engenharia, indicando como TRATAR cada grupo de risco. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-red-200 rounded-xl p-3.5 text-[11.5px] leading-relaxed">
          <p className="font-semibold text-red-700 mb-1.5 flex items-center gap-1.5">
            <AlertOctagon className="h-3.5 w-3.5" /> Tratamento operacional · diário
          </p>
          <p className="text-slate-600">
            Atividades <strong>sem folga total</strong> na rede. Exigem <strong>monitoramento diário em campo</strong>, liberação prévia de frente de serviço, cobertura integral de insumos no canteiro e equipe dedicada. Desvios devem ser registrados no RDO e escalados ao gestor da obra <strong>no mesmo dia</strong>.
          </p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-3.5 text-[11.5px] leading-relaxed">
          <p className="font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Tratamento tático · semanal
          </p>
          <p className="text-slate-600">
            Atividades em <strong>risco iminente de migração para o caminho crítico</strong> (float total ≤ 14 dias). Acompanhamento na reunião semanal de obra, antecipação de mobilização (mão de obra, equipamento e materiais) e revisão das predecessoras. <strong>Float &lt; 7 dias</strong> deve ser conduzido como crítico.
          </p>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-3.5 text-[11.5px] leading-relaxed">
          <p className="font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Tratamento gerencial · quinzenal
          </p>
          <p className="text-slate-600">
            Atividades com <strong>folga total &gt; 14 dias</strong>. Funcionam como <strong>reserva de capacidade</strong> da rede — equipe e equipamento podem ser temporariamente realocados em apoio às atividades críticas sem comprometer o prazo contratual da obra.
          </p>
        </div>
      </div>

      {/* Legenda Gantt */}
      <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-white border border-slate-100 rounded-lg p-2 shadow-sm flex-wrap">
        <span className="font-medium text-slate-500 mr-2">Gantt:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-red-400 opacity-60" /> Crítico</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-3 h-2 rounded bg-amber-400 opacity-60" /> Quase crítico</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-3 h-2 rounded bg-blue-300 opacity-60" /> Com folga</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-px h-3 bg-slate-700 opacity-60" /> Hoje</span>
        <span className="ml-auto text-slate-400">Período: {fmtBR(projectStart)} → {fmtBR(projectEnd)}</span>
      </div>

      {mostrarCriticas && criticas.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-2">
            <AlertOctagon className="h-4 w-4" />
            Caminho Crítico — {criticas.length} atividades (Float = 0)
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Definem o prazo final da obra. Atraso aqui = atraso na entrega contratual.
          </p>
          <AtivList list={criticas} badgeClass="text-red-600" />
        </div>
      )}

      {mostrarQuase && quaseCrit.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-amber-700 mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Quase Crítico — {quaseCrit.length} atividades (Float ≤ 14 dias)
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Próximas a virar caminho crítico. Antecipar mobilização e suprimentos para preservar a folga.
          </p>
          <AtivList list={quaseCrit} badgeClass="text-amber-600" />
        </div>
      )}

      {mostrarFolga && comFolga.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
            Com Folga — {comFolga.length} atividades (Float &gt; 14 dias)
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Folga confortável na rede. Servem como reserva de capacidade para apoio às atividades críticas.
          </p>
          <AtivList list={comFolga} badgeClass="text-blue-600" />
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        * Float calculado como diferença entre a data fim da atividade e a data fim do projeto. Sem dados de predecessoras esta é uma aproximação heurística (mesma fórmula usada no módulo interno de Planejamento).
      </p>
    </div>
  );
}

// ─────────────────────── ABA: EFETIVO (CLT + Terceiros) ──────────────────
const STATUS_COLORS: Record<string, string> = {
  Ativo: "bg-emerald-100 text-emerald-700 border border-emerald-300",
  Aviso: "bg-amber-100 text-amber-800 border border-amber-300",
  Ferias: "bg-blue-100 text-blue-700 border border-blue-300",
  Férias: "bg-blue-100 text-blue-700 border border-blue-300",
  Afastado: "bg-purple-100 text-purple-700 border border-purple-300",
  Atestado: "bg-rose-100 text-rose-700 border border-rose-300",
  Desligado: "bg-slate-200 text-slate-600 border border-slate-300",
  Demitido: "bg-slate-200 text-slate-600 border border-slate-300",
};
const STATUS_LABELS: Record<string, string> = {
  Ativo: "Ativo",
  Aviso: "Aviso Prévio",
  Ferias: "Férias",
  Férias: "Férias",
  Afastado: "Afastado",
  Atestado: "Atestado",
  Desligado: "Desligado",
  Demitido: "Demitido",
};

function AbaEfetivo({ token, obraId }: { token: string; obraId: number }) {
  const { data: equipeRaw = [], isLoading } = trpc.portalExterno.cliente.efetivoObra.useQuery(
    { token, obraId },
    { enabled: !!token && obraId > 0 }
  );
  // Rev. 1587 — Carrega documentos (ASO + treinamentos) para expandir o detalhe
  // ao clicar no funcionário, igual ao módulo "RH / Documentos".
  const { data: rhData } = trpc.portalExterno.cliente.documentosRhObra.useQuery(
    { token, obraId },
    { enabled: !!token && obraId > 0 }
  );
  const docsByEmpId = useMemo(() => {
    const m = new Map<number, any>();
    for (const f of (rhData?.funcionarios ?? []) as any[]) m.set(f.id, f);
    return m;
  }, [rhData]);
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [pdfViewer, setPdfViewer] = useState<{ url: string; titulo: string; subtitulo: string } | null>(null);
  const abrirPdf = (kind: "aso" | "treinamento" | "integracao", id: number, titulo: string, subtitulo: string) => {
    const url = `/api/portal/cliente/documento/${kind}/${id}?token=${encodeURIComponent(token)}#toolbar=0&navpanes=0&scrollbar=1`;
    setPdfViewer({ url, titulo, subtitulo });
  };
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [busca, setBusca] = useState("");
  // Rev. 1519: cliente não precisa ver regime de contratação (CLT vs PJ).
  // Consolidamos CLT+PJ em "Próprios FC" e mantemos Terceiros separado.
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "Proprio" | "Terceiro">("todos");
  const [filtroCat, setFiltroCat] = useState<"todos" | "Direto" | "Indireto">("todos");

  const equipe = useMemo(() => {
    return (equipeRaw as any[]).filter(
      (e) => e.effectiveStatus !== "Desligado" && e.effectiveStatus !== "Demitido"
    );
  }, [equipeRaw]);

  const totCLT = useMemo(() => equipe.filter((e) => e.tipo === "CLT").length, [equipe]);
  const totPJ = useMemo(() => equipe.filter((e) => e.tipo === "PJ").length, [equipe]);
  const totTerc = useMemo(() => equipe.filter((e) => e.tipo === "Terceiro").length, [equipe]);
  const totDireto = useMemo(() => equipe.filter((e) => e.categoria === "Direto").length, [equipe]);
  const totIndireto = useMemo(() => equipe.filter((e) => e.categoria === "Indireto").length, [equipe]);
  const totGeral = equipe.length;

  const lista = useMemo(() => {
    let l = equipe;
    if (filtroTipo === "Terceiro") l = l.filter((e) => e.tipo === "Terceiro");
    else if (filtroTipo === "Proprio") l = l.filter((e) => e.tipo !== "Terceiro");
    if (filtroCat !== "todos") l = l.filter((e) => (e.categoria || "Direto") === filtroCat);
    if (busca) {
      const q = busca.toLowerCase();
      l = l.filter((e: any) =>
        (e.nomeCompleto || "").toLowerCase().includes(q) ||
        (e.funcao || "").toLowerCase().includes(q) ||
        (e.empresaTerceira || e.setor || "").toLowerCase().includes(q)
      );
    }
    return [...l].sort((a, b) => (a.nomeCompleto || "").localeCompare(b.nomeCompleto || ""));
  }, [equipe, filtroTipo, filtroCat, busca]);

  const iniciais = (nome: string) =>
    (nome || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 justify-center py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando efetivo da obra...
      </div>
    );
  }

  // Rev. 1588 — KPIs viraram botões clicáveis: alternam o filtro correspondente
  // (clicar de novo no card ativo desliga o filtro). Os 3 primeiros cards
  // (Próprios/Terceiros/Total) operam no grupo "tipo"; os 2 de baixo
  // (Direta/Indireta) operam no grupo "categoria".
  const Kpi = ({
    label, value, color, icon: Icon, group, filterKey,
  }: {
    label: string;
    value: number;
    color: string;
    icon: any;
    group: "tipo" | "cat";
    filterKey: "todos" | "Proprio" | "Terceiro" | "Direto" | "Indireto";
  }) => {
    const ativo = group === "tipo"
      ? (filtroTipo === filterKey)
      : (filtroCat === filterKey);
    const ringClr = color.replace("text-", "ring-").replace("-700", "-400").replace("-600", "-400");
    const bgSoft = color.replace("text-", "bg-").replace("-700", "-50").replace("-600", "-50");
    const iconBg = color.replace("text-", "bg-").replace("-700", "-100").replace("-600", "-100");
    const onClick = () => {
      if (group === "tipo") {
        const k = filterKey as "todos" | "Proprio" | "Terceiro";
        // No grupo "tipo", "Total Geral" (todos) sempre limpa o filtro;
        // os outros alternam: clicar no ativo volta para "todos".
        setFiltroTipo((cur) => (k === "todos" ? "todos" : cur === k ? "todos" : k));
      } else {
        const k = filterKey as "Direto" | "Indireto";
        setFiltroCat((cur) => (cur === k ? "todos" : k));
      }
    };
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={ativo}
        title={ativo ? "Clique para remover o filtro" : `Filtrar por ${label}`}
        className={`flex-1 text-left bg-white rounded-xl border shadow-sm px-4 py-3 transition cursor-pointer w-full
          ${ativo ? `${bgSoft} border-transparent ring-2 ${ringClr}` : "border-slate-200 hover:border-slate-300 hover:shadow-md"}`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase font-semibold text-slate-500 tracking-wide truncate">
              {label}
              {ativo && <span className="ml-1.5 text-[9px] text-emerald-600 normal-case">• filtrando</span>}
            </p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${iconBg} shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <HardHat className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Efetivo da Obra</h2>
            <p className="text-xs text-muted-foreground">{totGeral} pessoa(s) — próprios FC e terceiros alocados</p>
          </div>
        </div>
        <input
          type="text"
          placeholder="Buscar nome, função ou empresa..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-72 bg-white shadow-sm"
        />
      </div>

      {/* Rev. 1519: KPIs sem distinção de regime CLT/PJ — cliente vê
          apenas Próprios FC vs Terceiros + Total Geral. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Próprios FC" value={totCLT + totPJ} color="text-blue-700" icon={Users} group="tipo" filterKey="Proprio" />
        <Kpi label="Total Terceiros" value={totTerc} color="text-amber-700" icon={Handshake} group="tipo" filterKey="Terceiro" />
        <Kpi label="Total Geral" value={totGeral} color="text-emerald-700" icon={HardHat} group="tipo" filterKey="todos" />
      </div>

      {/* KPIs Direto / Indireto */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Mão de Obra Direta" value={totDireto} color="text-emerald-700" icon={HardHat} group="cat" filterKey="Direto" />
        <Kpi label="Mão de Obra Indireta" value={totIndireto} color="text-slate-700" icon={Users} group="cat" filterKey="Indireto" />
      </div>

      {/* Filtros: tipo de contrato + categoria */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5">
        {(["todos", "Proprio", "Terceiro"] as const).map((k) => {
          const active = filtroTipo === k;
          const count = k === "todos" ? totGeral : k === "Proprio" ? (totCLT + totPJ) : totTerc;
          return (
            <button
              key={k}
              onClick={() => setFiltroTipo(k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                active ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm" : "text-slate-500 hover:bg-slate-50 border-transparent"
              }`}
            >
              <span className="font-bold">{count}</span>
              <span>{k === "todos" ? "Todos" : k === "Proprio" ? "Apenas Próprios FC" : "Apenas Terceiros"}</span>
            </button>
          );
        })}
        <span className="mx-2 h-5 w-px bg-slate-200" />
        {(["todos", "Direto", "Indireto"] as const).map((k) => {
          const active = filtroCat === k;
          const count = k === "todos" ? totGeral : k === "Direto" ? totDireto : totIndireto;
          return (
            <button
              key={k}
              onClick={() => setFiltroCat(k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                active ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm" : "text-slate-500 hover:bg-slate-50 border-transparent"
              }`}
            >
              <span className="font-bold">{count}</span>
              <span>{k === "todos" ? "Direto + Indireto" : k === "Direto" ? "Apenas Diretos" : "Apenas Indiretos"}</span>
            </button>
          );
        })}
      </div>

      {totGeral === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-blue-200 bg-blue-50">
          <HardHat className="h-10 w-10 mx-auto mb-3 text-blue-300" />
          <p className="text-sm font-medium text-blue-600">Nenhuma pessoa alocada nesta obra</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 480px)", minHeight: 200 }}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase w-12">Foto</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Nome</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Função</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Categoria</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">ASO</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Treinamentos</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((e: any) => {
                  const isTerc = e.tipo === "Terceiro";
                  const isPJ = e.tipo === "PJ";
                  const cat = (e.categoria || "Direto") as "Direto" | "Indireto";
                  const catBadge = cat === "Direto"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-slate-200 text-slate-700 border border-slate-300";
                  const docs = isTerc ? null : docsByEmpId.get(e.id as number);
                  const asoStatus = docs?.asoStatus ?? "sem_aso";
                  const asoColor = asoStatus === "vigente" ? "bg-emerald-100 text-emerald-800"
                    : asoStatus === "vencido" ? "bg-rose-100 text-rose-800"
                    : "bg-slate-100 text-slate-500";
                  const trVig = docs?.treinamentosVigentes ?? 0;
                  const trVenc = docs?.treinamentosVencidos ?? 0;
                  // Rev. 1587 — chave estável por id (próprios = number, terceiros = "T<id>");
                  // não usar índice da lista, senão filtros/busca reembaralham e
                  // dropam o estado de expansão.
                  const rowKey = String(e.id);
                  const expanded = !!exp[rowKey];
                  const podeExpandir = !isTerc; // terceiros não estão no endpoint de RH
                  const toggle = () => { if (podeExpandir) setExp(s => ({ ...s, [rowKey]: !s[rowKey] })); };
                  const onKeyToggle = (ev: React.KeyboardEvent) => {
                    if (!podeExpandir) return;
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); }
                  };
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className={`hover:bg-blue-50/30 ${podeExpandir ? "cursor-pointer" : ""}`}
                        onClick={toggle}
                        {...(podeExpandir ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-expanded": expanded,
                          onKeyDown: onKeyToggle,
                        } : {})}
                      >
                        <td className="px-2 py-2 text-center">
                          {podeExpandir ? (
                            expanded ? <ChevronDown className="h-4 w-4 text-slate-400 inline" /> : <ChevronRight className="h-4 w-4 text-slate-400 inline" />
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {/* Rev. 2297 — foto clicável (lightbox global) */}
                          <PersonPhoto src={e.fotoUrl} alt={e.nomeCompleto} size="sm" caption={isTerc ? (e.empresaTerceira || "Terceiro") : isPJ ? "PJ" : "CLT"} />
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-800 text-[13px]">
                          <span className={podeExpandir ? "hover:text-blue-700 hover:underline underline-offset-2" : ""}>{e.nomeCompleto}</span>
                          {isTerc && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{e.empresaTerceira || "Terceiro"}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600 text-[13px]">{e.funcao || e.cargo || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${catBadge}`}>
                            {cat}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isTerc ? (
                            <span className="text-[10px] text-slate-400">—</span>
                          ) : (
                            <>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${asoColor}`}>
                                {asoStatus === "vigente" ? "Vigente" : asoStatus === "vencido" ? "Vencido" : "Sem ASO"}
                              </span>
                              {docs?.aso?.dataValidade && (
                                <p className="text-[10px] text-slate-400 mt-0.5">até {fmtBR(docs.aso.dataValidade)}</p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isTerc ? (
                            <span className="text-[10px] text-slate-400">—</span>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700" title="Treinamentos vigentes">
                                <GraduationCap className="h-3.5 w-3.5 text-emerald-600" /> {trVig}
                              </span>
                              {trVenc > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full" title="Treinamentos vencidos">
                                  <FileX2 className="h-3 w-3" /> {trVenc}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[e.effectiveStatus] || "bg-slate-100 text-slate-600"}`}>
                            {STATUS_LABELS[e.effectiveStatus] || e.effectiveStatus}
                          </span>
                        </td>
                      </tr>
                      {expanded && podeExpandir && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={8} className="px-6 py-4">
                            {!docs ? (
                              <p className="text-xs text-slate-400">Sem dados de documentos para este funcionário.</p>
                            ) : (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                                {/* Rev. 1590 — Integração de Segurança SST.
                                    Portal do Cliente: SÓ data de validade
                                    (sem alerta de 30 dias). */}
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Integração SST
                                  </p>
                                  {docs.integracao ? (
                                    <>
                                      <ul className="space-y-1 text-slate-600">
                                        <li><b>Realização:</b> {fmtBR(docs.integracao.dataRealizacao)}</li>
                                        <li><b>Validade:</b> {fmtBR(docs.integracao.dataValidade)}</li>
                                      </ul>
                                      {docs.integracao.temPdf && (
                                        <button
                                          onClick={(ev) => { ev.stopPropagation(); abrirPdf("integracao", docs.integracao.id, `Integração — ${e.nomeCompleto}`, `Validade ${fmtBR(docs.integracao.dataValidade)}`); }}
                                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold border border-blue-200 transition"
                                        >
                                          <Eye className="h-3 w-3" /> Ver Certificado
                                        </button>
                                      )}
                                    </>
                                  ) : <p className="text-slate-400">Sem integração registrada.</p>}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" /> ASO
                                  </p>
                                  {docs.aso ? (
                                    <>
                                      <ul className="space-y-1 text-slate-600">
                                        <li><b>Tipo:</b> {docs.aso.tipo || "—"}</li>
                                        <li><b>Resultado:</b> {docs.aso.resultado || "—"}</li>
                                        <li><b>Exame:</b> {fmtBR(docs.aso.dataExame)}</li>
                                        <li><b>Validade:</b> {fmtBR(docs.aso.dataValidade)}</li>
                                      </ul>
                                      {docs.aso.temPdf && (
                                        <button
                                          onClick={(ev) => { ev.stopPropagation(); abrirPdf("aso", docs.aso.id, `ASO — ${e.nomeCompleto}`, `${docs.aso.tipo || "Periódico"} • Validade ${fmtBR(docs.aso.dataValidade)}`); }}
                                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-semibold border border-emerald-200 transition"
                                        >
                                          <Eye className="h-3 w-3" /> Ver PDF
                                        </button>
                                      )}
                                    </>
                                  ) : <p className="text-slate-400">Sem ASO registrado.</p>}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                    <GraduationCap className="h-3.5 w-3.5 text-emerald-600" /> Treinamentos ({docs.treinamentos?.length ?? 0})
                                  </p>
                                  {!docs.treinamentos || docs.treinamentos.length === 0 ? (
                                    <p className="text-slate-400">Sem treinamentos.</p>
                                  ) : (
                                    <ul className="space-y-1.5 text-slate-600 max-h-44 overflow-y-auto">
                                      {docs.treinamentos.map((t: any, ix: number) => {
                                        const desc = (t.nome && t.nome.toUpperCase() !== String(t.norma || "").toUpperCase())
                                          ? t.nome
                                          : getNrDescricao(t.norma);
                                        const venceu = t.dataValidade && t.dataValidade < hojeStr;
                                        return (
                                          <li key={ix} className="flex items-start justify-between gap-2 py-0.5">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                                <b className="text-slate-800">{t.norma || t.nome || "—"}</b>
                                                {desc && <span className="text-slate-500 text-[11px] truncate" title={desc}>{desc}</span>}
                                              </div>
                                              <div className={`text-[10.5px] ${venceu ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                                                {venceu ? "venceu" : "val."} {fmtBR(t.dataValidade)}
                                              </div>
                                            </div>
                                            {t.temPdf && (
                                              <button
                                                onClick={(ev) => { ev.stopPropagation(); abrirPdf("treinamento", t.id, `Certificado — ${t.norma || t.nome}${desc ? " · " + desc : ""}`, `${e.nomeCompleto} • Validade ${fmtBR(t.dataValidade)}`); }}
                                                className="shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-semibold border border-emerald-200 transition"
                                              >
                                                <Eye className="h-3 w-3" /> Ver
                                              </button>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {lista.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">Nenhum resultado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visualizador de PDF inline (mesma UX do módulo RH/Documentos) */}
      {pdfViewer && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
          onContextMenu={(ev) => ev.preventDefault()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 text-white border-b border-slate-700">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{pdfViewer.titulo}</p>
              <p className="text-[11px] text-slate-300 truncate">{pdfViewer.subtitulo}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-200 bg-amber-900/40 px-2 py-1 rounded-md border border-amber-700/40">
                Visualização — Download desabilitado
              </span>
              <button
                onClick={() => setPdfViewer(null)}
                aria-label="Fechar"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition"
              >
                <X className="h-4 w-4" /> Fechar
              </button>
            </div>
          </div>
          {/* Rev. 1641 — Chrome trata o visualizador interno de PDF como plugin
              e o atributo `sandbox` no <iframe> bloqueia o render (tela cinza).
              Usamos <object>, que é o padrão compatível com Chrome/Edge/Firefox
              para PDF embutido, com fallback de "abrir em nova aba" caso o
              navegador não consiga renderizar (ex.: arquivo corrompido). */}
          <object
            data={pdfViewer.url}
            type="application/pdf"
            className="pdf-viewer-frame flex-1 w-full bg-white"
            aria-label={pdfViewer.titulo}
          >
            <div className="flex flex-col items-center justify-center h-full bg-slate-100 text-slate-700 p-6 text-center gap-3">
              <p className="text-sm">Não foi possível exibir o documento neste navegador.</p>
              <a
                href={pdfViewer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition"
              >Abrir em nova aba</a>
            </div>
          </object>
        </div>
      )}
    </div>
  );
}

// ─────────────────────── ABA: CUSTO MO (mensal) ─────────────────────────
function AbaEfetivoMensal({ efetivoMensal }: { efetivoMensal: any[] }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMes = (m: string) => {
    const [y, mm] = m.split("-");
    return `${mm}/${y}`;
  };
  const totais = useMemo(() => {
    return efetivoMensal.reduce((acc, m: any) => ({
      direto: acc.direto + m.direto,
      indireto: acc.indireto + m.indireto,
      central: acc.central + m.central,
      total: acc.total + m.total,
    }), { direto: 0, indireto: 0, central: 0, total: 0 });
  }, [efetivoMensal]);

  if (efetivoMensal.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem dados de efetivo (custos de mão de obra) lançados.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Direto" value={fmtMoeda(totais.direto)} icon={<HardHat className="h-4 w-4 text-blue-600" />} />
        <KpiCard label="Total Indireto" value={fmtMoeda(totais.indireto)} icon={<HardHat className="h-4 w-4 text-amber-600" />} />
        <KpiCard label="Total Central" value={fmtMoeda(totais.central)} icon={<Building2 className="h-4 w-4 text-purple-600" />} />
        <KpiCard label="Total Geral" value={fmtMoeda(totais.total)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-orange-50/60 to-white flex items-center gap-2">
          <HardHat className="h-4 w-4 text-orange-600" />
          <h3 className="font-semibold text-slate-800">Efetivo / Custos de Mão de Obra (mensal)</h3>
          <span className="text-xs text-slate-500 ml-auto">{efetivoMensal.length} meses</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr className="text-slate-500">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Mês</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Direto</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Indireto</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Central</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {efetivoMensal.map((m: any) => (
                <tr key={m.mesReferencia} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{fmtMes(m.mesReferencia)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.direto)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.indireto)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.central)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtMoeda(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">
              <tr className="font-bold text-slate-800">
                <td className="px-4 py-2.5">TOTAL</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.direto)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.indireto)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.central)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: CRONO. FINANCEIRO ─────────────────────────
function AbaCronoFinanceiro({ curvaS, valorContrato }: { curvaS: any[]; valorContrato: number }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dados = useMemo(() => curvaS.map((p: any) => ({
    semana: fmtBR(p.semana),
    previstoR$: (p.previsto / 100) * valorContrato,
    realizadoR$: p.realizado != null ? (p.realizado / 100) * valorContrato : null,
  })), [curvaS, valorContrato]);
  if (!valorContrato || curvaS.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem valor de contrato cadastrado ou sem dados de Curva S.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Cronograma Financeiro</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Baseado em Curva S × Valor de Contrato ({fmtMoeda(valorContrato)})</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados}>
              <defs>
                <linearGradient id="prevR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                <linearGradient id="realR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: any) => v == null ? "—" : fmtMoeda(Number(v))} />
              <Area type="monotone" dataKey="previstoR$" stroke="none" fill="url(#prevR)" />
              <Area type="monotone" dataKey="realizadoR$" stroke="none" fill="url(#realR)" />
              <Line type="monotone" dataKey="previstoR$" stroke="#3b82f6" strokeWidth={2} dot={false} name="Previsto R$" />
              <Line type="monotone" dataKey="realizadoR$" stroke="#10b981" strokeWidth={2} dot={false} name="Realizado R$" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: PREV. MEDIÇÃO ─────────────────────────────
function AbaPrevMedicao({ curvaS, valorContrato }: { curvaS: any[]; valorContrato: number }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Agrupa curva S por mês — pega a última semana de cada mês como acumulado
  const porMes = useMemo(() => {
    const m: Record<string, { mes: string; prevAcum: number; realAcum: number | null }> = {};
    for (const p of curvaS) {
      const ym = p.semana.slice(0, 7);
      m[ym] = { mes: ym, prevAcum: p.previsto, realAcum: p.realizado };
    }
    const arr = Object.values(m).sort((a, b) => a.mes.localeCompare(b.mes));
    let prevPrevAcum = 0; let prevRealAcum = 0;
    return arr.map((x) => {
      const prevMes = x.prevAcum - prevPrevAcum;
      const realMes = x.realAcum != null ? x.realAcum - prevRealAcum : null;
      prevPrevAcum = x.prevAcum;
      if (x.realAcum != null) prevRealAcum = x.realAcum;
      return {
        mes: x.mes,
        previstoPct: prevMes,
        realizadoPct: realMes,
        previstoR$: (prevMes / 100) * valorContrato,
        realizadoR$: realMes != null ? (realMes / 100) * valorContrato : null,
      };
    });
  }, [curvaS, valorContrato]);
  if (porMes.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem dados de medição prevista.</div>;
  }
  const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${mm}/${y}`; };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50/60 to-white flex items-center gap-2">
        <FileText className="h-4 w-4 text-indigo-600" />
        <h3 className="font-semibold text-slate-800">Previsão de Medição (mensal)</h3>
        <span className="text-xs text-slate-500 ml-auto">Contrato: {fmtMoeda(valorContrato)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/80">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Mês</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Prev.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">R$ Previsto</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">R$ Realizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {porMes.map((m) => (
              <tr key={m.mes} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{fmtMes(m.mes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(m.previstoPct)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.previstoR$)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{m.realizadoPct == null ? "—" : fmtPct(m.realizadoPct)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{m.realizadoR$ == null ? "—" : fmtMoeda(m.realizadoR$)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: DIAGRAMA DE REDE ──────────────────────────
// Espelha exatamente o componente do módulo interno (DiagramaRede.tsx) — mostra
// dois modos (Hierarquia e Rede), com nodes coloridos por status, busca, filtros
// de status/grupo/semana, zoom e seleção. Em modo SOMENTE LEITURA: o cliente
// não pode editar atividades, predecessoras nem o próprio diagrama (o componente
// interno já é puramente de visualização — não emite mutações).
function AbaDiagramaRede({ atividades }: { atividades: any[] }) {
  // Mapa { atividadeId → percentual realizado } esperado pelo componente interno.
  const avancosMap = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const a of atividades || []) {
      m[a.id] = Number(a.percentRealizado ?? 0);
    }
    return m;
  }, [atividades]);

  // Banner de contexto + componente visual idêntico ao interno.
  const folhas = (atividades || []).filter((a: any) => !a.isGrupo);
  const comDep = folhas.filter((a: any) => a.predecessora && String(a.predecessora).trim());

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <GitBranch className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <strong className="block mb-1">Diagrama de Rede — Sequência lógica de execução</strong>
          Use o botão <em>Hierarquia</em> para ver toda a estrutura da obra agrupada por EAP, ou <em>Rede</em> para ver apenas
          as dependências (predecessoras → sucessoras). Clique em qualquer atividade para destacá-la e ver detalhes.
          {" "}<span className="font-medium">{comDep.length} de {folhas.length} atividades</span> têm predecessora cadastrada.
        </div>
      </div>
      <DiagramaRedeInterno atividades={atividades || []} avancosMap={avancosMap} />
    </div>
  );
}

// ─────────────────────── ABA: CUSTO RH ──────────────────────────────────
function AbaCustoRh({ efetivoMensal }: { efetivoMensal: any[] }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${mm}/${y}`; };
  if (efetivoMensal.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem custos de RH lançados.</div>;
  }
  const dadosGrafico = efetivoMensal.map((m: any) => ({
    mes: fmtMes(m.mesReferencia),
    Direto: m.direto,
    Indireto: m.indireto,
    Central: m.central,
  }));
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Evolução do Custo RH (mensal)</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: any) => fmtMoeda(Number(v))} />
              <Line type="monotone" dataKey="Direto" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Indireto" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="Central" stroke="#a855f7" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <AbaEfetivoMensal efetivoMensal={efetivoMensal} />
    </div>
  );
}

// ─────────────────────── ABA: BIM 3D ────────────────────────────────────
function AbaBim3D({ obra }: { obra: any }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-cyan-50/60 to-white flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-cyan-600" />
        <h3 className="font-semibold text-slate-800">Modelo BIM 3D</h3>
      </div>
      <div className="p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-50 text-cyan-600 mb-4">
          <BarChart3 className="h-8 w-8" />
        </div>
        <h4 className="text-base font-semibold text-slate-800 mb-2">Visualização 3D da Obra</h4>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
          O modelo BIM 3D desta obra está sendo preparado pelo gestor.
          Para acessá-lo, entre em contato com o responsável técnico do projeto.
        </p>
        {obra?.nome && (
          <div className="inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <Building2 className="h-3.5 w-3.5" />
            {obra.nome}
          </div>
        )}
      </div>
    </div>
  );
}

function SecaoAtividades({ titulo, vazio, itens, cor, cutoffOficial }: { titulo: string; vazio: string; itens: any[]; cor: string; cutoffOficial?: string }) {
  return (
    <div className={`bg-white border-2 ${cor} rounded-xl p-4`}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-500" />{titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">{vazio}</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-left px-3 py-2 font-medium">Atividade</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Início</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Fim</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Realizado</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((a: any) => {
                const real = a.percentRealizado ?? 0;
                const st = statusBadge(real, a.dataFim, a.dataInicio, cutoffOficial);
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                    <td className="px-3 py-2 text-slate-800">{a.nome}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">{fmtPct(real)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
