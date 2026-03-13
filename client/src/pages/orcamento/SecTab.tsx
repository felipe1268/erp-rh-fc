import React, { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Upload, Trash2, ChevronDown, ChevronRight, Loader2,
  FileSpreadsheet, CheckCircle2, Clock, Send, XCircle, Percent,
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function fBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: any) { return parseFloat(v || "0") || 0; }

type Fase = "elaboracao" | "enviada" | "aprovada" | "recusada";

const FASE_CFG: Record<Fase, { label: string; icon: React.ReactNode; cls: string }> = {
  elaboracao: { label: "Elaboração", icon: <Clock className="h-3 w-3" />,       cls: "bg-slate-100 text-slate-700 border-slate-200" },
  enviada:    { label: "Enviada",    icon: <Send className="h-3 w-3" />,         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  aprovada:   { label: "Aprovada",   icon: <CheckCircle2 className="h-3 w-3" />, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  recusada:   { label: "Recusada",   icon: <XCircle className="h-3 w-3" />,      cls: "bg-red-100 text-red-700 border-red-200" },
};
const FASES: Fase[] = ["elaboracao", "enviada", "aprovada", "recusada"];

interface Props {
  orcamentoId: number;
  companyId: number;
  totalCustoBase: number;
  totalVendaBase: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function SecTab({ orcamentoId, companyId, totalCustoBase, totalVendaBase }: Props) {
  const utils = trpc.useUtils();
  const [expandido, setExpandido] = useState<number | null>(null);
  const [novaSecModal, setNovaSecModal] = useState(false);
  const [novaDesc, setNovaDesc] = useState("");
  const [excluirId, setExcluirId] = useState<number | null>(null);
  const [bdiManual, setBdiManual] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: secs = [], isLoading } = trpc.orcamento.secListar.useQuery(
    { orcamentoId }, { enabled: !!orcamentoId }
  );

  const criarMut      = trpc.orcamento.secCriar.useMutation({
    onSuccess: () => { utils.orcamento.secListar.invalidate(); setNovaSecModal(false); setNovaDesc(""); toast.success("SEC criada!"); },
    onError:   e  => toast.error(e.message),
  });
  const excluirMut    = trpc.orcamento.secExcluir.useMutation({
    onSuccess: () => { utils.orcamento.secListar.invalidate(); setExcluirId(null); toast.success("SEC excluída."); },
  });
  const faseMut       = trpc.orcamento.secAtualizarFase.useMutation({
    onSuccess: () => utils.orcamento.secListar.invalidate(),
    onError:   e  => toast.error(e.message),
  });
  const importarMut   = trpc.orcamento.secImportarPlanilha.useMutation({
    onSuccess: (r) => {
      utils.orcamento.secListar.invalidate();
      setImporting(null);
      toast.success(`${r.itemCount} itens importados.`);
    },
    onError: e => { setImporting(null); toast.error(e.message || "Erro ao importar."); },
  });
  const bdiMut        = trpc.orcamento.secAplicarBdi.useMutation({
    onSuccess: () => { utils.orcamento.secListar.invalidate(); toast.success("BDI aplicado."); },
    onError:   e  => toast.error(e.message),
  });

  const handleImportar = useCallback(async (secId: number, file: File) => {
    setImporting(secId);
    try {
      const base64 = await fileToBase64(file);
      await importarMut.mutateAsync({ secId, companyId, fileBase64: base64, fileName: file.name });
    } catch { setImporting(null); }
  }, [companyId, importarMut]);

  const handleAplicarBdi = (sec: any) => {
    const raw = bdiManual[sec.id] ?? "";
    const pct = parseFloat(raw.replace(",", "."));
    if (isNaN(pct) || pct <= 0 || pct >= 100) { toast.error("BDI inválido (ex: 35.92)"); return; }
    bdiMut.mutate({ secId: sec.id, bdiPercentual: pct / 100 });
  };

  // Totais consolidados
  const totalCustoSecs  = (secs as any[]).reduce((s, sec) => s + n(sec.totalCusto), 0);
  const totalVendaSecs  = (secs as any[]).reduce((s, sec) => s + n(sec.totalVenda), 0);
  const totalCustoGeral = totalCustoBase + totalCustoSecs;
  const totalVendaGeral = totalVendaBase + totalVendaSecs;
  const margemGeral     = totalVendaGeral > 0 ? (totalVendaGeral - totalCustoGeral) / totalVendaGeral : 0;
  const secsAprovadas   = (secs as any[]).filter(s => s.fase === "aprovada");

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Serviços Extras Contratuais</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {secs.length === 0 ? "Nenhuma SEC cadastrada" : `${secs.length} SEC${secs.length > 1 ? "s" : ""} — ${secsAprovadas.length} aprovada${secsAprovadas.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setNovaSecModal(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova SEC
        </Button>
      </div>

      {/* Resumo consolidado (quando há SECs) */}
      {secs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Orçamento Base</p>
            <p className="text-sm font-bold text-slate-800">{fBRL(totalVendaBase)}</p>
            <p className="text-[10px] text-slate-400">Custo: {fBRL(totalCustoBase)}</p>
          </div>
          <div className="rounded-lg border bg-amber-50 p-3">
            <p className="text-[10px] text-amber-600 uppercase font-semibold mb-1">Total SECs</p>
            <p className="text-sm font-bold text-amber-800">{fBRL(totalVendaSecs)}</p>
            <p className="text-[10px] text-amber-500">Custo: {fBRL(totalCustoSecs)}</p>
          </div>
          <div className="rounded-lg border bg-emerald-50 p-3">
            <p className="text-[10px] text-emerald-600 uppercase font-semibold mb-1">Venda Geral</p>
            <p className="text-sm font-bold text-emerald-800">{fBRL(totalVendaGeral)}</p>
            <p className="text-[10px] text-emerald-500">Custo: {fBRL(totalCustoGeral)}</p>
          </div>
          <div className="rounded-lg border bg-indigo-50 p-3">
            <p className="text-[10px] text-indigo-600 uppercase font-semibold mb-1">Margem Geral</p>
            <p className="text-sm font-bold text-indigo-800">{(margemGeral * 100).toFixed(2)}%</p>
            <p className="text-[10px] text-indigo-500">Resultado: {fBRL(totalVendaGeral - totalCustoGeral)}</p>
          </div>
        </div>
      )}

      {/* Lista de SECs */}
      {secs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center">
          <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Nenhuma SEC cadastrada</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Nova SEC" para adicionar um serviço extra contratual</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(secs as any[]).map((sec: any) => {
            const fase = (sec.fase ?? "elaboracao") as Fase;
            const cfg = FASE_CFG[fase];
            const custo = n(sec.totalCusto);
            const venda = n(sec.totalVenda);
            const bdi   = n(sec.bdiPercentual);
            const margem = venda > 0 ? (venda - custo) / venda : 0;
            const aberto = expandido === sec.id;

            return (
              <div key={sec.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                {/* Linha resumo */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandido(aberto ? null : sec.id)}
                >
                  {aberto ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}

                  <div className="flex items-center gap-2 min-w-[80px]">
                    <span className="font-mono font-bold text-sm text-slate-800">{sec.codigo}</span>
                  </div>

                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                    {cfg.icon} {cfg.label}
                  </span>

                  <p className="text-xs text-slate-500 flex-1 truncate">{sec.descricao}</p>

                  <div className="flex items-center gap-4 text-right shrink-0">
                    {venda > 0 ? (
                      <>
                        <div>
                          <p className="text-[10px] text-slate-400">Venda</p>
                          <p className="text-xs font-semibold text-emerald-700">{fBRL(venda)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Custo</p>
                          <p className="text-xs font-semibold text-slate-700">{fBRL(custo)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">BDI</p>
                          <p className="text-xs font-semibold text-amber-600">{(bdi * 100).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Margem</p>
                          <p className={`text-xs font-semibold ${margem >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {(margem * 100).toFixed(1)}%
                          </p>
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Planilha não importada</span>
                    )}
                  </div>

                  <button
                    className="ml-2 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    onClick={e => { e.stopPropagation(); setExcluirId(sec.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Painel expandido */}
                {aberto && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                    {/* Fase */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-2 block">Fase / Status</Label>
                      <div className="flex gap-2 flex-wrap">
                        {FASES.map(f => {
                          const c = FASE_CFG[f];
                          const ativo = fase === f;
                          return (
                            <button
                              key={f}
                              onClick={() => faseMut.mutate({ id: sec.id, fase: f })}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                                ${ativo ? c.cls + " ring-2 ring-offset-1 ring-current" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
                            >
                              {c.icon} {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Importar planilha */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-2 block">Planilha de Custo</Label>
                      <div className="flex items-center gap-2">
                        <input
                          ref={el => { fileRefs.current[sec.id] = el; }}
                          type="file"
                          accept=".xlsx,.xlsm,.xls"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleImportar(sec.id, f);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={importing === sec.id}
                          onClick={() => fileRefs.current[sec.id]?.click()}
                        >
                          {importing === sec.id
                            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Importando...</>
                            : <><Upload className="h-3.5 w-3.5 mr-1.5" /> {custo > 0 ? "Reimportar Planilha" : "Importar Planilha"}</>}
                        </Button>
                        {custo > 0 && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Custo: {fBRL(custo)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* BDI manual */}
                    {custo > 0 && (
                      <div>
                        <Label className="text-xs font-semibold text-slate-600 mb-2 block">BDI (%)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-32 h-8 text-sm"
                            placeholder={bdi > 0 ? (bdi * 100).toFixed(2) : "ex: 35.92"}
                            value={bdiManual[sec.id] ?? ""}
                            onChange={e => setBdiManual(prev => ({ ...prev, [sec.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" onClick={() => handleAplicarBdi(sec)}>
                            <Percent className="h-3.5 w-3.5 mr-1.5" /> Aplicar BDI
                          </Button>
                          {venda > 0 && (
                            <span className="text-xs text-slate-500">
                              → Venda: <strong className="text-emerald-700">{fBRL(venda)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mini resumo financeiro */}
                    {venda > 0 && (
                      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <TrendingDown className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Custo Direto</p>
                            <p className="text-xs font-bold text-slate-700">{fBRL(custo)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Venda (com BDI)</p>
                            <p className="text-xs font-bold text-emerald-700">{fBRL(venda)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Margem</p>
                            <p className={`text-xs font-bold ${margem >= 0 ? "text-indigo-700" : "text-red-600"}`}>
                              {(margem * 100).toFixed(2)}% — {fBRL(venda - custo)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Totais por fase (quando há SECs com dados) */}
      {secs.length > 0 && (secs as any[]).some(s => n(s.totalVenda) > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-600 mb-3">Breakdown por Fase</p>
          <div className="space-y-2">
            {FASES.map(f => {
              const secsF = (secs as any[]).filter(s => s.fase === f);
              const total = secsF.reduce((sum, s) => sum + n(s.totalVenda), 0);
              if (secsF.length === 0) return null;
              const cfg = FASE_CFG[f];
              return (
                <div key={f} className="flex items-center gap-3 text-xs">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.cls} w-28 justify-center`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-slate-500">{secsF.length} SEC{secsF.length > 1 ? "s" : ""}</span>
                  <span className="font-semibold text-slate-800 ml-auto">{fBRL(total)}</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-slate-100 flex justify-between">
              <span className="text-xs font-semibold text-slate-600">Total SECs Aprovadas</span>
              <span className="text-xs font-bold text-emerald-700">
                {fBRL(secsAprovadas.reduce((s, sec) => s + n(sec.totalVenda), 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova SEC */}
      <Dialog open={novaSecModal} onOpenChange={setNovaSecModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova SEC</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input
                className="mt-1"
                placeholder="ex: Adequações elétricas pavimento 3"
                value={novaDesc}
                onChange={e => setNovaDesc(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") criarMut.mutate({ orcamentoId, companyId, descricao: novaDesc || undefined }); }}
              />
              <p className="text-[10px] text-slate-400 mt-1">O código será gerado automaticamente: SEC_01, SEC_02...</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaSecModal(false)}>Cancelar</Button>
            <Button onClick={() => criarMut.mutate({ orcamentoId, companyId, descricao: novaDesc || undefined })}
              disabled={criarMut.isPending}>
              {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar SEC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!excluirId} onOpenChange={o => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir SEC?</AlertDialogTitle>
            <AlertDialogDescription>
              A SEC e todos os seus itens serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => excluirId && excluirMut.mutate({ id: excluirId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
