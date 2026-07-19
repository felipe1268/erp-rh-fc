import DashboardLayout from "@/components/DashboardLayout";
import { ItemDescricaoInput } from "@/components/compras/ItemDescricaoInput";
import FullScreenDialog from "@/components/FullScreenDialog";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { normalizarTexto } from "@shared/textNormalization";
import { TIPOS_PAGAMENTO } from "@shared/paymentConditions";
import { formatNumeroCotacaoDisplay } from "@shared/numeroCotacao";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { consolidarOcItens } from "@shared/ocItensConsolidados";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, ShoppingBag, ChevronRight, ChevronDown, Loader2, CheckCircle, Truck, PackageCheck, Building2, AlertTriangle, Clock, CircleDot, Phone, Mail, User, Smartphone, FileDown, Printer, Receipt, DollarSign, Wrench, ExternalLink, ChevronsUpDown, ArrowUp, ArrowDown, ArrowUpDown, Check, Paperclip, Upload, X, FileText, Save, Edit3, ClipboardCheck, Calendar, RotateCcw, Ban, Copy, Sparkles } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { calcularSemaforo, semaforoCor, semaforoTooltip, type SemaforoResult } from "@/lib/semaforoEntrega";
import { PurchaseTimeline } from "@/components/compras/PurchaseTimeline";
import { CartaoDisponivelCard } from "@/components/compras/CartaoDisponivelCard";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  rascunho:         { label: "Rascunho",            cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  pendente:         { label: "Pendente",             cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovada:         { label: "Aprovada",             cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aguardando_aprovacao_extra: { label: "Aguardando Admin", cls: "bg-red-50 text-red-700 border-red-200" },
  entregue_parcial: { label: "Entrega Parcial",      cls: "bg-orange-50 text-orange-700 border-orange-200" },
  entregue:         { label: "Entregue",             cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelada:        { label: "Cancelada",            cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface FornecedorContatoData {
  contatoNome?: string | null;
  telefone?: string | null;
  contatoCelular?: string | null;
  contatoEmail?: string | null;
  email?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
}

function FornecedorContatoCard({ contato }: { contato: FornecedorContatoData | null | undefined }) {
  if (!contato) return null;
  const hasAnyContact = contato.contatoNome || contato.telefone || contato.contatoCelular || contato.contatoEmail || contato.email;
  const hasPhone = !!(contato.telefone || contato.contatoCelular);
  const hasEmail = !!(contato.contatoEmail || contato.email);
  const isIncomplete = !hasPhone || !hasEmail;

  if (!hasAnyContact) return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-xs text-amber-700 font-medium">Cadastro incompleto - sem dados de contato</span>
    </div>
  );

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <User className="h-3.5 w-3.5 text-blue-500" />
        <span className="font-semibold text-blue-800 text-xs">Contato do Fornecedor</span>
        {isIncomplete && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> Incompleto
          </span>
        )}
      </div>
      {contato.contatoNome && (
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="text-gray-700 text-xs">{contato.contatoNome}</span>
        </div>
      )}
      {contato.telefone && (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.telefone}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.telefone}</a>
        </div>
      )}
      {contato.contatoCelular && (
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.contatoCelular}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.contatoCelular}</a>
        </div>
      )}
      {(contato.contatoEmail || contato.email) && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`mailto:${contato.contatoEmail || contato.email}`} className="text-blue-600 hover:text-blue-800 hover:underline text-xs">{contato.contatoEmail || contato.email}</a>
        </div>
      )}
    </div>
  );
}

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; eapCodigo?: string; eapDescricao?: string; }
interface ParcelaForm { numero: number; vencimento: string; valor: string; }
interface AnexoOC { url: string; nome: string; tipo: string; ts: number; }

function gerarParcelas(n: number, total: number, primeiroVenc: string): ParcelaForm[] {
  const base = Math.floor((total / n) * 100) / 100;
  const resto = parseFloat((total - base * (n - 1)).toFixed(2));
  const primeiraDt = primeiroVenc || (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  })();
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(primeiraDt + "T00:00:00");
    dt.setMonth(dt.getMonth() + i);
    return {
      numero: i + 1,
      vencimento: dt.toISOString().split("T")[0],
      valor: i === n - 1 ? String(resto) : String(base),
    };
  });
}
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "" });

// Rev. 2486 — Grupos de itens por etapa (EAP). Cada grupo carrega 1 EAP
// (opcional) e N itens. No submit é "achatado" pra `itens[]` com `eapCodigo`
// por item (formato que o backend já espera — zero mudança de schema/router).
type GrupoForm = { eapCodigo?: string; eapDescricao?: string; itens: ItemForm[] };
const newGrupo = (): GrupoForm => ({ itens: [newItem()] });
function flattenGrupos(grupos: GrupoForm[]): ItemForm[] {
  return grupos.flatMap(g =>
    g.itens.map(i => ({
      ...i,
      eapCodigo: g.eapCodigo,
      eapDescricao: g.eapDescricao,
    }))
  );
}
// Reagrupa itens vindos do backend por `eapCodigo` em blocos CONTÍGUOS.
// Items com mesmo EAP separados por outro EAP no meio ficam em grupos
// distintos (preserva ordem de aparição da OC original — round-trip
// estável; ex.: [A,B,A] continua [A]+[B]+[A], não vira [A,A]+[B]).
// Items sem EAP seguem a mesma regra (key undefined também forma blocos).
function agruparItens(itens: ItemForm[]): GrupoForm[] {
  if (itens.length === 0) return [newGrupo()];
  const grupos: GrupoForm[] = [];
  for (const it of itens) {
    const last = grupos[grupos.length - 1];
    const mesmoEap = last && (last.eapCodigo ?? null) === (it.eapCodigo ?? null);
    const itemPuro: ItemForm = {
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      precoUnitario: it.precoUnitario,
    };
    if (mesmoEap) {
      last!.itens.push(itemPuro);
    } else {
      grupos.push({ eapCodigo: it.eapCodigo, eapDescricao: it.eapDescricao, itens: [itemPuro] });
    }
  }
  return grupos;
}

// ════════════════════════════════════════════════════════════════════
// Tabela de itens da OC com CONSOLIDAÇÃO visual: o mesmo insumo (mesma
// descrição + unidade), que a OC grava dividido por etapa da EAP, aparece
// numa ÚNICA linha (qtd/entregue/total somados). Quando há mais de uma
// etapa, a linha é EXPANSÍVEL para mostrar o rateio por etapa. O custo por
// etapa segue calculado por linha (em VALOR) — isto é só apresentação.
// ════════════════════════════════════════════════════════════════════
function OcItensConsolidados({ itens }: { itens: any[] }) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => consolidarOcItens(itens ?? []), [itens]);
  const toggle = (k: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const nfmt = (v: number) => v.toLocaleString("pt-BR");
  const numOf = (v: unknown) => {
    const n = parseFloat(String(v ?? "0"));
    return Number.isFinite(n) ? n : 0;
  };
  const badge = (estouro: boolean, avulso: boolean) =>
    estouro ? (
      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 print:border-red-400">PREJUÍZO</span>
    ) : avulso ? (
      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 print:border-orange-400">FORA DO ORÇAMENTO</span>
    ) : null;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
            <TableHead className="text-gray-500 text-xs">Descrição</TableHead>
            <TableHead className="text-gray-500 text-xs w-16">Un.</TableHead>
            <TableHead className="text-gray-500 text-xs w-20">Qtd</TableHead>
            <TableHead className="text-gray-500 text-xs w-24">Entregue</TableHead>
            <TableHead className="text-gray-500 text-xs w-28">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => {
            const multi = g.qtdEtapas > 1;
            const aberto = expandidos.has(g.chave);
            const rowBg = g.temSemVerba ? (g.temEstouro ? "bg-red-50 print:bg-red-50" : "bg-orange-50 print:bg-orange-50") : "";
            return (
              <Fragment key={g.chave}>
                <TableRow className={`border-gray-100 ${rowBg}`}>
                  <TableCell className="text-gray-900 text-sm">
                    <div className="flex items-center gap-1.5">
                      {multi ? (
                        <button
                          type="button"
                          onClick={() => toggle(g.chave)}
                          className="inline-flex items-center justify-center h-5 w-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0 print:hidden"
                          title={aberto ? "Recolher etapas" : "Ver rateio por etapa"}
                        >
                          {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <span className="inline-block h-5 w-5 shrink-0 print:hidden" />
                      )}
                      <span>{g.descricao}</span>
                      {multi && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                          {g.qtdEtapas} etapas
                        </span>
                      )}
                      {badge(g.temEstouro, g.temAvulso)}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{g.unidade || "un"}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{nfmt(g.quantidade)}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{nfmt(g.quantidadeEntregue)}</TableCell>
                  <TableCell className="text-emerald-700 text-sm font-medium">{brl(g.total)}</TableCell>
                </TableRow>
                {multi && aberto && g.etapas.map((et: any, i: number) => {
                  const etEstouro = !!et.semVerba && et.motivoSemVerba !== "avulso";
                  const etAvulso = !!et.semVerba && et.motivoSemVerba === "avulso";
                  return (
                    <TableRow key={`${g.chave}-et-${et.id ?? i}`} className="border-gray-100 bg-gray-50/60">
                      <TableCell className="text-gray-500 text-xs">
                        <div className="flex items-center gap-1 pl-7">
                          <span className="text-gray-300">↳</span>
                          <span>
                            Etapa{" "}
                            {et.insumoCodigo ? (
                              <code className="font-mono text-violet-600 bg-violet-50 px-1 rounded">{et.insumoCodigo}</code>
                            ) : (
                              <span className="text-gray-400 italic">sem etapa</span>
                            )}
                            {et.eapDescricao ? <span className="text-gray-400"> — {et.eapDescricao}</span> : null}
                          </span>
                          {badge(etEstouro, etAvulso)}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 text-xs">{et.unidade || "un"}</TableCell>
                      <TableCell className="text-gray-400 text-xs">{nfmt(numOf(et.quantidade))}</TableCell>
                      <TableCell className="text-gray-400 text-xs">{nfmt(numOf(et.quantidadeEntregue))}</TableCell>
                      <TableCell className="text-gray-500 text-xs">{brl(numOf(et.total) || numOf(et.quantidade) * numOf(et.precoUnitario))}</TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Rev. 2485 — Diálogo de reparo de duplicatas de numeração de OC.
// Fluxo: 1) abre → roda dryRun automaticamente → exibe preview;
//        2) usuário confirma → roda dryRun=false → toast + refetch.
// ════════════════════════════════════════════════════════════════════
type RepararPreviewState = {
  encontradas: number;
  novoProximo: number | null;
  renumeradas: Array<{ id: number; deNumero: string; paraNumero: string; status: string }>;
} | null;

function RepararDuplicatasDialog({
  open, onClose, companyId, onDone, preview, setPreview,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  onDone: () => void;
  preview: RepararPreviewState;
  setPreview: (p: RepararPreviewState) => void;
}) {
  const reparar = trpc.compras.repararDuplicatasNumeroOC.useMutation();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executando, setExecutando] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    if (preview !== null) return;
    setLoadingPreview(true);
    reparar.mutateAsync({ companyId, dryRun: true })
      .then(res => setPreview(res as RepararPreviewState))
      .catch(err => { toast.error(`Falha ao analisar: ${err?.message || "erro"}`); onClose(); })
      .finally(() => setLoadingPreview(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  const handleExecutar = async () => {
    if (!preview || preview.renumeradas.length === 0) return;
    setExecutando(true);
    try {
      const res = await reparar.mutateAsync({ companyId, dryRun: false });
      toast.success(`${res.renumeradas.length} OC(s) renumeradas. Próximo número: ${res.novoProximo ?? "—"}`);
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(`Falha ao executar: ${err?.message || "erro"}`);
    } finally {
      setExecutando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <Wrench className="h-5 w-5" /> Reparar duplicatas de numeração de OC
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Detecta OCs com o mesmo número sequencial dentro de um mesmo ano (ex: <b>OC-2026-218</b> e <b>OC-2026-0218</b>) e renumera a mais nova (id maior) pra próxima vaga disponível. A OC mais antiga preserva o número original. Operação atômica e idempotente.
          </div>

          {loadingPreview && (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando…
            </div>
          )}

          {!loadingPreview && preview && preview.renumeradas.length === 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Nenhuma duplicata encontrada. Está tudo certo.
            </div>
          )}

          {!loadingPreview && preview && preview.renumeradas.length > 0 && (
            <>
              <div className="text-xs text-gray-600">
                <b>{preview.encontradas}</b> grupo(s) com duplicata. <b>{preview.renumeradas.length}</b> OC(s) serão renumeradas.
                {preview.novoProximo != null && <> Próximo número ficará: <b>OC-{new Date().getFullYear()}-{String(preview.novoProximo).padStart(4, "0")}</b>.</>}
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader className="bg-gray-50 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">De</TableHead>
                      <TableHead className="text-xs">Para</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.renumeradas.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-gray-500">{r.id}</TableCell>
                        <TableCell className="text-xs font-mono text-red-600">{r.deNumero}</TableCell>
                        <TableCell className="text-xs font-mono text-emerald-700 font-semibold">→ {r.paraNumero}</TableCell>
                        <TableCell className="text-xs text-gray-600">{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={executando}>Cancelar</Button>
          {preview && preview.renumeradas.length > 0 && (
            <Button
              onClick={handleExecutar}
              disabled={executando || loadingPreview}
              className="bg-amber-600 hover:bg-amber-500 text-white gap-2"
            >
              {executando ? <><Loader2 className="h-4 w-4 animate-spin" /> Executando…</> : <><Wrench className="h-4 w-4" /> Executar correção</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Ordens() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const { user } = useAuth();

  const [abaAtiva, setAbaAtiva] = useState<"oc" | "os">("oc");
  const [busca, setBusca] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroObra, setFiltroObra] = useState("todas"); // Rev. 2090 — filtro por obra
  const [filtroValorMin, setFiltroValorMin] = useState("");
  const [filtroValorMax, setFiltroValorMax] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroAtrasadas, setFiltroAtrasadas] = useState(false);
  // Rev. 2307 — Filtro por TIPO (Material/MDO/Pacote/Equipamento)
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "compra" | "servico" | "pacote" | "equipamento">("todos");
  // Rev. 2487 — Ordenação clicável por coluna na tabela de OC.
  type OcSortKey = "numeroOc" | "obra" | "fornecedor" | "origem" | "total" | "entregaPrevista" | "status";
  const [sortKey, setSortKey] = useState<OcSortKey>("numeroOc");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(k: OcSortKey) {
    if (sortKey === k) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(["numeroOc", "total", "entregaPrevista"].includes(k) ? "desc" : "asc");
    }
  }
  const [showNova, setShowNova] = useState(false);
  const [showRepararDup, setShowRepararDup] = useState(false);
  const [repararPreview, setRepararPreview] = useState<RepararPreviewState>(null);
  const [rascunhoId, setRascunhoId] = useState<number | null>(null);
  const [showGuardDialog, setShowGuardDialog] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [showFdDialog, setShowFdDialog] = useState<any>(null);
  const [fdForm, setFdForm] = useState({ modalidade: "fd_cliente" as "fd_cliente" | "fd_terceiro", valor: "", bdiItemId: 0, contractId: 0 });
  const [showEstornoDialog, setShowEstornoDialog] = useState(false);
  const [showCancelarMaster, setShowCancelarMaster] = useState(false);
  const [cancelMasterMotivo, setCancelMasterMotivo] = useState("");
  const [cancelMasterSenha, setCancelMasterSenha] = useState("");
  const [estornoMotivo, setEstornoMotivo] = useState("");
  // Rev. 4075 — dialog de data de lançamento (retroativa) ao mudar status que dispara
  // integração financeira (aprovada/entregue/entregue_parcial). Default = hoje.
  const [showLancamentoDialog, setShowLancamentoDialog] = useState<{ id: number; status: string } | null>(null);
  const [dataLancamentoInput, setDataLancamentoInput] = useState("");

  // ── OC IA (Rev. 4420) ─────────────────────────────────────────
  const [ocIAStep, setOcIAStep] = useState<"idle"|"upload"|"processing"|"review">("idle");
  const [ocIAJobId, setOcIAJobId] = useState<string | null>(null);
  const [ocIAResult, setOcIAResult] = useState<any | null>(null);
  const [ocIADragOver, setOcIADragOver] = useState(false);
  const [ocIAProgress, setOcIAProgress] = useState(0);
  const ocIAFileRef = useRef<HTMLInputElement>(null);

  const [autoSwitchedForCompany, setAutoSwitchedForCompany] = useState<number | null>(null);
  const urlTabHandled = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("destaque");
    if (d) {
      const id = parseInt(d);
      if (!isNaN(id)) setShowDetalhe(id);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("tab") === "os") {
      setAbaAtiva("os");
      urlTabHandled.current = true;
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [tipoFaturamento, setTipoFaturamento] = useState<"normal" | "fd_cliente" | "fd_fc">("normal");
  const [editandoOcStatus, setEditandoOcStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    obraId: "", fornecedorId: "", dataEntregaPrevista: "", dataVencimento: "", observacoes: "",
    frete: "", outrasDespesas: "", impostos: "", desconto: "",
    condicaoPagamento: "", prazoEntregaDias: "", numeroNf: "",
    formaPagamento: "", contaBancariaId: "", cartaoId: "",
    tipoOc: "compra" as "compra" | "locacao" | "servico",
  });
  // Rev. 2486 — Grupos por etapa. `itens` legado computado via flatten()
  // pra preservar compatibilidade com leitores existentes (formHasData,
  // payload, etc).
  const [grupos, setGrupos] = useState<GrupoForm[]>([newGrupo()]);
  const itens = flattenGrupos(grupos);
  const [numParc, setNumParc] = useState(1);
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([]);
  const [fornecedorPopoverOpen, setFornecedorPopoverOpen] = useState(false);
  const [eapPopoverGi, setEapPopoverGi] = useState<number | null>(null);
  const [anexosForm, setAnexosForm] = useState<AnexoOC[]>([]);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [detalheAnexoDrag, setDetalheAnexoDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detalheFileInputRef = useRef<HTMLInputElement>(null);

  const q = trpc.compras.listarOrdens.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus, apenasAtrasadas: filtroAtrasadas || undefined },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getOrdem.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const parcelasQ = trpc.purchase.listarParcelasOC.useQuery(
    { ordemId: showDetalhe!, companyId },
    { enabled: showDetalhe !== null && companyId > 0 }
  );
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const contasBancariasQ = trpc.folha.listarContasBancarias.useQuery({ companyId }, { enabled: companyId > 0, staleTime: 60_000 });
  const eapQ = trpc.compras.getEapParaObra.useQuery(
    { obraId: parseInt(form.obraId), companyId },
    { enabled: !!form.obraId && parseInt(form.obraId) > 0 && companyId > 0, staleTime: 60_000 }
  );
  const contratosOS = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const allOCsQ = trpc.compras.listarOrdens.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  useEffect(() => {
    if (urlTabHandled.current) return;
    if (autoSwitchedForCompany === companyId) return;
    if (allOCsQ.data && contratosOS.data) {
      if (allOCsQ.data.length === 0 && contratosOS.data.length > 0) {
        setAbaAtiva("os");
      }
      setAutoSwitchedForCompany(companyId);
    }
  }, [allOCsQ.data, contratosOS.data, companyId, autoSwitchedForCompany]);

  const criarManual = trpc.compras.criarOrdemManual.useMutation({
    onSuccess: () => { toast.success("Ordem de Compra criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarRascunhoMut = trpc.compras.salvarRascunhoOrdem.useMutation({
    onSuccess: (res) => {
      if (!rascunhoId) setRascunhoId(res.id);
      toast.success("Rascunho salvo!");
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const confirmarRascunhoMut = trpc.compras.confirmarRascunhoOrdem.useMutation({
    onSuccess: (res) => {
      toast.success(`OC ${formatNumeroOcDisplay(res.numeroOc)} criada com sucesso!`);
      setShowNova(false);
      setShowDetalhe(null);
      resetForm();
      q.refetch();
      detalheQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  // ── OC IA mutations + polling (Rev. 4420) ──────────────────────
  const extrairOCIAMut = trpc.compras.extrairOCIA.useMutation({
    onSuccess: (res) => { setOcIAJobId(res.jobId); setOcIAStep("processing"); },
    onError: (e) => { toast.error(e.message); setOcIAStep("upload"); },
  });
  const ocIAPollQ = trpc.compras.getIaExtractionResult.useQuery(
    { jobId: ocIAJobId ?? "" },
    { enabled: ocIAStep === "processing" && !!ocIAJobId, refetchInterval: 2000 }
  );
  useEffect(() => {
    if (ocIAStep !== "processing") { setOcIAProgress(0); return; }
    setOcIAProgress(0);
    const iv = setInterval(() => {
      setOcIAProgress(p => p < 90 ? Math.min(p + Math.random() * 4 + 1, 90) : p);
    }, 1200);
    return () => clearInterval(iv);
  }, [ocIAStep]);

  useEffect(() => {
    if (!ocIAPollQ.data) return;
    const d = ocIAPollQ.data as any;
    if (d.status === "done") {
      setOcIAProgress(100);
      setTimeout(() => {
        setOcIAJobId(null);
        setOcIAResult(d);
        setOcIAStep("review");
        setOcIAProgress(0);
      }, 600);
    } else if (d.status === "error") {
      setOcIAJobId(null);
      toast.error((d as any).error ?? "Erro na leitura por IA");
      setOcIAStep("upload");
    }
  }, [ocIAPollQ.data]);

  const atualizarStatus = trpc.compras.atualizarStatusOrdem.useMutation({
    onSuccess: (res: any) => {
      if (res?.almoxarifado) {
        toast.success(`OC entregue! ${res.itens ?? 0} ite${res.itens === 1 ? "m enviado" : "ns enviados"} ao Almoxarifado automaticamente.`);
      } else {
        toast.success("Status atualizado!");
      }
      q.refetch();
      detalheQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const estornarRecebimento = trpc.compras.estornarRecebimentoOC.useMutation({
    onSuccess: () => {
      toast.success("Recebimento estornado! A OC voltou para status Aprovada.");
      q.refetch();
      detalheQ.refetch();
      setShowEstornoDialog(false);
      setEstornoMotivo("");
    },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirOrdem.useMutation({
    onSuccess: () => { toast.success("OC excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4017 — Item 10: duplicar OC (útil para lançamentos recorrentes: aluguel de
  // container, equipamentos, etc.) — cópia nasce como rascunho, sem datas/histórico.
  const duplicarOrdem = trpc.compras.duplicarOrdem.useMutation({
    onSuccess: (data: any) => { toast.success(`OC ${formatNumeroOcDisplay(data.numeroOc)} criada (cópia)!`); q.refetch(); setShowDetalhe(data.id); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarMaster = trpc.compras.cancelarOrdemMaster.useMutation({
    onSuccess: (res: any) => {
      const partes: string[] = [];
      if (res?.contratoCancelado) partes.push("contrato cancelado");
      if (res?.medicoesCanceladas) partes.push(`${res.medicoesCanceladas} medição(ões)`);
      if (res?.financeirosCancelados) partes.push(`${res.financeirosCancelados} lançamento(s) não pago(s)`);
      toast.success(`OC/OS cancelada${partes.length ? " — também: " + partes.join(", ") : ""}.`);
      q.refetch(); detalheQ.refetch();
      setShowCancelarMaster(false); setCancelMasterMotivo(""); setCancelMasterSenha("");
    },
    onError: (e) => toast.error(e.message),
  });
  const excluirLote = trpc.compras.excluirOrdensEmLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.count} OC(s) excluída(s)!`); q.refetch(); setSelectedIds(new Set()); setConfirmExcluirLote(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarEntregaMut = trpc.compras.atualizarDadosEntregaOC.useMutation({
    onSuccess: () => { toast.success("Dados de entrega atualizados!"); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const marcarFd = trpc.compras.marcarOcComoFd.useMutation({
    onSuccess: () => { toast.success("OC marcada como Faturamento Direto!"); q.refetch(); detalheQ.refetch(); setShowFdDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarFd = trpc.compras.aprovarFdCliente.useMutation({
    onSuccess: () => { toast.success("FD aprovado pelo cliente!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarExtra = trpc.compras.aprovarOcExtra.useMutation({
    onSuccess: (res) => {
      toast.success(`OC aprovada pelo administrador ${res.adminNome}!`);
      if (res.docsPendentes && res.docsPendentes.length > 0) {
        toast.warning(`Atenção: Documentos PJ pendentes para o prestador: ${res.docsPendentes.join(", ")}. Regularize antes do pagamento.`, { duration: 8000 });
      }
      if (res.contratoGerado) {
        toast.info(res.contratoGerado.tipo === "aditivo" ? "Contrato PJ existente atualizado via aditivo." : "Contrato PJ gerado automaticamente.", { duration: 5000 });
      }
      q.refetch(); detalheQ.refetch(); setShowAprovacaoExtra(null); setAprovExtraForm({ adminEmail: "", adminSenha: "", justificativa: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadAnexoOrdem = trpc.compras.uploadAnexoOrdem.useMutation({
    onError: (e) => { toast.error(e.message); setUploadingAnexo(false); },
  });
  const removeAnexoOrdem = trpc.compras.removeAnexoOrdem.useMutation({
    onSuccess: () => { detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "heic", "bmp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"];
  const ACCEPT_ATTR = ALLOWED_EXTS.map(e => `.${e}`).join(",") + ",image/*";

  const processFiles = useCallback(async (files: FileList | File[], targetOrdemId?: number) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    for (const file of arr) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTS.includes(ext)) { toast.error(`Formato não suportado: ${file.name}. Aceitos: imagens (JPG, PNG, etc.), PDF, DOC, XLS e outros.`); continue; }
      if (file.size > 20 * 1024 * 1024) { toast.error(`Arquivo muito grande: ${file.name} (máx. 20 MB).`); continue; }
      setUploadingAnexo(true);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await uploadAnexoOrdem.mutateAsync({ companyId, fileBase64: base64, fileName: file.name, ordemId: targetOrdemId });
        if (targetOrdemId) {
          detalheQ.refetch();
        } else {
          setAnexosForm(prev => [...prev, result]);
        }
        toast.success(`Anexo adicionado: ${file.name}`);
      } catch {
        // error handled by onError
      } finally {
        setUploadingAnexo(false);
      }
    }
  }, [companyId, uploadAnexoOrdem, detalheQ]);
  const [showAprovacaoExtra, setShowAprovacaoExtra] = useState<any>(null);
  const [aprovExtraForm, setAprovExtraForm] = useState({ adminEmail: "", adminSenha: "", justificativa: "" });
  const [editTransp, setEditTransp] = useState("");
  const [editRastreio, setEditRastreio] = useState("");

  async function handleOCIAFile(file: File) {
    if (!file) return;
    const validTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!validTypes.includes(file.type)) { toast.error("Formato inválido. Use PDF, JPG ou PNG."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10 MB."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string)?.split(",")[1] ?? "";
      extrairOCIAMut.mutate({ companyId, fileBase64: b64, fileName: file.name, mimeType: file.type as any });
    };
    reader.readAsDataURL(file);
  }

  function preencherOCDeIA() {
    if (!ocIAResult) return;
    const itensIA = (ocIAResult.itens ?? []) as any[];
    const gruposIA: GrupoForm[] = itensIA.length > 0
      ? [{ itens: itensIA.map((it: any) => ({ descricao: it.descricao, unidade: it.unidade, quantidade: String(it.quantidade), precoUnitario: it.precoUnitario != null ? String(it.precoUnitario) : "" })) }]
      : [newGrupo()];
    setGrupos(gruposIA);
    setForm(p => ({
      ...p,
      condicaoPagamento: ocIAResult.condicaoPagamento ?? p.condicaoPagamento,
      prazoEntregaDias: ocIAResult.prazoEntregaDias != null ? String(ocIAResult.prazoEntregaDias) : p.prazoEntregaDias,
      observacoes: ocIAResult.observacoes ?? p.observacoes,
    }));
    setOcIAStep("idle");
    setOcIAResult(null);
    setShowNova(true);
  }

  function resetForm() {
    setForm({ obraId: "", fornecedorId: "", dataEntregaPrevista: "", dataVencimento: "", observacoes: "", frete: "", outrasDespesas: "", impostos: "", desconto: "", condicaoPagamento: "", prazoEntregaDias: "", numeroNf: "", formaPagamento: "", contaBancariaId: "", cartaoId: "", tipoOc: "compra" });
    setGrupos([newGrupo()]);
    setNumParc(1);
    setParcelas([]);
    setAnexosForm([]);
    setRascunhoId(null);
    setTipoFaturamento("normal");
    setEditandoOcStatus(null);
  }

  function formHasData() {
    const temCampo = Object.values(form).some(v => v !== "");
    const temItem = itens.some(i => i.descricao.trim() || i.precoUnitario !== "");
    return temCampo || temItem || rascunhoId !== null;
  }

  function handleCloseGuard() {
    if (showGuardDialog) return;
    if (formHasData()) {
      setShowGuardDialog(true);
    } else {
      setShowNova(false);
      resetForm();
    }
  }

  function buildRascunhoPayload() {
    const validos = itens.filter(i => i.descricao.trim());
    return {
      id: rascunhoId ?? undefined,
      companyId,
      obraId: form.obraId && form.obraId !== "none" ? parseInt(form.obraId) : undefined,
      fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
      numeroNf: form.numeroNf || undefined,
      formaPagamento: form.formaPagamento || undefined,
      contaBancariaId: form.contaBancariaId ? parseInt(form.contaBancariaId) : undefined,
      cartaoId: form.formaPagamento === "cartao_credito" && form.cartaoId ? parseInt(form.cartaoId) : null,
      condicaoPagamento: form.condicaoPagamento || undefined,
      numeroParcelas: numParc,
      parcelasJson: parcelas.length > 0 ? parcelas.map(p => ({ numero: p.numero, vencimento: p.vencimento || undefined, valor: parseFloat(p.valor) || 0 })) : undefined,
      prazoEntregaDias: parseInt((form as any).prazoEntregaDias) || undefined,
      dataEntregaPrevista: form.dataEntregaPrevista || undefined,
      dataVencimento: form.dataVencimento || undefined,
      observacoes: form.observacoes || undefined,
      frete: parseFloat(form.frete) || 0,
      outrasDespesas: parseFloat(form.outrasDespesas) || 0,
      impostos: parseFloat(form.impostos) || 0,
      desconto: parseFloat(form.desconto) || 0,
      modalidadeFd: tipoFaturamento,
      userId: user?.id,
      userName: user?.name,
      anexos: anexosForm.length > 0 ? anexosForm : undefined,
      itens: validos.map(i => ({
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
        insumoCodigo: i.eapCodigo ?? undefined,
      })),
    };
  }

  async function handleSalvarRascunho() {
    try {
      const res = await salvarRascunhoMut.mutateAsync(buildRascunhoPayload());
      if (!rascunhoId) setRascunhoId(res.id);
    } catch { /* handled by onError */ }
  }

  async function handleSalvarRascunhoEFechar() {
    try {
      const res = await salvarRascunhoMut.mutateAsync(buildRascunhoPayload());
      if (!rascunhoId) setRascunhoId(res.id);
      setShowGuardDialog(false);
      setShowNova(false);
      resetForm();
    } catch { /* handled by onError */ }
  }

  function abrirEditarRascunho(ocDetalhe: any) {
    setRascunhoId(ocDetalhe.id);
    setEditandoOcStatus(ocDetalhe.status ?? "rascunho");
    const fd = (ocDetalhe as any).modalidadeFd;
    setTipoFaturamento(fd === "fd_cliente" ? "fd_cliente" : fd === "fd_fc" ? "fd_fc" : "normal");
    setForm({
      obraId: ocDetalhe.obraId ? String(ocDetalhe.obraId) : "",
      fornecedorId: ocDetalhe.fornecedorId ? String(ocDetalhe.fornecedorId) : "",
      dataEntregaPrevista: ocDetalhe.dataEntregaPrevista ?? "",
      dataVencimento: (ocDetalhe as any).dataVencimento ?? "",
      observacoes: ocDetalhe.observacoes ?? "",
      frete: ocDetalhe.frete && ocDetalhe.frete !== "0.00" ? String(parseFloat(ocDetalhe.frete)) : "",
      outrasDespesas: ocDetalhe.outrasDespesas && ocDetalhe.outrasDespesas !== "0.00" ? String(parseFloat(ocDetalhe.outrasDespesas)) : "",
      impostos: ocDetalhe.impostos && ocDetalhe.impostos !== "0.00" ? String(parseFloat(ocDetalhe.impostos)) : "",
      desconto: ocDetalhe.desconto && ocDetalhe.desconto !== "0.00" ? String(parseFloat(ocDetalhe.desconto)) : "",
      condicaoPagamento: ocDetalhe.condicaoPagamento ?? "",
      prazoEntregaDias: "",
      numeroNf: ocDetalhe.numeroNf ?? "",
      formaPagamento: (ocDetalhe as any).formaPagamento ?? "",
      contaBancariaId: (ocDetalhe as any).contaBancariaId ? String((ocDetalhe as any).contaBancariaId) : "",
      cartaoId: (ocDetalhe as any).cartaoId ? String((ocDetalhe as any).cartaoId) : "",
    });
    if (ocDetalhe.itens && ocDetalhe.itens.length > 0) {
      // Rev. 2486 — reagrupa por eapCodigo ao carregar.
      const flat: ItemForm[] = ocDetalhe.itens.map((it: any) => ({
        descricao: it.descricao,
        unidade: it.unidade ?? "un",
        quantidade: String(it.quantidade),
        precoUnitario: String(it.precoUnitario),
        eapCodigo: (it as any).insumoCodigo ?? undefined,
      }));
      setGrupos(agruparItens(flat));
    } else {
      setGrupos([newGrupo()]);
    }
    setAnexosForm((ocDetalhe.anexos as AnexoOC[]) ?? []);
    setNumParc(ocDetalhe.numeroParcelas ?? 1);
    setParcelas((ocDetalhe as any).parcelasJson ?? []);
    setShowDetalhe(null);
    setShowNova(true);
  }

  function handleSalvar() {
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta ordem de compra.");
    if (!form.condicaoPagamento.trim()) return toast.error("Informe a Condição de Pagamento para gerar a OC.");
    if (!(form as any).prazoEntregaDias && !form.dataEntregaPrevista) return toast.error("Informe o Prazo de Entrega para gerar a OC.");
    const validos = itens.filter(i => i.descricao.trim());
    if (validos.length === 0) return toast.error("Adicione pelo menos um item.");
    if (rascunhoId) {
      confirmarRascunhoMut.mutate({
        id: rascunhoId,
        companyId,
        obraId: parseInt(form.obraId),
        fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
        numeroNf: form.numeroNf || undefined,
        formaPagamento: form.formaPagamento || undefined,
        contaBancariaId: form.contaBancariaId ? parseInt(form.contaBancariaId) : undefined,
        cartaoId: form.formaPagamento === "cartao_credito" && form.cartaoId ? parseInt(form.cartaoId) : null,
        condicaoPagamento: form.condicaoPagamento,
        numeroParcelas: numParc,
        parcelasJson: parcelas.length > 0 ? parcelas.map(p => ({ numero: p.numero, vencimento: p.vencimento || undefined, valor: parseFloat(p.valor) || 0 })) : undefined,
        dataEntregaPrevista: form.dataEntregaPrevista || undefined,
        dataVencimento: form.dataVencimento || undefined,
        observacoes: form.observacoes || undefined,
        frete: parseFloat(form.frete) || 0,
        outrasDespesas: parseFloat(form.outrasDespesas) || 0,
        impostos: parseFloat(form.impostos) || 0,
        desconto: parseFloat(form.desconto) || 0,
        modalidadeFd: tipoFaturamento,
        userId: user?.id,
        userName: user?.name,
        anexos: anexosForm.length > 0 ? anexosForm : undefined,
        itens: validos.map(i => ({
          descricao: i.descricao,
          unidade: i.unidade,
          quantidade: parseFloat(i.quantidade) || 1,
          precoUnitario: parseFloat(i.precoUnitario) || 0,
          insumoCodigo: i.eapCodigo ?? undefined,
        })),
      });
      return;
    }
    criarManual.mutate({
      companyId,
      obraId: parseInt(form.obraId),
      fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
      numeroNf: form.numeroNf || undefined,
      formaPagamento: form.formaPagamento || undefined,
      contaBancariaId: form.contaBancariaId ? parseInt(form.contaBancariaId) : undefined,
      cartaoId: form.formaPagamento === "cartao_credito" && form.cartaoId ? parseInt(form.cartaoId) : null,
      condicaoPagamento: form.condicaoPagamento,
      numeroParcelas: numParc,
      parcelasJson: parcelas.length > 0 ? parcelas.map(p => ({ numero: p.numero, vencimento: p.vencimento || undefined, valor: parseFloat(p.valor) || 0 })) : undefined,
      prazoEntregaDias: parseInt((form as any).prazoEntregaDias) || undefined,
      dataEntregaPrevista: form.dataEntregaPrevista || undefined,
      dataVencimento: form.dataVencimento || undefined,
      observacoes: form.observacoes || undefined,
      frete: parseFloat(form.frete) || 0,
      outrasDespesas: parseFloat(form.outrasDespesas) || 0,
      impostos: parseFloat(form.impostos) || 0,
      desconto: parseFloat(form.desconto) || 0,
      modalidadeFd: tipoFaturamento,
      tipoOc: form.tipoOc,
      userId: user?.id,
      userName: user?.name,
      anexos: anexosForm.length > 0 ? anexosForm : undefined,
      itens: validos.map(i => ({
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
        insumoCodigo: i.eapCodigo ?? undefined,
      })),
    });
  }

  // Rev. 2486 — Helpers por GRUPO (etapa).
  function addGrupo() { setGrupos(p => [...p, newGrupo()]); }
  function removeGrupo(gi: number) {
    setGrupos(p => {
      const next = p.filter((_, i) => i !== gi);
      return next.length === 0 ? [newGrupo()] : next;
    });
  }
  function setEapDoGrupo(gi: number, eapCodigo: string | undefined, eapDescricao: string | undefined) {
    setGrupos(p => p.map((g, i) => i === gi ? { ...g, eapCodigo, eapDescricao } : g));
  }
  function addItemNoGrupo(gi: number) {
    setGrupos(p => p.map((g, i) => i === gi ? { ...g, itens: [...g.itens, newItem()] } : g));
  }
  function removeItem(gi: number, ii: number) {
    setGrupos(p => p.map((g, i) => {
      if (i !== gi) return g;
      const next = g.itens.filter((_, j) => j !== ii);
      return { ...g, itens: next.length === 0 ? [newItem()] : next };
    }));
  }
  function updateItem(gi: number, ii: number, field: keyof ItemForm, val: string) {
    setGrupos(p => p.map((g, i) => i !== gi ? g : ({
      ...g,
      itens: g.itens.map((it, j) => j === ii ? { ...it, [field]: val } : it),
    })));
  }

  const fornecedores = fornQ.data ?? [];
  const obras = obrasQ.data ?? [];
  const lista = q.data ?? [];
  const filtBase = lista.filter(o => {
    if (busca && !o.numeroOc?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroFornecedor) {
      const forn = fornecedores.find((f: any) => f.id === o.fornecedorId);
      const nome = forn?.nomeFantasia || forn?.razaoSocial || "";
      if (!normalizarTexto(nome).includes(normalizarTexto(filtroFornecedor))) return false;
    }
    // Rev. 2090 — filtro por obra (centro de custo).
    // "sem_obra" usa checagem explícita de nulidade (não truthiness) pra não
    // classificar erroneamente um obraId === 0 como órfão.
    if (filtroObra !== "todas") {
      const obraId = (o as any).obraId;
      if (filtroObra === "sem_obra") {
        if (obraId !== null && obraId !== undefined) return false;
      } else if (String(obraId ?? "") !== filtroObra) {
        return false;
      }
    }
    const total = parseFloat((o as any).total ?? "0");
    if (filtroValorMin && !isNaN(parseFloat(filtroValorMin)) && total < parseFloat(filtroValorMin)) return false;
    if (filtroValorMax && !isNaN(parseFloat(filtroValorMax)) && total > parseFloat(filtroValorMax)) return false;
    const dataCriacao = ((o as any).criadoEm ?? "").slice(0, 10);
    if (filtroDataInicio && dataCriacao < filtroDataInicio) return false;
    if (filtroDataFim && dataCriacao > filtroDataFim) return false;
    // Rev. 2307 — Tipo: "compra" é o default histórico (Material) e
    // também cobre registros antigos com tipo null/vazio.
    if (filtroTipo !== "todos") {
      const tipoOc = ((o as any).tipo ?? "compra") || "compra";
      if (filtroTipo === "compra" ? tipoOc !== "compra" : tipoOc !== filtroTipo) return false;
    }
    return true;
  });
  // Rev. 2487 — Ordenação clicável por coluna.
  function nomeObraSort(id: any) {
    if (id === null || id === undefined) return "";
    const o = obras.find((x: any) => x.id === id);
    return (o?.nome || "").toString();
  }
  function nomeFornSort(id: any) {
    if (id === null || id === undefined) return "";
    const f = fornecedores.find((x: any) => x.id === id);
    return (f?.nomeFantasia || f?.razaoSocial || "").toString();
  }
  function isEmptyOc(v: any): boolean {
    return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
  }
  function cmpOc(a: any, b: any): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  }
  function valForSortOc(o: any): any {
    switch (sortKey) {
      case "numeroOc":         return o.numeroOc ?? null;
      case "obra":             return nomeObraSort((o as any).obraId) || null;
      case "fornecedor":       return nomeFornSort(o.fornecedorId) || null;
      // "Origem" sempre tem valor (Manual ou COT-N), nunca vazio.
      case "origem":           return (o as any).cotacaoNumero ? formatNumeroCotacaoDisplay((o as any).cotacaoNumero) : ((o as any).cotacaoId ? "Cotação" : "Manual");
      case "total":            { const v = parseFloat((o as any).total ?? ""); return isNaN(v) ? null : v; }
      case "entregaPrevista":  return ((o as any).dataEntregaPrevista ?? null) || null;
      case "status":           return (o.status ?? null) || null;
      default:                 return null;
    }
  }
  // Vazios SEMPRE no fim (independente de asc/desc).
  const filt = [...filtBase].sort((a, b) => {
    const va = valForSortOc(a);
    const vb = valForSortOc(b);
    const ea = isEmptyOc(va);
    const eb = isEmptyOc(vb);
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    const r = cmpOc(va, vb);
    return sortDir === "asc" ? r : -r;
  });
  // Rev. 2307 — Contadores por tipo (após status/busca/obra/etc, antes do filtro de tipo).
  const contadoresTipo = (() => {
    const base = lista.filter(o => {
      if (busca && !o.numeroOc?.toLowerCase().includes(busca.toLowerCase())) return false;
      if (filtroFornecedor) {
        const forn = fornecedores.find((f: any) => f.id === o.fornecedorId);
        const nome = forn?.nomeFantasia || forn?.razaoSocial || "";
        if (!normalizarTexto(nome).includes(normalizarTexto(filtroFornecedor))) return false;
      }
      if (filtroObra !== "todas") {
        const obraId = (o as any).obraId;
        if (filtroObra === "sem_obra") {
          if (obraId !== null && obraId !== undefined) return false;
        } else if (String(obraId ?? "") !== filtroObra) return false;
      }
      const total = parseFloat((o as any).total ?? "0");
      if (filtroValorMin && !isNaN(parseFloat(filtroValorMin)) && total < parseFloat(filtroValorMin)) return false;
      if (filtroValorMax && !isNaN(parseFloat(filtroValorMax)) && total > parseFloat(filtroValorMax)) return false;
      const dataCriacao = ((o as any).criadoEm ?? "").slice(0, 10);
      if (filtroDataInicio && dataCriacao < filtroDataInicio) return false;
      if (filtroDataFim && dataCriacao > filtroDataFim) return false;
      return true;
    });
    const c = { todos: base.length, compra: 0, servico: 0, pacote: 0, equipamento: 0 } as Record<string, number>;
    for (const o of base) {
      const t = ((o as any).tipo ?? "compra") || "compra";
      if (c[t] !== undefined) c[t]++;
      else c.compra++;
    }
    return c;
  })();
  const detalhe = detalheQ.data;

  const allFilteredIds = filt.map(o => o.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allSelected) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(allFilteredIds)); }
  }

  const totalItens = itens.reduce((s, it) => s + (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0), 0);
  const totalOC = totalItens + (parseFloat(form.frete) || 0) + (parseFloat(form.outrasDespesas) || 0) + (parseFloat(form.impostos) || 0) - (parseFloat(form.desconto) || 0);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  const pend = lista.filter(o => o.status === "pendente").length;
  const aprov = lista.filter(o => o.status === "aprovada").length;
  const entregue = lista.filter(o => o.status === "entregue").length;
  const totalVal = lista.reduce((s, o) => s + parseFloat(o.total ?? "0"), 0);
  const atrasadas = lista.filter(o => {
    const sem = calcularSemaforo(o.dataEntregaPrevista, o.dataEntregaReal, o.status, o.proximaEntregaProgramada);
    return sem.status === "atrasado";
  }).length;

  interface KpiCard {
    label: string;
    value: string | number;
    icon: typeof ShoppingBag;
    cls: string;
    onClick?: () => void;
  }
  const kpiCards: KpiCard[] = [
    { label: "Pendentes",    value: pend,    icon: ShoppingBag,  cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Aprovadas",   value: aprov,   icon: CheckCircle,  cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Atrasadas",   value: atrasadas, icon: AlertTriangle, cls: atrasadas > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500", onClick: () => { setFiltroAtrasadas(!filtroAtrasadas); setFiltroStatus("todos"); } },
    { label: "Entregues",   value: entregue, icon: PackageCheck, cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Total em OCs", value: totalVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icon: Truck, cls: "bg-purple-50 border-purple-200 text-purple-700" },
  ];

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ordens de Compra / Serviço</h1>
            <p className="text-sm text-gray-500">Acompanhe OCs de material e contratos de serviço (OS)</p>
          </div>
        </div>
        {abaAtiva === "oc" && (
          <DraggableCommandBar barId="ordens-compra" items={[
            { id: "nova", node: <Button onClick={() => setShowNova(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova OC Manual</Button> },
            { id: "oc-ia", node: <Button onClick={() => { setOcIAStep("upload"); setOcIAResult(null); setOcIAJobId(null); }} className="bg-blue-600 hover:bg-blue-500 text-white gap-2"><Sparkles className="h-4 w-4" /> Criar OC por IA</Button> },
            { id: "reparar-dup", node: <Button onClick={() => { setShowRepararDup(true); setRepararPreview(null); }} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-2" title="Detectar e corrigir OCs com numeração duplicada (admin)"><Wrench className="h-4 w-4" /> Reparar duplicatas</Button> },
          ]} />
        )}
      </div>

      {/* Rev. 2485 — Modal de reparo de duplicatas de numeração de OC */}
      <RepararDuplicatasDialog
        open={showRepararDup}
        onClose={() => { setShowRepararDup(false); setRepararPreview(null); }}
        companyId={companyId}
        onDone={() => { q.refetch(); }}
        preview={repararPreview}
        setPreview={setRepararPreview}
      />

      {/* Tabs OC / OS */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-fit">
        <button
          onClick={() => { setAbaAtiva("oc"); setBusca(""); setFiltroFornecedor(""); setFiltroObra("todas"); setFiltroValorMin(""); setFiltroValorMax(""); setFiltroDataInicio(""); setFiltroDataFim(""); setFiltroStatus("todos"); setFiltroAtrasadas(false); setFiltroTipo("todos"); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === "oc" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
          <ShoppingBag className="h-4 w-4" />
          Ordens de Compra (Material)
          {(q.data?.length ?? 0) > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${abaAtiva === "oc" ? "bg-emerald-500" : "bg-gray-200 text-gray-600"}`}>{q.data?.length ?? 0}</span>}
        </button>
        <button
          onClick={() => { setAbaAtiva("os"); setBusca(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === "os" ? "bg-purple-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
          <Wrench className="h-4 w-4" />
          Contratos de Serviço (OS)
          {(contratosOS.data?.length ?? 0) > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${abaAtiva === "os" ? "bg-purple-500" : "bg-gray-200 text-gray-600"}`}>{contratosOS.data?.length ?? 0}</span>}
        </button>
      </div>

      {abaAtiva === "oc" && <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiCards.map((k, i) => (
          <div key={i} className={`rounded-xl border p-4 ${k.cls} ${k.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={k.onClick}>
            <div className="flex items-center gap-2 mb-1">
              <k.icon className="h-4 w-4" />
              <span className="text-xs font-medium text-gray-500">{k.label}</span>
            </div>
            <div className="text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros — linha 1: número, linha 2: fornecedor + valor */}
      <div className="space-y-2">
        {/* Linha 1: busca por número */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48 max-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Buscar por número..." className="pl-9 bg-white border-gray-300 text-gray-900 h-9 text-sm" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["todos", "rascunho", "pendente", "aprovada", "entregue_parcial", "entregue", "cancelada"].map(s => (
              <button key={s} onClick={() => { setFiltroStatus(s); setFiltroAtrasadas(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s && !filtroAtrasadas ? (s === "rascunho" ? "bg-yellow-500 border-yellow-400 text-white" : "bg-emerald-600 border-emerald-500 text-white") : (s === "rascunho" ? "bg-yellow-50 border-yellow-300 text-yellow-700 hover:border-yellow-400" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400")}`}>
                {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label}
              </button>
            ))}
            <button onClick={() => { setFiltroAtrasadas(!filtroAtrasadas); setFiltroStatus("todos"); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${filtroAtrasadas ? "bg-red-600 border-red-500 text-white" : "bg-white border-red-300 text-red-600 hover:border-red-400"}`}>
              <AlertTriangle className="h-3 w-3" /> Atrasadas
            </button>
          </div>
        </div>
        {/* Rev. 2307 — Linha de filtro por TIPO (cross-filter com contadores) */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mr-1">Tipo:</span>
          {([
            { v: "todos",       label: "Todos",        ativo: "bg-emerald-600 border-emerald-500 text-white",  inativo: "bg-white border-gray-300 text-gray-600 hover:border-gray-400" },
            { v: "compra",      label: "Material",     ativo: "bg-blue-600 border-blue-500 text-white",        inativo: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400" },
            { v: "servico",     label: "MDO",          ativo: "bg-purple-600 border-purple-500 text-white",    inativo: "bg-purple-50 border-purple-200 text-purple-700 hover:border-purple-400" },
            { v: "pacote",      label: "MAT+MDO",      ativo: "bg-indigo-600 border-indigo-500 text-white",    inativo: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:border-indigo-400" },
            { v: "equipamento", label: "Equipamento",  ativo: "bg-cyan-600 border-cyan-500 text-white",        inativo: "bg-cyan-50 border-cyan-200 text-cyan-700 hover:border-cyan-400" },
          ] as const).map(opt => {
            const ativo = filtroTipo === opt.v;
            const n = contadoresTipo[opt.v] ?? 0;
            return (
              <button key={opt.v} onClick={() => setFiltroTipo(opt.v as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all inline-flex items-center gap-1.5 ${ativo ? opt.ativo : opt.inativo}`}>
                {opt.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ativo ? "bg-white/25 text-white" : "bg-white/70 text-gray-700"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        {/* Linha 2: fornecedor + valor mín/máx */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48 max-w-72">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por fornecedor..."
              className="pl-9 bg-white border-gray-300 text-gray-900 h-9 text-sm"
              value={filtroFornecedor}
              onChange={e => setFiltroFornecedor(e.target.value)}
            />
            {filtroFornecedor && (
              <button onClick={() => setFiltroFornecedor("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              type="number"
              min={0}
              placeholder="Valor mín"
              className="w-32 bg-white border-gray-300 text-gray-900 h-9 text-sm"
              value={filtroValorMin}
              onChange={e => setFiltroValorMin(e.target.value)}
            />
            <span className="text-gray-400 text-xs">até</span>
            <Input
              type="number"
              min={0}
              placeholder="Valor máx"
              className="w-32 bg-white border-gray-300 text-gray-900 h-9 text-sm"
              value={filtroValorMax}
              onChange={e => setFiltroValorMax(e.target.value)}
            />
            {(filtroValorMin || filtroValorMax) && (
              <button onClick={() => { setFiltroValorMin(""); setFiltroValorMax(""); }} className="text-gray-400 hover:text-gray-600 ml-0.5" title="Limpar filtro de valor">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              type="date"
              className="w-36 bg-white border-gray-300 text-gray-900 h-9 text-sm"
              value={filtroDataInicio}
              onChange={e => setFiltroDataInicio(e.target.value)}
              title="Data inicial"
            />
            <span className="text-gray-400 text-xs">até</span>
            <Input
              type="date"
              className="w-36 bg-white border-gray-300 text-gray-900 h-9 text-sm"
              value={filtroDataFim}
              onChange={e => setFiltroDataFim(e.target.value)}
              title="Data final"
            />
            {(filtroDataInicio || filtroDataFim) && (
              <button onClick={() => { setFiltroDataInicio(""); setFiltroDataFim(""); }} className="text-gray-400 hover:text-gray-600 ml-0.5" title="Limpar filtro de data">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Rev. 2090 — filtro por Obra */}
          <div className="flex items-center gap-1.5 min-w-56">
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="h-9 text-sm bg-white border-gray-300 text-gray-900 w-56">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0 mr-1" />
                <SelectValue placeholder="Todas as obras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                <SelectItem value="sem_obra">— Sem obra vinculada —</SelectItem>
                {obras
                  .slice()
                  .sort((a: any, b: any) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" }))
                  .map((ob: any) => (
                    <SelectItem key={ob.id} value={String(ob.id)}>{ob.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {filtroObra !== "todas" && (
              <button onClick={() => setFiltroObra("todas")} className="text-gray-400 hover:text-gray-600" title="Limpar filtro de obra">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {(filtroFornecedor || filtroObra !== "todas" || filtroValorMin || filtroValorMax || filtroDataInicio || filtroDataFim) && (
            <span className="text-[11px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              {filt.length} resultado{filt.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} OC(s) selecionada(s)</span>
          <Button size="sm" variant="destructive" className="gap-1.5 ml-auto" onClick={() => setConfirmExcluirLote(true)} disabled={excluirLote.isPending}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionadas
          </Button>
          <Button size="sm" variant="outline" className="text-gray-600" onClick={() => setSelectedIds(new Set())}>Cancelar</Button>
        </div>
      )}

      {/* Tabela */}
      <TooltipProvider>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10 px-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas" />
              </TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
              {/* Rev. 2487 — Cabeçalhos ordenáveis (mesmo padrão da tela de SC). */}
              {([
                { k: "numeroOc",        label: "Número OC" },
                { k: "obra",            label: "Obra" },
                { k: "fornecedor",      label: "Fornecedor" },
                { k: "origem",          label: "Origem" },
                { k: "total",           label: "Total" },
                { k: "entregaPrevista", label: "Entrega Prevista" },
                { k: "status",          label: "Status" },
              ] as { k: OcSortKey; label: string }[]).map(col => {
                const active = sortKey === col.k;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={col.k} className="text-gray-500 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.k)}
                      title={`Ordenar por ${col.label}${active ? (sortDir === "asc" ? " (crescente)" : " (decrescente)") : ""}`}
                      className={`inline-flex items-center gap-1 hover:text-emerald-700 transition-colors ${active ? "text-emerald-700" : ""}`}
                    >
                      {col.label}
                      <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400">Nenhuma ordem encontrada</TableCell></TableRow>
            ) : filt.map(oc => {
              const st = STATUS_LABELS[oc.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === oc.fornecedorId);
              const semaforo = calcularSemaforo(oc.dataEntregaPrevista, oc.dataEntregaReal, oc.status, oc.proximaEntregaProgramada);
              const semCor = semaforoCor(semaforo.status);
              const semTip = semaforoTooltip(semaforo);
              return (
                <TableRow key={oc.id} className={`border-gray-100 cursor-pointer ${selectedIds.has(oc.id) ? "bg-blue-50/60" : oc.status === "entregue" ? "bg-emerald-50/40 hover:bg-emerald-50/70" : oc.status === "cancelada" ? "bg-gray-50/60 hover:bg-gray-100/60 opacity-60" : "hover:bg-gray-50"}`} onClick={() => setShowDetalhe(oc.id)}>
                  <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(oc.id)} onCheckedChange={() => toggleSelect(oc.id)} aria-label={`Selecionar ${oc.numeroOc}`} />
                  </TableCell>
                  <TableCell className="text-center px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex justify-center">
                          <CircleDot className={`h-5 w-5 ${semCor}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-gray-900 text-white text-xs max-w-48 whitespace-pre-line">
                        {semTip}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className={`font-mono font-semibold text-sm ${oc.status === "entregue" ? "text-emerald-700" : oc.status === "cancelada" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    <div className="flex items-center gap-1.5">
                      {formatNumeroOcDisplay(oc.numeroOc)}
                      {(oc as any).tipo && (oc as any).tipo !== "compra" && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded ${
                          (oc as any).tipo === "servico" ? "bg-purple-100 text-purple-700"
                          : (oc as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700"
                          : (oc as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700"
                          : "bg-blue-100 text-blue-700"
                        }`}>
                          {(oc as any).tipo === "servico" ? "MDO" : (oc as any).tipo === "pacote" ? "MAT+MDO" : (oc as any).tipo === "equipamento" ? "EQUIP" : (oc as any).tipo?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {(oc as any).modalidadeFd && (oc as any).modalidadeFd !== "normal" && (
                      <span className={`px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded ${
                        (oc as any).modalidadeFd === "fd_cliente" ? "bg-blue-100 text-blue-700"
                        : (oc as any).modalidadeFd === "fd_fc" ? "bg-amber-100 text-amber-700"
                        : "bg-amber-100 text-amber-700"
                      }`}>
                        {(oc as any).modalidadeFd === "fd_cliente" ? "PAG. CLIENTE" : "FAT. DIRETO"}
                      </span>
                    )}
                    {oc.status === "entregue" && <span className="block text-[10px] font-sans font-normal text-emerald-500">OC concluída</span>}
                    {((oc as any).tipo === "servico" || (oc as any).tipo === "pacote") && (oc as any).contratoId && (
                      <span className="block text-[10px] font-sans font-normal text-blue-500">Contrato PJ vinculado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(oc as any).obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra((oc as any).obraId) ?? `#${(oc as any).obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-600 text-sm">
                    <div className="flex items-center gap-1.5">
                      {forn?.nomeFantasia || forn?.razaoSocial || "—"}
                      {forn && (() => {
                        const hasAny = forn.contatoNome || forn.telefone || forn.contatoCelular || forn.contatoEmail || forn.email;
                        const hasPhoneCh = !!(forn.telefone || forn.contatoCelular);
                        const hasEmailCh = !!(forn.contatoEmail || forn.email);
                        const incomplete = !hasPhoneCh || !hasEmailCh;
                        if (!hasAny) return <span title="Cadastro incompleto"><AlertTriangle className="h-3 w-3 text-amber-400" /></span>;
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" onClick={e => e.stopPropagation()} className={`p-0.5 transition ${incomplete ? "text-amber-500 hover:text-amber-700" : "text-blue-400 hover:text-blue-600"}`} title={incomplete ? "Cadastro incompleto" : "Contato"}>
                                {incomplete ? <AlertTriangle className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3 bg-white border-gray-200 shadow-lg" side="bottom" align="start" onClick={e => e.stopPropagation()}>
                              <FornecedorContatoCard contato={forn} />
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-400 text-xs">{(oc as any).cotacaoNumero ? formatNumeroCotacaoDisplay((oc as any).cotacaoNumero) : (oc.cotacaoId ? "Cotação" : "Manual")}</TableCell>
                  <TableCell className="text-emerald-700 font-semibold text-sm">
                    {parseFloat(oc.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{oc.dataEntregaPrevista ? new Date(oc.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      {(oc as any).pendenteCoberturaOrcamentaria && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200" title="Itens sem verba orçamentária — pendente de realocação">
                          S/ VERBA
                        </span>
                      )}
                      {oc.status === "aguardando_aprovacao_extra" && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse" title="Compra acima do orçamento — necessita aprovação de administrador">
                          ADMIN
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>

      {/* ── Dialog OC IA (Rev. 4420) ────────────────────────────── */}
      {ocIAStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-700 to-blue-500 rounded-t-2xl">
              <Sparkles className="h-5 w-5 text-white" />
              <div>
                <h2 className="text-base font-semibold text-white">Criar OC por Documento (IA)</h2>
                <p className="text-xs text-blue-100">Envie a proposta/orçamento do fornecedor — a IA extrai os itens automaticamente</p>
              </div>
              <button onClick={() => { setOcIAStep("idle"); setOcIAResult(null); setOcIAJobId(null); }} className="ml-auto text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step: upload */}
              {ocIAStep === "upload" && (
                <div>
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${ocIADragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300 hover:bg-gray-50"}`}
                    onDragOver={(e) => { e.preventDefault(); setOcIADragOver(true); }}
                    onDragLeave={() => setOcIADragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOcIADragOver(false); const f = e.dataTransfer.files[0]; if (f) handleOCIAFile(f); }}
                    onClick={() => ocIAFileRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                    <p className="font-medium text-gray-700 mb-1">Arraste ou clique para selecionar</p>
                    <p className="text-xs text-gray-500">PDF, JPG ou PNG · máx. 10 MB</p>
                  </div>
                  <input ref={ocIAFileRef} type="file" accept="application/pdf,image/jpeg,image/jpg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOCIAFile(f); }} />
                  <p className="text-xs text-gray-400 mt-3 text-center">Funciona com propostas escaneadas, orçamentos em PDF e fotos de tabelas de preços.</p>
                </div>
              )}

              {/* Step: processing */}
              {ocIAStep === "processing" && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
                  <p className="font-medium text-gray-700">Analisando documento com IA…</p>
                  <div className="w-64">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progresso</span>
                      <span className="font-semibold text-blue-600">{Math.round(ocIAProgress)}%</span>
                    </div>
                    <div className="relative h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-700 ease-out"
                        style={{ width: `${ocIAProgress}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">Isso pode levar alguns segundos</p>
                </div>
              )}

              {/* Step: review */}
              {ocIAStep === "review" && ocIAResult && (
                <div className="space-y-4">
                  {/* Dados do fornecedor */}
                  {(ocIAResult.fornecedorNome || ocIAResult.fornecedorCnpj) && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Fornecedor identificado</p>
                      {ocIAResult.fornecedorNome && <p className="font-medium text-gray-800">{ocIAResult.fornecedorNome}</p>}
                      {ocIAResult.fornecedorCnpj && <p className="text-xs text-gray-500">CNPJ: {ocIAResult.fornecedorCnpj}</p>}
                    </div>
                  )}
                  {/* Condições */}
                  {(ocIAResult.condicaoPagamento || ocIAResult.prazoEntregaDias) && (
                    <div className="flex gap-3 flex-wrap">
                      {ocIAResult.condicaoPagamento && (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full px-3 py-1">
                          <DollarSign className="h-3 w-3" /> {ocIAResult.condicaoPagamento}
                        </span>
                      )}
                      {ocIAResult.prazoEntregaDias && (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full px-3 py-1">
                          <Calendar className="h-3 w-3" /> {ocIAResult.prazoEntregaDias} dias de prazo
                        </span>
                      )}
                    </div>
                  )}
                  {/* Itens extraídos */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">{(ocIAResult.itens ?? []).length} iten(s) extraído(s):</p>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">#</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Descrição</th>
                            <th className="text-center px-3 py-2 font-semibold text-gray-600">Qtd</th>
                            <th className="text-center px-3 py-2 font-semibold text-gray-600">Un</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600">R$ Unit.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ocIAResult.itens ?? []).map((it: any, i: number) => (
                            <tr key={i} className="border-b border-gray-100 last:border-0">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 text-gray-800 break-words max-w-xs">{it.descricao}</td>
                              <td className="px-3 py-2 text-center text-gray-700">{it.quantidade}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{it.unidade}</td>
                              <td className="px-3 py-2 text-right text-gray-700">
                                {it.precoUnitario != null
                                  ? it.precoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {ocIAResult.observacoes && (
                      <p className="text-xs text-gray-500 mt-2 italic">{ocIAResult.observacoes}</p>
                    )}
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ Verifique os dados antes de preencher. Você poderá editar todos os campos no formulário da OC.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              <Button variant="outline" onClick={() => { setOcIAStep("idle"); setOcIAResult(null); setOcIAJobId(null); }}>
                Cancelar
              </Button>
              {ocIAStep === "review" && (
                <Button onClick={preencherOCDeIA} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                  <CheckCircle className="h-4 w-4" /> Preencher OC com esses dados
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog Nova OC Manual */}
      <FullScreenDialog
        open={showNova}
        onClose={handleCloseGuard}
        title={rascunhoId ? (editandoOcStatus && editandoOcStatus !== "rascunho" ? "Editar Ordem de Compra" : "Editar Rascunho de OC") : "Nova Ordem de Compra (Manual)"}
        subtitle={rascunhoId ? (editandoOcStatus && editandoOcStatus !== "rascunho" ? "Altere os dados e salve como rascunho ou reconfirme" : "Complete as informações do rascunho") : "Preencha os dados da OC"}
        icon={<ShoppingBag className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-emerald-700 to-emerald-500"
        zIndex={40}
        headerActions={
          <Button variant="ghost" size="sm" onClick={handleSalvarRascunho} disabled={salvarRascunhoMut.isPending} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            {salvarRascunhoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar como Rascunho
          </Button>
        }
      >
          <div className="space-y-5 pt-2">
            {/* Obra obrigatória */}
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-emerald-600" /> Obra / Centro de Custo *
              </Label>
              <Select value={form.obraId} onValueChange={v => setForm(p => ({ ...p, obraId: v }))}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecione a obra vinculada..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {obras.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.codigo ? `[${o.codigo}] ` : ""}{o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Obrigatório — o custo desta OC será apropriado à obra selecionada.</p>
            </div>

            {/* Tipo de OC */}
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Tipo de Ordem</Label>
              <Select value={form.tipoOc} onValueChange={v => setForm(p => ({ ...p, tipoOc: v as "compra" | "locacao" | "servico" }))}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="locacao">Aluguel / Locação</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Fornecedor <span className="text-red-500">*</span></Label>
              <Popover open={fornecedorPopoverOpen} onOpenChange={setFornecedorPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <span className={form.fornecedorId && form.fornecedorId !== "none" ? "text-gray-900" : "text-gray-400"}>
                      {form.fornecedorId && form.fornecedorId !== "none"
                        ? (() => { const f = fornecedores.find(f => String(f.id) === form.fornecedorId); return f ? (f.nomeFantasia || f.razaoSocial) : "Selecione..."; })()
                        : "Selecione..."}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white border-gray-200 shadow-lg" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nome ou razão social..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => { setForm(p => ({ ...p, fornecedorId: "none" })); setFornecedorPopoverOpen(false); }}
                          className="cursor-pointer"
                        >
                          <Check className={`mr-2 h-4 w-4 ${form.fornecedorId === "none" || !form.fornecedorId ? "opacity-100" : "opacity-0"}`} />
                          Nenhum
                        </CommandItem>
                        {fornecedores.map(f => (
                          <CommandItem
                            key={f.id}
                            value={`${f.nomeFantasia ?? ""} ${f.razaoSocial ?? ""}`}
                            onSelect={() => {
                              // Rev. 3442 — pré-preenche formaPagamento do ciclo do fornecedor
                              // Rev. 4180 — pré-preenche condicaoPagamento do ciclo do fornecedor
                              const cicloFP = (f as any).cicloFormaPagamento as string | undefined;
                              const cicloN = (f as any).cicloNumParcelas as number | undefined;
                              const cicloD = (f as any).cicloPrazoParcela as number | undefined;
                              const cicloPag = (f as any).cicloPagamento as string | undefined;
                              // Deriva o label da condição a partir do ciclo configurado no fornecedor
                              let cicloCondicao: string | undefined;
                              if (cicloPag === "avista") cicloCondicao = "À Vista";
                              else if (cicloN && cicloD != null) {
                                const match = TIPOS_PAGAMENTO.find(
                                  t => t.parcelas === cicloN && t.diasDDL[0] === cicloD
                                );
                                cicloCondicao = match?.label;
                              }
                              setForm(p => ({
                                ...p,
                                fornecedorId: String(f.id),
                                ...(cicloFP ? { formaPagamento: cicloFP } : {}),
                                ...(cicloCondicao ? { condicaoPagamento: cicloCondicao } : {}),
                              }));
                              setFornecedorPopoverOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check className={`mr-2 h-4 w-4 shrink-0 ${form.fornecedorId === String(f.id) ? "opacity-100" : "opacity-0"}`} />
                            <div className="flex flex-col">
                              <span className="font-medium">{f.nomeFantasia || f.razaoSocial}</span>
                              {f.nomeFantasia && f.razaoSocial && <span className="text-xs text-gray-400">{f.razaoSocial}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {/* Tipo de Faturamento */}
            <div className="space-y-2">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Tipo de Faturamento
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "normal",     label: "Empresa FC",         desc: "Custo absorvido pela FC",       color: tipoFaturamento === "normal"     ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-300 text-gray-700 hover:border-emerald-400" },
                  { value: "fd_cliente", label: "Pagamento Cliente",  desc: "Cliente paga diretamente",      color: tipoFaturamento === "fd_cliente" ? "bg-blue-600 border-blue-600 text-white"    : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"    },
                  { value: "fd_fc",      label: "Faturamento Direto", desc: "Cobrança via terceiro (FD)",    color: tipoFaturamento === "fd_fc"      ? "bg-amber-600 border-amber-600 text-white"  : "bg-white border-gray-300 text-gray-700 hover:border-amber-400"   },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipoFaturamento(opt.value)}
                    className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all ${opt.color}`}
                  >
                    <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                    <p className={`text-[10px] leading-tight mt-0.5 ${tipoFaturamento === opt.value ? "opacity-80" : "text-gray-400"}`}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Itens — Rev. 2486: agrupados por ETAPA (EAP) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-700 font-semibold text-sm">Itens por Etapa *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addGrupo} className="border-violet-300 text-violet-700 hover:bg-violet-50 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Nova etapa
                </Button>
              </div>
              {(() => {
                const eapItems = (eapQ.data?.items ?? []).filter((e: any) => e.descricao?.trim());
                const obraSelecionada = !!(form.obraId && form.obraId !== "none");
                return (
                  <div className="space-y-3">
                    {grupos.map((g, gi) => (
                      <div key={gi} className="rounded-lg border-2 border-violet-200 bg-violet-50/40 overflow-hidden">
                        {/* Header da etapa */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-violet-100/60 border-b border-violet-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Etapa #{gi + 1}</span>
                          <div className="flex-1">
                            {obraSelecionada ? (
                              <Popover open={eapPopoverGi === gi} onOpenChange={open => setEapPopoverGi(open ? gi : null)}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${g.eapCodigo ? "border-violet-300 bg-white text-violet-700 hover:bg-violet-50" : "border-dashed border-violet-300 bg-white text-gray-500 hover:border-violet-400"}`}
                                  >
                                    <Search className="h-3 w-3 shrink-0" />
                                    {g.eapCodigo ? (
                                      <span className="truncate"><code className="font-mono font-semibold">{g.eapCodigo}</code> — {g.eapDescricao || eapItems.find((e: any) => e.eapCodigo === g.eapCodigo)?.descricao || ""}</span>
                                    ) : (
                                      eapQ.isLoading ? "Carregando itens do orçamento..." : eapItems.length === 0 ? "Obra sem orçamento vinculado" : "Selecionar etapa do orçamento (EAP)"
                                    )}
                                    {g.eapCodigo && (
                                      <span
                                        onClick={e => { e.stopPropagation(); setEapDoGrupo(gi, undefined, undefined); }}
                                        className="ml-auto text-violet-400 hover:text-red-500"
                                        title="Remover etapa"
                                      >✕</span>
                                    )}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white border-gray-200 shadow-lg" align="start">
                                  <Command>
                                    <CommandInput placeholder="Buscar por código ou descrição..." className="h-9" />
                                    <CommandList className="max-h-60">
                                      <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                                      <CommandGroup>
                                        {eapItems.map((e: any) => (
                                          <CommandItem
                                            key={e.id}
                                            value={`${e.eapCodigo ?? ""} ${e.descricao ?? ""}`}
                                            onSelect={() => {
                                              setEapDoGrupo(gi, e.eapCodigo ?? "", e.descricao ?? "");
                                              setEapPopoverGi(null);
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <Check className={`mr-2 h-3 w-3 shrink-0 ${g.eapCodigo === e.eapCodigo ? "opacity-100 text-violet-600" : "opacity-0"}`} />
                                            <div className="flex flex-col min-w-0">
                                              <div className="flex items-center gap-2">
                                                {e.eapCodigo && <code className="text-[10px] font-mono text-violet-600 bg-violet-50 px-1 rounded shrink-0">{e.eapCodigo}</code>}
                                                <span className="text-xs font-medium truncate">{e.descricao}</span>
                                              </div>
                                              {(e.unidade || e.quantidade) && (
                                                <span className="text-[10px] text-gray-400">{e.unidade}{e.quantidade ? ` · Qtd: ${parseFloat(e.quantidade).toLocaleString("pt-BR")}` : ""}</span>
                                              )}
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className="text-[11px] text-gray-500 italic">Selecione a obra acima pra escolher a etapa</span>
                            )}
                          </div>
                          {grupos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeGrupo(gi)}
                              className="p-1 text-violet-400 hover:text-red-500 shrink-0"
                              title="Remover etapa inteira"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {/* Itens da etapa */}
                        <div className="p-2 space-y-2">
                          {g.itens.map((it, ii) => (
                            <div key={ii} className="p-2.5 rounded bg-white border border-gray-200 space-y-2">
                              <div className="flex gap-2">
                                <ItemDescricaoInput
                                  companyId={companyId}
                                  value={it.descricao}
                                  placeholder="Descrição *"
                                  className="flex-1 h-9 px-3 bg-white border border-gray-300 text-gray-900 text-sm rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                                  onChange={v => updateItem(gi, ii, "descricao", v)}
                                  onBlur={v => updateItem(gi, ii, "descricao", normalizarTexto(v))}
                                  onSelectUnidade={u => updateItem(gi, ii, "unidade", u)}
                                />
                                {g.itens.length > 1 && (
                                  <button onClick={() => removeItem(gi, ii)} className="p-1 text-gray-400 hover:text-red-500" title="Remover item"><Trash2 className="h-4 w-4" /></button>
                                )}
                              </div>
                              <div className="flex gap-2 items-center">
                                <Select value={it.unidade} onValueChange={v => updateItem(gi, ii, "unidade", v)}>
                                  <SelectTrigger className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent className="bg-white border-gray-200">
                                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input className="w-24 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(gi, ii, "quantidade", e.target.value)} />
                                <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" step="0.01" placeholder="Preço unit. (R$)" value={it.precoUnitario} onChange={e => updateItem(gi, ii, "precoUnitario", e.target.value)} />
                                <span className="text-emerald-700 text-sm font-medium w-28 text-right">
                                  {((parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => addItemNoGrupo(gi)}
                            className="w-full justify-center text-violet-700 hover:bg-violet-100 hover:text-violet-800 gap-1 text-xs border border-dashed border-violet-300"
                          >
                            <Plus className="h-3 w-3" /> Adicionar item nesta etapa
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Nº Nota Fiscal / Documento</Label>
              <Input className="bg-white border-gray-300 text-gray-900" placeholder="Ex: NF-0001234, NFe 1234, RECIBO-001..."
                value={form.numeroNf} onChange={e => setForm(p => ({ ...p, numeroNf: e.target.value }))} />
              <p className="text-xs text-gray-400">Opcional — número da nota fiscal ou documento vinculado a esta ordem.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Forma de Pagamento</Label>
                <Select value={form.formaPagamento} onValueChange={v => setForm(p => ({ ...p, formaPagamento: v }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {[
                      { value: "boleto",       label: "Boleto" },
                      { value: "pix",          label: "PIX" },
                      { value: "transferencia", label: "Transferência Bancária" },
                      { value: "deposito",     label: "Depósito em Conta" },
                      { value: "cheque",       label: "Cheque" },
                      { value: "cartao_credito", label: "Cartão de Crédito" },
                      { value: "cartao_debito",  label: "Cartão de Débito" },
                      { value: "dinheiro",     label: "Dinheiro" },
                    ].map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.formaPagamento === "cartao_credito" && (
                <div className="col-span-2">
                  <CartaoDisponivelCard
                    companyId={companyId}
                    valorCompra={totalOC || null}
                    cartaoIdSelecionado={form.cartaoId ? parseInt(form.cartaoId) : null}
                    onSelecionarCartao={(cartaoId) => setForm(p => ({ ...p, cartaoId: cartaoId ? String(cartaoId) : "" }))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Conta Bancária</Label>
                <Select value={form.contaBancariaId} onValueChange={v => setForm(p => ({ ...p, contaBancariaId: v }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione a conta..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(contasBancariasQ.data ?? []).filter((c: any) => c.ativo).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.apelido ? `${c.apelido} — ` : ""}{c.banco} Ag.{c.agencia} C.{c.conta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">
                Condição de Pagamento *
              </Label>
              <Select
                value={form.condicaoPagamento}
                onValueChange={v => setForm(p => ({ ...p, condicaoPagamento: v }))}
              >
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecione a condição..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {TIPOS_PAGAMENTO.map(opt => (
                    <SelectItem key={opt.value} value={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Obrigatório — pré-preenchido pelo ciclo do fornecedor quando disponível.</p>
            </div>

            {/* Parcelamento */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-gray-700 text-sm font-semibold">Parcelamento</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-600 whitespace-nowrap">Nº de Parcelas:</Label>
                  <Input
                    type="number" min="1" max="60"
                    className="w-20 bg-white border-gray-300 text-gray-900 h-8 text-sm"
                    value={numParc}
                    onChange={e => {
                      const n = Math.min(60, Math.max(1, parseInt(e.target.value) || 1));
                      setNumParc(n);
                      setParcelas(gerarParcelas(n, totalOC, form.dataVencimento));
                    }}
                  />
                  {numParc > 1 && (
                    <Button type="button" size="sm" variant="outline"
                      className="border-gray-300 text-gray-600 hover:bg-gray-100 text-xs h-8"
                      onClick={() => setParcelas(gerarParcelas(numParc, totalOC, form.dataVencimento))}>
                      Distribuir igualmente
                    </Button>
                  )}
                </div>
              </div>
              {numParc > 1 && parcelas.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[32px_1fr_120px] gap-2 px-1">
                    <span className="text-[10px] text-gray-400 font-medium text-center">#</span>
                    <span className="text-[10px] text-gray-400 font-medium">Vencimento</span>
                    <span className="text-[10px] text-gray-400 font-medium text-right">Valor (R$)</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                    {parcelas.map((p, i) => (
                      <div key={i} className="grid grid-cols-[32px_1fr_120px] gap-2 items-center">
                        <span className="text-xs text-gray-500 text-center font-mono">{p.numero}</span>
                        <Input
                          type="date"
                          className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                          value={p.vencimento}
                          onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))}
                        />
                        <Input
                          type="number" step="0.01" min="0"
                          className="bg-white border-gray-300 text-gray-900 h-8 text-sm text-right"
                          value={p.valor}
                          onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                        />
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const totalParc = parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
                    const diff = Math.abs(totalParc - totalOC);
                    const ok = diff < 0.02;
                    return (
                      <div className={`flex justify-between items-center text-xs pt-2 border-t ${ok ? "border-emerald-200" : "border-red-200"}`}>
                        <span className="text-gray-500">Total das parcelas</span>
                        <span className={`font-semibold font-mono ${ok ? "text-emerald-700" : "text-red-600"}`}>
                          {totalParc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          {!ok && (
                            <span className="ml-2 font-normal text-[10px]">
                              (difere {diff.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} do total da OC)
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
              {numParc === 1 && (
                <p className="text-xs text-gray-400">Pagamento à vista (1 parcela). Aumente o número de parcelas para configurar o parcelamento.</p>
              )}
            </div>

            <div className={`grid gap-4 ${numParc > 1 ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Prazo Entrega (dias) *</Label>
                <Input type="number" min="1" className="bg-white border-gray-300 text-gray-900" value={(form as any).prazoEntregaDias ?? ""} onChange={e => {
                  const dias = e.target.value;
                  setForm(p => {
                    const upd: any = { ...p, prazoEntregaDias: dias };
                    if (dias && parseInt(dias) > 0) {
                      const dt = new Date();
                      dt.setDate(dt.getDate() + parseInt(dias));
                      upd.dataEntregaPrevista = dt.toISOString().split("T")[0];
                    }
                    return upd;
                  });
                }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Previsão de Entrega</Label>
                <Input type="date" className="bg-white border-gray-300 text-gray-900" value={form.dataEntregaPrevista} onChange={e => {
                  const dataStr = e.target.value;
                  setForm(p => {
                    const upd: any = { ...p, dataEntregaPrevista: dataStr };
                    if (dataStr) {
                      const hoje = new Date();
                      hoje.setHours(0, 0, 0, 0);
                      const dt = new Date(dataStr + "T00:00:00");
                      const diffDias = Math.max(0, Math.round((dt.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
                      upd.prazoEntregaDias = String(diffDias);
                    }
                    return upd;
                  });
                }} />
              </div>
              {numParc === 1 && (
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium text-orange-700">Vencimento do Pagamento</Label>
                  <Input type="date" className="bg-white border-orange-300 text-gray-900 focus:border-orange-500" value={form.dataVencimento} onChange={e => setForm(p => ({ ...p, dataVencimento: e.target.value }))} />
                  <p className="text-xs text-orange-500">Data que o pagamento deve ser efetuado ao fornecedor.</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Observações</Label>
              <Textarea className="bg-white border-gray-300 text-gray-900 resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Anexos */}
            <div className="space-y-2">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-gray-500" /> Anexos
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
              />
              <div
                className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${dragOver ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/40"}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
              >
                {uploadingAnexo
                  ? <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  : <Upload className="h-6 w-6 text-gray-400" />
                }
                <p className="text-sm text-gray-500">
                  {uploadingAnexo ? "Enviando arquivo..." : "Arraste arquivos aqui ou clique para selecionar"}
                </p>
                <p className="text-xs text-gray-400">Imagens (JPG, PNG…), PDF, DOC, XLS e outros — até 20 MB cada</p>
              </div>
              {anexosForm.length > 0 && (
                <div className="space-y-1">
                  {anexosForm.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="flex-1 truncate text-gray-700">{a.nome}</span>
                      <button type="button" onClick={() => setAnexosForm(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totalizadores */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-3">Totalizadores</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-gray-500 text-xs">Subtotal (Itens)</Label>
                  <div className="text-gray-900 font-mono text-sm">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </div>
                {[
                  { label: "+ Frete (R$)",            key: "frete" as const },
                  { label: "+ Outras Despesas (R$)",  key: "outrasDespesas" as const },
                  { label: "+ Impostos (R$)",          key: "impostos" as const },
                  { label: "− Desconto (R$)",         key: "desconto" as const },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-gray-500 text-xs">{f.label}</Label>
                    <Input type="number" min="0" step="0.01" className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                      value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-2">
                <span className="text-gray-700 font-semibold text-sm">Total da OC</span>
                <span className="text-emerald-700 font-bold text-lg">{totalOC.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleCloseGuard} className="border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criarManual.isPending || confirmarRascunhoMut.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5">
                {(criarManual.isPending || confirmarRascunhoMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {rascunhoId ? (editandoOcStatus && editandoOcStatus !== "rascunho" ? "Salvar OC" : "Confirmar OC") : "Criar OC"}
              </Button>
            </div>
          </div>
      </FullScreenDialog>

      {/* Guard dialog — fechar formulário com dados não salvos */}
      <Dialog open={showGuardDialog} onOpenChange={v => { if (!v && !salvarRascunhoMut.isPending) setShowGuardDialog(false); }}>
        <DialogContent
          className="border-gray-200 max-w-md"
          style={{ background: "#fff", color: "#111827", zIndex: 200 }}
          onEscapeKeyDown={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Save className="h-5 w-5 text-yellow-500" /> Salvar rascunho?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Você preencheu alguns dados nesta OC. Deseja salvá-la como rascunho para continuar editando mais tarde, ou descartar tudo?
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setShowGuardDialog(false); setShowNova(false); resetForm(); }} className="border-red-200 text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1.5" /> Descartar
            </Button>
            <Button onClick={handleSalvarRascunhoEFechar} disabled={salvarRascunhoMut.isPending} className="bg-yellow-500 hover:bg-yellow-400 text-white gap-1.5">
              {salvarRascunhoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe OC */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent showCloseButton={false} className="border-gray-200 w-screen h-screen max-w-none max-h-none rounded-none overflow-y-auto p-0" style={{ background: '#ffffff', color: '#111827' }}>
          {/* Rev. 2827 — cabeçalho STICKY com botão de fechar sempre visível.
              Antes o X (absolute) rolava junto com o conteúdo e sumia no tablet. */}
          <DialogHeader className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 space-y-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-gray-900 text-base sm:text-lg">
                {formatNumeroOcDisplay(detalhe?.numeroOc)} — {((detalhe as any)?.tipo === "servico" || (detalhe as any)?.tipo === "pacote") ? "Ordem de Serviço" : "Ordem de Compra"}
                {(detalhe as any)?.tipo && (detalhe as any)?.tipo !== "compra" && (
                  <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded ${
                    (detalhe as any).tipo === "servico" ? "bg-purple-100 text-purple-700"
                    : (detalhe as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700"
                    : (detalhe as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700"
                    : "bg-blue-100 text-blue-700"
                  }`}>
                    {(detalhe as any).tipo === "servico" ? "MDO" : (detalhe as any).tipo === "pacote" ? "MAT+MDO" : (detalhe as any).tipo === "equipamento" ? "EQUIP" : (detalhe as any).tipo?.toUpperCase()}
                  </span>
                )}
              </DialogTitle>
              <DialogClose
                aria-label="Fechar"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Fechar</span>
              </DialogClose>
            </div>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 px-4 sm:px-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (() => {
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const semaforoDetalhe = calcularSemaforo(detalhe.dataEntregaPrevista, detalhe.dataEntregaReal, detalhe.status, detalhe.proximaEntregaProgramada);
            return (
              <div className="space-y-5 pt-4 px-4 sm:px-6 pb-6">
                {detalhe.status === "rascunho" && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
                    <div className="flex items-center gap-2 flex-1">
                      <Save className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-yellow-800">OC em Rascunho</p>
                        <p className="text-xs text-yellow-700">Esta OC está salva como rascunho. Edite e confirme quando estiver pronta.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirEditarRascunho(detalhe)} className="border-yellow-400 text-yellow-700 hover:bg-yellow-100 gap-1.5">
                        <Edit3 className="h-3.5 w-3.5" /> Editar Rascunho
                      </Button>
                      <Button size="sm" onClick={() => confirmarRascunhoMut.mutate({ id: detalhe.id, companyId })} disabled={confirmarRascunhoMut.isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5">
                        {confirmarRascunhoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                        Confirmar OC
                      </Button>
                    </div>
                  </div>
                )}
                {!["rascunho", "cancelada", "entregue", "entregue_parcial"].includes(detalhe.status) && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-center gap-2 flex-1">
                      <Edit3 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800">Editar Ordem de Compra</p>
                        <p className="text-xs text-blue-600">Abra o formulário para editar dados, itens e tipo de faturamento desta OC.</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => abrirEditarRascunho(detalhe)} className="border-blue-400 text-blue-700 hover:bg-blue-100 gap-1.5 shrink-0">
                      <Edit3 className="h-3.5 w-3.5" /> Editar OC
                    </Button>
                  </div>
                )}
                {semaforoDetalhe.status === "atrasado" && (() => {
                  const isTerceiro = ["servico", "pacote"].includes((detalhe as any)?.tipo);
                  const termoEntrega = isTerceiro ? "Mobilização" : "Entrega";
                  return (
                  <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">{termoEntrega} atrasada</p>
                      <p className="text-xs text-red-600">
                        {semaforoDetalhe.dias} dia{semaforoDetalhe.dias !== 1 ? "s" : ""} de atraso
                        {semaforoDetalhe.dataReferencia && ` — prevista para ${new Date(semaforoDetalhe.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>
                  );
                })()}
                {semaforoDetalhe.status === "proximo" && (() => {
                  const isTerceiro = ["servico", "pacote"].includes((detalhe as any)?.tipo);
                  const termoEntrega = isTerceiro ? "Mobilização" : "Entrega";
                  return (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{termoEntrega} próxima</p>
                      <p className="text-xs text-amber-600">
                        {semaforoDetalhe.dias === 0 ? `${termoEntrega} prevista para hoje` : `Faltam ${semaforoDetalhe.dias} dia${semaforoDetalhe.dias !== 1 ? "s" : ""} para a ${termoEntrega.toLowerCase()}`}
                        {semaforoDetalhe.dataReferencia && ` — ${new Date(semaforoDetalhe.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>
                  );
                })()}
                {(detalhe as any).pendenteCoberturaOrcamentaria && (() => {
                  const ocItens = (detalhe.itens as any[]) ?? [];
                  const avulsos = ocItens.filter((it: any) => it.semVerba && it.motivoSemVerba === "avulso");
                  const estouros = ocItens.filter((it: any) => it.semVerba && it.motivoSemVerba !== "avulso");
                  return (
                    <div className="space-y-2">
                      {avulsos.length > 0 && (
                        <div className="flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 p-3 print:border-orange-500">
                          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-orange-800">⚠ FORA DO ORÇAMENTO — {avulsos.length} item(ns) avulso(s)</p>
                            <p className="text-xs text-orange-600">Itens sem vínculo orçamentário. Necessita verba realocada ou autorização para liberar.</p>
                          </div>
                        </div>
                      )}
                      {estouros.length > 0 && (
                        <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 print:border-red-500">
                          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-red-800">⚠ PREJUÍZO — {estouros.length} item(ns) acima do orçado</p>
                            <p className="text-xs text-red-600">Os itens sinalizados excedem a verba disponível e geram prejuízo para a obra.</p>
                          </div>
                        </div>
                      )}
                      {avulsos.length === 0 && estouros.length === 0 && (
                        <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 print:border-red-500">
                          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-red-800">⚠ PREJUÍZO — Itens sem verba disponível</p>
                            <p className="text-xs text-red-600">Esta OC contém itens sem cobertura orçamentária. É necessário realizar uma realocação de verba.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {detalhe.status === "aguardando_aprovacao_extra" && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-800">Compra Acima do Orçamento — Aprovação Admin Necessária</p>
                        <p className="text-xs text-red-600">{(detalhe as any).aprovacaoExtraMotivo || "Esta OC contém insumos que excedem a quantidade orçada. É necessário aprovação de um administrador para liberar."}</p>
                      </div>
                    </div>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5" onClick={() => setShowAprovacaoExtra(detalhe)}>
                      <CheckCircle className="h-3.5 w-3.5" /> Aprovar com Senha Admin
                    </Button>
                  </div>
                )}
                {(detalhe as any).aprovacaoExtraAdminNome && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>Aprovação extra concedida por <strong>{(detalhe as any).aprovacaoExtraAdminNome}</strong> em {(detalhe as any).aprovacaoExtraEm ? new Date((detalhe as any).aprovacaoExtraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div><span className="text-gray-400 text-xs">Obra</span><p className="text-gray-900 font-medium flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" />{nomeObra((detalhe as any).obraId) ?? "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.cls}`}>{st.label}</span></p></div>
                  <div><span className="text-gray-400 text-xs">Fornecedor</span><p className="text-gray-900 font-medium">{(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor?.nomeFantasia || (detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor?.razaoSocial || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">{["servico", "pacote"].includes((detalhe as any)?.tipo) ? "Mobilização prevista" : "Entrega prevista"}</span><p className="text-gray-900 font-medium">{detalhe.dataEntregaPrevista ? new Date(detalhe.dataEntregaPrevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">{["servico", "pacote"].includes((detalhe as any)?.tipo) ? "Mobilização real" : "Entrega real"}</span><p className="text-gray-900 font-medium">{detalhe.dataEntregaReal ? new Date(detalhe.dataEntregaReal + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Origem</span><p className="text-gray-900 font-medium">{(detalhe as any).cotInfo?.numeroCotacao ? formatNumeroCotacaoDisplay((detalhe as any).cotInfo.numeroCotacao) : (detalhe.cotacaoId ? "Cotação" : "Manual")}</p></div>
                  <div><span className="text-gray-400 text-xs">Criado em</span><p className="text-gray-900 font-medium">{new Date(detalhe.criadoEm).toLocaleDateString("pt-BR")}</p></div>
                  <div className="col-span-2">
                    <span className="text-gray-400 text-xs">Tipo de Faturamento</span>
                    <p className="mt-0.5">
                      {(detalhe as any).modalidadeFd === "fd_cliente" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200"><DollarSign className="h-3 w-3" /> Pagamento Cliente</span>
                      ) : (detalhe as any).modalidadeFd === "fd_fc" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200"><DollarSign className="h-3 w-3" /> Faturamento Direto</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200"><DollarSign className="h-3 w-3" /> Empresa FC</span>
                      )}
                    </p>
                  </div>
                  {((detalhe as any).freteTipo || (detalhe as any).transportadora || (detalhe as any).codigoRastreamento) && (
                    <>
                      <div>
                        <span className="text-gray-400 text-xs">Tipo de Frete</span>
                        <p className="text-gray-900 font-medium">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${(detalhe as any).freteTipo === "fob" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                            {((detalhe as any).freteTipo ?? "cif").toUpperCase()}
                          </span>
                          {parseFloat((detalhe as any).frete ?? "0") > 0 && (
                            <span className="ml-2 text-sm text-gray-600">
                              {parseFloat((detalhe as any).frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </p>
                      </div>
                      {(detalhe as any).transportadora && (
                        <div>
                          <span className="text-gray-400 text-xs">Transportadora</span>
                          <p className="text-gray-900 font-medium flex items-center gap-1"><Truck className="h-3 w-3 text-gray-400" />{(detalhe as any).transportadora}</p>
                        </div>
                      )}
                      {(detalhe as any).codigoRastreamento && (
                        <div>
                          <span className="text-gray-400 text-xs">Rastreamento</span>
                          <p className="text-gray-900 font-medium font-mono text-sm">{(detalhe as any).codigoRastreamento}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor && (
                  <FornecedorContatoCard contato={(detalhe as { fornecedor?: FornecedorContatoData | null }).fornecedor} />
                )}

                {(detalhe as any).observacoes && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <span className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Observações</span>
                    <p className="text-gray-900 text-sm mt-1 whitespace-pre-wrap break-words">{(detalhe as any).observacoes}</p>
                  </div>
                )}

                {/* Rastreabilidade / Auditoria */}
                {(() => {
                  const d: any = detalhe;
                  const fmtDT = (v: any) => v ? new Date(v).toLocaleString("pt-BR") : "—";
                  const sc = d.scInfo;
                  const cot = d.cotInfo;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Rastreabilidade</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 text-sm">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">SC criada por</p>
                          <p className="text-gray-900">{sc?.criadoPorNome || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">SC aprovada por</p>
                          <p className="text-gray-900">{sc?.aprovadorNome || "—"}</p>
                          <p className="text-[10px] text-gray-500">{sc?.aprovadoEm ? fmtDT(sc.aprovadoEm) : ""}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Cotação registrada por</p>
                          <p className="text-gray-900">{cot?.criadoPorNome || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Cotação aprovada por</p>
                          <p className="text-gray-900">{cot?.aprovadoPorNome || "—"}</p>
                          <p className="text-[10px] text-gray-500">{cot?.aprovadoEm ? fmtDT(cot.aprovadoEm) : ""}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">OC emitida por</p>
                          <p className="text-gray-900">{d.criadoPorNome || "—"}</p>
                          <p className="text-[10px] text-gray-500">{fmtDT(d.criadoEm)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">OC aprovada por</p>
                          <p className="text-gray-900">{d.aprovadorNome || "—"}</p>
                          <p className="text-[10px] text-gray-500">{d.aprovadoEm ? fmtDT(d.aprovadoEm) : ""}</p>
                        </div>
                        {d.aprovacaoExtraAdminNome && (
                          <div className="md:col-span-3 p-2 rounded bg-amber-50 border border-amber-200">
                            <p className="text-[10px] text-amber-700 uppercase">Aprovação extra (admin)</p>
                            <p className="text-amber-900 font-medium">{d.aprovacaoExtraAdminNome} <span className="text-[10px] text-amber-700">{d.aprovacaoExtraEm ? `· ${fmtDT(d.aprovacaoExtraEm)}` : ""}</span></p>
                            {d.aprovacaoExtraJustificativa && <p className="text-xs text-amber-800 italic">{d.aprovacaoExtraJustificativa}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Composição */}
                {(() => {
                  const subtotal = parseFloat((detalhe as any).subtotal ?? detalhe.total ?? "0");
                  const frete = parseFloat((detalhe as any).frete ?? "0");
                  const outrasDespesas = parseFloat((detalhe as any).outrasDespesas ?? "0");
                  const impostos = parseFloat((detalhe as any).impostos ?? "0");
                  const desconto = parseFloat((detalhe as any).desconto ?? "0");
                  const total = parseFloat(detalhe.total ?? "0");
                  const hasExtras = frete > 0 || outrasDespesas > 0 || impostos > 0 || desconto > 0;
                  // Rev. 4016 — Item 14: antes esse bloco só renderizava
                  // quando havia frete/impostos/desconto; numa OC sem
                  // extras (a maioria) o total consolidado sumia do
                  // resumo por completo — só aparecia por item na tabela.
                  // Agora sempre mostra ao menos o Total; a itemização
                  // (Subtotal/Frete/Impostos/Desconto) só some quando não
                  // há extras, evitando redundância "Subtotal = Total".
                  if (!hasExtras) {
                    return (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-900 font-semibold">Total da OC</span>
                          <span className="text-emerald-700 font-bold text-base">{fmt(total)}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1.5">
                      <div className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2">Composição do Total</div>
                      {[
                        { label: "Subtotal itens", value: subtotal, neg: false },
                        { label: "+ Frete", value: frete, neg: false },
                        { label: "+ Outras despesas", value: outrasDespesas, neg: false },
                        { label: "+ Impostos", value: impostos, neg: false },
                        { label: "− Desconto", value: desconto, neg: true },
                      ].filter(r => r.value !== 0).map(r => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-gray-500">{r.label}</span>
                          <span className={r.neg ? "text-red-600" : "text-gray-700"}>{r.neg ? `-${fmt(r.value)}` : fmt(r.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                        <span className="text-gray-900 font-semibold">Total</span>
                        <span className="text-emerald-700 font-bold text-base">{fmt(total)}</span>
                      </div>
                    </div>
                  );
                })()}

                <OcItensConsolidados itens={detalhe.itens as any[]} />

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <PurchaseTimeline companyId={companyId} ordemId={detalhe.id} />
                </div>

                {(parcelasQ.data ?? []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Parcelas</p>
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
                            <TableHead className="text-gray-500 text-xs w-16">#</TableHead>
                            <TableHead className="text-gray-500 text-xs">Valor</TableHead>
                            <TableHead className="text-gray-500 text-xs">Vencimento</TableHead>
                            <TableHead className="text-gray-500 text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(parcelasQ.data ?? []).map((p: any) => (
                            <TableRow key={p.id} className="border-gray-100">
                              <TableCell className="text-gray-500 text-sm">{p.parcelaNumero ?? 1}/{p.parcelaTotal ?? 1}</TableCell>
                              <TableCell className="text-emerald-700 text-sm font-medium">{parseFloat(p.valorTotal || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                              <TableCell className="text-gray-700 text-sm">{p.dataVencimento ? new Date(p.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                              <TableCell className="text-sm"><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${p.status === "pago" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : p.status === "liberado" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{p.status}</span></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Anexos OC */}
                {(() => {
                  const anexosList: AnexoOC[] = Array.isArray((detalhe as any).anexos) ? (detalhe as any).anexos : [];
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5" /> Anexos {anexosList.length > 0 && <span className="text-gray-400">({anexosList.length})</span>}
                        </h3>
                      </div>
                      <div className="p-3 space-y-2">
                        <input
                          ref={detalheFileInputRef}
                          type="file"
                          multiple
                          accept={ACCEPT_ATTR}
                          className="hidden"
                          onChange={e => { if (e.target.files) processFiles(e.target.files, detalhe.id); e.target.value = ""; }}
                        />
                        {anexosList.length > 0 && (
                          <div className="space-y-1">
                            {anexosList.map((a, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">{a.nome}</a>
                                <button
                                  type="button"
                                  onClick={() => removeAnexoOrdem.mutate({ ordemId: detalhe.id, companyId, url: a.url })}
                                  disabled={removeAnexoOrdem.isPending}
                                  className="text-gray-400 hover:text-red-500"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${detalheAnexoDrag ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/40"}`}
                          onClick={() => detalheFileInputRef.current?.click()}
                          onDragOver={e => { e.preventDefault(); setDetalheAnexoDrag(true); }}
                          onDragLeave={() => setDetalheAnexoDrag(false)}
                          onDrop={e => { e.preventDefault(); setDetalheAnexoDrag(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files, detalhe.id); }}
                        >
                          {uploadingAnexo
                            ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                            : <Upload className="h-5 w-5 text-gray-400" />
                          }
                          <p className="text-xs text-gray-500">{uploadingAnexo ? "Enviando..." : "Arraste ou clique para adicionar anexos"}</p>
                          <p className="text-[10px] text-gray-400">Imagens (JPG, PNG…), PDF, DOC, XLS e outros — até 20 MB</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* PDF */}
                <div className="flex gap-3 border-t border-gray-200 pt-4">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const resp = await fetch(`/api/download/oc/${detalhe.id}?regen=1`);
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({ error: "Erro ao gerar PDF" }));
                          toast.error(err.error || "Erro ao gerar PDF");
                          return;
                        }
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${detalhe.numeroOc || "OC"}.pdf`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success("PDF exportado com sucesso!");
                      } catch {
                        toast.error("Erro ao exportar PDF");
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                  >
                    <FileDown className="h-3.5 w-3.5" /> Exportar PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`/api/download/oc/${detalhe.id}?mode=view&regen=1`, "_blank");
                    }}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                </div>

                {/* Alterar Status */}
                {!["entregue", "cancelada"].includes(detalhe.status) && (
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold">Atualizar Status</Label>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { s: "aprovada",         label: "Aprovar",           icon: CheckCircle,  cls: "bg-blue-600 hover:bg-blue-500 text-white" },
                        { s: "entregue_parcial", label: "Entrega Parcial",   icon: Truck,        cls: "bg-orange-500 hover:bg-orange-400 text-white" },
                        { s: "entregue",         label: "Marcar Entregue",   icon: PackageCheck, cls: "bg-emerald-600 hover:bg-emerald-500 text-white" },
                      ].filter(a => a.s !== detalhe.status).filter(a => !(detalhe.status === "aguardando_aprovacao_extra" && a.s === "aprovada")).map(a => (
                        <Button key={a.s} size="sm" onClick={() => {
                          if (["aprovada", "entregue", "entregue_parcial"].includes(a.s)) {
                            setDataLancamentoInput(new Date().toISOString().split("T")[0]);
                            setShowLancamentoDialog({ id: detalhe.id, status: a.s });
                          } else {
                            atualizarStatus.mutate({ id: detalhe.id, status: a.s });
                          }
                        }}
                          disabled={atualizarStatus.isPending}
                          className={`text-xs gap-1 ${a.cls}`}>
                          <a.icon className="h-3 w-3" /> {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cancelamento (Admin Master) — soft-cancel em cascata, preserva histórico */}
                {user?.role === "admin_master" && detalhe.status !== "cancelada" && (
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold flex items-center gap-1">
                      <Ban className="h-3.5 w-3.5 text-red-500" /> Cancelamento (Admin Master)
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => { setCancelMasterMotivo(""); setCancelMasterSenha(""); setShowCancelarMaster(true); }}
                    >
                      <Ban className="h-3.5 w-3.5" /> Cancelar OC/OS
                    </Button>
                    <p className="text-[10px] text-gray-400">Marca a OC/OS como cancelada, cascateia para o contrato em andamento e cancela o financeiro NÃO pago (pagos ficam intactos). Exige senha do master + motivo.</p>
                  </div>
                )}

                {/* Estornar Recebimento */}
                {["entregue", "entregue_parcial"].includes(detalhe.status) && (
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold">Recebimento</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => { setEstornoMotivo(""); setShowEstornoDialog(true); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Estornar Recebimento
                    </Button>
                    <p className="text-[10px] text-gray-400">Reverte o recebimento, desfaz as entradas no estoque e volta a OC para Aprovada.</p>
                  </div>
                )}

                {/* FD Section */}
                {(detalhe as any).modalidadeFd && (detalhe as any).modalidadeFd !== "normal" ? (
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5 text-gray-400" /> Faturamento Direto
                    </Label>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Modalidade</span><span className="font-medium">{(detalhe as any).modalidadeFd === "fd_cliente" ? "FD Cliente" : "FD Terceiro"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Valor FD</span><span className="font-medium">{parseFloat((detalhe as any).fdValor ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Status FD</span><span className={`font-medium ${(detalhe as any).fdStatus === "aprovado" ? "text-emerald-600" : "text-amber-600"}`}>{(detalhe as any).fdStatus === "aprovado" ? "Aprovado" : "Pendente aprovação"}</span></div>
                      {(detalhe as any).fdAprovadoPor && <div className="flex justify-between"><span className="text-gray-500">Aprovado por</span><span className="font-medium">{(detalhe as any).fdAprovadoPor}</span></div>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(detalhe as any).fdStatus === "pendente_aprovacao" && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1"
                          onClick={() => aprovarFd.mutate({ ocId: detalhe.id, companyId, aprovadoPor: "Cliente" })}
                          disabled={aprovarFd.isPending}>
                          <CheckCircle className="h-3 w-3" /> Registrar Aprovação FD
                        </Button>
                      )}
                      {(detalhe as any).modalidadeFd === "fd_cliente" && (
                        <Button size="sm" variant="outline" className="text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          onClick={() => window.open(`/api/download/fd/${detalhe.id}?mode=view`, "_blank")}>
                          <FileDown className="h-3 w-3" /> PDF Aprovação FD
                        </Button>
                      )}
                    </div>
                  </div>
                ) : !["cancelada", "entregue"].includes(detalhe.status) && (detalhe as any).tipo !== "servico" && (detalhe as any).tipo !== "pacote" && (
                  <div className="border-t border-gray-200 pt-4">
                    <Button size="sm" variant="outline" className="text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => { setShowFdDialog(detalhe); setFdForm({ modalidade: "fd_cliente", valor: "", bdiItemId: 0, contractId: 0 }); }}>
                      <Receipt className="h-3 w-3" /> Marcar como Faturamento Direto
                    </Button>
                  </div>
                )}

                {!["cancelada"].includes(detalhe.status) && (
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <Label className="text-gray-700 text-sm font-semibold flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-gray-400" /> Dados de Entrega / Rastreamento
                    </Label>
                    <div className="flex gap-3 items-end flex-wrap">
                      <div className="space-y-1 flex-1 min-w-[180px]">
                        <Label className="text-gray-500 text-xs">Transportadora</Label>
                        <Input className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                          placeholder="Nome da transportadora"
                          value={editTransp || (detalhe as any).transportadora || ""}
                          onChange={e => setEditTransp(e.target.value)} />
                      </div>
                      <div className="space-y-1 flex-1 min-w-[180px]">
                        <Label className="text-gray-500 text-xs">Código de Rastreamento</Label>
                        <Input className="bg-white border-gray-300 text-gray-900 h-8 text-sm font-mono"
                          placeholder="Código de rastreio"
                          value={editRastreio || (detalhe as any).codigoRastreamento || ""}
                          onChange={e => setEditRastreio(e.target.value)} />
                      </div>
                      <Button size="sm"
                        disabled={atualizarEntregaMut.isPending || (!editTransp && !editRastreio)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1 h-8"
                        onClick={() => {
                          atualizarEntregaMut.mutate({
                            id: detalhe.id, companyId,
                            transportadora: editTransp || (detalhe as any).transportadora || undefined,
                            codigoRastreamento: editRastreio || (detalhe as any).codigoRastreamento || undefined,
                          });
                          setEditTransp(""); setEditRastreio("");
                        }}>
                        {atualizarEntregaMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex pt-2 border-t border-gray-200 gap-2">
                  <Button size="sm" variant="outline"
                    disabled={duplicarOrdem.isPending}
                    onClick={() => duplicarOrdem.mutate({ id: detalhe.id, companyId, userId: user?.id, userName: user?.name })}
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs gap-1">
                    {duplicarOrdem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} Duplicar OC
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-gray-200 text-gray-500 hover:bg-gray-50 text-xs ml-auto gap-1">
                    <Trash2 className="h-3 w-3" /> Excluir OC
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
      {/* Dialog — Data de Lançamento (Rev. 4075) */}
      <Dialog open={!!showLancamentoDialog} onOpenChange={v => { if (!v) setShowLancamentoDialog(null); }}>
        <DialogContent className="max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-blue-700 flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Data de Lançamento no Financeiro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">
              Esta é a data usada para fechar o ciclo de pagamento do fornecedor (quando ele tiver ciclo cadastrado).
              Deixe em <strong>hoje</strong> para lançamentos correntes, ou informe uma data retroativa caso esteja
              cadastrando agora uma OC/nota de um período anterior que ficou esquecida.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Data de lançamento</Label>
              <Input type="date" className="bg-white border-gray-300 text-gray-900"
                value={dataLancamentoInput}
                onChange={e => setDataLancamentoInput(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowLancamentoDialog(null)} disabled={atualizarStatus.isPending}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
              disabled={!dataLancamentoInput || atualizarStatus.isPending}
              onClick={() => {
                if (!showLancamentoDialog) return;
                atualizarStatus.mutate({ id: showLancamentoDialog.id, status: showLancamentoDialog.status, dataLancamento: dataLancamentoInput });
                setShowLancamentoDialog(null);
              }}
            >
              {atualizarStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog — Estornar Recebimento */}
      <Dialog open={showEstornoDialog} onOpenChange={v => { if (!v) setShowEstornoDialog(false); }}>
        <DialogContent className="border-amber-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <RotateCcw className="h-5 w-5" /> Estornar Recebimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Esta ação irá:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Reverter o status da OC para <strong>Aprovada</strong></li>
                <li>Criar movimentações de saída no estoque para cada item</li>
                <li>Reverter as quantidades entregues na Solicitação de Compra</li>
                <li>Reverter o status financeiro de A Pagar para Previsto</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Motivo do estorno <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva o motivo do estorno (ex: material com defeito, entrega errada...)"
                value={estornoMotivo}
                onChange={e => setEstornoMotivo(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowEstornoDialog(false)} disabled={estornarRecebimento.isPending}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5"
              disabled={!estornoMotivo.trim() || estornarRecebimento.isPending}
              onClick={() => {
                if (!showDetalhe) return;
                estornarRecebimento.mutate({ id: showDetalhe, motivo: estornoMotivo.trim() });
              }}
            >
              {estornarRecebimento.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelarMaster} onOpenChange={v => { if (!v) setShowCancelarMaster(false); }}>
        <DialogContent className="border-red-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <Ban className="h-5 w-5" /> Cancelar OC/OS (Admin Master)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
              <p className="font-semibold">Esta ação irá (preservando o histórico):</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Marcar esta OC/OS como <strong>Cancelada</strong></li>
                <li>Cancelar o <strong>contrato em andamento</strong> vinculado (se houver) e suas medições não pagas</li>
                <li>Cancelar os <strong>lançamentos financeiros NÃO pagos</strong> (pagos ficam intactos)</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Motivo do cancelamento <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva o motivo do cancelamento (mín. 5 caracteres)"
                value={cancelMasterMotivo}
                onChange={e => setCancelMasterMotivo(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Senha do master <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Confirme sua senha"
                value={cancelMasterSenha}
                onChange={e => setCancelMasterSenha(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowCancelarMaster(false)} disabled={cancelarMaster.isPending}>Voltar</Button>
            <Button
              className="bg-red-600 hover:bg-red-500 text-white gap-1.5"
              disabled={cancelMasterMotivo.trim().length < 5 || !cancelMasterSenha || cancelarMaster.isPending}
              onClick={() => {
                if (!showDetalhe) return;
                cancelarMaster.mutate({ ordemId: showDetalhe, companyId, motivo: cancelMasterMotivo.trim(), password: cancelMasterSenha });
              }}
            >
              {cancelarMaster.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmExcluirLote} onOpenChange={setConfirmExcluirLote}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> ordem(ns) de compra? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmExcluirLote(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-1.5" disabled={excluirLote.isPending} onClick={() => excluirLote.mutate({ ids: [...selectedIds], companyId })}>
              {excluirLote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir {selectedIds.size} OC(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!showAprovacaoExtra} onOpenChange={(v) => { if (!v) setShowAprovacaoExtra(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Aprovação Extra-Orçamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {showAprovacaoExtra?.aprovacaoExtraMotivo && (
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2.5 text-red-700 whitespace-pre-wrap">{showAprovacaoExtra.aprovacaoExtraMotivo}</div>
            )}
            <p className="text-sm text-gray-600">Esta OC contém insumos que ultrapassam a quantidade orçada. Um administrador deve autorizar a compra extra-orçamento.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Email do Administrador *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="email" placeholder="admin@empresa.com" value={aprovExtraForm.adminEmail} onChange={e => setAprovExtraForm(p => ({ ...p, adminEmail: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Senha do Administrador *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="password" placeholder="••••••" value={aprovExtraForm.adminSenha} onChange={e => setAprovExtraForm(p => ({ ...p, adminSenha: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Justificativa *</Label>
                <Textarea className="text-sm bg-white text-gray-900 border-gray-300 min-h-[60px]" placeholder="Motivo da compra extra-orçamento..." value={aprovExtraForm.justificativa} onChange={e => setAprovExtraForm(p => ({ ...p, justificativa: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAprovacaoExtra(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5" disabled={aprovarExtra.isPending || !aprovExtraForm.adminEmail || !aprovExtraForm.adminSenha || !aprovExtraForm.justificativa} onClick={() => {
                if (!showAprovacaoExtra) return;
                aprovarExtra.mutate({ ocId: showAprovacaoExtra.id, companyId, adminEmail: aprovExtraForm.adminEmail, adminSenha: aprovExtraForm.adminSenha, justificativa: aprovExtraForm.justificativa });
              }}>
                {aprovarExtra.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Aprovar OC
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* FD Dialog */}
      <Dialog open={!!showFdDialog} onOpenChange={v => { if (!v) setShowFdDialog(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-indigo-700 flex items-center gap-2"><Receipt className="h-5 w-5" /> Marcar Faturamento Direto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">Defina a modalidade e o valor do faturamento direto para esta OC.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Modalidade *</Label>
                <Select value={fdForm.modalidade} onValueChange={v => setFdForm(p => ({ ...p, modalidade: v as any }))}>
                  <SelectTrigger className="h-8 text-sm bg-white text-gray-900 border-gray-300"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fd_cliente">FD Cliente</SelectItem>
                    <SelectItem value="fd_terceiro">FD Terceiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Valor FD (R$) *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="number" step="0.01" placeholder="0.00" value={fdForm.valor} onChange={e => setFdForm(p => ({ ...p, valor: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowFdDialog(null)}>Cancelar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                disabled={marcarFd.isPending || !fdForm.valor || parseFloat(fdForm.valor) <= 0}
                onClick={() => {
                  if (!showFdDialog) return;
                  marcarFd.mutate({
                    ocId: showFdDialog.id,
                    companyId,
                    modalidade: fdForm.modalidade,
                    valor: parseFloat(fdForm.valor),
                    bdiItemId: fdForm.bdiItemId || undefined,
                  });
                }}>
                {marcarFd.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                Confirmar FD
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>}

      {abaAtiva === "os" && <ContratosServicoTab companyId={companyId} />}
    </div>
    </DashboardLayout>
  );
}

const OS_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ativo:     { label: "Ativo",     cls: "bg-green-100 text-green-800 border-green-200" },
  encerrado: { label: "Encerrado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  suspenso:  { label: "Suspenso",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  concluido: { label: "Concluído", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};

const BRL_OS = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
};

const fmtDateOS = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

function ContratosServicoTab({ companyId }: { companyId: number }) {
  const [, navigate] = useLocation();
  const [buscaOS, setBuscaOS] = useState("");
  const [filtroStatusOS, setFiltroStatusOS] = useState("todos");
  const [selectedOS, setSelectedOS] = useState<Set<number>>(new Set());
  const [confirmExcluirOS, setConfirmExcluirOS] = useState(false);

  const { data: contratos = [], isLoading, refetch } = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const excluirLoteOS = trpc.terceiroContratos.excluirContratosLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.deleted} contrato(s) excluído(s)`); setSelectedOS(new Set()); setConfirmExcluirOS(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtrados = contratos.filter((c: any) => {
    const b = buscaOS.toLowerCase();
    const matchBusca = !buscaOS || (c.descricao || "").toLowerCase().includes(b) || (c.numeroContrato || "").toLowerCase().includes(b);
    const matchStatus = filtroStatusOS === "todos" || c.status === filtroStatusOS;
    return matchBusca && matchStatus;
  });

  const toggleSelectOS = (id: number) => {
    setSelectedOS(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const allSelectedOS = filtrados.length > 0 && filtrados.every((c: any) => selectedOS.has(c.id));
  const toggleSelectAllOS = () => {
    if (allSelectedOS) setSelectedOS(new Set());
    else setSelectedOS(new Set(filtrados.map((c: any) => c.id)));
  };

  const totalAtivos = contratos.filter((c: any) => c.status === "ativo").length;
  const totalValor = contratos.reduce((s: number, c: any) => s + parseFloat(c.valorTotal ?? "0"), 0);
  const totalMedido = contratos.reduce((s: number, c: any) => s + parseFloat(c.valorPago ?? "0"), 0);

  return (
    <>
      {selectedOS.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-medium text-red-700">{selectedOS.size} contrato(s) selecionado(s)</span>
          <Button size="sm" variant="destructive" className="ml-auto gap-1.5" onClick={() => setConfirmExcluirOS(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionados
          </Button>
        </div>
      )}

      {confirmExcluirOS && (
        <div className="flex items-center gap-3 p-3 bg-red-100 border border-red-300 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-800">Excluir <strong>{selectedOS.size}</strong> contrato(s)? Medições, itens e documentos vinculados também serão excluídos. Esta ação não pode ser desfeita.</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setConfirmExcluirOS(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={excluirLoteOS.isPending} onClick={() => excluirLoteOS.mutate({ ids: Array.from(selectedOS), companyId })}>
              {excluirLoteOS.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirmar
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4 bg-purple-50 border-purple-200 text-purple-700">
          <div className="flex items-center gap-2 mb-1"><Wrench className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Total Contratos</span></div>
          <div className="text-xl font-bold">{contratos.length}</div>
        </div>
        <div className="rounded-xl border p-4 bg-green-50 border-green-200 text-green-700">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Ativos</span></div>
          <div className="text-xl font-bold">{totalAtivos}</div>
        </div>
        <div className="rounded-xl border p-4 bg-indigo-50 border-indigo-200 text-indigo-700">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Valor Total</span></div>
          <div className="text-xl font-bold">{BRL_OS(totalValor)}</div>
        </div>
        <div className="rounded-xl border p-4 bg-amber-50 border-amber-200 text-amber-700">
          <div className="flex items-center gap-2 mb-1"><Receipt className="h-4 w-4" /><span className="text-xs font-medium text-gray-500">Total Pago</span></div>
          <div className="text-xl font-bold">{BRL_OS(totalMedido)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por descrição ou número..." className="pl-9 bg-white border-gray-300 text-gray-900" value={buscaOS} onChange={e => setBuscaOS(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "ativo", "encerrado", "suspenso", "concluido"].map(s => (
            <button key={s} onClick={() => setFiltroStatusOS(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatusOS === s ? "bg-purple-600 border-purple-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
              {s === "todos" ? "Todos" : OS_STATUS_MAP[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10"><Checkbox checked={allSelectedOS} onCheckedChange={toggleSelectAllOS} aria-label="Selecionar todos" /></TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Nº Contrato</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Descrição</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Empresa</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Valor Total</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Pago</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Vigência</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">Nenhum contrato de serviço encontrado</TableCell></TableRow>
            ) : filtrados.map((c: any) => {
              const pct = parseFloat(c.valorTotal ?? "0") > 0
                ? ((parseFloat(c.valorPago ?? "0") / parseFloat(c.valorTotal ?? "1")) * 100).toFixed(1)
                : "0.0";
              return (
                <TableRow key={c.id} className={`hover:bg-purple-50/30 cursor-pointer border-gray-100 ${selectedOS.has(c.id) ? "bg-purple-50/50" : ""}`} onClick={() => navigate(`/terceiros/contratos/${c.id}`)}>
                  <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selectedOS.has(c.id)} onCheckedChange={() => toggleSelectOS(c.id)} aria-label={`Selecionar ${c.numeroContrato}`} /></TableCell>
                  <TableCell className="font-mono text-xs text-purple-700 font-medium">{c.numeroContrato || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-900 max-w-60 truncate">{c.descricao || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-600">{(c as any).empresaNome || "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-gray-900">{BRL_OS(c.valorTotal)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-600">{BRL_OS(c.valorPago)} ({pct}%)</span>
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{fmtDateOS(c.dataInicio)} → {fmtDateOS(c.dataTermino)}</TableCell>
                  <TableCell>
                    {OS_STATUS_MAP[c.status]
                      ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${OS_STATUS_MAP[c.status].cls}`}>{OS_STATUS_MAP[c.status].label}</span>
                      : <span className="text-xs text-gray-400">{c.status}</span>}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-center">
        <button onClick={() => navigate("/terceiros/contratos")} className="text-sm text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1 mx-auto">
          <Wrench className="h-3.5 w-3.5" /> Gerenciar contratos completos no módulo Terceiros
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}
