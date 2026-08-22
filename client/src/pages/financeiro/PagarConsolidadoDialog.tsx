import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { Check, CheckCircle2, FileText, Loader2, LockKeyhole, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { formatNumeroOcDisplay } from "@shared/numeroOc";

const FORMAS = [
  ["cheque", "Cheque próprio"], ["cheque_terceiro", "Cheque de terceiro"],
  ["pix", "PIX"], ["ted", "TED / transferência"], ["boleto", "Boleto"], ["dinheiro", "Dinheiro"],
] as const;
type Adjustment = { tipo: "desconto" | "acrescimo" | "juros" | "taxa" | "frete" | "correcao" | "arredondamento" | "glosa" | "outro"; descricao: string; valor: number };

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const dateBR = (v?: string | null) => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
const parseBR = (v: string) => {
  const s = String(v).replace(/[R$\s]/g, "").trim();
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
};
const maskBR = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return digits ? (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
};
function suggestCombination(items: any[], target: number) {
  if (target <= 0) return null;
  const dp = new Map<number, number[]>();
  dp.set(0, []);
  for (const item of items) {
    const cents = Math.round(Number(item.valorPrevisto || 0) * 100);
    if (cents <= 0) continue;
    for (const [sum, ids] of Array.from(dp.entries())) {
      if (sum + cents <= target + 5 && !dp.has(sum + cents)) dp.set(sum + cents, [...ids, Number(item.entryId ?? item.id)]);
    }
    if (dp.size > 200_000) break;
  }
  for (let delta = 0; delta <= 5; delta++) {
    if (dp.has(target - delta)) return dp.get(target - delta);
    if (dp.has(target + delta)) return dp.get(target + delta);
  }
  return null;
}

function signedAdjustmentValue(a: Adjustment) {
  if (a.tipo === "desconto" || a.tipo === "glosa") return -Math.abs(a.valor);
  if (["acrescimo", "juros", "taxa", "frete"].includes(a.tipo)) return Math.abs(a.valor);
  return a.valor;
}

function displayedAdjustmentValue(a: Adjustment) {
  if (["desconto", "glosa", "acrescimo", "juros", "taxa", "frete"].includes(a.tipo)) {
    return Math.abs(a.valor);
  }
  return a.valor;
}

function StatusPill({ status }: { status?: string | null }) {
  const map: Record<string, [string, string]> = {
    rascunho: ["Rascunho", "border-amber-200 bg-amber-50 text-amber-800"],
    conferido: ["Conferido", "border-blue-200 bg-blue-50 text-blue-800"],
    pago: ["Pago", "border-slate-200 bg-slate-100 text-slate-700"],
    cancelado: ["Cancelado", "border-red-200 bg-red-50 text-red-700"],
  };
  const [label, cls] = map[status || ""] || ["Novo", "border-slate-200 bg-slate-50 text-slate-600"];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}

export default function PagarConsolidadoDialog({ open, group, companyId, bankAccounts, onClose, onSuccess }: {
  open: boolean; group: any | null; companyId: number; bankAccounts: any[]; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const utils = (trpc as any).useUtils();
  const persistent = !!group?._supplierId && !!group?._cicloWindow;
  const [closingId, setClosingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [boletoCodigo, setBoletoCodigo] = useState("");
  const [boletoVencimento, setBoletoVencimento] = useState("");
  const [declared, setDeclared] = useState("");
  const [suggestedValue, setSuggestedValue] = useState("");
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [forma, setForma] = useState("pix");
  const [parcelas, setParcelas] = useState("1");
  const [prazo, setPrazo] = useState("30");
  const [observacoes, setObservacoes] = useState("");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [contaBancariaId, setContaBancariaId] = useState<string>("none");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeNumeros, setChequeNumeros] = useState<string[]>([""]);
  const [qtdCheques, setQtdCheques] = useState("1");
  const [chequesTerceiroSel, setChequesTerceiroSel] = useState<number[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);

  const openMut = (trpc as any).financial.abrirFechamentoFornecedor.useMutation();
  const saveMut = (trpc as any).financial.salvarComposicaoFechamento.useMutation();
  const confirmMut = (trpc as any).financial.confirmarFechamento.useMutation();
  const reopenMut = (trpc as any).financial.reabrirFechamento.useMutation();
  const cancelMut = (trpc as any).financial.cancelarFechamento.useMutation();
  const reversePaymentMut = (trpc as any).financial.estornarFechamentoPago.useMutation();
  const payMut = (trpc as any).financial.pagarConsolidadoFornecedor.useMutation();
  const detailQ = (trpc as any).financial.getFechamentoFornecedor.useQuery(
    { companyId, fechamentoId: closingId || 0 },
    { enabled: !!companyId && !!closingId }
  );
  const closing = detailQ.data;
  const busy = pendingOpen || [saveMut, confirmMut, reopenMut, cancelMut, reversePaymentMut, payMut].some((m: any) => m.isPending);

  const sourceItems = useMemo(() => {
    const byId = new Map<number, any>();
    for (const item of [...(closing?.itens || []), ...(group?.itens || [])]) {
      const id = Number(item.entryId ?? item.id);
      if (id && !byId.has(id)) byId.set(id, item);
    }
    return Array.from(byId.values());
  }, [closing?.itens, group?.itens]);
  const persistedActiveIds = useMemo(() => new Set<number>(
    (closing?.itens || []).filter((i: any) => i.ativo !== 0).map((i: any) => Number(i.entryId ?? i.id))
  ), [closing?.itens]);
  const activeItems = useMemo(() => sourceItems.filter((i: any) =>
    i.status !== "pago" && i.entryStatus !== "pago" &&
    i.status !== "cancelado" && i.entryStatus !== "cancelado"
  ), [sourceItems]);
  const selectedItems = useMemo(() => activeItems.filter((i: any) => selected.includes(Number(i.entryId ?? i.id))), [activeItems, selected]);
  const itemsTotal = useMemo(() => selectedItems.reduce((s: number, i: any) => s + Number(i.valorPrevisto ?? 0), 0), [selectedItems]);
  const adjustmentTotal = useMemo(() => adjustments.reduce((s, a) => s + signedAdjustmentValue(a), 0), [adjustments]);
  const calculatedTotal = Math.round((itemsTotal + adjustmentTotal) * 100) / 100;
  const declaredNum = parseBR(declared);
  const frozenTotal = Number(closing?.valorTotal ?? calculatedTotal);
  const comparisonTotal = persistent && closing?.status === "conferido" ? frozenTotal : calculatedTotal;
  const difference = Math.round((declaredNum - comparisonTotal) * 100) / 100;
  const isDraft = !persistent || !closing || closing.status === "rascunho";
  const exactIds = selected;
  const chequesQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: comparisonTotal },
    { enabled: !!companyId && forma === "cheque_terceiro" && comparisonTotal > 0 }
  );
  const chequesDisponiveis: any[] = chequesQ?.data?.cheques ?? [];
  const chequesTotal = chequesDisponiveis.filter(c => chequesTerceiroSel.includes(Number(c.id))).reduce((s, c) => s + Number(c.valor || 0), 0);

  const refresh = async () => {
    await utils.financial.getContasAPagarByYear.invalidate();
    await utils.financial.getConciliacaoReport.invalidate();
    await utils.financial.getConciliacaoReportGeral.invalidate();
    if (closingId) {
      await utils.financial.getFechamentoFornecedor.invalidate({ companyId, fechamentoId: closingId });
      await detailQ.refetch();
    }
  };
  const error = (title: string, e: any) => toast({ title, description: e?.message || "Tente novamente.", variant: "destructive" });

  useEffect(() => {
    if (!open || !group) return;
    setClosingId(group.fechamentoId ? Number(group.fechamentoId) : null);
    setSelected(persistent
      ? (group.itens || [])
          .filter((i: any) => i.status !== "pago" && i.status !== "cancelado")
          .map((i: any) => Number(i.entryId ?? i.id))
      : []);
    setAdjustments([]);
    setDeclared("");
    setSuggestedValue("");
    setSuggestionMessage("");
    setBoletoCodigo("");
    setBoletoVencimento("");
    setForma(group.cicloFormaPagamento || group._cicloConfig?.cicloFormaPagamento || "pix");
    setParcelas(String(group.cicloNumParcelas || group._cicloConfig?.cicloNumParcelas || 1));
    setPrazo(String(group._cicloConfig?.cicloPrazoParcela || 30));
    setObservacoes("");
    setChequeNumero("");
    setChequeNumeros([""]);
    setQtdCheques("1");
    setChequesTerceiroSel([]);
    if (persistent && !group.fechamentoId) {
      setPendingOpen(true);
      openMut.mutate({ companyId, supplierId: Number(group._supplierId), janela: String(group._cicloWindow), itensIds: (group.itensIds || []).map(Number) }, {
        onSuccess: (r: any) => { setClosingId(Number(r.fechamentoId)); setPendingOpen(false); },
        onError: (e: any) => { setPendingOpen(false); error("Não foi possível abrir o fechamento", e); },
      });
    }
  }, [open, group?.id, companyId, persistent]);

  useEffect(() => {
    if (!open || !closing) return;
    setSelected(closing.itens?.filter((i: any) =>
      i.ativo !== 0 && i.entryStatus !== "pago" && i.entryStatus !== "cancelado"
    ).map((i: any) => Number(i.entryId)) || []);
    setAdjustments((closing.ajustes || []).filter((a: any) => a.ativo !== 0).map((a: any) => ({ tipo: a.tipo, descricao: a.descricao || "", valor: Number(a.valor) })));
    setBoletoCodigo(closing.boletoCodigo || "");
    setBoletoVencimento(closing.boletoVencimento ? String(closing.boletoVencimento).slice(0, 10) : "");
    setDeclared(closing.status === "conferido" ? String(closing.valorTotal).replace(".", ",") : "");
    setForma(closing.formaPagamento || group?.cicloFormaPagamento || "pix");
    setParcelas(String(closing.numParcelas || 1));
    setPrazo(String(closing.prazoParcela || 30));
    setObservacoes(closing.observacoes || "");
  }, [open, closing, group?.cicloFormaPagamento]);

  useEffect(() => {
    if (forma !== "cheque_terceiro") setChequesTerceiroSel([]);
  }, [forma]);

  const compositionPayload = () => {
    const invalid = adjustments.find(a => !Number.isFinite(a.valor) || a.valor === 0);
    if (invalid) {
      toast({ title: "Ajuste sem valor", description: "Informe um valor diferente de zero ou remova o ajuste antes de salvar.", variant: "destructive" });
      return null;
    }
    const desired = new Set(selected);
    return {
      companyId, fechamentoId: closingId!, itensRemover: Array.from(persistedActiveIds).filter(id => !desired.has(id)),
      itensAdicionar: Array.from(desired).filter(id => !persistedActiveIds.has(id)),
      ajustes: adjustments.map(a => ({ ...a, valor: signedAdjustmentValue(a) })),
      boletoCodigo: boletoCodigo || undefined, boletoVencimento: boletoVencimento || undefined,
      formaPagamento: forma, numParcelas: Number(parcelas), prazoParcela: Number(prazo), observacoes: observacoes || undefined,
    };
  };
  const save = async () => {
    if (!closingId || busy) return false;
    const payload = compositionPayload();
    if (!payload) return false;
    try {
      await saveMut.mutateAsync(payload);
      toast({ title: "Rascunho salvo", description: "A composição e os dados do boleto foram persistidos." });
      await refresh();
      return true;
    } catch (e) {
      error("Erro ao salvar composição", e);
      return false;
    }
  };
  const confirm = async () => {
    if (!closingId || Math.abs(difference) > 0.05 || declaredNum <= 0) {
      toast({ title: "Valor do boleto não confere", description: `Informe o valor declarado. Diferença atual: ${brl(Math.abs(difference))}.`, variant: "destructive" }); return;
    }
    try {
      await confirmMut.mutateAsync({ companyId, fechamentoId: closingId, valorDeclarado: declaredNum });
      toast({ title: "Fechamento conferido", description: "A composição foi congelada e está pronta para pagamento." });
      await refresh();
    } catch (e) {
      error("O backend não aprovou a confirmação", e);
    }
  };
  const saveAndConfirm = async () => {
    if (busy) return;
    const saved = await save();
    if (saved) await confirm();
  };
  const pay = () => {
    if (busy || !group || exactIds.length === 0) return;
    if (forma === "cheque_terceiro" && (!chequesTerceiroSel.length || Math.abs(chequesTotal - comparisonTotal) > 0.05)) {
      toast({ title: "Cheques de terceiro não conferem", description: `Selecione cheques que somem ${brl(comparisonTotal)}.`, variant: "destructive" }); return;
    }
    const chequeCount = Math.max(1, Math.min(120, Number(qtdCheques) || 1));
    const chequeNumbers = Array.from({ length: chequeCount }, (_, i) =>
      (chequeNumeros[i] || (i === 0 ? chequeNumero : "")).trim()
    );
    if (forma === "cheque" && chequeNumbers.some(n => !n)) {
      toast({ title: "Informe o número de todos os cheques", variant: "destructive" }); return;
    }
    const paymentTotal = comparisonTotal;
    const baseCheque = Math.floor((paymentTotal / chequeCount) * 100) / 100;
    const remainder = Math.round((paymentTotal - baseCheque * chequeCount) * 100) / 100;
    const dueDates = Array.isArray(group.parcelas) ? group.parcelas.map((p: any) => p.dataVencimento || p.vencimento).filter(Boolean) : [];
    payMut.mutate({ companyId, grupoId: String(group.id), itensIds: exactIds, fechamentoId: closingId || undefined, dataPagamento, contaBancariaId: contaBancariaId === "none" ? null : Number(contaBancariaId), formaPagamento: forma, fornecedorNome: group.fornecedorNome, observacoes: observacoes || undefined, cheques: forma === "cheque" ? Array.from({ length: chequeCount }, (_, i) => ({ numero: chequeNumbers[i], valor: i === chequeCount - 1 ? baseCheque + remainder : baseCheque, dataVencimento: dueDates[i] || boletoVencimento || dataPagamento })) : undefined, chequesTerceiroIds: forma === "cheque_terceiro" ? chequesTerceiroSel : undefined }, {
      onSuccess: async () => { toast({ title: "Pagamento consolidado registrado" }); await refresh(); onSuccess(); },
      onError: (e: any) => error("Erro ao pagar fechamento", e),
    });
  };
  if (!group) return null;

  return <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
    <DialogContent className="max-w-4xl max-h-[94vh] overflow-y-auto p-0 bg-slate-50">
      <DialogHeader className="sticky top-0 z-10 border-b bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Contas a pagar · fechamento persistente</p><DialogTitle className="mt-1 text-xl text-slate-900">{group.fornecedorNome}</DialogTitle><p className="mt-1 text-xs text-slate-500">Janela {group._cicloWindow || group.descricao || "seleção manual"} {closingId ? `· Fechamento #${closingId}` : ""}</p></div>
          <StatusPill status={persistent ? closing?.status : "rascunho"} />
        </div>
      </DialogHeader>
      {pendingOpen || (persistent && !closing && closingId) ? <div className="p-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />Preparando o fechamento e conferindo os itens…</div> :
      <div className="space-y-4 p-5">
        <section className="rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-800">Composição exata</h3><p className="text-[11px] text-slate-500">Remova itens que não aparecem no boleto. Nada é baixado antes do pagamento.</p></div><span className="font-mono text-sm font-bold text-blue-700">{selectedItems.length} itens · {brl(itemsTotal)}</span></div>
          {isDraft && <div className="border-b border-slate-100 bg-blue-50/60 p-3"><Label className="text-[11px] text-blue-900">Valor do boleto para sugerir a composição</Label><div className="mt-1 flex gap-2"><Input className="h-8 bg-white" value={persistent ? declared : suggestedValue} onChange={e => persistent ? setDeclared(maskBR(e.target.value)) : setSuggestedValue(maskBR(e.target.value))} placeholder="0,00" inputMode="numeric"/><Button className="h-8" variant="outline" onClick={() => { const targetValue = persistent ? declared : suggestedValue; const targetItems = parseBR(targetValue) - (persistent ? adjustmentTotal : 0); const ids = suggestCombination(activeItems, Math.round(targetItems * 100)); if (ids) { setSelected(ids); setSuggestionMessage(`Combinação encontrada com ${ids.length} item(ns).`); } else setSuggestionMessage("Nenhuma combinação dentro da tolerância; selecione manualmente e explique a diferença com ajustes."); }}>Sugerir seleção</Button></div>{suggestionMessage && <p className="mt-1 text-[11px] text-blue-800">{suggestionMessage}</p>}</div>}
          <div className="divide-y divide-slate-100">{activeItems.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Nenhum item neste fechamento.</div> : activeItems.map((i: any) => { const id = Number(i.entryId ?? i.id); const checked = selected.includes(id); const persisted = persistedActiveIds.has(id); return <div key={id} className={`grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3 ${!checked ? "bg-slate-50" : ""}`}>
            <Checkbox checked={checked} disabled={!isDraft || busy} onCheckedChange={() => setSelected(v => checked ? v.filter(x => x !== id) : [...v, id])} aria-label={`Selecionar item ${id}`} />
            <div className="min-w-0 text-xs text-slate-700"><div className="flex flex-wrap gap-x-3 gap-y-1 font-semibold"><span>{i.obraNome || "Obra não informada"}</span><span className="font-mono text-blue-700">{i.ocNumero ? formatNumeroOcDisplay(i.ocNumero) : `Entrada #${id}`}</span><span>Competência {dateBR(i.dataCompetencia)}</span><span>Venc. {dateBR(i.dataVencimento)}</span><span className={checked ? "text-blue-700" : "text-slate-500"}>{checked ? "Incluído no boleto" : persisted ? "Fora do boleto" : "Novo · não incluído"}</span></div><p className="mt-1 break-words text-slate-500">{i.descricao || "Sem descrição"}{i.fornecedorNome ? ` · ${i.fornecedorNome}` : ""}</p></div>
             <div className="flex items-center gap-2"><span className="whitespace-nowrap font-mono text-sm font-bold text-slate-800">{brl(Number(i.valorPrevisto))}</span>{isDraft && <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setSelected(v => checked ? v.filter(x => x !== id) : [...v, id])} aria-label={checked ? "Retirar item do boleto" : "Reincluir item no boleto"}>{checked ? <Trash2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</Button>}</div>
          </div>})}</div>
        </section>
        {persistent && <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><FileText className="h-4 w-4 text-blue-600" />Boleto e ajustes</div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1 sm:col-span-2"><Label className="text-[11px]">Código / linha digitável</Label><Input value={boletoCodigo} disabled={!isDraft || busy} onChange={e => setBoletoCodigo(e.target.value)} /></div><div className="space-y-1"><Label className="text-[11px]">Vencimento do boleto</Label><Input type="date" value={boletoVencimento} disabled={!isDraft || busy} onChange={e => setBoletoVencimento(e.target.value)} /></div><div className="space-y-1"><Label className="text-[11px]">Forma</Label><Select value={forma} disabled={!isDraft || busy} onValueChange={setForma}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FORMAS.map(([v, l]) => <SelectItem value={v} key={v}>{l}</SelectItem>)}</SelectContent></Select></div></div>
             <div className="mt-4 space-y-2"><div className="flex items-center justify-between"><Label className="text-[11px]">Ajustes explícitos</Label>{isDraft && <Button variant="ghost" size="sm" className="h-7 text-blue-700" onClick={() => setAdjustments(v => [...v, { tipo: "desconto", descricao: "", valor: 0 }])}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>}</div>{adjustments.map((a, idx) => <div key={idx} className="grid grid-cols-[120px_1fr_100px_auto] gap-1"><Select value={a.tipo} disabled={!isDraft || busy} onValueChange={(v: any) => setAdjustments(xs => xs.map((x, j) => j === idx ? { ...x, tipo: v } : x))}><SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{["desconto","acrescimo","juros","taxa","frete","correcao","arredondamento","glosa","outro"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select><Input className="h-8 text-xs" placeholder="Descrição" disabled={!isDraft || busy} value={a.descricao} onChange={e => setAdjustments(xs => xs.map((x,j) => j===idx ? {...x, descricao:e.target.value}:x))}/><Input className="h-8 text-right text-xs" inputMode="decimal" disabled={!isDraft || busy} value={a.valor ? String(displayedAdjustmentValue(a)).replace(".", ",") : ""} onChange={e => setAdjustments(xs => xs.map((x,j) => j===idx ? {...x, valor:parseBR(e.target.value)}:x))}/><Button variant="ghost" size="icon" className="h-8 text-slate-400 hover:text-red-600" disabled={!isDraft || busy} onClick={() => setAdjustments(xs => xs.filter((_,j)=>j!==idx))}><X className="h-3.5 w-3.5"/></Button></div>)}{adjustments.length > 0 && <p className="text-[10px] text-slate-500">Descontos e glosas são negativos; acréscimos, juros, taxas e frete são positivos. Correção, arredondamento e outro preservam o sinal informado.</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Conferência do valor</h3><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-slate-500">Itens ativos</span><b>{brl(itemsTotal)}</b></div><div className="flex justify-between"><span className="text-slate-500">Ajustes</span><b className={adjustmentTotal < 0 ? "text-red-700" : "text-slate-800"}>{adjustmentTotal >= 0 ? "+" : ""}{brl(adjustmentTotal)}</b></div><div className="flex justify-between border-t pt-2 text-base"><span className="font-bold text-slate-800">Total calculado</span><b className="font-mono text-blue-700">{brl(calculatedTotal)}</b></div><div className="pt-2"><Label className="text-[11px]">Valor declarado no boleto</Label><Input className="mt-1 h-10 text-right font-mono text-lg font-bold" disabled={!isDraft || busy} value={declared} onChange={e => setDeclared(maskBR(e.target.value))} placeholder="0,00" /></div><div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-2 font-semibold ${declaredNum > 0 && Math.abs(difference) <= 0.05 ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><span>{Math.abs(difference) <= 0.05 && declaredNum > 0 ? "Conferência aprovada" : "Diferença a explicar"}</span><span className="font-mono">{difference > 0 ? "+" : ""}{brl(difference)}</span></div></div></div>
        </section>}
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2"><div><Label className="text-[11px]">Observações</Label><Textarea rows={2} disabled={!isDraft || busy} value={observacoes} onChange={e => setObservacoes(e.target.value)} className="mt-1 resize-none text-xs"/></div><div className="grid grid-cols-2 gap-2"><div><Label className="text-[11px]">Parcelas</Label><Input type="number" min={1} max={120} disabled={!isDraft || busy} value={parcelas} onChange={e => setParcelas(e.target.value)}/></div><div><Label className="text-[11px]">Prazo (dias)</Label><Input type="number" min={1} disabled={!isDraft || busy} value={prazo} onChange={e => setPrazo(e.target.value)}/></div></div></div>
        {closing?.status === "conferido" && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-blue-900"><LockKeyhole className="h-4 w-4"/>Composição congelada</div><p className="mt-1 text-xs text-blue-800">Fechamento conferido por {closing.confirmadoPorNome || "usuário"} em {dateBR(closing.confirmadoEm)}. Reabra somente se houver divergência documental.</p></div>}
         {(closing?.status === "conferido" || !persistent) && <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Dados da baixa</h3><div className={`grid gap-3 ${forma === "cheque" ? "md:grid-cols-4" : "md:grid-cols-3"}`}><div><Label className="text-[11px]">Data do pagamento</Label><Input type="date" value={dataPagamento} disabled={busy} onChange={e=>setDataPagamento(e.target.value)}/></div><div><Label className="text-[11px]">Conta bancária</Label><Select value={contaBancariaId} disabled={busy} onValueChange={setContaBancariaId}><SelectTrigger><SelectValue placeholder="Não informar"/></SelectTrigger><SelectContent><SelectItem value="none">Não informar</SelectItem>{bankAccounts.filter(a=>a.ativo).map(a=><SelectItem key={a.id} value={String(a.id)}>{a.descricao || a.banco || `Conta ${a.id}`}</SelectItem>)}</SelectContent></Select></div>{forma === "cheque" && <div><Label className="text-[11px]">Quantidade de cheques</Label><Input type="number" min={1} max={120} value={qtdCheques} disabled={busy} onChange={e=>setQtdCheques(e.target.value)}/></div>}<div><Label className="text-[11px]">Nº do cheque, se aplicável</Label><Input value={chequeNumero} disabled={busy || forma !== "cheque"} onChange={e=>{setChequeNumero(e.target.value);setChequeNumeros(v=>{const n=[...v];n[0]=e.target.value;return n;});}} placeholder={forma === "cheque" ? "Obrigatório" : "Não se aplica"}/></div></div>{forma === "cheque" && Number(qtdCheques) > 1 && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">{Array.from({length: Math.min(120, Number(qtdCheques)||1)}, (_,i)=><div key={i}><Label className="text-[10px]">Cheque {i+1}</Label><Input className="h-8 text-xs" value={chequeNumeros[i] || ""} disabled={busy} onChange={e=>setChequeNumeros(v=>{const n=[...v];n[i]=e.target.value;return n;})}/></div>)}</div>}{forma === "cheque_terceiro" && <div className="mt-3 border-t pt-3"><p className="mb-2 text-xs font-semibold text-slate-700">Cheques recebidos disponíveis · total selecionado {brl(chequesTotal)}</p><div className="grid gap-1 sm:grid-cols-2">{chequesDisponiveis.map(c => <label key={c.id} className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs hover:border-blue-300"><span className="flex items-center gap-2"><Checkbox checked={chequesTerceiroSel.includes(Number(c.id))} onCheckedChange={() => setChequesTerceiroSel(v => v.includes(Number(c.id)) ? v.filter(x=>x!==Number(c.id)) : [...v, Number(c.id)])}/><span className="font-mono">{c.numero_cheque}</span></span><b>{brl(Number(c.valor))}</b></label>)}</div></div>}</div>}
      </div>}
      <DialogFooter className="sticky bottom-0 border-t bg-white px-5 py-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>
        {persistent && closing?.status === "rascunho" && <><Button variant="ghost" className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={() => { if (window.confirm("Cancelar este fechamento? Os itens serão liberados para um novo ciclo.")) cancelMut.mutate({ companyId, fechamentoId: closingId!, motivo: "Cancelado pelo usuário na conferência" }, { onSuccess: async () => { toast({ title: "Fechamento cancelado" }); await refresh(); onClose(); }, onError: (e: any) => error("Erro ao cancelar fechamento", e) }); }}><Trash2 className="mr-1.5 h-4 w-4"/>Cancelar fechamento</Button><Button variant="outline" disabled={busy} onClick={save}><Save className="mr-1.5 h-4 w-4"/>Salvar rascunho</Button><Button disabled={busy || Math.abs(difference) > 0.05 || declaredNum <= 0 || selected.length === 0} onClick={saveAndConfirm} className="bg-blue-700 text-white hover:bg-blue-800"><CheckCircle2 className="mr-1.5 h-4 w-4"/>Confirmar fechamento</Button></>}
        {persistent && closing?.status === "conferido" && <><Button variant="outline" disabled={busy} onClick={()=>reopenMut.mutate({companyId, fechamentoId:closingId!},{onSuccess:refresh,onError:e=>error("Erro ao reabrir",e)})}><RotateCcw className="mr-1.5 h-4 w-4"/>Reabrir</Button><Button disabled={busy || !exactIds.length} onClick={pay} className="bg-blue-700 text-white hover:bg-blue-800"><Check className="mr-1.5 h-4 w-4"/>Pagar fechamento</Button></>}
        {persistent && closing?.status === "pago" && <Button variant="outline" disabled={busy} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => { const motivo = window.prompt("Informe o motivo do estorno do pagamento:")?.trim(); if (!motivo) return; reversePaymentMut.mutate({ companyId, fechamentoId: closingId!, motivo }, { onSuccess: async () => { toast({ title: "Pagamento estornado", description: "O fechamento voltou ao estado conferido e o histórico foi preservado." }); await refresh(); }, onError: (e: any) => error("Erro ao estornar pagamento", e) }); }}><RotateCcw className="mr-1.5 h-4 w-4"/>Estornar pagamento</Button>}
        {!persistent && <Button disabled={busy || !exactIds.length} onClick={pay} className="bg-blue-700 text-white hover:bg-blue-800"><Check className="mr-1.5 h-4 w-4"/>Confirmar pagamento</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}