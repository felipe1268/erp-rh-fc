import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight, Banknote, RotateCcw, Loader2, Save, Info } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * Exceção por lançamento (Rev. 3351) — marca uma linha do extrato como:
 *   • "efetivo"  → caixa real (ex.: empréstimo / capitalização entre empresas),
 *                  mesmo que o CNPJ esteja na base de movimentação interna;
 *   • "interno"  → movimentação interna (mesmo que o CNPJ NÃO esteja na base);
 *   • "auto"     → volta a seguir a base de CNPJs (remove a exceção).
 * SIMÉTRICO: vale para entrada E saída. READ-ONLY p/ a conciliação — só
 * classifica; nada concilia/baixa aqui.
 * ──────────────────────────────────────────────────────────────────────────── */

export type LancNaturezaLinha = {
  id: number;
  descricao?: string | null;
  valor?: number | null;
  interno?: boolean;
  overrideNatureza?: string | null;
  overrideMotivo?: string | null;
};

const brl = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

type Opt = "efetivo" | "interno" | "auto";

export function NaturezaOverrideDialog({
  open, onOpenChange, companyId, line, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: number;
  line: LancNaturezaLinha | null;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [natureza, setNatureza] = useState<Opt>("efetivo");
  const [motivo, setMotivo] = useState("");

  // Pré-preenche com o estado atual da linha sempre que abrir/trocar de linha.
  useEffect(() => {
    if (!open || !line) return;
    const atual = (line.overrideNatureza as Opt | null) || null;
    if (atual === "efetivo" || atual === "interno" || atual === "auto") setNatureza(atual);
    else setNatureza(line.interno ? "efetivo" : "interno");
    setMotivo(line.overrideMotivo || "");
  }, [open, line]);

  const mut = (trpc as any).financial.setLancamentoNatureza.useMutation({
    onSuccess: (_d: any, vars: any) => {
      toast({
        title: "Classificação atualizada",
        description: vars?.natureza === "auto"
          ? "Exceção removida — o lançamento volta a seguir a base de CNPJs."
          : vars?.natureza === "efetivo"
            ? "Lançamento marcado como caixa real (efetivo)."
            : "Lançamento marcado como movimentação interna.",
      });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: any) => {
      toast({ title: "Não foi possível salvar", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    },
  });

  if (!line) return null;
  const v = Number(line.valor) || 0;
  const isEntrada = v >= 0;
  const precisaMotivo = natureza !== "auto";
  const motivoOk = !precisaMotivo || motivo.trim().length > 0;

  const salvar = () => {
    if (!motivoOk || mut.isPending) return;
    mut.mutate({
      companyId,
      lineId: line.id,
      natureza,
      motivo: natureza === "auto" ? undefined : motivo.trim(),
    });
  };

  const OPTS: { key: Opt; label: string; desc: string; icon: any; ring: string; bg: string; text: string }[] = [
    { key: "efetivo", label: "Caixa real (efetivo)", desc: "Ex.: empréstimo, capitalização. Conta no caixa real.", icon: Banknote, ring: "ring-emerald-400 border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700" },
    { key: "interno", label: "Movimentação interna", desc: "Transf. entre empresas do grupo. NÃO conta no caixa real.", icon: ArrowLeftRight, ring: "ring-indigo-400 border-indigo-300", bg: "bg-indigo-50", text: "text-indigo-700" },
    { key: "auto", label: "Automático (seguir base)", desc: "Remove a exceção — classifica pela base de CNPJs.", icon: RotateCcw, ring: "ring-slate-400 border-slate-300", bg: "bg-slate-50", text: "text-slate-700" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-sm font-semibold text-white">Classificar lançamento</DialogTitle>
                <DialogDescription className="text-[11px] text-indigo-100">Caixa real × movimentação interna — só conferência, não concilia</DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Resumo da linha */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <p className="text-xs text-slate-700 break-words line-clamp-2">{line.descricao || "—"}</p>
            <p className={`mt-1 text-sm font-bold tabular-nums ${isEntrada ? "text-emerald-600" : "text-red-600"}`}>
              {isEntrada ? "▼ Entrada" : "▲ Saída"} · {brl(Math.abs(v))}
            </p>
          </div>

          {/* Opções de natureza */}
          <div className="space-y-2">
            {OPTS.map((o) => {
              const Icon = o.icon;
              const sel = natureza === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setNatureza(o.key)}
                  className={`w-full flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${sel ? `${o.ring} ${o.bg} ring-2` : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${sel ? `${o.bg} ${o.text}` : "bg-slate-100 text-slate-400"}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${sel ? o.text : "text-slate-700"}`}>{o.label}</span>
                    <span className="block text-[11px] text-slate-500 leading-snug">{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Motivo */}
          {precisaMotivo && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo *</label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={natureza === "efetivo" ? "Ex.: empréstimo da holding, capitalização…" : "Ex.: transferência para a obra X do grupo…"}
                rows={2}
                className="mt-1 text-sm"
              />
              {!motivoOk && <p className="text-[11px] text-red-500 mt-1">Informe o motivo da exceção.</p>}
            </div>
          )}

          <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>A classificação vale só para esta linha e é simétrica (entrada e saída). Não altera nem concilia o lançamento.</span>
          </div>
        </div>

        <DialogFooter className="px-5 pb-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={mut.isPending || !motivoOk}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {mut.isPending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando…</>
              : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Selo pequeno indicando que a linha tem exceção manual aplicada. */
export function NaturezaBadge({ natureza }: { natureza?: string | null }) {
  if (natureza === "efetivo") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium" title="Marcado manualmente como caixa real">efetivo</span>;
  }
  if (natureza === "interno") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-1.5 py-0.5 text-[10px] font-medium" title="Marcado manualmente como movimentação interna">interno</span>;
  }
  return null;
}
