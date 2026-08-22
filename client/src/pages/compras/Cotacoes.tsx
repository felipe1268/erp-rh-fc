import DashboardLayout from "@/components/DashboardLayout";
import { useConfirm } from "@/hooks/useConfirm";
import FornecedorFormModal from "@/components/FornecedorFormModal";
import { CartaoDisponivelCard } from "@/components/compras/CartaoDisponivelCard";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { toast } from "sonner";
import { normalizarTexto } from "@shared/textNormalization";
import { formatNumeroScDisplay } from "@shared/numeroSc";
import { formatNumeroCotacaoDisplay } from "@shared/numeroCotacao";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, FileText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, CheckCircle, X, XCircle, Building2, Trophy, UserPlus, Save, BarChart3, ChevronsUpDown, ArrowUp, ArrowDown, ArrowUpDown, Paperclip, ExternalLink, AlertTriangle, TrendingDown, TrendingUp, Package, Undo2, History, Link2, RefreshCw, Phone, Mail, User, Smartphone, Sparkles, Star, ShieldCheck, ShieldAlert, Settings, DollarSign, Pencil, Check, ClipboardList, FileSearch, ShoppingCart, RotateCcw, Pin, GitBranch, Zap, PenTool, CreditCard, Banknote, Calendar, Truck, Target, BarChart2, Clock, Wallet, Layers, ArrowLeftRight, Warehouse, HardHat, Info, Printer, Lock, Pause, Play, Download, Share2, FolderOpen, Scale, type LucideIcon } from "lucide-react";
import { TIPOS_PAGAMENTO, getTipoPagamentoInfo, calcularParcelas, formatCurrency } from "../../../../shared/paymentConditions";
import * as XLSX from "xlsx";
import { PurchaseTimeline, TimelineBadge } from "@/components/compras/PurchaseTimeline";
import DOMPurify from "dompurify";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { buildContratoPreviewSrcDoc } from "@/lib/contratoSrcDoc";
import { buildAnexoSections } from "@/lib/contratoAnexoPages";

// Rev. 5006 — Prévia do contrato de serviço 100% fiel ao documento final: usa o
// Rev. 5054 — buildContratoPreviewSrcDoc extraído p/ @/lib/contratoSrcDoc (reuso no ContratoDetalhe)


function safeAnexoHref(u: any): string | undefined {
  return typeof u === "string" && (/^https?:\/\//i.test(u) || u.startsWith("/")) ? u : undefined;
}

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

// Rev. 5098 — subtotais do Resumo Consolidado por CATEGORIA (nome do material) + unidade,
// não só por unidade (cimento em kg não pode somar com aço em kg).
const _catStopwords = new Set(["de", "da", "do", "das", "dos", "em", "para", "p/", "com", "a", "o", "e", "ou", "na", "no", "barra", "barras", "saco", "sacos"]);
function categoriaResumo(descricao: string, unidade: string): { key: string; label: string } {
  const norm = (descricao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tokens = norm.split(/[\s,;()/-]+/).filter(t => t.length >= 3 && !_catStopwords.has(t) && !/^\d/.test(t));
  const primeira = tokens[0] ?? "outros";
  const label = primeira.charAt(0).toUpperCase() + primeira.slice(1);
  const un = unidade || "un";
  return { key: `${primeira}|${un}`, label: `${label} (${un})` };
}

// Rev. 2799 — similaridade por sobreposição de tokens (p/ ranquear sugestões de match na Leitura IA).
function _iaTokens(s: string): string[] {
  return normalizarTexto(s || "").split(/\s+/).filter(t => t.length >= 2);
}
function scoreSimilaridadeIA(a: string, b: string): number {
  const ta = _iaTokens(a), tb = _iaTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta), setB = new Set(tb);
  let inter = 0;
  setA.forEach(t => { if (setB.has(t)) inter++; });
  const union = new Set([...ta, ...tb]).size;
  let score = union > 0 ? inter / union : 0;
  const na = normalizarTexto(a), nb = normalizarTexto(b);
  if (na && nb && (na.includes(nb) || nb.includes(na))) score += 0.3;
  return score;
}

// Rev. 2799 — combobox com busca p/ vincular/trocar o item da cotação numa linha lida pela IA.
// `descricaoFornecedor` ranqueia as sugestões mais parecidas no topo (★).
function ItemMatchCombobox({ itens, value, onChange, descricaoFornecedor, duplicado }: {
  itens: any[];
  value: number | null;
  onChange: (id: number | null) => void;
  descricaoFornecedor: string;
  duplicado?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selecionado = value != null ? itens.find((it: any) => it.id === value) : null;
  const ordenados = React.useMemo(() => {
    const arr = itens.map((it: any) => ({ it, score: scoreSimilaridadeIA(descricaoFornecedor, it.descricao || "") }));
    arr.sort((a, b) => b.score - a.score);
    return arr;
  }, [itens, descricaoFornecedor]);
  const topSugestoes = new Set(ordenados.filter(o => o.score > 0.05).slice(0, 3).map(o => o.it.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center justify-between gap-1 h-7 px-2 rounded border text-left text-[11px] transition-colors ${
            duplicado ? "border-red-300 bg-red-50 text-red-700" :
            selecionado ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" :
            "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}
          title={selecionado ? selecionado.descricao : "Vincular a um item da cotação"}
        >
          <span className="truncate">{selecionado ? selecionado.descricao : "Vincular item..."}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[360px] z-[10000]" align="start">
        <Command filter={(val, search) => {
          const s = normalizarTexto(search);
          return normalizarTexto(val).includes(s) ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar item por descrição ou código..." className="text-xs" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            {value != null && (
              <CommandGroup>
                <CommandItem
                  value="__remover__ remover vínculo desvincular"
                  onSelect={() => { onChange(null); setOpen(false); }}
                  className="text-red-600 gap-2"
                >
                  <X className="h-3.5 w-3.5" /> Remover vínculo
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {ordenados.map(({ it }: any) => (
                <CommandItem
                  key={it.id}
                  value={`${it.descricao ?? ""} ${it.insumoCodigo ?? ""} #${it.id}`}
                  onSelect={() => { onChange(it.id); setOpen(false); }}
                  className="gap-2 text-xs"
                >
                  {topSugestoes.has(it.id) ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="flex-1 truncate">{it.descricao}</span>
                  {it.id === value && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
      setObservacaoDebito("");
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
  const [observacaoDebito, setObservacaoDebito] = useState("");
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

  const valorDebitoNum = parseFloat(valorDebito.replace(/\./g, "").replace(",", ".")) || 0;

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
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorDebito}
                  onChange={e => setValorDebito(e.target.value)}
                  placeholder={`Máx. ${fmt(debitarMax)}`}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-orange-300 rounded bg-white outline-none focus:ring-1 focus:ring-orange-400"
                />
              </div>
              <Button size="sm" variant="ghost"
                onClick={() => setValorDebito(debitarMax.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                className="h-7 text-xs text-orange-700 hover:bg-orange-100 whitespace-nowrap">
                Usar tudo
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={observacaoDebito}
                onChange={e => setObservacaoDebito(e.target.value)}
                placeholder={`Observação (padrão: Débito automático — Cotação #${cotacaoId})`}
                className="flex-1 px-2.5 py-1.5 text-xs border border-orange-200 rounded bg-white outline-none focus:ring-1 focus:ring-orange-400 text-gray-700 placeholder:text-gray-400"
              />
              <Button size="sm" disabled={valorDebitoNum <= 0 || valorDebitoNum > debitarMax + 0.01 || debitarRisco.isPending}
                onClick={() => debitarRisco.mutate({ companyId, obraId, orcamentoId: risco.orcamentoId!, cotacaoId, valor: valorDebitoNum, deficit, observacao: observacaoDebito.trim() || `Débito automático — Cotação #${cotacaoId}` })}
                className="h-7 bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1 whitespace-nowrap">
                {debitarRisco.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Debitar do Risco
              </Button>
            </div>
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
                    <div className="text-[10px] text-gray-400">{h.data ? new Date(h.data).toLocaleDateString("pt-BR") : "—"} · {formatNumeroCotacaoDisplay(h.numeroCotacao) || formatNumeroOcDisplay(h.numeroOc) || "—"}</div>
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
          <Link2 className="h-2 w-2" />{formatNumeroScDisplay(scNumero)}
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

// Rev. 2091 — Modal "Transferir do Estoque" usado quando o vencedor da cotação é o Almoxarifado.
// Substitui o flow direto: pergunta de QUAL obra/almoxarifado vai sair o material antes de baixar.
// Mostra os itens da SC + saldo na obra-origem escolhida + flag de insuficiência por item.
function TransferenciaEstoqueDialog({
  open, onOpenChange, companyId, obraDestinoId, obraDestinoNome,
  itensSC, respostaMap, obras, obraOrigemId, onChangeObraOrigem, onConfirmar, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  obraDestinoId: number | null;
  obraDestinoNome: string | null;
  itensSC: any[];
  respostaMap: Record<string, { almoxarifadoItemId?: number | null }> | undefined;
  obras: any[];
  obraOrigemId: number | null | undefined;
  onChangeObraOrigem: (v: number | null | undefined) => void;
  onConfirmar: () => void;
  isPending: boolean;
}) {
  // Carrega itens do almox da obra origem selecionada (null = central).
  const almoxQ = trpc.compras.listarItens.useQuery(
    { companyId, obraId: obraOrigemId === undefined ? undefined : obraOrigemId },
    { enabled: open && obraOrigemId !== undefined && companyId > 0 },
  );

  const norm = (x: string | null | undefined) => (x ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  const findAlmox = (descricao: string, codigo?: string | null) => {
    const list = almoxQ.data ?? [];
    const c = norm(codigo);
    if (c) {
      const byCodigo = list.find((a: any) => norm(a.codigoInterno) === c);
      if (byCodigo) return byCodigo;
    }
    const d = norm(descricao);
    let m = list.find((a: any) => norm(a.nome) === d);
    if (m) return m;
    if (d.length >= 4) {
      m = list.find((a: any) => norm(a.nome).includes(d) || d.includes(norm(a.nome))) ?? null;
    }
    return m ?? null;
  };

  const obrasSorted = [...(obras ?? [])].sort((a, b) =>
    String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" })
  );

  const linhas = (itensSC ?? []).map((it: any) => {
    const qtdPedida = parseFloat(String(it.quantidade ?? it.metaQtd ?? "0")) || 0;
    // Rev. 2091 — Backend ignora itens com qty <= 0 no plano de baixa; espelhar aqui pra
    // não bloquear o "Confirmar" por linha que o backend nem vai processar.
    const ignorado = qtdPedida <= 0;
    const almoxSelecionadoId = respostaMap?.[`${it.id}_0`]?.almoxarifadoItemId ?? null;
    // Para uma seleção explícita, nunca refaz o vínculo por texto: o ID do
    // card escolhido é a fonte de verdade. O fallback mantém cotações antigas.
    const match = obraOrigemId !== undefined && !ignorado
      ? (almoxSelecionadoId
          ? (almoxQ.data ?? []).find((a: any) => a.id === almoxSelecionadoId) ?? null
          : findAlmox(it.descricao ?? "", it.insumoCodigo))
      : null;
    const saldo = match ? parseFloat(String(match.quantidadeAtual ?? "0")) || 0 : null;
    const insuficiente = !ignorado && saldo !== null && saldo + 1e-6 < qtdPedida;
    const semMatch = !ignorado && obraOrigemId !== undefined && !match;
    return { id: it.id, descricao: it.descricao ?? `Item #${it.id}`, unidade: it.unidade ?? "un", qtdPedida, saldo, insuficiente, semMatch, ignorado };
  });

  const totalErros = linhas.filter(l => l.insuficiente || l.semMatch).length;
  const podeConfirmar = obraOrigemId !== undefined && linhas.length > 0 && totalErros === 0 && !almoxQ.isLoading;

  const labelOrigem = obraOrigemId === undefined
    ? null
    : obraOrigemId === null
      ? "Almoxarifado Central"
      : (obras.find((o: any) => o.id === obraOrigemId)?.nome ?? `Obra #${obraOrigemId}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-gray-200" style={{ background: "#fff", color: "#111827" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <ArrowLeftRight className="h-5 w-5 text-violet-600" /> Transferir do Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destino (readonly) + Origem (select) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Destino (obra da SC)
              </div>
              <div className="mt-1 text-sm font-medium text-gray-900">
                {obraDestinoNome ?? (obraDestinoId ? `Obra #${obraDestinoId}` : "— Sem obra vinculada —")}
              </div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <label className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold flex items-center gap-1">
                <Warehouse className="h-3 w-3" /> Origem (sai daqui)
              </label>
              <select
                className="mt-1 w-full bg-white border border-violet-300 rounded-md px-2 py-1.5 text-sm text-gray-900"
                value={obraOrigemId === undefined ? "" : obraOrigemId === null ? "central" : String(obraOrigemId)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") onChangeObraOrigem(undefined);
                  else if (v === "central") onChangeObraOrigem(null);
                  else onChangeObraOrigem(parseInt(v));
                }}
              >
                <option value="">— Selecione a obra de origem —</option>
                <option value="central">Almoxarifado Central</option>
                {obrasSorted.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista de itens com saldo */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Itens da SC ({linhas.length})</span>
              {obraOrigemId !== undefined && (
                <span className="text-xs text-gray-500">
                  {almoxQ.isLoading ? "Carregando saldos..." : labelOrigem ? `Saldos em: ${labelOrigem}` : ""}
                </span>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {linhas.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500 text-center">Nenhum item nesta cotação.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Item</th>
                      <th className="px-3 py-1.5 text-right whitespace-nowrap">Pedido</th>
                      <th className="px-3 py-1.5 text-right whitespace-nowrap">Saldo na origem</th>
                      <th className="px-3 py-1.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{l.descricao}</td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{l.qtdPedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {l.unidade}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {obraOrigemId === undefined
                            ? <span className="text-gray-400">—</span>
                            : almoxQ.isLoading
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin inline text-gray-400" />
                              : l.saldo === null
                                ? <span className="text-amber-600">sem cadastro</span>
                                : <span className={l.insuficiente ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold"}>{l.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {obraOrigemId === undefined ? <span className="text-gray-300 text-xs">—</span>
                            : almoxQ.isLoading ? <span className="text-gray-300 text-xs">…</span>
                            : l.semMatch ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold"><AlertTriangle className="h-3 w-3" />sem item</span>
                            : l.insuficiente ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold"><XCircle className="h-3 w-3" />insuficiente</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold"><CheckCircle className="h-3 w-3" />ok</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {obraOrigemId !== undefined && !almoxQ.isLoading && totalErros > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                {totalErros} item(ns) sem saldo suficiente ou sem cadastro nessa origem. Escolha outra obra de origem ou ajuste o cadastro do almoxarifado.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button
            onClick={onConfirmar}
            disabled={!podeConfirmar || isPending}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
            Confirmar Transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rev. 2669 — Wrapper do detalhe/mapa definido em ESCOPO DE MÓDULO (referência
// estável). Antes era criado DENTRO do render de Cotacoes (componente inline novo
// a cada render); como cada tecla digitada no grid de preços dispara setEditPrecos
// → re-render → nova função Wrapper → React via novo "tipo" de componente e
// DESMONTAVA/REMONTAVA toda a subárvore (incluindo o container `overflow-auto`),
// resetando o scroll pro topo e perdendo o foco do input ("cursor sobe").
const DetalheWrapper: React.FC<{ fullscreen: boolean; children: React.ReactNode }> = ({ fullscreen, children }) =>
  fullscreen
    ? <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">{children}</div>
    : <DashboardLayout>{children}</DashboardLayout>;

export default function Cotacoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";
  const { confirm, ConfirmDialog } = useConfirm();

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroObraId, setFiltroObraId] = useState("");
  // Rev. 2298 — filtro por tipo (material/servico/pacote/equipamento)
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "material" | "servico" | "pacote" | "equipamento">("todos");
  // Rev. 4016 — Item 17: filtro dedicado por período de CRIAÇÃO da cotação
  // (antes só existia filtro comum de período em dashboards, não na lista).
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  // Rev. 2487 — Ordenação clicável por coluna na tabela de Cotações.
  type CotSortKey = "criadoEm" | "numeroCotacao" | "descricao" | "obra" | "fornecedor" | "total" | "validade" | "status";
  const [sortKey, setSortKey] = useState<CotSortKey>("criadoEm");
  // Rev. 5100 — toggle Meta × Melhor preço na lista (análise diária)
  const [mostrarMeta, setMostrarMeta] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [buscaDebounced, setBuscaDebounced] = useState("");
  // Rev. 5200 — gate do filtro de obra: só busca o catálogo de obras quando o
  // usuário interage com o dropdown (mantém a abertura da tela sem catálogos).
  const [obraFiltroAberto, setObraFiltroAberto] = useState(false);
  function toggleSort(k: CotSortKey) {
    setPagina(1);
    if (sortKey === k) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(["numeroCotacao", "total", "validade"].includes(k) ? "desc" : "asc");
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaDebounced(busca.trim());
      setPagina(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [busca]);
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    setPagina(1);
    setSelectedIds(new Set());
  }, [companyId, filtroStatus, filtroObraId, filtroTipo, filtroDataInicio, filtroDataFim]);
  const [confirmExcluirLote, setConfirmExcluirLote] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"detalhes" | "mapa">("detalhes");
  const [showCancelarAprovacao, setShowCancelarAprovacao] = useState(false);
  const [showGerarOCModeDialog, setShowGerarOCModeDialog] = useState(false);
  const [pendingGerarOCParams, setPendingGerarOCParams] = useState<{ cotacaoId: number; autorizacaoSemVerba?: { adminId: number; adminNome: string; justificativa: string } } | null>(null);
  const [vencedorPorItem, setVencedorPorItem] = useState<Record<number, number>>({});
  const [mapaItemsChecked, setMapaItemsChecked] = useState<Set<number>>(new Set());
  const [atribuirFornId, setAtribuirFornId] = useState<string>("");
  const [showConfirmarTipoCotDialog, setShowConfirmarTipoCotDialog] = useState(false);
  const [showFechamentoParcialDialog, setShowFechamentoParcialDialog] = useState(false);
  const [fechamentoParcialItens, setFechamentoParcialItens] = useState<{ itemId: number; fornecedorId: number; incluir: boolean; descricao: string }[]>([]);
  const [showValidacaoErroDialog, setShowValidacaoErroDialog] = useState(false);
  const [validacaoErroInfo, setValidacaoErroInfo] = useState<{ titulo: string; mensagem: string; irParaMapa?: boolean } | null>(null);
  // Rev. 2091 — Modal "Transferir do Estoque" (substitui o flow direto quando o vencedor é o Almoxarifado).
  // Usa pendingGerarOCParams como bridge — após escolher a obra de origem, dispara gerarOC com obraOrigemId.
  const [showTransferenciaDialog, setShowTransferenciaDialog] = useState(false);
  // obraOrigemId: null = "Almoxarifado Central" (obra_id IS NULL); número = obra específica; undefined = ainda não escolhido.
  const [transfObraOrigemId, setTransfObraOrigemId] = useState<number | null | undefined>(undefined);
  // Rev. 2806 — Cotação parcial: modal "Dividir cotação" (move itens p/ nova cotação).
  const [showDividirModal, setShowDividirModal] = useState(false);
  // Rev. 4014 — Map<itemId, quantidade a mover>; default ao marcar = quantidade total do item.
  const [dividirSel, setDividirSel] = useState<Map<number, number>>(new Map());

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
  // Rev. 4016 — Item 22: seleção múltipla de fornecedores via checkbox
  // (antes só dava pra incluir 1 fornecedor real por vez na cotação).
  const [mapaFornMultiIds, setMapaFornMultiIds] = useState<Set<number>>(new Set());
  const [addingFornMulti, setAddingFornMulti] = useState(false);
  // Cadastro de fornecedor sem sair da cotação (modal compartilhado)
  const [showNovoForn, setShowNovoForn] = useState(false);
  const [novoFornInitial, setNovoFornInitial] = useState<{ razaoSocial?: string } | undefined>(undefined);
  const [editPrecos, setEditPrecos] = useState<Record<string, string>>({});
  const [editMatMdo, setEditMatMdo] = useState<Record<string, { mat: string; mdo: string }>>({});
  const [editTotaisOverride, setEditTotaisOverride] = useState<Record<string, number>>({});
  const [editQtds, setEditQtds] = useState<Record<string, string>>({});
  const [editPrazo, setEditPrazo] = useState<Record<number, string>>({});
  const [editCondPag, setEditCondPag] = useState<Record<number, string>>({});
  const [editTipoPag, setEditTipoPag] = useState<Record<number, string>>({});
  const [editFreteTipo, setEditFreteTipo] = useState<Record<number, string>>({});
  const [editFormaPag, setEditFormaPag] = useState<Record<number, string>>({});
  const [editCartaoId, setEditCartaoId] = useState<Record<number, number | null>>({});
  const [condModalFornId, setCondModalFornId] = useState<number | null>(null);
  const [condModo, setCondModo] = useState<Record<number, "padrao" | "custom" | "fechamento">>({});
  // Rev. 4073 — quando o fornecedor tem ciclo cadastrado (ou regra especial por produto), a
  // condição de pagamento é travada; esse toggle libera edição livre como uma exceção rastreável.
  const [editExcecaoManual, setEditExcecaoManual] = useState<Record<number, boolean>>({});
  // Rev. 1996 — MDO pura: usuário escolhe explicitamente entre "medicao" (>30d) ou "parcelado" (≤30d).
  const [mdoTab, setMdoTab] = useState<Record<number, "" | "medicao" | "parcelado">>({});
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
  // Rev. 5012 — prazo do contrato definido nas Condições: início da mobilização + duração (dias)
  const [editMobilizacaoData, setEditMobilizacaoData] = useState<Record<number, string>>({});
  const [editDuracaoDias, setEditDuracaoDias] = useState<Record<number, string>>({});
  // Rev. 4284 — Adiantamento e Retenção de Garantia
  const [editAdiantamentoAtivo, setEditAdiantamentoAtivo] = useState<Record<number, boolean>>({});
  const [editAdiantamentoTipo, setEditAdiantamentoTipo] = useState<Record<number, string>>({});
  const [editAdiantamentoPct, setEditAdiantamentoPct] = useState<Record<number, string>>({});
  const [editAdiantamentoValorFixo, setEditAdiantamentoValorFixo] = useState<Record<number, string>>({});
  const [editAdiantamentoPrazoDias, setEditAdiantamentoPrazoDias] = useState<Record<number, string>>({});
  const [editAdiantamentoAmortizacao, setEditAdiantamentoAmortizacao] = useState<Record<number, string>>({});
  const [editAdiantamentoParcelasN, setEditAdiantamentoParcelasN] = useState<Record<number, string>>({});
  const [editRetencaoAtiva, setEditRetencaoAtiva] = useState<Record<number, boolean>>({});
  const [editRetencaoPct, setEditRetencaoPct] = useState<Record<number, string>>({});
  const [editRetencaoLiberacao, setEditRetencaoLiberacao] = useState<Record<number, string>>({});
  const [editingFornId, setEditingFornId] = useState<number | null>(null);
  // Rev. 5132 — grupo (opcional) = negociar só uma região/trecho do mapa
  // Rev. 5135 — itemIds (opcional) = negociar só os itens SELECIONADOS (checkbox)
  const [negociadoModal, setNegociadoModal] = useState<{ fornecedorId: number; grupo?: string; itemIds?: number[]; label?: string } | null>(null);
  const [negociadoValor, setNegociadoValor] = useState("");
  const [negociadoPreviewing, setNegociadoPreviewing] = useState(false);
  // Rev. 5134 — recolher/expandir regiões (grupos de EAP) no mapa
  const [collapsedGrupos, setCollapsedGrupos] = useState<Set<string>>(new Set());
  // Rev. 4245 — editar/excluir/incluir item na cotação
  const [editItemDialog, setEditItemDialog] = useState<{ id: number; descricao: string; unidade: string; quantidade: string; somenteMo: boolean } | null>(null);
  const [addItemDialog, setAddItemDialog] = useState(false);
  const [addItemForm, setAddItemForm] = useState({ descricao: "", unidade: "un", quantidade: "1", somenteMo: false });
  // Rev. 4250 — busca/filtro no mapa + picker de itens da EAP
  const [mapaFiltro, setMapaFiltro] = useState("");
  // Rev. 5084 — filtro clicável nos cards de Cobertura do Orçamento (total/parcial/sem)
  const [coberturaFiltro, setCoberturaFiltro] = useState<"total" | "parcial" | "sem" | null>(null);
  // Rev. 5090 — expandir/recolher etapas (EAP) na lista de Itens do detalhe
  const [detalheGruposFechados, setDetalheGruposFechados] = useState<Record<string, boolean>>({});
  const [eapPickerOpen, setEapPickerOpen] = useState(false);
  const [eapPickerSearch, setEapPickerSearch] = useState("");
  const [eapPickerSelected, setEapPickerSelected] = useState<Set<number>>(new Set());
  // Rev. 5071 — poka-yoke: dialog quando o item já está em SC/cotação/contratado
  const [eapFaseDialog, setEapFaseDialog] = useState<any>(null);
  const [showGerenciarCond, setShowGerenciarCond] = useState(false);
  const [novaCondicao, setNovaCondicao] = useState("");
  const [anexoUrl, setAnexoUrl] = useState<Record<number, string>>({});
  const [showAnexoInput, setShowAnexoInput] = useState<number | null>(null);
  const [anexoDragForn, setAnexoDragForn] = useState<number | null>(null);
  const [localItensEmOC, setLocalItensEmOC] = useState<number[]>([]);
  const itensPendentesOCRef = useRef<number[]>([]);
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
  // Rev. 5096 — filtro clicável dos cards da Conferência IA
  const [iaFiltroStatus, setIaFiltroStatus] = useState<null | "ok" | "parcial" | "excedente" | "sem_vinculo">(null);
  const [iaFileBuffer, setIaFileBuffer] = useState<{ fornecedorId: number; base64: string; fileName: string; mimeType: string } | null>(null);
  const [iaTipoProposta, setIaTipoProposta] = useState<"complemento" | "revisao">("complemento");
  const [iaProgress, setIaProgress] = useState<{ fornecedorId: number; percent: number; etapa: string } | null>(null);
  const iaProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [iaJobId, setIaJobId] = useState<string | null>(null);
  const [iaPollingFornId, setIaPollingFornId] = useState<number | null>(null);
  const [showPropostas, setShowPropostas] = useState<number | null>(null);
  // Rev. 2799 — linhas editáveis da Conferência IA (match/preço/qtd livres por linha).
  const [iaLinhas, setIaLinhas] = useState<any[]>([]);
  const [iaDescontoPct, setIaDescontoPct] = useState<number>(0);
  useEffect(() => {
    if (!iaExtracao) { setIaLinhas([]); setIaDescontoPct(0); return; }
    const arr = (iaExtracao.dados?.itensExtraidos ?? []).map((it: any, idx: number) => ({
      key: `l${idx}`,
      descricaoFornecedor: it.descricaoFornecedor ?? "",
      quantidade: it.quantidade ?? null,
      precoUnitario: it.precoUnitario ?? null,
      unidade: it.unidade ?? null,
      matchItemId: it.matchItemId ?? null,
      matchConfianca: it.matchConfianca ?? null,
      distribuido: !!it.distribuido,
      totalMat: it.totalMat ?? null,
      totalMdo: it.totalMdo ?? null,
    }));
    setIaLinhas(arr);
  }, [iaExtracao]);
  const setIaLinha = useCallback((key: string, patch: Record<string, any>) => {
    setIaLinhas(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  }, []);

  const [editFornId, setEditFornId] = useState<number | null>(null);
  const [editFornForm, setEditFornForm] = useState({
    cnpj: "", razaoSocial: "", nomeFantasia: "",
    endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
    telefone: "", email: "", contatoNome: "", contatoCelular: "", contatoEmail: "",
    banco: "", agencia: "", conta: "", pix: "", observacoes: "",
  });
  const editFornMut = trpc.compras.atualizarFornecedor.useMutation({
    onSuccess: () => { mapaQ.refetch(); fornQ.refetch(); setEditFornId(null); toast.success("Fornecedor atualizado!"); },
  });
  function maskFornPhone(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }
  function openEditForn(fornId: number) {
    const f = fornecedores.find((ff: any) => ff.id === fornId) || (mapa?.participantes ?? []).find((p: any) => p.fornecedorId === fornId)?.fornecedor;
    if (!f) { toast.error("Fornecedor não encontrado"); return; }
    setEditFornForm({
      cnpj: f.cnpj ?? "", razaoSocial: f.razaoSocial ?? "", nomeFantasia: f.nomeFantasia ?? "",
      endereco: f.endereco ?? "", numero: f.numero ?? "", complemento: f.complemento ?? "",
      bairro: f.bairro ?? "", cidade: f.cidade ?? "", estado: f.estado ?? "", cep: f.cep ?? "",
      telefone: maskFornPhone(f.telefone ?? ""), email: f.email ?? "",
      contatoNome: f.contatoNome ?? "", contatoCelular: maskFornPhone(f.contatoCelular ?? ""), contatoEmail: f.contatoEmail ?? "",
      banco: f.banco ?? "", agencia: f.agencia ?? "", conta: f.conta ?? "", pix: f.pix ?? "",
      observacoes: f.observacoes ?? "",
    });
    setEditFornId(f.id);
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
      setRegimeCustoSel("empresa_com_risco"); setShowRegimeInfo(null);
    }
  }, [showDetalhe]);

  // Rev. 5200 — Abertura rápida (task #195): a lista pede SÓ a janela paginada de
  // linhas; o resumo (total/contadores) e o enriquecimento (meta × melhor preço)
  // só disparam DEPOIS que a lista carregou, e os catálogos de criação/edição
  // (solicitações, fornecedores, obras, condições) ficam atrás de gates de diálogo.
  const listaFiltros = React.useMemo(() => ({
    companyId,
    status: filtroStatus !== "todos" ? filtroStatus : undefined,
    search: buscaDebounced || undefined,
    obraId: filtroObraId ? parseInt(filtroObraId) : undefined,
    tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
    dataInicio: filtroDataInicio || undefined,
    dataFim: filtroDataFim || undefined,
  }), [companyId, filtroStatus, buscaDebounced, filtroObraId, filtroTipo, filtroDataInicio, filtroDataFim]);
  const q = trpc.compras.listarCotacoes.useQuery(
    {
      ...listaFiltros,
      page: pagina,
      pageSize: 50,
      sortKey,
      sortDir,
    },
    { enabled: companyId > 0 }
  );
  // Rev. 5200 — resumo (total + contadores) roda em paralelo mas SEM segurar as
  // linhas: só habilita depois que a lista carregou com sucesso (não no mesmo lote).
  const listaCarregou = q.isSuccess && !!q.data;
  // Rev. 5200 — timing focado e não intrusivo (Performance API): mede quanto o
  // primeiro lote de linhas levou para chegar. Falha silenciosa se a API não existir.
  const perfMarkedRef = React.useRef(false);
  React.useEffect(() => {
    if (listaCarregou && !perfMarkedRef.current && typeof performance !== "undefined" && typeof performance.mark === "function") {
      perfMarkedRef.current = true;
      try {
        performance.mark("cotacoes:lista-carregada");
        performance.measure("cotacoes:abertura", { start: 0, end: "cotacoes:lista-carregada" } as any);
      } catch { /* no-op */ }
    }
  }, [listaCarregou]);
  const resumoQ = trpc.compras.resumoCotacoes.useQuery(
    listaFiltros,
    { enabled: companyId > 0 && listaCarregou }
  );
  // Rev. 5200 — enriquecimento (meta × melhor preço) apenas das linhas visíveis,
  // disparado após a lista carregar. Chave estável nos ids visíveis.
  const cotacaoIdsVisiveis = React.useMemo(
    () => (q.data?.items ?? []).map((it: any) => it.id as number),
    [q.data?.items]
  );
  const enriquecerQ = trpc.compras.enriquecerCotacoesLista.useQuery(
    { companyId, cotacaoIds: cotacaoIdsVisiveis },
    { enabled: companyId > 0 && listaCarregou && cotacaoIdsVisiveis.length > 0 }
  );
  // Rev. 5200 — mapa id → dados de enriquecimento (meta/melhor preço) para merge
  // sem perder as linhas já exibidas. Backend retorna items como Record<id, {...}>.
  const enriquecerMap = React.useMemo(() => {
    const m = new Map<number, any>();
    const rows = (enriquecerQ.data as any)?.items ?? (enriquecerQ.data as any) ?? [];
    if (Array.isArray(rows)) {
      for (const r of rows) if (r && r.id != null) m.set(r.id as number, r);
    } else if (rows && typeof rows === "object") {
      for (const [k, v] of Object.entries(rows)) m.set(Number(k), v);
    }
    return m;
  }, [enriquecerQ.data]);
  // Rev. 5200 — após qualquer escrita que possa afetar uma cotação, o resumo e o
  // enriquecimento da página precisam recarregar. IDs iguais não bastam para o cache:
  // preço, itens e participantes podem mudar sem alterar a página visível.
  const refetchResumo = React.useCallback(() => { if (resumoQ.isFetched) resumoQ.refetch(); }, [resumoQ.isFetched]);
  const refetchEnriquecimento = React.useCallback(() => { if (enriquecerQ.isFetched) enriquecerQ.refetch(); }, [enriquecerQ.isFetched]);
  const refetchListaDerivados = React.useCallback(() => {
    refetchResumo();
    refetchEnriquecimento();
  }, [refetchResumo, refetchEnriquecimento]);
  const detalheQ = trpc.compras.getCotacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  // Rev. 2806 — Cobertura da SC (cotações irmãs + itens pendentes) p/ navegação e "cotar restantes".
  const detalheScId = (detalheQ.data as any)?.solicitacaoId as number | null | undefined;
  const coberturaScQ = trpc.compras.getCoberturaSolicitacao.useQuery(
    { solicitacaoId: detalheScId! },
    { enabled: showDetalhe !== null && !!detalheScId }
  );
  const dividirCotacao = trpc.compras.dividirCotacao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Cotação dividida! ${data.movidos} ${data.movidos === 1 ? "item movido" : "itens movidos"} para ${data.nova.numeroCotacao}.`);
      setShowDividirModal(false);
      setDividirSel(new Map());
      detalheQ.refetch(); mapaQ.refetch(); q.refetch(); coberturaScQ.refetch(); refetchListaDerivados();
    },
    onError: (e) => toast.error(e.message),
  });
  const cotarRestantes = trpc.compras.cotarItensRestantes.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Nova cotação ${data.nova.numeroCotacao} criada com ${data.itens} ${data.itens === 1 ? "item restante" : "itens restantes"}.`);
      coberturaScQ.refetch(); q.refetch(); refetchListaDerivados();
      setShowDetalhe(data.nova.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelarDivisao = trpc.compras.cancelarDivisaoCotacao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Divisão cancelada! ${data.devolvidos} ${data.devolvidos === 1 ? "item devolvido" : "itens devolvidos"} para ${data.originalNumero}.`);
      q.refetch(); coberturaScQ.refetch(); refetchListaDerivados();
      setShowDetalhe(data.originalId);
    },
    onError: (e) => toast.error(e.message),
  });
  const mapaQ = trpc.compras.getMapaCotacao.useQuery(
    { cotacaoId: showDetalhe! },
    { enabled: showDetalhe !== null && abaAtiva === "mapa" }
  );
  const mapaItens = mapaQ.data?.itens ?? [];
  // Rev. 4258 — memoizar arrays para evitar chave de query instável a cada render
  const mapaDescricoes = React.useMemo(
    () => (mapaQ.data?.itens ?? []).map((it: any) => it.descricao as string).filter(Boolean),
    [mapaQ.data?.itens]
  );
  const mapaInsumoCodigos = React.useMemo(
    () => (mapaQ.data?.itens ?? []).map((it: any) => it.insumoCodigo as string).filter(Boolean),
    [mapaQ.data?.itens]
  );
  const sugestoesRecompraQ = trpc.compras.getSugestoesFornecedoresRecompra.useQuery(
    { companyId, descricoes: mapaDescricoes, insumoCodigos: mapaInsumoCodigos.length > 0 ? mapaInsumoCodigos : undefined },
    { enabled: companyId > 0 && (mapaDescricoes.length > 0 || mapaInsumoCodigos.length > 0) && showDetalhe !== null && abaAtiva === "mapa" }
  );
  const novaDescricoes = itens.map(i => i.descricao).filter(d => d.trim().length >= 3);
  const novaSugestoesQ = trpc.compras.getSugestoesFornecedoresRecompra.useQuery(
    { companyId, descricoes: novaDescricoes },
    { enabled: companyId > 0 && novaDescricoes.length > 0 && showNova }
  );
  const mapaFornIds = React.useMemo(
    () => (mapaQ.data?.participantes ?? []).map((p: any) => p.fornecedorId),
    [mapaQ.data?.participantes]
  );
  const scoresQ = trpc.compras.scoresFornecedoresLote.useQuery(
    { fornecedorIds: mapaFornIds, companyId },
    { enabled: mapaFornIds.length > 0 && abaAtiva === "mapa" }
  );
  // Rev. 4258 — pré-computar melhor preço por item (evita O(n×m) no loop de render)
  const melhorPrecoMap = React.useMemo(() => {
    const map = new Map<number, number>();
    const data = mapaQ.data;
    if (!data || data.participantes.length === 0) return map;
    for (const it of (data.itens ?? [])) {
      const precos: number[] = [];
      for (const p of data.participantes) {
        const r = data.respostaMap[`${it.id}_${p.fornecedorId}`];
        if (r) {
          const v = parseFloat((r as any).precoUnitario ?? "0");
          if (v > 0) precos.push(v);
        }
      }
      if (precos.length > 0) map.set(it.id, Math.min(...precos));
    }
    return map;
  }, [mapaQ.data]);
  // Rev. 4258 — filtrar e agrupar itens do mapa UMA vez (useMemo); evita IIFE de 812 itens a cada render
  const itensParaRenderizarMemo = React.useMemo(() => {
    const data = mapaQ.data;
    let rawItensBase = mapaFiltro
      ? (data?.itens ?? []).filter((it: any) => (it.descricao ?? "").toLowerCase().includes(mapaFiltro.toLowerCase()))
      : (data?.itens ?? []);
    // Rev. 5084 — filtro por classificação de cobertura (mesma regra dos cards):
    // total = solicitado ≥ orçado; parcial = 0 < solicitado < orçado; sem = solicitado 0.
    if (coberturaFiltro) {
      rawItensBase = rawItensBase.filter((it: any) => {
        const orc = Number((it as any).qtdOrcada ?? 0);
        if (!(orc > 0)) return false;
        const sol = Number((it as any).qtdTotalSolicitada ?? 0);
        // Rev. 5086 — mesma tolerância de arredondamento dos cards (SC 3 casas × orçamento 4)
        const cobre = sol >= orc - Math.max(orc * 0.001, 0.01);
        if (coberturaFiltro === "total") return cobre;
        if (coberturaFiltro === "parcial") return sol > 0 && !cobre;
        return sol <= 0;
      });
    }
    // Rev. 5069 — ordenar pela numeração da planilha orçamentária (eapCodigo, ex.: 3.1.2),
    // do menor pro maior, comparando segmento a segmento. Sem código = vai pro fim (ordem original).
    const eapKey = (it: any): number[] | null => {
      const cod = String(it.eapCodigo ?? "").trim();
      if (!cod) return null;
      const segs = cod.split(/[^0-9]+/).filter(Boolean).map(Number);
      return segs.length ? segs : null;
    };
    const rawItens = rawItensBase.map((it: any, i: number) => ({ it, i, k: eapKey(it) }))
      .sort((a: any, b: any) => {
        if (a.k && b.k) {
          const len = Math.max(a.k.length, b.k.length);
          for (let s = 0; s < len; s++) {
            const d = (a.k[s] ?? 0) - (b.k[s] ?? 0);
            if (d !== 0) return d;
          }
          return a.i - b.i;
        }
        if (a.k) return -1;
        if (b.k) return 1;
        return a.i - b.i;
      })
      .map((x: any) => x.it);
    const isPacote = ((data as any)?.tipoEfetivo ?? data?.cotacao?.tipo) === "pacote";
    if (isPacote) {
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
    }
    if (agruparItens) {
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
    }
    return rawItens;
  }, [mapaQ.data, mapaFiltro, coberturaFiltro, agruparItens]);
  // Rev. 5200 — catálogos de criação/edição só carregam quando o diálogo/aba que os
  // usa está aberto (task #195). Os gates cobrem: modal de criação (showNova),
  // detalhe/mapa (showDetalhe/abaAtiva), gerenciador de pagamento (condModalFornId)
  // e picker/edição de fornecedor (editFornId/showNovoForn/mapaFornOpen).
  const catalogoDetalhe = showDetalhe !== null;
  const scsNecessario = companyId > 0 && showNova;
  // A página da lista já traz os nomes exibidos de fornecedor e obra. Os catálogos
  // completos ficam reservados para ações que realmente precisam das opções/detalhes.
  const fornNecessario = companyId > 0 && (showNova || catalogoDetalhe || editFornId !== null || showNovoForn || mapaFornOpen);
  const condPagNecessario = companyId > 0 && (showNova || catalogoDetalhe || condModalFornId !== null);
  // Obras completas são necessárias para o filtro e os formulários, não para desenhar
  // a página (cada linha já vem com o seu nome de obra).
  const obrasNecessario = companyId > 0 && (obraFiltroAberto || showNova || catalogoDetalhe || !!filtroObraId);
  const scsQ = trpc.compras.listarSolicitacoes.useQuery({ companyId }, { enabled: scsNecessario });
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: fornNecessario });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: obrasNecessario });
  const condPagQ = trpc.compras.listarCondicoesPagamento.useQuery({ companyId }, { enabled: condPagNecessario });
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
    onSuccess: () => { toast.success("Cotação criada!"); setShowNova(false); resetForm(); q.refetch(); refetchListaDerivados(); },
    onError: (e) => toast.error(e.message),
  });
  const gerarOC = trpc.compras.criarOrdemDeCotacao.useMutation({
    onMutate: () => {
      setAprovacaoProgress({ step: 0 });
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 1 } : p), 600);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 2 } : p), 1200);
    },
    onSuccess: (data: any) => {
      q.refetch(); detalheQ.refetch(); refetchListaDerivados(); setSemVerbaAutorizado(null);
      const tcId = data?.terceiroContratoGeradoId;
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 3 } : p), 400);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 4, redirectTo: tcId ? `/terceiros/contratos/${tcId}?tab=documento` : undefined } : p), 1000);
      if (tcId) {
        setTimeout(() => { setAprovacaoProgress(null); navigate(`/terceiros/contratos/${tcId}?tab=documento`); }, 2800);
      } else {
        setTimeout(() => { setAprovacaoProgress(null); toast.success("Ordem de Compra gerada com sucesso!"); }, 2200);
      }
    },
    onError: (e) => {
      setAprovacaoProgress(null);
      const msg = e.message ?? "";
      if (msg.includes("Condição de Pagamento") || msg.includes("Prazo de Entrega") || msg.includes("OC ativa") || msg.includes("já foi aprovada")) {
        setValidacaoErroInfo({ titulo: "Não foi possível gerar a OC", mensagem: msg, irParaMapa: msg.includes("Condição") || msg.includes("Prazo") });
        setShowValidacaoErroDialog(true);
      } else {
        toast.error(msg);
      }
    },
  });
  const gerarOCsParciais = trpc.compras.criarOCsParciais.useMutation({
    onMutate: () => {
      setAprovacaoProgress({ step: 0 });
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 1 } : p), 600);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 2 } : p), 1200);
    },
    onSuccess: (data) => {
      setLocalItensEmOC(prev => [...new Set([...prev, ...itensPendentesOCRef.current])]);
      itensPendentesOCRef.current = [];
      q.refetch(); detalheQ.refetch(); mapaQ.refetch(); refetchListaDerivados(); setSemVerbaAutorizado(null);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 3 } : p), 400);
      setTimeout(() => setAprovacaoProgress(p => p ? { ...p, step: 4 } : p), 1000);
      setTimeout(() => {
        setAprovacaoProgress(null);
        setShowFechamentoParcialDialog(false);
        setShowGerarOCModeDialog(false);
        setVencedorPorItem({});
        setMapaItemsChecked(new Set());
        setAtribuirFornId("");
        const n = data.ocsGeradas.length;
        toast.success(`${n} ${n === 1 ? "OC gerada" : "OCs geradas"} com sucesso!`);
      }, 2200);
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
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); refetchListaDerivados(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação excluída!"); q.refetch(); refetchListaDerivados(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirLote = trpc.compras.excluirCotacoesEmLote.useMutation({
    onSuccess: (res) => { toast.success(`${res.count} cotação(ões) excluída(s)!`); q.refetch(); refetchListaDerivados(); setSelectedIds(new Set()); setConfirmExcluirLote(false); },
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
  // Rev. 4998 — prévia do contrato ANTES de aprovar (pedido do user): modal com o texto
  // exatamente como sairá na geração, e só então "Aprovar e Gerar".
  const [previewContratoOpen, setPreviewContratoOpen] = useState(false);
  // Rev. 5013 — título/assunto do contrato é digitado pelo usuário antes da prévia
  // (pode ser "...para Fornecimento de Mão de Obra", "...Material e Mão de Obra" etc.)
  const [contratoTitulo, setContratoTitulo] = useState("");
  const [tituloPromptOpen, setTituloPromptOpen] = useState(false);
  const [tituloDraft, setTituloDraft] = useState("");
  // Rev. 5019 — WIZARD DE ANEXOS (poka-yoke): conduz o usuário etapa por etapa
  // (título → matriz de fornecimento → projetos por disciplina → cronograma →
  // outros documentos → revisão) antes de abrir a prévia do contrato.
  const [wizStep, setWizStep] = useState(0);
  const MATRIZ_PADRAO = ["Concreto usinado", "Aço / armação", "Telas (fibra de vidro / metálica)", "Argamassa / resina de chumbamento", "Formas e escoramento", "Andaimes / plataforma", "Ferramentas e equipamentos", "EPIs da equipe"];
  const [wizMatriz, setWizMatriz] = useState<Array<{ item: string; fornecidoPor: "CONTRATANTE" | "CONTRATADA" }>>([]);
  const [wizMatrizNovo, setWizMatrizNovo] = useState("");
  // Rev. 5020 — "não se aplica" (contrato só de mão de obra) + cópia do escopo da proposta via IA
  const [wizMatrizNA, setWizMatrizNA] = useState(false);
  const extrairMatrizIA = trpc.terceiroContratos.extrairMatrizDaProposta.useMutation();
  const [wizProjetos, setWizProjetos] = useState<Array<{ disciplina: string; arquivos: Array<{ nome: string; url: string }> }>>([]);
  const [wizCronograma, setWizCronograma] = useState<{ nome: string; url: string } | null>(null);
  const [wizOutros, setWizOutros] = useState<Array<{ titulo: string; nome: string; url: string }>>([]);
  const [wizUploading, setWizUploading] = useState(false);
  // Rev. 5053 — pedido do user (IMG_5550/5552): a proposta comercial (Anexo I)
  // agora é gerida DENTRO do wizard (ver/abrir/substituir/excluir), matando o
  // fluxo de duas telas via clipe do Mapa de Cotação.
  const wizVencedor: any = ((mapaQ.data as any)?.participantes ?? []).find((p: any) => p.selecionado) ?? null;
  const wizPropostaUrl: string | null = wizVencedor?.arquivoUrl || null;
  const wizPropostaNome: string = wizVencedor?.arquivoNome || "Proposta Comercial";
  const uploadPropostaWiz = trpc.compras.uploadAnexoFornecedor.useMutation();
  const salvarPropostaWiz = trpc.compras.salvarAnexoFornecedor.useMutation();
  const wizUploadProposta = async (file: File) => {
    if (!showDetalhe || !wizVencedor) return;
    if (!/\.(pdf|jpe?g)$/i.test(file.name)) { toast.error("A proposta deve ser PDF ou JPG."); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Arquivo acima de 15MB."); return; }
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(file); });
      await uploadPropostaWiz.mutateAsync({
        cotacaoId: showDetalhe, fornecedorId: wizVencedor.fornecedorId, companyId,
        fileBase64: b64, fileName: file.name,
        mimeType: /\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg",
      });
      toast.success("Proposta anexada!");
      mapaQ.refetch();
    } catch (e: any) { toast.error(e?.message || "Falha ao enviar a proposta"); }
  };
  // Rev. 5021 — % real de envio (0–100) via XHR upload.onprogress
  const [wizProgress, setWizProgress] = useState(0);
  const anexosContratoQ = trpc.terceiroContratos.getAnexosContrato.useQuery(
    { cotacaoId: showDetalhe ?? 0, companyId },
    { enabled: tituloPromptOpen && !!showDetalhe && companyId > 0, staleTime: 0 }
  );
  const wizHidratado = useRef(false);
  useEffect(() => {
    // hidrata UMA vez por abertura (efeito único — evita corrida de cache do RQ)
    if (!tituloPromptOpen) { wizHidratado.current = false; return; }
    if (wizHidratado.current || anexosContratoQ.data === undefined) return;
    wizHidratado.current = true;
    setWizStep(0);
    // Rev. 5020 — título sugerido automaticamente pelo tipo da cotação (o
    // usuário pode editar): MDO pura, pacote (material+MDO) ou equipamento.
    {
      const tp = String((detalheQ.data as any)?.tipo ?? "material");
      const sugestao = tp === "servico" ? "Contrato de Prestação de Serviços para Fornecimento de Mão de Obra"
        : tp === "pacote" ? "Contrato de Prestação de Serviços para Fornecimento de Material e Mão de Obra"
        : tp === "equipamento" ? "Contrato de Locação de Equipamentos"
        : "";
      // Preenche quando vazio OU quando o draft é só um título genérico/sugerido
      // (não sobrescreve texto personalizado digitado pelo usuário)
      const genericos = ["", "contrato de prestação de serviços", "contrato de prestação de serviços para fornecimento de mão de obra", "contrato de prestação de serviços para fornecimento de material e mão de obra", "contrato de locação de equipamentos"];
      if (sugestao && genericos.includes(tituloDraft.trim().toLowerCase())) setTituloDraft(sugestao);
    }
    const ax: any = anexosContratoQ.data?.anexos || null;
    const salvos: any[] = Array.isArray(ax?.matriz) ? ax.matriz : [];
    setWizMatriz(MATRIZ_PADRAO.map((item) => ({
      item, fornecidoPor: (salvos.find((s) => s.item === item)?.fornecidoPor === "CONTRATANTE" ? "CONTRATANTE" : "CONTRATADA") as "CONTRATANTE" | "CONTRATADA",
    })).concat(salvos.filter((s) => !MATRIZ_PADRAO.includes(s.item)).map((s) => ({ item: String(s.item), fornecidoPor: s.fornecidoPor === "CONTRATANTE" ? "CONTRATANTE" as const : "CONTRATADA" as const }))));
    setWizProjetos(Array.isArray(ax?.projetos) ? ax.projetos : []);
    setWizCronograma(ax?.cronograma?.url ? ax.cronograma : null);
    setWizOutros(Array.isArray(ax?.outros) ? ax.outros : []);
    // Rev. 5020 — MDO pura já entra como "não se aplica" por padrão
    setWizMatrizNA(ax ? ax.matrizNaoAplica === true : String((detalheQ.data as any)?.tipo ?? "") === "servico");
  }, [tituloPromptOpen, anexosContratoQ.data]);
  const uploadAnexoContrato = trpc.terceiroContratos.uploadAnexoContrato.useMutation();
  const salvarAnexosContrato = trpc.terceiroContratos.salvarAnexosContrato.useMutation();
  const wizUpload = async (file: File): Promise<{ nome: string; url: string } | null> => {
    if (!showDetalhe) return null;
    if (!/\.pdf$/i.test(file.name)) { toast.error("Apenas arquivos PDF são aceitos como anexo do contrato."); return null; }
    setWizUploading(true);
    setWizProgress(0);
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(file); });
      // XHR direto no endpoint tRPC p/ ter upload.onprogress (0–100% real);
      // formato do httpBatchLink+superjson: {"0":{"json":<input>}} → [{result:{data:{json:...}}}]
      const r = await new Promise<{ nome: string; url: string }>((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/trpc/terceiroContratos.uploadAnexoContrato?batch=1");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.withCredentials = true;
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setWizProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100))); };
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            const item = Array.isArray(body) ? body[0] : body;
            if (xhr.status >= 200 && xhr.status < 300 && item?.result?.data?.json?.url) {
              setWizProgress(100);
              res({ nome: item.result.data.json.nome, url: item.result.data.json.url });
            } else rej(new Error(item?.error?.json?.message || item?.error?.message || "Falha ao enviar o arquivo"));
          } catch { rej(new Error("Falha ao enviar o arquivo")); }
        };
        xhr.onerror = () => rej(new Error("Falha de conexão no envio"));
        xhr.send(JSON.stringify({ "0": { json: { cotacaoId: showDetalhe, companyId, fileBase64: b64, fileName: file.name } } }));
      });
      return r;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar o arquivo");
      return null;
    } finally { setWizUploading(false); setWizProgress(0); }
  };
  const wizConcluir = async () => {
    if (!showDetalhe || !tituloDraft.trim()) return;
    try {
      await salvarAnexosContrato.mutateAsync({
        cotacaoId: showDetalhe, companyId,
        anexos: {
          matrizNaoAplica: wizMatrizNA,
          matriz: wizMatrizNA ? [] : wizMatriz.filter((m) => m.item.trim()),
          projetos: wizProjetos.filter((p) => p.disciplina.trim() && p.arquivos.length > 0),
          cronograma: wizCronograma,
          outros: wizOutros.filter((o) => o.titulo.trim() && o.url),
        },
      });
      setContratoTitulo(tituloDraft.trim());
      setTituloPromptOpen(false);
      setPreviewContratoOpen(true);
    } catch (e: any) { toast.error(e?.message || "Falha ao salvar os anexos"); }
  };
  const previewContratoQ = trpc.terceiroContratos.previewContratoFromCotacao.useQuery(
    { cotacaoId: showDetalhe ?? 0, companyId, tituloContrato: contratoTitulo || undefined },
    { enabled: previewContratoOpen && !!showDetalhe && companyId > 0 && !!contratoTitulo.trim(), staleTime: 0 }
  );
  // Rev. 5008 — pedido do user (IMG_5523): renderiza as páginas da proposta
  // (PDF via pdfjs → canvas → dataURL; imagem → dataURL) para continuarem
  // DENTRO da prévia, após as assinaturas. null = renderizando/falhou (mostra
  // card de fallback com botão "Abrir").
  // Rev. 5021 — TODOS os anexos do wizard (proposta, projetos, cronograma,
  // outros) renderizados dentro da prévia, cada um com capa própria.
  const [anexoPreviewPages, setAnexoPreviewPages] = useState<Array<{ titulo: string; subtitulo?: string; pages: string[] }> | null>(null);
  // Rev. 5022 — logo da empresa como dataURL: o iframe sandboxed não envia o
  // cookie de sessão, então /uploads (autenticado) quebrava a imagem.
  const [contratoLogoDataUrl, setContratoLogoDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    setContratoLogoDataUrl(null);
    const logoUrl = String((previewContratoQ.data as any)?.docMeta?.empresa?.logoUrl || "");
    if (!previewContratoOpen || !logoUrl) return;
    (async () => {
      try {
        const blob = await fetch(logoUrl).then(r => { if (!r.ok) throw new Error("logo"); return r.blob(); });
        const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
        if (!cancel && dataUrl.startsWith("data:image/")) setContratoLogoDataUrl(dataUrl);
      } catch { /* fallback: URL absoluta no builder */ }
    })();
    return () => { cancel = true; };
  }, [previewContratoOpen, (previewContratoQ.data as any)?.docMeta?.empresa?.logoUrl]);
  // Rev. 5009 — spinner do botão "WhatsApp" da prévia (gera o PDF no servidor)
  const [previewPdfSharing, setPreviewPdfSharing] = useState(false);
  // Rev. 5019 — dupla checagem (IA): contrato × proposta comercial. Só alerta,
  // nunca bloqueia a aprovação (decisão comercial é do usuário).
  const analisarDivergencias = trpc.terceiroContratos.analisarDivergenciasContrato.useMutation();
  const [divergenciasPanel, setDivergenciasPanel] = useState<null | { motivo: string | null; divergencias: Array<{ tema: string; gravidade: string; contrato: string; proposta: string; recomendacao: string }> }>(null);
  // Rev. 5023 — pedido do user: progresso 0→100% durante a análise + resumo
  // completo numa tela própria ao concluir. O % é estimado (a IA não streama
  // progresso), avançando até 95% e fechando em 100% quando a resposta chega.
  const [analiseProgress, setAnaliseProgress] = useState<number | null>(null);
  const analiseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resumoAnaliseOpen, setResumoAnaliseOpen] = useState(false);
  // Rev. 5024 — chips do placar filtram a lista de divergências ao clicar.
  const [resumoFiltro, setResumoFiltro] = useState<"todas" | "alta" | "media" | "baixa">("todas");
  const pararProgressoAnalise = () => { if (analiseTimerRef.current) { clearInterval(analiseTimerRef.current); analiseTimerRef.current = null; } };
  useEffect(() => () => pararProgressoAnalise(), []);
  useEffect(() => { if (!previewContratoOpen) { setDivergenciasPanel(null); analisarDivergencias.reset(); setResumoAnaliseOpen(false); pararProgressoAnalise(); setAnaliseProgress(null); } }, [previewContratoOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancel = false;
    setAnexoPreviewPages(null);
    const pUrl = safeAnexoHref((previewContratoQ.data as any)?.propostaUrl);
    if (!previewContratoOpen || !pUrl) return;
    (async () => {
      try {
        // Rev. 5054 — lógica extraída p/ @/lib/contratoAnexoPages (reuso no ContratoDetalhe)
        const sections = await buildAnexoSections(previewContratoQ.data, () => cancel);
        if (!cancel && sections) setAnexoPreviewPages(sections);
      } catch {
        // mantém fallback: card "Abrir" abaixo da prévia
      }
    })();
    return () => { cancel = true; };
  }, [previewContratoOpen, (previewContratoQ.data as any)?.propostaUrl, (previewContratoQ.data as any)?.anexosContrato]);
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
  // Rev. 4013 — regime de custo/risco na equalização (só p/ obras "Fornecimento de MDO").
  const [regimeCustoSel, setRegimeCustoSel] = useState<"empresa_com_risco" | "empresa_sem_risco" | "cliente_paga">("empresa_com_risco");
  const [showRegimeInfo, setShowRegimeInfo] = useState<null | "empresa_com_risco" | "empresa_sem_risco" | "cliente_paga">(null);
  const REGIME_CUSTO_INFO: Record<"empresa_com_risco" | "empresa_sem_risco" | "cliente_paga", { titulo: string; ativoClasse: string; badgeClasse: string; texto: string }> = {
    cliente_paga: {
      titulo: "🔵 Cliente paga direto",
      ativoClasse: "border-blue-400 bg-blue-50 ring-1 ring-blue-300",
      badgeClasse: "bg-blue-100 text-blue-700 border-blue-300",
      texto: "O cliente paga o fornecedor diretamente (Faturamento Direto). Você só cota e separa o material. Não conta no seu orçamento nem no seu risco — nunca trava a Ordem de Compra nem pede aprovação de estouro.",
    },
    empresa_sem_risco: {
      titulo: "🟡 Empresa paga, sem risco (gestão de material)",
      ativoClasse: "border-amber-400 bg-amber-50 ring-1 ring-amber-300",
      badgeClasse: "bg-amber-100 text-amber-700 border-amber-300",
      texto: "A empresa compra e paga o fornecedor, mas repassa o valor ao cliente. Não conta no seu orçamento/BDI — nunca trava a Ordem de Compra nem pede aprovação de estouro. Use quando o material é administrado por você, mas o custo não é seu.",
    },
    empresa_com_risco: {
      titulo: "🟢 Empresa paga, com risco (custo normal)",
      ativoClasse: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300",
      badgeClasse: "bg-emerald-100 text-emerald-700 border-emerald-300",
      texto: "Compra normal da empresa: entra no seu custo, orçamento e BDI da obra, como sempre. Se estourar o orçamento previsto, pode travar a Ordem de Compra e pedir aprovação, como já acontece hoje.",
    },
  };
  const splitQ = trpc.compras.getCotacaoSplitMatMdo.useQuery(
    { cotacaoId: showDetalhe!, companyId },
    { enabled: showDetalhe !== null && showFdCotDialog }
  );
  const saldoFdQ = trpc.compras.getSaldoFd.useQuery(
    { companyId, obraId: (detalheQ.data as any)?.obraId ?? 0 },
    { enabled: showDetalhe !== null && showFdCotDialog && !!((detalheQ.data as any)?.obraId) }
  );
  const adicionarForn = trpc.compras.adicionarFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor adicionado!"); setMapaFornSelectId(""); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const removerForn = trpc.compras.removerFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor removido!"); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4245 — Editar / excluir / incluir item na cotação
  const editarItemCotacao = trpc.compras.editarItemCotacao.useMutation({
    onSuccess: () => { toast.success("Item atualizado!"); mapaQ.refetch(); setEditItemDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirItemCotacao = trpc.compras.excluirItemCotacao.useMutation({
    onSuccess: () => { toast.success("Item excluído!"); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirItensCotacao = trpc.compras.excluirItensCotacao.useMutation({
    onSuccess: (r) => { toast.success(`${r.deleted} ${r.deleted === 1 ? "item excluído" : "itens excluídos"}!`); mapaQ.refetch(); setMapaItemsChecked(new Set()); },
    onError: (e) => toast.error(e.message),
  });
  const togglePausarItem = trpc.compras.togglePausarItemCotacao.useMutation({
    onSuccess: (_, vars) => { mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const adicionarItemCotacao = trpc.compras.adicionarItemCotacao.useMutation({
    onSuccess: () => { toast.success("Item incluído!"); mapaQ.refetch(); setAddItemDialog(false); setAddItemForm({ descricao: "", unidade: "un", quantidade: "1", somenteMo: false }); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4250 — EAP picker
  const eapItensQ = trpc.compras.getItensEAPParaCotacao.useQuery(
    { cotacaoId: showDetalhe ?? 0 },
    { enabled: eapPickerOpen && !!showDetalhe }
  );
  const adicionarItensEAP = trpc.compras.adicionarItensEAPCotacao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.count} ${data.count === 1 ? "item adicionado" : "itens adicionados"} da EAP!`);
      mapaQ.refetch();
      setEapPickerOpen(false);
      setEapPickerSearch("");
      setEapPickerSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const adicionarEstoque = trpc.compras.adicionarEstoqueAoMapa.useMutation({
    onSuccess: (data: any) => {
      if (data?.jaExistia) toast.info("Estoque já está no mapa.");
      else toast.success(`Estoque adicionado ao mapa (R$ ${(data?.totalEstoque ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`);
      mapaQ.refetch();
      // Rev. 2466 — Fecha o picker e limpa seleção ao concluir.
      // Rev. 2471 — reset também do chip de origem.
      setShowEstoquePicker(false);
      setEstoquePickerIds(new Set());
      setEstoquePickerSearch("");
      setEstoquePickerOrigem("todas");
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2466 — Modal "Selecionar do Estoque": user marca itens do
  // almoxarifado (com saldo > 0) que deseja usar pra atender a SC. Os IDs
  // marcados são enviados pra mutation, que restringe o auto-match a esses
  // itens (em vez de varrer o almox inteiro).
  const [showEstoquePicker, setShowEstoquePicker] = useState(false);
  const [estoquePickerSearch, setEstoquePickerSearch] = useState("");
  const [estoquePickerIds, setEstoquePickerIds] = useState<Set<number>>(new Set());
  // Rev. 2471 — chip de origem: "todas" | "central" | "<obraId>"
  const [estoquePickerOrigem, setEstoquePickerOrigem] = useState<string>("todas");
  // Rev. 2467 HOTFIX — usar `detalheQ.data` (top-level, L981) em vez de
  // `detalheFullscreen` (que só existe dentro do bloco `if (showDetalhe !== null)`
  // em L2487). Antes quebrava com TDZ ReferenceError ao renderizar a tela.
  const estoqueDisponivelQ = trpc.compras.listEstoqueDisponivel.useQuery(
    { companyId, obraId: (detalheQ.data as any)?.obraId ?? undefined },
    { enabled: showEstoquePicker },
  );
  const [salvarProgress, setSalvarProgress] = useState<number | null>(null);
  const salvarProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const salvarRespostas = trpc.compras.salvarRespostasLote.useMutation({
    onMutate: () => {
      setSalvarProgress(0);
      if (salvarProgressRef.current) clearInterval(salvarProgressRef.current);
      salvarProgressRef.current = setInterval(() => {
        setSalvarProgress(prev => {
          if (prev === null) return null;
          if (prev >= 90) return 90;
          return prev + Math.random() * 15 + 5;
        });
      }, 200);
    },
    onSuccess: (data) => {
      if (salvarProgressRef.current) clearInterval(salvarProgressRef.current);
      setSalvarProgress(100);
      setTimeout(() => { setSalvarProgress(null); }, 800);
      toast.success(`Preços salvos! Total: ${data.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
      setEditingFornId(null);
      mapaQ.refetch();
    },
    onError: (e) => {
      if (salvarProgressRef.current) clearInterval(salvarProgressRef.current);
      setSalvarProgress(null);
      toast.error(e.message);
    },
  });
  const salvarCondicoesComerciais = trpc.compras.salvarCondicoesComerciais.useMutation({
    onSuccess: () => { mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const selecionarVencedor = trpc.compras.selecionarVencedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor vencedor selecionado!"); mapaQ.refetch(); detalheQ.refetch(); q.refetch(); refetchListaDerivados(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarCotacaoMut = trpc.compras.cancelarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação cancelada. A SC voltou para 'Aprovado' e pode gerar nova cotação."); setShowDetalhe(null); q.refetch(); refetchListaDerivados(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarVencedor = trpc.compras.cancelarVencedorMapa.useMutation({
    onSuccess: () => { toast.success("Seleção de vencedor cancelada. Ajuste os preços e selecione novamente."); mapaQ.refetch(); detalheQ.refetch(); q.refetch(); refetchListaDerivados(); },
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
      refetchListaDerivados();
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
      refetchListaDerivados();
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
      const inicialMatMdo: Record<string, { mat: string; mdo: string }> = {};
      for (const [key, val] of Object.entries(mapaQ.data.respostaMap)) {
        if ((val as any).precoUnitario != null) {
          inicialPrecos[key] = (val as any).precoUnitario ?? "0";
          inicialQtds[key] = (val as any).quantidade ?? inicialQtds[key] ?? "0";
        }
        const tm = (val as any).totalMat;
        const td = (val as any).totalMdo;
        if (tm != null || td != null) {
          inicialMatMdo[key] = { mat: tm != null ? String(parseFloat(tm)) : "0", mdo: td != null ? String(parseFloat(td)) : "0" };
        }
      }
      setEditMatMdo(inicialMatMdo);

      const tipoPagInicial: Record<number, string> = {};
      const formaPagInicial: Record<number, string> = {};
      const cartaoIdInicial: Record<number, number | null> = {};
      const freteTipoInicial: Record<number, string> = {};
      const valorFreteInicial: Record<number, string> = {};
      const transportadoraInicial: Record<number, string> = {};
      const moduloMedicaoInicial: Record<number, string> = {};
      // Rev. 5012 — reseta os mapas de prazo do contrato ao trocar de cotação
      // (senão os valores de um fornecedor vazam p/ outra cotação com o mesmo fornecedor)
      const mobDataInicial: Record<number, string> = {};
      const duracaoInicial: Record<number, string> = {};
      const excecaoManualInicial: Record<number, boolean> = {};
      for (const p of mapaQ.data.participantes) {
        prazoInicial[p.fornecedorId] = p.prazoEntregaDias ? String(p.prazoEntregaDias) : "";
        condInicial[p.fornecedorId] = p.condicaoPagamento ?? "";
        tipoPagInicial[p.fornecedorId] = (p as any).tipoPagamento ?? "";
        formaPagInicial[p.fornecedorId] = (p as any).formaPagamento ?? "";
        cartaoIdInicial[p.fornecedorId] = (p as any).cartaoId ?? null;
        freteTipoInicial[p.fornecedorId] = (p as any).freteTipo ?? "cif";
        valorFreteInicial[p.fornecedorId] = (p as any).valorFrete ? String(parseFloat((p as any).valorFrete)) : "0";
        transportadoraInicial[p.fornecedorId] = (p as any).transportadora ?? "";
        moduloMedicaoInicial[p.fornecedorId] = (p as any).moduloMedicao ?? "";
        mobDataInicial[p.fornecedorId] = (p as any).mobilizacaoDataInicio ?? "";
        duracaoInicial[p.fornecedorId] = (p as any).duracaoContratoDias ? String((p as any).duracaoContratoDias) : "";
        excecaoManualInicial[p.fornecedorId] = !!(p as any).excecaoManual;
        if ((p as any).arquivoUrl) anexoInicial[p.fornecedorId] = (p as any).arquivoUrl;
      }
      // Rev. 4284 — inicializar adiantamento e retenção
      const adiantAtivoIni: Record<number, boolean> = {};
      const adiantTipoIni: Record<number, string> = {};
      const adiantPctIni: Record<number, string> = {};
      const adiantVfIni: Record<number, string> = {};
      const adiantPrazoIni: Record<number, string> = {};
      const adiantAmortIni: Record<number, string> = {};
      const adiantNIni: Record<number, string> = {};
      const retAtivaIni: Record<number, boolean> = {};
      const retPctIni: Record<number, string> = {};
      const retLibIni: Record<number, string> = {};
      for (const p of mapaQ.data.participantes) {
        adiantAtivoIni[p.fornecedorId] = !!(p as any).adiantamentoAtivo;
        adiantTipoIni[p.fornecedorId] = (p as any).adiantamentoTipo ?? "pct";
        adiantPctIni[p.fornecedorId] = (p as any).adiantamentoPct ? String(parseFloat((p as any).adiantamentoPct)) : "5";
        adiantVfIni[p.fornecedorId] = (p as any).adiantamentoValorFixo ? String(parseFloat((p as any).adiantamentoValorFixo)) : "";
        adiantPrazoIni[p.fornecedorId] = (p as any).adiantamentoPrazoDias ? String((p as any).adiantamentoPrazoDias) : "7";
        adiantAmortIni[p.fornecedorId] = (p as any).adiantamentoAmortizacao ?? "proporcional";
        adiantNIni[p.fornecedorId] = (p as any).adiantamentoParcelasN ? String((p as any).adiantamentoParcelasN) : "1";
        retAtivaIni[p.fornecedorId] = !!(p as any).retencaoAtiva;
        retPctIni[p.fornecedorId] = (p as any).retencaoPct ? String(parseFloat((p as any).retencaoPct)) : "5";
        retLibIni[p.fornecedorId] = (p as any).retencaoLiberacao ?? "final";
      }
      setEditAdiantamentoAtivo(adiantAtivoIni);
      setEditAdiantamentoTipo(adiantTipoIni);
      setEditAdiantamentoPct(adiantPctIni);
      setEditAdiantamentoValorFixo(adiantVfIni);
      setEditAdiantamentoPrazoDias(adiantPrazoIni);
      setEditAdiantamentoAmortizacao(adiantAmortIni);
      setEditAdiantamentoParcelasN(adiantNIni);
      setEditRetencaoAtiva(retAtivaIni);
      setEditRetencaoPct(retPctIni);
      setEditRetencaoLiberacao(retLibIni);
      setEditPrecos(inicialPrecos);
      setEditQtds(inicialQtds);
      setEditPrazo(prazoInicial);
      setEditCondPag(condInicial);
      setEditTipoPag(tipoPagInicial);
      setEditFormaPag(formaPagInicial);
      setEditCartaoId(cartaoIdInicial);
      setEditFreteTipo(freteTipoInicial);
      setEditValorFrete(valorFreteInicial);
      setEditTransportadora(transportadoraInicial);
      setEditModuloMedicao(moduloMedicaoInicial);
      setEditExcecaoManual(excecaoManualInicial);
      setEditMobilizacaoData(mobDataInicial);
      setEditDuracaoDias(duracaoInicial);
      setAnexoUrl(anexoInicial);
    }
  }, [mapaQ.data, abaAtiva]);

  useEffect(() => { setLocalItensEmOC([]); itensPendentesOCRef.current = []; }, [showDetalhe]);

  // Ao abrir o modal de Condições de Pagamento, pré-carrega os campos a partir do
  // participante persistido (somente para chaves vazias — preserva edições não salvas).
  useEffect(() => {
    if (condModalFornId === null) return;
    const fId = condModalFornId;
    const p: any = (mapaQ.data?.participantes ?? []).find((x: any) => x.fornecedorId === fId);
    if (!p) return;

    const persistedPrazo = p.prazoEntregaDias ? String(p.prazoEntregaDias) : "";
    const persistedCond = p.condicaoPagamento ?? "";
    const persistedTipo = p.tipoPagamento ?? "";
    const persistedForma = p.formaPagamento ?? "";
    const persistedCartaoId = (p as any).cartaoId ?? null;
    const persistedFreteTipo = p.freteTipo ?? "cif";
    const persistedValorFrete = p.valorFrete ? String(parseFloat(p.valorFrete)) : "0";
    const persistedTransp = p.transportadora ?? "";
    const persistedModulo = p.moduloMedicao ?? "";
    const persistedNumParc = p.numeroParcelas ? Number(p.numeroParcelas) : 0;
    const persistedExcecao = !!(p as any).excecaoManual;
    // Rev. 3442 — fallback: se o fornecedor tem cicloFormaPagamento e ainda não há valor salvo,
    // pré-preenche como sugestão (o comprador pode alterar livremente).
    const fornCicloFP = (fornecedores.find((x: any) => x.id === fId) as any)?.cicloFormaPagamento ?? "";
    const formaEfetiva = persistedForma || fornCicloFP;

    // Seed estritamente quando a chave está `undefined` (nunca foi inicializada nesta sessão).
    // String vazia "" é tratada como intenção do usuário de limpar o campo — não sobrescreve.
    setEditPrazo(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedPrazo });
    setEditCondPag(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedCond });
    setEditTipoPag(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedTipo });
    setEditFormaPag(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: formaEfetiva });
    setEditCartaoId(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedCartaoId });
    setEditFreteTipo(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedFreteTipo });
    setEditValorFrete(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedValorFrete });
    setEditTransportadora(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedTransp });
    setEditModuloMedicao(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedModulo });
    setEditMobilizacaoData(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).mobilizacaoDataInicio ?? "" });
    setEditDuracaoDias(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).duracaoContratoDias ? String((p as any).duracaoContratoDias) : "" });
    setEditExcecaoManual(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: persistedExcecao });
    // Rev. 4284 — seed adiantamento e retenção
    setEditAdiantamentoAtivo(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: !!(p as any).adiantamentoAtivo });
    setEditAdiantamentoTipo(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoTipo ?? "pct" });
    setEditAdiantamentoPct(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoPct ? String(parseFloat((p as any).adiantamentoPct)) : "5" });
    setEditAdiantamentoValorFixo(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoValorFixo ? String(parseFloat((p as any).adiantamentoValorFixo)) : "" });
    setEditAdiantamentoPrazoDias(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoPrazoDias ? String((p as any).adiantamentoPrazoDias) : "7" });
    setEditAdiantamentoAmortizacao(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoAmortizacao ?? "proporcional" });
    setEditAdiantamentoParcelasN(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).adiantamentoParcelasN ? String((p as any).adiantamentoParcelasN) : "1" });
    setEditRetencaoAtiva(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: !!(p as any).retencaoAtiva });
    setEditRetencaoPct(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).retencaoPct ? String(parseFloat((p as any).retencaoPct)) : "5" });
    setEditRetencaoLiberacao(prev => prev[fId] !== undefined ? prev : { ...prev, [fId]: (p as any).retencaoLiberacao ?? "final" });

    // Inferência de modo "custom": só dispara quando há indício real de parcelamento custom —
    // numeroParcelas > 1 SEM tipoPagamento persistido (porque tipoPagamento define um plano
    // Padrão conhecido, ex. "30_60", cujas parcelas o modo Padrão já calcula a partir dele).
    if (persistedNumParc > 1 && !persistedTipo && condModo[fId] === undefined && !condCustomParcelas[fId]?.length) {
      const totalForn = parseFloat(p.totalOrcado ?? "0") || 0;
      const valorBase = totalForn > 0 ? (totalForn / persistedNumParc) : 0;
      const hoje = new Date();
      const parcelas = Array.from({ length: persistedNumParc }, (_, i) => {
        const dt = new Date(hoje);
        dt.setDate(dt.getDate() + (i * 30));
        return { valor: valorBase.toFixed(2), data: dt.toISOString().split("T")[0] };
      });
      setCondModo(prev => ({ ...prev, [fId]: "custom" }));
      setCondCustomParcelas(prev => ({ ...prev, [fId]: parcelas }));
    }
  }, [condModalFornId, mapaQ.data]);

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
      userId: user?.id,
      userName: user?.name,
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

  // Rev. 5200 — linhas exibidas de imediato; o enriquecimento (meta × melhor preço,
  // chaveado por id) é MESCLADO por id sem descartar nenhuma linha. Nomes de
  // fornecedor/obra vêm dos catálogos (carregados logo após a lista). Se o
  // enriquecimento ainda não chegou, mantém os campos que a própria linha já traz.
  const listaBase = q.data?.items ?? [];
  const lista = React.useMemo(() => {
    if (enriquecerMap.size === 0) return listaBase;
    return listaBase.map((c: any) => {
      const e = enriquecerMap.get(c.id);
      return e ? { ...c, ...e } : c;
    });
  }, [listaBase, enriquecerMap]);
  const filt = lista;
  // Rev. 5200 — total/contadores vêm do resumo (endpoint separado). Enquanto o resumo
  // não chega, usa valores loading-safe (0/{}); a lista já aparece.
  const counts = resumoQ.data?.counts;
  const countsPorStatus = counts?.porStatus ?? {};
  const countAEntregar = counts?.aEntregar ?? 0;
  const countTodos = counts?.todosStatus ?? 0;
  const countsPorTipo = counts?.porTipo ?? {};
  const countTodosTipo = counts?.todosTipo ?? 0;
  // Rev. 5200 — total/totalPages para paginação e display, com fallback loading-safe:
  // enquanto o resumo não carrega, deriva de hasMore/página para não travar a navegação.
  const resumoTotal = resumoQ.data?.total;
  const listaHasMore = !!(q.data as any)?.hasMore;
  const totalPaginasCotacoes = resumoTotal != null
    ? Math.max(1, Math.ceil(resumoTotal / 50))
    : (listaHasMore ? pagina + 1 : pagina);
  const obrasList = obrasQ.data ?? [];

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
    const itemById = new Map<number, any>((mapaItens as any[]).map((it: any) => [it.id, it]));
    const confRank = (c: string | null) => c === "baixa" ? 0 : c === "media" ? 1 : c === "alta" ? 2 : 1.5;
    // Rev. 2799 — uso por item p/ aviso de duplicidade (2+ linhas → mesmo item; last-wins ao salvar)
    const usoItem = new Map<number, number>();
    for (const l of iaLinhas) { if (l.matchItemId != null) usoItem.set(l.matchItemId, (usoItem.get(l.matchItemId) ?? 0) + 1); }
    const temDuplicidade = Array.from(usoItem.values()).some(v => v > 1);
    // linhas ordenadas: sem-match e baixa-confiança no topo (revisão prioritária)
    const linhasOrd = [...iaLinhas].sort((a, b) => {
      const pa = a.matchItemId == null ? -1 : confRank(a.matchConfianca);
      const pb = b.matchItemId == null ? -1 : confRank(b.matchConfianca);
      return pa - pb;
    });
    const idsVinculados = new Set(iaLinhas.filter(l => l.matchItemId != null).map(l => l.matchItemId));
    const semMatchSC = (mapaItens as any[]).filter((it: any) => !idsVinculados.has(it.id));
    // resumo ao vivo (recalculado a cada edição de match/qtd)
    let nParcial = 0, nExcedente = 0;
    for (const l of iaLinhas) {
      if (l.matchItemId == null) continue;
      const sc = itemById.get(l.matchItemId);
      const qSC = sc ? Number(sc.quantidade) : null;
      const qCot = l.quantidade != null ? Number(l.quantidade) : null;
      if (qSC == null || qCot == null) continue;
      const diff = qCot - qSC;
      if (diff < -0.01) nParcial++;
      else if (diff > 0.01) nExcedente++;
    }
    const iaPacote = mapaQ.data?.cotacao?.tipo === "pacote" || mapaQ.data?.tipoEfetivo === "pacote";
    const respostasValidas = iaLinhas.filter(l => {
      if (l.matchItemId == null) return false;
      if (iaPacote) {
        // pacote: válido se tem precoUnitario OU se tem totalMat/totalMdo
        const temPreco = l.precoUnitario != null && Number.isFinite(Number(l.precoUnitario)) && Number(l.precoUnitario) > 0;
        const temMatMdo = (l.totalMat != null && Number(l.totalMat) >= 0) || (l.totalMdo != null && Number(l.totalMdo) >= 0);
        return temPreco || temMatMdo;
      }
      return l.precoUnitario != null && Number.isFinite(Number(l.precoUnitario)) && Number(l.precoUnitario) > 0;
    });
    const confBadge = (c: string | null) => {
      if (c === "alta") return { txt: "Alta", cls: "bg-emerald-100 text-emerald-700" };
      if (c === "media") return { txt: "Média", cls: "bg-amber-100 text-amber-700" };
      if (c === "baixa") return { txt: "Baixa", cls: "bg-red-100 text-red-700" };
      return { txt: "—", cls: "bg-gray-100 text-gray-500" };
    };
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/50" onClick={() => { setIaExtracao(null); setIaFiltroStatus(null); }} />
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
              <button onClick={() => { setIaExtracao(null); setIaFiltroStatus(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
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

          {/* Rev. 5096 — cards clicáveis que filtram a tabela abaixo */}
          {(() => {
            const statusDe = (l: any): "ok" | "parcial" | "excedente" | "sem_vinculo" => {
              if (l.matchItemId == null) return "sem_vinculo";
              const sc0 = itemById.get(l.matchItemId);
              const qSC0 = sc0 ? Number(sc0.quantidade) : null;
              const qCot0 = l.quantidade != null ? Number(l.quantidade) : null;
              if (qSC0 == null || qCot0 == null) return "ok";
              const dd = qCot0 - qSC0;
              return Math.abs(dd) < 0.01 ? "ok" : dd < 0 ? "parcial" : "excedente";
            };
            const nOk = iaLinhas.filter((l: any) => statusDe(l) === "ok").length;
            const nSemVinculo = iaLinhas.filter((l: any) => statusDe(l) === "sem_vinculo").length;
            const cardCls = (ativo: boolean, base: string) =>
              `rounded-lg p-2.5 text-center cursor-pointer select-none transition-all border ${base} ${ativo ? "ring-2 ring-violet-400 shadow-sm" : "hover:shadow-sm hover:brightness-[0.98]"}`;
            const toggle = (v: typeof iaFiltroStatus) => setIaFiltroStatus(prev => prev === v ? null : v);
            return (
              <div className="grid grid-cols-4 gap-2">
                <div onClick={() => toggle("ok")} className={cardCls(iaFiltroStatus === "ok", "bg-emerald-50 border-emerald-200")}>
                  <div className="text-lg font-bold text-emerald-700">{nOk}</div>
                  <div className="text-[10px] font-medium text-emerald-700">Qtd OK</div>
                </div>
                <div onClick={() => toggle("parcial")} className={cardCls(iaFiltroStatus === "parcial", nParcial > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200")}>
                  <div className="text-lg font-bold text-amber-700">{nParcial}</div>
                  <div className="text-[10px] font-medium text-amber-700">Qtd Parcial</div>
                </div>
                <div onClick={() => toggle("excedente")} className={cardCls(iaFiltroStatus === "excedente", nExcedente > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200")}>
                  <div className="text-lg font-bold text-blue-700">{nExcedente}</div>
                  <div className="text-[10px] font-medium text-blue-700">Qtd Excedente</div>
                </div>
                <div onClick={() => toggle("sem_vinculo")} className={cardCls(iaFiltroStatus === "sem_vinculo", (nSemVinculo > 0 || semMatchSC.length > 0) ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200")}>
                  <div className="text-lg font-bold text-red-700">{nSemVinculo > 0 ? nSemVinculo : semMatchSC.length}</div>
                  <div className="text-[10px] font-medium text-red-700">{nSemVinculo > 0 ? "Sem vínculo" : "SC sem cotação"}</div>
                </div>
              </div>
            );
          })()}
          {iaFiltroStatus && (
            <div className="flex items-center gap-2 text-[11px] text-violet-700">
              <span>Filtro ativo: <strong>{iaFiltroStatus === "ok" ? "Qtd OK" : iaFiltroStatus === "parcial" ? "Qtd Parcial" : iaFiltroStatus === "excedente" ? "Qtd Excedente" : "Sem vínculo"}</strong></span>
              <button onClick={() => setIaFiltroStatus(null)} className="underline hover:text-violet-900">limpar</button>
            </div>
          )}

          {temDuplicidade && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Há duas ou mais linhas vinculadas ao <strong>mesmo item</strong> (marcadas em vermelho). Ao salvar, vale o <strong>último preço</strong> — ajuste os vínculos se não for intencional.</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-violet-700 flex items-center gap-1.5">
                <FileSearch className="h-4 w-4" /> Itens lidos do documento ({iaLinhas.length})
              </h4>
              <span className="text-[10px] text-gray-400">Edite preço, qtd e o item vinculado em cada linha. ★ = sugestão mais parecida.</span>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-violet-50">
                  {/* Rev. 5096 — META (orçamento) vem primeiro, depois o que o FORNECEDOR orçou, depois a DIFERENÇA */}
                  <tr>
                    <th colSpan={3} className="px-2 py-1"></th>
                    <th colSpan={iaPacote ? 2 : 3} className="text-center px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 border-x border-slate-200 uppercase tracking-wide">Orçamento (meta)</th>
                    <th colSpan={iaPacote ? 5 : 4} className="text-center px-2 py-1 text-[10px] font-bold text-violet-700 bg-violet-100 border-r border-violet-200 uppercase tracking-wide">Fornecedor (cotado)</th>
                    <th className="text-center px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 uppercase tracking-wide">Diferença</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                  <tr>
                    <th className="text-center px-2 py-2 font-medium text-violet-700 whitespace-nowrap">IA</th>
                    <th className="text-left px-2 py-2 font-medium text-violet-700">Descrição (fornecedor)</th>
                    <th className="text-left px-2 py-2 font-medium text-violet-700 w-[220px]">Item da cotação</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 bg-slate-50 border-l border-slate-200">Qtd SC</th>
                    {!iaPacote && <th className="text-right px-2 py-2 font-medium text-slate-600 bg-slate-50">Meta Unit.</th>}
                    <th className="text-right px-2 py-2 font-medium text-slate-600 bg-slate-50 border-r border-slate-200">Meta Total</th>
                    <th className="text-right px-2 py-2 font-medium text-violet-700 bg-violet-50/60">Qtd Cotada</th>
                    {iaPacote ? (
                      <>
                        <th className="text-right px-2 py-2 font-medium text-blue-600 bg-violet-50/60">MAT (R$)</th>
                        <th className="text-right px-2 py-2 font-medium text-orange-600 bg-violet-50/60">MO (R$)</th>
                        <th className="text-right px-2 py-2 font-medium text-violet-400 bg-violet-50/60 whitespace-nowrap" title="Desconto individual (sobrepõe o global quando > 0)">Desc.%</th>
                        <th className="text-right px-2 py-2 font-medium text-violet-700 bg-violet-50/60 border-r border-violet-200">Total</th>
                      </>
                    ) : (
                      <>
                        <th className="text-right px-2 py-2 font-medium text-violet-700 bg-violet-50/60">Preço Unit.</th>
                        <th className="text-right px-2 py-2 font-medium text-violet-400 bg-violet-50/60 whitespace-nowrap" title="Desconto individual (sobrepõe o global quando > 0)">Desc.%</th>
                        <th className="text-right px-2 py-2 font-medium text-violet-700 bg-violet-50/60 border-r border-violet-200">
                          Total{iaDescontoPct > 0 ? <span className="text-[10px] ml-1 text-violet-400">(−{iaDescontoPct}%)</span> : null}
                        </th>
                      </>
                    )}
                    <th className="text-right px-2 py-2 font-medium text-emerald-700 bg-emerald-50/60" title="Meta Total − Total do fornecedor">Saldo (Meta − Cotado)</th>
                    <th className="text-center px-2 py-2 font-medium text-violet-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasOrd.filter((l: any) => {
                    if (!iaFiltroStatus) return true;
                    const sc0 = l.matchItemId != null ? itemById.get(l.matchItemId) : null;
                    if (iaFiltroStatus === "sem_vinculo") return l.matchItemId == null;
                    if (l.matchItemId == null) return false;
                    const qSC0 = sc0 ? Number(sc0.quantidade) : null;
                    const qCot0 = l.quantidade != null ? Number(l.quantidade) : null;
                    const st = (qSC0 == null || qCot0 == null) ? "ok" : Math.abs(qCot0 - qSC0) < 0.01 ? "ok" : (qCot0 - qSC0) < 0 ? "parcial" : "excedente";
                    return st === iaFiltroStatus;
                  }).map((l: any) => {
                    const sc = l.matchItemId != null ? itemById.get(l.matchItemId) : null;
                    const qSC = sc ? Number(sc.quantidade) : null;
                    const qCot = l.quantidade != null ? Number(l.quantidade) : null;
                    const diff = (qSC != null && qCot != null) ? qCot - qSC : null;
                    const statusQtd = l.matchItemId == null ? "nenhum" : diff == null ? "ok" : Math.abs(diff) < 0.01 ? "ok" : diff < 0 ? "parcial" : "excedente";
                    const total = (qCot != null && l.precoUnitario != null) ? qCot * Number(l.precoUnitario) : (l.precoUnitario != null ? Number(l.precoUnitario) : null);
                    const dup = l.matchItemId != null && (usoItem.get(l.matchItemId) ?? 0) > 1;
                    const badge = confBadge(l.matchConfianca);
                    // Rev. 5096 — meta do orçamento p/ comparação lado a lado
                    const metaUnit = sc ? (parseFloat((sc as any).metaUnitario ?? "0") || 0) : 0;
                    const metaTotal = metaUnit > 0 && qSC != null ? metaUnit * qSC : null;
                    const totalPac = (l.totalMat != null || l.totalMdo != null) ? Number(l.totalMat ?? 0) + Number(l.totalMdo ?? 0) : null;
                    const totalForn = iaPacote ? totalPac : total;
                    // desconto efetivo: por item (quando > 0) sobrepõe o global
                    const descItemPct = Number(l.descontoPct ?? 0);
                    const descEfetivo = descItemPct > 0 ? descItemPct : iaDescontoPct;
                    // aplica desconto no preview p/ o saldo refletir o que vai ser salvo
                    const totalFornLiq = (totalForn != null && descEfetivo > 0) ? totalForn * (1 - descEfetivo / 100) : totalForn;
                    const saldo = metaTotal != null && totalFornLiq != null ? metaTotal - totalFornLiq : null;
                    const fmtBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const fmtQ = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
                    return (
                      <tr key={l.key} className={`border-t border-gray-100 ${dup ? "bg-red-50/60" : l.matchItemId == null ? "bg-amber-50/40" : "hover:bg-violet-50/40"}`}>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${badge.cls}`}>{badge.txt}</span>
                        </td>
                        <td className="px-2 py-2 text-gray-600 max-w-[200px] truncate" title={l.descricaoFornecedor}>{l.descricaoFornecedor || "—"}</td>
                        <td className="px-2 py-2">
                          <ItemMatchCombobox
                            itens={mapaItens as any[]}
                            value={l.matchItemId}
                            onChange={(id) => setIaLinha(l.key, { matchItemId: id })}
                            descricaoFornecedor={l.descricaoFornecedor}
                            duplicado={dup}
                          />
                        </td>
                        {/* ORÇAMENTO (meta) primeiro */}
                        <td className={`px-2 py-2 text-right font-mono bg-slate-50/60 border-l border-slate-100 ${statusQtd === "parcial" ? "text-amber-600 font-semibold" : statusQtd === "excedente" ? "text-blue-600 font-semibold" : "text-gray-500"}`}>
                          {qSC != null ? fmtQ(qSC) : "—"}
                          {statusQtd === "parcial" && diff != null && <span className="text-[9px] ml-0.5">(-{fmtQ(Math.abs(diff))})</span>}
                          {statusQtd === "excedente" && diff != null && <span className="text-[9px] ml-0.5">(+{fmtQ(diff)})</span>}
                        </td>
                        {!iaPacote && (
                          <td className="px-2 py-2 text-right font-mono text-gray-500 bg-slate-50/60">
                            {metaUnit > 0 ? `R$ ${metaUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right font-mono text-gray-600 font-semibold bg-slate-50/60 border-r border-slate-100">
                          {metaTotal != null ? `R$ ${fmtBR(metaTotal)}` : "—"}
                        </td>
                        {/* FORNECEDOR (cotado) */}
                        <td className="px-1 py-1 text-right bg-violet-50/30">
                          <input
                            type="text" inputMode="decimal"
                            value={l.quantidade != null ? String(l.quantidade) : ""}
                            onChange={e => setIaLinha(l.key, { quantidade: e.target.value.trim() === "" ? null : parseBRNumber(e.target.value) })}
                            className="w-16 h-7 text-right font-mono text-[11px] border border-gray-200 rounded px-1.5 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none"
                            placeholder="—"
                          />
                        </td>
                        {iaPacote ? (
                          <>
                            <td className="px-1 py-1 text-right">
                              <input
                                type="text" inputMode="decimal"
                                value={l.totalMat != null ? String(l.totalMat) : ""}
                                onChange={e => setIaLinha(l.key, { totalMat: e.target.value.trim() === "" ? null : parseBRNumber(e.target.value) })}
                                className="w-20 h-7 text-right font-mono text-[11px] border border-blue-200 rounded px-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                                placeholder="0,00"
                              />
                            </td>
                            <td className="px-1 py-1 text-right">
                              <input
                                type="text" inputMode="decimal"
                                value={l.totalMdo != null ? String(l.totalMdo) : ""}
                                onChange={e => setIaLinha(l.key, { totalMdo: e.target.value.trim() === "" ? null : parseBRNumber(e.target.value) })}
                                className="w-20 h-7 text-right font-mono text-[11px] border border-orange-200 rounded px-1.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                                placeholder="0,00"
                              />
                            </td>
                            <td className="px-1 py-1 text-right bg-violet-50/30">
                              <input
                                type="number" min="0" max="100" step="0.5"
                                value={descItemPct > 0 ? descItemPct : ""}
                                onChange={e => setIaLinha(l.key, { descontoPct: e.target.value.trim() === "" ? 0 : Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                className="w-14 h-7 text-right font-mono text-[11px] border border-violet-200 rounded px-1.5 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                                placeholder={iaDescontoPct > 0 ? String(iaDescontoPct) : "0"}
                                title={iaDescontoPct > 0 ? `Desc. global: ${iaDescontoPct}% (deixe vazio para herdar)` : "Desconto individual (%)"}
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-mono border-r border-violet-100">
                              {totalPac != null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  {descEfetivo > 0 && <span className="text-[10px] text-gray-400 line-through">R$ {fmtBR(totalPac)}</span>}
                                  <span className={descEfetivo > 0 ? "font-semibold text-violet-700" : "text-gray-700"}>R$ {fmtBR(totalPac * (1 - descEfetivo / 100))}</span>
                                </div>
                              ) : "—"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-1 py-1 text-right">
                              <div className="flex items-center gap-0.5 justify-end">
                                <span className="text-[10px] text-gray-400">R$</span>
                                <input
                                  type="text" inputMode="decimal"
                                  value={l.precoUnitario != null ? String(l.precoUnitario) : ""}
                                  onChange={e => setIaLinha(l.key, { precoUnitario: e.target.value.trim() === "" ? null : parseBRNumber(e.target.value) })}
                                  className={`w-20 h-7 text-right font-mono text-[11px] border rounded px-1.5 outline-none focus:ring-1 ${(l.precoUnitario == null || !(Number(l.precoUnitario) > 0)) ? "border-red-200 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-violet-400 focus:ring-violet-200"}`}
                                  placeholder="0,00"
                                />
                              </div>
                            </td>
                            <td className="px-1 py-1 text-right bg-violet-50/30">
                              <input
                                type="number" min="0" max="100" step="0.5"
                                value={descItemPct > 0 ? descItemPct : ""}
                                onChange={e => setIaLinha(l.key, { descontoPct: e.target.value.trim() === "" ? 0 : Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                className="w-14 h-7 text-right font-mono text-[11px] border border-violet-200 rounded px-1.5 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                                placeholder={iaDescontoPct > 0 ? String(iaDescontoPct) : "0"}
                                title={iaDescontoPct > 0 ? `Desc. global: ${iaDescontoPct}% (deixe vazio para herdar)` : "Desconto individual (%)"}
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-semibold border-r border-violet-100">
                              {total != null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  {descEfetivo > 0 && <span className="text-[10px] text-gray-400 line-through">R$ {fmtBR(Number(total))}</span>}
                                  <span className={descEfetivo > 0 ? "text-violet-700" : "text-gray-700"}>R$ {fmtBR(Number(total) * (1 - descEfetivo / 100))}</span>
                                </div>
                              ) : "—"}
                            </td>
                          </>
                        )}
                        {/* DIFERENÇA: meta − cotado */}
                        <td className={`px-2 py-2 text-right font-mono font-semibold bg-emerald-50/40 ${saldo == null ? "text-gray-300" : saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {saldo != null ? `${saldo < 0 ? "-" : ""}R$ ${fmtBR(Math.abs(saldo))}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {statusQtd === "nenhum" ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Sem vínculo</span>
                          ) : (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusQtd === "ok" ? "bg-emerald-100 text-emerald-700" : statusQtd === "parcial" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              {statusQtd === "ok" ? "OK" : statusQtd === "parcial" ? "Parcial" : "Excedente"}
                            </span>
                          )}
                          {l.distribuido && <span className="block text-[9px] text-violet-500 mt-0.5">distrib.</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {iaLinhas.length === 0 && (
                    <tr><td colSpan={12} className="px-2 py-6 text-center text-gray-400">Nenhum item lido do documento.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {semMatchSC.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-4 w-4" /> Itens da SC sem correspondência ({semMatchSC.length})
              </h4>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-800">
                  {semMatchSC.map((it: any) => (
                    <li key={it.id}>• {it.descricao} (Qtd: {it.quantidade} {it.unidade || "un"})</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-500 mt-2">Estes itens da cotação ainda não têm preço vinculado. Use o seletor "Item da cotação" nas linhas acima para vinculá-los.</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t gap-4 flex-wrap">
            {/* ── Desconto global ── */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Desconto global (%)</label>
              <input
                type="number" min="0" max="100" step="0.5"
                value={iaDescontoPct || ""}
                onChange={e => setIaDescontoPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                placeholder="0"
                className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {iaDescontoPct > 0 && (
                <span className="text-[11px] text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                  −{iaDescontoPct}% aplicado em {respostasValidas.length} {respostasValidas.length === 1 ? "item" : "itens"}
                </span>
              )}
            </div>
            {/* ── Ações ── */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setIaExtracao(null); setIaFiltroStatus(null); }}>Cancelar</Button>
              <Button
                disabled={respostasValidas.length === 0}
                onClick={() => {
                  const descGlobal = iaDescontoPct;
                  const respostas = respostasValidas.map((l: any) => {
                    const hasMdo = l.totalMat != null || l.totalMdo != null;
                    const matVal = l.totalMat != null ? Number(l.totalMat) : 0;
                    const mdoVal = l.totalMdo != null ? Number(l.totalMdo) : 0;
                    const precoUnit = iaPacote && hasMdo && !l.precoUnitario
                      ? (matVal + mdoVal)
                      : Number(l.precoUnitario);
                    const descItem = Number(l.descontoPct ?? 0);
                    return {
                      itemId: l.matchItemId as number,
                      precoUnitario: precoUnit,
                      quantidade: l.quantidade != null ? Number(l.quantidade) : undefined,
                      descontoPct: descItem > 0 ? descItem : descGlobal,
                      ...(iaPacote && hasMdo ? { totalMat: matVal, totalMdo: mdoVal } : {}),
                    };
                  });
                  if (respostas.length === 0) { toast.error("Nenhum item vinculado com preço para salvar"); return; }
                  salvarRespostas.mutate({
                    cotacaoId: showDetalhe!,
                    fornecedorId: iaExtracao.fornecedorId,
                    propostaId: d.propostaId ?? undefined,
                    respostas,
                    condicaoPagamento: d.condicaoPagamento ?? undefined,
                  }, {
                    onSuccess: () => {
                      const temDescIndividual = respostasValidas.some((l: any) => Number(l.descontoPct ?? 0) > 0);
                      toast.success(`${respostas.length} preço(s) salvos${descGlobal > 0 || temDescIndividual ? ` com desconto aplicado` : ""}!`);
                      setIaExtracao(null);
                      setIaFiltroStatus(null);
                      setIaDescontoPct(0);
                      mapaQ.refetch();
                      propostasQ.refetch();
                    },
                    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
                  });
                }}
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Confirmar e Salvar ({respostasValidas.length} {respostasValidas.length === 1 ? "item" : "itens"})
              </Button>
            </div>
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
      // Rev. 4285 — causa raiz: preco_unitario é armazenado com 4dp (arredondado),
      // então recomputar preco*qty pode divergir do total salvo (ex: item 7096:
      // preco=1481.03, qty=18 → preco*qty=26658.54 mas total salvo=26658.49).
      // Fix: usar resp.total (centavos inteiros) para itens SEM alteração pelo usuário;
      // recomputar preco*qty apenas para itens COM preço/qty alterados.
      const totalItensCents = (mapaQ.data?.itens ?? []).reduce((acc: number, it: any) => {
        const key = `${it.id}_${fId}`;
        const origResp = (mapaQ.data?.respostaMap as any)?.[key];
        const origPreco = origResp?.precoUnitario ?? "0";
        const origQty   = origResp?.quantidade   ?? String(it.quantidade ?? "1");
        const curPreco  = editPrecos[key] ?? origPreco;
        const curQty    = editQtds[key]   ?? origQty;
        // Sem alteração → fonte autoritativa (evita drift preco_unitario roundeado)
        if (curPreco === origPreco && curQty === origQty && origResp?.total) {
          return acc + Math.round(parseFloat(origResp.total) * 100);
        }
        // Com alteração → recomputa do novo preço (preview de mudança em andamento)
        const preco = parseBRNumber(curPreco) || 0;
        const qty   = parseBRNumber(curQty) > 0 ? parseBRNumber(curQty) : parseFloat(it.quantidade ?? "1");
        return acc + Math.round(preco * qty * 100);
      }, 0);
      const isFob = (editFreteTipo[fId] ?? "cif") === "fob";
      const freteCents = isFob ? Math.round((parseFloat(editValorFrete[fId] ?? "0") || 0) * 100) : 0;
      return (totalItensCents + freteCents) / 100;
    })() : (() => {
      // Rev. 4285 — usar totalOrcado diretamente (fonte autoritativa do backend).
      // Re-somar os resp.total individuais reintroduz drift de float. totalOrcado é
      // acumulado em centavos inteiros no backend (salvarRespostasLote) — é a verdade.
      return parseFloat(fornP?.totalOrcado ?? "0");
    })();

    // Rev. 4073 — Condição de pagamento efetiva do fornecedor: prioridade
    // (1) regra especial por produto cadastrada > (2) ciclo geral de fechamento
    // cadastrado no fornecedor > (3) livre (comprador escolhe manualmente).
    const forn: any = fornP?.fornecedor;
    const condicaoEfetiva = (() => {
      const itensCot: any[] = mapaQ.data?.itens ?? [];
      const rawRegras = forn?.regrasProdutoJson;
      if (rawRegras && itensCot.length > 0) {
        try {
          const regras: any[] = JSON.parse(rawRegras);
          const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const regra = Array.isArray(regras)
            ? regras.find(r => itensCot.some(it => norm(it.descricao).includes(norm(r.produto))))
            : null;
          if (regra) {
            return {
              origem: "produto" as const,
              label: `Regra especial: ${regra.produto}`,
              formaPagamento: regra.formaPagamento as string,
              numParcelas: Number(regra.numParcelas) || 1,
              prazoParcela: Number(regra.prazoEntreParcelas) || 30,
            };
          }
        } catch { /* regra inválida, ignora */ }
      }
      if (forn?.cicloPagamento) {
        return {
          origem: "ciclo" as const,
          label: "Ciclo de fechamento cadastrado do fornecedor",
          formaPagamento: forn.cicloFormaPagamento as string || "",
          numParcelas: Number(forn.cicloNumParcelas) || 1,
          prazoParcela: Number(forn.cicloPrazoParcela) || 30,
        };
      }
      return null;
    })();
    const excecaoAtiva = !!editExcecaoManual[fId];
    const isTravado = !!condicaoEfetiva && !excecaoAtiva;
    const hideFechamentoTab = !!forn?.cicloPagamento;

    const FORMAS: { v: string; l: string; Icon: LucideIcon; sel: string }[] = [
      { v: "boleto", l: "Boleto", Icon: FileText, sel: "bg-blue-50 text-blue-700 border-blue-400 ring-blue-200" },
      { v: "pix", l: "PIX", Icon: Zap, sel: "bg-green-50 text-green-700 border-green-400 ring-green-200" },
      { v: "transferencia", l: "Transferência", Icon: Building2, sel: "bg-indigo-50 text-indigo-700 border-indigo-400 ring-indigo-200" },
      { v: "cheque", l: "Cheque", Icon: PenTool, sel: "bg-amber-50 text-amber-700 border-amber-400 ring-amber-200" },
      { v: "cartao", l: "Cartão", Icon: CreditCard, sel: "bg-purple-50 text-purple-700 border-purple-400 ring-purple-200" },
      { v: "deposito", l: "Depósito", Icon: Banknote, sel: "bg-gray-100 text-gray-700 border-gray-400 ring-gray-200" },
    ];

    const mapaData = mapaQ.data as ({ tipoEfetivo?: string; cotacao?: { tipo?: string } } | undefined);
    const cotTipoEfetivo = mapaData?.tipoEfetivo ?? mapaData?.cotacao?.tipo;
    const tipoBadge = cotTipoEfetivo === "servico"
      ? { label: "Serviço", cls: "bg-blue-100 text-blue-700 border-blue-200" }
      : cotTipoEfetivo === "pacote"
        ? { label: "Pacote", cls: "bg-purple-100 text-purple-700 border-purple-200" }
        : { label: "Material", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };

    // Rev. 1996 — Modo do modal por tipo de cotação:
    //   "material" → Forma + Parcelamento + Entrega/Frete (esconde Módulo Medição)
    //   "mdo"      → Forma simplificada + (Parcelamento OU Módulo Medição via hero toggle) (esconde Entrega/Frete)
    //   "pacote"   → 2 colunas: Material (esq) + Mão de Obra (dir)
    const modoModal: "material" | "mdo" | "pacote" =
      cotTipoEfetivo === "servico" ? "mdo" : cotTipoEfetivo === "pacote" ? "pacote" : "material";
    // Boot: se já tem dados salvos (Rev. 1994 pré-carga), pré-seleciona o tab certo
    const mdoModoEfetivo: "" | "medicao" | "parcelado" = mdoTab[fId]
      ?? (editModuloMedicao[fId] ? "medicao"
        : (editTipoPag[fId] && editTipoPag[fId] !== "medicao") ? "parcelado"
        : "");
    // MDO normalmente não usa Cheque/Cartão — contrato de serviço é boleto/PIX/TED/depósito.
    const FORMAS_RENDER = modoModal === "mdo"
      ? FORMAS.filter(f => !["cheque", "cartao"].includes(f.v))
      : FORMAS;
    const showParcelamento  = modoModal !== "mdo" || mdoModoEfetivo === "parcelado";
    const showEntregaFrete  = modoModal !== "mdo";
    const showModuloMedicao = modoModal === "pacote" || (modoModal === "mdo" && mdoModoEfetivo === "medicao");
    const mdoSemModo = modoModal === "mdo" && mdoModoEfetivo === "";

    const handleMdoTabChange = (novo: "medicao" | "parcelado") => {
      setMdoTab(prev => ({ ...prev, [fId]: novo }));
      // MDO nunca usa frete CIF/FOB — limpa qualquer valor legado pra não vazar em totais/OC
      setEditValorFrete(prev => ({ ...prev, [fId]: "0" }));
      setEditFreteTipo(prev => ({ ...prev, [fId]: "cif" }));
      setEditTransportadora(prev => ({ ...prev, [fId]: "" }));
      if (novo === "medicao") {
        // Marca `tipoPagamento="medicao"` (token que valida no backend/compras.ts L5885 e frontend L2239/2267)
        setEditTipoPag(prev => ({ ...prev, [fId]: "medicao" }));
        setEditCondPag(prev => ({ ...prev, [fId]: "" }));
        setCondModo(prev => ({ ...prev, [fId]: "padrao" }));
        setCondCustomParcelas(prev => ({ ...prev, [fId]: [] }));
      } else {
        // Parcelado: limpa módulo + zera marker de medição
        setEditModuloMedicao(prev => ({ ...prev, [fId]: "" }));
        if (editTipoPag[fId] === "medicao") {
          setEditTipoPag(prev => ({ ...prev, [fId]: "" }));
        }
      }
    };

    const modoAtual = condModo[fId] ?? "padrao";
    const parcListAtual = condCustomParcelas[fId] ?? [];
    const totalCustomAtual = parcListAtual.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    const diffCustom = fornTotal - totalCustomAtual;
    const customInvalid = modoAtual === "custom" && (parcListAtual.length === 0 || Math.abs(diffCustom) >= 0.01);
    const customMotivo = customInvalid
      ? (parcListAtual.length === 0
        ? `Adicione pelo menos uma parcela somando ${formatCurrency(fornTotal)}.`
        : diffCustom > 0
          ? `Faltam ${formatCurrency(diffCustom)} nas parcelas — ajuste para somar ${formatCurrency(fornTotal)}.`
          : `Excede ${formatCurrency(Math.abs(diffCustom))} nas parcelas — ajuste para somar ${formatCurrency(fornTotal)}.`)
      : "";

    const handleSalvar = () => {
      if (!showDetalhe) return;
      if (customInvalid) {
        toast.error(customMotivo);
        return;
      }
      if (mdoSemModo) {
        toast.error("Escolha Medição ou Parcelado para continuar.");
        return;
      }
      const prazoVal = editPrazo[fId] ? parseInt(editPrazo[fId]) : undefined;
      const parcList = condCustomParcelas[fId] ?? [];
      const modo = condModo[fId] ?? "padrao";
      const numParcelas = modo === "custom" && parcList.length > 0 ? parcList.length : undefined;
      // Rev. 2071 — Pedido do usuário (IMG_0976+0977): "Todas informações
      // estão corretas, não falta nada e o erro ainda persiste". Bug raiz:
      // o modal mostrava "Por Medição" + módulo pré-selecionados a partir
      // do `moduloMedicao` persistido (linha 1527 `mdoModoEfetivo` deriva
      // de `editModuloMedicao` se truthy). Mas `editTipoPag` carregava o
      // `tipoPagamento` persistido — que podia estar null em registros
      // antigos. Se o usuário só conferia visualmente e clicava
      // "Confirmar e Salvar" sem TOCAR na aba "Por Medição"
      // (handleMdoTabChange é quem seta editTipoPag="medicao"), o save
      // enviava tipoPagamento="" → server gravava null. Aí validação
      // L2293 / server L5885 não detectavam isMdoMedicao e exigiam
      // Prazo de Entrega (que não existe nesse fluxo). Fix: derivar
      // tipoPagamento da fonte da verdade visível (mdoModoEfetivo),
      // não do editTipoPag stale.
      let tipoPagamentoFinal = editTipoPag[fId] || "";
      if (modoModal === "mdo" && mdoModoEfetivo === "medicao") {
        tipoPagamentoFinal = "medicao";
      }
      // Rev. 4073 — condição travada (regra de produto ou ciclo do fornecedor): a gravação
      // usa SEMPRE a condição efetiva, ignorando o que o usuário tenha mexido na UI (defesa
      // extra além do próprio bloqueio visual dos campos).
      const formaPagamentoFinal = isTravado ? (condicaoEfetiva!.formaPagamento || "") : (editFormaPag[fId] || "");
      const numeroParcelasFinal = isTravado ? condicaoEfetiva!.numParcelas : numParcelas;
      const condicaoPagamentoFinal = isTravado
        ? `${condicaoEfetiva!.numParcelas}x / ${condicaoEfetiva!.prazoParcela}d (${condicaoEfetiva!.origem === "produto" ? "regra do produto" : "ciclo do fornecedor"})`
        : (editCondPag[fId] || "");
      salvarCondicoesComerciais.mutate({
        cotacaoId: showDetalhe,
        fornecedorId: fId,
        companyId,
        formaPagamento: formaPagamentoFinal,
        tipoPagamento: isTravado ? "" : tipoPagamentoFinal,
        condicaoPagamento: condicaoPagamentoFinal,
        prazoEntregaDias: prazoVal,
        numeroParcelas: numeroParcelasFinal,
        moduloMedicao: editModuloMedicao[fId] || undefined,
        mobilizacaoDataInicio: editMobilizacaoData[fId] !== undefined ? (editMobilizacaoData[fId] || "") : undefined,
        duracaoContratoDias: editDuracaoDias[fId] !== undefined ? (parseInt(editDuracaoDias[fId] || "0", 10) || 0) : undefined,
        cartaoId: formaPagamentoFinal === "cartao" ? (editCartaoId[fId] ?? null) : null,
        excecaoManual: excecaoAtiva,
        // Rev. 4284 — adiantamento e retenção
        adiantamentoAtivo: editAdiantamentoAtivo[fId] ?? false,
        adiantamentoTipo: (editAdiantamentoTipo[fId] ?? "pct") as "pct" | "valor",
        adiantamentoPct: parseFloat(editAdiantamentoPct[fId] ?? "5") || 5,
        adiantamentoValorFixo: editAdiantamentoTipo[fId] === "valor" ? (parseFloat(editAdiantamentoValorFixo[fId] ?? "0") || 0) : null,
        adiantamentoPrazoDias: parseInt(editAdiantamentoPrazoDias[fId] ?? "7") || 7,
        adiantamentoAmortizacao: (editAdiantamentoAmortizacao[fId] ?? "proporcional") as "proporcional" | "parcelas_fixas",
        adiantamentoParcelasN: parseInt(editAdiantamentoParcelasN[fId] ?? "1") || 1,
        retencaoAtiva: editRetencaoAtiva[fId] ?? false,
        retencaoPct: parseFloat(editRetencaoPct[fId] ?? "5") || 5,
        retencaoLiberacao: (editRetencaoLiberacao[fId] ?? "final") as "final" | "etapas",
      }, {
        onSuccess: () => {
          setCondModalFornId(null);
          toast.success("Condições salvas com sucesso!");
        },
      });
    };

    const SectionHeader = ({ Icon, color, title, hint }: { Icon: LucideIcon; color: string; title: string; hint?: string }) => (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-[0.12em]">{title}</h4>
        </div>
        {hint && <span className="text-[10px] text-gray-400 uppercase tracking-wider">{hint}</span>}
      </div>
    );

    return (
      <div className="fixed inset-0 z-[9999] flex items-stretch lg:items-center justify-center" onClick={() => setCondModalFornId(null)}>
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
        <div
          className="relative bg-white shadow-2xl flex flex-col w-[100vw] h-[100vh] lg:w-[96vw] lg:h-[94vh] lg:max-w-[1400px] lg:rounded-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 bg-gradient-to-r from-violet-50 via-white to-violet-50 border-b border-violet-100 px-6 lg:px-8 py-4 lg:py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:gap-4 min-w-0 flex-1">
              <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center ring-4 ring-violet-100 flex-shrink-0">
                <Wallet className="w-5 h-5 lg:w-6 lg:h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg lg:text-xl font-bold text-gray-900 truncate">Condições de Pagamento</h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm text-gray-600 truncate max-w-[260px] lg:max-w-none" title={fornNome}>{fornNome}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm font-semibold text-violet-700 tabular-nums">{formatCurrency(fornTotal)}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${tipoBadge.cls}`}>{tipoBadge.label}</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCondModalFornId(null)} className="flex-shrink-0 h-10 w-10 rounded-full hover:bg-violet-100 text-gray-500">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-gray-50/40">
            {/* Rev. 4073 — Banner de condição travada (regra de produto ou ciclo do fornecedor) */}
            {condicaoEfetiva && (
              <div className="px-5 lg:px-8 pt-5 lg:pt-6">
                <div className={`rounded-xl border-2 p-4 flex items-start gap-3 ${excecaoAtiva ? "border-amber-300 bg-amber-50" : condicaoEfetiva.origem === "produto" ? "border-violet-400 bg-violet-50" : "border-blue-300 bg-blue-50"}`}>
                  <Lock className={`h-5 w-5 flex-shrink-0 mt-0.5 ${excecaoAtiva ? "text-amber-600" : condicaoEfetiva.origem === "produto" ? "text-violet-600" : "text-blue-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${excecaoAtiva ? "text-amber-900" : condicaoEfetiva.origem === "produto" ? "text-violet-900" : "text-blue-900"}`}>
                      {excecaoAtiva ? "Exceção manual ativada — condição livre" : condicaoEfetiva.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${excecaoAtiva ? "text-amber-700" : condicaoEfetiva.origem === "produto" ? "text-violet-700" : "text-blue-700"}`}>
                      {excecaoAtiva
                        ? "Você optou por definir a condição manualmente para esta compra, fora da regra cadastrada. Isso fica registrado."
                        : `Condição de pagamento travada em ${condicaoEfetiva.numParcelas}x, ${condicaoEfetiva.prazoParcela} dias entre parcelas${condicaoEfetiva.formaPagamento ? `, via ${condicaoEfetiva.formaPagamento}` : ""}. Cadastro do fornecedor define esta regra.`}
                    </p>
                    <label className="flex items-center gap-2 mt-2.5 cursor-pointer w-fit">
                      <Checkbox checked={excecaoAtiva} onCheckedChange={(v) => setEditExcecaoManual(prev => ({ ...prev, [fId]: !!v }))} />
                      <span className="text-xs font-semibold text-gray-700">Esta compra é uma exceção (definir condição manualmente)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
            {/* Rev. 1996 — Header de contexto pra PACOTE explicando estrutura mista */}
            {modoModal === "pacote" && (
              <div className="px-5 lg:px-8 pt-5 lg:pt-6">
                <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-blue-50 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="text-sm text-gray-700">
                    <strong className="text-purple-700">Cotação mista (Pacote).</strong> Defina as condições do <strong>material</strong> (esquerda) e da <strong>mão de obra</strong> (direita) separadamente.
                  </div>
                </div>
              </div>
            )}
            {/* Rev. 1996 — Hero toggle MDO pura: escolha obrigatória entre Medição (>30d) ou Parcelado (≤30d) */}
            {modoModal === "mdo" && (
              <div className="px-5 lg:px-8 pt-5 lg:pt-6">
                <section className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-violet-50 p-5 lg:p-6 shadow-sm">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center flex-shrink-0">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Como será o pagamento desta Mão de Obra?</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Escolha de acordo com a duração do serviço. Esta escolha define o que aparece abaixo.</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([
                      { v: "medicao", l: "Por Medição", desc: "Obras longas (> 30 dias)", hint: "Mensal · Avanço · Etapa · Empreitada · Administração", Icon: BarChart2, bg: "from-purple-500 to-purple-600", ring: "ring-purple-300", selBorder: "border-purple-500", selBg: "bg-purple-50" },
                      { v: "parcelado", l: "Parcelado", desc: "Obras curtas (≤ 30 dias)", hint: "À Vista · 7/14/21/28 DDL · Personalizado", Icon: Layers, bg: "from-blue-500 to-blue-600", ring: "ring-blue-300", selBorder: "border-blue-500", selBg: "bg-blue-50" },
                    ] as const).map(opt => {
                      const sel = mdoModoEfetivo === opt.v;
                      return (
                        <button key={opt.v} type="button" onClick={() => handleMdoTabChange(opt.v)}
                          className={`relative text-left p-4 rounded-xl border-2 transition-all ${sel ? `${opt.selBorder} ${opt.selBg} ring-4 ${opt.ring} shadow-md` : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}>
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${opt.bg} text-white flex items-center justify-center shadow-sm flex-shrink-0`}>
                              <opt.Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-base font-bold text-gray-900">{opt.l}</div>
                              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{opt.desc}</div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 leading-snug">{opt.hint}</p>
                          {sel && (
                            <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white">
                              <CheckCircle className="w-3 h-3" /> Selecionado
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {mdoSemModo && (
                    <p className="mt-3 text-xs text-amber-700 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Escolha uma das opções acima para continuar.
                    </p>
                  )}
                </section>
              </div>
            )}
            <div className={`grid gap-5 lg:gap-6 p-5 lg:p-8 ${modoModal === "mdo" ? "lg:grid-cols-1 lg:max-w-3xl lg:mx-auto" : "lg:grid-cols-[1.2fr_1fr]"}`}>
              {/* Coluna ESQUERDA — Forma + Parcelamento */}
              <div className="space-y-5 lg:space-y-6 min-w-0">
                {modoModal === "pacote" && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 w-fit">
                    <FileText className="w-3 h-3" /> Material
                  </div>
                )}
                {/* Forma de Pagamento — esconder quando MDO sem modo escolhido */}
                {!mdoSemModo && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm">
                  <SectionHeader Icon={Wallet} color="bg-violet-100 text-violet-700" title="Forma de Pagamento" hint={isTravado ? "Travado" : editFormaPag[fId] ? "Selecionado" : "Opcional"} />
                  <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${isTravado ? "opacity-60 pointer-events-none" : ""}`}>
                    {FORMAS_RENDER.map(fp => {
                      const sel = isTravado ? condicaoEfetiva!.formaPagamento === fp.v : editFormaPag[fId] === fp.v;
                      return (
                        <button key={fp.v} type="button" disabled={isTravado}
                          onClick={() => setEditFormaPag(prev => ({ ...prev, [fId]: prev[fId] === fp.v ? "" : fp.v }))}
                          className={`flex items-center gap-2.5 px-3 h-14 rounded-xl text-sm font-medium border-2 transition-all ${sel ? `${fp.sel} ring-2 shadow-sm` : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"}`}>
                          <fp.Icon className="w-5 h-5 flex-shrink-0" />
                          <span className="truncate">{fp.l}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Rev. 4998 — dados bancários do fornecedor aparecem automaticamente em PIX/Transferência/Depósito */}
                  {(() => {
                    const formaSel = isTravado ? (condicaoEfetiva!.formaPagamento || "") : (editFormaPag[fId] || "");
                    if (!["pix", "transferencia", "deposito"].includes(formaSel)) return null;
                    const banco = (forn?.banco ?? "").trim();
                    const agencia = (forn?.agencia ?? "").trim();
                    const conta = (forn?.conta ?? "").trim();
                    const pixChave = (forn?.pix ?? "").trim();
                    const isPix = formaSel === "pix";
                    const temDados = isPix ? !!pixChave : !!(banco || agencia || conta);
                    return (
                      <div className={`mt-4 rounded-xl border p-4 ${temDados ? "bg-emerald-50/60 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Banknote className={`w-4 h-4 ${temDados ? "text-emerald-600" : "text-amber-600"}`} />
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${temDados ? "text-emerald-700" : "text-amber-700"}`}>
                            Dados bancários do fornecedor
                          </span>
                        </div>
                        {temDados ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                            {pixChave && (
                              <div className="col-span-2">
                                <div className="text-[10px] font-semibold text-gray-500 uppercase">Chave PIX</div>
                                <div className="font-semibold text-gray-900 break-all">{pixChave}</div>
                              </div>
                            )}
                            {banco && (
                              <div>
                                <div className="text-[10px] font-semibold text-gray-500 uppercase">Banco</div>
                                <div className="font-semibold text-gray-900">{banco}</div>
                              </div>
                            )}
                            {agencia && (
                              <div>
                                <div className="text-[10px] font-semibold text-gray-500 uppercase">Agência</div>
                                <div className="font-semibold text-gray-900">{agencia}</div>
                              </div>
                            )}
                            {conta && (
                              <div>
                                <div className="text-[10px] font-semibold text-gray-500 uppercase">Conta</div>
                                <div className="font-semibold text-gray-900">{conta}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-700 font-medium">
                            {isPix
                              ? "Este fornecedor não tem chave PIX cadastrada. Edite o cadastro do fornecedor para preencher."
                              : "Este fornecedor não tem dados bancários cadastrados. Edite o cadastro do fornecedor para preencher."}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {!isTravado && editFormaPag[fId] === "cartao" && (
                    <div className="mt-4">
                      <CartaoDisponivelCard
                        companyId={companyId}
                        valorCompra={fornTotal || null}
                        cartaoIdSelecionado={editCartaoId[fId] ?? null}
                        onSelecionarCartao={(cartaoId) => setEditCartaoId(prev => ({ ...prev, [fId]: cartaoId }))}
                      />
                    </div>
                  )}
                </section>
                )}

                {/* Parcelamento — escondido em MDO pura quando modo escolhido for "medicao" */}
                {showParcelamento && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                      <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-[0.12em]">Parcelamento</h4>
                    </div>
                    {!isTravado && (
                    <div role="tablist" className="flex bg-gray-100 rounded-lg p-1">
                      {([["padrao", "Padrão"], ["fechamento", "Fechamento"], ["custom", "Personalizado"]] as const)
                        .filter(([mode]) => mode !== "fechamento" || !hideFechamentoTab)
                        .map(([mode, label]) => (
                        <button key={mode} role="tab" type="button"
                          aria-selected={(condModo[fId] ?? "padrao") === mode}
                          onClick={() => {
                            setCondModo(prev => ({ ...prev, [fId]: mode }));
                            if (mode === "custom" && !condCustomParcelas[fId]?.length) {
                              const hoje = new Date().toISOString().split("T")[0];
                              setCondCustomParcelas(prev => ({ ...prev, [fId]: [{ valor: fornTotal.toFixed(2), data: hoje }] }));
                            }
                          }}
                          className={`px-3.5 h-9 text-xs font-semibold rounded-md transition-all ${(condModo[fId] ?? "padrao") === mode ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    )}
                  </div>

                  {isTravado ? (() => {
                    const numParc = condicaoEfetiva!.numParcelas;
                    const prazo = condicaoEfetiva!.prazoParcela;
                    const valorParcela = fornTotal / numParc;
                    const hoje = new Date();
                    const parcelas = Array.from({ length: numParc }, (_, i) => {
                      const dt = new Date(hoje);
                      dt.setDate(dt.getDate() + prazo + (i * prazo));
                      return { num: i + 1, valor: valorParcela, data: dt };
                    });
                    return (
                      <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-100/70 border-b border-gray-200 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-700 tabular-nums">Total: {formatCurrency(fornTotal)}</span>
                          <span className="text-[11px] text-gray-600 tabular-nums">{numParc}x de {formatCurrency(valorParcela)}</span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[260px] overflow-y-auto">
                          {parcelas.map(p => (
                            <div key={p.num} className="flex items-center justify-between px-4 py-2">
                              <span className="text-xs text-gray-600 font-semibold w-20">{p.num}ª parcela</span>
                              <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(p.valor)}</span>
                              <span className="text-xs text-gray-500 tabular-nums">{p.data.toLocaleDateString("pt-BR")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })() : (condModo[fId] ?? "padrao") === "padrao" ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {TIPOS_PAGAMENTO.map(t => (
                          <button key={t.value} type="button" onClick={() => {
                            const newVal = editTipoPag[fId] === t.value ? "" : t.value;
                            setEditTipoPag(prev => ({ ...prev, [fId]: newVal }));
                            setEditCondPag(prev => ({ ...prev, [fId]: newVal ? t.label : "" }));
                          }}
                            className={`px-2 h-10 rounded-lg text-xs font-medium border-2 transition-all text-center ${editTipoPag[fId] === t.value ? "bg-violet-100 text-violet-700 border-violet-400 ring-2 ring-violet-200 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {editTipoPag[fId] && (() => {
                        const today = new Date().toISOString().split("T")[0];
                        const parcelas = calcularParcelas(editTipoPag[fId], fornTotal, today);
                        return parcelas.length > 0 ? (
                          <div className="bg-gradient-to-br from-violet-50 to-white border border-violet-200 rounded-xl p-4 mt-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">Prévia das Parcelas</p>
                              <span className="text-[11px] font-semibold text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">{parcelas.length}x</span>
                            </div>
                            <div className="space-y-1.5">
                              {parcelas.map((parc, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-violet-100">
                                  <span className="text-xs text-violet-600 font-semibold w-28">{parc.descricao}</span>
                                  <span className="text-sm text-violet-900 font-bold tabular-nums">{formatCurrency(parc.valor)}</span>
                                  <span className="text-[11px] text-violet-500 bg-violet-50 px-2 py-0.5 rounded tabular-nums">{new Date(parc.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-violet-200 flex justify-between text-sm font-bold text-violet-900">
                              <span>Total</span>
                              <span className="tabular-nums">{formatCurrency(fornTotal)}</span>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </>
                  ) : (condModo[fId] ?? "padrao") === "fechamento" ? (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Ciclo de Fechamento</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[{ v: "7", l: "7 dias" }, { v: "15", l: "15 dias" }, { v: "30", l: "30 dias" }, { v: "fixo", l: "Dias fixos" }].map(c => (
                              <button key={c.v} type="button" onClick={() => setCondFechCiclo(prev => ({ ...prev, [fId]: prev[fId] === c.v ? "" : c.v }))}
                                className={`px-2 h-10 rounded-lg text-xs font-medium border-2 transition-all text-center ${condFechCiclo[fId] === c.v ? "bg-blue-100 text-blue-700 border-blue-400 ring-2 ring-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                {c.l}
                              </button>
                            ))}
                          </div>
                          {condFechCiclo[fId] === "fixo" && (
                            <input type="text" placeholder="Ex: 1, 15" value={condFechDiaFixo[fId] ?? ""}
                              onChange={e => setCondFechDiaFixo(prev => ({ ...prev, [fId]: e.target.value }))}
                              className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 mt-2 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" />
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Prazo após Fechamento</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {["7", "14", "21", "28", "30", "60"].map(d => (
                              <button key={d} type="button" onClick={() => setCondFechPrazo(prev => ({ ...prev, [fId]: prev[fId] === d ? "" : d }))}
                                className={`px-2 h-10 rounded-lg text-xs font-medium border-2 transition-all text-center ${condFechPrazo[fId] === d ? "bg-blue-100 text-blue-700 border-blue-400 ring-2 ring-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                {d}d
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-end gap-4 flex-wrap pt-2 border-t border-gray-100">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Parcelas</p>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => {
                              const curr = parseInt(condFechParc[fId] ?? "1") || 1;
                              if (curr > 1) setCondFechParc(prev => ({ ...prev, [fId]: String(curr - 1) }));
                            }} className="w-9 h-9 flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold">−</button>
                            <input type="number" min="1" max="60" value={condFechParc[fId] ?? "1"}
                              onChange={e => { const v = parseInt(e.target.value); if (v > 0 && v <= 60) setCondFechParc(prev => ({ ...prev, [fId]: String(v) })); }}
                              className="w-14 h-9 text-center text-sm font-bold border border-gray-300 rounded-md bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-200" />
                            <button type="button" onClick={() => {
                              const curr = parseInt(condFechParc[fId] ?? "1") || 1;
                              if (curr < 60) setCondFechParc(prev => ({ ...prev, [fId]: String(curr + 1) }));
                            }} className="w-9 h-9 flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold">+</button>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">1ª Parcela</p>
                          <input type="date" value={condFechDataIni[fId] ?? ""}
                            onChange={e => setCondFechDataIni(prev => ({ ...prev, [fId]: e.target.value }))}
                            className="h-9 text-sm border border-gray-300 rounded-md px-3 bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
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
                          <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl overflow-hidden mt-3">
                            <div className="px-4 py-2.5 bg-blue-100/60 border-b border-blue-200 flex justify-between items-center">
                              <span className="text-xs font-bold text-blue-700 tabular-nums">Total: {formatCurrency(fornTotal)}</span>
                              <span className="text-[11px] text-blue-600 tabular-nums">{numParc}x de {formatCurrency(valorParcela)}</span>
                            </div>
                            <div className="divide-y divide-blue-100 max-h-[260px] overflow-y-auto">
                              {parcelas.map(p => (
                                <div key={p.num} className="flex items-center justify-between px-4 py-2">
                                  <span className="text-xs text-blue-600 font-semibold w-20">{p.num}ª parcela</span>
                                  <span className="text-sm font-bold text-blue-900 tabular-nums">{formatCurrency(p.valor)}</span>
                                  <span className="text-xs text-blue-500 tabular-nums">{p.data.toLocaleDateString("pt-BR")}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Qtd. Parcelas</p>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => {
                              const curr = condCustomParcelas[fId] ?? [];
                              if (curr.length > 1) setCondCustomParcelas(prev => ({ ...prev, [fId]: curr.slice(0, -1) }));
                            }} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-lg font-bold">−</button>
                            <span className="w-10 text-center text-sm font-bold text-gray-800">{(condCustomParcelas[fId] ?? []).length}</span>
                            <button type="button" onClick={() => {
                              const curr = condCustomParcelas[fId] ?? [];
                              const lastDate = curr.length > 0 ? curr[curr.length - 1].data : new Date().toISOString().split("T")[0];
                              const nextDate = new Date(lastDate + "T12:00:00");
                              nextDate.setDate(nextDate.getDate() + 30);
                              const restante = fornTotal - curr.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
                              setCondCustomParcelas(prev => ({ ...prev, [fId]: [...curr, { valor: Math.max(0, restante).toFixed(2), data: nextDate.toISOString().split("T")[0] }] }));
                            }} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-lg font-bold">+</button>
                          </div>
                        </div>
                        <button type="button" onClick={() => {
                          const curr = condCustomParcelas[fId] ?? [];
                          if (curr.length === 0) return;
                          const valorIgual = (fornTotal / curr.length).toFixed(2);
                          setCondCustomParcelas(prev => ({ ...prev, [fId]: curr.map(p => ({ ...p, valor: valorIgual })) }));
                        }} className="h-9 px-3 text-xs font-semibold bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors">
                          Dividir igual ({formatCurrency(fornTotal)})
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                        {(condCustomParcelas[fId] ?? []).map((parc, idx) => (
                          <div key={idx} className="flex items-end gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
                            <span className="text-sm font-bold text-violet-600 w-6 pb-2">{idx + 1}.</span>
                            <div className="flex-1">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Valor</label>
                              <input type="number" step="0.01" min="0" value={parc.valor}
                                onChange={e => {
                                  const updated = [...(condCustomParcelas[fId] ?? [])];
                                  updated[idx] = { ...updated[idx], valor: e.target.value };
                                  setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                                }}
                                className="w-full h-9 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none tabular-nums" />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Vencimento</label>
                              <input type="date" value={parc.data}
                                onChange={e => {
                                  const updated = [...(condCustomParcelas[fId] ?? [])];
                                  updated[idx] = { ...updated[idx], data: e.target.value };
                                  setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                                }}
                                className="w-full h-9 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                            </div>
                            <button type="button" onClick={() => {
                              const updated = (condCustomParcelas[fId] ?? []).filter((_, i) => i !== idx);
                              setCondCustomParcelas(prev => ({ ...prev, [fId]: updated }));
                            }} className="h-9 w-9 flex items-center justify-center rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {(() => {
                        const parcList = condCustomParcelas[fId] ?? [];
                        const totalCustom = parcList.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
                        const diff = fornTotal - totalCustom;
                        const ok = Math.abs(diff) < 0.01;
                        return (
                          <div className={`flex justify-between items-center px-4 py-3 rounded-lg border-2 ${ok ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
                            <span className="text-sm font-semibold text-gray-700">Total parcelas: <strong className="tabular-nums">{formatCurrency(totalCustom)}</strong></span>
                            {!ok && (
                              <span className={`text-sm font-bold tabular-nums ${diff > 0 ? "text-amber-700" : "text-red-700"}`}>
                                {diff > 0 ? `Faltam ${formatCurrency(diff)}` : `Excede ${formatCurrency(Math.abs(diff))}`}
                              </span>
                            )}
                            {ok && <span className="text-sm font-bold text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Valores batem</span>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </section>
                )}

                {/* Rev. 1996 — MDO+Parcelado precisa de Prazo (validação aprovação/OC L2242). Mini-card SEM CIF/FOB nem frete. */}
                {modoModal === "mdo" && mdoModoEfetivo === "parcelado" && (
                  <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm">
                    <SectionHeader Icon={Clock} color="bg-amber-100 text-amber-700" title="Prazo de Execução" hint={editPrazo[fId] ? `${editPrazo[fId]} dias` : "Obrigatório"} />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Prazo (dias)</label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input type="number" placeholder="Ex: 15" value={editPrazo[fId] ?? ""}
                            onChange={e => {
                              const dias = e.target.value;
                              setEditPrazo(prev => ({ ...prev, [fId]: dias }));
                              if (dias && parseInt(dias) > 0) {
                                const dt = new Date();
                                dt.setDate(dt.getDate() + parseInt(dias));
                                setEditDataEntrega(prev => ({ ...prev, [fId]: dt.toISOString().split("T")[0] }));
                              }
                            }}
                            className="w-full h-10 text-sm border border-gray-300 rounded-lg pl-9 pr-12 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">dias</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Data Prevista</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input type="date" value={editDataEntrega[fId] ?? ""}
                            onChange={e => {
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
                            className="w-full h-10 text-sm border border-gray-300 rounded-lg pl-9 pr-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {/* Coluna DIREITA — Entrega + Módulo (escondida inteira em MDO+parcelado e MDO sem modo) */}
              <div className={`space-y-5 lg:space-y-6 min-w-0 ${!showEntregaFrete && !showModuloMedicao ? "hidden" : ""}`}>
                {modoModal === "pacote" && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200 w-fit">
                    <Wallet className="w-3 h-3" /> Mão de Obra
                  </div>
                )}
                {showEntregaFrete && (() => {
                  const isMdoMedicao = (cotTipoEfetivo === "servico" || cotTipoEfetivo === "pacote") && (editTipoPag[fId] === "medicao" || (editCondPag[fId] ?? "").toLowerCase().includes("medição"));
                  const isFob = (editFreteTipo[fId] ?? "cif") === "fob";
                  return (
                    <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm">
                      <SectionHeader Icon={Truck} color="bg-amber-100 text-amber-700" title={isMdoMedicao ? "Mobilização & Frete" : "Entrega & Frete"} />
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">{isMdoMedicao ? "Prazo p/ Mobilização" : "Prazo de Entrega"}</label>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="number" placeholder={isMdoMedicao ? "Ex: 7" : "Ex: 15"} value={editPrazo[fId] ?? ""}
                              onChange={e => {
                                const dias = e.target.value;
                                setEditPrazo(prev => ({ ...prev, [fId]: dias }));
                                if (dias && parseInt(dias) > 0) {
                                  const dt = new Date();
                                  dt.setDate(dt.getDate() + parseInt(dias));
                                  setEditDataEntrega(prev => ({ ...prev, [fId]: dt.toISOString().split("T")[0] }));
                                }
                              }}
                              className="w-full h-10 text-sm border border-gray-300 rounded-lg pl-9 pr-12 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">dias</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">{isMdoMedicao ? "Data Início" : "Data Prevista"}</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            <input type="date" value={editDataEntrega[fId] ?? ""}
                              onChange={e => {
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
                              className="w-full h-10 text-sm border border-gray-300 rounded-lg pl-9 pr-3 bg-white text-gray-900 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none" />
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Tipo de Frete</label>
                          <div className="grid grid-cols-2 gap-2">
                            {([["cif", "CIF (incluso)"], ["fob", "FOB (por conta)"]] as const).map(([v, l]) => (
                              <button key={v} type="button" onClick={() => setEditFreteTipo(prev => ({ ...prev, [fId]: v }))}
                                className={`h-10 rounded-lg text-sm font-medium border-2 transition-all ${(editFreteTipo[fId] ?? "cif") === v ? "bg-amber-50 text-amber-700 border-amber-400 ring-2 ring-amber-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {isFob && (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Valor do Frete</label>
                              <input type="number" step="0.01" min="0" placeholder="R$ 0,00" value={editValorFrete[fId] ?? "0"}
                                onChange={e => setEditValorFrete(prev => ({ ...prev, [fId]: e.target.value }))}
                                className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none tabular-nums" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Transportadora</label>
                              <input type="text" placeholder="Nome da transportadora" value={editTransportadora[fId] ?? ""}
                                onChange={e => setEditTransportadora(prev => ({ ...prev, [fId]: e.target.value }))}
                                className="w-full h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  );
                })()}

                {/* Módulo de Medição — só MDO+medicao ou PACOTE */}
                {showModuloMedicao && (() => {
                  const MODULOS: { v: string; l: string; desc: string; Icon: LucideIcon; selRing: string; selBg: string; iconColor: string }[] = [
                    { v: "medicao_mensal", l: "Medição Mensal", desc: "Pagamento mensal por medição de serviço executado", Icon: Calendar, selRing: "ring-purple-200 border-purple-400", selBg: "bg-purple-50 text-purple-700", iconColor: "bg-purple-100 text-purple-600" },
                    { v: "medicao_avanco", l: "Medição por Avanço", desc: "Pagamento baseado no % de avanço físico", Icon: BarChart2, selRing: "ring-blue-200 border-blue-400", selBg: "bg-blue-50 text-blue-700", iconColor: "bg-blue-100 text-blue-600" },
                    { v: "medicao_etapa", l: "Medição por Etapa", desc: "Pagamento ao concluir etapas / marcos definidos", Icon: Target, selRing: "ring-green-200 border-green-400", selBg: "bg-green-50 text-green-700", iconColor: "bg-green-100 text-green-600" },
                    { v: "empreitada", l: "Empreitada Global", desc: "Preço fechado para o escopo total do serviço", Icon: ClipboardList, selRing: "ring-amber-200 border-amber-400", selBg: "bg-amber-50 text-amber-700", iconColor: "bg-amber-100 text-amber-600" },
                    { v: "administracao", l: "Administração", desc: "Custo por hora / dia + materiais aplicados", Icon: Clock, selRing: "ring-indigo-200 border-indigo-400", selBg: "bg-indigo-50 text-indigo-700", iconColor: "bg-indigo-100 text-indigo-600" },
                  ];
                  const selecionado = MODULOS.find(m => m.v === editModuloMedicao[fId]);
                  return (
                    <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm">
                      <SectionHeader Icon={BarChart2} color="bg-purple-100 text-purple-700" title="Módulo de Medição" hint={selecionado ? "Selecionado" : "Opcional"} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {MODULOS.map(m => {
                          const sel = editModuloMedicao[fId] === m.v;
                          return (
                            <button key={m.v} type="button"
                              onClick={() => setEditModuloMedicao(prev => ({ ...prev, [fId]: prev[fId] === m.v ? "" : m.v }))}
                              className={`flex items-start gap-3 p-3 rounded-xl text-left border-2 transition-all ${sel ? `${m.selBg} ${m.selRing} ring-2 shadow-sm` : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300"}`}>
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${sel ? "bg-white/80" : m.iconColor}`}>
                                <m.Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-sm font-semibold ${sel ? "" : "text-gray-700"}`}>{m.l}</div>
                                <div className={`text-[11px] mt-0.5 leading-snug ${sel ? "opacity-80" : "text-gray-500"}`}>{m.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selecionado && (
                        <div className={`mt-3 px-4 py-2.5 rounded-lg border ${selecionado.selBg} ${selecionado.selRing.replace("ring-", "border-").split(" ")[1]}`}>
                          <p className="text-sm font-medium">
                            <span className="opacity-70">Módulo selecionado:</span> <strong>{selecionado.l}</strong>
                          </p>
                        </div>
                      )}
                      {/* Rev. 5012 — Prazo do contrato: início da mobilização + duração (vão p/ a Cláusula 2ª do contrato) */}
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2.5">Prazo do Contrato</p>
                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Início da mobilização</label>
                            <input type="date" value={editMobilizacaoData[fId] ?? ""}
                              onChange={e => setEditMobilizacaoData(prev => ({ ...prev, [fId]: e.target.value }))}
                              className="block w-full max-w-full min-w-0 h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm appearance-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Duração do contrato (dias corridos)</label>
                            <input type="number" min="1" inputMode="numeric" placeholder="ex.: 120" value={editDuracaoDias[fId] ?? ""}
                              onChange={e => setEditDuracaoDias(prev => ({ ...prev, [fId]: e.target.value }))}
                              className="block w-full max-w-full min-w-0 h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm appearance-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none" />
                          </div>
                        </div>
                        {(() => {
                          const mob = editMobilizacaoData[fId] || "";
                          const dur = parseInt(editDuracaoDias[fId] || "0", 10) || 0;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(mob) || dur <= 0) return (
                            <p className="text-[11px] text-gray-400 mt-2">Definem as datas de início e término da Cláusula 2ª do contrato. Se ficarem em branco, as datas vêm do cronograma da obra.</p>
                          );
                          const d = new Date(`${mob}T12:00:00`);
                          d.setDate(d.getDate() + dur);
                          return (
                            <p className="text-xs text-purple-700 font-medium mt-2">
                              Contrato: {new Date(`${mob}T12:00:00`).toLocaleDateString("pt-BR")} → {d.toLocaleDateString("pt-BR")} ({dur} dias)
                            </p>
                          );
                        })()}
                      </div>
                    </section>
                  );
                })()}

                {/* Rev. 4284 — Adiantamento e Retenção de Garantia */}
                {showModuloMedicao && (() => {
                  const adiantAtivo = editAdiantamentoAtivo[fId] ?? false;
                  const adiantTipo = editAdiantamentoTipo[fId] ?? "pct";
                  const adiantPct = parseFloat(editAdiantamentoPct[fId] ?? "5") || 5;
                  const adiantVf = parseFloat(editAdiantamentoValorFixo[fId] ?? "0") || 0;
                  const adiantPrazo = editAdiantamentoPrazoDias[fId] ?? "7";
                  const adiantAmort = editAdiantamentoAmortizacao[fId] ?? "proporcional";
                  const adiantN = editAdiantamentoParcelasN[fId] ?? "1";
                  const retAtivo = editRetencaoAtiva[fId] ?? false;
                  const retLiberacao = editRetencaoLiberacao[fId] ?? "final";
                  const valorAdiant = adiantTipo === "pct"
                    ? Math.round(fornTotal * adiantPct) / 100
                    : adiantVf;
                  const pctCalculado = fornTotal > 0 && adiantTipo === "valor" && adiantVf > 0
                    ? (adiantVf / fornTotal * 100).toFixed(2)
                    : null;
                  const formatC = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                  const Toggle = ({ on, setOn, color }: { on: boolean; setOn: (v: boolean) => void; color: string }) => (
                    <button type="button" onClick={() => setOn(!on)}
                      className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${on ? color : "bg-gray-300"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  );
                  return (
                    <section className="rounded-xl border border-gray-200 bg-white p-5 lg:p-6 shadow-sm space-y-4">
                      <SectionHeader Icon={Banknote} color="bg-emerald-100 text-emerald-700" title="Adiantamento & Retenção" hint="Opcional" />

                      {/* ADIANTAMENTO */}
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="flex items-center gap-2.5">
                          <Toggle on={adiantAtivo} setOn={v => setEditAdiantamentoAtivo(prev => ({ ...prev, [fId]: v }))} color="bg-emerald-500" />
                          <span className="text-sm font-semibold text-gray-700">Adiantamento (sinal)</span>
                          {adiantAtivo && valorAdiant > 0 && (
                            <span className="ml-auto text-sm font-bold text-emerald-700 tabular-nums">{formatC(valorAdiant)}</span>
                          )}
                        </div>
                        {adiantAtivo && (
                          <>
                            <div className="flex gap-2 pt-1">
                              {(["pct", "valor"] as const).map(t => (
                                <button key={t} type="button"
                                  onClick={() => setEditAdiantamentoTipo(prev => ({ ...prev, [fId]: t }))}
                                  className={`flex-1 h-9 text-sm rounded-lg border-2 font-medium transition-all ${adiantTipo === t ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                                  {t === "pct" ? "% do total" : "Valor fixo"}
                                </button>
                              ))}
                            </div>
                            {adiantTipo === "pct" ? (
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Percentual do sinal</label>
                                <div className="flex items-center gap-2">
                                  <input type="number" step="0.1" min="0" max="100"
                                    value={editAdiantamentoPct[fId] ?? "5"}
                                    onChange={e => setEditAdiantamentoPct(prev => ({ ...prev, [fId]: e.target.value }))}
                                    className="w-24 h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none tabular-nums" />
                                  <span className="text-sm text-gray-500">% → {formatC(valorAdiant)}</span>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Valor do sinal (R$)</label>
                                <div className="flex items-center gap-2">
                                  <input type="number" step="0.01" min="0"
                                    placeholder="0,00"
                                    value={editAdiantamentoValorFixo[fId] ?? ""}
                                    onChange={e => setEditAdiantamentoValorFixo(prev => ({ ...prev, [fId]: e.target.value }))}
                                    className="w-40 h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none tabular-nums" />
                                  {pctCalculado && <span className="text-sm text-gray-500">({pctCalculado}% do total)</span>}
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Prazo após assinatura</label>
                              <div className="flex items-center gap-2">
                                <input type="number" step="1" min="0"
                                  value={adiantPrazo}
                                  onChange={e => setEditAdiantamentoPrazoDias(prev => ({ ...prev, [fId]: e.target.value }))}
                                  className="w-20 h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none tabular-nums" />
                                <span className="text-sm text-gray-500">DDL</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Amortização</label>
                              <div className="flex gap-2">
                                {(["proporcional", "parcelas_fixas"] as const).map(a => (
                                  <button key={a} type="button"
                                    onClick={() => setEditAdiantamentoAmortizacao(prev => ({ ...prev, [fId]: a }))}
                                    className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium transition-all ${adiantAmort === a ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                                    {a === "proporcional" ? "Proporcional" : "Parcelas fixas"}
                                  </button>
                                ))}
                              </div>
                              {adiantAmort === "parcelas_fixas" && (
                                <div className="mt-2 flex items-center gap-2">
                                  <input type="number" step="1" min="1"
                                    value={adiantN}
                                    onChange={e => setEditAdiantamentoParcelasN(prev => ({ ...prev, [fId]: e.target.value }))}
                                    className="w-20 h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none tabular-nums" />
                                  <span className="text-sm text-gray-500">medições ≈ {formatC(valorAdiant / Math.max(1, parseInt(adiantN || "1")))}/medição</span>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* RETENÇÃO */}
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="flex items-center gap-2.5">
                          <Toggle on={retAtivo} setOn={v => setEditRetencaoAtiva(prev => ({ ...prev, [fId]: v }))} color="bg-amber-500" />
                          <span className="text-sm font-semibold text-gray-700">Retenção de Garantia</span>
                          {retAtivo && (
                            <span className="ml-auto text-xs text-amber-700 font-medium">
                              {editRetencaoPct[fId] ?? "5"}% / medição
                            </span>
                          )}
                        </div>
                        {retAtivo && (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Reter por medição</label>
                              <div className="flex items-center gap-2">
                                <input type="number" step="0.1" min="0" max="100"
                                  value={editRetencaoPct[fId] ?? "5"}
                                  onChange={e => setEditRetencaoPct(prev => ({ ...prev, [fId]: e.target.value }))}
                                  className="w-24 h-10 text-sm border border-gray-300 rounded-lg px-3 bg-white text-gray-900 focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none tabular-nums" />
                                <span className="text-sm text-gray-500">% do bruto de cada medição</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Liberação</label>
                              <div className="flex gap-2">
                                {(["final", "etapas"] as const).map(l => (
                                  <button key={l} type="button"
                                    onClick={() => setEditRetencaoLiberacao(prev => ({ ...prev, [fId]: l }))}
                                    className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium transition-all ${retLiberacao === l ? "bg-amber-50 border-amber-400 text-amber-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                                    {l === "final" ? "Encerramento do contrato" : "Em etapas"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Footer sticky */ /* Rev. 1996 — mdoSemModo também desabilita Salvar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50/90 backdrop-blur px-5 lg:px-8 py-3.5 lg:py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs min-w-0 truncate flex items-center gap-2">
              <span className="font-medium text-gray-700 truncate">{fornNome}</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-violet-700 tabular-nums">Total: {formatCurrency(fornTotal)}</span>
              {customInvalid && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Ajuste as parcelas para {formatCurrency(fornTotal)}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setCondModalFornId(null)} className="h-10 px-5 text-gray-600">
                Fechar
              </Button>
              <span title={customInvalid ? customMotivo : mdoSemModo ? "Escolha Medição ou Parcelado para continuar" : undefined} className="inline-flex">
              <Button
                disabled={salvarCondicoesComerciais.isPending || customInvalid || mdoSemModo}
                onClick={handleSalvar}
                aria-disabled={customInvalid || mdoSemModo || salvarCondicoesComerciais.isPending}
                className="h-10 px-6 bg-violet-600 hover:bg-violet-700 text-white font-semibold shadow-sm shadow-violet-200 gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {salvarCondicoesComerciais.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                ) : (
                  <><Save className="w-4 h-4" /> Confirmar e Salvar</>
                )}
              </Button>
              </span>
            </div>
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
      const totaisVivos: Record<number, number> = (mapa as any).totaisPorFornecedor ?? {};
      const getTotal = (p: any) => {
        const stored = parseFloat(p.totalOrcado ?? "0");
        return Object.prototype.hasOwnProperty.call(totaisVivos, p.fornecedorId)
          ? Number(totaisVivos[p.fornecedorId] ?? 0)
          : stored;
      };
      const comTotal = mapa.participantes.filter((p: any) => getTotal(p) > 0);
      if (comTotal.length === 0) return null;
      return comTotal.reduce((best: any, curr: any) => {
        const bTotal = getTotal(best);
        const cTotal = getTotal(curr);
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

    function garantirMapaCarregado(): boolean {
      if (mapa) return true;
      setAbaAtiva("mapa");
      toast.info("Carregando o Mapa de Cotação para concluir esta ação.");
      return false;
    }

    function validarCondicoesVencedor(): boolean {
      if (!garantirMapaCarregado()) return false;
      if (!fornParaSaldo) {
        setValidacaoErroInfo({
          titulo: "Nenhum fornecedor vencedor identificado",
          mensagem: "Não foi possível identificar o fornecedor vencedor desta cotação. Acesse o Mapa de Cotação, verifique se os fornecedores enviaram propostas com preços preenchidos e, se necessário, clique em \"Selecionar como Vencedor\" no fornecedor desejado.",
          irParaMapa: true,
        });
        setShowValidacaoErroDialog(true);
        return false;
      }
      // Fallback para condição de pagamento da cotação (igual lógica do servidor)
      const condPag = (fornParaSaldo as any).condicaoPagamento
        || (fornParaSaldo as any).formaPagamento
        || (detalheFullscreen as any)?.condicaoPagamento
        || (detalheFullscreen as any)?.formaPagamento;
      const prazo = (fornParaSaldo as any).prazoEntregaDias ?? (detalheFullscreen as any)?.prazoEntregaDias;
      const tipoPag = (fornParaSaldo as any).tipoPagamento ?? (detalheFullscreen as any)?.tipoPagamento ?? "";
      const cotTipoVal = (detalheFullscreen as any)?.tipo ?? (mapaQ.data as any)?.tipoEfetivo ?? (mapaQ.data?.cotacao as any)?.tipo;
      // Rev. 2073 — Pedido do usuário (IMG_0979): "mão de obra não tem
      // prazo de entrega, arrume a lógica, somente material tem isso".
      // MDO puro (tipo='servico') NUNCA tem prazo de entrega — o modal
      // já esconde o campo (L1536 `showEntregaFrete = modoModal !== "mdo"`).
      // Pacote (material+MDO) continua exigindo prazo pro material, exceto
      // no modo medição (mobilização ao invés de prazo).
      const isServicoPuro = cotTipoVal === "servico";
      const isMdoMedicao = (cotTipoVal === "servico" || cotTipoVal === "pacote") && (tipoPag === "medicao" || (condPag ?? "").toLowerCase().includes("medição"));
      const dispensaPrazo = isServicoPuro || isMdoMedicao;
      // Rev. 5008 → 5053: a exigência da proposta comercial (Anexo I) saiu deste
      // pré-check e virou a etapa "Proposta" DENTRO do wizard Preparar Contrato
      // (pedido do user IMG_5550/5552 — anexar/ver/substituir numa tela só).
      const erros: string[] = [];
      if (!condPag) erros.push("Forma de Pagamento");
      if (!dispensaPrazo && (!prazo || Number(prazo) <= 0)) erros.push("Prazo de Entrega");
      if (erros.length > 0) {
        const nomeForn = (fornParaSaldo as any).fornecedor?.nomeFantasia || (fornParaSaldo as any).fornecedor?.razaoSocial || "do fornecedor vencedor";
        setValidacaoErroInfo({
          titulo: `Informações obrigatórias faltando — ${nomeForn}`,
          // Rev. 2071 — Formato com bullets em linha própria. Antes, com
          // 1 erro só, a string ficava "...preencher: • Prazo de Entrega"
          // numa única linha — o parser do dialog (L5661) filtra linhas
          // que COMEÇAM com "•" e não pegava nenhuma → badge mostrava
          // "0 PENDÊNCIAS" mesmo com erro visível.
          mensagem: `Para gerar a Ordem de Compra, é necessário preencher:\n${erros.map(e => `• ${e}`).join("\n")}\n\nComo corrigir: acesse o Mapa de Cotação, localize o card de ${nomeForn}, clique em "Editar", preencha os campos indicados e clique em "Salvar".`,
          irParaMapa: true,
        });
        setShowValidacaoErroDialog(true);
        return false;
      }
      return true;
    }

    // Detecta se condições comerciais do vencedor estão faltando (para alerta visual)
    // Inclui fallback para condição de pagamento da cotação (mesma lógica do servidor)
    const condPagVencedor = fornParaSaldo
      ? ((fornParaSaldo as any).condicaoPagamento || (fornParaSaldo as any).formaPagamento
          || (detalheFullscreen as any)?.condicaoPagamento || (detalheFullscreen as any)?.formaPagamento)
      : true;
    const prazoVencedor = fornParaSaldo
      ? ((fornParaSaldo as any).prazoEntregaDias ?? (detalheFullscreen as any)?.prazoEntregaDias)
      : true;
    const cotTipoVencedor = (mapaQ.data as any)?.tipoEfetivo ?? (mapaQ.data?.cotacao as any)?.tipo;
    const tipoPagVencedor = fornParaSaldo ? ((fornParaSaldo as any).tipoPagamento ?? "") : "";
    const isServicoPuroVencedor = cotTipoVencedor === "servico";
    const isMdoMedicaoVencedor = (cotTipoVencedor === "servico" || cotTipoVencedor === "pacote") && (tipoPagVencedor === "medicao" || (condPagVencedor ?? "").toLowerCase?.().includes("medição"));
    // Rev. 2073 — MDO puro (servico) nunca exige prazo de entrega.
    const dispensaPrazoVencedor = isServicoPuroVencedor || isMdoMedicaoVencedor;
    const condicoesIncompletas = detalheFullscreen?.status === "pendente" && fornParaSaldo && (!condPagVencedor || (!dispensaPrazoVencedor && (!prazoVencedor || Number(prazoVencedor) <= 0)));

    function handleAbrirCotacaoParcial(cotacaoId: number) {
      if (!garantirMapaCarregado()) return;
      const itensDoMapa: any[] = mapa?.itens ?? [];
      const participantes: any[] = mapa?.participantes ?? [];
      if (itensDoMapa.length === 0 || participantes.length === 0) {
        toast.error("Mapa de Cotação ainda não carregado ou sem participantes. Aguarde e tente novamente.");
        return;
      }

      const itensJaEmOC: number[] = [...new Set([...(mapa?.itensJaEmOC ?? []), ...localItensEmOC])];
      const itensPendentes = itensDoMapa.filter((it: any) => !itensJaEmOC.includes(it.id));

      if (itensPendentes.length === 0) {
        toast.success("Todos os itens desta cotação já foram processados em Ordens de Compra.");
        return;
      }

      const itensParaFechamento = itensPendentes.map((it: any) => {
        let melhorFornId = melhorForn?.fornecedorId ?? (participantes[0]?.fornecedorId ?? 0);
        let melhorTotal = Infinity;
        for (const p of participantes) {
          const key = `${it.id}_${p.fornecedorId}`;
          const resp = mapa?.respostaMap?.[key];
          if (resp) {
            const total = parseFloat((resp as any).total ?? "0");
            if (total > 0 && total < melhorTotal) {
              melhorTotal = total;
              melhorFornId = p.fornecedorId;
            }
          }
        }
        return {
          itemId: it.id,
          fornecedorId: melhorFornId,
          incluir: melhorFornId > 0,
          descricao: it.descricao ?? `Item #${it.id}`,
        };
      }).filter(it => it.fornecedorId > 0);

      setPendingGerarOCParams({ cotacaoId });
      setFechamentoParcialItens(itensParaFechamento);
      setShowFechamentoParcialDialog(true);
    }

    function handleAprovarGerarOC(cotacaoId: number) {
      if (!garantirMapaCarregado()) return;
      if (temItensSemVerba && !semVerbaAutorizado) {
        setSemVerbaAdminEmail("");
        setSemVerbaAdminSenha("");
        setSemVerbaJustificativa("");
        setShowSemVerbaDialog(true);
        return;
      }
      setPendingGerarOCParams({
        cotacaoId,
        ...(semVerbaAutorizado ? { autorizacaoSemVerba: semVerbaAutorizado } : {}),
      });
      // Rev. 2091 — Quando o vencedor é o Almoxarifado (Atender pelo Estoque), abrir o modal
      // de Transferência (escolher obra de ORIGEM) ao invés do flow normal de OC.
      // Replica a regra do backend (`criarOrdemDeCotacao`): vencedor é o `selecionado`,
      // senão fallback pro participante de menor `totalOrcado` > 0. Sem isso, casos
      // sem `selecionado` explícito (fallback do backend) cairiam no flow antigo.
      const participantes: any[] = (mapa?.participantes ?? []) as any[];
      const vencSelecionado = participantes.find(p => p.selecionado === true);
      const fallback = melhorForn;
      // Rev. 2501 — Estoque (Almoxarifado) não tem totalOrcado (não é proposta monetária),
      // então cai fora do fallback acima. Se ele é o único participante ou todos os
      // fornecedores ficaram sem proposta com preço, ele é o vencedor de facto e o
      // flow correto é abrir o modal de Transferência (não "Aprovar e Gerar OC").
      const estoqueParticipante = participantes.find(p => p.isEstoque);
      const vencForBackend = vencSelecionado ?? fallback ?? estoqueParticipante;
      const vencEst = !!vencForBackend?.isEstoque;
      if (vencEst) {
        setTransfObraOrigemId(undefined);
        setShowTransferenciaDialog(true);
        return;
      }
      setShowConfirmarTipoCotDialog(true);
    }

    async function handleConfirmarTotal() {
      setShowConfirmarTipoCotDialog(false);
      if (!validarCondicoesVencedor()) return;
      const fornTotal = fornParaSaldo ? getFornTotal(fornParaSaldo) : 0;
      // Usa o saldo pacote-aware (mesmo cálculo da tabela). Antes somava insumos crus do mapa,
      // o que estourava falso "déficit" em cotações por pacote mesmo havendo CRÉDITO (ex.: COT-2026-0283).
      if (deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado) {
        const defVal = deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const fornNome = fornParaSaldo?.fornecedor?.nomeFantasia || fornParaSaldo?.fornecedor?.razaoSocial || "Fornecedor";
        const ok = await confirm({
          title: "Valor acima da meta orçamentária",
          description:
            `O valor do fornecedor ${fornNome} (${fornTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) ` +
            `está acima da meta orçamentária (${metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).\n\n` +
            `Déficit: ${defVal}\n\n` +
            `Recomendamos utilizar o painel de Realocação de Verba antes de aprovar.\n\n` +
            `Deseja continuar mesmo assim?`,
          tone: "warning",
          confirmText: "Continuar mesmo assim",
          cancelText: "Cancelar",
        });
        if (!ok) return;
      }
      setShowGerarOCModeDialog(true);
    }

    function handleConfirmarParcial() {
      setShowConfirmarTipoCotDialog(false);
      const itensDoMapa: any[] = mapa?.itens ?? [];
      const participantes: any[] = mapa?.participantes ?? [];
      const itensParaFechamento = itensDoMapa.map((it: any) => {
        let fId = vencedorPorItem[it.id];
        if (!fId) {
          let melhorTotal = Infinity;
          for (const p of participantes) {
            const key = `${it.id}_${p.fornecedorId}`;
            const resp = mapa?.respostaMap?.[key];
            if (resp) {
              const total = parseFloat((resp as any).total ?? "0");
              if (total > 0 && total < melhorTotal) {
                melhorTotal = total;
                fId = p.fornecedorId;
              }
            }
          }
          if (!fId) fId = melhorForn?.fornecedorId ?? (participantes[0]?.fornecedorId ?? 0);
        }
        return { itemId: it.id, fornecedorId: fId ?? 0, incluir: !!(fId && fId > 0), descricao: it.descricao ?? `Item #${it.id}` };
      }).filter(it => it.fornecedorId > 0);
      setFechamentoParcialItens(itensParaFechamento);
      setShowFechamentoParcialDialog(true);
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

    function calcNegociadoPreview(fornecedorId: number, valorInput: string, grupo?: string, itemIds?: number[]) {
      if (!mapa) return [];
      // Rev. 5132/5135 — negociar por região OU por seleção livre de itens
      const selSet = itemIds && itemIds.length > 0 ? new Set(itemIds) : null;
      const itens = (mapa.itens ?? []).filter((it: any) =>
        selSet ? selSet.has(it.id)
               : (!grupo || String(it.eapPath || it.parentEapDescricao || "").trim() === grupo)
      );
      const parseBR = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

      // Rev. 4998 — cotação de serviço: o total do item vem dos campos MAT/MDO
      // (digitados ou salvos), não do preço unitário. O rateio precisa ler e
      // reescrever esses campos, senão o "fechado a X" não bate no salvar.
      const isServicoNeg = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === "servico";
      const itemTotais = itens.map((it: any) => {
        const key = `${it.id}_${fornecedorId}`;
        let precoAtual = parseBRNumber(editPrecos[key] ?? "0") || 0;
        const qtd = parseBRNumber(editQtds[key] ?? String(it.quantidade ?? "1")) || 1;
        let usaMatMdo = false;
        let matRatio = 0;
        let total = precoAtual * qtd;
        if (isServicoNeg && !it._isPacoteGroup && !it._grouped) {
          // editMatMdo guarda preço UNITÁRIO (Rev. 4998); saved totalMat/totalMdo são TOTAIS.
          const savedRr: any = mapa?.respostaMap?.[key];
          const mat = editMatMdo[key]?.mat != null ? (parseBRNumber(editMatMdo[key].mat) || 0) * qtd : (parseFloat(savedRr?.totalMat ?? "0") || 0);
          const mdo = editMatMdo[key]?.mdo != null ? (parseBRNumber(editMatMdo[key].mdo) || 0) * qtd : (parseFloat(savedRr?.totalMdo ?? "0") || 0);
          const totMatMdo = mat + mdo;
          if (totMatMdo > 0) {
            usaMatMdo = true;
            matRatio = mat / totMatMdo;
            total = totMatMdo;
            precoAtual = qtd > 0 ? totMatMdo / qtd : totMatMdo;
          }
        }
        return { id: it.id, descricao: it.descricao ?? it.titulo ?? `Item #${it.id}`, precoAtual, qtd, total, key, usaMatMdo, matRatio };
      });

      const totalGeral = itemTotais.reduce((s, i) => s + i.total, 0);
      if (totalGeral <= 0) return [];

      const valorFinal = parseBR(valorInput);
      if (valorFinal <= 0 || valorFinal === totalGeral) return [];

      const diferenca = valorFinal - totalGeral;
      const targetTotal = valorFinal;

      // Rev. 4259 — para cotações PACOTE, itens filho têm precoAtual=0 (peso=0) e não recebem
      // totalOverride no save. Aplicar o resíduo de arredondamento no ÚLTIMO item com total>0
      // garante que a correção caia sempre num item de composição que é salvo com totalOverride.
      let lastNonZeroIdx = itemTotais.length - 1;
      for (let i = itemTotais.length - 1; i >= 0; i--) {
        if (itemTotais[i].total > 0) { lastNonZeroIdx = i; break; }
      }

      let acumulado = 0;
      const result = itemTotais.map((it, idx) => {
        const peso = it.total / totalGeral;
        let difItem: number;
        if (idx === lastNonZeroIdx) {
          difItem = Math.round((diferenca - acumulado) * 100) / 100;
        } else {
          difItem = Math.round(diferenca * peso * 100) / 100;
          acumulado += difItem;
        }
        if (it.usaMatMdo) {
          // Serviço MAT/MDO: o total salvo é mat+mdo (2 casas), então o novo total
          // pode ser exato mesmo que o unitário vire dízima — o unitário é derivado.
          const novoTotal = Math.max(0, Math.round((it.total + difItem) * 100) / 100);
          const novoPreco = it.qtd > 0 ? Math.round((novoTotal / it.qtd) * 100) / 100 : novoTotal;
          return { ...it, difItem, novoPreco, novoTotal };
        }
        const novoPreco = Math.max(0, Math.round((it.precoAtual + difItem / it.qtd) * 100) / 100);
        return { ...it, difItem, novoPreco, novoTotal: Math.round(novoPreco * it.qtd * 100) / 100 };
      });

      const somaNovoTotal = result.reduce((s, i) => s + i.novoTotal, 0);
      const diff = Math.round((targetTotal - somaNovoTotal) * 100) / 100;
      if (diff !== 0 && result.length > 0) {
        const last = result[lastNonZeroIdx];
        last.novoTotal = Math.round((last.novoTotal + diff) * 100) / 100;
        if ((last as any).usaMatMdo) {
          // total salvo = mat+mdo, não preco×qtd — o resíduo entra direto no total
          last.novoPreco = last.qtd > 0 ? Math.round((last.novoTotal / last.qtd) * 100) / 100 : last.novoTotal;
        } else if (last.qtd > 0) {
          last.novoPreco = Math.round((last.novoTotal / last.qtd) * 100) / 100;
          last.novoTotal = Math.round(last.novoPreco * last.qtd * 100) / 100;
          const diffFinal = Math.round((targetTotal - result.reduce((s, i) => s + i.novoTotal, 0)) * 100) / 100;
          if (diffFinal !== 0) last.novoTotal = Math.round((last.novoTotal + diffFinal) * 100) / 100;
        }
        last.difItem = Math.round((last.novoTotal - last.total) * 100) / 100;
      }

      return result;
    }

    function aplicarNegociado() {
      if (!negociadoModal) return;
      const preview = calcNegociadoPreview(negociadoModal.fornecedorId, negociadoValor, negociadoModal.grupo, negociadoModal.itemIds);
      if (!preview.length) return;
      const updates: Record<string, string> = {};
      const totaisUpdates: Record<string, number> = {};
      const matMdoUpdates: Record<string, { mat: string; mdo: string }> = {};
      const fmtBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      for (const it of preview) {
        updates[it.key] = it.novoPreco.toFixed(2);
        totaisUpdates[it.key] = it.novoTotal;
        if ((it as any).usaMatMdo) {
          // Rev. 4998 — reescreve MAT/MDO (preço UNITÁRIO) mantendo a proporção do
          // item; o total exato fica garantido pelo editTotaisOverride, que tem
          // precedência no salvar (o unitário pode virar dízima, sem problema).
          const novoMat = Math.round(it.novoTotal * (it as any).matRatio * 100) / 100;
          const novoMdo = Math.round((it.novoTotal - novoMat) * 100) / 100;
          const q = it.qtd > 0 ? it.qtd : 1;
          const fmtUnitBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
          matMdoUpdates[it.key] = { mat: fmtUnitBR(novoMat / q), mdo: fmtUnitBR(novoMdo / q) };
        }
      }
      setEditPrecos(prev => ({ ...prev, ...updates }));
      setEditTotaisOverride(prev => ({ ...prev, ...totaisUpdates }));
      if (Object.keys(matMdoUpdates).length > 0) setEditMatMdo(prev => ({ ...prev, ...matMdoUpdates }));
      setNegociadoModal(null);
      setNegociadoValor("");
      setNegociadoPreviewing(false);
      toast.success("Valor negociado aplicado! Clique 'Salvar' para gravar.");
    }

    function handleSalvarPrecos(fornecedorId: number) {
      if (!mapa || !showDetalhe) return;
      const isPacote = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
      // Rev. 5079 — item NÃO alterado pelo usuário preserva o total salvo (fonte autoritativa).
      // preco_unitario é armazenado com 4dp (arredondado), então recomputar preco×qty no server
      // muda o total a cada salvamento sem alteração (ex.: R$ 180.000,00 → R$ 179.999,76).
      const respMapaSalvar = ((mapa as any)?.respostaMap ?? {}) as Record<string, any>;
      const origTotaisSeNaoAlterado = (key: string): { totalOverride: number; totalMat?: number; totalMdo?: number } | null => {
        const o = respMapaSalvar[key];
        if (!o || !(parseFloat(o.total ?? "0") > 0)) return null;
        if (editTotaisOverride[key] !== undefined) return null; // user negociou valor novo
        const curPreco = editPrecos[key] ?? (o.precoUnitario ?? "0");
        const curQty = editQtds[key] ?? (o.quantidade ?? "0");
        if (curPreco !== (o.precoUnitario ?? "0") || curQty !== (o.quantidade ?? "0")) return null; // user alterou
        return {
          totalOverride: parseFloat(o.total),
          totalMat: o.totalMat != null && parseFloat(o.totalMat) > 0 ? parseFloat(o.totalMat) : undefined,
          totalMdo: o.totalMdo != null && parseFloat(o.totalMdo) > 0 ? parseFloat(o.totalMdo) : undefined,
        };
      };
      let respostas: Array<{ itemId: number; precoUnitario: number; descontoPct: number; quantidade: number; totalOverride?: number }>;
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
          const precoComp = parseBRNumber(editPrecos[firstKey] ?? "0") || 0;
          const compMatMdo = editMatMdo[firstKey];
          const compTotalMat = compMatMdo ? (parseBRNumber(compMatMdo.mat) || 0) : undefined;
          const compTotalMdo = compMatMdo ? (parseBRNumber(compMatMdo.mdo) || 0) : undefined;
          const keepComp = origTotaisSeNaoAlterado(firstKey);
          respostas.push({ itemId: first.id, precoUnitario: precoComp, descontoPct: 0, quantidade: compQtd, totalOverride: editTotaisOverride[firstKey] ?? keepComp?.totalOverride, ...(compTotalMat != null || compTotalMdo != null ? { totalMat: compTotalMat, totalMdo: compTotalMdo } : {}) });
          for (let i = 1; i < items.length; i++) {
            respostas.push({ itemId: items[i].id, precoUnitario: 0, descontoPct: 0, quantidade: 0 });
          }
        }
        for (const it of noComp) {
          const key = `${it.id}_${fornecedorId}`;
          const qtyStr = editQtds[key];
          const qty = qtyStr && parseBRNumber(qtyStr) > 0 ? parseBRNumber(qtyStr) : parseFloat(it.quantidade);
          const keepNC = origTotaisSeNaoAlterado(key);
          respostas.push({ itemId: it.id, precoUnitario: parseBRNumber(editPrecos[key] ?? "0") || 0, descontoPct: 0, quantidade: qty, totalOverride: editTotaisOverride[key] ?? keepNC?.totalOverride });
        }
      } else {
        const tipoEfetivoSalvar = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo);
        respostas = mapa.itens.map((it: any) => {
          const key = `${it.id}_${fornecedorId}`;
          const qtyStr = editQtds[key];
          const qty = qtyStr && parseBRNumber(qtyStr) > 0 ? parseBRNumber(qtyStr) : parseFloat(it.quantidade);
          // Rev. 4998 — MAT/MDO digitados são preço UNITÁRIO; totais = unit × qty.
          // editTotaisOverride (Valor Negociado) tem precedência p/ fechar no centavo.
          const matUnit = tipoEfetivoSalvar === "servico" ? (parseBRNumber(editMatMdo[key]?.mat ?? "0") || 0) : 0;
          const mdoUnit = tipoEfetivoSalvar === "servico" ? (parseBRNumber(editMatMdo[key]?.mdo ?? "0") || 0) : 0;
          const matVal = Math.round(matUnit * qty * 100) / 100;
          const mdoVal = Math.round(mdoUnit * qty * 100) / 100;
          const matMdoTotal = matVal + mdoVal;
          // Rev. 5079 — sem alteração → preserva total/totalMat/totalMdo salvos (evita drift)
          const keep = origTotaisSeNaoAlterado(key);
          if (keep) {
            return {
              itemId: it.id,
              precoUnitario: matUnit + mdoUnit > 0 ? matUnit + mdoUnit : parseBRNumber(editPrecos[key] ?? "0") || 0,
              descontoPct: 0,
              quantidade: qty,
              totalOverride: keep.totalOverride,
              totalMat: keep.totalMat,
              totalMdo: keep.totalMdo,
            };
          }
          return {
            itemId: it.id,
            precoUnitario: matUnit + mdoUnit > 0 ? matUnit + mdoUnit : parseBRNumber(editPrecos[key] ?? "0") || 0,
            descontoPct: 0,
            quantidade: qty,
            totalOverride: editTotaisOverride[key] ?? (matMdoTotal > 0 ? matMdoTotal : undefined),
            totalMat: matVal > 0 ? matVal : undefined,
            totalMdo: mdoVal > 0 ? mdoVal : undefined,
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
        mobilizacaoDataInicio: editMobilizacaoData[fornecedorId] !== undefined ? (editMobilizacaoData[fornecedorId] || "") : undefined,
        duracaoContratoDias: editDuracaoDias[fornecedorId] !== undefined ? (parseInt(editDuracaoDias[fornecedorId] || "0", 10) || 0) : undefined,
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
              const preco = parseBRNumber(editPrecos[firstKey] ?? "0") || 0;
              const compQtd = (it as any).composicaoQtdOrcada || parseFloat(it.quantidade ?? "0");
              totalItens += preco * compQtd;
            } else {
              const key = `${it.id}_${p.fornecedorId}`;
              const preco = parseBRNumber(editPrecos[key] ?? "0") || 0;
              const qtyStr = editQtds[key];
              const qty = qtyStr && parseBRNumber(qtyStr) > 0 ? parseBRNumber(qtyStr) : parseFloat(it.quantidade);
              totalItens += preco * qty;
            }
          }
        } else {
          totalItens = (mapa?.itens ?? []).reduce((acc: number, it: any) => {
            const key = `${it.id}_${p.fornecedorId}`;
            const preco = parseBRNumber(editPrecos[key] ?? "0") || 0;
            const qtyStr = editQtds[key];
            const qty = qtyStr && parseBRNumber(qtyStr) > 0 ? parseBRNumber(qtyStr) : parseFloat(it.quantidade);
            return acc + preco * qty;
          }, 0);
        }
        const isFob = (editFreteTipo[p.fornecedorId] ?? "cif") === "fob";
        const frete = isFob ? (parseFloat(editValorFrete[p.fornecedorId] ?? "0") || 0) : 0;
        return totalItens + frete;
      }
      const totaisPersistidos = (mapa as any)?.totaisPorFornecedor ?? {};
      return Object.prototype.hasOwnProperty.call(totaisPersistidos, p.fornecedorId)
        ? Number(totaisPersistidos[p.fornecedorId] ?? 0)
        : parseFloat(p.totalOrcado ?? "0");
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
      // Respostas já salvas usam o total persistido, pois preço unitário ×
      // quantidade pode divergir alguns centavos do valor negociado.
      const emEdicao = editingFornId === fornParaSaldo.fornecedorId;
      const precoForn = emEdicao
        ? parseBRNumber(editPrecos[wKey] ?? "0")
        : parseFloat(wResp?.precoUnitario ?? "0");
      const qtdEmEdicao = parseBRNumber(editQtds[wKey] ?? "") || qtdItem;
      const custoAtual = emEdicao
        ? precoForn * qtdEmEdicao
        : parseFloat(wResp?.total ?? "0");
      const metaTotal = parseFloat((it as any).metaFinanceiraTotal ?? "0") || (metaUnit * qtdItem);
      const comprasAnteriores = parseFloat((it as any).valorComprometidoAnterior ?? "0");
      return { saldo: metaTotal - comprasAnteriores - custoAtual, hasMeta: true };
    }

    // Rev. 4003 — Monta as linhas item × fornecedor do Mapa de Cotação
    // (mesma fonte de dados usada na tabela em tela) para reaproveitar
    // tanto no "Exportar PDF" quanto no "Exportar Excel".
    function montarLinhasExportacao() {
      const participantes = mapa?.participantes ?? [];
      const itens = mapa?.itens ?? [];
      const fmtQtd = (v: any) => { const n = parseFloat(String(v ?? "0")); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0"; };
      const linhas = itens.map((it: any) => {
        const metaUnitRaw = parseFloat(it.metaUnitario ?? "0");
        const metaUnit = Math.round(metaUnitRaw * 100) / 100;
        const metaQtdVal = parseFloat(it.metaQtd ?? it.quantidade ?? "0");
        const metaTot = Math.round(metaUnit * metaQtdVal * 100) / 100;
        const melhorPreco = getMelhorPrecoItem(it.id);
        const porFornecedor = participantes.map((p: any) => {
          const resp = mapa?.respostaMap?.[`${it.id}_${p.fornecedorId}`];
          const precoUnit = resp ? parseFloat((resp as any).precoUnitario ?? "0") : null;
          const qtd = resp ? parseFloat((resp as any).quantidade ?? it.quantidade ?? "0") : parseFloat(it.quantidade ?? "0");
          const total = precoUnit != null ? precoUnit * qtd : null;
          const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
          return {
            fornecedorId: p.fornecedorId,
            nome,
            qtd,
            precoUnit,
            total,
            isMelhorPreco: melhorPreco != null && precoUnit != null && Math.abs(precoUnit - melhorPreco) < 0.005,
          };
        });
        return {
          descricao: it._isPacoteGroup && (it as any).composicaoEapCodigo ? `[${(it as any).composicaoEapCodigo}] ${it.descricao}` : it.descricao,
          eapCodigo: String((it as any).eapCodigo ?? (it as any).parentEapCodigo ?? "").trim(),
          eapPath: String((it as any).eapPath ?? "").trim(),
          unidade: it.unidade || "un",
          quantidade: fmtQtd(it.quantidade),
          metaUnit,
          metaTot,
          porFornecedor,
        };
      });
      // Rev. 5080 — exportações respeitam a numeração da EAP do orçamento,
      // sempre do menor pro maior (segmento a segmento, mesma regra da tela).
      const segKeyExp = (cod: string): number[] | null => {
        const segs = String(cod ?? "").trim().split(/[^0-9]+/).filter(Boolean).map(Number);
        return segs.length ? segs : null;
      };
      const linhasOrdenadas = linhas.map((l: any, i: number) => ({ l, i, k: segKeyExp(l.eapCodigo) }))
        .sort((a: any, b: any) => {
          if (a.k && b.k) {
            const len = Math.max(a.k.length, b.k.length);
            for (let s = 0; s < len; s++) { const d = (a.k[s] ?? 0) - (b.k[s] ?? 0); if (d !== 0) return d; }
            return a.i - b.i;
          }
          if (a.k) return -1;
          if (b.k) return 1;
          return a.i - b.i;
        })
        .map((x: any) => x.l);
      return { linhas: linhasOrdenadas, participantes };
    }

    // Rev. 4003 — "Exportar PDF" abria o print do navegador via window.print()
    // sobre o container `fixed inset-0` do DetalheWrapper fullscreen; nesse
    // cenário o Chrome imprime página em branco (mesma causa-raiz documentada
    // em print-dialog-fixed-clip: elemento fixed não flui pro fluxo normal de
    // impressão). Fix: gera HTML autônomo numa aba nova (mesmo padrão já
    // usado em Solicitacoes.tsx → gerarPdfSC), imune a overflow/fixed da tela.
    // Rev. 5082 — "Exportar PDF" agora usa o PDF renderizado no SERVIDOR (idêntico
    // à tela: paisagem, cores, faixas META/COTAÇÃO). O print do navegador no
    // iPad descartava fundos coloridos e imprimia em retrato. Fallback: aba de impressão.
    async function gerarPdfCotacao() {
      if (!garantirMapaCarregado()) return;
      const html = montarHtmlMapaPdf(false);
      if (!html || !detalheFullscreen) return;
      // abre a janela DENTRO do gesto do usuário (senão o Safari bloqueia)
      const w = window.open("", "_blank");
      if (w) { try { w.document.write("<p style='font-family:sans-serif;color:#475569;padding:24px'>Gerando PDF do Mapa de Cotação…</p>"); } catch { /* ignore */ } }
      try {
        const resp = await fetch("/api/cotacao-mapa-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cotacaoId: detalheFullscreen.id, html, retorno: "url" }),
        });
        if (!resp.ok) throw new Error(await resp.text().catch(() => "Erro ao gerar o PDF"));
        // Rev. 5092 — o Safari ignora nome de File em blob: URL (mostrava UUID no viewer).
        // O servidor agora devolve uma URL GET que termina no nome do arquivo (com nº da SC).
        const { url } = await resp.json();
        if (!url) throw new Error("Resposta inválida do servidor");
        if (w) { w.location.href = url; } else { window.open(url, "_blank"); }
      } catch (e: any) {
        try { w?.close(); } catch { /* ignore */ }
        toast.error("Erro ao gerar o PDF no servidor — abrindo a versão de impressão. " + (e?.message || ""));
        abrirImpressaoMapa();
      }
    }
    // Rev. 5091 — nome do arquivo do PDF com o nº da SOLICITAÇÃO (pedido do user)
    function nomeArquivoMapaPdf(): string {
      const clean = (s: any) => String(s ?? "").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const scRaw = (detalheFullscreen as any)?.scInfo?.numeroSc;
      const sc = scRaw ? clean(formatNumeroScDisplay(scRaw)) : "";
      const cot = clean(formatNumeroCotacaoDisplay(detalheFullscreen?.numeroCotacao));
      return sc ? `Mapa_${sc}_${cot}.pdf` : `Mapa_${cot}.pdf`;
    }
    // Rev. 5081 — HTML do mapa fatorado p/ reuso: aba de impressão E PDF real
    // via servidor (WhatsApp) usam exatamente o mesmo layout.
    function montarHtmlMapaPdf(comPrintScript: boolean): string | null {
      if (!detalheFullscreen) return null;
      const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
      const fmtMoeda = (v: any) => v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
      const { linhas, participantes } = montarLinhasExportacao();
      const numeroFmt = formatNumeroCotacaoDisplay(detalheFullscreen.numeroCotacao);
      const st2 = STATUS_LABELS[detalheFullscreen.status] ?? STATUS_LABELS.pendente;
      // Rev. 5076 — layout refeito: paisagem, blocos META (orçamento) × COTAÇÃO
      // (fornecedores) visualmente separados, agrupamento por etapa da EAP,
      // código do item e coluna Δ vs meta no melhor preço.
      const colCount = 6 + participantes.length * 3;
      const theadFornecedores = participantes.map((p: any, i: number) => {
        const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
        const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
        return `<th colspan="3" class="grp-forn${i === 0 ? " sep" : ""}" style="text-align:center">${esc(nome)}${isMelhor && participantes.length > 1 ? ' <span class="star">★ melhor</span>' : ""}</th>`;
      }).join("");
      const theadSub = participantes.map((_: any, i: number) => `<th class="sub-forn${i === 0 ? " sep" : ""}" style="text-align:right">Qtd</th><th class="sub-forn" style="text-align:right">Preço Unit.</th><th class="sub-forn" style="text-align:right">Total</th>`).join("");
      let _grpAnterior: string | null = null;
      const rowsHtml = linhas.map((l: any) => {
        // Rev. 5085 — números todos no MESMO tamanho/peso; destaque (negrito) só na
        // meta do orçamento. Verde de "melhor preço" só quando há comparação (2+ forn.).
        const destacaMelhor = participantes.length > 1;
        const fornCols = l.porFornecedor.map((f: any, i: number) => `
          <td class="c-forn${i === 0 ? " sep" : ""}" style="text-align:right">${f.qtd ? f.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
          <td class="c-forn" style="text-align:right${destacaMelhor && f.isMelhorPreco ? ";color:#047857;font-weight:700" : ""}">${f.precoUnit != null ? fmtMoeda(f.precoUnit) : "—"}</td>
          <td class="c-forn" style="text-align:right${destacaMelhor && f.isMelhorPreco ? ";color:#047857;font-weight:700" : ""}">${f.total != null ? fmtMoeda(f.total) : "—"}</td>`).join("");
        const grupo = l.eapPath || "";
        let grpRow = "";
        if (grupo && grupo !== _grpAnterior) {
          grpRow = `<tr class="grp-row"><td colspan="${colCount}">📂 ${esc(grupo)}</td></tr>`;
          _grpAnterior = grupo;
        }
        return `${grpRow}<tr>
          <td class="c-cod">${l.eapCodigo ? `<span class="cod">${esc(l.eapCodigo)}</span>` : ""}</td>
          <td>${esc(l.descricao)}</td>
          <td style="text-align:center;color:#64748b">${esc(l.unidade)}</td>
          <td class="c-meta sep" style="text-align:right">${esc(l.quantidade)}</td>
          <td class="c-meta" style="text-align:right">${l.metaUnit > 0 ? fmtMoeda(l.metaUnit) : "—"}</td>
          <td class="c-meta" style="text-align:right;font-weight:600">${l.metaTot > 0 ? fmtMoeda(l.metaTot) : "—"}</td>
          ${fornCols}
        </tr>`;
      }).join("");
      const totalFornCols = participantes.map((p: any, i: number) => {
        const totalForn = getFornTotal(p);
        const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
        const delta = metaGrandTotal > 0 && totalForn > 0 ? totalForn - metaGrandTotal : null;
        const deltaTxt = delta != null ? `<div style="font-size:9px;font-weight:600;color:${delta <= 0 ? "#047857" : "#b91c1c"}">${delta <= 0 ? "▼" : "▲"} ${fmtMoeda(Math.abs(delta))} vs meta</div>` : "";
        return `
          <td class="c-forn${i === 0 ? " sep" : ""}"></td>
          <td class="c-forn"></td>
          <td class="c-forn" style="text-align:right;font-weight:700${isMelhor ? ";color:#047857" : ""}">${totalForn > 0 ? fmtMoeda(totalForn) : "—"}${deltaTxt}</td>`;
      }).join("");
      const totalRowHtml = `<tr class="tot-row">
        <td colspan="3" style="font-weight:700;text-transform:uppercase;font-size:10px">Total Geral</td>
        <td class="c-meta sep" style="text-align:right;font-weight:700">${qtdGrandTotal !== null ? `${qtdGrandTotal.toLocaleString("pt-BR")} ${esc(qtdUnidade)}` : ""}</td>
        <td class="c-meta"></td>
        <td class="c-meta" style="text-align:right;font-weight:700">${metaGrandTotal > 0 ? fmtMoeda(metaGrandTotal) : "—"}</td>
        ${totalFornCols}
      </tr>`;
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(numeroFmt)}</title>
<style>
  @page{size:A4 landscape;margin:10mm}
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;margin:16px;font-size:10px}
  h1{font-size:19px;margin:0 0 2px 0;color:#0f172a;letter-spacing:-0.3px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px;margin-bottom:12px;background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:10px;color:#fff}
  .head h1{color:#fff}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .meta div{padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
  .meta b{display:block;font-size:8.5px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.4px;margin-bottom:1px}
  .legenda{display:flex;gap:14px;align-items:center;margin-bottom:6px;font-size:9px;color:#475569}
  .sw{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:4px}
  table{width:100%;border-collapse:collapse}
  thead th{padding:5px 6px;font-size:8.5px;text-transform:uppercase;letter-spacing:0.3px}
  .grp-item{background:#0f172a;color:#fff;text-align:left}
  .grp-meta{background:#1d4ed8;color:#fff}
  .grp-forn{background:#047857;color:#fff}
  .sub-meta{background:#dbeafe;color:#1e40af}
  .sub-forn{background:#d1fae5;color:#065f46}
  .star{font-size:8px;background:#fff;color:#047857;border-radius:8px;padding:1px 5px;font-weight:700}
  td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  tbody tr:nth-child(even):not(.grp-row){background:#fafafa}
  .c-meta{background:rgba(59,130,246,0.06)}
  .c-forn{background:rgba(16,185,129,0.05)}
  .sep{border-left:2px solid #94a3b8}
  .c-cod{white-space:nowrap;width:1%}
  .cod{font-family:ui-monospace,Menlo,monospace;font-size:8.5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 4px;color:#475569}
  .grp-row td{background:#e2e8f0;color:#334155;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;padding:4px 8px;border-bottom:none}
  .tot-row td{background:#f1f5f9;border-top:2px solid #0f172a;font-size:10.5px}
  .footer{margin-top:16px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:9px;color:#64748b;display:flex;justify-content:space-between}
  .badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.35)}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  @media print{body{margin:0}}
</style></head><body>
<div class="head">
  <div>
    <h1>Mapa de Cotação ${esc(numeroFmt)}</h1>
    <div style="color:#cbd5e1;font-size:10.5px">${esc((detalheFullscreen as any).descricao || "")}</div>
  </div>
  <div style="text-align:right">
    <span class="badge">${esc(st2.label)}</span>
  </div>
</div>
<div class="meta">
  <div><b>Obra</b>${esc((detalheFullscreen as any).obraNome || "—")}</div>
  <div><b>Fornecedores</b>${participantes.length}</div>
  <div><b>Criado em</b>${(detalheFullscreen as any).criadoEm ? new Date((detalheFullscreen as any).criadoEm).toLocaleDateString("pt-BR") : "—"}</div>
  <div><b>Meta total (orçamento)</b>${metaGrandTotal > 0 ? fmtMoeda(metaGrandTotal) : "—"}</div>
</div>
<div class="legenda">
  <span><span class="sw" style="background:#dbeafe;border:1px solid #93c5fd"></span>META — valores do orçamento (referência)</span>
  <span><span class="sw" style="background:#d1fae5;border:1px solid #6ee7b7"></span>COTAÇÃO — preços dos fornecedores</span>
</div>
<table>
  <thead>
    <tr>
      <th colspan="3" class="grp-item">Item do Orçamento</th>
      <th colspan="3" class="grp-meta sep" style="text-align:center">Meta (Orçamento)</th>
      ${theadFornecedores}
    </tr>
    <tr>
      <th class="grp-item" style="font-weight:400">Cód. EAP</th><th class="grp-item" style="font-weight:400">Descrição</th><th class="grp-item" style="font-weight:400;text-align:center">Un.</th>
      <th class="sub-meta sep" style="text-align:right">Qtd</th><th class="sub-meta" style="text-align:right">Meta Unit.</th><th class="sub-meta" style="text-align:right">Meta Total</th>
      ${theadSub}
    </tr>
  </thead>
  <tbody>${rowsHtml || `<tr><td colspan="${colCount}" style="text-align:center;color:#94a3b8;padding:24px">Sem itens</td></tr>`}</tbody>
  <tfoot>${linhas.length ? totalRowHtml : ""}</tfoot>
</table>
${gruposAgrupados.length > 0 ? `
<div style="margin-top:18px;page-break-inside:avoid">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#334155;margin-bottom:6px">📦 Resumo Consolidado de Materiais</div>
  <table style="width:75%">
    <thead>
      <tr>
        <th class="grp-item" style="text-align:left">Material / Serviço</th>
        <th class="grp-item" style="text-align:left">Un.</th>
        <th class="grp-item" style="text-align:right">Qtd Total</th>
        ${temValorResumo ? `<th class="grp-forn" style="text-align:right">Valor Fechado</th><th class="grp-forn" style="text-align:right">% do Total</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${gruposAgrupados.map(g => {
        const pctPdf = temValorResumo && resumoValorTotal > 0 ? (g.valorTotal / resumoValorTotal) * 100 : 0;
        return `<tr>
        <td>${esc(g.descricao)}</td>
        <td style="color:#64748b">${esc(g.unidade)}</td>
        <td style="text-align:right;font-weight:600">${g.qtdTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
        ${temValorResumo ? `<td class="c-forn" style="text-align:right;color:#047857;font-weight:600">${g.valorTotal > 0 ? fmtMoeda(g.valorTotal) : "—"}</td><td class="c-forn" style="text-align:right;color:#64748b">${pctPdf.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>` : ""}
      </tr>`;
      }).join("")}
    </tbody>
    <tfoot>
    ${(() => {
      // Rev. 5098 — subtotal por CATEGORIA (nome) + unidade (ex.: total de kg de aço, sem misturar cimento)
      const porCat: Record<string, { qtd: number; n: number; valor: number; label: string; un: string }> = {};
      for (const g of gruposAgrupados) {
        const cat = categoriaResumo(g.descricao, g.unidade);
        if (!porCat[cat.key]) porCat[cat.key] = { qtd: 0, n: 0, valor: 0, label: cat.label, un: g.unidade || "un" };
        porCat[cat.key].qtd += g.qtdTotal; porCat[cat.key].n++; porCat[cat.key].valor += g.valorTotal;
      }
      return Object.values(porCat).filter(v => v.n > 1).map(v => `<tr>
        <td style="font-weight:600;color:#334155;font-size:9px">Total ${esc(v.label)} — ${v.n} itens</td><td style="color:#64748b">${esc(v.un)}</td>
        <td style="text-align:right;font-weight:700">${v.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
        ${temValorResumo ? `<td style="text-align:right;font-weight:600;color:#047857">${v.valor > 0 ? fmtMoeda(v.valor) : "—"}</td><td></td>` : ""}
      </tr>`).join("");
    })()}
    ${temValorResumo ? `<tr class="tot-row">
      <td style="font-weight:700;text-transform:uppercase;font-size:9px">Total Fechado</td><td></td><td></td>
      <td style="text-align:right;font-weight:700;color:#047857">${fmtMoeda(resumoValorTotal)}</td>
      <td style="text-align:right;color:#64748b">100%</td>
    </tr>` : ""}
    </tfoot>
  </table>
</div>` : ""}
<div class="footer"><span>FC Engenharia · ERP Gestão Integrada</span><span>Impresso em ${new Date().toLocaleString("pt-BR")}</span></div>
${comPrintScript ? `<script>setTimeout(function(){window.print()},250);</script>` : ""}
</body></html>`;
      return html;
    }
    function abrirImpressaoMapa() {
      const html = montarHtmlMapaPdf(true);
      if (!html) return;
      const w = window.open("", "_blank", "width=1100,height=1400");
      if (!w) { toast.error("Bloqueador de pop-up impediu abrir o PDF. Permita pop-ups e tente novamente."); return; }
      w.document.open(); w.document.write(html); w.document.close();
    }
    // Rev. 5093 — botão "Enviar PDF (WhatsApp)" removido a pedido do user:
    // o "Exportar PDF" (URL nomeada com nº da SC) já cobre visualizar/compartilhar.

    // Rev. 4003 — Exportação em Excel item × fornecedor do Mapa de Cotação
    // (pedido recorrente do usuário p/ mandar pro cliente aprovar item a
    // item; hoje ele monta essa planilha manualmente).
    function exportarExcelCotacao() {
      if (!garantirMapaCarregado()) return;
      if (!detalheFullscreen) return;
      const { linhas, participantes } = montarLinhasExportacao();
      const numeroFmt = formatNumeroCotacaoDisplay(detalheFullscreen.numeroCotacao);
      const header = ["Item", "Unidade", "Qtd", "Meta Unit.", "Meta Total",
        ...participantes.flatMap((p: any) => {
          const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
          return [`${nome} - Qtd`, `${nome} - Preço Unit.`, `${nome} - Total`];
        }),
      ];
      const rows = linhas.map((l: any) => [
        l.descricao,
        l.unidade,
        l.quantidade,
        l.metaUnit || "",
        l.metaTot || "",
        ...l.porFornecedor.flatMap((f: any) => [f.qtd ?? "", f.precoUnit ?? "", f.total ?? ""]),
      ]);
      const totalRow = ["TOTAL", "", qtdGrandTotal !== null ? `${qtdGrandTotal} ${qtdUnidade}` : "", "", metaGrandTotal || "",
        ...participantes.flatMap((p: any) => ["", "", getFornTotal(p) || ""]),
      ];
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
      ws["!cols"] = [{ wch: 42 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, ...participantes.flatMap(() => [{ wch: 10 }, { wch: 14 }, { wch: 14 }])];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mapa de Cotação");
      XLSX.writeFile(wb, `Cotacao_${numeroFmt.replace(/[^\w-]/g, "_")}.xlsx`);
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
    const metaExibicaoTotal = itensParaTotais.reduce((acc: number, it: any) =>
      acc + (Math.round(it.metaUnitario * 100) / 100 * it.metaQtd), 0);
    // Cada meta e cada OC anterior entram uma vez por vínculo orçamentário.
    // Isso evita duplicar um insumo quando ele aparece em mais de uma linha
    // de SC e, principalmente, mantém excesso físico separado de déficit R$.
    const gruposFinanceiros = (() => {
      const groups = new Map<string, { meta: number; comprasAnteriores: number }>();
      for (const item of (mapa?.itens ?? []) as any[]) {
        const key = String(item.chaveFinanceira ?? `cot-item:${item.id}`);
        const metaPadrao = parseFloat(item.metaUnitario ?? "0") * parseFloat(item.qtdOrcada ?? item.metaQtd ?? item.quantidade ?? "0");
        const meta = parseFloat(item.metaFinanceiraTotal ?? "0") || metaPadrao;
        const comprasAnteriores = parseFloat(item.valorComprometidoAnterior ?? "0");
        const current = groups.get(key);
        if (current) {
          current.meta = Math.max(current.meta, meta);
          current.comprasAnteriores = Math.max(current.comprasAnteriores, comprasAnteriores);
        } else {
          groups.set(key, { meta, comprasAnteriores });
        }
      }
      return groups;
    })();
    const metaGrandTotal = isPacoteTotals
      ? metaExibicaoTotal
      : [...gruposFinanceiros.values()].reduce((total, group) => total + group.meta, 0);
    const comprasAnterioresTotal = [...gruposFinanceiros.values()]
      .reduce((total, group) => total + (group.meta > 0 ? group.comprasAnteriores : 0), 0);
    const unidadesUnicas = [...new Set(itensParaTotais.map((it: any) => (it.unidade || "un").toLowerCase()))];
    const qtdGrandTotal = unidadesUnicas.length === 1
      ? itensParaTotais.reduce((acc: number, it: any) => acc + it.metaQtd, 0)
      : null;
    const qtdUnidade = unidadesUnicas.length === 1 ? unidadesUnicas[0] : null;
    const allItens = mapa?.itens ?? [];
    const winnerGrandTotal = fornParaSaldo ? getFornTotal(fornParaSaldo) : 0;
    const saldoTotal = fornParaSaldo
      ? metaGrandTotal - comprasAnterioresTotal - winnerGrandTotal
      : 0;
    const deficit = saldoTotal < 0 ? Math.abs(saldoTotal) : 0;

    function getFechamentoParcialFinanceiro(
      selecao: Array<{ itemId: number; fornecedorId: number; incluir: boolean }>,
    ) {
      const grupos = new Map<string, { meta: number; comprasAnteriores: number }>();
      const fornecedoresComItens = new Set<number>();
      let cotacaoAtual = 0;
      for (const escolhido of selecao) {
        if (!escolhido.incluir) continue;
        const item: any = (mapa?.itens ?? []).find((it: any) => it.id === escolhido.itemId);
        if (!item) continue;
        const key = String(item.chaveFinanceira ?? `cot-item:${item.id}`);
        const meta = Number(item.metaFinanceiraTotal ?? 0);
        const comprasAnteriores = Number(item.valorComprometidoAnterior ?? 0);
        const existente = grupos.get(key);
        if (existente) {
          existente.meta = Math.max(existente.meta, meta);
          existente.comprasAnteriores = Math.max(existente.comprasAnteriores, comprasAnteriores);
        } else {
          grupos.set(key, { meta, comprasAnteriores });
        }
        const resposta: any = mapa?.respostaMap?.[`${item.id}_${escolhido.fornecedorId}`];
        cotacaoAtual += Number(resposta?.total ?? 0);
        fornecedoresComItens.add(escolhido.fornecedorId);
      }
      for (const fornecedorId of fornecedoresComItens) {
        const participante: any = (mapa?.participantes ?? []).find((p: any) => p.fornecedorId === fornecedorId);
        if ((participante?.freteTipo ?? "cif") === "fob") {
          cotacaoAtual += Number(participante?.valorFrete ?? 0);
        }
      }
      const metaOriginal = [...grupos.values()].reduce((sum, group) => sum + group.meta, 0);
      const anteriores = [...grupos.values()].reduce(
        (sum, group) => sum + (group.meta > 0 ? group.comprasAnteriores : 0),
        0,
      );
      const saldo = Math.round((metaOriginal - anteriores - cotacaoAtual) * 100) / 100;
      return { metaOriginal, anteriores, cotacaoAtual, saldo, deficit: saldo < 0 ? Math.abs(saldo) : 0 };
    }

    const cobertura = (() => {
      const itensComOrc = allItens.filter((it: any) => (it as any).qtdOrcada > 0);
      if (itensComOrc.length === 0) return null;
      const total = itensComOrc.length;
      // Rev. 5086 — tolerância de arredondamento: a SC grava qtd com 3 casas e o
      // orçamento tem 4 (ex.: 208,490 vs 208,4901). Diferença ínfima NÃO é compra
      // parcial — considera total quando cobre ≥ 99,9% (ou falta < 0,01 un).
      const cobreTotal = (sol: number, orc: number) => sol >= orc - Math.max(orc * 0.001, 0.01);
      const totais = itensComOrc.filter((it: any) => cobreTotal((it as any).qtdTotalSolicitada, (it as any).qtdOrcada));
      const parciais = itensComOrc.filter((it: any) => (it as any).qtdTotalSolicitada > 0 && !cobreTotal((it as any).qtdTotalSolicitada, (it as any).qtdOrcada));
      const pctMedio = itensComOrc.reduce((acc: number, it: any) => {
        const sol = (it as any).qtdTotalSolicitada, orc = (it as any).qtdOrcada;
        return acc + (cobreTotal(sol, orc) ? 100 : Math.min((sol / orc) * 100, 100));
      }, 0) / total;
      return { total, totais: totais.length, parciais: parciais.length, semCobertura: total - totais.length - parciais.length, pctMedio };
    })();

    // Remove prefixo de código EAP "[xx.xx.xx.xx] " da descrição para agrupar itens iguais
    const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
    // Rev. 5087 — resumo consolidado em TABELA organizada, com o valor fechado
    // por material (fornecedor vencedor, senão o de melhor proposta) e total geral.
    const fornResumo = fornParaSaldo ?? melhorForn;
    const agrupados: Record<string, { descricao: string; unidade: string; qtdTotal: number; valorTotal: number }> = {};
    for (const it of (mapa?.itens ?? [])) {
      const descLimpa = stripEapPrefix(it.descricao);
      const chave = `${descLimpa}__${it.unidade || "un"}`;
      if (!agrupados[chave]) agrupados[chave] = { descricao: descLimpa, unidade: it.unidade || "un", qtdTotal: 0, valorTotal: 0 };
      agrupados[chave].qtdTotal += parseFloat(it.quantidade ?? "0");
      const resp = fornResumo ? (mapa?.respostaMap?.[`${it.id}_${fornResumo.fornecedorId}`] as any) : null;
      if (resp) {
        const precoUnit = parseFloat(resp.precoUnitario ?? "0");
        const q = parseFloat(resp.quantidade ?? it.quantidade ?? "0");
        if (precoUnit > 0 && q > 0) agrupados[chave].valorTotal += precoUnit * q;
      }
    }
    const gruposAgrupados = Object.values(agrupados).filter(g => g.qtdTotal > 0)
      .sort((a, b) => b.valorTotal - a.valorTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));
    const resumoValorTotal = gruposAgrupados.reduce((s, g) => s + g.valorTotal, 0);
    const temValorResumo = resumoValorTotal > 0;

    const fullscreenMapa = abaAtiva === "mapa";
    if (fullscreenMapa && detalheFullscreen && !mapa) {
      return (
        <DetalheWrapper fullscreen>
          <div className="min-h-screen bg-gray-50 px-4 py-4">
            <div className="mx-auto max-w-3xl space-y-5">
              <button onClick={() => setAbaAtiva("detalhes")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
                <ChevronLeft className="h-4 w-4" /> Voltar aos detalhes
              </button>
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
                {mapaQ.isError ? (
                  <div className="space-y-4">
                    <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-semibold text-gray-900">Não foi possível carregar o Mapa de Cotação.</p>
                      <p className="mt-1 text-sm text-gray-500">Os detalhes básicos continuam disponíveis.</p>
                    </div>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" onClick={() => setAbaAtiva("detalhes")}>Voltar aos detalhes</Button>
                      <Button onClick={() => mapaQ.refetch()} className="gap-1.5 bg-blue-600 hover:bg-blue-500">
                        <RefreshCw className="h-4 w-4" /> Tentar novamente
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" />
                    <div>
                      <p className="font-semibold text-gray-900">Carregando Mapa de Cotação</p>
                      <p className="mt-1 text-sm text-gray-500">Preços, histórico e indicadores de fornecedores são buscados somente agora.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DetalheWrapper>
      );
    }
    return (
      <DetalheWrapper fullscreen={fullscreenMapa}>
        <div className={`${fullscreenMapa ? "px-3 py-3 space-y-3" : "p-6 space-y-5"} bg-gray-50 min-h-screen`}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowDetalhe(null); setAbaAtiva("detalhes"); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <ChevronRight className="h-4 w-4 rotate-180" /> Cotações
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-900 font-mono">{detalheFullscreen?.numeroCotacao ? formatNumeroCotacaoDisplay(detalheFullscreen.numeroCotacao) : "…"}</span>
          </div>

          {detalheQ.isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detalheFullscreen ? (
            <>
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 font-mono">{formatNumeroCotacaoDisplay(detalheFullscreen.numeroCotacao)}</h1>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${(detalheFullscreen as any).tipo === "servico" ? "bg-purple-100 text-purple-700" : (detalheFullscreen as any).tipo === "pacote" ? "bg-indigo-100 text-indigo-700" : (detalheFullscreen as any).tipo === "equipamento" ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>
                      {(detalheFullscreen as any).tipo === "servico" ? "MDO" : (detalheFullscreen as any).tipo === "pacote" ? "MAT+MDO" : (detalheFullscreen as any).tipo === "equipamento" ? "EQUIP" : "MAT"}
                    </span>
                  </div>
                  {(detalheFullscreen as any).descricao && <p className="text-gray-500 mt-0.5">{(detalheFullscreen as any).descricao}</p>}
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">

                  {st && <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${st.cls}`}>{st.label}</span>}
                  <Button
                    variant="outline"
                    onClick={gerarPdfCotacao}
                    className="no-print border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
                    title="Gera um PDF do Mapa de Cotação (item a item, por fornecedor) numa aba nova."
                  >
                    <Printer className="h-4 w-4" /> Exportar PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportarExcelCotacao}
                    className="no-print border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
                    title="Exporta o Mapa de Cotação (item a item, por fornecedor) em Excel — útil para envio ao cliente para aprovação."
                  >
                    <FileText className="h-4 w-4" /> Exportar Excel
                  </Button>
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
                          setTituloDraft(contratoTitulo || "Contrato de Prestação de Serviços");
                          setTituloPromptOpen(true);
                        }} disabled={gerarContrato.isPending}
                          className="bg-purple-600 hover:bg-purple-500 text-white gap-2">
                          {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          Visualizar e Aprovar Contrato
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
                        className={`${(() => { const venc = (mapa?.participantes ?? []).find((p:any)=>p.selecionado) ?? null; const est = !!venc?.isEstoque; return temItensSemVerba && !semVerbaAutorizado ? "bg-red-600 hover:bg-red-700" : est ? "bg-violet-600 hover:bg-violet-500" : isMedicaoVencedor ? "bg-blue-600 hover:bg-blue-500" : "bg-emerald-600 hover:bg-emerald-500"; })()} text-white gap-2`}>
                        {gerarOC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : temItensSemVerba && !semVerbaAutorizado ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        {(() => { const venc = (mapa?.participantes ?? []).find((p:any)=>p.selecionado) ?? null; const est = !!venc?.isEstoque; return temItensSemVerba && !semVerbaAutorizado ? "Aprovar (Requer Autorização)" : semVerbaAutorizado ? "Aprovar e Gerar OC (Autorizado)" : est ? "Atender pelo Estoque" : isMedicaoVencedor ? "Aprovar e Gerar Contrato" : "Aprovar e Gerar OC"; })()}
                      </Button>
                      {(mapa?.participantes ?? []).length >= 2 && !isMedicaoVencedor && (
                        <Button variant="outline" onClick={() => handleAbrirCotacaoParcial(detalheFullscreen.id)} disabled={gerarOC.isPending || gerarOCsParciais.isPending}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2">
                          <GitBranch className="h-4 w-4" /> Cotação Parcial
                        </Button>
                      )}
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
                    <Button variant="outline" onClick={async () => {
                      if (await confirm({
                        title: "Reverter aprovação?",
                        description: "O contrato de serviço será excluído e a cotação voltará para 'Aprovada', permitindo edições e nova geração de contrato.",
                        tone: "warning",
                        confirmText: "Reverter",
                      })) {
                        reverterOS.mutate({ cotacaoId: showDetalhe!, companyId });
                      }
                    }}
                      disabled={reverterOS.isPending}
                      className="border-orange-200 text-orange-600 hover:bg-orange-50 gap-2">
                      {reverterOS.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Reverter Aprovação
                    </Button>
                  )}
                  {detalheFullscreen.status === "aprovada" && (detalheFullscreen as any).tipo !== "servico" && (() => {
                    const jaEmOC = mapa?.itensJaEmOC ?? [];
                    const pendentes = (mapa?.itens ?? []).filter((it: any) => !jaEmOC.includes(it.id));
                    return pendentes.length > 0 && (mapa?.participantes ?? []).length >= 1;
                  })() && (
                    <Button variant="outline"
                      onClick={() => handleAbrirCotacaoParcial(detalheFullscreen.id)}
                      disabled={gerarOCsParciais.isPending}
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2">
                      <GitBranch className="h-4 w-4" />
                      Complementar OC Parcial
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                        {(mapa?.itens ?? []).filter((it: any) => !(mapa?.itensJaEmOC ?? []).includes(it.id)).length} pendente(s)
                      </span>
                    </Button>
                  )}
                  {detalheFullscreen.status === "aprovada" && isAdminMaster && !(detalheFullscreen as any).contratoTerceiroId && (
                    <Button variant="outline" onClick={() => { setJustificativaCancelar(""); setCancelarCotacaoId(showDetalhe); setShowCancelarAprovacao(true); }}
                      className="border-orange-200 text-orange-600 hover:bg-orange-50 gap-2">
                      <Undo2 className="h-4 w-4" /> Cancelar Aprovação
                    </Button>
                  )}
                  {["cancelada", "recusada"].includes(detalheFullscreen.status ?? "") && (
                    <Button variant="outline" onClick={async () => {
                      if (await confirm({
                        title: "Reabrir cotação?",
                        description: "O status voltará para 'Pendente' e será possível aprová-la novamente.",
                        tone: "info",
                        confirmText: "Reabrir",
                      })) {
                        atualizarStatus.mutate({ id: detalheFullscreen.id, status: "pendente" });
                      }
                    }}
                      disabled={atualizarStatus.isPending}
                      className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-2">
                      {atualizarStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reabrir Cotação
                    </Button>
                  )}
                  {!["cancelada", "recusada", "aprovada", "concluida"].includes(detalheFullscreen.status ?? "") && ((detalheFullscreen as any)?.itens?.length ?? 0) >= 2 && (
                    <Button variant="outline" onClick={() => { setDividirSel(new Map()); setShowDividirModal(true); }}
                      className="border-violet-200 text-violet-700 hover:bg-violet-50 gap-2">
                      <GitBranch className="h-4 w-4" /> Dividir Cotação
                    </Button>
                  )}
                  {!["cancelada", "recusada", "aprovada", "concluida"].includes(detalheFullscreen.status ?? "") && (detalheFullscreen as any)?.divididaDeId && (
                    <Button variant="outline" onClick={async () => {
                      if (await confirm({
                        title: "Cancelar divisão?",
                        description: "Todos os itens desta cotação voltam para a cotação original e esta cotação será removida.",
                        tone: "destructive",
                        confirmText: "Cancelar divisão",
                        cancelText: "Voltar",
                      })) {
                        cancelarDivisao.mutate({ cotacaoId: showDetalhe! });
                      }
                    }}
                      disabled={cancelarDivisao.isPending}
                      className="border-amber-200 text-amber-700 hover:bg-amber-50 gap-2">
                      {cancelarDivisao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Cancelar Divisão
                    </Button>
                  )}
                  {!["cancelada", "recusada", "aprovada", "concluida"].includes(detalheFullscreen.status ?? "") && (
                    <Button variant="outline" onClick={async () => {
                      if (await confirm({
                        title: "Cancelar cotação?",
                        description: "A SC voltará para o status 'Aprovado' e poderá gerar nova cotação.",
                        tone: "destructive",
                        confirmText: "Cancelar cotação",
                        cancelText: "Voltar",
                      })) {
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

              {/* Rev. 2806 — Navegação entre cotações "irmãs" da mesma SC + itens pendentes */}
              {detalheScId && (coberturaScQ.data?.cotacoes?.length ?? 0) > 1 && (() => {
                const irmas = (coberturaScQ.data?.cotacoes ?? []);
                const idxAtual = irmas.findIndex(c => c.id === showDetalhe);
                const pendentes = coberturaScQ.data?.pendentes ?? 0;
                return (
                  <div className="flex items-center flex-wrap gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-2">
                    <GitBranch className="h-4 w-4 text-violet-600 shrink-0" />
                    <span className="text-xs font-semibold text-violet-800">
                      Cotação {idxAtual >= 0 ? idxAtual + 1 : "?"} de {irmas.length} desta solicitação:
                    </span>
                    <div className="flex items-center flex-wrap gap-1.5">
                      {irmas.map(c => (
                        <button key={c.id} type="button" onClick={() => { if (c.id !== showDetalhe) { setAbaAtiva("detalhes"); setShowDetalhe(c.id); } }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${c.id === showDetalhe ? "bg-violet-600 text-white border-violet-600" : "bg-white text-violet-700 border-violet-300 hover:bg-violet-100"} ${["cancelada", "recusada"].includes(c.status ?? "") ? "line-through opacity-60" : ""}`}
                          title={["cancelada", "recusada"].includes(c.status ?? "") ? "Cotação cancelada/recusada" : ""}>
                          {formatNumeroCotacaoDisplay(c.numeroCotacao)}
                        </button>
                      ))}
                    </div>
                    {pendentes > 0 && (
                      <>
                        <span className="text-xs text-violet-700">· {pendentes} {pendentes === 1 ? "item da SC ainda não cotado" : "itens da SC ainda não cotados"}</span>
                        <button type="button" disabled={cotarRestantes.isPending}
                          onClick={() => cotarRestantes.mutate({ solicitacaoId: detalheScId, userId: user?.id ? parseInt(String(user.id)) : undefined, userName: user?.nome || user?.name || undefined })}
                          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
                          {cotarRestantes.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Cotar {pendentes} restante{pendentes === 1 ? "" : "s"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Alerta: condições comerciais do vencedor incompletas */}
              {condicoesIncompletas && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">Ação necessária antes de aprovar: </span>
                    {/* Rev. 2073 — texto dinâmico: MDO puro/medição não pede Prazo de Entrega */}
                    {(() => {
                      const faltaForma = !condPagVencedor;
                      const faltaPrazo = !dispensaPrazoVencedor && (!prazoVencedor || Number(prazoVencedor) <= 0);
                      const itens: string[] = [];
                      if (faltaForma) itens.push("<strong>Forma de Pagamento</strong>");
                      if (faltaPrazo) itens.push("<strong>Prazo de Entrega</strong>");
                      const lista = itens.length === 2 ? `${itens[0]} e o ${itens[1]}` : itens[0] ?? "";
                      return <span dangerouslySetInnerHTML={{ __html: `preencha a ${lista} do fornecedor vencedor.` }} />;
                    })()}
                    {" "}Na aba <em>Mapa de Cotação</em>, clique em <strong>"Editar"</strong> no card do fornecedor, preencha os campos e clique em <strong>"Salvar"</strong>.
                  </div>
                </div>
              )}

              {/* Barra de evolução */}
              {(() => {
                const df = detalheFullscreen as any;
                const isServicoOuPacote = df.tipo === "servico" || df.tipo === "pacote";
                // Uma cotação pode gerar mais de uma OC. O rastreio usa a
                // relação retornada pelo servidor, não apenas o status da
                // cotação, para que cada numeração seja navegável.
                const ordensVinculadas: any[] = df.ordensVinculadas ?? [];
                const hasOC = ordensVinculadas.length > 0;
                const numeroSc = df.scInfo?.numeroSc
                  ? formatNumeroScDisplay(df.scInfo.numeroSc)
                  : df.solicitacaoId ? `SC #${df.solicitacaoId}` : null;
                const hasContrato = !!df.contratoTerceiroId;
                const steps = isServicoOuPacote
                  ? [
                      {
                        label: "Solicitação",
                        done: !!df.solicitacaoId,
                        icon: <ClipboardList className="h-4 w-4" />,
                        links: df.solicitacaoId ? [{
                          id: df.solicitacaoId,
                          label: numeroSc,
                          href: `/compras/solicitacoes?destaque=${df.solicitacaoId}`,
                          title: "Abrir solicitação de compra",
                        }] : [],
                      },
                      { label: "Cotação", done: true, icon: <FileSearch className="h-4 w-4" />, links: [] },
                      { label: "Ordem de Serviço", done: hasOC, icon: <ShoppingCart className="h-4 w-4" />, links: [] },
                      { label: "Contrato", done: hasContrato, icon: <FileText className="h-4 w-4" />, links: [] },
                    ]
                  : [
                      {
                        label: "Solicitação",
                        done: !!df.solicitacaoId,
                        icon: <ClipboardList className="h-4 w-4" />,
                        links: df.solicitacaoId ? [{
                          id: df.solicitacaoId,
                          label: numeroSc,
                          href: `/compras/solicitacoes?destaque=${df.solicitacaoId}`,
                          title: "Abrir solicitação de compra",
                        }] : [],
                      },
                      { label: "Cotação", done: true, icon: <FileSearch className="h-4 w-4" />, links: [] },
                      {
                        label: "Ordem de Compra",
                        done: hasOC,
                        icon: <ShoppingCart className="h-4 w-4" />,
                        links: ordensVinculadas.map((oc) => ({
                          id: oc.id,
                          label: formatNumeroOcDisplay(oc.numeroOc),
                          href: `/compras/ordens?destaque=${oc.id}`,
                          title: `Abrir ordem de compra ${formatNumeroOcDisplay(oc.numeroOc)}`,
                        })),
                      },
                      { label: "Entrega", done: df.status === "concluida", icon: <CheckCircle className="h-4 w-4" />, links: [] },
                    ];
                const currentIdx = steps.reduce((acc, s, i) => (s.done ? i : acc), 0);
                const isCancelada = df.status === "cancelada" || df.status === "recusada";
                return (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                      Rastreio da Solicitação à Compra
                    </p>
                    <div className="flex items-start gap-0 w-full">
                    {steps.map((step, i) => {
                      const isActive = i === currentIdx + (steps[currentIdx + 1] && !steps[currentIdx + 1].done ? 1 : 0) && !isCancelada;
                      const isDone = step.done && !isCancelada;
                      return (
                        <div key={i} className="flex items-start flex-1 min-w-0">
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
                            {step.links?.length > 0 && (
                              <div className="mt-1.5 flex max-w-full flex-wrap justify-center gap-1">
                                {step.links.map((link: any) => (
                                  <button
                                    key={link.id}
                                    type="button"
                                    onClick={() => navigate(link.href)}
                                    title={link.title}
                                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-100 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  >
                                    <Link2 className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{link.label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {i < steps.length - 1 && (
                            <div className={`h-0.5 flex-1 -mt-5 mx-1 rounded ${isDone ? "bg-emerald-400" : "bg-gray-200"}`} />
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                );
              })()}

              {/* Rev. 3516 — Alerta de regras especiais por produto do fornecedor */}
              {(() => {
                const itens: any[] = (detalheFullscreen as any)?.itens ?? [];
                const rawRegras = (forn as any)?.regrasProdutoJson;
                if (!rawRegras || itens.length === 0) return null;
                let regras: any[] = [];
                try { regras = JSON.parse(rawRegras); } catch { return null; }
                if (!Array.isArray(regras) || regras.length === 0) return null;
                const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const regrasAtivadas = regras.filter(r =>
                  itens.some(it => norm(it.descricao ?? "").includes(norm(r.produto ?? "")))
                );
                if (regrasAtivadas.length === 0) return null;
                return (
                  <div className="space-y-2">
                    {regrasAtivadas.map((r: any) => {
                      const fpLabel = r.formaPagamento === "cheque" ? "Cheque" : r.formaPagamento === "pix" ? "PIX" : r.formaPagamento === "boleto" ? "Boleto" : "Transferência";
                      return (
                        <div key={r.id ?? r.produto} className="flex items-start gap-3 rounded-lg border-2 border-violet-400 bg-violet-50 p-3">
                          <Zap className="h-5 w-5 text-violet-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-violet-900">Regra especial: {r.produto}</p>
                            <p className="text-xs text-violet-700 mt-0.5">
                              Esta OC contém <strong>{r.produto}</strong> — pagamento deve ser em <strong>{fpLabel}</strong>, em até <strong>{r.numParcelas}×</strong>
                              {r.prazoEntreParcelas ? ` com prazo de ${r.prazoEntreParcelas} dias entre parcelas` : ""}.
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {(detalheFullscreen as any)?.itens?.some((it: any) => it.semVerba) && (() => {
                const avulsos = ((detalheFullscreen as any).itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba === "avulso");
                const estouros = ((detalheFullscreen as any).itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba !== "avulso");
                return (
                  <div className="space-y-2">
                    {avulsos.length > 0 && (
                      <div className="flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 p-3 print:border-orange-500">
                        <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-orange-800">⚠ FORA DO ORÇAMENTO — {avulsos.length} item(ns) avulso(s)</p>
                          <p className="text-xs text-orange-600">Itens sem vínculo orçamentário. Necessita verba realocada ou autorização para liberar OC/OS.</p>
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
                  </div>
                );
              })()}

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
                      // Rev. 2074 — MDO puro (tipo='servico') NÃO tem entrega física,
                      // então o card "Prazo Entrega" é omitido. Para pacote/material
                      // (com material físico) o card aparece normalmente, virando
                      // "Mobilização" quando o pagamento é por medição.
                      ...((detalheFullscreen as any).tipo === "servico"
                        ? []
                        : [{ label: (() => { const tp = (detalheFullscreen as any).tipoPagamento ?? ""; const cp = detalheFullscreen.condicaoPagamento ?? ""; const t = (detalheFullscreen as any).tipo; return (t === "pacote" && (tp === "medicao" || cp.toLowerCase().includes("medição"))) ? "Mobilização" : "Prazo Entrega"; })(), value: detalheFullscreen.prazoEntregaDias ? `${detalheFullscreen.prazoEntregaDias} dias` : "—" }]),
                      { label: "Validade", value: detalheFullscreen.dataValidade ? new Date(detalheFullscreen.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                      { label: "SC Vinculada", value: detalheFullscreen.solicitacaoId ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/compras/solicitacoes?destaque=${detalheFullscreen.solicitacaoId}`)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1"
                          title="Abrir solicitação de compra"
                        >
                          <Link2 className="h-3.5 w-3.5" />{(detalheFullscreen as any).scInfo?.numeroSc ? formatNumeroScDisplay((detalheFullscreen as any).scInfo.numeroSc) : `SC #${detalheFullscreen.solicitacaoId}`}
                        </button>
                      ) : "—" },
                      { label: "OC Gerada", value: (() => {
                        const ordens: any[] = (detalheFullscreen as any).ordensVinculadas ?? [];
                        if (ordens.length === 0) return "—";
                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {ordens.map((oc) => (
                              <button
                                key={oc.id}
                                type="button"
                                onClick={() => navigate(`/compras/ordens?destaque=${oc.id}`)}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1"
                                title="Abrir ordem de compra"
                              >
                                <Link2 className="h-3.5 w-3.5" />{formatNumeroOcDisplay(oc.numeroOc)}
                              </button>
                            ))}
                          </div>
                        );
                      })() },
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

                  {/* Rastreabilidade / Auditoria */}
                  {(() => {
                    const d: any = detalheFullscreen;
                    const fmtDT = (v: any) => v ? new Date(v).toLocaleString("pt-BR") : "—";
                    const sc = d.scInfo;
                    return (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Rastreabilidade</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Solicitação criada por</p>
                            <p className="text-sm font-medium text-gray-900">{sc?.criadoPorNome || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Solicitação aprovada por</p>
                            <p className="text-sm font-medium text-gray-900">{sc?.aprovadorNome || "—"}</p>
                            <p className="text-xs text-gray-500">{sc?.aprovadoEm ? fmtDT(sc.aprovadoEm) : ""}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Cotação registrada por</p>
                            <p className="text-sm font-medium text-gray-900">{d.criadoPorNome || "—"}</p>
                            <p className="text-xs text-gray-500">{fmtDT(d.criadoEm)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Cotação aprovada por</p>
                            <p className="text-sm font-medium text-gray-900">{d.aprovadoPorNome || "—"}</p>
                            <p className="text-xs text-gray-500">{d.aprovadoEm ? fmtDT(d.aprovadoEm) : ""}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Itens</h2>
                    </div>
                    {/* Rev. 5077 — enquanto pendente, a lista mostra a META como referência e avisa
                        que os valores fechados só existem após aprovação (Detalhes = espelho do fechamento) */}
                    {detalheFullscreen.status === "pendente" && (
                      <div className="flex items-center gap-2.5 px-5 py-2.5 bg-blue-50 border-b border-blue-100">
                        <Info className="h-4 w-4 text-blue-600 shrink-0" />
                        <p className="text-xs text-blue-800">
                          <strong>Aguardando fechamento</strong> — os preços abaixo só são preenchidos após a aprovação da cotação.
                          A coluna <strong>Meta (Orç.)</strong> é referência do orçamento; a negociação acontece na aba <strong>Mapa de Cotação</strong>.
                        </p>
                      </div>
                    )}
                    {/* Rev. 5078 — réplica da planilha orçamentária: agrupada por etapa (EAP),
                        pais e filhos com numeração, meta no escopo do tipo da cotação e valor fechado lado a lado. */}
                    {(() => {
                      const pend = detalheFullscreen.status === "pendente";
                      const dItens = detalheFullscreen.itens as any[];
                      const mapaItens = ((mapaQ.data?.itens ?? []) as any[]);
                      const metaById = new Map<number, any>(mapaItens.map((m: any) => [m.id, m]));
                      const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                      const nnum = (v: any) => { const x = typeof v === "number" ? v : parseFloat(v || "0"); return isNaN(x) ? 0 : x; };
                      const temEap = dItens.some((it: any) => { const m = metaById.get(it.id); return m && (m.eapCodigo || m.eapPath || m.parentEapCodigo); });
                      const tipoCot = String((detalheFullscreen as any).tipo ?? (mapaQ.data as any)?.tipoEfetivo ?? "material");
                      const metaLabel = tipoCot === "servico" ? "Meta MDO" : tipoCot === "pacote" ? "Meta Mat+MDO" : tipoCot === "equipamento" ? "Meta Equip." : "Meta Mat.";
                      const badges = (it: any) => (<>
                        {it.semVerba && (it.motivoSemVerba === "avulso"
                          ? <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200">FORA DO ORÇAMENTO</span>
                          : <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">PREJUÍZO</span>
                        )}
                        {(it as any).somenteMo && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">SOMENTE MO</span>
                        )}
                      </>);
                      const cellFechado = (v: number, cls: string) => (pend && v === 0
                        ? <span className="text-gray-300" title="Preenchido após aprovação">aguard.</span>
                        : <span className={cls}>{fmt(v)}</span>);
                      // Sem vínculo com o orçamento (cotação avulsa) → tabela simples original
                      if (!temEap) {
                        return (
                          <Table>
                            <TableHeader>
                              <TableRow className="border-gray-100 bg-gray-50 hover:bg-gray-50">
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase">Descrição</TableHead>
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase w-16">Un.</TableHead>
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase w-24 text-right">Qtd</TableHead>
                                {pend && <TableHead className="text-blue-500 text-xs font-semibold uppercase w-28 text-right bg-blue-50/60">Meta (Orç.)</TableHead>}
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Preço Unit.</TableHead>
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase w-20 text-right">Desc%</TableHead>
                                <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dItens.map((it: any) => (
                                <TableRow key={it.id} className={`border-gray-100 hover:bg-gray-50 ${it.semVerba ? (it.motivoSemVerba === "avulso" ? "bg-orange-50" : "bg-red-50") : ""}`}>
                                  <TableCell className="text-gray-900 text-sm py-3">{it.descricao}{badges(it)}</TableCell>
                                  <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                                  <TableCell className="text-gray-700 text-sm text-right">{nnum(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                                  {pend && (
                                    <TableCell className="text-blue-700 text-sm text-right bg-blue-50/40">
                                      {nnum(it.precoMeta) > 0 ? fmt(nnum(it.precoMeta)) : <span className="text-gray-300">—</span>}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-gray-700 text-sm text-right">{cellFechado(nnum(it.precoUnitario), "text-gray-700")}</TableCell>
                                  <TableCell className="text-gray-500 text-sm text-right">{nnum(it.descontoPct)}%</TableCell>
                                  <TableCell className="text-sm font-semibold text-right">{cellFechado(nnum(it.total), "text-emerald-700")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        );
                      }
                      // Réplica da planilha — ordenar pela numeração EAP (segmento a segmento)
                      const segKey = (cod: string): number[] | null => {
                        const segs = String(cod ?? "").trim().split(/[^0-9]+/).filter(Boolean).map(Number);
                        return segs.length ? segs : null;
                      };
                      const rows = dItens.map((it: any, i: number) => {
                        const m = metaById.get(it.id) ?? {};
                        const metaUnit = nnum(m.metaUnitario);
                        const qtd = nnum(it.quantidade);
                        return {
                          it, m, i,
                          k: segKey(m.eapCodigo || m.parentEapCodigo || ""),
                          metaUnit,
                          metaTotal: metaUnit * qtd,
                          fechUnit: nnum(it.precoUnitario),
                          fechTotal: nnum(it.total),
                          grupo: String(m.eapPath || "").trim(),
                          paiKey: `${m.parentEapCodigo ?? ""}|${m.parentEapDescricao ?? ""}`,
                        };
                      }).sort((a: any, b: any) => {
                        if (a.k && b.k) {
                          const len = Math.max(a.k.length, b.k.length);
                          for (let s = 0; s < len; s++) { const d = (a.k[s] ?? 0) - (b.k[s] ?? 0); if (d !== 0) return d; }
                          return a.i - b.i;
                        }
                        if (a.k) return -1;
                        if (b.k) return 1;
                        return a.i - b.i;
                      });
                      const totalMeta = rows.reduce((s: number, r: any) => s + r.metaTotal, 0);
                      const totalFech = rows.reduce((s: number, r: any) => s + r.fechTotal, 0);
                      const delta = totalFech - totalMeta;
                      // Rev. 5090 — expandir/recolher por etapa (EAP): subtotais por grupo + toolbar
                      const gruposUnicos: string[] = [];
                      const subPorGrupo = new Map<string, { meta: number; fech: number; n: number }>();
                      for (const r of rows) {
                        const g = r.grupo || "";
                        if (!g) continue;
                        if (!subPorGrupo.has(g)) { subPorGrupo.set(g, { meta: 0, fech: 0, n: 0 }); gruposUnicos.push(g); }
                        const s = subPorGrupo.get(g)!;
                        s.meta += r.metaTotal; s.fech += r.fechTotal; s.n += 1;
                      }
                      const todosFechados = gruposUnicos.length > 0 && gruposUnicos.every(g => detalheGruposFechados[g]);
                      // Rev. 5090 — resumo consolidado (igual ao do mapa): agrupa por descrição+un.
                      const resumoMap = new Map<string, { descricao: string; unidade: string; qtd: number; valor: number; meta: number }>();
                      for (const r of rows) {
                        const key = `${(r.it.descricao ?? "").trim().toLowerCase()}|${r.it.unidade ?? "un"}`;
                        if (!resumoMap.has(key)) resumoMap.set(key, { descricao: r.it.descricao, unidade: r.it.unidade || "un", qtd: 0, valor: 0, meta: 0 });
                        const s = resumoMap.get(key)!;
                        s.qtd += nnum(r.it.quantidade); s.valor += r.fechTotal; s.meta += r.metaTotal;
                      }
                      const usaFechadoResumo = totalFech > 0;
                      const resumoRows = [...resumoMap.values()].sort((a, b) => (usaFechadoResumo ? b.valor - a.valor : b.meta - a.meta));
                      const resumoTotal = usaFechadoResumo ? totalFech : totalMeta;
                      return (
                        <>
                        {gruposUnicos.length > 0 && (
                          <div className="flex items-center justify-end gap-2 px-5 py-2 border-b border-gray-100 bg-gray-50/60">
                            <button
                              type="button"
                              onClick={() => setDetalheGruposFechados(todosFechados ? {} : Object.fromEntries(gruposUnicos.map(g => [g, true])))}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-100"
                            >
                              {todosFechados ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {todosFechados ? "Expandir todos" : "Recolher todos"}
                            </button>
                          </div>
                        )}
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-100 bg-gray-50 hover:bg-gray-50">
                              <TableHead className="text-gray-500 text-xs font-semibold uppercase w-20">Item</TableHead>
                              <TableHead className="text-gray-500 text-xs font-semibold uppercase">Descrição</TableHead>
                              <TableHead className="text-gray-500 text-xs font-semibold uppercase w-14">Un.</TableHead>
                              <TableHead className="text-gray-500 text-xs font-semibold uppercase w-20 text-right">Qtd</TableHead>
                              <TableHead className="text-blue-600 text-xs font-semibold uppercase w-28 text-right bg-blue-50/60">{metaLabel} Unit.</TableHead>
                              <TableHead className="text-blue-600 text-xs font-semibold uppercase w-28 text-right bg-blue-50/60">Meta Total</TableHead>
                              <TableHead className="text-emerald-600 text-xs font-semibold uppercase w-28 text-right bg-emerald-50/60">Fechado Unit.</TableHead>
                              <TableHead className="text-emerald-600 text-xs font-semibold uppercase w-28 text-right bg-emerald-50/60">Fechado Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((r: any, idx: number) => {
                              const prev: any = idx > 0 ? rows[idx - 1] : null;
                              const novoGrupo = r.grupo && (!prev || prev.grupo !== r.grupo);
                              const novoPai = (r.m.parentEapDescricao || r.m.parentEapCodigo) && (!prev || prev.paiKey !== r.paiKey || novoGrupo);
                              const codFilho = String(r.m.eapCodigo || "").trim();
                              const grupoFechado = !!(r.grupo && detalheGruposFechados[r.grupo]);
                              const sub = r.grupo ? subPorGrupo.get(r.grupo) : null;
                              return (
                                <React.Fragment key={r.it.id}>
                                  {novoGrupo && (
                                    <TableRow
                                      className="bg-slate-100 hover:bg-slate-200/70 border-slate-200 cursor-pointer select-none"
                                      onClick={() => setDetalheGruposFechados(prevSt => ({ ...prevSt, [r.grupo]: !prevSt[r.grupo] }))}
                                    >
                                      <TableCell colSpan={grupoFechado ? 5 : 8} className="py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                        <span className="inline-flex items-center gap-1.5">
                                          {grupoFechado ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                                          {r.grupo}
                                          {sub && <span className="normal-case tracking-normal font-medium text-[10px] text-slate-400">({sub.n} {sub.n === 1 ? "item" : "itens"})</span>}
                                        </span>
                                      </TableCell>
                                      {grupoFechado && sub && (
                                        <>
                                          <TableCell className="py-1.5 text-xs font-bold text-blue-700 text-right bg-blue-50/60">{sub.meta > 0 ? fmt(sub.meta) : "—"}</TableCell>
                                          <TableCell className="py-1.5 bg-emerald-50/50" />
                                          <TableCell className="py-1.5 text-xs font-bold text-right bg-emerald-50/50">
                                            {sub.fech > 0 ? <span className={sub.meta > 0 && sub.fech > sub.meta ? "text-red-600" : "text-emerald-700"}>{fmt(sub.fech)}</span> : <span className="text-gray-300">{pend ? "aguard." : "—"}</span>}
                                          </TableCell>
                                        </>
                                      )}
                                    </TableRow>
                                  )}
                                  {!grupoFechado && novoPai && (
                                    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80 border-gray-100">
                                      <TableCell className="py-1.5">
                                        {r.m.parentEapCodigo && <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-mono font-bold">{r.m.parentEapCodigo}</span>}
                                      </TableCell>
                                      <TableCell colSpan={7} className="py-1.5 text-xs font-semibold text-gray-700">{r.m.parentEapDescricao || "—"}</TableCell>
                                    </TableRow>
                                  )}
                                  {!grupoFechado && (
                                  <TableRow className={`border-gray-100 hover:bg-gray-50 ${r.it.semVerba ? (r.it.motivoSemVerba === "avulso" ? "bg-orange-50" : "bg-red-50") : ""}`}>
                                    <TableCell className="py-2.5">
                                      {codFilho
                                        ? <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 text-[10px] font-mono">{codFilho}</span>
                                        : <span className="text-gray-300 text-xs">—</span>}
                                    </TableCell>
                                    <TableCell className="text-gray-900 text-sm py-2.5 pl-3">{r.it.descricao}{badges(r.it)}</TableCell>
                                    <TableCell className="text-gray-500 text-sm">{r.it.unidade || "un"}</TableCell>
                                    <TableCell className="text-gray-700 text-sm text-right">{nnum(r.it.quantidade).toLocaleString("pt-BR")}</TableCell>
                                    <TableCell className="text-blue-700 text-sm text-right bg-blue-50/40">
                                      {r.metaUnit > 0 ? fmt(r.metaUnit) : <span className="text-gray-300">—</span>}
                                      {tipoCot === "pacote" && (nnum(r.m.metaUnitarioMat) > 0 || nnum(r.m.metaUnitarioMdo) > 0) && (
                                        <div className="text-[10px] text-blue-400 mt-0.5">Mat {fmt(nnum(r.m.metaUnitarioMat))} · MDO {fmt(nnum(r.m.metaUnitarioMdo))}</div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-blue-700 text-sm font-medium text-right bg-blue-50/40">
                                      {r.metaTotal > 0 ? fmt(r.metaTotal) : <span className="text-gray-300">—</span>}
                                    </TableCell>
                                    <TableCell className="text-sm text-right bg-emerald-50/30">{cellFechado(r.fechUnit, "text-emerald-800")}</TableCell>
                                    <TableCell className="text-sm font-semibold text-right bg-emerald-50/30">
                                      {cellFechado(r.fechTotal, r.metaTotal > 0 && r.fechTotal > r.metaTotal ? "text-red-600" : "text-emerald-700")}
                                    </TableCell>
                                  </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableRow className="bg-gray-900 hover:bg-gray-900 border-gray-900">
                              <TableCell colSpan={5} className="py-3 text-xs font-bold text-white uppercase tracking-wide">Total</TableCell>
                              <TableCell className="py-3 text-sm font-bold text-blue-300 text-right">{fmt(totalMeta)}</TableCell>
                              <TableCell className="py-3 text-right">
                                {totalFech > 0 && totalMeta > 0 && (
                                  <span className={`text-[11px] font-bold ${delta <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {delta <= 0 ? "▼" : "▲"} {fmt(Math.abs(delta))}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-3 text-sm font-bold text-right">
                                {pend && totalFech === 0 ? <span className="text-gray-400">aguard.</span> : <span className="text-emerald-300">{fmt(totalFech)}</span>}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                        {/* Rev. 5090 — Resumo consolidado de materiais (igual ao do mapa), no fim da tela */}
                        {resumoRows.length > 0 && (
                          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50/40">
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" /> Resumo Consolidado de Materiais
                              {!usaFechadoResumo && <span className="normal-case tracking-normal font-medium text-[10px] text-blue-500">(valores pela meta do orçamento — fechado sai após aprovação)</span>}
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wider text-white bg-slate-800">
                                    <th className="text-left py-2 px-3 font-semibold">Material / Serviço</th>
                                    <th className="text-center py-2 px-2 font-semibold">Un.</th>
                                    <th className="text-right py-2 px-3 font-semibold">Qtd Total</th>
                                    <th className="text-right py-2 px-3 font-semibold bg-emerald-700">{usaFechadoResumo ? "Valor Fechado" : "Valor Meta"}</th>
                                    <th className="text-left py-2 px-3 font-semibold bg-emerald-700 w-[140px]">% do Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {resumoRows.map((g, gi) => {
                                    const val = usaFechadoResumo ? g.valor : g.meta;
                                    const pct = resumoTotal > 0 ? (val / resumoTotal) * 100 : 0;
                                    return (
                                      <tr key={`${g.descricao}_${g.unidade}`} className={`border-b border-gray-100 ${gi % 2 === 1 ? "bg-gray-50/60" : "bg-white"}`}>
                                        <td className="py-1.5 px-3 text-gray-700">{g.descricao}</td>
                                        <td className="py-1.5 px-2 text-center">
                                          <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 whitespace-nowrap">{g.unidade}</span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{g.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                                        <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50/40">
                                          {val > 0 ? `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                        </td>
                                        <td className="py-1.5 px-3 bg-emerald-50/40">
                                          <div className="flex items-center gap-1.5">
                                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[50px]">
                                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
                                            </div>
                                            <span className="text-[10px] text-gray-500 tabular-nums w-9 text-right">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  {/* Rev. 5098 — subtotal por categoria (nome) + unidade */}
                                  {Object.entries(resumoRows.reduce((acc: Record<string, { qtd: number; n: number; valor: number; label: string; un: string }>, g: any) => {
                                    const cat = categoriaResumo(g.descricao, g.unidade);
                                    if (!acc[cat.key]) acc[cat.key] = { qtd: 0, n: 0, valor: 0, label: cat.label, un: g.unidade || "un" };
                                    acc[cat.key].qtd += g.qtd; acc[cat.key].n++; acc[cat.key].valor += (usaFechadoResumo ? g.valor : g.meta);
                                    return acc;
                                  }, {})).filter(([, v]) => v.n > 1).map(([k, v]) => (
                                    <tr key={`cat_${k}`} className="bg-slate-100 border-t border-slate-200">
                                      <td className="py-1.5 px-3 font-semibold text-slate-700 text-[11px]">Total {v.label} — {v.n} itens</td>
                                      <td className="py-1.5 px-2 text-center">
                                        <span className="inline-block bg-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{v.un}</span>
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">{v.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                                        {v.valor > 0 ? `R$ ${v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                      </td>
                                      <td />
                                    </tr>
                                  ))}
                                  <tr className="bg-slate-800 text-white">
                                    <td className="py-2 px-3 font-bold uppercase text-[10px] tracking-wider">{usaFechadoResumo ? "Total Fechado" : "Total Meta"}</td>
                                    <td /><td />
                                    <td className="py-2 px-3 text-right font-bold text-emerald-300 whitespace-nowrap">
                                      R$ {resumoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-[10px] text-slate-300">100%</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                        </>
                      );
                    })()}
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
                            setTituloDraft(contratoTitulo || "Contrato de Prestação de Serviços");
                            setTituloPromptOpen(true);
                          }} disabled={gerarContrato.isPending}
                            className="bg-purple-600 hover:bg-purple-500 text-white gap-2">
                            {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            Visualizar e Aprovar Contrato
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
                          className={`${(() => { const venc = (mapa?.participantes ?? []).find((p:any)=>p.selecionado) ?? null; const est = !!venc?.isEstoque; return temItensSemVerba && !semVerbaAutorizado ? "bg-red-600 hover:bg-red-700" : est ? "bg-violet-600 hover:bg-violet-500" : isMedicaoVencedor ? "bg-blue-600 hover:bg-blue-500" : "bg-emerald-600 hover:bg-emerald-500"; })()} text-white gap-2`}>
                          {gerarOC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : temItensSemVerba && !semVerbaAutorizado ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          {(() => { const venc = (mapa?.participantes ?? []).find((p:any)=>p.selecionado) ?? null; const est = !!venc?.isEstoque; return temItensSemVerba && !semVerbaAutorizado ? "Aprovar (Requer Autorização)" : semVerbaAutorizado ? "Aprovar e Gerar OC (Autorizado)" : est ? "Atender pelo Estoque" : isMedicaoVencedor ? "Aprovar e Gerar Contrato" : "Aprovar e Gerar OC"; })()}
                        </Button>
                        {(mapa?.participantes ?? []).length >= 2 && !isMedicaoVencedor && (
                          <Button variant="outline" onClick={() => handleAbrirCotacaoParcial(detalheFullscreen.id)} disabled={gerarOC.isPending || gerarOCsParciais.isPending}
                            className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2">
                            <GitBranch className="h-4 w-4" /> Cotação Parcial
                          </Button>
                        )}
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
                    {detalheFullscreen.status === "aprovada" && (detalheFullscreen as any).tipo !== "servico" && (() => {
                      const jaEmOC = mapa?.itensJaEmOC ?? [];
                      const pendentes = (mapa?.itens ?? []).filter((it: any) => !jaEmOC.includes(it.id));
                      return pendentes.length > 0 && (mapa?.participantes ?? []).length >= 1;
                    })() && (
                      <Button variant="outline"
                        onClick={() => handleAbrirCotacaoParcial(detalheFullscreen.id)}
                        disabled={gerarOCsParciais.isPending}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2">
                        <GitBranch className="h-4 w-4" />
                        Complementar OC Parcial
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                          {(mapa?.itens ?? []).filter((it: any) => !(mapa?.itensJaEmOC ?? []).includes(it.id)).length} pendente(s)
                        </span>
                      </Button>
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
                              .map((f: any) => {
                                const checked = mapaFornMultiIds.has(f.id);
                                return (
                                  <div key={f.id}
                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${mapaFornSelectId === String(f.id) ? "bg-blue-50" : ""}`}>
                                    {/* Rev. 4016 — Item 22: checkbox p/ seleção múltipla (ação em lote via "Adicionar selecionados"). */}
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300 accent-blue-600 shrink-0"
                                      checked={checked}
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => {
                                        setMapaFornMultiIds(prev => {
                                          const n = new Set(prev);
                                          e.target.checked ? n.add(f.id) : n.delete(f.id);
                                          return n;
                                        });
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => { setMapaFornSelectId(String(f.id)); setMapaFornOpen(false); setMapaFornSearch(""); }}
                                      className={`flex-1 text-left ${mapaFornSelectId === String(f.id) ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                                      {f.nomeFantasia || f.razaoSocial}
                                    </button>
                                  </div>
                                );
                              })}
                            {fornDisponiveis.filter((f: any) => !mapaFornSearch || (f.nomeFantasia || f.razaoSocial || "").toLowerCase().includes(mapaFornSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-3 text-sm text-gray-400 text-center">Nenhum fornecedor encontrado</p>
                            )}
                          </div>
                          {mapaFornMultiIds.size > 0 && (
                            <div className="p-2 border-t border-gray-100 flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={addingFornMulti || !showDetalhe}
                                onClick={async () => {
                                  if (!showDetalhe) return;
                                  setAddingFornMulti(true);
                                  try {
                                    const ids = Array.from(mapaFornMultiIds);
                                    for (const fid of ids) {
                                      await adicionarForn.mutateAsync({ cotacaoId: showDetalhe, fornecedorId: fid });
                                    }
                                    toast.success(`${ids.length} fornecedor(es) adicionado(s) à cotação`);
                                    setMapaFornMultiIds(new Set());
                                    setMapaFornOpen(false);
                                  } catch (err: any) {
                                    toast.error(`Falha ao adicionar fornecedores: ${err?.message || "erro"}`);
                                  } finally {
                                    setAddingFornMulti(false);
                                  }
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-2"
                              >
                                {addingFornMulti ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                Adicionar {mapaFornMultiIds.size} selecionado(s)
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="text-gray-400" onClick={() => setMapaFornMultiIds(new Set())}>Limpar</Button>
                            </div>
                          )}
                          <div className="p-2 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => {
                                setMapaFornOpen(false);
                                // Se a busca já tinha um texto, aproveita como razão social inicial.
                                setNovoFornInitial(mapaFornSearch.trim() ? { razaoSocial: mapaFornSearch.trim() } : undefined);
                                setShowNovoForn(true);
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors">
                              <UserPlus className="h-4 w-4" /> Cadastrar novo fornecedor
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button onClick={() => { if (mapaFornSelectId && showDetalhe) { adicionarForn.mutate({ cotacaoId: showDetalhe, fornecedorId: parseInt(mapaFornSelectId) }); setMapaFornSelectId(""); } }}
                        disabled={!mapaFornSelectId || adicionarForn.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                        <UserPlus className="h-4 w-4" /> Adicionar
                      </Button>
                      {showDetalhe && !(mapa?.participantes ?? []).some((p: any) => p.isEstoque) && (
                        <Button
                          type="button"
                          onClick={() => {
                            // Rev. 2466 — Abre modal de seleção em vez de
                            // chamar a mutation direto (que antes fazia
                            // auto-match cego sobre o almox inteiro).
                            setEstoquePickerIds(new Set());
                            setEstoquePickerSearch("");
                            setEstoquePickerOrigem("todas");
                            setShowEstoquePicker(true);
                          }}
                          disabled={adicionarEstoque.isPending}
                          className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
                          title="Escolher itens do almoxarifado pra atender esta SC"
                        >
                          {adicionarEstoque.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                          Atender pelo Estoque
                        </Button>
                      )}
                    </div>

                    {/* Cadastro completo de fornecedor sem sair da cotação (modal compartilhado) */}
                    <FornecedorFormModal
                      companyId={companyId}
                      open={showNovoForn}
                      initialForm={novoFornInitial}
                      onClose={() => { setShowNovoForn(false); setNovoFornInitial(undefined); }}
                      onSaved={(f) => {
                        fornQ.refetch();
                        // Já deixa o novo fornecedor selecionado pra adicionar ao mapa num clique.
                        if (f?.id) setMapaFornSelectId(String(f.id));
                      }}
                    />

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
                          const isEstoqueChip = !!p.isEstoque;
                          const nomeChip = isEstoqueChip
                            ? `${p.fornecedorInternoNome || "Empresa"} — Estoque interno`
                            : nome;
                          return (
                            <div key={`${p.fornecedorId}-${isEstoqueChip ? "est" : "f"}`} className="flex items-center gap-1">
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${isEstoqueChip ? "bg-violet-50 border-violet-300 text-violet-700" : isMelhor ? "bg-emerald-50 border-emerald-300 text-emerald-700" : p.selecionado ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-100 border-gray-300 text-gray-700"}`}>
                                {isEstoqueChip ? <Package className="h-3 w-3" /> : (isMelhor && <Trophy className="h-3 w-3" />)}
                                {nomeChip}
                                {isEstoqueChip && <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full border border-violet-200 font-semibold">ESTOQUE</span>}
                                {!isEstoqueChip && <FornecedorContatoPopover fornecedor={p.fornecedor} />}
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
                              {!isEstoqueChip && (<button
                                type="button"
                                onPointerDown={(e) => { e.stopPropagation(); openEditForn(p.fornecedorId); }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 text-gray-400 transition-colors shadow-sm cursor-pointer"
                                title="Editar cadastro do fornecedor"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>)}
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

                  {/* Rev. 4013 — regime de custo/risco, só p/ obras "Fornecimento de MDO" */}
                  {(detalheFullscreen as any).obraTipoContrato === "mdo" && !melhorForn?.selecionado && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Este item é custo de quem?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(["cliente_paga", "empresa_sem_risco", "empresa_com_risco"] as const).map(opt => {
                          const info = REGIME_CUSTO_INFO[opt];
                          const ativo = regimeCustoSel === opt;
                          return (
                            <button key={opt} type="button"
                              onClick={() => { setRegimeCustoSel(opt); setShowRegimeInfo(opt); }}
                              className={`text-left rounded-lg border p-2.5 transition-colors ${ativo ? info.ativoClasse : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                            >
                              <p className="text-xs font-semibold text-gray-800">{info.titulo}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{info.texto}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                        <Button onClick={() => selecionarVencedor.mutate({ cotacaoId: showDetalhe!, fornecedorId: melhorForn.fornecedorId, regimeCusto: regimeCustoSel })}
                          disabled={selecionarVencedor.isPending || melhorForn.selecionado}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-sm">
                          {melhorForn.selecionado ? <><CheckCircle className="h-4 w-4" /> Vencedor Selecionado</> : <><Trophy className="h-4 w-4" /> Selecionar como Vencedor</>}
                        </Button>
                      </div>
                    </div>
                  )}
                  {cobertura && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cobertura do Orçamento</p>
                        {coberturaFiltro && (
                          <button type="button" onClick={() => setCoberturaFiltro(null)}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                            <X className="h-3 w-3" /> Limpar filtro
                          </button>
                        )}
                      </div>
                      {/* Rev. 5084 — cards clicáveis: filtram a matriz abaixo p/ mostrar SÓ os itens daquela classificação */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900">{Math.round(cobertura.pctMedio)}%</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Cobertura média</div>
                          <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden mx-4">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(cobertura.pctMedio, 100)}%` }} />
                          </div>
                        </div>
                        <button type="button"
                          onClick={() => setCoberturaFiltro(f => f === "total" ? null : "total")}
                          title="Itens em que a quantidade solicitada em compras já cobre 100% da quantidade orçada. Clique para filtrar."
                          className={`text-center rounded-lg py-1 transition-colors cursor-pointer hover:bg-emerald-50 ${coberturaFiltro === "total" ? "ring-2 ring-emerald-500 bg-emerald-50" : ""}`}>
                          <div className="text-2xl font-bold text-emerald-600">{cobertura.totais}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Compra total {coberturaFiltro === "total" ? "· filtrando" : ""}</div>
                        </button>
                        <button type="button"
                          onClick={() => setCoberturaFiltro(f => f === "parcial" ? null : "parcial")}
                          title="Itens em que já foi solicitada UMA PARTE da quantidade orçada (o restante ainda não foi comprado). Clique para filtrar."
                          className={`text-center rounded-lg py-1 transition-colors cursor-pointer hover:bg-amber-50 ${coberturaFiltro === "parcial" ? "ring-2 ring-amber-500 bg-amber-50" : ""}`}>
                          <div className="text-2xl font-bold text-amber-600">{cobertura.parciais}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Compra parcial {coberturaFiltro === "parcial" ? "· filtrando" : ""}</div>
                        </button>
                        <button type="button"
                          onClick={() => setCoberturaFiltro(f => f === "sem" ? null : "sem")}
                          title="Itens orçados que ainda não tiveram nenhuma quantidade solicitada em compras. Clique para filtrar."
                          className={`text-center rounded-lg py-1 transition-colors cursor-pointer hover:bg-gray-50 ${coberturaFiltro === "sem" ? "ring-2 ring-gray-400 bg-gray-50" : ""}`}>
                          <div className="text-2xl font-bold text-gray-400">{cobertura.semCobertura}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Sem cobertura {coberturaFiltro === "sem" ? "· filtrando" : ""}</div>
                        </button>
                      </div>
                      {coberturaFiltro && (
                        <p className="mt-2 text-[11px] text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                          {coberturaFiltro === "total" && "Mostrando só os itens com compra TOTAL: a quantidade solicitada já cobre toda a quantidade orçada."}
                          {coberturaFiltro === "parcial" && "Mostrando só os itens com compra PARCIAL: foi solicitada apenas parte da quantidade orçada — o restante ainda está por comprar."}
                          {coberturaFiltro === "sem" && "Mostrando só os itens SEM cobertura: nada foi solicitado ainda para esses itens orçados."}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Rev. 4250 — Campo de busca de itens no mapa (topo) */}
                  {(mapa?.participantes ?? []).length > 0 && (
                    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Filtrar itens por descrição…"
                          value={mapaFiltro}
                          onChange={e => setMapaFiltro(e.target.value)}
                          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 placeholder-gray-400"
                        />
                        {mapaFiltro && (
                          <button onClick={() => setMapaFiltro("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {mapaFiltro && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {(() => {
                            const tot = (mapa?.itens ?? []).length;
                            const vis = (mapa?.itens ?? []).filter((it: any) => (it.descricao ?? "").toLowerCase().includes(mapaFiltro.toLowerCase())).length;
                            return `${vis} de ${tot} item${tot !== 1 ? "s" : ""}`;
                          })()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Matriz de preços */}
                  {mapaQ.isLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : (mapa?.participantes ?? []).length === 0 ? null : (
                    <div className="space-y-2">
                      {/* Toolbar de seleção múltipla de itens */}
                      {detalheFullscreen?.status === "pendente" && mapaItemsChecked.size > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 flex-wrap">
                          <span className="text-xs font-semibold text-blue-800">{mapaItemsChecked.size} {mapaItemsChecked.size === 1 ? "item selecionado" : "itens selecionados"}</span>
                          <div className="flex-1" />
                          {/* Distribuir por fornecedor — só com ≥2 participantes */}
                          {(mapa?.participantes ?? []).length >= 2 && (
                            <>
                              <select
                                value={atribuirFornId}
                                onChange={e => setAtribuirFornId(e.target.value)}
                                className="text-xs border border-blue-300 rounded px-2 py-1 bg-white text-gray-800 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">Selecionar fornecedor...</option>
                                {(mapa?.participantes ?? []).map((p: any) => (
                                  <option key={p.fornecedorId} value={p.fornecedorId}>
                                    {p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!atribuirFornId}
                                onClick={() => {
                                  if (!atribuirFornId) return;
                                  const fornId = parseInt(atribuirFornId);
                                  setVencedorPorItem(prev => {
                                    const next = { ...prev };
                                    mapaItemsChecked.forEach(id => { next[id] = fornId; });
                                    return next;
                                  });
                                  setMapaItemsChecked(new Set());
                                  setAtribuirFornId("");
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" /> Fechar para fornecedor
                              </button>
                            </>
                          )}
                          {/* Excluir em lote — sempre disponível */}
                          <button
                            type="button"
                            disabled={excluirItensCotacao.isPending}
                            onClick={() => {
                              // Para pacotes: expandir cada ID selecionado para incluir todos os irmãos
                              // do mesmo composicaoCodigo (que compartilham o grupo mas têm IDs distintos)
                              const rawItems: any[] = mapa?.itens ?? [];
                              const allIds = new Set([...mapaItemsChecked]);
                              for (const id of mapaItemsChecked) {
                                const raw = rawItems.find((i: any) => i.id === id);
                                if (raw?.composicaoCodigo) {
                                  rawItems
                                    .filter((i: any) => i.composicaoCodigo === raw.composicaoCodigo)
                                    .forEach((i: any) => allIds.add(i.id));
                                }
                              }
                              if (!confirm(`Excluir ${allIds.size} ${allIds.size === 1 ? "item" : "itens"} da cotação?`)) return;
                              excluirItensCotacao.mutate({ ids: [...allIds] });
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Excluir {mapaItemsChecked.size > 1 ? `${mapaItemsChecked.size} itens` : "item"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMapaItemsChecked(new Set()); setAtribuirFornId(""); }}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Limpar seleção
                          </button>
                        </div>
                      )}
                      {/* Resumo de itens já atribuídos */}
                      {Object.keys(vencedorPorItem).length > 0 && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <GitBranch className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-xs font-semibold text-emerald-700">
                            {Object.keys(vencedorPorItem).length} {Object.keys(vencedorPorItem).length === 1 ? "item atribuído" : "itens atribuídos"} a fornecedores específicos
                          </span>
                          <div className="flex-1" />
                          {detalheFullscreen?.status === "pendente" && (
                            <button
                              type="button"
                              onClick={() => handleAprovarGerarOC(detalheFullscreen.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" /> Gerar OC Parcial
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setVencedorPorItem({})}
                            className="text-xs text-emerald-600 hover:text-red-600 underline"
                          >
                            Limpar atribuições
                          </button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                          {detalheFullscreen?.status === "pendente" && (mapa?.participantes ?? []).length >= 2 && mapaItemsChecked.size === 0 && Object.keys(vencedorPorItem).length === 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                              <GitBranch className="h-3.5 w-3.5" />
                              Marque itens na tabela para atribuir a fornecedores específicos
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Rev. 5159 — abrir/fechar todos: regiões (pais) + composições/pacotes (filhos) */}
                          {(() => {
                            const grupos = new Set<string>();
                            const filhosIds: number[] = [];
                            for (const it of (itensParaRenderizarMemo as any[])) {
                              const g = String(it.eapPath || it.parentEapDescricao || "").trim();
                              if (g) grupos.add(g);
                              if ((!it._grouped && (it.composicaoInsumos ?? []).length > 0) || (it._isPacoteGroup && (it._childItems ?? []).length > 0)) filhosIds.push(it.id);
                            }
                            if (grupos.size === 0 && filhosIds.length === 0) return null;
                            const tudoAberto = collapsedGrupos.size === 0 && filhosIds.every(id => expandedComposicao[id]);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (tudoAberto) {
                                    setCollapsedGrupos(new Set(grupos));
                                    setExpandedComposicao({});
                                  } else {
                                    setCollapsedGrupos(new Set());
                                    setExpandedComposicao(Object.fromEntries(filhosIds.map(id => [id, true])));
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                {tudoAberto ? <><ChevronUp className="h-3.5 w-3.5" /> Fechar todos</> : <><ChevronDown className="h-3.5 w-3.5" /> Abrir todos</>}
                              </button>
                            );
                          })()}
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
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
                        <table className="text-sm border-collapse" style={{ minWidth: "max-content" }}>
                          <thead className="sticky top-0 z-20">
                            {/* Linha 1: nomes dos grupos de colunas */}
                            <tr className="border-b border-gray-200 bg-gray-50">
                              {detalheFullscreen?.status === "pendente" && (() => {
                                const allItemIds = (mapa?.itens ?? []).map((it: any) => it.id) as number[];
                                const allChecked = allItemIds.length > 0 && allItemIds.every(id => mapaItemsChecked.has(id));
                                return (
                                  <th rowSpan={2} className="bg-gray-50 px-2 py-2 border-r border-gray-200 w-9">
                                    <input
                                      type="checkbox"
                                      checked={allChecked}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setMapaItemsChecked(new Set(allItemIds));
                                        } else {
                                          setMapaItemsChecked(new Set());
                                        }
                                      }}
                                      title={allChecked ? "Desmarcar todos" : "Selecionar todos"}
                                      className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                    />
                                  </th>
                                );
                              })()}
                              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2 min-w-56 max-w-md border-r border-gray-200 bg-gray-50 sticky left-0 z-30">
                                <div className="flex items-center gap-3">
                                  <span>Item</span>
                                  {detalheFullscreen?.status === "pendente" && (
                                    <div className="flex items-center gap-2 normal-case font-normal">
                                      <button
                                        onClick={() => setAddItemDialog(true)}
                                        className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors whitespace-nowrap"
                                      >
                                        <Plus className="h-3 w-3" />
                                        Incluir item avulso
                                      </button>
                                      <button
                                        onClick={() => { setEapPickerOpen(true); setEapPickerSearch(""); setEapPickerSelected(new Set()); }}
                                        className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors whitespace-nowrap"
                                      >
                                        <ClipboardList className="h-3 w-3" />
                                        Incluir item da EAP
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </th>
                              <th rowSpan={2} className="text-center text-xs font-semibold text-gray-500 uppercase px-2 py-2 w-12 border-r border-gray-200 bg-gray-50">Un.</th>
                              <th colSpan={((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote' ? 4 : 3} className="text-center text-xs font-semibold text-blue-600 uppercase px-2 py-2 border-r border-blue-100 bg-blue-50/60">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span>
                                    {((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'servico'
                                      ? "Meta MDO (Orçamento)"
                                      : ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote'
                                      ? "Meta Total (Orçamento)"
                                      : ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'equipamento'
                                      ? "Meta EQUIP (Orçamento)"
                                      : "Meta MAT (Orçamento)"}
                                  </span>
                                  {/* Rev. 5066 — total da meta também no topo (pedido do user: evitar rolar até o rodapé) */}
                                  {metaGrandTotal > 0 && (
                                    <div className="normal-case font-bold text-sm px-2 py-0.5 rounded-lg border bg-blue-100 text-blue-800 border-blue-300">
                                      {metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                    </div>
                                  )}
                                </div>
                              </th>
                              <th rowSpan={2} className="text-center text-xs font-semibold text-orange-600 uppercase px-2 py-2 border-r border-orange-100 bg-orange-50/60 w-24">Saldo<br/>Orç.</th>
                              {(mapa?.participantes ?? []).map((p: any) => {
                                const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
                                const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                                const sc = scoresQ.data?.[p.fornecedorId];
                                const scoreVal = sc?.score ?? 0;
                                const isRecomendado = scoreVal >= 4.0 && sc && sc.totalOCs >= 1;
                                const isAtencao = scoreVal > 0 && scoreVal < 2.5 && sc && sc.totalOCs >= 1;
                                // Rev. 212 — desconto global aplicado pela IA: acha o primeiro item com descontoPct > 0
                                const descontoForn = (() => {
                                  const rm = mapa?.respostaMap as Record<string, { descontoPct?: string }> | undefined;
                                  if (!rm) return 0;
                                  for (const it of (mapa?.itens ?? [])) {
                                    const d = parseFloat(rm[`${(it as any).id}_${p.fornecedorId}`]?.descontoPct ?? "0");
                                    if (d > 0) return d;
                                  }
                                  return 0;
                                })();
                                return (
                                  <th key={p.fornecedorId} colSpan={4} className={`text-center text-xs font-semibold uppercase px-2 py-2 border-r border-gray-200 align-top ${isMelhor ? "text-emerald-700 bg-emerald-50/60" : "text-gray-500"}`}>
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
                                      {/* Rev. 4245 — Total do fornecedor no cabeçalho */}
                                      {(() => {
                                        // Rev. 4285 — preferir totalOrcado (fonte autoritativa do backend, sem drift)
                                        // totaisPorFornecedor é derivado ao vivo e pode ter drift de float
                                        const storedTotal = parseFloat(p.totalOrcado ?? "0");
                                        const totalVivo = ((mapa as any)?.totaisPorFornecedor ?? {})[p.fornecedorId];
                                        const totalVal = storedTotal > 0 ? storedTotal : (totalVivo ?? 0);
                                        if (totalVal <= 0) return null;
                                        return (
                                          <div className={`normal-case font-bold text-sm px-2 py-0.5 rounded-lg border ${isMelhor ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-gray-100 text-gray-700 border-gray-300"}`}>
                                            {totalVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                          </div>
                                        );
                                      })()}
                                      <div className="flex items-center gap-1 flex-wrap justify-center">
                                        {p.selecionado ? (
                                          <span className="flex items-center gap-0.5 text-[9px] normal-case font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-300">
                                            <CheckCircle className="h-2.5 w-2.5" /> Vencedor
                                          </span>
                                        ) : detalheFullscreen?.status !== "aprovada" && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); selecionarVencedor.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, regimeCusto: regimeCustoSel }); }}
                                            disabled={selecionarVencedor.isPending}
                                            className="flex items-center gap-0.5 text-[9px] normal-case font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                                            title="Selecionar este fornecedor como vencedor"
                                          >
                                            <Trophy className="h-2.5 w-2.5" /> Vencedor
                                          </button>
                                        )}
                                        {safeAnexoHref((p as any).arquivoUrl) && (
                                          <a href={safeAnexoHref((p as any).arquivoUrl)} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700" title="Ver cotação anexada">
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                        {/* Rev. 212 — badge de desconto global aplicado pela IA */}
                                        {descontoForn > 0 && (
                                          <span className="flex items-center gap-0.5 text-[9px] normal-case font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-200" title={`Desconto global de ${descontoForn}% aplicado a todos os itens deste fornecedor`}>
                                            -{descontoForn}% desc.
                                          </span>
                                        )}
                                      </div>
                                      {/* Rev. 1989 — Toolbar compacto: icon-only, sem wrap, gap mínimo. */}
                                      <div className="flex items-center gap-0.5 justify-center">
                                      {/* Rev. 2799 — Botão claro: 1 clique anexa + lê com IA + abre conferência. */}
                                      <label
                                        className={`flex items-center gap-1 h-7 px-2 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                                          (extrairIA.isPending || !!iaJobId) ? "opacity-50 pointer-events-none border-gray-200 bg-gray-50 text-gray-400" :
                                          "bg-violet-600 border-violet-600 text-white hover:bg-violet-500"
                                        }`}
                                        title="Ler cotação (PDF ou JPG) com IA — pode selecionar VÁRIOS arquivos de uma vez (páginas/fotos da mesma cotação)"
                                      >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Ler cotação (IA)
                                        <input
                                          type="file"
                                          multiple
                                          accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf"
                                          className="hidden"
                                          disabled={extrairIA.isPending || !!iaJobId}
                                          onChange={async e => {
                                            const files = Array.from(e.target.files ?? []);
                                            e.target.value = "";
                                            if (files.length === 0) return;
                                            if (files.length > 10) { toast.error("Máximo de 10 arquivos por leitura."); return; }
                                            const normMime = (f: File) => {
                                              if (f.type === "application/pdf") return "application/pdf" as const;
                                              if (f.type === "image/jpeg" || f.type === "image/jpg") return "image/jpeg" as const;
                                              const ext = f.name.split(".").pop()?.toLowerCase();
                                              if (ext === "pdf") return "application/pdf" as const;
                                              return "image/jpeg" as const;
                                            };
                                            const readOne = (f: File) => new Promise<{ fileBase64: string; fileName: string; mimeType: "application/pdf" | "image/jpeg" }>((resolve, reject) => {
                                              const r = new FileReader();
                                              r.onload = ev => resolve({ fileBase64: (ev.target?.result as string).split(",")[1], fileName: f.name, mimeType: normMime(f) });
                                              r.onerror = () => reject(new Error("Falha ao ler " + f.name));
                                              r.readAsDataURL(f);
                                            });
                                            try {
                                              const arquivos = await Promise.all(files.map(readOne));
                                              const first = arquivos[0];
                                              setIaFileBuffer({ fornecedorId: p.fornecedorId, base64: first.fileBase64, fileName: first.fileName, mimeType: first.mimeType });
                                              uploadAnexo.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, fileBase64: first.fileBase64, fileName: first.fileName, mimeType: first.mimeType });
                                              extrairIA.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, arquivos, tipoProposta: iaTipoProposta });
                                            } catch (err: any) {
                                              toast.error(err?.message || "Falha ao ler os arquivos");
                                            }
                                          }}
                                        />
                                      </label>
                                      <div className="relative">
                                        {showAnexoInput === p.fornecedorId ? (
                                          <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3" onClick={e => e.stopPropagation()}>
                                            {/* Upload de arquivo */}
                                            <div>
                                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Arquivo (JPG ou PDF)</p>
                                              <label
                                                className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${anexoDragForn === p.fornecedorId ? "border-blue-400 bg-blue-100" : "border-blue-200 hover:bg-blue-50"}`}
                                                onDragOver={e => { e.preventDefault(); setAnexoDragForn(p.fornecedorId); }}
                                                onDragLeave={() => setAnexoDragForn(null)}
                                                onDrop={e => {
                                                  e.preventDefault();
                                                  setAnexoDragForn(null);
                                                  const file = e.dataTransfer.files?.[0];
                                                  if (!file) return;
                                                  const reader = new FileReader();
                                                  reader.onload = ev => {
                                                    const base64 = (ev.target?.result as string).split(',')[1];
                                                    setIaFileBuffer({ fornecedorId: p.fornecedorId, base64, fileName: file.name, mimeType: file.type });
                                                    uploadAnexo.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId, fileBase64: base64, fileName: file.name, mimeType: file.type });
                                                  };
                                                  reader.readAsDataURL(file);
                                                }}
                                              >
                                                <Paperclip className="h-5 w-5 text-blue-400" />
                                                <span className="text-xs text-blue-600 font-medium">{anexoDragForn === p.fornecedorId ? "Solte o arquivo aqui" : "Clique ou arraste o arquivo"}</span>
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
                                                  type="text" placeholder="https://..."
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
                                          className={`flex items-center justify-center h-7 w-7 rounded-lg transition-colors ${(p as any).arquivoUrl ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"}`}
                                          aria-label={(p as any).arquivoNome ? `Anexo: ${(p as any).arquivoNome}` : "Anexar arquivo ou link da cotação"}
                                          title={(p as any).arquivoNome ? `Anexo: ${(p as any).arquivoNome}` : "Anexar arquivo ou link da cotação"}>
                                          <Paperclip className="h-3.5 w-3.5" />
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
                                            className="flex items-center justify-center h-7 w-7 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
                                            aria-label="Ler documento com IA e preencher preços automaticamente"
                                            title="Ler documento com IA e preencher preços automaticamente">
                                            <Sparkles className="h-3.5 w-3.5" />
                                          </button>
                                          )
                                        )}
                                        <button
                                          onClick={() => setShowPropostas(showPropostas === p.fornecedorId ? null : p.fornecedorId)}
                                          className={`flex items-center justify-center h-7 w-7 rounded-lg transition-colors ${showPropostas === p.fornecedorId ? "bg-indigo-100 text-indigo-700 border border-indigo-300" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-600"}`}
                                          aria-label="Ver propostas enviadas por este fornecedor"
                                          aria-pressed={showPropostas === p.fornecedorId}
                                          title="Ver propostas enviadas por este fornecedor"
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                      {detalheFullscreen?.status !== "aprovada" && (
                                        <div className="mt-1 space-y-1">
                                          {salvarProgress !== null && editingFornId === p.fornecedorId && (
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all duration-300 ${salvarProgress >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                                                style={{ width: `${Math.min(salvarProgress, 100)}%` }}
                                              />
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1">
                                          {editingFornId === p.fornecedorId ? (
                                            <>
                                              <Button size="sm" onClick={() => handleSalvarPrecos(p.fornecedorId)} disabled={salvarRespostas.isPending}
                                                className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white gap-1 px-2">
                                                {salvarRespostas.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} {salvarRespostas.isPending ? `${Math.round(salvarProgress ?? 0)}%` : "Salvar"}
                                              </Button>
                                              <Button size="sm" variant="outline"
                                                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setNegociadoModal({ fornecedorId: p.fornecedorId }); setNegociadoValor(""); setNegociadoPreviewing(false); }}
                                                className="h-6 text-[10px] border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1 px-2">
                                                <BarChart3 className="h-3 w-3" /> Valor Negociado
                                              </Button>
                                              {mapaItemsChecked.size > 0 && (
                                                <Button size="sm" variant="outline"
                                                  onPointerDown={(e) => {
                                                    e.stopPropagation(); e.preventDefault();
                                                    // Rev. 5135 — expande grupos/pacotes selecionados p/ os itens brutos
                                                    const ids: number[] = [];
                                                    for (const o of itensParaRenderizarMemo as any[]) {
                                                      if (!mapaItemsChecked.has(o.id)) continue;
                                                      ids.push(o.id);
                                                      for (const c of ((o._childItems ?? []) as any[])) ids.push(c.id);
                                                    }
                                                    setNegociadoModal({ fornecedorId: p.fornecedorId, itemIds: ids, label: `${mapaItemsChecked.size} ${mapaItemsChecked.size === 1 ? "item selecionado" : "itens selecionados"}` });
                                                    setNegociadoValor(""); setNegociadoPreviewing(false);
                                                  }}
                                                  className="h-6 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-50 gap-1 px-2">
                                                  <BarChart3 className="h-3 w-3" /> Negociar seleção ({mapaItemsChecked.size})
                                                </Button>
                                              )}
                                              <Button size="sm" variant="outline" onClick={() => setEditingFornId(null)} className="h-6 text-[10px] border-gray-300 text-gray-600 px-2">
                                                Cancelar
                                              </Button>
                                            </>
                                          ) : (
                                            <Button size="sm" variant="outline" onClick={() => setEditingFornId(p.fornecedorId)}
                                              className="h-7 w-7 p-0 border-blue-200 text-blue-600 hover:bg-blue-50"
                                              aria-label="Editar preços deste fornecedor"
                                              title="Editar preços deste fornecedor">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          </div>
                                        </div>
                                      )}
                                      </div>
                                      {showPropostas === p.fornecedorId && (
                                        <div className="mt-1 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2 space-y-1 text-left">
                                          <span className="text-[9px] font-semibold text-indigo-700 uppercase tracking-wide">Propostas</span>
                                          {propostasQ.isLoading && <p className="text-[10px] text-gray-400">Carregando...</p>}
                                          {/* Rev. 5008 — o anexo salvo (arquivoUrl) NÃO aparecia aqui: este painel só
                                              listava as propostas lidas por IA (tabela própria). Agora o arquivo anexado
                                              pelo clipe aparece como "Proposta anexada" — é ele que vira o Anexo I. */}
                                          {safeAnexoHref((p as any).arquivoUrl) && (
                                            <a
                                              href={safeAnexoHref((p as any).arquivoUrl)}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-md px-2 py-1 hover:bg-indigo-50 transition-colors"
                                              title="Abrir a proposta anexada (Anexo I do contrato)"
                                            >
                                              <Paperclip className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                                              <span className="text-[10px] text-indigo-700 font-medium truncate">{(p as any).arquivoNome || "Proposta anexada"}</span>
                                              <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px flex-shrink-0 uppercase">Anexo I</span>
                                            </a>
                                          )}
                                          {propostasQ.data && propostasQ.data.length === 0 && !(p as any).arquivoUrl && (
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
                                                    onClick={async () => { if (await confirm({ title: "Excluir proposta?", description: "A proposta e os preços vinculados a ela serão removidos. Esta ação não pode ser desfeita.", tone: "destructive", confirmText: "Excluir", cancelText: "Cancelar" })) excluirProposta.mutate({ propostaId: prop.id, cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId, companyId }); }}
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
                              {/* Rev. 1991 — Coluna SALDO solitária REMOVIDA; saldo agora aparece dentro de cada fornecedor (4ª sub-coluna). */}
                            </tr>
                            {/* Linha 2: sub-headers */}
                            <tr className="border-b border-gray-300 bg-gray-50">
                              {((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote' ? (
                                <>
                                  <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-20">QTD</th>
                                  <th className="text-right text-xs font-medium text-blue-600 px-3 py-2 bg-blue-50/60 w-28">Material</th>
                                  <th className="text-right text-xs font-medium text-orange-500 px-3 py-2 bg-orange-50/40 w-28">Mão de Obra</th>
                                  <th className="text-right text-xs font-medium text-blue-700 px-3 py-2 bg-blue-50/60 w-28 border-r border-blue-100">Total Geral</th>
                                </>
                              ) : (
                                <>
                                  {/* Rev. 4998 — ordem QTD | Preço Unit. | Total (pedido do user) */}
                                  <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-20">QTD</th>
                                  <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-28">Preço Unit.</th>
                                  <th className="text-right text-xs font-medium text-blue-500 px-3 py-2 bg-blue-50/60 w-28 border-r border-blue-100">Total Meta</th>
                                </>
                              )}
                              {(mapa?.participantes ?? []).map((p: any) => {
                                const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                                const baseCls = isMelhor ? "text-emerald-600 bg-emerald-50/40" : "text-gray-500";
                                const isPacoteH = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
                                return (
                                  <th key={p.fornecedorId} colSpan={isPacoteH ? 5 : 4} className="p-0">
                                    {/* Prazo/cond sub-row inside header · Rev. 1991: +1 col "Saldo" */}
                                    <div className={`flex border-r border-gray-200 ${isMelhor ? "bg-emerald-50/40" : ""}`}>
                                      <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>QTD</div>
                                      {isPacoteH ? (
                                        <>
                                          <div className={`flex-1 text-right text-xs font-medium px-2 py-2 text-blue-600 border-r border-gray-100 ${isMelhor ? "bg-emerald-50/20" : ""}`}>Material</div>
                                          <div className={`flex-1 text-right text-xs font-medium px-2 py-2 text-orange-500 border-r border-gray-100 ${isMelhor ? "bg-emerald-50/20" : ""}`}>Mão de Obra</div>
                                          <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>Total Geral</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>Preço Unit.</div>
                                          <div className={`flex-1 text-right text-xs font-medium px-2 py-2 ${baseCls} border-r border-gray-100`}>Total</div>
                                        </>
                                      )}
                                      <div className={`flex-1 text-center text-xs font-semibold px-2 py-2 ${isMelhor ? "text-emerald-700 bg-emerald-50/60" : "text-emerald-600 bg-emerald-50/30"}`} title="Saldo deste fornecedor vs. Meta (Orçamento)">Saldo</div>
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
                            {/* Rev. 4258 — itensParaRenderizarMemo pré-computado (useMemo) substitui IIFE de 80 linhas */}
                            {itensParaRenderizarMemo.map((it: any, _idx: number, _arr: any[]) => {
                              const melhorPreco = melhorPrecoMap.get(it.id) ?? null;
                              const metaUnitRaw = parseFloat(it.metaUnitario ?? "0");
                              const metaUnit = Math.round(metaUnitRaw * 100) / 100;
                              const metaQtdVal = parseFloat(it.metaQtd ?? it.quantidade ?? "0");
                              const metaTot = Math.round(metaUnit * metaQtdVal * 100) / 100;
                              const { saldo, hasMeta } = getItemSaldo(it);
                              const hasComposicao = !it._grouped && ((it as any).composicaoInsumos ?? []).length > 0;
                              const hasPacoteExpand = it._isPacoteGroup && (it._childItems ?? []).length > 0;
                              const isExpanded = expandedComposicao[it.id] ?? false;
                              const numFornCols = (mapa?.participantes ?? []).length * 4;
                              const isPacoteTipoMapa = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === 'pacote';
                              // Para grupos pacote: split MAT/MDO da meta a partir dos child items
                              const pacoteMetaMat = (it._isPacoteGroup && isPacoteTipoMapa)
                                ? Math.round((it._childItems ?? []).reduce((s: number, c: any) => s + parseFloat(c.metaUnitarioMat ?? "0") * parseFloat(c.quantidade ?? "0"), 0) * 100) / 100
                                : 0;
                              const pacoteMetaMdo = (it._isPacoteGroup && isPacoteTipoMapa)
                                ? Math.round((it._childItems ?? []).reduce((s: number, c: any) => s + parseFloat(c.metaUnitarioMdo ?? "0") * parseFloat(c.quantidade ?? "0"), 0) * 100) / 100
                                : 0;
                              const showPacoteMatMdo = pacoteMetaMat > 0 || pacoteMetaMdo > 0; // Rev. 1991: +1 col Saldo por fornecedor
                              const itPausado = !!(it as any).pausado;
                              // Rev. 5067 — separador visual por etapa da EAP (pai): pavimento/trecho
                              const grupoAtual = String((it as any).eapPath || (it as any).parentEapDescricao || "").trim();
                              const grupoAnterior = _idx > 0 ? String((_arr[_idx - 1] as any).eapPath || (_arr[_idx - 1] as any).parentEapDescricao || "").trim() : null;
                              const mostraGrupoHeader = !!grupoAtual && grupoAtual !== grupoAnterior;
                              const grupoColSpan = (detalheFullscreen?.status === "pendente" ? 1 : 0) + 2 + (isPacoteTipoMapa ? 4 : 3) + 1 + numFornCols;
                              // Rev. 5134 — região recolhida: só o header aparece
                              const grupoCollapsed = !!grupoAtual && collapsedGrupos.has(grupoAtual);
                              if (grupoCollapsed && !mostraGrupoHeader) return null;
                              return (
                                <React.Fragment key={it.id}>
                                {mostraGrupoHeader && (() => {
                                  // Rev. 5068 — subtotal da meta por trecho/pavimento (pedido do user)
                                  let subtotalGrupo = 0;
                                  const grupoRows: any[] = [];
                                  for (let gi = _idx; gi < _arr.length; gi++) {
                                    const g = _arr[gi] as any;
                                    if (String(g.eapPath || g.parentEapDescricao || "").trim() !== grupoAtual) break;
                                    grupoRows.push(g);
                                    const gu = Math.round(parseFloat(g.metaUnitario ?? "0") * 100) / 100;
                                    const gq = parseFloat(g.metaQtd ?? g.quantidade ?? "0");
                                    subtotalGrupo += Math.round(gu * gq * 100) / 100;
                                  }
                                  // Rev. 5133 — total de cada FORNECEDOR na região + desvio vs meta (pedido do user)
                                  const totalItemForn = (g: any, fornId: number): number => {
                                    const isEd = editingFornId === fornId;
                                    const um = (itemId: number, qtdFallback: any): number => {
                                      const k = `${itemId}_${fornId}`;
                                      if (isEd) {
                                        if (editTotaisOverride[k] != null) return editTotaisOverride[k];
                                        const pr = parseBRNumber(editPrecos[k] ?? "0") || 0;
                                        const qEd = editQtds[k] != null ? parseBRNumber(editQtds[k]) : 0;
                                        const q = qEd > 0 ? qEd : (parseFloat(mapa?.respostaMap?.[k]?.quantidade ?? String(qtdFallback ?? "0")) || 0);
                                        return pr * q;
                                      }
                                      const r: any = mapa?.respostaMap?.[k];
                                      if (!r) return 0;
                                      const tot = parseFloat(r.total ?? "0") || 0;
                                      if (tot > 0) return tot; // total salvo é autoritativo (Rev. 5079)
                                      return (parseFloat(r.precoUnitario ?? "0") || 0) * (parseFloat(r.quantidade ?? String(qtdFallback ?? "0")) || 0);
                                    };
                                    const kids = (g._childItems as any[]) ?? null;
                                    if (g._isPacoteGroup && kids?.length) {
                                      const first = kids[0];
                                      const k = `${first.id}_${fornId}`;
                                      if (isEd && editTotaisOverride[k] != null) return editTotaisOverride[k];
                                      const compQtd = (first as any).composicaoQtdOrcada || parseFloat(g.quantidade ?? "0") || 0;
                                      const r: any = mapa?.respostaMap?.[k];
                                      if (!isEd && r && (parseFloat(r.total ?? "0") || 0) > 0) return parseFloat(r.total);
                                      const pr = isEd ? (parseBRNumber(editPrecos[k] ?? "0") || 0) : (parseFloat(r?.precoUnitario ?? "0") || 0);
                                      return pr * compQtd;
                                    }
                                    if (g._grouped && kids?.length) return kids.reduce((s: number, c: any) => s + um(c.id, c.quantidade), 0);
                                    return um(g.id, g.quantidade ?? "1");
                                  };
                                  const fornTotais = (mapa?.participantes ?? []).map((p: any) => ({
                                    p,
                                    nome: p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`,
                                    total: Math.round(grupoRows.reduce((s: number, g: any) => s + totalItemForn(g, p.fornecedorId), 0) * 100) / 100,
                                  })).filter((f: any) => f.total > 0);
                                  return (
                                    <tr className="bg-slate-100/90 border-y border-slate-200 cursor-pointer select-none hover:bg-slate-200/70 transition-colors"
                                      onClick={() => setCollapsedGrupos(prev => {
                                        const nx = new Set(prev);
                                        if (nx.has(grupoAtual)) nx.delete(grupoAtual); else nx.add(grupoAtual);
                                        return nx;
                                      })}>
                                      <td colSpan={grupoColSpan} className="px-4 py-1.5">
                                        <span className="sticky left-4 inline-flex items-center gap-2 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                          {grupoCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                                          {/* Rev. 5135 — selecionar a região inteira de uma vez */}
                                          {detalheFullscreen?.status === "pendente" && (() => {
                                            const idsRegiao = grupoRows.map((g: any) => g.id);
                                            const allSel = idsRegiao.length > 0 && idsRegiao.every((gid: number) => mapaItemsChecked.has(gid));
                                            return (
                                              <input type="checkbox" checked={allSel}
                                                className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                                title="Selecionar todos os itens desta região"
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => {
                                                  e.stopPropagation();
                                                  setMapaItemsChecked(prev => {
                                                    const nx = new Set(prev);
                                                    idsRegiao.forEach((gid: number) => { if (allSel) nx.delete(gid); else nx.add(gid); });
                                                    return nx;
                                                  });
                                                }} />
                                            );
                                          })()}
                                          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                                          {grupoAtual}
                                          {grupoCollapsed && (
                                            <span className="normal-case tracking-normal text-[10px] font-semibold text-slate-400">({grupoRows.length} {grupoRows.length === 1 ? "item" : "itens"})</span>
                                          )}
                                          {subtotalGrupo > 0 && (
                                            <span className="normal-case tracking-normal font-bold text-[11px] px-2 py-0.5 rounded-lg border bg-blue-100 text-blue-800 border-blue-300">
                                              Meta: {subtotalGrupo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                            </span>
                                          )}
                                          {/* Rev. 5133 — total por fornecedor na região + desvio vs meta */}
                                          {fornTotais.map((f: any) => {
                                            const desvio = Math.round((f.total - subtotalGrupo) * 100) / 100;
                                            const acima = desvio > 0;
                                            return (
                                              <span key={f.p.fornecedorId} className="normal-case tracking-normal font-bold text-[11px] px-2 py-0.5 rounded-lg border bg-white text-slate-700 border-slate-300 inline-flex items-center gap-1.5">
                                                <span className="max-w-[120px] truncate font-semibold text-slate-500">{f.nome}:</span>
                                                {f.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                                {subtotalGrupo > 0 && desvio !== 0 && (
                                                  <span className={`font-bold ${acima ? "text-red-600" : "text-emerald-600"}`}>
                                                    {acima ? "+" : "−"}{Math.abs(desvio).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          })}
                                          {/* Rev. 5132 — negociar só esta região (fornecedor em edição) */}
                                          {editingFornId != null && (
                                            <button
                                              type="button"
                                              className="normal-case tracking-normal inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 transition-colors"
                                              title="Negociar valor só desta região"
                                              onClick={e => e.stopPropagation()}
                                              onPointerDown={e => {
                                                e.stopPropagation(); e.preventDefault();
                                                setNegociadoModal({ fornecedorId: editingFornId, grupo: grupoAtual });
                                                setNegociadoValor(""); setNegociadoPreviewing(false);
                                              }}>
                                              <BarChart3 className="h-3 w-3" /> Negociar região
                                            </button>
                                          )}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })()}
                                {!grupoCollapsed && (<>
                                <tr className={`group border-b border-gray-100 hover:bg-gray-50/60 ${itPausado ? "opacity-50 bg-gray-50" : ""} ${it._isPacoteGroup && !itPausado ? "bg-indigo-50/30" : ""} ${mapaItemsChecked.has(it.id) && !itPausado ? "bg-blue-50/40" : ""}`}>
                                  {detalheFullscreen?.status === "pendente" && (
                                    <td className={`px-2 py-1 border-r border-gray-100 w-9 align-middle ${it._isPacoteGroup ? "bg-indigo-50/30" : mapaItemsChecked.has(it.id) ? "bg-blue-50" : "bg-white"}`}>
                                      <div className="flex flex-col items-center gap-1">
                                        <input
                                          type="checkbox"
                                          checked={mapaItemsChecked.has(it.id)}
                                          onChange={e => {
                                            setMapaItemsChecked(prev => {
                                              const next = new Set(prev);
                                              if (e.target.checked) next.add(it.id);
                                              else next.delete(it.id);
                                              return next;
                                            });
                                          }}
                                          className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                        />
                                        {vencedorPorItem[it.id] && (() => {
                                          const p = (mapa?.participantes ?? []).find((pp: any) => pp.fornecedorId === vencedorPorItem[it.id]);
                                          const nome = p?.fornecedor?.nomeFantasia || p?.fornecedor?.razaoSocial || `#${vencedorPorItem[it.id]}`;
                                          const nome2 = nome.length > 8 ? nome.substring(0, 8) + "…" : nome;
                                          return (
                                            <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 leading-tight" title={nome}>
                                              {nome2}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  )}
                                  <td className={`px-4 py-2 border-r border-gray-100 sticky left-0 z-10 max-w-md ${it._isPacoteGroup ? "bg-indigo-50/30" : mapaItemsChecked.has(it.id) ? "bg-blue-50/40" : "bg-white"}`}>
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
                                        {(() => {
                                          // Rev. 5074 — número do item conforme o orçamento, visível na linha
                                          const cod = String((it as any).eapCodigo ?? (it as any).parentEapCodigo ?? "").trim();
                                          return cod && !it._isPacoteGroup ? (
                                            <span className="mr-1.5 inline-block px-1 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[9px] text-gray-500 align-middle whitespace-nowrap">{cod}</span>
                                          ) : null;
                                        })()}
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
                                        {/* Rev. 2488 — célula limpa: badges de rastreabilidade (SC/EAP), barra
                                            de progresso, "Em OC" e "Sem verba" foram movidos pro TOOLTIP do título e
                                            pro ícone Info abaixo, pra deixar o mapa enxuto estilo ERP de mercado. */}
                                        {(() => {
                                          const partes: string[] = [];
                                          if (!it._grouped) {
                                            if ((it as any).parentEapDescricao && ((it as any).parentEapDescricao || "").trim() !== (it.descricao || "").trim()) {
                                              partes.push(`↳ Item EAP${(it as any).parentEapCodigo ? ` ${(it as any).parentEapCodigo}` : ""}: ${(it as any).parentEapDescricao}`);
                                            }
                                            if (it.eapPath) partes.push(`Etapa: ${it.eapPath}`);
                                            if ((it as any).scNumero) partes.push(`SC: ${formatNumeroScDisplay((it as any).scNumero)}`);
                                            if ((mapa?.itensJaEmOC ?? []).includes(it.id)) partes.push("✓ Já em OC");
                                            const orcada = (it as any).qtdOrcada ?? 0;
                                            const totalSolic = (it as any).qtdTotalSolicitada ?? 0;
                                            if (orcada > 0) {
                                              const pct = Math.round((totalSolic / orcada) * 100);
                                              partes.push(`Solicitado: ${totalSolic} de ${orcada} (${pct}%)`);
                                            }
                                            if ((it as any).semVerba) {
                                              partes.push((it as any).motivoSemVerba === "avulso" ? "⚠ FORA DO ORÇAMENTO" : "⚠ SEM VERBA");
                                            }
                                          }
                                          return partes.length > 0 ? (
                                            <span
                                              className="ml-1 inline-flex items-center text-[10px] text-gray-300 hover:text-gray-500 cursor-help align-middle"
                                              title={partes.join("\n")}
                                            >
                                              <Info className="h-3 w-3" />
                                            </span>
                                          ) : null;
                                        })()}
                                         {!it._grouped && ((it as any).comprasAnteriores ?? []).length > 0 && (
                                           <div className="mt-1 flex flex-wrap items-center gap-1">
                                             <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                                               (it as any).compraStatus === "total"
                                                 ? "border-blue-200 bg-blue-50 text-blue-700"
                                                 : "border-amber-200 bg-amber-50 text-amber-700"
                                             }`}>
                                               <History className="h-2.5 w-2.5" />
                                               {(it as any).compraStatus === "total" ? "Compra anterior total" : "Compra anterior parcial"}
                                             </span>
                                             {((it as any).comprasAnteriores as any[]).slice(0, 3).map((ref: any) => (
                                               <span key={`${ref.ocId}:${ref.scId ?? 0}`} className="inline-flex items-center gap-1 text-[9px]">
                                                 {ref.scId && (
                                                   <button
                                                     type="button"
                                                     onClick={(event) => {
                                                       event.stopPropagation();
                                                       navigate(`/compras/solicitacoes?destaque=${ref.scId}`);
                                                     }}
                                                     className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                                     title="Abrir solicitação de compra anterior"
                                                   >
                                                     SC {formatNumeroScDisplay(ref.scNumero ?? String(ref.scId))}
                                                   </button>
                                                 )}
                                                 <button
                                                   type="button"
                                                   onClick={(event) => {
                                                     event.stopPropagation();
                                                     navigate(`/compras/ordens?destaque=${ref.ocId}`);
                                                   }}
                                                   className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-blue-800 hover:underline"
                                                   title={`${ref.atendimento === "total" ? "Compra total" : "Compra parcial"} · ${Number(ref.quantidade ?? 0).toLocaleString("pt-BR")} · ${Number(ref.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                                                 >
                                                   <ExternalLink className="h-2.5 w-2.5" />
                                                   OC {formatNumeroOcDisplay(ref.ocNumero ?? String(ref.ocId))}
                                                 </button>
                                               </span>
                                             ))}
                                           </div>
                                         )}
                                      </div>
                                      <HistoricoPrecoPopover companyId={companyId} descricao={it.descricao} />
                                      {/* Rev. 4245 — botões editar/excluir visíveis no hover, só em pendente */}
                                      {/* _grouped bloqueia filhos de pacote mas não o item-pai (isPacoteGroup) */}
                                      {detalheFullscreen?.status === "pendente" && (!it._grouped || it._isPacoteGroup) && (
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                                          {/* Rev. 4255 — botão pausa/reativar item */}
                                          <button
                                            title={itPausado ? "Reativar item (incluir na cotação)" : "Pausar item (excluir da cotação sem apagar)"}
                                            disabled={togglePausarItem.isPending}
                                            onClick={() => togglePausarItem.mutate({ id: it.id, pausado: !itPausado })}
                                            className={`p-0.5 rounded transition-colors disabled:opacity-40 ${itPausado ? "text-amber-500 hover:bg-amber-100 hover:text-amber-700 opacity-100" : "text-gray-300 hover:bg-amber-100 hover:text-amber-600"}`}
                                          >
                                            {itPausado ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                          </button>
                                          <button
                                            title="Editar item"
                                            onClick={() => setEditItemDialog({ id: it.id, descricao: it.descricao ?? "", unidade: it.unidade ?? "un", quantidade: it.quantidade ?? "1", somenteMo: !!(it as any).somenteMo })}
                                            className="p-0.5 rounded hover:bg-blue-100 text-gray-300 hover:text-blue-600 transition-colors"
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                          <button
                                            title="Excluir item"
                                            disabled={excluirItemCotacao.isPending}
                                            onClick={() => { if (confirm(`Excluir "${it.descricao}"?`)) excluirItemCotacao.mutate({ id: it.id }); }}
                                            className="p-0.5 rounded hover:bg-red-100 text-gray-300 hover:text-red-600 transition-colors disabled:opacity-40"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500 text-xs text-center border-r border-gray-100">{it.unidade || "un"}</td>
                                  {/* Meta cols */}
                                  {isPacoteTipoMapa ? (() => {
                                    // Pacote: QTD | Material | Mão de Obra | Total Geral
                                    const matVal = showPacoteMatMdo ? pacoteMetaMat : Math.round(parseFloat(it.metaUnitarioMat ?? "0") * metaQtdVal * 100) / 100;
                                    const mdoVal = showPacoteMatMdo ? pacoteMetaMdo : Math.round(parseFloat(it.metaUnitarioMdo ?? "0") * metaQtdVal * 100) / 100;
                                    const totalGeral = Math.round((matVal + mdoVal) * 100) / 100;
                                    return (
                                      <>
                                        <td className="px-3 py-2 text-blue-600 text-xs text-right bg-blue-50/30">
                                          {metaQtdVal > 0 ? metaQtdVal.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-blue-700 text-xs text-right bg-blue-50/30 font-semibold">
                                          {matVal > 0 ? matVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-orange-700 text-xs text-right bg-orange-50/20 font-semibold">
                                          {mdoVal > 0 ? mdoVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-blue-800 text-xs text-right bg-blue-50/30 font-bold border-r border-blue-100">
                                          {totalGeral > 0 ? totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                        </td>
                                      </>
                                    );
                                  })() : (
                                    <>
                                      {/* Rev. 4998 — ordem QTD | Preço Unit. | Total (pedido do user) */}
                                      <td className="px-3 py-2 text-blue-600 text-xs text-right bg-blue-50/30">
                                        {metaQtdVal > 0 ? metaQtdVal.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="px-3 py-2 text-blue-700 text-xs text-right bg-blue-50/30 font-medium">
                                        <div className="flex items-center justify-end gap-1">
                                          {(it as any).incluirAjudante === false && (it as any).metaMdoProfissional > 0 && (
                                            <span className="px-1 py-0 text-[8px] font-bold rounded bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap" title="Cotação sem ajudante — meta apenas do profissional">Só prof.</span>
                                          )}
                                          {metaUnit > 0 ? metaUnit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-blue-700 text-xs text-right bg-blue-50/30 font-semibold border-r border-blue-100">
                                        {metaTot > 0 ? metaTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                      </td>
                                    </>
                                  )}
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
                                      displayPreco = isEditing ? parseBRNumber(editPrecos[key] ?? String(savedPreco)) : savedPreco;
                                      displayQty = compQtd;
                                      displayTotal = displayPreco * displayQty;
                                    } else if (it._grouped) {
                                      const childItems = it._childItems as any[];
                                      savedPreco = parseFloat(mapa?.respostaMap?.[`${childItems[0].id}_${p.fornecedorId}`]?.precoUnitario ?? "0");
                                      savedQty = childItems.reduce((s: number, ci: any) => s + parseFloat(mapa?.respostaMap?.[`${ci.id}_${p.fornecedorId}`]?.quantidade ?? ci.quantidade ?? "0"), 0);
                                      displayPreco = isEditing ? parseBRNumber(editPrecos[key] ?? String(savedPreco)) : savedPreco;
                                      displayQty = savedQty || parseFloat(it.quantidade ?? "0");
                                      displayTotal = displayPreco * displayQty;
                                    } else {
                                      savedPreco = parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
                                      savedQty = parseFloat(mapa?.respostaMap?.[key]?.quantidade ?? it.quantidade ?? "1");
                                      displayPreco = isEditing ? parseBRNumber(editPrecos[key] ?? "0") : savedPreco;
                                      displayQty = isEditing ? (parseBRNumber(editQtds[key] ?? "0") || savedQty) : savedQty;
                                      displayTotal = displayPreco * displayQty;
                                    }

                                    const isBest = melhorPreco !== null && displayPreco > 0 && displayPreco === melhorPreco;
                                    const rowCls = isMelhor ? "bg-emerald-50/30" : "";

                                    const handleGroupedPrecoChange = (val: string) => {
                                      if (it._grouped) {
                                        const updates: Record<string, string> = { [key]: val };
                                        const keysToRemove: string[] = [key];
                                        for (const ci of it._childItems) {
                                          const ck = `${ci.id}_${p.fornecedorId}`;
                                          updates[ck] = val;
                                          keysToRemove.push(ck);
                                        }
                                        setEditPrecos(prev => ({ ...prev, ...updates }));
                                        // Rev. 4252 — edição manual invalida override de total negociado
                                        setEditTotaisOverride(prev => { const n = { ...prev }; for (const k of keysToRemove) delete n[k]; return n; });
                                      } else {
                                        setEditPrecos(prev => ({ ...prev, [key]: val }));
                                        setEditTotaisOverride(prev => { const n = { ...prev }; delete n[key]; return n; });
                                      }
                                    };

                                    // Rev. 5094 — aplicar o preço digitado NESTE item a TODOS os itens do
                                    // fornecedor (pedido do user: listas grandes com preço unitário igual).
                                    const aplicarPrecoEmTodos = () => {
                                      const valPreco = editPrecos[key] ?? "";
                                      const valMdo = editMatMdo[key]?.mdo;
                                      if (!valPreco && !valMdo) { toast.error("Digite o preço neste item primeiro."); return; }
                                      const updP: Record<string, string> = {};
                                      const updM: Record<string, { mat: string; mdo: string }> = {};
                                      const clearKeys: string[] = [];
                                      let n = 0;
                                      for (const o of itensParaRenderizarMemo as any[]) {
                                        const ks = [`${o.id}_${p.fornecedorId}`, ...(((o._childItems ?? []) as any[]).map((c: any) => `${c.id}_${p.fornecedorId}`))];
                                        for (const k of ks) {
                                          updP[k] = valPreco || String(parseBRNumber(valMdo ?? "0") || 0);
                                          if (valMdo != null) updM[k] = { mdo: valMdo, mat: editMatMdo[key]?.mat ?? "0" };
                                          clearKeys.push(k);
                                        }
                                        n++;
                                      }
                                      setEditPrecos(prev => ({ ...prev, ...updP }));
                                      if (valMdo != null) setEditMatMdo(prev => ({ ...prev, ...updM }));
                                      setEditTotaisOverride(prev => { const nn = { ...prev }; for (const k of clearKeys) delete nn[k]; return nn; });
                                      toast.success(`Preço aplicado a ${n} itens deste fornecedor.`);
                                    };

                                    return (
                                      <>
                                        <td key={`qty_${p.fornecedorId}`} className={`px-1 py-1 text-right border-r border-gray-100 ${rowCls}`}>
                                          {isEditing && !it._grouped ? (
                                            <Input type="text" inputMode="decimal"
                                              value={editQtds[key] ?? savedQty.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                                              onFocus={e => e.target.select()}
                                              onChange={e => setEditQtds(prev => ({ ...prev, [key]: e.target.value }))}
                                              className="h-8 text-sm text-right border-gray-300 bg-white text-gray-900 w-28 ml-auto" />
                                          ) : (
                                            <span className="text-xs text-gray-600">{displayQty > 0 ? displayQty.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}</span>
                                          )}
                                        </td>
                                        {isPacoteTipoMapa ? (() => {
                                          // Pacote: calcular MAT e MDO do fornecedor para este item
                                          // Se em edição e usuário já definiu manualmente, usa editMatMdo direto
                                          let matF = 0, mdoF = 0;
                                          const hasManualMatMdo = isEditing && editMatMdo[key] != null;
                                          if (hasManualMatMdo) {
                                            matF = parseBRNumber(editMatMdo[key].mat) || 0;
                                            mdoF = parseBRNumber(editMatMdo[key].mdo) || 0;
                                          } else if (it._isPacoteGroup) {
                                            // Verifica se há totalMat/totalMdo já salvo no primeiro filho
                                            const savedRr = mapa?.respostaMap?.[`${(it._childItems as any[])[0].id}_${p.fornecedorId}`];
                                            const savedTm = parseFloat((savedRr as any)?.totalMat ?? "");
                                            const savedTd = parseFloat((savedRr as any)?.totalMdo ?? "");
                                            if (!isNaN(savedTm) && !isNaN(savedTd) && (savedTm > 0 || savedTd > 0)) {
                                              matF = savedTm;
                                              mdoF = savedTd;
                                            } else {
                                              // Cálculo proporcional: split pelo ratio mat/mdo da meta de cada filho
                                              for (const c of (it._childItems as any[])) {
                                                const rr = mapa?.respostaMap?.[`${c.id}_${p.fornecedorId}`];
                                                const price = parseFloat((rr as any)?.precoUnitario ?? "0");
                                                const qty = parseFloat((rr as any)?.quantidade ?? c.quantidade ?? "1");
                                                const tot = price * qty;
                                                if (tot <= 0) continue;
                                                const cMat = parseFloat(c.metaUnitarioMat ?? "0");
                                                const cMdo = parseFloat(c.metaUnitarioMdo ?? "0");
                                                const totalMeta = cMat + cMdo;
                                                if (totalMeta > 0) { matF += tot * (cMat / totalMeta); mdoF += tot * (cMdo / totalMeta); }
                                                else if (cMdo > 0) mdoF += tot;
                                                else matF += tot;
                                              }
                                            }
                                          } else {
                                            const savedRr = mapa?.respostaMap?.[key];
                                            const savedTm = parseFloat((savedRr as any)?.totalMat ?? "");
                                            const savedTd = parseFloat((savedRr as any)?.totalMdo ?? "");
                                            if (!isNaN(savedTm) && !isNaN(savedTd) && (savedTm > 0 || savedTd > 0)) {
                                              matF = savedTm; mdoF = savedTd;
                                            } else {
                                              const cMat = parseFloat(it.metaUnitarioMat ?? "0");
                                              const cMdo = parseFloat(it.metaUnitarioMdo ?? "0");
                                              const totalMeta = cMat + cMdo;
                                              if (totalMeta > 0) { mdoF = displayTotal * (cMdo / totalMeta); matF = displayTotal * (cMat / totalMeta); }
                                              else if (cMdo > 0) mdoF = displayTotal;
                                              else matF = displayTotal;
                                            }
                                          }
                                          matF = Math.round(matF * 100) / 100;
                                          mdoF = Math.round(mdoF * 100) / 100;
                                          return (
                                            <>
                                              <td key={`forn_mat_${p.fornecedorId}`} className={`px-2 py-1 text-right border-r border-gray-100 ${rowCls}`}>
                                                {isEditing ? (
                                                  <div className="flex items-center justify-end gap-0.5">
                                                    <span className="text-[10px] text-gray-400 select-none">R$</span>
                                                    <Input type="text" inputMode="decimal"
                                                      value={editMatMdo[key]?.mat != null ? editMatMdo[key].mat : matF.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                      onFocus={e => e.target.select()}
                                                      onChange={e => {
                                                        const mat = parseBRNumber(e.target.value) || 0;
                                                        const mdo = parseBRNumber(editMatMdo[key]?.mdo ?? String(mdoF)) || 0;
                                                        setEditMatMdo(prev => ({ ...prev, [key]: { ...(prev[key] ?? { mat: String(matF), mdo: String(mdoF) }), mat: e.target.value } }));
                                                        setEditPrecos(prev => ({ ...prev, [key]: String(mat + mdo) }));
                                                      }}
                                                      className="h-6 text-xs text-right border-blue-300 bg-white text-gray-900 w-24" placeholder="0,00" />
                                                  </div>
                                                ) : (
                                                  <span className="text-xs font-semibold text-blue-700">
                                                    {matF > 0 ? matF.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                                  </span>
                                                )}
                                              </td>
                                              <td key={`forn_mdo_${p.fornecedorId}`} className={`px-2 py-1 text-right border-r border-gray-100 ${rowCls}`}>
                                                {isEditing ? (
                                                  <div className="flex items-center justify-end gap-0.5">
                                                    <span className="text-[10px] text-gray-400 select-none">R$</span>
                                                    <Input type="text" inputMode="decimal"
                                                      value={editMatMdo[key]?.mdo != null ? editMatMdo[key].mdo : mdoF.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                      onFocus={e => e.target.select()}
                                                      onChange={e => {
                                                        const mdo = parseBRNumber(e.target.value) || 0;
                                                        const mat = parseBRNumber(editMatMdo[key]?.mat ?? String(matF)) || 0;
                                                        setEditMatMdo(prev => ({ ...prev, [key]: { ...(prev[key] ?? { mat: String(matF), mdo: String(mdoF) }), mdo: e.target.value } }));
                                                        setEditPrecos(prev => ({ ...prev, [key]: String(mat + mdo) }));
                                                      }}
                                                      className="h-6 text-xs text-right border-orange-300 bg-white text-gray-900 w-24" placeholder="0,00" />
                                                  </div>
                                                ) : (
                                                  <span className="text-xs font-semibold text-orange-700">
                                                    {mdoF > 0 ? mdoF.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                                  </span>
                                                )}
                                              </td>
                                            </>
                                          );
                                        })() : (
                                          <td key={`preco_${p.fornecedorId}`} className={`px-1 py-1 text-right border-r border-gray-100 ${rowCls} ${isBest ? "bg-emerald-50" : ""}`}>
                                            {(() => {
                                              const isServico = ((mapa as any)?.tipoEfetivo ?? mapa?.cotacao?.tipo) === "servico";
                                              const canMatMdo = isServico && !it._isPacoteGroup && !it._grouped;
                                              const savedMat = parseFloat((mapa?.respostaMap?.[key] as any)?.totalMat ?? "0");
                                              const savedMdo = parseFloat((mapa?.respostaMap?.[key] as any)?.totalMdo ?? "0");
                                              if (isEditing && canMatMdo) {
                                                // Rev. 4998 — MAT/MDO agora são preço UNITÁRIO (coluna "Preço Unit."):
                                                // o total do item = (MAT + MDO) × QTD. Antes o campo era tratado como
                                                // total do item e o valor digitado "não multiplicava" (bug reportado).
                                                const qtdConv = displayQty > 0 ? displayQty : 1;
                                                const fmtUnit = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                                                // Rev. 5075 — cotação SÓ de mão de obra: aparece somente o campo MDO
                                                // (sem MAT, para não atrelar custo fora do escopo). MAT/MDO juntos
                                                // continuam existindo apenas na cotação tipo PACOTE.
                                                return (
                                                  <div className="flex flex-col gap-0.5 items-end">
                                                    <div className="flex items-center gap-1">
                                                      <span className="text-[9px] text-orange-600 font-bold w-7 text-right">MDO</span>
                                                      <span className="text-[10px] text-gray-400 select-none">R$</span>
                                                      <Input type="text" inputMode="decimal"
                                                        value={editMatMdo[key]?.mdo != null ? editMatMdo[key].mdo : (savedMdo > 0 ? fmtUnit(savedMdo / qtdConv) : "")}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => {
                                                          const mdo = parseBRNumber(e.target.value) || 0;
                                                          const mat = parseBRNumber(editMatMdo[key]?.mat ?? (savedMat > 0 ? fmtUnit(savedMat / qtdConv) : "0")) || 0;
                                                          setEditMatMdo(prev => ({ ...prev, [key]: { mdo: e.target.value, mat: prev[key]?.mat ?? (savedMat > 0 ? fmtUnit(savedMat / qtdConv) : "0") } }));
                                                          setEditPrecos(prev => ({ ...prev, [key]: String(mat + mdo) }));
                                                          setEditTotaisOverride(prev => { const n = { ...prev }; delete n[key]; return n; });
                                                        }}
                                                        className="h-6 text-xs text-right border-orange-300 bg-white text-gray-900 w-24" placeholder="0,00" />
                                                    </div>
                                                    <button type="button" onClick={aplicarPrecoEmTodos}
                                                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                                      title="Aplicar este preço unitário a todos os itens deste fornecedor">
                                                      <ArrowDown className="h-2.5 w-2.5" /> aplicar em todos
                                                    </button>
                                                  </div>
                                                );
                                              }
                                              if (isEditing) {
                                                return (
                                                  <div className="flex flex-col items-end gap-0.5">
                                                    <Input type="text" inputMode="decimal"
                                                      value={editPrecos[key] ?? ""}
                                                      onFocus={e => e.target.select()}
                                                      onChange={e => handleGroupedPrecoChange(e.target.value)}
                                                      className={`h-8 text-sm text-right border-gray-300 bg-white text-gray-900 w-32 ml-auto ${isBest ? "border-emerald-400" : ""}`}
                                                      placeholder="0,00" />
                                                    <button type="button" onClick={aplicarPrecoEmTodos}
                                                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                                      title="Aplicar este preço unitário a todos os itens deste fornecedor">
                                                      <ArrowDown className="h-2.5 w-2.5" /> aplicar em todos
                                                    </button>
                                                  </div>
                                                );
                                              }
                                              if (canMatMdo && (savedMat > 0 || savedMdo > 0)) {
                                                // Rev. 5095 — savedMat/savedMdo são TOTAIS do item; a coluna é
                                                // "Preço Unit.", então exibir total ÷ quantidade (bug: unitário
                                                // aparecia igual ao total após salvar).
                                                const qtdDiv = savedQty > 0 ? savedQty : 1;
                                                const fmtUnitBR = (v: number) => `R$ ${(v / qtdDiv).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
                                                return (
                                                  <div className="flex flex-col items-end gap-0">
                                                    {savedMat > 0 && (
                                                      <div className="flex items-center gap-1">
                                                        <span className="text-[9px] text-blue-500 font-bold">MAT</span>
                                                        <span className="text-xs text-gray-700">{fmtUnitBR(savedMat)}</span>
                                                      </div>
                                                    )}
                                                    <div className="flex items-center gap-1">
                                                      <span className="text-[9px] text-orange-500 font-bold">MDO</span>
                                                      <span className="text-xs text-gray-700">{savedMdo > 0 ? fmtUnitBR(savedMdo) : <span className="text-gray-300">—</span>}</span>
                                                    </div>
                                                  </div>
                                                );
                                              }
                                              return (
                                                <span className={`text-xs font-medium ${isBest ? "text-emerald-700 font-bold" : "text-gray-700"}`}>
                                                  {displayPreco > 0 ? displayPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                                </span>
                                              );
                                            })()}
                                          </td>
                                        )}
                                        <td key={`tot_${p.fornecedorId}`} className={`px-2 py-1 text-right border-r border-gray-100 ${rowCls} ${isBest ? "bg-emerald-50" : ""} ${vencedorPorItem[it.id] === p.fornecedorId ? "ring-1 ring-inset ring-emerald-400" : ""}`}>
                                          <div className="flex items-center justify-end gap-1">
                                            <span className={`text-xs font-semibold ${isMelhor ? "text-emerald-700" : "text-gray-700"}`}>
                                              {displayTotal > 0 ? displayTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                            </span>
                                            {displayPreco > 0 && detalheFullscreen?.status !== "aprovada" && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setVencedorPorItem(prev => {
                                                    if (prev[it.id] === p.fornecedorId) {
                                                      const next = { ...prev };
                                                      delete next[it.id];
                                                      return next;
                                                    }
                                                    return { ...prev, [it.id]: p.fornecedorId };
                                                  });
                                                }}
                                                className={`shrink-0 p-0.5 rounded-full transition-colors ${vencedorPorItem[it.id] === p.fornecedorId ? "text-emerald-600 bg-emerald-100 border border-emerald-300" : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"}`}
                                                title={vencedorPorItem[it.id] === p.fornecedorId ? "Remover seleção deste item" : "Selecionar fornecedor para este item"}
                                              >
                                                <Pin className="h-2.5 w-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {/* Rev. 1991 — Saldo por fornecedor por item: metaTot - displayTotal */}
                                        <td key={`sld_${p.fornecedorId}`} className={`px-2 py-1 text-center border-r border-gray-200 ${rowCls}`}>
                                          {(() => {
                                            if (!(metaTot > 0 && displayTotal > 0)) return <span className="text-gray-300 text-xs">—</span>;
                                            const saldoForn = metaTot - displayTotal;
                                            return (
                                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${saldoForn >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                                                title={`Meta: ${metaTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\nFornecedor: ${displayTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\nSaldo: ${saldoForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}>
                                                {saldoForn >= 0 ? "+" : ""}{saldoForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                              </span>
                                            );
                                          })()}
                                        </td>
                                      </>
                                    );
                                  })}
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
                                      <td colSpan={6 + numFornCols} className="px-0 py-0 sticky left-0 z-10">
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
                                      <td colSpan={6 + numFornCols} className="px-0 py-0 sticky left-0 z-10">
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
                                </>)}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {/* Totais */}
                            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                              <td colSpan={2} className="px-4 py-3 text-xs text-gray-700 uppercase border-r border-gray-200">Total</td>
                              {/* Rev. 4998 — ordem QTD | Preço Unit. | Total (pedido do user) */}
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40 font-bold">
                                {qtdGrandTotal !== null
                                  ? <span title={`Total de ${qtdUnidade}`}>{qtdGrandTotal.toLocaleString("pt-BR")} <span className="font-normal text-blue-400">{qtdUnidade}</span></span>
                                  : "—"}
                              </td>
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40">—</td>
                              <td className="px-3 py-3 text-right text-xs text-blue-700 bg-blue-50/40 border-r border-blue-100 font-bold">
                                 {metaGrandTotal > 0 ? (
                                   <div>
                                     <div>{metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                                     {comprasAnterioresTotal > 0 && (
                                       <div className="mt-0.5 text-[9px] font-medium text-slate-500" title="Valor já comprometido por OCs anteriores válidas">
                                         − {comprasAnterioresTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} anteriores
                                       </div>
                                     )}
                                   </div>
                                 ) : "—"}
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
                                    <td key={`tftot_${p.fornecedorId}`} className={`px-3 py-3 text-right text-sm border-r border-gray-100 ${isMelhor ? "text-emerald-700 bg-emerald-50" : "text-gray-900"}`}>
                                      {totalForn > 0 ? totalForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                                    </td>
                                    {/* Saldo financeiro: meta original − OCs anteriores − cotação atual */}
                                    <td key={`tfsld_${p.fornecedorId}`} className={`px-3 py-3 text-center border-r border-gray-200 ${isMelhor ? "bg-emerald-50" : ""}`}>
                                      {(() => {
                                        if (!(metaGrandTotal > 0 && totalForn > 0)) return <span className="text-gray-300">—</span>;
                                        const saldoFornTot = metaGrandTotal - comprasAnterioresTotal - totalForn;
                                        return (
                                          <span className={`text-sm font-bold px-2 py-1 rounded-full whitespace-nowrap ${saldoFornTot >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                                            title={`Meta original: ${metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\nOCs anteriores: ${comprasAnterioresTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\nCotação atual: ${totalForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\nSaldo financeiro: ${saldoFornTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}>
                                            {saldoFornTot >= 0 ? "+" : ""}{saldoFornTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                          </span>
                                        );
                                      })()}
                                    </td>
                                  </>
                                );
                              })}
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
                                  {/* Rev. 1991 — célula vazia da nova coluna Saldo */}
                                  <td key={`bsld_${p.fornecedorId}`} className="px-2 py-2 border-r border-gray-200"></td>
                                </>
                              ))}
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Quantidade excedente é um alerta físico separado e não
                          abre realocação enquanto a meta financeira ainda cobre. */}
                      {(() => {
                        const itensExcedentes = allItens.filter((item: any) =>
                          Number(item.qtdOrcada ?? 0) > 0 &&
                          Number(item.qtdTotalSolicitada ?? 0) > Number(item.qtdOrcada ?? 0) + 0.01
                        );
                        if (itensExcedentes.length === 0) return null;
                        return (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div>
                              <p className="text-sm font-semibold text-amber-900">Quantidade acima do orçamento</p>
                              <p className="text-xs text-amber-700">
                                {itensExcedentes.length} item(ns) excedem a quantidade prevista. Revise a necessidade física; este alerta não exige realocação enquanto houver saldo financeiro na meta.
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Alerta de saldo financeiro negativo + Realocação */}
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
                          {/* Rev. 5089 — layout com cores: zebra, badge de unidade, % do total com barra */}
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-white bg-slate-800">
                                  <th className="text-left py-2 px-3 font-semibold">Material / Serviço</th>
                                  <th className="text-center py-2 px-2 font-semibold">Un.</th>
                                  <th className="text-right py-2 px-3 font-semibold">Qtd Total</th>
                                  {temValorResumo && <th className="text-right py-2 px-3 font-semibold bg-emerald-700">Valor Fechado</th>}
                                  {temValorResumo && <th className="text-left py-2 px-3 font-semibold bg-emerald-700 w-[140px]">% do Total</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {gruposAgrupados.map((g, idx) => {
                                  const pct = temValorResumo && resumoValorTotal > 0 ? (g.valorTotal / resumoValorTotal) * 100 : 0;
                                  return (
                                    <tr key={`${g.descricao}_${g.unidade}`} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/60" : "bg-white"}`}>
                                      <td className="py-1.5 px-3 text-gray-700">{g.descricao}</td>
                                      <td className="py-1.5 px-2 text-center">
                                        <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 whitespace-nowrap">{g.unidade}</span>
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{g.qtdTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                                      {temValorResumo && (
                                        <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50/40">
                                          {g.valorTotal > 0 ? `R$ ${g.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                        </td>
                                      )}
                                      {temValorResumo && (
                                        <td className="py-1.5 px-3 bg-emerald-50/40">
                                          <div className="flex items-center gap-1.5">
                                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[50px]">
                                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
                                            </div>
                                            <span className="text-[10px] text-gray-500 tabular-nums w-9 text-right">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                {/* Rev. 5098 — subtotal por categoria (nome) + unidade */}
                                {Object.entries(gruposAgrupados.reduce((acc: Record<string, { qtd: number; n: number; valor: number; label: string; un: string }>, g: any) => {
                                  const cat = categoriaResumo(g.descricao, g.unidade);
                                  if (!acc[cat.key]) acc[cat.key] = { qtd: 0, n: 0, valor: 0, label: cat.label, un: g.unidade || "un" };
                                  acc[cat.key].qtd += g.qtdTotal; acc[cat.key].n++; acc[cat.key].valor += g.valorTotal;
                                  return acc;
                                }, {})).filter(([, v]) => v.n > 1).map(([k, v]) => (
                                  <tr key={`cat_${k}`} className="bg-slate-100 border-t border-slate-200">
                                    <td className="py-1.5 px-3 font-semibold text-slate-700 text-[11px]">Total {v.label} — {v.n} itens</td>
                                    <td className="py-1.5 px-2 text-center">
                                      <span className="inline-block bg-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{v.un}</span>
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">{v.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                                    {temValorResumo && (
                                      <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                                        {v.valor > 0 ? `R$ ${v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                      </td>
                                    )}
                                    {temValorResumo && <td />}
                                  </tr>
                                ))}
                                {temValorResumo && (
                                  <tr className="bg-slate-800 text-white">
                                    <td className="py-2 px-3 font-bold uppercase text-[10px] tracking-wider">Total Fechado</td>
                                    <td /><td />
                                    <td className="py-2 px-3 text-right font-bold text-emerald-300 whitespace-nowrap">
                                      R$ {resumoValorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-[10px] text-slate-300">100%</td>
                                  </tr>
                                )}
                              </tfoot>
                            </table>
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

        {/* Rev. 4013 — balão informativo do regime de custo/risco */}
        <Dialog open={showRegimeInfo !== null} onOpenChange={(v) => { if (!v) setShowRegimeInfo(null); }}>
          <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827', zIndex: 9999 }}>
            {showRegimeInfo && (() => {
              const info = REGIME_CUSTO_INFO[showRegimeInfo];
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-gray-900 text-lg">{info.titulo}</DialogTitle>
                  </DialogHeader>
                  <div className={`rounded-lg border p-4 ${info.badgeClasse}`}>
                    <p className="text-sm leading-relaxed">{info.texto}</p>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setShowRegimeInfo(null)} className="bg-gray-800 hover:bg-gray-700 text-white">Entendi</Button>
                  </div>
                </>
              );
            })()}
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
                    {sp.tipoOrigem === "equipamento" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center p-2 bg-white rounded border border-gray-100">
                          <p className="text-[10px] text-gray-400 uppercase">Total Locação</p>
                          <p className="text-sm font-bold text-gray-800">{fmt(sp.totalGeral)}</p>
                        </div>
                        <div className="text-center p-2 bg-orange-50 rounded border border-orange-200">
                          <p className="text-[10px] text-orange-500 uppercase font-medium">100% Locação</p>
                          <p className="text-sm font-bold text-orange-700">{fmt(sp.totalGeral)}</p>
                          <p className="text-[10px] text-orange-400">vai ao fornecedor</p>
                        </div>
                      </div>
                    ) : (
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
                    )}
                    {sp.tipoOrigem && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Tipo SC: <span className="font-semibold">{sp.tipoOrigem === "material" ? "Material" : sp.tipoOrigem === "servico" ? "Serviço/MDO" : sp.tipoOrigem === "pacote" ? "Pacote (Mat+MDO)" : sp.tipoOrigem === "equipamento" ? "Equipamento (Locação)" : sp.tipoOrigem}</span>
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
                  {saldoFdQ.data && (
                    <div className={`rounded-lg border p-3 ${saldoFdQ.data.totalFdOrcado <= 0 ? "bg-amber-50 border-amber-200" : saldoFdQ.data.saldoFd > 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Saldo de FD da Obra</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">FD Orçado</p>
                          <p className="text-sm font-bold text-gray-800">{fmt(saldoFdQ.data.totalFdOrcado)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Comprometido</p>
                          <p className="text-sm font-bold text-amber-600">{fmt(saldoFdQ.data.totalFdComprometido)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase">Saldo</p>
                          <p className={`text-sm font-bold ${saldoFdQ.data.saldoFd > 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(saldoFdQ.data.saldoFd)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-center">
                        {saldoFdQ.data.totalFdOrcado <= 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem orçamento FD para esta obra</span>
                        ) : saldoFdQ.data.saldoFd > 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Saldo disponível</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem saldo — pode bloquear aprovação</span>
                        )}
                      </div>
                    </div>
                  )}
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
                        <div className="flex items-baseline justify-between mb-1">
                          <label className="text-xs font-medium text-gray-700">
                            Valor do FD (R$) <span className="text-blue-500 font-normal">— máximo {sp.tipoOrigem === "equipamento" ? "Locação" : "MAT"}: {fmt(sp.tipoOrigem === "equipamento" ? sp.totalGeral : sp.totalMat)}</span>
                          </label>
                          <button
                            type="button"
                            className="text-[10px] text-amber-600 hover:text-amber-800 underline font-medium whitespace-nowrap ml-2"
                            onClick={() => setFdCotForm(p => ({ ...p, valor: (sp.tipoOrigem === "equipamento" ? sp.totalGeral : sp.totalMat).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))}
                          >
                            Usar todo o valor
                          </button>
                        </div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={fdCotForm.valor}
                          onChange={(e) => setFdCotForm(p => ({ ...p, valor: e.target.value }))}
                          placeholder="0,00"
                          className={`bg-white border-gray-300 ${excedeMat ? "border-red-400 ring-1 ring-red-300" : ""}`}
                        />
                        {fdCotForm.valor && (() => {
                          return fdVal > 0 ? (
                            <p className={`text-xs mt-1 font-medium ${excedeMat ? "text-red-600" : "text-emerald-600"}`}>
                              {fmt(fdVal)}
                              {excedeMat && " — Excede o valor de locação!"}
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

        {negociadoModal && createPortal(
          <div className="fixed inset-0 z-[99998] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => { setNegociadoModal(null); setNegociadoPreviewing(false); }} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 px-5 py-3 rounded-t-xl flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-emerald-800 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Valor Negociado{negociadoModal.itemIds ? " — Seleção" : negociadoModal.grupo ? " — Região" : ""}</h2>
                  {negociadoModal.itemIds ? (
                    <p className="text-[11px] text-emerald-600">Só os <b>{negociadoModal.label ?? "itens selecionados"}</b> — a soma deles fecha no valor digitado</p>
                  ) : negociadoModal.grupo ? (
                    <p className="text-[11px] text-emerald-600">Só os itens de: <b>{negociadoModal.grupo}</b> — a soma da região fecha no valor digitado</p>
                  ) : (
                    <p className="text-[11px] text-emerald-600">Digite o valor total fechado — distribui proporcionalmente entre os itens</p>
                  )}
                </div>
                <button onClick={() => { setNegociadoModal(null); setNegociadoPreviewing(false); }} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-[11px] text-gray-600">{negociadoModal.itemIds ? "Valor Negociado da Seleção (R$)" : negociadoModal.grupo ? "Valor Negociado da Região (R$)" : "Valor Negociado Total (R$)"}</Label>
                    <Input type="text" inputMode="decimal" value={negociadoValor}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^\d,]/g, "");
                        const parts = raw.split(",");
                        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                        const formatted = parts.length > 1 ? `${intPart},${parts[1].slice(0, 2)}` : intPart;
                        setNegociadoValor(formatted);
                        setNegociadoPreviewing(false);
                      }}
                      placeholder="Ex: 2.100.000,00" className="mt-1 h-8 text-sm font-mono" autoFocus />
                  </div>
                  <Button size="sm" onClick={() => setNegociadoPreviewing(true)} disabled={!negociadoValor || (() => { const v = parseFloat(negociadoValor.replace(/\./g, "").replace(",", ".")); return isNaN(v) || v <= 0; })()}
                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
                    <BarChart3 className="h-3.5 w-3.5" /> Calcular
                  </Button>
                </div>

                {/* Rev. 5136 — poka-yoke: se há itens marcados mas o modal é de região/global, oferecer trocar p/ seleção */}
                {!negociadoModal.itemIds && mapaItemsChecked.size > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-amber-800">
                      Você tem <b>{mapaItemsChecked.size} {mapaItemsChecked.size === 1 ? "item marcado" : "itens marcados"}</b> na tabela — este ajuste vai aplicar em <b>{negociadoModal.grupo ? "toda a região" : "TODOS os itens"}</b>, não só nos marcados.
                    </p>
                    <Button size="sm" variant="outline"
                      onClick={() => {
                        const ids: number[] = [];
                        for (const o of itensParaRenderizarMemo as any[]) {
                          if (!mapaItemsChecked.has(o.id)) continue;
                          ids.push(o.id);
                          for (const c of ((o._childItems ?? []) as any[])) ids.push(c.id);
                        }
                        setNegociadoModal({ fornecedorId: negociadoModal.fornecedorId, itemIds: ids, label: `${mapaItemsChecked.size} ${mapaItemsChecked.size === 1 ? "item selecionado" : "itens selecionados"}` });
                        setNegociadoPreviewing(false);
                      }}
                      className="h-7 text-[10px] border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0 whitespace-nowrap">
                      Aplicar só nos {mapaItemsChecked.size} selecionados
                    </Button>
                  </div>
                )}

                {/* Rev. 5136 — poka-yoke: lista dos itens que serão ajustados, ANTES de calcular */}
                {!negociadoPreviewing && (() => {
                  const selSet = negociadoModal.itemIds && negociadoModal.itemIds.length > 0 ? new Set(negociadoModal.itemIds) : null;
                  const alvo = ((mapa?.itens ?? []) as any[]).filter((it: any) =>
                    selSet ? selSet.has(it.id)
                           : (!negociadoModal.grupo || String(it.eapPath || it.parentEapDescricao || "").trim() === negociadoModal.grupo)
                  );
                  if (!alvo.length) return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-red-600 font-medium">Nenhum item encontrado para este ajuste</p>
                    </div>
                  );
                  return (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-2 py-1.5 text-[10px] font-semibold text-gray-600 uppercase border-b border-gray-200">
                        Itens que serão ajustados ({alvo.length}) — confira antes de calcular
                      </div>
                      <div className="max-h-[26vh] overflow-y-auto divide-y divide-gray-100">
                        {alvo.map((it: any) => (
                          <div key={it.id} className="px-2 py-1 flex items-start gap-1.5 text-[11px]">
                            <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-gray-700">{it.descricao ?? it.titulo ?? `Item #${it.id}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  if (!negociadoPreviewing) return null;
                  const preview = calcNegociadoPreview(negociadoModal.fornecedorId, negociadoValor, negociadoModal.grupo, negociadoModal.itemIds);
                  if (!preview.length) return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-red-600 font-medium">Valor inválido — deve ser diferente do total atual e maior que zero</p>
                    </div>
                  );
                  const totalOriginal = preview.reduce((s, i) => s + i.total, 0);
                  const totalNovo = preview.reduce((s, i) => s + i.novoTotal, 0);
                  const diferenca = totalNovo - totalOriginal;
                  const isAcr = diferenca > 0;
                  return (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-2 text-center">
                          <p className="text-[9px] text-gray-500 uppercase font-semibold">Original</p>
                          <p className="text-sm font-bold text-gray-700">{totalOriginal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        </div>
                        <div className={`flex-1 rounded-lg border p-2 text-center ${isAcr ? "bg-indigo-50 border-indigo-200" : "bg-amber-50 border-amber-200"}`}>
                          <p className={`text-[9px] uppercase font-semibold ${isAcr ? "text-indigo-600" : "text-amber-600"}`}>{isAcr ? "Acréscimo" : "Desconto"} ({(Math.abs(diferenca) / totalOriginal * 100).toFixed(1)}%)</p>
                          <p className={`text-sm font-bold ${isAcr ? "text-indigo-700" : "text-amber-700"}`}>{isAcr ? "+" : "−"} {Math.abs(diferenca).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        </div>
                        <div className="flex-1 bg-emerald-50 rounded-lg border border-emerald-200 p-2 text-center">
                          <p className="text-[9px] text-emerald-600 uppercase font-semibold">Novo Total</p>
                          <p className="text-sm font-bold text-emerald-700">{totalNovo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        </div>
                      </div>

                      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[30vh] overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Item</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-gray-600">Atual</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-emerald-600">Novo</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-emerald-600">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {preview.map(it => (
                              <tr key={it.id}>
                                <td className="px-2 py-1 text-gray-700 max-w-[160px] truncate" title={it.descricao}>{it.descricao}</td>
                                <td className="px-2 py-1 text-right text-gray-400">{it.precoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                                <td className="px-2 py-1 text-right text-emerald-700 font-bold">{it.novoPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                                <td className="px-2 py-1 text-right text-emerald-600">{it.novoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="border-t border-gray-200 bg-gray-50 px-5 py-2.5 flex items-center justify-end gap-2 rounded-b-xl">
                <Button size="sm" variant="outline" onClick={() => { setNegociadoModal(null); setNegociadoPreviewing(false); }} className="h-8 text-xs">Cancelar</Button>
                <Button size="sm"
                  disabled={!negociadoPreviewing || calcNegociadoPreview(negociadoModal.fornecedorId, negociadoValor, negociadoModal.grupo, negociadoModal.itemIds).length === 0}
                  onClick={() => aplicarNegociado()}
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
                  <CheckCircle className="h-3.5 w-3.5" /> Aplicar
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}


    {/* Rev. 4245 — Dialog editar item da cotação */}
    {editItemDialog && createPortal(
      <div className="fixed inset-0 z-[99998] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditItemDialog(null)} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-5 py-3 rounded-t-xl flex items-center justify-between">
            <h2 className="text-base font-bold text-blue-900 flex items-center gap-2"><Pencil className="h-4 w-4" /> Editar Item</h2>
            <button onClick={() => setEditItemDialog(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <Label className="text-[11px] text-gray-600">Descrição *</Label>
              <Input value={editItemDialog.descricao} onChange={e => setEditItemDialog(p => p ? { ...p, descricao: e.target.value } : null)} className="mt-1 text-sm" />
            </div>
            <div className="flex gap-3">
              <div className="w-28">
                <Label className="text-[11px] text-gray-600">Unidade</Label>
                <Input value={editItemDialog.unidade} onChange={e => setEditItemDialog(p => p ? { ...p, unidade: e.target.value } : null)} className="mt-1 text-sm" />
              </div>
              <div className="flex-1">
                <Label className="text-[11px] text-gray-600">Quantidade</Label>
                <Input type="number" inputMode="numeric" min="1" step="1" value={editItemDialog.quantidade} onChange={e => setEditItemDialog(p => p ? { ...p, quantidade: e.target.value === "" ? "" : String(Math.max(1, Math.floor(Number(e.target.value) || 1))) } : null)} className="mt-1 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={editItemDialog.somenteMo} onChange={e => setEditItemDialog(p => p ? { ...p, somenteMo: e.target.checked } : null)} className="rounded" />
              🔨 Somente MO (mão de obra)
            </label>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <Button size="sm" variant="outline" onClick={() => setEditItemDialog(null)} className="h-8 text-xs">Cancelar</Button>
            <Button size="sm" disabled={!editItemDialog.descricao.trim() || editarItemCotacao.isPending}
              onClick={() => editarItemCotacao.mutate({ id: editItemDialog.id, descricao: editItemDialog.descricao, unidade: editItemDialog.unidade, quantidade: editItemDialog.quantidade, somenteMo: editItemDialog.somenteMo })}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs">
              {editarItemCotacao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} Salvar
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Rev. 4245 — Dialog incluir item na cotação */}
    {addItemDialog && showDetalhe && createPortal(
      <div className="fixed inset-0 z-[99998] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setAddItemDialog(false)} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 px-5 py-3 rounded-t-xl flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2"><Plus className="h-4 w-4" /> Incluir Item</h2>
              <p className="text-[11px] text-emerald-600">Item avulso — marcado como "Fora do orçamento"</p>
            </div>
            <button onClick={() => setAddItemDialog(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <Label className="text-[11px] text-gray-600">Descrição *</Label>
              <Input value={addItemForm.descricao} onChange={e => setAddItemForm(p => ({ ...p, descricao: e.target.value }))} className="mt-1 text-sm" placeholder="Ex.: Mão de obra de alvenaria" />
            </div>
            <div className="flex gap-3">
              <div className="w-28">
                <Label className="text-[11px] text-gray-600">Unidade</Label>
                <Input value={addItemForm.unidade} onChange={e => setAddItemForm(p => ({ ...p, unidade: e.target.value }))} className="mt-1 text-sm" placeholder="un" />
              </div>
              <div className="flex-1">
                <Label className="text-[11px] text-gray-600">Quantidade</Label>
                <Input type="number" inputMode="numeric" min="1" step="1" value={addItemForm.quantidade} onChange={e => setAddItemForm(p => ({ ...p, quantidade: e.target.value === "" ? "" : String(Math.max(1, Math.floor(Number(e.target.value) || 1))) }))} className="mt-1 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={addItemForm.somenteMo} onChange={e => setAddItemForm(p => ({ ...p, somenteMo: e.target.checked }))} className="rounded" />
              🔨 Somente MO (mão de obra)
            </label>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <Button size="sm" variant="outline" onClick={() => setAddItemDialog(false)} className="h-8 text-xs">Cancelar</Button>
            <Button size="sm" disabled={!addItemForm.descricao.trim() || adicionarItemCotacao.isPending}
              onClick={() => adicionarItemCotacao.mutate({ cotacaoId: showDetalhe, descricao: addItemForm.descricao, unidade: addItemForm.unidade, quantidade: addItemForm.quantidade, somenteMo: addItemForm.somenteMo })}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
              {adicionarItemCotacao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Incluir
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Rev. 4250 — Dialog picker: Incluir itens da EAP na cotação */}
    {eapPickerOpen && showDetalhe && createPortal(
      <div className="fixed inset-0 z-[99998] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setEapPickerOpen(false)} />
        {/* Rev. 5070 — full screen (pedido do user) */}
        <div className="relative bg-white rounded-xl shadow-2xl flex flex-col w-[calc(100vw-16px)] h-[calc(100vh-16px)] md:w-[calc(100vw-48px)] md:h-[calc(100vh-48px)]" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 px-5 py-3 rounded-t-xl flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Incluir da EAP</h2>
              <p className="text-[11px] text-emerald-600">Selecione os itens do orçamento desta obra para adicionar à cotação</p>
            </div>
            <button onClick={() => setEapPickerOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por descrição ou código EAP…"
                value={eapPickerSearch}
                onChange={e => setEapPickerSearch(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            </div>
            {/* Rev. 5071 — legenda das fases de compra (poka-yoke visual) */}
            <div className="flex items-center gap-3 flex-wrap mt-2 text-[10px]">
              <span className="inline-flex items-center gap-1 text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-white border border-gray-300 inline-block" /> Livre</span>
              <span className="inline-flex items-center gap-1 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-300 inline-block" /> Em solicitação</span>
              <span className="inline-flex items-center gap-1 text-blue-700"><span className="h-2.5 w-2.5 rounded-full bg-blue-300 inline-block" /> Em cotação</span>
              <span className="inline-flex items-center gap-1 text-gray-500"><Lock className="h-2.5 w-2.5" /> <span className="line-through">Contratado</span></span>
            </div>
            {eapPickerSelected.size > 0 && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-emerald-700 font-medium">{eapPickerSelected.size} {eapPickerSelected.size === 1 ? "item selecionado" : "itens selecionados"}</span>
                <button onClick={() => setEapPickerSelected(new Set())} className="text-xs text-gray-400 hover:text-red-500 underline">Limpar seleção</button>
              </div>
            )}
          </div>
          <div className="overflow-y-auto flex-1 px-2 py-2">
            {eapItensQ.isLoading && (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando EAP…
              </div>
            )}
            {!eapItensQ.isLoading && (eapItensQ.data ?? []).length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                {eapItensQ.error ? "Erro ao carregar — esta cotação não tem obra vinculada ou sem orçamento." : "Nenhum item de EAP encontrado para esta obra."}
              </div>
            )}
            {!eapItensQ.isLoading && (eapItensQ.data ?? []).length > 0 && (() => {
              // Rev. 5070 — hierarquia pai/filho: pais (categorias) viram cabeçalhos de seção,
              // filhos indentados pela profundidade da numeração, ordenados pelo código EAP.
              const all = (eapItensQ.data ?? []) as any[];
              // Rev. 5073 — cotação pacote: duas colunas (Material e MDO) p/ análise
              const pacoteCols = all.some((x: any) => x.metaEscopoTipo === "pacote" && (x.metaUnitMat != null || x.metaUnitMdo != null));
              const segsOf = (c: any) => String(c ?? "").split(/[^0-9]+/).filter(Boolean).map(Number);
              const cmpEap = (a: any, b: any) => {
                const ka = segsOf(a.eapCodigo), kb = segsOf(b.eapCodigo);
                const len = Math.max(ka.length, kb.length);
                for (let i = 0; i < len; i++) { const d = (ka[i] ?? 0) - (kb[i] ?? 0); if (d !== 0) return d; }
                return 0;
              };
              const codes = new Set(all.map((it: any) => String(it.eapCodigo ?? "").trim()).filter(Boolean));
              const isPai = (it: any) => {
                const c = String(it.eapCodigo ?? "").trim();
                if (!c) return false;
                for (const o of codes) if (o !== c && o.startsWith(c + ".")) return true;
                return false;
              };
              const term = eapPickerSearch.toLowerCase();
              let filtrados = all.filter((it: any) =>
                !term || (it.descricao ?? "").toLowerCase().includes(term) || (it.eapCodigo ?? "").toLowerCase().includes(term)
              );
              if (term && filtrados.length > 0) {
                // mantém os pais (ancestrais) dos filhos que bateram, pra dar contexto
                const keep = new Set(filtrados.map((it: any) => it.id));
                for (const it of filtrados) {
                  const c = String(it.eapCodigo ?? "").trim();
                  for (const p of all) {
                    const pc = String(p.eapCodigo ?? "").trim();
                    if (pc && c !== pc && c.startsWith(pc + ".")) keep.add(p.id);
                  }
                }
                filtrados = all.filter((it: any) => keep.has(it.id));
              }
              filtrados = [...filtrados].sort(cmpEap);
              if (filtrados.length === 0) return (
                <div className="text-center py-10 text-gray-400 text-sm">Nenhum item encontrado para "{eapPickerSearch}"</div>
              );
              const selecionaveis = filtrados.filter((it: any) => !isPai(it));
              return (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200">
                      <th className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selecionaveis.length > 0 && selecionaveis.every((it: any) => eapPickerSelected.has(it.id))}
                          onChange={e => {
                            setEapPickerSelected(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) selecionaveis.forEach((it: any) => next.add(it.id));
                              else selecionaveis.forEach((it: any) => next.delete(it.id));
                              return next;
                            });
                          }}
                          className="rounded border-gray-400 text-emerald-600 h-3.5 w-3.5 cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-2 py-2 text-gray-500 font-semibold uppercase w-28">Cód. EAP</th>
                      <th className="text-left px-2 py-2 text-gray-500 font-semibold uppercase">Descrição</th>
                      <th className="text-center px-2 py-2 text-gray-500 font-semibold uppercase w-14">Un.</th>
                      <th className="text-right px-2 py-2 text-gray-500 font-semibold uppercase w-24">Qtd.</th>
                      {pacoteCols ? (
                        <>
                          <th className="text-right px-2 py-2 text-gray-500 font-semibold uppercase w-24">
                            Meta Mat.<span className="block text-[9px] font-bold text-teal-600 normal-case">(material)</span>
                          </th>
                          <th className="text-right px-2 py-2 text-gray-500 font-semibold uppercase w-24">
                            Meta MDO<span className="block text-[9px] font-bold text-indigo-500 normal-case">(mão de obra)</span>
                          </th>
                        </>
                      ) : (
                        <th className="text-right px-2 py-2 text-gray-500 font-semibold uppercase w-28">
                          Meta Unit.
                          {(() => {
                            const t = (eapItensQ.data as any[])?.find((x: any) => x.metaEscopoTipo)?.metaEscopoTipo;
                            if (!t || t === "pacote") return null;
                            const lbl = t === "servico" ? "só MDO" : t === "equipamento" ? "só EQUIP" : "só MAT";
                            return <span className="block text-[9px] font-bold text-indigo-500 normal-case">({lbl})</span>;
                          })()}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((it: any) => {
                      const depth = Math.max(segsOf(it.eapCodigo).length - 1, 0);
                      const indent = { paddingLeft: `${8 + depth * 16}px` } as React.CSSProperties;
                      if (isPai(it)) {
                        return (
                          <tr key={it.id} className="bg-slate-100/90 border-y border-slate-200">
                            <td className="px-2 py-1.5" />
                            <td className="px-2 py-1.5 font-mono font-bold text-slate-500 whitespace-nowrap">{it.eapCodigo}</td>
                            <td colSpan={pacoteCols ? 5 : 4} className="py-1.5 pr-2" style={indent}>
                              <span className="inline-flex items-center gap-1.5 font-bold text-slate-600 uppercase tracking-wide text-[11px]">
                                <FolderOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {it.descricao}
                              </span>
                            </td>
                          </tr>
                        );
                      }
                      const sel = eapPickerSelected.has(it.id);
                      const jaEmCot = !!it.jaEmCotacao;
                      // Rev. 5071 — fase de compra: contratado (riscado, bloqueado) / em cotação / em SC / livre
                      const fase: string | null = (it as any).fase ?? null;
                      const faseCls = fase === "contratado" ? "bg-gray-50 opacity-70"
                        : fase === "cotacao" ? "bg-blue-50/50"
                        : fase === "solicitacao" ? "bg-amber-50/50"
                        : sel ? "bg-emerald-50" : jaEmCot ? "opacity-55" : "";
                      return (
                        <tr
                          key={it.id}
                          onClick={() => {
                            if (fase) { setEapFaseDialog(it); return; }
                            setEapPickerSelected(prev => { const n = new Set(prev); sel ? n.delete(it.id) : n.add(it.id); return n; });
                          }}
                          className={`border-b border-gray-100 cursor-pointer hover:bg-emerald-50/60 transition-colors ${faseCls} ${sel && fase ? "ring-1 ring-inset ring-emerald-400" : ""}`}
                        >
                          <td className="px-2 py-1.5 text-center">
                            {fase === "contratado"
                              ? <Lock className="h-3.5 w-3.5 text-gray-400 mx-auto" />
                              : <input type="checkbox" checked={sel} readOnly className="rounded border-gray-400 text-emerald-600 h-3.5 w-3.5 pointer-events-none" />}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[10px] text-gray-600">{it.eapCodigo}</span>
                          </td>
                          <td className={`py-1.5 pr-2 break-words ${fase === "contratado" ? "line-through text-gray-400" : "text-gray-800"}`} style={indent}>
                            {it.descricao}
                            {fase === "contratado" && <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 whitespace-nowrap no-underline"><Lock className="h-2.5 w-2.5" /> Contratado {(it as any).cotNumero ?? ""}</span>}
                            {fase === "cotacao" && ((it as any).cotId === showDetalhe
                              ? <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 whitespace-nowrap">Já nesta cotação</span>
                              : <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 whitespace-nowrap">Em cotação {(it as any).cotNumero ?? ""}</span>)}
                            {fase === "solicitacao" && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap">Em SC {formatNumeroScDisplay((it as any).scNumero ?? "")}</span>}
                            {!fase && jaEmCot && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap">Já na cotação</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-500">{it.unidade ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-gray-700">{it.quantidade ? parseFloat(it.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—"}</td>
                          {pacoteCols ? (
                            (it.metaUnitMat != null || it.metaUnitMdo != null) ? (
                              <>
                                <td className="px-2 py-1.5 text-right text-teal-700 whitespace-nowrap">
                                  {it.metaUnitMat != null ? `R$ ${parseFloat(it.metaUnitMat).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right text-indigo-700 whitespace-nowrap">
                                  {it.metaUnitMdo != null ? `R$ ${parseFloat(it.metaUnitMdo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                </td>
                              </>
                            ) : (
                              <td colSpan={2} className="px-2 py-1.5 text-right text-blue-700 whitespace-nowrap" title="Item sem decomposição MAT/MDO — meta total">
                                {it.metaUnitTotal ? `R$ ${parseFloat(it.metaUnitTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                            )
                          ) : (
                            <td className="px-2 py-1.5 text-right text-blue-700 whitespace-nowrap">
                              {it.metaUnitTotal ? `R$ ${parseFloat(it.metaUnitTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEapPickerOpen(false)} className="h-8 text-xs">Cancelar</Button>
            <Button
              size="sm"
              disabled={eapPickerSelected.size === 0 || adicionarItensEAP.isPending}
              onClick={() => {
                const selecionados = (eapItensQ.data ?? []).filter((it: any) => eapPickerSelected.has(it.id));
                adicionarItensEAP.mutate({
                  cotacaoId: showDetalhe!,
                  itens: selecionados.map((it: any) => ({
                    descricao: it.descricao ?? "",
                    unidade: it.unidade ?? "un",
                    quantidade: it.quantidade ?? "1",
                    orcamentoItemId: it.id,
                    eapCodigo: it.eapCodigo ?? undefined,
                    precoMeta: it.metaUnitTotal ? String(it.metaUnitTotal) : undefined,
                  })),
                });
              }}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
            >
              {adicionarItensEAP.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar {eapPickerSelected.size > 0 ? `${eapPickerSelected.size} ` : ""}itens
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Rev. 5071 — Poka-yoke: item da EAP já em SC/cotação/contratado */}
    {eapFaseDialog && createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setEapFaseDialog(null)} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${eapFaseDialog.fase === "contratado" ? "bg-gray-100" : eapFaseDialog.fase === "cotacao" ? "bg-blue-100" : "bg-amber-100"}`}>
              {eapFaseDialog.fase === "contratado" ? <Lock className="h-5 w-5 text-gray-500" /> : <AlertTriangle className={`h-5 w-5 ${eapFaseDialog.fase === "cotacao" ? "text-blue-600" : "text-amber-600"}`} />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900">
                {eapFaseDialog.fase === "contratado" ? "Item já contratado" : eapFaseDialog.fase === "cotacao" ? (eapFaseDialog.cotId === showDetalhe ? "Item já está NESTA cotação" : "Item já está em cotação") : "Item já está em solicitação"}
              </h3>
              <p className="text-xs text-gray-600 mt-1 break-words">
                <span className="font-mono text-[10px] bg-gray-100 border border-gray-200 rounded px-1 py-0.5 mr-1">{eapFaseDialog.eapCodigo}</span>
                {eapFaseDialog.descricao}
              </p>
              <p className="text-xs text-gray-700 mt-2">
                {eapFaseDialog.fase === "contratado" && <>Este item já foi <strong>cotado e contratado</strong> na cotação <strong>{eapFaseDialog.cotNumero}</strong>{eapFaseDialog.scNumero ? <> (via {formatNumeroScDisplay(eapFaseDialog.scNumero)})</> : null}. Se precisar de mais quantidade, faça uma <strong>compra complementar</strong>.</>}
                {eapFaseDialog.fase === "cotacao" && (eapFaseDialog.cotId === showDetalhe
                  ? <>Este item já faz parte <strong>desta cotação que está aberta</strong> ({eapFaseDialog.cotNumero}){eapFaseDialog.scNumero ? <> (via {formatNumeroScDisplay(eapFaseDialog.scNumero)})</> : null}. Adicionar de novo criaria uma <strong>linha duplicada</strong> no mapa.</>
                  : <>Este item já está sendo cotado na cotação <strong>{eapFaseDialog.cotNumero}</strong>{eapFaseDialog.scNumero ? <> (via {formatNumeroScDisplay(eapFaseDialog.scNumero)})</> : null}. Deseja abrir a cotação, ou cotar novamente (compra complementar)?</>)}
                {eapFaseDialog.fase === "solicitacao" && <>Este item já consta na solicitação <strong>{formatNumeroScDisplay(eapFaseDialog.scNumero ?? "")}</strong>, ainda sem cotação. Deseja abrir a solicitação, ou incluir mesmo assim nesta cotação?</>}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            {eapFaseDialog.cotId && eapFaseDialog.cotId !== showDetalhe && (
              <Button size="sm" variant="outline" className="h-8 text-xs justify-start gap-1.5"
                onClick={() => { const cid = eapFaseDialog.cotId; setEapFaseDialog(null); setEapPickerOpen(false); setShowDetalhe(cid); }}>
                <FileSearch className="h-3.5 w-3.5" /> Abrir cotação {eapFaseDialog.cotNumero}
              </Button>
            )}
            {eapFaseDialog.scId && (
              <Button size="sm" variant="outline" className="h-8 text-xs justify-start gap-1.5"
                onClick={() => { const sid = eapFaseDialog.scId; setEapFaseDialog(null); setEapPickerOpen(false); navigate(`/compras/solicitacoes?destaque=${sid}`); }}>
                <ClipboardList className="h-3.5 w-3.5" /> Abrir solicitação {formatNumeroScDisplay(eapFaseDialog.scNumero ?? "")}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 text-xs justify-start gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => { const id = eapFaseDialog.id; setEapFaseDialog(null); setEapPickerSelected(prev => { const n = new Set(prev); n.add(id); return n; }); }}>
              <Plus className="h-3.5 w-3.5" /> {eapFaseDialog.fase === "contratado" ? "Compra complementar (cotar de novo)" : eapFaseDialog.fase === "cotacao" ? (eapFaseDialog.cotId === showDetalhe ? "Adicionar mesmo assim (linha duplicada)" : "Cotar novamente nesta cotação") : "Incluir mesmo assim nesta cotação"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs justify-center text-gray-500" onClick={() => setEapFaseDialog(null)}>Cancelar</Button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Dialog — Confirmar tipo: Parcial ou Total */}
    <Dialog open={showConfirmarTipoCotDialog} onOpenChange={v => { if (!v) setShowConfirmarTipoCotDialog(false); }}>
      <DialogContent className="border-gray-200 max-w-lg" style={{ background: "#fff", color: "#111827" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <ShoppingCart className="h-5 w-5 text-emerald-600" /> Confirmar geração de Ordem de Compra
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 pb-2">
          Esta cotação é <strong>total</strong> (um único fornecedor para todos os itens) ou <strong>parcial</strong> (itens divididos entre fornecedores diferentes)?
        </p>
        {Object.keys(vencedorPorItem).length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
            <GitBranch className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800">
              <strong>{Object.keys(vencedorPorItem).length} {Object.keys(vencedorPorItem).length === 1 ? "item já atribuído" : "itens já atribuídos"}</strong> a fornecedores específicos. Escolha "Parcial" para usar essas atribuições.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={async () => {
              setShowConfirmarTipoCotDialog(false);
              if (!validarCondicoesVencedor()) return;
              const fornTotal = parseFloat(fornParaSaldo?.totalOrcado ?? "0");
              // Usa o saldo pacote-aware (mesmo cálculo da tabela). Antes somava insumos crus do mapa,
              // o que estourava falso "déficit" em cotações por pacote mesmo havendo CRÉDITO (ex.: COT-2026-0283).
              if (deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado) {
                const defVal = deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const fornNome = fornParaSaldo?.fornecedor?.nomeFantasia || fornParaSaldo?.fornecedor?.razaoSocial || "Fornecedor";
                const ok = await confirm({
                  title: "Valor acima da meta orçamentária",
                  description:
                    `O valor do fornecedor ${fornNome} (${fornTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) ` +
                    `está acima da meta orçamentária (${metaGrandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).\n\n` +
                    `Déficit: ${defVal}\n\nRecomendamos utilizar o painel de Realocação de Verba antes de aprovar.\n\nDeseja continuar mesmo assim?`,
                  tone: "warning",
                  confirmText: "Continuar mesmo assim",
                  cancelText: "Cancelar",
                });
                if (!ok) return;
              }
              setShowGerarOCModeDialog(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle className="h-8 w-8 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-800">Total</span>
            <span className="text-xs text-emerald-600 text-center">Um único fornecedor vencedor<br/>para todos os itens</span>
          </button>
          <button
            onClick={() => {
              setShowConfirmarTipoCotDialog(false);
              const _jaEmOC: number[] = [...new Set([...(mapa?.itensJaEmOC ?? []), ...localItensEmOC])];
              const _itensDoMapa: any[] = (mapa?.itens ?? []).filter((it: any) => !_jaEmOC.includes(it.id));
              const _participantes: any[] = mapa?.participantes ?? [];
              const _itensParaFechamento = _itensDoMapa.map((it: any) => {
                let fId = vencedorPorItem[it.id];
                if (!fId) {
                  let melhorTotal = Infinity;
                  for (const p of _participantes) {
                    const key = `${it.id}_${p.fornecedorId}`;
                    const resp = mapa?.respostaMap?.[key];
                    if (resp) {
                      const pu = parseFloat((resp as any).precoUnitario ?? "0");
                      const qty = parseFloat((resp as any).quantidade ?? it.quantidade ?? "1");
                      const total = pu * qty;
                      if (pu > 0 && total < melhorTotal) { melhorTotal = total; fId = p.fornecedorId; }
                    }
                  }
                  if (!fId) fId = melhorForn?.fornecedorId ?? (_participantes[0]?.fornecedorId ?? 0);
                }
                return { itemId: it.id, fornecedorId: fId ?? 0, incluir: !!(fId && fId > 0), descricao: it.descricao ?? `Item #${it.id}` };
              }).filter((it: any) => it.fornecedorId > 0);
              setFechamentoParcialItens(_itensParaFechamento);
              setShowFechamentoParcialDialog(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-300 bg-blue-50 p-5 hover:bg-blue-100 transition-colors"
          >
            <GitBranch className="h-8 w-8 text-blue-600" />
            <span className="text-sm font-bold text-blue-800">Parcial</span>
            <span className="text-xs text-blue-600 text-center">Itens divididos entre<br/>múltiplos fornecedores</span>
          </button>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => setShowConfirmarTipoCotDialog(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog — como gerar OC: confirmar ou rascunho */}
    <Dialog open={showFechamentoParcialDialog} onOpenChange={v => { if (!v) { setShowFechamentoParcialDialog(false); } }}>
      <DialogContent className="border-gray-200 max-w-2xl" style={{ background: "#fff", color: "#111827" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <GitBranch className="h-5 w-5 text-blue-500" /> Cotação Parcial — Selecionar Itens por Fornecedor
          </DialogTitle>
        </DialogHeader>
        {(() => {
          const jaEmOC = [...new Set([...(mapa?.itensJaEmOC ?? []), ...localItensEmOC])];
          const itensProcessados = (mapa?.itens ?? []).filter((it: any) => jaEmOC.includes(it.id));
          if (itensProcessados.length === 0) return null;
          return (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-1">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> {itensProcessados.length} {itensProcessados.length === 1 ? "item já tem OC gerada" : "itens já têm OC gerada"} (não serão reprocessados)
              </p>
              <div className="flex flex-wrap gap-1">
                {itensProcessados.map((it: any) => (
                  <span key={it.id} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                    {it.descricao}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        <p className="text-sm text-gray-600 pb-1">
          Cada item será fechado com o fornecedor indicado. Desmarque os itens que não deseja incluir neste fechamento.
        </p>

        {(() => {
          const totaisPorForn: Record<number, { fornecedorId: number; nome: string; total: number; itens: number }> = {};
          for (const fi of fechamentoParcialItens) {
            if (!fi.incluir) continue;
            const p = (mapa?.participantes ?? []).find((pp: any) => pp.fornecedorId === fi.fornecedorId);
            const nome = p?.fornecedor?.nomeFantasia || p?.fornecedor?.razaoSocial || `Fornecedor #${fi.fornecedorId}`;
            const key = `${fi.itemId}_${fi.fornecedorId}`;
            const resp = mapa?.respostaMap?.[key];
            const mapaItem = (mapa?.itens ?? []).find((it: any) => it.id === fi.itemId);
            const tot = resp
              ? parseFloat((resp as any).total ?? "0")
              : parseFloat(mapaItem?.precoUnitario ?? "0") * parseFloat(mapaItem?.quantidade ?? "1");
            if (!totaisPorForn[fi.fornecedorId]) totaisPorForn[fi.fornecedorId] = { fornecedorId: fi.fornecedorId, nome, total: 0, itens: 0 };
            totaisPorForn[fi.fornecedorId].total += tot;
            totaisPorForn[fi.fornecedorId].itens += 1;
          }
          const resumo = Object.values(totaisPorForn);
          const financeiroParcial = getFechamentoParcialFinanceiro(fechamentoParcialItens);
          return (
            <>
              {resumo.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-1">
                  {resumo.map(r => (
                    <div key={r.fornecedorId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                      <Trophy className="h-3 w-3 text-blue-500" />
                      <span className="font-semibold text-blue-800">{r.nome}</span>
                      <span className="text-blue-600">— {r.itens} {r.itens === 1 ? "item" : "itens"} · {r.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    </div>
                  ))}
                </div>
              )}
              {financeiroParcial.deficit > 0 && !cobertoPorRisco && !semVerbaAutorizado && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-xs font-semibold text-red-800">
                      Déficit financeiro deste fechamento: {financeiroParcial.deficit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-red-600">
                      Meta original {financeiroParcial.metaOriginal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} − compras anteriores {financeiroParcial.anteriores.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} − itens selecionados {financeiroParcial.cotacaoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.
                    </p>
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Item</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Fornecedor</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechamentoParcialItens.map((fi, idx) => {
                      const p = (mapa?.participantes ?? []).find((pp: any) => pp.fornecedorId === fi.fornecedorId);
                      const nomeForn = p?.fornecedor?.nomeFantasia || p?.fornecedor?.razaoSocial || `Fornecedor #${fi.fornecedorId}`;
                      const key = `${fi.itemId}_${fi.fornecedorId}`;
                      const resp = mapa?.respostaMap?.[key];
                      const mapaItem = (mapa?.itens ?? []).find((it: any) => it.id === fi.itemId);
                      const total = resp
                        ? parseFloat((resp as any).total ?? "0")
                        : parseFloat(mapaItem?.precoUnitario ?? "0") * parseFloat(mapaItem?.quantidade ?? "1");
                      return (
                        <tr key={fi.itemId} className={`border-b border-gray-100 ${!fi.incluir ? "opacity-40" : "hover:bg-gray-50"}`}>
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={fi.incluir}
                              onCheckedChange={v => setFechamentoParcialItens(prev => prev.map((x, i) => i === idx ? { ...x, incluir: !!v } : x))}
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-800 font-medium max-w-xs truncate" title={fi.descricao}>{fi.descricao}</td>
                          <td className="px-3 py-2">
                            <select
                              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
                              value={fi.fornecedorId}
                              onChange={e => {
                                const newFornId = parseInt(e.target.value);
                                setFechamentoParcialItens(prev => prev.map((x, i) => i === idx ? { ...x, fornecedorId: newFornId } : x));
                              }}
                            >
                              {(mapa?.participantes ?? []).map((pp: any) => {
                                const rKey = `${fi.itemId}_${pp.fornecedorId}`;
                                const rResp = mapa?.respostaMap?.[rKey];
                                const rTot = rResp ? parseFloat((rResp as any).total ?? "0") : 0;
                                const nome = pp.fornecedor?.nomeFantasia || pp.fornecedor?.razaoSocial || `#${pp.fornecedorId}`;
                                return (
                                  <option key={pp.fornecedorId} value={pp.fornecedorId}>
                                    {nome}{rTot > 0 ? ` — ${rTot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " — sem preço"}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 font-semibold">
                            {total > 0 ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-500">
                {fechamentoParcialItens.filter(fi => fi.incluir).length} de {fechamentoParcialItens.length} itens selecionados
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  disabled={gerarOCsParciais.isPending || fechamentoParcialItens.filter(fi => fi.incluir).length === 0}
                  onClick={() => {
                    if (!pendingGerarOCParams) return;
                    const itensSelecionados = fechamentoParcialItens.filter(fi => fi.incluir);
                    const grupos: Record<number, number[]> = {};
                    for (const fi of itensSelecionados) {
                      if (!grupos[fi.fornecedorId]) grupos[fi.fornecedorId] = [];
                      grupos[fi.fornecedorId].push(fi.itemId);
                    }
                    itensPendentesOCRef.current = itensSelecionados.map(fi => fi.itemId);
                    gerarOCsParciais.mutate({
                      companyId,
                      cotacaoId: pendingGerarOCParams.cotacaoId,
                      itensPorFornecedor: Object.entries(grupos).map(([fId, itemIds]) => ({ fornecedorId: parseInt(fId), itemIds })),
                      userId: user?.id,
                      userName: user?.name,
                      ...(pendingGerarOCParams.autorizacaoSemVerba ? { autorizacaoSemVerba: pendingGerarOCParams.autorizacaoSemVerba } : {}),
                    });
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">Confirmar diretamente</span>
                  <span className="text-xs text-emerald-600 text-center">Gera {(() => { const g: Record<number,number[]> = {}; fechamentoParcialItens.filter(f=>f.incluir).forEach(f => { if(!g[f.fornecedorId]) g[f.fornecedorId]=[]; g[f.fornecedorId].push(f.itemId); }); return Object.keys(g).length; })()} OC(s) como <strong>Pendente</strong></span>
                </button>
                <button
                  disabled={gerarOCsParciais.isPending || fechamentoParcialItens.filter(fi => fi.incluir).length === 0}
                  onClick={() => {
                    if (!pendingGerarOCParams) return;
                    const itensSelecionados = fechamentoParcialItens.filter(fi => fi.incluir);
                    const grupos: Record<number, number[]> = {};
                    for (const fi of itensSelecionados) {
                      if (!grupos[fi.fornecedorId]) grupos[fi.fornecedorId] = [];
                      grupos[fi.fornecedorId].push(fi.itemId);
                    }
                    itensPendentesOCRef.current = itensSelecionados.map(fi => fi.itemId);
                    gerarOCsParciais.mutate({
                      companyId,
                      cotacaoId: pendingGerarOCParams.cotacaoId,
                      itensPorFornecedor: Object.entries(grupos).map(([fId, itemIds]) => ({ fornecedorId: parseInt(fId), itemIds })),
                      comoRascunho: true,
                      userId: user?.id,
                      userName: user?.name,
                      ...(pendingGerarOCParams.autorizacaoSemVerba ? { autorizacaoSemVerba: pendingGerarOCParams.autorizacaoSemVerba } : {}),
                    });
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                >
                  <Save className="h-7 w-7 text-yellow-600" />
                  <span className="text-sm font-semibold text-yellow-800">Salvar como Rascunho</span>
                  <span className="text-xs text-yellow-600 text-center">As OCs ficam como <strong>Rascunho</strong> para revisar depois</span>
                </button>
              </div>
            </>
          );
        })()}

        {gerarOCsParciais.isPending && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando OCs...
          </div>
        )}
        <DialogFooter>
          <button onClick={() => { setShowFechamentoParcialDialog(false); setPendingGerarOCParams(null); }} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Rev. 1993 — Modal Validação Erro redesenhado em regras de ouro: header gradient amber→red, lista de campos faltantes em cards com ícone, passo-a-passo, footer sticky. */}
    <Dialog open={showValidacaoErroDialog} onOpenChange={v => { if (!v) setShowValidacaoErroDialog(false); }}>
      <DialogContent className="border-0 p-0 max-w-2xl overflow-hidden rounded-2xl shadow-2xl" style={{ background: "#fff", color: "#111827" }}>
        {(() => {
          const titulo = validacaoErroInfo?.titulo ?? "Ação necessária";
          const mensagem = validacaoErroInfo?.mensagem ?? "";
          // Parse: extrai nome do fornecedor do título "Informações obrigatórias faltando — Fulano"
          const nomeFornMatch = titulo.match(/—\s*(.+)$/);
          const nomeForn = nomeFornMatch ? nomeFornMatch[1] : null;
          const tituloLimpo = nomeForn ? titulo.replace(/\s*—\s*.+$/, "") : titulo;
          // Parse: extrai lista de campos (linhas começando com "•") e "Como corrigir"
          const linhas = mensagem.split("\n").map(l => l.trim()).filter(Boolean);
          const campos = linhas.filter(l => l.startsWith("•")).map(l => l.replace(/^•\s*/, ""));
          const intro = linhas.find(l => !l.startsWith("•") && !l.startsWith("Como corrigir"));
          const comoCorrigir = linhas.find(l => l.startsWith("Como corrigir"));
          const iconePorCampo = (c: string) => {
            const lc = c.toLowerCase();
            if (lc.includes("forma") || lc.includes("pagamento")) return CreditCard;
            if (lc.includes("prazo") || lc.includes("entrega")) return Clock;
            if (lc.includes("frete")) return Truck;
            if (lc.includes("medi")) return BarChart3;
            return AlertTriangle;
          };
          return (
            <>
              {/* Header gradient amber→red */}
              <DialogHeader className="p-0 space-y-0">
                <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 h-12 w-12 rounded-2xl bg-white/20 ring-4 ring-white/15 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-lg font-bold text-white leading-tight">
                        {tituloLimpo}
                      </DialogTitle>
                      {nomeForn && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/20 text-white border border-white/30">
                            <Trophy className="h-3 w-3" /> Fornecedor: {nomeForn}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/40 text-white uppercase tracking-wider">
                            {campos.length} pendência{campos.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Intro */}
                {intro && (
                  <p className="text-sm text-gray-700 leading-relaxed">{intro}</p>
                )}

                {/* Cards de campos faltantes */}
                {campos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-red-700 uppercase tracking-wider">
                      <span className="h-px flex-1 bg-red-200" />
                      Campos pendentes
                      <span className="h-px flex-1 bg-red-200" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {campos.map((campo, i) => {
                        const Icon = iconePorCampo(campo);
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border-2 border-red-200 bg-red-50/60">
                            <div className="shrink-0 h-9 w-9 rounded-lg bg-white border border-red-200 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-red-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-red-800 truncate">{campo}</p>
                              <p className="text-[10px] text-red-500 uppercase tracking-wider font-medium">Obrigatório</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Como corrigir — passo a passo */}
                {comoCorrigir && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-bold text-blue-900">Como corrigir em 4 passos</p>
                    </div>
                    <ol className="space-y-1.5 pl-1">
                      {[
                        "Clique em \"Ir para o Mapa de Cotação\" abaixo",
                        nomeForn ? `Localize o card de ${nomeForn}` : "Localize o card do fornecedor",
                        "Clique em \"Editar\" e preencha os campos pendentes",
                        "Clique em \"Salvar\" e tente aprovar novamente",
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-blue-900">
                          <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">{i + 1}</span>
                          <span className="pt-0.5 leading-snug">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Footer sticky */}
              <DialogFooter className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setShowValidacaoErroDialog(false)} className="text-gray-700 border-gray-300 hover:bg-gray-100">
                  Fechar
                </Button>
                {validacaoErroInfo?.irParaMapa && (
                  <Button onClick={() => { setShowValidacaoErroDialog(false); setAbaAtiva("mapa"); }}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white gap-2 shadow-md font-semibold">
                    <BarChart3 className="h-4 w-4" /> Ir para o Mapa de Cotação
                  </Button>
                )}
              </DialogFooter>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>

    <Dialog open={showGerarOCModeDialog} onOpenChange={v => { if (!v) { setShowGerarOCModeDialog(false); setPendingGerarOCParams(null); } }}>
      <DialogContent className="border-gray-200 max-w-md" style={{ background: "#fff", color: "#111827" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <CheckCircle className="h-5 w-5 text-emerald-500" /> Gerar Ordem de Compra
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 py-2">
          Como você quer gerar a OC desta cotação?
        </p>
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={() => { if (!pendingGerarOCParams) return; gerarOC.mutate({ companyId, userId: user?.id, userName: user?.name, ...pendingGerarOCParams }); setShowGerarOCModeDialog(false); setPendingGerarOCParams(null); }}
            disabled={gerarOC.isPending}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <CheckCircle className="h-7 w-7 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Confirmar diretamente</span>
            <span className="text-xs text-emerald-600 text-center">A OC é criada como <strong>Pendente</strong> e entra no fluxo de aprovação</span>
          </button>
          <button
            onClick={() => { if (!pendingGerarOCParams) return; gerarOC.mutate({ companyId, userId: user?.id, userName: user?.name, ...pendingGerarOCParams, comoRascunho: true }); setShowGerarOCModeDialog(false); setPendingGerarOCParams(null); }}
            disabled={gerarOC.isPending}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 hover:bg-yellow-100 transition-colors disabled:opacity-50"
          >
            <Save className="h-7 w-7 text-yellow-600" />
            <span className="text-sm font-semibold text-yellow-800">Salvar como Rascunho</span>
            <span className="text-xs text-yellow-600 text-center">A OC fica como <strong>Rascunho</strong> para você revisar e confirmar depois</span>
          </button>
        </div>
        {gerarOC.isPending && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando OC...
          </div>
        )}
        <DialogFooter>
          <button onClick={() => { setShowGerarOCModeDialog(false); setPendingGerarOCParams(null); }} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Rev. 2091 — Modal "Transferir do Estoque" (substitui o flow normal quando o vencedor é o Almoxarifado). */}
    {/* Rev. 4998 — Prévia do contrato antes da aprovação */}
    {/* Rev. 5013 — título/assunto do contrato é OBRIGATÓRIO antes da prévia */}
    {/* Rev. 5019 — WIZARD DE ANEXOS (poka-yoke): 6 etapas guiadas antes da prévia */}
    <Dialog open={tituloPromptOpen} onOpenChange={(v) => { if (!v) setTituloPromptOpen(false); }}>
      <DialogContent className="max-w-xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Rev. 5021 — visual moderno poka-yoke: header gradiente + trilha de etapas com ícones */}
        <DialogHeader className="bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 px-5 pt-4 pb-3 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base text-white">
            <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-[18px] h-[18px] text-white" /></span>
            Preparar Contrato
            <span className="ml-auto text-[11px] font-bold bg-white/15 text-white rounded-full px-2.5 py-1">Etapa {wizStep + 1} de 7</span>
          </DialogTitle>
          <div className="flex items-center gap-0 pt-3">
            {([["Título", PenTool], ["Proposta", FileText], ["Materiais", Package], ["Projetos", Layers], ["Cronograma", Calendar], ["Outros", Paperclip], ["Revisão", CheckCircle]] as Array<[string, LucideIcon]>).map(([s, Icon], i, arr) => (
              <React.Fragment key={s}>
                <button type="button" onClick={() => { if (i < wizStep) setWizStep(i); }}
                  className="flex flex-col items-center gap-1 min-w-[52px]" disabled={i > wizStep}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                    i < wizStep ? "bg-emerald-400 border-emerald-300 text-emerald-950"
                    : i === wizStep ? "bg-white border-white text-purple-700 shadow-lg scale-110"
                    : "bg-white/10 border-white/30 text-white/50"}`}>
                    {i < wizStep ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Icon className="w-3.5 h-3.5" />}
                  </span>
                  <span className={`text-[10px] leading-none ${i === wizStep ? "text-white font-bold" : i < wizStep ? "text-emerald-200 font-semibold" : "text-white/40"}`}>{s}</span>
                </button>
                {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-0.5 mb-3.5 rounded ${i < wizStep ? "bg-emerald-400" : "bg-white/20"}`} />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4 bg-gray-50/60">
          {/* Bloqueia interação até a hidratação terminar (code review): resposta
              tardia da query resetaria etapa/estado por cima do que o usuário editou */}
          {anexosContratoQ.data === undefined && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando anexos salvos...
            </div>
          )}
          {anexosContratoQ.data !== undefined && wizStep === 0 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-purple-50 border border-purple-200 px-3 py-2.5">
              <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <p className="text-sm text-purple-900">Este é o título que aparecerá no topo do contrato. Já sugerimos um pelo tipo da cotação — ajuste se quiser algo mais específico.</p>
            </div>
            <input autoFocus value={tituloDraft} onChange={e => setTituloDraft(e.target.value)}
              placeholder="ex.: Contrato de Prestação de Serviços para Fornecimento de Mão de Obra"
              maxLength={200}
              className="w-full h-12 px-4 rounded-xl border-2 border-purple-200 bg-white text-sm font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none shadow-sm" />
            {!tituloDraft.trim() && <p className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> O título é obrigatório para continuar.</p>}
          </div>)}

          {/* Rev. 5053 — NOVA etapa: Proposta Comercial (Anexo I) gerida aqui mesmo */}
          {wizStep === 1 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-900">A <b>proposta comercial</b> do fornecedor vencedor vira o <b>Anexo I</b> do contrato. Anexe aqui — ou confira/substitua a versão já anexada.</p>
            </div>
            {!wizVencedor && <p className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Nenhum fornecedor vencedor selecionado nesta cotação.</p>}
            {wizVencedor && wizPropostaUrl && (
              <div className="border border-emerald-200 bg-white rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><FileText className="w-4.5 h-4.5 text-emerald-700" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate" title={wizPropostaNome}>{wizPropostaNome}</p>
                    <p className="text-[11px] text-gray-500">Anexo I — Proposta Comercial · {wizVencedor?.fornecedor?.nomeFantasia || wizVencedor?.fornecedor?.razaoSocial || "fornecedor vencedor"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {safeAnexoHref(wizPropostaUrl) && (
                    <a href={safeAnexoHref(wizPropostaUrl)!} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700">
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir
                    </a>
                  )}
                  <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-purple-300 bg-purple-50 text-xs font-semibold text-purple-700 cursor-pointer ${uploadPropostaWiz.isPending ? "opacity-60 pointer-events-none" : ""}`}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" className="hidden" disabled={uploadPropostaWiz.isPending}
                      onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await wizUploadProposta(f); }} />
                    {uploadPropostaWiz.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Nova versão
                  </label>
                  <button type="button" disabled={salvarPropostaWiz.isPending}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 disabled:opacity-60"
                    onClick={async () => {
                      if (!showDetalhe || !wizVencedor) return;
                      if (!(await confirm({ title: "Excluir a proposta anexada?", description: "O arquivo deixará de ser o Anexo I do contrato. Você poderá anexar outra versão em seguida.", tone: "destructive", confirmText: "Excluir", cancelText: "Cancelar" }))) return;
                      try {
                        await salvarPropostaWiz.mutateAsync({ cotacaoId: showDetalhe, fornecedorId: wizVencedor.fornecedorId, arquivoUrl: "", arquivoNome: "" });
                        toast.success("Proposta removida.");
                        mapaQ.refetch();
                      } catch (e: any) { toast.error(e?.message || "Falha ao remover"); }
                    }}>
                    {salvarPropostaWiz.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Excluir
                  </button>
                </div>
              </div>
            )}
            {wizVencedor && !wizPropostaUrl && (
              <label className={`inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 cursor-pointer border border-dashed border-purple-300 rounded-lg px-4 py-3 w-full justify-center ${uploadPropostaWiz.isPending ? "opacity-60 pointer-events-none" : ""}`}>
                <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" className="hidden" disabled={uploadPropostaWiz.isPending}
                  onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await wizUploadProposta(f); }} />
                {uploadPropostaWiz.isPending ? (<span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</span>) : "Anexar proposta comercial (PDF ou JPG)"}
              </label>
            )}
            {wizVencedor && !wizPropostaUrl && <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Sem a proposta anexada não é possível avançar — ela é obrigatória no contrato.</p>}
          </div>)}

          {wizStep === 2 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5">
              <Package className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900">Quem fornece cada material/recurso? Isso vira a <b>Matriz de Fornecimento</b> (subcláusula 1.4) e evita pedido de aditivo por ambiguidade.</p>
            </div>
            {/* Rev. 5020 — contrato só de MDO: matriz não se aplica */}
            <button type="button" onClick={() => setWizMatrizNA(v => !v)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold text-left ${wizMatrizNA ? "bg-purple-50 border-purple-400 text-purple-800" : "bg-white border-gray-300 text-gray-600"}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${wizMatrizNA ? "bg-purple-600 border-purple-600 text-white" : "border-gray-400"}`}>{wizMatrizNA ? "✓" : ""}</span>
              Não se aplica — contrato exclusivamente de mão de obra
            </button>
            {wizMatrizNA && <p className="text-xs text-gray-500">O contrato registrará: materiais e insumos por conta da FC; ferramentas, equipamentos da equipe e EPIs por conta da Contratada, salvo previsão diversa na proposta.</p>}
            {!wizMatrizNA && (<>
            <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={extrairMatrizIA.isPending}
              onClick={async () => {
                if (!showDetalhe) return;
                try {
                  const r = await extrairMatrizIA.mutateAsync({ cotacaoId: showDetalhe, companyId });
                  if (!r.ok) { toast.error(r.motivo || "Não foi possível ler a proposta"); return; }
                  if (!r.itens.length) { toast.info("A proposta não discrimina fornecimento de materiais — preencha manualmente."); return; }
                  setWizMatriz(prev => {
                    const jaTem = new Set(prev.map(m => m.item.toLowerCase()));
                    const novos = r.itens.filter((it: any) => !jaTem.has(it.item.toLowerCase()));
                    const atualizados = prev.map(m => {
                      const ia = r.itens.find((it: any) => it.item.toLowerCase() === m.item.toLowerCase());
                      return ia ? { ...m, fornecidoPor: ia.fornecidoPor } : m;
                    });
                    return [...atualizados, ...novos];
                  });
                  toast.success(`${r.itens.length} item(ns) lidos da proposta — revise antes de avançar.`);
                } catch (e: any) { toast.error(e?.message || "Falha na leitura da proposta"); }
              }}>
              {extrairMatrizIA.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {extrairMatrizIA.isPending ? "Lendo a proposta..." : "Copiar escopo da proposta (IA)"}
            </Button>
            <div className="space-y-1.5">
              {wizMatriz.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-800 truncate" title={m.item}>{m.item}</span>
                  {(["CONTRATANTE", "CONTRATADA"] as const).map((op) => (
                    <button key={op} type="button"
                      onClick={() => setWizMatriz(prev => prev.map((x, i) => i === idx ? { ...x, fornecidoPor: op } : x))}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold border ${m.fornecidoPor === op ? (op === "CONTRATANTE" ? "bg-blue-600 border-blue-600 text-white" : "bg-emerald-600 border-emerald-600 text-white") : "bg-white border-gray-300 text-gray-500"}`}>
                      {op === "CONTRATANTE" ? "FC (nós)" : "Contratada"}
                    </button>
                  ))}
                  {!MATRIZ_PADRAO.includes(m.item) && (
                    <button type="button" className="text-red-500 text-xs px-1" onClick={() => setWizMatriz(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <input value={wizMatrizNovo} onChange={e => setWizMatrizNovo(e.target.value)} placeholder="Adicionar outro item (ex.: Kerabond, Isolastic...)" maxLength={120}
                className="flex-1 h-9 px-3 rounded-lg border border-gray-300 text-sm outline-none focus:border-purple-400" />
              <Button variant="outline" size="sm" disabled={!wizMatrizNovo.trim()}
                onClick={() => { setWizMatriz(prev => [...prev, { item: wizMatrizNovo.trim(), fornecidoPor: "CONTRATADA" }]); setWizMatrizNovo(""); }}>Adicionar</Button>
            </div>
            </>)}
          </div>)}

          {wizStep === 3 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5">
              <Layers className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-sm text-indigo-900">Deseja anexar <b>projetos</b>? Eles entram como <b>Anexo II</b>, com uma folha separadora por disciplina. Se não tiver, é só avançar.</p>
            </div>
            {wizProjetos.map((p, pi) => (
              <div key={pi} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={p.disciplina} onChange={e => { const v = e.target.value.toUpperCase(); setWizProjetos(prev => prev.map((x, i) => i === pi ? { ...x, disciplina: v } : x)); }}
                    placeholder="Disciplina (ex.: Estrutural, Arquitetura...)" maxLength={80}
                    className="flex-1 h-9 px-3 rounded-lg border border-gray-300 text-sm outline-none focus:border-purple-400" />
                  <button type="button" className="text-red-500 text-xs px-1" onClick={() => setWizProjetos(prev => prev.filter((_, i) => i !== pi))}>✕</button>
                </div>
                {p.arquivos.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded px-2 py-1">
                    <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="flex-1 truncate" title={a.nome}>{a.nome}</span>
                    <button type="button" className="text-red-500" onClick={() => setWizProjetos(prev => prev.map((x, i) => i === pi ? { ...x, arquivos: x.arquivos.filter((_, j) => j !== ai) } : x))}>✕</button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 cursor-pointer">
                  <input type="file" accept=".pdf,application/pdf" multiple className="hidden" disabled={wizUploading}
                    onChange={async e => {
                      const files = Array.from(e.target.files || []); e.target.value = "";
                      for (const f of files) { const up = await wizUpload(f); if (up) setWizProjetos(prev => prev.map((x, i) => i === pi ? { ...x, arquivos: [...x.arquivos, up] } : x)); }
                    }} />
                  {wizUploading ? (<span className="flex items-center gap-2 w-full"><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Enviando... {wizProgress}%<span className="flex-1 h-1.5 rounded-full bg-purple-100 overflow-hidden min-w-[60px]"><span className="block h-full bg-purple-600 rounded-full transition-all" style={{ width: `${wizProgress}%` }} /></span></span>) : "+ Adicionar PDF desta disciplina"}
                </label>
                {p.disciplina.trim() && p.arquivos.length === 0 && <p className="text-[11px] text-amber-600">Disciplina sem arquivo — anexe um PDF ou remova a disciplina.</p>}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setWizProjetos(prev => [...prev, { disciplina: "", arquivos: [] }])}>+ Adicionar disciplina</Button>
          </div>)}

          {wizStep === 4 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <Calendar className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">Deseja anexar o <b>cronograma</b> da obra/serviço? Entra como anexo próprio, com folha de rosto. Se não tiver, é só avançar.</p>
            </div>
            {wizCronograma ? (
              <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" /><span className="flex-1 truncate" title={wizCronograma.nome}>{wizCronograma.nome}</span>
                <button type="button" className="text-red-500 text-xs" onClick={() => setWizCronograma(null)}>Remover</button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 cursor-pointer border border-dashed border-purple-300 rounded-lg px-4 py-3 w-full justify-center">
                <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={wizUploading}
                  onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const up = await wizUpload(f); if (up) setWizCronograma(up); } }} />
                {wizUploading ? (<span className="flex items-center gap-2 w-full justify-center"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Enviando... {wizProgress}%<span className="h-1.5 rounded-full bg-purple-100 overflow-hidden w-32"><span className="block h-full bg-purple-600 rounded-full transition-all" style={{ width: `${wizProgress}%` }} /></span></span>) : "Anexar cronograma (PDF)"}
              </label>
            )}
          </div>)}

          {wizStep === 5 && (<div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5">
              <Paperclip className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-900">Deseja anexar <b>outros documentos</b> (memorial descritivo, especificações, quantitativos...)? Cada um vira um anexo numerado com folha de rosto própria.</p>
            </div>
            {wizOutros.map((o, oi) => (
              <div key={oi} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={o.titulo} onChange={e => setWizOutros(prev => prev.map((x, i) => i === oi ? { ...x, titulo: e.target.value } : x))}
                    placeholder="Nome do documento (ex.: Memorial 632-MC-07)" maxLength={120}
                    className="flex-1 h-9 px-3 rounded-lg border border-gray-300 text-sm outline-none focus:border-purple-400" />
                  <button type="button" className="text-red-500 text-xs px-1" onClick={() => setWizOutros(prev => prev.filter((_, i) => i !== oi))}>✕</button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded px-2 py-1">
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="flex-1 truncate" title={o.nome}>{o.nome}</span>
                </div>
                {!o.titulo.trim() && <p className="text-[11px] text-amber-600">Dê um nome ao documento.</p>}
              </div>
            ))}
            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 cursor-pointer border border-dashed border-purple-300 rounded-lg px-4 py-3 w-full justify-center">
              <input type="file" accept=".pdf,application/pdf" multiple className="hidden" disabled={wizUploading}
                onChange={async e => {
                  const files = Array.from(e.target.files || []); e.target.value = "";
                  for (const f of files) { const up = await wizUpload(f); if (up) setWizOutros(prev => [...prev, { titulo: f.name.replace(/\.pdf$/i, ""), nome: up.nome, url: up.url }]); }
                }} />
              {wizUploading ? (<span className="flex items-center gap-2 w-full justify-center"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Enviando... {wizProgress}%<span className="h-1.5 rounded-full bg-purple-100 overflow-hidden w-32"><span className="block h-full bg-purple-600 rounded-full transition-all" style={{ width: `${wizProgress}%` }} /></span></span>) : "+ Anexar documento (PDF)"}
            </label>
          </div>)}

          {wizStep === 6 && (<div className="space-y-2.5">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-800">Tudo pronto! Confira o resumo antes de abrir a prévia.</p>
            </div>
            {([
              ["Título", <PenTool key="i" className="w-4 h-4 text-purple-600" />, tituloDraft.trim() || "—", "bg-purple-50 border-purple-200"],
              ["Matriz de fornecimento", <Package key="i" className="w-4 h-4 text-blue-600" />, wizMatrizNA ? "Não se aplica (contrato só de mão de obra)" : wizMatriz.filter(m => m.fornecidoPor === "CONTRATANTE").length > 0 ? `FC fornece: ${wizMatriz.filter(m => m.fornecidoPor === "CONTRATANTE").map(m => m.item).join(", ")}; o restante é da Contratada` : "Tudo por conta da Contratada", "bg-blue-50 border-blue-200"],
              ["Anexo I — Proposta Comercial", <FileText key="i" className="w-4 h-4 text-emerald-600" />, wizPropostaUrl ? `${wizPropostaNome} ✓` : "PENDENTE — volte à etapa Proposta", "bg-emerald-50 border-emerald-200"],
              ["Projetos", <Layers key="i" className="w-4 h-4 text-indigo-600" />, wizProjetos.filter(p => p.disciplina.trim() && p.arquivos.length > 0).length > 0 ? wizProjetos.filter(p => p.disciplina.trim() && p.arquivos.length > 0).map(p => `${p.disciplina} (${p.arquivos.length})`).join("; ") : "sem projetos", "bg-indigo-50 border-indigo-200"],
              ["Cronograma", <Calendar key="i" className="w-4 h-4 text-amber-600" />, wizCronograma ? wizCronograma.nome : "sem cronograma", "bg-amber-50 border-amber-200"],
              ["Outros documentos", <Paperclip key="i" className="w-4 h-4 text-rose-600" />, wizOutros.filter(o => o.titulo.trim()).length > 0 ? wizOutros.filter(o => o.titulo.trim()).map(o => o.titulo).join("; ") : "nenhum", "bg-rose-50 border-rose-200"],
            ] as Array<[string, React.ReactNode, string, string]>).map(([titulo, icone, valor, cor]) => (
              <div key={titulo} className={`rounded-xl border px-3 py-2.5 ${cor}`}>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">{icone}{titulo}</div>
                <p className="text-sm text-gray-800 mt-0.5 break-words">{valor}</p>
              </div>
            ))}
            <p className="text-xs text-gray-500">A numeração dos anexos e a cláusula 17.4.1 se ajustam sozinhas — o contrato só cita o que existe.</p>
          </div>)}
        </div>

        <div className="flex justify-between items-center gap-2 px-5 py-3.5 border-t border-gray-200 bg-white">
          <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => wizStep === 0 ? setTituloPromptOpen(false) : setWizStep(s => s - 1)}>
            {wizStep === 0 ? "Cancelar" : "← Voltar"}
          </Button>
          {wizStep < 6 ? (
            <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-purple-200 gap-1.5"
              disabled={anexosContratoQ.data === undefined || (wizStep === 0 && !tituloDraft.trim()) || wizUploading || uploadPropostaWiz.isPending || (wizStep === 1 && (!wizVencedor || !wizPropostaUrl)) || (wizStep === 3 && wizProjetos.some(p => p.disciplina.trim() && p.arquivos.length === 0))}
              onClick={() => setWizStep(s => s + 1)}>
              Avançar <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold shadow-md shadow-emerald-200 gap-1.5" disabled={salvarAnexosContrato.isPending || wizUploading}
              onClick={wizConcluir}>
              {salvarAnexosContrato.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {salvarAnexosContrato.isPending ? "Salvando..." : "Confirmar e abrir a prévia"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={previewContratoOpen} onOpenChange={(v) => { if (!v) setPreviewContratoOpen(false); }}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-purple-600" />
            Prévia do Contrato de Serviço
            {previewContratoQ.data?.numeroContrato && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                {previewContratoQ.data.numeroContrato}
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Revise o texto abaixo — é exatamente como o contrato será gerado. Nada foi criado ainda; a aprovação só acontece no botão roxo.
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4 lg:p-6">
          {previewContratoQ.isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm font-medium">Montando a prévia do contrato...</p>
            </div>
          ) : previewContratoQ.error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm font-semibold text-gray-700 text-center max-w-md break-words">{previewContratoQ.error.message}</p>
            </div>
          ) : previewContratoQ.data?.html ? (
            /* Rev. 5006 — prévia 100% fiel ao documento final: mesmo motor de layout
               da Central de Documentos (cabeçalho FC, faixa, corpo e assinaturas). */
            <iframe
              title="Prévia do contrato"
              className="w-full h-full min-h-[70vh] bg-white rounded-lg shadow-md border-0"
              sandbox=""
              srcDoc={buildContratoPreviewSrcDoc(previewContratoQ.data, anexoPreviewPages ?? undefined, contratoLogoDataUrl, (user as any)?.name || (user as any)?.email)}
            />
          ) : (
            <div className="bg-white rounded-lg shadow-md max-w-3xl mx-auto p-6 lg:p-10">
              <pre className="whitespace-pre-wrap break-words font-serif text-[13px] leading-relaxed text-gray-800">{previewContratoQ.data?.texto}</pre>
            </div>
          )}
          {/* Rev. 5008 — pedido do user (IMG_5522): o arquivo da proposta (Anexo I)
              aparece embutido na prévia para conferência do escopo. iOS Safari não
              pinta PDF em <iframe> → mostra card com botão "Abrir" (memória iOS). */}
          {/* Rev. 5008 — card só como fallback: se as páginas do anexo já foram
              renderizadas dentro da prévia (acima), não repete aqui. */}
          {!previewContratoQ.isLoading && !previewContratoQ.error && !anexoPreviewPages?.length && safeAnexoHref((previewContratoQ.data as any)?.propostaUrl) && (() => {
            const pUrl = safeAnexoHref((previewContratoQ.data as any).propostaUrl)!;
            const pNome = (previewContratoQ.data as any).propostaNome || "Proposta Comercial";
            const isPdf = /\.pdf($|\?)/i.test(pUrl) || /\.pdf$/i.test(pNome);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
            return (
              <div className="max-w-3xl mx-auto mt-4">
                <div className="flex items-center justify-between gap-2 bg-purple-50 border border-purple-200 rounded-t-lg px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 text-purple-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-purple-800 truncate">Anexo I — {pNome}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-100 flex-shrink-0" onClick={() => window.open(pUrl, "_blank")}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                  </Button>
                </div>
                <div className="bg-white border border-t-0 border-purple-200 rounded-b-lg overflow-hidden">
                  {!isPdf ? (
                    <img src={pUrl} alt={pNome} className="w-full h-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : isIOS ? (
                    <button onClick={() => window.open(pUrl, "_blank")} className="w-full flex flex-col items-center justify-center gap-2 py-10 text-purple-700 hover:bg-purple-50 transition-colors">
                      <FileText className="h-10 w-10 text-purple-400" />
                      <span className="text-sm font-medium">Toque para abrir a proposta (PDF)</span>
                      <span className="text-xs text-gray-500">O iPad não exibe PDF embutido — abre em nova aba</span>
                    </button>
                  ) : (
                    <iframe title="Anexo I — Proposta Comercial" src={pUrl} className="w-full h-[70vh] border-0" />
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        {/* Rev. 5019 — painel da dupla checagem (IA): contrato × proposta */}
        {divergenciasPanel && (
          <div className="px-6 py-3 border-t border-amber-200 bg-amber-50/70 flex-shrink-0 max-h-[32vh] overflow-y-auto">
            {divergenciasPanel.motivo ? (
              <p className="text-sm text-amber-800">{divergenciasPanel.motivo}</p>
            ) : divergenciasPanel.divergencias.length === 0 ? (
              <p className="text-sm text-emerald-700 font-semibold">✓ Nenhuma divergência relevante encontrada entre o contrato e a proposta.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-bold text-amber-800 uppercase">Divergências contrato × proposta ({divergenciasPanel.divergencias.length}) — confira antes de aprovar:</p>
                {divergenciasPanel.divergencias.map((d, i) => (
                  <div key={i} className="bg-white rounded-lg border border-amber-200 p-2.5 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${d.gravidade === "alta" ? "bg-red-100 text-red-700" : d.gravidade === "media" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{d.gravidade}</span>
                      <span className="font-bold text-gray-700 uppercase text-[10px]">{d.tema}</span>
                    </div>
                    {d.contrato && <p><b>Contrato:</b> {d.contrato}</p>}
                    {d.proposta && <p><b>Proposta:</b> {d.proposta}</p>}
                    {d.recomendacao && <p className="text-purple-700"><b>Sugestão:</b> {d.recomendacao}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="px-6 py-4 border-t border-gray-200 flex-shrink-0 gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setPreviewContratoOpen(false)} disabled={gerarContrato.isPending}>
            Voltar e revisar
          </Button>
          <Button variant="outline" className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-50"
            disabled={analisarDivergencias.isPending || !previewContratoQ.data?.texto}
            onClick={async () => {
              if (!showDetalhe || !previewContratoQ.data?.texto) return;
              // Rev. 5023 — progresso estimado 0→95% (a IA não streama), 100% na chegada.
              setAnaliseProgress(0);
              pararProgressoAnalise();
              analiseTimerRef.current = setInterval(() => {
                setAnaliseProgress(p => p === null ? null : Math.min(95, p + Math.max(1, Math.round((95 - p) / 12))));
              }, 400);
              try {
                const r = await analisarDivergencias.mutateAsync({ cotacaoId: showDetalhe, companyId, contratoTexto: String(previewContratoQ.data.texto) });
                pararProgressoAnalise();
                setAnaliseProgress(100);
                setDivergenciasPanel({ motivo: r.motivo ?? null, divergencias: (r.divergencias || []) as any });
                // Tela de resumo automática ao concluir (pedido do user 12/08/2026).
                setResumoFiltro("todas");
                setResumoAnaliseOpen(true);
                setTimeout(() => setAnaliseProgress(null), 800);
              } catch (e: any) {
                pararProgressoAnalise();
                setAnaliseProgress(null);
                toast.error(e?.message || "Falha na análise");
              }
            }}>
            {analisarDivergencias.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analisarDivergencias.isPending ? `Analisando... ${analiseProgress ?? 0}%` : "Checar contrato × proposta (IA)"}
          </Button>
          {/* Rev. 5009 — imprimir / baixar / WhatsApp da prévia (PDF server-side
              com Anexo I emendado; nada é criado no banco). window.open síncrono
              no gesto do clique — obrigatório no iOS Safari. */}
          <Button
            variant="outline"
            className="gap-2"
            disabled={previewContratoQ.isLoading || !!previewContratoQ.error}
            onClick={() => { if (showDetalhe) window.open(`/api/contrato-preview-pdf?cotacaoId=${showDetalhe}&companyId=${companyId}&titulo=${encodeURIComponent(contratoTitulo.trim())}&modo=abrir`, "_blank"); }}
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={previewContratoQ.isLoading || !!previewContratoQ.error}
            onClick={() => { if (showDetalhe) window.open(`/api/contrato-preview-pdf?cotacaoId=${showDetalhe}&companyId=${companyId}&titulo=${encodeURIComponent(contratoTitulo.trim())}&modo=baixar`, "_blank"); }}
          >
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
          <Button
            variant="outline"
            className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
            disabled={previewContratoQ.isLoading || !!previewContratoQ.error || previewPdfSharing}
            onClick={async () => {
              if (!showDetalhe) return;
              // Janela pré-aberta SÍNCRONA (gesto do clique) — fallback se o
              // compartilhamento nativo não estiver disponível/for negado.
              const janela = window.open("", "_blank");
              setPreviewPdfSharing(true);
              try {
                const resp = await fetch(`/api/contrato-preview-pdf?cotacaoId=${showDetalhe}&companyId=${companyId}&titulo=${encodeURIComponent(contratoTitulo.trim())}&modo=abrir`, { credentials: "include" });
                if (!resp.ok) throw new Error(await resp.text().catch(() => "Falha ao gerar o PDF"));
                const blob = await resp.blob();
                const nome = `Previa_Contrato_${String((previewContratoQ.data as any)?.numeroContrato || showDetalhe).replace(/\//g, "-")}.pdf`;
                const file = new File([blob], nome, { type: "application/pdf" });
                const nav: any = navigator;
                // Fallback (code review): abre o PDF na janela pré-aberta e revoga
                // o object URL depois de 60s (tempo de sobra pro viewer carregar).
                const abrirFallback = () => {
                  const objUrl = URL.createObjectURL(blob);
                  if (janela) janela.location.href = objUrl;
                  else window.open(objUrl, "_blank");
                  setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
                };
                if (nav.canShare?.({ files: [file] })) {
                  try {
                    // Só fecha a janela DEPOIS do share dar certo — iOS Safari
                    // pode rejeitar share() se a ativação do clique expirou.
                    await nav.share({ files: [file], title: "Prévia do Contrato" });
                    janela?.close();
                  } catch (err: any) {
                    if (err?.name === "AbortError") janela?.close(); // usuário cancelou
                    else abrirFallback(); // ativação expirada/negada → abre o PDF
                  }
                } else {
                  abrirFallback();
                }
              } catch (e: any) {
                janela?.close();
                toast.error(String(e?.message || "Falha ao gerar o PDF da prévia"));
              } finally {
                setPreviewPdfSharing(false);
              }
            }}
          >
            {previewPdfSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} WhatsApp
          </Button>
          <Button
            className="bg-purple-600 hover:bg-purple-500 text-white gap-2"
            disabled={gerarContrato.isPending || previewContratoQ.isLoading || !!previewContratoQ.error}
            onClick={() => {
              if (!showDetalhe) return;
              setPreviewContratoOpen(false);
              gerarContrato.mutate({ cotacaoId: showDetalhe, companyId, tituloContrato: contratoTitulo.trim() || undefined });
            }}
          >
            {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Está tudo certo — Aprovar e Gerar Contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* Rev. 5023 — Resumo da análise IA (abre automaticamente ao concluir).
        Governança: o texto padrão do contrato FC é travado — só o ESCOPO pode
        ser ajustado pelo usuário; demais cláusulas exigem aprovação do Sócio Adm. */}
    <Dialog open={resumoAnaliseOpen} onOpenChange={setResumoAnaliseOpen}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-0">
        {(() => {
          const divs = divergenciasPanel?.divergencias ?? [];
          const nAlta = divs.filter(d => d.gravidade === "alta").length;
          const nMedia = divs.filter(d => d.gravidade === "media").length;
          const nBaixa = divs.length - nAlta - nMedia;
          const ok = !divergenciasPanel?.motivo && divs.length === 0;
          return (<>
        <DialogHeader className="px-6 pt-5 pb-4 flex-shrink-0 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 text-white">
          <DialogTitle className="flex items-center gap-2.5 text-lg text-white">
            <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Sparkles className="h-5 w-5 text-amber-300" /></span>
            Resumo da Análise — Contrato × Proposta
          </DialogTitle>
          <p className="text-xs text-purple-100 mt-1">Confira tudo antes de aprovar. Nada foi criado ainda.</p>
          {/* Placar da análise */}
          <div className="flex flex-wrap gap-2 pt-3">
            {ok ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 px-3 py-1 text-xs font-bold text-emerald-100"><CheckCircle className="w-3.5 h-3.5" /> Sem divergências</span>
            ) : divergenciasPanel?.motivo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-300/40 px-3 py-1 text-xs font-bold text-amber-100"><AlertTriangle className="w-3.5 h-3.5" /> Análise não conclusiva</span>
            ) : (<>
              {/* Rev. 5024 — chips clicáveis: filtram a lista por gravidade */}
              <button type="button" onClick={() => setResumoFiltro("todas")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${resumoFiltro === "todas" ? "bg-white text-purple-700 border-white shadow" : "bg-white/15 border-white/25 text-white hover:bg-white/25"}`}>
                {divs.length} divergência{divs.length > 1 ? "s" : ""}</button>
              {nAlta > 0 && <button type="button" onClick={() => setResumoFiltro(f => f === "alta" ? "todas" : "alta")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${resumoFiltro === "alta" ? "bg-red-500 text-white border-red-300 shadow ring-2 ring-white/60" : "bg-red-500/30 border-red-300/40 text-red-100 hover:bg-red-500/50"}`}>
                ● {nAlta} alta{nAlta > 1 ? "s" : ""}</button>}
              {nMedia > 0 && <button type="button" onClick={() => setResumoFiltro(f => f === "media" ? "todas" : "media")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${resumoFiltro === "media" ? "bg-amber-400 text-amber-950 border-amber-200 shadow ring-2 ring-white/60" : "bg-amber-400/25 border-amber-300/40 text-amber-100 hover:bg-amber-400/45"}`}>
                ● {nMedia} média{nMedia > 1 ? "s" : ""}</button>}
              {nBaixa > 0 && <button type="button" onClick={() => setResumoFiltro(f => f === "baixa" ? "todas" : "baixa")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${resumoFiltro === "baixa" ? "bg-white text-gray-700 border-white shadow ring-2 ring-white/60" : "bg-white/10 border-white/20 text-purple-100 hover:bg-white/25"}`}>
                ● {nBaixa} baixa{nBaixa > 1 ? "s" : ""}</button>}
            </>)}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
          {/* Cartão do documento */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Contrato</p><p className="font-bold text-gray-900">{String((previewContratoQ.data as any)?.numeroContrato || "S/N")}</p></div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Package className="w-4 h-4" /></span>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Contratada</p><p className="font-semibold text-gray-900 break-words">{String((previewContratoQ.data as any)?.docMeta?.contratadaNome || "—")}</p></div>
            </div>
            <div className="flex items-start gap-2.5 sm:col-span-2">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><PenTool className="w-4 h-4" /></span>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Título</p><p className="text-gray-800 break-words">{String((previewContratoQ.data as any)?.titulo || contratoTitulo || "—")}</p></div>
            </div>
            {!!anexoPreviewPages?.length && (
              <div className="flex items-start gap-2.5 sm:col-span-2">
                <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><Paperclip className="w-4 h-4" /></span>
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Anexos incluídos</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">{anexoPreviewPages.map((s, i) => (
                    <span key={i} className="inline-flex rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">{s.titulo}</span>
                  ))}</div></div>
              </div>
            )}
          </div>
          {/* Resultado */}
          {divergenciasPanel?.motivo ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />{divergenciasPanel.motivo}
            </div>
          ) : ok ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><Check className="w-5 h-5" strokeWidth={3} /></span>
              <div>
                <p className="text-sm font-bold text-emerald-800">Nenhuma divergência relevante encontrada</p>
                <p className="text-xs text-emerald-700 mt-0.5">O contrato está alinhado com a proposta comercial da contratada.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {resumoFiltro !== "todas" && (
                <p className="text-[11px] font-semibold text-gray-500">Mostrando só gravidade <b className="uppercase">{resumoFiltro === "media" ? "média" : resumoFiltro}</b> — clique no chip de novo para ver todas.</p>
              )}
              {[...divs].filter(d => resumoFiltro === "todas" || d.gravidade === resumoFiltro).sort((a, b) => (a.gravidade === "alta" ? 0 : a.gravidade === "media" ? 1 : 2) - (b.gravidade === "alta" ? 0 : b.gravidade === "media" ? 1 : 2)).map((d, i) => {
                const tone = d.gravidade === "alta"
                  ? { borda: "border-l-red-500", badge: "bg-red-100 text-red-700", icone: "bg-red-100 text-red-600" }
                  : d.gravidade === "media"
                  ? { borda: "border-l-amber-500", badge: "bg-amber-100 text-amber-700", icone: "bg-amber-100 text-amber-600" }
                  : { borda: "border-l-gray-300", badge: "bg-gray-100 text-gray-600", icone: "bg-gray-100 text-gray-500" };
                return (
                  <div key={i} className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${tone.borda} shadow-sm p-3.5 text-xs space-y-2`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${tone.icone}`}><AlertTriangle className="w-3.5 h-3.5" /></span>
                      <span className="font-bold text-gray-800 uppercase tracking-wide text-[11px]">{d.tema}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${tone.badge}`}>{d.gravidade}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {d.contrato && <div className="rounded-lg bg-indigo-50/70 border border-indigo-100 p-2"><p className="text-[10px] font-bold uppercase text-indigo-500 mb-0.5">📄 No contrato</p><p className="text-gray-800 leading-relaxed">{d.contrato}</p></div>}
                      {d.proposta && <div className="rounded-lg bg-teal-50/70 border border-teal-100 p-2"><p className="text-[10px] font-bold uppercase text-teal-600 mb-0.5">📋 Na proposta</p><p className="text-gray-800 leading-relaxed">{d.proposta}</p></div>}
                    </div>
                    {d.recomendacao && <div className="rounded-lg bg-purple-50 border border-purple-100 p-2 flex items-start gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" /><p className="text-purple-800 leading-relaxed"><b>Sugestão:</b> {d.recomendacao}</p></div>}
                  </div>
                );
              })}
            </div>
          )}
          {/* Governança */}
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 text-xs text-blue-900 flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">🔒</span>
            <div>
              <p className="font-bold text-sm">Contrato padrão FC — regras de alteração</p>
              <p className="mt-1 leading-relaxed">O texto das cláusulas só pode ser alterado com <b>aprovação do Sócio Administrador</b>. Você pode ajustar diretamente apenas o <b>escopo</b>: título, matriz de fornecimento e anexos (botão "Voltar e revisar").</p>
            </div>
          </div>
        </div>
        <DialogFooter className="px-5 py-4 border-t border-gray-200 bg-white flex-shrink-0 gap-2">
          <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setResumoAnaliseOpen(false)}>← Voltar e revisar</Button>
          <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-purple-200" onClick={() => setResumoAnaliseOpen(false)}>Entendi — continuar</Button>
        </DialogFooter>
          </>);
        })()}
      </DialogContent>
    </Dialog>
    <TransferenciaEstoqueDialog
      open={showTransferenciaDialog}
      onOpenChange={(v) => { if (!v) { setShowTransferenciaDialog(false); setPendingGerarOCParams(null); setTransfObraOrigemId(undefined); } }}
      companyId={companyId}
      obraDestinoId={(detalheFullscreen as any)?.obraId ?? null}
      obraDestinoNome={(detalheFullscreen as any)?.obraNome ?? null}
      itensSC={(mapa?.itens ?? []) as any[]}
      respostaMap={(mapa as any)?.respostaMap}
      obras={(obrasQ.data ?? []) as any[]}
      obraOrigemId={transfObraOrigemId}
      onChangeObraOrigem={setTransfObraOrigemId}
      onConfirmar={() => {
        if (!pendingGerarOCParams) return;
        if (transfObraOrigemId === undefined) { toast.error("Selecione a obra de origem do material."); return; }
        gerarOC.mutate({ companyId, userId: user?.id, userName: user?.name, ...pendingGerarOCParams, obraOrigemId: transfObraOrigemId });
        setShowTransferenciaDialog(false);
        setPendingGerarOCParams(null);
        setTransfObraOrigemId(undefined);
      }}
      isPending={gerarOC.isPending}
    />

    {/* Rev. 2467 — Modal "Selecionar do Estoque" (movido da posição
        original no return principal — onde nunca renderizava por
        causa do early-return acima). Lista almoxarifado da empresa
        (central + obra atual) com saldo > 0; user marca itens e os
        IDs vão pra mutation `adicionarEstoqueAoMapa` como whitelist. */}
    {/* Rev. 2471 — Layout ultra moderno: header com gradient, busca destacada,
        chips de filtro por origem (Todas/Central/Obras), grid de cards com
        avatar circular gradient (iniciais), badges de origem com nome da
        obra, saldo grande, footer com resumo (qtd + valor estimado total). */}
    <Dialog open={showEstoquePicker} onOpenChange={(o) => { if (!o) { setShowEstoquePicker(false); setEstoquePickerIds(new Set()); setEstoquePickerSearch(""); setEstoquePickerOrigem("todas"); } }}>
      <DialogContent
        className="border-0 p-0 gap-0 flex flex-col"
        style={{
          background: "#F8FAFC",
          color: "#0F172A",
          width: "100vw",
          height: "100vh",
          maxWidth: "100vw",
          maxHeight: "100vh",
          borderRadius: 0,
        }}
      >
        {/* HEADER — gradient indigo→violet com ícone bordeau, título, subtítulo e badge contador */}
        <DialogHeader
          className="px-8 py-5 shrink-0 border-b border-slate-200"
          style={{
            background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #4C1D95 100%)",
            color: "#fff",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.18)" }}
              >
                <Package className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-white text-xl font-bold tracking-tight">Selecionar do Estoque</DialogTitle>
                <p className="text-xs text-white/70 mt-0.5 truncate">
                  Marque os itens do almoxarifado pra atender esta solicitação — cruzamento automático com os itens da SC
                </p>
              </div>
            </div>
            {(() => {
              const totalDisp = ((estoqueDisponivelQ.data ?? []) as any[]).length;
              return (
                <div
                  className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold tracking-wide flex items-center gap-2"
                  style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                  {totalDisp.toLocaleString("pt-BR")} {totalDisp === 1 ? "item disponível" : "itens disponíveis"}
                </div>
              );
            })()}
          </div>
        </DialogHeader>

        {/* TOOLBAR — busca + chips de origem + ações marcar/limpar */}
        {(() => {
          const itensAll = (estoqueDisponivelQ.data ?? []) as any[];
          const obrasUnicas = Array.from(new Map(
            itensAll.filter((i) => !i.isCentral && i.obraId).map((i) => [i.obraId, { id: i.obraId, nome: i.obraNome || "Obra" }])
          ).values()).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
          const countCentral = itensAll.filter((i) => i.isCentral).length;
          const countObra = (obraId: number) => itensAll.filter((i) => i.obraId === obraId).length;
          const filtrados = itensAll.filter((it) => {
            if (estoquePickerOrigem === "central" && !it.isCentral) return false;
            if (estoquePickerOrigem !== "todas" && estoquePickerOrigem !== "central") {
              const oId = Number(estoquePickerOrigem);
              if (!Number.isNaN(oId) && it.obraId !== oId) return false;
            }
            if (estoquePickerSearch) {
              const q = estoquePickerSearch.toLowerCase();
              return (it.nome ?? "").toLowerCase().includes(q)
                || (it.codigoInterno ?? "").toLowerCase().includes(q)
                || (it.categoria ?? "").toLowerCase().includes(q)
                || (it.obraNome ?? "").toLowerCase().includes(q);
            }
            return true;
          });
          // Rev. 2471 — somar sobre TODOS os ids marcados (não só filtrados),
          // senão footer diverge do payload de confirmação que envia ids
          // completos (inclusive itens fora do filtro/busca atual).
          const valorTotalSelecionado = itensAll
            .filter((it) => estoquePickerIds.has(it.id))
            .reduce((acc, it) => acc + (Number(it.valorUnitario) || 0) * (Number(it.quantidadeAtual) || 0), 0);

          return (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-8 pt-5 pb-4 shrink-0 space-y-3 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por nome, código, categoria ou obra…"
                      value={estoquePickerSearch}
                      onChange={(e) => setEstoquePickerSearch(e.target.value)}
                      className="pl-11 h-11 bg-slate-50 border-slate-200 text-slate-900 text-sm rounded-xl focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:border-violet-400"
                    />
                  </div>
                  <button
                    type="button"
                    className="h-11 px-4 rounded-xl text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors"
                    onClick={() => setEstoquePickerIds(new Set(filtrados.map((it: any) => it.id)))}
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    className="h-11 px-4 rounded-xl text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    onClick={() => setEstoquePickerIds(new Set())}
                  >
                    Limpar
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {(() => {
                    const chip = (key: string, label: string, count: number, color: "violet" | "blue" | "emerald") => {
                      const ativo = estoquePickerOrigem === key;
                      const palette = color === "violet"
                        ? { active: "bg-violet-600 text-white border-violet-600", idle: "bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:text-violet-700" }
                        : color === "blue"
                        ? { active: "bg-blue-600 text-white border-blue-600", idle: "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700" }
                        : { active: "bg-emerald-600 text-white border-emerald-600", idle: "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700" };
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEstoquePickerOrigem(key)}
                          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${ativo ? palette.active : palette.idle}`}
                        >
                          <span className="truncate max-w-[200px]">{label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                        </button>
                      );
                    };
                    return (
                      <>
                        {chip("todas", "Todas as origens", itensAll.length, "violet")}
                        {chip("central", "Escritório Central", countCentral, "blue")}
                        {obrasUnicas.map((o) => chip(String(o.id), o.nome, countObra(o.id), "emerald"))}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* CONTEÚDO — grid de cards */}
              <div className="flex-1 min-h-0 overflow-y-auto px-8 py-5">
                {estoqueDisponivelQ.isLoading ? (
                  <div className="flex items-center justify-center py-24 text-slate-500"><Loader2 className="h-7 w-7 animate-spin" /></div>
                ) : itensAll.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                      <Package className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Nenhum item do almoxarifado com saldo disponível</p>
                    <p className="text-xs text-slate-500 mt-1">Verifique se há itens cadastrados com quantidade &gt; 0</p>
                  </div>
                ) : filtrados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                      <Search className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Nenhum item encontrado</p>
                    <p className="text-xs text-slate-500 mt-1">Tente outra busca ou troque a origem nos chips acima</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                      <span>
                        Exibindo <span className="font-semibold text-slate-900">{filtrados.length.toLocaleString("pt-BR")}</span>
                        {filtrados.length !== itensAll.length && <> de <span className="font-semibold text-slate-700">{itensAll.length.toLocaleString("pt-BR")}</span></>} itens
                      </span>
                      <span className="font-semibold text-violet-700">{estoquePickerIds.size} selecionado(s)</span>
                    </div>
                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filtrados.map((it: any) => {
                        const marcado = estoquePickerIds.has(it.id);
                        const iniciais = (it.nome || "?")
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((s: string) => s[0])
                          .join("")
                          .toUpperCase();
                        const seed = String(it.id || it.nome || "x").split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
                        const gradients = [
                          "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                          "linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)",
                          "linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)",
                          "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
                          "linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)",
                          "linear-gradient(135deg, #14B8A6 0%, #6366F1 100%)",
                        ];
                        const grad = gradients[seed % gradients.length];
                        const subtotal = (Number(it.valorUnitario) || 0) * (Number(it.quantidadeAtual) || 0);
                        return (
                          <div
                            key={it.id}
                            role="checkbox"
                            aria-checked={marcado}
                            aria-label={`${it.nome} — saldo ${it.quantidadeAtual} ${it.unidade || ""}, origem ${it.isCentral ? "Escritório Central" : (it.obraNome || "Obra")}`}
                            tabIndex={0}
                            onClick={() => {
                              const ns = new Set(estoquePickerIds);
                              if (marcado) ns.delete(it.id); else ns.add(it.id);
                              setEstoquePickerIds(ns);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                const ns = new Set(estoquePickerIds);
                                if (marcado) ns.delete(it.id); else ns.add(it.id);
                                setEstoquePickerIds(ns);
                              }
                            }}
                            className={`relative cursor-pointer rounded-2xl border bg-white p-4 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${marcado ? "border-violet-500 ring-2 ring-violet-500/20 shadow-lg shadow-violet-500/10" : "border-slate-200 hover:border-violet-300 hover:shadow-md hover:-translate-y-0.5"}`}
                          >
                            {/* Checkbox custom */}
                            <div className={`absolute top-3 right-3 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${marcado ? "bg-violet-600 border-violet-600" : "bg-white border-slate-300 group-hover:border-violet-400"}`}>
                              {marcado && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </div>

                            <div className="flex items-start gap-3 mb-3 pr-7">
                              <div
                                className="h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white text-sm font-bold tracking-wide shadow-sm"
                                style={{ background: grad }}
                              >
                                {iniciais || "?"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-slate-900 text-sm leading-tight line-clamp-2" title={it.nome}>
                                  {it.nome}
                                </div>
                                {it.codigoInterno && (
                                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 tracking-tight">#{it.codigoInterno}</div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 mb-3">
                              <span
                                className={`inline-flex items-center gap-1 max-w-full text-[10px] font-semibold px-2 py-0.5 rounded-full ${it.isCentral ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}
                                title={it.isCentral ? "Escritório Central" : (it.obraNome || "Obra")}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${it.isCentral ? "bg-blue-500" : "bg-emerald-500"}`} />
                                <span className="truncate">{it.isCentral ? "Central" : (it.obraNome || "Obra")}</span>
                              </span>
                              {it.categoria && (
                                <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[140px]" title={it.categoria}>
                                  {it.categoria}
                                </span>
                              )}
                            </div>

                            <div className="flex items-end justify-between pt-3 border-t border-slate-100">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Saldo</div>
                                <div className="text-lg font-bold text-slate-900 tabular-nums leading-none mt-0.5">
                                  {Number(it.quantidadeAtual).toLocaleString("pt-BR")}
                                  <span className="text-xs font-medium text-slate-400 ml-1">{it.unidade || ""}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Preço médio</div>
                                <div className="text-sm font-semibold text-slate-700 tabular-nums leading-none mt-0.5">
                                  {it.valorUnitario > 0
                                    ? `R$ ${Number(it.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : <span className="text-slate-300">—</span>}
                                </div>
                                {subtotal > 0 && (
                                  <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                                    ≈ R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* FOOTER — resumo + ações */}
              <div className="px-8 py-4 shrink-0 border-t border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Selecionados</div>
                      <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none mt-1">
                        {estoquePickerIds.size}
                        <span className="text-sm font-medium text-slate-400 ml-1">de {itensAll.length}</span>
                      </div>
                    </div>
                    {valorTotalSelecionado > 0 && (
                      <div className="border-l border-slate-200 pl-6">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Valor estimado</div>
                        <div className="text-2xl font-bold text-emerald-600 tabular-nums leading-none mt-1">
                          R$ {valorTotalSelecionado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="h-11 px-5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
                      onClick={() => { setShowEstoquePicker(false); setEstoquePickerIds(new Set()); setEstoquePickerSearch(""); setEstoquePickerOrigem("todas"); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      disabled={estoquePickerIds.size === 0 || adicionarEstoque.isPending || !showDetalhe}
                      onClick={() => {
                        if (!showDetalhe) return;
                        adicionarEstoque.mutate({
                          cotacaoId: showDetalhe,
                          companyId,
                          obraId: (detalheFullscreen as any)?.obraId ?? undefined,
                          almoxItemIds: Array.from(estoquePickerIds),
                        });
                      }}
                      className="h-11 px-6 rounded-xl text-white gap-2 font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/40 disabled:opacity-50 disabled:shadow-none transition-all"
                      style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}
                    >
                      {adicionarEstoque.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirmar seleção
                      {estoquePickerIds.size > 0 && (
                        <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs tabular-nums">{estoquePickerIds.size}</span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>

    {/* Rev. 2806 — Modal "Dividir Cotação" (move itens p/ nova cotação) */}
    {showDividirModal && detalheFullscreen && (() => {
      const itensCot = ((detalheFullscreen as any).itens ?? []) as any[];
      const sel = dividirSel;
      // Rev. 4014 — proporção movida por item (qtdMovida/qtdTotal), pra dividir o total
      // do item na mesma razão (funciona pra full-move E partial-move).
      const ratioOf = (it: any) => {
        const totalQty = parseFloat(it.quantidade) || 0;
        const moveQty = Math.min(sel.get(it.id) ?? 0, totalQty);
        return totalQty > 0 ? moveQty / totalQty : 0;
      };
      const totalSel = itensCot.reduce((s, it) => s + (parseFloat(it.total) || 0) * ratioOf(it), 0);
      const itensSelCount = itensCot.filter(it => sel.has(it.id) && (sel.get(it.id) ?? 0) > 0).length;
      const restam = itensCot.length - itensCot.filter(it => sel.has(it.id) && ratioOf(it) >= 0.999999).length;
      const podeDividir = itensSelCount >= 1 && itensCot.some(it => !sel.has(it.id) || ratioOf(it) < 0.999999);
      const restamTotal = itensCot.reduce((s, it) => s + (parseFloat(it.total) || 0) * (1 - ratioOf(it)), 0);
      const todosMarcados = itensCot.length > 0 && itensCot.every(it => ratioOf(it) >= 0.999999);
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowDividirModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Header com gradiente */}
            <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-violet-600 via-violet-600 to-fuchsia-600 text-white">
              <button onClick={() => setShowDividirModal(false)} className="absolute top-4 right-4 p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"><X className="h-5 w-5" /></button>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur"><GitBranch className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Dividir Cotação</h3>
                  <p className="text-[13px] text-white/80 mt-0.5">Selecione os itens que vão sair para uma nova cotação separada — mesma SC, fornecedores diferentes.</p>
                </div>
              </div>
            </div>

            {/* Toolbar de seleção */}
            <div className="flex items-center justify-between gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/70">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                  <Check className="h-3.5 w-3.5" /> {itensSelCount} selecionado{itensSelCount === 1 ? "" : "s"}
                </span>
                <span className="text-xs text-gray-400">de {itensCot.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setDividirSel(todosMarcados ? new Map() : new Map(itensCot.map(it => [it.id, parseFloat(it.quantidade) || 0])))}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                  {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
                </button>
                <button type="button" onClick={() => setDividirSel(new Map())}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-200/70 transition-colors">Limpar</button>
              </div>
            </div>

            {/* Lista de itens */}
            <div className="flex-1 overflow-auto px-4 sm:px-6 py-3 space-y-2 bg-gray-50/40">
              {itensCot.map(it => {
                const checked = sel.has(it.id);
                const totalQty = parseFloat(it.quantidade) || 0;
                const moveQty = sel.get(it.id) ?? totalQty;
                const isPartial = checked && moveQty < totalQty - 1e-9;
                return (
                  <div key={it.id}
                    className={`group flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all ${checked ? "border-violet-400 bg-violet-50 shadow-sm ring-1 ring-violet-200" : "border-gray-200 bg-white hover:border-violet-200 hover:shadow-sm"}`}>
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${checked ? "border-violet-600 bg-violet-600" : "border-gray-300 group-hover:border-violet-400 bg-white"}`}>
                        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </span>
                      <input type="checkbox" checked={checked} onChange={() => setDividirSel(prev => { const next = new Map(prev); if (next.has(it.id)) next.delete(it.id); else next.set(it.id, totalQty); return next; })} className="sr-only" />
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 group-hover:bg-violet-100 group-hover:text-violet-500 transition-colors">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${checked ? "text-violet-900" : "text-gray-800"}`}>{it.descricao}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{Number(it.quantidade)} {it.unidade || "un"}</span>
                          {parseFloat(it.total) > 0 && <span className="text-[11px] text-gray-400">{fmt(parseFloat(it.total))}</span>}
                          {isPartial && <span className="inline-flex items-center rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[11px] font-semibold text-fuchsia-700">parcial</span>}
                        </div>
                      </div>
                    </label>
                    {checked && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[11px] text-gray-400">mover</span>
                        <Input type="number" min={0} max={totalQty} step="any" value={moveQty}
                          onChange={e => {
                            const raw = parseFloat(e.target.value);
                            setDividirSel(prev => { const next = new Map(prev); next.set(it.id, isNaN(raw) ? 0 : Math.max(0, Math.min(raw, totalQty))); return next; });
                          }}
                          className="h-8 w-24 text-sm text-right" />
                        <span className="text-[11px] text-gray-400">{it.unidade || "un"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rodapé: resumo visual da divisão + ações */}
            <div className="px-6 py-4 border-t border-gray-100 bg-white space-y-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-violet-500">Nova cotação</p>
                  <p className="text-sm font-bold text-violet-800">{itensSelCount} {itensSelCount === 1 ? "item" : "itens"}</p>
                  {totalSel > 0 && <p className="text-[11px] text-violet-500">{fmt(totalSel)}</p>}
                </div>
                <div className="flex items-center justify-center text-violet-400"><ArrowLeftRight className="h-4 w-4" /></div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Permanecem aqui</p>
                  <p className="text-sm font-bold text-gray-700">{restam} {restam === 1 ? "item" : "itens"}</p>
                  {restamTotal > 0 && <p className="text-[11px] text-gray-400">{fmt(restamTotal)}</p>}
                </div>
              </div>
              {!podeDividir && itensSelCount > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Deixe pelo menos 1 item (ou uma fração de quantidade) na cotação original.</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowDividirModal(false)} className="rounded-xl">Cancelar</Button>
                <Button disabled={!podeDividir || dividirCotacao.isPending} onClick={() => dividirCotacao.mutate({
                  cotacaoId: showDetalhe!,
                  itens: itensCot.filter(it => sel.has(it.id) && (sel.get(it.id) ?? 0) > 0).map(it => ({ id: it.id, quantidade: sel.get(it.id) ?? 0 })),
                  userId: user?.id ? parseInt(String(user.id)) : undefined, userName: user?.nome || user?.name || undefined
                })}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white gap-2 shadow-lg shadow-violet-600/20 disabled:shadow-none disabled:opacity-50">
                  {dividirCotacao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />} Mover para nova cotação
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
      {/* Rev. 4998 — o ConfirmDialog só era montado no return da LISTA; na visão
          fullscreen o confirm() ficava pendurado para sempre (clique em "Reverter
          Aprovação" não fazia nada). Renderiza também aqui. */}
      {ConfirmDialog}
      </DetalheWrapper>
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
          <Input placeholder="Buscar por número ou descrição..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {/* Filtro por obra */}
        <select
          className="h-9 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-900 outline-none focus:ring-1 focus:ring-blue-400"
          value={filtroObraId}
          onChange={e => setFiltroObraId(e.target.value)}
          onFocus={() => setObraFiltroAberto(true)}
          onMouseDown={() => setObraFiltroAberto(true)}
          title="Filtrar por obra"
        >
          <option value="">Todas as obras</option>
          {obrasList.map((o: any) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
        </select>
        {/* Rev. 4016 — Item 17: filtro por período de criação da cotação. */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="w-[150px] bg-white border-gray-300 text-gray-900 text-sm"
            value={filtroDataInicio}
            onChange={e => setFiltroDataInicio(e.target.value)}
            title="Criada a partir de"
          />
          <span className="text-gray-400 text-xs">até</span>
          <Input
            type="date"
            className="w-[150px] bg-white border-gray-300 text-gray-900 text-sm"
            value={filtroDataFim}
            onChange={e => setFiltroDataFim(e.target.value)}
            title="Criada até"
          />
          {(filtroDataInicio || filtroDataFim) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-gray-700 h-8 px-2"
              onClick={() => { setFiltroDataInicio(""); setFiltroDataFim(""); }}
              title="Limpar filtro de data"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Rev. 2296 — Pills coloridos por status com ícone + contador.
            Antes: botões neutros (azul=ativo / branco=inativo) sem dimensão visual.
            Agora: cada status traz sua cor própria (âmbar=pendente, verde=aprovada,
            azul=concluída, vermelho=recusada, cinza=expirada) + contador,
            facilitando o "raio-X" da carteira de cotações de relance. */}
        <div className="flex flex-wrap gap-2">
          {([
            { s: "todos",     label: "Todos",     Icon: Layers,        count: countTodos,                   accent: "border-slate-300 text-slate-700",       activeBg: "bg-slate-800 border-slate-800 text-white",      idleHoverBg: "hover:bg-slate-50",  dot: "bg-slate-400" },
            { s: "pendente",  label: "Pendente",  Icon: Clock,         count: countsPorStatus.pendente  ?? 0, accent: "border-amber-300 text-amber-800",        activeBg: "bg-amber-500 border-amber-500 text-white",       idleHoverBg: "hover:bg-amber-50",  dot: "bg-amber-500" },
            { s: "aprovada",  label: "Aprovada",  Icon: CheckCircle,   count: countsPorStatus.aprovada  ?? 0, accent: "border-emerald-300 text-emerald-800",   activeBg: "bg-emerald-600 border-emerald-600 text-white",   idleHoverBg: "hover:bg-emerald-50", dot: "bg-emerald-500" },
            { s: "concluida", label: "Concluída", Icon: ShieldCheck,   count: countsPorStatus.concluida ?? 0, accent: "border-blue-300 text-blue-800",          activeBg: "bg-blue-600 border-blue-600 text-white",         idleHoverBg: "hover:bg-blue-50",   dot: "bg-blue-500" },
            { s: "recusada",  label: "Recusada",  Icon: XCircle,       count: countsPorStatus.recusada  ?? 0, accent: "border-red-300 text-red-800",            activeBg: "bg-red-600 border-red-600 text-white",           idleHoverBg: "hover:bg-red-50",    dot: "bg-red-500" },
            { s: "expirada",  label: "Expirada",  Icon: AlertTriangle, count: countsPorStatus.expirada  ?? 0, accent: "border-gray-300 text-gray-600",          activeBg: "bg-gray-600 border-gray-600 text-white",         idleHoverBg: "hover:bg-gray-100",  dot: "bg-gray-400" },
            { s: "a_entregar", label: "A entregar", Icon: Truck,        count: countAEntregar,                  accent: "border-orange-300 text-orange-800",      activeBg: "bg-orange-600 border-orange-600 text-white",     idleHoverBg: "hover:bg-orange-50",  dot: "bg-orange-500" },
          ] as const).map(({ s, label, Icon, count, accent, activeBg, idleHoverBg, dot }) => {
            const active = filtroStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFiltroStatus(s)}
                title={`${label}: ${count} cotaç${count === 1 ? "ão" : "ões"}`}
                className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${active ? `${activeBg} shadow-sm` : `bg-white ${accent} ${idleHoverBg}`}`}
              >
                {active ? (
                  <Icon className="h-3.5 w-3.5" />
                ) : (
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                )}
                <span>{label}</span>
                <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums
                  ${active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700 group-hover:bg-white"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {/* Rev. 2298 — Segunda linha: filtros por TIPO (Material / MDO / Pacote / Equipamento).
            Pedido user (23/05/2026): "Coloca filtro para material, mão de obra,
            pacote e equipamentos.. todos os status para ver mais rápido as solicitações".
            Mesma pegada visual dos pills de status, mas com cores neutras
            por tipo (azul/roxo/indigo/ciano) — espelha cores já usadas
            nos badges das linhas (L6226). */}
        <div className="flex flex-wrap gap-2 w-full">
          {([
            { t: "todos",       label: "Todos os tipos", short: "Todos",       Icon: Package,    count: countTodosTipo,                    accent: "border-slate-300 text-slate-700",     activeBg: "bg-slate-800 border-slate-800 text-white",     idleHoverBg: "hover:bg-slate-50",  dot: "bg-slate-400" },
            { t: "material",    label: "Material",       short: "Material",    Icon: Package,    count: countsPorTipo.material    ?? 0, accent: "border-blue-300 text-blue-800",        activeBg: "bg-blue-600 border-blue-600 text-white",       idleHoverBg: "hover:bg-blue-50",   dot: "bg-blue-500" },
            { t: "servico",     label: "Mão de Obra",    short: "MDO",         Icon: HardHat,    count: countsPorTipo.servico     ?? 0, accent: "border-purple-300 text-purple-800",    activeBg: "bg-purple-600 border-purple-600 text-white",   idleHoverBg: "hover:bg-purple-50", dot: "bg-purple-500" },
            { t: "pacote",      label: "Pacote (MAT+MDO)", short: "Pacote",    Icon: Layers,     count: countsPorTipo.pacote      ?? 0, accent: "border-indigo-300 text-indigo-800",    activeBg: "bg-indigo-600 border-indigo-600 text-white",   idleHoverBg: "hover:bg-indigo-50", dot: "bg-indigo-500" },
            { t: "equipamento", label: "Equipamento",    short: "Equipamento", Icon: Warehouse,  count: countsPorTipo.equipamento ?? 0, accent: "border-cyan-300 text-cyan-800",        activeBg: "bg-cyan-600 border-cyan-600 text-white",       idleHoverBg: "hover:bg-cyan-50",   dot: "bg-cyan-500" },
          ] as const).map(({ t, label, short, Icon, count, accent, activeBg, idleHoverBg, dot }) => {
            const active = filtroTipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroTipo(t as any)}
                title={`${label}: ${count} cotaç${count === 1 ? "ão" : "ões"}`}
                className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${active ? `${activeBg} shadow-sm` : `bg-white ${accent} ${idleHoverBg}`}`}
              >
                {active ? (
                  <Icon className="h-3.5 w-3.5" />
                ) : (
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                )}
                <span>{short}</span>
                <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums
                  ${active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700 group-hover:bg-white"}`}>
                  {count}
                </span>
              </button>
            );
          })}
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

      {/* Rev. 5100 — toggle Meta × Melhor preço + resumo da página visível */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setMostrarMeta(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${mostrarMeta ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
        >
          <Scale className="h-3.5 w-3.5" />
          Meta × Melhor preço
        </button>
      </div>
      {mostrarMeta && (() => {
        // Rev. 5103 — os 3 cards usam o MESMO universo: cotações com meta E melhor
        // preço. Antes o "Melhor preço" somava TODAS as cotações (mesmo sem meta) e
        // a Meta só as com meta → números incomparáveis (parecia que "compramos 5 mi
        // com 3 mi de verba"). Agora: Saldo = disponível (meta) − comprado/cotado.
        const pares = filt.filter(c => ((c as any).metaTotal ?? 0) > 0 && ((c as any).melhorPreco ?? 0) > 0);
        const somaMeta = pares.reduce((a, c) => a + (c as any).metaTotal, 0);
        const somaMelhor = pares.reduce((a, c) => a + (c as any).melhorPreco, 0);
        const saldoPares = somaMeta - somaMelhor;
        const semMeta = filt.filter(c => !(((c as any).metaTotal ?? 0) > 0) && ((c as any).melhorPreco ?? 0) > 0).length;
        const fmtR$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Meta (verba disponível)</p>
              <p className="text-sm font-bold text-blue-800">{fmtR$(somaMeta)}</p>
              <p className="text-[9px] text-gray-500">{pares.length} cotação(ões) comparável(is)</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Comprado / cotado (melhor preço)</p>
              <p className="text-sm font-bold text-violet-800">{fmtR$(somaMelhor)}</p>
              <p className="text-[9px] text-gray-500">das mesmas {pares.length} cotação(ões)</p>
            </div>
            <div className={`rounded-xl border px-3 py-2 ${saldoPares >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wide ${saldoPares >= 0 ? "text-emerald-500" : "text-red-500"}`}>Saldo (disponível − comprado)</p>
              <p className={`text-sm font-bold ${saldoPares >= 0 ? "text-emerald-700" : "text-red-700"}`}>{saldoPares >= 0 ? "+" : ""}{fmtR$(saldoPares)}</p>
              <p className="text-[9px] text-gray-500">{saldoPares >= 0 ? "sobrou verba" : "estourou a verba"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Cotações no filtro</p>
              <p className="text-sm font-bold text-gray-800">{resumoTotal ?? "…"}</p>
              {semMeta > 0 && <p className="text-[9px] text-gray-500">{semMeta} nesta página sem meta confiável</p>}
            </div>
          </div>
        );
      })()}

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-10 px-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas" />
              </TableHead>
              {/* Rev. 2487 — Cabeçalhos ordenáveis (mesmo padrão da tela de SC). */}
              {([
                { k: "numeroCotacao", label: "Número" },
                { k: "descricao",     label: "Descrição / SC" },
                { k: "obra",          label: "Obra" },
                { k: "fornecedor",    label: "Fornecedor" },
                { k: "total",         label: "Total" },
                ...(mostrarMeta ? [
                  { k: "total", label: "Meta" },
                  { k: "total", label: "Melhor Preço" },
                  { k: "total", label: "Saldo" },
                ] : []),
                { k: "validade",      label: "Validade" },
                { k: "status",        label: "Status" },
              ] as { k: CotSortKey; label: string }[]).map(col => {
                const active = sortKey === col.k;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={`${col.k}_${col.label}`} className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.k)}
                      title={`Ordenar por ${col.label}${active ? (sortDir === "asc" ? " (crescente)" : " (decrescente)") : ""}`}
                      className={`inline-flex items-center gap-1 hover:text-blue-700 transition-colors ${active ? "text-blue-700" : ""}`}
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
              <TableRow><TableCell colSpan={mostrarMeta ? 12 : 9} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
            ) : q.isError ? (
              <TableRow>
                <TableCell colSpan={mostrarMeta ? 12 : 9} className="text-center py-10">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-red-700">Não foi possível carregar as cotações.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => q.refetch()} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={mostrarMeta ? 12 : 9} className="text-center py-10 text-gray-400">Nenhuma cotação encontrada</TableCell></TableRow>
            ) : filt.map(cot => {
              const st = STATUS_LABELS[cot.status] ?? STATUS_LABELS.pendente;
              // A própria página traz o nome leve para a tabela; catálogo completo só
              // é carregado quando alguma ação precisar dele.
              const fornNomeEnriq = (cot as any).fornecedorNome ?? (cot as any).fornecedorNomeFantasia ?? (cot as any).fornecedorRazaoSocial;
              const forn = fornecedores.find(f => f.id === cot.fornecedorId);
              const fornNomeExibir = fornNomeEnriq || forn?.nomeFantasia || forn?.razaoSocial || "—";
              return (
                <TableRow key={cot.id} className={`border-gray-100 cursor-pointer ${selectedIds.has(cot.id) ? "bg-blue-50/60" : "hover:bg-gray-50"}`} onClick={() => setShowDetalhe(cot.id)}>
                  <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(cot.id)} onCheckedChange={() => toggleSelect(cot.id)} aria-label={`Selecionar ${cot.numeroCotacao}`} />
                  </TableCell>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">{formatNumeroCotacaoDisplay(cot.numeroCotacao)}</TableCell>
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
                    {cot.solicitacaoId && (
                      (cot as any).numeroSc ? (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/compras/solicitacoes?destaque=${cot.solicitacaoId}`); }}
                          className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium inline-flex items-center gap-1 mt-0.5"
                          title="Abrir solicitação de compra"
                        >
                          <Link2 className="h-3 w-3" />{formatNumeroScDisplay((cot as any).numeroSc)}
                        </button>
                      ) : (
                        <div className="text-gray-400 text-xs">SC #{cot.solicitacaoId}</div>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    {(cot as any).obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {(cot as any).obraNome ?? nomeObra((cot as any).obraId) ?? `#${(cot as any).obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-600 text-sm">{fornNomeExibir}</TableCell>
                  <TableCell className="text-emerald-700 font-semibold text-sm">
                    {parseFloat(cot.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  {mostrarMeta && (() => {
                    const meta = (cot as any).metaTotal ?? 0;
                    const melhor = (cot as any).melhorPreco ?? 0;
                    const temPar = meta > 0 && melhor > 0;
                    const saldo = temPar ? meta - melhor : null;
                    return (
                      <>
                        <TableCell className="text-blue-700 font-semibold text-sm whitespace-nowrap">
                          {meta > 0 ? meta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-violet-700 font-semibold text-sm whitespace-nowrap">
                          {melhor > 0 ? melhor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {saldo != null ? (
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-bold ${saldo >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {saldo >= 0 ? "+" : ""}{saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          ) : <span className="text-gray-300 text-sm">—</span>}
                        </TableCell>
                      </>
                    );
                  })()}
                  <TableCell className="text-gray-500 text-sm">{cot.dataValidade ? new Date(cot.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      <TimelineBadge companyId={companyId} cotacaoId={cot.id} lazy />
                    </div>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!q.isLoading && !q.isError && listaBase.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <span>
              Mostrando {(pagina - 1) * 50 + 1}–{(pagina - 1) * 50 + listaBase.length}
              {resumoTotal != null ? ` de ${resumoTotal}` : ""}
              {q.isFetching && <span className="ml-2 inline-flex items-center gap-1 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Atualizando</span>}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={pagina <= 1 || q.isFetching} onClick={() => { setSelectedIds(new Set()); setPagina(p => Math.max(1, p - 1)); }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <span className="min-w-24 text-center tabular-nums">Página {pagina}{resumoTotal != null ? ` de ${totalPaginasCotacoes}` : ""}</span>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={pagina >= totalPaginasCotacoes || q.isFetching} onClick={() => { setSelectedIds(new Set()); setPagina(p => p + 1); }}>
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
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
                        {formatNumeroScDisplay(s.numeroSc)}{(s as any).titulo ? ` — ${(s as any).titulo}` : s.departamento ? ` — ${s.departamento}` : ""}
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
                            R$ {h.precoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — {h.fornecedorNome} ({formatNumeroOcDisplay(h.numeroOc)}, {new Date(h.data).toLocaleDateString("pt-BR")})
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
            <DialogTitle className="text-gray-900">{formatNumeroCotacaoDisplay(detalhe?.numeroCotacao)} — Detalhes</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (() => {
            const forn = fornecedores.find(f => f.id === detalhe.fornecedorId);
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            return (
              <div className="space-y-5 pt-2">
                {(detalhe as any)?.itens?.some((it: any) => it.semVerba) && (() => {
                  const avulsos = ((detalhe as any).itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba === "avulso");
                  const estouros = ((detalhe as any).itens as any[]).filter((it: any) => it.semVerba && it.motivoSemVerba !== "avulso");
                  return (
                    <div className="space-y-2">
                      {avulsos.length > 0 && (
                        <div className="flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 p-3 print:border-orange-500">
                          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-orange-800">⚠ FORA DO ORÇAMENTO — {avulsos.length} item(ns) avulso(s)</p>
                            <p className="text-xs text-orange-600">Itens sem vínculo orçamentário. Necessita verba realocada ou autorização para liberar OC/OS.</p>
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
                    </div>
                  );
                })()}
                {(detalhe as any).descricao && (
                  <div className="text-gray-700 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">{(detalhe as any).descricao}</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div><span className="text-gray-400 text-xs">Obra</span><p className="text-gray-900 font-medium flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" />{nomeObra((detalhe as any).obraId) ?? "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.cls}`}>{st.label}</span></p></div>
                  <div><span className="text-gray-400 text-xs">Fornecedor</span><p className="text-gray-900 font-medium">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Cond. Pagamento</span><p className="text-gray-900 font-medium">{(() => { const info = getTipoPagamentoInfo((detalhe as any).tipoPagamento); return info ? info.label : detalhe.condicaoPagamento || "—"; })()}</p></div>
                  {/* Rev. 2074 — Esconde Prazo Entrega quando MDO puro (não há entrega física) */}
                  {(detalhe as any).tipo !== "servico" && (
                    <div><span className="text-gray-400 text-xs">{(() => { const tp = (detalhe as any).tipoPagamento ?? ""; const cp = detalhe.condicaoPagamento ?? ""; const t = (detalhe as any).tipo; return (t === "pacote" && (tp === "medicao" || cp.toLowerCase().includes("medição"))) ? "Mobilização" : "Prazo Entrega"; })()}</span><p className="text-gray-900 font-medium">{detalhe.prazoEntregaDias ? `${detalhe.prazoEntregaDias} dias` : "—"}</p></div>
                  )}
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
                        <TableRow key={it.id} className={`border-gray-100 ${it.semVerba ? (it.motivoSemVerba === "avulso" ? "bg-orange-50 print:bg-orange-50" : "bg-red-50 print:bg-red-50") : ""}`}>
                          <TableCell className="text-gray-900 text-sm">
                            {it.descricao}
                            {it.semVerba && (it.motivoSemVerba === "avulso"
                              ? <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 print:border-orange-400">FORA DO ORÇAMENTO</span>
                              : <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 print:border-red-400">PREJUÍZO</span>
                            )}
                            {(it as any).somenteMo && (
                              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 print:border-blue-400">SOMENTE MO</span>
                            )}
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
                          // Rev. 5053 (code review): este atalho pulava o wizard
                          // Preparar Contrato (proposta, matriz, anexos, prévia).
                          // Agora abre o MESMO fluxo do botão principal.
                          if (!validarCondicoesVencedor()) return;
                          setTituloDraft(contratoTitulo || "Contrato de Prestação de Serviços");
                          setTituloPromptOpen(true);
                        }}
                          disabled={gerarContrato.isPending}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1">
                          {gerarContrato.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                          Visualizar e Aprovar Contrato
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
                      <Button size="sm" onClick={() => handleAprovarGerarOC(detalhe.id)} disabled={gerarOC.isPending || gerarOCsParciais.isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1">
                        <CheckCircle className="h-3 w-3" /> Aprovar e Gerar OC
                        {Object.keys(vencedorPorItem).length > 0 && (
                          <span className="ml-1 px-1 py-0 rounded-full text-[9px] font-bold bg-white text-emerald-700">
                            {Object.keys(vencedorPorItem).length} pin
                          </span>
                        )}
                      </Button>
                      {(mapa?.participantes ?? []).length >= 2 && (
                        <Button size="sm" variant="outline" onClick={() => handleAbrirCotacaoParcial(detalhe.id)} disabled={gerarOC.isPending || gerarOCsParciais.isPending}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs gap-1">
                          <GitBranch className="h-3 w-3" /> Cotação Parcial
                        </Button>
                      )}
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
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (await confirm({
                        title: "Reabrir cotação?",
                        description: "O status voltará para 'Pendente' e será possível aprová-la novamente.",
                        tone: "info",
                        confirmText: "Reabrir",
                      })) {
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
                  {sp.tipoOrigem === "equipamento" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-white rounded border border-gray-100">
                        <p className="text-[10px] text-gray-400 uppercase">Total Locação</p>
                        <p className="text-sm font-bold text-gray-800">{fmt(sp.totalGeral)}</p>
                      </div>
                      <div className="text-center p-2 bg-orange-50 rounded border border-orange-200">
                        <p className="text-[10px] text-orange-500 uppercase font-medium">100% Locação</p>
                        <p className="text-sm font-bold text-orange-700">{fmt(sp.totalGeral)}</p>
                        <p className="text-[10px] text-orange-400">vai ao fornecedor</p>
                      </div>
                    </div>
                  ) : (
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
                  )}
                  {sp.tipoOrigem && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Tipo SC: <span className="font-semibold">{sp.tipoOrigem === "material" ? "Material" : sp.tipoOrigem === "servico" ? "Serviço/MDO" : sp.tipoOrigem === "pacote" ? "Pacote (Mat+MDO)" : sp.tipoOrigem === "equipamento" ? "Equipamento (Locação)" : sp.tipoOrigem}</span>
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
                {saldoFdQ.data && (
                  <div className={`rounded-lg border p-3 ${saldoFdQ.data.totalFdOrcado <= 0 ? "bg-amber-50 border-amber-200" : saldoFdQ.data.saldoFd > 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Saldo de FD da Obra</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">FD Orçado</p>
                        <p className="text-sm font-bold text-gray-800">{fmt(saldoFdQ.data.totalFdOrcado)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Comprometido</p>
                        <p className="text-sm font-bold text-amber-600">{fmt(saldoFdQ.data.totalFdComprometido)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase">Saldo</p>
                        <p className={`text-sm font-bold ${saldoFdQ.data.saldoFd > 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(saldoFdQ.data.saldoFd)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-center">
                      {saldoFdQ.data.totalFdOrcado <= 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem orçamento FD para esta obra</span>
                      ) : saldoFdQ.data.saldoFd > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Saldo disponível</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sem saldo — pode bloquear aprovação</span>
                      )}
                    </div>
                  </div>
                )}
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
                      <div className="flex items-baseline justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">
                          Valor do FD (R$) <span className="text-blue-500 font-normal">— máximo {sp.tipoOrigem === "equipamento" ? "Locação" : "MAT"}: {fmt(sp.tipoOrigem === "equipamento" ? sp.totalGeral : sp.totalMat)}</span>
                        </label>
                        <button
                          type="button"
                          className="text-[10px] text-amber-600 hover:text-amber-800 underline font-medium whitespace-nowrap ml-2"
                          onClick={() => setFdCotForm(p => ({ ...p, valor: (sp.tipoOrigem === "equipamento" ? sp.totalGeral : sp.totalMat).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))}
                        >
                          Usar todo o valor
                        </button>
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={fdCotForm.valor}
                        onChange={(e) => setFdCotForm(p => ({ ...p, valor: e.target.value }))}
                        placeholder="0,00"
                        className={`bg-white border-gray-300 ${excedeMat ? "border-red-400 ring-1 ring-red-300" : ""}`}
                      />
                      {fdCotForm.valor && (() => {
                        return fdVal > 0 ? (
                          <p className={`text-xs mt-1 font-medium ${excedeMat ? "text-red-600" : "text-emerald-600"}`}>
                            {fmt(fdVal)}
                            {excedeMat && (sp.tipoOrigem === "equipamento" ? " — Excede o valor de locação!" : " — Excede o valor de material!")}
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

      {/* Rev. 2467 — Modal "Selecionar do Estoque" foi MOVIDO pra
          dentro do bloco fullscreen (`if (showDetalhe !== null)`),
          logo acima do </DashboardLayout> da tela de detalhe.
          Antes vivia aqui no return principal, mas o early-return do
          bloco fullscreen impedia que este JSX renderizasse quando
          o user estava em uma cotação — por isso o botão "Atender
          pelo Estoque" parecia não fazer nada (state setado, mas
          Dialog desmontado). */}

      {aprovacaoProgress !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 space-y-6">
            <h3 className="text-lg font-bold text-gray-900 text-center">Processando aprovação...</h3>
            <div className="flex items-center gap-0 w-full py-4">
              {[
                { label: "Aprovando Cotação", icon: <FileSearch className="h-5 w-5" /> },
                { label: "Gerando OS", icon: <ShoppingCart className="h-5 w-5" /> },
                { label: "Criando Contrato de Prestador de Serviço", icon: <FileText className="h-5 w-5" /> },
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

      {editFornId && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ pointerEvents: "auto" }}>
          <div className="absolute inset-0 bg-black/50" onPointerDown={() => setEditFornId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onPointerDown={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Editar Fornecedor</h2>
                <p className="text-xs text-gray-500">Editando fornecedor #{editFornId}</p>
              </div>
              <button onPointerDown={() => setEditFornId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">CNPJ</Label>
                  <Input value={editFornForm.cnpj} onChange={e => setEditFornForm(p => ({ ...p, cnpj: e.target.value }))} className="mt-0.5 h-9 text-sm font-mono" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Razão Social *</Label>
                  <Input value={editFornForm.razaoSocial} onChange={e => setEditFornForm(p => ({ ...p, razaoSocial: e.target.value }))} className="mt-0.5 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Nome Fantasia</Label>
                  <Input value={editFornForm.nomeFantasia} onChange={e => setEditFornForm(p => ({ ...p, nomeFantasia: e.target.value }))} className="mt-0.5 h-9 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Endereço</p>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-8">
                      <Label className="text-[11px] text-gray-500">Logradouro</Label>
                      <Input value={editFornForm.endereco} onChange={e => setEditFornForm(p => ({ ...p, endereco: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[11px] text-gray-500">Nº</Label>
                      <Input value={editFornForm.numero} onChange={e => setEditFornForm(p => ({ ...p, numero: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[11px] text-gray-500">CEP</Label>
                      <Input value={editFornForm.cep} onChange={e => setEditFornForm(p => ({ ...p, cep: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <Label className="text-[11px] text-gray-500">Complemento</Label>
                      <Input value={editFornForm.complemento} onChange={e => setEditFornForm(p => ({ ...p, complemento: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[11px] text-gray-500">Bairro</Label>
                      <Input value={editFornForm.bairro} onChange={e => setEditFornForm(p => ({ ...p, bairro: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[11px] text-gray-500">Cidade</Label>
                      <Input value={editFornForm.cidade} onChange={e => setEditFornForm(p => ({ ...p, cidade: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[11px] text-gray-500">UF</Label>
                      <Input value={editFornForm.estado} onChange={e => setEditFornForm(p => ({ ...p, estado: e.target.value.toUpperCase().slice(0,2) }))} className="mt-0.5 h-8 text-sm" maxLength={2} />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-amber-600 uppercase flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Dados Bancários</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-500">Banco</Label>
                      <Input value={editFornForm.banco} onChange={e => setEditFornForm(p => ({ ...p, banco: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Ex: Bradesco" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">Agência</Label>
                      <Input value={editFornForm.agencia} onChange={e => setEditFornForm(p => ({ ...p, agencia: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">Conta</Label>
                      <Input value={editFornForm.conta} onChange={e => setEditFornForm(p => ({ ...p, conta: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] text-gray-500">Chave PIX</Label>
                    <Input value={editFornForm.pix} onChange={e => setEditFornForm(p => ({ ...p, pix: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="CPF, CNPJ, e-mail, telefone ou chave" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-emerald-600 uppercase flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Contato da Empresa</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-500">Telefone</Label>
                      <Input value={editFornForm.telefone} onChange={e => setEditFornForm(p => ({ ...p, telefone: maskFornPhone(e.target.value) }))} className="mt-0.5 h-8 text-sm" placeholder="(00) 0000-0000" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">E-mail</Label>
                      <Input value={editFornForm.email} onChange={e => setEditFornForm(p => ({ ...p, email: e.target.value }))} className="mt-0.5 h-8 text-sm" type="email" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-teal-600 uppercase flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Contato Comercial</p>
                  <div>
                    <Label className="text-[11px] text-gray-500">Nome do Contato</Label>
                    <Input value={editFornForm.contatoNome} onChange={e => setEditFornForm(p => ({ ...p, contatoNome: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-500">Celular</Label>
                      <Input value={editFornForm.contatoCelular} onChange={e => setEditFornForm(p => ({ ...p, contatoCelular: maskFornPhone(e.target.value) }))} className="mt-0.5 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">E-mail</Label>
                      <Input value={editFornForm.contatoEmail} onChange={e => setEditFornForm(p => ({ ...p, contatoEmail: e.target.value }))} className="mt-0.5 h-8 text-sm" type="email" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <Label className="text-xs text-gray-500">Observações</Label>
                <Textarea value={editFornForm.observacoes} onChange={e => setEditFornForm(p => ({ ...p, observacoes: e.target.value }))} className="mt-1 text-sm resize-none" rows={2} />
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-3 flex justify-between rounded-b-2xl">
              <p className="text-xs text-gray-400 self-center">Campos com * são obrigatórios</p>
              <div className="flex gap-3">
                <Button variant="outline" onPointerDown={() => setEditFornId(null)}>Cancelar</Button>
                <Button
                  disabled={!editFornForm.razaoSocial || editFornMut.isPending}
                  onPointerDown={() => {
                    editFornMut.mutate({
                      id: editFornId!,
                      ...editFornForm,
                      telefone: editFornForm.telefone.replace(/\D/g, ""),
                      contatoCelular: editFornForm.contatoCelular.replace(/\D/g, ""),
                      cnpj: editFornForm.cnpj.replace(/\D/g, ""),
                    });
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {editFornMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}


    </div>
    {ConfirmDialog}
    </DashboardLayout>
  );
}
