import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2 } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// Rev. 4070 — Espelha _calcParcelas do backend (server/routers/financial.ts) para pré-visualizar
// o split das parcelas antes de enviar; o backend recalcula/valida o total no submit.
function calcParcelasPreview(total: number, numParcelas: number, prazoDias: number, dataFechamento: string) {
  const n = Math.max(1, numParcelas || 1);
  const valorBase = Math.floor((total / n) * 100) / 100;
  const resto = Math.round((total - valorBase * n) * 100) / 100;
  const dtFech = new Date(dataFechamento + "T12:00:00Z");
  const parcelas: { numero: string; valor: number; dataVencimento: string }[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(dtFech.getTime() + (prazoDias || 30) * i * 86400000);
    const venc = dt.toISOString().slice(0, 10);
    const valor = i === n - 1 ? valorBase + resto : valorBase;
    parcelas.push({ numero: "", valor, dataVencimento: venc });
  }
  return parcelas;
}

const FORMAS_PAGAMENTO = [
  { value: "cheque", label: "Cheque (próprio)" },
  { value: "cheque_terceiro", label: "Cheque de Terceiro" },
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED/Transferência" },
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
  const [parcelas, setParcelas] = useState<{ numero: string; valor: number; dataVencimento: string }[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const cicloConfig = group?._cicloConfig ?? {};
  const total = Number(group?.valorPrevisto ?? 0);

  // Rev. 4070 — ao abrir, pré-preenche com a config do cadastro do fornecedor:
  // forma de pagamento padrão + nº de parcelas + prazo entre elas (ex.: cheque em até 5x/30d).
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
      setParcelas([{ numero: "", valor: total, dataVencimento: fechamento }]);
    }
  }, [open, group?.id]);

  const totalParcelas = useMemo(
    () => Math.round(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    [parcelas]
  );
  const diffTotal = Math.round((totalParcelas - total) * 100) / 100;
  const isCheque = formaPagamento === "cheque";
  const isChequeTerceiro = formaPagamento === "cheque_terceiro";

  // Rev. 4096 — Todos os cheques disponíveis ordenados por proximidade; UI faz composição multi-cheque
  const chequesDisponiveisQ = (trpc as any).chequesRecebidos?.sugerirPorValor?.useQuery(
    { companyId, valorAlvo: total },
    { enabled: isChequeTerceiro && !!companyId && total > 0 }
  );
  const chequesDisponiveis: any[] = chequesDisponiveisQ?.data?.cheques ?? [];
  const [chequesTerceiroSel, setChequesTerceiroSel] = useState<number[]>([]);

  // Acumulado selecionado × total a pagar
  const totalSelecionado = useMemo(
    () => chequesDisponiveis
      .filter((c: any) => chequesTerceiroSel.includes(c.id))
      .reduce((s: number, c: any) => s + Number(c.valor), 0),
    [chequesDisponiveis, chequesTerceiroSel]
  );
  const diffChequesTerceiro = Math.round((totalSelecionado - total) * 100) / 100;

  // Limpar seleção ao trocar forma
  useEffect(() => { if (!isChequeTerceiro) setChequesTerceiroSel([]); }, [isChequeTerceiro]);

  function updateParcela(i: number, patch: Partial<{ numero: string; valor: number; dataVencimento: string }>) {
    setParcelas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  const alocarLoteMut = (trpc as any).chequesRecebidos?.alocarLote?.useMutation({
    onError: (e: any) => toast({
      title: "Pagamento registrado, mas falha ao alocar cheques",
      description: `Os cheques de terceiro NÃO foram marcados como Alocados: ${e.message}. Acesse o Controle de Cheques Recebidos e aloque manualmente.`,
      variant: "destructive",
    }),
  });

  const payMut = (trpc as any).financial.pagarConsolidadoFornecedor.useMutation({
    onSuccess: (r: any) => {
      // Rev. 4096 — após pagamento confirmado, alocar os cheques de terceiro selecionados
      if (isChequeTerceiro && chequesTerceiroSel.length && alocarLoteMut) {
        alocarLoteMut.mutate({
          companyId,
          ids: chequesTerceiroSel,
          fornecedorAlocadoNome: group?.fornecedorNome ?? undefined,
          entryId: r?.entryId ?? null,
        });
      }
      toast({
        title: "Pagamento consolidado registrado!",
        description: `${r.pagos} título(s) quitado(s)${r.chequesCriados ? ` · ${r.chequesCriados} cheque(s) lançado(s) no Controle de Cheques` : ""}${isChequeTerceiro && chequesTerceiroSel.length ? ` · ${chequesTerceiroSel.length} cheque(s) de terceiro sendo alocados…` : ""}.`,
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
    });
  }

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar consolidado — {group.fornecedorNome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <div>
              <p className="text-xs text-indigo-700 font-medium">{group.itensIds?.length ?? 0} título(s) consolidado(s) · fechamento configurado no cadastro do fornecedor</p>
              <p className="text-[11px] text-indigo-600">{group.descricao}</p>
            </div>
            <span className="text-lg font-bold text-indigo-900">{formatBRL(total)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Data do pagamento</Label>
              <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta bancária</Label>
              <Select value={contaBancariaId != null ? String(contaBancariaId) : "none"} onValueChange={(v) => setContaBancariaId(v === "none" ? null : Number(v))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
          </div>

          {isChequeTerceiro && (
            <div className="border border-violet-200 bg-violet-50/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-violet-800 font-medium">Cheques recebidos disponíveis</Label>
                {chequesTerceiroSel.length > 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${
                    Math.abs(diffChequesTerceiro) <= 0.05 ? "text-green-700" :
                    diffChequesTerceiro > 0 ? "text-amber-700" : "text-red-700"
                  }`}>
                    Selecionado: {formatBRL(totalSelecionado)}
                    {Math.abs(diffChequesTerceiro) > 0.05 && (
                      diffChequesTerceiro > 0
                        ? ` (excede ${formatBRL(diffChequesTerceiro)})`
                        : ` (falta ${formatBRL(-diffChequesTerceiro)})`
                    )}
                    {Math.abs(diffChequesTerceiro) <= 0.05 && " ✓"}
                  </span>
                )}
              </div>
              {chequesDisponiveisQ?.isLoading ? (
                <div className="text-xs text-muted-foreground py-2">Buscando cheques disponíveis…</div>
              ) : chequesDisponiveis.length === 0 ? (
                <div className="text-xs text-violet-700 bg-violet-100 rounded p-2">
                  Nenhum cheque recebido disponível. Cadastre cheques na aba "Cheques Recebidos" do Controle de Cheques.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {chequesDisponiveis.map((c: any) => {
                    const sel = chequesTerceiroSel.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => setChequesTerceiroSel(prev =>
                          sel ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        )}
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
              {chequesTerceiroSel.length > 0 ? (
                <p className="text-[10px] text-violet-700">
                  {chequesTerceiroSel.length} cheque(s) selecionado(s) · ao confirmar, serão marcados como "Alocado" no Controle de Cheques Recebidos.
                </p>
              ) : (
                <p className="text-[10px] text-violet-600">Selecione um ou mais cheques que somem o valor a pagar ({formatBRL(total)}).</p>
              )}
            </div>
          )}

          {isCheque && (
            <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Cheques ({parcelas.length}x) — digite o número de cada um</Label>
                <span className={`text-xs font-semibold ${Math.abs(diffTotal) > 0.05 ? "text-red-600" : "text-green-700"}`}>
                  Soma: {formatBRL(totalParcelas)}{Math.abs(diffTotal) > 0.05 ? ` (dif. ${formatBRL(diffTotal)})` : ""}
                </span>
              </div>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr] items-end gap-2 bg-white border border-blue-100 rounded-md px-2 py-2">
                  <span className="text-xs font-semibold text-blue-700 pb-2">{i + 1}/{parcelas.length}</span>
                  <div>
                    <Label className="text-[10px]">Nº do cheque</Label>
                    <Input value={p.numero} onChange={(e) => updateParcela(i, { numero: e.target.value })} placeholder="Ex.: 000123" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Valor</Label>
                    <Input type="number" step="0.01" value={p.valor}
                      onChange={(e) => updateParcela(i, { valor: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Vencimento</Label>
                    <Input type="date" value={p.dataVencimento} onChange={(e) => updateParcela(i, { dataVencimento: e.target.value })} />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-blue-700">Ao confirmar, esses cheques são registrados automaticamente no Controle de Cheques (vinculados a {group.fornecedorNome}) para conferência posterior na Conciliação Bancária.</p>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={payMut.isPending}>Cancelar</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSubmit} disabled={payMut.isPending}>
            {payMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
