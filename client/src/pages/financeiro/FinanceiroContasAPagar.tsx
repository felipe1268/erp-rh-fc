import { useState, useMemo, useEffect, Fragment, type ReactNode } from "react";
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
  ChevronLeft, ChevronRight, CreditCard, Banknote, ArrowLeftRight, Clock, Hash, Tag,
  Users, Truck, Briefcase, Scale, Package, Receipt, Wallet,
  Download, Copy, TrendingDown, TrendingUp, Zap, Activity, X,
  Eye, ExternalLink, History, Building2, Paperclip, Hash as HashIcon, Info,
  Trash2, RotateCcw, Pencil, Loader2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
// Rev. 1626 — single source of truth para origens financeiras
import {
  ORIGEM_LABELS, ORIGEM_ICONS, ORIGEM_COLORS,
  consolidateSubtype, unitLabelFor,
} from "@/lib/financialOrigins";
// Rev. 3147 — fonte única das projeções + TRAVA "só real" (esconde o seletor
// Efetivo/Projeção; o backend já não devolve projeções com a trava ligada).
import { isProjecaoOrigem, FINANCEIRO_SOMENTE_REAL } from "@shared/financeiroProjecao";
// Rev. 4070 — diálogo de pagamento consolidado por fornecedor/ciclo (cheque auto-dividido em N parcelas)
import PagarConsolidadoDialog from "./PagarConsolidadoDialog";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function KV({ label, children, highlight }: { label: string; children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200/80 bg-white"}`}>
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</div>
      <div className={`text-sm leading-tight mt-0.5 break-words ${highlight ? "font-bold text-amber-900" : "font-medium text-slate-800"}`}>{children}</div>
    </div>
  );
}

// Rev. 4561 — Seção temática do modal "Detalhe do Título" (layout lúdico)
function DetSection({ icon, title, tint, children }: { icon: ReactNode; title: string; tint: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 ${tint}`}>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-white/70 shadow-sm">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

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

// helper: adiciona N meses a uma data ISO (YYYY-MM-DD)
function addMonthsISO(dateISO: string, n: number): string {
  if (!dateISO) return "";
  const [y, m, d] = dateISO.split("-").map(Number);
  const nd = new Date(y, m - 1 + n, d);
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
}

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
  if (c.origemModulo === "pagamento_pj" && c.origemId) return `PJ-${c.origemId}`;
  if (c.origemModulo === "frota" && c.origemId) return `FROTA-${c.origemId}`;
  if (c.origemModulo === "terceiros" && c.origemId) return `MED-${c.origemId}`;
  if (c.origemModulo === "tributario") return `TRIB${c.origemId ? "-" + c.origemId : ""}`;
  if (c.origemModulo === "cartao_fatura" && c.origemId) return `CARTÃO-${c.origemId}`;
  if (c.origemModulo === "beneficios" && c.origemId) return `BEN-${c.origemId}`;
  if (c.origemModulo === "almoxarifado" && c.origemId) return `ALM-${c.origemId}`;
  if (c.origemId) return `#${c.origemId}`;
  return "—";
}

// Rev. 1629 — Classificação Efetivo × Projeção
// Projeção = forecast vindo de Planejamento (sem fato gerador). Tudo o mais é Efetivo.
// Origens forecast (sem fato gerador): cronograma e PCP de compras vindo do Planejamento.
// Nota: planejamento_medicao é gravada como tipo='receita' pelo bridge, então não chega aqui;
// excluída para evitar falsa expectativa de filtro.
// Rev. 3147 — set movido p/ shared/financeiroProjecao (fonte única client+server).
function isProjecao(c: any): boolean {
  return isProjecaoOrigem(c?.origemModulo);
}

// Rev. 1629c — Remove prefixos redundantes de OC/OS/MED/etc da descrição,
// já que o nº aparece em coluna dedicada. Ex.:
//   "OC OC-2026-0010 — Fornecedor X"   →  "Fornecedor X"
//   "OC #OC-2026-0002 - Propel"        →  "Propel"
//   "MED-2026-012 — Empreiteira Y"     →  "Empreiteira Y"
function stripOcPrefix(text: string): string {
  if (!text) return text;
  // Match: opcional "OC "/"OS "/etc + opcional "#" + código (OC-2026-0010|MED-123|...) + separador
  // Só remove se houver TEXTO após o separador (preserva descrições que são só o nº)
  const re = /^\s*(?:(?:OC|OS|MED|SC|NF|PO|RC|RPS|FOLHA|PJ|FROTA|TRIB|BEN|ALM)\s+)?#?\s*[A-Z]{2,5}[\s-]+\d{2,4}[\s/-]+\d+\s*[—–\-:]\s+(?=\S)/i;
  let s = text.trim();
  for (let i = 0; i < 2; i++) {
    const next = s.replace(re, "").trim();
    if (next === s || !next) break;
    s = next;
  }
  return s || text.trim();
}

// Rev. 1619 — Descrição com fallback inteligente
// Rev. 2396 — Concatena nome do fornecedor (quando preenchido no lançamento)
// pra dar contexto na lista: "PGTO FORNECEDOR — Construtora XPTO Ltda".
function describeEntry(c: any): string {
  const fornec = (c.fornecedorNome ?? "").trim();
  const raw = (c.descricao ?? "").trim();
  const desc = stripOcPrefix(raw);
  const base = (() => {
    if (desc && desc !== "—") return desc;
    const orig = stripOcPrefix((c.origemDescricao ?? "").trim());
    if (orig) return orig;
    if (c.contaNome && c.obraNome) return `${c.contaNome} — ${c.obraNome}`;
    if (c.contaNome) return c.contaNome;
    if (c.obraNome) return c.obraNome;
    if (c.origemModulo) return `Lançamento ${ORIGEM_LABELS[c.origemModulo] ?? c.origemModulo}`;
    return "—";
  })();
  if (fornec && !base.toLowerCase().includes(fornec.toLowerCase())) {
    return `${base} — ${fornec}`;
  }
  return base;
}

// Rev. 1619 — Categoria (plano de contas) + fallback por origem
function categoriaFor(c: any): string {
  if (c.contaNome && String(c.contaNome).trim()) return c.contaNome;
  return ORIGEM_LABELS[c.origemModulo] ?? "Sem categoria";
}

// Rev. 4078 — Antes existiam 3 selos (FD Cliente / FD / FD Terceiro) pros 3 valores
// crus de modalidade_fd, mas na prática só existem 2 conceitos de negócio: o valor
// PODE ou NÃO ser descontado do contrato da FC. `fd_fc` e `fd_terceiro` são o MESMO
// conceito (o segundo só é o nome que `fd_fc` ganha quando a OC nasce de uma
// cotação — ver compras.ts) e por isso viram um selo único. ZERO mudança nos valores
// gravados no banco — só a camada de exibição foi unificada/renomeada.
function fdBadgeInfo(c: any): { label: string; cls: string; title: string } | null {
  const m = c?.modalidadeFd;
  if (m === "fd_cliente") {
    return {
      label: "FD Fora do Contrato",
      cls: "bg-blue-100 text-blue-700 border-blue-200",
      title: "Faturamento Direto — Fora do Contrato: o cliente paga direto ao fornecedor e esse valor NÃO é descontado do seu contrato (é adicional, fora do escopo contratado).",
    };
  }
  if (m === "fd_fc" || m === "fd_terceiro") {
    return {
      label: "FD Abate Contrato",
      cls: "bg-amber-100 text-amber-700 border-amber-200",
      title: "Faturamento Direto — Abate Contrato: o cliente continua pagando direto ao fornecedor, mas esse valor É descontado do seu contrato (dentro do escopo já contratado).",
    };
  }
  return null;
}

// Rev. 4078 — Legenda explicativa dos 2 tipos de FD, exibida em popover ao lado do
// filtro (clique OU hover, funciona em mobile também). Fonte única de verdade
// textual reaproveitada pelo popover e pelos tooltips dos selos (fdBadgeInfo).
const FD_LEGENDA = [
  { label: "FD Fora do Contrato", cls: "bg-blue-100 text-blue-700 border-blue-200", desc: "Cliente paga direto ao fornecedor. NÃO desconta do seu contrato — é valor adicional, fora do escopo contratado." },
  { label: "FD Abate Contrato", cls: "bg-amber-100 text-amber-700 border-amber-200", desc: "Cliente paga direto ao fornecedor. DESCONTA do seu contrato — o valor já está dentro do escopo contratado." },
] as const;

function FdLegendaPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 hover:underline underline-offset-2"
          title="O que é FD Fora do Contrato x FD Abate Contrato?"
        >
          <Info className="w-3.5 h-3.5" />
          O que é FD?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="text-xs font-semibold text-slate-700 mb-2">Faturamento Direto (FD) — 2 tipos</p>
        <div className="space-y-2.5">
          {FD_LEGENDA.map((item) => (
            <div key={item.label} className="flex gap-2">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 h-fit ${item.cls}`}>
                {item.label}
              </span>
              <p className="text-[11px] text-slate-600 leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FdBadge({ c }: { c: any }) {
  const info = fdBadgeInfo(c);
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold border shrink-0 ${info.cls}`}
      title={info.title}
    >
      {info.label}
    </span>
  );
}

// Rev. 1625/1626 — consolidateSubtype agora vive em @/lib/financialOrigins
const CONSOLIDATE_MIN = 3; // só agrupa quando há ≥ N entries do mesmo subtipo
const CONSOLIDATE_MODE_KEY = "fc_ap_consolidateMode_v1";

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

// Rev. 1627 — sempre fatiar para "YYYY-MM-DD" antes de parsear:
// timestamps PG (`"2026-04-22 14:44:06.518812"`) quebram `new Date()` no iOS Safari
// com a mensagem nativa "The string did not match the expected pattern."
function getMesFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

export default function FinanceiroContasAPagar() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  // Rev. 4069 — "Ano todo": alternativa explícita ao mês único. Antes, a busca
  // por texto ignorava silenciosamente o mês selecionado e trazia o ano
  // inteiro sem avisar; agora o mês SEMPRE restringe a lista (inclusive com
  // busca ativa) a menos que o usuário ligue este toggle.
  const [verAnoTodo, setVerAnoTodo] = useState(false);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pendentes");
  // Rev. 4576 — cards de KPI viram filtros clicáveis (toggle). Quando ativo,
  // tem precedência sobre as pills A Pagar/Pagos/Todos (statusFilter).
  const [filtroKpi, setFiltroKpi] = useState<null | "aberto_acum" | "a_pagar" | "vencidas" | "pago">(null);
  const toggleKpi = (k: "aberto_acum" | "a_pagar" | "vencidas" | "pago") =>
    setFiltroKpi(prev => (prev === k ? null : k));
  // Rev. 4077 — Filtro "FD" (Faturamento Direto): cliente/terceiro/fc x normal.
  const [fdFilter, setFdFilter] = useState<"all" | "fd_fora" | "fd_abate" | "normal">("all");
  // Rev. 1629 — Separação Efetivo × Projeção (APQC PCF 8.7 / PMBOK / Brealey-Myers cap. 30):
  // dívida incorrida (Compras, Folha, PJ, Benefícios, Frota, Parceiros, Almox, Medição, Seguro)
  // não pode dividir tela com forecast de cronograma. Default = Efetivo.
  const [naturezaFilter, setNaturezaFilter] = useState<"efetivo" | "projecao" | "todos">("efetivo");
  const [showPay, setShowPay] = useState<any | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hoje.toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  // Rev. 2540 — conta bancária na baixa (puxa a do lançamento; permite alterar)
  const [contaBancariaId, setContaBancariaId] = useState<number | null>(null);
  // Rev. 2655 — baixa detalhada: valor + juros − descontos + outros, observações, comprovante e cheque
  const [valorPagar, setValorPagar] = useState("");
  const [jurosPay, setJurosPay] = useState("");
  const [descontosPay, setDescontosPay] = useState("");
  const [outrosPay, setOutrosPay] = useState("");
  const [obsPay, setObsPay] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");
  const [comprovanteNome, setComprovanteNome] = useState("");
  const [uploadingComp, setUploadingComp] = useState(false);
  const [chequeTipo, setChequeTipo] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeBanco, setChequeBanco] = useState("");
  const [chequeAgencia, setChequeAgencia] = useState("");
  const [chequeConta, setChequeConta] = useState("");
  const [chequeTitular, setChequeTitular] = useState("");
  const [chequeDataEmissao, setChequeDataEmissao] = useState("");
  const [chequeDataBomPara, setChequeDataBomPara] = useState("");
  // Rev. 4529 — Cheque próprio na baixa: em quantas vezes + auto-registro no Controle de Cheques
  const [chequeQtd, setChequeQtd] = useState("1");
  const [chequeNumIni, setChequeNumIni] = useState("");
  const [chequePrimVenc, setChequePrimVenc] = useState("");
  const [chequeStatusIni, setChequeStatusIni] = useState("pendente");
  const [chequeSubtipo, setChequeSubtipo] = useState<"empresa" | "terceiros">("empresa");
  // Rev. 4096 — Cheque de Terceiro (Cheques Recebidos): seleção multi-cheque na baixa avulsa
  const [chequesTerceiroSelAvulso, setChequesTerceiroSelAvulso] = useState<number[]>([]);
  // Rev. 1620 — seleção em lote (Onda 2)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [bulkDataPagamento, setBulkDataPagamento] = useState(hoje.toISOString().split("T")[0]);
  const [bulkFormaPagamento, setBulkFormaPagamento] = useState("pix");
  // Rev. 1621 — modal de detalhes do título
  const [detailEntryId, setDetailEntryId] = useState<number | null>(null);
  // Rev. 2657 — EDITAR (lançamento manual) + ANEXAR documento
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    descricao: "", valorPrevisto: "", dataCompetencia: "", dataVencimento: "",
    contaNome: "", obraNome: "", formaPagamento: "", fornecedorNome: "", observacoes: "",
  });
  // Rev. 4587 — EDITAR com as mesmas informações de pagamento da tela "Pagar":
  // conta bancária + programação de cheques próprios (nº/parcelas) + cheques de terceiro.
  const [editContaBancariaId, setEditContaBancariaId] = useState<number | null>(null);
  const [editChequeQtd, setEditChequeQtd] = useState("1");
  const [editChequeNumIni, setEditChequeNumIni] = useState("");
  const [editChequePrimVenc, setEditChequePrimVenc] = useState("");
  const [editChequeBanco, setEditChequeBanco] = useState("");
  const [editChequeAgencia, setEditChequeAgencia] = useState("");
  const [editChequeConta, setEditChequeConta] = useState("");
  const [editChequesTerceiroSel, setEditChequesTerceiroSel] = useState<number[]>([]);
  const [showAnexo, setShowAnexo] = useState<any | null>(null);
  const [anexoUrl, setAnexoUrl] = useState("");
  const [anexoNome, setAnexoNome] = useState("");
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  // Rev. 1625 — consolidação visual de RH/Benefícios/PJ/Frota/Terceiros
  const [consolidateMode, setConsolidateMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(CONSOLIDATE_MODE_KEY);
    return v === null ? true : v === "1";
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONSOLIDATE_MODE_KEY, consolidateMode ? "1" : "0");
    }
  }, [consolidateMode]);
  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Rev. 4070 — grupo de fechamento por fornecedor (agrupado:true, grupoTipo:"fechamento_forn")
  // selecionado para o diálogo de "Pagar consolidado" (cheque auto-dividido em N parcelas).
  const [payGroupTarget, setPayGroupTarget] = useState<any | null>(null);

  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: detailEntryId ?? 0, companyId },
    { enabled: !!detailEntryId && !!companyId }
  );

  const { data: allContas, isLoading, refetch } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  // Rev. 4096 — alocar lote de cheques recebidos na baixa avulsa
  const alocarLoteMutAvulso = (trpc as any).chequesRecebidos?.alocarLote?.useMutation({
    onError: (e: any) => toast({
      title: "Baixa registrada, mas falha ao alocar cheques",
      description: `Cheques de terceiro NÃO foram marcados como Alocados: ${e.message}. Acesse Controle de Cheques Recebidos para alocar manualmente.`,
      variant: "destructive",
    }),
  });

  // Rev. 4529 — ao registrar baixa com cheque próprio, cria os N cheques no Controle de Cheques
  const criarChequesLoteMut = (trpc as any).cheques.criarManualLote.useMutation({
    onSuccess: (r: any) => {
      if (r?.criados > 0) {
        toast({ title: `${r.criados} cheque${r.criados !== 1 ? "s" : ""} cadastrado${r.criados !== 1 ? "s" : ""} no Controle de Cheques` });
      }
    },
    onError: (e: any) => toast({
      title: "Baixa registrada, mas falha ao criar cheques",
      description: `Os cheques NÃO foram cadastrados no Controle: ${e.message}`,
      variant: "destructive",
    }),
  });

  // Rev. 3743 — baixa via histórico (financial_entry_baixas): parcial ou total.
  const payMut = (trpc as any).financial.registrarBaixa.useMutation({
    onSuccess: (r: any) => {
      // Rev. 4096 — se forma=cheque_terceiro, alocar os cheques recebidos selecionados
      if (formaPagamento === "cheque" && chequeSubtipo === "terceiros" && chequesTerceiroSelAvulso.length && alocarLoteMutAvulso) {
        alocarLoteMutAvulso.mutate({
          companyId,
          ids: chequesTerceiroSelAvulso,
          fornecedorAlocadoNome: showPay?.fornecedorNome ?? undefined,
          entryId: showPay?.id ?? null,
        });
        setChequesTerceiroSelAvulso([]);
      }
      // Rev. 4529 — se forma=cheque próprio, criar N cheques no Controle de Cheques Emitidos
      if (formaPagamento === "cheque" && chequeSubtipo === "empresa" && companyId) {
        const qtd = Math.min(120, Math.max(1, parseInt(chequeQtd || "1", 10) || 1));
        const total = parseFloat(valorPagar || "0") + parseFloat(jurosPay || "0") - parseFloat(descontosPay || "0") + parseFloat(outrosPay || "0");
        if (total > 0 && qtd > 0) {
          const centsTotal = Math.round(total * 100);
          const base = Math.floor(centsTotal / qtd);
          const resto = centsTotal - base * qtd;
          const numIniNum = /^\d+$/.test(chequeNumIni.trim()) ? parseInt(chequeNumIni.trim(), 10) : null;
          const baseVenc = chequePrimVenc || dataPagamento || "";
          const parcelas = Array.from({ length: qtd }, (_, i) => ({
            valor: (base + (i === qtd - 1 ? resto : 0)) / 100,
            numeroCheque: numIniNum != null ? String(numIniNum + i) : (qtd === 1 ? chequeNumIni.trim() || undefined : undefined),
            parcela: `${i + 1}/${qtd}`,
            dataVencimento: addMonthsISO(baseVenc, i) || undefined,
          }));
          criarChequesLoteMut.mutate({
            companyId,
            fornecedorNome: showPay?.fornecedorNome ?? showPay?.descricao ?? undefined,
            contaBancariaId: contaBancariaId ?? undefined,
            bancoNome: chequeBanco || undefined,
            agencia: chequeAgencia || undefined,
            contaCorrenteRaw: chequeConta || undefined,
            status: (chequeStatusIni as any) || "pendente",
            parcelas,
          });
        }
      }
      toast({ title: r?.quitado ? "Título quitado!" : "Baixa parcial registrada!", description: r?.quitado ? undefined : `Saldo em aberto: ${formatBRL(Number(r?.saldo ?? 0))}` });
      setShowPay(null);
      refetch();
      if (detailEntryId) detailQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  // Rev. 3743 — histórico de baixas do título aberto no diálogo de pagamento
  const baixasQuery = (trpc as any).financial.getEntryBaixas.useQuery(
    { entryId: showPay?.id ?? 0, companyId },
    { enabled: !!companyId && !!showPay?.id }
  );

  // Rev. 4096 — cheques recebidos disponíveis (para baixa avulsa com "Cheque de Terceiro")
  const totalPagarNum = parseFloat(valorPagar || "0") + parseFloat(jurosPay || "0") - parseFloat(descontosPay || "0") + parseFloat(outrosPay || "0");
  const chequesDisponiveisAvulsoQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: totalPagarNum > 0 ? totalPagarNum : (showPay?.valorSaldo ?? showPay?.valor ?? 0) },
    { enabled: !!companyId && formaPagamento === "cheque" && chequeSubtipo === "terceiros" }
  );
  const chequesDisponiveisAvulso: any[] = chequesDisponiveisAvulsoQ?.data?.cheques ?? [];
  const totalSelecionadoAvulso = chequesDisponiveisAvulso
    .filter((c: any) => chequesTerceiroSelAvulso.includes(c.id))
    .reduce((s: number, c: any) => s + Number(c.valor), 0);
  const diffAvulso = Math.round((totalSelecionadoAvulso - (totalPagarNum > 0 ? totalPagarNum : (showPay?.valorSaldo ?? showPay?.valor ?? 0))) * 100) / 100;
  const estornoBaixaMut = (trpc as any).financial.estornarBaixaItem.useMutation({
    onSuccess: () => {
      toast({ title: "Baixa estornada!" });
      baixasQuery.refetch();
      refetch();
      if (detailEntryId) detailQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" }),
  });

  // Rev. 2657 — fornecedores e categorias para os datalists do modal EDITAR
  const { data: fornecedoresList } = (trpc as any).compras.listarFornecedores.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const fornecedoresOptions: { id: number; nome: string }[] = (() => {
    const list: any[] = Array.isArray(fornecedoresList) ? fornecedoresList : [];
    const seen = new Set<string>();
    const out: { id: number; nome: string }[] = [];
    for (const f of list) {
      const nome = (f.razaoSocial ?? f.nomeFantasia ?? f.nome ?? "").trim();
      const k = nome.toLowerCase();
      if (!nome || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: f.id, nome });
    }
    return out;
  })();
  const { data: accountsList } = (trpc as any).financial.getAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const categoriasOptions: string[] = (() => {
    const list: any[] = Array.isArray(accountsList) ? accountsList : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of list) {
      if (String(a.tipo) === "receita") continue;
      const nome = String(a.nome ?? "").trim();
      const k = nome.toLowerCase();
      if (!nome || seen.has(k)) continue;
      seen.add(k);
      out.push(nome);
    }
    return out;
  })();

  // Rev. 2657 — EDITAR lançamento manual (origem nula/recorrente, não pago)
  const updateEntryMut = (trpc as any).financial.updateEntry.useMutation({
    onSuccess: () => {
      toast({ title: "Lançamento atualizado!" });
      setShowEdit(null);
      refetch();
      if (detailEntryId) detailQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao editar", description: e.message, variant: "destructive" }),
  });
  function openEdit(c: any) {
    if (c.status === "pago" || c.status === "recebido") {
      toast({ title: "Lançamento já pago", description: "Estorne antes de editar.", variant: "destructive" });
      return;
    }
    // Rev. 2661 — títulos vinculados a outro módulo agora SÃO editáveis.
    // Quando a origem é Compras (OC), o save espelha fornecedor/vencimento/forma/obs
    // de volta na Ordem de Compra (ver banner informativo no modal).
    setEditForm({
      descricao: c.descricao ?? "",
      valorPrevisto: String(c.valorPrevisto ?? ""),
      dataCompetencia: (c.dataCompetencia ?? "").slice(0, 10),
      dataVencimento: (c.dataVencimento ?? "").slice(0, 10),
      contaNome: c.contaNome ?? "",
      obraNome: c.obraNome ?? "",
      formaPagamento: c.formaPagamento ?? "",
      fornecedorNome: c.fornecedorNome ?? "",
      observacoes: c.observacoes ?? "",
    });
    // Rev. 4587 — inicializa os campos de pagamento (iguais à tela "Pagar")
    setEditContaBancariaId(c.contaBancariaId ?? null);
    setEditChequeQtd("1");
    setEditChequeNumIni("");
    setEditChequePrimVenc((c.dataVencimento ?? "").slice(0, 10));
    setEditChequeBanco("");
    setEditChequeAgencia("");
    setEditChequeConta("");
    setEditChequesTerceiroSel([]);
    setShowEdit(c);
  }
  function handleSaveEdit() {
    if (!showEdit) return;
    if (!editForm.descricao.trim() || !editForm.valorPrevisto) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    const valor = parseFloat(String(editForm.valorPrevisto).replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    // Rev. 4587 — Poka-Yoke (bloqueio): cheque de terceiro exige ao menos 1 cheque selecionado
    if (editForm.formaPagamento === "cheque_terceiro" && editChequesTerceiroSel.length === 0) {
      toast({ title: "Selecione ao menos 1 cheque de terceiro", description: "Ou troque a forma de pagamento.", variant: "destructive" });
      return;
    }
    const entrySnapshot = showEdit;
    updateEntryMut.mutate({
      id: showEdit.id,
      companyId,
      descricao: editForm.descricao.trim(),
      valorPrevisto: valor,
      dataCompetencia: editForm.dataCompetencia || undefined,
      dataVencimento: editForm.dataVencimento || undefined,
      contaNome: editForm.contaNome.trim() || undefined,
      obraNome: editForm.obraNome.trim() || undefined,
      formaPagamento: editForm.formaPagamento || undefined,
      fornecedorNome: editForm.fornecedorNome.trim() || undefined,
      observacoes: editForm.observacoes.trim() || undefined,
      contaBancariaId: editContaBancariaId ?? null,
    }, {
      onSuccess: () => {
        // Rev. 4587 — programação de cheques a partir do EDITAR (sem baixar o título):
        // cheque próprio → cadastra os N cheques no Controle de Cheques (só se o Nº foi informado — Poka-Yoke contra duplicidade);
        // cheque de terceiro → aloca os cheques recebidos selecionados ao título.
        if (editForm.formaPagamento === "cheque" && editChequeNumIni.trim() && editChequePreview.length > 0) {
          criarChequesLoteMut.mutate({
            companyId,
            fornecedorNome: editForm.fornecedorNome.trim() || entrySnapshot?.fornecedorNome || entrySnapshot?.descricao || undefined,
            contaBancariaId: editContaBancariaId ?? undefined,
            bancoNome: editChequeBanco || undefined,
            agencia: editChequeAgencia || undefined,
            contaCorrenteRaw: editChequeConta || undefined,
            status: "pendente",
            parcelas: editChequePreview.map(p => ({
              valor: p.valor, numeroCheque: p.numeroCheque, parcela: p.parcela, dataVencimento: p.dataVencimento || undefined,
            })),
          });
        }
        if (editForm.formaPagamento === "cheque_terceiro" && editChequesTerceiroSel.length && alocarLoteMutAvulso) {
          alocarLoteMutAvulso.mutate({
            companyId,
            ids: editChequesTerceiroSel,
            fornecedorAlocadoNome: editForm.fornecedorNome.trim() || entrySnapshot?.fornecedorNome || undefined,
            entryId: entrySnapshot?.id ?? null,
          });
        }
      },
    });
  }

  // Rev. 4587 — pré-visualização dos cheques próprios programados no EDITAR (mesma regra da baixa:
  // total em centavos dividido em N, resto na última parcela; vencimentos mensais a partir do 1º).
  const editChequePreview = useMemo(() => {
    if (editForm.formaPagamento !== "cheque") return [] as any[];
    const qtd = Math.min(120, Math.max(1, parseInt(editChequeQtd || "1", 10) || 1));
    const total = parseFloat(String(editForm.valorPrevisto).replace(",", ".") || "0");
    if (!Number.isFinite(total) || total <= 0) return [] as any[];
    const centsTotal = Math.round(total * 100);
    const base = Math.floor(centsTotal / qtd);
    const resto = centsTotal - base * qtd;
    const numIniNum = /^\d+$/.test(editChequeNumIni.trim()) ? parseInt(editChequeNumIni.trim(), 10) : null;
    const baseVenc = editChequePrimVenc || editForm.dataVencimento || "";
    return Array.from({ length: qtd }, (_, i) => ({
      idx: i,
      valor: (base + (i === qtd - 1 ? resto : 0)) / 100,
      numeroCheque: numIniNum != null ? String(numIniNum + i).padStart(6, "0") : (qtd === 1 ? editChequeNumIni.trim() || "—" : "—"),
      parcela: `${i + 1}/${qtd}`,
      dataVencimento: addMonthsISO(baseVenc, i) || "",
    }));
  }, [editForm.formaPagamento, editForm.valorPrevisto, editForm.dataVencimento, editChequeQtd, editChequeNumIni, editChequePrimVenc]);

  // Rev. 4587 — cheques recebidos disponíveis para o EDITAR com "Cheque de Terceiro"
  const editValorNum = parseFloat(String(editForm.valorPrevisto).replace(",", ".") || "0");
  const editChequesTerceiroQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: editValorNum > 0 ? editValorNum : (showEdit?.valorPrevisto ?? 0) },
    { enabled: !!companyId && !!showEdit && editForm.formaPagamento === "cheque_terceiro" }
  );
  const editChequesTerceiroDisp: any[] = editChequesTerceiroQ?.data?.cheques ?? [];
  const editTotalTerceiroSel = editChequesTerceiroDisp
    .filter((c: any) => editChequesTerceiroSel.includes(c.id))
    .reduce((s: number, c: any) => s + Number(c.valor), 0);
  const editDiffTerceiro = Math.round((editTotalTerceiroSel - (editValorNum > 0 ? editValorNum : 0)) * 100) / 100;

  // Rev. 2657 — ANEXAR documento ao título (boleto/NF/foto)
  const anexarMut = (trpc as any).financial.anexarDocumento.useMutation({
    onSuccess: () => {
      toast({ title: "Documento anexado!" });
      setShowAnexo(null);
      refetch();
      if (detailEntryId) detailQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao anexar", description: e.message, variant: "destructive" }),
  });
  function openAnexo(c: any) {
    setAnexoUrl(c.anexoUrl ?? "");
    setAnexoNome(c.anexoNome ?? "");
    setShowAnexo(c);
  }
  const handleUploadAnexo = async (file: File) => {
    setUploadingAnexo(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await uploadCompMut.mutateAsync({ fileName: file.name, fileBase64: base64, contentType: file.type || "application/octet-stream" });
      setAnexoUrl(res.url);
      setAnexoNome(file.name);
      toast({ title: "Upload concluído", description: "Clique em Salvar para vincular ao título." });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingAnexo(false);
    }
  };
  function handleSaveAnexo() {
    if (!showAnexo) return;
    if (!anexoUrl) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    anexarMut.mutate({ id: showAnexo.id, companyId, anexoUrl, anexoNome: anexoNome || undefined });
  }

  // Rev. 2540 — contas bancárias para o seletor da baixa
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  // Rev. 4594 — dados da fatura de cartão vinculada ao título (identificação do
  // cartão + opções rápidas Total / Mínimo / Parcial no diálogo de pagamento).
  const { data: faturaCartao } = (trpc as any).cartao.faturaPorEntry.useQuery(
    { companyId, entryId: showPay?.id ?? 0 },
    { enabled: !!companyId && !!showPay && showPay.origemModulo === "cartao_fatura" }
  );
  // Sincroniza conta bancária do lançamento ao abrir o diálogo (permite alterar)
  useEffect(() => {
    setContaBancariaId(showPay?.contaBancariaId ?? null);
    // Rev. 2655/3743 — inicializa campos da baixa detalhada ao abrir; valor pré-preenche
    // com o SALDO EM ABERTO (previsto − já pago), editável p/ baixa parcial.
    const saldoAbertoInit = showPay
      ? Math.max(0, Math.round((Number(showPay.valorPrevisto ?? 0) - Number(showPay.valorRealizado ?? 0)) * 100) / 100)
      : 0;
    setValorPagar(showPay ? String(saldoAbertoInit) : "");
    setJurosPay("");
    setDescontosPay("");
    setOutrosPay("");
    setObsPay("");
    setComprovanteUrl("");
    setComprovanteNome("");
    setChequeTipo("");
    setChequeNumero("");
    setChequeBanco("");
    setChequeAgencia("");
    setChequeConta("");
    setChequeTitular("");
    setChequeDataEmissao("");
    setChequeDataBomPara("");
    setChequeQtd("1");
    setChequeNumIni("");
    setChequePrimVenc("");
    setChequeStatusIni("pendente");
    setChequeSubtipo("empresa");
  }, [showPay]);

  // Rev. 2655 — total da baixa = valor + juros − descontos + outros (±)
  const totalPagar = useMemo(() => {
    const n = (s: string) => { const x = parseFloat(String(s).replace(",", ".")); return Number.isFinite(x) ? x : 0; };
    return n(valorPagar) + n(jurosPay) - n(descontosPay) + n(outrosPay);
  }, [valorPagar, jurosPay, descontosPay, outrosPay]);

  // Rev. 4529 — preview dos cheques gerados (cheque próprio)
  const chequePreviewBaixa = useMemo(() => {
    if (formaPagamento !== "cheque" || chequeSubtipo !== "empresa") return [];
    const qtd = Math.min(120, Math.max(1, parseInt(chequeQtd || "1", 10) || 1));
    const total = parseFloat(valorPagar || "0") + parseFloat(jurosPay || "0") - parseFloat(descontosPay || "0") + parseFloat(outrosPay || "0");
    if (total <= 0 || qtd <= 0) return [];
    const centsTotal = Math.round(total * 100);
    const base = Math.floor(centsTotal / qtd);
    const resto = centsTotal - base * qtd;
    const numIniNum = /^\d+$/.test(chequeNumIni.trim()) ? parseInt(chequeNumIni.trim(), 10) : null;
    const baseVenc = chequePrimVenc || dataPagamento || "";
    return Array.from({ length: qtd }, (_, i) => ({
      idx: i + 1,
      valor: (base + (i === qtd - 1 ? resto : 0)) / 100,
      numeroCheque: numIniNum != null ? String(numIniNum + i).padStart(6, "0") : (qtd === 1 ? chequeNumIni.trim() : `—`),
      dataVencimento: addMonthsISO(baseVenc, i),
      parcela: `${i + 1}/${qtd}`,
    }));
  }, [formaPagamento, chequeSubtipo, chequeQtd, valorPagar, jurosPay, descontosPay, outrosPay, chequeNumIni, chequePrimVenc, dataPagamento]);

  // Rev. 3743 — payload da baixa (registrarBaixa). `valor` = principal aplicado ao título
  // (juros/descontos/outros vão separados, p/ registro). quitarTotal é injetado no caller.
  function baixaPayload() {
    const num = (s: string) => { const x = parseFloat(String(s).replace(",", ".")); return Number.isFinite(x) ? x : 0; };
    return {
      id: showPay.id, companyId,
      valor: num(valorPagar),
      data: dataPagamento || undefined,
      formaPagamento: formaPagamento || undefined,
      contaBancariaId,
      juros: jurosPay ? num(jurosPay) : undefined,
      descontos: descontosPay ? num(descontosPay) : undefined,
      outros: outrosPay ? num(outrosPay) : undefined,
      observacoes: obsPay || undefined,
      comprovanteUrl: comprovanteUrl || undefined,
      chequeTipo: formaPagamento === "cheque" ? (chequeTipo || undefined) : undefined,
      chequeNumero: formaPagamento === "cheque" ? (chequeNumero || undefined) : undefined,
      chequeBanco: formaPagamento === "cheque" ? (chequeBanco || undefined) : undefined,
      chequeAgencia: formaPagamento === "cheque" ? (chequeAgencia || undefined) : undefined,
      chequeConta: formaPagamento === "cheque" ? (chequeConta || undefined) : undefined,
      chequeTitular: formaPagamento === "cheque" ? (chequeTitular || undefined) : undefined,
      chequeDataEmissao: formaPagamento === "cheque" ? (chequeDataEmissao || undefined) : undefined,
      chequeDataBomPara: formaPagamento === "cheque" ? (chequeDataBomPara || undefined) : undefined,
    };
  }

  // Rev. 2655 — upload de comprovante (PDF/Word/imagem)
  const uploadCompMut = (trpc as any).financial.uploadComprovante.useMutation();
  const handleUploadComprovante = async (file: File) => {
    setUploadingComp(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await uploadCompMut.mutateAsync({ fileName: file.name, fileBase64: base64, contentType: file.type || "application/octet-stream" });
      setComprovanteUrl(res.url);
      setComprovanteNome(file.name);
      toast({ title: "Comprovante anexado!" });
    } catch (e: any) {
      toast({ title: "Erro ao anexar", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingComp(false);
    }
  };

  // Rev. 1620 — limpar seleção ao mudar mês/ano para evitar pagar item de outro escopo
  useEffect(() => { setSelectedIds(new Set()); }, [mesSel, ano, verAnoTodo]);

  const bulkPayMut = (trpc as any).financial.bulkUpdateStatus.useMutation({
    onSuccess: (r: any) => {
      toast({ title: `${r.updated} título(s) marcados como pagos!` });
      setShowBulkPay(false);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 2228 — Excluir lançamento (duplicidade) + Estornar pagamento
  const [showDelete, setShowDelete] = useState<any | null>(null);
  const [motivoDelete, setMotivoDelete] = useState("");
  const [showEstorno, setShowEstorno] = useState<any | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const deleteMut = (trpc as any).financial.deleteEntry.useMutation({
    onSuccess: () => {
      toast({ title: "Lançamento excluído!", description: "Operação registrada no log de auditoria." });
      setShowDelete(null); setMotivoDelete(""); refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  // Rev. 4508 — Cancelamento em lote de lançamentos selecionados
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [motivoBulkCancel, setMotivoBulkCancel] = useState("");
  const bulkCancelMut = (trpc as any).financial.cancelEntryBulk.useMutation({
    onSuccess: (r: any) => {
      toast({ title: `${r.cancelled} lançamento(s) cancelados com sucesso!`, description: "Operação registrada no log de auditoria." });
      setShowBulkCancel(false); setMotivoBulkCancel(""); setSelectedIds(new Set()); refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" }),
  });
  const estornoMut = (trpc as any).financial.estornarPagamento.useMutation({
    onSuccess: () => {
      toast({ title: "Pagamento estornado!", description: "Lançamento voltou para 'A Pagar'. Registrado no log de auditoria." });
      setShowEstorno(null); setMotivoEstorno(""); refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" }),
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

  // Rev. 4069 — escopo efetivo da tela: mês selecionado, OU ano inteiro quando
  // "Ano todo" está ligado. Toda busca/KPI/filtro deriva DAQUI, nunca mais de
  // allContas direto, pra garantir que o mês realmente restrinja a lista.
  const escopoData = useMemo(() => (verAnoTodo ? (allContas ?? []) : mesData), [verAnoTodo, allContas, mesData]);

  const hojeStr = hoje.toISOString().split("T")[0];

  // Rev. 4069 — Busca por texto (fornecedor/OC/conta/obra) SEMPRE respeita o
  // mês selecionado (ou o ano inteiro, se "Ano todo" estiver ligado); antes a
  // busca ignorava o mês e trazia o ano inteiro sem o usuário pedir isso.
  const filtered = useMemo(() => {
    // Rev. 4576 — filtro por card de KPI (precedência sobre as pills de status).
    // "Em Aberto (Acum.)" olha TODOS os meses do ano (mesma base do card);
    // os demais respeitam o escopo do mês/ano selecionado.
    let list = filtroKpi === "aberto_acum" ? (((allContas as any[]) ?? [])) : escopoData;
    if (filtroKpi === "aberto_acum" || filtroKpi === "a_pagar") {
      list = list.filter((c: any) => c.status !== "pago");
    } else if (filtroKpi === "vencidas") {
      list = list.filter((c: any) => c.status !== "pago" && c.dataVencimento && c.dataVencimento.slice(0, 10) < hojeStr);
    } else if (filtroKpi === "pago") {
      list = list.filter((c: any) => c.status === "pago");
    } else {
      if (statusFilter === "pendentes") list = list.filter((c: any) => c.status !== "pago");
      if (statusFilter === "pagos") list = list.filter((c: any) => c.status === "pago");
    }
    if (naturezaFilter === "efetivo") list = list.filter((c: any) => !isProjecao(c));
    else if (naturezaFilter === "projecao") list = list.filter((c: any) => isProjecao(c));
    if (origemFilter !== "all") list = list.filter((c: any) => c.origemModulo === origemFilter);
    if (fdFilter === "fd_fora") list = list.filter((c: any) => c?.modalidadeFd === "fd_cliente");
    else if (fdFilter === "fd_abate") list = list.filter((c: any) => c?.modalidadeFd === "fd_fc" || c?.modalidadeFd === "fd_terceiro");
    else if (fdFilter === "normal") list = list.filter((c: any) => !fdBadgeInfo(c));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        (c.descricao ?? "").toLowerCase().includes(q) ||
        (c.contaNome ?? "").toLowerCase().includes(q) ||
        (c.obraNome ?? "").toLowerCase().includes(q) ||
        (c.origemDescricao ?? "").toLowerCase().includes(q) ||
        (c.fornecedorNome ?? "").toLowerCase().includes(q) ||
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
  }, [escopoData, allContas, filtroKpi, statusFilter, naturezaFilter, origemFilter, fdFilter, search, hojeStr]);

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

  // Rev. 1629 — KPIs respeitam o escopo (Efetivo/Projeção/Todos) selecionado para evitar
  // que a tela mostre números de "dívida total" enquanto a lista oculta projeções.
  const escopoMes = useMemo(() => {
    if (naturezaFilter === "efetivo") return escopoData.filter((c: any) => !isProjecao(c));
    if (naturezaFilter === "projecao") return escopoData.filter(isProjecao);
    return escopoData;
  }, [escopoData, naturezaFilter]);
  const pendentes = escopoMes.filter((c: any) => c.status !== "pago");
  const pagos = escopoMes.filter((c: any) => c.status === "pago");
  const vencidos = pendentes.filter((c: any) => c.dataVencimento && c.dataVencimento < hojeStr);

  const totalMes = escopoMes.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalPago = pagos.reduce((s: number, c: any) => s + Number(c.valorRealizado ?? c.valorPrevisto ?? 0), 0);
  const totalPendente = pendentes.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalVencido = vencidos.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const projecoesOcultas = naturezaFilter === "efetivo" ? escopoData.filter(isProjecao).length : 0;

  // Rev. 2943 — "Em Aberto (Acumulado)": soma de TODOS os títulos não-pagos do ano
  // (todos os meses), não só do mês selecionado. Respeita o escopo Efetivo/Projeção/Todos
  // (Rev. 1629) para casar com os demais KPIs. "Vencido" = parcela do acumulado já em atraso.
  const acumuladoAberto = useMemo(() => {
    if (!allContas) return { total: 0, count: 0, vencido: 0 };
    let list = (allContas as any[]).filter((c: any) => c.status !== "pago");
    if (naturezaFilter === "efetivo") list = list.filter((c: any) => !isProjecao(c));
    else if (naturezaFilter === "projecao") list = list.filter((c: any) => isProjecao(c));
    let total = 0;
    let vencido = 0;
    for (const c of list) {
      const v = Number(c.valorPrevisto ?? 0);
      total += v;
      if (c.dataVencimento && c.dataVencimento.slice(0, 10) < hojeStr) vencido += v;
    }
    return { total, count: list.length, vencido };
  }, [allContas, naturezaFilter, hojeStr]);

  const origensDisponiveis = useMemo(() => {
    if (!escopoData.length) return [];
    const s = new Set(escopoData.map((c: any) => c.origemModulo).filter(Boolean));
    return Array.from(s) as string[];
  }, [escopoData]);

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
  // Rev. 1629 — respeita filtro Efetivo × Projeção × Todos para coerência com KPIs/lista.
  const cashProjection = useMemo(() => {
    const horizons = [7, 15, 30, 60, 90];
    const result: { dias: number; total: number; count: number }[] = [];
    if (!allContas) return horizons.map(d => ({ dias: d, total: 0, count: 0 }));
    const escopo = (allContas as any[]).filter(c => {
      if (naturezaFilter === "efetivo") return !isProjecao(c);
      if (naturezaFilter === "projecao") return isProjecao(c);
      return true;
    });
    const today = new Date(hojeStr);
    for (const dias of horizons) {
      const limite = new Date(today);
      limite.setDate(limite.getDate() + dias);
      const limiteStr = limite.toISOString().slice(0, 10);
      const items = escopo.filter(c =>
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
  }, [allContas, hojeStr, naturezaFilter]);

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
    () => filtered.filter((c: any) => c.status !== "pago" && !isProjecao(c)).map((c: any) => c.id as number),
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

  // Rev. 4575 — Poka-Yoke: linhas CONSOLIDADAS (Consolidado: ON) têm id string
  // ("grp:fech|...") e carregam os títulos reais em itensIds. Enviar o id do
  // grupo pro servidor quebrava o lote inteiro (zod espera number). Este helper
  // expande grupos nos ids numéricos reais e descarta qualquer id não-numérico.
  // Rev. 4576 — quando o filtro de KPI "Em Aberto (Acum.)" está ativo, a lista
  // (e a seleção) abrange o ANO INTEIRO; o lote deve resolver ids na mesma base,
  // senão títulos de outros meses seriam silenciosamente descartados do pagamento.
  const bulkPayBase = useMemo<any[]>(
    () => (filtroKpi === "aberto_acum" ? (((allContas as any[]) ?? [])) : escopoData),
    [filtroKpi, allContas, escopoData]
  );
  const expandToNumericIds = (rows: any[], extraFilter?: (c: any) => boolean): number[] => {
    const out = new Set<number>();
    for (const c of rows) {
      if (!selectedIds.has(c.id)) continue;
      if (extraFilter && !extraFilter(c)) continue;
      if (c.agrupado && Array.isArray(c.itensIds)) {
        for (const i of c.itensIds) { const n = Number(i); if (Number.isFinite(n)) out.add(n); }
      } else {
        const n = Number(c.id);
        if (Number.isFinite(n)) out.add(n);
      }
    }
    return Array.from(out);
  };

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
    a.download = `contas-a-pagar_${verAnoTodo ? "ano-todo" : MESES[mesSel - 1]}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `CSV exportado: ${rows.length} linhas` });
  };

  return (
    <DashboardLayout>
      {/* Rev. 2227 — Tela de Contas a Pagar agora ocupa a largura total
          disponível (antes capada em 1600px → coluna "Ações" cortava em telas
          médias/grandes). Coluna Ações vira sticky-right pra nunca clipar. */}
      <div className="w-full mx-auto px-4 py-6 space-y-5">

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
                {/* Rev. 4080 — "Ano todo" padronizado com Contas a Receber: pill ao lado do
                    ano (não mais uma barra full-width abaixo dos meses). */}
                <button
                  onClick={() => setVerAnoTodo((v) => !v)}
                  className={`ml-1 px-3 py-1 rounded-lg border text-xs font-semibold transition-all
                    ${verAnoTodo
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
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = !verAnoTodo && mesSel === num;
                return (
                  <button
                    key={m}
                    onClick={() => { setMesSel(num); setVerAnoTodo(false); }}
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

        {/* KPI Cards — Rev. 4576: clicáveis (toggle) p/ filtrar a lista de lançamentos */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card
            role="button" tabIndex={0}
            onClick={() => setFiltroKpi(null)}
            className={`border-0 shadow-sm border-l-4 border-l-gray-400 cursor-pointer transition-shadow hover:shadow-md ${filtroKpi === null ? "" : "opacity-70"}`}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Banknote className="w-3 h-3" />Total {verAnoTodo ? ano : MESES[mesSel-1]}</p>
              <p className="text-lg font-bold text-gray-800">{formatBRL(totalMes)}</p>
              {/* Rev. 3146 — contagem espelha o MESMO escopo (Efetivo/Projeção/Todos) do valor.
                  Antes usava mesData.length (todas) enquanto o valor somava só escopoMes → contagem
                  não batia com Pago+A Pagar. Agora escopoMes.length = pagos + pendentes. */}
              <p className="text-xs text-gray-400">
                {escopoMes.length} conta(s)
                {projecoesOcultas > 0 && (
                  <span className="text-violet-500"> · +{projecoesOcultas} em projeção</span>
                )}
                {filtroKpi !== null && <span className="text-blue-500"> · toque p/ limpar filtro</span>}
              </p>
            </CardContent>
          </Card>
          <Card
            role="button" tabIndex={0}
            onClick={() => toggleKpi("aberto_acum")}
            className={`border-0 shadow-sm border-l-4 border-l-indigo-500 cursor-pointer transition-shadow hover:shadow-md ${filtroKpi === "aberto_acum" ? "ring-2 ring-indigo-500 shadow-md" : filtroKpi ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Wallet className="w-3 h-3 text-indigo-500" />Em Aberto (Acum.)</p>
              <p className="text-lg font-bold text-indigo-700">{formatBRL(acumuladoAberto.total)}</p>
              <p className="text-xs text-gray-400">
                {filtroKpi === "aberto_acum" ? (
                  <span className="text-indigo-600 font-medium">Filtrando · toque p/ limpar</span>
                ) : (
                  <>
                    {acumuladoAberto.count} título(s) · todos os meses
                    {acumuladoAberto.vencido > 0 && (
                      <span className="text-red-500"> · {formatBRL(acumuladoAberto.vencido)} vencido</span>
                    )}
                  </>
                )}
              </p>
            </CardContent>
          </Card>
          <Card
            role="button" tabIndex={0}
            onClick={() => toggleKpi("a_pagar")}
            className={`border-0 shadow-sm border-l-4 border-l-orange-500 cursor-pointer transition-shadow hover:shadow-md ${filtroKpi === "a_pagar" ? "ring-2 ring-orange-500 shadow-md" : filtroKpi ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />A Pagar</p>
              <p className="text-lg font-bold text-orange-600">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-gray-400">{filtroKpi === "a_pagar" ? <span className="text-orange-600 font-medium">Filtrando · toque p/ limpar</span> : `${pendentes.length} pendente(s)`}</p>
            </CardContent>
          </Card>
          <Card
            role="button" tabIndex={0}
            onClick={() => toggleKpi("vencidas")}
            className={`border-0 shadow-sm border-l-4 border-l-red-500 cursor-pointer transition-shadow hover:shadow-md ${filtroKpi === "vencidas" ? "ring-2 ring-red-500 shadow-md" : filtroKpi ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(totalVencido)}</p>
              <p className="text-xs text-gray-400">{filtroKpi === "vencidas" ? <span className="text-red-600 font-medium">Filtrando · toque p/ limpar</span> : `${vencidos.length} em atraso`}</p>
            </CardContent>
          </Card>
          <Card
            role="button" tabIndex={0}
            onClick={() => toggleKpi("pago")}
            className={`border-0 shadow-sm border-l-4 border-l-green-500 cursor-pointer transition-shadow hover:shadow-md ${filtroKpi === "pago" ? "ring-2 ring-green-500 shadow-md" : filtroKpi ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Pago</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(totalPago)}</p>
              <p className="text-xs text-gray-400">{filtroKpi === "pago" ? <span className="text-green-600 font-medium">Filtrando · toque p/ limpar</span> : `${pagos.length} quitado(s)`}</p>
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
              {naturezaFilter !== "todos" && (
                <span className={`ml-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${naturezaFilter === "efetivo" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                  {naturezaFilter === "efetivo" ? "💰 Efetivo" : "📊 Projeção"}
                </span>
              )}
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
            {/* Rev. 1629 — Efetivo × Projeção (separação fundamental APQC/PMBOK/Brealey-Myers) */}
            {/* Rev. 3147 — com a TRAVA "só real" ligada o seletor some (o backend já
                não devolve projeções; mostrar "Projeção/Todos" traria tela vazia). */}
            {!FINANCEIRO_SOMENTE_REAL && (
            <div className="flex rounded-lg border border-violet-200 overflow-hidden" title="Efetivo = dívida real (OC, Folha, PJ, etc.). Projeção = forecast do cronograma.">
              {[
                ["efetivo","Efetivo","💰"],
                ["projecao","Projeção","📊"],
                ["todos","Todos","∑"],
              ].map(([v,l,ico]) => (
                <button key={v}
                  onClick={() => setNaturezaFilter(v as any)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 ${naturezaFilter === v ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"}`}>
                  <span>{ico}</span>{l}
                </button>
              ))}
            </div>
            )}
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
            {/* Rev. 4077/4078 — Filtro por Faturamento Direto (FD), pra isolar títulos que
                o cliente paga direto ao fornecedor. 2 categorias reais: "Fora do Contrato"
                (não desconta) e "Abate Contrato" (desconta) — ver fdBadgeInfo(). */}
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-amber-200 overflow-hidden" title="Filtra por Faturamento Direto (dinheiro que o cliente paga direto ao fornecedor)">
                {([
                  ["all", "Todos"],
                  ["fd_fora", "FD Fora do Contrato"],
                  ["fd_abate", "FD Abate Contrato"],
                  ["normal", "Sem FD"],
                ] as const).map(([v, l]) => (
                  <button key={v}
                    onClick={() => setFdFilter(v)}
                    className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${fdFilter === v ? "bg-amber-500 text-white" : "bg-white text-amber-700 hover:bg-amber-50"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <FdLegendaPopover />
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9 h-8 text-sm" placeholder="Buscar conta, OC/OS, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 text-xs gap-1" disabled={!filtered.length}>
              <Download className="w-3.5 h-3.5" />Exportar CSV
            </Button>
            {/* Rev. 1625 — Toggle Consolidar RH/Benefícios/Recorrentes */}
            <button
              onClick={() => { setConsolidateMode(v => !v); setExpandedGroups(new Set()); }}
              className={`h-8 text-xs px-3 rounded-md border inline-flex items-center gap-1.5 transition-colors ${
                consolidateMode
                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              title="Agrupa folha, vales, PJ, frota e medições em uma linha por mês"
            >
              <Users className="w-3.5 h-3.5" />
              {consolidateMode ? "Consolidado: ON" : "Consolidado: OFF"}
            </button>
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
              {/* Rev. 4508 — Cancelar/apagar em lote */}
              <Button size="sm" variant="ghost"
                className="bg-red-600 hover:bg-red-700 text-white border-0 h-8 text-xs gap-1"
                onClick={() => { setMotivoBulkCancel(""); setShowBulkCancel(true); }}>
                <Trash2 className="w-3.5 h-3.5" />Apagar selecionados
              </Button>
              <button onClick={() => setSelectedIds(new Set())}
                className="p-1.5 rounded hover:bg-blue-700 text-white" title="Limpar seleção">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Rev. 1629 — Banner explicativo do modo Projeção */}
        {naturezaFilter === "projecao" && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs text-violet-800 flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-violet-600" />
            <div>
              <strong>Projeção de caixa</strong> — lançamentos gerados automaticamente pelo cronograma e PCP do Planejamento (sem fato gerador ainda).
              São <em>previsões</em> usadas para fluxo de caixa futuro, não dívidas pagáveis (não selecionáveis para baixa). À medida que viram OC/Contrato/NF, migram para <em>Efetivo</em>.
            </div>
          </div>
        )}
        {/* Rev. 1629 — Aviso persistente: há projeções ocultas no modo Efetivo */}
        {projecoesOcultas > 0 && filtered.length > 0 && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-700 flex items-center justify-between gap-3">
            <span>📊 {projecoesOcultas} lançamento(s) de Projeção ocultos neste mês.</span>
            <button onClick={() => setNaturezaFilter("projecao")} className="font-medium underline hover:text-violet-900">Ver Projeção</button>
          </div>
        )}

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-500" />
              {verAnoTodo ? `Ano todo — ${ano}` : `${MESES[mesSel-1]} ${ano}`} — {filtered.length} conta(s)
              {naturezaFilter !== "todos" && (
                <span className={`ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full ${naturezaFilter === "efetivo" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                  {naturezaFilter === "efetivo" ? "💰 Efetivo" : "📊 Projeção"}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">{verAnoTodo ? `Nenhuma conta encontrada em ${ano}` : `Nenhuma conta em ${MESES[mesSel-1]} ${ano}`}</p>
                {(search || origemFilter !== "all" || statusFilter !== "all" || naturezaFilter !== "efetivo") && (
                  <button onClick={() => { setSearch(""); setOrigemFilter("all"); setStatusFilter("pendentes"); setNaturezaFilter("efetivo"); }}
                    className="mt-2 text-xs text-blue-600 hover:underline">Limpar filtros</button>
                )}
                {projecoesOcultas > 0 && (
                  <p className="mt-2 text-[11px] text-violet-600">
                    Há {projecoesOcultas} lançamento(s) de Projeção ocultos.
                    <button onClick={() => setNaturezaFilter("projecao")} className="ml-1 underline hover:text-violet-800">Ver Projeção</button>
                  </p>
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
                      <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Data</span></th>
                      <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />Nº OC/OS</span></th>
                      <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Descrição</th>
                      <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"><span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />Categoria</span></th>
                      <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Valor</th>
                      <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-[140px] sticky right-0 bg-gray-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => {
                      // Rev. 1625 — Dentro de cada bucket, monta linhas mistas: consolidadas + individuais
                      type Row =
                        | { kind: "single"; item: any }
                        | { kind: "group"; key: string; sub: string; label: string; origem: string; items: any[]; total: number; mesAno: string }
                        | { kind: "fechamento"; item: any };
                      const rows: Row[] = [];
                      // Rev. 4070 — linhas já pré-agrupadas pelo servidor por FORNECEDOR + CICLO DE
                      // FECHAMENTO (config no cadastro) saem do fluxo de consolidação visual acima
                      // (independem do toggle "Consolidado") e ganham render próprio com botão
                      // "Pagar consolidado".
                      const fechamentoItems = g.items.filter((c: any) => c?.agrupado && c?.grupoTipo === "fechamento_forn");
                      const itensNormais = g.items.filter((c: any) => !(c?.agrupado && c?.grupoTipo === "fechamento_forn"));
                      for (const c of fechamentoItems) rows.push({ kind: "fechamento", item: c });
                      if (consolidateMode) {
                        const groupMap = new Map<string, { sub: string; label: string; origem: string; items: any[]; mesAno: string }>();
                        const singles: any[] = [];
                        for (const c of itensNormais) {
                          const sub = consolidateSubtype(c);
                          const venc = (c.dataVencimento ?? "").slice(0, 7);
                          if (sub && venc) {
                            // Rev. 1625b — agrupa por origemBase (não origemModulo) para consolidar folha_rh+folha_clt
                            const k = `${sub.origemBase}|${sub.sub}|${venc}`;
                            if (!groupMap.has(k)) groupMap.set(k, { sub: sub.sub, label: sub.label, origem: sub.origemBase, items: [], mesAno: venc });
                            groupMap.get(k)!.items.push(c);
                          } else {
                            singles.push(c);
                          }
                        }
                        // Promove grupos com < CONSOLIDATE_MIN itens de volta para singles
                        for (const [k, gp] of groupMap.entries()) {
                          if (gp.items.length < CONSOLIDATE_MIN) {
                            singles.push(...gp.items);
                            groupMap.delete(k);
                          }
                        }
                        // Mistura na ordem original (por bucket já vem ordenado)
                        // Para manter ordem cronológica, ordena tudo por menor data
                        const allRows: Row[] = [];
                        for (const [k, gp] of groupMap.entries()) {
                          const total = gp.items.reduce((s, x) => s + Number(x.valorPrevisto ?? 0), 0);
                          allRows.push({ kind: "group", key: k, sub: gp.sub, label: gp.label, origem: gp.origem, items: gp.items, total, mesAno: gp.mesAno });
                        }
                        for (const it of singles) allRows.push({ kind: "single", item: it });
                        allRows.sort((a, b) => {
                          const da = a.kind === "single"
                            ? (a.item.dataVencimento || "9999-12-31").slice(0, 10)
                            : a.items.map(x => (x.dataVencimento || "9999-12-31").slice(0, 10)).sort()[0];
                          const db = b.kind === "single"
                            ? (b.item.dataVencimento || "9999-12-31").slice(0, 10)
                            : b.items.map(x => (x.dataVencimento || "9999-12-31").slice(0, 10)).sort()[0];
                          return da.localeCompare(db);
                        });
                        rows.push(...allRows);
                      } else {
                        for (const c of itensNormais) rows.push({ kind: "single", item: c });
                      }
                      const totalRowsCount = rows.reduce((n, r) => n + (r.kind === "group" ? r.items.length : r.kind === "fechamento" ? (r.item.itensIds?.length ?? 1) : 1), 0);
                      return (
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
                                {g.label} <span className="text-slate-400 font-normal ml-1">· {totalRowsCount} {totalRowsCount === 1 ? "conta" : "contas"}{consolidateMode && rows.length !== totalRowsCount ? ` em ${rows.length} ${rows.length === 1 ? "linha" : "linhas"}` : ""}</span>
                              </span>
                              <span className="text-xs font-bold text-slate-700">{formatBRL(g.total)}</span>
                            </div>
                          </td>
                        </tr>
                        {rows.map((r) => {
                          // ─── LINHA CONSOLIDADA POR FORNECEDOR/CICLO DE FECHAMENTO (Rev. 4070) ───
                          if (r.kind === "fechamento") {
                            const grp = r.item;
                            const isExpanded = expandedGroups.has(grp.id);
                            const itens: any[] = grp.itens ?? [];
                            const pagosCount = itens.filter((x: any) => x.status === "pago").length;
                            const vencCount = itens.filter((x: any) => x.dataVencimento && x.dataVencimento.slice(0,10) < hojeStr && x.status !== "pago").length;
                            return (
                              <Fragment key={grp.id}>
                                <tr
                                  onClick={() => toggleGroupExpand(grp.id)}
                                  className="border-b border-slate-100 cursor-pointer hover:bg-purple-50/40 bg-purple-50/20"
                                >
                                  <td className="px-2 py-2.5" />
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <div className="flex flex-col leading-tight">
                                      <span className="text-sm font-semibold tabular-nums text-slate-800">{fmtDateBR(grp.dataVencimento)}</span>
                                      <span className="text-[10px] text-slate-500">fechamento fornecedor</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <span className="text-xs font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                      {isExpanded ? <ChevronLeft className="w-3 h-3 rotate-90" /> : <ChevronRight className="w-3 h-3" />}
                                      {itens.length}×
                                    </span>
                                  </td>
                                  <td className="px-2 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold text-slate-900">{grp.fornecedorNome}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      {grp.descricao}
                                      {pagosCount > 0 && <span className="text-green-600"> · {pagosCount} pago(s)</span>}
                                      {vencCount > 0 && <span className="text-red-600"> · {vencCount} vencido(s)</span>}
                                    </p>
                                  </td>
                                  <td className="px-2 py-2.5">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border self-start bg-purple-50 text-purple-700 border-purple-200">
                                      <Users className="w-2.5 h-2.5" />
                                      Consolidado fornecedor
                                    </span>
                                  </td>
                                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                                    <span className="text-sm font-bold tabular-nums text-slate-900">{formatBRL(Number(grp.valorPrevisto ?? 0))}</span>
                                  </td>
                                  <td className="px-2 py-2.5 text-center">
                                    {pagosCount === itens.length ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                        <CheckCircle className="w-3 h-3" />Pago
                                      </span>
                                    ) : vencCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                        <AlertTriangle className="w-3 h-3" />Vencido
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                        <Clock className="w-3 h-3" />A Pagar
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="inline-flex items-center gap-1">
                                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title={isExpanded ? "Recolher" : "Expandir"}
                                        onClick={() => toggleGroupExpand(grp.id)}>
                                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                      </Button>
                                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-2.5 text-xs"
                                        onClick={() => setPayGroupTarget(grp)}>
                                        <CheckCircle className="w-3 h-3 mr-1" />Pagar consolidado
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && itens.map((c: any) => {
                                  const vencida = c.dataVencimento && c.dataVencimento.slice(0,10) < hojeStr && c.status !== "pago";
                                  const desc = describeEntry(c);
                                  return (
                                    <tr key={c.id}
                                      onClick={(e) => {
                                        const isInteractive = (e.target as HTMLElement).closest("button, [role=checkbox], input, a");
                                        if (isInteractive) return;
                                        setDetailEntryId(c.id);
                                      }}
                                      className="hover:bg-blue-50/30 cursor-pointer border-b border-slate-100">
                                      <td className="px-2 py-2" />
                                      <td className="px-2 py-2 whitespace-nowrap pl-6">
                                        <div className="flex items-center gap-2">
                                          <span className="text-purple-300 text-xs">└─</span>
                                          <span className={`text-xs tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-600"}`}>
                                            {fmtDateBR(c.dataVencimento)}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 whitespace-nowrap">
                                        <span className="text-[11px] font-mono text-slate-500">#{c.id}</span>
                                      </td>
                                      <td className="px-2 py-2 max-w-[220px]">
                                        {c.origemModulo === "pagamento_pj" ? (() => {
                                          const raw = c.descricao ?? c.origemDescricao ?? "";
                                          const sep = raw.includes(" — ") ? " — " : " - ";
                                          const nome = raw.split(sep)[0]?.trim() || raw;
                                          const contratoM = raw.match(/Contrato\s*#(\d+)/i);
                                          const contratoNum = contratoM ? contratoM[1] : null;
                                          const is2 = /2a\s*Medicao|2ª\s*Medi/i.test(raw);
                                          const is1 = /1a\s*Medicao|1ª\s*Medi/i.test(raw);
                                          const mesM = raw.match(/(\d{2})\/(\d{4})/);
                                          const mes = mesM ? `${mesM[1]}/${mesM[2]}` : null;
                                          return (
                                            <>
                                              <p className="text-xs font-semibold text-slate-800 truncate" title={nome}>{nome}</p>
                                              <div className="flex flex-wrap gap-1 mt-0.5">
                                                {(is1 || is2) && (
                                                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${is2 ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                                    {is2 ? "2ª Medição" : "1ª Medição"}
                                                  </span>
                                                )}
                                                {contratoNum && (
                                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                    Contrato #{contratoNum}
                                                  </span>
                                                )}
                                                {c.origemId && (
                                                  <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                                                    PJ-{c.origemId}
                                                  </span>
                                                )}
                                                {mes && (
                                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                                                    {mes}
                                                  </span>
                                                )}
                                              </div>
                                            </>
                                          );
                                        })() : (
                                          <p className="text-xs text-slate-700 truncate" title={desc}>{desc}</p>
                                        )}
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[11px] text-slate-500">{categoriaFor(c)}</span>
                                          <FdBadge c={c} />
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-right whitespace-nowrap">
                                        <span className={`text-xs font-semibold tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-700"}`}>
                                          {formatBRL(Number(c.valorPrevisto ?? 0))}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        {c.status === "pago" ? (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                            <CheckCircle className="w-2.5 h-2.5" />Pago
                                          </span>
                                        ) : vencida ? (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                            Vencido
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                            A Pagar
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                                          onClick={() => setDetailEntryId(c.id)}>
                                          <Eye className="w-3 h-3" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            );
                          }
                          // ─── LINHA CONSOLIDADA ───
                          if (r.kind === "group") {
                            const gp = r;
                            const ids = gp.items.map((x: any) => x.id as number);
                            const pendIds = gp.items.filter((x: any) => x.status !== "pago").map((x: any) => x.id as number);
                            const allSelected = pendIds.length > 0 && pendIds.every(id => selectedIds.has(id));
                            const someSelected = pendIds.some(id => selectedIds.has(id));
                            const isExpanded = expandedGroups.has(gp.key);
                            const pagosCount = gp.items.filter((x: any) => x.status === "pago").length;
                            const vencCount = gp.items.filter((x: any) => x.dataVencimento && x.dataVencimento.slice(0,10) < hojeStr && x.status !== "pago").length;
                            const minVenc = gp.items.map((x: any) => (x.dataVencimento || "").slice(0, 10)).filter(Boolean).sort()[0];
                            const Icon = ORIGEM_ICONS[gp.origem] ?? FileText;
                            const colorCls = ORIGEM_COLORS[gp.origem] ?? "bg-gray-50 text-gray-700 border-gray-200";
                            const mesLabel = gp.mesAno ? `${MESES[Number(gp.mesAno.slice(5,7))-1]}/${gp.mesAno.slice(0,4)}` : "";
                            const toggleGroupSelect = () => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (allSelected) pendIds.forEach(id => next.delete(id));
                                else pendIds.forEach(id => next.add(id));
                                return next;
                              });
                            };
                            return (
                              <Fragment key={gp.key}>
                                <tr
                                  onClick={() => toggleGroupExpand(gp.key)}
                                  className={`border-b border-slate-100 cursor-pointer hover:bg-indigo-50/40 ${someSelected ? "bg-blue-50/40" : "bg-indigo-50/20"}`}
                                >
                                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                    {pendIds.length > 0 && (
                                      <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={toggleGroupSelect}
                                        aria-label={`Selecionar todos os ${gp.label}`}
                                      />
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <div className="flex flex-col leading-tight">
                                      <span className="text-sm font-semibold tabular-nums text-slate-800">{fmtDateBR(minVenc)}</span>
                                      <span className="text-[10px] text-slate-500">consolidado · {mesLabel}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                      {isExpanded ? <ChevronLeft className="w-3 h-3 rotate-90" /> : <ChevronRight className="w-3 h-3" />}
                                      {gp.items.length}×
                                    </span>
                                  </td>
                                  <td className="px-2 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold text-slate-900">{gp.label}</p>
                                      <span className="text-xs text-slate-500">— {mesLabel}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      {gp.items.length} {unitLabelFor(gp.origem, gp.items.length)}
                                      {pagosCount > 0 && <span className="text-green-600"> · {pagosCount} pago(s)</span>}
                                      {vencCount > 0 && <span className="text-red-600"> · {vencCount} vencido(s)</span>}
                                    </p>
                                  </td>
                                  <td className="px-2 py-2.5">
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border self-start ${colorCls}`}>
                                      <Icon className="w-2.5 h-2.5" />
                                      {ORIGEM_LABELS[gp.origem] ?? gp.origem}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                                    <span className="text-sm font-bold tabular-nums text-slate-900">{formatBRL(gp.total)}</span>
                                  </td>
                                  <td className="px-2 py-2.5 text-center">
                                    {pagosCount === gp.items.length ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                        <CheckCircle className="w-3 h-3" />Pago
                                      </span>
                                    ) : pagosCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                        Parcial {pagosCount}/{gp.items.length}
                                      </span>
                                    ) : vencCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                        <AlertTriangle className="w-3 h-3" />Vencido
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                        <Clock className="w-3 h-3" />A Pagar
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="inline-flex items-center gap-1">
                                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title={isExpanded ? "Recolher" : "Expandir"}
                                        onClick={() => toggleGroupExpand(gp.key)}>
                                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                      </Button>
                                      {pendIds.length > 0 && (
                                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 text-xs"
                                          onClick={() => {
                                            setSelectedIds(new Set(pendIds));
                                            setShowBulkPay(true);
                                          }}>
                                          <CheckCircle className="w-3 h-3 mr-1" />Pagar lote
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {/* Filhas expandidas */}
                                {isExpanded && gp.items.map((c: any) => {
                                  const vencida = c.dataVencimento && c.dataVencimento.slice(0,10) < hojeStr && c.status !== "pago";
                                  const isSelected = selectedIds.has(c.id);
                                  const desc = describeEntry(c);
                                  return (
                                    <tr key={c.id}
                                      onClick={(e) => {
                                        const isInteractive = (e.target as HTMLElement).closest("button, [role=checkbox], input, a");
                                        if (isInteractive) return;
                                        setDetailEntryId(c.id);
                                      }}
                                      className={`hover:bg-blue-50/30 cursor-pointer border-b border-slate-100 ${isSelected ? "bg-blue-50/40" : ""}`}>
                                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                        {c.status !== "pago" && !isProjecao(c) && (
                                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                                        )}
                                      </td>
                                      <td className="px-2 py-2 whitespace-nowrap pl-6">
                                        <div className="flex items-center gap-2">
                                          <span className="text-indigo-300 text-xs">└─</span>
                                          <span className={`text-xs tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-600"}`}>
                                            {fmtDateBR(c.dataVencimento)}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 whitespace-nowrap">
                                        <span className="text-[11px] font-mono text-slate-500">#{c.id}</span>
                                      </td>
                                      <td className="px-2 py-2 max-w-[220px]">
                                        {c.origemModulo === "pagamento_pj" ? (() => {
                                          const raw = c.descricao ?? c.origemDescricao ?? "";
                                          const sep = raw.includes(" — ") ? " — " : " - ";
                                          const nome = raw.split(sep)[0]?.trim() || raw;
                                          const contratoM = raw.match(/Contrato\s*#(\d+)/i);
                                          const contratoNum = contratoM ? contratoM[1] : null;
                                          const is2 = /2a\s*Medicao|2ª\s*Medi/i.test(raw);
                                          const is1 = /1a\s*Medicao|1ª\s*Medi/i.test(raw);
                                          const mesM = raw.match(/(\d{2})\/(\d{4})/);
                                          const mes = mesM ? `${mesM[1]}/${mesM[2]}` : null;
                                          return (
                                            <>
                                              <p className="text-xs font-semibold text-slate-800 truncate" title={nome}>{nome}</p>
                                              <div className="flex flex-wrap gap-1 mt-0.5">
                                                {(is1 || is2) && (
                                                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${is2 ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                                    {is2 ? "2ª Medição" : "1ª Medição"}
                                                  </span>
                                                )}
                                                {contratoNum && (
                                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                    Contrato #{contratoNum}
                                                  </span>
                                                )}
                                                {c.origemId && (
                                                  <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                                                    PJ-{c.origemId}
                                                  </span>
                                                )}
                                                {mes && (
                                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                                                    {mes}
                                                  </span>
                                                )}
                                              </div>
                                            </>
                                          );
                                        })() : (
                                          <p className="text-xs text-slate-700 truncate" title={desc}>{desc}</p>
                                        )}
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[11px] text-slate-500">{categoriaFor(c)}</span>
                                          <FdBadge c={c} />
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-right whitespace-nowrap">
                                        <span className={`text-xs font-semibold tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-700"}`}>
                                          {formatBRL(Number(c.valorPrevisto ?? 0))}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        {c.status === "pago" ? (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                            <CheckCircle className="w-2.5 h-2.5" />Pago
                                          </span>
                                        ) : vencida ? (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                            Vencido
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                            A Pagar
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                                          onClick={() => setDetailEntryId(c.id)}>
                                          <Eye className="w-3 h-3" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            );
                          }
                          // ─── LINHA INDIVIDUAL (caminho original) ───
                          const c = r.item;
                          const vencida = c.dataVencimento && c.dataVencimento.slice(0,10) < hojeStr && c.status !== "pago";
                          const Icon = ORIGEM_ICONS[c.origemModulo] ?? FileText;
                          const colorCls = ORIGEM_COLORS[c.origemModulo] ?? "bg-gray-50 text-gray-700 border-gray-200";
                          const oc = extractOcNumero(c);
                          const desc = describeEntry(c);
                          const cat = categoriaFor(c);
                          const isDup = duplicateKeys.has(dupKeyOf(c));
                          const isSelected = selectedIds.has(c.id);
                          const proj = isProjecao(c);
                          return (
                            <tr key={c.id}
                              onClick={(e) => {
                                // Não abrir detalhe quando o clique foi em checkbox/botão
                                const tag = (e.target as HTMLElement).tagName.toLowerCase();
                                const isInteractive = (e.target as HTMLElement).closest("button, [role=checkbox], input, a");
                                if (isInteractive || tag === "input") return;
                                setDetailEntryId(c.id);
                              }}
                              className={`hover:bg-blue-50/30 cursor-pointer border-b border-slate-100 ${isSelected ? "bg-blue-50/40" : vencida ? "bg-red-50/30" : proj ? "bg-violet-50/20 border-l-2 border-l-violet-300" : ""}`}>
                              {/* Checkbox */}
                              <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                {c.status !== "pago" && !proj && (
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
                              <td className="px-2 py-2.5 max-w-[220px]">
                                {c.origemModulo === "pagamento_pj" ? (() => {
                                  const raw = c.descricao ?? c.origemDescricao ?? "";
                                  const sep = raw.includes(" — ") ? " — " : " - ";
                                  const parts = raw.split(sep);
                                  const nome = parts[0]?.trim() || raw;
                                  const contratoM = raw.match(/Contrato\s*#(\d+)/i);
                                  const contratoNum = contratoM ? contratoM[1] : null;
                                  const is2 = /2a\s*Medicao|2ª\s*Medi/i.test(raw);
                                  const is1 = /1a\s*Medicao|1ª\s*Medi/i.test(raw);
                                  const mesM = raw.match(/(\d{2})\/(\d{4})/);
                                  const mes = mesM ? `${mesM[1]}/${mesM[2]}` : null;
                                  return (
                                    <>
                                      <p className="text-sm font-semibold text-slate-800 truncate" title={nome}>{nome}</p>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        {(is1 || is2) && (
                                          <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${is2 ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                            {is2 ? "2ª Medição" : "1ª Medição"}
                                          </span>
                                        )}
                                        {contratoNum && (
                                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                            Contrato #{contratoNum}
                                          </span>
                                        )}
                                        {c.origemId && (
                                          <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                                            PJ-{c.origemId}
                                          </span>
                                        )}
                                        {mes && (
                                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                                            {mes}
                                          </span>
                                        )}
                                        {isDup && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300" title="Possível duplicidade">
                                            <Copy className="w-2.5 h-2.5" />DUP
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  );
                                })() : (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-medium text-slate-800 truncate" title={desc}>{desc}</p>
                                      {isDup && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 whitespace-nowrap"
                                          title="Possível duplicidade: mesmo descrição, valor e vencimento já consta no ano">
                                          <Copy className="w-2.5 h-2.5" />DUP
                                        </span>
                                      )}
                                    </div>
                                    {c.fornecedorNome && (
                                      <p className="text-[11px] text-indigo-600 truncate font-medium" title={c.fornecedorNome}>🏢 {c.fornecedorNome}</p>
                                    )}
                                    {c.obraNome && (
                                      <p className="text-[11px] text-slate-400 truncate" title={c.obraNome}>📍 {c.obraNome}</p>
                                    )}
                                  </>
                                )}
                              </td>
                              {/* Categoria — Rev. 2228: removido pill ORIGEM redundante
                                  (texto da categoria já carrega o nome). Ícone inline + texto
                                  poupam ~120px de largura → tabela cabe sem scroll. */}
                              <td className="px-2 py-2.5">
                                <div className="flex items-center gap-1">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border max-w-[110px] ${colorCls}`} title={cat}>
                                    <Icon className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{cat}</span>
                                  </span>
                                  <FdBadge c={c} />
                                </div>
                              </td>
                              {/* Valor */}
                              <td className="px-2 py-2.5 text-right whitespace-nowrap">
                                <span className={`text-sm font-bold tabular-nums ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-slate-800"}`}>
                                  {formatBRL(Number(c.valorPrevisto ?? 0))}
                                </span>
                                {c.status === "pago" && c.valorRealizado && Number(c.valorRealizado) !== Number(c.valorPrevisto) && (
                                  <div className="text-[10px] text-green-600">pago: {formatBRL(Number(c.valorRealizado))}</div>
                                )}
                                {/* Rev. 3743 — baixa PARCIAL: mostra pago + saldo em aberto */}
                                {c.status !== "pago" && Number(c.valorRealizado ?? 0) > 0 && (
                                  <div className="text-[10px] text-amber-600">pago: {formatBRL(Number(c.valorRealizado))} · saldo {formatBRL(Math.max(0, Number(c.valorPrevisto ?? 0) - Number(c.valorRealizado ?? 0)))}</div>
                                )}
                              </td>
                              {/* Status */}
                              <td className="px-2 py-2.5 text-center">
                                {c.status === "pago" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200">
                                    <CheckCircle className="w-3 h-3" />Pago
                                  </span>
                                ) : Number(c.valorRealizado ?? 0) > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200" title="Baixa parcial — saldo em aberto">
                                    <Clock className="w-3 h-3" />Parcial
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
                              {/* Ações — sticky-right (Rev. 2227) + Estornar/Excluir (Rev. 2228) */}
                              <td className="px-2 py-2.5 text-right sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-0.5">
                                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Visualizar detalhes"
                                    onClick={() => setDetailEntryId(c.id)}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  {!proj && (
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                      title={c.origemModulo && c.origemModulo !== "recorrente" ? "Vinculado a outro módulo — edite na origem" : c.status === "pago" ? "Estorne antes de editar" : "Editar lançamento"}
                                      onClick={() => openEdit(c)}>
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {!proj && (
                                    <Button size="sm" variant="outline" className={`h-7 w-7 p-0 ${c.anexoUrl ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                      title={c.anexoUrl ? `Anexo: ${c.anexoNome ?? "documento"} (clique p/ trocar)` : "Anexar documento (boleto/NF/foto)"}
                                      onClick={() => openAnexo(c)}>
                                      <Paperclip className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {c.status === "pago" ? (
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-amber-300 text-amber-700 hover:bg-amber-50"
                                      title="Estornar pagamento (baixa errada)"
                                      onClick={() => { setShowEstorno(c); setMotivoEstorno(""); }}>
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </Button>
                                  ) : (
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-1.5 text-xs"
                                      onClick={() => setShowPay(c)}>
                                      <CheckCircle className="w-3 h-3 mr-0.5" />Pagar
                                    </Button>
                                  )}
                                  {!proj && (
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                      title={c.status === "pago" ? "Estorne antes de excluir" : "Excluir lançamento (duplicidade)"}
                                      disabled={c.status === "pago"}
                                      onClick={() => { setShowDelete(c); setMotivoDelete(""); }}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                      );
                    })}
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

        {/* Rev. 1621 — Modal de DETALHE do título (drill-down completo p/ validação final) */}
        <Dialog open={!!detailEntryId} onOpenChange={(o) => !o && setDetailEntryId(null)}>
          <DialogContent
            resizable={false}
            className="!max-w-none w-[100vw] h-[100dvh] lg:w-[96vw] lg:h-[94vh] lg:max-w-[1600px] lg:rounded-lg rounded-none p-3 sm:p-5 overflow-y-auto flex flex-col"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow">
                  <Receipt className="w-[18px] h-[18px] text-white" />
                </span>
                Detalhe do Título
                {detailQuery.data?.entry && (
                  <span className="ml-auto text-[11px] font-semibold text-slate-500 tabular-nums bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                    #{detailQuery.data.entry.id}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {detailQuery.isLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Carregando detalhes...</div>
            ) : detailQuery.error ? (
              <div className="py-6 px-4 space-y-2">
                <div className="text-red-700 font-semibold text-sm">Erro ao carregar detalhe:</div>
                <div className="text-red-600 text-sm font-mono break-all">{(detailQuery.error as any)?.name ? `[${(detailQuery.error as any).name}] ` : ""}{(detailQuery.error as any)?.message ?? String(detailQuery.error)}</div>
                {(detailQuery.error as any)?.data?.code && (
                  <div className="text-xs text-slate-500">Código: {(detailQuery.error as any).data.code}</div>
                )}
                <div className="text-xs text-slate-500 pt-2">ID: {detailEntryId} · Empresa: {companyId}</div>
              </div>
            ) : detailQuery.data ? (() => {
              const d = detailQuery.data;
              const e = d.entry;
              const vencida = e.dataVencimento && e.dataVencimento.slice(0,10) < hojeStr && e.status !== "pago";
              return (
                <div className="space-y-4">
                  {/* Rev. 4561 — Hero de status (gradiente lúdico por situação) */}
                  <div className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 text-white shadow-lg ${
                    e.status === "pago" ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700" :
                    vencida ? "bg-gradient-to-br from-rose-500 via-red-600 to-red-700" :
                    "bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600"
                  }`}>
                    <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
                    <div className="absolute -bottom-14 -left-8 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
                    <div className="relative flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                            {ORIGEM_LABELS[e.origemModulo] ?? e.origemModulo ?? "Lançamento Manual"}
                          </span>
                          {d.ordem?.numeroOc && (
                            <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-[11px] font-mono font-semibold">
                              {formatNumeroOcDisplay(d.ordem.numeroOc)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base sm:text-lg font-bold leading-tight break-words drop-shadow-sm">
                          {e.descricao || e.origemDescricao || e.contaNome || "—"}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          {e.fornecedorNome && (
                            <span className="inline-flex items-center gap-1 bg-black/15 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                              <Building2 className="w-3 h-3" />{e.fornecedorNome}
                            </span>
                          )}
                          {e.obraNome && (
                            <span className="inline-flex items-center gap-1 bg-black/15 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                              📍 {e.obraNome}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">Valor do título</div>
                        <div className="text-2xl sm:text-3xl font-extrabold tabular-nums drop-shadow-sm">{formatBRL(Number(e.valorPrevisto))}</div>
                        <div className="inline-flex items-center gap-1.5 mt-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold">
                          {e.status === "pago" ? <><CheckCircle className="w-3.5 h-3.5" />Pago em {fmtDateBR(e.dataPagamento)}</> :
                            vencida ? <><AlertTriangle className="w-3.5 h-3.5" />Vencido há {e.diasAtraso} dia(s)</> :
                            <><Calendar className="w-3.5 h-3.5" />Vence em {fmtDateBR(e.dataVencimento)}</>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 h-auto rounded-full bg-slate-100 p-1 gap-1">
                      <TabsTrigger value="geral" className="rounded-full text-[11px] sm:text-xs px-1 sm:px-3 py-1.5 truncate data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow">
                        <Info className="w-3 h-3 mr-1 flex-shrink-0" /><span className="truncate">Geral</span>
                      </TabsTrigger>
                      <TabsTrigger value="origem" className="rounded-full text-[11px] sm:text-xs px-1 sm:px-3 py-1.5 truncate data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow" disabled={!d.ordem && !d.fornecedor && !d.origemDetalhes}>
                        <Building2 className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{(d.origemDetalhes?.funcionarios || d.origemDetalhes?.pjs) ? "Memorial" : "Origem"}</span>
                      </TabsTrigger>
                      <TabsTrigger value="parcelas" className="rounded-full text-[11px] sm:text-xs px-1 sm:px-3 py-1.5 truncate data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow">
                        <Hash className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate">Parcelas{d.parcelas?.length > 1 ? ` (${d.parcelas.length})` : ""}</span>
                      </TabsTrigger>
                      <TabsTrigger value="historico" className="rounded-full text-[11px] sm:text-xs px-1 sm:px-3 py-1.5 truncate data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow">
                        <History className="w-3 h-3 mr-1 flex-shrink-0" /><span className="truncate">Histórico</span>
                      </TabsTrigger>
                    </TabsList>

                    {/* GERAL — Rev. 4561: agrupado em seções temáticas (💰 valores, 📅 datas, 🏷️ classificação, 👤 pessoas) */}
                    <TabsContent value="geral" className="mt-4 space-y-3">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <DetSection icon={<Wallet className="w-3.5 h-3.5 text-emerald-700" />} title="Valores & Pagamento" tint="bg-emerald-50 text-emerald-800">
                          <div className="grid grid-cols-2 gap-2">
                            <KV label="Valor Previsto">{formatBRL(Number(e.valorPrevisto))}</KV>
                            <KV label="Valor Realizado">{e.valorRealizado != null ? formatBRL(Number(e.valorRealizado)) : "—"}</KV>
                            <KV label="Forma">{e.formaPagamento ?? "—"}</KV>
                            <KV label="Parcela">{e.parcelaNumero ? `${e.parcelaNumero}/${e.parcelaTotal}` : "1/1"}</KV>
                            {e.codigoBarras && <KV label="Cód. de Barras"><span className="font-mono text-[11px]">{e.codigoBarras}</span></KV>}
                            {e.chequeNumero && <KV label="Cheque">{e.chequeNumero} ({e.chequeBanco})</KV>}
                          </div>
                        </DetSection>
                        <DetSection icon={<Calendar className="w-3.5 h-3.5 text-sky-700" />} title="Datas" tint="bg-sky-50 text-sky-800">
                          <div className="grid grid-cols-2 gap-2">
                            <KV label="Competência">{fmtDateBR(e.dataCompetencia)}</KV>
                            <KV label="Vencimento" highlight={vencida}>{fmtDateBR(e.dataVencimento)}</KV>
                            <KV label="Pagamento">{e.dataPagamento ? fmtDateBR(e.dataPagamento) : "—"}</KV>
                            <KV label="Conciliação">{e.conciliado ? `✓ ${fmtDateBR(e.dataConciliacao)}` : "Não conciliado"}</KV>
                          </div>
                        </DetSection>
                        <DetSection icon={<Tag className="w-3.5 h-3.5 text-violet-700" />} title="Classificação" tint="bg-violet-50 text-violet-800">
                          <div className="grid grid-cols-2 gap-2">
                            <KV label="Tipo">{e.tipo ?? "—"}</KV>
                            <KV label="Natureza">{e.natureza ?? "—"}</KV>
                            <KV label="Conta Contábil">{e.contaNome ?? "—"}</KV>
                            <KV label="Fornecedor / Cliente" highlight={!!e.fornecedorNome}>{e.fornecedorNome ?? "—"}</KV>
                          </div>
                        </DetSection>
                        <DetSection icon={<Users className="w-3.5 h-3.5 text-amber-700" />} title="Pessoas" tint="bg-amber-50 text-amber-800">
                          <div className="grid grid-cols-2 gap-2">
                            <KV label="Criado por">{e.criadoPorNome ?? "—"}</KV>
                            {e.aprovadoPorNome && <KV label="Aprovado por">{e.aprovadoPorNome}</KV>}
                            {e.editadoPorNome && (
                              <KV label="Editado por" highlight>
                                {e.editadoPorNome}{e.editadoEm ? ` · ${fmtDateBR(e.editadoEm)}` : ""}
                              </KV>
                            )}
                          </div>
                        </DetSection>
                      </div>

                      {d.bancoEmpresa && (
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Conta de Saída (Empresa)</p>
                          <p className="text-sm font-medium text-slate-800">
                            {d.bancoEmpresa.banco} · Ag. {d.bancoEmpresa.agencia} · CC {d.bancoEmpresa.conta}
                            {d.bancoEmpresa.apelido && <span className="text-slate-500 ml-2">({d.bancoEmpresa.apelido})</span>}
                          </p>
                        </div>
                      )}

                      {e.observacoes && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Observações</p>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{e.observacoes}</p>
                        </div>
                      )}

                      {e.motivoCancelamento && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">Motivo do Cancelamento</p>
                          <p className="text-sm text-red-900">{e.motivoCancelamento}</p>
                        </div>
                      )}

                      {e.comprovanteUrl && (
                        <a href={e.comprovanteUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline">
                          <Paperclip className="w-4 h-4" />Ver comprovante de pagamento
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {e.anexoUrl && (
                        <a href={e.anexoUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-emerald-700 hover:underline">
                          <Paperclip className="w-4 h-4" />Ver documento anexado{e.anexoNome ? ` — ${e.anexoNome}` : ""}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </TabsContent>

                    {/* ORIGEM */}
                    <TabsContent value="origem" className="mt-4 space-y-4">
                      {d.ordem && (
                        <DetSection icon={<ShoppingCart className="w-3.5 h-3.5 text-blue-700" />} title={`Ordem de Compra ${formatNumeroOcDisplay(d.ordem.numeroOc)}`} tint="bg-blue-50 text-blue-800">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <KV label="Status OC">{d.ordem.status} · {d.ordem.aprovacaoStatus}</KV>
                            <KV label="Aprovador">{d.ordem.aprovadorNome ?? "—"}</KV>
                            <KV label="Aprovado em">{d.ordem.aprovadoEm ? fmtDateBR(d.ordem.aprovadoEm.slice(0,10)) : "—"}</KV>
                            <KV label="NF">{d.ordem.numeroNf ?? "—"}</KV>
                            <KV label="Cond. Pagto">{d.ordem.condicaoPagamento ?? "—"}</KV>
                            <KV label="Parcelas">{d.ordem.numeroParcelas ?? 1}</KV>
                            <KV label="Subtotal">{formatBRL(Number(d.ordem.subtotal ?? 0))}</KV>
                            <KV label={`Frete (${d.ordem.freteTipo ?? "—"})`}>{formatBRL(Number(d.ordem.frete ?? 0))}</KV>
                            <KV label="Outras Desp.">{formatBRL(Number(d.ordem.outrasDespesas ?? 0))}</KV>
                            <KV label="Impostos">{formatBRL(Number(d.ordem.impostos ?? 0))}</KV>
                            <KV label="Desconto">{formatBRL(Number(d.ordem.desconto ?? 0))}</KV>
                            <KV label="TOTAL OC" highlight>{formatBRL(Number(d.ordem.total ?? 0))}</KV>
                          </div>
                          {d.ordem.observacoes && (
                            <div className="mt-2 text-xs text-slate-600 italic">{d.ordem.observacoes}</div>
                          )}
                          <div className="flex gap-2 mt-3">
                            {d.ordem.pdfUrl && (
                              <a href={d.ordem.pdfUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline border border-blue-200 px-2 py-1 rounded bg-blue-50">
                                <FileText className="w-3 h-3" />PDF da OC<ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {Array.isArray(d.ordem.anexos) && d.ordem.anexos.length > 0 && d.ordem.anexos.map((a: any, i: number) => (
                              <a key={i} href={typeof a === "string" ? a : a.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline border border-slate-200 px-2 py-1 rounded">
                                <Paperclip className="w-3 h-3" />{typeof a === "string" ? `Anexo ${i+1}` : (a.nome ?? a.name ?? `Anexo ${i+1}`)}
                              </a>
                            ))}
                          </div>
                        </DetSection>
                      )}

                      {d.fornecedor && (
                        <DetSection icon={<Building2 className="w-3.5 h-3.5 text-indigo-700" />} title="Fornecedor" tint="bg-indigo-50 text-indigo-800">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <KV label="Razão Social">{d.fornecedor.razaoSocial}</KV>
                            <KV label="Nome Fantasia">{d.fornecedor.nomeFantasia ?? "—"}</KV>
                            <KV label="CNPJ"><span className="font-mono">{d.fornecedor.cnpj ?? "—"}</span></KV>
                            <KV label="Cidade/UF">{[d.fornecedor.cidade, d.fornecedor.estado].filter(Boolean).join("/") || "—"}</KV>
                            <KV label="Telefone">{d.fornecedor.telefone ?? "—"}</KV>
                            <KV label="E-mail">{d.fornecedor.email ?? "—"}</KV>
                            <KV label="Contato">{d.fornecedor.contatoNome ?? "—"}</KV>
                            <KV label="Banco">{d.fornecedor.banco ?? "—"}</KV>
                            <KV label="Ag./Conta">{[d.fornecedor.agencia, d.fornecedor.conta].filter(Boolean).join(" / ") || "—"}</KV>
                            {d.fornecedor.pix && <KV label="PIX" highlight><span className="font-mono text-[11px]">{d.fornecedor.pix}</span></KV>}
                          </div>
                        </DetSection>
                      )}

                      {/* Rev. 1628 — Origem genérica (cronograma, folha, pj, frota, parceiro, beneficio, almox, medição, seguro) */}
                      {!d.ordem && !d.fornecedor && d.origemDetalhes && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                            <Building2 className="w-4 h-4 text-violet-600" />{d.origemDetalhes.titulo}
                          </h4>
                          {d.origemDetalhes.subtitulo && (
                            <p className="text-xs text-slate-600 mb-3">{d.origemDetalhes.subtitulo}</p>
                          )}
                          {d.origemDetalhes.formula && (
                            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 mb-3">
                              <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide mb-1">Fórmula de cálculo</p>
                              <p className="text-xs text-violet-900">{d.origemDetalhes.formula}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {d.origemDetalhes.campos.map((c: any, i: number) => (
                              <KV key={i} label={c.label}>
                                {c.value == null || c.value === "" ? "—" :
                                 c.kind === "date" ? fmtDateBR(String(c.value)) :
                                 String(c.value)}
                              </KV>
                            ))}
                          </div>

                          {/* Rev. 1634 — Memorial Funcionários (Folha CLT / Encargos / VR / VA / 13º) */}
                          {Array.isArray(d.origemDetalhes.funcionarios) && d.origemDetalhes.funcionarios.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                <Hash className="w-4 h-4 text-emerald-600" />
                                Funcionários considerados ({d.origemDetalhes.funcionarios.length})
                              </h4>
                              <div className="border border-slate-200 rounded-lg overflow-auto max-h-[60vh]">
                                <table className="w-full text-xs min-w-[820px]">
                                  <thead className="bg-slate-100 sticky top-0">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">#</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Código</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Funcionário / Função</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Obra</th>
                                      <th className="px-2 py-1.5 text-center font-semibold text-slate-600">Tipo</th>
                                      <th className="px-2 py-1.5 text-center font-semibold text-slate-600">Situação</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Sal. Bruto</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-600">% Folha</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Parcela</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.origemDetalhes.funcionarios.map((f: any, i: number) => {
                                      const st = String(f.status || "").trim();
                                      const stMap: Record<string, { cls: string; label: string }> = {
                                        Ativo:    { cls: "bg-green-100 text-green-700",   label: "Ativo" },
                                        Ferias:   { cls: "bg-blue-100 text-blue-700",     label: "Férias (custo da empresa)" },
                                        Aviso:    { cls: "bg-amber-100 text-amber-700",   label: "Aviso prévio" },
                                        Afastado: { cls: "bg-rose-100 text-rose-700",     label: "Afastado >15d (INSS)" },
                                        Licenca:  { cls: "bg-rose-100 text-rose-700",     label: "Licença (INSS)" },
                                        Recluso:  { cls: "bg-zinc-200 text-zinc-700",     label: "Recluso (auxílio-reclusão)" },
                                      };
                                      const sd = stMap[st] || { cls: "bg-slate-100 text-slate-600", label: st || "—" };
                                      return (
                                        <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                                          <td className="px-2 py-1 text-slate-400 tabular-nums">{i + 1}</td>
                                          <td className="px-2 py-1 font-mono text-[10px] text-slate-700">{f.codigo || f.matricula || "—"}</td>
                                          <td className="px-2 py-1">
                                            <div className="font-medium text-slate-800 leading-tight">{f.nome}</div>
                                            <div className="text-[10px] text-slate-500 leading-tight">{f.cargo && f.cargo !== "—" ? f.cargo : "Função não cadastrada"}</div>
                                          </td>
                                          <td className="px-2 py-1 text-slate-600 text-[10px]">{f.obraAtual}</td>
                                          <td className="px-2 py-1 text-center text-[10px] uppercase text-slate-500">{f.tipoRemuneracao}</td>
                                          <td className="px-2 py-1 text-center">
                                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${sd.cls}`}>{sd.label}</span>
                                          </td>
                                          <td className="px-2 py-1 text-right tabular-nums">{formatBRL(Number(f.salarioBruto))}</td>
                                          <td className="px-2 py-1 text-right tabular-nums text-slate-500">{Number(f.percentual).toFixed(2)}%</td>
                                          <td className="px-2 py-1 text-right tabular-nums font-semibold text-emerald-700">{formatBRL(Number(f.parcelaLancamento))}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-slate-100 sticky bottom-0">
                                    <tr className="font-bold text-slate-700">
                                      <td colSpan={6} className="px-2 py-1.5 text-right">TOTAL</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(d.origemDetalhes.funcionarios.reduce((s: number, f: any) => s + Number(f.salarioBruto), 0))}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">100%</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{formatBRL(d.origemDetalhes.funcionarios.reduce((s: number, f: any) => s + Number(f.parcelaLancamento), 0))}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Rev. 1634 — Memorial PJ (lista de prestadores ativos com destaque) */}
                          {Array.isArray(d.origemDetalhes.pjs) && d.origemDetalhes.pjs.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                <Building2 className="w-4 h-4 text-indigo-600" />
                                Prestadores PJ ativos ({d.origemDetalhes.pjs.length})
                              </h4>
                              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 sticky top-0">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Razão Social</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">CNPJ</th>
                                      <th className="px-2 py-1.5 text-center font-semibold text-slate-600">Status</th>
                                      <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Valor Mensal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.origemDetalhes.pjs.map((p: any) => (
                                      <tr key={p.id} className={`border-t border-slate-100 ${p.destacado ? "bg-indigo-50 font-semibold" : ""}`}>
                                        <td className="px-2 py-1">{p.nome} {p.destacado && <span className="text-indigo-600 ml-1">←</span>}</td>
                                        <td className="px-2 py-1 font-mono text-[10px]">{p.cnpj}</td>
                                        <td className="px-2 py-1 text-center text-[10px] uppercase text-slate-500">{p.status}</td>
                                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(Number(p.valor))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {d.itens && d.itens.length > 0 && (
                        <DetSection icon={<Package className="w-3.5 h-3.5 text-amber-700" />} title={`Itens da OC (${d.itens.length})`} tint="bg-amber-50 text-amber-800">
                          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Cód.</th>
                                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Descrição</th>
                                  <th className="px-2 py-1.5 text-center font-semibold text-slate-600">Un.</th>
                                  <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Qtd</th>
                                  <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Entr.</th>
                                  <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Preço</th>
                                  <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.itens.map((it: any) => (
                                  <tr key={it.id} className="border-t border-slate-100">
                                    <td className="px-2 py-1 font-mono text-[10px]">{it.insumoCodigo ?? "—"}</td>
                                    <td className="px-2 py-1">{it.descricao}</td>
                                    <td className="px-2 py-1 text-center">{it.unidade ?? "—"}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{Number(it.quantidade).toLocaleString("pt-BR", {maximumFractionDigits: 3})}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-slate-500">{Number(it.quantidadeEntregue ?? 0).toLocaleString("pt-BR", {maximumFractionDigits: 3})}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{formatBRL(Number(it.precoUnitario ?? 0))}</td>
                                    <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatBRL(Number(it.total ?? 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </DetSection>
                      )}
                    </TabsContent>

                    {/* PARCELAS — Rev. 4561: cartão temático */}
                    <TabsContent value="parcelas" className="mt-4">
                      <DetSection icon={<Hash className="w-3.5 h-3.5 text-violet-700" />} title={`Parcelas do título${d.parcelas?.length > 1 ? ` (${d.parcelas.length})` : ""}`} tint="bg-violet-50 text-violet-800">
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Parcela</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Vencimento</th>
                              <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Valor</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Pgto</th>
                              <th className="px-2 py-1.5 text-center font-semibold text-slate-600">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!d.parcelas || d.parcelas.length === 0) && (
                              <tr className="bg-blue-50 border-t border-slate-100">
                                <td className="px-2 py-1.5 font-semibold">1/1 <span className="text-blue-600 ml-1">←</span></td>
                                <td className="px-2 py-1.5">{fmtDateBR(e.dataVencimento)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatBRL(Number(e.valorPrevisto))}</td>
                                <td className="px-2 py-1.5">{e.dataPagamento ? `${fmtDateBR(e.dataPagamento)} (${e.formaPagamento ?? "—"})` : "—"}</td>
                                <td className="px-2 py-1.5 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    e.status === "pago" ? "bg-green-100 text-green-700" :
                                    e.dataVencimento && String(e.dataVencimento).slice(0,10) < hojeStr ? "bg-red-100 text-red-700" :
                                    "bg-orange-100 text-orange-700"
                                  }`}>{e.status}</span>
                                </td>
                              </tr>
                            )}
                            {d.parcelas?.map((p: any) => (
                              <tr key={p.id} className={`border-t border-slate-100 ${p.id === e.id ? "bg-blue-50" : ""}`}>
                                <td className="px-2 py-1.5 font-semibold">{p.parcelaNumero}/{p.parcelaTotal} {p.id === e.id && <span className="text-blue-600 ml-1">←</span>}</td>
                                <td className="px-2 py-1.5">{fmtDateBR(p.dataVencimento)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatBRL(Number(p.valorPrevisto))}</td>
                                <td className="px-2 py-1.5">{p.dataPagamento ? `${fmtDateBR(p.dataPagamento)} (${p.formaPagamento ?? "—"})` : "—"}</td>
                                <td className="px-2 py-1.5 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    p.status === "pago" ? "bg-green-100 text-green-700" :
                                    p.dataVencimento && p.dataVencimento.slice(0,10) < hojeStr ? "bg-red-100 text-red-700" :
                                    "bg-orange-100 text-orange-700"
                                  }`}>{p.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </DetSection>
                    </TabsContent>

                    {/* HISTÓRICO — Rev. 4561: linha do tempo com bolinhas coloridas */}
                    <TabsContent value="historico" className="mt-4">
                      {d.auditoria && d.auditoria.length > 0 ? (
                        <DetSection icon={<History className="w-3.5 h-3.5 text-slate-700" />} title="Linha do tempo" tint="bg-slate-100 text-slate-700">
                          <div className="space-y-0 max-h-80 overflow-y-auto pl-1">
                            {d.auditoria.map((a: any, i: number) => (
                              <div key={a.id} className="relative pl-6 pb-4 last:pb-1">
                                {i < d.auditoria.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200" />}
                                <span className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 border-white shadow ${
                                  /pag|baixa/i.test(String(a.action)) ? "bg-emerald-500" :
                                  /estorn|cancel|exclu/i.test(String(a.action)) ? "bg-rose-500" :
                                  /edit|alter/i.test(String(a.action)) ? "bg-amber-500" : "bg-blue-500"
                                }`} />
                                <div className="text-xs font-bold text-slate-800">{a.action}</div>
                                <div className="text-[11px] text-slate-500">
                                  {fmtDateBR(a.createdAt.slice(0,10))} · {a.userName ?? "—"} · {a.module}
                                </div>
                                {a.details && <div className="text-xs text-slate-600 mt-0.5 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 break-words">{a.details}</div>}
                              </div>
                            ))}
                          </div>
                        </DetSection>
                      ) : (
                        <div className="text-center py-10 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
                          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-2">
                            <History className="w-6 h-6 text-slate-400" />
                          </span>
                          <p className="text-sm font-medium text-slate-600">Nada por aqui ainda</p>
                          <p className="text-xs text-slate-400 mt-0.5">Este título não tem registros de auditoria.</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              );
            })() : null}

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" className="rounded-full px-5" onClick={() => setDetailEntryId(null)}>Fechar</Button>
              {detailQuery.data?.entry && detailQuery.data.entry.status !== "pago" && (
                <Button className="rounded-full px-5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md"
                  onClick={() => { setShowPay(detailQuery.data.entry); setDetailEntryId(null); }}>
                  <CheckCircle className="w-4 h-4 mr-1" />Validar e Pagar
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4070 — Pagamento consolidado por fornecedor/ciclo (cheque auto-dividido em N parcelas) */}
        <PagarConsolidadoDialog
          open={!!payGroupTarget}
          group={payGroupTarget}
          companyId={companyId}
          bankAccounts={bankAccounts ?? []}
          onClose={() => setPayGroupTarget(null)}
          onSuccess={() => {
            setPayGroupTarget(null);
            refetch();
          }}
        />

        {/* Rev. 1620 — Modal pagamento em lote (Onda 2) */}
        <Dialog open={showBulkPay} onOpenChange={setShowBulkPay}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" />Pagamento em Lote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs text-blue-700 font-medium">Você está prestes a marcar como pagos:</p>
                <p className="text-2xl font-bold text-blue-900 tabular-nums mt-1">{expandToNumericIds(bulkPayBase, (c: any) => c.status !== "pago").length} <span className="text-sm font-normal">títulos</span></p>
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
                  // Garantir que só enviamos IDs ainda visíveis/válidos no escopo corrente (mês ou ano todo).
                  // Rev. 4575 — grupos consolidados (id "grp:...") são expandidos nos títulos reais.
                  const validIds = expandToNumericIds(bulkPayBase, (c: any) => c.status !== "pago");
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
                {bulkPayMut.isPending ? "Processando..." : `Confirmar ${expandToNumericIds(bulkPayBase, (c: any) => c.status !== "pago").length} pagamento(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2657 — Modal EDITAR (lançamento manual) */}
        <Dialog open={!!showEdit} onOpenChange={(o) => { if (!o) setShowEdit(null); }}>
          <DialogContent className="max-w-none w-[100vw] h-[100dvh] sm:rounded-none flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-blue-700">
                <Pencil className="w-5 h-5" />Editar Lançamento
                {showEdit?.origemModulo && showEdit.origemModulo !== "recorrente" && (
                  <span className="text-xs font-medium text-slate-500">· vindo de {ORIGEM_LABELS[showEdit.origemModulo] ?? showEdit.origemModulo}</span>
                )}
              </DialogTitle>
            </DialogHeader>
            {showEdit && (
              <div className="space-y-3 px-6 py-4 overflow-y-auto flex-1 max-w-2xl w-full mx-auto">
                {showEdit.origemModulo && showEdit.origemModulo !== "recorrente" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {(showEdit.origemModulo === "compras" || showEdit.origemModulo === "compra_oc") ? (
                      <>
                        <p className="font-semibold mb-0.5">Título vinculado a uma Ordem de Compra</p>
                        <p className="text-[12px] leading-snug">As alterações de <b>Fornecedor</b>, <b>Vencimento</b>, <b>Forma de Pagamento</b> e <b>Observações</b> também serão aplicadas na OC de origem. O <b>valor</b> da OC não é alterado (ele vem dos itens da OC).</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold mb-0.5">Título vinculado a {ORIGEM_LABELS[showEdit.origemModulo] ?? showEdit.origemModulo}</p>
                        <p className="text-[12px] leading-snug">As alterações são aplicadas neste título. A sincronização automática com a origem hoje cobre apenas Compras (OC).</p>
                      </>
                    )}
                  </div>
                )}
                <div>
                  <Label className="text-xs text-slate-500">Descrição</Label>
                  <Input value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Descrição do lançamento" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Valor (R$)</Label>
                    <Input type="number" step="0.01" value={editForm.valorPrevisto}
                      onChange={e => setEditForm(f => ({ ...f, valorPrevisto: e.target.value }))} placeholder="0,00" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Forma de Pagamento</Label>
                    <Select value={editForm.formaPagamento || "none"} onValueChange={v => setEditForm(f => ({ ...f, formaPagamento: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="ted">TED</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="cheque">Cheque (próprio)</SelectItem>
                        <SelectItem value="cheque_terceiro">Cheque de Terceiro</SelectItem>
                        <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Rev. 4587 — Conta bancária (igual à tela "Pagar") */}
                <div>
                  <Label className="text-xs text-slate-500">Conta bancária</Label>
                  <Select value={editContaBancariaId != null ? String(editContaBancariaId) : "none"}
                    onValueChange={v => setEditContaBancariaId(v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Não informar —</SelectItem>
                      {(bankAccounts ?? []).filter((a: any) => a.ativo).map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {[a.descricao || a.banco, a.agencia ? `Ag ${a.agencia}` : null, a.conta ? `CC ${a.conta}` : null].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Rev. 4587 — Cheque próprio: programação dos cheques (mesma tela do "Pagar") */}
                {editForm.formaPagamento === "cheque" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                    <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5" /> Cheque próprio — programe os cheques deste título
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Em quantas vezes</p>
                        <Input type="number" min={1} max={120} value={editChequeQtd}
                          onChange={e => setEditChequeQtd(e.target.value)} placeholder="1" className="h-9" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Nº do 1º cheque</p>
                        <Input value={editChequeNumIni} onChange={e => setEditChequeNumIni(e.target.value)}
                          placeholder="Ex: 000429" className="h-9" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">1º vencimento</p>
                        <Input type="date" value={editChequePrimVenc}
                          onChange={e => setEditChequePrimVenc(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Banco</p>
                        <Input value={editChequeBanco} onChange={e => setEditChequeBanco(e.target.value)}
                          placeholder="Ex: Caixa" className="h-9" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Agência</p>
                        <Input value={editChequeAgencia} onChange={e => setEditChequeAgencia(e.target.value)}
                          placeholder="Ex: 1234" className="h-9" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Conta corrente</p>
                        <Input value={editChequeConta} onChange={e => setEditChequeConta(e.target.value)}
                          placeholder="Ex: 00012345-6" className="h-9" />
                      </div>
                    </div>
                    {editChequePreview.length > 0 && editChequeNumIni.trim() ? (
                      <div className="rounded-lg border border-blue-200 bg-white overflow-hidden">
                        <div className="px-3 py-2 bg-blue-100/60">
                          <p className="text-[11px] font-semibold text-blue-700 break-words">
                            Ao salvar, {editChequePreview.length} cheque{editChequePreview.length !== 1 ? "s serão cadastrados" : " será cadastrado"} no Controle de Cheques (situação: Pendente)
                          </p>
                        </div>
                        <div className="divide-y divide-blue-100 max-h-36 overflow-y-auto">
                          {editChequePreview.map((p: any) => (
                            <div key={p.idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-blue-800 font-semibold">{p.numeroCheque}</span>
                                <span className="text-slate-400">{p.parcela}</span>
                                {p.dataVencimento && <span className="text-slate-500">venc. {fmtDateBR(p.dataVencimento)}</span>}
                              </div>
                              <span className="font-semibold tabular-nums text-slate-700">{formatBRL(p.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-blue-600 italic break-words">
                        Informe o <b>Nº do 1º cheque</b> para gerar os cheques no Controle de Cheques ao salvar. Deixe em branco para salvar apenas a forma de pagamento (sem gerar cheques).
                      </p>
                    )}
                  </div>
                )}
                {/* Rev. 4587 — Cheque de terceiro: seleção dos cheques recebidos em carteira */}
                {editForm.formaPagamento === "cheque_terceiro" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Cheques recebidos disponíveis em carteira
                      </p>
                      {editChequesTerceiroSel.length > 0 && (
                        <span className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                          Math.abs(editDiffTerceiro) <= 0.05 ? "bg-green-100 text-green-700" :
                          editDiffTerceiro > 0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>
                          {Math.abs(editDiffTerceiro) <= 0.05 ? "✓ " : ""}
                          {formatBRL(editTotalTerceiroSel)}
                          {Math.abs(editDiffTerceiro) > 0.05 && (editDiffTerceiro > 0 ? ` (+${formatBRL(editDiffTerceiro)})` : ` (−${formatBRL(-editDiffTerceiro)})`)}
                        </span>
                      )}
                    </div>
                    {editChequesTerceiroQ?.isLoading ? (
                      <div className="text-xs text-muted-foreground py-2">Buscando cheques disponíveis…</div>
                    ) : editChequesTerceiroDisp.length === 0 ? (
                      <div className="text-xs text-violet-700 bg-violet-100 rounded p-2 break-words">
                        Nenhum cheque recebido disponível. Cadastre na aba "Cheques Recebidos" do Controle de Cheques.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {editChequesTerceiroDisp.map((c: any) => {
                          const sel = editChequesTerceiroSel.includes(c.id);
                          return (
                            <div key={c.id}
                              onClick={() => setEditChequesTerceiroSel(prev => sel ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                              className={`flex items-center justify-between cursor-pointer rounded border px-3 py-1.5 transition-colors ${sel ? "bg-violet-100 border-violet-400" : "bg-white border-violet-100 hover:border-violet-300"}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${sel ? "bg-violet-600 border-violet-600" : "border-gray-300"}`} />
                                <span className="text-xs font-mono text-slate-700 truncate" title={`Cheque nº ${c.numeroCheque ?? "—"}`}>{c.numeroCheque ?? "—"}</span>
                                {c.emitenteNome && <span className="text-[11px] text-slate-500 truncate" title={c.emitenteNome}>{c.emitenteNome}</span>}
                                {c.dataBomPara && <span className="text-[11px] text-slate-400 shrink-0">bom p/ {fmtDateBR(String(c.dataBomPara).slice(0, 10))}</span>}
                              </div>
                              <span className="text-xs font-semibold tabular-nums text-slate-700 shrink-0">{formatBRL(Number(c.valor))}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-emerald-700 break-words">
                      Ao salvar, os cheques selecionados serão marcados como <b>Alocados</b> a este título no Controle de Cheques Recebidos.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Competência</Label>
                    <Input type="date" value={editForm.dataCompetencia}
                      onChange={e => setEditForm(f => ({ ...f, dataCompetencia: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Vencimento</Label>
                    <Input type="date" value={editForm.dataVencimento}
                      onChange={e => setEditForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Categoria / Conta</Label>
                  <Input value={editForm.contaNome} onChange={e => setEditForm(f => ({ ...f, contaNome: e.target.value }))}
                    list="cap-categorias-datalist" placeholder="Categoria contábil" />
                  <datalist id="cap-categorias-datalist">
                    {categoriasOptions.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Fornecedor / Cliente</Label>
                  <Input value={editForm.fornecedorNome} onChange={e => setEditForm(f => ({ ...f, fornecedorNome: e.target.value }))}
                    list="cap-fornecedores-datalist" placeholder="Nome do fornecedor / cliente" />
                  <datalist id="cap-fornecedores-datalist">
                    {fornecedoresOptions.map(f => <option key={f.id} value={f.nome} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Obra</Label>
                  <Input value={editForm.obraNome} onChange={e => setEditForm(f => ({ ...f, obraNome: e.target.value }))}
                    placeholder="Obra (opcional)" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Observações</Label>
                  <Textarea value={editForm.observacoes} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                    rows={2} placeholder="Observações (opcional)" />
                </div>
              </div>
            )}
            <DialogFooter className="px-6 py-4 border-t border-slate-200 shrink-0">
              <Button variant="outline" onClick={() => setShowEdit(null)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={updateEntryMut.isPending} onClick={handleSaveEdit}>
                {updateEntryMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2657 — Modal ANEXAR documento (boleto/NF/foto) */}
        <Dialog open={!!showAnexo} onOpenChange={(o) => { if (!o) setShowAnexo(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <Paperclip className="w-5 h-5" />Anexar Documento
              </DialogTitle>
            </DialogHeader>
            {showAnexo && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">{showAnexo.descricao ?? showAnexo.contaNome ?? "—"}</p>
                  <p className="text-xs text-slate-500">Boleto, nota fiscal, contrato, comprovante ou foto.</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Arquivo (PDF / Word / imagem)</Label>
                  <Input type="file" accept=".pdf,.doc,.docx,image/*" disabled={uploadingAnexo}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f); }} />
                  {uploadingAnexo && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Enviando...</p>
                  )}
                  {anexoUrl && !uploadingAnexo && (
                    <a href={anexoUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-emerald-700 hover:underline mt-1 inline-flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />{anexoNome || "documento"}<ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAnexo(null)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={anexarMut.isPending || uploadingAnexo || !anexoUrl} onClick={handleSaveAnexo}>
                {anexarMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2228 — Modal EXCLUIR (duplicidade) */}
        <Dialog open={!!showDelete} onOpenChange={(o) => { if (!o) { setShowDelete(null); setMotivoDelete(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Trash2 className="w-5 h-5" />Excluir Lançamento
              </DialogTitle>
            </DialogHeader>
            {showDelete && (
              <div className="space-y-3">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-700 font-semibold uppercase tracking-wide mb-1">Atenção — exclusão definitiva</p>
                  <p className="text-sm font-medium text-slate-800">{showDelete.descricao ?? showDelete.contaNome ?? "—"}</p>
                  {showDelete.obraNome && <p className="text-xs text-slate-600">📍 {showDelete.obraNome}</p>}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-red-200">
                    <span className="text-xs text-slate-600">Vencimento: {fmtDateBR(showDelete.dataVencimento)}</span>
                    <span className="text-base font-bold text-red-700 tabular-nums">{formatBRL(Number(showDelete.valorPrevisto ?? 0))}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Motivo da exclusão <span className="text-red-600">*</span></Label>
                  <Textarea value={motivoDelete} onChange={(e) => setMotivoDelete(e.target.value)}
                    placeholder="Ex.: Lançamento em duplicidade com OC-2026-0214" rows={3} className="mt-1" />
                  <p className="text-[11px] text-slate-500 mt-1">Mínimo 5 caracteres. Quem excluiu, quando e o motivo ficam registrados no log de auditoria.</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDelete(null); setMotivoDelete(""); }}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteMut.isPending || motivoDelete.trim().length < 5}
                onClick={() => deleteMut.mutate({ id: showDelete.id, companyId, motivo: motivoDelete.trim() })}>
                {deleteMut.isPending ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4508 — Modal APAGAR EM LOTE (cancelamento de múltiplos lançamentos) */}
        <Dialog open={showBulkCancel} onOpenChange={(o) => { if (!o) { setShowBulkCancel(false); setMotivoBulkCancel(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Trash2 className="w-5 h-5" />Apagar Lançamentos Selecionados
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700 font-semibold uppercase tracking-wide mb-1">
                  {expandToNumericIds((allContas as any[]) ?? []).length} lançamento(s) · {formatBRL(selectedTotal)}
                </p>
                <p className="text-sm text-slate-700">
                  Os lançamentos serão <strong>cancelados</strong> (removidos da lista de pendentes). 
                  Lançamentos já <em>pagos</em> ou <em>recebidos</em> são protegidos e não serão afetados.
                </p>
              </div>
              <div>
                <Label className="text-sm">Motivo do cancelamento <span className="text-red-600">*</span></Label>
                <Textarea
                  value={motivoBulkCancel}
                  onChange={(e) => setMotivoBulkCancel(e.target.value)}
                  placeholder="Ex.: Lançamentos do período pré-módulo, já pagos externamente"
                  rows={3} className="mt-1"
                />
                <p className="text-[11px] text-slate-500 mt-1">Mínimo 5 caracteres. Registrado no log de auditoria com o nome do usuário.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBulkCancel(false); setMotivoBulkCancel(""); }}>Voltar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white"
                disabled={bulkCancelMut.isPending || motivoBulkCancel.trim().length < 5}
                onClick={() => {
                  // Rev. 4575 — mesmo Poka-Yoke do pagamento em lote: expandir grupos consolidados.
                  const idsNum = expandToNumericIds((allContas as any[]) ?? []);
                  if (idsNum.length === 0) {
                    toast({ title: "Nenhum lançamento válido na seleção", variant: "destructive" });
                    return;
                  }
                  bulkCancelMut.mutate({
                    ids: idsNum,
                    companyId,
                    motivoCancelamento: motivoBulkCancel.trim(),
                  });
                }}>
                {bulkCancelMut.isPending ? "Cancelando..." : `Confirmar — apagar ${expandToNumericIds((allContas as any[]) ?? []).length} lançamento(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2228 — Modal ESTORNAR pagamento (baixa errada) */}
        <Dialog open={!!showEstorno} onOpenChange={(o) => { if (!o) { setShowEstorno(null); setMotivoEstorno(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <RotateCcw className="w-5 h-5" />Estornar Pagamento
              </DialogTitle>
            </DialogHeader>
            {showEstorno && (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">O lançamento voltará para "A Pagar"</p>
                  <p className="text-sm font-medium text-slate-800">{showEstorno.descricao ?? showEstorno.contaNome ?? "—"}</p>
                  {showEstorno.obraNome && <p className="text-xs text-slate-600">📍 {showEstorno.obraNome}</p>}
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-amber-200 text-xs">
                    <div><span className="text-slate-500">Pago em:</span> <span className="font-medium text-slate-800">{fmtDateBR(showEstorno.dataPagamento)}</span></div>
                    <div className="text-right"><span className="font-bold text-green-700 tabular-nums">{formatBRL(Number(showEstorno.valorRealizado ?? showEstorno.valorPrevisto ?? 0))}</span></div>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-2">Data de pagamento, valor realizado, forma e comprovante serão limpos.</p>
                </div>
                <div>
                  <Label className="text-sm">Motivo do estorno <span className="text-red-600">*</span></Label>
                  <Textarea value={motivoEstorno} onChange={(e) => setMotivoEstorno(e.target.value)}
                    placeholder="Ex.: Baixa lançada por engano — pagamento não foi efetuado" rows={3} className="mt-1" />
                  <p className="text-[11px] text-slate-500 mt-1">Mínimo 5 caracteres. Estorno fica registrado no histórico do lançamento e no log de auditoria.</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowEstorno(null); setMotivoEstorno(""); }}>Cancelar</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={estornoMut.isPending || motivoEstorno.trim().length < 5}
                onClick={() => estornoMut.mutate({ id: showEstorno.id, companyId, motivo: motivoEstorno.trim() })}>
                {estornoMut.isPending ? "Estornando..." : "Confirmar estorno"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal pagar */}
        <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
            {showPay && (
              <div className="space-y-4">

                {/* ── Hero: identidade do pagamento ── */}
                <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-4 shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white/50 text-[10px] uppercase tracking-widest font-semibold">Registrando pagamento</p>
                      <p className="text-sm font-semibold mt-1 break-words leading-snug">{showPay.descricao ?? showPay.contaNome ?? "—"}</p>
                      {showPay.obraNome && <p className="text-white/50 text-xs mt-0.5">{showPay.obraNome}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white/50 text-[10px] uppercase tracking-wide">Previsto</p>
                      <p className="text-2xl font-bold text-amber-400 tabular-nums mt-0.5">{formatBRL(Number(showPay.valorPrevisto))}</p>
                    </div>
                  </div>
                  {Number(showPay.valorRealizado ?? 0) > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-emerald-400 font-semibold">✓ Já pago: {formatBRL(Number(showPay.valorRealizado ?? 0))}</span>
                      <span className="text-amber-400 font-semibold">Saldo: {formatBRL(Math.max(0, Math.round((Number(showPay.valorPrevisto ?? 0) - Number(showPay.valorRealizado ?? 0)) * 100) / 100))}</span>
                    </div>
                  )}
                </div>

                {/* ── Data do pagamento ── */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data do Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="mt-1 max-w-[200px]" />
                </div>

                {/* ── Forma de Pagamento — pills visuais ── */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de Pagamento</Label>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {([
                      { v: "pix",              label: "PIX",          emoji: "⚡" },
                      { v: "ted",              label: "TED",          emoji: "🏦" },
                      { v: "boleto",           label: "Boleto",       emoji: "📄" },
                      { v: "cheque",           label: "Cheque",       emoji: "✏️" },
                      { v: "dinheiro",         label: "Dinheiro",     emoji: "💵" },
                      { v: "cartao_credito",   label: "Cartão Cred.", emoji: "💳" },
                      { v: "debito_automatico",label: "Déb. Auto.",   emoji: "🔁" },
                    ] as { v: string; label: string; emoji: string }[]).map(({ v, label, emoji }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFormaPagamento(v)}
                        className={`flex flex-col items-center gap-1 px-1 py-2.5 rounded-xl border-2 text-[11px] font-semibold transition-all select-none ${
                          formaPagamento === v
                            ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.04]"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted"
                        }`}
                      >
                        <span className="text-lg leading-none">{emoji}</span>
                        <span className="text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Rev. 4594: fatura de cartão — identificação + opções rápidas ── */}
                {showPay.origemModulo === "cartao_fatura" && faturaCartao && (() => {
                  const saldoAberto = Math.max(0, Math.round((Number(showPay.valorPrevisto ?? 0) - Number(showPay.valorRealizado ?? 0)) * 100) / 100);
                  const minimo = faturaCartao.pagamentoMinimo != null && faturaCartao.pagamentoMinimo > 0 ? faturaCartao.pagamentoMinimo : null;
                  const valorAtual = parseFloat(String(valorPagar).replace(",", ".")) || 0;
                  const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;
                  const opBtn = (ativo: boolean) =>
                    `flex-1 rounded-lg border-2 px-3 py-2 text-left transition-all ${ativo ? "border-violet-500 bg-violet-50 shadow-sm" : "border-slate-200 bg-white hover:border-violet-300"}`;
                  return (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
                      <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                        💳 Cartão de crédito {faturaCartao.banco ?? "?"} — final {faturaCartao.final4 ?? "????"}
                        {faturaCartao.mes != null && ` · Fatura ${String(faturaCartao.mes).padStart(2, "0")}/${faturaCartao.ano ?? ""}`}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button type="button" className={opBtn(eq(valorAtual, saldoAberto))} onClick={() => setValorPagar(String(saldoAberto))}>
                          <p className="text-xs font-bold text-slate-700">Pagar total</p>
                          <p className="text-sm font-mono font-semibold text-emerald-700">{formatBRL(saldoAberto)}</p>
                          <p className="text-[10px] text-slate-500">Quita a fatura — sem juros no próximo mês</p>
                        </button>
                        {minimo != null && (
                          <button type="button" className={opBtn(eq(valorAtual, minimo))} onClick={() => setValorPagar(String(minimo))}>
                            <p className="text-xs font-bold text-slate-700">Pagamento mínimo</p>
                            <p className="text-sm font-mono font-semibold text-amber-700">{formatBRL(minimo)}</p>
                            <p className="text-[10px] text-slate-500">Evita atraso — o restante entra no rotativo (juros)</p>
                          </button>
                        )}
                        <button type="button" className={opBtn(!eq(valorAtual, saldoAberto) && (minimo == null || !eq(valorAtual, minimo)))} onClick={() => setValorPagar("")}>
                          <p className="text-xs font-bold text-slate-700">Valor parcial</p>
                          <p className="text-sm font-mono font-semibold text-blue-700">Digitar abaixo</p>
                          <p className="text-[10px] text-slate-500">Informe qualquer valor no campo "Valor"</p>
                        </button>
                      </div>
                      {minimo != null && valorAtual > 0 && valorAtual < minimo && (
                        <p className="text-[11px] font-semibold text-red-600">⚠️ Valor abaixo do pagamento mínimo ({formatBRL(minimo)}) — risco de atraso/negativação junto ao banco.</p>
                      )}
                    </div>
                  );
                })()}

                {/* ── Composição do valor ── */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composição do pagamento</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-slate-500">Valor</Label>
                      <Input type="number" step="0.01" value={valorPagar} onChange={e => setValorPagar(e.target.value)} className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Juros (+)</Label>
                      <Input type="number" step="0.01" placeholder="0,00" value={jurosPay} onChange={e => setJurosPay(e.target.value)} className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Descontos (−)</Label>
                      <Input type="number" step="0.01" placeholder="0,00" value={descontosPay} onChange={e => setDescontosPay(e.target.value)} className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Outros (±)</Label>
                      <Input type="number" step="0.01" placeholder="0,00" value={outrosPay} onChange={e => setOutrosPay(e.target.value)} className="mt-1 font-mono" />
                    </div>
                  </div>
                  {/* Total destaque */}
                  <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-3 shadow-sm">
                    <span className="text-white font-semibold text-sm">Total a pagar</span>
                    <span className="text-white text-2xl font-bold tabular-nums">{formatBRL(totalPagar)}</span>
                  </div>
                </div>

                {/* ── Conta Bancária + Comprovante ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conta Bancária</Label>
                    <Select
                      value={contaBancariaId != null ? String(contaBancariaId) : "none"}
                      onValueChange={v => setContaBancariaId(v === "none" ? null : Number(v))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Não informar —</SelectItem>
                        {(bankAccounts ?? []).filter((a: any) => a.ativo).map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {[a.descricao || a.banco, a.agencia ? `Ag ${a.agencia}` : null, a.conta ? `CC ${a.conta}` : null].filter(Boolean).join(" · ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comprovante / Documento</Label>
                    <Input type="file" accept=".pdf,.doc,.docx,image/*" className="mt-1"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadComprovante(f); }} disabled={uploadingComp} />
                    {uploadingComp && <p className="text-xs text-muted-foreground mt-1">Enviando…</p>}
                    {comprovanteUrl && !uploadingComp && (
                      <p className="text-xs text-emerald-700 mt-1">
                        ✓ <a href={comprovanteUrl} target="_blank" rel="noreferrer" className="underline">{comprovanteNome || "ver arquivo"}</a>
                      </p>
                    )}
                  </div>
                </div>

                {/* Rev. 4529 — Cheque: sub-abas Cheque Empresa / Cheque de Terceiro (igual Novo Lançamento) */}
                {formaPagamento === "cheque" && (
                  <div className="space-y-3">
                    {/* Sub-abas */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[12px] font-medium">
                      <button
                        type="button"
                        onClick={() => { setChequeSubtipo("empresa"); setChequesTerceiroSelAvulso([]); }}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${
                          chequeSubtipo === "empresa"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" /> Cheque Empresa
                      </button>
                      <button
                        type="button"
                        onClick={() => setChequeSubtipo("terceiros")}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors border-l border-gray-200 ${
                          chequeSubtipo === "terceiros"
                            ? "bg-emerald-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Cheque de Terceiro
                      </button>
                    </div>

                    {/* ── CHEQUE EMPRESA ────────────────────────────────────── */}
                    {chequeSubtipo === "empresa" && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                        <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                          <Banknote className="w-3.5 h-3.5" /> Cheque próprio — cadastro automático no Controle de Cheques
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">Em quantas vezes</p>
                            <Input type="number" min={1} max={120} value={chequeQtd}
                              onChange={e => setChequeQtd(e.target.value)} placeholder="1" className="h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">Nº do 1º cheque</p>
                            <Input value={chequeNumIni} onChange={e => setChequeNumIni(e.target.value)}
                              placeholder="Ex: 000429" className="h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">1º vencimento</p>
                            <Input type="date" value={chequePrimVenc}
                              onChange={e => setChequePrimVenc(e.target.value)} className="h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">Banco</p>
                            <Input value={chequeBanco} onChange={e => setChequeBanco(e.target.value)}
                              placeholder="Ex: Caixa" className="h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">Agência</p>
                            <Input value={chequeAgencia} onChange={e => setChequeAgencia(e.target.value)}
                              placeholder="Ex: 1234" className="h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">Conta corrente</p>
                            <Input value={chequeConta} onChange={e => setChequeConta(e.target.value)}
                              placeholder="Ex: 00012345-6" className="h-9" />
                          </div>
                        </div>
                        <div className="max-w-[200px]">
                          <p className="text-[11px] text-gray-400 mb-1">Situação inicial dos cheques</p>
                          <Select value={chequeStatusIni} onValueChange={setChequeStatusIni}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="compensado">Compensado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {chequePreviewBaixa.length > 0 ? (
                          <div className="rounded-lg border border-blue-200 bg-white overflow-hidden">
                            <div className="px-3 py-2 bg-blue-100/60">
                              <p className="text-[11px] font-semibold text-blue-700">
                                {chequePreviewBaixa.length} cheque{chequePreviewBaixa.length !== 1 ? "s" : ""} serão gerados no Controle de Cheques
                              </p>
                            </div>
                            <div className="divide-y divide-blue-100 max-h-36 overflow-y-auto">
                              {chequePreviewBaixa.map((p) => (
                                <div key={p.idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-blue-800 font-semibold">{p.numeroCheque}</span>
                                    <span className="text-slate-400">{p.parcela}</span>
                                    {p.dataVencimento && <span className="text-slate-500">venc. {fmtDateBR(p.dataVencimento)}</span>}
                                  </div>
                                  <span className="font-semibold tabular-nums text-slate-700">{formatBRL(p.valor)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-blue-600 italic">Informe o valor da baixa acima para visualizar os cheques.</p>
                        )}
                      </div>
                    )}

                    {/* ── CHEQUE DE TERCEIRO ──────────────────────────────────── */}
                    {chequeSubtipo === "terceiros" && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                            <ArrowLeftRight className="w-3.5 h-3.5" /> Cheques recebidos disponíveis em carteira
                          </p>
                          {chequesTerceiroSelAvulso.length > 0 && (
                            <span className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                              Math.abs(diffAvulso) <= 0.05 ? "bg-green-100 text-green-700" :
                              diffAvulso > 0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                            }`}>
                              {Math.abs(diffAvulso) <= 0.05 ? "✓ " : ""}
                              {formatBRL(totalSelecionadoAvulso)}
                              {Math.abs(diffAvulso) > 0.05 && (diffAvulso > 0 ? ` (+${formatBRL(diffAvulso)})` : ` (−${formatBRL(-diffAvulso)})`)}
                            </span>
                          )}
                        </div>
                    {chequesDisponiveisAvulsoQ?.isLoading ? (
                      <div className="text-xs text-muted-foreground py-2">Buscando cheques disponíveis…</div>
                    ) : chequesDisponiveisAvulso.length === 0 ? (
                      <div className="text-xs text-violet-700 bg-violet-100 rounded p-2">
                        Nenhum cheque recebido disponível. Cadastre na aba "Cheques Recebidos" do Controle de Cheques.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {chequesDisponiveisAvulso.map((c: any) => {
                          const sel = chequesTerceiroSelAvulso.includes(c.id);
                          return (
                            <div key={c.id}
                              onClick={() => setChequesTerceiroSelAvulso(prev => sel ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                              className={`flex items-center justify-between cursor-pointer rounded border px-3 py-1.5 transition-colors ${sel ? "bg-violet-100 border-violet-400" : "bg-white border-violet-100 hover:border-violet-300"}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${sel ? "bg-violet-600 border-violet-600" : "border-gray-300"}`} />
                                <span className="font-mono text-xs font-semibold text-violet-800">{c.numero_cheque}</span>
                                {c.emitente_nome && <span className="text-xs text-muted-foreground truncate">{c.emitente_nome}</span>}
                                {c.data_bom_para && <span className="text-[10px] text-muted-foreground shrink-0">bom {c.data_bom_para?.slice(0, 10)}</span>}
                              </div>
                              <span className="text-xs font-semibold tabular-nums ml-2 shrink-0">{formatBRL(Number(c.valor))}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {chequesTerceiroSelAvulso.length > 0
                      ? <p className="text-[10px] text-emerald-700">{chequesTerceiroSelAvulso.length} cheque(s) selecionado(s) · serão marcados como "Alocado" ao confirmar.</p>
                      : <p className="text-[10px] text-emerald-600">Selecione um ou mais cheques que somem o valor da baixa.</p>
                    }
                      </div>
                    )}
                  </div>
                )}

                {/* Rev. 2655 — Observações */}
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={2} value={obsPay} onChange={e => setObsPay(e.target.value)} placeholder="Observações da baixa (opcional)" />
                </div>

                {/* Rev. 3743 — Histórico de baixas do título (parciais) + estorno por baixa */}
                {Array.isArray(baixasQuery.data) && baixasQuery.data.length > 0 && (
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Histórico de baixas</p>
                    <div className="space-y-1.5">
                      {baixasQuery.data.map((b: any) => {
                        const estornada = !!b.estornadaEm;
                        return (
                          <div key={b.id} className={`flex items-center justify-between gap-2 text-xs rounded px-2 py-1.5 border ${estornada ? "bg-slate-100 border-slate-200 opacity-60" : "bg-white border-slate-200"}`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold tabular-nums ${estornada ? "line-through text-slate-400" : "text-green-700"}`}>{formatBRL(Number(b.valor ?? 0))}</span>
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
            )}
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowPay(null)}>Cancelar</Button>
              {/* Opção C — Quitar saldo: fecha o título mesmo com sobra de centavo/juros/desconto */}
              <Button variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={payMut.isPending || uploadingComp}
                onClick={() => {
                  // Rev. 4096 — validação: cheque_terceiro exige pelo menos 1 cheque selecionado
                  if (formaPagamento === "cheque_terceiro" && chequesTerceiroSelAvulso.length === 0) {
                    toast({ title: "Selecione pelo menos um cheque recebido", variant: "destructive" }); return;
                  }
                  payMut.mutate({ ...baixaPayload(), quitarTotal: true });
                }}>
                Quitar saldo
              </Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={payMut.isPending || uploadingComp}
                onClick={() => {
                  // Rev. 4096 — validação: cheque_terceiro exige pelo menos 1 cheque selecionado
                  if (formaPagamento === "cheque_terceiro" && chequesTerceiroSelAvulso.length === 0) {
                    toast({ title: "Selecione pelo menos um cheque recebido", variant: "destructive" }); return;
                  }
                  payMut.mutate(baixaPayload());
                }}>
                {payMut.isPending ? "Registrando..." : "Registrar baixa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
