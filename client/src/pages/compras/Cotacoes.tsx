import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { normalizarTexto } from "@shared/textNormalization";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, FileText, ChevronRight, ChevronDown, Loader2, CheckCircle, X, XCircle, Building2, Trophy, UserPlus, Save, BarChart3, ChevronsUpDown, Paperclip, ExternalLink, AlertTriangle, TrendingDown, Package, Undo2, History, Link2, RefreshCw, Phone, Mail, User, Smartphone, Sparkles, Star, ShieldCheck, ShieldAlert, Settings, DollarSign, Pencil, Check, ClipboardList, FileSearch, ShoppingCart, RotateCcw } from "lucide-react";
import { TIPOS_PAGAMENTO, getTipoPagamentoInfo, calcularParcelas, formatCurrency } from "../../../../shared/paymentConditions";
import { PurchaseTimeline, TimelineBadge } from "@/components/compras/PurchaseTimeline";

function parseBRNumber(v: string): number {
  if (!v) return 0;
  const s = v.trim();
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s.replace(/,/g, "")) || 0;
  }
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function SaldosRealocacaoPanel({ companyId, obraId, cotacaoId, deficit, showContent, onAcao, onCoberto, userId, userName }: {
  companyId: number; obraId?: number; cotacaoId?: number; deficit: number; showContent?: boolean; onAcao?: () => void; onCoberto?: () => void; userId?: number; userName?: string;
}) {
  const q = trpc.compras.buscarSaldosRealocacao.useQuery(
    { companyId, obraId, cotacaoId, deficit },
    { enabled: companyId > 0 && deficit > 0 }
  );
  const debitarRisco = trpc.compras.debitarDoRisco.useMutation({
    onSuccess: (d) => {
      toast.success(`Debitado do RISCO! Reserva restante: ${fmt(d.novoDisponivel)}${d.ocsAprovadas ? " — OC aprovada automaticamente." : ""}`);
      setValorDebito("");
      q.refetch();
      onAcao?.();
      if (d.ocsAprovadas) onCoberto?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const reverterDebito = trpc.compras.reverterDebitoRisco.useMutation({
    onSuccess: (d) => {
      toast.success(`Débito revertido! ${fmt(d.valorRestituido)} devolvidos à reserva.`);
      setDesfazerTarget(null);
      setSenhaMasterCot("");
      q.refetch();
      onAcao?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const solicitarAutorizacao = trpc.compras.solicitarAutorizacaoCompra.useMutation({
    onSuccess: () => {
      toast.success("Solicitação de autorização enviada ao usuário master.");
      onAcao?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const confirmarRealocacao = trpc.compras.confirmarRealocacaoSobras.useMutation({
    onSuccess: (d) => {
      if (d.cobreDeficit) {
        toast.success(`Realocação confirmada! ${fmt(d.totalSobrasRealocadas)} de sobras${d.riscoDebitado > 0 ? ` + ${fmt(d.riscoDebitado)} do risco` : ""} cobrem o déficit.${d.ocsAprovadas ? " OC aprovada automaticamente." : ""}`);
      } else {
        toast.success(`Realocação parcial: ${fmt(d.totalCoberto)} cobertos de ${fmt(deficit)}.`);
      }
      q.refetch();
      onAcao?.();
      if (d.cobreDeficit) onCoberto?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const [valorDebito, setValorDebito] = useState("");
  const [sobrasSel, setSobrasSel] = useState<Set<number>>(new Set());
  const [desfazerTarget, setDesfazerTarget] = useState<{ id: number; valor: number } | null>(null);
  const [senhaMasterCot, setSenhaMasterCot] = useState("");

  useEffect(() => {
    if (q.data?.cobertoPorRisco) onCoberto?.();
  }, [q.data?.cobertoPorRisco]);

  if (!showContent) return null;
  if (q.isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-red-400" /></div>;
  if (!q.data) return null;

  const { risco, sobras, totalSobras, semCobertura, totalDebitadoEstaCotacao, debitosEstaCotacao } = q.data;
  const deficitRestante = deficit;
  // Quanto ainda pode debitar = déficit − já debitado p/ esta cotação, e não mais que o disponível
  const debitarMax = Math.min(risco.disponivel, Math.max(0, deficit - totalDebitadoEstaCotacao));
  const cotacaoCoberta = totalDebitadoEstaCotacao >= deficit - 0.01;

  const totalSobrasSel = sobras.filter((_, i) => sobrasSel.has(i)).reduce((s, x) => s + x.sobra, 0);

  function toggleSobra(i: number) {
    setSobrasSel(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function selecionarSuficiente() {
    let acc = 0;
    const sel = new Set<number>();
    for (let i = 0; i < sobras.length; i++) {
      if (acc >= deficitRestante) break;
      sel.add(i);
      acc += sobras[i].sobra;
    }
    setSobrasSel(sel);
  }

  const valorDebitoNum = parseFloat(valorDebito.replace(",", ".")) || 0;

  return (
    <div className="space-y-4">

      {/* ── CAMADA 1: RISCO BDI ────────────────────────────────── */}
      <div className={`rounded-lg border p-3 space-y-2 ${risco.disponivel > 0 ? "border-orange-200 bg-orange-50/60" : "border-gray-200 bg-gray-50/60 opacity-60"}`}>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${risco.disponivel > 0 ? "bg-orange-400" : "bg-gray-300"}`} />
          <p className="text-xs font-semibold text-gray-800">Reserva de Risco — BDI (DI-08)</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Reserva inicial</p>
            <p className="font-bold text-gray-700">{fmt(risco.inicial)}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Já debitado</p>
            <p className="font-bold text-red-600">{fmt(risco.usado)}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Disponível</p>
            <p className={`font-bold ${risco.disponivel > 0 ? "text-orange-600" : "text-gray-400"}`}>{fmt(risco.disponivel)}</p>
          </div>
        </div>

        {/* Débitos já feitos para esta cotação */}
        {debitosEstaCotacao && debitosEstaCotacao.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-orange-700 font-semibold">Débitos desta cotação</p>
            {debitosEstaCotacao.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between bg-orange-100/70 rounded px-2 py-1 text-xs">
                <div>
                  <span className="font-semibold text-orange-800">{fmt(Number(d.valor))}</span>
                  {d.observacao && <span className="text-orange-600 ml-2 truncate max-w-xs">{d.observacao}</span>}
                </div>
                <Button size="sm" variant="ghost"
                  onClick={() => { setDesfazerTarget({ id: d.id, valor: Number(d.valor) }); setSenhaMasterCot(""); }}
                  className="h-5 text-[10px] text-red-600 hover:bg-red-100 hover:text-red-700 px-1.5 gap-0.5">
                  <Undo2 className="h-3 w-3" /> Desfazer
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Input de novo débito — só aparece se ainda há saldo a cobrir */}
        {!cotacaoCoberta && risco.disponivel > 0 && debitarMax > 0 && risco.orcamentoId ? (
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
              <input
                type="number"
                min={0}
                max={debitarMax}
                step={0.01}
                value={valorDebito}
                onChange={e => setValorDebito(e.target.value)}
                placeholder={`Máx. ${fmt(debitarMax)}`}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-orange-300 rounded bg-white outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <Button size="sm" disabled={valorDebitoNum <= 0 || valorDebitoNum > debitarMax + 0.01 || debitarRisco.isPending}
              onClick={() => debitarRisco.mutate({ companyId, obraId, orcamentoId: risco.orcamentoId!, cotacaoId, valor: valorDebitoNum, deficit, observacao: `Débito automático — Cotação #${cotacaoId}` })}
              className="h-7 bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1 whitespace-nowrap">
              {debitarRisco.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Debitar do Risco
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => setValorDebito(String(debitarMax.toFixed(2)))}
              className="h-7 text-xs text-orange-700 hover:bg-orange-100 whitespace-nowrap">
              Usar tudo
            </Button>
          </div>
        ) : cotacaoCoberta ? (
          <p className="text-[11px] text-green-700 italic font-medium bg-green-50 rounded px-2 py-1">✓ Déficit desta cotação já coberto integralmente pela reserva de risco.</p>
        ) : risco.inicial === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Nenhuma reserva de risco cadastrada no BDI desta obra.</p>
        ) : (
          <p className="text-[11px] text-orange-700 italic font-medium">Reserva de risco esgotada.</p>
        )}
      </div>

      {/* ── CAMADA 2: SOBRAS DE OCs ─────────────────────────────── */}
      <div className={`rounded-lg border p-3 space-y-2 ${sobras.length > 0 ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-gray-50/40 opacity-60"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${sobras.length > 0 ? "bg-blue-400" : "bg-gray-300"}`} />
            <p className="text-xs font-semibold text-gray-800">Sobras de atividades já compradas</p>
          </div>
          {sobras.length > 0 && (
            <Button size="sm" variant="ghost" onClick={selecionarSuficiente} className="h-6 text-[11px] text-blue-700 hover:bg-blue-100 px-2">
              Selecionar suficientes
            </Button>
          )}
        </div>
        {sobras.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Nenhuma atividade comprada com sobra encontrada.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="text-left py-1 pr-2 w-6" />
                    <th className="text-left py-1 pr-3 text-blue-700 font-semibold">OC</th>
                    <th className="text-left py-1 pr-3 text-blue-700 font-semibold">Descrição</th>
                    <th className="text-right py-1 pr-3 text-blue-700 font-semibold">Meta</th>
                    <th className="text-right py-1 pr-3 text-blue-700 font-semibold">Comprado</th>
                    <th className="text-right py-1 text-blue-700 font-semibold">Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {sobras.map((s, i) => (
                    <tr key={i} className={`border-b border-blue-100 cursor-pointer hover:bg-blue-50 ${sobrasSel.has(i) ? "bg-blue-50" : ""}`} onClick={() => toggleSobra(i)}>
                      <td className="py-1.5 pr-2">
                        <input type="checkbox" readOnly checked={sobrasSel.has(i)} className="accent-blue-600 cursor-pointer" />
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-blue-700">{s.ocNumero}</td>
                      <td className="py-1.5 pr-3 text-gray-700">{s.descricao} <span className="text-gray-400">{s.unidade}</span></td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(s.vlrMeta)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(s.vlrComprado)}</td>
                      <td className="py-1.5 text-right font-bold text-emerald-700">{fmt(s.sobra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sobrasSel.size > 0 && (
              <div className="space-y-2 pt-2 border-t border-blue-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-blue-800">
                    <span className="font-bold">{fmt(totalSobrasSel)}</span> selecionados de <span className="font-bold">{fmt(totalSobras)}</span> disponíveis
                    {totalSobrasSel >= deficitRestante
                      ? <span className="ml-2 text-emerald-700 font-semibold">✓ Cobre o déficit</span>
                      : <span className="ml-2 text-orange-600"> — faltam {fmt(deficitRestante - totalSobrasSel)}</span>
                    }
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setSobrasSel(new Set())} className="h-6 text-[11px] text-gray-500 px-2">Limpar</Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {totalSobrasSel >= deficitRestante ? (
                    <Button size="sm"
                      disabled={confirmarRealocacao.isPending}
                      onClick={() => obraId && cotacaoId && confirmarRealocacao.mutate({
                        companyId, obraId, cotacaoId, deficit,
                        sobrasIndices: [...sobrasSel],
                        completarComRisco: false,
                        usuarioId: userId ?? 0,
                        usuarioNome: userName,
                      })}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5">
                      {confirmarRealocacao.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Confirmar Realocação
                    </Button>
                  ) : (
                    <>
                      {risco.disponivel > 0 && risco.disponivel >= (deficitRestante - totalSobrasSel - 0.01) && (
                        <Button size="sm"
                          disabled={confirmarRealocacao.isPending}
                          onClick={() => obraId && cotacaoId && confirmarRealocacao.mutate({
                            companyId, obraId, cotacaoId, deficit,
                            sobrasIndices: [...sobrasSel],
                            completarComRisco: true,
                            usuarioId: userId ?? 0,
                            usuarioNome: userName,
                          })}
                          className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1.5">
                          {confirmarRealocacao.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          Sobras + Completar com Risco ({fmt(deficitRestante - totalSobrasSel)})
                        </Button>
                      )}
                      <Button size="sm"
                        disabled={confirmarRealocacao.isPending}
                        onClick={() => obraId && cotacaoId && confirmarRealocacao.mutate({
                          companyId, obraId, cotacaoId, deficit,
                          sobrasIndices: [...sobrasSel],
                          completarComRisco: false,
                          usuarioId: userId ?? 0,
                          usuarioNome: userName,
                        })}
                        className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5">
                        {confirmarRealocacao.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        Confirmar só Sobras ({fmt(totalSobrasSel)})
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal Desfazer Débito — requer senha Master ──────────── */}
      {desfazerTarget && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
            <p className="text-xs font-bold text-red-800">Desfazer débito de {fmt(desfazerTarget.valor)}</p>
          </div>
          <p className="text-[11px] text-red-700">Esta operação requer a senha do Administrador Master.</p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="Senha do ADM Master"
              value={senhaMasterCot}
              onChange={e => setSenhaMasterCot(e.target.value)}
              autoComplete="off"
              className="flex-1 h-8 text-sm border border-red-300 rounded-lg px-3 bg-white text-gray-900 outline-none focus:ring-1 focus:ring-red-400"
            />
            <Button size="sm" variant="destructive"
              disabled={!senhaMasterCot.trim() || reverterDebito.isPending}
              onClick={() => reverterDebito.mutate({ id: desfazerTarget.id, companyId, senhaMaster: senhaMasterCot.trim() })}
              className="h-8 text-xs gap-1 whitespace-nowrap">
              {reverterDebito.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDesfazerTarget(null); setSenhaMasterCot(""); }} className="h-8 text-xs text-gray-500">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── CAMADA 3: SEM COBERTURA → AUTORIZAÇÃO MASTER ─────────── */}
      {semCobertura && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-red-800">Sem cobertura disponível — necessária autorização</p>
          </div>
          <p className="text-[11px] text-red-600">
            Não há saldo no RISCO (DI-08) nem sobras em atividades compradas para cobrir o déficit de {fmt(deficit)}.
            Clique abaixo para solicitar aprovação do usuário master antes de liberar a compra.
          </p>
          <Button size="sm"
            disabled={solicitarAutorizacao.isPending}
            onClick={() => cotacaoId && solicitarAutorizacao.mutate({ companyId, cotacaoId, deficit })}
            className="h-7 bg-red-600 hover:bg-red-700 text-white text-xs gap-1">
            {solicitarAutorizacao.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
            Solicitar Autorização do Master
          </Button>
        </div>
      )}
    </div>
  );
}

function CoberturaRealocacaoInfo({ companyId, obraId, cotacaoId, deficit }: {
  companyId: number; obraId?: number; cotacaoId?: number; deficit: number;
}) {
  const q = trpc.compras.buscarSaldosRealocacao.useQuery(
    { companyId, obraId, cotacaoId, deficit },
    { enabled: companyId > 0 && deficit > 0 }
  );
  const debitos = q.data?.debitosEstaCotacao ?? [];
  const totalDebitado = q.data?.totalDebitadoEstaCotacao ?? 0;

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm text-emerald-800 font-semibold">Déficit coberto — compra autorizada</p>
          <p className="text-xs text-emerald-600">
            Déficit de {deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} coberto por realocação de verba.
          </p>
        </div>
      </div>
      {debitos.length > 0 && (
        <div className="ml-7 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Origem da realocação</p>
          {debitos.map((d: any) => (
            <div key={d.id} className="flex items-center gap-2 bg-emerald-100/60 rounded px-2.5 py-1.5 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="font-bold text-emerald-800">{Number(d.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              <span className="text-emerald-700">Reserva de Risco — BDI (DI-08)</span>
              {d.observacao && <span className="text-emerald-600 text-[10px] italic truncate max-w-xs">({d.observacao})</span>}
              {d.criadoEm && <span className="text-emerald-500 text-[10px] ml-auto">{new Date(d.criadoEm).toLocaleDateString("pt-BR")}</span>}
            </div>
          ))}
          <div className="flex justify-end pt-0.5">
            <span className="text-[10px] text-emerald-700 font-semibold">
              Total realocado: {totalDebitado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovada:  { label: "Aprovada",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  concluida: { label: "Concluída", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  recusada:  { label: "Recusada",  cls: "bg-red-50 text-red-700 border-red-200" },
  expirada:  { label: "Expirada",  cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const COND_PAG_PADRAO = TIPOS_PAGAMENTO.map(t => t.label);

function getTipoPagamentoLabel(value: string): string {
  const info = getTipoPagamentoInfo(value);
  return info?.label ?? value;
}
const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

function HistoricoPrecoPopover({ companyId, descricao }: { companyId: number; descricao: string }) {
  const [open, setOpen] = useState(false);
  const histQ = trpc.compras.getHistoricoPrecos.useQuery(
    { companyId, descricaoInsumo: descricao },
    { enabled: open && companyId > 0 }
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-gray-400 hover:text-blue-500 transition p-0.5" title="Histórico de preços">
          <History className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-white border-gray-200 shadow-lg" side="right" align="start">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <History className="h-3 w-3 text-blue-500" /> Histórico de Preços
          </div>
          <div className="text-[10px] text-gray-400 truncate mt-0.5">{descricao}</div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {histQ.isLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Buscando...</div>
          ) : !histQ.data || histQ.data.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">Nenhum histórico encontrado</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {histQ.data.map((h: any, i: number) => (
                <div key={i} className="px-3 py-1.5 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="text-gray-700 truncate">{h.fornecedor || "—"}</div>
                    <div className="text-[10px] text-gray-400">{h.data ? new Date(h.data).toLocaleDateString("pt-BR") : "—"} · {h.numeroCotacao || h.numeroOc || "—"}</div>
                  </div>
                  <div className="font-semibold text-gray-900 shrink-0 ml-2">
                    {parseFloat(h.precoUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RastreabilidadeTag({ scNumero, eapCodigo, origemEap }: { scNumero?: string; eapCodigo?: string; origemEap?: boolean }) {
  if (!scNumero && !eapCodigo) return null;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      {scNumero && (
        <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200">
          <Link2 className="h-2 w-2" />{scNumero}
        </span>
      )}
      {eapCodigo && (
        <span className="inline-flex items-center gap-0.5 text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full border border-amber-200">
          EAP {eapCodigo}
        </span>
      )}
      {origemEap && (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full border border-green-200 cursor-help"
          title="Explosão: Este item foi gerado automaticamente a partir da EAP (Estrutura Analítica do Projeto). O sistema desmembrou o item do orçamento em vários itens separados — um para cada local/pavimento de aplicação na obra.">
          <RefreshCw className="h-2 w-2" />Explosão
        </span>
      )}
    </div>
  );
}

interface FornecedorContatoData {
  contatoNome?: string | null;
  telefone?: string | null;
  contatoCelular?: string | null;
  contatoEmail?: string | null;
  email?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
}

function FornecedorContatoCard({ contato, compact }: { contato: FornecedorContatoData | null | undefined; compact?: boolean }) {
  if (!contato) return null;
  const hasAnyContact = contato.contatoNome || contato.telefone || contato.contatoCelular || contato.contatoEmail || contato.email;
  const hasPhone = !!(contato.telefone || contato.contatoCelular);
  const hasEmail = !!(contato.contatoEmail || contato.email);
  const isIncomplete = !hasPhone || !hasEmail;

  if (!hasAnyContact) return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 ${compact ? "p-2" : "p-3"} flex items-center gap-2`}>
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-xs text-amber-700 font-medium">Cadastro incompleto - sem dados de contato</span>
    </div>
  );

  return (
    <div className={`rounded-lg border border-blue-200 bg-blue-50/60 ${compact ? "p-2 space-y-1" : "p-3 space-y-1.5"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <User className="h-3.5 w-3.5 text-blue-500" />
        <span className={`font-semibold text-blue-800 ${compact ? "text-[11px]" : "text-xs"}`}>Contato do Fornecedor</span>
        {isIncomplete && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> Incompleto
          </span>
        )}
      </div>
      {contato.contatoNome && (
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className={`text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>{contato.contatoNome}</span>
        </div>
      )}
      {contato.telefone && (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.telefone}`} className={`text-blue-600 hover:text-blue-800 hover:underline ${compact ? "text-[11px]" : "text-xs"}`}>{contato.telefone}</a>
        </div>
      )}
      {contato.contatoCelular && (
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`tel:${contato.contatoCelular}`} className={`text-blue-600 hover:text-blue-800 hover:underline ${compact ? "text-[11px]" : "text-xs"}`}>{contato.contatoCelular}</a>
        </div>
      )}
      {(contato.contatoEmail || contato.email) && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <a href={`mailto:${contato.contatoEmail || contato.email}`} className={`text-blue-600 hover:text-blue-800 hover:underline ${compact ? "text-[11px]" : "text-xs"}`}>{contato.contatoEmail || contato.email}</a>
        </div>
      )}
    </div>
  );
}

function FornecedorContatoPopover({ fornecedor, children }: { fornecedor: FornecedorContatoData | null | undefined; children?: React.ReactNode }) {
  if (!fornecedor) return <>{children}</>;
  const hasAnyContact = fornecedor.contatoNome || fornecedor.telefone || fornecedor.contatoCelular || fornecedor.contatoEmail || fornecedor.email;
  const hasPhone = !!(fornecedor.telefone || fornecedor.contatoCelular);
  const hasEmail = !!(fornecedor.contatoEmail || fornecedor.email);
  const isIncomplete = !hasPhone || !hasEmail;
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children || (
          <button type="button" className={`p-0.5 rounded transition ${hasAnyContact ? (isIncomplete ? "text-amber-500 hover:text-amber-700" : "text-blue-500 hover:text-blue-700") : "text-amber-400 hover:text-amber-600"}`} title="Contato do fornecedor">
            {!hasAnyContact ? <AlertTriangle className="h-3 w-3" /> : isIncomplete ? <AlertTriangle className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 bg-white border-gray-200 shadow-lg" side="bottom" align="start">
        <div className="p-3">
          <FornecedorContatoCard contato={fornecedor} compact />
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; descontoPct: string; solicitacaoItemId?: number | null; insumoCodigo?: string; historico?: { fornecedorNome: string; precoUnitario: number; data: string; numeroOc: string }[]; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "", descontoPct: "0" });
const calcTotal = (it: ItemForm) => {
  const tot = (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0);
  const desc = (parseFloat(it.descontoPct) || 0) / 100;
  return tot * (1 - desc);
};

export default function Cotacoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"detalhes" | "mapa">("detalhes");
  const [showCancelarAprovacao, setShowCancelarAprovacao] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("destaque");
    if (d) {
      const id = parseInt(d);
      if (!isNaN(id)) setShowDetalhe(id);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [cancelarCotacaoId, setCancelarCotacaoId] = useState<number | null>(null);
  const [justificativaCancelar, setJustificativaCancelar] = useState("");

  const [form, setForm] = useState({
    descricao: "", obraId: "", solicitacaoId: "", fornecedorId: "",
    dataValidade: "", condicaoPagamento: "", tipoPagamento: "", numeroParcelas: "", prazoEntregaDias: "", observacoes: "",
    tipo: "material" as "material" | "servico" | "pacote" | "equipamento",
  });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);
  const [scAlertas, setScAlertas] = useState<{ insumoCodigo: string; descricao: string; mensagem: string }[]>([]);
  const [loadingSCItens, setLoadingSCItens] = useState(false);

  const [mapaFornSelectId, setMapaFornSelectId] = useState("");
  const [mapaFornSearch, setMapaFornSearch] = useState("");
  const [mapaFornOpen, setMapaFornOpen] = useState(false);
  const [editPrecos, setEditPrecos] = useState<Record<string, string>>({});
  const [editQtds, setEditQtds] = useState<Record<string, string>>({});
  const [editPrazo, setEditPrazo] = useState<Record<number, string>>({});
  const [editCondPag, setEditCondPag] = useState<Record<number, string>>({});
  const [editTipoPag, setEditTipoPag] = useState<Record<number, string>>({});
  const [editFreteTipo, setEditFreteTipo] = useState<Record<number, string>>({});
  const [editFormaPag, setEditFormaPag] = useState<Record<number, string>>({});
  const [condModalFornId, setCondModalFornId] = useState<number | null>(null);
  const [condModo, setCondModo] = useState<Record<number, "padrao" | "custom" | "fechamento">>({});
  const [condCustomParcelas, setCondCustomParcelas] = useState<Record<number, { valor: string; data: string }[]>>({});
  const [condFechCiclo, setCondFechCiclo] = useState<Record<number, string>>({});
  const [condFechDiaFixo, setCondFechDiaFixo] = useState<Record<number, string>>({});
  const [condFechPrazo, setCondFechPrazo] = useState<Record<number, string>>({});
  const [condFechParc, setCondFechParc] = useState<Record<number, string>>({});
  const [condFechDataIni, setCondFechDataIni] = useState<Record<number, string>>({});
  const [editDataEntrega, setEditDataEntrega] = useState<Record<number, string>>({});
  const [editValorFrete, setEditValorFrete] = useState<Record<number, string>>({});
  const [editTransportadora, setEditTransportadora] = useState<Record<number, string>>({});
  const [editModuloMedicao, setEditModuloMedicao] = useState<Record<number, string>>({});
  const [editingFornId, setEditingFornId] = useState<number | null>(null);
  const [showGerenciarCond, setShowGerenciarCond] = useState(false);
  const [novaCondicao, setNovaCondicao] = useState("");
  const [anexoUrl, setAnexoUrl] = useState<Record<number, string>>({});
  const [showAnexoInput, setShowAnexoInput] = useState<number | null>(null);
  const [showRealocacao, setShowRealocacao] = useState(false);
  const [cobertoPorRisco, setCobertoPorRisco] = useState(false);
  const [agruparItens, setAgruparItens] = useState(false);
  const [expandedComposicao, setExpandedComposicao] = useState<Record<number, boolean>>({});
  const [showSemVerbaDialog, setShowSemVerbaDialog] = useState(false);
  const [aprovacaoProgress, setAprovacaoProgress] = useState<{ step: number; redirectTo?: string } | null>(null);
  const [semVerbaAdminEmail, setSemVerbaAdminEmail] = useState("");
  const [semVerbaAdminSenha, setSemVerbaAdminSenha] = useState("");
  const [semVerbaJustificativa, setSemVerbaJustificativa] = useState("");
  const [semVerbaAutorizado, setSemVerbaAutorizado] = useState<{ adminId: number; adminNome: string; justificativa: string } | null>(null);
  const [semVerbaAba, setSemVerbaAba] = useState<"realocacao" | "autorizacao">("realocacao");
  const [iaExtracao, setIaExtracao] = useState<{ fornecedorId: number; dados: any } | null>(null);
  const [iaFileBuffer, setIaFileBuffer] = useState<{ fornecedorId: number; base64: string; fileName: string; mimeType: string } | null>(null);
  const [iaTipoProposta, setIaTipoProposta] = useState<"complemento" | "revisao">("complemento");
  const [iaProgress, setIaProgress] = useState<{ fornecedorId: number; percent: number; etapa: string } | null>(null);
  const iaProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [iaJobId, setIaJobId] = useState<string | null>(null);
  const [iaPollingFornId, setIaPollingFornId] = useState<number | null>(null);
  const [showPropostas, setShowPropostas] = useState<number | null>(null);

  const [editFornDialog, setEditFornDialog] = useState<any | null>(null);
  const [editFornForm, setEditFornForm] = useState({
    cnpj: "", razaoSocial: "", nomeFantasia: "",
    endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
    telefone: "", email: "", contatoNome: "", contatoCelular: "", contatoEmail: "",
    banco: "", agencia: "", conta: "", pix: "", observacoes: "",
  });
  const atualizarFornMut = trpc.compras.atualizarFornecedor.useMutation({
    onSuccess: () => { mapaQ.refetch(); fornQ.refetch(); setEditFornDialog(null); toast.success("Fornecedor atualizado!"); },
  });
  function abrirEditForn(f: any) {
    if (!f) return;
    const maskP = (v: string) => { const d = (v || "").replace(/\D/g, "").slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; };
    setEditFornForm({
      cnpj: f.cnpj ?? "", razaoSocial: f.razaoSocial ?? "", nomeFantasia: f.nomeFantasia ?? "",
      endereco: f.endereco ?? "", numero: f.numero ?? "", complemento: f.complemento ?? "",
      bairro: f.bairro ?? "", cidade: f.cidade ?? "", estado: f.estado ?? "", cep: f.cep ?? "",
      telefone: maskP(f.telefone ?? ""), email: f.email ?? "",
      contatoNome: f.contatoNome ?? "", contatoCelular: maskP(f.contatoCelular ?? ""), contatoEmail: f.contatoEmail ?? "",
      banco: f.banco ?? "", agencia: f.agencia ?? "", conta: f.conta ?? "", pix: f.pix ?? "",
      observacoes: f.observacoes ?? "",
    });
    setEditFornDialog(f);
  }

  const startIaProgress = useCallback((fornecedorId: number) => {
    if (iaProgressRef.current) clearInterval(iaProgressRef.current);
    const etapas = [
      { at: 0, label: "Enviando documento..." },
      { at: 8, label: "Analisando documento..." },
      { at: 20, label: "Identificando itens..." },
      { at: 40, label: "Extraindo preços..." },
      { at: 60, label: "Comparando com a SC..." },
      { at: 80, label: "Finalizando análise..." },
    ];
    let current = 0;
    setIaProgress({ fornecedorId, percent: 0, etapa: etapas[0].label });
    iaProgressRef.current = setInterval(() => {
      current += 0.5;
      if (current >= 92) { current = 92; }
      const etapa = [...etapas].reverse().find(e => current >= e.at)?.label || etapas[0].label;
      setIaProgress({ fornecedorId, percent: Math.round(current), etapa });
    }, 500);
  }, []);

  const stopIaProgress = useCallback((success?: boolean) => {
    if (iaProgressRef.current) { clearInterval(iaProgressRef.current); iaProgressRef.current = null; }
    if (success) {
      setIaProgress(prev => prev ? { ...prev, percent: 100, etapa: "Concluído!" } : null);
      setTimeout(() => setIaProgress(null), 1200);
    } else {
      setIaProgress(null);
    }
  }, []);

  const prevShowDetalhe = useRef(showDetalhe);
  useEffect(() => {
    if (prevShowDetalhe.current !== showDetalhe) {
      prevShowDetalhe.current = showDetalhe;
      setCobertoPorRisco(false); setShowRealocacao(false); setIaExtracao(null); setIaFileBuffer(null); setIaProgress(null); setIaJobId(null); setIaPollingFornId(null); setShowPropostas(null); setIaTipoProposta("complemento");
      setSemVerbaAutorizado(null); setShowSemVerbaDialog(false); setSemVerbaAdminEmail(""); setSemVerbaAdminSenha(""); setSemVerbaJustificativa(""); setSemVerbaAba("realocacao");
    }
  }, [showDetalhe]);

  const q = trpc.compras.listarCotacoes.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getCotacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const coberturaAutoQ = trpc.compras.buscarSaldosRealocacao.useQuery(
    { companyId, obraId: (detalheQ.data as any)?.obraId, cotacaoId: showDetalhe ?? undefined, deficit: 1 },
    { enabled: showDetalhe !== null && !!detalheQ.data }
  );
  useEffect(() => {
    if (coberturaAutoQ.data?.cobertoPorRisco && coberturaAutoQ.data.totalDebitadoEstaCotacao > 0) {
      setCobertoPorRisco(true);
    }
  }, [coberturaAutoQ.data?.cobertoPorRisco, coberturaAutoQ.data?.totalDebitadoEstaCotacao]);
  const mapaQ = trpc.compras.getMapaCotacao.useQuery({ cotacaoId: showDetalhe! }, { enabled: showDetalhe !== null });
  const mapaItens = mapaQ.data?.itens ?? [];
  const mapaDescricoes = mapaItens.map((it: any) => it.descricao as string).filter(Boolean);
  const mapaInsumoCodigos = mapaItens.map((it: any) => it.insumoCodigo as string).filter(Boolean);
  const sugestoesRecompraQ = trpc.compras.getSugestoesFornecedoresRecompra.useQuery(
    { companyId, descricoes: mapaDescricoes, insumoCodigos: mapaInsumoCodigos.length > 0 ? mapaInsumoCodigos : undefined },
    { enabled: companyId > 0 && (mapaDescricoes.length > 0 || mapaInsumoCodigos.length > 0) && showDetalhe !== null && abaAtiva === "mapa" }
  );
  const novaDescricoes = itens.map(i => i.descricao).filter(d => d.trim().length >= 3);
  const novaSugestoesQ = trpc.compras.getSugestoesFornecedoresRecompra.useQuery(
    { companyId, descricoes: novaDescricoes },
    { enabled: companyId > 0 && novaDescricoes.length > 0 && showNova }
  );
  const mapaFornIds = (mapaQ.data?.participantes ?? []).map((p: any) => p.fornecedorId);
  const scoresQ = trpc.compras.scoresFornecedoresLote.useQuery(
    { fornecedorIds: mapaFornIds, companyId },
    { enabled: mapaFornIds.length > 0 && abaAtiva === "mapa" }
  );
  const scsQ = trpc.compras.listarSolicitacoes.useQuery({ companyId }, { enabled: companyId > 0 });
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const condPagQ = trpc.compras.listarCondicoesPagamento.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarCondMut = trpc.compras.criarCondicaoPagamento.useMutation({
    onSuccess: () => { toast.success("Condição adicionada!"); setNovaCondicao(""); condPagQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deletarCondMut = trpc.compras.deletarCondicaoPagamento.useMutation({
    onSuccess: () => { condPagQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const condPagOptions = condPagQ.data?.length
    ? condPagQ.data.map(c => c.descricao)
    : COND_PAG_PADRAO;

  const criar = trpc.compras.criarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const gerarOC = trpc.compras.criarOrdemDeCotacao.useMutation({
    onMutate: () => {
      setAprovacaoProgress({ step: 0 });
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 1 } : p), 600);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 2 } : p), 1200);
    },
    onSuccess: (data: any) => {
      q.refetch(); detalheQ.refetch(); setSemVerbaAutorizado(null);
      const tcId = data?.terceiroContratoGeradoId;
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 3 } : p), 400);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 4, redirectTo: tcId ? `/terceiros/contratos/${tcId}?tab=documento` : undefined } : p), 1000);
      if (tcId) {
        setTimeout(() => { setAprovacaoProgress(null); navigate(`/terceiros/contratos/${tcId}?tab=documento`); }, 2800);
      } else {
        setTimeout(() => { setAprovacaoProgress(null); toast.success("Ordem de Compra gerada com sucesso!"); }, 2200);
      }
    },
    onError: (e) => { setAprovacaoProgress(null); toast.error(e.message); },
  });
  const autorizarSemVerba = trpc.compras.autorizarCompraSemVerba.useMutation({
    onSuccess: (data) => {
      toast.success(`Compra autorizada pelo admin ${data.adminNome}!`);
      setSemVerbaAutorizado({ adminId: data.adminId, adminNome: data.adminNome, justificativa: semVerbaJustificativa });
      setShowSemVerbaDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusCotacao.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirLote = trpc.compras.excluirCotacoesEmLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.count} cotação(ões) excluída(s)!`); q.refetch(); setSelectedIds(new Set()); setConfirmExcluirLote(false); },
    onError: (e) => toast.error(e.message),
  });
  const gerarContrato = trpc.terceiroContratos.gerarContratoFromCotacao.useMutation({
    onMutate: () => {
      setAprovacaoProgress({ step: 0 });
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 1 } : p), 600);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 2 } : p), 1200);
    },
    onSuccess: (data) => {
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 3 } : p), 400);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 4, redirectTo: `/terceiros/contratos/${data.contratoId}` } : p), 1000);
      setTimeout(() => { setAprovacaoProgress(null); setShowDetalhe(null); navigate(`/terceiros/contratos/${data.contratoId}`); }, 2500);
    },
    onError: (e) => { setAprovacaoProgress(null); toast.error(e.message); },
  });
  const marcarFd = trpc.compras.marcarCotacaoFd.useMutation({
    onSuccess: () => { toast.success("Faturamento Direto definido!"); detalheQ.refetch(); q.refetch(); setShowFdCotDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const removerFd = trpc.compras.removerCotacaoFd.useMutation({
    onSuccess: () => { toast.success("FD removido da cotação."); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [showFdCotDialog, setShowFdCotDialog] = useState(false);
  const [fdCotForm, setFdCotForm] = useState({ modalidade: "fd_cliente" as "fd_cliente" | "fd_fc", valor: "" });
  const splitQ = trpc.compras.getCotacaoSplitMatMdo.useQuery(
    { cotacaoId: showDetalhe!, companyId },
    { enabled: showDetalhe !== null && showFdCotDialog }
  );
  const adicionarForn = trpc.compras.adicionarFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor adicionado!"); setMapaFornSelectId(""); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const removerForn = trpc.compras.removerFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor removido!"); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarRespostas = trpc.compras.salvarRespostasLote.useMutation({
    onSuccess: (data) => { toast.success(`Preços salvos! Total: ${data.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`); setEditingFornId(null); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarCondicoesComerciais = trpc.compras.salvarCondicoesComerciais.useMutation({
    onSuccess: () => { mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const selecionarVencedor = trpc.compras.selecionarVencedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor vencedor selecionado!"); mapaQ.refetch(); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarCotacaoMut = trpc.compras.cancelarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação cancelada. A SC voltou para 'Aprovado' e pode gerar nova cotação."); setShowDetalhe(null); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarVencedor = trpc.compras.cancelarVencedorMapa.useMutation({
    onSuccess: () => { toast.success("Seleção de vencedor cancelada. Ajuste os preços e selecione novamente."); mapaQ.refetch(); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const propostasQ = trpc.compras.listarPropostasFornecedor.useQuery(
    { cotacaoId: showDetalhe!, fornecedorId: showPropostas!, companyId },
    { enabled: showDetalhe != null && showPropostas != null && !!companyId }
  );
  const excluirProposta = trpc.compras.excluirProposta.useMutation({
    onSuccess: () => { toast.success("Proposta excluída!"); propostasQ.refetch(); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarAnexo = trpc.compras.salvarAnexoFornecedor.useMutation({
    onSuccess: () => { toast.success("Anexo salvo!"); setShowAnexoInput(null); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const uploadAnexo = trpc.compras.uploadAnexoFornecedor.useMutation({
    onSuccess: () => { toast.success("Arquivo enviado!"); setShowAnexoInput(null); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const iaPollingQ = trpc.compras.getIaExtractionResult.useQuery(
    { jobId: iaJobId! },
    { enabled: !!iaJobId, refetchInterval: 2000 }
  );

  const iaResultHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!iaPollingQ.data || !iaJobId) return;
    if (iaResultHandled.current === iaJobId) return;
    const d = iaPollingQ.data;
    if (d.status === "done") {
      iaResultHandled.current = iaJobId;
      console.log("[IA] Resultado recebido, abrindo overlay. itens:", (d as any).totalItensExtraidos);
      stopIaProgress(true);
      const fornId = iaPollingFornId!;
      const dadosCopy = { ...d };
      setIaJobId(null);
      setIaPollingFornId(null);
      setTimeout(() => {
        console.log("[IA] Setando iaExtracao agora, fornId:", fornId, "itens:", (dadosCopy as any).totalItensExtraidos);
        setIaExtracao({ fornecedorId: fornId, dados: dadosCopy });
        toast.success(`IA extraiu ${(dadosCopy as any).totalItensExtraidos} item(ns), ${(dadosCopy as any).totalMatches} match(es)`);
      }, 100);
    } else if (d.status === "error") {
      iaResultHandled.current = iaJobId;
      stopIaProgress(false);
      toast.error("Erro na leitura IA: " + (d as any).error);
      setIaJobId(null);
      setIaPollingFornId(null);
    }
  }, [iaPollingQ.data, iaJobId]);

  const extrairIA = trpc.compras.extrairCotacaoIA.useMutation({
    onMutate: (vars) => { startIaProgress(vars.fornecedorId); },
    onSuccess: (dados, vars) => {
      setIaJobId(dados.jobId);
      setIaPollingFornId(vars.fornecedorId);
    },
    onError: (e) => {
      stopIaProgress(false);
      toast.error("Erro na leitura IA: " + e.message);
    },
  });
  const cancelarAprovacao = trpc.compras.cancelarAprovacaoCotacao.useMutation({
    onSuccess: (d) => {
      toast.success(`Aprovação cancelada. ${d.ocsRemovidas} OC(s) removida(s). Cotação voltou para Pendente.`);
      setShowCancelarAprovacao(false);
      setJustificativaCancelar("");
      setCancelarCotacaoId(null);
      setShowDetalhe(null);
      q.refetch();
      trpcUtils.compras.getCotacao.invalidate();
      trpcUtils.compras.listarOrdens.invalidate();
      trpcUtils.compras.getTimelineCompra.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reverterOS = trpc.terceiroContratos.reverterAprovacaoOS.useMutation({
    onSuccess: () => {
      toast.success("Aprovação revertida. Contrato de serviço excluído. Cotação voltou para 'Aprovada' — pode ser editada e gerar novo contrato.");
      setShowDetalhe(null);
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (abaAtiva === "mapa" && mapaQ.data) {
      const inicialPrecos: Record<string, string> = {};
      const inicialQtds: Record<string, string> = {};
      const prazoInicial: Record<number, string> = {};
      const condInicial: Record<number, string> = {};
      const anexoInicial: Record<number, string> = {};

      // Pré-preencher com meta price para itens sem resposta
      const metaMap: Record<number, number> = {};
      for (const it of (mapaQ.data.itens ?? [])) {
        const meta = parseFloat((it as any).metaUnitario ?? "0");
        if (meta > 0) metaMap[(it as any).id] = meta;
      }
      for (const p of mapaQ.data.participantes) {
        for (const it of (mapaQ.data.itens ?? [])) {
          const key = `${(it as any).id}_${p.fornecedorId}`;
          if (metaMap[(it as any).id]) {
            inicialPrecos[key] = metaMap[(it as any).id].toFixed(4);
          }
          inicialQtds[key] = String((it as any).quantidade ?? "1");
        }
      }

      // Sobrescrever com respostas já salvas (têm prioridade)
      for (const [key, val] of Object.entries(mapaQ.data.respostaMap)) {
        if ((val as any).precoUnitario != null) {
          inicialPrecos[key] = (val as any).precoUnitario ?? "0";
          inicialQtds[key] = (val as any).quantidade ?? inicialQtds[key] ?? "0";
        }
      }

      const tipoPagInicial: Record<number, string> = {};
      const formaPagInicial: Record<number, string> = {};
      const freteTipoInicial: Record<number, string> = {};
      const valorFreteInicial: Record<number, string> = {};
      const transportadoraInicial: Record<number, string> = {};
      const moduloMedicaoInicial: Record<number, string> = {};
      for (const p of mapaQ.data.participantes) {
        prazoInicial[p.fornecedorId] = p.prazoEntregaDias ? String(p.prazoEntregaDias) : "";
        condInicial[p.fornecedorId] = p.condicaoPagamento ?? "";
        tipoPagInicial[p.fornecedorId] = (p as any).tipoPagamento ?? "";
        formaPagInicial[p.fornecedorId] = (p as any).formaPagamento ?? "";
        freteTipoInicial[p.fornecedorId] = (p as any).freteTipo ?? "cif";
        valorFreteInicial[p.fornecedorId] = (p as any).valorFrete ? String(parseFloat((p as any).valorFrete)) : "0";
        transportadoraInicial[p.fornecedorId] = (p as any).transportadora ?? "";
        moduloMedicaoInicial[p.fornecedorId] = (p as any).moduloMedicao ?? "";
        if ((p as any).arquivoUrl) anexoInicial[p.fornecedorId] = (p as any).arquivoUrl;
      }
      setEditPrecos(inicialPrecos);
      setEditQtds(inicialQtds);
      setEditPrazo(prazoInicial);
      setEditCondPag(condInicial);
      setEditTipoPag(tipoPagInicial);
      setEditFormaPag(formaPagInicial);
      setEditFreteTipo(freteTipoInicial);
      setEditValorFrete(valorFreteInicial);
      setEditTransportadora(transportadoraInicial);
      setEditModuloMedicao(moduloMedicaoInicial);
      setAnexoUrl(anexoInicial);
    }
  }, [mapaQ.data, abaAtiva]);

  function resetForm() {
    setForm({ descricao: "", obraId: "", solicitacaoId: "", fornecedorId: "", dataValidade: "", condicaoPagamento: "", tipoPagamento: "", numeroParcelas: "", prazoEntregaDias: "", observacoes: "", tipo: "material" });
    setItens([newItem()]);
  }

  const trpcUtils = trpc.useUtils();
  async function handleScChange(scId: string) {
    setForm(p => ({ ...p, solicitacaoId: scId }));
    setScAlertas([]);
    if (!scId || scId === "none") {
      setForm(p => ({ ...p, solicitacaoId: scId, tipo: "material" }));
      setItens([newItem()]);
      return;
    }
    const sc = scsQ.data?.find(s => s.id === parseInt(scId)) as any;
    const scTipo = sc?.tipo === "pacote" ? "pacote" as const : sc?.tipo === "servico" ? "servico" as const : sc?.tipo === "equipamento" ? "equipamento" as const : "material" as const;
    const updates: any = { solicitacaoId: scId, tipo: scTipo };
    if (sc?.obraId) updates.obraId = String(sc.obraId);
    setForm(p => ({ ...p, ...updates }));

    setLoadingSCItens(true);
    try {
      const result = await trpcUtils.compras.getItensCotacaoFromSC.fetch({ companyId, solicitacaoId: parseInt(scId) });
      if (result.itens.length > 0) {
        setItens(result.itens.map(i => ({
          descricao: i.descricao,
          unidade: i.unidade,
          quantidade: String(i.quantidade),
          precoUnitario: String(i.precoUnitario || ""),
          descontoPct: "0",
          insumoCodigo: i.insumoCodigo,
          historico: i.historico,
        })));
      } else {
        setItens([newItem()]);
      }
      setScAlertas(result.alertas ?? []);
    } catch (err) {
      console.error("Erro ao explodir itens da SC:", err);
      setItens([newItem()]);
    } finally {
      setLoadingSCItens(false);
    }
  }

  function handleSalvar() {
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta cotação.");
    const validos = itens.filter(i => i.descricao.trim() && parseFloat(i.precoUnitario) > 0);
    if (validos.length === 0) return toast.error("Adicione pelo menos um item com preço.");
    criar.mutate({
      companyId,
      descricao: form.descricao || undefined,
      tipo: form.tipo,
      obraId: parseInt(form.obraId),
      solicitacaoId: form.solicitacaoId && form.solicitacaoId !== "none" ? parseInt(form.solicitacaoId) : undefined,
      fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
      dataValidade: form.dataValidade || undefined,
      condicaoPagamento: form.tipoPagamento ? getTipoPagamentoLabel(form.tipoPagamento) : (form.condicaoPagamento || undefined),
      tipoPagamento: form.tipoPagamento || undefined,
      numeroParcelas: form.numeroParcelas ? parseInt(form.numeroParcelas) : undefined,
      prazoEntregaDias: form.prazoEntregaDias ? parseInt(form.prazoEntregaDias) : undefined,
      observacoes: form.observacoes || undefined,
      itens: validos.map(i => ({
        solicitacaoItemId: i.solicitacaoItemId ?? undefined,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
        descontoPct: parseFloat(i.descontoPct) || 0,
      })),
    });
  }

  function addItem() { setItens(p => [...p, newItem()]); }
  function removeItem(idx: number) { setItens(p => p.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItens(p => p.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const lista = q.data ?? [];
  const filt = lista.filter(c => !busca || c.numeroCotacao?.toLowerCase().includes(busca.toLowerCase()));

  const allFilteredIds = filt.map(c => c.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allSelected) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(allFilteredIds)); }
  }

  const fornecedores = fornQ.data ?? [];
  const obras = obrasQ.data ?? [];
  const detalhe = detalheQ.data;
  const totalItens = itens.reduce((s, it) => s + calcTotal(it), 0);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  const iaOverlayPortal = iaExtracao ? createPortal((() => {
    const d = iaExtracao.dados;
    const matched = (d.itensExtraidos ?? []).filter((i: any) => i.matchItemId);
    const extras = d.itensExtras ?? [];
    const semMatch = d.itensSemMatch ?? [];
    const alertas = d.alertas ?? [];
    const alertasParcial = alertas.filter((a: any) => a.tipo === "parcial");
    const alertasExcedente = alertas.filter((a: any) => a.tipo === "excedente");
    const alertasSemCotacao = alertas.filter((a: any) => a.tipo === "sem_cotacao");
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setIaExtracao(null)} />
        <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 max-w-6xl w-[98vw] max-h-[92vh] overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-violet-700">
              <Sparkles className="h-5 w-5" /> Conferência — Leitura IA
            </h3>
            <div className="flex items-center gap-3">
              {d.tipoProposta && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${d.tipoProposta === "revisao" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                  {d.tipoProposta === "revisao" ? "Revisão" : "Complemento"}
                </span>
              )}
              {d.fileName && <span className="text-[10px] text-gray-400 truncate max-w-[150px]">{d.fileName}</span>}
              <button onClick={() => setIaExtracao(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
          </div>

          {(d.condicaoPagamento || d.formaPagamento || d.tipoPagamento) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-sm text-blue-800 flex items-center gap-3 flex-wrap">
              {d.formaPagamento && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  d.formaPagamento === "pix" ? "bg-green-100 text-green-700 border border-green-200" :
                  d.formaPagamento === "boleto" ? "bg-blue-100 text-blue-700 border border-blue-200" :
                  d.formaPagamento === "transferencia" ? "bg-indigo-100 text-indigo-700 border border-indigo-200" :
                  "bg-gray-100 text-gray-700 border border-gray-200"
                }`}>
                  {d.formaPagamento === "pix" ? "⚡ PIX" :
                   d.formaPagamento === "boleto" ? "📄 Boleto" :
                   d.formaPagamento === "transferencia" ? "🏦 Transferência" :
                   d.formaPagamento === "cheque" ? "📝 Cheque" :
                   d.formaPagamento === "cartao" ? "💳 Cartão" :
                   d.formaPagamento === "deposito" ? "💰 Depósito" :
                   d.formaPagamento}
                </span>
              )}
              {d.condicaoPagamento && <><strong>Condição:</strong> {d.condicaoPagamento}</>}
              {d.tipoPagamento && <><strong>Parcelamento:</strong> {(() => { const info = getTipoPagamentoInfo(d.tipoPagamento); return info ? info.label : d.tipoPagamento; })()}</>}
              {d.prazoEntrega && <><strong>Prazo:</strong> {d.prazoEntrega}</>}
            </div>
          )}
          {d.observacoes && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-600">{d.observacoes}</div>
          )}

          {alertas.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className={`rounded-lg p-2.5 text-center ${alertasParcial.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                <div className="text-lg font-bold">{alertasParcial.length}</div>
                <div className="text-[10px] font-medium text-amber-700">Qtd Parcial</div>
              </div>
              <div className={`rounded-lg p-2.5 text-center ${alertasExcedente.length > 0 ? "bg-blue-50 border border-blue-200" : "bg-green-50 border border-green-200"}`}>
                <div className="text-lg font-bold">{alertasExcedente.length}</div>
                <div className="text-[10px] font-medium text-blue-700">Qtd Excedente</div>
              </div>
              <div className={`rounded-lg p-2.5 text-center ${alertasSemCotacao.length > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                <div className="text-lg font-bold">{alertasSemCotacao.length}</div>
                <div className="text-[10px] font-medium text-red-700">Sem Cotação</div>
              </div>
            </div>
          )}

          {matched.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5 mb-2">
                <CheckCircle className="h-4 w-4" /> Itens com Match ({matched.length})
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-emerald-50">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium text-emerald-700">Item SC</th>
                      <th className="text-left px-2 py-2 font-medium text-emerald-700">Fornecedor</th>
                      <th className="text-right px-2 py-2 font-medium text-emerald-700">Qtd Cotada</th>
                      <th className="text-right px-2 py-2 font-medium text-emerald-700">Qtd SC</th>
                      <th className="text-right px-2 py-2 font-medium text-emerald-700">Preço Unit.</th>
                      <th className="text-right px-2 py-2 font-medium text-emerald-700">Total</th>
                      <th className="text-center px-2 py-2 font-medium text-emerald-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((it: any, idx: number) => {
                      const qtdCot = it.quantidade ?? 0;
                      const qtdSC = it.quantidadeSC ?? 0;
                      const diff = qtdCot - qtdSC;
                      const statusQtd = Math.abs(diff) < 0.01 ? "ok" : diff < 0 ? "parcial" : "excedente";
                      return (
                        <tr key={idx} className="border-t border-emerald-100 hover:bg-emerald-50/50">
                          <td className="px-2 py-2 text-gray-700 max-w-[150px] truncate" title={it.matchDescricaoSC || ""}>{it.matchDescricaoSC || "—"}</td>
                          <td className="px-2 py-2 text-gray-500 max-w-[120px] truncate" title={it.descricaoFornecedor}>{it.descricaoFornecedor}</td>
                          <td className="px-2 py-2 text-right font-mono">{it.quantidade ?? "—"}</td>
                          <td className={`px-2 py-2 text-right font-mono ${statusQtd !== "ok" ? "font-semibold" : ""} ${statusQtd === "parcial" ? "text-amber-600" : statusQtd === "excedente" ? "text-blue-600" : "text-gray-500"}`}>
                            {qtdSC || "—"}
                            {statusQtd === "parcial" && <span className="text-[9px] ml-0.5">(-{Math.abs(diff).toFixed(0)})</span>}
                            {statusQtd === "excedente" && <span className="text-[9px] ml-0.5">(+{diff.toFixed(0)})</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-semibold text-emerald-700">
                            {it.precoUnitario != null ? `R$ ${Number(it.precoUnitario).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {it.precoTotal != null ? `R$ ${Number(it.precoTotal).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusQtd === "ok" ? "bg-emerald-100 text-emerald-700" : statusQtd === "parcial" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              {statusQtd === "ok" ? "OK" : statusQtd === "parcial" ? "Parcial" : "Excedente"}
                            </span>
                            {it.distribuido && <span className="block text-[9px] text-violet-500 mt-0.5">distrib.</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {semMatch.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-4 w-4" /> Itens da SC sem correspondência ({semMatch.length})
              </h4>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <ul className="space-y-1 text-xs text-amber-800">
                  {semMatch.map((it: any) => (
                    <li key={it.id}>• {it.descricao} (Qtd: {it.quantidade} {it.unidade || "un"})</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {extras.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-orange-700 flex items-center gap-1.5 mb-2">
                <Package className="h-4 w-4" /> Itens extras do fornecedor ({extras.length})
              </h4>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <ul className="space-y-1 text-xs text-orange-800">
                  {extras.map((it: any, idx: number) => (
                    <li key={idx}>• {it.descricaoFornecedor} — Qtd: {it.quantidade ?? "?"} — R$ {it.precoUnitario != null ? Number(it.precoUnitario).toFixed(2) : "?"}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-orange-500 mt-2">Estes itens não foram associados a nenhum item da SC. Revise manualmente se necessário.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setIaExtracao(null)}>Cancelar</Button>
            <Button
              disabled={matched.length === 0}
              onClick={() => {
                const respostas = matched
                  .filter((it: any) => it.matchItemId && it.precoUnitario != null)
                  .map((it: any) => ({
                    itemId: it.matchItemId,
                    precoUnitario: Number(it.precoUnitario),
                    quantidade: it.quantidade ? Number(it.quantidade) : undefined,
                    descontoPct: 0,
                  }));
                if (respostas.length === 0) { toast.error("Nenhum item com preço para salvar"); return; }
                salvarRespostas.mutate({
                  cotacaoId: showDetalhe!,
                  fornecedorId: iaExtracao.fornecedorId,
                  propostaId: d.propostaId ?? undefined,
                  respostas,
                  condicaoPagamento: d.condicaoPagamento ?? undefined,
                }, {
                  onSuccess: () => {
                    toast.success(`${respostas.length} preço(s) salvos com sucesso!`);
                    setIaExtracao(null);
                    mapaQ.refetch();
                    propostasQ.refetch();
                  },
                  onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
                });
              }}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Confirmar e Salvar ({matched.filter((i: any) => i.precoUnitario != null).length} itens)
            </Button>
          </div>
        </div>
      </div>
    );
  })(), document.body) : null;

  const condModalPortal = condModalFornId !== null ? createPortal((() => {
    const fId = condModalFornId;
    const fornP = (mapaQ.data?.participantes ?? []).find((p: any) => p.fornecedorId === fId);
    const fornNome = fornP?.fornecedor?.nomeFantasia || fornP?.fornecedor?.razaoSocial || `Fornecedor #${fId}`;
    const fornTotal = editingFornId === fId ? (() => {
      const totalItens = (mapaQ.data?.itens ?? []).reduce((acc: number, it: any) => {
        const key = `${it.id}_${fId}`;
        const preco = parseFloat(editPrecos[key] ?? "0") || 0;
        const qtyStr = editQtds[key];
        const qty = qtyStr && parseFloat(qtyStr) > 0 ? parseFloat(qtyStr) : parseFloat(it.quantidade);
        return acc + preco * qty;
      }, 0);
      const isFob = (editFreteTipo[fId] ?? "cif") === "fob";
      const frete = isFob ? (parseFloat(editValorFrete[fId] ?? "0") || 0) : 0;
      return totalItens + frete;
    })() : parseFloat(fornP?.totalOrcado ?? "0");

    const FORMAS = [
      { v: "boleto", l: "Boleto", icon: "📄", sel: "bg-blue-100 text-blue-700 border-blue-300 ring-blue-200", def: "bg-white text-gray-500 border-gray-200" },
      { v: "pix", l: "PIX", icon: "⚡", sel: "bg-green-100 text-green-700 border-green-300 ring-green-200", def: "bg-white text-gray-500 border-gray-200" },
      { v: "transferencia", l: "Transferência", icon: "🏦", sel: "bg-indigo-100 text-indigo-700 border-indigo-300 ring-indigo-200", def: "bg-white text-gray-500 border-gray-200" },
      { v: "cheque", l: "Cheque", icon: "📝", sel: "bg-amber-100 text-amber-700 border-amber-300 ring-amber-200", def: "bg-white text-gray-500 border-gray-200" },
      { v: "cartao", l: "Cartão", icon: "💳", sel: "bg-purple-100 text-purple-700 border-purple-300 ring-purple-200", def: "bg-white text-gray-500 border-gray-200" },
      { v: "deposito", l: "Depósito", icon: "💰", sel: "bg-gray-200 text-gray-700 border-gray-400 ring-gray-200", def: "bg-white text-gray-500 border-gray-200" },
    ];

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setCondModalFornId(null)}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Condições de Pagamento</h3>
              <p className="text-xs text-gray-500 mt-0.5">{fornNome} — Total: {formatCurrency(fornTotal)}</p>
            </div>
            <button onClick={() => setCondModalFornId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Forma de Pagamento</p>
              <div className="grid grid-cols-3 gap-2">
                {FORMAS.map(fp => (
                  <button key={fp.v} type="button" onClick={() => setEditFormaPag(prev => ({ ...prev, [fId]: prev[fId] === fp.v ? "" : fp.v }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${editFormaPag[fId] === fp.v ? `${fp.sel} ring-2` : `${fp.def} hover:bg-gray-50`}`}>
                    <span className="text-lg">{fp.icon}</span> {fp.l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Parcelamento</p>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {([["padrao", "Padrão"], ["fechamento", "Fechamento"], ["custom", "Personalizado"]] as const).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => {
                      setCondModo(prev => ({ ...prev, [fId]: mode }));
                      if (mode === "custom" && !condCustomParcelas[fId]?.length) {
                        const hoje = new Date().toISOString().split("T")[0];
                        setCondCustomParcelas(prev => ({ ...prev, [fId]: [{ valor: fornTotal.toFixed(2), data: hoje }] }));
                      }
                    }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${(condModo[fId] ?? "padrao") === mode ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(condModo[fId] ?? "padrao") === "padrao" ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TIPOS_PAGAMENTO.map(t => (
                      <button key={t.value} type="button" onClick={() => {
                        const newVal = editTipoPag[fId] === t.value ? "" : t.value;
                        setEditTipoPag(prev => ({ ...prev, [fId]: newVal }));
                        setEditCondPag(prev => ({ ...prev, [fId]: newVal ? t.label : "" }));
                      }}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border-2 transition-all text-center ${editTipoPag[fId] === t.value ? "bg-violet-100 text-violet-700 border-violet-400 ring-2 ring-violet-200" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {editTipoPag[fId] && (() => {
                    const today = new Date().toISOString().split("T")[0];
                    const parcelas = calcularParcelas(editTipoPag[fId], fornTotal, today);
                    return parcelas.length > 0 ? (
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mt-3">
                        <p className="text-xs font-bold text-violet-700 mb-2">Prévia das Parcelas ({parcelas.length}x)</p>
                        <div className="space-y-1.5">
                          {parcelas.map((parc, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-violet-100">
                              <span className="text-xs text-violet-600 font-medium w-24">{parc.descricao}</span>
                              <span className="text-sm text-violet-800 font-bold">{formatCurrency(parc.valor)}</span>
                              <span className="text-xs text-violet-500 bg-violet-50 px-2 py-0.5 rounded">{new Date(parc.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-violet-200 flex justify-between text-xs font-bold text-violet-800">
                          <span>Total</span>
                          <span>{formatCurrency(fornTotal)}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </>
              ) : (condModo[fId] ?? "padrao") === "fechamento" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ciclo de Fechamento</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[{ v: "7", l: "7 dias" }, { v: "15", l: "15 dias" }, { v: "30", l: "30 dias" }, { v: "fixo", l: "Dias fixos" }].map(c => (
                          <button key={c.v} type="button" onClick={() => setCondFechCiclo(prev => ({ ...prev, [fId]: prev[fId] === c.v ? "" : c.v }))}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all text-center ${condFechCiclo[fId] === c.v ? "bg-blue-100 text-blue-700 border-blue-400" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                            {c.l}
                          </button>
                        ))}
                      </div>
                      {condFechCiclo[fId] === "fixo" && (
                        <input type="text" placeholder="Ex: 1, 15" value={condFechDiaFixo[fId] ?? ""}
                          onChange={e => setCondFechDiaFixo(prev => ({ ...prev, [fId]: e.target.value }))}
                          className="w-full h-8 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 mt-1.5 focus:ring-1 focus:ring-blue-300 outline-none" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Prazo após Fechamento</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {["7", "14", "21", "28", "30", "60"].map(d => (
                          <button key={d} type="button" onClick={() => setCondFechPrazo(prev => ({ ...prev, [fId]: prev[fId] === d ? "" : d }))}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all text-center ${condFechPrazo[fId] === d ? "bg-blue-100 text-blue-700 border-blue-400" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                            {d} dias
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mr-1">Parcelas</p>
                      <button type="button" onClick={() => {
                        const curr = parseInt(condFechParc[fId] ?? "1") || 1;
                        if (curr > 1) setCondFechParc(prev => ({ ...prev, [fId]: String(curr - 1) }));
                      }} className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 font-bold">-</button>
                      <input type="number" min="1" max="60" value={condFechParc[fId] ?? "1"}
                        onChange={e => { const v = parseInt(e.target.value); if (v > 0 && v <= 60) setCondFechParc(prev => ({ ...prev, [fId]: String(v) })); }}
                        className="w-11 h-7 text-center text-sm font-bold border border-gray-300 rounded-md bg-white text-gray-900 outline-none focus:ring-1 focus:ring-blue-300" />
                      <button type="button" onClick={() => {
                        const curr = parseInt(condFechParc[fId] ?? "1") || 1;
                        if (curr < 60) setCondFechParc(prev => ({ ...prev, [fId]: String(curr + 1) }));
                      }} className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 font-bold">+</button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] text-gray-500 whitespace-nowrap">1ª parcela:</label>
                      <input type="date" value={condFechDataIni[fId] ?? ""}
                        onChange={e => setCondFechDataIni(prev => ({ ...prev, [fId]: e.target.value }))}
                        className="h-7 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-900 outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                  </div>

                  {(() => {
                    const numParc = parseInt(condFechParc[fId] ?? "1") || 1;
                    const dataIni = condFechDataIni[fId];
                    if (!dataIni && !condFechPrazo[fId]) return null;

                    let primeiroVenc: Date;
                    if (dataIni) {
                      primeiroVenc = new Date(dataIni + "T12:00:00");
                    } else {
                      const hoje = new Date();
                      const ciclo = condFechCiclo[fId];
                      const prazo = parseInt(condFechPrazo[fId] ?? "30");
                      let proximoFech: Date;
                      if (ciclo === "fixo") {
                        const dias = (condFechDiaFixo[fId] ?? "1,15").split(",").map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 1 && d <= 31).sort((a, b) => a - b);
                        if (dias.length === 0) return null;
                        const proximo = dias.find(d => d > hoje.getDate());
                        proximoFech = new Date(hoje.getFullYear(), hoje.getMonth(), proximo ?? dias[0]);
                        if (!proximo) proximoFech.setMonth(proximoFech.getMonth() + 1);
                      } else if (ciclo) {
                        const cicloDias = parseInt(ciclo);
                        proximoFech = new Date(hoje);
                        proximoFech.setDate(proximoFech.getDate() + (cicloDias - (hoje.getDate() % cicloDias)));
                      } else {
                        proximoFech = new Date(hoje);
                      }
                      primeiroVenc = new Date(proximoFech);
                      primeiroVenc.setDate(primeiroVenc.getDate() + prazo);
                    }

                    const valorParcela = fornTotal / numParc;
                    const parcelas = Array.from({ length: numParc }, (_, i) => {
                      const dt = new Date(primeiroVenc);
                      dt.setDate(dt.getDate() + (i * 30));
                      return { num: i + 1, valor: valorParcela, data: dt };
                    });

                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-blue-100 border-b border-blue-200 flex justify-between items-center">
                          <span className="text-xs font-bold text-blue-700">Total: {formatCurrency(fornTotal)}</span>
                          <span className="text-[11px] text-blue-600">{numParc}x de {formatCurrency(valorParcela)}</span>
                        </div>
                        <div className="divide-y divide-blue-100">
                          {parcelas.map(p => (
                            <div key={p.num} className="flex items-center justify-between px-3 py-1.5">
                              <span className="text-xs text-blue-600 w-16">{p.num}ª parcela</span>
                              <span className="text-xs font-bold text-blue-800">{formatCurrency(p.valor)}</span>
                              <span className="text-xs text-blue-500">{p.data.toLocaleDateString("pt-BR")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] text-gray-500 mb-1 block">Qtd. Parcelas</label>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => {
                          const curr = condCustomParcelas[fId] ?? [];
                          if (curr.length > 1) setCondCustomParcelas(prev => ({ ...prev, [fId]: curr.slice(0, -1) }));
                        }} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 text-lg font-bold">-</button>
                        <span className="w-10 text-center text-sm font-bold text-gray-800">{(condCustomParcelas[fId] ?? []).length}</span>
                        <button type="button" onClick={() => {
                          const curr = condCustomParcelas[fId] ?? [];
                          const lastDate = curr.length > 0 ? curr[curr.length - 1].data : new Date().toISOString().split("T")[0];
                          const nextDate = new Date(lastDate + "T12:00:00");
                          nextDate.setDate(nextDate.getDate() + 30);
                          const restante = fornTotal - curr.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
                          setCondCustomParcelas(prev => ({ ...prev, [fId]: [...curr, { valor: Math.max(0, restante).toFixed(2), data: nextDate.toISOString().split("T")[0] }] }));
                        }} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 text-lg font-bold">+</button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-gray-500 mb-1 block">Dividir igual</label>
                      <button type="button" onClick={() => {
                        const curr = condCustomParcelas[fId] ?? [];
                        if (curr.length === 0) return;
                        const valorIgual = (fornTotal / curr.length).toFixed(2);
                        setCondCustomParcelas(prev => ({ ...prev, [fId]: curr.map(p => ({ ...p, valor: valorIgual })) }));
                      }} className="h-8 px-3 text-xs font-medium bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors">
                        Dividir R$ {formatCurrency(fornTotal)}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {(condCustomParcelas[fId] ?? []).map((parc, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                        <span className="text-xs font-bold text-violet-600 w-6">{idx + 1}.</span>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400">Valor</label>
                          <input type="number" step="0.01" min="0" value={parc.valor}
                            onChange={e => {
                              const updated = [...(condCustomParcelas[fId] ?? [])];
                              updated[idx] = { ...updated[idx], valor: e.target.value };
                              setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                            }}
                            className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white text-gray-900 focus:ring-1 focus:ring-violet-300 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400">Vencimento</label>
                          <input type="date" value={parc.data}
                            onChange={e => {
                              const updated = [...(condCustomParcelas[fId] ?? [])];
                              updated[idx] = { ...updated[idx], data: e.target.value };
                              setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                            }}
                            className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white text-gray-900 focus:ring-1 focus:ring-violet-300 outline-none" />
                        </div>
                        <button type="button" onClick={() => {
                          const updated = (condCustomParcelas[fId] ?? []).filter((_, i) => i !== idx);
                          setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                        }} className="text-red-400 hover:text-red-600 mt-3 text-sm">✕</button>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const parcList = condCustomParcelas[fId] ?? [];
                    const totalCustom = parcList.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
                    const diff = fornTotal - totalCustom;
                    return (
                      <div className={`flex justify-between items-center px-3 py-2 rounded-lg border ${Math.abs(diff) < 0.01 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                        <span className="text-xs font-medium text-gray-700">Total parcelas: <strong>{formatCurrency(totalCustom)}</strong></span>
                        {Math.abs(diff) >= 0.01 && (
                          <span className={`text-xs font-bold ${diff > 0 ? "text-amber-600" : "text-red-600"}`}>
                            {diff > 0 ? `Faltam ${formatCurrency(diff)}` : `Excede ${formatCurrency(Math.abs(diff))}`}
                          </span>
                        )}
                        {Math.abs(diff) < 0.01 && <span className="text-xs font-bold text-green-600">Valores batem</span>}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {(() => {
              const cotTipoEntrega = (mapaQ.data as any)?.tipoEfetivo ?? (mapaQ.data?.cotacao as any)?.tipo;
              const isMdoMedicao = (cotTipoEntrega === "servico" || cotTipoEntrega === "pacote") && (editTipoPag[fId] === "medicao" || (editCondPag[fId] ?? "").toLowerCase().includes("medição"));
              return (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">{isMdoMedicao ? "Mobilização & Frete" : "Entrega & Frete"}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">{isMdoMedicao ? "Prazo para Mobilização" : "Prazo de Entrega"}</label>
                  <div className="relative">
                    <input type="number" placeholder={isMdoMedicao ? "Ex: 7" : "Ex: 15"} value={editPrazo[fId] ?? ""} onChange={e => {
                        const dias = e.target.value;
                        setEditPrazo(prev => ({ ...prev, [fId]: dias }));
                        if (dias && parseInt(dias) > 0) {
                          const dt = new Date();
                          dt.setDate(dt.getDate() + parseInt(dias));
                          setEditDataEntrega(prev => ({ ...prev, [fId]: dt.toISOString().split("T")[0] }));
                        }
                      }}
                      className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 pr-12 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">dias</span>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">{isMdoMedicao ? "Data Início Mobilização" : "Data Prevista Entrega"}</label>
                  <input type="date" value={editDataEntrega[fId] ?? ""} onChange={e => {
                      const dataStr = e.target.value;
                      setEditDataEntrega(prev => ({ ...prev, [fId]: dataStr }));
                      if (dataStr) {
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0);
                        const dt = new Date(dataStr + "T00:00:00");
                        const diffMs = dt.getTime() - hoje.getTime();
                        const diffDias = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
                        setEditPrazo(prev => ({ ...prev, [fId]: String(diffDias) }));
                      }
                    }}
                    className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">Tipo de Frete</label>
                  <select value={editFreteTipo[fId] ?? "cif"} onChange={e => setEditFreteTipo(prev => ({ ...prev, [fId]: e.target.value }))}
                    className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none">
                    <option value="cif">CIF (incluso)</option>
                    <option value="fob">FOB (por conta)</option>
                  </select>
                </div>
                {(editFreteTipo[fId] ?? "cif") === "fob" && (
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">Valor do Frete</label>
                    <input type="number" step="0.01" min="0" placeholder="R$ 0,00" value={editValorFrete[fId] ?? "0"} onChange={e => setEditValorFrete(prev => ({ ...prev, [fId]: e.target.value }))}
                      className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                  </div>
                )}
              </div>
              {(editFreteTipo[fId] ?? "cif") === "fob" && (
                <div className="mt-3">
                  <label className="text-[11px] text-gray-500 mb-1 block">Transportadora</label>
                  <input type="text" placeholder="Nome da transportadora" value={editTransportadora[fId] ?? ""} onChange={e => setEditTransportadora(prev => ({ ...prev, [fId]: e.target.value }))}
                    className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                </div>
              )}
            </div>
              ); })()}

            {(() => {
              const MODULOS = [
                { v: "medicao_mensal", l: "Medição Mensal", desc: "Pagamento mensal por medição de serviço executado", icon: "📅", sel: "bg-purple-100 text-purple-700 border-purple-300 ring-purple-200" },
                { v: "medicao_avanco", l: "Medição por Avanço", desc: "Pagamento baseado no % de avanço físico", icon: "📊", sel: "bg-blue-100 text-blue-700 border-blue-300 ring-blue-200" },
                { v: "medicao_etapa", l: "Medição por Etapa", desc: "Pagamento ao concluir etapas/marcos definidos", icon: "🎯", sel: "bg-green-100 text-green-700 border-green-300 ring-green-200" },
                { v: "empreitada", l: "Empreitada Global", desc: "Preço fechado para o escopo total do serviço", icon: "📋", sel: "bg-amber-100 text-amber-700 border-amber-300 ring-amber-200" },
                { v: "administracao", l: "Administração", desc: "Custo por hora/dia + materiais aplicados", icon: "⏱️", sel: "bg-indigo-100 text-indigo-700 border-indigo-300 ring-indigo-200" },
              ];
              return (
                <div>
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Módulo de Medição</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS.map(m => (
                      <button key={m.v} type="button" onClick={() => setEditModuloMedicao(prev => ({ ...prev, [fId]: prev[fId] === m.v ? "" : m.v }))}
                        className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left border-2 transition-all ${editModuloMedicao[fId] === m.v ? `${m.sel} ring-2` : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                        <span className="flex items-center gap-1.5 text-sm font-medium"><span>{m.icon}</span> {m.l}</span>
                        <span className="text-[10px] opacity-70 leading-tight">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                  {editModuloMedicao[fId] && (
                    <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-xs text-purple-700 font-medium">
                        {MODULOS.find(m => m.v === editModuloMedicao[fId])?.icon} Módulo selecionado: <strong>{MODULOS.find(m => m.v === editModuloMedicao[fId])?.l}</strong>
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex justify-end gap-2">
            <button onClick={() => setCondModalFornId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Fechar</button>
            <button onClick={() => {
              setCondModalFornId(null);
              toast.success("Condições atualizadas! Clique em Salvar para persistir.");
            }} className="px-5 py-2 text-sm font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  })(), document.body) : null;

  /* ── Tela cheia de detalhe ── */
  if (showDetalhe !== null) {
    const detalheFullscreen = detalheQ.data;
    const forn = detalheFullscreen ? fornecedores.find(f => f.id === detalheFullscreen.fornecedorId) : null;
    const st = detalheFullscreen ? (STATUS_LABELS[detalheFullscreen.status] ?? STATUS_LABELS.pendente) : null;
    const mapa = mapaQ.data;

    const fornIdsNoMapa = new Set((mapa?.participantes ?? []).map((p: any) => p.fornecedorId));
    const fornDisponiveis = fornecedores.filter(f => !fornIdsNoMapa.has(f.id));

    const sugestoesFiltradas = (sugestoesRecompraQ.data ?? []).filter(s => s.fornecedorId && !fornIdsNoMapa.has(s.fornecedorId));

    function getMelhorPrecoItem(itemId: number): number | null {
      if (!mapa || mapa.participantes.length === 0) return null;
      const precos = mapa.participantes.map((p: any) => {
        const r = mapa.respostaMap[`${itemId}_${p.fornecedorId}`];
        return r ? parseFloat((r as any).precoUnitario ?? "0") : null;
      }).filter((v): v is number => v !== null && v > 0);
      return precos.length > 0 ? Math.min(...precos) : null;
    }

    function getMelhorFornecedor(): any | null {
      if (!mapa || mapa.participantes.length === 0) return null;
      const comTotal = mapa.participantes.filter((p: any) => parseFloat(p.totalOrcado ?? "0") > 0);
      if (comTotal.length === 0) return null;
      return comTotal.reduce((best: any, curr: any) => {
        const bTotal = parseFloat(best.totalOrcado ?? "0");
        const cTotal = parseFloat(curr.totalOrcado ?? "0");
        if (cTotal < bTotal) return curr;
        if (cTotal === bTotal && (curr.prazoEntregaDias ?? 9999) < (best.prazoEntregaDias ?? 9999)) return curr;
        return best;
      }, comTotal[0]);
    }

    const melhorForn = getMelhorFornecedor();
    const vencedorSelecionado = (mapa?.participantes ?? []).find((p: any) => p.selecionado) ?? null;
    const fornParaSaldo = vencedorSelecionado || melhorForn;

    const itensSemVerba = (mapa?.itens ?? []).filter((it: any) => (it as any).fonteVinculo !== "item" && (it as any).fonteVinculo !== "insumo");
    const temItensSemVerba = itensSemVerba.length > 0;
    const vencedorFornId = fornParaSaldo?.fornecedorId;
    const vencedorModuloMedicao = vencedorFornId ? (editModuloMedicao[vencedorFornId] || (fornParaSaldo as any)?.moduloMedicao || "") : "";
    const isMedicaoVencedor = ["medicao_mensal", "medicao_avanco", "medicao_etapa", "empreitada"].includes(vencedorModuloMedicao);

    function validarCondicoesVencedor(): boolean {
      if (!fornParaSaldo) {
        toast.error("Selecione um fornecedor vencedor antes de aprovar.");
        return false;
      }
      const condPag = (fornParaSaldo as any).condicaoPagamento || (fornParaSaldo as any).formaPagamento;
      const prazo = (fornParaSaldo as any).prazoEntregaDias;
      const tipoPag = (fornParaSaldo as any).tipoPagamento ?? "";
      const cotTipoVal = (mapaQ.data as any)?.tipoEfetivo ?? (mapaQ.data?.cotacao as any)?.tipo;
      const isMdoMedicao = (cotTipoVal === "servico" || cotTipoVal === "pacote") && (tipoPag === "medicao" || (condPag ?? "").toLowerCase().includes("medição"));
      const erros: string[] = [];
      if (!condPag) erros.push("Forma de Pagamento");
      if (!isMdoMedicao && (!prazo || Number(prazo) <= 0)) erros.push("Prazo de Entrega");
      if (erros.length > 0) {
        toast.error(`Preencha ${erros.join(" e ")} nas condições do vencedor antes de aprovar.`);
        return false;
      }
      return true;
    }

    function handleAprovarGerarOC(cotacaoId: number) {
      if (!validarCondicoesVencedor()) return;
      if (temItensSemVerba && !semVerbaAutorizado) {
        setSemVerbaAdminEmail("");
        setSemVerbaAdminSenha("");
        setSemVerbaJustificativa("");
        setShowSemVerbaDialog(true);
        return;
      }
      const fornTotal = parseFloat(fornParaSaldo.totalOrcado ?? "0");
      const metaTotal = (mapa?.itens ?? []).reduce((acc: number, it: any) =>
        acc + (Math.round(parseFloat(it.metaUnitario ?? "0") * 100) / 100 * parseFloat(it.metaQtd ?? it.quantidade ?? "0")), 0);
      if (metaTotal > 0 && fornTotal > metaTotal && !cobertoPorRisco && !semVerbaAutorizado) {
        const defVal = (fornTotal - metaTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const fornNome = fornParaSaldo.fornecedor?.nomeFantasia || fornParaSaldo.fornecedor?.razaoSocial || "Fornecedor";
        const ok = confirm(
          `⚠️ ATENÇÃO: O valor do fornecedor ${fornNome} (${fornTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) ` +
          `está acima da meta orçamentária (${metaTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).\n\n` +
          `Déficit: ${defVal}\n\n` +
          `Recomendamos utilizar o painel de Realocação de Verba antes de aprovar.\n\n` +
          `Deseja continuar mesmo assim?`
        );
        if (!ok) return;
      }
      gerarOC.mutate({
        companyId, cotacaoId, userId: user?.id, userName: user?.name,
        ...(semVerbaAutorizado ? { autorizacaoSemVerba: semVerbaAutorizado } : {}),
      });
    }

    function handleAutorizarSemVerba() {
      if (!showDetalhe) return;
      const itensInfo = itensSemVerba.map((it: any) => {
        const key = `${it.id}_${fornParaSaldo?.fornecedorId}`;
        const precoUnit = parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
        const qtd = parseFloat(it.quantidade ?? "0");
        return {
          descricao: it.descricao ?? "Item",
          quantidade: qtd,
          unidade: it.unidade ?? "un",
          valorTotal: precoUnit * qtd,
        };
      });
      autorizarSemVerba.mutate({
        companyId,
        cotacaoId: showDetalhe,
        adminEmail: semVerbaAdminEmail,
        adminSenha: semVerbaAdminSenha,
        justificativa: semVerbaJustificativa,
        itensSemVerba: itensInfo,
      });
    }

    function handleSalvarPrecos(fornecedorId: number) {
      if (!mapa || !showDetalhe) return;
      const isPacote = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
      let respostas: Array<{ itemId: number; precoUnitario: number; descontoPct: number; quantidade: number }>;
      if (isPacote) {
        const compGroups: Record<string, any[]> = {};
        const noComp: any[] = [];
        for (const it of mapa.itens) {
          const cc = (it as any).composicaoCodigo ?? "";
          if (cc) {
            if (!compGroups[cc]) compGroups[cc] = [];
            compGroups[cc].push(it);
          } else {
            noComp.push(it);
          }
        }
        respostas = [];
        for (const [_cc, items] of Object.entries(compGroups)) {
          const first = items[0];
          const compQtd = (first as any).composicaoQtdOrcada || parseFloat(first.quantidade ?? "0");
          const firstKey = `${first.id}_${fornecedorId}`;
          const precoComp = parseFloat(editPrecos[firstKey] ?? "0") || 0;
          respostas.push({ itemId: first.id, precoUnitario: precoComp, descontoPct: 0, quantidade: compQtd });
          for (let i = 1; i < items.length; i++) {
            respostas.push({ itemId: items[i].id, precoUnitario: 0, descontoPct: 0, quantidade: 0 });
          }
        }
        for (const it of noComp) {
          const key = `${it.id}_${fornecedorId}`;
          const qtyStr = editQtds[key];
          const qty = qtyStr && parseFloat(qtyStr) > 0 ? parseFloat(qtyStr) : parseFloat(it.quantidade);
          respostas.push({ itemId: it.id, precoUnitario: parseFloat(editPrecos[key] ?? "0") || 0, descontoPct: 0, quantidade: qty });
        }
      } else {
        respostas = mapa.itens.map((it: any) => {
          const key = `${it.id}_${fornecedorId}`;
          const qtyStr = editQtds[key];
          const qty = qtyStr && parseFloat(qtyStr) > 0 ? parseFloat(qtyStr) : parseFloat(it.quantidade);
          return {
            itemId: it.id,
            precoUnitario: parseFloat(editPrecos[key] ?? "0") || 0,
            descontoPct: 0,
            quantidade: qty,
          };
        });
      }
      const tipoPag = editCondPag[fornecedorId] || undefined;
      salvarRespostas.mutate({
        cotacaoId: showDetalhe,
        fornecedorId,
        prazoEntregaDias: editPrazo[fornecedorId] ? parseInt(editPrazo[fornecedorId]) : undefined,
        condicaoPagamento: editCondPag[fornecedorId] || undefined,
        tipoPagamento: editTipoPag[fornecedorId] || undefined,
        formaPagamento: editFormaPag[fornecedorId] || undefined,
        freteTipo: editFreteTipo[fornecedorId] || "cif",
        valorFrete: parseFloat(editValorFrete[fornecedorId] ?? "0") || 0,
        transportadora: editTransportadora[fornecedorId] || undefined,
        moduloMedicao: editModuloMedicao[fornecedorId] || undefined,
        respostas,
      });
    }

    function getFornTotal(p: any): number {
      if (editingFornId === p.fornecedorId) {
        const isPacote = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
        let totalItens = 0;
        if (isPacote) {
          const seen = new Set<string>();
          for (const it of (mapa?.itens ?? [])) {
            const cc = (it as any).composicaoCodigo ?? "";
            if (cc) {
              if (seen.has(cc)) continue;
              seen.add(cc);
              const firstKey = `${it.id}_${p.fornecedorId}`;
              const preco = parseFloat(editPrecos[firstKey] ?? "0") || 0;
              const compQtd = (it as any).composicaoQtdOrcada || parseFloat(it.quantidade ?? "0");
              totalItens += preco * compQtd;
            } else {
              const key = `${it.id}_${p.fornecedorId}`;
              const preco = parseFloat(editPrecos[key] ?? "0") || 0;
              const qtyStr = editQtds[key];
              const qty = qtyStr && parseFloat(qtyStr) > 0 ? parseFloat(qtyStr) : parseFloat(it.quantidade);
              totalItens += preco * qty;
            }
          }
        } else {
          totalItens = (mapa?.itens ?? []).reduce((acc: number, it: any) => {
            const key = `${it.id}_${p.fornecedorId}`;
            const preco = parseFloat(editPrecos[key] ?? "0") || 0;
            const qtyStr = editQtds[key];
            const qty = qtyStr && parseFloat(qtyStr) > 0 ? parseFloat(qtyStr) : parseFloat(it.quantidade);
            return acc + preco * qty;
          }, 0);
        }
        const isFob = (editFreteTipo[p.fornecedorId] ?? "cif") === "fob";
        const frete = isFob ? (parseFloat(editValorFrete[p.fornecedorId] ?? "0") || 0) : 0;
        return totalItens + frete;
      }
      return parseFloat(p.totalOrcado ?? "0");
    }

    function getFornFrete(p: any): number {
      if (editingFornId === p.fornecedorId) {
        return parseFloat(editValorFrete[p.fornecedorId] ?? "0") || 0;
      }
      return parseFloat((p as any).valorFrete ?? "0");
    }

    function getItemSaldo(it: any): { saldo: number; hasMeta: boolean } {
      const metaUnit = Math.round(parseFloat(it.metaUnitario ?? "0") * 100) / 100;
      const qtdItem = parseFloat(it.metaQtd ?? it.quantidade ?? "0");
      const fonteV = (it as any).fonteVinculo;
      if (!fonteV && metaUnit === 0) {
        if (!fornParaSaldo) return { saldo: 0, hasMeta: false };
        const wKey = `${it.id}_${fornParaSaldo.fornecedorId}`;
        const wResp = mapa?.respostaMap?.[wKey];
        const precoForn = parseFloat(wResp?.precoUnitario ?? "0");
        return { saldo: -(precoForn * qtdItem), hasMeta: true };
      }
      if (metaUnit === 0) return { saldo: 0, hasMeta: false };
      if (!fornParaSaldo) return { saldo: 0, hasMeta: true };
      const wKey = `${it.id}_${fornParaSaldo.fornecedorId}`;
      const wResp = mapa?.respostaMap?.[wKey];
      const precoForn = parseFloat(wResp?.precoUnitario ?? "0");
      const custoCompra = precoForn * qtdItem;
      const qtdOrcada = parseFloat((it as any).qtdOrcada ?? "0");
      const qtdTotalSolicitada = parseFloat((it as any).qtdTotalSolicitada ?? "0");
      const estourou = (it as any).semVerba || (qtdOrcada > 0 && qtdTotalSolicitada > qtdOrcada + 0.01);
      if (estourou) {
        const qtdExcedente = qtdTotalSolicitada - qtdOrcada;
        const qtdCoberta = Math.max(0, qtdItem - qtdExcedente);
        const verbaCoberta = metaUnit * qtdCoberta;
        return { saldo: verbaCoberta - custoCompra, hasMeta: true };
      }
      const metaTot = metaUnit * qtdItem;
      return { saldo: metaTot - custoCompra, hasMeta: true };
    }

    const isPacoteTotals = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
    const pacoteCompItens = (() => {
      if (!isPacoteTotals) return null;
      const rawIt = mapa?.itens ?? [];
      const compGroups: Record<string, any[]> = {};
      const noComp: any[] = [];
      for (const it of rawIt) {
        const cc = (it as any).composicaoCodigo ?? "";
        if (cc) {
          if (!compGroups[cc]) compGroups[cc] = [];
          compGroups[cc].push(it);
        } else {
          noComp.push(it);
        }
      }
      const grouped = Object.entries(compGroups).map(([_cc, items]) => {
        const first = items[0];
        const compQtd = (first as any).composicaoQtdOrcada || 0;
        const compMeta = (first as any).composicaoMetaTotal || 0;
        const compUn = (first as any).composicaoUnidade || first.unidade;
        return { quantidade: compQtd, metaUnitario: compMeta, metaQtd: compQtd, unidade: compUn };
      });
      return [...grouped, ...noComp.map((it: any) => ({ quantidade: parseFloat(it.quantidade ?? "0"), metaUnitario: parseFloat(it.metaUnitario ?? "0"), metaQtd: parseFloat(it.metaQtd ?? it.quantidade ?? "0"), unidade: it.unidade || "un" }))];
    })();
    const itensParaTotais = pacoteCompItens ?? (mapa?.itens ?? []).map((it: any) => ({ quantidade: parseFloat(it.quantidade ?? "0"), metaUnitario: parseFloat(it.metaUnitario ?? "0"), metaQtd: parseFloat(it.metaQtd ?? it.quantidade ?? "0"), unidade: it.unidade || "un" }));
    const metaGrandTotal = itensParaTotais.reduce((acc: number, it: any) =>
      acc + (Math.round(it.metaUnitario * 100) / 100 * it.metaQtd), 0);
    const unidadesUnicas = [...new Set(itensParaTotais.map((it: any) => (it.unidade || "un").toLowerCase()))];
    const qtdGrandTotal = unidadesUnicas.length === 1
      ? itensParaTotais.reduce((acc: number, it: any) => acc + it.metaQtd, 0)
      : null;
    const qtdUnidade = unidadesUnicas.length === 1 ? unidadesUnicas[0] : null;
    const allItens = mapa?.itens ?? [];
    const winnerGrandTotal = fornParaSaldo ? parseFloat(fornParaSaldo.totalOrcado ?? "0") : 0;
    const saldoTotal = fornParaSaldo ? (isPacoteTotals
      ? metaGrandTotal - winnerGrandTotal
      : allItens.reduce((acc: number, it: any) => {
          const { saldo, hasMeta } = getItemSaldo(it);
          return acc + (hasMeta ? saldo : 0);
        }, 0)
    ) : 0;
    const deficit = saldoTotal < 0 ? Math.abs(saldoTotal) : 0;

    const cobertura = (() => {
      const itensComOrc = allItens.filter((it: any) => (it as any).qtdOrcada > 0);
      if (itensComOrc.length === 0) return null;
      const total = itensComOrc.length;
      const totais = itensComOrc.filter((it: any) => (it as any).qtdTotalSolicitada >= (it as any).qtdOrcada);
      const parciais = itensComOrc.filter((it: any) => (it as any).qtdTotalSolicitada > 0 && (it as any).qtdTotalSolicitada < (it as any).qtdOrcada);
      const pctMedio = itensComOrc.reduce((acc: number, it: any) => acc + Math.min(((it as any).qtdTotalSolicitada / (it as any).qtdOrcada) * 100, 100), 0) / total;
      return { total, totais: totais.length, parciais: parciais.length, semCobertura: total - totais.length - parciais.length, pctMedio };
    })();

    // Remove prefixo de código EAP "[xx.xx.xx.xx] " da descrição para agrupar itens iguais
    const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
    const agrupados: Record<string, { descricao: string; unidade: string; qtdTotal: number }> = {};
    for (const it of (mapa?.itens ?? [])) {
      const descLimpa = stripEapPrefix(it.descricao);
      const chave = `${descLimpa}__${it.unidade || "un"}`;
      if (!agrupados[chave]) agrupados[chave] = { descricao: descLimpa, unidade: it.unidade || "un", qtdTotal: 0 };
      agrupados[chave].qtdTotal += parseFloat(it.quantidade ?? "0");
    }
    const gruposAgrupados = Object.values(agrupados).filter(g => g.qtdTotal > 0);

    return (
      <DashboardLayout>
        <div className="p-6 space-y-5 bg-gray-50 min-h-screen">
          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowDetalhe(null); setAbaAtiva("detalhes"); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <ChevronRight className="h-4 w-4 rotate-180" /> Cotações
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-900 font-mono">{detalheFullscreen?.numeroCotacao ?? "…"}</span>
          </div>

          {detalheQ.isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detalheFullscreen ? (
            <>
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 font-mono">{detalheFullscreen.numeroCotacao}</h1>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${(detalheFullscreen as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : (detalheFullscreen as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700" : (detalheFullscreen as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>
                      {(detalheFullscreen as any).tipo === "servico" ? "MDO" : (detalheFullscreen as any).tipo === "pacote" ? "MAT+MDO" : (detalheFullscreen as any).tipo === "equipamento" ? "EQUIP" : "MAT"}
                    </span>
                  </div>
                  {(detalheFullscreen as any).descricao && <p className="text-gray-500 mt-0.5">{(detalheFullscreen as any).descricao}</p>}
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">

                  {st && <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${st.cls}`}>{st.label}</span>}
                  {detalheFullscreen.status === "pendente" && (detalheFullscreen as any).tipo === "servico" && (
                    <>
                      {deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado ? (
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
                          <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-red-800">Não é possível aprovar — déficit orçamentário de {deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                            <p className="text-xs text-red-600 mt-0.5">Resolva a realocação de custo no Mapa de Cotação antes de gerar o contrato.</p>
                          </div>
                        </div>
                      ) : (
                        <Button onClick={() => {
                          if (!validarCondicoesVencedor()) return;
                          gerarContrato.mutate({ cotacaoId: detalheFullscreen.id, companyId });
                        }} disabled={gerarContrato.isPending}
                          className="bg-purple-600 hover:bg-purple-500 text-white gap-2">
                          {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          Aprovar e Gerar Contrato de Serviço
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => atualizarStatus.mutate({ id: detalheFullscreen.id, status: "recusada" })}
                        className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                        <XCircle className="h-4 w-4" /> Recusar
                      </Button>
                    </>
                  )}
                  {detalheFullscreen.status === "pendente" && (detalheFullscreen as any).tipo !== "servico" && (
                    <>
                      <Button onClick={() => handleAprovarGerarOC(detalheFullscreen.id)} disabled={gerarOC.isPending}
                        className={`${temItensSemVerba && !semVerbaAutorizado ? "bg-red-600 hover:bg-red-700" : isMedicaoVencedor ? "bg-blue-600 hover:bg-blue-500" : "bg-emerald-600 hover:bg-emerald-500"} text-white gap-2`}>
                        {gerarOC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : temItensSemVerba && !semVerbaAutorizado ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        {temItensSemVerba && !semVerbaAutorizado ? "Aprovar (Requer Autorização)" : semVerbaAutorizado ? "Aprovar e Gerar OC (Autorizado)" : isMedicaoVencedor ? "Aprovar e Gerar Contrato" : "Aprovar e Gerar OC"}
                      </Button>
                      {isMedicaoVencedor && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Contrato será gerado no módulo Terceiros
                        </span>
                      )}
                      <Button variant="outline" onClick={() => atualizarStatus.mutate({ id: detalheFullscreen.id, status: "recusada" })}
                        className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                        <XCircle className="h-4 w-4" /> Recusar
                      </Button>
                    </>
                  )}
                  {(detalheFullscreen.status === "aprovada" || detalheFullscreen.status === "concluida") && (detalheFullscreen as any).contratoTerceiroId && (
                    <Button onClick={() => { setShowDetalhe(null); navigate(`/terceiros/contratos/${(detalheFullscreen as any).contratoTerceiroId}`); }}
                      className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                      <ExternalLink className="h-4 w-4" /> Ir para Contrato de Serviço
                    </Button>
                  )}
                  {detalheFullscreen.status === "concluida" && (detalheFullscreen as any).contratoTerceiroId && isAdminMaster && (
                    <Button variant="outline" onClick={() => {
                      if (confirm("Tem certeza? O contrato de serviço será excluído e a cotação voltará para 'Aprovada', permitindo edições e nova geração de contrato.")) {
                        reverterOS.mutate({ cotacaoId: showDetalhe!, companyId });
                      }
                    }}
                      disabled={reverterOS.isPending}
                      className="border-orange-200 text-orange-600 hover:bg-orange-50 gap-2">
                      {reverterOS.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Reverter Aprovação
                    </Button>
                  )}
                  {detalheFullscreen.status === "aprovada" && isAdminMaster && !(detalheFullscreen as any).contratoTerceiroId && (
                    <Button variant="outline" onClick={() => { setJustificativaCancelar(""); setCancelarCotacaoId(showDetalhe); setShowCancelarAprovacao(true); }}
                      className="border-orange-200 text-orange-600 hover:bg-orange-50 gap-2">
                      <Undo2 className="h-4 w-4" /> Cancelar Aprovação
                    </Button>
                  )}
                  {["cancelada", "recusada"].includes(detalheFullscreen.status ?? "") && (
                    <Button variant="outline" onClick={() => {
                      if (confirm("Deseja reabrir esta cotação? O status voltará para 'Pendente' e será possível aprová-la novamente.")) {
                        atualizarStatus.mutate({ id: detalheFullscreen.id, status: "pendente" });
                      }
                    }}
                      disabled={atualizarStatus.isPending}
                      className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-2">
                      {atualizarStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reabrir Cotação
                    </Button>
                  )}
                  {!["cancelada", "recusada", "aprovada", "concluida"].includes(detalheFullscreen.status ?? "") && (
                    <Button variant="outline" onClick={() => {
                      if (confirm("Tem certeza que deseja cancelar esta cotação? A SC voltará para o status 'Aprovado' e poderá gerar nova cotação.")) {
                        cancelarCotacaoMut.mutate({ cotacaoId: showDetalhe!, companyId });
                      }
                    }}
                      disabled={cancelarCotacaoMut.isPending}
                      className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                      {cancelarCotacaoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Cancelar Cotação
                    </Button>
                  )}
                </div>
              </div>

              {/* Barra de evolução */}
              {(() => {
                const df = detalheFullscreen as any;
                const isServicoOuPacote = df.tipo === "servico" || df.tipo === "pacote";
                const hasOC = df.status === "aprovada" || df.status === "concluida";
                const hasContrato = !!df.contratoTerceiroId;
                const steps = isServicoOuPacote
                  ? [
                      { label: "Solicitação", done: true, icon: <ClipboardList className="h-4 w-4" /> },
                      { label: "Cotação", done: true, icon: <FileSearch className="h-4 w-4" /> },
                      { label: "Ordem de Serviço", done: hasOC, icon: <ShoppingCart className="h-4 w-4" /> },
                      { label: "Contrato", done: hasContrato, icon: <FileText className="h-4 w-4" /> },
                    ]
                  : [
                      { label: "Solicitação", done: true, icon: <ClipboardList className="h-4 w-4" /> },
                      { label: "Cotação", done: true, icon: <FileSearch className="h-4 w-4" /> },
                      { label: "Ordem de Compra", done: hasOC, icon: <ShoppingCart className="h-4 w-4" /> },
                      { label: "Entrega", done: df.status === "concluida", icon: <CheckCircle className="h-4 w-4" /> },
                    ];
                const currentIdx = steps.reduce((acc, s, i) => (s.done ? i : acc), 0);
                const isCancelada = df.status === "cancelada" || df.status === "recusada";
                return (
                  <div className="flex items-center gap-0 w-full py-2">
                    {steps.map((step, i) => {
                      const isActive = i === currentIdx + (steps[currentIdx + 1] && !steps[currentIdx + 1].done ? 1 : 0) && !isCancelada;
                      const isDone = step.done && !isCancelada;
                      return (
                        <div key={i} className="flex items-center flex-1">
                          <div className="flex flex-col items-center flex-1">
                            <div className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all ${
                              isDone ? "bg-emerald-500 border-emerald-500 text-white" :
                              isActive && !isDone ? "bg-white border-blue-500 text-blue-600 ring-4 ring-blue-100" :
                              isCancelada ? "bg-gray-100 border-gray-300 text-gray-400" :
                              "bg-gray-100 border-gray-300 text-gray-400"
                            }`}>
                              {isDone ? <Check className="h-4 w-4" /> : step.icon}
                            </div>
                            <span className={`text-[11px] mt-1.5 font-medium text-center leading-tight ${
                              isDone ? "text-emerald-700" : isActive && !isDone ? "text-blue-700" : "text-gray-400"
                            }`}>{step.label}</span>
                          </div>
                          {i < steps.length - 1 && (
                            <div className={`h-0.5 flex-1 -mt-5 mx-1 rounded ${isDone ? "bg-emerald-400" : "bg-gray-200"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {(detalheFullscreen as any)?.itens?.some((it: any) => it.semVerba) && (
                <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 print:border-red-500">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-red-800">⚠ PREJUÍZO — Itens Acima do Orçado ou Sem Verba</p>
                    <p className="text-xs text-red-600">Esta cotação contém {(detalheFullscreen as any).itens.filter((it: any) => it.semVerba).length} item(ns) sem verba disponível no orçamento. Os itens sinalizados geram prejuízo para a obra.</p>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
                {([["detalhes", <FileText className="h-4 w-4" />, "Detalhes"], ["mapa", <BarChart3 className="h-4 w-4" />, "Mapa de Cotação"]] as const).map(([key, icon, label]) => (
                  <button key={key} onClick={() => setAbaAtiva(key as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === key ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* ── ABA: DETALHES ── */}
              {abaAtiva === "detalhes" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Obra", value: nomeObra((detalheFullscreen as any).obraId) ?? "—" },
                      { label: "Fornecedor Vencedor", value: forn?.nomeFantasia || forn?.razaoSocial || "—" },
                      { label: "Cond. Pagamento", value: (() => { const info = getTipoPagamentoInfo((detalheFullscreen as any).tipoPagamento); return info ? info.label : detalheFullscreen.condicaoPagamento || "—"; })() },
                      { label: (() => { const tp = (detalheFullscreen as any).tipoPagamento ?? ""; const cp = detalheFullscreen.condicaoPagamento ?? ""; const t = (detalheFullscreen as any).tipo; return ((t === "servico" || t === "pacote") && (tp === "medicao" || cp.toLowerCase().includes("medição"))) ? "Mobilização" : "Prazo Entrega"; })(), value: detalheFullscreen.prazoEntregaDias ? `${detalheFullscreen.prazoEntregaDias} dias` : "—" },
                      { label: "Validade", value: detalheFullscreen.dataValidade ? new Date(detalheFullscreen.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                      { label: "SC Vinculada", value: detalheFullscreen.solicitacaoId ? `SC #${detalheFullscreen.solicitacaoId}` : "—" },
                    ].map(f => (
                      <div key={f.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{f.label}</p>
                        <p className="text-gray-900 font-medium text-sm">{f.value}</p>
                      </div>
                    ))}
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
                      <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Total</p>
                      <p className="text-emerald-700 font-bold text-lg">{parseFloat(detalheFullscreen.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    </div>
                  </div>

                  {detalheFullscreen.fornecedorId && (
                    <FornecedorContatoCard contato={(detalheFullscreen as { fornecedorContato?: FornecedorContatoData | null }).fornecedorContato} />
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Itens</h2>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-100 bg-gray-50 hover:bg-gray-50">
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase">Descrição</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-16">Un.</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-24 text-right">Qtd</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Preço Unit.</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-20 text-right">Desc%</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detalheFullscreen.itens as any[]).map((it: any) => (
                          <TableRow key={it.id} className={`border-gray-100 hover:bg-gray-50 ${it.semVerba ? "bg-red-50 print:bg-red-50" : ""}`}>
                            <TableCell className="text-gray-900 text-sm py-3">
                              {it.descricao}
                              {it.semVerba && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 print:border-red-400">PREJUÍZO</span>}
                            </TableCell>
                            <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                            <TableCell className="text-gray-700 text-sm text-right">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-gray-700 text-sm text-right">{parseFloat(it.precoUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                            <TableCell className="text-gray-500 text-sm text-right">{parseFloat(it.descontoPct || "0")}%</TableCell>
                            <TableCell className="text-emerald-700 text-sm font-semibold text-right">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-200">
                    {detalheFullscreen.status === "pendente" && (detalheFullscreen as any).tipo === "servico" && (
                      <>
                        {deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado ? (
                          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
                            <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-red-800">Não é possível aprovar — déficit orçamentário de {deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                              <p className="text-xs text-red-600 mt-0.5">Resolva a realocação de custo no Mapa de Cotação antes de gerar o contrato.</p>
                            </div>
                          </div>
                        ) : (
                          <Button onClick={() => {
                            if (!validarCondicoesVencedor()) return;
                            gerarContrato.mutate({ cotacaoId: detalheFullscreen.id, companyId });
                          }} disabled={gerarContrato.isPending}
                            className="bg-purple-600 hover:bg-purple-500 text-white gap-2">
                            {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            Aprovar e Gerar Contrato de Serviço
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => atualizarStatus.mutate({ id: detalheFullscreen.id, status: "recusada" })}
                          className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                          <X className="h-4 w-4" /> Recusar
                        </Button>
                      </>
                    )}
                    {detalheFullscreen.status === "pendente" && (detalheFullscreen as any).tipo !== "servico" && (
                      <>
                        <Button onClick={() => handleAprovarGerarOC(detalheFullscreen.id)} disabled={gerarOC.isPending}
                          className={`${temItensSemVerba && !semVerbaAutorizado ? "bg-red-600 hover:bg-red-700" : isMedicaoVencedor ? "bg-blue-600 hover:bg-blue-500" : "bg-emerald-600 hover:bg-emerald-500"} text-white gap-2`}>
                          {gerarOC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : temItensSemVerba && !semVerbaAutorizado ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          {temItensSemVerba && !semVerbaAutorizado ? "Aprovar (Requer Autorização)" : semVerbaAutorizado ? "Aprovar e Gerar OC (Autorizado)" : isMedicaoVencedor ? "Aprovar e Gerar Contrato" : "Aprovar e Gerar OC"}
                        </Button>
                        {isMedicaoVencedor && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Contrato será gerado no módulo Terceiros
                          </span>
                        )}
                        <Button variant="outline" onClick={() => atualizarStatus.mutate({ id: detalheFullscreen.id, status: "recusada" })}
                          className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                          <X className="h-4 w-4" /> Recusar
                        </Button>
                      </>
                    )}
                    {(detalheFullscreen.status === "aprovada" || detalheFullscreen.status === "concluida") && (detalheFullscreen as any).contratoTerceiroId && (
                      <Button variant="outline" onClick={() => { setShowDetalhe(null); navigate(`/terceiros/contratos/${(detalheFullscreen as any).contratoTerceiroId}`); }}
                        className="border-blue-200 text-blue-600 hover:bg-blue-50 gap-2">
                        <FileText className="h-4 w-4" /> Ver Contrato de Serviço
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => excluir.mutate({ id: detalheFullscreen.id })} disabled={excluir.isPending}
                      className="border-gray-200 text-gray-500 hover:bg-gray-50 gap-2 ml-auto">
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ABA: MAPA DE COTAÇÃO ── */}
              {abaAtiva === "mapa" && (
                <div className="space-y-5">
                  {/* Adicionar fornecedor */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fornecedores Participantes</p>
                    <div className="flex gap-2 mb-4">
                      <Popover open={mapaFornOpen} onOpenChange={setMapaFornOpen}>
                        <PopoverTrigger asChild>
                          <button className="flex-1 flex items-center justify-between h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900 hover:border-gray-400 transition-colors">
                            <span className={mapaFornSelectId ? "text-gray-900" : "text-gray-400"}>
                              {mapaFornSelectId
                                ? (fornDisponiveis.find((f: any) => String(f.id) === mapaFornSelectId)?.nomeFantasia || fornDisponiveis.find((f: any) => String(f.id) === mapaFornSelectId)?.razaoSocial || "Selecionar fornecedor...")
                                : "Selecionar fornecedor..."}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 text-gray-400 shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[400px] bg-white border border-gray-200 shadow-lg rounded-lg" align="start">
                          <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                              <input
                                autoFocus
                                placeholder="Pesquisar fornecedor..."
                                value={mapaFornSearch}
                                onChange={e => setMapaFornSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto py-1">
                            {fornDisponiveis
                              .filter((f: any) => {
                                const nome = (f.nomeFantasia || f.razaoSocial || "").toLowerCase();
                                return !mapaFornSearch || nome.includes(mapaFornSearch.toLowerCase());
                              })
                              .map((f: any) => (
                                <button key={f.id} onClick={() => { setMapaFornSelectId(String(f.id)); setMapaFornOpen(false); setMapaFornSearch(""); }}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${mapaFornSelectId === String(f.id) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"}`}>
                                  {f.nomeFantasia || f.razaoSocial}
                                </button>
                              ))}
                            {fornDisponiveis.filter((f: any) => !mapaFornSearch || (f.nomeFantasia || f.razaoSocial || "").toLowerCase().includes(mapaFornSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-3 text-sm text-gray-400 text-center">Nenhum fornecedor encontrado</p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button onClick={() => { if (mapaFornSelectId && showDetalhe) { adicionarForn.mutate({ cotacaoId: showDetalhe, fornecedorId: parseInt(mapaFornSelectId) }); setMapaFornSelectId(""); } }}
                        disabled={!mapaFornSelectId || adicionarForn.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                        <UserPlus className="h-4 w-4" /> Adicionar
                      </Button>
                    </div>

                    {sugestoesFiltradas.length > 0 && detalheFullscreen?.status === "pendente" && (
                      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          Sugestões de recompra — fornecedores que já atenderam itens semelhantes
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sugestoesFiltradas.map(s => {
                            const fornCadastrado = fornecedores.find(f => f.id === s.fornecedorId);
                            const nome = fornCadastrado?.nomeFantasia || fornCadastrado?.razaoSocial || s.fornecedorNome || `#${s.fornecedorId}`;
                            return (
                              <button
                                key={s.fornecedorId}
                                onClick={() => {
                                  if (showDetalhe && s.fornecedorId) {
                                    adicionarForn.mutate({ cotacaoId: showDetalhe, fornecedorId: s.fornecedorId });
                                  }
                                }}
                                disabled={adicionarForn.isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-all"
                              >
                                <UserPlus className="h-3 w-3" />
                                {nome}
                                <span className="text-emerald-500 text-[10px] font-normal">
                                  ({s.itensAtendidos} {s.itensAtendidos === 1 ? "item" : "itens"})
                                </span>
                                {s.ultimaOc && (
                                  <span className="text-emerald-400 text-[10px] font-normal">· {s.ultimaOc}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(mapa?.participantes ?? []).length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-3">Nenhum fornecedor adicionado ao mapa ainda.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(mapa?.participantes ?? []).map((p: any) => {
                          const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
                          const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                          const sc = scoresQ.data?.[p.fornecedorId];
                          const scoreVal = sc?.score ?? 0;
                          const isRecomendado = scoreVal >= 4.0 && sc && sc.totalOCs >= 1;
                          const isAtencao = scoreVal > 0 && scoreVal < 2.5 && sc && sc.totalOCs >= 1;
                          return (
                            <div key={p.fornecedorId} className="flex items-center gap-1">
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${isMelhor ? "bg-emerald-50 border-emerald-300 text-emerald-700" : p.selecionado ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-100 border-gray-300 text-gray-700"}`}>
                                {isMelhor && <Trophy className="h-3 w-3" />}
                                {nome}
                                <FornecedorContatoPopover fornecedor={p.fornecedor} />
                                {sc && scoreVal > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-semibold" title={`Score: ${scoreVal}/5`}>
                                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                    {scoreVal}
                                  </span>
                                )}
                                {isRecomendado && (
                                  <span className="flex items-center gap-0.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">
                                    <ShieldCheck className="h-2.5 w-2.5" />Recomendado
                                  </span>
                                )}
                                {isAtencao && (
                                  <span className="flex items-center gap-0.5 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full border border-red-200">
                                    <ShieldAlert className="h-2.5 w-2.5" />Atenção
                                  </span>
                                )}
                                {parseFloat(p.totalOrcado ?? "0") > 0 && <span className="font-normal text-xs opacity-70">· {parseFloat(p.totalOrcado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                                <button type="button" onClick={() => removerForn.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId })} className="ml-1 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
                              </div>
                              <button
                                type="button"
                                style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", position: "relative", zIndex: 50 }}
                                onMouseDown={(e) => { e.stopPropagation(); }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const forn = p.fornecedor || fornecedores.find((ff: any) => ff.id === p.fornecedorId);
                                  if (forn) {
                                    setEditFornForm({
                                      cnpj: forn.cnpj ?? "", razaoSocial: forn.razaoSocial ?? "", nomeFantasia: forn.nomeFantasia ?? "",
                                      endereco: forn.endereco ?? "", numero: forn.numero ?? "", complemento: forn.complemento ?? "",
                                      bairro: forn.bairro ?? "", cidade: forn.cidade ?? "", estado: forn.estado ?? "", cep: forn.cep ?? "",
                                      telefone: forn.telefone ?? "", email: forn.email ?? "",
                                      contatoNome: forn.contatoNome ?? "", contatoCelular: forn.contatoCelular ?? "", contatoEmail: forn.contatoEmail ?? "",
                                      banco: forn.banco ?? "", agencia: forn.agencia ?? "", conta: forn.conta ?? "", pix: forn.pix ?? "",
                                      observacoes: forn.observacoes ?? "",
                                    });
                                    setEditFornDialog(forn);
                                  } else {
                                    window.alert("Fornecedor não encontrado para edição. ID: " + p.fornecedorId);
                                  }
                                }}
                                title="Editar cadastro do fornecedor"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {(detalheFullscreen as any).tipo === "servico" && (
                    <div className="bg-purple-50 rounded-xl border border-purple-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Fluxo de Mão de Obra</p>
                      </div>
                      <div className="space-y-1.5 text-sm text-purple-800">
                        <p><strong>Forma de Pagamento:</strong> Medição conforme avanço físico</p>
                        <p><strong>Destino:</strong> Módulo de Terceiros (Contrato de Serviço)</p>
                        <p className="text-xs text-purple-600 mt-2">Ao aprovar, será gerado automaticamente um contrato no módulo de Terceiros. O pagamento será controlado por medições vinculadas ao avanço do cronograma de Planejamento.</p>
                      </div>
                    </div>
                  )}
                  {detalheFullscreen.status === "pendente" && ((mapa as any)?.tipoEfetivo ?? (detalheFullscreen as any).tipo) !== "servico" && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-amber-600" />
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Faturamento Direto (FD)</p>
                        </div>
                      </div>
                      {(detalheFullscreen as any).modalidadeFd && (detalheFullscreen as any).modalidadeFd !== "normal" ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${(detalheFullscreen as any).fdPagador === "cliente" ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-orange-100 text-orange-700 border border-orange-300"}`}>
                              {(detalheFullscreen as any).fdPagador === "cliente" ? "FD Cliente" : "FD FC"}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {parseFloat((detalheFullscreen as any).fdValor ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {(detalheFullscreen as any).fdPagador === "cliente"
                              ? "O cliente pagará este valor diretamente ao fornecedor. Saldo de FD do orçamento será consumido."
                              : "A FC pagará este valor diretamente ao fornecedor (faturamento direto da empresa)."}
                          </p>
                          <Button size="sm" variant="outline" onClick={() => removerFd.mutate({ cotacaoId: detalheFullscreen.id, companyId })}
                            disabled={removerFd.isPending}
                            className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1">
                            <X className="h-3 w-3" /> Remover FD
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">Nenhum FD definido. Se esta compra será paga diretamente (pelo cliente ou pela FC), defina aqui antes de aprovar.</p>
                          <Button size="sm" variant="outline" onClick={() => { setFdCotForm({ modalidade: "fd_cliente", valor: "" }); setShowFdCotDialog(true); }}
                            className="border-amber-300 text-amber-700 hover:bg-amber-50 text-xs gap-1">
                            <DollarSign className="h-3 w-3" /> Definir FD
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Condições Comerciais do Vencedor */}
                  {(() => {
                    const vencedor = (mapa?.participantes ?? []).find((p: any) => p.selecionado);
                    if (!vencedor) {
                      return (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Condições Comerciais</p>
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-400">Nenhum fornecedor vencedor selecionado</p>
                            <p className="text-xs text-gray-300 mt-1">Selecione um vencedor no mapa para visualizar as condições negociadas</p>
                          </div>
                        </div>
                      );
                    }
                    const vFid = vencedor.fornecedorId;
                    const vNome = vencedor.fornecedor?.nomeFantasia || vencedor.fornecedor?.razaoSocial || "Fornecedor";
                    const vTotal = parseFloat(vencedor.totalOrcado ?? "0");
                    const vFormaPag = editFormaPag[vFid] ?? (vencedor as any).formaPagamento;
                    const vCondPag = editTipoPag[vFid] ?? vencedor.condicaoPagamento;
                    const vTipoPag = editTipoPag[vFid] ?? (vencedor as any).tipoPagamento;
                    const vPrazo = editPrazo[vFid] ?? vencedor.prazoEntregaDias;
                    const vFreteTipo = editFreteTipo[vFid] ?? (vencedor as any).freteTipo ?? "cif";
                    const vValorFrete = parseFloat(editValorFrete[vFid] ?? (vencedor as any).valorFrete ?? "0");
                    const vTransportadora = editTransportadora[vFid] ?? (vencedor as any).transportadora;

                    const FORMA_MAP: Record<string, { l: string; icon: string; cls: string }> = {
                      boleto: { l: "Boleto", icon: "📄", cls: "bg-blue-100 text-blue-700 border-blue-300" },
                      pix: { l: "PIX", icon: "⚡", cls: "bg-green-100 text-green-700 border-green-300" },
                      transferencia: { l: "Transferência", icon: "🏦", cls: "bg-indigo-100 text-indigo-700 border-indigo-300" },
                      cheque: { l: "Cheque", icon: "📝", cls: "bg-amber-100 text-amber-700 border-amber-300" },
                      cartao: { l: "Cartão", icon: "💳", cls: "bg-purple-100 text-purple-700 border-purple-300" },
                      deposito: { l: "Depósito", icon: "💰", cls: "bg-gray-200 text-gray-700 border-gray-400" },
                    };
                    const formaInfo = vFormaPag ? FORMA_MAP[vFormaPag] : null;

                    return (
                      <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-emerald-600" />
                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Condições do Vencedor</p>
                          </div>
                          <button onClick={() => setCondModalFornId(vencedor.fornecedorId)}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1">
                            <Settings className="h-3 w-3" /> Editar
                          </button>
                        </div>

                        <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-emerald-800">{vNome}</span>
                          <span className="text-sm font-bold text-emerald-700">{formatCurrency(vTotal)}</span>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-500">Forma de Pagamento</span>
                            {formaInfo ? (
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${formaInfo.cls}`}>{formaInfo.icon} {formaInfo.l}</span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">Não definida</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-500">Parcelamento</span>
                            {(() => {
                              const modo = condModo[vFid];
                              if (modo === "fechamento") {
                                const numP = parseInt(condFechParc[vFid] ?? "1") || 1;
                                const ciclo = condFechCiclo[vFid];
                                const cicloLabel = ciclo === "fixo" ? "Dia fixo" : ciclo === "7" ? "Semanal" : ciclo === "15" ? "Quinzenal" : ciclo === "30" ? "Mensal" : "";
                                return <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 border border-blue-300">Fechamento {cicloLabel} · {numP}x</span>;
                              }
                              if (modo === "custom") {
                                return <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">Personalizado</span>;
                              }
                              if (vCondPag || vTipoPag) {
                                return <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-100 text-violet-700 border border-violet-300">{vCondPag || getTipoPagamentoInfo(vTipoPag)?.label || vTipoPag}</span>;
                              }
                              return <span className="text-xs text-gray-300 italic">Não definido</span>;
                            })()}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-500">{(() => { const ct = (mapaQ.data as any)?.tipoEfetivo ?? (mapaQ.data?.cotacao as any)?.tipo; return ((ct === "servico" || ct === "pacote") && (vTipoPag === "medicao" || (vCondPag ?? "").toLowerCase().includes("medição"))) ? "Início da Mobilização" : "Prazo de Entrega"; })()}</span>
                            {vPrazo ? (
                              <span className="text-xs font-medium text-gray-700">{vPrazo} dias</span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">Não definido</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-500">Frete</span>
                            <span className="text-xs font-medium text-gray-700">
                              {vFreteTipo === "fob" ? `FOB — ${formatCurrency(vValorFrete)}` : "CIF (incluso)"}
                              {vTransportadora ? ` · ${vTransportadora}` : ""}
                            </span>
                          </div>

                          {vTipoPag && (() => {
                            const today = new Date().toISOString().split("T")[0];
                            const parcelas = calcularParcelas(vTipoPag, vTotal, today);
                            return parcelas.length > 0 ? (
                              <div className="bg-violet-50/70 border border-violet-200 rounded-lg p-3 mt-1">
                                <div className="text-[10px] font-semibold text-violet-600 mb-1.5">Parcelas ({parcelas.length}x)</div>
                                <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                                  {parcelas.map((parc, idx) => (
                                    <React.Fragment key={idx}>
                                      <span className="text-[11px] text-violet-500">{parc.descricao}</span>
                                      <span className="text-[11px] text-violet-700 font-semibold text-right">{formatCurrency(parc.valor)}</span>
                                      <span className="text-[11px] text-violet-400 text-right">{new Date(parc.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Melhor fornecedor banner */}
                  {melhorForn && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Trophy className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-emerald-800 font-semibold text-sm">Melhor proposta: {melhorForn.fornecedor?.nomeFantasia || melhorForn.fornecedor?.razaoSocial}</p>
                          <p className="text-emerald-600 text-xs">Total: {parseFloat(melhorForn.totalOrcado ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{melhorForn.prazoEntregaDias ? ` · Prazo: ${melhorForn.prazoEntregaDias} dias` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {melhorForn.selecionado && (
                          <Button variant="outline"
                            onClick={() => cancelarVencedor.mutate({ cotacaoId: showDetalhe! })}
                            disabled={cancelarVencedor.isPending}
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2 text-sm">
                            {cancelarVencedor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Cancelar Seleção
                          </Button>
                        )}
                        <Button onClick={() => selecionarVencedor.mutate({ cotacaoId: showDetalhe!, fornecedorId: melhorForn.fornecedorId })}
                          disabled={selecionarVencedor.isPending || melhorForn.selecionado}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-sm">
                          {melhorForn.selecionado ? <><CheckCircle className="h-4 w-4" /> Vencedor Selecionado</> : <><Trophy className="h-4 w-4" /> Selecionar como Vencedor</>}
                        </Button>
                      </div>
                    </div>
                  )}

                  {cobertura && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cobertura do Orçamento</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900">{Math.round(cobertura.pctMedio)}%</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Cobertura média</div>
                          <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden mx-4">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(cobertura.pctMedio, 100)}%` }} />
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-emerald-600">{cobertura.totais}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Compra total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-amber-600">{cobertura.parciais}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Compra parcial</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-400">{cobertura.semCobertura}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Sem cobertura</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Matriz de preços */}
                  {mapaQ.isLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : (mapa?.participantes ?? []).length === 0 ? null : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-end gap-2 px-1">
                        {((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            <Package className="h-3.5 w-3.5" />
                            Cotação por Pacote — itens agrupados por composição
                          </span>
                        ) : (
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={agruparItens} onChange={e => setAgruparItens(e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                            <span className="text-xs text-gray-500">Agrupar itens iguais</span>
                          </label>
                        )}
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
                        <table className="text-sm border-collapse" style={{ minWidth: "max-content" }}>
                          <thead className="sticky top-0 z-20">
                            {/* Linha 1: nomes dos grupos de colunas */}
                            <tr className="border-b border-gray-200 bg-gray-50">
                              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2 min-w-56 max-w-md border-r border-gray-200 bg-gray-50 sticky left-0 z-30">Item</th>
                              <th rowSpan={2} className="text-center text-xs font-semibold text-gray-500 uppercase px-2 py-2 w-12 border-r border-gray-200 bg-gray-50">Un.</th>
                              <th colSpan={3} className="text-center text-xs font-semibold text-blue-600 uppercase px-2 py-2 border-r border-blue-100 bg-blue-50/60">
                                {((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'servico'
                                  ? "Meta MDO (Orçamento)"
                                  : ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote'
                                  ? "Meta Total (Orçamento)"
                                  : ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'equipamento'
                                  ? "Meta EQUIP (Orçamento)"
                                  : "Meta MAT (Orçamento)"}
                              </th>
                              <th rowSpan={2} className="text-center text-xs font-semibold text-orange-600 uppercase px-2 py-2 border-r border-orange-100 bg-orange-50/60 w-24">Saldo<br/>Orç.</th>
                              {(mapa?.participantes ?? []).map((p: any) => {
                                const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
                                const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                                const sc = scoresQ.data?.[p.fornecedorId];
                                const scoreVal = sc?.score ?? 0;
                                const isRecomendado = scoreVal >= 4.0 && sc && sc.totalOCs >= 1;
                                const isAtencao = scoreVal > 0 && scoreVal < 2.5 && sc && sc.totalOCs >= 1;
                                return (
                                  <th key={p.fornecedorId} colSpan={3} className={`text-center text-xs font-semibold uppercase px-2 py-2 border-r border-gray-200 align-top ${isMelhor ? "text-emerald-700 bg-emerald-50/60" : "text-gray-500"}`}>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <div className="flex items-center gap-1">
                                        {isMelhor && <Trophy className="h-3 w-3 text-emerald-500" />}
                                        <FornecedorContatoPopover fornecedor={p.fornecedor}>
                                          <button type="button" className="hover:underline hover:text-blue-600 transition-colors cursor-pointer text-[11px]">{nome}</button>
                                        </FornecedorContatoPopover>
                                        {sc && scoreVal > 0 && (
                                          <span className="flex items-center gap-0.5 text-[9px] font-bold normal-case" title={`Score: ${scoreVal}/5 · OCs: ${sc.totalOCs} · Pontualidade: ${sc.taxaPontualidade}%`}>
                                            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                            {scoreVal}
                                          </span>
                                        )}
                                        {isRecomendado && (
                                          <span className="flex items-center gap-0.5 text-[8px] normal-case font-semibold bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-full border border-emerald-200">
                                            <ShieldCheck className="h-2 w-2" />Rec
                                          </span>
                                        )}
                                        {isAtencao && (
                                          <span className="flex items-center gap-0.5 text-[8px] normal-case font-semibold bg-red-100 text-red-700 px-1 py-0.5 rounded-full border border-red-200">
                                            <ShieldAlert className="h-2 w-2" />!
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-wrap justify-center">
                                        {p.selecionado ? (
                                          <span className="flex items-center gap-0.5 text-[9px] normal-case font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-300">
                                            <CheckCircle className="h-2.5 w-2.5" /> Vencedor
                                          </span>
                                        ) : detalheFullscreen?.status !== "aprovada" && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); selecionarVencedor.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId }); }}
                                            disabled={selecionarVencedor.isPending}
                                            className="flex items-center gap-0.5 text-[9px] normal-case font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                                            title="Selecionar este fornecedor como vencedor"
                                          >
                                            <Trophy className="h-2.5 w-2.5" /> Vencedor
                                          </button>
                                        )}
                                        {(p as any).arquivoUrl && (
                                          <a href={(p as any).arquivoUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700" title="Ver cotação anexada">
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-wrap justify-center">
                                      <div className="relative">
                                        {showAnexoInput === p.fornecedorId ? (
                                          <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3" onClick={e => e.stopPropagation()}>
                                            {/* Upload de arquivo */}
                                            <div>
                                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Arquivo (JPG ou PDF)</p>
                                              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-blue-200 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors">
                                                <Paperclip className="h-5 w-5 text-blue-400" />
                                                <span className="text-xs text-blue-600 font-medium">Clique para selecionar</span>
                                                <span className="text-[10px] text-gray-400">JPG, JPEG ou PDF</span>
                                                <input
                                                  type="file"
                                                  accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf"
                                                  className="hidden"
                                                  disabled={uploadAnexo.isPending}
                                                  onChange={async e => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    const reader = new FileReader();
                                                    reader.onload = ev => {
                                                      const base64 = (ev.target?.result as string).split(',')[1];
                                                      setIaFileBuffer({ fornecedorId: p.fornecedorId, base64, fileName: file.name, mimeType: file.type });
                                                      uploadAnexo.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, fileBase64: base64, fileName: file.name, mimeType: file.type });
                                                    };
                                                    reader.readAsDataURL(file);
                                                  }}
                                                />
                                              </label>
                                              {uploadAnexo.isPending && <p className="text-[10px] text-blue-500 text-center mt-1">Enviando...</p>}
                                            </div>
                                            {/* OU */}
                                            <div className="flex items-center gap-2">
                                              <div className="flex-1 h-px bg-gray-200" />
                                              <span className="text-[10px] text-gray-400 font-medium">OU</span>
                                              <div className="flex-1 h-px bg-gray-200" />
                                            </div>
                                            {/* Link/URL */}
                                            <div>
                                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Link / URL</p>
                                              <div className="flex gap-1">
                                                <input
                                                  type="url" placeholder="https://..."
                                                  value={anexoUrl[p.fornecedorId] ?? ""}
                                                  onChange={e => setAnexoUrl(prev => ({ ...prev, [p.fornecedorId]: e.target.value }))}
                                                  className="flex-1 h-8 text-xs border border-gray-300 rounded-lg px-2 bg-white text-gray-900"
                                                />
                                                <button onClick={() => {
                                                  const url = anexoUrl[p.fornecedorId] ?? "";
                                                  if (!url) return;
                                                  salvarAnexo.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, arquivoUrl: url, arquivoNome: url.split("/").pop() || "link" });
                                                }} className="px-2 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg" title="Salvar link">
                                                  <Save className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                            <button onClick={() => setShowAnexoInput(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center pt-1">Cancelar</button>
                                          </div>
                                        ) : null}
                                        <button
                                          onClick={() => setShowAnexoInput(showAnexoInput === p.fornecedorId ? null : p.fornecedorId)}
                                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${(p as any).arquivoUrl ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"}`}
                                          title="Anexar arquivo ou link da cotação">
                                          <Paperclip className="h-4 w-4" />
                                          {(p as any).arquivoNome ? (p as any).arquivoNome.slice(0, 14) + (((p as any).arquivoNome?.length ?? 0) > 14 ? "…" : "") : "Anexar"}
                                        </button>
                                        {((p as any).arquivoUrl || (iaFileBuffer && iaFileBuffer.fornecedorId === p.fornecedorId)) && (
                                          <select
                                            value={iaTipoProposta}
                                            onChange={e => setIaTipoProposta(e.target.value as "complemento" | "revisao")}
                                            className="h-7 text-[10px] border border-gray-200 rounded-lg px-1 bg-white text-gray-700"
                                            title="Tipo: Complemento acumula preços, Revisão substitui propostas anteriores"
                                          >
                                            <option value="complemento">Complemento</option>
                                            <option value="revisao">Revisão</option>
                                          </select>
                                        )}
                                        {((p as any).arquivoUrl || (iaFileBuffer && iaFileBuffer.fornecedorId === p.fornecedorId)) && (
                                          iaProgress && iaProgress.fornecedorId === p.fornecedorId ? (
                                            <div className="flex flex-col gap-1 min-w-[140px]">
                                              <div className="flex items-center gap-1.5">
                                                <Sparkles className="h-3.5 w-3.5 text-violet-500 animate-pulse" />
                                                <span className="text-[10px] font-medium text-violet-700 truncate">{iaProgress.etapa}</span>
                                              </div>
                                              <div className="w-full bg-violet-100 rounded-full h-2 overflow-hidden">
                                                <div
                                                  className="h-full rounded-full transition-all duration-500 ease-out"
                                                  style={{
                                                    width: `${iaProgress.percent}%`,
                                                    background: iaProgress.percent >= 100
                                                      ? "linear-gradient(90deg, #22c55e, #16a34a)"
                                                      : "linear-gradient(90deg, #8b5cf6, #a78bfa)",
                                                  }}
                                                />
                                              </div>
                                              <span className="text-[9px] text-violet-400 text-right">{iaProgress.percent}%</span>
                                            </div>
                                          ) : (
                                          <button
                                            onClick={() => {
                                              if (iaFileBuffer && iaFileBuffer.fornecedorId === p.fornecedorId) {
                                                extrairIA.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, fileBase64: iaFileBuffer.base64, fileName: iaFileBuffer.fileName, mimeType: iaFileBuffer.mimeType, tipoProposta: iaTipoProposta });
                                              } else if ((p as any).arquivoUrl) {
                                                const url = (p as any).arquivoUrl as string;
                                                fetch(url).then(r => r.blob()).then(blob => {
                                                  const reader = new FileReader();
                                                  reader.onload = ev => {
                                                    const base64 = (ev.target?.result as string).split(",")[1];
                                                    const nome = ((p as any).arquivoNome || url).toLowerCase();
                                                    const mime = blob.type || (nome.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
                                                    extrairIA.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, fileBase64: base64, fileName: (p as any).arquivoNome || "arquivo", mimeType: mime, tipoProposta: iaTipoProposta });
                                                  };
                                                  reader.readAsDataURL(blob);
                                                }).catch(() => toast.error("Não foi possível baixar o arquivo para leitura IA"));
                                              }
                                            }}
                                            disabled={extrairIA.isPending || !!iaJobId}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
                                            title="Ler documento com IA e preencher preços automaticamente">
                                            <Sparkles className="h-3.5 w-3.5" />
                                            Ler com IA
                                          </button>
                                          )
                                        )}
                                        <button
                                          onClick={() => setShowPropostas(showPropostas === p.fornecedorId ? null : p.fornecedorId)}
                                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${showPropostas === p.fornecedorId ? "bg-indigo-100 text-indigo-700 border border-indigo-300" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-600"}`}
                                          title="Ver propostas enviadas por este fornecedor"
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          Propostas
                                        </button>
                                      </div>
                                      {detalheFullscreen?.status !== "aprovada" && (
                                        <div className="flex items-center gap-1 mt-1">
                                          {editingFornId === p.fornecedorId ? (
                                            <>
                                              <Button size="sm" onClick={() => handleSalvarPrecos(p.fornecedorId)} disabled={salvarRespostas.isPending}
                                                className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white gap-1 px-2">
                                                <Save className="h-3 w-3" /> Salvar
                                              </Button>
                                              <Button size="sm" variant="outline" onClick={() => setEditingFornId(null)} className="h-6 text-[10px] border-gray-300 text-gray-600 px-2">
                                                Cancelar
                                              </Button>
                                            </>
                                          ) : (
                                            <Button size="sm" variant="outline" onClick={() => setEditingFornId(p.fornecedorId)}
                                              className="h-6 text-[10px] border-blue-200 text-blue-600 hover:bg-blue-50 gap-1 px-2">
                                              <Pencil className="h-3 w-3" /> Editar Preços
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                      </div>
                                      {showPropostas === p.fornecedorId && (
                                        <div className="mt-1 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2 space-y-1 text-left">
                                          <span className="text-[9px] font-semibold text-indigo-700 uppercase tracking-wide">Propostas</span>
                                          {propostasQ.isLoading && <p className="text-[10px] text-gray-400">Carregando...</p>}
                                          {propostasQ.data && propostasQ.data.length === 0 && (
                                            <p className="text-[10px] text-gray-400 italic">Nenhuma proposta</p>
                                          )}
                                          {(propostasQ.data ?? []).map((prop: any) => (
                                            <div key={prop.id} className={`flex items-center justify-between gap-1 px-1.5 py-1 rounded text-[10px] ${prop.status === "ativa" ? "bg-white border border-indigo-200" : prop.status === "substituida" ? "bg-gray-100 border border-gray-200 opacity-60" : "bg-red-50 border border-red-200 opacity-50"}`}>
                                              <div className="flex items-center gap-1 min-w-0">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${prop.status === "ativa" ? "bg-emerald-500" : prop.status === "substituida" ? "bg-gray-400" : "bg-red-400"}`} />
                                                <span className="truncate font-medium text-gray-700">{prop.fileName || "Proposta"}</span>
                                                <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${prop.tipo === "revisao" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                                  {prop.tipo === "revisao" ? "Rev" : "Comp"}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                {prop.status === "ativa" && (
                                                  <button
                                                    onClick={() => { if (confirm("Excluir proposta e remover preços vinculados?")) excluirProposta.mutate({ propostaId: prop.id, cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId }); }}
                                                    className="text-red-400 hover:text-red-600 p-0.5"
                                                    title="Excluir proposta"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </th>
                                );
                              })}
                              <th rowSpan={2} className="text-center text-xs font-semibold text-gray-500 uppercase px-3 py-3 min-w-24">Saldo</th>
                            </tr>
                            {/* Linha 2: sub-headers */}
                            <tr className="border-b border-gray-300 bg-gray-50">
                              <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-28">Preço Unit.</th>
                              <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-20">QTD</th>
                              <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-28 border-r border-blue-100">Total Meta</th>
                              {(mapa?.participantes ?? []).map((p: any) => {
                                const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                                const baseCls = isMelhor ? "text-emerald-600 bg-emerald-50/40" : "text-gray-500";
                                return (
                                  <th key={p.fornecedorId} colSpan={3} className="p-0">
                                    {/* Prazo/cond sub-row inside header */}
                                    <div className={`flex border-r border-gray-200 ${isMelhor ? "bg-emerald-50/40" : ""}`}>
                                      <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>QTD</div>
                                      <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>Preço Unit.</div>
                                      <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls}`}>Total</div>
                                    </div>
                                    {/* Prazo/cond/frete row */}
                                    <div className={`border-t border-gray-100 border-r border-gray-200 text-xs text-gray-400 bg-blue-50/20 ${isMelhor ? "bg-emerald-50/20" : ""}`}>
                                      <div className="px-1 py-1 text-center truncate" style={{ minWidth: 0 }}>
                                        {(() => {
                                          const fp = editFormaPag[p.fornecedorId] ?? (p as any).formaPagamento;
                                          const tp = editTipoPag[p.fornecedorId] ?? (p as any).tipoPagamento;
                                          const prazoLocal = editPrazo[p.fornecedorId];
                                          const tpInfo = tp ? getTipoPagamentoInfo(tp) : null;
                                          const modo = condModo[p.fornecedorId];
                                          const hasCond = fp || tp || p.prazoEntregaDias || prazoLocal || (modo && modo !== "padrao");
                                          const fpLabel = fp === "pix" ? "⚡PIX" : fp === "boleto" ? "📄Bol." : fp === "transferencia" ? "🏦Transf" : fp === "cheque" ? "📝Cheq" : fp === "cartao" ? "💳Cart" : fp === "deposito" ? "💰Dep" : "";
                                          return (
                                            <div className="space-y-0.5">
                                              {hasCond ? (
                                                <div className="flex items-center gap-1 flex-wrap justify-center">
                                                  {fp && <span className={`px-1 py-0.5 rounded-full text-[8px] font-bold ${fp === "pix" ? "bg-green-100 text-green-700" : fp === "boleto" ? "bg-blue-100 text-blue-700" : fp === "transferencia" ? "bg-indigo-100 text-indigo-700" : fp === "cheque" ? "bg-amber-100 text-amber-700" : fp === "cartao" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{fpLabel}</span>}
                                                  {tpInfo && <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-700">{tpInfo.label}</span>}
                                                  {(prazoLocal || p.prazoEntregaDias) && <span className="text-[9px] text-gray-400">{prazoLocal || p.prazoEntregaDias}d</span>}
                                                  {((editFreteTipo[p.fornecedorId] ?? (p as any).freteTipo) === "fob") && <span className="text-[8px] font-bold text-orange-600">FOB</span>}
                                                  {modo === "custom" && <span className="text-[8px] font-bold text-amber-600">Custom</span>}
                                                  {modo === "fechamento" && <span className="text-[8px] font-bold text-blue-600">Fech.</span>}
                                                </div>
                                              ) : (
                                                <span className="text-[9px] text-gray-300 italic">Sem condição</span>
                                              )}
                                              {editingFornId === p.fornecedorId && (
                                                <button type="button" onClick={() => setCondModalFornId(p.fornecedorId)}
                                                  className="mt-0.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-all w-full flex items-center justify-center gap-1">
                                                  <Save className="h-3 w-3" /> Condições de Pagamento
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const rawItens = mapa?.itens ?? [];
                              const isPacote = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
                              const itensParaRenderizar: any[] = isPacote ? (() => {
                                const compGroups: Record<string, any[]> = {};
                                const noComp: any[] = [];
                                for (const it of rawItens) {
                                  const cc = (it as any).composicaoCodigo ?? "";
                                  if (cc) {
                                    if (!compGroups[cc]) compGroups[cc] = [];
                                    compGroups[cc].push(it);
                                  } else {
                                    noComp.push(it);
                                  }
                                }
                                const grouped = Object.entries(compGroups).map(([cc, items]) => {
                                  const first = items[0];
                                  const compDesc = (first as any).composicaoDescricao || first.descricao;
                                  const compUn = (first as any).composicaoUnidade || first.unidade;
                                  const compQtd = (first as any).composicaoQtdOrcada || 0;
                                  const compMeta = (first as any).composicaoMetaTotal || 0;
                                  const compEap = (first as any).composicaoEapCodigo || "";
                                  const compEstaSC = compQtd;
                                  return {
                                    ...first,
                                    id: first.id,
                                    descricao: compDesc,
                                    unidade: compUn,
                                    quantidade: String(compQtd),
                                    metaUnitario: compMeta,
                                    metaQtd: compQtd,
                                    qtdOrcada: compQtd,
                                    qtdTotalSolicitada: compEstaSC,
                                    qtdComprada: 0,
                                    qtdEstaSC: compEstaSC,
                                    qtdSaldo: 0,
                                    fonteVinculo: "item",
                                    eapPath: first.eapPath,
                                    _grouped: true,
                                    _isPacoteGroup: true,
                                    _childIds: items.map((i: any) => i.id),
                                    _childItems: items,
                                    _groupCount: items.length,
                                    _composicaoCodigo: cc,
                                  };
                                });
                                return [...grouped, ...noComp];
                              })() : agruparItens ? (() => {
                                const groups: Record<string, any[]> = {};
                                for (const it of rawItens) {
                                  const key = (it.descricao ?? "") + "|" + (it.unidade ?? "un");
                                  if (!groups[key]) groups[key] = [];
                                  groups[key].push(it);
                                }
                                return Object.values(groups).map(items => {
                                  if (items.length === 1) return items[0];
                                  const first = items[0];
                                  const totalQtd = items.reduce((s: number, i: any) => s + parseFloat(i.quantidade ?? "0"), 0);
                                  const metaU = parseFloat(first.metaUnitario ?? "0");
                                  const totalOrcada = items.reduce((s: number, i: any) => s + ((i as any).qtdOrcada ?? 0), 0);
                                  const totalComprada = items.reduce((s: number, i: any) => s + ((i as any).qtdComprada ?? 0), 0);
                                  const totalSolic = items.reduce((s: number, i: any) => s + ((i as any).qtdTotalSolicitada ?? 0), 0);
                                  return {
                                    ...first,
                                    id: first.id,
                                    quantidade: String(totalQtd),
                                    qtdOrcada: totalOrcada,
                                    qtdComprada: totalComprada,
                                    qtdTotalSolicitada: totalSolic,
                                    qtdSaldo: totalOrcada - totalComprada,
                                    _grouped: true,
                                    _childIds: items.map((i: any) => i.id),
                                    _childItems: items,
                                    _groupCount: items.length,
                                  };
                                });
                              })() : rawItens;
                              return itensParaRenderizar;
                            })().map((it: any) => {
                              const melhorPreco = getMelhorPrecoItem(it.id);
                              const metaUnitRaw = parseFloat(it.metaUnitario ?? "0");
                              const metaUnit = Math.round(metaUnitRaw * 100) / 100;
                              const metaQtdVal = parseFloat(it.metaQtd ?? it.quantidade ?? "0");
                              const metaTot = Math.round(metaUnit * metaQtdVal * 100) / 100;
                              const { saldo, hasMeta } = getItemSaldo(it);
                              const hasComposicao = !it._grouped && ((it as any).composicaoInsumos ?? []).length > 0;
                              const hasPacoteExpand = it._isPacoteGroup && (it._childItems ?? []).length > 0;
                              const isExpanded = expandedComposicao[it.id] ?? false;
                              const numFornCols = (mapa?.participantes ?? []).length * 3;
                              return (
                                <React.Fragment key={it.id}>
                                <tr className={`border-b border-gray-100 hover:bg-gray-50/60 ${it._isPacoteGroup ? "bg-indigo-50/30" : ""}`}>
                                  <td className={`px-4 py-2 border-r border-gray-100 sticky left-0 z-10 max-w-md ${it._isPacoteGroup ? "bg-indigo-50/30" : "bg-white"}`}>
                                    <div className="flex items-start gap-1.5">
                                      {(hasComposicao || hasPacoteExpand) && (
                                        <button
                                          onClick={() => setExpandedComposicao(prev => ({ ...prev, [it.id]: !prev[it.id] }))}
                                          className="mt-0.5 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
                                          title={hasPacoteExpand ? "Ver insumos do pacote" : "Ver composição"}
                                        >
                                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        </button>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="text-gray-900 text-xs font-medium">{it._isPacoteGroup && (it as any).composicaoEapCodigo ? `[${(it as any).composicaoEapCodigo}] ${it.descricao}` : it.descricao}</span>
                                        {it._isPacoteGroup && (
                                          <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                            PACOTE · {it._groupCount} insumos
                                          </span>
                                        )}
                                        {it._grouped && !it._isPacoteGroup && (
                                          <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                            {it._groupCount} composições
                                          </span>
                                        )}
                                        {!it._grouped && it.eapPath && (
                                          <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{it.eapPath}</div>
                                        )}
                                        {!it._grouped && (
                                          <RastreabilidadeTag
                                            scNumero={(it as any).scNumero}
                                            eapCodigo={(it as any).eapCodigo}
                                            origemEap={(it as any).origemEap}
                                          />
                                        )}
                                        {(it as any).semVerba && (
                                          <div className="mt-1 flex items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                              SEM VERBA
                                            </span>
                                            {(it as any).motivoSemVerba && (
                                              <span className="text-[9px] text-red-500 italic">
                                                {(it as any).motivoSemVerba === "quebra_dano" ? "Quebra/Dano" : (it as any).motivoSemVerba === "furto" ? "Furto" : (it as any).motivoSemVerba === "erro_orcamento" ? "Erro Orçamento" : (it as any).motivoSemVerba === "qtd_insuficiente" ? "Qtd Insuficiente" : (it as any).motivoSemVerba === "retrabalho" ? "Retrabalho" : "Outro"}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {(it as any).qtdOrcada > 0 && (() => {
                                          const orcada = (it as any).qtdOrcada;
                                          const estaSC = parseFloat(it.quantidade ?? "0");
                                          const totalSolic = (it as any).qtdTotalSolicitada;
                                          const outrasSC = Math.max(0, totalSolic - estaSC);
                                          const saldoRestanteRaw = orcada - totalSolic;
                                          const saldoRestante = Math.abs(saldoRestanteRaw) < 0.01 ? 0 : saldoRestanteRaw;
                                          const rawPctEsta = (estaSC / orcada) * 100;
                                          const rawPctOutras = (outrasSC / orcada) * 100;
                                          const rawTotal = rawPctEsta + rawPctOutras;
                                          const scale = rawTotal > 100 ? 100 / rawTotal : 1;
                                          const pctEsta = rawPctEsta * scale;
                                          const pctOutras = rawPctOutras * scale;
                                          const isTotal = totalSolic >= orcada - 0.01;
                                          const isEstouro = totalSolic > orcada + 0.01;
                                          return (
                                            <div className="mt-1.5 space-y-0.5">
                                              <div className="flex items-center gap-1.5">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                                  {pctOutras > 0 && <div className="h-full bg-blue-300" style={{ width: `${pctOutras}%` }} title={`Outras SCs: ${outrasSC}`} />}
                                                  <div className={`h-full ${isEstouro ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${pctEsta}%` }} title={`Esta SC: ${estaSC}`} />
                                                </div>
                                                <span className={`text-[10px] font-bold shrink-0 ${isEstouro ? "text-red-600" : isTotal ? "text-emerald-600" : "text-amber-600"}`}>
                                                  {Math.round(((totalSolic) / orcada) * 100)}%
                                                </span>
                                              </div>
                                              <div className="flex gap-2 text-[9px] text-gray-400">
                                                {isEstouro ? (
                                                  <span className="text-red-600 font-medium">Saldo: {saldoRestante.toFixed(1)} (estouro de {Math.abs(saldoRestante).toFixed(1)})</span>
                                                ) : isTotal ? (
                                                  <span className="text-emerald-600 font-medium">Compra total do orçamento</span>
                                                ) : (
                                                  <>
                                                    <span>Orç: {orcada}</span>
                                                    <span className="text-amber-600">Esta SC: {estaSC}</span>
                                                    {outrasSC > 0 && <span className="text-blue-500">Outras: {outrasSC}</span>}
                                                    <span className="text-gray-500">Falta: {Math.max(0, saldoRestante)}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <HistoricoPrecoPopover companyId={companyId} descricao={it.descricao} />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500 text-xs text-center border-r border-gray-100">{it.unidade || "un"}</td>
                                  {/* Meta cols */}
                                  <td className="px-3 py-2 text-blue-700 text-xs text-right bg-blue-50/30 font-medium">
                                    <div className="flex items-center justify-end gap-1">
                                      {(it as any).incluirAjudante === false && (it as any).metaMdoProfissional > 0 && (
                                        <span className="px-1 py-0 text-[8px] font-bold rounded bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap" title="Cotação sem ajudante — meta apenas do profissional">Só prof.</span>
                                      )}
                                      {metaUnit > 0 ? metaUnit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-blue-600 text-xs text-right bg-blue-50/30">
                                    {metaQtdVal > 0 ? metaQtdVal.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-blue-700 text-xs text-right bg-blue-50/30 font-semibold border-r border-blue-100">
                                    {metaTot > 0 ? metaTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                  </td>
                                  {/* Saldo Orçamentário — coluna única condensada */}
                                  {(() => {
                                    const orcada = (it as any).qtdOrcada ?? 0;
                                    const comprada = (it as any).qtdComprada ?? 0;
                                    const saldoQtd = (it as any).qtdSaldo ?? 0;
                                    const fonte = (it as any).fonteVinculo;
                                    const semVinculo = fonte !== "item" && fonte !== "insumo";
                                    const isEstouro = saldoQtd < 0;
                                    const isNegativo = isEstouro || semVinculo;
                                    const tooltipText = fonte === "item"
                                      ? `Orçado: ${orcada.toLocaleString("pt-BR")}\nSolicitado total: ${((it as any).qtdTotalSolicitada ?? 0).toLocaleString("pt-BR")}\nComprado: ${comprada.toLocaleString("pt-BR")}\nSaldo: ${saldoQtd.toLocaleString("pt-BR")}`
                                      : fonte === "insumo"
                                        ? `Vinculado via insumo (${(it as any).insumoCodigo ?? ""})\nOrçado: ${orcada.toLocaleString("pt-BR")}\nSolicitado: ${((it as any).qtdTotalSolicitada ?? 0).toLocaleString("pt-BR")}\nComprado: ${comprada.toLocaleString("pt-BR")}\nSaldo: ${saldoQtd.toLocaleString("pt-BR")}`
                                        : `SEM VÍNCULO ORÇAMENTÁRIO\nNecessita realocação de verba`;
                                    return (
                                      <td
                                        title={tooltipText}
                                        className={`px-2 py-2 text-center text-xs font-bold border-r border-orange-100 ${isNegativo ? "bg-red-50 text-red-700" : "bg-emerald-50/50 text-emerald-700"}`}
                                      >
                                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${isNegativo ? "bg-red-100 text-red-700 border border-red-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                                          {isNegativo && <AlertTriangle className="h-2.5 w-2.5" />}
                                          {saldoQtd.toLocaleString("pt-BR")}
                                        </span>
                                        {semVinculo && (
                                          <div className="text-[8px] text-red-500 font-bold mt-0.5 uppercase">S/ VERBA</div>
                                        )}
                                      </td>
                                    );
                                  })()}
                                  {/* Colunas por fornecedor */}
                                  {(mapa?.participantes ?? []).map((p: any) => {
                                    const key = `${it.id}_${p.fornecedorId}`;
                                    const isEditing = editingFornId === p.fornecedorId;
                                    const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;

                                    let savedPreco: number, savedQty: number, displayPreco: number, displayQty: number, displayTotal: number;
                                    if (it._isPacoteGroup) {
                                      const childItems = it._childItems as any[];
                                      savedPreco = parseFloat(mapa?.respostaMap?.[`${childItems[0].id}_${p.fornecedorId}`]?.precoUnitario ?? "0");
                                      const compQtd = (childItems[0] as any).composicaoQtdOrcada || parseFloat(it.quantidade ?? "0");
                                      savedQty = compQtd;
                                      displayPreco = isEditing ? parseFloat(editPrecos[key] ?? String(savedPreco)) : savedPreco;
                                      displayQty = compQtd;
                                      displayTotal = displayPreco * displayQty;
                                    } else if (it._grouped) {
                                      const childItems = it._childItems as any[];
                                      savedPreco = parseFloat(mapa?.respostaMap?.[`${childItems[0].id}_${p.fornecedorId}`]?.precoUnitario ?? "0");
                                      savedQty = childItems.reduce((s: number, ci: any) => s + parseFloat(mapa?.respostaMap?.[`${ci.id}_${p.fornecedorId}`]?.quantidade ?? ci.quantidade ?? "0"), 0);
                                      displayPreco = isEditing ? parseFloat(editPrecos[key] ?? String(savedPreco)) : savedPreco;
                                      displayQty = savedQty || parseFloat(it.quantidade ?? "0");
                                      displayTotal = displayPreco * displayQty;
                                    } else {
                                      savedPreco = parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
                                      savedQty = parseFloat(mapa?.respostaMap?.[key]?.quantidade ?? it.quantidade ?? "1");
                                      displayPreco = isEditing ? parseFloat(editPrecos[key] ?? "0") : savedPreco;
                                      displayQty = isEditing ? (parseFloat(editQtds[key] ?? "0") || savedQty) : savedQty;
                                      displayTotal = displayPreco * displayQty;
                                    }

                                    const isBest = melhorPreco !== null && displayPreco > 0 && displayPreco === melhorPreco;
                                    const rowCls = isMelhor ? "bg-emerald-50/30" : "";

                                    const handleGroupedPrecoChange = (val: string) => {
                                      if (it._grouped) {
                                        const updates: Record<string, string> = { [key]: val };
                                        for (const ci of it._childItems) {
                                          updates[`${ci.id}_${p.fornecedorId}`] = val;
                                        }
                                        setEditPrecos(prev => ({ ...prev, ...updates }));
                                      } else {
                                        setEditPrecos(prev => ({ ...prev, [key]: val }));
                                      }
                                    };

                                    return (
                                      <>
                                        <td key={`qty_${p.fornecedorId}`} className={`px-1 py-1 text-right border-r border-gray-100 ${rowCls}`}>
                                          {isEditing && !it._grouped ? (
                                            <Input type="number" step="0.001" min="0"
                                              value={editQtds[key] ?? String(savedQty)}
                                              onChange={e => setEditQtds(prev => ({ ...prev, [key]: e.target.value }))}
                                              className="h-8 text-sm text-right border-gray-300 bg-white text-gray-900 w-28 ml-auto" />
                                          ) : (
                                            <span className="text-xs text-gray-600">{displayQty > 0 ? displayQty.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}</span>
                                          )}
                                        </td>
                                        <td key={`preco_${p.fornecedorId}`} className={`px-1 py-1 text-right border-r border-gray-100 ${rowCls} ${isBest ? "bg-emerald-50" : ""}`}>
                                          {isEditing ? (
                                            <Input type="number" step="0.01" min="0"
                                              value={editPrecos[key] ?? ""}
                                              onChange={e => handleGroupedPrecoChange(e.target.value)}
                                              className={`h-8 text-sm text-right border-gray-300 bg-white text-gray-900 w-32 ml-auto ${isBest ? "border-emerald-400" : ""}`}
                                              placeholder="0,00" />
                                          ) : (
                                            <span className={`text-xs font-medium ${isBest ? "text-emerald-700 font-bold" : "text-gray-700"}`}>
                                              {displayPreco > 0 ? displayPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                            </span>
                                          )}
                                        </td>
                                        <td key={`tot_${p.fornecedorId}`} className={`px-2 py-1 text-right border-r border-gray-200 ${rowCls} ${isBest ? "bg-emerald-50" : ""}`}>
                                          <span className={`text-xs font-semibold ${isMelhor ? "text-emerald-700" : "text-gray-700"}`}>
                                            {displayTotal > 0 ? displayTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                          </span>
                                        </td>
                                      </>
                                    );
                                  })}
                                  {/* Saldo */}
                                  <td className="px-3 py-2 text-center">
                                    {hasMeta && melhorForn && metaTot > 0 ? (
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${saldo >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                        {saldo >= 0 ? "+" : ""}{saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    ) : <span className="text-gray-300 text-xs">—</span>}
                                  </td>
                                </tr>
                                {isExpanded && hasComposicao && (() => {
                                  const allInsumos = (it as any).composicaoInsumos as Array<{ insumoCodigo: string; descricao: string; unidade: string; coeficiente: number; precoUnitario: number; alocacaoMat: number; alocacaoMdo: number; alocacaoEquip?: number; custoTotal: number }>;
                                  const cotTipoComp = (mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo ?? "material";
                                  const inclEquipComp = (mapa as any)?.incluirEquipamentos ?? false;
                                  let insumos = allInsumos.filter(ins => {
                                    const matA = ins.alocacaoMat ?? 0;
                                    const mdoA = ins.alocacaoMdo ?? 0;
                                    const eqA = (ins as any).alocacaoEquip ?? 0;
                                    const isEquipIns = eqA > 0 || (matA === 0 && mdoA === 0);
                                    if (cotTipoComp === "material") return matA > 0;
                                    if (cotTipoComp === "servico") return mdoA > 0;
                                    if (cotTipoComp === "equipamento") return isEquipIns;
                                    if (cotTipoComp === "pacote") return inclEquipComp ? true : !isEquipIns;
                                    return true;
                                  });
                                  if ((it as any).incluirAjudante === false) {
                                    const ajudRe = /ajudante|servente|auxiliar/i;
                                    insumos = insumos.filter(ins => !ajudRe.test(ins.descricao || ""));
                                  }
                                  if (insumos.length === 0) return null;
                                  let totalMat = 0, totalMdo = 0, totalEquip = 0, totalGeral = 0;
                                  for (const ins of insumos) {
                                    const custo = ins.coeficiente * ins.precoUnitario;
                                    totalGeral += custo;
                                    const matAlloc = ins.alocacaoMat ?? 0;
                                    const mdoAlloc = ins.alocacaoMdo ?? 0;
                                    const equipAlloc = (ins as any).alocacaoEquip ?? 0;
                                    const isEquip = equipAlloc > 0 || (matAlloc === 0 && mdoAlloc === 0);
                                    if (isEquip) {
                                      totalEquip += custo;
                                    } else if (matAlloc > 0 && mdoAlloc > 0) {
                                      const totalAlloc = matAlloc + mdoAlloc;
                                      totalMat += custo * (matAlloc / totalAlloc);
                                      totalMdo += custo * (mdoAlloc / totalAlloc);
                                    } else if (matAlloc > 0) {
                                      totalMat += custo;
                                    } else if (mdoAlloc > 0) {
                                      totalMdo += custo;
                                    }
                                  }
                                  return (
                                    <tr className="bg-slate-50/80">
                                      <td colSpan={6 + numFornCols + 1} className="px-0 py-0 sticky left-0 z-10">
                                        <div className="ml-8 mr-4 my-2 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                              Composição: {(it as any).composicaoCodigo || it.descricao}
                                            </span>
                                            <div className="flex items-center gap-3 text-[10px]">
                                              {totalMat > 0 && <span className="text-blue-600 font-semibold">MAT: {totalMat.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                                              {totalMdo > 0 && <span className="text-purple-600 font-semibold">MDO: {totalMdo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                                              {totalEquip > 0 && <span className="text-green-600 font-semibold">EQUIP: {totalEquip.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                                              <span className="text-slate-700 font-bold">Total: {totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                                            </div>
                                          </div>
                                          <table className="w-full text-[11px]">
                                            <thead>
                                              <tr className="border-b border-slate-100 bg-slate-50/50">
                                                <th className="text-left px-3 py-1 text-slate-500 font-semibold w-16">Código</th>
                                                <th className="text-left px-3 py-1 text-slate-500 font-semibold">Descrição</th>
                                                <th className="text-center px-2 py-1 text-slate-500 font-semibold w-12">Un.</th>
                                                <th className="text-right px-2 py-1 text-slate-500 font-semibold w-16">Coef.</th>
                                                <th className="text-right px-2 py-1 text-slate-500 font-semibold w-20">Preço Un.</th>
                                                <th className="text-right px-2 py-1 text-slate-500 font-semibold w-20">Custo</th>
                                                <th className="text-center px-2 py-1 text-slate-500 font-semibold w-14">Tipo</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {insumos.map((ins, idx) => {
                                                const isMat = ins.alocacaoMat > 0;
                                                const isMdo = ins.alocacaoMdo > 0;
                                                const isEquipIns = ((ins as any).alocacaoEquip ?? 0) > 0 || (!isMat && !isMdo);
                                                const custo = ins.coeficiente * ins.precoUnitario;
                                                return (
                                                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/80">
                                                    <td className="px-3 py-1 text-slate-500 font-mono">{ins.insumoCodigo || "—"}</td>
                                                    <td className="px-3 py-1 text-slate-700">{ins.descricao}</td>
                                                    <td className="px-2 py-1 text-center text-slate-500">{ins.unidade}</td>
                                                    <td className="px-2 py-1 text-right text-slate-600 font-medium">{ins.coeficiente.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                                    <td className="px-2 py-1 text-right text-slate-600">{ins.precoUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                                                    <td className="px-2 py-1 text-right text-slate-700 font-semibold">{custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                                                    <td className="px-2 py-1 text-center">
                                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isMat ? "bg-blue-100 text-blue-700" : isMdo ? "bg-purple-100 text-purple-700" : isEquipIns ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                        {isMat ? "MAT" : isMdo ? "MDO" : isEquipIns ? "EQUIP" : "—"}
                                                      </span>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })()}
                                {isExpanded && hasPacoteExpand && (() => {
                                  const childItems = it._childItems as any[];
                                  return (
                                    <tr className="bg-indigo-50/20">
                                      <td colSpan={6 + numFornCols + 1} className="px-0 py-0 sticky left-0 z-10">
                                        <div className="ml-8 mr-4 my-2 border border-indigo-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                          <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-200">
                                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                              Insumos do Pacote (referência)
                                            </span>
                                          </div>
                                          <table className="w-full text-[11px]">
                                            <thead>
                                              <tr className="border-b border-indigo-100 bg-indigo-50/30">
                                                <th className="text-left px-3 py-1 text-indigo-500 font-semibold">Descrição</th>
                                                <th className="text-center px-2 py-1 text-indigo-500 font-semibold w-12">Un.</th>
                                                <th className="text-right px-2 py-1 text-indigo-500 font-semibold w-20">Qtd SC</th>
                                                <th className="text-right px-2 py-1 text-indigo-500 font-semibold w-24">Meta Unit.</th>
                                                <th className="text-right px-2 py-1 text-indigo-500 font-semibold w-24">Meta Total</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {childItems.map((ci: any, idx: number) => {
                                                const ciQtd = parseFloat(ci.quantidade ?? "0");
                                                const ciMeta = parseFloat(ci.metaUnitario ?? "0");
                                                return (
                                                  <tr key={idx} className="border-b border-indigo-50 hover:bg-indigo-50/30">
                                                    <td className="px-3 py-1 text-gray-700">{ci.descricao}</td>
                                                    <td className="px-2 py-1 text-center text-gray-500">{ci.unidade}</td>
                                                    <td className="px-2 py-1 text-right text-gray-600">{ciQtd.toLocaleString("pt-BR")}</td>
                                                    <td className="px-2 py-1 text-right text-gray-600">{ciMeta > 0 ? ciMeta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                                                    <td className="px-2 py-1 text-right text-gray-700 font-medium">{ciMeta > 0 && ciQtd > 0 ? (ciMeta * ciQtd).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })()}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {/* Totais */}
                            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                              <td colSpan={2} className="px-4 py-3 text-xs text-gray-700 uppercase border-r border-gray-200">Total</td>
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40">—</td>
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40 font-bold">
                                {qtdGrandTotal !== null
                                  ? <span title={`Total de ${qtdUnidade}`}>{qtdGrandTotal.toLocaleString("pt-BR")} <span className="font-normal text-blue-400">{qtdUnidade}</span></span>
                                  : "—"}
                              </td>
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40 border-r border-blue-100 font-bold">
                                {metaGrandTotal > 0 ? metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                              </td>
                              <td className="px-2 py-3 text-center text-xs text-orange-600 bg-orange-50/40 border-r border-orange-100 font-bold">
                                {(() => {
                                  if (isPacoteTotals) return "—";
                                  const allItensArr = mapa?.itens ?? [];
                                  const totalSaldo = allItensArr.reduce((s: number, i: any) => s + ((i as any).qtdSaldo ?? 0), 0);
                                  const temSemVinculo = allItensArr.some((i: any) => !(i as any).fonteVinculo);
                                  const totalOrc = allItensArr.reduce((s: number, i: any) => s + ((i as any).qtdOrcada ?? 0), 0);
                                  if (totalOrc === 0 && !temSemVinculo) return "—";
                                  return (
                                    <span className={`font-bold ${totalSaldo < 0 ? "text-red-700" : "text-emerald-700"}`}>
                                      {totalSaldo.toLocaleString("pt-BR")}
                                    </span>
                                  );
                                })()}
                              </td>
                              {(mapa?.participantes ?? []).map((p: any) => {
                                const totalForn = getFornTotal(p);
                                const freteVal = getFornFrete(p);
                                const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                                const fTipo = editingFornId === p.fornecedorId ? (editFreteTipo[p.fornecedorId] ?? "cif") : ((p as any).freteTipo ?? "cif");
                                return (
                                  <>
                                    <td key={`tfqty_${p.fornecedorId}`} className="px-2 py-3 border-r border-gray-100"></td>
                                    <td key={`tfpreco_${p.fornecedorId}`} className={`px-2 py-3 border-r border-gray-100 text-right ${isMelhor ? "bg-emerald-50" : ""}`}>
                                      {freteVal > 0 && (
                                        <div className="text-[10px]">
                                          <span className={`font-semibold ${fTipo === "fob" ? "text-orange-600" : "text-blue-500"}`}>{fTipo.toUpperCase()}</span>
                                          <span className="text-gray-500 ml-0.5">{freteVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td key={`tftot_${p.fornecedorId}`} className={`px-3 py-3 text-right text-sm border-r border-gray-200 ${isMelhor ? "text-emerald-700 bg-emerald-50" : "text-gray-900"}`}>
                                      {totalForn > 0 ? totalForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                                    </td>
                                  </>
                                );
                              })}
                              {/* Saldo total */}
                              <td className="px-3 py-3 text-center">
                                {metaGrandTotal > 0 && melhorForn ? (
                                  <span className={`text-sm font-bold px-2 py-1 rounded-full ${saldoTotal >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {saldoTotal >= 0 ? "+" : ""}{saldoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                            {/* Botões de edição */}
                            <tr className="bg-white border-t border-gray-100">
                              <td colSpan={6} className="px-4 py-2"></td>
                              {(mapa?.participantes ?? []).map((p: any) => (
                                <>
                                  <td key={`bqty_${p.fornecedorId}`}></td>
                                  <td key={`bpreco_${p.fornecedorId}`}></td>
                                  <td key={`btot_${p.fornecedorId}`} className="px-2 py-2 text-center border-r border-gray-100">
                                  </td>
                                </>
                              ))}
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Alerta de saldo negativo + Realocação */}
                      {metaGrandTotal > 0 && fornParaSaldo && deficit > 0 && !cobertoPorRisco && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                              <div>
                                <p className="text-red-800 font-semibold text-sm">Acima da meta orçamentária</p>
                                <p className="text-red-600 text-xs">Déficit de {deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em relação ao orçamento. Utilize a reserva de Risco (BDI DI-08), sobras de atividades compradas ou solicite autorização do master.</p>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setShowRealocacao(v => !v)} className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100 flex-shrink-0">
                              <TrendingDown className="h-3 w-3 mr-1" /> {showRealocacao ? "Fechar" : "Ver Opções"}
                            </Button>
                          </div>
                          <SaldosRealocacaoPanel
                            companyId={companyId}
                            obraId={(mapa?.cotacao as any)?.obraId}
                            cotacaoId={showDetalhe ?? undefined}
                            deficit={deficit}
                            showContent={showRealocacao}
                            onCoberto={() => setCobertoPorRisco(true)}
                            onAcao={() => { mapaQ.refetch(); detalheQ.refetch(); }}
                            userId={(user as any)?.id}
                            userName={(user as any)?.name}
                          />
                        </div>
                      )}

                      {/* Agrupamento final por material */}
                      {/* Verde: déficit coberto por risco — mostra detalhes de onde veio */}
                      {metaGrandTotal > 0 && fornParaSaldo && deficit > 0 && cobertoPorRisco && (
                        <CoberturaRealocacaoInfo companyId={companyId} obraId={(mapa?.cotacao as any)?.obraId} cotacaoId={showDetalhe ?? undefined} deficit={deficit} />
                      )}

                      {gruposAgrupados.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Package className="h-4 w-4 text-gray-500" />
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Resumo Consolidado de Materiais</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {gruposAgrupados.map(g => (
                              <div key={`${g.descricao}_${g.unidade}`} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">
                                <span className="font-bold text-gray-900">{g.qtdTotal.toLocaleString("pt-BR")}</span>
                                {" "}<span className="text-gray-500">{g.unidade}</span>
                                {" "}<span>{g.descricao}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
        {iaOverlayPortal}
        {condModalPortal}

        <Dialog open={showSemVerbaDialog} onOpenChange={(o) => { if (!o) setShowSemVerbaDialog(false); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "white" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-5 w-5" />
                Itens sem Verba Orçamentária
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const totalSemVerba = itensSemVerba.reduce((s: number, it: any) => {
                const key = `${it.id}_${fornParaSaldo?.fornecedorId}`;
                const p = parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
                return s + p * parseFloat(it.quantidade ?? "0");
              }, 0);
              const obraIdDialog = (mapa?.cotacao as any)?.obraId;
              return (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-700 font-semibold mb-2">
                      {itensSemVerba.length} item(ns) não possuem vínculo direto com o orçamento:
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {itensSemVerba.map((it: any, idx: number) => {
                        const key = `${it.id}_${fornParaSaldo?.fornecedorId}`;
                        const precoUnit = parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
                        const qtd = parseFloat(it.quantidade ?? "0");
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white border border-red-100 rounded px-2 py-1.5">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-800 truncate block">{it.descricao}</span>
                              <span className="text-gray-500">{qtd.toLocaleString("pt-BR")} {it.unidade}</span>
                            </div>
                            <span className="text-red-700 font-bold ml-2 whitespace-nowrap">
                              {(precoUnit * qtd).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 pt-2 border-t border-red-200 flex justify-between text-xs font-bold text-red-800">
                      <span>Total sem verba:</span>
                      <span>{totalSemVerba.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    </div>
                  </div>

                  {semVerbaAutorizado ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                      <p className="text-sm font-semibold text-emerald-800">Autorizado por {semVerbaAutorizado.adminNome}</p>
                      <p className="text-xs text-emerald-600 mt-1">Feche este dialog e clique em "Aprovar e Gerar OC" para continuar</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1 border-b border-gray-200">
                        <button
                          onClick={() => setSemVerbaAba("realocacao")}
                          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${semVerbaAba === "realocacao" ? "border-orange-500 text-orange-700 bg-orange-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5 inline mr-1.5" />
                          Realocação de Verba
                        </button>
                        <button
                          onClick={() => setSemVerbaAba("autorizacao")}
                          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${semVerbaAba === "autorizacao" ? "border-red-500 text-red-700 bg-red-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 inline mr-1.5" />
                          Autorização Admin
                        </button>
                      </div>

                      {semVerbaAba === "realocacao" && obraIdDialog ? (
                        <div className="space-y-3">
                          <p className="text-xs text-gray-600">
                            Use a reserva de risco (DI-08) ou sobras de compras anteriores para cobrir o déficit de{" "}
                            <span className="font-bold text-red-700">{totalSemVerba.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>.
                          </p>
                          <SaldosRealocacaoPanel
                            companyId={companyId}
                            obraId={obraIdDialog}
                            cotacaoId={showDetalhe ?? undefined}
                            deficit={totalSemVerba}
                            showContent={true}
                            onAcao={() => mapaQ.refetch()}
                            onCoberto={() => {
                              setSemVerbaAutorizado({ adminId: 0, adminNome: "Reserva de Risco (DI-08)", justificativa: "Déficit coberto via reserva de risco" });
                            }}
                            userId={(user as any)?.id}
                            userName={(user as any)?.name}
                          />
                        </div>
                      ) : semVerbaAba === "realocacao" && !obraIdDialog ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs text-yellow-700">Esta cotação não está vinculada a uma obra. A realocação de verba só é possível com obra definida.</p>
                          <p className="text-xs text-yellow-600 mt-1">Use a aba "Autorização Admin" para prosseguir.</p>
                        </div>
                      ) : null}

                      {semVerbaAba === "autorizacao" && (
                        <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                          <p className="text-xs text-gray-500">
                            Se não há verba disponível para realocação, um administrador pode autorizar a compra diretamente.
                          </p>
                          <div>
                            <label className="text-xs font-medium text-gray-600">E-mail do Admin</label>
                            <input
                              type="email"
                              value={semVerbaAdminEmail}
                              onChange={(e) => setSemVerbaAdminEmail(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="admin@empresa.com"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Senha do Admin</label>
                            <input
                              type="password"
                              value={semVerbaAdminSenha}
                              onChange={(e) => setSemVerbaAdminSenha(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Digite a senha"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Justificativa da compra</label>
                            <textarea
                              value={semVerbaJustificativa}
                              onChange={(e) => setSemVerbaJustificativa(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                              rows={3}
                              placeholder="Explique por que esta compra é necessária mesmo sem verba orçamentária..."
                            />
                          </div>
                          <Button
                            onClick={handleAutorizarSemVerba}
                            disabled={!semVerbaAdminEmail || !semVerbaAdminSenha || semVerbaJustificativa.length < 5 || autorizarSemVerba.isPending}
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                          >
                            {autorizarSemVerba.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                            Autorizar Compra sem Verba
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ── Cancelar Aprovação (dentro do detalhe) ── */}
        <Dialog open={showCancelarAprovacao} onOpenChange={(o) => { if (!o) { setShowCancelarAprovacao(false); setCancelarCotacaoId(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-700">
                <Undo2 className="h-5 w-5" /> Cancelar Aprovação da Cotação
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Esta ação irá remover a(s) OC(s) gerada(s) e retornar a cotação ao status <strong>Pendente</strong>.
                A ação não pode ser desfeita. Confirme apenas se tiver certeza.
              </div>
              <div>
                <Label htmlFor="just-cancelar-det" className="text-sm font-medium text-gray-700">Justificativa *</Label>
                <Textarea
                  id="just-cancelar-det"
                  value={justificativaCancelar}
                  onChange={(e) => setJustificativaCancelar(e.target.value)}
                  placeholder="Descreva o motivo do cancelamento..."
                  className="mt-1.5 resize-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowCancelarAprovacao(false)}>
                  Voltar
                </Button>
                <Button
                  disabled={!cancelarCotacaoId || justificativaCancelar.trim().length < 1 || cancelarAprovacao.isPending}
                  onClick={() => {
                    if (!cancelarCotacaoId) return;
                    cancelarAprovacao.mutate({ cotacaoId: cancelarCotacaoId, companyId, justificativa: justificativaCancelar.trim() });
                  }}
                  className="bg-orange-600 hover:bg-orange-500 text-white gap-2"
                >
                  {cancelarAprovacao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  Confirmar Cancelamento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showFdCotDialog} onOpenChange={setShowFdCotDialog}>
          <DialogContent className="border-gray-200 max-w-lg" style={{ background: '#ffffff', color: '#111827', zIndex: 9999 }}>
            <DialogHeader>
              <DialogTitle className="text-gray-900">Definir Faturamento Direto</DialogTitle>
            </DialogHeader>
            {splitQ.isLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando split MAT/MDO...
              </div>
            ) : splitQ.data ? (() => {
              const sp = splitQ.data;
              const fdVal = parseBRNumber(fdCotForm.valor);
              const excedeMat = sp.totalMat > 0 ? fdVal > sp.totalMat : false;
              const semMat = sp.totalMat <= 0;
              return (
                <div className="space-y-4 py-2">
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Composição da Cotação</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 bg-white rounded border border-gray-100">
                        <p className="text-[10px] text-gray-400 uppercase">Total</p>
                        <p className="text-sm font-bold text-gray-800">{fmt(sp.totalGeral)}</p>
                      </div>
                      <div className="text-center p-2 bg-blue-50 rounded border border-blue-200">
                        <p className="text-[10px] text-blue-500 uppercase font-medium">Material</p>
                        <p className="text-sm font-bold text-blue-700">{fmt(sp.totalMat)}</p>
                        {sp.totalGeral > 0 && <p className="text-[10px] text-blue-400">{((sp.totalMat / sp.totalGeral) * 100).toFixed(1)}%</p>}
                      </div>
                      <div className="text-center p-2 bg-purple-50 rounded border border-purple-200">
                        <p className="text-[10px] text-purple-500 uppercase font-medium">Mão de Obra</p>
                        <p className="text-sm font-bold text-purple-700">{fmt(sp.totalMdo)}</p>
                        {sp.totalGeral > 0 && <p className="text-[10px] text-purple-400">{((sp.totalMdo / sp.totalGeral) * 100).toFixed(1)}%</p>}
                      </div>
                    </div>
                    {sp.tipoOrigem && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Tipo SC: <span className="font-semibold">{sp.tipoOrigem === "material" ? "Material" : sp.tipoOrigem === "servico" ? "Serviço/MDO" : sp.tipoOrigem === "pacote" ? "Pacote (Mat+MDO)" : sp.tipoOrigem}</span>
                      </p>
                    )}
                    {!sp.temVencedor && sp.totalGeral > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> {sp.temRespostas ? "Valores das respostas dos fornecedores (nenhum vencedor selecionado)" : "Valores baseados na meta orçamentária (nenhuma resposta de fornecedor)"}
                      </p>
                    )}
                    {sp.itens.length > 0 && sp.itens.some(i => i.tipo === "pacote") && (
                      <div className="mt-2 max-h-28 overflow-y-auto">
                        <table className="w-full text-[10px]">
                          <thead><tr className="text-gray-400 border-b"><th className="text-left py-0.5">Item</th><th className="text-right py-0.5">MAT</th><th className="text-right py-0.5">MDO</th></tr></thead>
                          <tbody>
                            {sp.itens.filter(i => i.valor > 0).map(i => (
                              <tr key={i.id} className="border-b border-gray-50">
                                <td className="py-0.5 text-gray-600 truncate max-w-[200px]">{i.descricao}</td>
                                <td className="py-0.5 text-right text-blue-600">{fmt(i.valorMat)}</td>
                                <td className="py-0.5 text-right text-purple-600">{fmt(i.valorMdo)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {semMat ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-sm text-red-700 font-medium">{sp.totalMdo > 0 ? "Esta cotação é 100% mão de obra" : "Nenhum valor de material identificado"}</p>
                      <p className="text-xs text-red-500 mt-1">FD só é permitido para a parcela de material.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">Quem paga?</label>
                        <Select value={fdCotForm.modalidade} onValueChange={v => setFdCotForm(p => ({ ...p, modalidade: v as any }))}>
                          <SelectTrigger className="bg-white border-gray-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fd_cliente">FD Cliente (cliente paga ao fornecedor)</SelectItem>
                            <SelectItem value="fd_fc">FD FC (a FC paga diretamente)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-400 mt-1">
                          {fdCotForm.modalidade === "fd_cliente"
                            ? "O cliente pagará diretamente ao fornecedor. O valor será abatido do saldo de FD orçado."
                            : "A FC realizará o pagamento direto ao fornecedor. Não consome saldo de FD do orçamento."}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                          Valor do FD (R$) <span className="text-blue-500 font-normal">— máximo MAT: {fmt(sp.totalMat)}</span>
                        </label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={fdCotForm.valor}
                          onChange={e => {
                            let v = e.target.value.replace(/[^\d.,]/g, "");
                            setFdCotForm(p => ({ ...p, valor: v }));
                          }}
                          placeholder="0,00"
                          className={`bg-white border-gray-300 ${excedeMat ? "border-red-400 ring-1 ring-red-300" : ""}`}
                        />
                        {fdCotForm.valor && (() => {
                          return fdVal > 0 ? (
                            <p className={`text-xs mt-1 font-medium ${excedeMat ? "text-red-600" : "text-emerald-600"}`}>
                              {fmt(fdVal)}
                              {excedeMat && " — Excede o valor de material!"}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setShowFdCotDialog(false)}>Cancelar</Button>
                    {!semMat && (
                      <Button
                        disabled={!fdCotForm.valor || fdVal <= 0 || excedeMat || marcarFd.isPending || !showDetalhe}
                        onClick={() => {
                          if (!showDetalhe) return;
                          marcarFd.mutate({
                            cotacaoId: showDetalhe,
                            companyId,
                            modalidade: fdCotForm.modalidade,
                            valor: fdVal,
                          });
                        }}
                        className="bg-amber-600 hover:bg-amber-500 text-white gap-2"
                      >
                        {marcarFd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                        Confirmar FD
                      </Button>
                    )}
                  </div>
                </div>
              );
            })() : (
              <p className="text-sm text-red-500 py-4">Erro ao calcular split MAT/MDO.</p>
            )}
          </DialogContent>
        </Dialog>

      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cotações</h1>
            <p className="text-sm text-gray-500">Registre propostas de fornecedores e compare preços</p>
          </div>
        </div>
        <DraggableCommandBar barId="cotacoes" items={[
          { id: "nova", node: <Button onClick={() => setShowNova(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova Cotação</Button> },
        ]} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {["todos", "pendente", "aprovada", "concluida", "recusada", "expirada"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s ? "bg-blue-600 border-blue-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
              {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} cotação(ões) selecionada(s)</span>
          <Button size="sm" variant="destructive" className="gap-1.5 ml-auto" onClick={() => setConfirmExcluirLote(true)} disabled={excluirLote.isPending}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionadas
          </Button>
          <Button size="sm" variant="outline" className="text-gray-600" onClick={() => setSelectedIds(new Set())}>Cancelar</Button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10 px-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas" />
              </TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Número</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Descrição / SC</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Obra</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Fornecedor</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Total</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Validade</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">Nenhuma cotação encontrada</TableCell></TableRow>
            ) : filt.map(cot => {
              const st = STATUS_LABELS[cot.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === cot.fornecedorId);
              return (
                <TableRow key={cot.id} className={`border-gray-100 cursor-pointer ${selectedIds.has(cot.id) ? "bg-blue-50/60" : "hover:bg-gray-50"}`} onClick={() => setShowDetalhe(cot.id)}>
                  <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(cot.id)} onCheckedChange={() => toggleSelect(cot.id)} aria-label={`Selecionar ${cot.numeroCotacao}`} />
                  </TableCell>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">{cot.numeroCotacao}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-900 text-sm">{(cot as any).descricao || "—"}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${(cot as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : (cot as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700" : (cot as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>
                        {(cot as any).tipo === "servico" ? "MDO" : (cot as any).tipo === "pacote" ? "MAT+MDO" : (cot as any).tipo === "equipamento" ? "EQUIP" : "MAT"}
                      </span>
                      {(cot as any).modalidadeFd && (cot as any).modalidadeFd !== "normal" && (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${(cot as any).fdPagador === "cliente" ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}>
                          FD {(cot as any).fdPagador === "cliente" ? "Cliente" : "FC"}
                        </span>
                      )}
                    </div>
                    {cot.solicitacaoId && <div className="text-gray-400 text-xs">SC #{cot.solicitacaoId}</div>}
                  </TableCell>
                  <TableCell>
                    {(cot as any).obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra((cot as any).obraId) ?? `#${(cot as any).obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-600 text-sm">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</TableCell>
                  <TableCell className="text-emerald-700 font-semibold text-sm">
                    {parseFloat(cot.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{cot.dataValidade ? new Date(cot.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      <TimelineBadge companyId={companyId} cotacaoId={cot.id} />
                    </div>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Nova Cotação */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Nova Cotação</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Descrição da Cotação</Label>
              <Input className="bg-white border-gray-300 text-gray-900" placeholder="Ex: Cotação de materiais de elétrica - Forn. XYZ" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} onBlur={e => setForm(p => ({ ...p, descricao: normalizarTexto(e.target.value) }))} />
            </div>

            {/* Obra obrigatória */}
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-blue-600" /> Obra / Centro de Custo *
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
              <p className="text-xs text-gray-400">Obrigatório — o custo desta cotação será apropriado à obra selecionada.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">SC Vinculada (opcional)</Label>
                <Select value={form.solicitacaoId} onValueChange={handleScChange}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione uma SC..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(scsQ.data ?? []).filter(s => s.status === "pendente" && (s as any).aprovacaoStatus === "aprovada").map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.numeroSc}{(s as any).titulo ? ` — ${(s as any).titulo}` : s.departamento ? ` — ${s.departamento}` : ""}
                        {(s as any).tipo === "servico" ? " [MDO]" : (s as any).tipo === "pacote" ? " [MAT+MDO]" : (s as any).tipo === "equipamento" ? " [EQUIP]" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.solicitacaoId && form.solicitacaoId !== "none" && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${form.tipo === "servico" ? "bg-purple-100 text-purple-700" : form.tipo === "pacote" ? "bg-indigo-100 text-indigo-700" : form.tipo === "equipamento" ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>
                    {form.tipo === "servico" ? "MDO" : form.tipo === "pacote" ? "MAT+MDO" : form.tipo === "equipamento" ? "EQUIP" : "MAT"}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Fornecedor</Label>
                <Select value={form.fornecedorId} onValueChange={v => setForm(p => ({ ...p, fornecedorId: v }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {fornecedores.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nomeFantasia || f.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(novaSugestoesQ.data ?? []).length > 0 && (!form.fornecedorId || form.fornecedorId === "none") && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" /> Sugeridos:
                    </span>
                    {(novaSugestoesQ.data ?? []).slice(0, 3).map(s => {
                      const f = fornecedores.find(f => f.id === s.fornecedorId);
                      const nome = f?.nomeFantasia || f?.razaoSocial || s.fornecedorNome || "";
                      return nome ? (
                        <button key={s.fornecedorId} type="button"
                          onClick={() => setForm(p => ({ ...p, fornecedorId: String(s.fornecedorId) }))}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
                          {nome}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Validade da Cotação</Label>
                <Input type="date" className="bg-white border-gray-300 text-gray-900" value={form.dataValidade} onChange={e => setForm(p => ({ ...p, dataValidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Condição de Pagamento</Label>
                <Select value={form.tipoPagamento} onValueChange={v => setForm(p => ({ ...p, tipoPagamento: v, condicaoPagamento: getTipoPagamentoLabel(v) }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {TIPOS_PAGAMENTO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.tipoPagamento === "entrada_parcelas" && (
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-sm font-medium">Nº de Parcelas</Label>
                  <Input type="number" min="2" max="36" className="bg-white border-gray-300 text-gray-900" placeholder="Ex: 3"
                    value={form.numeroParcelas} onChange={e => setForm(p => ({ ...p, numeroParcelas: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Prazo Entrega (dias)</Label>
                <Input type="number" min="0" className="bg-white border-gray-300 text-gray-900" value={form.prazoEntregaDias} onChange={e => {
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
                <Label className="text-gray-700 text-sm font-medium">Data Prevista Entrega</Label>
                <Input type="date" className="bg-white border-gray-300 text-gray-900" value={(form as any).dataEntregaPrevista ?? ""} onChange={e => {
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Observações</Label>
              <Textarea className="bg-white border-gray-300 text-gray-900 resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-700 font-semibold">Itens da Cotação *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="border-gray-300 text-gray-600 hover:bg-gray-50 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>

              {loadingSCItens && (
                <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando materiais da composição...
                </div>
              )}

              {scAlertas.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Alertas de compra recente
                  </p>
                  {scAlertas.map((a, i) => (
                    <p key={i} className="text-[11px] text-amber-700">
                      <span className="font-medium">{a.descricao}:</span> {a.mensagem}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input className="bg-white border-gray-300 text-gray-900 text-sm w-full" placeholder="Descrição *" value={it.descricao} onChange={e => updateItem(idx, "descricao", e.target.value)} onBlur={e => updateItem(idx, "descricao", normalizarTexto(e.target.value))} />
                        {it.insumoCodigo && (
                          <span className="text-[9px] text-gray-400 font-mono mt-0.5 block">{it.insumoCodigo}</span>
                        )}
                      </div>
                      {itens.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Select value={it.unidade} onValueChange={v => updateItem(idx, "unidade", v)}>
                        <SelectTrigger className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white border-gray-200">
                          {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="w-24 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(idx, "quantidade", e.target.value)} />
                      <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" step="0.01" placeholder="Preço unit. (R$)" value={it.precoUnitario} onChange={e => updateItem(idx, "precoUnitario", e.target.value)} />
                      <Input className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" max="100" placeholder="Desc%" value={it.descontoPct} onChange={e => updateItem(idx, "descontoPct", e.target.value)} />
                      <div className="w-28 flex items-center text-emerald-700 text-sm font-medium">
                        {calcTotal(it).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                    {it.historico && it.historico.length > 0 && (
                      <div className="pl-2 border-l-2 border-emerald-200 mt-1 space-y-0.5">
                        <p className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> Histórico de preços:
                        </p>
                        {it.historico.map((h, j) => (
                          <p key={j} className="text-[10px] text-gray-600">
                            R$ {h.precoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — {h.fornecedorNome} ({h.numeroOc}, {new Date(h.data).toLocaleDateString("pt-BR")})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <span className="text-gray-500 text-sm">Total: <span className="text-emerald-700 font-bold text-base">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criar.isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Cotação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe Cotação */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">{detalhe?.numeroCotacao} — Detalhes</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (() => {
            const forn = fornecedores.find(f => f.id === detalhe.fornecedorId);
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            return (
              <div className="space-y-5 pt-2">
                {(detalhe as any)?.itens?.some((it: any) => it.semVerba) && (
                  <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 print:border-red-500">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-800">⚠ PREJUÍZO — Itens Acima do Orçado ou Sem Verba</p>
                      <p className="text-xs text-red-600">Esta cotação contém itens sem verba disponível no orçamento.</p>
                    </div>
                  </div>
                )}
                {(detalhe as any).descricao && (
                  <div className="text-gray-700 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">{(detalhe as any).descricao}</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div><span className="text-gray-400 text-xs">Obra</span><p className="text-gray-900 font-medium flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" />{nomeObra((detalhe as any).obraId) ?? "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.cls}`}>{st.label}</span></p></div>
                  <div><span className="text-gray-400 text-xs">Fornecedor</span><p className="text-gray-900 font-medium">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Cond. Pagamento</span><p className="text-gray-900 font-medium">{(() => { const info = getTipoPagamentoInfo((detalhe as any).tipoPagamento); return info ? info.label : detalhe.condicaoPagamento || "—"; })()}</p></div>
                  <div><span className="text-gray-400 text-xs">{(() => { const tp = (detalhe as any).tipoPagamento ?? ""; const cp = detalhe.condicaoPagamento ?? ""; const t = (detalhe as any).tipo; return ((t === "servico" || t === "pacote") && (tp === "medicao" || cp.toLowerCase().includes("medição"))) ? "Mobilização" : "Prazo Entrega"; })()}</span><p className="text-gray-900 font-medium">{detalhe.prazoEntregaDias ? `${detalhe.prazoEntregaDias} dias` : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Validade</span><p className="text-gray-900 font-medium">{detalhe.dataValidade ? new Date(detalhe.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Total</span><p className="text-emerald-700 font-bold">{parseFloat(detalhe.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                  {(detalhe as any).modalidadeFd && (detalhe as any).modalidadeFd !== "normal" && (
                    <div><span className="text-gray-400 text-xs">Faturamento Direto</span><p className="text-gray-900 font-medium flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(detalhe as any).fdPagador === "cliente" ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}>
                        FD {(detalhe as any).fdPagador === "cliente" ? "Cliente" : "FC"}
                      </span>
                      {parseFloat((detalhe as any).fdValor ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p></div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
                        <TableHead className="text-gray-500 text-xs">Descrição</TableHead>
                        <TableHead className="text-gray-500 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-gray-500 text-xs w-24 text-right">Qtd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detalhe.itens as any[]).map((it: any) => (
                        <TableRow key={it.id} className={`border-gray-100 ${it.semVerba ? "bg-red-50 print:bg-red-50" : ""}`}>
                          <TableCell className="text-gray-900 text-sm">
                            {it.descricao}
                            {it.semVerba && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 print:border-red-400">PREJUÍZO</span>}
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-gray-500 text-sm text-right">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <PurchaseTimeline companyId={companyId} cotacaoId={detalhe.id} />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                  {detalhe.status === "pendente" && (detalhe as any).tipo === "servico" && (
                    <>
                      {deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                          <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-red-800">Déficit de {deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — resolva antes de aprovar</p>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => {
                          if (!validarCondicoesVencedor()) return;
                          gerarContrato.mutate({ cotacaoId: detalhe.id, companyId });
                        }}
                          disabled={gerarContrato.isPending}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1">
                          {gerarContrato.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                          Aprovar e Gerar Contrato de Serviço
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: "recusada" })}
                        className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1">
                        <X className="h-3 w-3" /> Recusar
                      </Button>
                    </>
                  )}
                  {detalhe.status === "pendente" && (detalhe as any).tipo !== "servico" && (
                    <>
                      <Button size="sm" onClick={() => { if (!validarCondicoesVencedor()) return; gerarOC.mutate({ companyId, cotacaoId: detalhe.id, userId: user?.id, userName: user?.name }); }} disabled={gerarOC.isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1">
                        <CheckCircle className="h-3 w-3" /> Aprovar e Gerar OC
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: "recusada" })}
                        className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1">
                        <X className="h-3 w-3" /> Recusar
                      </Button>
                    </>
                  )}
                  {detalhe.status === "concluida" && (detalhe as any).contratoTerceiroId && (
                    <Button size="sm" variant="outline" onClick={() => { setShowDetalhe(null); navigate(`/terceiros/contratos/${(detalhe as any).contratoTerceiroId}`); }}
                      className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs gap-1">
                      <FileText className="h-3 w-3" /> Ver Contrato de Serviço
                    </Button>
                  )}
                  {["cancelada", "recusada"].includes(detalhe.status ?? "") && (
                    <Button size="sm" variant="outline" onClick={() => {
                      if (confirm("Deseja reabrir esta cotação? O status voltará para 'Pendente' e será possível aprová-la novamente.")) {
                        atualizarStatus.mutate({ id: detalhe.id, status: "pendente" });
                      }
                    }}
                      disabled={atualizarStatus.isPending}
                      className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs gap-1">
                      <RotateCcw className="h-3 w-3" /> Reabrir Cotação
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-gray-200 text-gray-500 hover:bg-gray-50 text-xs ml-auto gap-1">
                    <Trash2 className="h-3 w-3" /> Excluir
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      {/* ── Cancelar Aprovação ── */}
      <Dialog open={showCancelarAprovacao} onOpenChange={(o) => { if (!o) { setShowCancelarAprovacao(false); setCancelarCotacaoId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <Undo2 className="h-5 w-5" /> Cancelar Aprovação da Cotação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Esta ação irá remover a(s) OC(s) gerada(s) e retornar a cotação ao status <strong>Pendente</strong>.
              A ação não pode ser desfeita. Confirme apenas se tiver certeza.
            </div>
            <div>
              <Label htmlFor="just-cancelar" className="text-sm font-medium text-gray-700">Justificativa *</Label>
              <Textarea
                id="just-cancelar"
                value={justificativaCancelar}
                onChange={(e) => setJustificativaCancelar(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                className="mt-1.5 resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowCancelarAprovacao(false)}>
                Voltar
              </Button>
              <Button
                disabled={!cancelarCotacaoId || justificativaCancelar.trim().length < 1 || cancelarAprovacao.isPending}
                onClick={() => {
                  if (!cancelarCotacaoId) return;
                  cancelarAprovacao.mutate({ cotacaoId: cancelarCotacaoId, companyId, justificativa: justificativaCancelar.trim() });
                }}
                className="bg-orange-600 hover:bg-orange-500 text-white gap-2"
              >
                {cancelarAprovacao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Confirmar Cancelamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {iaOverlayPortal}
      {condModalPortal}

      <Dialog open={confirmExcluirLote} onOpenChange={setConfirmExcluirLote}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> cotação(ões)? As OCs vinculadas também serão excluídas e as SCs voltarão ao status pendente. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmExcluirLote(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-1.5" disabled={excluirLote.isPending} onClick={() => excluirLote.mutate({ ids: [...selectedIds], companyId })}>
              {excluirLote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir {selectedIds.size} cotação(ões)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFdCotDialog} onOpenChange={setShowFdCotDialog}>
        <DialogContent className="border-gray-200 max-w-lg" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Definir Faturamento Direto</DialogTitle>
          </DialogHeader>
          {splitQ.isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando split MAT/MDO...
            </div>
          ) : splitQ.data ? (() => {
            const sp = splitQ.data;
            const fdVal = parseBRNumber(fdCotForm.valor);
            const excedeMat = sp.totalMat > 0 ? fdVal > sp.totalMat : false;
            const semMat = sp.totalMat <= 0;
            return (
              <div className="space-y-4 py-2">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Composição da Cotação</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-white rounded border border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase">Total</p>
                      <p className="text-sm font-bold text-gray-800">{fmt(sp.totalGeral)}</p>
                    </div>
                    <div className="text-center p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-[10px] text-blue-500 uppercase font-medium">Material</p>
                      <p className="text-sm font-bold text-blue-700">{fmt(sp.totalMat)}</p>
                      {sp.totalGeral > 0 && <p className="text-[10px] text-blue-400">{((sp.totalMat / sp.totalGeral) * 100).toFixed(1)}%</p>}
                    </div>
                    <div className="text-center p-2 bg-purple-50 rounded border border-purple-200">
                      <p className="text-[10px] text-purple-500 uppercase font-medium">Mão de Obra</p>
                      <p className="text-sm font-bold text-purple-700">{fmt(sp.totalMdo)}</p>
                      {sp.totalGeral > 0 && <p className="text-[10px] text-purple-400">{((sp.totalMdo / sp.totalGeral) * 100).toFixed(1)}%</p>}
                    </div>
                  </div>
                  {sp.tipoOrigem && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Tipo SC: <span className="font-semibold">{sp.tipoOrigem === "material" ? "Material" : sp.tipoOrigem === "servico" ? "Serviço/MDO" : sp.tipoOrigem === "pacote" ? "Pacote (Mat+MDO)" : sp.tipoOrigem}</span>
                    </p>
                  )}
                  {!sp.temVencedor && sp.totalGeral > 0 && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {sp.temRespostas ? "Valores das respostas dos fornecedores (nenhum vencedor selecionado)" : "Valores baseados na meta orçamentária (nenhuma resposta de fornecedor)"}
                    </p>
                  )}
                  {sp.itens.length > 0 && sp.itens.some(i => i.tipo === "pacote") && (
                    <div className="mt-2 max-h-28 overflow-y-auto">
                      <table className="w-full text-[10px]">
                        <thead><tr className="text-gray-400 border-b"><th className="text-left py-0.5">Item</th><th className="text-right py-0.5">MAT</th><th className="text-right py-0.5">MDO</th></tr></thead>
                        <tbody>
                          {sp.itens.filter(i => i.valor > 0).map(i => (
                            <tr key={i.id} className="border-b border-gray-50">
                              <td className="py-0.5 text-gray-600 truncate max-w-[200px]">{i.descricao}</td>
                              <td className="py-0.5 text-right text-blue-600">{fmt(i.valorMat)}</td>
                              <td className="py-0.5 text-right text-purple-600">{fmt(i.valorMdo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {semMat ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-red-700 font-medium">{sp.totalMdo > 0 ? "Esta cotação é 100% mão de obra" : "Nenhum valor de material identificado"}</p>
                    <p className="text-xs text-red-500 mt-1">FD só é permitido para a parcela de material.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Quem paga?</label>
                      <Select value={fdCotForm.modalidade} onValueChange={v => setFdCotForm(p => ({ ...p, modalidade: v as any }))}>
                        <SelectTrigger className="bg-white border-gray-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fd_cliente">FD Cliente (cliente paga ao fornecedor)</SelectItem>
                          <SelectItem value="fd_fc">FD FC (a FC paga diretamente)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-1">
                        {fdCotForm.modalidade === "fd_cliente"
                          ? "O cliente pagará diretamente ao fornecedor. O valor será abatido do saldo de FD orçado."
                          : "A FC realizará o pagamento direto ao fornecedor. Não consome saldo de FD do orçamento."}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Valor do FD (R$) <span className="text-blue-500 font-normal">— máximo MAT: {fmt(sp.totalMat)}</span>
                      </label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={fdCotForm.valor}
                        onChange={e => {
                          let v = e.target.value.replace(/[^\d.,]/g, "");
                          setFdCotForm(p => ({ ...p, valor: v }));
                        }}
                        placeholder="0,00"
                        className={`bg-white border-gray-300 ${excedeMat ? "border-red-400 ring-1 ring-red-300" : ""}`}
                      />
                      {fdCotForm.valor && (() => {
                        return fdVal > 0 ? (
                          <p className={`text-xs mt-1 font-medium ${excedeMat ? "text-red-600" : "text-emerald-600"}`}>
                            {fmt(fdVal)}
                            {excedeMat && " — Excede o valor de material!"}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowFdCotDialog(false)}>Cancelar</Button>
                  {!semMat && (
                    <Button
                      disabled={!fdCotForm.valor || fdVal <= 0 || excedeMat || marcarFd.isPending || !showDetalhe}
                      onClick={() => {
                        if (!showDetalhe) return;
                        marcarFd.mutate({
                          cotacaoId: showDetalhe,
                          companyId,
                          modalidade: fdCotForm.modalidade,
                          valor: fdVal,
                        });
                      }}
                      className="bg-amber-600 hover:bg-amber-500 text-white gap-2"
                    >
                      {marcarFd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                      Confirmar FD
                    </Button>
                  )}
                </div>
              </div>
            );
          })() : (
            <p className="text-sm text-red-500 py-4">Erro ao calcular split MAT/MDO.</p>
          )}
        </DialogContent>
      </Dialog>

      {aprovacaoProgress !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 space-y-6">
            <h3 className="text-lg font-bold text-gray-900 text-center">Processando aprovação...</h3>
            <div className="flex items-center gap-0 w-full py-4">
              {[
                { label: "Aprovando Cotação", icon: <FileSearch className="h-5 w-5" /> },
                { label: "Gerando OS", icon: <ShoppingCart className="h-5 w-5" /> },
                { label: "Criando Contrato PJ", icon: <FileText className="h-5 w-5" /> },
                { label: "Contrato Terceiros", icon: <ExternalLink className="h-5 w-5" /> },
              ].map((step, i) => {
                const isDone = aprovacaoProgress.step > i;
                const isActive = aprovacaoProgress.step === i;
                return (
                  <div key={i} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-500 ${
                        isDone ? "bg-emerald-500 border-emerald-500 text-white scale-100" :
                        isActive ? "bg-white border-blue-500 text-blue-600 ring-4 ring-blue-100 animate-pulse" :
                        "bg-gray-100 border-gray-300 text-gray-400"
                      }`}>
                        {isDone ? <Check className="h-5 w-5" /> : step.icon}
                      </div>
                      <span className={`text-xs mt-2 font-medium text-center leading-tight transition-colors duration-500 ${
                        isDone ? "text-emerald-700" : isActive ? "text-blue-700 font-semibold" : "text-gray-400"
                      }`}>{step.label}</span>
                    </div>
                    {i < 3 && (
                      <div className={`h-0.5 flex-1 -mt-5 mx-1.5 rounded transition-colors duration-500 ${isDone ? "bg-emerald-400" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {aprovacaoProgress.step >= 4 && (
              <div className="text-center space-y-3 animate-in fade-in duration-500">
                <p className="text-sm text-emerald-700 font-semibold">
                  {aprovacaoProgress.redirectTo ? "Contrato criado com sucesso!" : "Ordem de Compra gerada com sucesso!"}
                </p>
                <p className="text-xs text-gray-500">
                  {aprovacaoProgress.redirectTo ? "Redirecionando para o módulo Terceiros..." : "Finalizando..."}
                </p>
              </div>
            )}
            {aprovacaoProgress.step < 4 && (
              <p className="text-xs text-gray-400 text-center">Aguarde, não feche esta página...</p>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!editFornDialog} onOpenChange={(open) => { if (!open) setEditFornDialog(null); }}>
        {editFornDialog && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[9999]">
            <DialogHeader><DialogTitle>Editar Fornecedor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input value={editFornForm.cnpj} onChange={e => setEditFornForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label className="text-xs">Razão Social *</Label>
                  <Input value={editFornForm.razaoSocial} onChange={e => setEditFornForm(p => ({ ...p, razaoSocial: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Nome Fantasia</Label>
                <Input value={editFornForm.nomeFantasia} onChange={e => setEditFornForm(p => ({ ...p, nomeFantasia: e.target.value }))} />
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Endereço</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Endereço</Label>
                    <Input value={editFornForm.endereco} onChange={e => setEditFornForm(p => ({ ...p, endereco: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Número</Label>
                    <Input value={editFornForm.numero} onChange={e => setEditFornForm(p => ({ ...p, numero: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Complemento</Label>
                    <Input value={editFornForm.complemento} onChange={e => setEditFornForm(p => ({ ...p, complemento: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Bairro</Label>
                    <Input value={editFornForm.bairro} onChange={e => setEditFornForm(p => ({ ...p, bairro: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">CEP</Label>
                    <Input value={editFornForm.cep} onChange={e => setEditFornForm(p => ({ ...p, cep: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Cidade</Label>
                    <Input value={editFornForm.cidade} onChange={e => setEditFornForm(p => ({ ...p, cidade: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Input value={editFornForm.estado} onChange={e => setEditFornForm(p => ({ ...p, estado: e.target.value }))} maxLength={2} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Contato</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input value={editFornForm.telefone} onChange={e => setEditFornForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 0000-0000" />
                  </div>
                  <div>
                    <Label className="text-xs">E-mail</Label>
                    <Input value={editFornForm.email} onChange={e => setEditFornForm(p => ({ ...p, email: e.target.value }))} type="email" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Nome do Contato</Label>
                    <Input value={editFornForm.contatoNome} onChange={e => setEditFornForm(p => ({ ...p, contatoNome: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Celular Contato</Label>
                    <Input value={editFornForm.contatoCelular} onChange={e => setEditFornForm(p => ({ ...p, contatoCelular: e.target.value }))} placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <Label className="text-xs">E-mail Contato</Label>
                    <Input value={editFornForm.contatoEmail} onChange={e => setEditFornForm(p => ({ ...p, contatoEmail: e.target.value }))} type="email" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Dados Bancários</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Banco</Label>
                    <Input value={editFornForm.banco} onChange={e => setEditFornForm(p => ({ ...p, banco: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Agência</Label>
                    <Input value={editFornForm.agencia} onChange={e => setEditFornForm(p => ({ ...p, agencia: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Conta</Label>
                    <Input value={editFornForm.conta} onChange={e => setEditFornForm(p => ({ ...p, conta: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Chave PIX</Label>
                  <Input value={editFornForm.pix} onChange={e => setEditFornForm(p => ({ ...p, pix: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Observações</Label>
                <Input value={editFornForm.observacoes} onChange={e => setEditFornForm(p => ({ ...p, observacoes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFornDialog(null)}>Cancelar</Button>
              <Button
                disabled={!editFornForm.razaoSocial || atualizarFornMut.isPending}
                onClick={() => {
                  atualizarFornMut.mutate({
                    id: editFornDialog.id,
                    ...editFornForm,
                    telefone: editFornForm.telefone.replace(/\D/g, ""),
                    contatoCelular: editFornForm.contatoCelular.replace(/\D/g, ""),
                    cnpj: editFornForm.cnpj.replace(/\D/g, ""),
                  });
                }}
              >
                {atualizarFornMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

    </div>
    </DashboardLayout>
  );
}
