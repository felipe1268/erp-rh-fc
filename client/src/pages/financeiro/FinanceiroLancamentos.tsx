import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/_core/hooks/useAuth";
// Rev. 1626 — origens com label PT-BR amigável
import { originLabel } from "@/lib/financialOrigins";
import {
  Plus, Search, X, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Filter,
  Repeat, Pause, Play, Edit2, Calendar, Zap, ArrowUpRight, ArrowDownRight,
  Building2, CreditCard, FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, RefreshCw,
  ArrowLeftRight, Landmark, PlusCircle, Tag, Loader2, Pencil, Trash2, Eye,
  Fuel, Wrench, Truck, Layers, Briefcase, Banknote,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// Rev. 3330 — soma `months` meses a uma data ISO "YYYY-MM-DD" (parcelas de cheque).
// Constrói a partir das PARTES numéricas (não do parse de string) p/ evitar bug de
// fuso/iOS; usa UTC e deixa o Date normalizar overflow de mês (ex.: 31/01 + 1 mês).
function addMonthsISO(iso: string, months: number): string {
  const t = String(iso || "").slice(0, 10);
  const m = t.split("-");
  if (m.length < 3) return t;
  const y = parseInt(m[0], 10), mo = parseInt(m[1], 10) - 1, d = parseInt(m[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return t;
  // Rev. 3330 — soma de mês com CLAMP para o último dia do mês de destino, evitando
  // o overflow do Date (31/01 + 1 mês iria pra 03/03; aqui vira 28/02 ou 29/02).
  const alvoMes = mo + months;
  const ultimoDia = new Date(Date.UTC(y, alvoMes + 1, 0)).getUTCDate();
  const diaClamp = Math.min(d, ultimoDia);
  return new Date(Date.UTC(y, alvoMes, diaClamp)).toISOString().slice(0, 10);
}

// Rev. 1626 — regra de ouro: dd/MM/aaaa
function fmtDateBR(s: string | null | undefined): string {
  if (!s) return "—";
  const t = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : t;
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Rev. 2399 — período livre (calendário aberto, passado E futuro).
function getPrimeiroDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function getUltimoDiaMes() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  previsto: "bg-gray-100 text-gray-700",
  a_pagar: "bg-orange-100 text-orange-700",
  a_receber: "bg-blue-100 text-blue-700",
  pago: "bg-green-100 text-green-700",
  recebido: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
  provisionado: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  previsto: "Previsto",
  a_pagar: "A Pagar",
  a_receber: "A Receber",
  pago: "Pago",
  recebido: "Recebido",
  cancelado: "Cancelado",
  provisionado: "Provisionado",
};

const FREQ_LABELS: Record<string, string> = {
  mensal: "Mensal", quinzenal: "Quinzenal", semanal: "Semanal",
  trimestral: "Trimestral", anual: "Anual",
};

// Rev. 3154 — Agrupamento dos lançamentos vindos do módulo FROTA (combustível,
// manutenção, pedágio/Sem Parar) numa única linha, p/ deixar a lista limpa.
// O detalhe (todos os lançamentos do grupo) abre num diálogo ao clicar.
// Rev. 3155 — o agrupamento passou a ser por POSTO/FORNECEDOR (o backend enriquece
// `frotaFornecedor` a partir das tabelas da Frota), com fallback p/ TIPO quando o
// posto/fornecedor não veio.
type FrotaGrupo = { key: string; label: string; tipoKey: string };
function isFrotaLanc(l: any): boolean {
  return typeof l?.origemModulo === "string" && l.origemModulo.startsWith("frota");
}
// Rev. 3155 — tipo do lançamento de frota (define o ÍCONE e o rótulo de fallback).
function frotaTipoKey(l: any): { tipoKey: string; tipoLabel: string } {
  const om = l.origemModulo as string;
  const txt = `${l.descricao ?? ""} ${l.contaNome ?? ""} ${l.origemDescricao ?? ""}`.toLowerCase();
  // Pedágio/Sem Parar pode chegar como origem própria (futura) ou embutido na
  // descrição/conta de abastecimento — detecta por texto antes do combustível.
  if (om === "frota_pedagio" || txt.includes("pedág") || txt.includes("pedag") || txt.includes("sem parar")) {
    return { tipoKey: "pedagio", tipoLabel: "Pedágio / Sem Parar" };
  }
  if (om === "frota_manutencao") return { tipoKey: "manutencao", tipoLabel: "Manutenção de Veículos" };
  if (om === "frota_abastecimento") return { tipoKey: "combustivel", tipoLabel: "Combustível" };
  return { tipoKey: "frota_outros", tipoLabel: "Frota (outros)" };
}
// Rev. 3155 — agrupa os lançamentos de Frota por FORNECEDOR/POSTO (o backend enriquece
// `frotaFornecedor` a partir de fleet_fuel_records.posto / fleet_maintenances.fornecedor).
// A chave inclui o `tipoKey` p/ NÃO misturar um posto de combustível com uma oficina de
// manutenção de mesmo nome (e p/ manter o ícone correto). Sem posto/fornecedor cai no
// agrupamento por tipo ("Combustível (sem posto)" / "Manutenção (sem fornecedor)").
function frotaGrupoOf(l: any): FrotaGrupo | null {
  if (!isFrotaLanc(l)) return null;
  const { tipoKey, tipoLabel } = frotaTipoKey(l);
  const forn = String(l.frotaFornecedor ?? "").trim();
  if (forn) {
    return { key: `${tipoKey}::${forn.toLowerCase()}`, label: forn, tipoKey };
  }
  const semLabel =
    tipoKey === "combustivel" ? "Combustível (sem posto)" :
    tipoKey === "manutencao" ? "Manutenção (sem fornecedor)" :
    tipoLabel;
  return { key: tipoKey, label: semLabel, tipoKey };
}
const FROTA_GRUPO_ICONS: Record<string, any> = {
  combustivel: Fuel,
  manutencao: Wrench,
  pedagio: CreditCard,
  frota_outros: Truck,
};

// Rev. 3164 — Agrupamento dos PAGAMENTOS PJ (origem 'pagamento_pj') por MÊS de
// competência numa ÚNICA linha — mesma lógica visual da Folha de Pagamento: a lista
// mostra o TOTAL pago no mês; clicar abre o diálogo com cada adiantamento/fechamento
// (rastreável por contratado, via `pjFornecedor` enriquecido no backend). Os
// lançamentos individuais permanecem intactos (baixa/conciliação seguem por item).
function isPjLanc(l: any): boolean {
  return l?.origemModulo === "pagamento_pj";
}
function pjGrupoOf(l: any): { key: string; label: string } | null {
  if (!isPjLanc(l)) return null;
  const ym = String(l.dataCompetencia ?? l.dataVencimento ?? "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(ym)) {
    const [a, m] = ym.split("-");
    return { key: `pj::${ym}`, label: `Pagamentos PJ — ${MESES[Number(m) - 1]}/${a}` };
  }
  return { key: "pj::sem-data", label: "Pagamentos PJ" };
}

// Rev. 3156 — "Ruído" de cancelados: um lançamento CANCELADO que veio de OUTRO
// módulo (origem não-financeira) e que NUNCA teve baixa no financeiro (nunca foi
// pago/recebido) é pura poluição visual — o cancelamento aconteceu na ORIGEM
// (ex.: OC/Compra/Frota cancelada lá), não no financeiro, e não houve nenhum
// movimento de caixa. Esses somem SEMPRE da lista (inclusive no filtro
// "Cancelado"). Permanecem: o que foi cancelado DENTRO do financeiro (origem
// manual/recorrente/importação) OU o que teve baixa em algum momento (há rastro
// real de pagamento/realizado).
const FINANCEIRO_NATIVE_ORIGENS = new Set(["recorrente", "importacao_excel"]);
function teveBaixaFinanceiro(l: any): boolean {
  return l?.dataPagamento != null || Number(l?.valorRealizado ?? 0) > 0;
}
function isCanceladoRuido(l: any): boolean {
  if (l?.status !== "cancelado") return false;
  const om = l?.origemModulo;
  // origem null = lançamento manual (financeiro-nativo) → não é ruído.
  const origemExterna = !!om && !FINANCEIRO_NATIVE_ORIGENS.has(om);
  return origemExterna && !teveBaixaFinanceiro(l);
}

// Rev. 3153 — iPad/iOS Safari derruba a request de mutations em lote (45+ ids) e a
// DOMException chega CRUA como "The string did not match the expected pattern" (e
// variantes "load failed"/"failed to fetch"/aborted/timeout). Como as ações em lote
// (baixa/estorno/exclusão) são IDEMPOTENTES no backend, a operação muitas vezes JÁ
// foi aplicada no servidor mesmo quando o iOS reporta erro. Detectamos o erro de
// TRANSPORTE p/ tratar com mensagem branda + refetch (refletindo o estado real),
// em vez de jogar a DOMException críptica na cara do usuário.
function isTransportErr(msg?: string | null): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("did not match the expected pattern") ||
    m.includes("load failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network connection") ||
    m.includes("the operation couldn't be completed") ||
    m.includes("aborted") ||
    m.includes("timed out") ||
    m.includes("tempo limite")
  );
}

// Rev. 3133 — timeline de meses (padrão Contas a Receber/Pagar).
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Rev. 3514 — nomes completos para cabeçalhos de período
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const INITIAL_FORM = {
  modoRecorrente: false,
  tipo: "despesa" as string,
  natureza: "fixo",
  valorPrevisto: "",
  dataCompetencia: new Date().toISOString().split("T")[0],
  dataVencimento: "",
  descricao: "",
  contaNome: "",
  obraNome: "",
  formaPagamento: "",
  observacoes: "",
  status: "a_pagar",
  frequencia: "mensal",
  diaVencimento: "5",
  fornecedorNome: "",
  // Rev. 2693 — Transferência entre contas (origem → destino)
  contaBancariaOrigemId: "",
  contaBancariaDestinoId: "",
  // Rev. 3211 — Gancho cartão de crédito (só usado quando formaPagamento="cartao_credito").
  cartaoId: "",
  cartaoParcelas: "",
  cartaoEstabelecimento: "",
  // Rev. 3330 — Gancho CHEQUE (só usado quando formaPagamento="cheque" e tipo="despesa").
  // Ao lançar, cadastra automaticamente N cheques no Controle de Cheques.
  chequeParcelas: "1",
  chequeNumeroInicial: "",
  chequeBanco: "",
  chequeAgencia: "",
  chequeConta: "",
  chequePrimeiroVenc: "",
  chequeStatus: "pendente",
  // Rev. 4104 — subtipo de cheque: "empresa" = cheque próprio emitido; "terceiros" = usa carteira de recebidos.
  chequeSubtipo: "empresa" as "empresa" | "terceiros",
  // Forma de pagamento do complemento quando cheques de terceiros não cobrem 100% do valor.
  chequeComplementoForma: "pix",
};

export default function FinanceiroLancamentos() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  // Rev. 3148 — "Zerar mês" é exclusivo do admin master (gate também no backend).
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";

  const [aba, setAba] = useState<"lancamentos" | "recorrencias">("lancamentos");
  // Rev. 2399 — filtro por PERÍODO LIVRE (passado E futuro). Default = mês atual.
  const [dataInicio, setDataInicio] = useState(getPrimeiroDiaMes());
  const [dataFim, setDataFim] = useState(getUltimoDiaMes());
  // Rev. 3133 — período conduzido pela TIMELINE Ano + faixa de meses (mesmo
  // padrão do Contas a Receber/Pagar). `mesSel=null` = "Ano todo".
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [tipo, setTipo] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Rev. 3152 — esconde lançamentos cancelados por padrão (lista limpa no dia a
  // dia + totais batendo); o usuário revela via botão "Mostrar cancelados" quando
  // precisa auditar. O rastro nunca é apagado, só ocultado.
  const [showCancelados, setShowCancelados] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showCancel, setShowCancel] = useState<{ id: number } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editRecId, setEditRecId] = useState<number | null>(null);
  // Rev. 2398 — edição + exclusão de lançamento manual (na aba Lançamentos).
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [showDelete, setShowDelete] = useState<{ id: number; desc: string } | null>(null);
  const [deleteMotivo, setDeleteMotivo] = useState("");
  // Rev. 2656 — Visualizar (detalhe read-only).
  const [viewId, setViewId] = useState<number | null>(null);
  const [showObs, setShowObs] = useState(false);
  // Rev. 3154 — Agrupar lançamentos de Frota por tipo (combustível/manutenção/
  // pedágio) numa linha só; clicar abre o diálogo com todos do grupo.
  const [agrupar, setAgrupar] = useState(true);
  const [grupoKey, setGrupoKey] = useState<string | null>(null);
  // Rev. 3139 — Seleção múltipla p/ baixa/estorno em lote (conciliação bancária).
  // Rev. 3141 — seleção SEMPRE ativa (sem botão de alternância); checkbox por linha sempre visível.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBaixaOpen, setBulkBaixaOpen] = useState(false);
  const [bulkBaixaData, setBulkBaixaData] = useState(new Date().toISOString().split("T")[0]);
  const [bulkEstornarOpen, setBulkEstornarOpen] = useState(false);
  const [bulkEstornarMotivo, setBulkEstornarMotivo] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteMotivo, setBulkDeleteMotivo] = useState("");
  // Rev. 3148 — "Zerar mês" (admin master + senha).
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipePassword, setWipePassword] = useState("");
  const [wipeMotivo, setWipeMotivo] = useState("");
  const [form, setForm] = useState({ ...INITIAL_FORM });

  // Rev. 2082 — Cadastro inline de categoria sem sair do modal "Novo Lançamento".
  const [showNewCat, setShowNewCat] = useState(false);
  const [catForm, setCatForm] = useState({ nome: "", natureza: "variavel" as string, centroCustoId: "" as string });

  // Rev. 3161 — Recebíveis Previstos: tela à parte p/ transferir previstos → Contas a Receber.
  const [showPrevistos, setShowPrevistos] = useState(false);
  const [selPrevistos, setSelPrevistos] = useState<Set<number>>(new Set());

  const { data, isLoading, refetch } = (trpc as any).financial.getEntries.useQuery(
    {
      companyId,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      tipo: tipo !== "all" ? tipo : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      // Rev. 3136 — fora as projeções do cronograma: a tela de Lançamentos mostra só
      // caixa REAL (o que entrou/saiu das contas). A função "Cronograma" segue intacta
      // nas telas próprias (Cronograma Financeiro etc.).
      excluirCronograma: true,
      limit: 500,
      offset: 0,
    },
    { enabled: !!companyId }
  );

  const { data: recItems, isLoading: recLoading, refetch: recRefetch } = (trpc as any).financial.getRecurringEntries.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Rev. 3145 — Totais do período somados NO SERVIDOR (todos os lançamentos),
  // não só os 500 que a lista carrega. Mesmos filtros do getEntries acima.
  const { data: totais } = (trpc as any).financial.getEntriesTotais.useQuery(
    {
      companyId,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      tipo: tipo !== "all" ? tipo : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      excluirCronograma: true,
      search: search || undefined,
    },
    { enabled: !!companyId }
  );

  // Rev. 3133 — a TIMELINE comanda o período: ao trocar de ano/mês, recalcula
  // dataInicio/dataFim (que continuam sendo a fonte de verdade do getEntries).
  useEffect(() => {
    if (mesSel == null) {
      setDataInicio(`${ano}-01-01`);
      setDataFim(`${ano}-12-31`);
    } else {
      const mm = String(mesSel).padStart(2, "0");
      const ultimo = new Date(ano, mesSel, 0).getDate();
      setDataInicio(`${ano}-${mm}-01`);
      setDataFim(`${ano}-${mm}-${String(ultimo).padStart(2, "0")}`);
    }
  }, [ano, mesSel]);

  // Rev. 3133 — resumo por mês p/ as bolinhas da timeline (mesmo padrão visual
  // do Contas a Pagar): verde=consolidado (tudo pago/recebido), azul=com
  // lançamento (tem algo em aberto), cinza=sem dados.
  const { data: resumoMensal } = (trpc as any).financial.getEntriesResumoMensal.useQuery(
    { companyId, ano, tipo: tipo !== "all" ? tipo : undefined, excluirCronograma: true },
    { enabled: !!companyId }
  );
  const mesesStatus: Record<number, "consolidado" | "lancamento" | "vazio"> = (() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    for (const r of (resumoMensal ?? [])) {
      const m = Number(r.mes);
      if (!m) continue;
      map[m] = Number(r.total) === 0 ? "vazio" : Number(r.abertos) === 0 ? "consolidado" : "lancamento";
    }
    return map;
  })();

  // Rev. 2656 — detalhe read-only do lançamento (botão "Visualizar").
  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: viewId ?? 0, companyId },
    { enabled: !!viewId && !!companyId }
  );

  // Rev. 2656 — Lançamentos e Contas a Pagar/Receber leem a MESMA tabela
  // (financial_entries). Ao editar/excluir aqui, invalidamos também as queries
  // do Contas a Pagar/Receber para o "link" ser automático nos dois sentidos.
  const utils = (trpc as any).useUtils();
  function invalidarContas() {
    try {
      utils.financial.getContasAPagarByYear?.invalidate?.();
      utils.financial.getContasAReceber?.invalidate?.();
      utils.financial.getEntries?.invalidate?.();
      utils.financial.getEntryDetalhe?.invalidate?.();
      utils.financial.getEntriesResumoMensal?.invalidate?.(); // Rev. 3133 — atualiza as bolinhas da timeline.
      utils.financial.getEntriesTotais?.invalidate?.(); // Rev. 3145 — mantém os cards de total atualizados pós-mutação.
    } catch { /* noop */ }
  }

  // Rev. 3161 — Recebíveis Previstos (financial_revenue ainda não lançados em Contas a Receber).
  // Escopo segue a timeline da tela: mês selecionado (mesSel) ou TODOS quando "Ano todo" (mesSel=null).
  const previstosMes = mesSel != null ? `${ano}-${String(mesSel).padStart(2, "0")}` : undefined;
  const { data: previstosData, refetch: refetchPrevistos } = (trpc as any).financial.getRecebiveisPrevistos.useQuery(
    { companyId, mes: previstosMes },
    { enabled: !!companyId }
  );
  const previstosItems: any[] = previstosData?.items ?? [];
  const previstosCount = previstosData?.total ?? 0;
  const togglePrevisto = (id: number) => setSelPrevistos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllPrevistos = () => setSelPrevistos(prev => prev.size === previstosItems.length ? new Set() : new Set(previstosItems.map((i: any) => i.id)));
  const selPrevistosTotal = previstosItems.filter((i: any) => selPrevistos.has(i.id)).reduce((s: number, i: any) => s + (i.valor || 0), 0);
  const transferirPrevistosMut = (trpc as any).financial.transferirRecebiveisPrevistos.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: `${res.lancados} recebível(is) lançado(s) em Contas a Receber`,
        description: res.pulados > 0 ? `${res.pulados} já estavam lançados (ignorados).` : undefined,
      });
      setSelPrevistos(new Set());
      refetchPrevistos();
      refetch();
      invalidarContas();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createEntryMut = (trpc as any).financial.createEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento criado!" }); setShowNew(false); resetForm(); refetch(); invalidarContas(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 3330 — ao lançar uma despesa por CHEQUE, cadastra automaticamente os
  // cheques (1+ parcelas) no Controle de Cheques. Disparado no onSuccess do
  // createEntry; o lançamento já está salvo, então erro aqui é informativo (não
  // some com a despesa). Dedup natural ignora cheques que já existirem.
  const criarChequesLoteMut = (trpc as any).cheques.criarManualLote.useMutation({
    onSuccess: (r: any) => {
      if (r?.criados > 0) {
        toast({
          title: `${r.criados} cheque${r.criados !== 1 ? "s" : ""} cadastrado${r.criados !== 1 ? "s" : ""} no Controle de Cheques`,
          description: r.pulados > 0 ? `${r.pulados} já existia(m) no controle (ignorado(s)).` : undefined,
        });
      } else {
        toast({ title: "Cheques já cadastrados", description: "Todos os cheques desta despesa já constavam no Controle de Cheques." });
      }
    },
    onError: (e: any) => toast({
      title: "Despesa lançada, mas falhou ao registrar os cheques",
      description: e.message, variant: "destructive",
    }),
  });

  const createRecMut = (trpc as any).financial.createRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência criada!" }); setShowNew(false); resetForm(); recRefetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateRecMut = (trpc as any).financial.updateRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência atualizada!" }); setShowNew(false); resetForm(); recRefetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const generateMut = (trpc as any).financial.generateRecurringEntries.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.generated > 0 ? `${res.generated} lançamento(s) gerado(s)!` : "Nenhum lançamento pendente para gerar" });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const cancelMut = (trpc as any).financial.cancelEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento cancelado" }); setShowCancel(null); refetch(); invalidarContas(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 2398 — edit + delete de lançamento manual.
  const updateEntryMut = (trpc as any).financial.updateEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento atualizado!" }); setShowNew(false); resetForm(); refetch(); invalidarContas(); },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
  const deleteEntryMut = (trpc as any).financial.deleteEntry.useMutation({
    onSuccess: () => {
      toast({ title: "Lançamento excluído" });
      setShowDelete(null);
      setDeleteMotivo("");
      refetch();
      invalidarContas();
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const paidMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); refetch(); invalidarContas(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 3139 — Seleção múltipla + baixa/estorno em lote (conciliação bancária).
  // Rev. 3153 — retry resiliente: só re-tenta quando o erro é de TRANSPORTE (iOS
  // derrubou a request); ações em lote são idempotentes no backend, então re-tentar
  // é seguro. Erros de regra de negócio NÃO re-tentam.
  // react-query v5: `retry(failureCount, error)` é chamado APÓS cada falha, com
  // failureCount = nº de falhas até agora (1 na 1ª). `count <= 2` ⇒ re-tenta após a
  // 1ª e a 2ª falha e para na 3ª = ATÉ 2 retries (3 tentativas no total).
  const bulkRetry = (count: number, e: any) => count <= 2 && isTransportErr(e?.message);
  // Tratamento comum do onError em lote: se foi transporte (iOS), a operação pode já
  // ter sido aplicada no servidor (idempotente) → fecha, limpa seleção, refetch e
  // mostra aviso brando em vez da DOMException críptica.
  const onBulkTransportFallback = (close: () => void) => {
    setSelectedIds(new Set());
    close();
    refetch(); invalidarContas();
    toast({
      title: "Conexão instável",
      description: "A ação pode ter sido aplicada. Atualizamos a lista — confira os status. Se faltou algo, refaça a seleção e tente de novo.",
    });
  };
  const bulkBaixaMut = (trpc as any).financial.bulkBaixa.useMutation({
    retry: bulkRetry,
    onSuccess: (r: any) => {
      toast({ title: "Baixa em lote concluída", description: `${r?.updated ?? 0} lançamento(s) marcados como pago/recebido.` });
      setSelectedIds(new Set());
      setBulkBaixaOpen(false);
      refetch(); invalidarContas();
    },
    onError: (e: any) => {
      if (isTransportErr(e?.message)) return onBulkTransportFallback(() => setBulkBaixaOpen(false));
      toast({ title: "Erro na baixa em lote", description: e.message, variant: "destructive" });
    },
  });
  const bulkEstornarMut = (trpc as any).financial.bulkEstornar.useMutation({
    retry: bulkRetry,
    onSuccess: (r: any) => {
      toast({ title: "Estorno em lote concluído", description: `${r?.updated ?? 0} baixa(s) canceladas.` });
      setSelectedIds(new Set());
      setBulkEstornarOpen(false);
      refetch(); invalidarContas();
    },
    onError: (e: any) => {
      if (isTransportErr(e?.message)) return onBulkTransportFallback(() => setBulkEstornarOpen(false));
      toast({ title: "Erro no estorno em lote", description: e.message, variant: "destructive" });
    },
  });
  const bulkDeleteMut = (trpc as any).financial.bulkDelete.useMutation({
    retry: bulkRetry,
    onSuccess: (r: any) => {
      toast({ title: "Exclusão em lote concluída", description: `${r?.deleted ?? 0} lançamento(s) excluído(s).` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      setBulkDeleteMotivo("");
      refetch(); invalidarContas();
    },
    onError: (e: any) => {
      if (isTransportErr(e?.message)) { setBulkDeleteMotivo(""); return onBulkTransportFallback(() => setBulkDeleteOpen(false)); }
      toast({ title: "Erro na exclusão em lote", description: e.message, variant: "destructive" });
    },
  });
  // Rev. 3148 — ZERAR MÊS (admin master + senha conferida no backend).
  const wipeMonthMut = (trpc as any).financial.wipeMonthEntries.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "Mês zerado", description: `${r?.deleted ?? 0} lançamento(s) apagado(s). O mês ficou zerado.` });
      setWipeOpen(false); setWipePassword(""); setWipeMotivo("");
      setSelectedIds(new Set());
      refetch(); invalidarContas();
      utils.financial.getEntriesTotais?.invalidate?.();
      utils.financial.getEntriesResumoMensal?.invalidate?.();
    },
    onError: (e: any) => toast({ title: "Não foi possível zerar o mês", description: e.message, variant: "destructive" }),
  });

  // Rev. 2082 — Categorias (financial_accounts) + Centros de Custo + Mutation cadastro inline.
  const { data: accounts, refetch: refetchAccounts } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId },
  );
  const { data: costCenters } = (trpc as any).financial.getCostCenters.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  // Rev. 2693 — Contas bancárias (origem/destino da transferência entre contas).
  // Rev. 3211 — cartões cadastrados, p/ o gancho "forma de pagamento = Cartão de Crédito".
  const { data: cartoesList } = (trpc as any).cartao.listarCartoes.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId },
  );
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  // Rev. 2226 — Fornecedores/Prestadores cadastrados (compras.listarFornecedores)
  // para autocomplete do campo "Fornecedor / Pagador" em AMBOS modos (único e recorrente).
  const { data: fornecedoresList } = (trpc as any).compras.listarFornecedores.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId },
  );
  // Rev. 3125 — Obras ativas (obras.listActive) para o campo "Obra (opcional)" virar seleção.
  const { data: obrasAtivasList } = (trpc as any).obras.listActive.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  const obrasOptions: { id: number; nome: string }[] = (() => {
    const list: any[] = Array.isArray(obrasAtivasList) ? obrasAtivasList : [];
    const seen = new Set<string>();
    const out: { id: number; nome: string }[] = [];
    for (const o of list) {
      const nome = (o?.nome ?? "").trim();
      if (!nome) continue;
      const key = nome.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: o.id, nome });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  })();
  const fornecedoresOptions: { id: number; nome: string; cnpj?: string }[] = (() => {
    const list: any[] = Array.isArray(fornecedoresList) ? fornecedoresList : [];
    const seen = new Set<string>();
    const out: any[] = [];
    for (const f of list) {
      const nome = String(f.nomeFantasia || f.razaoSocial || "").trim();
      if (!nome) continue;
      const k = nome.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: f.id, nome, cnpj: f.cnpj });
    }
    return out;
  })();
  const createAccountMut = (trpc as any).financial.createAccount.useMutation({
    // Rev. 2082 — lemos `vars.nome` (input enviado na mutation) ao invés de `catForm.nome` do state,
    // pra evitar leitura de state stale caso o usuário altere/limpe o sub-dialog antes do retorno.
    onSuccess: (res: any, vars: any) => {
      const nome = String(vars?.nome ?? "").trim();
      toast({ title: res?.alreadyExists ? "Categoria já existia — vinculada" : "Categoria cadastrada!" });
      if (nome) setForm(f => ({ ...f, contaNome: nome }));
      setShowNewCat(false);
      setCatForm({ nome: "", natureza: "variavel", centroCustoId: "" });
      refetchAccounts();
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar categoria", description: e.message, variant: "destructive" }),
  });

  // Categorias filtradas pelo tipo do lançamento atual (despesa/receita/imposto/transferência → conta_natureza correspondente).
  // Mostra TODAS se nenhum filtro fizer sentido, e dedup por nome (case-insensitive) para evitar duplicatas visuais.
  // Rev. 2397 — também devolve `natureza` (fixo/variavel) pra herdar no form quando o user seleciona a categoria.
  const categoriasFiltradas: { id: number; nome: string; natureza: string | null; centroCustoId: number | null }[] = (() => {
    const list: any[] = Array.isArray(accounts) ? accounts : [];
    const dedupSeen = new Set<string>();
    const out: any[] = [];
    for (const a of list) {
      // Filtra por tipo quando aplicável: lançamento de receita → financial_accounts.tipo='receita', despesa/imposto → 'despesa'
      const tipoFiltro = form.tipo === "receita" ? "receita" : (form.tipo === "transferencia" ? null : "despesa");
      if (tipoFiltro && String(a.tipo) !== tipoFiltro) continue;
      const k = String(a.nome || "").trim().toLowerCase();
      if (!k || dedupSeen.has(k)) continue;
      dedupSeen.add(k);
      out.push({ id: a.id, nome: a.nome, natureza: a.natureza ?? null, centroCustoId: a.centroCustoId ?? null });
    }
    return out;
  })();

  // Rev. 2397 — categoria atualmente selecionada (match exato case-insensitive)
  // para herdar a `natureza` cadastrada e travar o Select.
  const categoriaSelecionada = (() => {
    const nome = (form.contaNome ?? "").trim().toLowerCase();
    if (!nome) return null;
    return categoriasFiltradas.find(c => String(c.nome).trim().toLowerCase() === nome) ?? null;
  })();
  const naturezaHerdada = categoriaSelecionada?.natureza === "fixo" || categoriaSelecionada?.natureza === "variavel"
    ? categoriaSelecionada.natureza
    : null;

  // Rev. 2397 — quando o user seleciona uma categoria que tem natureza cadastrada,
  // sincroniza form.natureza automaticamente. Se trocar pra outra categoria, atualiza.
  // Se remover/limpar a categoria, mantém o último valor (usuário pode ajustar manualmente).
  useEffect(() => {
    if (naturezaHerdada && form.natureza !== naturezaHerdada) {
      setForm(f => ({ ...f, natureza: naturezaHerdada }));
    }
  }, [naturezaHerdada]);

  function handleCadastrarCategoria() {
    const nome = catForm.nome.trim();
    if (nome.length < 2) {
      toast({ title: "Informe o nome da categoria (mín. 2 caracteres)", variant: "destructive" });
      return;
    }
    createAccountMut.mutate({
      companyId,
      nome,
      tipo: form.tipo === "receita" ? "receita" : "despesa",
      natureza: catForm.natureza || "variavel",
      centroCustoId: catForm.centroCustoId ? Number(catForm.centroCustoId) : undefined,
    });
  }

  function resetForm() {
    setForm({ ...INITIAL_FORM });
    setEditRecId(null);
    setEditEntryId(null);
  }

  // Rev. 2398 — abre o modal "Novo Lançamento" no modo edição, carregando
  // os dados do lançamento manual. Só pra entries SEM origem (manual) ou
  // origem='recorrente' (que ainda tem aba própria — aqui só edita a row).
  function openEditEntry(l: any) {
    // Rev. 3150 — lançamentos importados da planilha ('importacao_excel') são
    // editáveis aqui (NÃO há "origem viva" pra editar — foi um cadastro único),
    // assim como manuais e recorrentes. Demais origens (Compras/Folha/etc.)
    // seguem bloqueadas no modal (edite na origem).
    if (l.origemModulo && l.origemModulo !== "recorrente" && l.origemModulo !== "importacao_excel") {
      toast({
        title: "Edição bloqueada",
        description: `Lançamento vinculado a "${originLabel(l.origemModulo)}" — edite na origem.`,
        variant: "destructive",
      });
      return;
    }
    if (l.status === "pago" || l.status === "recebido") {
      toast({
        title: "Lançamento já pago",
        description: "Estorne o pagamento antes de editar.",
        variant: "destructive",
      });
      return;
    }
    if (l.status === "cancelado") {
      toast({ title: "Lançamento cancelado não pode ser editado.", variant: "destructive" });
      return;
    }
    setEditEntryId(l.id);
    setForm({
      ...INITIAL_FORM,
      modoRecorrente: false,
      tipo: l.tipo ?? "despesa",
      natureza: l.natureza ?? "fixo",
      valorPrevisto: String(l.valorPrevisto ?? ""),
      dataCompetencia: (l.dataCompetencia ?? "").slice(0, 10) || new Date().toISOString().split("T")[0],
      dataVencimento: (l.dataVencimento ?? "").slice(0, 10),
      descricao: l.descricao ?? "",
      contaNome: l.contaNome ?? "",
      obraNome: l.obraNome ?? "",
      formaPagamento: l.formaPagamento ?? "",
      fornecedorNome: l.fornecedorNome ?? "",
      observacoes: l.observacoes ?? "",
      status: l.status ?? "a_pagar",
    });
    setShowNew(true);
  }

  function openNew() {
    resetForm();
    setShowNew(true);
  }

  function openEditRec(item: any) {
    setEditRecId(item.id);
    setForm({
      ...INITIAL_FORM,
      modoRecorrente: true,
      descricao: item.descricao ?? "",
      valorPrevisto: String(item.valor ?? ""),
      tipo: item.tipo ?? "despesa",
      natureza: item.natureza ?? "fixo",
      contaNome: item.contaNome ?? "",
      obraNome: item.obraNome ?? "",
      frequencia: item.frequencia ?? "mensal",
      diaVencimento: String(item.diaVencimento ?? "5"),
      formaPagamento: item.formaPagamento ?? "",
      fornecedorNome: item.fornecedorNome ?? "",
      observacoes: item.observacoes ?? "",
    });
    setShowNew(true);
  }

  function toggleAtivo(item: any) {
    updateRecMut.mutate({ id: item.id, companyId, ativo: item.ativo === 1 ? 0 : 1 });
  }

  // Rev. 3330 — divisão da despesa em N cheques (parcelas). Cada parcela: valor
  // (centavos exatos, o último absorve o resíduo), nº de cheque sequencial (se o
  // 1º for numérico), vencimento +1 mês a cada parcela. Alimenta o preview e o
  // payload enviado ao Controle de Cheques.
  const chequeAtivo = form.tipo === "despesa" && form.formaPagamento === "cheque";
  const chequePreview = useMemo(() => {
    if (!chequeAtivo) return [] as Array<{ idx: number; valor: number; numeroCheque: string; dataVencimento: string; parcela: string }>;
    const total = parseFloat(form.valorPrevisto) || 0;
    const n = Math.min(120, Math.max(1, parseInt(form.chequeParcelas || "1", 10) || 1));
    if (total <= 0) return [];
    const centsTotal = Math.round(total * 100);
    const base = Math.floor(centsTotal / n);
    const resto = centsTotal - base * n;
    const baseVenc = form.chequePrimeiroVenc || form.dataVencimento || form.dataCompetencia || "";
    const numIni = form.chequeNumeroInicial.trim();
    const numIniNum = /^\d+$/.test(numIni) ? parseInt(numIni, 10) : null;
    return Array.from({ length: n }, (_, i) => {
      const cents = base + (i === n - 1 ? resto : 0);
      const numeroCheque = numIniNum != null ? String(numIniNum + i) : (n === 1 ? numIni : "");
      return {
        idx: i + 1,
        valor: cents / 100,
        numeroCheque,
        dataVencimento: addMonthsISO(baseVenc, i),
        parcela: `${i + 1}/${n}`,
      };
    });
  }, [chequeAtivo, form.valorPrevisto, form.chequeParcelas, form.chequePrimeiroVenc, form.dataVencimento, form.dataCompetencia, form.chequeNumeroInicial]);

  // Rev. 4102 — Quando forma=Cheque numa despesa, busca cheques recebidos disponíveis
  // e calcula combinações (1, 2 ou 3 cheques) mais próximas do valor a pagar.
  const valorNumCheque = parseFloat(form.valorPrevisto) || 0;
  const sugerirChequesQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: valorNumCheque },
    { enabled: chequeAtivo && !!companyId && valorNumCheque > 0, staleTime: 30_000 }
  );
  const chequesRecDisponiveis: any[] = sugerirChequesQ?.data?.cheques ?? [];
  const totalChequesRecDisp = chequesRecDisponiveis.reduce((s: number, c: any) => s + Number(c.valor), 0);

  const sugestoesCheques = useMemo(() => {
    if (!chequesRecDisponiveis.length || valorNumCheque <= 0) return [];
    const pool = chequesRecDisponiveis.slice(0, 20);
    type Sug = { ids: number[]; numeros: string[]; emitentes: string[]; total: number; diferenca: number };
    const cands: Sug[] = [];
    for (const c of pool) {
      cands.push({ ids: [c.id], numeros: [c.numero_cheque ?? "S/N"], emitentes: [c.emitente_nome ?? ""], total: Number(c.valor), diferenca: Math.abs(Number(c.valor) - valorNumCheque) });
    }
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const tot = Number(pool[i].valor) + Number(pool[j].valor);
        cands.push({ ids: [pool[i].id, pool[j].id], numeros: [pool[i].numero_cheque ?? "S/N", pool[j].numero_cheque ?? "S/N"], emitentes: [pool[i].emitente_nome ?? "", pool[j].emitente_nome ?? ""], total: tot, diferenca: Math.abs(tot - valorNumCheque) });
      }
    }
    const top10 = pool.slice(0, 10);
    for (let i = 0; i < top10.length; i++) {
      for (let j = i + 1; j < top10.length; j++) {
        for (let k = j + 1; k < top10.length; k++) {
          const tot = Number(top10[i].valor) + Number(top10[j].valor) + Number(top10[k].valor);
          cands.push({ ids: [top10[i].id, top10[j].id, top10[k].id], numeros: [top10[i].numero_cheque ?? "S/N", top10[j].numero_cheque ?? "S/N", top10[k].numero_cheque ?? "S/N"], emitentes: [top10[i].emitente_nome ?? "", top10[j].emitente_nome ?? "", top10[k].emitente_nome ?? ""], total: tot, diferenca: Math.abs(tot - valorNumCheque) });
        }
      }
    }
    // Rev. 4104-fix — nunca sugerir combinação que EXCEDE o valor a pagar (sobra > 0).
    // Sugestões devem ter total ≤ valorNumCheque (falta algo ou é exato).
    const candsValidos = cands.filter(c => c.total <= valorNumCheque + 0.001);
    candsValidos.sort((a, b) => a.diferenca - b.diferenca);
    const result: Sug[] = [];
    const seen = new Set<string>();
    for (const c of candsValidos) {
      const key = [...c.ids].sort().join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(c);
      if (result.length >= 5) break;
    }
    return result;
  }, [chequesRecDisponiveis, valorNumCheque]);

  // Rev. 4104 — Cheque Terceiros: estado de seleção e derived values
  const [chequesTerceiroSel, setChequesTerceiroSel] = useState<number[]>([]);
  const totalSelecionadoTerceiro = useMemo(
    () => chequesRecDisponiveis
      .filter((c: any) => chequesTerceiroSel.includes(c.id))
      .reduce((s: number, c: any) => s + Number(c.valor), 0),
    [chequesRecDisponiveis, chequesTerceiroSel]
  );
  const diffTerceiro = Math.round((totalSelecionadoTerceiro - valorNumCheque) * 100) / 100;

  // Limpa seleção ao sair do modo cheque
  useEffect(() => { if (!chequeAtivo) setChequesTerceiroSel([]); }, [chequeAtivo]);

  // Mutation para alocar cheques após salvar a despesa
  const alocarLoteMut = (trpc as any).chequesRecebidos?.alocarLote?.useMutation({
    onError: (e: any) => toast({
      title: "Despesa salva, mas falha ao alocar cheques",
      description: `Os cheques NÃO foram marcados como Alocados: ${e.message}. Acesse o Controle de Cheques Recebidos.`,
      variant: "destructive",
    }),
  });

  function handleSave() {
    // Rev. 2693 — Transferência entre contas: fluxo enxuto (sem descrição/categoria).
    if (form.tipo === "transferencia") {
      if (!form.valorPrevisto || !form.contaBancariaOrigemId || !form.contaBancariaDestinoId) {
        toast({ title: "Informe valor, conta de origem e conta de destino", variant: "destructive" });
        return;
      }
      if (form.contaBancariaOrigemId === form.contaBancariaDestinoId) {
        toast({ title: "A conta de origem e a de destino devem ser diferentes", variant: "destructive" });
        return;
      }
      if (!form.dataCompetencia) {
        toast({ title: "Informe a data da transferência", variant: "destructive" });
        return;
      }
      createEntryMut.mutate({
        companyId,
        tipo: "transferencia",
        natureza: "variavel",
        valorPrevisto: parseFloat(form.valorPrevisto),
        dataCompetencia: form.dataCompetencia,
        dataPagamento: form.dataCompetencia,
        formaPagamento: form.formaPagamento || undefined,
        observacoes: form.observacoes || undefined,
        contaBancariaOrigemId: Number(form.contaBancariaOrigemId),
        contaBancariaDestinoId: Number(form.contaBancariaDestinoId),
        status: "pago",
      });
      return;
    }
    if (!form.valorPrevisto || !form.descricao) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    if (form.modoRecorrente) {
      const payload = {
        companyId,
        descricao: form.descricao,
        valor: parseFloat(form.valorPrevisto),
        tipo: form.tipo,
        natureza: form.natureza,
        contaNome: form.contaNome || undefined,
        obraNome: form.obraNome || undefined,
        frequencia: form.frequencia,
        diaVencimento: parseInt(form.diaVencimento) || 5,
        formaPagamento: form.formaPagamento || undefined,
        fornecedorNome: form.fornecedorNome || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (editRecId) {
        updateRecMut.mutate({ ...payload, id: editRecId });
      } else {
        createRecMut.mutate(payload);
      }
    } else {
      if (!form.dataCompetencia) {
        toast({ title: "Preencha a data de competência", variant: "destructive" });
        return;
      }
      // Rev. 2398 — se editEntryId está setado, vai pra updateEntry; senão createEntry.
      if (editEntryId) {
        updateEntryMut.mutate({
          id: editEntryId,
          companyId,
          tipo: form.tipo,
          natureza: form.natureza,
          valorPrevisto: parseFloat(form.valorPrevisto),
          dataCompetencia: form.dataCompetencia,
          dataVencimento: form.dataVencimento || undefined,
          descricao: form.descricao || "",
          contaNome: form.contaNome || "",
          obraNome: form.obraNome || "",
          formaPagamento: form.formaPagamento || "",
          fornecedorNome: form.fornecedorNome || "",
          observacoes: form.observacoes || "",
        });
      } else {
        // Rev. 4104 — Cheque Terceiros: validar seleção e capturar IDs antes do mutate.
        const isChequeEmpresa = chequeAtivo && form.chequeSubtipo === "empresa";
        const isChequeTerceiros = chequeAtivo && form.chequeSubtipo === "terceiros";

        if (isChequeTerceiros && chequesTerceiroSel.length === 0) {
          toast({ title: "Selecione pelo menos um cheque de terceiro", description: "Ou mude para Cheque Empresa.", variant: "destructive" });
          return;
        }
        // Se terceiros + complemento obrigatório mas sem forma escolhida — não bloqueia (pix é default).

        // Rev. 3330 — se a despesa é por CHEQUE EMPRESA, captura o lote de parcelas ANTES de
        // mutar (o onSuccess reseta o form) e dispara o cadastro no Controle de Cheques
        // assim que a despesa for salva.
        const chequePayload = isChequeEmpresa && chequePreview.length > 0 ? {
          companyId,
          fornecedorNome: form.fornecedorNome || undefined,
          bancoNome: form.chequeBanco || undefined,
          agencia: form.chequeAgencia || undefined,
          contaCorrenteRaw: form.chequeConta || undefined,
          status: (form.chequeStatus || "pendente") as any,
          observacao: form.descricao ? `Despesa: ${form.descricao}` : undefined,
          parcelas: chequePreview.map(p => ({
            valor: p.valor,
            numeroCheque: p.numeroCheque || undefined,
            parcela: p.parcela,
            dataVencimento: p.dataVencimento || undefined,
          })),
        } : null;

        // Captura IDs selecionados (terceiros) e nome do fornecedor antes do mutate reseitar o form.
        const terceiroIds = isChequeTerceiros ? [...chequesTerceiroSel] : [];
        const terceiroFornecedor = form.fornecedorNome || undefined;
        const complementoInfo = isChequeTerceiros && diffTerceiro < -0.01
          ? `Complemento ${formatBRL(Math.abs(diffTerceiro))} via ${form.chequeComplementoForma?.toUpperCase() ?? "PIX"}`
          : undefined;

        // Forma gravada: "cheque_terceiro" para diferenciar no histórico de pagamentos.
        const formaFinal = isChequeTerceiros ? "cheque_terceiro" : (form.formaPagamento || undefined);

        createEntryMut.mutate({
          companyId,
          tipo: form.tipo,
          natureza: form.natureza,
          valorPrevisto: parseFloat(form.valorPrevisto),
          dataCompetencia: form.dataCompetencia,
          dataVencimento: form.dataVencimento || undefined,
          descricao: form.descricao || undefined,
          contaNome: form.contaNome || undefined,
          obraNome: form.obraNome || undefined,
          formaPagamento: formaFinal,
          // Rev. 3211 — gancho cartão (backend só grava se forma="cartao_credito").
          cartaoId: form.formaPagamento === "cartao_credito" && form.cartaoId ? Number(form.cartaoId) : undefined,
          cartaoParcelas: form.formaPagamento === "cartao_credito" && form.cartaoParcelas ? parseInt(form.cartaoParcelas, 10) : undefined,
          cartaoEstabelecimento: form.formaPagamento === "cartao_credito" ? (form.cartaoEstabelecimento || undefined) : undefined,
          fornecedorNome: form.fornecedorNome || undefined,
          observacoes: complementoInfo
            ? [form.observacoes, complementoInfo].filter(Boolean).join(" | ")
            : form.observacoes || undefined,
          status: form.tipo === "receita" ? "a_receber" : form.status,
        }, chequePayload ? {
          onSuccess: () => { criarChequesLoteMut.mutate(chequePayload); },
        } : terceiroIds.length > 0 ? {
          onSuccess: (res: any) => {
            alocarLoteMut.mutate({
              companyId,
              ids: terceiroIds,
              fornecedorAlocadoNome: terceiroFornecedor,
              entryId: res?.id ?? null,
            });
          },
        } : undefined);
      }
    }
  }

  const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matchBusca = (l: any): boolean => {
    if (!search) return true;
    const q = norm(search);
    return norm(l.descricao).includes(q) || norm(l.obraNome).includes(q) || norm(l.contaNome).includes(q);
  };
  const rawLancamentos = (data?.data ?? []) as any[];
  // Rev. 3156 — descarta SEMPRE o ruído de cancelados (cancelado em outro módulo +
  // nunca baixado no financeiro), antes de qualquer contagem/exibição. Some da
  // lista e do contador "Mostrar cancelados (N)", pois nunca é mostrado.
  const baseLancamentos = rawLancamentos.filter((l: any) => !isCanceladoRuido(l));
  // Rev. 3152 — quantos cancelados existem no recorte atual (p/ rotular o botão).
  // Quando o usuário filtra explicitamente por "Cancelado", eles aparecem sempre.
  const ocultandoCancelados = !showCancelados && statusFilter !== "cancelado";
  const canceladosCount = baseLancamentos.filter((l: any) => l.status === "cancelado" && matchBusca(l)).length;
  const lancamentos = baseLancamentos.filter((l: any) => {
    if (ocultandoCancelados && l.status === "cancelado") return false;
    return matchBusca(l);
  });

  // Rev. 3145 — Totais vêm do agregado do servidor (TODOS os lançamentos do
  // período, sem o teto de 500 da lista). Fallback p/ a soma da lista enquanto
  // o agregado ainda não carregou, p/ o card não piscar zerado.
  const listaReceitas = lancamentos.filter((l: any) => l.tipo === "receita" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);
  const listaDespesas = lancamentos.filter((l: any) => l.tipo === "despesa" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);
  const totalReceitas = totais ? Number(totais.receita ?? 0) : listaReceitas;
  const totalDespesas = totais ? Number(totais.despesa ?? 0) : listaDespesas;

  // Rev. 3139 — Seleção múltipla: só são selecionáveis lançamentos NÃO cancelados.
  const selectableLancs = lancamentos.filter((l: any) => l.status !== "cancelado");
  const selectableIds: number[] = selectableLancs.map((l: any) => l.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id: number) => selectedIds.has(id));
  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  // Quantos dos selecionados estão aptos a cada ação (espelha o filtro do backend).
  const selBaixaveis = selectableLancs.filter((l: any) => selectedIds.has(l.id) && !["pago", "recebido"].includes(l.status)).length;
  const selEstornaveis = selectableLancs.filter((l: any) => selectedIds.has(l.id) && ["pago", "recebido"].includes(l.status)).length;
  // Rev. 3143 — excluíveis = selecionados NÃO efetivados (espelha o filtro do backend bulkDelete).
  const selExcluiveis = selectableLancs.filter((l: any) => selectedIds.has(l.id) && !["pago", "recebido"].includes(l.status)).length;

  // Rev. 3154 — Linhas de exibição: agrupa lançamentos de Frota por tipo numa
  // única linha (combustível/manutenção/pedágio); o resto renderiza normal. Um
  // grupo com 1 item só vira linha normal (não vale esconder atrás de clique).
  const temFrota = lancamentos.some((l: any) => isFrotaLanc(l));
  // Rev. 3164 — também agrupamos os pagamentos PJ por mês (mesma engine do grupo).
  const temPj = lancamentos.some((l: any) => isPjLanc(l));
  // Rev. 3164 — chave de grupo unificada: Frota (posto/fornecedor) OU PJ (mês).
  const grupoKeyOf = (l: any): string | null => frotaGrupoOf(l)?.key ?? pjGrupoOf(l)?.key ?? null;
  type DisplayRow =
    | { kind: "entry"; l: any }
    | { kind: "group"; groupKind: "frota" | "pj"; key: string; label: string; tipoKey: string; members: any[] }
    // Rev. 3514 — separador de período (cabeçalho de mês na lista)
    | { kind: "period"; ym: string; label: string; receita: number; despesa: number; count: number };
  const displayRows: DisplayRow[] = (() => {
    // 1ª passagem: agrupa Frota/PJ (lógica anterior intacta)
    const rows: DisplayRow[] = [];
    if (agrupar) {
      const byKey = new Map<string, Extract<DisplayRow, { kind: "group" }>>();
      for (const l of lancamentos) {
        const fg = frotaGrupoOf(l);
        const pg = fg ? null : pjGrupoOf(l);
        if (!fg && !pg) { rows.push({ kind: "entry", l }); continue; }
        const key = fg ? fg.key : pg!.key;
        let grp = byKey.get(key);
        if (!grp) {
          grp = fg
            ? { kind: "group", groupKind: "frota", key: fg.key, label: fg.label, tipoKey: fg.tipoKey, members: [] }
            : { kind: "group", groupKind: "pj", key: pg!.key, label: pg!.label, tipoKey: "pj", members: [] };
          byKey.set(key, grp);
          rows.push(grp);
        }
        grp.members.push(l);
      }
      // Grupos com 1 item só voltam a ser linha normal.
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.kind === "group" && r.members.length === 1) rows[i] = { kind: "entry", l: r.members[0] };
      }
    } else {
      for (const l of lancamentos) rows.push({ kind: "entry", l });
    }

    // Rev. 3514 — 2ª passagem: injeta cabeçalhos de período quando há > 1 mês.
    // Determina o YYYY-MM de cada linha pelo dataCompetencia (ou dataMin nos grupos).
    const getYm = (r: DisplayRow): string => {
      if (r.kind === "entry") return (r.l.dataCompetencia ?? r.l.dataVencimento ?? "").slice(0, 7) || "0000-00";
      if (r.kind === "group") {
        const m0 = r.members[0];
        return (m0?.dataCompetencia ?? m0?.dataVencimento ?? "").slice(0, 7) || "0000-00";
      }
      return "0000-00";
    };
    const uniqueYms = new Set(rows.map(getYm));
    if (uniqueYms.size <= 1) return rows; // mês único — sem cabeçalhos

    // Pré-calcula totais por período
    const ymTotals = new Map<string, { receita: number; despesa: number; count: number }>();
    for (const r of rows) {
      const ym = getYm(r);
      if (!ymTotals.has(ym)) ymTotals.set(ym, { receita: 0, despesa: 0, count: 0 });
      const t = ymTotals.get(ym)!;
      const items: any[] = r.kind === "entry" ? [r.l] : r.kind === "group" ? r.members : [];
      for (const it of items) {
        t.count++;
        if (it.status !== "cancelado") {
          if (it.tipo === "receita") t.receita += Number(it.valorPrevisto ?? 0);
          else t.despesa += Number(it.valorPrevisto ?? 0);
        }
      }
    }
    const final: DisplayRow[] = [];
    let lastYm = "";
    for (const r of rows) {
      const ym = getYm(r);
      if (ym !== lastYm) {
        const [yyyy, mm] = ym.split("-");
        const mesNome = MESES_FULL[parseInt(mm, 10) - 1] ?? mm;
        const t = ymTotals.get(ym) ?? { receita: 0, despesa: 0, count: 0 };
        final.push({ kind: "period", ym, label: `${mesNome} ${yyyy}`, ...t });
        lastYm = ym;
      }
      final.push(r);
    }
    return final;
  })();
  // Membros do grupo aberto no diálogo de detalhe (recalculado da lista atual).
  const grupoMembros = grupoKey
    ? lancamentos.filter((l: any) => grupoKeyOf(l) === grupoKey)
    : [];
  const grupoIsPj = grupoMembros.length > 0 && isPjLanc(grupoMembros[0]);
  const grupoLabel = grupoMembros.length
    ? (grupoIsPj
        ? (pjGrupoOf(grupoMembros[0])?.label ?? "Pagamentos PJ")
        : (frotaGrupoOf(grupoMembros[0])?.label ?? "Frota"))
    : "Grupo";
  const grupoTipoKey = grupoMembros.length && !grupoIsPj ? (frotaGrupoOf(grupoMembros[0])?.tipoKey ?? "") : "";
  const grupoTotal = grupoMembros.reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);

  const recEntries = recItems ?? [];
  const recAtivos = recEntries.filter((e: any) => e.ativo === 1);
  const recInativos = recEntries.filter((e: any) => e.ativo !== 1);
  const totalMensal = recAtivos.reduce((s: number, e: any) => {
    const v = Number(e.valor ?? 0);
    if (e.frequencia === "mensal") return s + v;
    if (e.frequencia === "quinzenal") return s + v * 2;
    if (e.frequencia === "semanal") return s + v * 4;
    if (e.frequencia === "trimestral") return s + v / 3;
    if (e.frequencia === "anual") return s + v / 12;
    return s + v;
  }, 0);

  const isPending = createEntryMut.isPending || createRecMut.isPending || updateRecMut.isPending || updateEntryMut.isPending;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lançamentos Financeiros</h1>
            <p className="text-sm text-gray-500 mt-1">Receitas, despesas e recorrências da empresa</p>
          </div>
          <div className="flex items-center gap-2">
            {aba === "recorrencias" && (
              <Button variant="outline" size="sm" className="h-9"
                onClick={() => generateMut.mutate({ companyId })}
                disabled={generateMut.isPending}>
                <Zap className="w-3.5 h-3.5 mr-1.5" />Gerar Pendentes
              </Button>
            )}
            <Button variant="outline" className="h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setShowPrevistos(true)}>
              <TrendingUp className="w-4 h-4 mr-2" />Recebíveis Previstos{previstosCount > 0 ? ` (${previstosCount})` : ""}
            </Button>
            <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Lançamento
            </Button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setAba("lancamentos")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === "lancamentos" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Lançamentos
          </button>
          <button
            onClick={() => setAba("recorrencias")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "recorrencias" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Repeat className="w-3.5 h-3.5" />Recorrências
            {recAtivos.length > 0 && (
              <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{recAtivos.length}</span>
            )}
          </button>
        </div>

        {/* ABA LANÇAMENTOS */}
        {aba === "lancamentos" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">Total Receitas</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatBRL(totalReceitas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">Total Despesas</span>
                  </div>
                  <p className="text-xl font-bold text-red-500">{formatBRL(totalDespesas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">Resultado</span>
                  </div>
                  <p className={`text-xl font-bold ${totalReceitas - totalDespesas >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {formatBRL(totalReceitas - totalDespesas)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Rev. 3133 — Período pelo MESMO PADRÃO do Contas a Receber/Pagar:
                      navegação por ANO + faixa de meses (Jan–Dez) com bolinhas de
                      status. Clicar num mês filtra aquele mês; "Ano todo" abre o ano. */}
                  <div>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                        <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <Button
                          type="button"
                          variant={mesSel == null ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs ml-2"
                          onClick={() => setMesSel(null)}
                        >
                          Ano todo
                        </Button>
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
                            type="button"
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
                  </div>
                  {/* Tipo / Status / Busca */}
                  <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-gray-100">
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Tipos</SelectItem>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="despesa">Despesa</SelectItem>
                        <SelectItem value="imposto">Imposto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  {lancamentos.length} lançamento(s)
                  <div className="ml-auto flex items-center gap-1">
                    {/* Rev. 3154/3164 — alternar agrupamento (Frota por posto/fornecedor + PJ por mês). */}
                    {(temFrota || temPj) && (
                      <Button variant="ghost" size="sm"
                        className={`h-7 px-2 text-xs font-normal ${agrupar ? "text-blue-700 hover:text-blue-800" : "text-gray-500 hover:text-gray-800"}`}
                        title={agrupar ? "Mostrar os lançamentos de Frota/PJ separados" : "Agrupar lançamentos de Frota (posto/fornecedor) e PJ (por mês)"}
                        onClick={() => setAgrupar((v) => !v)}>
                        <Layers className="w-3.5 h-3.5 mr-1" />
                        {agrupar ? "Agrupado" : "Expandido"}
                      </Button>
                    )}
                    {/* Rev. 3152 — revelar/ocultar cancelados (rastro preservado). */}
                    {canceladosCount > 0 && statusFilter !== "cancelado" && (
                      <Button variant="ghost" size="sm"
                        className="h-7 px-2 text-xs font-normal text-gray-500 hover:text-gray-800"
                        onClick={() => setShowCancelados((v) => !v)}>
                        {showCancelados
                          ? `Ocultar cancelados (${canceladosCount})`
                          : `Mostrar cancelados (${canceladosCount})`}
                      </Button>
                    )}
                  </div>
                </CardTitle>
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    Selecionar todos
                  </label>
                  <span className="text-sm text-gray-500">{selectedIds.size} selecionado(s)</span>
                  <div className="flex-1" />
                  <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white"
                    disabled={selBaixaveis === 0 || bulkBaixaMut.isPending}
                    onClick={() => { setBulkBaixaData(new Date().toISOString().split("T")[0]); setBulkBaixaOpen(true); }}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Dar baixa como pago{selBaixaveis > 0 ? ` (${selBaixaveis})` : ""}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-amber-700 border-amber-300 hover:bg-amber-50"
                    disabled={selEstornaveis === 0 || bulkEstornarMut.isPending}
                    onClick={() => { setBulkEstornarMotivo(""); setBulkEstornarOpen(true); }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Cancelar baixa{selEstornaveis > 0 ? ` (${selEstornaveis})` : ""}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-rose-700 border-rose-300 hover:bg-rose-50"
                    disabled={selExcluiveis === 0 || bulkDeleteMut.isPending}
                    onClick={() => { setBulkDeleteMotivo(""); setBulkDeleteOpen(true); }}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />Excluir{selExcluiveis > 0 ? ` (${selExcluiveis})` : ""}
                  </Button>
                  {isMaster && mesSel != null && (
                    <Button size="sm" variant="outline" className="h-8 text-red-700 border-red-300 bg-red-50 hover:bg-red-100 font-semibold"
                      disabled={wipeMonthMut.isPending}
                      onClick={() => { setWipePassword(""); setWipeMotivo(""); setWipeOpen(true); }}
                      title="Apagar TODOS os lançamentos do mês (admin master)">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />Zerar mês
                    </Button>
                  )}
                  {selectedIds.size > 0 && (
                    <Button size="sm" variant="ghost" className="h-8 text-gray-500"
                      onClick={() => setSelectedIds(new Set())}>Limpar</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : lancamentos.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">Nenhum lançamento encontrado.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {displayRows.map((row) => {
                      // Rev. 3514 — cabeçalho de período (separador de mês)
                      if (row.kind === "period") {
                        const resultado = row.receita - row.despesa;
                        return (
                          <div key={`period-${row.ym}`} className="px-5 py-2.5 bg-slate-100 border-y border-slate-200 flex items-center gap-2 sticky top-0 z-10">
                            <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            <span className="text-sm font-bold text-slate-700 flex-1">{row.label}</span>
                            <span className="text-xs font-medium text-slate-400">{row.count} lançamento{row.count !== 1 ? "s" : ""}</span>
                            {row.receita > 0 && (
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">+{formatBRL(row.receita)}</span>
                            )}
                            {row.despesa > 0 && (
                              <span className="text-xs font-semibold text-red-500 bg-red-50 rounded px-1.5 py-0.5">-{formatBRL(row.despesa)}</span>
                            )}
                            <span className={`text-xs font-bold rounded px-1.5 py-0.5 ${resultado >= 0 ? "text-emerald-700 bg-emerald-100" : "text-red-600 bg-red-100"}`}>
                              ={formatBRL(resultado)}
                            </span>
                          </div>
                        );
                      }
                      if (row.kind === "group") {
                        const Icon = row.groupKind === "pj" ? Briefcase : (FROTA_GRUPO_ICONS[row.tipoKey] ?? Truck);
                        const grpSelIds: number[] = row.members.filter((m: any) => m.status !== "cancelado").map((m: any) => m.id);
                        const grpAllSel = grpSelIds.length > 0 && grpSelIds.every((id: number) => selectedIds.has(id));
                        const grpSelCount = grpSelIds.filter((id: number) => selectedIds.has(id)).length;
                        const grpSomeSel = grpSelCount > 0;
                        const grpPartial = grpSomeSel && !grpAllSel;
                        const grpTotal = row.members.reduce((s: number, m: any) => s + Number(m.valorPrevisto ?? 0), 0);
                        const toggleGrp = () => setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (grpAllSel) grpSelIds.forEach((id: number) => next.delete(id));
                          else grpSelIds.forEach((id: number) => next.add(id));
                          return next;
                        });
                        return (
                          <div key={`grp-${row.key}`} className={`px-5 py-3 flex items-center justify-between transition-colors ${grpSomeSel ? "bg-blue-50" : "bg-slate-50/60 hover:bg-slate-100"}`}>
                            <div className="mr-3 flex-shrink-0">
                              <Checkbox
                                checked={grpAllSel ? true : grpPartial ? "indeterminate" : false}
                                disabled={grpSelIds.length === 0}
                                onCheckedChange={toggleGrp}
                                title="Selecionar todos do grupo"
                              />
                            </div>
                            <button type="button" onClick={() => setGrupoKey(row.key)} className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                                  <Icon className="w-4 h-4" />
                                </span>
                                <span className="text-sm font-semibold text-gray-800">{row.label}</span>
                                <Badge className="text-xs bg-slate-200 text-slate-700">{row.members.length} lançamentos</Badge>
                                <Badge className="text-xs bg-blue-100 text-blue-700"><Layers className="w-2.5 h-2.5 mr-1" />{row.groupKind === "pj" ? "PJ agrupado" : "Frota agrupada"}</Badge>
                                {grpPartial && (
                                  <span className="text-[11px] text-blue-600">{grpSelCount} selecionado(s)</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">Toque para ver os {row.members.length} lançamentos do grupo</p>
                            </button>
                            <div className="flex items-center gap-3 ml-3">
                              <p className="text-sm font-bold text-red-500">-{formatBRL(grpTotal)}</p>
                              <Button size="sm" variant="ghost" className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-7 px-2 text-xs"
                                title="Ver lançamentos do grupo"
                                onClick={() => setGrupoKey(row.key)}>
                                Ver <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      const l = row.l;
                      return (
                      <div key={`entry-${l.id}`} className={`px-5 py-3 flex items-center justify-between hover:bg-gray-50 ${selectedIds.has(l.id) ? "bg-blue-50" : ""}`}>
                        <div className="mr-3 flex-shrink-0">
                          <Checkbox
                            checked={selectedIds.has(l.id)}
                            disabled={l.status === "cancelado"}
                            onCheckedChange={() => toggleSelect(l.id)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800 truncate">{l.descricao ?? l.contaNome ?? "—"}</span>
                            {l.obraNome && <span className="text-xs text-gray-400 hidden sm:inline">• {l.obraNome}</span>}
                            <Badge className={`text-xs ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}>
                              {STATUS_LABELS[l.status] ?? l.status}
                            </Badge>
                            {l.origemModulo === "recorrente" && (
                              <Badge className="text-xs bg-purple-100 text-purple-700">
                                <Repeat className="w-2.5 h-2.5 mr-1" />Recorrente
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Comp.: {fmtDateBR(l.dataCompetencia)}
                            {l.dataVencimento && ` • Venc.: ${fmtDateBR(l.dataVencimento)}`}
                            {l.origemModulo && l.origemModulo !== "recorrente" && ` • Origem: ${originLabel(l.origemModulo)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          <p className={`text-sm font-bold ${l.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                            {l.tipo === "receita" ? "+" : "-"}{formatBRL(Number(l.valorPrevisto))}
                          </p>
                          {l.status === "a_pagar" && (
                            <Button size="sm" variant="outline" className="text-green-600 border-green-300 h-7 px-2 text-xs"
                              onClick={() => paidMut.mutate({ id: l.id, companyId, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                              <CheckCircle className="w-3 h-3 mr-1" />Pagar
                            </Button>
                          )}
                          {l.status === "a_receber" && (
                            <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 h-7 px-2 text-xs"
                              onClick={() => paidMut.mutate({ id: l.id, companyId, status: "recebido", dataPagamento: new Date().toISOString().split("T")[0] })}>
                              <CheckCircle className="w-3 h-3 mr-1" />Receber
                            </Button>
                          )}
                          {/* Rev. 2656 — VISUALIZAR (detalhe read-only) — sempre disponível */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-7 w-7 p-0"
                            title="Visualizar lançamento"
                            onClick={() => setViewId(l.id)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {/* Rev. 2398/2656 — EDITAR. Sempre visível; openEditEntry exibe
                              o motivo (origem/pago/cancelado) quando não for editável. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 w-7 p-0"
                            title="Editar lançamento"
                            onClick={() => openEditEntry(l)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {/* Rev. 2398/2656 — EXCLUIR. Sempre visível; pago/recebido é
                              bloqueado (use "Cancelar"/estorno) com aviso. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0"
                            title="Excluir lançamento"
                            onClick={() => {
                              if (l.status === "pago" || l.status === "recebido") {
                                toast({ title: "Lançamento já pago/recebido", description: "Use 'Cancelar' (estorno) em vez de excluir.", variant: "destructive" });
                                return;
                              }
                              setDeleteMotivo("");
                              setShowDelete({ id: l.id, desc: l.descricao ?? l.contaNome ?? `#${l.id}` });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {l.status !== "cancelado" && (
                            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-600 h-7 w-7 p-0"
                              title="Cancelar (estornar)"
                              onClick={() => setShowCancel({ id: l.id })}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ABA RECORRÊNCIAS */}
        {aba === "recorrencias" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Recorrências Ativas</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{recAtivos.length}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Custo Mensal Estimado</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatBRL(totalMensal)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Pausadas</p>
                  <p className="text-2xl font-bold text-gray-400 mt-1">{recInativos.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <Repeat className="w-4 h-4" /> Recorrências Cadastradas
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                {recLoading ? (
                  <p className="text-center text-gray-400 py-8">Carregando...</p>
                ) : recEntries.length === 0 ? (
                  <div className="text-center py-10">
                    <Repeat className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Nenhuma recorrência cadastrada</p>
                    <p className="text-xs text-gray-400 mt-1">Clique em "Novo Lançamento" e escolha "Recorrente"</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recEntries.map((item: any) => {
                      const isReceita = item.tipo === "receita";
                      const isAtivo = item.ativo === 1;
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!isAtivo ? "bg-gray-50 border-gray-200 opacity-60" : "bg-white border-gray-100"}`}>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isReceita ? "bg-green-100" : "bg-red-100"}`}>
                            {isReceita ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800 truncate">{item.descricao}</p>
                              <Badge variant="outline" className="text-[10px] h-5">{FREQ_LABELS[item.frequencia] ?? item.frequencia}</Badge>
                              {!isAtivo && <Badge variant="secondary" className="text-[10px] h-5">Pausado</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                              {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                              {item.contaNome && <span>{item.contaNome}</span>}
                              <span>Dia {item.diaVencimento}</span>
                              {item.proximoVencimento && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3" />
                                  Próximo: {new Date(item.proximoVencimento).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${isReceita ? "text-green-600" : "text-red-600"}`}>
                            {formatBRL(Number(item.valor ?? 0))}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditRec(item)}>
                              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleAtivo(item)}>
                              {isAtivo ? <Pause className="w-3.5 h-3.5 text-orange-400" /> : <Play className="w-3.5 h-3.5 text-green-500" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* MODAL NOVO / EDITAR LANÇAMENTO */}
        <Dialog open={showNew} onOpenChange={(v) => { if (!v) { setShowNew(false); resetForm(); setShowObs(false); } }}>
          <DialogContent resizable={false} className="max-w-none w-screen h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0 p-0 overflow-hidden flex flex-col">

            {/* Header colorido conforme tipo */}
            <div className={`shrink-0 px-6 pt-5 pb-4 ${
              form.tipo === "receita" ? "bg-green-50" :
              form.tipo === "imposto" ? "bg-yellow-50" :
              form.tipo === "transferencia" ? "bg-gray-50" :
              "bg-red-50"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-800">
                  {editRecId ? "Editar Recorrência" : editEntryId ? "Editar Lançamento" : "Novo Lançamento"}
                </h2>
                {/* Toggle Único / Recorrente */}
                {!editRecId && !editEntryId && form.tipo !== "transferencia" && (
                  <div className="flex rounded-full border border-gray-300 bg-white overflow-hidden text-xs">
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, modoRecorrente: false }))}
                      className={`px-3 py-1 font-medium transition-colors ${!form.modoRecorrente ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                      Único
                    </button>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, modoRecorrente: true }))}
                      className={`px-3 py-1 font-medium transition-colors flex items-center gap-1 ${form.modoRecorrente ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                      <RefreshCw className="w-3 h-3" />Recorrente
                    </button>
                  </div>
                )}
                {editRecId && (
                  <Badge className="bg-purple-100 text-purple-700 text-xs">
                    <RefreshCw className="w-3 h-3 mr-1" />Recorrente
                  </Badge>
                )}
              </div>

              {/* Seletor de tipo visual */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "despesa",       label: "Despesa",       icon: ArrowDownRight, color: "text-red-600",    activeBg: "bg-red-600",    activeTxt: "text-white" },
                  { value: "receita",       label: "Receita",       icon: ArrowUpRight,   color: "text-green-600",  activeBg: "bg-green-600",  activeTxt: "text-white" },
                  { value: "imposto",       label: "Imposto",       icon: Landmark,       color: "text-yellow-600", activeBg: "bg-yellow-500", activeTxt: "text-white" },
                  { value: "transferencia", label: "Transferência", icon: ArrowLeftRight, color: "text-gray-600",   activeBg: "bg-gray-600",   activeTxt: "text-white" },
                ].map(({ value, label, icon: Icon, color, activeBg, activeTxt }) => (
                  <button key={value} type="button"
                    onClick={() => setForm(f => ({ ...f, tipo: value, modoRecorrente: value === "transferencia" ? false : f.modoRecorrente }))}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-xs font-medium ${
                      form.tipo === value
                        ? `border-transparent ${activeBg} ${activeTxt}`
                        : `border-transparent bg-white ${color} hover:border-gray-200`
                    }`}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Corpo do formulário */}
            <div className="flex-1 min-h-0 px-6 py-4 space-y-4 overflow-y-auto">

              {/* Valor em destaque */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Valor *</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">R$</span>
                  <Input
                    type="number" step="0.01"
                    value={form.valorPrevisto}
                    onChange={e => setForm(f => ({ ...f, valorPrevisto: e.target.value }))}
                    placeholder="0,00"
                    className="pl-10 text-lg font-semibold h-12 border-gray-200"
                  />
                </div>
              </div>

              {/* Rev. 2693 — TRANSFERÊNCIA ENTRE CONTAS (fluxo enxuto) */}
              {form.tipo === "transferencia" && (
                <>
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 flex items-start gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-snug text-gray-500">
                      <span className="font-semibold text-gray-700">Transferência entre Contas.</span> Debita a conta de origem e credita a de destino. Aparece na conciliação das duas contas e <span className="font-medium">não</span> gera título em Contas a Pagar nem a Receber.
                    </p>
                  </div>

                  {/* Data da transferência */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <Calendar className="w-3 h-3" />Data da transferência *
                    </label>
                    <Input type="date" value={form.dataCompetencia} onChange={e => setForm(f => ({ ...f, dataCompetencia: e.target.value }))} className="h-9 mt-1" />
                  </div>

                  {/* Origem / Destino */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-red-500" />Conta de Origem *</p>
                      <Select value={form.contaBancariaOrigemId} onValueChange={v => setForm(f => ({ ...f, contaBancariaOrigemId: v }))}>
                        <SelectTrigger className="h-9 w-full min-w-0"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
                          {(bankAccounts ?? []).map((b: any) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              <span className="truncate">{(b.descricao || b.banco)}{b.conta ? ` · ${b.agencia ?? ""}/${b.conta}` : ""}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1 flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-green-600" />Conta de Destino *</p>
                      <Select value={form.contaBancariaDestinoId} onValueChange={v => setForm(f => ({ ...f, contaBancariaDestinoId: v }))}>
                        <SelectTrigger className="h-9 w-full min-w-0"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
                          {(bankAccounts ?? []).map((b: any) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              <span className="truncate">{(b.descricao || b.banco)}{b.conta ? ` · ${b.agencia ?? ""}/${b.conta}` : ""}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(bankAccounts ?? []).length === 0 && (
                    <p className="text-[10px] text-amber-600">
                      Nenhuma conta bancária cadastrada. Cadastre em Financeiro → Conciliação / Contas.
                    </p>
                  )}

                  {/* Tipo (forma) */}
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Tipo</p>
                    <Select value={form.formaPagamento || "none"} onValueChange={v => setForm(f => ({ ...f, formaPagamento: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="ted">TED</SelectItem>
                        <SelectItem value="doc">DOC</SelectItem>
                        <SelectItem value="transferencia_interna">Transferência interna</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Observação */}
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Observação</p>
                    <Textarea
                      value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                      rows={2}
                      placeholder="Observação (opcional)..."
                    />
                  </div>
                </>
              )}

              {form.tipo !== "transferencia" && (
              <>
              {/* Descrição */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descrição *</label>
                <Input
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder={form.tipo === "receita" ? "Ex: Medição de obra, Recebimento..." : form.tipo === "imposto" ? "Ex: DARF CSLL, ISS Abril..." : "Ex: Aluguel, Energia, Fornecedor..."}
                  className="mt-1"
                />
              </div>

              {/* Datas (único) */}
              {!form.modoRecorrente && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="w-3 h-3" />Datas
                  </label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Competência *</p>
                      <Input type="date" value={form.dataCompetencia} onChange={e => setForm(f => ({ ...f, dataCompetencia: e.target.value }))} className="h-9" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Vencimento</p>
                      <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} className="h-9" />
                    </div>
                  </div>
                </div>
              )}

              {/* Recorrência (recorrente) */}
              {form.modoRecorrente && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />Recorrência
                  </label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Frequência</p>
                      <Select value={form.frequencia} onValueChange={v => setForm(f => ({ ...f, frequencia: v }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="quinzenal">Quinzenal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="trimestral">Trimestral</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Todo dia</p>
                      <div className="relative">
                        <Input type="number" min={1} max={31} value={form.diaVencimento} onChange={e => setForm(f => ({ ...f, diaVencimento: e.target.value }))} className="h-9 pr-12" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">do mês</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Conta / Obra */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="w-3 h-3" />Vinculação
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Conta / Categoria</p>
                    {/* Rev. 2082 — autocomplete (datalist) + botão "Cadastrar" inline (sem sair do modal). */}
                    <div className="flex gap-1.5">
                      <div className="flex-1 relative">
                        <Input
                          value={form.contaNome}
                          onChange={e => setForm(f => ({ ...f, contaNome: e.target.value }))}
                          placeholder="Ex: Salários, Aluguel..."
                          className="h-9 pr-8"
                          list="categorias-financeiras-datalist"
                        />
                        <Tag className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                        <datalist id="categorias-financeiras-datalist">
                          {categoriasFiltradas.map(c => (
                            <option key={c.id} value={c.nome} />
                          ))}
                        </datalist>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setCatForm({ nome: form.contaNome.trim(), natureza: form.natureza || "variavel", centroCustoId: "" }); setShowNewCat(true); }}
                        className="h-9 px-2.5 shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        title="Cadastrar nova categoria"
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1" />
                        <span className="text-xs font-semibold">Cadastrar</span>
                      </Button>
                    </div>
                    {categoriasFiltradas.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {categoriasFiltradas.length} categoria{categoriasFiltradas.length !== 1 ? "s" : ""} cadastrada{categoriasFiltradas.length !== 1 ? "s" : ""} — digite pra autocompletar
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Obra (opcional)</p>
                    <div className="relative">
                      <Input
                        value={form.obraNome}
                        onChange={e => setForm(f => ({ ...f, obraNome: e.target.value }))}
                        placeholder="Selecione ou digite a obra"
                        className="h-9 pr-8"
                        list="obras-financeiras-datalist"
                      />
                      <Building2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                      <datalist id="obras-financeiras-datalist">
                        {obrasOptions.map(o => (
                          <option key={o.id} value={o.nome} />
                        ))}
                      </datalist>
                    </div>
                    {obrasOptions.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {obrasOptions.length} obra{obrasOptions.length !== 1 ? "s" : ""} ativa{obrasOptions.length !== 1 ? "s" : ""} — toque pra selecionar
                      </p>
                    )}
                  </div>
                </div>
                {/* Rev. 2226 — Fornecedor/Prestador disponível em AMBOS modos (único + recorrente)
                    com autocomplete dos fornecedores já cadastrados + atalho pra cadastrar novo
                    em nova aba (`/compras/fornecedores`). "Fornecedor" abrange empresa terceira/prestador. */}
                <div className="mt-3">
                  <p className="text-[11px] text-gray-400 mb-1">Fornecedor / Prestador / Pagador</p>
                  <div className="flex gap-1.5">
                    <div className="flex-1 relative">
                      <Input
                        value={form.fornecedorNome}
                        onChange={e => setForm(f => ({ ...f, fornecedorNome: e.target.value }))}
                        placeholder="Nome do fornecedor, prestador ou pagador"
                        className="h-9 pr-8"
                        list="fornecedores-financeiros-datalist"
                      />
                      <Building2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                      <datalist id="fornecedores-financeiros-datalist">
                        {fornecedoresOptions.map(f => (
                          <option key={f.id} value={f.nome}>{f.cnpj || ""}</option>
                        ))}
                      </datalist>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => window.open("/compras/fornecedores", "_blank", "noopener,noreferrer")}
                      className="h-9 px-2.5 shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                      title="Cadastrar novo fornecedor/prestador em nova aba"
                    >
                      <PlusCircle className="w-3.5 h-3.5 mr-1" />
                      <span className="text-xs font-semibold">Cadastrar novo</span>
                    </Button>
                  </div>
                  {fornecedoresOptions.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {fornecedoresOptions.length} fornecedor{fornecedoresOptions.length !== 1 ? "es" : ""} cadastrado{fornecedoresOptions.length !== 1 ? "s" : ""} — digite pra autocompletar
                    </p>
                  )}
                </div>
              </div>

              {/* Pagamento */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />Pagamento
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Forma</p>
                    <Select value={form.formaPagamento || "none"} onValueChange={v => setForm(f => ({ ...f, formaPagamento: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="ted">TED</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1 flex items-center gap-1">
                      Natureza
                      {naturezaHerdada && (
                        <span
                          className="text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-[1px] uppercase"
                          title={`Herdada da categoria "${categoriaSelecionada?.nome}". Para alterar, edite a categoria no cadastro.`}
                        >
                          Da categoria
                        </span>
                      )}
                    </p>
                    <Select
                      value={form.natureza}
                      onValueChange={v => setForm(f => ({ ...f, natureza: v }))}
                      disabled={!!naturezaHerdada}
                    >
                      <SelectTrigger
                        className={`h-9 ${naturezaHerdada ? "bg-blue-50/40 border-blue-200 text-blue-900 cursor-not-allowed" : ""}`}
                        title={naturezaHerdada ? `Vem da categoria "${categoriaSelecionada?.nome}"` : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixo">Fixo</SelectItem>
                        <SelectItem value="variavel">Variável</SelectItem>
                      </SelectContent>
                    </Select>
                    {naturezaHerdada ? (
                      <p className="text-[10px] text-blue-600 mt-1">
                        Definida no cadastro da categoria.
                      </p>
                    ) : form.contaNome.trim() ? (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Categoria não cadastrada — defina manualmente.
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Rev. 3211 — Gancho cartão de crédito: aparece só quando a forma é "Cartão de Crédito". */}
                {form.formaPagamento === "cartao_credito" && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5" /> Dados do cartão
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Cartão</p>
                        <Select
                          value={form.cartaoId || "none"}
                          onValueChange={v => setForm(f => ({ ...f, cartaoId: v === "none" ? "" : v }))}
                        >
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {(Array.isArray(cartoesList) ? cartoesList : []).map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {(c.banco || "Banco")} · final {c.final4 || "????"}{c.tipoPessoa === "PF" ? " (PF)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Parcelas</p>
                        <Input
                          type="number" min={1} max={99}
                          value={form.cartaoParcelas}
                          onChange={e => setForm(f => ({ ...f, cartaoParcelas: e.target.value }))}
                          placeholder="1"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Onde foi comprado</p>
                        <Input
                          value={form.cartaoEstabelecimento}
                          onChange={e => setForm(f => ({ ...f, cartaoEstabelecimento: e.target.value }))}
                          placeholder="Estabelecimento"
                          className="h-9"
                        />
                      </div>
                    </div>
                    {(Array.isArray(cartoesList) ? cartoesList : []).length === 0 && (
                      <p className="text-[10px] text-amber-600">
                        Nenhum cartão cadastrado. Cadastre em Financeiro → Cartão de Crédito.
                      </p>
                    )}
                  </div>
                )}

                {/* Rev. 3330 — Gancho CHEQUE: aparece só quando a forma é "Cheque" numa
                    DESPESA. Pergunta em quantas vezes (parcelas) + dados do cheque e
                    cadastra automaticamente os cheques no Controle de Cheques ao lançar. */}
                {chequeAtivo && (
                  <div className="mt-3 space-y-3">

                  {/* Rev. 4104 — Seletor de subtipo: Cheque Empresa × Cheque Terceiros */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[12px] font-medium">
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, chequeSubtipo: "empresa" })); setChequesTerceiroSel([]); }}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${
                        form.chequeSubtipo === "empresa"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" /> Cheque Empresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, chequeSubtipo: "terceiros" }))}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors border-l border-gray-200 ${
                        form.chequeSubtipo === "terceiros"
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" /> Cheque de Terceiro
                    </button>
                  </div>

                  {/* ── CHEQUE EMPRESA ─────────────────────────────────────── */}
                  {form.chequeSubtipo === "empresa" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                    <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5" /> Cheque próprio — cadastro automático no Controle de Cheques
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Em quantas vezes</p>
                        <Input
                          type="number" min={1} max={120}
                          value={form.chequeParcelas}
                          onChange={e => setForm(f => ({ ...f, chequeParcelas: e.target.value }))}
                          placeholder="1"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Nº do 1º cheque</p>
                        <Input
                          value={form.chequeNumeroInicial}
                          onChange={e => setForm(f => ({ ...f, chequeNumeroInicial: e.target.value }))}
                          placeholder="Ex: 000429"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">1º vencimento</p>
                        <Input
                          type="date"
                          value={form.chequePrimeiroVenc}
                          onChange={e => setForm(f => ({ ...f, chequePrimeiroVenc: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Banco</p>
                        <Input
                          value={form.chequeBanco}
                          onChange={e => setForm(f => ({ ...f, chequeBanco: e.target.value }))}
                          placeholder="Ex: Caixa"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Agência</p>
                        <Input
                          value={form.chequeAgencia}
                          onChange={e => setForm(f => ({ ...f, chequeAgencia: e.target.value }))}
                          placeholder="Ex: 1234"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">Conta corrente</p>
                        <Input
                          value={form.chequeConta}
                          onChange={e => setForm(f => ({ ...f, chequeConta: e.target.value }))}
                          placeholder="Ex: 00012345-6"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1">Situação inicial dos cheques</p>
                      <Select
                        value={form.chequeStatus}
                        onValueChange={v => setForm(f => ({ ...f, chequeStatus: v }))}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="compensado">Compensado</SelectItem>
                          <SelectItem value="sustado">Sustado</SelectItem>
                          <SelectItem value="devolvido">Devolvido</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                          <SelectItem value="indefinido">Indefinido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {chequePreview.length > 0 ? (
                      <div className="rounded-md border border-blue-100 bg-white overflow-hidden">
                        <p className="text-[11px] font-semibold text-blue-700 px-3 py-1.5 border-b border-blue-100 bg-blue-50/60">
                          {chequePreview.length} cheque{chequePreview.length !== 1 ? "s" : ""} a cadastrar — total {formatBRL(chequePreview.reduce((s, p) => s + p.valor, 0))}
                        </p>
                        <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                          {chequePreview.map(p => (
                            <div key={p.idx} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                              <span className="text-gray-500 shrink-0 w-12">{p.parcela}</span>
                              <span className="text-gray-700 flex-1 min-w-0 truncate">
                                {p.numeroCheque ? `Cheque ${p.numeroCheque}` : "Sem nº"} · venc. {fmtDateBR(p.dataVencimento)}
                              </span>
                              <span className="font-semibold text-gray-800 shrink-0">{formatBRL(p.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-600">
                        Informe o valor da despesa acima para gerar os cheques.
                      </p>
                    )}
                  </div>
                  )}

                  {/* ── CHEQUE DE TERCEIRO ─────────────────────────────────── */}
                  {form.chequeSubtipo === "terceiros" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">

                    {/* Cabeçalho com totalizador da seleção */}
                    <div className="flex items-center justify-between bg-white rounded border border-emerald-100 px-3 py-2">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-700">
                          {chequesTerceiroSel.length === 0
                            ? "Nenhum cheque selecionado"
                            : `${chequesTerceiroSel.length} cheque${chequesTerceiroSel.length !== 1 ? "s" : ""} selecionado${chequesTerceiroSel.length !== 1 ? "s" : ""}`}
                        </p>
                        {chequesTerceiroSel.length > 0 && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Total selecionado: {formatBRL(totalSelecionadoTerceiro)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {chequesTerceiroSel.length === 0 && valorNumCheque > 0 && (
                          <span className="text-[10px] text-gray-400">A pagar: {formatBRL(valorNumCheque)}</span>
                        )}
                        {chequesTerceiroSel.length > 0 && diffTerceiro > 0.01 && (
                          <span className="text-[11px] text-red-600 font-semibold">sobram {formatBRL(diffTerceiro)}</span>
                        )}
                        {chequesTerceiroSel.length > 0 && diffTerceiro < -0.01 && (
                          <span className="text-[11px] text-amber-600 font-semibold">faltam {formatBRL(-diffTerceiro)}</span>
                        )}
                        {chequesTerceiroSel.length > 0 && Math.abs(diffTerceiro) <= 0.01 && (
                          <span className="text-[11px] text-emerald-600 font-semibold">✓ Valor exato!</span>
                        )}
                      </div>
                    </div>

                    {/* Loading */}
                    {sugerirChequesQ?.isLoading && (
                      <p className="text-[10px] text-gray-400 text-center py-1">Carregando cheques disponíveis…</p>
                    )}

                    {/* Sem cheques disponíveis */}
                    {!sugerirChequesQ?.isLoading && chequesRecDisponiveis.length === 0 && (
                      <div className="flex items-center gap-2 bg-white rounded border border-gray-100 px-3 py-2">
                        <Banknote className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <p className="text-[10px] text-gray-500">Nenhum cheque de terceiro disponível em carteira.</p>
                      </div>
                    )}

                    {/* Sugestões de combinação clicáveis */}
                    {sugestoesCheques.length > 0 && (
                      <div>
                        <p className="text-[10px] text-emerald-700 font-semibold mb-1.5">💡 Combinações sugeridas — clique para selecionar:</p>
                        <div className="space-y-1.5">
                          {sugestoesCheques.slice(0, 5).map((s, i) => {
                            const sobra  = Math.round((s.total - valorNumCheque) * 100) / 100;
                            const falta  = Math.round((valorNumCheque - s.total) * 100) / 100;
                            const isSel  = s.ids.length === chequesTerceiroSel.length && s.ids.every((id: number) => chequesTerceiroSel.includes(id));
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setChequesTerceiroSel(s.ids)}
                                className={`w-full text-left flex items-center gap-2 rounded border px-2.5 py-2 text-[11px] transition-all ${
                                  isSel
                                    ? "border-emerald-400 bg-emerald-100 ring-1 ring-emerald-300"
                                    : "border-emerald-100 bg-white hover:border-emerald-300 hover:bg-emerald-50/60"
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-800 break-words">
                                    {s.numeros.map((n: string, ni: number) => (
                                      <span key={ni}>
                                        {ni > 0 && <span className="text-gray-400 mx-1">+</span>}
                                        <span className="font-semibold">Cheque {n}</span>
                                        {s.emitentes[ni] && <span className="text-gray-500 font-normal ml-1">({s.emitentes[ni]})</span>}
                                      </span>
                                    ))}
                                  </p>
                                  <p className="text-[10px] text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                                    <span>{s.ids.length === 1 ? "1 cheque" : `${s.ids.length} cheques`} · total {formatBRL(s.total)}</span>
                                    {s.diferenca < 0.01 && <span className="text-emerald-600 font-semibold">✓ Exato!</span>}
                                    {sobra > 0.01  && <span className="text-red-600">sobram {formatBRL(sobra)}</span>}
                                    {falta > 0.01  && <span className="text-amber-600">faltam {formatBRL(falta)}</span>}
                                  </p>
                                </div>
                                {isSel && <span className="text-emerald-600 text-base shrink-0">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Lista completa de cheques disponíveis */}
                    {chequesRecDisponiveis.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] text-emerald-700 font-semibold">
                            Todos disponíveis ({chequesRecDisponiveis.length}) — selecione manualmente:
                          </p>
                          {chequesTerceiroSel.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setChequesTerceiroSel([])}
                              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                            >
                              Limpar seleção
                            </button>
                          )}
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
                          {(chequesRecDisponiveis as any[]).map((c: any) => {
                            const sel = chequesTerceiroSel.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setChequesTerceiroSel(prev =>
                                  sel ? prev.filter((id: number) => id !== c.id) : [...prev, c.id]
                                )}
                                className={`w-full text-left flex items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] transition-all ${
                                  sel
                                    ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                                    : "border-gray-100 bg-white hover:border-emerald-200 hover:bg-gray-50"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}>
                                  {sel && <span className="text-white text-[9px] leading-none font-bold">✓</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold text-gray-800">
                                    Cheque {c.numero_cheque ?? "S/N"}
                                  </span>
                                  {c.emitente_nome && (
                                    <span className="text-gray-500 ml-1">({c.emitente_nome})</span>
                                  )}
                                  {c.data_vencimento && (
                                    <span className="text-gray-400 ml-1 text-[10px]">· venc. {fmtDateBR(c.data_vencimento)}</span>
                                  )}
                                </div>
                                <span className="text-gray-700 font-semibold shrink-0">{formatBRL(Number(c.valor))}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Complemento: quando cheques selecionados não cobrem o total */}
                    {chequesTerceiroSel.length > 0 && diffTerceiro < -0.01 && (
                      <div className="rounded border border-amber-200 bg-amber-50/60 p-2.5 space-y-2">
                        <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Complemento: {formatBRL(-diffTerceiro)} a pagar por outra forma
                        </p>
                        <div>
                          <p className="text-[10px] text-gray-500 mb-1">Forma do complemento</p>
                          <Select
                            value={form.chequeComplementoForma}
                            onValueChange={v => setForm(f => ({ ...f, chequeComplementoForma: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Escolha a forma do complemento" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="ted">TED</SelectItem>
                              <SelectItem value="dinheiro">Dinheiro</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                              <SelectItem value="cheque">Cheque próprio</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                  </div>
                  )}

                  </div>
                )}
              </div>

              {/* Observações (expansível) */}
              <div>
                <button type="button" onClick={() => setShowObs(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  <FileText className="w-3.5 h-3.5" />
                  {showObs ? "Ocultar observações" : "Adicionar observações"}
                  {showObs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showObs && (
                  <Textarea
                    value={form.observacoes}
                    onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                    rows={2}
                    placeholder="Observações adicionais..."
                    className="mt-2"
                  />
                )}
              </div>
              </>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 bg-gray-50 border-t flex justify-between items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setShowNew(false); resetForm(); setShowObs(false); }}
                className="text-gray-500">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isPending}
                className={`flex-1 max-w-[220px] font-semibold ${
                  form.tipo === "receita" ? "bg-green-600 hover:bg-green-700" :
                  form.tipo === "imposto" ? "bg-yellow-500 hover:bg-yellow-600" :
                  form.tipo === "transferencia" ? "bg-gray-600 hover:bg-gray-700" :
                  "bg-red-600 hover:bg-red-700"
                } text-white`}>
                {isPending ? "Salvando..." :
                  form.modoRecorrente
                    ? (editRecId ? "Salvar Recorrência" : `Criar Recorrência`)
                    : `Lançar ${form.tipo === "receita" ? "Receita" : form.tipo === "imposto" ? "Imposto" : form.tipo === "transferencia" ? "Transferência" : "Despesa"}`
                }
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal cancelar */}
        {/* Rev. 2082 — Sub-dialog "Cadastrar Categoria" (sem sair do modal Novo Lançamento). */}
        <Dialog open={showNewCat} onOpenChange={(v) => { if (!v) setShowNewCat(false); }}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Cadastrar Categoria</h3>
                  <p className="text-[11px] text-blue-100">
                    {form.tipo === "receita" ? "Categoria de receita" : "Categoria de despesa"} · empresa atual
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome da categoria *</label>
                <Input
                  autoFocus
                  value={catForm.nome}
                  onChange={e => setCatForm(c => ({ ...c, nome: e.target.value }))}
                  placeholder="Ex: Material de escritório, Combustível..."
                  className="mt-1 h-9"
                  onKeyDown={(e) => { if (e.key === "Enter" && !createAccountMut.isPending) handleCadastrarCategoria(); }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Natureza</label>
                  <select
                    value={catForm.natureza}
                    onChange={e => setCatForm(c => ({ ...c, natureza: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="variavel">Variável</option>
                    <option value="fixo">Fixa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Centro de Custo</label>
                  <select
                    value={catForm.centroCustoId}
                    onChange={e => setCatForm(c => ({ ...c, centroCustoId: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="">— Nenhum (vincular depois) —</option>
                    {(Array.isArray(costCenters) ? costCenters : []).map((cc: any) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
                <strong>Dica:</strong> o código contábil é gerado automaticamente. Você pode editar a categoria depois em Financeiro → Plano de Contas.
              </div>
            </div>
            <DialogFooter className="px-5 pb-4">
              <Button type="button" variant="outline" onClick={() => setShowNewCat(false)} disabled={createAccountMut.isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleCadastrarCategoria}
                disabled={createAccountMut.isPending || catForm.nome.trim().length < 2}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createAccountMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</> : <><PlusCircle className="w-3.5 h-3.5 mr-1.5" />Cadastrar</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3154 — Detalhe do GRUPO de Frota: lista todos os lançamentos do tipo. */}
        <Dialog open={!!grupoKey} onOpenChange={(v) => { if (!v) setGrupoKey(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(() => { const I = grupoIsPj ? Briefcase : (FROTA_GRUPO_ICONS[grupoTipoKey] ?? Truck); return <I className="w-4 h-4 text-slate-600" />; })()}
                {grupoLabel}
                <Badge className="text-xs bg-slate-200 text-slate-700">{grupoMembros.length} lançamentos</Badge>
                <span className="ml-auto text-sm font-bold text-red-600">-{formatBRL(grupoTotal)}</span>
              </DialogTitle>
            </DialogHeader>
            {grupoMembros.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Nenhum lançamento neste grupo.</div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                {grupoMembros.map((m: any) => (
                  <div key={m.id} className={`px-1 py-2.5 flex items-center justify-between gap-3 ${selectedIds.has(m.id) ? "bg-blue-50" : ""}`}>
                    <div className="flex-shrink-0">
                      <Checkbox
                        checked={selectedIds.has(m.id)}
                        disabled={m.status === "cancelado"}
                        onCheckedChange={() => toggleSelect(m.id)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {isPjLanc(m) && m.pjFornecedor ? `${m.pjFornecedor} — ${m.descricao ?? ""}` : (m.descricao ?? m.contaNome ?? "—")}
                        </span>
                        <Badge className={`text-xs ${STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABELS[m.status] ?? m.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Comp.: {fmtDateBR(m.dataCompetencia)}
                        {m.dataVencimento && ` • Venc.: ${fmtDateBR(m.dataVencimento)}`}
                        {m.dataPagamento && ` • Pago: ${fmtDateBR(m.dataPagamento)}`}
                        {m.obraNome && ` • ${m.obraNome}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-sm font-bold ${m.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                        {m.tipo === "receita" ? "+" : "-"}{formatBRL(Number(m.valorPrevisto))}
                      </p>
                      {m.status === "a_pagar" && (
                        <Button size="sm" variant="outline" className="text-green-600 border-green-300 h-7 px-2 text-xs"
                          onClick={() => paidMut.mutate({ id: m.id, companyId, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Pagar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-7 w-7 p-0"
                        title="Visualizar lançamento" onClick={() => setViewId(m.id)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <span className="mr-auto self-center text-xs text-gray-400">Selecione itens e use as ações em lote na lista (Dar baixa / Cancelar baixa / Excluir).</span>
              <Button onClick={() => setGrupoKey(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2656 — Modal VISUALIZAR (detalhe read-only do lançamento). */}
        <Dialog open={!!viewId} onOpenChange={(v) => { if (!v) setViewId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-600" />
                Detalhe do Lançamento
                {detailQuery.data?.entry && (
                  <span className="ml-auto text-xs font-normal text-gray-400 tabular-nums">#{detailQuery.data.entry.id}</span>
                )}
              </DialogTitle>
            </DialogHeader>
            {detailQuery.isLoading ? (
              <div className="py-10 text-center text-gray-500 text-sm">Carregando…</div>
            ) : detailQuery.error ? (
              <div className="py-6 text-center text-red-600 text-sm">{(detailQuery.error as any)?.message ?? "Erro ao carregar."}</div>
            ) : detailQuery.data?.entry ? (() => {
              const e = detailQuery.data.entry;
              return (
                <div className="space-y-3">
                  <div className={`rounded-lg p-4 ${e.tipo === "receita" ? "bg-green-50" : "bg-red-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{e.descricao || e.contaNome || e.origemDescricao || "—"}</p>
                        {e.fornecedorNome && <p className="text-xs text-gray-600 mt-0.5">{e.fornecedorNome}</p>}
                        {e.obraNome && <p className="text-xs text-gray-500 mt-0.5">{e.obraNome}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${e.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                          {formatBRL(Number(e.valorPrevisto ?? 0))}
                        </p>
                        <Badge className={`text-[10px] mt-1 ${STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABELS[e.status] ?? e.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><span className="text-gray-400 text-xs">Tipo</span><p className="font-medium capitalize">{e.tipo ?? "—"}</p></div>
                    <div><span className="text-gray-400 text-xs">Natureza</span><p className="font-medium capitalize">{e.natureza ?? "—"}</p></div>
                    <div><span className="text-gray-400 text-xs">Competência</span><p className="font-medium">{fmtDateBR(e.dataCompetencia)}</p></div>
                    <div><span className="text-gray-400 text-xs">Vencimento</span><p className="font-medium">{fmtDateBR(e.dataVencimento)}</p></div>
                    <div><span className="text-gray-400 text-xs">Categoria</span><p className="font-medium">{e.contaNome ?? "—"}</p></div>
                    <div><span className="text-gray-400 text-xs">Forma de Pgto.</span><p className="font-medium">{e.formaPagamento ?? "—"}</p></div>
                    {e.valorRealizado != null && (
                      <div><span className="text-gray-400 text-xs">Valor Realizado</span><p className="font-medium">{formatBRL(Number(e.valorRealizado))}</p></div>
                    )}
                    {e.dataPagamento && (
                      <div><span className="text-gray-400 text-xs">Data Pgto./Receb.</span><p className="font-medium">{fmtDateBR(e.dataPagamento)}</p></div>
                    )}
                    <div className="col-span-2">
                      <span className="text-gray-400 text-xs">Origem</span>
                      <p className="font-medium">{e.origemModulo ? originLabel(e.origemModulo) : "Lançamento manual"}{e.origemId ? ` #${e.origemId}` : ""}</p>
                    </div>
                    {e.observacoes && (
                      <div className="col-span-2"><span className="text-gray-400 text-xs">Observações</span><p className="font-medium whitespace-pre-wrap">{e.observacoes}</p></div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="py-10 text-center text-gray-400 text-sm">Lançamento não encontrado.</div>
            )}
            <DialogFooter>
              {detailQuery.data?.entry &&
               (!detailQuery.data.entry.origemModulo || detailQuery.data.entry.origemModulo === "recorrente" || detailQuery.data.entry.origemModulo === "importacao_excel") &&
               detailQuery.data.entry.status !== "pago" && detailQuery.data.entry.status !== "recebido" &&
               detailQuery.data.entry.status !== "cancelado" && (
                <Button variant="outline" onClick={() => { const ent = detailQuery.data.entry; setViewId(null); openEditEntry(ent); }}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Editar
                </Button>
              )}
              <Button onClick={() => setViewId(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2398 — Modal de EXCLUSÃO de lançamento (motivo obrigatório min 5 chars). */}
        <Dialog open={!!showDelete} onOpenChange={(v) => { if (!v) { setShowDelete(null); setDeleteMotivo(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <Trash2 className="w-4 h-4" />
                Excluir Lançamento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-xs text-rose-700">
                Esta ação <strong>remove definitivamente</strong> o lançamento <strong>"{showDelete?.desc}"</strong>. Para reverter um pagamento, use <em>Cancelar</em> em vez de Excluir.
              </div>
              <div>
                <Label>Motivo da exclusão (obrigatório)</Label>
                <Textarea
                  value={deleteMotivo}
                  onChange={(e) => setDeleteMotivo(e.target.value)}
                  rows={3}
                  placeholder="Ex: lançamento duplicado, erro de digitação..."
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">{deleteMotivo.length}/5 caracteres mínimos</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDelete(null); setDeleteMotivo(""); }}>Voltar</Button>
              <Button
                variant="destructive"
                disabled={deleteMotivo.trim().length < 5 || deleteEntryMut.isPending}
                onClick={() => deleteEntryMut.mutate({ id: showDelete!.id, companyId, motivo: deleteMotivo.trim() })}
              >
                {deleteEntryMut.isPending ? "Excluindo..." : "Confirmar Exclusão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3143 — Modal de EXCLUSÃO EM LOTE (multi-seleção; motivo obrigatório min 5 chars). */}
        <Dialog open={bulkDeleteOpen} onOpenChange={(v) => { if (!v) { setBulkDeleteOpen(false); setBulkDeleteMotivo(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <Trash2 className="w-4 h-4" />
                Excluir {selExcluiveis} lançamento(s)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-xs text-rose-700">
                Esta ação <strong>remove definitivamente</strong> os <strong>{selExcluiveis}</strong> lançamento(s) selecionado(s) que ainda <strong>não foram pagos/recebidos</strong>.
                {selectedIds.size > selExcluiveis && (
                  <span className="block mt-1 text-amber-700">{selectedIds.size - selExcluiveis} já pago(s)/recebido(s) serão ignorados (use <em>Cancelar baixa</em> para estorná-los antes).</span>
                )}
              </div>
              <div>
                <Label>Motivo da exclusão (obrigatório)</Label>
                <Textarea
                  value={bulkDeleteMotivo}
                  onChange={(e) => setBulkDeleteMotivo(e.target.value)}
                  rows={3}
                  placeholder="Ex: importação duplicada, lote de teste..."
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">{bulkDeleteMotivo.length}/5 caracteres mínimos</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setBulkDeleteOpen(false); setBulkDeleteMotivo(""); }}>Voltar</Button>
              <Button
                variant="destructive"
                disabled={selExcluiveis === 0 || bulkDeleteMotivo.trim().length < 5 || bulkDeleteMut.isPending}
                onClick={() => bulkDeleteMut.mutate({
                  ids: Array.from(selectedIds),
                  companyId,
                  motivo: bulkDeleteMotivo.trim(),
                })}
              >
                {bulkDeleteMut.isPending ? "Excluindo..." : `Confirmar exclusão (${selExcluiveis})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3148 — ZERAR MÊS (admin master + senha). Apaga TODOS os lançamentos do mês. */}
        <Dialog open={wipeOpen} onOpenChange={(v) => { if (!v) { setWipeOpen(false); setWipePassword(""); setWipeMotivo(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Zerar mês {mesSel != null ? `${String(mesSel).padStart(2, "0")}/${ano}` : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                Esta ação <strong>apaga DEFINITIVAMENTE TODOS os {data?.total ?? lancamentos.length} lançamento(s)</strong> deste mês — <strong>inclusive os já pagos/recebidos</strong>. O mês ficará <strong>zerado</strong>. <span className="block mt-1">Operação <strong>irreversível</strong> e registrada em auditoria. Exclusiva do <strong>admin master</strong>.</span>
              </div>
              <div>
                <Label>Senha do admin master</Label>
                <Input
                  type="password"
                  value={wipePassword}
                  onChange={(e) => setWipePassword(e.target.value)}
                  placeholder="Sua senha"
                  className="mt-1"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Motivo (obrigatório)</Label>
                <Textarea
                  value={wipeMotivo}
                  onChange={(e) => setWipeMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ex: refazer o mês do zero, importação incorreta..."
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">{wipeMotivo.length}/5 caracteres mínimos</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setWipeOpen(false); setWipePassword(""); setWipeMotivo(""); }}>Voltar</Button>
              <Button
                variant="destructive"
                disabled={mesSel == null || !wipePassword || wipeMotivo.trim().length < 5 || wipeMonthMut.isPending}
                onClick={() => wipeMonthMut.mutate({
                  companyId,
                  dataInicio,
                  dataFim,
                  password: wipePassword,
                  motivo: wipeMotivo.trim(),
                })}
              >
                {wipeMonthMut.isPending ? "Zerando..." : "Zerar mês"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!showCancel} onOpenChange={() => setShowCancel(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancelar Lançamento</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Motivo do cancelamento (obrigatório)</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Informe o motivo..." className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(null)}>Voltar</Button>
              <Button variant="destructive" disabled={motivo.length < 5 || cancelMut.isPending}
                onClick={() => cancelMut.mutate({ id: showCancel!.id, companyId, motivoCancelamento: motivo })}>
                {cancelMut.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3139 — Confirmação: BAIXA EM LOTE (dar baixa como pago). */}
        <Dialog open={bulkBaixaOpen} onOpenChange={(v) => { if (!v) setBulkBaixaOpen(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Dar baixa como pago</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                <strong>{selBaixaveis}</strong> lançamento(s) serão marcados como <strong>pago/recebido</strong>.
                {selectedIds.size > selBaixaveis && (
                  <span className="block text-xs text-amber-600 mt-1">
                    {selectedIds.size - selBaixaveis} já efetivado(s)/sem baixa pendente serão ignorados.
                  </span>
                )}
              </p>
              <div>
                <Label>Data do pagamento</Label>
                <Input type="date" value={bulkBaixaData} onChange={e => setBulkBaixaData(e.target.value)} className="mt-1" />
                <p className="text-[11px] text-gray-400 mt-1">Aplicada apenas onde a data ainda estiver em branco.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkBaixaOpen(false)}>Voltar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white"
                disabled={selBaixaveis === 0 || bulkBaixaMut.isPending}
                onClick={() => bulkBaixaMut.mutate({
                  ids: Array.from(selectedIds),
                  companyId,
                  dataPagamento: bulkBaixaData || undefined,
                })}>
                {bulkBaixaMut.isPending ? "Processando..." : `Confirmar (${selBaixaveis})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3139 — Confirmação: CANCELAR A BAIXA em lote (estorno). */}
        <Dialog open={bulkEstornarOpen} onOpenChange={(v) => { if (!v) setBulkEstornarOpen(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancelar baixa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                <strong>{selEstornaveis}</strong> baixa(s) serão estornadas (voltam para <strong>a pagar/a receber</strong>),
                limpando data e forma de pagamento.
                {selectedIds.size > selEstornaveis && (
                  <span className="block text-xs text-amber-600 mt-1">
                    {selectedIds.size - selEstornaveis} não pago(s)/não recebido(s) serão ignorados.
                  </span>
                )}
              </p>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea value={bulkEstornarMotivo} onChange={e => setBulkEstornarMotivo(e.target.value)} rows={2}
                  placeholder="Ex.: ajuste de conciliação bancária" className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkEstornarOpen(false)}>Voltar</Button>
              <Button variant="destructive"
                disabled={selEstornaveis === 0 || bulkEstornarMut.isPending}
                onClick={() => bulkEstornarMut.mutate({
                  ids: Array.from(selectedIds),
                  companyId,
                  motivo: bulkEstornarMotivo.trim() || undefined,
                })}>
                {bulkEstornarMut.isPending ? "Processando..." : `Cancelar baixa (${selEstornaveis})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3161 — Recebíveis Previstos: lista + seleção + transferência manual p/ Contas a Receber */}
        <Dialog open={showPrevistos} onOpenChange={(o: boolean) => { if (!o) { setShowPrevistos(false); setSelPrevistos(new Set()); } }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Recebíveis Previstos
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 -mt-2">
              Receitas previstas ainda não lançadas no Contas a Receber. Selecione e confirme para formalizar a entrada — o valor e a data de vencimento são preservados.
            </p>
            {previstosItems.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                Nenhum recebível previsto pendente. Tudo já foi lançado.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between py-2 border-b">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <Checkbox checked={selPrevistos.size > 0 && selPrevistos.size === previstosItems.length}
                      onCheckedChange={toggleAllPrevistos} />
                    Selecionar todos ({previstosItems.length})
                  </label>
                  <span className="text-sm text-gray-500">Total previsto: <b className="text-gray-900">{formatBRL(previstosData?.valorTotal ?? 0)}</b></span>
                </div>
                <div className="overflow-y-auto flex-1 divide-y">
                  {previstosItems.map((it: any) => (
                    <label key={it.id} className="flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-gray-50">
                      <Checkbox checked={selPrevistos.has(it.id)} onCheckedChange={() => togglePrevisto(it.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {it.obraNome || "Obra"}{it.medicaoNumero ? ` · Medição #${it.medicaoNumero}` : ""}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {it.clienteNome || "—"} · Venc.: {fmtDateBR(it.dataVencimento)}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-700 whitespace-nowrap">{formatBRL(it.valor)}</div>
                    </label>
                  ))}
                </div>
              </>
            )}
            <DialogFooter className="border-t pt-3">
              <div className="flex-1 text-sm text-gray-600 self-center">
                {selPrevistos.size > 0 && <>Selecionados: <b>{selPrevistos.size}</b> · {formatBRL(selPrevistosTotal)}</>}
              </div>
              <Button variant="outline" onClick={() => { setShowPrevistos(false); setSelPrevistos(new Set()); }}>Fechar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={selPrevistos.size === 0 || transferirPrevistosMut.isPending}
                onClick={() => transferirPrevistosMut.mutate({ companyId, ids: Array.from(selPrevistos) })}>
                {transferirPrevistosMut.isPending ? "Lançando..." : `Efetuar lançamento (${selPrevistos.size})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
