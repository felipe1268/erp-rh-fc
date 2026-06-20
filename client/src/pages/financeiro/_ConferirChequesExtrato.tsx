import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Loader2, Info, RefreshCw, CheckCircle2, AlertTriangle, Link2,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * Rev. 3372 — PAINEL DE PRÉ-CONFIRMAÇÃO "CONFERIR CHEQUES COM O EXTRATO".
 * Mostra, na Conciliação Bancária, os cheques que o banco compensou E o controle
 * já diz "compensado" mas que ainda NÃO foram carimbados como conciliados, separados
 * em três grupos:
 *   ✅ Match forte (nº + valor)  → pré-selecionado, é só revisar e confirmar;
 *   ⚠️ Match fraco (valor + data) → NÃO pré-selecionado ("confira antes");
 *   ❗ Divergências (banco compensou, controle não) → só ALERTA, nunca selecionável.
 * Honra "conciliação SÓ SUGESTIVA": nada é marcado sem o usuário confirmar no
 * AlertDialog de revisão. O backend (`conferirExtrato`) só grava o selo de
 * conferência (conciliado=1 + data) nos IDs marcados — re-validados lá; nenhuma
 * baixa financeira acontece aqui.
 * ──────────────────────────────────────────────────────────────────────────── */

const brl = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const fmtData = (d: any) => {
  const s = String(d || "").slice(0, 10);
  const [y, m, dd] = s.split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : s;
};

type ChequeRow = {
  id: number;
  numeroCheque: any;
  fornecedorNome: string | null;
  valor: number;
  status: string;
  forte: boolean;
  dataCompensacao: any;
  dataVencimento: any;
  dataExtrato: any;
  mes: number | null;
  ano: number | null;
};

export function ConferirChequesExtratoDialog({
  open, onOpenChange, companyId, ano, mes, periodoLabel, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: number;
  ano: number;
  mes?: number | null;
  periodoLabel?: string;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmar, setConfirmar] = useState(false);

  const { data, isFetching, isError, error, refetch } =
    (trpc as any).cheques.verificarExtratoResumo.useQuery(
      { companyId, ano, ...(mes != null ? { mes } : {}) },
      { enabled: open && !!companyId, refetchOnWindowFocus: false },
    );

  const aConferir: ChequeRow[] = data?.aConferirLista ?? [];
  const divergencias: any[] = data?.divergenciasLista ?? [];
  const fortes = useMemo(() => aConferir.filter((c) => c.forte), [aConferir]);
  const fracos = useMemo(() => aConferir.filter((c) => !c.forte), [aConferir]);

  // Semeia a seleção SEMPRE que a lista muda: match forte vem pré-marcado; match
  // fraco desmarcado (o usuário decide caso a caso). Um único effect chaveado pela
  // identidade dos ids (evita corrida de hidratação em cache hit).
  const fortesKey = useMemo(() => fortes.map((c) => c.id).sort((a, b) => a - b).join(","), [fortes]);
  useEffect(() => {
    setSel(new Set(fortes.map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fortesKey, open]);

  const conferirMut = (trpc as any).cheques.conferirExtrato.useMutation({
    onSuccess: async (res: any) => {
      toast({
        title: "Conferência registrada!",
        description: `${res?.conferidos ?? 0} cheque(s) marcado(s) como conciliado(s) no extrato.`,
      });
      await Promise.all([
        utils?.cheques?.verificarExtratoResumo?.invalidate?.(),
        utils?.cheques?.listar?.invalidate?.(),
      ].filter(Boolean));
      setConfirmar(false);
      refetch();
      onDone?.();
    },
    onError: (e: any) => {
      setConfirmar(false);
      toast({ title: "Erro ao conferir", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    },
  });

  const toggle = (id: number) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleGrupo = (linhas: ChequeRow[], marcar: boolean) =>
    setSel((prev) => {
      const n = new Set(prev);
      for (const c of linhas) (marcar ? n.add(c.id) : n.delete(c.id));
      return n;
    });

  const selecionados = useMemo(() => aConferir.filter((c) => sel.has(c.id)), [aConferir, sel]);
  const valorSel = useMemo(() => selecionados.reduce((s, c) => s + (Number(c.valor) || 0), 0), [selecionados]);

  function aplicar() {
    const ids = selecionados.map((c) => c.id);
    if (ids.length === 0) return;
    conferirMut.mutate({ companyId, ano, ...(mes != null ? { mes } : {}), ids });
  }

  const renderLinha = (c: ChequeRow) => (
    <label
      key={c.id}
      className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50/70 transition cursor-pointer"
    >
      <Checkbox checked={sel.has(c.id)} onCheckedChange={() => toggle(c.id)} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-700 truncate">
          Cheque nº {c.numeroCheque ?? "—"}
          {c.fornecedorNome ? <span className="font-normal text-slate-500"> · {c.fornecedorNome}</span> : null}
        </span>
        <span className="block text-[11px] text-slate-400">
          {c.dataExtrato ? `Compensado no banco em ${fmtData(c.dataExtrato)}` : "Compensado"}
          {c.dataVencimento ? ` · venc. ${fmtData(c.dataVencimento)}` : ""}
        </span>
      </span>
      <span className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">{brl(c.valor)}</span>
    </label>
  );

  const Grupo = ({
    titulo, desc, linhas, tone, icon: Icon,
  }: {
    titulo: string; desc: string; linhas: ChequeRow[]; tone: "forte" | "fraco"; icon: any;
  }) => {
    if (linhas.length === 0) return null;
    const todosMarcados = linhas.every((c) => sel.has(c.id));
    const ring = tone === "forte" ? "border-emerald-200" : "border-amber-200";
    const head = tone === "forte" ? "bg-emerald-50/70 text-emerald-800" : "bg-amber-50/70 text-amber-800";
    const total = linhas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    return (
      <div className={`rounded-lg border ${ring} bg-white overflow-hidden`}>
        <div className={`flex items-center gap-2 px-3 py-2 ${head}`}>
          <Icon className="w-4 h-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">{titulo} · {linhas.length}</span>
            <span className="block text-[10.5px] opacity-80">{desc}</span>
          </span>
          <span className="text-xs font-bold tabular-nums shrink-0">{brl(total)}</span>
          <button
            type="button"
            onClick={() => toggleGrupo(linhas, !todosMarcados)}
            className="text-[10.5px] underline underline-offset-2 hover:opacity-80 shrink-0 ml-1"
          >
            {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
          </button>
        </div>
        <div className="divide-y divide-slate-50">{linhas.map(renderLinha)}</div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-teal-600 to-emerald-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                <Link2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogHeader className="space-y-0 text-left">
                  <DialogTitle className="text-sm font-semibold text-white">Conferir cheques com o extrato</DialogTitle>
                  <DialogDescription className="text-[11px] text-emerald-100">
                    Cheques compensados, ainda não conciliados{periodoLabel ? ` · ${periodoLabel}` : ""} — você revisa e confirma
                  </DialogDescription>
                </DialogHeader>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                title="Atualizar"
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            {isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Não foi possível carregar a conferência: {(error as any)?.message ?? "tente novamente."}
              </div>
            )}

            {isFetching && !data && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}

            {!isFetching && data && aConferir.length === 0 && divergencias.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                Tudo conferido neste período. Nenhum cheque compensado pendente de conciliação.
              </div>
            )}

            <Grupo
              titulo="Match forte (nº do cheque + valor)"
              desc="Conferência segura — pré-selecionado. Revise e confirme."
              linhas={fortes}
              tone="forte"
              icon={ShieldCheck}
            />

            <Grupo
              titulo="Match fraco (valor + data)"
              desc="O banco não trouxe o nº do cheque — confira antes de marcar."
              linhas={fracos}
              tone="fraco"
              icon={AlertTriangle}
            />

            {divergencias.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50/70 text-red-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">Divergências · {divergencias.length}</span>
                    <span className="block text-[10.5px] opacity-80">Banco compensou, mas o controle não diz "compensado". Análise manual — nunca marcado automaticamente.</span>
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {divergencias.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-700 truncate">
                          Cheque nº {d.numeroCheque ?? "—"}
                          {d.fornecedorNome ? <span className="font-normal text-slate-500"> · {d.fornecedorNome}</span> : null}
                        </span>
                        <span className="block text-[11px] text-red-500">
                          Controle: {d.status || "—"}{d.dataExtrato ? ` · banco compensou em ${fmtData(d.dataExtrato)}` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">{brl(d.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-1.5 text-[11px] text-slate-400 pt-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Marcar como conferido só carimba o cheque como conciliado no extrato (e preenche a data de
                compensação) — não dá baixa financeira nem altera o status do controle. Nada é aplicado sem você confirmar.
              </span>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-500">
              {selecionados.length > 0
                ? <><strong className="text-slate-700">{selecionados.length}</strong> selecionado(s) · {brl(valorSel)}</>
                : "Nenhum cheque selecionado"}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button
                type="button"
                onClick={() => setConfirmar(true)}
                disabled={selecionados.length === 0 || conferirMut.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Conferir {selecionados.length || ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !conferirMut.isPending) setConfirmar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar conferência?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai marcar <strong>{selecionados.length}</strong> cheque(s) como conciliado(s) no extrato,
              somando <strong>{brl(valorSel)}</strong>. Isso só registra o selo de conferência (e a data de
              compensação) — não dá baixa financeira nem muda o status do controle. Os cheques de
              <strong> match fraco</strong> que você marcou também serão incluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={conferirMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); aplicar(); }}
              disabled={conferirMut.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {conferirMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Conferindo…</> : "Confirmar e marcar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
