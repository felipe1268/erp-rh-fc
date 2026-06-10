import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import TabelaComparativaAnual, { type LinhaInd } from "@/components/TabelaComparativaAnual";
import { UserMinus, Clock as ClockIcon, DollarSign as DollarIcon } from "lucide-react";

const AP_INDICADORES: LinhaInd[] = [
  { chave: "iniciados", label: "Avisos Iniciados no mês", icone: UserMinus, cor: "red", lowerIsBetter: true,
    pegar: r => Number(r.iniciados) || 0, format: v => `${v}`,
    alertaPct: 50, hint: "Pico de aberturas exige investigação (clima, fim de obra, demissão por justa causa).",
    acoes: ["Categorizar por motivo (sem justa causa, justa causa, pedido).", "Cruzar com pesquisa de clima e fim de obras.", "Conferir prazo de comunicação ao funcionário (mínimo 30 dias).", "Garantir homologação dentro do prazo legal (até 10 dias da rescisão)."] },
  { chave: "concluidos", label: "Avisos Concluídos", icone: CheckCircle2, cor: "green", lowerIsBetter: false,
    pegar: r => Number(r.concluidos) || 0, format: v => `${v}`,
    alertaPct: 30, hint: "Avisos finalizados no mês — inclui pagamento da rescisão.",
    acoes: ["Conferir TRCT assinado e arquivado.", "Validar pagamento em até 10 dias (Lei 7.855/89).", "Atualizar eSocial S-2299 (desligamento)."] },
  { chave: "emAndamento", label: "Em Andamento (fim do mês)", icone: ClockIcon, cor: "yellow", lowerIsBetter: true,
    pegar: r => Number(r.emAndamento) || 0, format: v => `${v}`,
    alertaPct: 30, hint: "Avisos abertos não concluídos — risco de passivo trabalhista se prazo estourar.",
    acoes: ["Listar avisos com mais de 60 dias em aberto.", "Conferir se há reduções de jornada não controladas (Art. 488 CLT).", "Validar previsão de pagamento das rescisões."] },
  { chave: "valorIniciados", label: "Valor Estimado das Aberturas", icone: DollarIcon, cor: "purple", lowerIsBetter: true,
    pegar: r => Number(r.valorIniciados) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    alertaPct: 50, hint: "Soma das rescisões projetadas dos avisos abertos no mês — impacto em fluxo de caixa.",
    acoes: ["Garantir provisão financeira para o mês de pagamento.", "Cruzar com fluxo de caixa de 30/45 dias.", "Avaliar impacto na DRE (rescisões viram despesa não-recorrente)."] },
];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, Clock, DollarSign, Users, CalendarDays,
  TrendingUp, Building2, Briefcase, Timer, ShieldAlert,
  CheckCircle2, XCircle, ArrowRight, Loader2, X, Ban,
  Wallet, Receipt, BarChart3, ArrowLeft, Flame, UserMinus2,
  ArrowUp, ArrowDown, ArrowUpDown, Info, Printer,
  Calculator, Stethoscope, ListChecks, Search, X as XIcon, FileText, TrendingDown,
  Save, FolderOpen, Trash2, Pencil, Zap } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonPhoto } from "@/components/PersonPhoto";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import RaioXFuncionario from "@/components/RaioXFuncionario";

/** Formata número para moeda brasileira: R$ 3.561,47 */
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata número curto para eixos dos gráficos: R$ 3,5 mil / R$ 1,2 mi */
function fmtBRLShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtBRL(v);
}

/** Formata valor de string do DB para exibição: "3561.47" -> "R$ 3.561,47" */
function fmtValorStr(v: string | null | undefined) {
  if (!v) return "-";
  const n = parseFloat(v);
  if (isNaN(n)) return "-";
  return fmtBRL(n);
}

function fmtTipoLabel(tipo: string) {
  const map: Record<string, string> = {
    empregador_trabalhado: "Empregador (Trabalhado)",
    empregador_indenizado: "Empregador (Indenizado)",
    empregado_trabalhado: "Empregado (Trabalhado)",
    empregado_indenizado: "Empregado (Indenizado)",
  };
  return map[tipo] || tipo;
}

function fmtReducaoLabel(r: string) {
  const map: Record<string, string> = {
    "2h_dia": "2h/dia",
    "7_dias_corridos": "7 dias corridos",
    nenhuma: "Nenhuma",
  };
  return map[r] || r;
}

function fmtStatus(s: string) {
  const map: Record<string, string> = {
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  return map[s] || s;
}

function statusColor(s: string) {
  if (s === "em_andamento") return "bg-amber-100 text-amber-700";
  if (s === "concluido") return "bg-green-100 text-green-700";
  if (s === "cancelado") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export default function DashAvisoPrevio() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data, isLoading } = trpc.dashboards.avisoPrevio.useQuery(
    { companyId: queryCompanyId, ano, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: comparativo, isLoading: loadingComp } = trpc.dashboards.avisoPrevioComparativo.useQuery(
    { companyId: queryCompanyId, ano, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  const [drillDown, setDrillDown] = useState<{ type: string; label: string } | null>(null);
  const [reducaoFilter, setReducaoFilter] = useState<string>("todos");

  // ===== Rev. 1908 — Custo de Demissão em Massa =====
  const [cdmData, setCdmData] = useState<string>(() => new Date().toISOString().slice(0, 10));
  // Rev. 1921 — seletor de tipo. Default 'empregador_trabalhado' p/ paridade
  // direta com o módulo Aviso Prévio oficial (cenário mais comum). User pode
  // alternar p/ 'empregador_indenizado' (pior cenário de caixa).
  const [cdmTipo, setCdmTipo] = useState<'empregador_indenizado' | 'empregador_trabalhado'>('empregador_trabalhado');
  const { data: cdm, isLoading: loadingCdm, isFetching: fetchingCdm } = trpc.dashboards.custoDemissaoMassa.useQuery(
    { companyId: queryCompanyId, dataReferencia: cdmData, tipo: cdmTipo, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  // Rev. 1909 — ordenação clicável da tabela de custo de demissão em massa
  type CdmSortKey = 'nomeCompleto' | 'cargo' | 'funcao' | 'obra' | 'dataAdmissao' | 'anosServico' | 'idade' | 'diasAvisoTotal' | 'salarioBase' | 'avisoPrevioIndenizado' | 'multaFGTS' | 'total';
  const [cdmSort, setCdmSort] = useState<{ key: CdmSortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });
  // Rev. 1982 — Busca incremental por nome/função/obra/código (digite e vai filtrando).
  // Normaliza acentos pra não tropeçar em "JOSE" vs "JOSÉ".
  const [cdmSearch, setCdmSearch] = useState<string>("");
  // Rev. 1935 — Raio-X do funcionário ao clicar no nome (mesma UX dos demais módulos RH).
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  // Rev. 1941 — Foto ampliada (user: "QUANDO EU CLICAR NA FOTO, QUERO QUE AUMENTE
  // O TAMANHO PARA PODER VER MELHOR.. QUEM É O COLABORADOR."). Modal simples
  // sobre toda a tela, fecha clicando fora.
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; nome: string } | null>(null);
  // Rev. 1967 — Modal "Detalhe do Cálculo do Aviso" (clique no nome do funcionário).
  // Substitui o trigger antigo (Rev. 1935: nome → Raio-X) por uma visão da QUEBRA
  // DE VERBAS rescisórias daquela linha. Raio-X continua acessível via ícone
  // (Stethoscope) ao lado do nome.
  const [detalheCalc, setDetalheCalc] = useState<any | null>(null);
  // Rev. 1967 — Seleção em massa para gerar o "Combo de Demissões" (fluxo de caixa
  // consolidado). Set<number> de IDs de funcionários selecionados. User pediu:
  // "quero poder selecionar vários e fazer um combo de demissões para ver o fluxo
  // de caixa que vai acontecer".
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [comboOpen, setComboOpen] = useState(false);

  // ===== Rev. 2960 — COMBO DE DEMISSÕES SALVO (simulação persistente) =====
  // O Combo era volátil; agora pode ser salvo por nome, listado, reaberto,
  // editado e excluído, além de "Gerar avisos de todos" em lote.
  const utils = trpc.useUtils();
  const comboCompanyArgs = { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) };
  const [loadedSimId, setLoadedSimId] = useState<number | null>(null);
  const [loadedSimNome, setLoadedSimNome] = useState<string>("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [nomeSimulacao, setNomeSimulacao] = useState<string>("");
  const [savedListOpen, setSavedListOpen] = useState(false);
  const [batchResult, setBatchResult] = useState<any | null>(null);
  const [confirmGerarOpen, setConfirmGerarOpen] = useState(false);

  const savedListQuery = trpc.avisoPrevioFerias.combo.listar.useQuery(
    comboCompanyArgs,
    { enabled: savedListOpen && (isConstrutoras ? companyIds.length > 0 : companyId > 0) }
  );
  const salvarMut = trpc.avisoPrevioFerias.combo.salvar.useMutation();
  const atualizarMut = trpc.avisoPrevioFerias.combo.atualizar.useMutation();
  const excluirMut = trpc.avisoPrevioFerias.combo.excluir.useMutation();
  const gerarLoteMut = trpc.avisoPrevioFerias.combo.gerarEmLote.useMutation();
  // Rev. 1937 — Larguras redimensionáveis das colunas de TEXTO da tabela CDM
  // (Funcionário, Função, Obra) — persistidas em localStorage. User 16/05/2026:
  // "quero pode clicar e aumentar a largura da tabela para ajustar o texto..".
  // Demais colunas (numéricas/datas) já têm largura natural pelo conteúdo.
  type CdmColKey = 'nome' | 'funcao' | 'obra';
  const CDM_COL_LS_KEY = 'cdm-colw-v1';
  const CDM_COL_DEFAULT: Record<CdmColKey, number> = { nome: 200, funcao: 140, obra: 160 };
  const CDM_COL_MIN = 80;
  const CDM_COL_MAX = 600;
  const [cdmColW, setCdmColW] = useState<Record<CdmColKey, number>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CDM_COL_LS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          nome: Math.min(CDM_COL_MAX, Math.max(CDM_COL_MIN, Number(parsed.nome) || CDM_COL_DEFAULT.nome)),
          funcao: Math.min(CDM_COL_MAX, Math.max(CDM_COL_MIN, Number(parsed.funcao) || CDM_COL_DEFAULT.funcao)),
          obra: Math.min(CDM_COL_MAX, Math.max(CDM_COL_MIN, Number(parsed.obra) || CDM_COL_DEFAULT.obra)),
        };
      }
    } catch {}
    return CDM_COL_DEFAULT;
  });
  // Rev. 1939 — Reescrita do redimensionamento estilo EXCEL: listeners NATIVOS
  // de window (mousemove/mouseup/touchmove/touchend), não React pointer events.
  // Causa-raiz das Rev. 1937/1938 não terem funcionado bem: o componente
  // `CdmResizeHandle` era definido INLINE dentro do componente pai → re-criado
  // a cada render → React desmontava/remontava o <div> a cada setState do drag
  // → setPointerCapture perdia a referência → drag travava após 1 frame.
  // Solução: 1 único `onPointerDown` no handle (inline JSX, sem subcomponente),
  // que anexa listeners GLOBAIS de window em pointermove/pointerup. Sobrevive a
  // re-renders. Persistência apenas no end (não a cada frame).
  const cdmStartCdmColWRef = useRef<typeof cdmColW>(cdmColW);
  cdmStartCdmColWRef.current = cdmColW;
  const startCdmResize = (key: CdmColKey) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = cdmStartCdmColWRef.current[key];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    let finalW = startW;
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(CDM_COL_MAX, Math.max(CDM_COL_MIN, startW + (ev.clientX - startX)));
      if (w !== finalW) {
        finalW = w;
        setCdmColW(prev => prev[key] === w ? prev : { ...prev, [key]: w });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        const persist = { ...cdmStartCdmColWRef.current, [key]: finalW };
        window.localStorage.setItem(CDM_COL_LS_KEY, JSON.stringify(persist));
      } catch {}
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const resetCdmCol = (key: CdmColKey) => {
    setCdmColW(prev => {
      const next = { ...prev, [key]: CDM_COL_DEFAULT[key] };
      try { window.localStorage.setItem(CDM_COL_LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const toggleCdmSort = (key: CdmSortKey) => setCdmSort(s => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: (key === 'nomeCompleto' || key === 'cargo' || key === 'funcao' || key === 'obra' || key === 'dataAdmissao') ? 'asc' : 'desc' });
  const cdmLinhasOrdenadas = useMemo(() => {
    if (!cdm?.linhas) return [];
    let arr = [...cdm.linhas];
    // Rev. 1982 — filtra ANTES de ordenar. Busca em nome/função/obra/código,
    // normalizada (sem acento, lower) pra ser tolerante. Tokens separados por
    // espaço viram AND (ex: "jose pedreiro" casa "JOSÉ DA SILVA / PEDREIRO").
    const q = cdmSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      arr = arr.filter((l: any) => {
        const hay = [l.nomeCompleto, l.funcao, l.obra, l.codigoInterno]
          .map(v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
          .join(' | ');
        return tokens.every(t => hay.includes(t));
      });
    }
    const k = cdmSort.key;
    const mul = cdmSort.dir === 'asc' ? 1 : -1;
    arr.sort((a: any, b: any) => {
      const va = a[k];
      const vb = b[k];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      return sa.localeCompare(sb, 'pt-BR') * mul;
    });
    return arr;
  }, [cdm, cdmSort, cdmSearch]);
  const SortIcon = ({ k }: { k: CdmSortKey }) => {
    if (cdmSort.key !== k) return <ArrowUpDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
    return cdmSort.dir === 'asc'
      ? <ArrowUp className="inline h-3 w-3 ml-0.5 text-blue-600" />
      : <ArrowDown className="inline h-3 w-3 ml-0.5 text-blue-600" />;
  };

  // Rev. 1967 — Combo de Demissões: helpers de seleção e agregados.
  // Data prevista de pagamento da rescisão:
  //  - Indenizado: até 10 dias corridos após a comunicação (Art. 477 §6 CLT / Lei 7.855/89, item b).
  //  - Trabalhado: 1º dia útil seguinte ao fim do aviso (Art. 477 §6 'a'). Aproximamos
  //    como `cdmData + diasAvisoTotal + 1` (ignora finais de semana — basta pra
  //    estimar fluxo de caixa mensal). Detalhe individual mostra a data exata.
  function computeDataPagamento(cdmDataStr: string, tipo: string, diasAviso: number): Date {
    const d = new Date(cdmDataStr + 'T00:00:00');
    if (tipo === 'empregador_indenizado' || tipo === 'empregado_indenizado') {
      d.setDate(d.getDate() + 10);
    } else {
      d.setDate(d.getDate() + (diasAviso || 0) + 1);
    }
    return d;
  }
  function fmtDataBR(d: Date) {
    return d.toLocaleDateString('pt-BR');
  }
  const toggleSelecionado = (id: number) => setSelecionados(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todosVisiveisSelecionados = useMemo(() => {
    if (!cdmLinhasOrdenadas.length) return false;
    return cdmLinhasOrdenadas.every((l: any) => selecionados.has(l.id));
  }, [cdmLinhasOrdenadas, selecionados]);
  const algumVisivelSelecionado = useMemo(() => {
    return cdmLinhasOrdenadas.some((l: any) => selecionados.has(l.id));
  }, [cdmLinhasOrdenadas, selecionados]);
  const toggleSelecionarTodos = () => {
    setSelecionados(prev => {
      if (todosVisiveisSelecionados) {
        const next = new Set(prev);
        for (const l of cdmLinhasOrdenadas as any[]) next.delete(l.id);
        return next;
      }
      const next = new Set(prev);
      for (const l of cdmLinhasOrdenadas as any[]) next.add(l.id);
      return next;
    });
  };
  const linhasSelecionadas = useMemo(() => {
    return (cdm?.linhas || []).filter((l: any) => selecionados.has(l.id));
  }, [cdm, selecionados]);
  // Agregado consolidado das linhas selecionadas — alimenta o modal Combo.
  const comboAgregado = useMemo(() => {
    const base = {
      qtd: linhasSelecionadas.length,
      saldoSalario: 0, decimoTerceiro: 0, feriasProporcional: 0, feriasVencidas: 0,
      avisoOficial: 0, avisoComplementar: 0, multaFGTS: 0, fgtsEstimado: 0,
      totalOficialBruto: 0, totalDescontos: 0, totalOficialLiquido: 0,
      totalComplementar: 0, total: 0, salarioBaseSoma: 0,
      // Rev. 2953 — benefícios mensais recorrentes (sobra de caixa pós-demissão).
      seguroVidaSoma: 0, valeAlimentacaoSoma: 0,
    };
    for (const l of linhasSelecionadas as any[]) {
      base.saldoSalario += Number(l.saldoSalario) || 0;
      base.decimoTerceiro += Number(l.decimoTerceiro) || 0;
      base.feriasProporcional += Number(l.feriasProporcional) || 0;
      base.feriasVencidas += Number(l.feriasVencidas) || 0;
      base.avisoOficial += Number(l.avisoOficial) || 0;
      base.avisoComplementar += Number(l.avisoComplementar) || 0;
      base.multaFGTS += Number(l.multaFGTS) || 0;
      base.fgtsEstimado += Number(l.fgtsEstimado) || 0;
      base.totalOficialBruto += Number(l.totalOficialBruto ?? l.totalOficial) || 0;
      base.totalDescontos += Number(l.totalDescontos) || 0;
      base.totalOficialLiquido += Number(l.totalOficialLiquido ?? l.totalOficial) || 0;
      base.totalComplementar += Number(l.totalComplementar) || 0;
      base.total += Number(l.total) || 0;
      base.salarioBaseSoma += Number(l.salarioBase) || 0;
      base.seguroVidaSoma += Number(l.seguroVidaMensal) || 0;
      base.valeAlimentacaoSoma += Number(l.valeAlimentacaoMensal) || 0;
    }
    return base;
  }, [linhasSelecionadas]);
  // Agrupa pagamentos por data prevista (cronograma de fluxo de caixa).
  const cronogramaPagamentos = useMemo(() => {
    const grupos = new Map<string, { data: Date; qtd: number; total: number; itens: any[] }>();
    for (const l of linhasSelecionadas as any[]) {
      const dt = computeDataPagamento(cdmData, cdmTipo, l.diasAvisoTotal || 0);
      const key = dt.toISOString().slice(0, 10);
      const g = grupos.get(key) || { data: dt, qtd: 0, total: 0, itens: [] };
      g.qtd += 1;
      g.total += Number(l.total) || 0;
      g.itens.push(l);
      grupos.set(key, g);
    }
    return Array.from(grupos.values()).sort((a, b) => a.data.getTime() - b.data.getTime());
  }, [linhasSelecionadas, cdmData, cdmTipo]);

  // Rev. 2953 — Gera o RELATÓRIO DE DEMISSÕES (PDF p/ análise com a diretoria).
  // User: "preciso poder gerar um pdf para demissão destes funcionários para
  // análise junto à diretoria.. arquivo completo com nomes de TODOS os
  // funcionários selecionados + tempo de casa + previsão de redução MENSAL da
  // folha + seguro de vida + vale alimentação (visão da sobra de caixa)".
  // Abre uma janela nova com HTML auto-contido e dispara window.print()
  // (usuário escolhe "Salvar como PDF") — mesmo padrão das demais exportações.
  const gerarRelatorioCombo = () => {
    if (linhasSelecionadas.length === 0) return;
    const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ));
    const tempoCasa = (l: any) => {
      const a = l.tempoAnos ?? 0, m = l.tempoMeses ?? 0, d = l.tempoDias ?? 0;
      const parts: string[] = [];
      if (a > 0) parts.push(`${a}a`);
      if (a > 0 || m > 0) parts.push(`${m}m`);
      parts.push(`${d}d`);
      return parts.join(' ');
    };
    const tipoLabel = cdmTipo === 'empregador_indenizado' ? 'Aviso prévio INDENIZADO' : 'Aviso prévio TRABALHADO';
    const dataRefBR = new Date(cdmData + 'T00:00:00').toLocaleDateString('pt-BR');
    const emissaoBR = new Date().toLocaleDateString('pt-BR');
    const ag = comboAgregado;
    const reducaoMensal = ag.salarioBaseSoma + ag.seguroVidaSoma + ag.valeAlimentacaoSoma;
    const logo = `${window.location.origin}/logo-fc.jpg`;
    const linhasOrdenadas = [...linhasSelecionadas].sort((a: any, b: any) => (b.total || 0) - (a.total || 0));
    const avatarHtml = (l: any) => {
      const inicial = String(l.nomeCompleto || '?').trim().charAt(0).toUpperCase() || '?';
      return l.fotoUrl
        ? `<img src="${esc(l.fotoUrl)}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;object-position:top;border:1px solid #cbd5e1;flex:0 0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact" />`
        : `<span style="display:inline-flex;width:26px;height:26px;border-radius:50%;background:#1B2A4A;color:#fff;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:0 0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(inicial)}</span>`;
    };
    const rowsHtml = linhasOrdenadas.map((l: any, i: number) => `
      <tr>
        <td style="text-align:center;color:#64748b">${i + 1}</td>
        <td style="font-weight:600"><span style="display:inline-flex;align-items:center;gap:7px">${avatarHtml(l)}<span>${esc(l.nomeCompleto)}</span></span></td>
        <td>${esc(l.funcao || l.cargo || '—')}</td>
        <td>${esc(l.obra || '—')}</td>
        <td style="text-align:center;white-space:nowrap">${l.dataAdmissao ? new Date(l.dataAdmissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
        <td style="text-align:center;white-space:nowrap">${tempoCasa(l)}</td>
        <td style="text-align:right;white-space:nowrap">${fmtBRL(Number(l.salarioBase) || 0)}</td>
        <td style="text-align:right;white-space:nowrap">${fmtBRL(Number(l.seguroVidaMensal) || 0)}</td>
        <td style="text-align:right;white-space:nowrap">${fmtBRL(Number(l.valeAlimentacaoMensal) || 0)}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600;color:#b91c1c">${fmtBRL(Number(l.total) || 0)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
      <title>Relatório de Demissões — FC Engenharia</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; font-size: 12px; }
        .hdr { text-align:center; margin-bottom: 8px; }
        .hdr img { height: 72px; object-fit: contain; }
        .hdr h1 { font-size: 16px; margin: 6px 0 2px; letter-spacing: .5px; }
        .hdr .sub { font-size: 10px; color:#64748b; }
        .faixa { background:#1B2A4A; color:#fff; padding:10px 14px; margin:14px 0 10px; border-radius:4px;
                 font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-align:center;
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .meta { display:flex; justify-content:space-between; font-size:11px; color:#475569; margin-bottom:10px; }
        table { width:100%; border-collapse: collapse; margin-bottom: 14px; }
        th, td { border:1px solid #cbd5e1; padding:5px 7px; }
        thead th { background:#1B2A4A; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:.3px;
                   -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        tbody tr:nth-child(even) td { background:#f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        tfoot td { font-weight:700; background:#e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .cards { display:flex; gap:10px; margin: 6px 0 16px; }
        .card { flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:10px; text-align:center; }
        .card .v { font-size:16px; font-weight:700; }
        .card .l { font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:.3px; margin-top:2px; }
        .green { color:#15803d; }
        .red { color:#b91c1c; }
        .sec-title { font-size:12px; font-weight:700; color:#1B2A4A; margin: 8px 0 6px; text-transform:uppercase; letter-spacing:.5px; }
        .nota { font-size:9px; color:#64748b; font-style: italic; margin-top:4px; }
        @media print { body { margin: 12mm; } }
      </style></head>
      <body>
        <div class="hdr">
          <img src="${logo}" alt="FC Engenharia" />
          <h1>FC ENGENHARIA</h1>
          <div class="sub">Relatório gerado para análise interna da diretoria</div>
        </div>
        <div class="faixa">Relatório de Demissões — Análise de Fluxo de Caixa</div>
        <div class="meta">
          <span><strong>Cenário:</strong> ${esc(tipoLabel)} &nbsp;·&nbsp; <strong>Data-base:</strong> ${dataRefBR}</span>
          <span><strong>Funcionários:</strong> ${ag.qtd} &nbsp;·&nbsp; <strong>Emissão:</strong> ${emissaoBR}</span>
        </div>

        <div class="sec-title">Funcionários Selecionados</div>
        <table>
          <thead><tr>
            <th>#</th><th>Funcionário</th><th>Função</th><th>Obra</th>
            <th>Admissão</th><th>Tempo de casa</th><th>Salário</th>
            <th>Seguro vida/mês</th><th>Vale alim./mês</th><th>Custo rescisão</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr>
            <td colspan="6" style="text-align:right">TOTAIS</td>
            <td style="text-align:right">${fmtBRL(ag.salarioBaseSoma)}</td>
            <td style="text-align:right">${fmtBRL(ag.seguroVidaSoma)}</td>
            <td style="text-align:right">${fmtBRL(ag.valeAlimentacaoSoma)}</td>
            <td style="text-align:right;color:#b91c1c">${fmtBRL(ag.total)}</td>
          </tr></tfoot>
        </table>

        <div class="sec-title">Custo Rescisório (desembolso único)</div>
        <table>
          <tbody>
            <tr><td>Saldo de salário</td><td style="text-align:right">${fmtBRL(ag.saldoSalario)}</td></tr>
            <tr><td>Aviso prévio indenizado${ag.avisoComplementar > 0 ? ' (+ complementar)' : ''}</td><td style="text-align:right">${fmtBRL(ag.avisoOficial + ag.avisoComplementar)}</td></tr>
            <tr><td>13º proporcional</td><td style="text-align:right">${fmtBRL(ag.decimoTerceiro)}</td></tr>
            <tr><td>Férias proporcionais + 1/3</td><td style="text-align:right">${fmtBRL(ag.feriasProporcional)}</td></tr>
            ${ag.feriasVencidas > 0 ? `<tr><td>Férias vencidas + 1/3</td><td style="text-align:right">${fmtBRL(ag.feriasVencidas)}</td></tr>` : ''}
            <tr><td>Multa 40% FGTS</td><td style="text-align:right">${fmtBRL(ag.multaFGTS)}</td></tr>
            <tr><td>(−) Descontos legais (INSS + IRRF + pensão + sindical)</td><td style="text-align:right;color:#b91c1c">− ${fmtBRL(ag.totalDescontos)}</td></tr>
            ${ag.totalComplementar > 0 ? `<tr><td>(+) Complementar</td><td style="text-align:right">${fmtBRL(ag.totalComplementar)}</td></tr>` : ''}
            <tr style="font-weight:700"><td>CUSTO TOTAL A DESEMBOLSAR</td><td style="text-align:right;color:#b91c1c">${fmtBRL(ag.total)}</td></tr>
          </tbody>
        </table>
        <p class="nota">FGTS estimado (depositado mensalmente, fora das verbas rescisórias): ${fmtBRL(ag.fgtsEstimado)}.</p>

        <div class="sec-title">Redução Mensal Recorrente da Folha (sobra de caixa)</div>
        <div class="cards">
          <div class="card"><div class="v">${fmtBRL(ag.salarioBaseSoma)}</div><div class="l">Salários/mês</div></div>
          <div class="card"><div class="v">${fmtBRL(ag.seguroVidaSoma)}</div><div class="l">Seguro de vida/mês</div></div>
          <div class="card"><div class="v">${fmtBRL(ag.valeAlimentacaoSoma)}</div><div class="l">Vale alimentação/mês</div></div>
          <div class="card"><div class="v green">${fmtBRL(reducaoMensal)}</div><div class="l">Redução mensal total</div></div>
          <div class="card"><div class="v green">${fmtBRL(reducaoMensal * 12)}</div><div class="l">Redução anual (×12)</div></div>
        </div>
        <p class="nota">Seguro de vida e vale alimentação vêm do cadastro de cada funcionário; quando não preenchidos contam como R$ 0,00. A redução anual é uma projeção linear (12 meses) e não considera reajustes de convenção/dissídio.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      alert('Não foi possível abrir a janela do relatório. Habilite pop-ups para este site e tente novamente.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* usuário pode imprimir manualmente */ } }, 300);
  };

  // Filtra avisos pelo drill-down selecionado
  const drillDownAvisos = useMemo(() => {
    if (!drillDown || !data) return [];
    return data.avisos.filter((a: any) => {
      if (drillDown.type === 'funcao') {
        const funcao = a.funcao || a.nomeCompleto;
        return funcao === drillDown.label || (funcao && funcao.startsWith(drillDown.label.replace('...', '')));
      }
      if (drillDown.type === 'setor') {
        return (a.setor || 'Sem Setor') === drillDown.label || (a.setor || 'Não informado') === drillDown.label;
      }
      if (drillDown.type === 'status') {
        return a.status === drillDown.label;
      }
      if (drillDown.type === 'tipo') {
        return a.tipo === drillDown.label;
      }
      if (drillDown.type === 'dias') {
        return String(a.diasAviso) === drillDown.label;
      }
      if (drillDown.type === 'anos') {
        return String(a.anosServico || 0) === drillDown.label;
      }
      if (drillDown.type === 'custoSetor') {
        return (a.setor || 'Não informado') === drillDown.label;
      }
      if (drillDown.type === 'finTotal') {
        return true; // show all avisos
      }
      if (drillDown.type === 'finStatus') {
        return a.status === drillDown.label;
      }
      if (drillDown.type === 'mes') {
        const d = a.dataInicio ? new Date(a.dataInicio) : null;
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === drillDown.label;
      }
      if (drillDown.type === 'venc7' || drillDown.type === 'venc30') {
        // Rev. 1942 — Mesma regra do server (dashboards.ts L2864-2865): apenas
        // avisos em_andamento, dataFim entre hoje e +7/+30 dias.
        if (a.status !== 'em_andamento' || !a.dataFim) return false;
        const fim = new Date(a.dataFim + 'T00:00:00');
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const limite = new Date(hoje); limite.setDate(limite.getDate() + (drillDown.type === 'venc7' ? 7 : 30));
        return fim >= hoje && fim <= limite;
      }
      if (drillDown.type === 'reducao') {
        const r = a.reducaoJornada || 'nenhuma';
        if (drillDown.label === '2h por dia') return r === '2h_dia';
        if (drillDown.label === '7 dias corridos') return r === '7_dias_corridos';
        if (drillDown.label === 'Nenhuma') return r === 'nenhuma' || !a.reducaoJornada;
        return false;
      }
      return false;
    });
  }, [drillDown, data]);

  // Rev. 1944 — para venc7/venc30 a ordenação por dataFim ASC coloca o mais
  // urgente no topo (vence amanhã antes de vence em 6 dias). Para os demais,
  // mantém ordem natural (insert).
  const drillDownAvisosOrdenados = useMemo(() => {
    if (!drillDown) return drillDownAvisos;
    if (drillDown.type === 'venc7' || drillDown.type === 'venc30') {
      return [...drillDownAvisos].sort((a: any, b: any) => {
        const fa = a.dataFim || '9999-12-31';
        const fb = b.dataFim || '9999-12-31';
        return fa.localeCompare(fb);
      });
    }
    return drillDownAvisos;
  }, [drillDown, drillDownAvisos]);

  // Rev. 1944 — paleta consistente p/ tipo (Trabalhado=azul / Indenizado=vermelho)
  const tipoChipColor = (tipo: string) => {
    if (tipo?.includes('indenizado')) return 'bg-red-50 text-red-700 border-red-200';
    if (tipo?.includes('trabalhado')) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  // Rev. 1944 — dias até vencer (negativo = atrasado)
  const diasAteVencer = (dataFim: string | null | undefined): number | null => {
    if (!dataFim) return null;
    const fim = new Date(dataFim + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((fim.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
  };

  // ===== Rev. 2960 — Handlers do Combo SALVO =====
  const snapshotCombo = () => ({
    qtd: comboAgregado.qtd,
    total: comboAgregado.total,
    totalOficialBruto: comboAgregado.totalOficialBruto,
    salarioBaseSoma: comboAgregado.salarioBaseSoma,
    seguroVidaSoma: comboAgregado.seguroVidaSoma,
    valeAlimentacaoSoma: comboAgregado.valeAlimentacaoSoma,
  });

  const abrirSaveDialog = () => {
    setNomeSimulacao(loadedSimNome || "");
    setSaveDialogOpen(true);
  };

  const handleSalvarSimulacao = async (comoNova: boolean) => {
    const nome = nomeSimulacao.trim();
    if (!nome) { toast.error("Informe um nome para a simulação."); return; }
    const employeeIds = Array.from(selecionados);
    if (employeeIds.length === 0) { toast.error("Selecione ao menos um funcionário."); return; }
    try {
      if (loadedSimId && !comoNova) {
        await atualizarMut.mutateAsync({
          ...comboCompanyArgs, id: loadedSimId, nome, tipo: cdmTipo,
          dataReferencia: cdmData, employeeIds, snapshot: snapshotCombo(),
        });
        toast.success("Simulação atualizada.");
      } else {
        const res = await salvarMut.mutateAsync({
          ...comboCompanyArgs, nome, tipo: cdmTipo,
          dataReferencia: cdmData, employeeIds, snapshot: snapshotCombo(),
        });
        setLoadedSimId(res.id);
        toast.success("Simulação salva.");
      }
      setLoadedSimNome(nome);
      setSaveDialogOpen(false);
      utils.avisoPrevioFerias.combo.listar.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar a simulação.");
    }
  };

  const aplicarSimulacao = (sim: any) => {
    setCdmData(sim.dataReferencia);
    if (sim.tipo === 'empregador_indenizado' || sim.tipo === 'empregador_trabalhado') {
      setCdmTipo(sim.tipo);
    }
    setSelecionados(new Set<number>(sim.employeeIds || []));
    setLoadedSimId(sim.id);
    setLoadedSimNome(sim.nome);
    setSavedListOpen(false);
    setComboOpen(true);
  };

  const handleExcluirSimulacao = async (id: number, nome: string) => {
    if (!window.confirm(`Excluir a simulação "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirMut.mutateAsync({ ...comboCompanyArgs, id });
      toast.success("Simulação excluída.");
      if (loadedSimId === id) { setLoadedSimId(null); setLoadedSimNome(""); }
      utils.avisoPrevioFerias.combo.listar.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir a simulação.");
    }
  };

  const handleGerarTodos = async () => {
    const employeeIds = Array.from(selecionados);
    if (employeeIds.length === 0) { toast.error("Nenhum funcionário selecionado."); return; }
    setConfirmGerarOpen(false);
    try {
      const res = await gerarLoteMut.mutateAsync({
        ...comboCompanyArgs, tipo: cdmTipo, dataReferencia: cdmData, employeeIds,
      });
      setBatchResult(res);
      const partes: string[] = [`${res.criados} aviso(s) criado(s)`];
      if (res.pulados > 0) partes.push(`${res.pulados} pulado(s)`);
      if (res.erros > 0) partes.push(`${res.erros} com erro`);
      if (res.erros > 0) toast.warning(partes.join(" · "));
      else toast.success(partes.join(" · "));
      utils.dashboards.custoDemissaoMassa.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar os avisos em lote.");
    }
  };

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Aviso Prévio</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise completa de avisos prévios, custos e prazos</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg px-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAno(a => a - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold text-[#0F172A] min-w-[50px] text-center">{ano}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAno(a => a + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <PrintActions title="Dashboard Aviso Prévio" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* ===== SEÇÃO 1: RESUMO QUANTITATIVO ===== */}
            {/* Rev. 1942 — Card "Total de Avisos" agora clicável (drill-down `finTotal`
                já existente — abre lista de TODOS os avisos do ano, fonte da info). */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'finTotal', label: 'Todos os Avisos' })}>
                <DashKpi label="Total de Avisos" value={data.total} icon={AlertTriangle} color="blue" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'em_andamento' })}>
                <DashKpi label="Em Andamento" value={data.emAndamento} icon={Clock} color="orange" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'concluido' })}>
                <DashKpi label="Concluídos" value={data.concluidos} icon={CheckCircle2} color="green" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'cancelado' })}>
                <DashKpi label="Cancelados" value={data.cancelados} icon={XCircle} color="red" />
              </div>
            </div>

            {/* ===== SEÇÃO 2: PREVISÃO DE CUSTO (apenas em andamento) ===== */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Previsão de Custo</h3>
                    <p className="text-[10px] text-muted-foreground">Custo estimado dos avisos em andamento (cancelados e concluídos não entram na previsão)</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Custo Total Em Andamento */}
                  <div
                    className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-4 sm:p-5 text-center cursor-pointer hover:border-orange-400 hover:shadow-md active:scale-[0.98] transition-all"
                    onClick={() => setDrillDown({ type: 'finStatus', label: 'em_andamento' })}
                    title="Clique para ver detalhes"
                  >
                    <DollarSign className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-700 tabular-nums">{fmtBRL(data.valorTotalEstimado)}</p>
                    <p className="text-xs text-orange-600 font-medium mt-1">Custo Total Estimado (Em Andamento)</p>
                    <p className="text-[10px] text-orange-400 mt-0.5">{data.emAndamento} aviso(s) ativo(s) · Clique para detalhes</p>
                  </div>
                  {/* Média por aviso */}
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4 sm:p-5 text-center">
                    <Receipt className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-700 tabular-nums">{data.emAndamento > 0 ? fmtBRL(data.valorTotalEstimado / data.emAndamento) : 'R$ 0,00'}</p>
                    <p className="text-xs text-blue-600 font-medium mt-1">Média por Aviso</p>
                    <p className="text-[10px] text-blue-400 mt-0.5">Custo médio de rescisão por funcionário</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ===== SEÇÃO 2.B — CUSTO DE DEMISSÃO EM MASSA (Rev. 1908) ===== */}
            <Card id="cdm-print-area" className="border-2 border-red-200">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <Flame className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        Custo de Demissão em Massa — Provisão de Caixa
                        {fetchingCdm && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Estimativa de quanto custaria <strong>demitir TODOS os funcionários ativos</strong> a partir da data-base, sem justa causa. Ambas modalidades aplicam <strong>+3 dias/ano de serviço</strong> (Lei 12.506/2011 — corrente majoritária TST, alinhado ao jurídico). <strong>Trabalhado</strong> = empregado cumpre o aviso (30+3·ano dias) na empresa. <strong>Indenizado</strong> = paga o aviso completo de uma vez sem trabalho.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {/* Rev. 1921 — Tipo de Aviso (paridade com módulo oficial) */}
                    <div className="inline-flex items-center rounded-md border border-border bg-white p-0.5 text-xs">
                      <button
                        onClick={() => setCdmTipo('empregador_trabalhado')}
                        className={`px-2.5 py-1 rounded transition-colors ${cdmTipo === 'empregador_trabalhado' ? 'bg-blue-600 text-white font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        title="Empregado cumpre o aviso (30 + 3 dias por ano) — Lei 12.506/2011 aplicada às duas modalidades (corrente majoritária TST)"
                      >Trabalhado</button>
                      <button
                        onClick={() => setCdmTipo('empregador_indenizado')}
                        className={`px-2.5 py-1 rounded transition-colors ${cdmTipo === 'empregador_indenizado' ? 'bg-red-600 text-white font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                        title="Aviso prévio indenizado completo Lei 12.506 (pior cenário de caixa)"
                      >Indenizado</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Data-base:</label>
                      <Input
                        type="date"
                        value={cdmData}
                        onChange={(e) => setCdmData(e.target.value)}
                        className="h-8 w-[160px] text-xs"
                      />
                      <button
                        onClick={() => setCdmData(new Date().toISOString().slice(0, 10))}
                        className="text-[11px] px-2 py-1 rounded-md border border-border bg-white hover:bg-muted/50 text-muted-foreground"
                        title="Voltar para hoje"
                      >Hoje</button>
                    </div>
                    {/* Rev. 1950 — Botão "Imprimir / PDF" da tabela CDM
                        (user 16/05/2026, screenshot CDM ~R$ 1,16M / 98 funcionários:
                        "colcoa um botão para gear PDF e imprimir esta tabela
                        somente, ela.. para uma analise gerencial..").
                        Estratégia: adiciona classe `print-only` ao Card antes de
                        chamar `window.print()` — convenção já existente em
                        `index.css` L323 (`body:has(.print-only) *:not(.print-only):not(.print-only *):not(:has(.print-only)) { display:none }`)
                        que oculta TUDO menos o Card e seus ancestrais. Remove a
                        classe via `onafterprint`. Para PDF: o usuário escolhe
                        "Salvar como PDF" no diálogo nativo do navegador. */}
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById('cdm-print-area');
                        if (!el) return;
                        el.classList.add('print-only');
                        const cleanup = () => {
                          el.classList.remove('print-only');
                          window.removeEventListener('afterprint', cleanup);
                        };
                        window.addEventListener('afterprint', cleanup);
                        // Fallback (alguns navegadores não disparam afterprint)
                        setTimeout(cleanup, 5000);
                        window.print();
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
                      title="Imprime esta tabela em folha separada (escolha 'Salvar como PDF' no diálogo do navegador para gerar PDF)"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir / PDF
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCdm && !cdm ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !cdm ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Selecione uma empresa.</p>
                ) : (
                  <>
                    {/* Rev. 1946 — Legenda explicativa: por que Trabalhado e Indenizado
                        têm valores DIFERENTES mesmo com os mesmos DIAS de aviso. */}
                    <details className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 text-[11px] text-amber-900 group">
                      <summary className="cursor-pointer select-none px-3 py-2 flex items-center gap-2 font-semibold hover:bg-amber-100/60 rounded-lg">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>Por que <span className="text-blue-700">Trabalhado</span> e <span className="text-red-700">Indenizado</span> dão valores diferentes? <span className="font-normal text-amber-700 italic ml-1 hidden sm:inline">— clique para ler</span></span>
                      </summary>
                      <div className="px-4 pb-3 pt-1 space-y-2 leading-relaxed border-t border-amber-200/70">
                        <p>
                          A <strong>quantidade de dias</strong> do aviso é igual nas duas modalidades (Lei 12.506: 30 + 3 dias por ano de serviço — Rev. 1943). O que muda é a <strong>natureza financeira</strong> do pagamento, por força de lei:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="rounded border border-blue-300 bg-white/70 p-2">
                            <p className="font-bold text-blue-700 text-[11px] mb-1">Trabalhado (CLT Art. 487 II + Art. 488)</p>
                            <p>O empregado <strong>cumpre</strong> o aviso na empresa recebendo <strong>salário normal</strong> pelos dias trabalhados (entra em "Saldo de Salário"). Só os dias <strong>extras da Lei 12.506</strong> (acima de 30) viram indenização, porque a CLT manda <em>reduzir</em> esses dias do trabalho (2h/dia ou 7 corridos).</p>
                            <p className="mt-1 text-[10px] text-blue-600 italic">→ Coluna "Aviso Indeniz." mostra apenas os dias extras × salário-dia.</p>
                          </div>
                          <div className="rounded border border-red-300 bg-white/70 p-2">
                            <p className="font-bold text-red-700 text-[11px] mb-1">Indenizado (CLT Art. 487 §1º)</p>
                            <p>O empregado <strong>sai imediatamente</strong>. A empresa paga em dinheiro o equivalente a <strong>TODOS os dias</strong> do aviso (30 + Lei 12.506) como verba indenizatória, sem contraprestação de trabalho. Projeta também o tempo de serviço (afeta 13º/férias proporcional).</p>
                            <p className="mt-1 text-[10px] text-red-600 italic">→ Coluna "Aviso Indeniz." mostra o total de dias × salário-dia + reflexos.</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-amber-800 bg-amber-100/70 rounded px-2 py-1 border border-amber-300">
                          <strong>Exemplo Anderson (10 anos, salário R$ 5.821,20, 60 dias de aviso):</strong> em <span className="text-blue-700 font-semibold">Trabalhado</span> a "Aviso Indeniz." ≈ R$ 12.469 (só os 30 dias extras + reflexos); em <span className="text-red-700 font-semibold">Indenizado</span> ≈ R$ 24.938 (os 60 dias completos + reflexos). A diferença <strong>não é bug</strong> — é o que a lei manda. Igualar os valores faria a empresa pagar 2× pelo mesmo período no Trabalhado.
                        </p>
                      </div>
                    </details>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="rounded-xl border-2 border-red-200 bg-red-50/50 p-3 text-center">
                        <DollarSign className="h-5 w-5 text-red-500 mx-auto mb-1" />
                        <p className="text-base sm:text-lg md:text-2xl font-bold text-red-700 tabular-nums leading-tight">{fmtBRL(cdm.grandTotal)}</p>
                        <p className="text-[10px] text-red-600 font-medium mt-0.5">Custo Total Estimado</p>
                      </div>
                      <div className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-3 text-center">
                        <UserMinus2 className="h-5 w-5 text-orange-500 mx-auto mb-1" />
                        <p className="text-base sm:text-lg md:text-2xl font-bold text-orange-700 tabular-nums leading-tight">{cdm.totalFuncionarios}</p>
                        <p className="text-[10px] text-orange-600 font-medium mt-0.5">Funcionários Ativos</p>
                        {cdm.funcionariosIgnorados > 0 && (
                          <p className="text-[9px] text-amber-600 mt-0.5">+{cdm.funcionariosIgnorados} ignorados (sem salário/admissão)</p>
                        )}
                      </div>
                      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-3 text-center">
                        <Receipt className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                        <p className="text-base sm:text-lg md:text-2xl font-bold text-blue-700 tabular-nums leading-tight">{fmtBRL(cdm.mediaPorFuncionario)}</p>
                        <p className="text-[10px] text-blue-600 font-medium mt-0.5">Custo Médio por Funcionário</p>
                      </div>
                      <div className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-3 text-center">
                        <Wallet className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                        <p className="text-base sm:text-lg md:text-2xl font-bold text-purple-700 tabular-nums leading-tight">{fmtBRL(cdm.grandTotalFolha)}</p>
                        <p className="text-[10px] text-purple-600 font-medium mt-0.5">Folha Mensal Total</p>
                        {cdm.grandTotalFolha > 0 && (
                          <p className="text-[9px] text-purple-500 mt-0.5">{(cdm.grandTotal / cdm.grandTotalFolha).toFixed(1)}× a folha</p>
                        )}
                      </div>
                    </div>

                    {/* Rev. 1982 — Campo de busca incremental (filtra a tabela ao digitar). */}
                    {cdm.linhas.length > 0 && (
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={cdmSearch}
                            onChange={(e) => setCdmSearch(e.target.value)}
                            placeholder="Buscar por nome, função, obra ou código…"
                            className="w-full h-9 pl-8 pr-8 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                            aria-label="Buscar funcionário"
                          />
                          {cdmSearch && (
                            <button
                              type="button"
                              onClick={() => setCdmSearch("")}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 text-slate-500"
                              title="Limpar busca"
                              aria-label="Limpar busca"
                            >
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {cdmSearch && (
                          <span className="text-[11px] text-slate-600">
                            <strong className="tabular-nums">{cdmLinhasOrdenadas.length}</strong>
                            {' '}de{' '}
                            <strong className="tabular-nums">{cdm.linhas.length}</strong> funcionário(s)
                          </span>
                        )}
                      </div>
                    )}
                    {cdm.linhas.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Nenhum funcionário ativo com salário e admissão informados.</p>
                    ) : cdmLinhasOrdenadas.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Nenhum funcionário encontrado para "<strong>{cdmSearch}</strong>". <button type="button" onClick={() => setCdmSearch("")} className="text-blue-600 hover:underline">Limpar busca</button></p>
                    ) : (
                      <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-md border">
                        <table className="w-full text-xs border-separate border-spacing-0">
                          {/* Rev. 1924 — sticky thead com fundo SÓLIDO (slate-100)
                              aplicado em cada <th> + shadow-sm pra separar
                              visualmente. bg em <thead>/<tr> não funciona com
                              position:sticky em todos os browsers — só bg no
                              próprio <th> evita transparência (causa do
                              overlay reportado: linhas passando por trás
                              do cabeçalho com bg-muted/50 ao rolar). */}
                          <thead className="sticky top-0 z-20">
                            <tr className="text-left">
                              {/* Rev. 1967 — Checkbox de seleção em massa. Header marca/desmarca
                                  todas as linhas atualmente VISÍVEIS (respeita ordenação atual). */}
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-center w-8">
                                <input
                                  type="checkbox"
                                  checked={todosVisiveisSelecionados}
                                  ref={(el) => { if (el) el.indeterminate = !todosVisiveisSelecionados && algumVisivelSelecionado; }}
                                  onChange={toggleSelecionarTodos}
                                  className="h-3.5 w-3.5 accent-blue-600 cursor-pointer"
                                  title={todosVisiveisSelecionados ? "Desmarcar todos visíveis" : "Selecionar todos visíveis"}
                                />
                              </th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm">#</th>
                              {/* Rev. 1939 — Colunas de texto redimensionáveis estilo EXCEL.
                                  Handle inline (sem subcomponente p/ não remontar durante drag);
                                  listeners de window pointermove/up no startCdmResize. */}
                              {(['nome','funcao','obra'] as const).map((ck) => {
                                const sortKey = ck === 'nome' ? 'nomeCompleto' : ck;
                                const label = ck === 'nome' ? 'Funcionário' : ck === 'funcao' ? 'Função' : 'Obra';
                                return (
                                  <th key={ck} style={{ width: cdmColW[ck], minWidth: cdmColW[ck], maxWidth: cdmColW[ck] }} className="relative py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm select-none">
                                    <span className="cursor-pointer hover:text-blue-700" onClick={() => toggleCdmSort(sortKey as CdmSortKey)}>{label}<SortIcon k={sortKey as CdmSortKey} /></span>
                                    <div
                                      role="separator"
                                      aria-orientation="vertical"
                                      aria-label={`Redimensionar coluna ${label}`}
                                      title={`Clique, segure e arraste para redimensionar · duplo-clique restaura (${CDM_COL_DEFAULT[ck]}px)`}
                                      onPointerDown={startCdmResize(ck)}
                                      onDoubleClick={(e) => { e.stopPropagation(); resetCdmCol(ck); }}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ touchAction: 'none' }}
                                      className="absolute top-0 right-0 h-full w-3 cursor-col-resize flex items-center justify-center hover:bg-amber-100"
                                    >
                                      <div className="w-px h-full bg-slate-400" />
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-right cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('dataAdmissao')}>Admissão<SortIcon k="dataAdmissao" /></th>
                              {/* Rev. 1931 — "Anos" renomeado p/ "Tempo de empresa" (mais claro p/ leigo) + nova coluna "Idade" (anos completos
                                  do funcionário até a data-base do dash). User 16/05/2026: "melhore o texto onde ta escrito idade, coloque
                                  tempo de empresa.. e coloca outra coluna com a idade real do funcionario". */}
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-center cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('anosServico')} title="Anos completos desde a admissão (tempo de casa)">Tempo de empresa<SortIcon k="anosServico" /></th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-center cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('idade')} title="Idade real do funcionário na data-base">Idade<SortIcon k="idade" /></th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-center cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('diasAvisoTotal')} title="Dias de aviso prévio (Lei 12.506/2011)">Dias Aviso<SortIcon k="diasAvisoTotal" /></th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-right cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('salarioBase')}>Salário<SortIcon k="salarioBase" /></th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-right cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('avisoPrevioIndenizado')}>Aviso Indeniz.<SortIcon k="avisoPrevioIndenizado" /></th>
                              <th className="py-2 px-2 font-semibold text-muted-foreground bg-slate-100 border-b border-slate-300 shadow-sm text-right cursor-pointer select-none hover:text-blue-700" onClick={() => toggleCdmSort('multaFGTS')}>Multa 40%<SortIcon k="multaFGTS" /></th>
                              <th className="py-2 px-2 font-semibold text-red-700 bg-slate-100 border-b border-slate-300 shadow-sm text-right cursor-pointer select-none hover:text-red-900" onClick={() => toggleCdmSort('total')}>Custo Total<SortIcon k="total" /></th>
                            </tr>
                          </thead>
                          <tbody>
                            {cdmLinhasOrdenadas.map((l: any, idx: number) => (
                              <tr key={l.id} className={`hover:bg-muted/30 ${selecionados.has(l.id) ? 'bg-blue-50/60' : cdmSort.key === 'total' && cdmSort.dir === 'desc' && idx < 3 ? 'bg-red-50/40' : 'bg-white'}`}>
                                {/* Rev. 1967 — checkbox de seleção individual. */}
                                <td className="py-1.5 px-2 text-center border-b border-border/50">
                                  <input
                                    type="checkbox"
                                    checked={selecionados.has(l.id)}
                                    onChange={() => toggleSelecionado(l.id)}
                                    className="h-3.5 w-3.5 accent-blue-600 cursor-pointer"
                                    title={selecionados.has(l.id) ? "Remover da seleção" : "Incluir no combo de demissões"}
                                  />
                                </td>
                                <td className="py-1.5 px-2 text-muted-foreground tabular-nums border-b border-border/50">{idx + 1}</td>
                                {/* Rev. 1935 — Clicar no nome abre o Raio-X do funcionário (mesmo modal usado em Colaboradores/AvisoPrevio/Ferias/etc.). */}
                                <td style={{ width: cdmColW.nome, minWidth: cdmColW.nome, maxWidth: cdmColW.nome }} className="py-1.5 px-2 font-medium truncate border-b border-border/50">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {/* Rev. 1941 — Avatar 28px à esquerda do nome; clique amplia
                                        em modal. Sem foto → bolinha cinza com inicial. */}
                                    {l.fotoUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setFotoAmpliada({ url: l.fotoUrl, nome: l.nomeCompleto })}
                                        className="shrink-0 w-7 h-7 rounded-full overflow-hidden border border-slate-300 hover:border-blue-500 hover:ring-2 hover:ring-blue-200 transition-all"
                                        title="Clique para ampliar a foto"
                                      >
                                        <img src={l.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
                                      </button>
                                    ) : (
                                      <div
                                        className="shrink-0 w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold border border-slate-300"
                                        title="Sem foto cadastrada"
                                      >
                                        {(l.nomeCompleto || '?').charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    {/* Rev. 1967 — Clique no nome agora abre o "Detalhe do Cálculo do
                                        Aviso" (quebra completa de verbas + descontos + data de pagamento).
                                        Raio-X foi movido para o ícone Stethoscope ao lado. User: "Quero
                                        poder clicar no nome do funcionário e ver todo cálculo pertinente
                                        ao aviso". */}
                                    <button
                                      type="button"
                                      onClick={() => setDetalheCalc(l)}
                                      className="text-left text-blue-700 hover:text-blue-900 hover:underline truncate flex-1 min-w-0"
                                      title={`Ver detalhe do cálculo do aviso de ${l.nomeCompleto}`}
                                    >
                                      {l.nomeCompleto}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRaioXEmployeeId(l.id)}
                                      className="shrink-0 p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-700 transition-colors"
                                      title={`Abrir Raio-X de ${l.nomeCompleto}`}
                                    >
                                      <Stethoscope className="h-3.5 w-3.5" />
                                    </button>
                                    {/* Rev. 1936 — Tag CIPA (estabilidade — CF Art. 10 II 'a' ADCT).
                                        User 16/05/2026: "marque uma tag de quem faz parte da cipa e não
                                        podemos fazer aviso devido a estabilidade.. so demarca para saber
                                        quem é..". Não exclui da lista, apenas sinaliza. */}
                                    {l.isCipa && (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-800 border border-orange-300 shrink-0"
                                        title={`CIPA — estável até ${l.cipaFimEstabilidade ? new Date(l.cipaFimEstabilidade + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}${l.cipaCargo ? ` (${l.cipaCargo})` : ''}. Dispensa sem justa causa vedada — CF Art. 10 II 'a' ADCT.`}
                                      >
                                        CIPA
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ width: cdmColW.funcao, minWidth: cdmColW.funcao, maxWidth: cdmColW.funcao }} className="py-1.5 px-2 text-muted-foreground truncate border-b border-border/50" title={l.funcao || l.cargo}>{l.funcao || l.cargo || '-'}</td>
                                <td style={{ width: cdmColW.obra, minWidth: cdmColW.obra, maxWidth: cdmColW.obra }} className="py-1.5 px-2 text-muted-foreground truncate border-b border-border/50" title={l.obra}>{l.obra || <span className="italic text-muted-foreground/60">sem alocação</span>}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums border-b border-border/50">{l.dataAdmissao ? new Date(l.dataAdmissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                {/* Rev. 1934 — Tempo de empresa em anos/meses/dias (não só anos).
                                    User 16/05/2026: "quero anos, meses e dias..". Mostra o detalhe;
                                    sort permanece por `anosServico` (rescisão usa anos completos). */}
                                <td className="py-1.5 px-2 text-center tabular-nums border-b border-border/50 whitespace-nowrap text-[11px]" title={`${l.anosServico} ano(s) completo(s) — base de cálculo da rescisão`}>
                                  {(l.tempoAnos ?? 0) > 0 && <span>{l.tempoAnos}a </span>}
                                  {((l.tempoAnos ?? 0) > 0 || (l.tempoMeses ?? 0) > 0) && <span>{l.tempoMeses ?? 0}m </span>}
                                  <span>{l.tempoDias ?? 0}d</span>
                                </td>
                                {/* Rev. 1931 — Idade real. Funcionários sem dataNascimento mostram "—" em itálico (não inferimos). */}
                                <td className="py-1.5 px-2 text-center tabular-nums border-b border-border/50" title={l.dataNascimento ? `Nascimento: ${new Date(l.dataNascimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : 'Data de nascimento não cadastrada'}>
                                  {l.idade != null ? l.idade : <span className="italic text-muted-foreground/60">—</span>}
                                </td>
                                <td className="py-1.5 px-2 text-center tabular-nums border-b border-border/50">{l.diasAvisoTotal}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums border-b border-border/50">{fmtBRL(l.salarioBase)}</td>
                                {/* Rev. 1964 — Aviso Indeniz. mostra oficial primário + "+compl" abaixo (pattern Custo Total). */}
                                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground border-b border-border/50">
                                  {fmtBRL((l as any).avisoOficial ?? l.avisoPrevioIndenizado)}
                                  {((l as any).avisoComplementar ?? 0) > 0 && (
                                    <div className="text-[9px] font-normal text-violet-700 mt-0.5" title={`Oficial: ${fmtBRL((l as any).avisoOficial)} + Complementar: ${fmtBRL((l as any).avisoComplementar)}`}>
                                      +compl {fmtBRL((l as any).avisoComplementar)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground border-b border-border/50">{fmtBRL(l.multaFGTS)}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums font-bold text-red-700 border-b border-border/50" title={(l as any).totalOficialBruto != null ? `Oficial bruto: ${fmtBRL((l as any).totalOficialBruto)} − Descontos legais (INSS+IRRF+pensão+sindical): ${fmtBRL((l as any).totalDescontos ?? 0)} = Oficial líquido: ${fmtBRL((l as any).totalOficialLiquido ?? l.totalOficial)}${l.totalComplementar > 0 ? ` + Complementar: ${fmtBRL(l.totalComplementar)}` : ''}` : undefined}>
                                  {fmtBRL(l.total)}
                                  {l.totalComplementar > 0 && (
                                    <div className="text-[9px] font-normal text-violet-700 mt-0.5">
                                      +compl {fmtBRL(l.totalComplementar)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {/* Rev. 1924 — bg sólido per-cell (mesma razão do thead) + top-shadow */}
                          <tfoot className="sticky bottom-0 z-20">
                            <tr>
                              {/* Rev. 1967 — +1 col checkbox → colSpan 11→12. */}
                              <td colSpan={12} className="py-2 px-2 text-right font-bold text-red-800 uppercase text-[11px] bg-red-50 border-t-2 border-red-300 shadow-[0_-2px_4px_-1px_rgba(0,0,0,0.08)]">TOTAL GERAL</td>
                              <td className="py-2 px-2 text-right tabular-nums font-bold text-red-800 bg-red-50 border-t-2 border-red-300 shadow-[0_-2px_4px_-1px_rgba(0,0,0,0.08)]">{fmtBRL(cdm.grandTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Rev. 1967 — Barra flutuante de seleção: aparece quando há >0 selecionados.
                        Mostra contagem + total consolidado + botão "Gerar Combo" que abre o modal
                        com a quebra de verbas e o cronograma de pagamentos (fluxo de caixa). */}
                    {selecionados.size > 0 && (
                      <div className="sticky bottom-0 z-30 mt-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg shadow-lg border border-blue-800">
                        <div className="flex items-center gap-3 text-sm">
                          <ListChecks className="h-5 w-5" />
                          <span className="font-semibold">{selecionados.size} funcionário{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                          <span className="opacity-80">·</span>
                          <span className="tabular-nums">Custo total: <strong>{fmtBRL(comboAgregado.total)}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/10" onClick={() => setSelecionados(new Set())}>
                            <X className="h-3.5 w-3.5 mr-1" /> Limpar
                          </Button>
                          <Button size="sm" variant="secondary" className="h-8 bg-white text-blue-700 hover:bg-blue-50 font-semibold" onClick={() => setComboOpen(true)}>
                            <Calculator className="h-3.5 w-3.5 mr-1.5" /> Gerar Combo de Demissões
                          </Button>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground mt-3 italic">
                      <strong>Composição da estimativa (Rev. 1964 — bate 1:1 com o modal Aviso Prévio):</strong> Oficial bruto (saldo de salário + férias proporcionais + 1/3 + férias vencidas + 13º proporcional + aviso prévio indenizado Lei 12.506 + multa 40% FGTS) <strong>− Descontos legais</strong> (INSS + IRRF + pensão alimentícia + contribuição sindical) <strong>= Oficial líquido</strong>. <strong>+ Complementar</strong> (mesmas verbas sobre complemento "por fora", quando aplicável). Passe o mouse sobre o valor pra ver o detalhe. <strong>Não inclui</strong> VR/VA, ajustes operacionais variáveis por mês (vales, EPI, convênios, faltas/atrasos, outros) — esses aparecem só no detalhe individual do módulo Aviso Prévio.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ===== SEÇÃO 3: ALERTAS ===== */}
            {/* Rev. 1942 — Cards "Vencendo em 7/30 dias" agora clicáveis: abrem
                drill-down listando QUAIS avisos (em_andamento) com dataFim dentro
                da janela. Mesmo critério do server (dashboards.ts L2864-2865). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'venc7', label: 'Vencendo em 7 dias' })}>
                <DashKpi label="Vencendo em 7 dias" value={data.vencendo7dias} icon={ShieldAlert} color="red" sub="Atenção imediata · clique para ver" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'venc30', label: 'Vencendo em 30 dias' })}>
                <DashKpi label="Vencendo em 30 dias" value={data.vencendo30dias} icon={CalendarDays} color="yellow" sub="Planejamento · clique para ver" />
              </div>
            </div>

            {/* ===== SEÇÃO 4: GRÁFICOS — Tipo + Redução ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DashChart
                title="Distribuição por Tipo de Aviso"
                type="doughnut"
                labels={[
                  "Empregador (Trabalhado)",
                  "Empregador (Indenizado)",
                  "Empregado (Trabalhado)",
                  "Empregado (Indenizado)",
                ]}
                datasets={[{
                  data: [
                    data.empregadorTrabalhado,
                    data.empregadorIndenizado,
                    data.empregadoTrabalhado,
                    data.empregadoIndenizado,
                  ],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], CHART_PALETTE[1], CHART_PALETTE[3]],
                }]}
                height={280}
                onChartClick={(info) => {
                  const tipoMap: Record<string, string> = {
                    "Empregador (Trabalhado)": "empregador_trabalhado",
                    "Empregador (Indenizado)": "empregador_indenizado",
                    "Empregado (Trabalhado)": "empregado_trabalhado",
                    "Empregado (Indenizado)": "empregado_indenizado",
                  };
                  setDrillDown({ type: 'tipo', label: tipoMap[info.label] || info.label });
                }}
              />
              <DashChart
                title="Redução de Jornada (Art. 488 CLT)"
                type="doughnut"
                labels={["2h por dia", "7 dias corridos", "Nenhuma"]}
                datasets={[{
                  data: [data.reducao2h, data.reducao7dias, data.semReducao],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], SEMANTIC_COLORS.neutro],
                }]}
                height={280}
                onChartClick={(info) => {
                  setDrillDown({ type: 'reducao', label: info.label });
                }}
              />
            </div>

            {/* ===== SEÇÃO 5: Evolução Mensal ===== */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Evolução Mensal de Avisos Prévios"
                type="bar"
                labels={data.evolucaoMensal.map((r: any) => {
                  const [y, m] = r.mes.split("-");
                  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                  return `${meses[parseInt(m) - 1]}/${y.slice(2)}`;
                })}
                datasets={[
                  {
                    label: "Trabalhado",
                    data: data.evolucaoMensal.map((r: any) => r.trabalhado),
                    backgroundColor: CHART_PALETTE[0],
                  },
                  {
                    label: "Indenizado",
                    data: data.evolucaoMensal.map((r: any) => r.indenizado),
                    backgroundColor: CHART_PALETTE[2],
                  },
                ]}
                height={280}
                onChartClick={(info) => {
                  const mesData = data.evolucaoMensal[info.dataIndex];
                  if (mesData) setDrillDown({ type: 'mes', label: mesData.mes });
                }}
              />
            )}

            {/* ===== SEÇÃO 6: Por Setor + Por Função ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.setorDist.length > 0 && (
                <DashChart
                  title="Avisos por Setor"
                  type="horizontalBar"
                  labels={data.setorDist.map((s: any) => s.setor)}
                  datasets={[{
                    label: "Avisos",
                    data: data.setorDist.map((s: any) => s.count),
                    backgroundColor: CHART_PALETTE[0],
                  }]}
                  height={Math.max(200, data.setorDist.length * 40)}
                  onChartClick={(info) => setDrillDown({ type: 'setor', label: info.label })}
                />
              )}
              {data.funcaoDist.length > 0 && (
                <DashChart
                  title="Top 10 Funções com Avisos"
                  type="horizontalBar"
                  labels={data.funcaoDist.map((f: any) => f.funcao.length > 25 ? f.funcao.slice(0, 25) + "..." : f.funcao)}
                  datasets={[{
                    label: "Avisos",
                    data: data.funcaoDist.map((f: any) => f.count),
                    backgroundColor: CHART_PALETTE[3],
                  }]}
                  height={Math.max(200, data.funcaoDist.length * 40)}
                  onChartClick={(info) => {
                    const fullLabel = data.funcaoDist[info.dataIndex]?.funcao || info.label;
                    setDrillDown({ type: 'funcao', label: fullLabel });
                  }}
                />
              )}
            </div>

            {/* ===== SEÇÃO 7: Custo por Setor ===== */}
            {data.custoPorSetor.length > 0 && (
              <DashChart
                title="Custo Estimado de Rescisão por Setor"
                type="bar"
                labels={data.custoPorSetor.map((s: any) => s.setor)}
                datasets={[{
                  label: "Valor (R$)",
                  data: data.custoPorSetor.map((s: any) => s.valor),
                  backgroundColor: data.custoPorSetor.map((_: any, i: number) => CHART_PALETTE[i % CHART_PALETTE.length]),
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
                onChartClick={(info) => {
                  setDrillDown({ type: 'custoSetor', label: info.label });
                }}
              />
            )}

            {/* ===== SEÇÃO 8: Composição das Rescisões ===== */}
            {data.breakdownRescisao.some((b: any) => b.valor > 0) && (
              <DashChart
                title="Composição Total das Rescisões"
                type="bar"
                labels={data.breakdownRescisao.map((b: any) => b.componente)}
                datasets={[{
                  label: "Valor Total (R$)",
                  data: data.breakdownRescisao.map((b: any) => b.valor),
                  backgroundColor: [
                    CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2],
                    CHART_PALETTE[4], SEMANTIC_COLORS.negativo, CHART_PALETTE[3],
                  ],
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
              />
            )}

            {/* ===== SEÇÃO 9: Dias de Aviso + Anos de Serviço ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.diasAvisoDist.length > 0 && (
                <DashChart
                  title="Distribuição de Dias de Aviso (Lei 12.506/2011)"
                  type="bar"
                  labels={data.diasAvisoDist.map((d: any) => `${d.dias} dias`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.diasAvisoDist.map((d: any) => d.count),
                    backgroundColor: CHART_PALETTE[4],
                  }]}
                  height={260}
                  onChartClick={(info) => {
                    const diasStr = info.label.replace(' dias', '');
                    setDrillDown({ type: 'dias', label: diasStr });
                  }}
                />
              )}
              {data.anosServicoDist.length > 0 && (
                <DashChart
                  title="Distribuição por Anos de Serviço"
                  type="bar"
                  labels={data.anosServicoDist.map((a: any) => a.anos === 0 ? "< 1 ano" : `${a.anos} ano${a.anos > 1 ? "s" : ""}`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.anosServicoDist.map((a: any) => a.count),
                    backgroundColor: CHART_PALETTE[1],
                  }]}
                  height={260}
                  onChartClick={(info) => {
                    const anosData = data.anosServicoDist[info.dataIndex];
                    if (anosData) setDrillDown({ type: 'anos', label: String(anosData.anos) });
                  }}
                />
              )}
            </div>

            {/* ===== SEÇÃO 10: Tabela Detalhada ===== */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Avisos Prévios Em Andamento ({(() => {
                      const base = data.avisos.filter((a: any) => a.status === 'em_andamento');
                      if (reducaoFilter === 'todos') return base.length;
                      return base.filter((a: any) => {
                        if (reducaoFilter === '7_dias_corridos') return a.reducaoJornada === '7_dias_corridos';
                        if (reducaoFilter === '2h_dia') return a.reducaoJornada === '2h_dia';
                        return true;
                      }).length;
                    })()})
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Redução:</span>
                    {['todos', '7_dias_corridos', '2h_dia'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setReducaoFilter(f)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          reducaoFilter === f
                            ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                            : 'bg-white text-muted-foreground border-border hover:bg-muted/50'
                        }`}
                      >
                        {f === 'todos' ? 'Todos' : f === '7_dias_corridos' ? '7 Dias' : '2h/Dia'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {data.avisos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aviso prévio registrado.</p>
                ) : (() => {
                  const baseAvisos = data.avisos.filter((a: any) => a.status === 'em_andamento');
                  const filteredAvisos = reducaoFilter === 'todos' ? baseAvisos : baseAvisos.filter((a: any) => {
                    if (reducaoFilter === '7_dias_corridos') return a.reducaoJornada === '7_dias_corridos';
                    if (reducaoFilter === '2h_dia') return a.reducaoJornada === '2h_dia';
                    return true;
                  });
                  return filteredAvisos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aviso com esta redução.</p>
                  ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Funcionário</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Tipo</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Início</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Fim</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Dias</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Redução</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground min-w-[160px]">Evolução</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Dias Restantes</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Setor</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Valor Est.</th>
                          <th className="py-2 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAvisos.map((a: any) => {
                          // Calcular progresso do aviso
                          const hoje = new Date();
                          const inicio = a.dataInicio ? new Date(a.dataInicio + 'T00:00:00') : null;
                          const fim = a.dataFim ? new Date(a.dataFim + 'T00:00:00') : null;
                          let progresso = 0;
                          let diasRestantes = 0;
                          let barColor = 'bg-blue-500';
                          if (a.status === 'concluido') {
                            progresso = 100;
                            barColor = 'bg-green-500';
                          } else if (a.status === 'cancelado') {
                            progresso = 100;
                            barColor = 'bg-red-400';
                          } else if (inicio && fim) {
                            const totalDias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
                            const diasPassados = Math.ceil((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
                            diasRestantes = Math.max(0, Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
                            progresso = Math.min(100, Math.max(0, Math.round((diasPassados / totalDias) * 100)));
                            if (progresso >= 90) barColor = 'bg-red-500';
                            else if (progresso >= 70) barColor = 'bg-amber-500';
                            else if (progresso >= 40) barColor = 'bg-blue-500';
                            else barColor = 'bg-emerald-500';
                          }
                          return (
                          <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{a.nomeCompleto}</td>
                            <td className="py-2 pr-3 text-xs">{fmtTipoLabel(a.tipo)}</td>
                            <td className="py-2 pr-3 text-xs">{a.dataInicio ? new Date(a.dataInicio + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            <td className="py-2 pr-3 text-xs font-semibold">{a.dataFim ? new Date(a.dataFim + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            <td className="py-2 pr-3 text-center font-mono">{a.diasAviso}</td>
                            <td className="py-2 pr-3 text-xs">{fmtReducaoLabel(a.reducaoJornada || "nenhuma")}</td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                                  <div
                                    className={`h-full rounded-full transition-all ${barColor}`}
                                    style={{ width: `${progresso}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap w-[52px] text-right">
                                  {a.status === 'concluido' ? '100%' : a.status === 'cancelado' ? 'Canc.' : `${progresso}%`}
                                </span>
                              </div>
                              {a.status === 'em_andamento' && diasRestantes > 0 && (
                                <p className="text-[9px] text-muted-foreground mt-0.5">{diasRestantes}d restante{diasRestantes !== 1 ? 's' : ''}</p>
                              )}
                              {a.status === 'em_andamento' && diasRestantes === 0 && progresso >= 100 && (
                                <p className="text-[9px] text-red-600 font-semibold mt-0.5">Vencido!</p>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-center">{(() => {
                              const ultimoDia = a.reducaoJornada === '7_dias_corridos' && a.dataFim
                                ? (() => { const dt = new Date(a.dataFim + 'T00:00:00'); dt.setDate(dt.getDate() - 7); return dt; })()
                                : a.dataFim ? new Date(a.dataFim + 'T00:00:00') : null;
                              if (!ultimoDia) return '-';
                              const hj = new Date(); hj.setHours(0,0,0,0);
                              const diff = Math.ceil((ultimoDia.getTime() - hj.getTime()) / (1000*60*60*24));
                              if (diff < 0) return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">Vencido!</span>;
                              if (diff <= 7) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{diff}d</span>;
                              return <span className="text-xs font-medium text-blue-600">{diff}d</span>;
                            })()}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{a.setor || "-"}</td>
                            <td className="py-2 pr-3 text-xs font-semibold text-right tabular-nums">
                              {fmtValorStr(a.valorEstimadoTotal)}
                            </td>
                            <td className="py-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor(a.status)}`}>
                                {fmtStatus(a.status)}
                              </span>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* ===== DRILL-DOWN DIALOG (Rev. 1944 — layout redesenhado) ===== */}
            {/* Rev. 2472 — Layout ultra moderno: header com gradient
                temático (urgência/status), avatares com gradient único por
                funcionário, cards polidos com hover-lift, footer com
                resumo financeiro destacado. Largura ampliada (3xl→5xl). */}
            <Dialog open={!!drillDown} onOpenChange={(open) => !open && setDrillDown(null)}>
              <DialogContent
                className="max-w-5xl max-h-[88vh] p-0 overflow-hidden flex flex-col gap-0 border-0"
                style={{ background: "#F8FAFC" }}
              >
                {(() => {
                  const isVenc7 = drillDown?.type === 'venc7';
                  const isVenc30 = drillDown?.type === 'venc30';
                  const isUrgente = isVenc7 || isVenc30;
                  // Gradient temático por tipo do drill-down
                  const headerGradient =
                    isVenc7 ? 'linear-gradient(135deg, #7F1D1D 0%, #B91C1C 50%, #DC2626 100%)' :
                    isVenc30 ? 'linear-gradient(135deg, #78350F 0%, #B45309 50%, #D97706 100%)' :
                    drillDown?.type === 'status' && drillDown?.label === 'concluido' ? 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)' :
                    drillDown?.type === 'status' && drillDown?.label === 'cancelado' ? 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 50%, #B91C1C 100%)' :
                    drillDown?.type === 'status' && drillDown?.label === 'em_andamento' ? 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 50%, #2563EB 100%)' :
                    drillDown?.type === 'funcao' ? 'linear-gradient(135deg, #581C87 0%, #6B21A8 50%, #7C3AED 100%)' :
                    drillDown?.type === 'setor' || drillDown?.type === 'custoSetor' ? 'linear-gradient(135deg, #164E63 0%, #155E75 50%, #0891B2 100%)' :
                    drillDown?.type === 'finTotal' ? 'linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #4C1D95 100%)' :
                    'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)';
                  const headerIcon =
                    drillDown?.type === 'funcao' ? <Briefcase className="h-6 w-6 text-white" /> :
                    drillDown?.type === 'setor' || drillDown?.type === 'custoSetor' ? <Building2 className="h-6 w-6 text-white" /> :
                    drillDown?.type === 'status' || drillDown?.type === 'finStatus' ? <BarChart3 className="h-6 w-6 text-white" /> :
                    drillDown?.type === 'finTotal' ? <DollarSign className="h-6 w-6 text-white" /> :
                    isVenc7 ? <ShieldAlert className="h-6 w-6 text-white" /> :
                    isVenc30 ? <CalendarDays className="h-6 w-6 text-white" /> :
                    <AlertTriangle className="h-6 w-6 text-white" />;
                  const headerTitle =
                    drillDown?.type === 'funcao' ? `Função: ${drillDown?.label}` :
                    drillDown?.type === 'setor' || drillDown?.type === 'custoSetor' ? `Setor: ${drillDown?.label}` :
                    drillDown?.type === 'status' ? `Status: ${fmtStatus(drillDown?.label || '')}` :
                    drillDown?.type === 'finTotal' && drillDown?.label === 'Todos os Avisos' ? `Todos os Avisos do Ano` :
                    drillDown?.type === 'finTotal' ? 'Custo Total Estimado' :
                    isVenc7 ? 'Avisos vencendo em até 7 dias' :
                    isVenc30 ? 'Avisos vencendo em até 30 dias' :
                    drillDown?.type === 'finStatus' ? `Custo ${fmtStatus(drillDown?.label || '')}` :
                    drillDown?.type === 'tipo' ? `Tipo: ${fmtTipoLabel(drillDown?.label || '')}` :
                    drillDown?.type === 'dias' ? `Dias de Aviso: ${drillDown?.label}` :
                    drillDown?.type === 'anos' ? `Anos de Serviço: ${drillDown?.label === '0' ? '< 1 ano' : drillDown?.label + ' ano(s)'}` :
                    drillDown?.type === 'mes' ? `Mês: ${drillDown?.label}` :
                    drillDown?.type === 'reducao' ? `Redução: ${drillDown?.label}` :
                    drillDown?.label;
                  const headerSubtitle =
                    isVenc7 ? 'Atenção imediata — providenciar acerto/encaminhamento antes do prazo' :
                    isVenc30 ? 'Planejamento de caixa do próximo mês' :
                    drillDown?.type === 'status' ? 'Avisos prévios neste status' :
                    drillDown?.type === 'finTotal' ? 'Visão financeira consolidada' :
                    'Avisos prévios filtrados';
                  const total = drillDownAvisosOrdenados.reduce((sum: number, a: any) => sum + parseFloat(a.valorEstimadoTotal || '0'), 0);
                  const media = drillDownAvisosOrdenados.length > 0 ? total / drillDownAvisosOrdenados.length : 0;
                  return (
                    <>
                      {/* HEADER — gradient temático com glassmorphism */}
                      <DialogHeader
                        className="px-7 py-5 shrink-0 space-y-0 border-b border-slate-200"
                        style={{ background: headerGradient, color: '#fff' }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                              style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.22)' }}
                            >
                              {headerIcon}
                            </div>
                            <div className="min-w-0">
                              <DialogTitle className="text-white text-xl font-bold tracking-tight truncate">{headerTitle}</DialogTitle>
                              <p className="text-xs text-white/70 mt-0.5 truncate">{headerSubtitle}</p>
                            </div>
                          </div>
                          <div
                            className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold tracking-wide flex items-center gap-2"
                            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
                          >
                            <span className={`h-2 w-2 rounded-full ${isUrgente ? 'bg-amber-300' : 'bg-emerald-300'} animate-pulse`} />
                            {drillDownAvisosOrdenados.length} {drillDownAvisosOrdenados.length === 1 ? 'aviso' : 'avisos'}
                          </div>
                        </div>
                      </DialogHeader>

                      {/* LISTA — cards modernos com avatar gradient */}
                      <div className="flex-1 overflow-y-auto px-7 py-5">
                        {drillDownAvisosOrdenados.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                              <ShieldAlert className="h-7 w-7 text-emerald-600" />
                            </div>
                            <p className="text-sm font-semibold text-slate-700">Nenhum aviso neste filtro</p>
                            <p className="text-xs text-slate-500 mt-1">Não há avisos prévios que correspondam aos critérios selecionados.</p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {drillDownAvisosOrdenados.map((a: any) => {
                              const diasFim = diasAteVencer(a.dataFim);
                              const corBadgeUrg = diasFim === null ? '' :
                                diasFim < 0 ? 'bg-red-600 text-white border-red-700' :
                                diasFim <= 7 ? 'bg-red-50 text-red-700 border-red-200' :
                                diasFim <= 30 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-slate-50 text-slate-600 border-slate-200';
                              const labelUrg = diasFim === null ? null :
                                diasFim < 0 ? `Atrasado ${Math.abs(diasFim)}d` :
                                diasFim === 0 ? 'Vence hoje' :
                                diasFim === 1 ? 'Vence amanhã' :
                                `Vence em ${diasFim}d`;
                              return (
                                <div
                                  key={a.id}
                                  className="group flex items-stretch gap-4 p-4 rounded-2xl border border-slate-200 bg-white hover:border-violet-300 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                                >
                                  {/* Rev. 2473 — Foto real do colaborador (PersonPhoto: click amplia em lightbox).
                                      Fallback automático pra iniciais quando sem foto. */}
                                  <div className="shrink-0 self-start">
                                    <PersonPhoto
                                      src={a.fotoUrl}
                                      alt={a.nomeCompleto || 'Colaborador'}
                                      size="md"
                                      caption={[a.funcao, a.setor].filter(Boolean).join(' · ') || undefined}
                                    />
                                  </div>

                                  {/* Bloco central */}
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => { setRaioXEmployeeId(a.employeeId || a.funcionarioId || null); }}
                                        className="text-sm font-bold text-slate-900 hover:text-violet-700 hover:underline truncate text-left tracking-tight"
                                        title="Clique para ver o raio-X do funcionário"
                                      >
                                        {a.nomeCompleto}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tipoChipColor(a.tipo)}`}>
                                        {fmtTipoLabel(a.tipo)}
                                      </span>
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                        {a.diasAviso}d
                                      </span>
                                      {a.reducaoJornada && a.reducaoJornada !== 'nenhuma' && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200" title="Redução de jornada (Art. 488 CLT)">
                                          ⏱ {fmtReducaoLabel(a.reducaoJornada)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                      <CalendarDays className="h-3 w-3 shrink-0" />
                                      <span className="tabular-nums font-medium">
                                        {a.dataInicio ? new Date(a.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                        <span className="mx-1.5 text-slate-300">→</span>
                                        {a.dataFim ? new Date(a.dataFim + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                      </span>
                                      {(a.funcao || a.setor) && (
                                        <span className="truncate text-slate-500">· {a.funcao || a.setor}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bloco direito: valor + status + urgência */}
                                  <div className="flex flex-col items-end gap-2 shrink-0 self-center">
                                    <p className={`font-bold text-base tabular-nums leading-none ${isUrgente ? 'text-red-700' : 'text-slate-900'}`}>
                                      {fmtValorStr(a.valorEstimadoTotal)}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                      {labelUrg && isUrgente && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${corBadgeUrg}`}>
                                          {labelUrg}
                                        </span>
                                      )}
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(a.status)}`}>
                                        {fmtStatus(a.status)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* FOOTER — resumo financeiro destacado */}
                      {drillDownAvisosOrdenados.length > 0 && (
                        <div className="px-7 py-4 shrink-0 border-t border-slate-200 bg-white">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Avisos prévios</div>
                                <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none mt-1">
                                  {drillDownAvisosOrdenados.length}
                                  {isUrgente && (
                                    <span className="text-[10px] font-medium text-slate-400 ml-2">ordenados por vencimento</span>
                                  )}
                                </div>
                              </div>
                              {media > 0 && (
                                <div className="border-l border-slate-200 pl-6">
                                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Custo médio</div>
                                  <div className="text-lg font-semibold text-slate-700 tabular-nums leading-none mt-1">
                                    {fmtBRL(media)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total estimado</div>
                              <div className={`text-2xl font-bold tabular-nums leading-none mt-1 ${isVenc7 ? 'text-red-600' : isVenc30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {fmtBRL(total)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>

            <TabelaComparativaAnual
              meses={comparativo?.meses || []}
              indicadores={AP_INDICADORES}
              isLoading={loadingComp}
              titulo={`Tendência mês-a-mês — ${ano}`}
              subtitulo="Janeiro até o mês corrente · clique em qualquer linha para análise aprofundada"
            />

            {/* ===== INFORMAÇÃO LEGAL ===== */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Briefcase className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">Lei 12.506/2011 — Aviso Prévio Proporcional (aplicado às DUAS modalidades)</p>
                    <p>O aviso prévio é de 30 dias para empregados com até 1 ano de serviço, acrescido de <strong>3 dias por ano adicional</strong>, até o máximo de 90 dias. <strong>A lei não distingue trabalhado de indenizado</strong> — pela corrente majoritária do TST (Súm. 441 e jurisprudência consolidada), os +3d/ano aplicam-se a AMBAS as modalidades; o trabalhador apenas escolhe se cumpre os dias na empresa ou recebe tudo indenizado. A redução de jornada (Art. 488 CLT) permite reduzir 2 horas diárias ou faltar 7 dias corridos durante o aviso trabalhado.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
          <PrintFooterLGPD />
      {/* Rev. 1969 — Modal "Detalhe do Cálculo do Aviso" REFEITO pra usar o
          MESMO procedure tRPC `avisoPrevio.calcular` que a tela oficial "Novo
          Aviso Prévio" usa (L346 AvisoPrevio.tsx). Garantia: valores 1:1
          idênticos (inclusive "Outros oficial" — vales, EPI, convênios, faltas)
          + replica o layout dos 3 cards: VERDE (Total Líquido), ROXO (Rescisão
          Complementar com line-by-line), PRETO (Total Geral Oficial+Compl).
          User (16/05/2026 IMG_0824 vs IMG_0826): "ainda não está 100% igual". */}
      {detalheCalc && (
        <DetalheCalculoModal
          row={detalheCalc}
          dataDesligamento={cdmData}
          tipo={cdmTipo}
          onClose={() => setDetalheCalc(null)}
          onAbrirRaioX={(id) => { setDetalheCalc(null); setRaioXEmployeeId(id); }}
        />
      )}

      {/* Rev. 1967 — Modal "Combo de Demissões" — fluxo de caixa consolidado dos
          funcionários selecionados. Mostra totais por verba + cronograma de
          pagamentos agrupado por data prevista. User: "quero poder selecionar
          vários e fazer um combo de demissões para ver o fluxo de caixa que vai
          acontecer". */}
      {comboOpen && (
        <Dialog open={comboOpen} onOpenChange={setComboOpen}>
          <DialogContent className="!top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none !border-0 !p-0 !gap-0 !flex !flex-col !overflow-hidden">
            <DialogHeader className="shrink-0 px-4 sm:px-6 py-3 border-b bg-white space-y-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-5 w-5 text-blue-600" />
                Combo de Demissões — Fluxo de Caixa Consolidado
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
            <div className="space-y-4 text-sm max-w-5xl mx-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700 tabular-nums">{comboAgregado.qtd}</p>
                  <p className="text-[10px] text-blue-600 font-medium">Funcionários</p>
                </div>
                <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-3 text-center">
                  <p className="text-lg font-bold text-purple-700 tabular-nums">{fmtBRL(comboAgregado.salarioBaseSoma)}</p>
                  <p className="text-[10px] text-purple-600 font-medium">Folha mensal</p>
                </div>
                <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-lg font-bold text-amber-700 tabular-nums">{fmtBRL(comboAgregado.totalOficialBruto)}</p>
                  <p className="text-[10px] text-amber-600 font-medium">Bruto oficial</p>
                </div>
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center">
                  <p className="text-lg font-bold text-red-700 tabular-nums">{fmtBRL(comboAgregado.total)}</p>
                  <p className="text-[10px] text-red-600 font-medium">Custo total</p>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 border-b font-semibold text-slate-800 text-xs uppercase tracking-wide">Quebra por Verba (somatórios)</div>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5 px-3 text-muted-foreground">Saldo de salário</td><td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(comboAgregado.saldoSalario)}</td></tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-3 text-muted-foreground">Aviso prévio indenizado</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(comboAgregado.avisoOficial)}
                        {comboAgregado.avisoComplementar > 0 && <div className="text-[10px] text-violet-700">+compl {fmtBRL(comboAgregado.avisoComplementar)}</div>}
                      </td>
                    </tr>
                    <tr className="border-b"><td className="py-1.5 px-3 text-muted-foreground">13º proporcional</td><td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(comboAgregado.decimoTerceiro)}</td></tr>
                    <tr className="border-b"><td className="py-1.5 px-3 text-muted-foreground">Férias proporcionais + 1/3</td><td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(comboAgregado.feriasProporcional)}</td></tr>
                    {comboAgregado.feriasVencidas > 0 && (
                      <tr className="border-b"><td className="py-1.5 px-3 text-red-700 font-medium">Férias vencidas + 1/3</td><td className="py-1.5 px-3 text-right tabular-nums text-red-700 font-medium">{fmtBRL(comboAgregado.feriasVencidas)}</td></tr>
                    )}
                    <tr className="border-b"><td className="py-1.5 px-3 text-muted-foreground">Multa 40% FGTS</td><td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(comboAgregado.multaFGTS)}</td></tr>
                    <tr className="border-b bg-slate-50"><td className="py-1.5 px-3 font-semibold">Total bruto</td><td className="py-1.5 px-3 text-right tabular-nums font-semibold">{fmtBRL(comboAgregado.totalOficialBruto)}</td></tr>
                    <tr className="border-b"><td className="py-1.5 px-3 text-rose-700">− Descontos legais (INSS+IRRF+pensão+sindical)</td><td className="py-1.5 px-3 text-right tabular-nums text-rose-700">− {fmtBRL(comboAgregado.totalDescontos)}</td></tr>
                    <tr className="border-b bg-slate-50"><td className="py-1.5 px-3 font-semibold">Oficial líquido</td><td className="py-1.5 px-3 text-right tabular-nums font-semibold">{fmtBRL(comboAgregado.totalOficialLiquido)}</td></tr>
                    {comboAgregado.totalComplementar > 0 && (
                      <tr className="border-b bg-violet-50/50"><td className="py-1.5 px-3 text-violet-700">+ Complementar</td><td className="py-1.5 px-3 text-right tabular-nums text-violet-700">{fmtBRL(comboAgregado.totalComplementar)}</td></tr>
                    )}
                    <tr className="bg-red-50"><td className="py-2 px-3 font-bold text-red-800 uppercase">Custo total a desembolsar</td><td className="py-2 px-3 text-right tabular-nums font-bold text-red-800 text-base">{fmtBRL(comboAgregado.total)}</td></tr>
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground px-3 py-1.5 italic bg-slate-50/50 border-t">FGTS estimado (depositado mensalmente, separado das verbas rescisórias): {fmtBRL(comboAgregado.fgtsEstimado)}.</p>
              </div>

              {/* Rev. 2953 — Redução MENSAL recorrente da folha (sobra de caixa).
                  User: "incluir previsão de redução MENSAL da folha + seguro de
                  vida + vale alimentação (visão da sobra de caixa)". */}
              <div className="border-2 border-emerald-200 rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-emerald-50 border-b font-semibold text-emerald-900 text-xs uppercase tracking-wide flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5" /> Redução Mensal Recorrente da Folha (sobra de caixa)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-3">
                  <div className="rounded-lg border bg-white p-2.5 text-center">
                    <p className="text-base font-bold text-slate-800 tabular-nums">{fmtBRL(comboAgregado.salarioBaseSoma)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">Salários / mês</p>
                  </div>
                  <div className="rounded-lg border bg-white p-2.5 text-center">
                    <p className="text-base font-bold text-slate-800 tabular-nums">{fmtBRL(comboAgregado.seguroVidaSoma)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">Seguro de vida / mês</p>
                  </div>
                  <div className="rounded-lg border bg-white p-2.5 text-center">
                    <p className="text-base font-bold text-slate-800 tabular-nums">{fmtBRL(comboAgregado.valeAlimentacaoSoma)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">Vale alimentação / mês</p>
                  </div>
                  <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2.5 text-center">
                    <p className="text-base font-bold text-emerald-700 tabular-nums">{fmtBRL(comboAgregado.salarioBaseSoma + comboAgregado.seguroVidaSoma + comboAgregado.valeAlimentacaoSoma)}</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">Redução mensal total</p>
                  </div>
                  <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2.5 text-center">
                    <p className="text-base font-bold text-emerald-700 tabular-nums">{fmtBRL((comboAgregado.salarioBaseSoma + comboAgregado.seguroVidaSoma + comboAgregado.valeAlimentacaoSoma) * 12)}</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">Redução anual (×12)</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground px-3 py-1.5 italic bg-emerald-50/40 border-t">Seguro de vida e vale alimentação vêm do cadastro de cada funcionário; quando não preenchidos contam como R$ 0,00. A redução anual é projeção linear (12 meses), sem reajustes de convenção/dissídio.</p>
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-blue-50 border-b font-semibold text-blue-900 text-xs uppercase tracking-wide flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" /> Cronograma de Pagamentos (fluxo de caixa)
                </div>
                {cronogramaPagamentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 italic">Sem pagamentos.</p>
                ) : (
                  <div className="divide-y">
                    {cronogramaPagamentos.map((g) => (
                      <details key={g.data.toISOString()} className="group">
                        <summary className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 list-none">
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90" />
                            <span className="font-semibold text-slate-800">{fmtDataBR(g.data)}</span>
                            <span className="text-[11px] text-muted-foreground">· {g.qtd} pagamento{g.qtd > 1 ? 's' : ''}</span>
                          </div>
                          <span className="font-bold tabular-nums text-red-700">{fmtBRL(g.total)}</span>
                        </summary>
                        <div className="bg-slate-50/60 px-3 py-2">
                          <table className="w-full text-[11px]">
                            <tbody>
                              {g.itens.map((it: any) => (
                                <tr key={it.id} className="border-b border-slate-200 last:border-0">
                                  <td className="py-1 pr-2 truncate">{it.nomeCompleto}</td>
                                  <td className="py-1 px-2 text-muted-foreground truncate">{it.funcao || it.cargo || '—'}</td>
                                  <td className="py-1 pl-2 text-right tabular-nums font-medium text-red-700 whitespace-nowrap">{fmtBRL(it.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground px-3 py-1.5 italic bg-blue-50/30 border-t">
                  Estimativas baseadas em <strong>Art. 477 §6 CLT</strong>: indenizado → 10 dias corridos; trabalhado → 1º dia útil após fim do aviso (aproximado +1d). FGTS+multa 40% segue o cronograma da rescisão (mesma data).
                </p>
              </div>

            </div>
            </div>
            <div className="shrink-0 flex flex-wrap justify-between items-center gap-2 px-4 sm:px-6 py-3 border-t bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={gerarRelatorioCombo} disabled={comboAgregado.qtd === 0} className="gap-1.5">
                  <FileText className="h-4 w-4" /> Gerar PDF p/ diretoria
                </Button>
                <Button size="sm" variant="outline" onClick={abrirSaveDialog} disabled={selecionados.size === 0} className="gap-1.5">
                  <Save className="h-4 w-4" /> {loadedSimId ? "Salvar alterações" : "Salvar simulação"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSavedListOpen(true)} className="gap-1.5">
                  <FolderOpen className="h-4 w-4" /> Simulações salvas
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="default" onClick={() => setConfirmGerarOpen(true)} disabled={selecionados.size === 0 || gerarLoteMut.isPending} className="gap-1.5 bg-red-600 hover:bg-red-700">
                  {gerarLoteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Gerar avisos de todos ({selecionados.size})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setComboOpen(false)}>Fechar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ===== Rev. 2960 — Dialog: Salvar simulação ===== */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Save className="h-5 w-5 text-blue-600" /> Salvar simulação do Combo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome da simulação</label>
              <Input
                value={nomeSimulacao}
                onChange={(e) => setNomeSimulacao(e.target.value)}
                placeholder="Ex.: Demissões Obra X — Junho/2026"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSalvarSimulacao(!loadedSimId); }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selecionados.size} funcionário(s) · {cdmTipo === 'empregador_indenizado' ? 'Aviso INDENIZADO' : 'Aviso TRABALHADO'} · ref. {new Date(cdmData + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
            {loadedSimId && (
              <Button size="sm" variant="outline" disabled={salvarMut.isPending} onClick={() => handleSalvarSimulacao(true)} className="gap-1.5">
                {salvarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar como nova
              </Button>
            )}
            <Button size="sm" variant="default" disabled={salvarMut.isPending || atualizarMut.isPending} onClick={() => handleSalvarSimulacao(!loadedSimId)} className="gap-1.5">
              {(salvarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {loadedSimId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Rev. 2960 — Dialog: Simulações salvas ===== */}
      <Dialog open={savedListOpen} onOpenChange={setSavedListOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5 text-blue-600" /> Simulações salvas</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {savedListQuery.isLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (savedListQuery.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nenhuma simulação salva ainda. Selecione funcionários e clique em "Salvar simulação".</p>
            ) : (
              <div className="space-y-2">
                {(savedListQuery.data || []).map((sim: any) => (
                  <div key={sim.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{sim.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {sim.qtd} funcionário(s) · {sim.tipo === 'empregador_indenizado' ? 'INDENIZADO' : 'TRABALHADO'} · ref. {new Date(sim.dataReferencia + 'T00:00:00').toLocaleDateString('pt-BR')}
                        {sim.criadoPorNome ? ` · ${sim.criadoPorNome}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => aplicarSimulacao(sim)} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Abrir / editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleExcluirSimulacao(sim.id, sim.nome)} disabled={excluirMut.isPending} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" variant="default" onClick={() => setSavedListOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Rev. 2960 — Dialog: Confirmar geração em lote ===== */}
      <Dialog open={confirmGerarOpen} onOpenChange={setConfirmGerarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-red-600" /> Gerar avisos de todos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <p>Será criado um <strong>aviso prévio</strong> para cada um dos <strong>{selecionados.size}</strong> funcionário(s) selecionado(s), usando o tipo <strong>{cdmTipo === 'empregador_indenizado' ? 'INDENIZADO' : 'TRABALHADO'}</strong> e a data de referência <strong>{new Date(cdmData + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>.</p>
            <p className="text-[12px] text-muted-foreground">Funcionários que já possuem um aviso prévio em andamento serão <strong>pulados</strong> automaticamente. Nenhum cálculo de rescisão é alterado.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmGerarOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="default" onClick={handleGerarTodos} disabled={gerarLoteMut.isPending} className="gap-1.5 bg-red-600 hover:bg-red-700">
              {gerarLoteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Confirmar e gerar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Rev. 2960 — Dialog: Resultado da geração em lote ===== */}
      <Dialog open={!!batchResult} onOpenChange={(o) => !o && setBatchResult(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" /> Resultado da geração</DialogTitle>
          </DialogHeader>
          {batchResult && (
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border-2 border-green-200 bg-green-50/50 p-3">
                  <p className="text-2xl font-bold text-green-700 tabular-nums">{batchResult.criados}</p>
                  <p className="text-[11px] text-green-600 font-medium">Criados</p>
                </div>
                <div className="rounded-lg border-2 border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-2xl font-bold text-amber-700 tabular-nums">{batchResult.pulados}</p>
                  <p className="text-[11px] text-amber-600 font-medium">Pulados</p>
                </div>
                <div className="rounded-lg border-2 border-red-200 bg-red-50/50 p-3">
                  <p className="text-2xl font-bold text-red-700 tabular-nums">{batchResult.erros}</p>
                  <p className="text-[11px] text-red-600 font-medium">Erros</p>
                </div>
              </div>
              {batchResult.pulados > 0 && (
                <p className="text-[12px] text-muted-foreground">Os pulados já possuíam um aviso prévio em andamento.</p>
              )}
              {Array.isArray(batchResult.detalheErros) && batchResult.detalheErros.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/30 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">Erros</p>
                  <ul className="space-y-1 text-[11px] text-red-700">
                    {batchResult.detalheErros.map((e: any, i: number) => (
                      <li key={i}>• {e.nome ? `${e.nome}: ` : `#${e.employeeId}: `}{e.erro}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" variant="default" onClick={() => setBatchResult(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 1935 — Modal Raio-X do funcionário (abre via ícone Stethoscope ao lado do nome). */}
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
      {/* Rev. 1941 — Modal de foto ampliada. Fundo escuro semi-transparente,
          clique fora fecha. Padrão idêntico ao do RaioXFuncionario L3752+. */}
      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={fotoAmpliada.url}
              alt={fotoAmpliada.nome}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border-4 border-white"
            />
            <div className="bg-white/95 px-4 py-2 rounded-lg shadow-lg">
              <p className="font-bold text-slate-800 text-center">{fotoAmpliada.nome}</p>
            </div>
            <button
              type="button"
              onClick={() => setFotoAmpliada(null)}
              className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-white text-slate-800 shadow-lg hover:bg-slate-100 flex items-center justify-center text-lg font-bold border border-slate-300"
              title="Fechar (ou clique no fundo)"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Rev. 1969 — Modal "Detalhe do Cálculo do Aviso" usando o MESMO procedure tRPC
// `avisoPrevio.calcular` que a tela "Novo Aviso Prévio" usa. Garantia 1:1 com a
// tela oficial (inclusive descontos operacionais "Outros oficial").
// Layout: 3 cards (verde TOTAL LÍQUIDO, roxo USO INTERNO line-by-line, preto
// TOTAL GERAL) replicando AvisoPrevio.tsx L2920-3086.
function DetalheCalculoModal({
  row, dataDesligamento, tipo, onClose, onAbrirRaioX,
}: {
  row: any;
  dataDesligamento: string;
  tipo: 'empregador_indenizado' | 'empregador_trabalhado';
  onClose: () => void;
  onAbrirRaioX: (id: number) => void;
}) {
  const { data: calc, isLoading, error } = (trpc as any).avisoPrevio.avisoPrevio.calcular.useQuery(
    { employeeId: row.id, tipo, dataDesligamento },
    { enabled: !!row?.id, refetchOnWindowFocus: false },
  );
  const fmt = (v: any) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
    return (isNaN(n) ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  const fmtData = (s: any) => {
    if (!s) return '—';
    const str = String(s).slice(0, 10);
    const [y, m, d] = str.split('-');
    return d && m && y ? `${d}/${m}/${y}` : str;
  };
  const pv = calc?.previsaoRescisao;
  const pc = calc?.previsaoRescisaoComplementar;
  const oficialLiq = parseFloat(String(calc?.totalLiquido ?? pv?.totalLiquido ?? pv?.total ?? '0')) || 0;
  const complTot = parseFloat(String(pc?.total ?? '0')) || 0;
  const totalGeral = oficialLiq + complTot;

  // Rev. 1970 — Composição percentual das verbas (mini-barra horizontal stacked).
  const totalBruto = parseFloat(String(pv?.totalBruto ?? pv?.total ?? '0')) || 0;
  const composicao = pv ? [
    { key: 'saldo', label: 'Saldo Salário', value: parseFloat(String(pv.saldoSalario || '0')) || 0, color: '#10B981' },
    { key: 'aviso', label: 'Aviso Indenizado', value: parseFloat(String(pv.avisoPrevioIndenizado || '0')) || 0, color: '#3B82F6' },
    { key: '13o', label: '13º Proporcional', value: parseFloat(String(pv.decimoTerceiroProporcional || '0')) || 0, color: '#A78BDB' },
    { key: 'ferias', label: 'Férias Prop. + 1/3', value: parseFloat(String(pv.totalFerias || '0')) || 0, color: '#F59E0B' },
    { key: 'fv', label: 'Férias Vencidas + 1/3', value: parseFloat(String(pv.feriasVencidas || '0')) || 0, color: '#EF4444' },
    { key: 'fgts', label: 'Multa 40% FGTS', value: parseFloat(String(pv.multaFGTS || '0')) || 0, color: '#5CC5CF' },
  ].filter(c => c.value > 0) : [];

  // Rev. 1970 — Imprimir / PDF do cálculo individual.
  const handlePrint = () => {
    const el = document.getElementById(`detalhe-calc-print-${row.id}`);
    if (!el) return;
    el.classList.add('print-only');
    const cleanup = () => { el.classList.remove('print-only'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 5000);
    window.print();
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none !border-0 !p-0 !gap-0 !flex !flex-col !overflow-hidden">
        {/* Header colorido fixo */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 sm:px-6 py-3 sm:py-4 shadow-md shrink-0">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-white text-base font-semibold">
              <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
                <Calculator className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate">Detalhe do Cálculo do Aviso</div>
                <div className="text-[11px] font-normal text-blue-100 truncate">{row.nomeCompleto}</div>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div id={`detalhe-calc-print-${row.id}`} className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain max-w-6xl w-full mx-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Calculando rescisão (procedure oficial)…
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              Erro ao calcular: {String((error as any)?.message || error)}
            </div>
          )}

          {calc && (
            <div className="space-y-5 text-sm">
              {/* HERO SUMMARY: 3 KPIs at-a-glance */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-700 tracking-wide">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Total Líquido
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">{fmt(oficialLiq)}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Bruto − Descontos (oficial TRCT)</p>
                </div>
                <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-violet-700 tracking-wide">
                    <Wallet className="h-3.5 w-3.5" /> Complementar
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-violet-700 tabular-nums mt-1">{fmt(complTot)}</p>
                  <p className="text-[10px] text-violet-600 mt-0.5">{pc ? `Sobre ${fmt(pc.baseComplemento)}/mês — uso interno` : 'Sem complemento cadastrado'}</p>
                </div>
                <div className="rounded-xl border-2 border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-300 tracking-wide">
                    <DollarSign className="h-3.5 w-3.5" /> Total Geral
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-white tabular-nums mt-1">{fmt(totalGeral)}</p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Oficial + Complementar</p>
                </div>
              </div>

              {/* Header com dados base do funcionário (ícone + grid) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-md bg-slate-200/70 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-slate-600" /></div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Dados Base</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                  <div><span className="text-muted-foreground">Função:</span> <span className="font-medium text-slate-800">{row.funcao || row.cargo || '—'}</span></div>
                  <div className="sm:col-span-2"><span className="text-muted-foreground">Obra:</span> <span className="font-medium text-slate-800">{row.obra || '—'}</span></div>
                  <div><span className="text-muted-foreground">Admissão:</span> <span className="font-medium text-slate-800 tabular-nums">{fmtData(calc.dataAdmissao)}</span></div>
                  <div><span className="text-muted-foreground">Tempo:</span> <span className="font-medium text-slate-800">{calc.anosServico ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Dias aviso:</span> <span className="font-medium text-slate-800 tabular-nums">{calc.diasAviso ?? 0}{calc.diasExtras ? ` (+${calc.diasExtras})` : ''}</span></div>
                  <div><span className="text-muted-foreground">Salário:</span> <span className="font-medium text-slate-800 tabular-nums">{fmt(calc.salarioBase)}</span></div>
                  <div><span className="text-muted-foreground">Modalidade:</span> <span className={`font-semibold ${tipo === 'empregador_indenizado' ? 'text-red-700' : 'text-blue-700'}`}>{fmtTipoLabel(tipo)}</span></div>
                  <div className="sm:col-span-1"><span className="text-muted-foreground">Data desligamento:</span> <span className="font-medium text-slate-800 tabular-nums">{fmtData(dataDesligamento)}</span></div>
                </div>
              </div>

              {/* COMPOSIÇÃO PERCENTUAL — barra horizontal stacked */}
              {composicao.length > 0 && totalBruto > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-md bg-blue-100 flex items-center justify-center"><BarChart3 className="h-3.5 w-3.5 text-blue-600" /></div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Composição das Verbas Brutas</h4>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">Total: {fmt(totalBruto)}</span>
                  </div>
                  <div className="flex h-7 rounded-md overflow-hidden border border-slate-200 shadow-inner">
                    {composicao.map(c => {
                      const pct = (c.value / totalBruto) * 100;
                      return (
                        <div
                          key={c.key}
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                          className="h-full transition-all hover:brightness-110"
                          title={`${c.label}: ${fmt(c.value)} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 text-[10px]">
                    {composicao.map(c => {
                      const pct = (c.value / totalBruto) * 100;
                      return (
                        <div key={c.key} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                          <span className="text-slate-700">{c.label}</span>
                          <span className="text-slate-400 tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bloco verbas a pagar (com ícone no header) */}
              {pv && (
                <div className="rounded-xl border-2 border-emerald-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-200">
                    <div className="h-7 w-7 rounded-md bg-emerald-500/15 flex items-center justify-center"><TrendingUp className="h-3.5 w-3.5 text-emerald-700" /></div>
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Verbas Rescisórias (a pagar)</h4>
                    <span className="ml-auto text-xs font-bold text-emerald-700 tabular-nums">{fmt(pv.totalBruto ?? pv.total)}</span>
                  </div>
                  <div className="divide-y divide-emerald-50/80 text-sm">
                    <div className="flex justify-between px-4 py-2"><span className="text-slate-700">Saldo de salário <span className="text-[10px] text-slate-400 ml-1">({pv.diasTrabalhadosMes}/{pv.diasReaisMes || 30}d)</span></span><span className="font-semibold tabular-nums">{fmt(pv.saldoSalario)}</span></div>
                    {parseFloat(pv.avisoPrevioIndenizado || '0') > 0 && (
                      <div className="flex justify-between px-4 py-2"><span className="text-slate-700">Aviso prévio indenizado <span className="text-[10px] text-slate-400">(Lei 12.506)</span></span><span className="font-semibold tabular-nums">{fmt(pv.avisoPrevioIndenizado)}</span></div>
                    )}
                    <div className="flex justify-between px-4 py-2"><span className="text-slate-700">13º proporcional <span className="text-[10px] text-slate-400">({pv.meses13o}/12)</span></span><span className="font-semibold tabular-nums">{fmt(pv.decimoTerceiroProporcional)}</span></div>
                    <div className="flex justify-between px-4 py-2"><span className="text-slate-700">Férias proporcionais + 1/3 <span className="text-[10px] text-slate-400">({pv.mesesFerias}/12)</span></span><span className="font-semibold tabular-nums">{fmt(pv.totalFerias)}</span></div>
                    {parseFloat(pv.feriasVencidas || '0') > 0 && (
                      <div className="flex justify-between px-4 py-2 bg-red-50/50"><span className="text-red-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Férias vencidas + 1/3 <span className="text-[10px] text-red-500">(Art. 137 CLT — {pv.periodosVencidos} per.)</span></span><span className="font-semibold text-red-700 tabular-nums">{fmt(pv.feriasVencidas)}</span></div>
                    )}
                    {parseFloat(pv.multaFGTS || '0') > 0 && (
                      <div className="flex justify-between px-4 py-2"><span className="text-slate-700">Multa 40% FGTS</span><span className="font-semibold tabular-nums">{fmt(pv.multaFGTS)}</span></div>
                    )}
                    <div className="flex justify-between px-4 py-2.5 bg-emerald-50 border-t-2 border-emerald-200"><span className="font-bold text-emerald-800">Total bruto</span><span className="font-bold text-emerald-800 tabular-nums">{fmt(pv.totalBruto ?? pv.total)}</span></div>
                  </div>
                </div>
              )}

              {/* Bloco descontos legais (com ícone) */}
              {pv && parseFloat(pv.totalDescontos || '0') > 0 && (
                <div className="rounded-xl border-2 border-red-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-200">
                    <div className="h-7 w-7 rounded-md bg-red-500/15 flex items-center justify-center"><ArrowDown className="h-3.5 w-3.5 text-red-700" /></div>
                    <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide">Descontos Legais e da Folha</h4>
                    <span className="ml-auto text-xs font-bold text-red-700 tabular-nums">– {fmt(pv.totalDescontos)}</span>
                  </div>
                  <div className="divide-y divide-red-50/80 text-sm">
                    {([
                      ['descontoINSS', 'INSS', 'sobre saldo + 13º'],
                      ['descontoIRRF', 'IRRF', 'sobre saldo + 13º'],
                      ['descontoPensao', 'Pensão Alimentícia', null],
                      ['descontoSindical', 'Contribuição Sindical', null],
                      ['descontoFaltasAtrasos', 'Faltas / Atrasos', 'do mês'],
                      ['descontoConvenios', 'Convênios', 'aprovados'],
                      ['descontoEpis', 'EPIs', 'aprovados'],
                      ['descontoVales', 'Vales / Adiantamentos', null],
                      ['descontoOutros', 'Outros', 'aprovados RH'],
                    ] as const).map(([k, label, sub]) => {
                      const v = parseFloat(String((pv as any)[k] || '0'));
                      if (v <= 0) return null;
                      return (
                        <div key={k} className="flex justify-between px-4 py-2">
                          <span className="text-red-700">{label}{sub && <span className="text-[10px] text-red-400 ml-1">({sub})</span>}</span>
                          <span className="font-semibold text-red-700 tabular-nums">– {fmt(v)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between px-4 py-2.5 bg-red-50 border-t-2 border-red-200"><span className="font-bold text-red-800">Subtotal Descontos</span><span className="font-bold text-red-800 tabular-nums">– {fmt(pv.totalDescontos)}</span></div>
                  </div>
                </div>
              )}

              {/* Card VERDE: TOTAL LÍQUIDO RESCISÃO (com badge prazo) */}
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-5 shadow-lg shadow-green-600/20">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-green-100 tracking-wider">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Oficial — TRCT
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">TOTAL LÍQUIDO RESCISÃO</h3>
                    <p className="text-[10px] text-green-100/80 mt-0.5">Verbas Brutas − Descontos Legais (inclui ajustes operacionais)</p>
                  </div>
                  <span className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums whitespace-nowrap">{fmt(oficialLiq)}</span>
                </div>
                {pv?.dataLimitePagamento && (
                  <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-1.5 text-[11px] text-white">
                    <CalendarDays className="h-3.5 w-3.5 text-green-100" />
                    <span className="font-semibold">Prazo pagamento:</span>
                    <span className="tabular-nums">{fmtData(pv.dataLimitePagamento)}</span>
                    <span className="text-green-100/80 ml-1">(Art. 477 §6º CLT)</span>
                  </div>
                )}
              </div>

              {/* Card ROXO: RESCISÃO COMPLEMENTAR */}
              {pc && (
                <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 overflow-hidden shadow-md shadow-violet-300/20">
                  <div className="flex items-start justify-between gap-3 p-4 border-b border-violet-200 bg-white/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-violet-700 tracking-wider">
                        <ShieldAlert className="h-3.5 w-3.5" /> Uso Interno
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-violet-900 mt-0.5">Rescisão Complementar</h3>
                      <p className="text-[10px] text-violet-700/90 mt-0.5">
                        Calculada sobre o complemento de {fmt(pc.baseComplemento)}/mês — não inclui FGTS, multa 40%, VR ou médias. Não substitui o TRCT.
                      </p>
                    </div>
                    <span className="text-xl sm:text-2xl font-extrabold text-violet-700 whitespace-nowrap tabular-nums">{fmt(pc.total)}</span>
                  </div>
                  <div className="p-3">
                    <div className="bg-white rounded-md border border-violet-200 divide-y divide-violet-100 text-xs">
                      {parseFloat(pc.saldoSalario || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Saldo de Salário ({pc.diasTrabalhadosMes || '?'}d)</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.saldoSalario)}</span></div>
                      )}
                      {parseFloat(pc.feriasProporcional || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Férias Proporcionais ({pc.mesesFerias}/12)</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.feriasProporcional)}</span></div>
                      )}
                      {parseFloat(pc.tercoConstitucional || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">1/3 Constitucional</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.tercoConstitucional)}</span></div>
                      )}
                      {parseFloat(pc.feriasVencidas || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Férias Vencidas{pc.periodosVencidos ? ` (${pc.periodosVencidos})` : ''}</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.feriasVencidas)}</span></div>
                      )}
                      {parseFloat(pc.feriasVencidasTerco || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">1/3 Férias Vencidas</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.feriasVencidasTerco)}</span></div>
                      )}
                      {parseFloat(pc.decimoTerceiroProporcional || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">13º Proporcional ({pc.meses13o}/12)</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.decimoTerceiroProporcional)}</span></div>
                      )}
                      {parseFloat(pc.avisoPrevioIndenizado || '0') > 0 && (
                        <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Aviso Prévio Indenizado</span><span className="font-semibold text-violet-800 tabular-nums">{fmt(pc.avisoPrevioIndenizado)}</span></div>
                      )}
                      <div className="flex justify-between px-3 py-2 bg-violet-100 font-bold">
                        <span className="text-violet-900">TOTAL COMPLEMENTAR</span>
                        <span className="text-violet-900 tabular-nums">{fmt(pc.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Card PRETO: TOTAL GERAL (Oficial + Complementar) */}
              {pc && (
                <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-black rounded-xl p-5 border-2 border-slate-700 shadow-xl shadow-slate-900/30 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                  <div className="relative flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-400 tracking-wider">
                        <Flame className="h-3.5 w-3.5" /> Custo Total da Saída
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">TOTAL GERAL (Oficial + Complementar)</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Soma do TRCT oficial com o cálculo interno sobre o complemento</p>
                    </div>
                    <span className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums whitespace-nowrap">{fmt(totalGeral)}</span>
                  </div>
                  <div className="relative mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-400" /><span className="text-slate-300">Oficial:</span><span className="text-white font-semibold tabular-nums ml-auto">{fmt(oficialLiq)}</span></div>
                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /><span className="text-slate-300">Complementar:</span><span className="text-white font-semibold tabular-nums ml-auto">{fmt(complTot)}</span></div>
                  </div>
                </div>
              )}

              {/* FGTS estimado (informativo) */}
              {pv?.fgtsEstimado && parseFloat(String(pv.fgtsEstimado)) > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-[11px] text-blue-800">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>FGTS estimado no período ({pv.mesesTotais || 0} meses): <span className="font-bold tabular-nums">{fmt(pv.fgtsEstimado)}</span> — informativo, depositado mensalmente.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé sticky */}
        {calc && (
          <div className="border-t bg-slate-50 px-4 sm:px-6 py-3 shrink-0 flex flex-wrap justify-between items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onAbrirRaioX(row.id)}>
              <Stethoscope className="h-3.5 w-3.5 mr-1.5" /> Abrir Raio-X
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1.5" /> Imprimir / PDF
              </Button>
              <Button size="sm" variant="default" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
