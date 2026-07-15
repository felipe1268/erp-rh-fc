import React, { useMemo, useState, useRef, useEffect, lazy, Suspense, ChangeEvent } from "react";
import { cn } from "@/lib/utils";
const FinanceiroChequesRecebidos = lazy(() => import("./FinanceiroChequesRecebidos"));
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, FileText, Sparkles, Loader2, CheckCircle, AlertCircle, AlertTriangle, ShieldCheck, Trash2, Pencil, Search, RotateCcw, Banknote, ChevronLeft, ChevronRight, Link2, X, Landmark, User, CalendarDays, Hash, FileSignature, ExternalLink, Keyboard, CheckCheck } from "lucide-react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/SearchableSelect";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
// Máscara de moeda BRL (digita centavos → "1.234,56") — mesmo motor do Cartão/Contas a Receber.
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
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS_OPTS = ["compensado", "pendente", "sustado", "cancelado", "devolvido", "indefinido"];
// "Outros" = agregado dos status fora de compensado/pendente. Filtro client-side.
const OUTROS_SET = ["sustado", "cancelado", "devolvido", "indefinido"];
// Rev. 3242 — filtros derivados das flags do EXTRATO (não são "status" do banco; filtro
// client-side sobre as flags que o `listar` já anexa). NÃO devem ir como `status` ao backend.
//   conferido  = conciliado=1 (compensado E verificado/conferido no extrato)
//   confere    = banco compensou + controle compensado, mas ainda NÃO marcado (conciliado=0)
//   divergente = banco compensou MAS controle não está "compensado" (análise)
const EXTRATO_FILTERS = ["conferido", "confere", "divergente"];

// Rev. 3246 — diferença em DIAS (no fuso local, à meia-noite) entre uma data e hoje.
// >0 = no futuro (faltam N dias); 0 = hoje; <0 = no passado (vencido há N dias).
function diasAteData(v: any): number | null {
  if (!v) return null;
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    if (isNaN(d.getTime())) return null;
    const hoje = new Date();
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return Math.round((a - b) / 86400000);
  } catch { return null; }
}

// Rev. 4081 — rótulos das formas de pagamento de um vínculo tipo 'ajuste' (sem linha de
// extrato); mesmo mapa usado em FinanceiroConciliacao.tsx.
const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  deposito: "Depósito",
  cheque_proprio: "Cheque próprio",
  outro: "Outro",
};

function statusBadge(s: string) {
  switch (s) {
    case "compensado": return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Compensado</Badge>;
    // Rev. 4081 — cheque devolvido quitado por substituição (PIX/TED/dinheiro/etc.) vira
    // "compensado_pix" (Rev. 4079); antes caía no default "Indefinido".
    case "compensado_pix": return <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">Quitado (substituição)</Badge>;
    case "pendente": return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendente</Badge>;
    case "sustado": return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Sustado</Badge>;
    case "cancelado": return <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">Cancelado</Badge>;
    case "devolvido": return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Devolvido</Badge>;
    default: return <Badge variant="outline">Indefinido</Badge>;
  }
}

// Rev. 4081 — detalhamento de COMO um cheque "compensado_pix" foi quitado por substituição
// (1 ou mais pagamentos, PIX/TED/dinheiro/depósito/cheque próprio/outro somando o total).
// Busca sob demanda (popover) via getVinculosPorChequeNumero — não pesa a listagem principal.
function ChequeVinculosBreakdown({ companyId, numeroCheque }: { companyId: number; numeroCheque: string }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = (trpc as any).financial.getVinculosPorChequeNumero.useQuery(
    { companyId, numeroCheque },
    { enabled: open && !!companyId && !!numeroCheque }
  );
  const vinculos: any[] = data?.vinculos ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex w-fit items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-200" title="Ver como este cheque foi pago">
          <Link2 className="h-3 w-3" /> Ver pagamento
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-xs">
        <p className="mb-2 font-semibold text-teal-700">Quitado por substituição</p>
        {isFetching ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : vinculos.length === 0 ? (
          <p className="text-muted-foreground">Nenhum vínculo encontrado.</p>
        ) : (
          <div className="space-y-1.5">
            {vinculos.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 border-b border-dashed pb-1 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {v.tipo === "ajuste" ? (FORMA_PAGAMENTO_LABEL[v.formaPagamento] ?? "Ajuste") : "PIX/TED"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {[fmtData(v.data), v.pixContaApelido || v.pixDescricao].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatBRL(Math.abs(Number(v.valor)))}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatBRL(vinculos.reduce((s, v) => s + Math.abs(Number(v.valor)), 0))}</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Rev. 3246 — célula "Dias p/ compensar": substitui a antiga coluna "Compensação".
// Já compensado → "Compensado · DD/MM"; devolvido → selo âmbar; sustado/cancelado → "—";
// pendente/indefinido → contagem regressiva pelo vencimento (faltam N dias / hoje / vencido).
function compensaCell(c: any) {
  const jaCompensado = c.status === "compensado" || !!c.dataCompensacao;
  if (jaCompensado) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-green-700"
        title={c.dataCompensacao ? `Compensado em ${fmtData(c.dataCompensacao)}` : "Compensado"}>
        <CheckCircle className="h-3.5 w-3.5" /> Compensado{c.dataCompensacao ? ` · ${fmtData(c.dataCompensacao)}` : ""}
      </span>
    );
  }
  if (c.status === "devolvido") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-orange-700" title="Cheque devolvido — não compensou">
        <RotateCcw className="h-3.5 w-3.5" /> Devolvido
      </span>
    );
  }
  if (c.status === "sustado" || c.status === "cancelado") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const dias = diasAteData(c.dataVencimento);
  if (dias == null) return <span className="text-xs text-muted-foreground">—</span>;
  if (dias > 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
        title={`Compensa em ${fmtData(c.dataVencimento)}`}>
        {dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}
      </span>
    );
  }
  if (dias === 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
        title={`Compensa hoje (${fmtData(c.dataVencimento)})`}>
        compensa hoje
      </span>
    );
  }
  const atraso = Math.abs(dias);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
      title={`Vencimento era ${fmtData(c.dataVencimento)} e o cheque ainda consta pendente`}>
      vencido há {atraso} {atraso === 1 ? "dia" : "dias"}
    </span>
  );
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

const ANO_ATUAL = new Date().getFullYear();

export default function FinanceiroCheques() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Abas (Emitidos / Recebidos) ──
  const [activeTab, setActiveTab] = useState<'emitidos' | 'recebidos'>('emitidos');

  // ── Filtros ──
  // Mesmo padrão da Conciliação Bancária: navegação por ANO + faixa de meses
  // (Jan–Dez) com bolinhas de status; "Ano todo" (mesSel=null) abre o ano inteiro.
  const [fStatus, setFStatus] = useState<string>("todos");
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [fBusca, setFBusca] = useState<string>("");
  // Rev. 4256 — filtros extras client-side: data de vencimento + fornecedor
  const [fVencDe, setFVencDe] = useState<string>("");
  const [fVencAte, setFVencAte] = useState<string>("");
  const [fFornecedor, setFFornecedor] = useState<string>("");

  // ── Importação ──
  // Dois modos: "xlsx" (planilha mensal) e "pdf" (vários PDFs/imagens de cheque
  // lidos por IA — o ERP deriva mês/ano da DATA de cada cheque).
  const [importMode, setImportMode] = useState<"xlsx" | "pdf">("xlsx");
  const [dragOver, setDragOver] = useState(false);
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  // PDFs (IA): arquivos selecionados + linhas acumuladas da leitura.
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfFiles, setPdfFiles] = useState<{ name: string; base64: string; mimeType: string }[]>([]);
  const [pdfRows, setPdfRows] = useState<any[]>([]);
  // ── Progresso (barra 0→100%) ──
  const [progresso, setProgresso] = useState<number>(0);
  const [progLabel, setProgLabel] = useState<string>("");
  // Validação da prévia de importação: filtro por categoria + busca livre.
  const [previewFiltro, setPreviewFiltro] = useState<"todos" | "novos" | "jaExistem" | "dup" | "semFornecedor" | "semConta" | "semValor">("todos");
  const [previewBusca, setPreviewBusca] = useState<string>("");
  const progRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progOpRef = useRef<number>(0); // token da operação ativa (evita callback tardio sobrescrever)

  function pararTimersProgresso() {
    if (progRef.current) { clearInterval(progRef.current); progRef.current = null; }
    if (progTimeoutRef.current) { clearTimeout(progTimeoutRef.current); progTimeoutRef.current = null; }
  }
  function iniciarProgresso(label: string): number {
    pararTimersProgresso();
    const token = ++progOpRef.current;
    setProgLabel(label);
    setProgresso(8);
    // Avanço assintótico até ~92% enquanto a operação roda (server single-shot).
    progRef.current = setInterval(() => {
      setProgresso((p) => (p < 92 ? Math.min(92, p + (92 - p) * 0.12) : p));
    }, 180);
    return token;
  }
  function finalizarProgresso(token: number, ok: boolean) {
    if (token !== progOpRef.current) return; // operação obsoleta — ignora
    pararTimersProgresso();
    if (ok) {
      setProgresso(100);
      progTimeoutRef.current = setTimeout(() => {
        if (token !== progOpRef.current) return;
        setProgresso(0); setProgLabel("");
      }, 700);
    } else {
      setProgresso(0);
      setProgLabel("");
    }
  }
  useEffect(() => () => pararTimersProgresso(), []);

  // ── Lançamento manual (Rev. 3329) ──
  const manualVazio = {
    numeroCheque: "", valor: "", fornecedorNome: "", fornecedorId: null as number | null,
    bancoNome: "", bancoCodigo: "", agencia: "", contaCorrenteRaw: "",
    contaBancariaId: null as number | null, dataVencimento: "", dataCompensacao: "",
    status: "pendente", parcela: "", nf: "", observacao: "",
  };
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<typeof manualVazio>({ ...manualVazio });
  // Permite digitar um favorecido que não está no cadastro de fornecedores.
  const [favorecidoManual, setFavorecidoManual] = useState(false);

  // ── Edição ──
  const [editItem, setEditItem] = useState<any>(null);
  // Rev. 4141 — valor do cheque em edição (máscara BRL) e toggle de fornecedor
  const [editValorStr, setEditValorStr] = useState("");
  const [editFavorecidoManual, setEditFavorecidoManual] = useState(false);
  useEffect(() => {
    if (editItem?.id != null) {
      const v = editItem.valor != null ? Number(editItem.valor) : 0;
      setEditValorStr(v > 0 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
      setEditFavorecidoManual(!editItem.fornecedorId);
    }
  }, [editItem?.id]);
  const [excluirItem, setExcluirItem] = useState<any>(null);
  // Rev. 3245 — múltipla seleção p/ alterar status em lote.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);

  // ── Limpar cadastro (mês / ano inteiro) ──
  // Fluxo: abrir (escopo) → 1ª confirmação → 2ª confirmação + senha → executa.
  const [limparEscopo, setLimparEscopo] = useState<null | "mes" | "ano">(null);
  const [limparEtapa, setLimparEtapa] = useState<1 | 2>(1);
  const [limparSenha, setLimparSenha] = useState("");

  // ── Dupla checagem com o extrato (Rev. 3234) ──
  const [conferirOpen, setConferirOpen] = useState(false);
  const [divergOpen, setDivergOpen] = useState(false);

  const listarArgs: any = { companyId, limit: 2000, ano };
  // "outros" e os filtros de EXTRATO são agregados client-side (vários status / flags
  // derivadas); não mandamos status ao servidor nesses casos — filtramos localmente abaixo.
  if (fStatus !== "todos" && fStatus !== "outros" && !EXTRATO_FILTERS.includes(fStatus)) listarArgs.status = fStatus;
  if (mesSel != null) listarArgs.mes = mesSel;
  if (fBusca.trim()) listarArgs.busca = fBusca.trim();

  // Alterna o filtro de status ao clicar num card (clicar de novo no card ativo
  // volta para "todos"). Mantém a régua de mês selecionada.
  const toggleStatus = (s: string) => setFStatus((prev) => (prev === s ? "todos" : s));

  const { data: cheques = [], isLoading } = (trpc as any).cheques.listar.useQuery(
    listarArgs, { enabled: !!companyId }
  );
  const { data: resumo = [] } = (trpc as any).cheques.resumo.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  const { data: resumoMensal = [] } = (trpc as any).cheques.resumoMensal.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  // Resumo por STATUS do MÊS selecionado (alimenta os 3 cards quando há um mês). Só roda
  // com mês selecionado; em "Ano todo" os cards usam o resumo do ANO (`totais`) — Rev. 3212.
  const { data: resumoMes = [] } = (trpc as any).cheques.resumo.useQuery(
    { companyId, ano, mes: mesSel ?? undefined },
    { enabled: !!companyId && mesSel != null }
  );

  const previewMut = (trpc as any).cheques.importarPreview.useMutation();
  const confirmarMut = (trpc as any).cheques.importarConfirmar.useMutation();
  const lerPdfMut = (trpc as any).cheques.lerChequesPdf.useMutation();
  const pdfPreviewMut = (trpc as any).cheques.importarPdfPreview.useMutation();
  const pdfConfirmarMut = (trpc as any).cheques.importarPdfConfirmar.useMutation();
  const criarManualMut = (trpc as any).cheques.criarManual.useMutation();
  const atualizarMut = (trpc as any).cheques.atualizar.useMutation();
  const bulkStatusMut = (trpc as any).cheques.atualizarStatusLote.useMutation();
  const excluirMut = (trpc as any).cheques.excluir.useMutation();
  const limparMut = (trpc as any).cheques.limparCadastro.useMutation();

  // Dupla checagem com o extrato (Rev. 3234): resumo da conferência do período atual.
  const { data: verif } = (trpc as any).cheques.verificarExtratoResumo.useQuery(
    { companyId, ano, mes: mesSel ?? undefined },
    { enabled: !!companyId }
  );
  const conferirMut = (trpc as any).cheques.conferirExtrato.useMutation();
  const autoCorrigirMut = (trpc as any).cheques.autoCorrigirDivergencias.useMutation();
  // Rev. 4261 — Auto-corrige divergências banco×controle (pendente → compensado) quando
  // o extrato mostra match FORTE (nº+valor único). Dispara ao carregar `verif`. Usa ref
  // estável (ano|mes) p/ não reenviar no mesmo período.
  const autoCorrigirKeyRef = React.useRef<string>("");
  React.useEffect(() => {
    if (!companyId || !verif) return;
    const key = `${companyId}|${ano}|${mesSel ?? "all"}`;
    if (autoCorrigirKeyRef.current === key) return;
    autoCorrigirKeyRef.current = key;
    autoCorrigirMut.mutate(
      { companyId: Number(companyId), ano, mes: mesSel ?? undefined },
      {
        onSuccess: (r: any) => {
          if (r?.atualizados > 0) {
            utils?.cheques?.listar?.invalidate?.();
            utils?.cheques?.verificarExtratoResumo?.invalidate?.();
            utils?.cheques?.resumo?.invalidate?.();
          }
        },
        onError: () => { autoCorrigirKeyRef.current = ""; },
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, ano, mesSel, !!verif]);

  // ── Fontes p/ o lançamento manual moderno (Rev. 3335) ──
  // Favorecido = cadastro de fornecedores; Conta emitida = contas bancárias da empresa.
  const { data: fornecedoresList } = (trpc as any).compras.listarFornecedores.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId },
  );
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  const fornecedorOpts: SearchableSelectOption[] = useMemo(() => {
    const list: any[] = Array.isArray(fornecedoresList) ? fornecedoresList : [];
    const seen = new Set<string>();
    const out: SearchableSelectOption[] = [];
    for (const f of list) {
      const nome = String(f.nomeFantasia || f.razaoSocial || "").trim();
      if (!nome) continue;
      const k = String(f.id);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ value: k, label: nome, subtitle: f.cnpj || undefined, searchExtra: f.cnpj || "" });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [fornecedoresList]);
  const contaOpts: SearchableSelectOption[] = useMemo(() => {
    // Só contas COM talão de cheque emitido (Rev. 3343) — quem não tem talão não emite cheque.
    const list: any[] = (Array.isArray(bankAccounts) ? bankAccounts : []).filter((b: any) => Number(b.temTalao) === 1);
    return list.map((b: any) => {
      const banco = String(b.descricao || b.banco || "").trim();
      const ag = String(b.agencia || "").trim();
      const cc = String(b.conta || "").trim();
      const sub = [ag && `Ag. ${ag}`, cc && `C/C ${cc}`].filter(Boolean).join(" · ");
      return { value: String(b.id), label: banco || `Conta ${b.id}`, subtitle: sub || undefined, searchExtra: `${b.banco || ""} ${ag} ${cc}` };
    });
  }, [bankAccounts]);

  async function conferirComExtrato() {
    try {
      const r = await conferirMut.mutateAsync({ companyId, ano, mes: mesSel ?? undefined });
      setConferirOpen(false);
      await Promise.all([
        utils?.cheques?.listar?.invalidate?.(),
        utils?.cheques?.verificarExtratoResumo?.invalidate?.(),
        utils?.cheques?.resumo?.invalidate?.(),
      ]);
      toast({
        title: "Conferência concluída",
        description: `${r.conferidos} cheque(s) marcado(s) como conferido(s) no extrato.` +
          (r.backfilled > 0 ? ` Data de compensação preenchida em ${r.backfilled} cheque(s).` : "") +
          (r.divergencias > 0 ? ` ${r.divergencias} divergência(s) aguardam sua análise.` : ""),
      });
    } catch (err: any) {
      toast({ title: "Não foi possível conferir", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // Prévia da limpeza p/ o escopo aberto: total/conciliados/consolidado/valor.
  // mes = mês selecionado quando escopo="mes" (exige um mês selecionado).
  const limparMesNum = limparEscopo === "mes" ? mesSel : null;
  const { data: limparPrev } = (trpc as any).cheques.limparPreview.useQuery(
    { companyId, ano, mes: limparMesNum ?? undefined },
    { enabled: !!companyId && limparEscopo != null }
  );

  const totais = useMemo(() => {
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const r of resumo) map[r.status] = { qtd: r.qtd, total: r.total };
    const totalGeral = (resumo as any[]).reduce((a, r) => a + (r.total || 0), 0);
    const qtdGeral = (resumo as any[]).reduce((a, r) => a + (r.qtd || 0), 0);
    return { map, totalGeral, qtdGeral };
  }, [resumo]);

  // Agregado do MÊS selecionado (Total / Compensados / Faltam compensar).
  const totaisMes = useMemo(() => {
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const r of resumoMes as any[]) map[r.status] = { qtd: r.qtd, total: r.total };
    const qtd = (resumoMes as any[]).reduce((a, r) => a + (r.qtd || 0), 0);
    const total = (resumoMes as any[]).reduce((a, r) => a + (r.total || 0), 0);
    return { map, qtd, total };
  }, [resumoMes]);

  // Rev. 3212 — os 3 cards de resumo agora aparecem TAMBÉM em "Ano todo" (mesSel=null):
  // com mês selecionado usam o agregado do mês (totaisMes); em "Ano todo" usam o do ano
  // (totais, que já vem de cheques.resumo({companyId,ano}) sem filtro de mês).
  const cardTotaisBackend = mesSel != null
    ? { qtd: totaisMes.qtd, total: totaisMes.total, map: totaisMes.map }
    : { qtd: totais.qtdGeral, total: totais.totalGeral, map: totais.map };
  const cardTitulo = mesSel != null ? `Resumo de ${MESES[mesSel]}/${ano}` : `Resumo de ${ano} (ano todo)`;
  const cardEscopo = mesSel != null ? "do mês" : "do ano";

  // Status por mês p/ a bolinha da régua (mesmo padrão da Conciliação):
  // verde = todos compensados; azul = tem cheque(s) mas com pendência; cinza = sem dados.
  const mesesStatus = useMemo(() => {
    const m: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let i = 1; i <= 12; i++) m[i] = "vazio";
    for (const r of resumoMensal as any[]) {
      if (!r.mes) continue;
      m[r.mes] = r.qtd > 0 && r.compensados >= r.qtd ? "consolidado" : r.qtd > 0 ? "lancamento" : "vazio";
    }
    return m;
  }, [resumoMensal]);

  // Lista exibida — aplica o filtro client-side de "Outros" (agregado de status) + data vencimento.
  const chequesFiltrados = useMemo(() => {
    let arr = cheques as any[];
    if (fStatus === "outros") arr = arr.filter((c) => OUTROS_SET.includes(c.status));
    // Rev. 3242 — filtros de EXTRATO (flags derivadas que o `listar` já anexa).
    // `conciliado` vem da coluna integer (1/0) — comparar com Number, NÃO `=== true`
    // (espelha o backend `Number(c.conciliado)===1`); `extratoConfirmado/Divergente` já são boolean.
    else if (fStatus === "conferido") arr = arr.filter((c) => Number(c.conciliado) === 1);
    else if (fStatus === "confere") arr = arr.filter((c) => c.extratoConfirmado && Number(c.conciliado) !== 1);
    else if (fStatus === "divergente") arr = arr.filter((c) => c.extratoDivergente === true);
    // Rev. 4256 — filtro por data de vencimento (De / Até), client-side.
    if (fVencDe) {
      const de = fVencDe; // "YYYY-MM-DD"
      arr = arr.filter((c) => {
        if (!c.dataVencimento) return false;
        const d = String(c.dataVencimento).slice(0, 10);
        return d >= de;
      });
    }
    if (fVencAte) {
      const ate = fVencAte; // "YYYY-MM-DD"
      arr = arr.filter((c) => {
        if (!c.dataVencimento) return false;
        const d = String(c.dataVencimento).slice(0, 10);
        return d <= ate;
      });
    }
    // Filtro por fornecedor (nome exato, derivado do campo do cheque)
    if (fFornecedor) {
      arr = arr.filter((c) => (c.fornecedorNome || "") === fFornecedor);
    }
    return arr;
  }, [cheques, fStatus, fVencDe, fVencAte, fFornecedor]);

  // Rev. 4257 — quando qualquer filtro client-side está ativo (fornecedor, data,
  // status "outros"/extrato), os cards derivam do chequesFiltrados em vez do resumo
  // backend — "o que a tabela mostra é o que os cards mostram".
  // IIFE (sem useMemo) para evitar qualquer problema de stale-closure com deps.
  const anyFiltroAtivo = !!(fFornecedor || fVencDe || fVencAte || fStatus !== "todos");
  // valor é NUMERIC(15,2) — Drizzle retorna como string EN "3558.75"
  // Também suporta string BR "3.558,75" caso venha de importação legada
  const parseValor = (v: unknown): number => {
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    if (!v) return 0;
    const s = String(v).trim();
    // Se tem vírgula → formato BR: remove pontos de milhar, troca vírgula por ponto
    if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    // Formato EN padrão (Postgres NUMERIC)
    return parseFloat(s) || 0;
  };
  const cardTotais = (() => {
    if (!anyFiltroAtivo) return cardTotaisBackend;
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const c of chequesFiltrados as any[]) {
      const s = String(c.status || "indefinido");
      if (!map[s]) map[s] = { qtd: 0, total: 0 };
      map[s].qtd++;
      map[s].total += parseValor(c.valor);
    }
    const qtd = (chequesFiltrados as any[]).length;
    const total = (chequesFiltrados as any[]).reduce((acc: number, c: any) => acc + parseValor(c.valor), 0);
    return { qtd, total, map };
  })();

  // Lista única de fornecedores dos cheques carregados (p/ select de filtro).
  const fornecedorFiltroOpts = useMemo((): SearchableSelectOption[] => {
    const nomes = new Set<string>();
    for (const c of cheques as any[]) {
      const n = String(c.fornecedorNome || "").trim();
      if (n) nomes.add(n);
    }
    return Array.from(nomes)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((nome) => ({ value: nome, label: nome }));
  }, [cheques]);

  // Somatório dos cheques filtrados por data de vencimento (quando o filtro está ativo).
  const vencFiltroAtivo = !!(fVencDe || fVencAte);
  const vencSomatorio = useMemo(() => {
    if (!vencFiltroAtivo) return null;
    const total = chequesFiltrados.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
    const qtd = chequesFiltrados.length;
    const pendentes = chequesFiltrados.filter((c: any) => c.status === "pendente");
    const totalPendentes = pendentes.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
    return { total, qtd, qtdPendentes: pendentes.length, totalPendentes };
  }, [chequesFiltrados, vencFiltroAtivo]);

  // Rev. 3245 — múltipla seleção. IDs visíveis (a seleção só age sobre o que está
  // na tela); estado derivado p/ o "selecionar todos" do cabeçalho.
  const idsVisiveis = useMemo(() => (chequesFiltrados as any[]).map((c) => c.id), [chequesFiltrados]);
  const selVisiveis = useMemo(() => idsVisiveis.filter((id) => selectedIds.has(id)), [idsVisiveis, selectedIds]);
  const allSelecionados = idsVisiveis.length > 0 && selVisiveis.length === idsVisiveis.length;
  const someSelecionados = selVisiveis.length > 0 && !allSelecionados;
  const toggleSel = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allSelecionados) { for (const id of idsVisiveis) next.delete(id); }
    else { for (const id of idsVisiveis) next.add(id); }
    return next;
  });
  const limparSelecao = () => setSelectedIds(new Set());

  // Ao trocar filtro/mês/ano/busca a lista muda — limpa a seleção p/ não agir
  // sobre cheques que saíram da tela.
  useEffect(() => { setSelectedIds(new Set()); setBulkStatus(""); }, [fStatus, mesSel, ano, fBusca, fVencDe, fVencAte, fFornecedor]);

  async function aplicarBulkStatus() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !bulkStatus) return;
    try {
      const r = await bulkStatusMut.mutateAsync({ companyId, ids, status: bulkStatus });
      setBulkOpen(false);
      limparSelecao();
      setBulkStatus("");
      await Promise.all([
        utils?.cheques?.listar?.invalidate?.(),
        utils?.cheques?.resumo?.invalidate?.(),
        utils?.cheques?.resumoMensal?.invalidate?.(),
        utils?.cheques?.verificarExtratoResumo?.invalidate?.(),
      ]);
      toast({ title: "Status atualizado", description: `${r?.alterado ?? ids.length} cheque(s) alterado(s).` });
    } catch (err: any) {
      toast({ title: "Falha ao alterar status", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // Lista da PRÉVIA de importação, aplicando filtro de categoria + busca livre.
  // Usa `preview.linhas` (lista completa nova) com fallback p/ `preview.amostra` (compat).
  const previewLinhas = useMemo(() => {
    const base: any[] = (preview?.linhas ?? preview?.amostra ?? []) as any[];
    const porFiltro = base.filter((l) => {
      switch (previewFiltro) {
        case "novos": return l.situacao === "NOVO";
        case "jaExistem": return l.situacao === "JA_EXISTE";
        case "dup": return l.situacao === "DUP_ARQUIVO";
        case "semFornecedor": return !l.fornecedorIdentificado;
        case "semConta": return !l.contaIdentificada;
        case "semValor": return l.semValor === true || l.valor == null || Number(l.valor) <= 0;
        default: return true;
      }
    });
    const q = previewBusca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!q) return porFiltro;
    return porFiltro.filter((l) => {
      const campos = [
        l.numeroCheque, l.fornecedorNome, l.aba, l.contaCorrenteRaw, l.status,
        l.valor != null ? formatBRL(Number(l.valor)) : "", l.valor != null ? String(l.valor) : "",
        l.dataVencimento ? fmtData(l.dataVencimento) : "",
      ].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return campos.includes(q);
    });
  }, [preview, previewFiltro, previewBusca]);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setArquivoBase64(b64);
      setArquivoNome(file.name);
      setPreview(null);
    } catch {
      toast({ title: "Erro", description: "Não consegui ler o arquivo.", variant: "destructive" });
    }
  }

  async function rodarPreview() {
    if (!arquivoBase64) { toast({ title: "Selecione a planilha .xlsx primeiro." }); return; }
    const tk = iniciarProgresso("Analisando planilha…");
    try {
      const rep = await previewMut.mutateAsync({ companyId, fileBase64: arquivoBase64 });
      setPreview(rep);
      setPreviewFiltro("todos"); setPreviewBusca("");
      finalizarProgresso(tk, true);
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao analisar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImport() {
    if (!arquivoBase64) return;
    const tk = iniciarProgresso("Gravando cheques…");
    try {
      const r = await confirmarMut.mutateAsync({
        companyId, fileBase64: arquivoBase64, origemArquivo: arquivoNome,
      });
      finalizarProgresso(tk, true);
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setArquivoBase64(null); setArquivoNome(""); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao gravar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // ── Lançamento manual (Rev. 3329) ──
  function abrirManual() {
    setManualForm({ ...manualVazio });
    setFavorecidoManual(false);
    setManualOpen(true);
  }
  // Ao escolher uma conta cadastrada, autopreenche banco/agência/conta (Rev. 3335).
  function selecionarContaEmitente(id: string) {
    const c = (Array.isArray(bankAccounts) ? bankAccounts : []).find((b: any) => String(b.id) === id);
    if (!c) return;
    setManualForm((f) => ({
      ...f,
      contaBancariaId: c.id,
      bancoNome: String(c.descricao || c.banco || "").trim(),
      bancoCodigo: String(c.codigoBanco || "").trim(),
      agencia: String(c.agencia || "").trim(),
      contaCorrenteRaw: String(c.conta || "").trim(),
    }));
  }
  // Ao escolher um fornecedor cadastrado, fixa nome + id (vínculo) (Rev. 3335).
  function selecionarFavorecido(id: string) {
    const opt = fornecedorOpts.find((o) => o.value === id);
    setManualForm((f) => ({ ...f, fornecedorId: Number(id), fornecedorNome: opt?.label || f.fornecedorNome }));
  }
  async function salvarManual() {
    const valor = parseMaskBRL(manualForm.valor);
    if (!valor || valor <= 0) {
      toast({ title: "Informe o valor", description: "Digite um valor maior que zero para o cheque.", variant: "destructive" });
      return;
    }
    try {
      const r = await criarManualMut.mutateAsync({
        companyId,
        numeroCheque: manualForm.numeroCheque.trim() || null,
        valor,
        fornecedorNome: manualForm.fornecedorNome.trim() || null,
        fornecedorId: manualForm.fornecedorId ?? null,
        bancoNome: manualForm.bancoNome.trim() || null,
        bancoCodigo: manualForm.bancoCodigo.trim() || null,
        agencia: manualForm.agencia.trim() || null,
        contaCorrenteRaw: manualForm.contaCorrenteRaw.trim() || null,
        contaBancariaId: manualForm.contaBancariaId ?? null,
        dataVencimento: manualForm.dataVencimento || null,
        dataCompensacao: manualForm.dataCompensacao || null,
        status: manualForm.status,
        parcela: manualForm.parcela.trim() || null,
        nf: manualForm.nf.trim() || null,
        observacao: manualForm.observacao.trim() || null,
      });
      setManualOpen(false);
      // Reposiciona a régua/filtro no mês/ano do cheque recém-lançado p/ ele aparecer.
      if (r?.ano) setAno(r.ano);
      if (r?.mes) setMesSel(r.mes);
      await Promise.all([
        utils?.cheques?.listar?.invalidate?.(),
        utils?.cheques?.resumo?.invalidate?.(),
        utils?.cheques?.resumoMensal?.invalidate?.(),
      ]);
      toast({ title: "Cheque lançado", description: `Cheque ${manualForm.numeroCheque.trim() ? "nº " + manualForm.numeroCheque.trim() + " " : ""}cadastrado no controle.` });
    } catch (err: any) {
      toast({ title: "Não foi possível lançar o cheque", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // ── PDFs (IA) ──
  async function onPickPdfs(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const lidos = await Promise.all(files.map(async (f) => ({
        name: f.name, base64: await fileToBase64(f),
        mimeType: f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      })));
      // Acumula (permite escolher mais arquivos em cliques sucessivos), evitando dup por nome.
      setPdfFiles((prev) => {
        const map = new Map(prev.map((p) => [p.name, p]));
        for (const l of lidos) map.set(l.name, l);
        return Array.from(map.values());
      });
      setPreview(null); setPdfRows([]);
    } catch {
      toast({ title: "Erro", description: "Não consegui ler um dos arquivos.", variant: "destructive" });
    }
    if (pdfRef.current) pdfRef.current.value = "";
  }

  function removerPdf(name: string) {
    setPdfFiles((prev) => prev.filter((p) => p.name !== name));
    setPreview(null); setPdfRows([]);
  }

  async function rodarPreviewPdf() {
    if (!pdfFiles.length) { toast({ title: "Selecione ao menos um PDF/imagem de cheque." }); return; }
    const tk = iniciarProgresso(`Lendo arquivo 1/${pdfFiles.length}…`);
    try {
      const todas: any[] = [];
      for (let i = 0; i < pdfFiles.length; i++) {
        setProgLabel(`Lendo arquivo ${i + 1}/${pdfFiles.length}…`);
        const f = pdfFiles[i];
        const r = await lerPdfMut.mutateAsync({ companyId, fileBase64: f.base64, mimeType: f.mimeType, fileName: f.name });
        if (Array.isArray(r?.rows)) todas.push(...r.rows);
      }
      setProgLabel("Montando prévia…");
      const rep = await pdfPreviewMut.mutateAsync({ companyId, rows: todas });
      setPdfRows(todas);
      setPreview(rep);
      setPreviewFiltro("todos"); setPreviewBusca("");
      finalizarProgresso(tk, true);
      if (todas.length === 0) toast({ title: "Nenhum cheque lido", description: "A IA não encontrou cheques nos arquivos enviados.", variant: "destructive" });
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao ler por IA", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImportPdf() {
    if (!pdfRows.length) return;
    const tk = iniciarProgresso("Gravando cheques…");
    try {
      const nomes = pdfFiles.map((p) => p.name).join(", ").slice(0, 200);
      const r = await pdfConfirmarMut.mutateAsync({ companyId, rows: pdfRows, origemArquivo: nomes || "PDFs (IA)" });
      finalizarProgresso(tk, true);
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setPdfFiles([]); setPdfRows([]); setPreview(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao gravar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // Dispara a análise conforme o modo ativo (planilha ou PDFs por IA).
  const analisando = previewMut.isPending || lerPdfMut.isPending || pdfPreviewMut.isPending;
  const gravando = confirmarMut.isPending || pdfConfirmarMut.isPending;
  function analisarAtual() { return importMode === "pdf" ? rodarPreviewPdf() : rodarPreview(); }
  function confirmarAtual() { return importMode === "pdf" ? confirmarImportPdf() : confirmarImport(); }
  function trocarModo(m: "xlsx" | "pdf") {
    if (m === importMode) return;
    setImportMode(m);
    setPreview(null); setPreviewFiltro("todos"); setPreviewBusca("");
    setArquivoBase64(null); setArquivoNome("");
    setPdfFiles([]); setPdfRows([]);
    if (fileRef.current) fileRef.current.value = "";
    if (pdfRef.current) pdfRef.current.value = "";
  }

  // Rev. 4141 — selecionar conta bancária no dialog de edição (auto-preenche banco/agência/conta)
  function selecionarContaEdit(val: string) {
    const acc = (Array.isArray(bankAccounts) ? bankAccounts : []).find((b: any) => String(b.id) === val);
    if (!acc) { setEditItem((e: any) => e ? { ...e, contaBancariaId: null } : e); return; }
    setEditItem((e: any) => e ? {
      ...e, contaBancariaId: acc.id,
      bancoNome: acc.banco || e.bancoNome || "",
      agencia: acc.agencia || e.agencia || "",
      contaCorrenteRaw: acc.conta || e.contaCorrenteRaw || "",
    } : e);
  }

  async function salvarEdicao() {
    if (!editItem) return;
    try {
      const valor = parseMaskBRL(editValorStr);
      await atualizarMut.mutateAsync({
        id: editItem.id, companyId,
        status: editItem.status,
        fornecedorNome: editItem.fornecedorNome ?? "",
        fornecedorId: editItem.fornecedorId ?? null,
        contaBancariaId: editItem.contaBancariaId ?? null,
        observacao: editItem.observacao ?? "",
        dataVencimento: editItem.dataVencimento ? String(editItem.dataVencimento).slice(0, 10) : null,
        dataCompensacao: editItem.dataCompensacao ? String(editItem.dataCompensacao).slice(0, 10) : null,
        numeroCheque: editItem.numeroCheque ?? null,
        bancoNome: editItem.bancoNome ?? null,
        agencia: editItem.agencia ?? null,
        contaCorrenteRaw: editItem.contaCorrenteRaw ?? null,
        nf: editItem.nf ?? null,
        ...(valor > 0 ? { valor } : {}),
      });
      toast({ title: "Cheque atualizado." });
      setEditItem(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Falha ao salvar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarExclusao() {
    if (!excluirItem) return;
    try {
      await excluirMut.mutateAsync({ id: excluirItem.id, companyId });
      toast({ title: "Cheque excluído." });
      setExcluirItem(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Falha ao excluir", description: err?.message || String(err), variant: "destructive" });
    }
  }

  function fecharLimpar() {
    setLimparEscopo(null);
    setLimparEtapa(1);
    setLimparSenha("");
  }

  async function executarLimpeza() {
    if (!limparEscopo) return;
    try {
      const r = await limparMut.mutateAsync({
        companyId, ano,
        mes: limparEscopo === "mes" ? (mesSel ?? undefined) : undefined,
        password: limparSenha,
      });
      toast({ title: "Cadastro limpo", description: `${r.removidos} cheque(s) removido(s) do controle.` });
      fecharLimpar();
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Não foi possível limpar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Cabeçalho ── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Banknote className="h-6 w-6 text-blue-700" /> Controle de Cheques
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {activeTab === 'emitidos'
                  ? "Cheques emitidos para fornecedores — acompanhe compensações e confira com o extrato."
                  : "Cheques de terceiros recebidos — disponíveis para alocação em pagamentos."}
              </p>
            </div>
            {activeTab === 'emitidos' && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConferirOpen(true)}
                  className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <ShieldCheck className="h-4 w-4" /> Conferir c/ extrato
                </Button>
                <Button size="sm" variant="outline" onClick={abrirManual}
                  className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                  <Banknote className="h-4 w-4" /> Lançar cheque
                </Button>
                <Button size="sm" onClick={() => setImportOpen(true)}
                  className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Upload className="h-4 w-4" /> Importar planilha
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setLimparEtapa(1); setLimparSenha(""); setLimparEscopo(mesSel != null ? "mes" : "ano"); }}
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> {mesSel != null ? "Limpar mês" : "Limpar ano"}
                </Button>
              </div>
            )}
          </div>
          {/* ── Seletor de aba ── */}
          <div className="flex border-b">
            <button
              type="button"
              onClick={() => setActiveTab('emitidos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'emitidos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Emitidos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recebidos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'recebidos' ? 'border-green-600 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Recebidos
            </button>
          </div>
        </div>

        {activeTab === 'recebidos' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <FinanceiroChequesRecebidos standalone={false} />
          </Suspense>
        )}

        {activeTab === 'emitidos' && (<>

        {/* ── Alerta de divergência ── */}
        {verif && verif.divergencias > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-2.5 text-sm text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <div>
                <strong>{verif.divergencias} divergência(s) entre o controle e o extrato.</strong>{" "}
                O banco compensou cheque(s) que aqui constam como devolvido/sustado/pendente. Confira manualmente.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDivergOpen(true)} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100">
              <Search className="h-4 w-4" /> Analisar
            </Button>
          </div>
        )}

        {/* ── 4 Cards de status (clicáveis) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Pendentes */}
          <button type="button" onClick={() => toggleStatus("pendente")} aria-pressed={fStatus === "pendente"}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 ${fStatus === "pendente" ? "ring-2 ring-amber-500 border-amber-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Pendentes</span>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{cardTotais.map["pendente"]?.qtd || 0}</div>
            <div className="text-sm font-medium text-muted-foreground mt-0.5">{formatBRL(cardTotais.map["pendente"]?.total || 0)}</div>
          </button>

          {/* Compensados */}
          <button type="button" onClick={() => toggleStatus("compensado")} aria-pressed={fStatus === "compensado"}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-300 ${fStatus === "compensado" ? "ring-2 ring-green-500 border-green-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Compensados</span>
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-700">{cardTotais.map["compensado"]?.qtd || 0}</div>
            <div className="text-sm font-medium text-muted-foreground mt-0.5">{formatBRL(cardTotais.map["compensado"]?.total || 0)}</div>
          </button>

          {/* Devolvidos */}
          <button type="button" onClick={() => toggleStatus("devolvido")} aria-pressed={fStatus === "devolvido"}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-orange-300 ${fStatus === "devolvido" ? "ring-2 ring-orange-500 border-orange-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Devolvidos</span>
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            </div>
            <div className="text-2xl font-bold text-orange-600">{cardTotais.map["devolvido"]?.qtd || 0}</div>
            <div className="text-sm font-medium text-muted-foreground mt-0.5">{formatBRL(cardTotais.map["devolvido"]?.total || 0)}</div>
          </button>

          {/* Outros (sustado/cancelado/indefinido) */}
          <button type="button" onClick={() => toggleStatus("outros")} aria-pressed={fStatus === "outros"}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gray-300 ${fStatus === "outros" ? "ring-2 ring-gray-500 border-gray-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Outros</span>
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-600">
              {(cardTotais.map["sustado"]?.qtd || 0) + (cardTotais.map["cancelado"]?.qtd || 0) + (cardTotais.map["indefinido"]?.qtd || 0)}
            </div>
            <div className="text-sm font-medium text-muted-foreground mt-0.5">sustado · cancelado</div>
          </button>
        </div>

        {/* ── Filtros + navegação de período ── */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            {/* Linha 1: busca + status + conferência */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Buscar nº, fornecedor, valor…" />
                </div>
              </div>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
                  <SelectItem value="outros">Outros (sustado/cancelado/devolvido)</SelectItem>
                  <SelectItem value="conferido">✓ Conferidos no extrato</SelectItem>
                  <SelectItem value="confere">Confere — falta marcar</SelectItem>
                  <SelectItem value="divergente">⚠ Divergências</SelectItem>
                </SelectContent>
              </Select>
              {/* Filtro por fornecedor com busca — Rev. 4256 */}
              <div className="min-w-[220px] flex-1">
                <SearchableSelect
                  options={[
                    { value: "", label: "Todos os fornecedores" },
                    ...fornecedorFiltroOpts,
                  ]}
                  value={fFornecedor}
                  onValueChange={(v) => setFFornecedor(v)}
                  placeholder="Todos os fornecedores"
                  searchPlaceholder="Digitar para filtrar…"
                  emptyMessage="Nenhum fornecedor encontrado."
                  className="w-full"
                />
              </div>
            </div>

            {/* Linha 2: filtro por data de vencimento — Rev. 4256 */}
            <div className="flex flex-wrap items-end gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Vencimento de</Label>
                <Input
                  type="date"
                  className="h-8 w-[150px] text-xs"
                  value={fVencDe}
                  onChange={(e) => setFVencDe(e.target.value)}
                  max={fVencAte || undefined}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">até</Label>
                <Input
                  type="date"
                  className="h-8 w-[150px] text-xs"
                  value={fVencAte}
                  onChange={(e) => setFVencAte(e.target.value)}
                  min={fVencDe || undefined}
                />
              </div>
              {vencFiltroAtivo && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600"
                  onClick={() => { setFVencDe(""); setFVencAte(""); }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar datas
                </Button>
              )}
            </div>

            {/* Linha 3: navegação ano + pills mês com bolinhas */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-base font-bold min-w-[3.5rem] text-center">{ano}</span>
                  <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <Button type="button" variant={mesSel == null ? "default" : "outline"} size="sm"
                    className="h-7 text-xs ml-1" onClick={() => setMesSel(null)}>
                    Todos
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES.slice(1).map((m, i) => {
                  const num = i + 1;
                  const st = mesesStatus[num];
                  const isSel = mesSel === num;
                  return (
                    <button key={m} type="button" onClick={() => setMesSel(num)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                        ${isSel ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span>{m}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${st === "consolidado" ? "bg-green-500" : st === "lancamento" ? "bg-blue-500" : "bg-gray-300"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                Cheques ({chequesFiltrados.length})
                {fStatus !== "todos" && (
                  <button
                    type="button"
                    onClick={() => setFStatus("todos")}
                    className="text-[11px] font-normal text-blue-600 hover:underline"
                  >
                    filtrando por “{({ conferido: "Conferidos no extrato", confere: "Confere — falta marcar", divergente: "Divergências", outros: "Outros" } as Record<string, string>)[fStatus] || fStatus}” · limpar
                  </button>
                )}
              </CardTitle>
              {/* Rev. 4256 — somatório do período de vencimento filtrado */}
              {vencSomatorio && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-1.5 text-blue-800">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span className="font-medium">
                      {fVencDe && fVencAte
                        ? `Vencimento: ${fmtData(fVencDe + "T00:00:00")} → ${fmtData(fVencAte + "T00:00:00")}`
                        : fVencDe
                        ? `Vencimento a partir de ${fmtData(fVencDe + "T00:00:00")}`
                        : `Vencimento até ${fmtData(fVencAte + "T00:00:00")}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 border-l border-blue-200 pl-4">
                    <div className="text-center">
                      <div className="text-[11px] text-blue-600 font-medium uppercase tracking-wide">Total geral</div>
                      <div className="text-base font-bold text-blue-900 tabular-nums">{formatBRL(vencSomatorio.total)}</div>
                      <div className="text-[11px] text-blue-600">{vencSomatorio.qtd} cheque(s)</div>
                    </div>
                    {vencSomatorio.qtdPendentes > 0 && (
                      <div className="text-center border-l border-blue-200 pl-3">
                        <div className="text-[11px] text-amber-600 font-medium uppercase tracking-wide">Pendentes</div>
                        <div className="text-base font-bold text-amber-700 tabular-nums">{formatBRL(vencSomatorio.totalPendentes)}</div>
                        <div className="text-[11px] text-amber-600">{vencSomatorio.qtdPendentes} cheque(s)</div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFVencDe(""); setFVencAte(""); }}
                    className="ml-auto text-[11px] text-blue-500 hover:text-red-600 hover:underline"
                  >
                    limpar
                  </button>
                </div>
              )}
            </div>
            {/* Legenda de status — p/ rastreio de cada cheque */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">Legenda:</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Compensado</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pendente</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Devolvido</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Sustado</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Cancelado / Indefinido</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><Link2 className="h-3 w-3" /> Conciliado no extrato</span>
              <span className="inline-flex items-center gap-1.5 text-red-700"><AlertTriangle className="h-3 w-3" /> Divergência (banco compensou, controle não)</span>
            </div>
            {/* Rev. 3245 — barra de ação em lote (aparece com ≥1 cheque selecionado). */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="text-sm font-medium text-blue-800">
                  {selectedIds.size} cheque(s) selecionado(s)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700">Alterar status para:</span>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="h-8 w-[170px] bg-white"><SelectValue placeholder="Escolha o status" /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
                      {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 bg-blue-600 hover:bg-blue-700"
                    disabled={!bulkStatus || bulkStatusMut.isPending}
                    onClick={() => setBulkOpen(true)}
                  >
                    {bulkStatusMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Aplicar
                  </Button>
                </div>
                <button type="button" onClick={limparSelecao} className="text-xs text-blue-700 hover:underline">
                  Limpar seleção
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            ) : chequesFiltrados.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                {fStatus !== "todos"
                  ? <>Nenhum cheque com o filtro selecionado. <button type="button" onClick={() => setFStatus("todos")} className="text-blue-600 hover:underline">Limpar filtro</button>.</>
                  : <>Nenhum cheque encontrado. Use <strong>Importar planilha</strong> para começar.</>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-3 w-8">
                        <Checkbox
                          checked={allSelecionados ? true : someSelecionados ? "indeterminate" : false}
                          onCheckedChange={toggleSelAll}
                          aria-label="Selecionar todos"
                        />
                      </th>
                      <th className="py-2 pr-3">Nº Cheque</th>
                      <th className="py-2 pr-3">Fornecedor</th>
                      <th className="py-2 pr-3">Banco</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                      <th className="py-2 pr-3 whitespace-nowrap">Vencimento</th>
                      <th className="py-2 pr-3 whitespace-nowrap">Dias p/ compensar</th>
                      {mesSel == null && <th className="py-2 pr-3">Mês</th>}
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chequesFiltrados.map((c) => (
                      <tr key={c.id} className={`border-b hover:bg-muted/40 ${selectedIds.has(c.id) ? "bg-blue-50/60" : ""}`}>
                        <td className="py-2 pr-3">
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSel(c.id)}
                            aria-label={`Selecionar cheque ${c.numeroCheque || c.id}`}
                          />
                        </td>
                        <td className="py-2 pr-3 font-mono">{c.numeroCheque || "—"}</td>
                        <td className="py-2 pr-3">
                          {c.fornecedorNome || <span className="text-muted-foreground">—</span>}
                          {!c.fornecedorId && c.fornecedorNome && (
                            <span className="ml-1 text-[10px] text-amber-600" title="Fornecedor não vinculado ao cadastro">●</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs">{c.bancoNome || "—"}</td>
                        <td className="py-2 pr-3 text-right font-medium">{c.valor != null ? formatBRL(Number(c.valor)) : "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtData(c.dataVencimento)}</td>
                        <td className="py-2 pr-3">{compensaCell(c)}</td>
                        {mesSel == null && <td className="py-2 pr-3 whitespace-nowrap">{c.mes ? `${MESES[c.mes]}/${c.ano}` : c.ano}</td>}
                        <td className="py-2 pr-3">
                          <div className="flex flex-col gap-1">
                            {statusBadge(c.status)}
                            {/* Rev. 4081 — detalhamento de como o cheque foi pago (multi-forma/multi-conta). */}
                            {c.status === "compensado_pix" && c.numeroCheque && companyId ? (
                              <ChequeVinculosBreakdown companyId={Number(companyId)} numeroCheque={String(c.numeroCheque)} />
                            ) : null}
                            {/* Rev. 3242 — TAG de conferência com o extrato como pílula (análise diária). */}
                            {c.conciliado ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title={`Conciliado no extrato${c.dataConciliacao ? " em " + fmtData(c.dataConciliacao) : ""}`}>
                                <Link2 className="h-3 w-3" /> Conciliado no extrato{c.dataConciliacao ? ` · ${fmtData(c.dataConciliacao)}` : ""}
                              </span>
                            ) : null}
                            {/* Rev. 3234 — dupla checagem extrato↔controle */}
                            {/* Rev. 3235 — cheque DEVOLVIDO no extrato (tentativa frustrada): tem precedência. */}
                            {c.extratoDevolvido ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title={`O banco DEVOLVEU este cheque no extrato${c.extratoMotivoCodigo ? ` (motivo ${c.extratoMotivoCodigo}${c.extratoMotivoTexto ? " — " + c.extratoMotivoTexto : ""})` : ""}. A compensação não se concretizou — analise a quitação na Conciliação Bancária.`}>
                                <RotateCcw className="h-3 w-3" /> Devolvido no banco{c.extratoMotivoCodigo ? ` · mot. ${c.extratoMotivoCodigo}` : ""}
                              </span>
                            ) : c.extratoDivergente ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700" title={`O banco compensou este cheque${c.extratoData ? " em " + fmtData(c.extratoData) : ""}, mas no controle está como "${c.status}". Analise.`}>
                                <AlertTriangle className="h-3 w-3" /> Banco compensou — analisar{c.extratoData ? ` · ${fmtData(c.extratoData)}` : ""}
                              </span>
                            ) : c.extratoConfirmado && !c.conciliado ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700" title={`Confere com o extrato${c.extratoData ? " (compensado em " + fmtData(c.extratoData) + ")" : ""}. Use "Conferir com o extrato" para marcar.`}>
                                <CheckCircle className="h-3 w-3" /> Confere com o extrato
                              </span>
                            ) : null}
                            {(c.status === "devolvido" || c.status === "sustado" || c.status === "cancelado") && c.observacao ? (
                              <span className="text-[10px] text-orange-700 max-w-[220px] truncate" title={c.observacao}>Motivo: {c.observacao}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem({ ...c })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setExcluirItem(c)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </>)}
      </div>

      {/* ── Dupla checagem (Rev. 3234): confirmar a conferência com o extrato ── */}
      <AlertDialog open={conferirOpen} onOpenChange={setConferirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Conferir cheques com o extrato
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  O ERP cruza os cheques de <strong>{mesSel != null ? `${MESES[mesSel]}/${ano}` : `${ano} (ano todo)`}</strong> com o
                  extrato bancário importado e marca como <strong>conferidos</strong> apenas os que o banco compensou
                  <strong> e</strong> que aqui já constam como <strong>compensado</strong>. Nada é baixado financeiramente.
                </p>
                {verif ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-2.5">
                      <div className="text-xs text-emerald-700">Serão marcados agora</div>
                      <div className="text-lg font-bold text-emerald-700">{verif.aConferir}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="text-xs text-muted-foreground">Já conferidos</div>
                      <div className="text-lg font-bold">{verif.jaConferidos}</div>
                    </div>
                    <div className="rounded-lg border bg-red-50 border-red-200 p-2.5">
                      <div className="text-xs text-red-700">Divergências (não serão alteradas)</div>
                      <div className="text-lg font-bold text-red-700">{verif.divergencias}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="text-xs text-muted-foreground">Sem correspondência no extrato</div>
                      <div className="text-lg font-bold">{verif.naoEncontrados}</div>
                    </div>
                  </div>
                ) : null}
                {verif && verif.divergencias > 0 ? (
                  <p className="text-red-700">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    As <strong>{verif.divergencias} divergência(s)</strong> (banco compensou, mas o controle diz
                    devolvido/sustado/pendente) <strong>NÃO</strong> serão alteradas — o status é mantido para você analisar.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={conferirMut.isLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); conferirComExtrato(); }}
              disabled={conferirMut.isLoading || !verif || verif.aConferir === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {conferirMut.isLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Conferindo…</> : <>Marcar {verif?.aConferir ?? 0} como conferido(s)</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dupla checagem (Rev. 3234): lista de divergências p/ análise ── */}
      <Dialog open={divergOpen} onOpenChange={setDivergOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Divergências entre o controle e o extrato
            </DialogTitle>
            <DialogDescription>
              O banco compensou estes cheques, mas no controle eles constam como devolvido/sustado/pendente/etc.
              O ERP <strong>não corrige o status automaticamente</strong> — revise cada caso e ajuste manualmente se for o caso.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {verif && verif.divergenciasLista && verif.divergenciasLista.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Nº Cheque</th>
                    <th className="py-2 pr-3">Fornecedor</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3">Status no controle</th>
                    <th className="py-2 pr-3">Compensado no extrato</th>
                    <th className="py-2 pr-3">Mês</th>
                  </tr>
                </thead>
                <tbody>
                  {verif.divergenciasLista.map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3 font-mono">{d.numeroCheque || "—"}</td>
                      <td className="py-2 pr-3">{d.fornecedorNome || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatBRL(d.valor)}</td>
                      <td className="py-2 pr-3">{statusBadge(d.status)}</td>
                      <td className="py-2 pr-3 text-red-700">{fmtData(d.dataExtrato)}</td>
                      <td className="py-2 pr-3">{d.mes ? `${MESES[d.mes]}/${d.ano}` : d.ano}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-muted-foreground py-8">Nenhuma divergência no período.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDivergOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de importação */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setPreview(null); setDragOver(false); } }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0 gap-0">
          {/* Cabeçalho com faixa */}
          <div className="flex items-start gap-3 p-5 border-b bg-gradient-to-r from-blue-50 to-transparent shrink-0">
            <div className="rounded-xl bg-blue-600 text-white p-2.5 shadow-sm shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Importar Controle de Cheques</DialogTitle>
              <DialogDescription className="mt-0.5">
                {importMode === "pdf"
                  ? <>Selecione <strong>vários PDFs ou fotos</strong> de cheque — a IA lê cada um e o mês/ano é derivado da <strong>data do cheque</strong>. Nada é gravado até você confirmar.</>
                  : <>Arraste ou selecione a planilha <strong>.xlsx</strong>. O ano é lido automaticamente de cada cheque — nada é gravado até você confirmar.</>}
              </DialogDescription>
            </div>
          </div>

          {/* Seletor de modo: planilha mensal × PDFs lidos por IA */}
          <div className="flex gap-2 px-5 pt-3 shrink-0">
            <button type="button" onClick={() => trocarModo("xlsx")}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${importMode === "xlsx" ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-300" : "bg-card hover:bg-muted text-muted-foreground"}`}>
              <FileSpreadsheet className="h-4 w-4" /> Planilha (.xlsx)
            </button>
            <button type="button" onClick={() => trocarModo("pdf")}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${importMode === "pdf" ? "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-300" : "bg-card hover:bg-muted text-muted-foreground"}`}>
              <Sparkles className="h-4 w-4" /> Cheques em PDF / foto (IA)
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Coluna esquerda: upload + ação */}
              <div className="space-y-4">
                {importMode === "xlsx" ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault(); setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) onPickFile({ target: { files: [f] } } as any);
                    }}
                    className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-16 text-center transition-colors cursor-pointer ${
                      dragOver ? "border-blue-500 bg-blue-50" : arquivoNome ? "border-emerald-300 bg-emerald-50/60" : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/40"
                    }`}
                  >
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} className="hidden" />
                    {arquivoNome ? (
                      <>
                        <div className="rounded-full bg-emerald-100 text-emerald-700 p-3"><CheckCircle className="h-8 w-8" /></div>
                        <div className="font-medium text-base break-all">{arquivoNome}</div>
                        <div className="text-sm text-muted-foreground">Clique para trocar o arquivo</div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-full bg-blue-100 text-blue-700 p-3"><Upload className="h-8 w-8" /></div>
                        <div className="font-medium text-base">Arraste a planilha aqui ou clique para selecionar</div>
                        <div className="text-sm text-muted-foreground">Formato .xlsx com abas mensais (JAN…DEZ)</div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => pdfRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pdfRef.current?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const fs = Array.from(e.dataTransfer.files || []);
                        if (fs.length) onPickPdfs({ target: { files: fs } } as any);
                      }}
                      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors cursor-pointer ${
                        dragOver ? "border-violet-500 bg-violet-50" : pdfFiles.length ? "border-violet-300 bg-violet-50/60" : "border-muted-foreground/25 hover:border-violet-400 hover:bg-muted/40"
                      }`}
                    >
                      <input ref={pdfRef} type="file" accept=".pdf,image/*" multiple onChange={onPickPdfs} className="hidden" />
                      <div className="rounded-full bg-violet-100 text-violet-700 p-3"><FileText className="h-8 w-8" /></div>
                      <div className="font-medium text-base">
                        {pdfFiles.length ? `${pdfFiles.length} arquivo(s) selecionado(s) — clique para adicionar mais` : "Arraste vários PDFs/fotos aqui ou clique para selecionar"}
                      </div>
                      <div className="text-sm text-muted-foreground">PDF ou imagem (JPG/PNG) — um ou vários cheques por arquivo</div>
                    </div>

                    {pdfFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-auto rounded-lg border p-2">
                        {pdfFiles.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 text-sm">
                            <FileText className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                            <span className="truncate flex-1" title={f.name}>{f.name}</span>
                            <button type="button" onClick={() => removerPdf(f.name)} className="text-muted-foreground hover:text-red-600 shrink-0" title="Remover">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <Button onClick={analisarAtual} disabled={(importMode === "pdf" ? pdfFiles.length === 0 : !arquivoBase64) || analisando} className="w-full gap-2" size="lg">
                  {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : (importMode === "pdf" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />)}
                  {analisando ? "Analisando…" : (importMode === "pdf" ? "Ler cheques por IA" : "Analisar planilha")}
                </Button>

                {(analisando || (progresso > 0 && (progLabel.startsWith("Analisando") || progLabel.startsWith("Lendo") || progLabel.startsWith("Montando")))) && (
                  <div className="space-y-1.5">
                    <Progress value={progresso} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progLabel || "Analisando…"}</span>
                      <span className="font-semibold tabular-nums">{Math.round(progresso)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Coluna direita: resumo / KPIs */}
              <div className="space-y-4">
                {!preview ? (
                  <div className="rounded-xl border border-dashed border-muted-foreground/25 p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2 min-h-[280px]">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <div className="font-medium">O resumo aparece aqui</div>
                    <div>Selecione a planilha e clique em <strong>Analisar planilha</strong> para ver linhas lidas, novos, duplicados e a lista completa dos cheques.</div>
                  </div>
                ) : (
                  <>
                    {/* KPIs em destaque — clicáveis: cada card filtra a tabela abaixo. */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <button type="button" onClick={() => setPreviewFiltro("todos")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "todos" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Linhas lidas</div>
                        <div className="text-2xl font-bold">{preview.resumo.totalLinhas}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("novos")}
                        className={`text-left rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 transition hover:ring-2 hover:ring-emerald-300 ${previewFiltro === "novos" ? "ring-2 ring-emerald-500" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">Novos</div>
                        <div className="text-2xl font-bold text-emerald-700">{preview.resumo.novos}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("jaExistem")}
                        className={`text-left rounded-lg border border-amber-200 bg-amber-50 p-3.5 transition hover:ring-2 hover:ring-amber-300 ${previewFiltro === "jaExistem" ? "ring-2 ring-amber-500" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-amber-700/70">Já existem</div>
                        <div className="text-2xl font-bold text-amber-700">{preview.resumo.jaExistem}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("dup")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "dup" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dup. no arquivo</div>
                        <div className="text-2xl font-bold">{preview.resumo.dupNoArquivo}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semFornecedor")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semFornecedor" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem fornecedor</div>
                        <div className="text-2xl font-bold">{preview.resumo.semFornecedor}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semConta")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semConta" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem conta</div>
                        <div className="text-2xl font-bold">{preview.resumo.semConta ?? 0}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semValor")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semValor" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem valor</div>
                        <div className="text-2xl font-bold">{preview.resumo.semValor ?? 0}</div>
                      </button>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-blue-700/70">Valor (novos)</div>
                        <div className="text-lg font-bold text-blue-700">{formatBRL(preview.resumo.valorTotalNovos)}</div>
                      </div>
                    </div>

                    {preview.abasLidas?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-muted-foreground">Abas detectadas:</span>
                        {preview.abasLidas.map((a: string, i: number) => (
                          <span key={i} className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5">{a}</span>
                        ))}
                      </div>
                    )}
                    {preview.abasIgnoradas?.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                        <div className="flex items-center gap-1 font-medium text-amber-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Abas ignoradas (não importadas): {preview.abasIgnoradas.length}
                        </div>
                        <ul className="ml-1 space-y-0.5">
                          {preview.abasIgnoradas.map((a: any, i: number) => (
                            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="font-medium text-foreground">{typeof a === "string" ? a : a.nome}</span>
                              {typeof a !== "string" && (
                                <>
                                  <span>— {a.motivo}</span>
                                  {a.linhas > 0 && (
                                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                                      {a.linhas} linha(s) com cara de cheque ficaram de fora
                                    </span>
                                  )}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="ml-1 text-[11px] text-muted-foreground">
                          Só abas nomeadas por mês (JAN, FEV, …) são lidas. Se uma aba acima contém cheques a cadastrar, renomeie-a para o mês correspondente e reimporte.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Cheques lidos — tabela COMPLETA, filtrável e pesquisável p/ validar cada item */}
            {(preview?.linhas?.length > 0 || preview?.amostra?.length > 0) && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium">Cheques lidos na planilha</div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={previewBusca} onChange={(e) => setPreviewBusca(e.target.value)}
                      placeholder="Buscar nº, fornecedor, aba, valor…" className="pl-8 h-9" />
                  </div>
                </div>

                {/* Chips de filtro (espelham os cards clicáveis) */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {([
                    ["todos", "Todos", preview.resumo.totalLinhas],
                    ["novos", "Novos", preview.resumo.novos],
                    ["jaExistem", "Já existem", preview.resumo.jaExistem],
                    ["dup", "Duplicados", preview.resumo.dupNoArquivo],
                    ["semFornecedor", "Sem fornecedor", preview.resumo.semFornecedor],
                    ["semConta", "Sem conta", preview.resumo.semConta ?? 0],
                    ["semValor", "Sem valor", preview.resumo.semValor ?? 0],
                  ] as [typeof previewFiltro, string, number][]).map(([key, label, count]) => (
                    <button key={key} type="button" onClick={() => setPreviewFiltro(key)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${previewFiltro === key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
                      {label}
                      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${previewFiltro === key ? "bg-primary-foreground/20" : "bg-muted-foreground/10"}`}>{count}</span>
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-muted-foreground mb-1.5">
                  Mostrando {Math.min(previewLinhas.length, 1000)} de {previewLinhas.length} linha(s)
                  {previewLinhas.length > 1000 && " (limitado a 1000 — refine a busca para ver as demais)"}
                </div>

                <div className="border rounded-lg overflow-auto max-h-[46vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur"><tr className="text-left">
                      <th className="p-2.5">Aba / Linha</th>
                      <th className="p-2.5">Nº</th>
                      <th className="p-2.5">Fornecedor</th>
                      <th className="p-2.5">Conta</th>
                      <th className="p-2.5">Vencimento</th>
                      <th className="p-2.5 text-right">Valor</th>
                      <th className="p-2.5">Situação</th>
                    </tr></thead>
                    <tbody>
                      {previewLinhas.length === 0 ? (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma linha para este filtro/busca.</td></tr>
                      ) : previewLinhas.slice(0, 1000).map((a: any, i: number) => (
                        <tr key={i} className="border-t hover:bg-muted/40">
                          <td className="p-2.5 whitespace-nowrap text-xs text-muted-foreground">
                            {a.aba ? <>{a.aba}{a.linhaExcel ? <span className="font-mono"> · L{a.linhaExcel}</span> : null}</> : "—"}
                          </td>
                          <td className="p-2.5 font-mono">{a.numeroCheque || "—"}</td>
                          <td className="p-2.5">
                            {a.fornecedorNome || "—"}
                            {!a.fornecedorIdentificado && <span className="text-amber-600" title="Fornecedor não vinculado"> ●</span>}
                          </td>
                          <td className="p-2.5 text-xs">
                            {a.contaCorrenteRaw || "—"}
                            {!a.contaIdentificada && <span className="text-amber-600" title="Conta não vinculada"> ●</span>}
                          </td>
                          <td className="p-2.5 whitespace-nowrap text-xs">{a.dataVencimento ? fmtData(a.dataVencimento) : "—"}</td>
                          <td className={`p-2.5 text-right ${a.semValor ? "text-red-600 font-medium" : ""}`}>{a.valor != null && a.valor > 0 ? formatBRL(a.valor) : "—"}</td>
                          <td className="p-2.5">
                            {a.situacao === "NOVO"
                              ? <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px]">Novo</span>
                              : a.situacao === "JA_EXISTE"
                                ? <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px]">Já existe</span>
                                : <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px]">Dup.</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {(gravando || (progresso > 0 && progLabel === "Gravando cheques…")) && (
            <div className="px-5 pt-3 space-y-1.5 border-t shrink-0">
              <Progress value={progresso} className="h-2.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progLabel || "Gravando cheques…"}</span>
                <span className="font-semibold tabular-nums">{Math.round(progresso)}%</span>
              </div>
            </div>
          )}

          <DialogFooter className="p-5 border-t shrink-0">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarAtual} disabled={!preview || preview.resumo.novos === 0 || gravando || analisando} className="gap-2">
              {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Gravar {preview ? preview.resumo.novos : 0} novo(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lançamento manual de um cheque — layout moderno (Rev. 3335) */}
      <Dialog open={manualOpen} onOpenChange={(o) => { setManualOpen(o); if (!o) { setManualForm({ ...manualVazio }); setFavorecidoManual(false); } }}>
        <DialogContent resizable={false} className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Cabeçalho navy no padrão FC */}
          <DialogHeader className="shrink-0 bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-4 text-white">
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <Banknote className="h-5 w-5" />
              </span>
              Lançar cheque manualmente
            </DialogTitle>
            <DialogDescription className="text-white/70 text-xs leading-relaxed">
              Busque o <strong className="text-white/90">favorecido</strong> no cadastro de fornecedores e clique na <strong className="text-white/90">conta emitente</strong> para
              preencher banco, agência e conta automaticamente. Apenas o <strong className="text-white/90">valor</strong> é obrigatório.
              Cheques aqui <strong className="text-white/90">não viram lançamento financeiro</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
            {/* Bloco 1 — Valor + nº */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-[#1B2A4A]" />Valor *</Label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R$</span>
                  <Input className="pl-9 tabular-nums text-base font-semibold h-11" inputMode="decimal" placeholder="0,00"
                    value={manualForm.valor}
                    onChange={(e) => setManualForm((f) => ({ ...f, valor: maskBRL(e.target.value) }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-[#1B2A4A]" />Nº do cheque</Label>
                <Input className="mt-1 h-11" value={manualForm.numeroCheque} onChange={(e) => setManualForm((f) => ({ ...f, numeroCheque: e.target.value }))} placeholder="Ex.: 000123" />
              </div>
            </div>

            {/* Bloco 2 — Favorecido (cadastro de fornecedores) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-[#1B2A4A]" />Favorecido</Label>
                <button type="button"
                  onClick={() => { setFavorecidoManual((v) => !v); setManualForm((f) => ({ ...f, fornecedorId: null })); }}
                  className="text-[11px] font-medium text-[#1B2A4A] hover:underline flex items-center gap-1">
                  {favorecidoManual ? (<><Search className="h-3 w-3" />Buscar no cadastro</>) : (<><Keyboard className="h-3 w-3" />Digitar manualmente</>)}
                </button>
              </div>
              {favorecidoManual ? (
                <Input value={manualForm.fornecedorNome}
                  onChange={(e) => setManualForm((f) => ({ ...f, fornecedorNome: e.target.value, fornecedorId: null }))}
                  placeholder="A quem o cheque foi emitido" />
              ) : (
                <SearchableSelect
                  options={fornecedorOpts}
                  value={manualForm.fornecedorId != null ? String(manualForm.fornecedorId) : ""}
                  onValueChange={selecionarFavorecido}
                  placeholder="Consultar fornecedor cadastrado…"
                  searchPlaceholder="Buscar por nome ou CNPJ…"
                  emptyMessage={fornecedorOpts.length === 0 ? "Nenhum fornecedor cadastrado." : "Nenhum resultado."}
                />
              )}
              {!favorecidoManual && manualForm.fornecedorId != null && (
                <p className="mt-1.5 text-[11px] text-green-700 flex items-center gap-1"><CheckCheck className="h-3 w-3" />Vinculado ao cadastro de fornecedores.</p>
              )}
              {!favorecidoManual && (
                <button type="button"
                  onClick={() => window.open("/compras/fornecedores", "_blank", "noopener,noreferrer")}
                  className="mt-2 text-[11px] text-gray-500 hover:text-[#1B2A4A] flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />Cadastrar novo fornecedor
                </button>
              )}
            </div>

            {/* Bloco 3 — Conta emitente (autopreenche banco/agência/conta) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <Label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-[#1B2A4A]" />Conta de onde o cheque foi emitido</Label>
              <SearchableSelect
                options={contaOpts}
                value={manualForm.contaBancariaId != null ? String(manualForm.contaBancariaId) : ""}
                onValueChange={selecionarContaEmitente}
                placeholder="Clique e escolha a conta…"
                searchPlaceholder="Buscar banco / agência / conta…"
                emptyMessage={contaOpts.length === 0 ? "Nenhuma conta bancária cadastrada." : "Nenhum resultado."}
              />
              {manualForm.contaBancariaId != null && (
                <p className="text-[11px] text-green-700 flex items-center gap-1"><CheckCheck className="h-3 w-3" />Banco, agência e conta preenchidos automaticamente — ajuste abaixo se precisar.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <Label className="text-[11px] text-gray-500">Banco</Label>
                  <Input className="mt-1" value={manualForm.bancoNome} onChange={(e) => setManualForm((f) => ({ ...f, bancoNome: e.target.value }))} placeholder="Ex.: Itaú" />
                </div>
                <div>
                  <Label className="text-[11px] text-gray-500">Agência</Label>
                  <Input className="mt-1" value={manualForm.agencia} onChange={(e) => setManualForm((f) => ({ ...f, agencia: e.target.value }))} placeholder="Ex.: 1234" />
                </div>
                <div>
                  <Label className="text-[11px] text-gray-500">Conta corrente</Label>
                  <Input className="mt-1" value={manualForm.contaCorrenteRaw} onChange={(e) => setManualForm((f) => ({ ...f, contaCorrenteRaw: e.target.value }))} placeholder="Ex.: 12345-6" />
                </div>
              </div>
            </div>

            {/* Bloco 4 — Datas + status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#1B2A4A]" />Vencimento</Label>
                <Input className="mt-1" type="date" value={manualForm.dataVencimento} onChange={(e) => setManualForm((f) => ({ ...f, dataVencimento: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#1B2A4A]" />Compensação</Label>
                <Input className="mt-1" type="date" value={manualForm.dataCompensacao} onChange={(e) => setManualForm((f) => ({ ...f, dataCompensacao: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-[#1B2A4A]" />Status</Label>
                <Select value={manualForm.status} onValueChange={(v) => setManualForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
                    {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-gray-600">Observação</Label>
              <Textarea className="mt-1" value={manualForm.observacao} onChange={(e) => setManualForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-gray-50/80 px-6 py-3">
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={criarManualMut.isPending}>Cancelar</Button>
            <Button onClick={salvarManual} disabled={criarManualMut.isPending || !manualForm.valor} className="gap-2 bg-[#1B2A4A] hover:bg-[#2c3f63]">
              {criarManualMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lançar cheque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 4141 — Dialog de edição completa do cheque (layout moderno v2) */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent resizable={false} className="max-w-lg w-[calc(100vw-1rem)] sm:w-auto max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl">

          {/* ── Cabeçalho navy compacto ── */}
          <DialogHeader className="shrink-0 bg-gradient-to-r from-[#1B2A4A] to-[#253757] px-5 pt-5 pb-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Pencil className="h-5 w-5 text-white" />
                </span>
                <div>
                  <DialogTitle className="text-base font-semibold text-white leading-tight">
                    Editar cheque
                  </DialogTitle>
                  <p className="text-[11px] text-white/60 mt-0.5">Todos os campos podem ser corrigidos</p>
                </div>
              </div>
            </div>

            {/* ── Card de valor + nº ── */}
            {editItem && (
              <div className="mt-4 rounded-xl bg-white/10 ring-1 ring-white/15 px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-white/50 uppercase tracking-widest mb-1">Valor</p>
                  <div className="relative">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-sm font-medium text-white/60 pointer-events-none">R$</span>
                    <input
                      className="bg-transparent w-full pl-8 text-2xl font-bold text-white tabular-nums outline-none border-b border-white/25 focus:border-white/60 transition-colors pb-0.5 placeholder:text-white/30"
                      inputMode="decimal" placeholder="0,00"
                      value={editValorStr}
                      onChange={(e) => setEditValorStr(maskBRL(e.target.value))}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium text-white/50 uppercase tracking-widest mb-1">Nº Cheque</p>
                  <input
                    className="bg-transparent w-24 text-base font-semibold text-white tabular-nums outline-none border-b border-white/25 focus:border-white/60 transition-colors pb-0.5 text-right placeholder:text-white/30"
                    value={editItem.numeroCheque ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, numeroCheque: e.target.value })}
                    placeholder="000000"
                  />
                </div>
              </div>
            )}
          </DialogHeader>

          {editItem && (
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-5 bg-white">

              {/* ── Status (pílulas) ── */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: "compensado",  label: "Compensado",  cls: "bg-emerald-50 border-emerald-400 text-emerald-700" },
                    { v: "pendente",    label: "Pendente",    cls: "bg-amber-50  border-amber-400  text-amber-700"  },
                    { v: "sustado",     label: "Sustado",     cls: "bg-orange-50 border-orange-400 text-orange-700" },
                    { v: "cancelado",   label: "Cancelado",   cls: "bg-red-50    border-red-400    text-red-700"    },
                    { v: "devolvido",   label: "Devolvido",   cls: "bg-rose-50   border-rose-400   text-rose-700"   },
                    { v: "indefinido",  label: "Indefinido",  cls: "bg-slate-50  border-slate-400  text-slate-600"  },
                  ] as const).map(({ v, label, cls }) => (
                    <button key={v} type="button"
                      onClick={() => setEditItem({ ...editItem, status: v })}
                      className={cn(
                        "rounded-lg py-2 px-1 text-[11px] font-semibold border-2 transition-all leading-tight",
                        editItem.status === v ? cls : "border-gray-200 text-gray-400 bg-white hover:border-gray-300 hover:text-gray-600"
                      )}>
                      {editItem.status === v && <span className="mr-0.5">✓ </span>}{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Favorecido ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Favorecido</p>
                  <div className="flex-1 h-px bg-gray-100" />
                  <button type="button"
                    onClick={() => { setEditFavorecidoManual((v) => !v); setEditItem((e: any) => e ? { ...e, fornecedorId: null } : e); }}
                    className="text-[10px] font-semibold text-[#1B2A4A]/70 hover:text-[#1B2A4A] flex items-center gap-1 shrink-0">
                    {editFavorecidoManual ? <><Search className="h-3 w-3" />Buscar cadastro</> : <><Keyboard className="h-3 w-3" />Digitar</>}
                  </button>
                </div>
                {editFavorecidoManual ? (
                  <Input className="h-10" value={editItem.fornecedorNome ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, fornecedorNome: e.target.value, fornecedorId: null })}
                    placeholder="Nome do favorecido" />
                ) : (
                  <SearchableSelect
                    options={fornecedorOpts}
                    value={editItem.fornecedorId != null ? String(editItem.fornecedorId) : ""}
                    onValueChange={(val) => {
                      const f = (Array.isArray(fornecedoresList) ? fornecedoresList : []).find((x: any) => String(x.id) === val);
                      setEditItem({ ...editItem, fornecedorId: f ? f.id : null, fornecedorNome: f ? (f.nomeFantasia || f.razaoSocial || "") : editItem.fornecedorNome });
                    }}
                    placeholder="Buscar fornecedor…"
                    searchPlaceholder="Nome ou CNPJ…"
                    emptyMessage={fornecedorOpts.length === 0 ? "Nenhum fornecedor cadastrado." : "Nenhum resultado."}
                  />
                )}
                {!editFavorecidoManual && editItem.fornecedorId != null && (
                  <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1"><CheckCheck className="h-3 w-3" />Vinculado ao cadastro</p>
                )}
              </div>

              {/* ── Conta emitente ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Conta emitente</p>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <SearchableSelect
                  options={contaOpts}
                  value={editItem.contaBancariaId != null ? String(editItem.contaBancariaId) : ""}
                  onValueChange={selecionarContaEdit}
                  placeholder="Selecionar conta bancária…"
                  searchPlaceholder="Banco / agência / conta…"
                  emptyMessage={contaOpts.length === 0 ? "Nenhuma conta com talão." : "Nenhum resultado."}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { label: "Banco", key: "bancoNome", ph: "Santander" },
                    { label: "Agência", key: "agencia", ph: "0000" },
                    { label: "Conta", key: "contaCorrenteRaw", ph: "00000-0" },
                  ].map(({ label, key, ph }) => (
                    <div key={key}>
                      <Label className="text-[10px] text-gray-400 font-medium">{label}</Label>
                      <Input className="mt-0.5 h-8 text-xs" value={(editItem as any)[key] ?? ""}
                        onChange={(e) => setEditItem({ ...editItem, [key]: e.target.value })}
                        placeholder={ph} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Datas ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Datas</p>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="h-3 w-3 text-[#1B2A4A]/50" />Vencimento</Label>
                    <Input className="mt-1 h-10" type="date"
                      value={editItem.dataVencimento ? String(editItem.dataVencimento).slice(0, 10) : ""}
                      onChange={(e) => setEditItem({ ...editItem, dataVencimento: e.target.value || null })} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="h-3 w-3 text-[#1B2A4A]/50" />Compensação</Label>
                    <Input className="mt-1 h-10" type="date"
                      value={editItem.dataCompensacao ? String(editItem.dataCompensacao).slice(0, 10) : ""}
                      onChange={(e) => setEditItem({ ...editItem, dataCompensacao: e.target.value || null })} />
                  </div>
                </div>
              </div>

              {/* ── NF + Observação ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Detalhes adicionais</p>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">NF / Ref.</Label>
                    <Input className="mt-1 h-10" value={editItem.nf ?? ""} onChange={(e) => setEditItem({ ...editItem, nf: e.target.value })} placeholder="12345" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">Observação</Label>
                    <Textarea className="mt-1 resize-none text-sm" rows={2} value={editItem.observacao ?? ""} onChange={(e) => setEditItem({ ...editItem, observacao: e.target.value })} placeholder="Opcional…" />
                  </div>
                </div>
              </div>

              {/* ── Informações de conciliação (read-only) ── */}
              {(editItem.contaBancariaTentativaNome || editItem.motivoDevolucaoTexto || editItem.extratoMotivoTexto) && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conciliação (somente leitura)</p>
                  {editItem.contaBancariaTentativaNome && (
                    <p className="text-xs text-slate-600 break-words">Conta: <span className="font-medium text-slate-800">{editItem.contaBancariaTentativaNome}</span></p>
                  )}
                  {(editItem.motivoDevolucaoTexto || editItem.extratoMotivoTexto) && (
                    <p className="text-xs text-amber-700 break-words">
                      Devolução{(editItem.motivoDevolucaoCodigo ?? editItem.extratoMotivoCodigo) ? ` (${editItem.motivoDevolucaoCodigo ?? editItem.extratoMotivoCodigo})` : ""}: <span className="font-medium">{editItem.motivoDevolucaoTexto || editItem.extratoMotivoTexto}</span>
                    </p>
                  )}
                  {editItem.devolvidoEm && <p className="text-[11px] text-slate-400">Em {fmtData(editItem.devolvidoEm)}</p>}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 px-5 py-4 border-t bg-white gap-2 flex flex-row justify-end">
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={atualizarMut.isPending} className="h-10 rounded-xl">Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={atualizarMut.isPending} className="h-10 rounded-xl bg-[#1B2A4A] hover:bg-[#253757] gap-2 px-5">
              {atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 3245 — confirmar alteração de status em lote */}
      <AlertDialog open={bulkOpen} onOpenChange={(o) => { if (!o) setBulkOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar status de {selectedIds.size} cheque(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os <strong>{selectedIds.size}</strong> cheque(s) selecionado(s) passarão para o status{" "}
              <strong>{bulkStatus ? bulkStatus[0].toUpperCase() + bulkStatus.slice(1) : "—"}</strong>.
              Esta ação altera apenas o status no controle e não afeta a conciliação bancária nem lançamentos financeiros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkStatusMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); aplicarBulkStatus(); }}
              disabled={bulkStatusMut.isPending || !bulkStatus}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkStatusMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Aplicando…</> : "Alterar status"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!excluirItem} onOpenChange={(o) => { if (!o) setExcluirItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cheque {excluirItem?.numeroCheque}?</AlertDialogTitle>
            <AlertDialogDescription>O cheque será removido do controle (exclusão reversível no banco). Esta ação não afeta lançamentos financeiros.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Limpar cadastro (mês / ano inteiro) — dupla confirmação + senha + alerta */}
      <Dialog open={limparEscopo != null} onOpenChange={(o) => { if (!o) fecharLimpar(); }}>
        <DialogContent className="max-w-lg">
          {(() => {
            const escopoLabel = limparEscopo === "mes"
              ? `${mesSel != null ? MESES[mesSel] : ""}/${ano}`
              : `o ano inteiro de ${ano}`;
            const total = limparPrev?.total ?? null;
            const conciliados = limparPrev?.conciliados ?? 0;
            const consolidado = limparPrev?.consolidado ?? false;
            const bloqueado = limparPrev?.bloqueado ?? false;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    {limparEscopo === "mes" ? "Limpar cheques do mês" : "Limpar cheques do ano inteiro"}
                  </DialogTitle>
                  <DialogDescription>
                    Você está prestes a remover do controle os cheques de <strong>{escopoLabel}</strong>.
                  </DialogDescription>
                </DialogHeader>

                {/* Bloqueio: há cheque conciliado em extrato (mês consolidado) */}
                {bloqueado ? (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-red-700">
                      <AlertCircle className="h-5 w-5" /> Limpeza proibida
                    </div>
                    <p className="text-sm text-red-700">
                      Existem <strong>{conciliados} cheque(s) já conciliado(s)</strong> em algum extrato neste período
                      (mês consolidado). Apagar geraria <strong>erro na conciliação bancária</strong>.
                      Reverta a conciliação desses cheques antes de limpar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Alerta vermelho — perda de registros */}
                    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 font-semibold text-red-700">
                        <AlertCircle className="h-5 w-5" /> Atenção: ação destrutiva
                      </div>
                      <p className="text-sm text-red-700">
                        Todos os <strong>{total ?? "—"} cheque(s)</strong> de <strong>{escopoLabel}</strong> serão
                        removidos do controle. <strong>Você perderá todos esses registros</strong> e precisará
                        reimportar a planilha para recuperá-los.
                      </p>
                      {consolidado && (
                        <p className="text-xs text-red-600">
                          Observação: este período aparece como <strong>consolidado</strong> (todos compensados).
                        </p>
                      )}
                    </div>

                    {limparEtapa === 1 ? (
                      <p className="text-sm text-muted-foreground">
                        Esta é a <strong>1ª confirmação</strong>. Ao continuar, pediremos a confirmação final e a
                        senha do seu login.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-700">
                          2ª confirmação — digite a senha do seu login para concluir.
                        </p>
                        <Label className="text-xs">Senha do seu login</Label>
                        <Input
                          type="password"
                          autoFocus
                          value={limparSenha}
                          onChange={(e) => setLimparSenha(e.target.value)}
                          placeholder="••••••••"
                          onKeyDown={(e) => { if (e.key === "Enter" && limparSenha.trim() && !limparMut.isPending) executarLimpeza(); }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={fecharLimpar}>Cancelar</Button>
                  {!bloqueado && (
                    limparEtapa === 1 ? (
                      <Button
                        onClick={() => setLimparEtapa(2)}
                        disabled={total == null || total === 0}
                        className="bg-red-600 hover:bg-red-700 gap-2"
                      >
                        <Trash2 className="h-4 w-4" /> Continuar
                      </Button>
                    ) : (
                      <Button
                        onClick={executarLimpeza}
                        disabled={!limparSenha.trim() || limparMut.isPending}
                        className="bg-red-600 hover:bg-red-700 gap-2"
                      >
                        {limparMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Limpar definitivamente
                      </Button>
                    )
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
