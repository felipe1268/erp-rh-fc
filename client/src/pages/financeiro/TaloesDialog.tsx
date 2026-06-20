import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { BookCopy, Plus, Trash2, CheckCircle2, AlertTriangle, Ban, Receipt, X } from "lucide-react";

type Conta = { id: number; banco?: string; agencia?: string; conta?: string };

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  usada: { label: "Usada", cls: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-500" },
  disponivel: { label: "Disponível", cls: "bg-green-50 text-green-700 border-green-300", dot: "bg-green-500" },
  perdida: { label: "Perdida", cls: "bg-red-50 text-red-700 border-red-400", dot: "bg-red-500" },
  cancelada: { label: "Cancelada", cls: "bg-amber-50 text-amber-700 border-amber-400", dot: "bg-amber-500" },
};

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TaloesDialog({
  open, onClose, conta, companyId,
}: { open: boolean; onClose: () => void; conta: Conta | null; companyId: number }) {
  const utils = trpc.useUtils();
  const taloesQ = trpc.cheques.listarTaloes.useQuery(
    { companyId, contaBancariaId: conta?.id ?? 0 },
    { enabled: open && !!conta && !!companyId }
  );
  const taloes = taloesQ.data ?? [];

  const [novoOpen, setNovoOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [numeroInicial, setNumeroInicial] = useState("");
  const [quantidadeFolhas, setQuantidadeFolhas] = useState("");
  const [folhaSel, setFolhaSel] = useState<{ talaoId: number; numero: number } | null>(null);
  const [excluirId, setExcluirId] = useState<number | null>(null);

  const refetch = () => { taloesQ.refetch(); utils.cheques.listarTaloes.invalidate(); };

  const criarMut = trpc.cheques.criarTalao.useMutation({
    onSuccess: () => {
      toast.success("Talão cadastrado!");
      setNovoOpen(false); setDescricao(""); setNumeroInicial(""); setQuantidadeFolhas("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const marcarMut = trpc.cheques.marcarFolha.useMutation({
    onSuccess: () => { setFolhaSel(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.cheques.excluirTalao.useMutation({
    onSuccess: () => { toast.success("Talão excluído."); setExcluirId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const numeroFinalPreview = useMemo(() => {
    const ini = parseInt(numeroInicial, 10);
    const qtd = parseInt(quantidadeFolhas, 10);
    if (!Number.isFinite(ini) || !Number.isFinite(qtd) || qtd < 1) return null;
    return ini + qtd - 1;
  }, [numeroInicial, quantidadeFolhas]);

  const handleCriar = () => {
    const ini = parseInt(numeroInicial, 10);
    const qtd = parseInt(quantidadeFolhas, 10);
    if (!Number.isFinite(ini) || ini < 0) { toast.error("Informe o nº do cheque inicial."); return; }
    if (!Number.isFinite(qtd) || qtd < 1) { toast.error("Informe a quantidade de folhas (mín. 1)."); return; }
    if (!conta) return;
    criarMut.mutate({
      companyId, contaBancariaId: conta.id,
      descricao: descricao.trim() || null, numeroInicial: ini, quantidadeFolhas: qtd,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookCopy className="h-5 w-5 text-[#1B2A4A]" />
              Talões de cheque — {conta?.banco || "Conta"}
              {conta?.agencia && <span className="text-sm font-normal text-muted-foreground">Ag. {conta.agencia} · C/C {conta.conta}</span>}
            </DialogTitle>
          </DialogHeader>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {Object.entries(STATUS_META).map(([k, m]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} /> {m.label}
              </span>
            ))}
          </div>

          {/* Botão novo talão / form */}
          {!novoOpen ? (
            <Button onClick={() => setNovoOpen(true)} className="bg-[#1B2A4A] hover:bg-[#243660] w-fit">
              <Plus className="h-4 w-4 mr-2" /> Novo talão
            </Button>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1B2A4A]">Novo talão</h3>
                <button onClick={() => setNovoOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <Label className="text-xs">Descrição (opcional)</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Talão 1 / 2026" />
                </div>
                <div>
                  <Label className="text-xs">Nº do cheque inicial *</Label>
                  <Input inputMode="numeric" value={numeroInicial}
                    onChange={(e) => setNumeroInicial(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ex.: 000101" />
                </div>
                <div>
                  <Label className="text-xs">Quantidade de folhas *</Label>
                  <Input inputMode="numeric" value={quantidadeFolhas}
                    onChange={(e) => setQuantidadeFolhas(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ex.: 20" />
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-muted-foreground">
                    {numeroFinalPreview != null ? <>Cheque final: <span className="font-semibold text-[#1B2A4A]">{numeroFinalPreview}</span></> : "—"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setNovoOpen(false)}>Cancelar</Button>
                <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#243660]" disabled={criarMut.isPending} onClick={handleCriar}>
                  {criarMut.isPending ? "Salvando..." : "Cadastrar talão"}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de talões */}
          {taloesQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando talões…</p>
          ) : taloes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum talão cadastrado nesta conta.</p>
          ) : (
            <div className="space-y-4">
              {taloes.map((t: any) => (
                <div key={t.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-[#1B2A4A]" />
                        {t.descricao || `Talão ${t.numeroInicial}–${t.numeroFinal}`}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cheques {t.numeroInicial} a {t.numeroFinal} · {t.quantidadeFolhas} folhas
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => setExcluirId(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Resumo */}
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <Badge variant="outline" className="bg-slate-50">Usadas: {t.resumo.usadas}</Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Disponíveis: {t.resumo.disponiveis}</Badge>
                    {t.resumo.perdidas > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-400">Perdidas: {t.resumo.perdidas}</Badge>}
                    {t.resumo.canceladas > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-400">Canceladas: {t.resumo.canceladas}</Badge>}
                  </div>

                  {/* Grade de folhas */}
                  <div className="flex flex-wrap gap-1.5">
                    {t.folhas.map((f: any) => {
                      const m = STATUS_META[f.status] || STATUS_META.disponivel;
                      const isSel = folhaSel?.talaoId === t.id && folhaSel?.numero === f.numero;
                      const title = f.status === "usada"
                        ? `Cheque ${f.numero} — usada${f.chequeFornecedor ? ` · ${f.chequeFornecedor}` : ""}${f.chequeValor != null ? ` · ${fmtBRL(f.chequeValor)}` : ""}`
                        : `Folha ${f.numero} — ${m.label}`;
                      return (
                        <button key={f.numero} type="button" title={title}
                          disabled={f.status === "usada"}
                          onClick={() => setFolhaSel(isSel ? null : { talaoId: t.id, numero: f.numero })}
                          className={`px-2 py-1 rounded border text-[11px] font-mono tabular-nums transition-colors ${m.cls} ${isSel ? "ring-2 ring-[#1B2A4A]" : ""} ${f.status === "usada" ? "opacity-70 cursor-default" : "hover:brightness-95"}`}>
                          {f.numero}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ações da folha selecionada */}
                  {folhaSel?.talaoId === t.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 border p-2.5">
                      <span className="text-xs font-medium">Folha nº {folhaSel.numero}:</span>
                      <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50" disabled={marcarMut.isPending}
                        onClick={() => marcarMut.mutate({ id: t.id, numeroFolha: folhaSel.numero, status: "perdida" })}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Perdida
                      </Button>
                      <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" disabled={marcarMut.isPending}
                        onClick={() => marcarMut.mutate({ id: t.id, numeroFolha: folhaSel.numero, status: "cancelada" })}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Cancelada
                      </Button>
                      <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" disabled={marcarMut.isPending}
                        onClick={() => marcarMut.mutate({ id: t.id, numeroFolha: folhaSel.numero, status: "disponivel" })}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Disponível
                      </Button>
                      <button onClick={() => setFolhaSel(null)} className="text-gray-400 hover:text-gray-600 ml-auto"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluirId != null} onOpenChange={(o) => { if (!o) setExcluirId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir talão?</AlertDialogTitle>
            <AlertDialogDescription>
              O talão será removido do controle (os cheques já lançados não são afetados). Esta ação pode ser refeita recadastrando o talão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (excluirId != null) excluirMut.mutate({ id: excluirId }); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
