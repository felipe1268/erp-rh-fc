import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, CreditCard, Calendar, Building2, Hash, AlertCircle, CheckCircle2 } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function parseBRLInput(raw: string): number {
  const clean = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function calcParcelasPreview(total: number, numParcelas: number, prazoDias: number, dataFechamento: string) {
  const n = Math.max(1, numParcelas || 1);
  const valorBase = Math.floor((total / n) * 100) / 100;
  const resto = Math.round((total - valorBase * n) * 100) / 100;
  const dtFech = new Date(dataFechamento + "T12:00:00Z");
  const parcelas: { numero: string; valor: number; valorStr: string; dataVencimento: string }[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(dtFech.getTime() + (prazoDias || 30) * i * 86400000);
    const venc = dt.toISOString().slice(0, 10);
    const valor = i === n - 1 ? valorBase + resto : valorBase;
    parcelas.push({ numero: "", valor, valorStr: formatBRLRaw(valor), dataVencimento: venc });
  }
  return parcelas;
}

function formatBRLRaw(v: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtDateBR(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const FORMAS_PAGAMENTO = [
  { value: "cheque", label: "Cheque (próprio)" },
  { value: "cheque_terceiro", label: "Cheque de Terceiro" },
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED / Transferência" },
  { value: "boleto", label: "Boleto" },
  { value: "dinheiro", label: "Dinheiro" },
];

export default function PagarConsolidadoDialog({
  open, group, companyId, bankAccounts, onClose, onSuccess,
}: {
  open: boolean;
  group: any | null;
  companyId: number;
  bankAccounts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaBancariaId, setContaBancariaId] = useState<number | null>(null);
  const [formaPagamento, setFormaPagamento] = useState("cheque");
  const [parcelas, setParcelas] = useState<{ numero: string; valor: number; valorStr: string; dataVencimento: string }[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const cicloConfig = group?._cicloConfig ?? {};
  const total = Number(group?.valorPrevisto ?? 0);

  useEffect(() => {
    if (!open || !group) return;
    const formaDefault = cicloConfig.cicloFormaPagamento || "cheque";
    setFormaPagamento(formaDefault);
    setDataPagamento(new Date().toISOString().slice(0, 10));
    setContaBancariaId(null);
    setObservacoes("");
    const numParcelas = Number(cicloConfig.cicloNumParcelas || 1);
    const prazo = Number(cicloConfig.cicloPrazoParcela || 30);
    const fechamento = (group.dataVencimento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (formaDefault === "cheque" && numParcelas > 1) {
      setParcelas(calcParcelasPreview(total, numParcelas, prazo, fechamento));
    } else {
      setParcelas([{ numero: "", valor: total, valorStr: formatBRLRaw(total), dataVencimento: fechamento }]);
    }
  }, [open, group?.id]);

  const totalParcelas = useMemo(
    () => Math.round(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    [parcelas]
  );
  const diffTotal = Math.round((totalParcelas - total) * 100) / 100;
  const isCheque = formaPagamento === "cheque";
  const isChequeTerceiro = formaPagamento === "cheque_terceiro";

  const chequesDisponiveisQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: total },
    { enabled: isChequeTerceiro && !!companyId && total > 0 }
  );
  const chequesDisponiveis: any[] = chequesDisponiveisQ?.data?.cheques ?? [];
  const [chequesTerceiroSel, setChequesTerceiroSel] = useState<number[]>([]);

  const totalSelecionado = useMemo(
    () => chequesDisponiveis
      .filter((c: any) => chequesTerceiroSel.includes(c.id))
      .reduce((s: number, c: any) => s + Number(c.valor), 0),
    [chequesDisponiveis, chequesTerceiroSel]
  );
  const diffChequesTerceiro = Math.round((totalSelecionado - total) * 100) / 100;

  useEffect(() => { if (!isChequeTerceiro) setChequesTerceiroSel([]); }, [isChequeTerceiro]);

  function updateParcela(i: number, patch: Partial<{ numero: string; valor: number; valorStr: string; dataVencimento: string }>) {
    setParcelas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function handleValorChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    const valor = parseInt(digits || "0", 10) / 100;
    updateParcela(i, { valor, valorStr: maskBRL(digits) });
  }

  const payMut = (trpc as any).financial.pagarConsolidadoFornecedor.useMutation({
    onSuccess: (r: any) => {
      toast({
        title: "Pagamento consolidado registrado!",
        description: `${r.pagos} título(s) quitado(s)${r.chequesCriados ? ` · ${r.chequesCriados} cheque(s) lançado(s) no Controle de Cheques` : ""}${r.chequesAlocados ? ` · ${r.chequesAlocados} cheque(s) de terceiro alocados` : ""}.`,
      });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Erro ao pagar", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!group) return;
    if (isCheque) {
      if (parcelas.some((p) => !p.numero.trim())) {
        toast({ title: "Informe o número de todos os cheques", variant: "destructive" });
        return;
      }
      if (Math.abs(diffTotal) > 0.05) {
        toast({ title: "Soma dos cheques não bate com o total", description: `Diferença: ${formatBRL(diffTotal)}`, variant: "destructive" });
        return;
      }
    }
    if (isChequeTerceiro && chequesTerceiroSel.length === 0) {
      toast({ title: "Selecione pelo menos um cheque recebido", variant: "destructive" });
      return;
    }
    payMut.mutate({
      companyId,
      itensIds: group.itensIds,
      dataPagamento,
      contaBancariaId,
      formaPagamento,
      fornecedorNome: group.fornecedorNome ?? undefined,
      observacoes: observacoes || undefined,
      cheques: isCheque ? parcelas.map((p) => ({ numero: p.numero.trim(), valor: Number(p.valor) || 0, dataVencimento: p.dataVencimento })) : undefined,
      chequesTerceiroIds: isChequeTerceiro && chequesTerceiroSel.length ? chequesTerceiroSel : undefined,
    });
  }

  if (!group) return null;

  const somaBate = Math.abs(diffTotal) <= 0.05;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0">

        {/* CABEÇALHO */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-t-lg px-5 py-4">
          <p className="text-xs font-medium text-indigo-200 uppercase tracking-wider mb-0.5">Pagar consolidado</p>
          <h2 className="text-lg font-bold leading-tight">{group.fornecedorNome}</h2>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-indigo-200">
              {group.itensIds?.length ?? 0} título(s) · {group.descricao}
            </span>
            <span className="text-2xl font-bold tabular-nums">{formatBRL(total)}</span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* LINHA: data + forma + conta */}
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Data do pagamento
                </Label>
                <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" /> Forma de pagamento
                </Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> Conta bancária
              </Label>
              <Select value={contaBancariaId != null ? String(contaBancariaId) : "none"} onValueChange={(v) => setContaBancariaId(v === "none" ? null : Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Não informar —</SelectItem>
                  {(bankAccounts ?? []).filter((a: any) => a.ativo && (!isCheque || Number(a.temTalao) === 1)).map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {[a.descricao || a.banco, a.agencia ? `Ag ${a.agencia}` : null, a.conta ? `CC ${a.conta}` : null].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SEÇÃO CHEQUES PRÓPRIOS */}
          {isCheque && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Hash className="h-4 w-4 text-blue-500" />
                  {parcelas.length === 1 ? "Cheque" : `Cheques (${parcelas.length} parcelas)`}
                </span>
                <div className={`flex items-center gap-1 text-sm font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                  somaBate ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                }`}>
                  {somaBate
                    ? <><CheckCircle2 className="h-3.5 w-3.5" /> {formatBRL(totalParcelas)}</>
                    : <><AlertCircle className="h-3.5 w-3.5" /> Dif. {formatBRL(Math.abs(diffTotal))}</>
                  }
                </div>
              </div>

              <div className="space-y-2">
                {parcelas.map((p, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {/* Número da parcela */}
                    {parcelas.length > 1 && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {i + 1}/{parcelas.length}
                        </span>
                        <span className="text-xs text-muted-foreground">Parcela {i + 1}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                      {/* Nº Cheque */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Nº do cheque</Label>
                        <Input
                          value={p.numero}
                          onChange={(e) => updateParcela(i, { numero: e.target.value })}
                          placeholder="000123"
                          className="h-9 font-mono text-sm"
                        />
                      </div>
                      {/* Valor */}
                      <div className="space-y-1 w-36">
                        <Label className="text-[11px] text-muted-foreground">Valor (R$)</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R$</span>
                          <Input
                            value={p.valorStr}
                            onChange={(e) => handleValorChange(i, e.target.value)}
                            className="h-9 pl-8 text-right tabular-nums font-medium"
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                      {/* Vencimento */}
                      <div className="space-y-1 w-32">
                        <Label className="text-[11px] text-muted-foreground">Vencimento</Label>
                        <div className="h-9 flex items-center bg-white border border-input rounded-md px-2.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
                          <input
                            type="date"
                            value={p.dataVencimento}
                            onChange={(e) => updateParcela(i, { dataVencimento: e.target.value })}
                            className="text-xs bg-transparent outline-none w-full"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Vencimento legível */}
                    {p.dataVencimento && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                        Vence em {fmtDateBR(p.dataVencimento)}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-1.5 leading-relaxed">
                Ao confirmar, esses cheques são registrados no <strong>Controle de Cheques</strong> vinculados a {group.fornecedorNome}.
              </p>
            </div>
          )}

          {/* SEÇÃO CHEQUES DE TERCEIRO */}
          {isChequeTerceiro && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-violet-800 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-violet-500" /> Cheques recebidos disponíveis
                </span>
                {chequesTerceiroSel.length > 0 && (
                  <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                    Math.abs(diffChequesTerceiro) <= 0.05 ? "bg-green-100 text-green-700" :
                    diffChequesTerceiro > 0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                  }`}>
                    {formatBRL(totalSelecionado)}
                    {Math.abs(diffChequesTerceiro) > 0.05 && (diffChequesTerceiro > 0 ? ` +${formatBRL(diffChequesTerceiro)}` : ` −${formatBRL(-diffChequesTerceiro)}`)}
                    {Math.abs(diffChequesTerceiro) <= 0.05 && " ✓"}
                  </span>
                )}
              </div>

              {chequesDisponiveisQ?.isLoading ? (
                <div className="text-xs text-muted-foreground py-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando cheques disponíveis…
                </div>
              ) : chequesDisponiveis.length === 0 ? (
                <div className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg p-3">
                  Nenhum cheque recebido disponível. Cadastre cheques na aba "Cheques Recebidos" do Controle de Cheques.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {chequesDisponiveis.map((c: any) => {
                    const sel = chequesTerceiroSel.includes(c.id);
                    return (
                      <div key={c.id}
                        onClick={() => setChequesTerceiroSel(prev =>
                          sel ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        )}
                        className={`flex items-center justify-between cursor-pointer rounded-lg border px-3 py-2 transition-all ${
                          sel ? "bg-violet-50 border-violet-400 shadow-sm" : "bg-white border-gray-200 hover:border-violet-300"
                        }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            sel ? "bg-violet-600 border-violet-600" : "border-gray-300"
                          }`}>
                            {sel && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-mono text-sm font-semibold text-gray-800">{c.numero_cheque}</span>
                            {c.emitente_nome && <span className="text-xs text-muted-foreground ml-2 truncate">{c.emitente_nome}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-bold tabular-nums text-gray-800">{formatBRL(Number(c.valor))}</p>
                          {c.data_bom_para && <p className="text-[10px] text-muted-foreground">bom {fmtDateBR(c.data_bom_para?.slice(0, 10))}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-violet-600">
                {chequesTerceiroSel.length > 0
                  ? `${chequesTerceiroSel.length} cheque(s) selecionado(s) · serão marcados como "Alocado" ao confirmar.`
                  : `Selecione cheques que somem ${formatBRL(total)}.`}
              </p>
            </div>
          )}

          {/* OBSERVAÇÕES */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Observações (opcional)</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Deixe em branco se não houver" className="resize-none text-sm" />
          </div>
        </div>

        {/* RODAPÉ */}
        <div className="border-t bg-gray-50 px-5 py-3 rounded-b-lg flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-bold text-gray-800 tabular-nums">{formatBRL(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={payMut.isPending} className="h-9">
              Cancelar
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white h-9 px-5" onClick={handleSubmit} disabled={payMut.isPending}>
              {payMut.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Processando…</>
                : <><CheckCircle className="w-4 h-4 mr-1.5" /> Confirmar pagamento</>}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
