import DashboardLayout from "@/components/DashboardLayout";
import HEAprovadaSemPontoAlert from "@/components/HEAprovadaSemPontoAlert";
import FolhaAprovacoesRh from "./FolhaAprovacoesRh";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/formatBRL";
import {
  Upload, CalendarDays, DollarSign, CreditCard, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, FileText, Users, Lock, Unlock, Search,
  Eye, Trash2, RefreshCw, ArrowLeft, XCircle, Info, Building2,
  FileSpreadsheet, AlertCircle, ShieldCheck, Clock, TrendingUp, TrendingDown,
  Filter, Briefcase, BarChart3, ChevronDown, ChevronUp, Lightbulb, Wrench, ArrowRight, MapPin, Scale,
  HardHat, Ban, User, CheckCircle2, Calculator, Zap, Moon, FileCheck, Wallet, Pencil, Save, X, FileDown, PenLine, ClipboardCheck, FileBarChart, ExternalLink, ZoomIn, Loader2, Printer, RotateCcw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtNum } from "@/lib/formatters";
import AlertaDivergenciaFolha from "@/components/AlertaDivergenciaFolha";

function maskTimeValue(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2, 4);
}
function normalizeTimeOnBlur(val: string): string {
  if (!val) return '';
  const parts = val.split(':');
  const h = Math.min(23, parseInt(parts[0] || '0', 10));
  const m = Math.min(59, parseInt(parts[1] || '0', 10));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtDateBR = (d: string | null | undefined) => { if (!d) return '-'; const s = String(d).slice(0,10); const [y,m,dd] = s.split('-'); return `${dd}/${m}/${y}`; };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

// formatBRL imported from @/lib/formatBRL

function parseBRLNum(val: string | number | null | undefined): number {
  if (!val && val !== 0) return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace(/[R$\s]/g, "").trim();
  if (!str) return 0;
  if (str.includes(",")) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(str) || 0;
}

type ViewMode = "resumo" | "detalhes" | "custos_obra" | "horas_extras" | "verificacao" | "descontos_clt" | "cruzamento_he" | "consolidado" | "comparativo_completo" | "descontos_epi" | "calculo_vale" | "calculo_pagamento" | "alertas_afericao" | "he_modulo" | "auditoria_folha" | "aprovacoes_rh";

type CampoDesconto = 'vale' | 'inss' | 'ir' | 'faltas' | 'atrasos' | 'sindicato' | 'pensao' | 'vt' | 'convenio' | 'epi' | 'outros';

const CAMPO_LABELS: Record<CampoDesconto, string> = {
  vale: 'Vale (Adiantamento)', inss: 'INSS', ir: 'IRRF',
  faltas: 'Faltas', atrasos: 'Atrasos',
  sindicato: 'Contribuição Sindical', pensao: 'Pensão Alimentícia',
  vt: 'Vale-Transporte (VT)', convenio: 'Convênio', epi: 'EPIs',
  outros: 'Outros (VA / Seguro Vida / Acerto Escuro)',
};

// Rev. 3302 — Dialog de Arredondamento (lote/individual, cima/baixo/mais próximo) do
// líquido p/ real cheio. Reusável na Folha de Vale e na Folha de Pagamento.
function ArredondamentoDialog({
  open, onOpenChange, origem, funcionarios, isPending, onAplicar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  origem: 'vale' | 'folha';
  funcionarios: any[];
  isPending: boolean;
  onAplicar: (modo: 'cima' | 'baixo' | 'normal', employeeIds?: number[]) => void;
}) {
  const [aba, setAba] = useState<'lote' | 'individual'>('lote');
  const [busca, setBusca] = useState('');
  const [loteModo, setLoteModo] = useState<'cima' | 'baixo' | 'normal' | null>(null);

  const exatoDe = (f: any) => origem === 'vale'
    ? Number(f.valorLiquidoExato ?? f.valorLiquido ?? f.valorTotalVale ?? 0)
    : Number(f.salarioLiquidoExato ?? f.salarioLiquido ?? 0);
  const atualDe = (f: any) => origem === 'vale'
    ? Number(f.valorLiquido ?? f.valorTotalVale ?? 0)
    : Number(f.salarioLiquido ?? 0);

  const elegiveis = (funcionarios || []).filter((f: any) => origem === 'vale' ? f.status !== 'rejeitado' : true);
  const lista = useMemo(() => elegiveis
    .filter((f: any) => !busca || (f.nome || '').toUpperCase().includes(busca.toUpperCase()))
    .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    [funcionarios, origem, busca]);
  const totalAlvo = elegiveis.length;

  const dirLabel = (m: string) => m === 'cima' ? 'Para cima ↑' : m === 'baixo' ? 'Para baixo ↓' : 'Mais próximo';
  const dirSym = (m: string) => m === 'cima' ? '↑' : m === 'baixo' ? '↓' : '≈';
  const previewLote = (m: 'cima' | 'baixo' | 'normal') => {
    const fn = m === 'cima' ? Math.ceil : m === 'baixo' ? Math.floor : Math.round;
    return elegiveis.reduce((s: number, f: any) => s + Math.max(0, fn(exatoDe(f))), 0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoteModo(null); setBusca(''); } onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#1B2A4A]" />
            Arredondamento — {origem === 'vale' ? 'Folha de Vale' : 'Folha de Pagamento'}
          </DialogTitle>
          <DialogDescription>
            Arredonda o <b>líquido</b> para o real cheio (sem centavos). O valor forçado vira o <b>valor final pago</b> — não joga a sobra de centavos pro mês seguinte.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${aba === 'lote' ? 'bg-white shadow text-[#1B2A4A]' : 'text-slate-500'}`} onClick={() => setAba('lote')}>Em lote (todos)</button>
          <button className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${aba === 'individual' ? 'bg-white shadow text-[#1B2A4A]' : 'text-slate-500'}`} onClick={() => setAba('individual')}>Individual</button>
        </div>

        {aba === 'lote' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Aplica a <b>{totalAlvo}</b> funcionário(s). Escolha a direção:</p>
            <div className="grid grid-cols-3 gap-2">
              {(['cima', 'normal', 'baixo'] as const).map(m => (
                <button key={m} onClick={() => setLoteModo(m)}
                  className={`border rounded-lg p-3 text-center transition ${loteModo === m ? 'border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 bg-[#1B2A4A]/5' : 'hover:border-slate-400'}`}>
                  <div className="text-lg font-bold">{dirSym(m)}</div>
                  <div className="text-xs font-semibold">{dirLabel(m)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Total: {formatBRL(previewLote(m))}</div>
                </button>
              ))}
            </div>
            {loteModo && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                <span className="text-sm text-amber-800">Confirmar arredondar <b>{totalAlvo}</b> {dirLabel(loteModo).toLowerCase()}?</span>
                <Button size="sm" disabled={isPending} onClick={() => onAplicar(loteModo)} className="bg-[#1B2A4A] hover:bg-[#22315a]">
                  {isPending ? 'Aplicando...' : 'Confirmar'}
                </Button>
              </div>
            )}
          </div>
        )}

        {aba === 'individual' && (
          <div className="space-y-2">
            <Input placeholder="Buscar funcionário..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8" />
            <div className="max-h-[50vh] overflow-y-auto border rounded-lg divide-y">
              {lista.length === 0 && <p className="text-sm text-muted-foreground p-3 text-center">Nenhum funcionário.</p>}
              {lista.map((f: any) => {
                const exato = exatoDe(f); const atual = atualDe(f);
                return (
                  <div key={f.employeeId} className="flex items-center gap-2 p-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{f.nome}</div>
                      <div className="text-[11px] text-muted-foreground">Exato {formatBRL(exato)} • Atual {formatBRL(atual)}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button title={`Para cima (${formatBRL(Math.max(0, Math.ceil(exato)))})`} disabled={isPending}
                        className="h-7 w-7 rounded border hover:bg-green-50 text-green-700 font-bold disabled:opacity-40"
                        onClick={() => onAplicar('cima', [f.employeeId])}>↑</button>
                      <button title={`Mais próximo (${formatBRL(Math.max(0, Math.round(exato)))})`} disabled={isPending}
                        className="h-7 w-7 rounded border hover:bg-slate-50 text-slate-600 font-bold disabled:opacity-40"
                        onClick={() => onAplicar('normal', [f.employeeId])}>≈</button>
                      <button title={`Para baixo (${formatBRL(Math.max(0, Math.floor(exato)))})`} disabled={isPending}
                        className="h-7 w-7 rounded border hover:bg-amber-50 text-amber-700 font-bold disabled:opacity-40"
                        onClick={() => onAplicar('baixo', [f.employeeId])}>↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemorialCalculo({ campo, f }: { campo: CampoDesconto; f: any }) {
  const m = f.memorialCalculo || {};
  const fmt = (n: number) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const calc = f.calculadoOriginal || {};
  if (campo === 'vale') {
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — Vale</div>
      <div>Adiantamento (vale) referente ao mês: <b>{fmt(calc.vale)}</b></div>
      <div className="text-[10px] text-muted-foreground">Origem: cálculo de vale (50% do líquido projetado, descontados VR/VT por dia útil até a data do vale).</div>
    </div>);
  }
  if (campo === 'inss') {
    const sal = Number(f.salarioBruto || 0);
    const perc = Number(m.inssPercentual || 0);
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — INSS</div>
      <div>Salário bruto: <b>{fmt(sal)}</b></div>
      <div>Alíquota cadastrada: <b>{perc.toFixed(2)}%</b></div>
      <div>{fmt(sal)} × {perc.toFixed(2)}% = <b>{fmt(calc.inss)}</b></div>
      <div className="text-[10px] text-muted-foreground">Para INSS escalonado por faixa, ajuste o percentual no cadastro do funcionário.</div>
    </div>);
  }
  if (campo === 'vt') {
    const vtBase = (Number(m.vtDiario) || 0) * (Number(m.diasUteis) || 0);
    const vtFaltasMes = Number(m.descontoVtFaltasMes) || 0;
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — VT</div>
      <div>VT diário: <b>{fmt(m.vtDiario)}</b></div>
      <div>Dias úteis: <b>{m.diasUteis}</b></div>
      <div>{fmt(m.vtDiario)} × {m.diasUteis} = <b>{fmt(vtBase)}</b></div>
      {vtFaltasMes > 0 && (
        <div className="pl-2 font-mono text-[11px] text-red-700">+ VT desconto por falta: <b>{fmt(vtFaltasMes)}</b></div>
      )}
      <div className="border-t pt-1 mt-1 font-bold text-blue-900">Total VT: {fmt(calc.vt)}</div>
    </div>);
  }
  if (campo === 'va') {
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — VA</div>
      <div>Lançamento de VA do mês: <b>{fmt(m.vaLancamento)}</b></div>
      <div>Total descontado em folha: <b>{fmt(calc.va)}</b></div>
      <div className="text-[10px] text-muted-foreground">VA é benefício; o desconto em folha é configurável por critério da empresa.</div>
    </div>);
  }
  if (campo === 'faltas') {
    const vh = Number(m.valorHora) || 0;
    const cargaH = Number(m.cargaHorariaDiaria) || 0;
    const salBaseRef = Number(m.salarioBaseRef) || 0;
    const valorDia = Number(m.valorDiaFalta) || (salBaseRef > 0 ? salBaseRef / 30 : vh * (220 / 30));
    const escFaltasQtd = Number(m.escFaltasQtd) || 0;
    const escVrUnit = escFaltasQtd > 0 ? (Number(m.descontoVrFaltasEscuro) || 0) / escFaltasQtd : 0;
    const escVtUnit = escFaltasQtd > 0 ? (Number(m.descontoVtFaltasEscuro) || 0) / escFaltasQtd : 0;
    const vrDiarioMes = m.faltasQtdMes > 0 ? (Number(m.descontoVrFaltasMes) || 0) / m.faltasQtdMes : 0;
    const vtDiarioMes = m.faltasQtdMes > 0 ? (Number(m.descontoVtFaltasMes) || 0) / m.faltasQtdMes : 0;
    const usaBanco = !!m.usaBancoHorasAtrasoFalta;
    return (<div className="text-xs space-y-1 max-h-[70vh] overflow-y-auto">
      <div className="font-semibold text-gray-700">Memorial de cálculo — Faltas / Atrasos</div>
      <div className="bg-gray-50 rounded px-2 py-1 text-[11px]">
        <div>Valor-hora: <b>{fmt(vh)}</b> · Carga diária: <b>{cargaH}h</b> · Salário base: <b>{fmt(salBaseRef)}</b></div>
        <div>Valor-dia (base falta) <span className="text-amber-700">— Súmula 431 TST / CLT Art. 64</span>:</div>
        {salBaseRef > 0 ? (
          <div className="font-mono">{fmt(salBaseRef)} ÷ 30 = <b>{fmt(valorDia)}</b></div>
        ) : (
          <div className="font-mono">{fmt(vh)} × (220 ÷ 30) = {fmt(vh)} × 7,3333 = <b>{fmt(valorDia)}</b></div>
        )}
      </div>

      {usaBanco && (
        <div className="border-t pt-1 mt-1 bg-indigo-50 border border-indigo-200 rounded px-2 py-1">
          <div className="font-semibold text-indigo-800">Banco de Horas ativo para este funcionário</div>
          <div className="text-[11px] text-indigo-700">
            Falta/atraso NÃO gera desconto em dinheiro — foi lançado como <b>débito de {m.minutosDebitoBancoHoras || 0} min</b> no saldo do Banco de Horas.
            O valor abaixo é só referência (o que seria descontado sem o banco de horas).
          </div>
        </div>
      )}

      <div className="border-t pt-1 mt-1">
        <div className="font-semibold text-gray-700">Faltas no mês corrente</div>
        <div className="pl-2">Qtd: <b>{m.faltasQtdMes}</b> dia(s)</div>
        {Array.isArray(m.faltasMesDias) && m.faltasMesDias.length > 0 && (
          <div className="pl-2 text-[10px] text-muted-foreground">Dias: {m.faltasMesDias.join(', ')}</div>
        )}
        <div className={`pl-2 font-mono text-[11px] ${usaBanco ? 'text-muted-foreground line-through' : ''}`}>
          {m.faltasQtdMes} × {fmt(valorDia)} = <b>{fmt(m.descontoFaltasMes)}</b>
          {usaBanco && <span className="text-[10px] ml-1 italic no-underline">(revertido p/ banco de horas)</span>}
        </div>
        {m.descontoVrFaltasMes > 0 && (
          <div className="pl-2 font-mono text-[11px] text-muted-foreground italic">
            (referência) VR: {m.faltasQtdMes} × {fmt(vrDiarioMes)} = {fmt(m.descontoVrFaltasMes)} — não descontado na folha, ver Vale Alimentação
          </div>
        )}
        {m.descontoVtFaltasMes > 0 && (
          <div className="pl-2 font-mono text-[11px] text-muted-foreground italic">
            VT: {m.faltasQtdMes} × {fmt(vtDiarioMes)} = {fmt(m.descontoVtFaltasMes)} — descontado na coluna VT
          </div>
        )}
        <div className="pl-2 font-semibold">Atrasos: <b>{m.atrasosMinutos}</b> min</div>
        {Array.isArray(m.atrasosMesDias) && m.atrasosMesDias.length > 0 && (
          <div className="pl-2 text-[10px] text-muted-foreground">Dias: {m.atrasosMesDias.join(', ')}</div>
        )}
        <div className={`pl-2 font-mono text-[11px] ${usaBanco ? 'text-muted-foreground line-through' : ''}`}>
          ({m.atrasosMinutos} ÷ 60) × {fmt(vh)} = <b>{fmt(m.descontoAtrasosMinutos)}</b>
          {usaBanco && <span className="text-[10px] ml-1 italic no-underline">(revertido p/ banco de horas)</span>}
        </div>
      </div>

      {Number(m.dsrFaltaValor) > 0 && (
        <div className="border-t pt-1 mt-1">
          <div className="font-semibold text-purple-700">DSR Falta — Lei 605/49 Art. 6º</div>
          <div className={`pl-2 font-mono text-[11px] ${m.dsrFaltaAplicado ? '' : 'text-muted-foreground line-through'}`}>
            <b>{m.dsrFaltaQtd}</b> dia(s) × valor-DSR = <b>{fmt(m.dsrFaltaValor)}</b>
            {!m.dsrFaltaAplicado && <span className="text-[10px] ml-1 italic">(desativado pelo RH)</span>}
          </div>
        </div>
      )}

      {(m.escFaltasQtd > 0 || m.descontoFaltasEscuro > 0 || m.descontoAtrasosEscuro > 0) && (
        <div className="border-t pt-1 mt-1">
          <div className="font-semibold text-amber-700">Aferição do Escuro (retroativo)</div>
          {m.escFaltasQtd > 0 && (
            <>
              <div className="pl-2">Faltas: <b>{m.escFaltasQtd}</b> dia(s)</div>
              {Array.isArray(m.escFaltasDias) && m.escFaltasDias.length > 0 && (
                <div className="pl-2 text-[10px] text-muted-foreground">Dias: {m.escFaltasDias.join(', ')}</div>
              )}
              <div className="pl-2 font-mono text-[11px]">{m.escFaltasQtd} × {fmt(valorDia)} = <b>{fmt(m.descontoFaltasEscuro)}</b></div>
            </>
          )}
          {m.descontoVrFaltasEscuro > 0 && (
            <div className="pl-2 font-mono text-[11px] text-muted-foreground italic">
              (referência) VR retroativo: {m.escFaltasQtd} × {fmt(escVrUnit)} = {fmt(m.descontoVrFaltasEscuro)} — não descontado na folha, ver Vale Alimentação
            </div>
          )}
          {m.descontoVtFaltasEscuro > 0 && (
            <div className="pl-2 font-mono text-[11px] text-muted-foreground italic">
              VT retroativo: {m.escFaltasQtd} × {fmt(escVtUnit)} = {fmt(m.descontoVtFaltasEscuro)} — descontado na coluna VT
            </div>
          )}
          {m.descontoAtrasosEscuro > 0 && (
            <>
              <div className="pl-2">Atrasos retroativos: <b>{fmt(m.descontoAtrasosEscuro)}</b></div>
              {Array.isArray(m.escAtrasosDias) && m.escAtrasosDias.length > 0 && (
                <div className="pl-2 text-[10px] text-muted-foreground">Dias: {m.escAtrasosDias.join(', ')}</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="border-t pt-1 mt-1 bg-blue-50 rounded px-2 py-1">
        <div className="font-mono text-[11px] text-gray-700">
          {usaBanco ? `${fmt(0)} (banco de horas)` : fmt(m.descontoFaltasMes)} + {usaBanco ? `${fmt(0)} (banco de horas)` : fmt(m.descontoAtrasosMinutos)}
          {Number(m.dsrFaltaValor) > 0 && m.dsrFaltaAplicado && ` + ${fmt(m.dsrFaltaValor)}`}
          {' + '}{fmt(m.descontoFaltasEscuro)} + {fmt(m.descontoAtrasosEscuro)}
        </div>
        <div className="font-bold text-blue-900">Total Faltas: {fmt(calc.faltas)}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          (Sem VR/VA — calculado à parte no Vale Alimentação. VT de falta entra na coluna VT.)
        </div>
        {usaBanco && (
          <div className="text-[10px] text-indigo-700 mt-0.5">
            (Falta/atraso do mês corrente não entram aqui — {m.minutosDebitoBancoHoras || 0} min foram debitados no Banco de Horas)
          </div>
        )}
      </div>
    </div>);
  }
  if (campo === 'outros') {
    const det: any[] = m.acertoEscuroDetalhes || [];
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — Outros</div>
      {Number(m.descontoPensao) > 0 && (
        <div>Pensão alimentícia ({m.pensaoTipo === 'percentual' ? `${m.pensaoPercentual}%` : 'fixo'}): <b>{fmt(m.descontoPensao)}</b></div>
      )}
      {Number(m.seguroVidaValor) > 0 && <div>Seguro de vida: <b>{fmt(m.seguroVidaValor)}</b></div>}
      {Number(m.acertoEscuroValor) > 0 && (
        <div>Acerto do Escuro (outros tipos): <b>{fmt(m.acertoEscuroValor)}</b>
          {det.length > 0 && (
            <ul className="pl-3 text-[10px] text-muted-foreground list-disc list-inside">
              {det.filter((d: any) => d.tipo !== 'falta' && d.tipo !== 'atraso').map((d: any, i: number) => (
                <li key={i}>{d.data} — {d.tipo}: {fmt(Number(d.valor))} {d.descricao ? `(${d.descricao})` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="border-t pt-1 mt-1 font-semibold">Total Outros: {fmt(calc.outros)}</div>
    </div>);
  }
  if (campo === 'convenio') {
    return (<div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">Memorial de cálculo — Convênio</div>
      <div>Lançamento de convênio do mês: <b>{fmt(calc.convenio)}</b></div>
      <div className="text-[10px] text-muted-foreground">Origem: módulo de Convênio (lançamentos importados/cadastrados para o mês).</div>
    </div>);
  }
  return null;
}

function DescontoCell({
  f, campo, valor, onSave, isLoading, baseClassName,
}: {
  f: any; campo: CampoDesconto; valor: number;
  onSave: (campo: CampoDesconto, valorNovo: number | null, motivo?: string) => void;
  isLoading: boolean; baseClassName: string;
}) {
  const manuais = f.descontosManuais || {};
  const historico = f.descontosManuaisHistorico || {};
  const isOverride = manuais[campo] != null;
  const hist = historico[campo];

  const [open, setOpen] = useState(false);
  const [editValor, setEditValor] = useState<string>(valor.toFixed(2).replace('.', ','));
  const [motivo, setMotivo] = useState<string>('');

  useEffect(() => {
    if (open) {
      setEditValor(valor.toFixed(2).replace('.', ','));
      setMotivo(hist?.motivo || '');
    }
  }, [open, valor, hist]);

  const fmtBR = (n: number) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const handleSave = () => {
    const num = parseFloat(editValor.replace(/\./g, '').replace(',', '.'));
    if (isNaN(num) || num < 0) { toast.error("Valor inválido"); return; }
    onSave(campo, num, motivo.trim() || undefined);
    setOpen(false);
  };
  const handleRevert = () => { onSave(campo, null); setOpen(false); };

  const overrideClass = isOverride ? 'bg-orange-100 hover:bg-orange-200 font-semibold' : 'hover:bg-blue-50/60';
  const cellInner = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`w-full h-full text-right px-2 py-2 transition-colors cursor-pointer ${overrideClass}`}
      title="Clique para ver memorial de cálculo ou editar"
    >
      {valor > 0 ? fmtBR(valor) : '—'}
      {isOverride && <span className="ml-0.5 text-orange-700">*</span>}
    </button>
  );

  return (
    <td className={baseClassName + ' p-0'}>
      {isOverride && hist ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>{cellInner}</PopoverTrigger>
                  <PopoverContent className="w-96" align="end">
                    <div className="space-y-3">
                      <MemorialCalculo campo={campo} f={f} />
                      <div className="border-t pt-2 space-y-1">
                        <div className="text-xs font-semibold text-orange-700">Alteração manual</div>
                        <div className="text-[11px]">Valor original: <b>{fmtBR(hist.valorOriginal || 0)}</b></div>
                        <div className="text-[11px]">Por: {hist.alteradoPor} em {hist.alteradoEm ? new Date(hist.alteradoEm).toLocaleString('pt-BR') : '—'}</div>
                        {hist.motivo && <div className="text-[11px] italic">"{hist.motivo}"</div>}
                      </div>
                      <div className="border-t pt-2 space-y-2">
                        <label className="text-[11px] text-gray-600">Novo valor (R$)</label>
                        <Input value={editValor} onChange={(e) => setEditValor(e.target.value)} className="h-8 text-xs" />
                        <label className="text-[11px] text-gray-600">Motivo (opcional)</label>
                        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="text-xs min-h-[60px]" placeholder="Ex.: ajuste por acordo, erro de cadastro..." />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSave} disabled={isLoading} className="flex-1">Salvar</Button>
                          <Button size="sm" variant="outline" onClick={handleRevert} disabled={isLoading}>Reverter</Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div>Alterado de <b>{fmtBR(hist.valorOriginal || 0)}</b> para <b>{fmtBR(valor)}</b></div>
              <div className="text-[10px] opacity-80">por {hist.alteradoPor} · {hist.alteradoEm ? new Date(hist.alteradoEm).toLocaleString('pt-BR') : '—'}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{cellInner}</PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            <div className="space-y-3">
              <MemorialCalculo campo={campo} f={f} />
              <div className="border-t pt-2 space-y-2">
                <div className="text-xs font-semibold text-gray-700">Alterar valor manualmente</div>
                <label className="text-[11px] text-gray-600">Novo valor (R$)</label>
                <Input value={editValor} onChange={(e) => setEditValor(e.target.value)} className="h-8 text-xs" />
                <label className="text-[11px] text-gray-600">Motivo (opcional)</label>
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="text-xs min-h-[60px]" placeholder="Ex.: ajuste por acordo, erro de cadastro..." />
                <Button size="sm" onClick={handleSave} disabled={isLoading} className="w-full">Salvar alteração manual</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </td>
  );
}

export default function FolhaPagamento() {
  const { selectedCompanyId, getCompanyIdsForQuery} = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const isMaster = user?.role === "admin_master";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;
  const [showDissidioRel, setShowDissidioRel] = useState(false);
  const [showLimparMes, setShowLimparMes] = useState(false);

  // Upload refs (direto no seletor de arquivos)
  const valeInputRef = useRef<HTMLInputElement>(null);
  const pagInputRef = useRef<HTMLInputElement>(null);
  const decimo1InputRef = useRef<HTMLInputElement>(null);
  const decimo2InputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"vale" | "pagamento" | "decimo_terceiro_1" | "decimo_terceiro_2" | null>(null);
  // Rev. 2521 — progresso estimado 0→100% do import de PDFs da folha
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadPhase, setUploadPhase] = useState<string>("");
  const uploadFilesCountRef = useRef<number>(0);
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopUploadProgress = useCallback((final: number = 100) => {
    if (uploadTimerRef.current) { clearInterval(uploadTimerRef.current); uploadTimerRef.current = null; }
    setUploadProgress(final);
    setTimeout(() => { setUploadProgress(0); setUploadPhase(""); }, 600);
  }, []);
  const startUploadProgress = useCallback((nFiles: number) => {
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    uploadFilesCountRef.current = nFiles;
    setUploadProgress(2);
    setUploadPhase(`Lendo ${nFiles} PDF${nFiles > 1 ? "s" : ""}…`);
    // Duração estimada: ~4s por PDF + 3s de match. Tick 250ms, avança assintótico até 90.
    const totalMs = Math.max(6000, nFiles * 4000 + 3000);
    const tickMs = 250;
    const ticks = totalMs / tickMs;
    let t = 0;
    uploadTimerRef.current = setInterval(() => {
      t++;
      // curva assintótica: alvo 90, velocidade decai
      setUploadProgress(prev => {
        const target = 90;
        const next = prev + Math.max(0.4, (target - prev) / (ticks - t + 4));
        return Math.min(next, target);
      });
      // troca de fase em ~40% e ~75%
      if (t === Math.floor(ticks * 0.35)) setUploadPhase("Extraindo texto e classificando…");
      if (t === Math.floor(ticks * 0.7)) setUploadPhase("Vinculando funcionários e salvando…");
    }, tickMs);
  }, []);
  const [pagamentoSubView, setPagamentoSubView] = useState<"geral" | "por_banco">("geral");
  const [valeSubView, setValeSubView] = useState<"geral" | "por_banco">("geral");
  const [pagamentoSearch, setPagamentoSearch] = useState("");
  const [pagamentoFuncao, setPagamentoFuncao] = useState<string>("__all__");
  const [contasRemessaSelecionadas, setContasRemessaSelecionadas] = useState<Set<number>>(new Set());
  const [gerandoRemessasLote, setGerandoRemessasLote] = useState(false);

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "he" ? "he_modulo" : "resumo";
  });
  const [viewLancId, setViewLancId] = useState<number | null>(null);
  const [viewTipo, setViewTipo] = useState<string>("");

  const [, setLocation] = useLocation();

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [valeSearch, setValeSearch] = useState("");
  const [valeFilter, setValeFilter] = useState<"all" | "aprovados" | "alertas" | "he" | "pago" | "naopago" | "editados">("all");
  const [valeExcluirSel, setValeExcluirSel] = useState<Set<number>>(new Set());

  // HE Módulo state
  const prevMes = mesSelecionado === 1 ? 12 : mesSelecionado - 1;
  const prevAno = mesSelecionado === 1 ? anoSelecionado - 1 : anoSelecionado;
  // Aferir Escuro confere a competência inteira (cut-to-cut):
  // do dia 16 do mês anterior até o dia 15 do mês atual.
  const escuroInicio = `16/${String(prevMes).padStart(2, '0')}/${prevAno}`;
  const escuroFim = `15/${String(mesSelecionado).padStart(2, '0')}/${anoSelecionado}`;
  const mesEscuroLabel = `${MESES_CURTOS[prevMes - 1]}/${prevAno}`;
  const prevMesAno = `${prevAno}-${String(prevMes).padStart(2, '0')}`;
  const defaultHeInicio = `${prevAno}-${String(prevMes).padStart(2, "0")}-16`;
  const defaultHeFim = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}-15`;
  const [heDataInicio, setHeDataInicio] = useState(defaultHeInicio);
  const [heDataFim, setHeDataFim] = useState(defaultHeFim);
  const [heDatasLocked, setHeDatasLocked] = useState(true);

  useEffect(() => {
    setHeDataInicio(defaultHeInicio);
    setHeDataFim(defaultHeFim);
    setHeDatasLocked(true);
    setHeViewPeriodId(null);
  }, [mesSelecionado, anoSelecionado]);
  const [heCalcResult, setHeCalcResult] = useState<any>(null);
  const [heViewPeriodId, setHeViewPeriodId] = useState<number | null>(null);
  // Rev. 2182 — filtro por origem (cards KPI clicáveis acima da tabela HE)
  const [heOrigemFilter, setHeOrigemFilter] = useState<"todos" | "aprovada" | "sem_solicitacao">("todos");
  // Rev. 2183 — filtro por obra (Select acima da tabela HE; "all"|"sem"|String(obraId))
  const [heObraFilterMod, setHeObraFilterMod] = useState<string>("all");
  useEffect(() => { setHeOrigemFilter("todos"); setHeObraFilterMod("all"); }, [heViewPeriodId]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFuncao, setFilterFuncao] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [verificacaoFilter, setVerificacaoFilter] = useState<string>("all");
  // Vinculação manual de obra
  const [selectedSemObra, setSelectedSemObra] = useState<Set<number>>(new Set());
  const [vinculacaoObraId, setVinculacaoObraId] = useState<number | null>(null);
  const [vinculacaoJustificativa, setVinculacaoJustificativa] = useState("");
  const [showVinculacaoPanel, setShowVinculacaoPanel] = useState(false);
  const [heObraFilter, setHeObraFilter] = useState<string>("all");
  // Banco de Horas — auto-abrir via URL (?tab=he&sub=banco_horas)
  const [heSubView, setHeSubView] = useState<"periodos" | "banco_horas">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("sub") === "banco_horas" ? "banco_horas" : "periodos";
  });
  const [destinacaoMap, setDestinacaoMap] = useState<Record<number, "pagamento" | "banco_horas">>({});
  const [heLancamentosEmpId, setHeLancamentosEmpId] = useState<number | null>(null);
  const [heDebitarEmpId, setHeDebitarEmpId] = useState<number | null>(null);
  const [heDebitarHoras, setHeDebitarHoras] = useState(0);
  const [heDebitarMins, setHeDebitarMins] = useState(0);
  const [heDebitarData, setHeDebitarData] = useState(new Date().toISOString().slice(0, 10));
  const [heDebitarDesc, setHeDebitarDesc] = useState("");
  // MO alocação

  const [fecharFolhaResult, setFecharFolhaResult] = useState<{ count: number } | null>(null);
  const [showAfericaoInfo, setShowAfericaoInfo] = useState(false);

  // ===== QUERIES =====
  const statusMes = trpc.folha.statusMes.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const mesesComLanc = trpc.folha.listarMesesComLancamentos.useQuery({ companyId, companyIds, ano: anoSelecionado }, { enabled: companyId > 0 || companyIds.length > 0 });
  // Rev. 3280 — Relatório de Diferenças Salariais (Dissídio) movido de Configurações p/ a Folha (escopo: ano selecionado)
  const dissidioRelQuery = trpc.sindical.relatorioDiferencas.useQuery(
    { companyId, companyIds, anoReferencia: anoSelecionado },
    { enabled: showDissidioRel && (companyId > 0 || companyIds.length > 0) }
  );
  const lancamentos = trpc.folha.listarLancamentos.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const itensDetail = trpc.folha.listarItens.useQuery(
    { folhaLancamentoId: viewLancId! },
    { enabled: !!viewLancId && (viewMode === "detalhes" || viewMode === "verificacao"), refetchOnWindowFocus: true }
  );
  const verificacao = trpc.folha.verificacaoCruzada.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && viewMode === "verificacao", refetchOnWindowFocus: true }
  );
  const custosPorObra = trpc.folha.custosPorObra.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && companyId > 0 && viewMode === "custos_obra" }
  );
  const horasExtras = trpc.folha.horasExtrasPorFuncionario.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "horas_extras" }
  );
  const obrasListQuery = trpc.folha.listarVinculacoesManuais.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "custos_obra" }
  );
  // Lista de obras para o select de vinculação
  const obrasParaSelect = useMemo(() => {
    if (!custosPorObra.data) return [];
    return custosPorObra.data.obrasResumo.map((o: any) => ({ id: o.obraId, nome: o.obraNome }));
  }, [custosPorObra.data]);

  // ===== PAYROLL ENGINE (Cálculo Interno) =====
  const payrollPeriod = trpc.payrollEngine.getPeriod.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  // Rev. 3317 — mapa employeeId → conta-empresa para a view "Por Banco" do Vale
  // (o snapshot do vale não carrega esses campos; JOIN client-side).
  const contasBancariasFolha = trpc.payrollEngine.contasBancariasFolha.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const [valeResult, setValeResult] = useState<any>(null);
  const [pagamentoResult, setPagamentoResult] = useState<any>(null);
  // Rev. 3302 — Arredondamento (Master): força líquido p/ real cheio (lote/individual).
  const [arredOpen, setArredOpen] = useState(false);
  const [arredOrigem, setArredOrigem] = useState<'vale' | 'folha'>('vale');
  // Identidade do período já hidratado (declarada aqui, ANTES das mutações que
  // precisam forçar re-hidratação — ver effect de hidratação mais abaixo).
  const lastLoadedPeriodId = useRef<number | "none" | null>(null);
  // Rev. 3969 — Recalcular diferenças salariais retroativas do dissídio (caso não
  // tenham sido geradas na aplicação por vigência == mês de aplicação).
  const recalcularDifsMut = trpc.sindical.recalcularDiferencas.useMutation({
    onSuccess: (data: any) => {
      if ((data?.atualizados ?? 0) === 0) {
        toast.success('Nenhuma diferença pendente — todos os funcionários já estão calculados.');
      } else {
        toast.success(`Diferenças recalculadas: ${data.atualizados} funcionário(s).`);
      }
      dissidioRelQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao recalcular diferenças'),
  });

  // Rev. 3993 — Edição manual da diferença retroativa (bruto/INSS/IRRF), linha a
  // linha, para conciliar divergências residuais que o cálculo automático não cobre.
  const [editDifRow, setEditDifRow] = useState<any>(null);
  const [editDifBruto, setEditDifBruto] = useState('');
  const [editDifInss, setEditDifInss] = useState('');
  const [editDifIrrf, setEditDifIrrf] = useState('');
  const editarDifMut = trpc.sindical.editarDiferencaManual.useMutation({
    onSuccess: () => {
      toast.success('Diferença ajustada manualmente.');
      setEditDifRow(null);
      dissidioRelQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar edição manual'),
  });
  const removerEdicaoDifMut = trpc.sindical.removerEdicaoManualDiferenca.useMutation({
    onSuccess: () => {
      toast.success('Edição manual removida — voltou ao valor calculado.');
      dissidioRelQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover edição manual'),
  });
  const abrirEdicaoDif = (r: any) => {
    setEditDifRow(r);
    setEditDifBruto(String(r.valorRetroativo ?? '0'));
    setEditDifInss(String(r.inss ?? '0'));
    setEditDifIrrf(String(r.irrf ?? '0'));
  };
  const salvarEdicaoDif = () => {
    if (!editDifRow) return;
    const bruto = parseFloat(editDifBruto.replace(',', '.'));
    const inss = parseFloat(editDifInss.replace(',', '.'));
    const irrf = parseFloat(editDifIrrf.replace(',', '.'));
    if (isNaN(bruto) || isNaN(inss) || isNaN(irrf) || bruto < 0 || inss < 0 || irrf < 0) {
      toast.error('Valores inválidos.');
      return;
    }
    editarDifMut.mutate({ companyId, companyIds, id: editDifRow.id, bruto, inss, irrf });
  };

  // Rev. 3982 — Imprimir / PDF do relatório de Diferenças Salariais (Dissídio).
  // Trocado de `print-only`+window.print() (Rev. 3979) para janela nova com
  // HTML auto-contido — mesmo padrão de `gerarRelatorioCombo` em
  // DashAvisoPrevio.tsx. Motivo: a tabela dentro de um Dialog (`position:fixed`
  // + `overflow-y-auto`) cortava colunas/páginas na impressão (layout "feio"
  // reportado pelo usuário); com HTML próprio temos controle total do layout
  // (paisagem, cabeçalho com logo, zebra, cores) sem herdar CSS/overflow da SPA.
  const handlePrintDissidioRel = () => {
    const data = dissidioRelQuery.data;
    if (!data || data.rows.length === 0) return;
    const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ));
    const logo = `${window.location.origin}/logo-fc.jpg`;
    const emissaoBR = new Date().toLocaleDateString('pt-BR');
    const rowsHtml = [...data.rows]
      .sort((a: any, b: any) => (a.employeeName || '').localeCompare(b.employeeName || '', 'pt-BR'))
      .map((r: any, i: number) => `
      <tr>
        <td style="text-align:center;color:#64748b">${i + 1}</td>
        <td style="font-weight:600">${esc(r.employeeName || `#${r.employeeId}`)}</td>
        <td style="text-align:center">${esc(r.anoReferencia ?? '—')}</td>
        <td style="text-align:center">${r.diferencaTipo === 'rescisao_complementar' ? 'Resc. Compl.' : 'Folha'}</td>
        <td style="text-align:center;white-space:nowrap">${esc(r.diferencaMesPagamento || '—')}</td>
        <td style="text-align:right">${esc(r.percentualAplicado)}%</td>
        <td style="text-align:right;white-space:nowrap">${r.diferencaBaseVerbas ? formatBRL(r.diferencaBaseVerbas) : '—'}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600;color:#15803d">${formatBRL(r.valorRetroativo)}</td>
        <td style="text-align:right;white-space:nowrap;color:#b91c1c">${r.inss > 0 ? `− ${formatBRL(r.inss)}` : '—'}</td>
        <td style="text-align:right;white-space:nowrap;color:#b91c1c">${r.irrf > 0 ? `− ${formatBRL(r.irrf)}` : '—'}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:700;color:#1d4ed8">${formatBRL(r.valorLiquido)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
      <title>Diferenças Salariais Retroativas (Dissídio) — ${fmtNum(anoSelecionado)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; font-size: 11px; }
        .hdr { text-align:center; margin-bottom: 8px; }
        .hdr img { height: 64px; object-fit: contain; }
        .hdr h1 { font-size: 15px; margin: 6px 0 2px; letter-spacing: .5px; }
        .hdr .sub { font-size: 10px; color:#64748b; }
        .faixa { background:#1B2A4A; color:#fff; padding:9px 14px; margin:14px 0 10px; border-radius:4px;
                 font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; text-align:center;
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .meta { display:flex; justify-content:space-between; font-size:10px; color:#475569; margin-bottom:10px; }
        .cards { display:flex; gap:8px; margin: 6px 0 14px; flex-wrap: wrap; }
        .card { flex:1; min-width:100px; border:1px solid #cbd5e1; border-radius:6px; padding:8px; text-align:center; }
        .card .v { font-size:14px; font-weight:700; }
        .card .l { font-size:8px; color:#64748b; text-transform:uppercase; letter-spacing:.3px; margin-top:2px; }
        .green { color:#15803d; } .red { color:#b91c1c; } .blue { color:#1d4ed8; } .amber { color:#b45309; }
        table { width:100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border:1px solid #cbd5e1; padding:5px 6px; }
        thead th { background:#1B2A4A; color:#fff; font-size:9px; text-transform:uppercase; letter-spacing:.3px;
                   -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        tbody tr:nth-child(even) td { background:#f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .nota { font-size:9px; color:#64748b; font-style: italic; margin-top:6px; }
        @page { size: A4 landscape; margin: 12mm; }
        @media print { body { margin: 0; } }
      </style></head>
      <body>
        <div class="hdr">
          <img src="${logo}" alt="FC Engenharia" />
          <h1>FC ENGENHARIA</h1>
          <div class="sub">Diferenças Salariais Retroativas (Dissídio)</div>
        </div>
        <div class="faixa">Relatório de Diferenças Salariais Retroativas (Dissídio) — Ano ${fmtNum(anoSelecionado)}</div>
        <div class="meta">
          <span><strong>Funcionários:</strong> ${fmtNum(data.qtdFuncionarios)}</span>
          <span><strong>Emissão:</strong> ${emissaoBR}</span>
        </div>
        <div class="cards">
          <div class="card"><div class="v green">${formatBRL(data.totalGeral)}</div><div class="l">Total Bruto</div></div>
          <div class="card"><div class="v red">${formatBRL(data.totalInss ?? 0)}</div><div class="l">Total INSS</div></div>
          <div class="card"><div class="v red">${formatBRL(data.totalIrrf ?? 0)}</div><div class="l">Total IRRF</div></div>
          <div class="card"><div class="v blue">${formatBRL(data.totalLiquido ?? 0)}</div><div class="l">Total Líquido</div></div>
          <div class="card"><div class="v green">${formatBRL(data.totalFolha)}</div><div class="l">Na Folha</div></div>
          <div class="card"><div class="v amber">${formatBRL(data.totalComplementar)}</div><div class="l">Resc. Complementar</div></div>
          <div class="card"><div class="v amber">${formatBRL(data.totalFgts ?? 0)}</div><div class="l">FGTS (informativo)</div></div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>Funcionário</th><th>Ano</th><th>Tipo</th><th>Pagto</th>
            <th>%</th><th>Base (verbas)</th><th>Bruto</th><th>INSS</th><th>IRRF</th><th>Líquido</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p class="nota">Diferenças geradas ao aplicar um dissídio com data de vigência no passado. Pago à parte da folha mensal (guia própria de INSS/IRRF) — não entra nos totais da folha.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      alert('Não foi possível abrir a janela do relatório. Habilite pop-ups para este site e tente novamente.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* usuário pode imprimir manualmente */ } }, 300);
  };

  const arredondarMut = trpc.payrollEngine.arredondarLote.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.message || "Arredondamento aplicado.");
      // Rev. 3305 — o arredondamento já persistiu colunas + snapshot (vale/folha) no
      // backend. O effect de hidratação normalmente PULA o refetch do mesmo período
      // (guard `lastLoadedPeriodId === pid`) p/ preservar edições locais; aqui o
      // snapshot É a verdade nova, então zeramos o guard p/ forçar a re-leitura do
      // valeResultJson/pagamentoResultJson fresco — senão a tela fica com o valor velho.
      lastLoadedPeriodId.current = null;
      payrollPeriod.refetch();
    },
    onError: (err: any) => toast.error(`Erro ao arredondar: ${err?.message || err}`),
  });
  const aplicarArred = useCallback((modo: 'cima' | 'baixo' | 'normal', employeeIds?: number[]) => {
    arredondarMut.mutate({
      companyId, mesReferencia: mesAno, origem: arredOrigem, modo,
      ...(employeeIds && employeeIds.length ? { employeeIds } : {}),
    });
  }, [arredondarMut, companyId, mesAno, arredOrigem]);
  const divergenciasFolha = trpc.payrollEngine.validarDivergenciasFolha.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );
  const auditoriaFolha = trpc.payrollEngine.auditarFolha.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && viewMode === "auditoria_folha" }
  );
  // Contagem de pendências p/ badge do botão "Aprovações RH"
  const pendenciasCount = trpc.payrollEngine.listarPendenciasAprovacaoRh.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && !!mesAno, refetchInterval: 60_000 }
  );
  const totalPendenciasAprovacao = (() => {
    const d = pendenciasCount.data;
    if (!d) return 0;
    const conv = (d.convenios || []).filter((r: any) => r.status === "pendente").length;
    const epi = (d.epi || []).filter((r: any) => r.status === "pendente").length;
    const outros = (d.adjustments || []).filter((r: any) => r.tipo === "outros" && r.aprovadoRh !== true).length;
    return conv + epi + outros;
  })();
  const [auditFiltroCategoria, setAuditFiltroCategoria] = useState<string>("todos");
  const [auditExpandedIdx, setAuditExpandedIdx] = useState<number | null>(null);
  const [auditOpenSections, setAuditOpenSections] = useState<Record<string, boolean>>({
    semPagamento: true, semVale: true, variacaoSalarial: true,
    descontosExcessivos: true, comFaltas: true, comAtrasos: false,
    comHorasExtras: false, dadosBancariosIncompletos: false,
  });
  const [afericaoResult, setAfericaoResult] = useState<any>(null);
  const [showAfericaoReport, setShowAfericaoReport] = useState(false);
  const [afericaoFilter, setAfericaoFilter] = useState<'todos'|'ok'|'faltas'|'atrasos'|'justificados'>('todos');
  const [afericaoSel, setAfericaoSel] = useState<Set<number>>(new Set());
  const [bhConfirmOpen, setBhConfirmOpen] = useState(false);
  const [bhConfirmIds, setBhConfirmIds] = useState<number[]>([]);
  const [detalheAfericaoEmpId, setDetalheAfericaoEmpId] = useState<number | null>(null);
  const [espelhoPopupEmpId, setEspelhoPopupEmpId] = useState<number | null>(null);
  const [espelhoPopupEmpNome, setEspelhoPopupEmpNome] = useState("");
  // Rev. 2196 — lightbox da foto do colaborador (clique no avatar amplia)
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);
  const [memorialHePeriodId, setMemorialHePeriodId] = useState<number | null>(null);
  const [memorialEmployeeId, setMemorialEmployeeId] = useState<number | null>(null);
  // Rev. 2184 — drill-down do badge "✅ Aprovada" do Relatório de Períodos HE
  // para listar as solicitações HE aprovadas que cobrem o funcionário no período.
  const [solicAprovDialog, setSolicAprovDialog] = useState<
    { empId: number; empNome: string; dataInicio: string; dataFim: string } | null
  >(null);
  const [espelhoEditDate, setEspelhoEditDate] = useState<string | null>(null);
  const [espelhoEditRecord, setEspelhoEditRecord] = useState<any>(null);
  const [espelhoEditForm, setEspelhoEditForm] = useState({ entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "", motivoAjuste: "Correção manual" });
  const [calcElapsed, setCalcElapsed] = useState(0);
  const [calcType, setCalcType] = useState<"vale" | "pagamento" | null>(null);

  const [stepProgress, setStepProgress] = useState<Record<string, number>>({});
  const stepProgressRef = useRef<Record<string, NodeJS.Timeout>>({});

  const startProgress = useCallback((key: string) => {
    setStepProgress(p => ({ ...p, [key]: 5 }));
    if (stepProgressRef.current[key]) clearInterval(stepProgressRef.current[key]);
    stepProgressRef.current[key] = setInterval(() => {
      setStepProgress(p => {
        const cur = p[key] || 5;
        if (cur >= 99) return p;
        const increment = cur < 30 ? 8 : cur < 60 ? 4 : cur < 80 ? 2 : cur < 90 ? 0.8 : cur < 95 ? 0.3 : 0.1;
        return { ...p, [key]: Math.min(99, cur + increment) };
      });
    }, 500);
  }, []);

  const finishProgress = useCallback((key: string) => {
    if (stepProgressRef.current[key]) { clearInterval(stepProgressRef.current[key]); delete stepProgressRef.current[key]; }
    setStepProgress(p => ({ ...p, [key]: 100 }));
  }, []);

  const resetProgress = useCallback((key: string) => {
    if (stepProgressRef.current[key]) { clearInterval(stepProgressRef.current[key]); delete stepProgressRef.current[key]; }
    setStepProgress(p => ({ ...p, [key]: 0 }));
  }, []);

  const [editadosConfirm, setEditadosConfirm] = useState<{ show: boolean; nomes: string[]; count: number } | null>(null);

  const gerarValeMut = trpc.payrollEngine.gerarVale.useMutation({
    onMutate: () => startProgress('vale'),
    onSuccess: (data: any) => {
      finishProgress('vale');
      setCalcType(null);
      setCalcElapsed(0);
      if (data.needsConfirmation) {
        setEditadosConfirm({ show: true, nomes: data.editados || [], count: data.editadosCount || 0 });
        return;
      }
      setValeResult(data);
      setValeExcluirSel(new Set());
      setViewMode("calculo_vale");
      toast.success(`Vale calculado: ${data.totalFuncionarios ?? ''} funcionários — R$ ${data.totalVale ? Number(data.totalVale).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}`);
      payrollPeriod.refetch();
    },
    onError: (err) => { resetProgress('vale'); setCalcType(null); setCalcElapsed(0); toast.error(`Erro ao calcular vale: ${err.message}`); },
  });
  const [overridesPrompt, setOverridesPrompt] = useState<{ open: boolean; count: number; lista: { id: number; nome: string; campos: string[] }[]; manterIds: number[] }>({ open: false, count: 0, lista: [], manterIds: [] });
  const [aplicarDsrFalta, setAplicarDsrFalta] = useState<boolean>(true);
  // Rev. 3989 — toggle "Somar Diferença do Dissídio" (persistido por período)
  const [somarDiferencaDissidio, setSomarDiferencaDissidio] = useState<boolean>(false);
  const calcPeriodoPadrao = useCallback((ref: string) => {
    const [y, m] = ref.split('-').map(Number);
    const diaCorte = 15;
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const inicioDate = new Date(Date.UTC(prevY, prevM - 1, diaCorte));
    inicioDate.setUTCDate(inicioDate.getUTCDate() + 1);
    const inicio = inicioDate.toISOString().slice(0, 10);
    const fim = `${y}-${String(m).padStart(2, '0')}-${String(diaCorte).padStart(2, '0')}`;
    return { inicio, fim };
  }, []);
  const periodoPadrao = useMemo(() => calcPeriodoPadrao(mesAno), [mesAno, calcPeriodoPadrao]);
  const [periodoInicio, setPeriodoInicio] = useState(() => calcPeriodoPadrao(mesAno).inicio);
  const [periodoFim, setPeriodoFim] = useState(() => calcPeriodoPadrao(mesAno).fim);
  useEffect(() => {
    const pd = payrollPeriod.data as any;
    if (pd?.pontoInicio && pd?.pontoFim) {
      setPeriodoInicio(String(pd.pontoInicio).slice(0, 10));
      setPeriodoFim(String(pd.pontoFim).slice(0, 10));
    } else {
      const p = calcPeriodoPadrao(mesAno);
      setPeriodoInicio(p.inicio);
      setPeriodoFim(p.fim);
    }
  }, [mesAno, payrollPeriod.data, calcPeriodoPadrao]);
  const periodoCustomizado = periodoInicio !== periodoPadrao.inicio || periodoFim !== periodoPadrao.fim;
  const simularPagamentoMut = trpc.payrollEngine.simularPagamento.useMutation({
    onMutate: () => startProgress('pagamento'),
    onSuccess: (data) => {
      finishProgress('pagamento');
      setCalcType(null);
      setCalcElapsed(0);
      setPagamentoResult(data);
      setViewMode("calculo_pagamento");
      setOverridesPrompt({ open: false, count: 0, lista: [], manterIds: [] });
      if (typeof (data as any).aplicarDsrFalta === 'boolean')  setAplicarDsrFalta((data as any).aplicarDsrFalta);
      if (typeof (data as any).somarDiferencaDissidio === 'boolean') setSomarDiferencaDissidio((data as any).somarDiferencaDissidio);
      if (data.divergencias && data.divergencias.length > 0) {
        toast.warning(`ATENÇÃO: ${data.divergencias.length} funcionário(s) CLT ativo(s) excluído(s) da folha por cadastro incompleto. Verifique o alerta na tela.`, { duration: 8000 });
      }
      toast.success(`Pagamento simulado: ${data.totalFuncionarios ?? ''} de ${data.totalCltAtivos ?? data.totalFuncionarios} CLTs — líquido R$ ${data.totalLiquido ? Number(data.totalLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}`);
      divergenciasFolha.refetch();
      payrollPeriod.refetch();
    },
    onError: (err) => {
      resetProgress('pagamento'); setCalcType(null); setCalcElapsed(0);
      const m = String(err.message || '');
      const ovrMatch = m.match(/OVERRIDES_EXIST:(\d+)(?::(.*))?$/s);
      if (ovrMatch) {
        let lista: { id: number; nome: string; campos: string[] }[] = [];
        try { lista = ovrMatch[2] ? JSON.parse(ovrMatch[2]) : []; } catch { lista = []; }
        setOverridesPrompt({ open: true, count: Number(ovrMatch[1]), lista, manterIds: lista.map(f => f.id) });
      } else {
        toast.error(`Erro ao simular pagamento: ${err.message}`);
      }
    },
  });

  // Edição manual de descontos
  const editarDescontoMut = trpc.payrollEngine.editarDescontoManual.useMutation({
    onSuccess: (data: any) => {
      // Atualiza local: substitui o funcionario no pagamentoResult e atualiza totais
      setPagamentoResult((prev: any) => {
        if (!prev) return prev;
        const funcs = (prev.funcionarios || []).map((f: any) =>
          Number(f.employeeId) === Number(data.funcionario.employeeId) ? data.funcionario : f
        );
        return { ...prev, funcionarios: funcs, totalDescontos: data.totalDescontos, totalLiquido: data.totalLiquido };
      });
      toast.success("Desconto atualizado");
    },
    onError: (err) => toast.error(`Erro ao salvar desconto: ${err.message}`),
  });

  // Rev. 3997 — editar o Líquido diretamente na Folha de Pagamento (mesmo padrão
  // pencil/save/cancel da Folha de Vale via editarLiquidoMut/liqEditId).
  const editarLiquidoFolhaMut = trpc.payrollEngine.editarLiquidoFolha.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setPgLiqEditId(null);
      setPgLiqEditValor("");
      setPagamentoResult((prev: any) => {
        if (!prev) return prev;
        const novoLiquido = parseFloat(data.novoLiquido) || 0;
        const funcs = (prev.funcionarios || []).map((f: any) =>
          Number(f.employeeId) === Number(data.employeeId)
            ? { ...f, salarioLiquido: novoLiquido, salarioLiquidoExato: novoLiquido, ajusteArredondamento: 0, liquidoEditadoManualmente: true }
            : f
        );
        const totalLiquido = funcs.reduce((s: number, f: any) => s + (Number(f.salarioLiquido) || 0), 0);
        return { ...prev, funcionarios: funcs, totalLiquido };
      });
    },
    onError: (err) => toast.error(`Erro ao salvar líquido: ${err.message}`),
  });
  const [pgLiqEditId, setPgLiqEditId] = useState<number | null>(null);
  const [pgLiqEditValor, setPgLiqEditValor] = useState("");

  // Hidratação dos resultados (vale/pagamento/aferição) a partir do snapshot do
  // período. Effect ÚNICO e determinístico: dispara só quando a IDENTIDADE do
  // período muda ("none" quando não há competência). Antes havia DOIS effects —
  // um hidratava ([payrollPeriod.data], com guard `!valeResult`) e outro zerava
  // tudo ([mesAno]). Quando o getPeriod do mês-alvo já estava em cache do React
  // Query (troca instantânea), os dois mudavam na MESMA renderização: o de
  // hidratar rodava primeiro, via o resultado do mês anterior (truthy) e PULAVA
  // por causa do `!valeResult`; em seguida o de [mesAno] zerava tudo — deixando
  // valeResult/pagamentoResult NULL "para sempre" (o data não mudava de novo).
  // Resultado: o resumo do Vale/Pagamento sumia de forma não-determinística,
  // dependendo só do estado de cache de cada sessão (não de permissão).
  useEffect(() => {
    const pd = payrollPeriod.data as any;
    const pid: number | "none" = pd?.id ?? "none";
    // Mesma identidade de período (ex.: refetch após mutação) → preserva edições
    // locais já aplicadas em valeResult/pagamentoResult/afericaoResult.
    if (lastLoadedPeriodId.current === pid) return;
    lastLoadedPeriodId.current = pid;

    if (pid === "none") {
      setAfericaoResult(null);
      setValeResult(null);
      setPagamentoResult(null);
      return;
    }

    // Hidrata SEMPRE a partir do snapshot do período (sem depender do estado
    // anterior), limpando quando a respectiva coluna vier vazia.
    if (pd.afericaoResultJson) {
      try {
        const parsed = JSON.parse(pd.afericaoResultJson);
        if (parsed.divergenciasList) {
          for (const d of parsed.divergenciasList) {
            if (d.jaDecidido && d.statusDecisao === 'pendente') d._confirmado = true;
            if (d.jaDecidido && (d.statusDecisao === 'cancelado' || d.statusDecisao === 'banco_horas')) d._cancelado = true;
          }
        }
        setAfericaoResult(parsed);
      } catch { setAfericaoResult(null); }
    } else {
      setAfericaoResult(null);
    }

    if (pd.valeResultJson) {
      try { setValeResult(JSON.parse(pd.valeResultJson)); } catch { setValeResult(null); }
    } else {
      setValeResult(null);
    }

    if (pd.pagamentoResultJson) {
      try { setPagamentoResult(JSON.parse(pd.pagamentoResultJson)); } catch { setPagamentoResult(null); }
    } else {
      setPagamentoResult(null);
    }

    // Hidrata toggles DSR a partir das colunas persistidas em payroll_periods
    if (pd.aplicarDsrFalta !== undefined && pd.aplicarDsrFalta !== null) {
      setAplicarDsrFalta(Number(pd.aplicarDsrFalta) === 1);
    }
    if (pd.somarDiferencaDissidio !== undefined && pd.somarDiferencaDissidio !== null) {
      setSomarDiferencaDissidio(Number(pd.somarDiferencaDissidio) === 1);
    }
  }, [payrollPeriod.data]);

  useEffect(() => {
    if (!calcType) return;
    setCalcElapsed(0);
    const interval = setInterval(() => setCalcElapsed(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [calcType]);

  const afericaoMut = trpc.payrollEngine.realizarAfericao.useMutation({
    onMutate: () => startProgress('afericao'),
    onSuccess: (data) => {
      finishProgress('afericao');
      setAfericaoResult(data);
      setShowAfericaoReport(true);
      if ((data.faltas || 0) > 0) {
        toast.warning(`Aferição concluída com ${data.faltas} dia(s) de falta identificados. Verifique os alertas e corrija no Espelho de Ponto.`);
      } else {
        toast.success(data.message);
      }
      payrollPeriod.refetch();
      alertasAfericao.refetch();
    },
    onError: (err) => { resetProgress('afericao'); toast.error(`Erro na aferição: ${err.message}`); },
  });
  const atualizarAfericaoMut = trpc.payrollEngine.atualizarAfericaoResult.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Progresso salvo");
      payrollPeriod.refetch();
    },
    onError: (err) => { toast.error(`Erro ao salvar: ${err.message}`); },
  });
  const decidirAfericaoMut = trpc.payrollEngine.decidirAfericao.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Decisão registrada com sucesso");
      alertasAfericao.refetch();
    },
    onError: (err) => { toast.error(`Erro: ${err.message}`); },
  });
  const alertasAfericao = trpc.payrollEngine.listarAlertasAfericao.useQuery(
    { companyId, companyIds, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && !!mesAno }
  );
  const detalheAfericaoDias = trpc.payrollEngine.detalharDiasAfericao.useQuery(
    { companyId, employeeId: detalheAfericaoEmpId!, mesReferencia: mesAno },
    { enabled: !!companyId && !!mesAno && !!detalheAfericaoEmpId }
  );

  const espelhoPeriodo = useMemo(() => {
    if (!mesAno) return { inicio: "", fim: "" };
    const [y, m] = mesAno.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return {
      inicio: `${py}-${String(pm).padStart(2,"0")}-16`,
      fim: `${y}-${String(m).padStart(2,"0")}-15`,
    };
  }, [mesAno]);

  const espelhoPopupQ = trpc.horasExtras.getEspelhoPontoRange.useQuery(
    { companyId, employeeId: espelhoPopupEmpId!, dataInicio: espelhoPeriodo.inicio, dataFim: espelhoPeriodo.fim },
    { enabled: !!companyId && !!espelhoPopupEmpId && !!espelhoPeriodo.inicio }
  );

  const memorialQ = trpc.horasExtras.memorialCalculo.useQuery(
    { hePeriodId: memorialHePeriodId!, employeeId: memorialEmployeeId! },
    { enabled: !!memorialHePeriodId && !!memorialEmployeeId }
  );

  // Rev. 2184 — histórico de solicitações HE do funcionário (reusa procedure
  // existente). Filtragem por data + status='aprovada' é feita client-side.
  const solicAprovQ = trpc.heSolicitacoes.historyByEmployee.useQuery(
    { companyId, employeeId: solicAprovDialog?.empId || 0 },
    { enabled: !!companyId && !!solicAprovDialog?.empId }
  );

  const espelhoSaveMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Ponto salvo com sucesso");
      setEspelhoEditDate(null);
      espelhoPopupQ.refetch();
      if (afericaoResult?.divergenciasList) {
        const editedDate = variables.data;
        const editedEmpId = variables.employeeId;
        const removidos = afericaoResult.divergenciasList.filter(
          (d: any) => String(d.employeeId) === String(editedEmpId) && d.data === editedDate
        );
        const updated = {
          ...afericaoResult,
          divergenciasList: afericaoResult.divergenciasList.filter(
            (d: any) => !(String(d.employeeId) === String(editedEmpId) && d.data === editedDate)
          ),
        };
        updated.divergencias = updated.divergenciasList.length;
        const faltasRemovidas = removidos.filter((d: any) => d.tipo === 'falta').length;
        const atrasosRemovidos = removidos.filter((d: any) => d.tipo === 'atraso').length;
        if (faltasRemovidas > 0) updated.faltas = Math.max(0, (updated.faltas || 0) - faltasRemovidas);
        if (atrasosRemovidos > 0) updated.atrasos = Math.max(0, (updated.atrasos || 0) - atrasosRemovidos);
        updated.totalOk = (updated.totalAferidos || 0) - updated.divergencias;
        setAfericaoResult(updated);
      }
    },
    onError: (err: any) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const decidirValeMut = trpc.payrollEngine.decidirVale.useMutation({
    onSuccess: (data, variables) => {
      toast.success(data.message);
      if (valeResult) {
        const decisoesMap = new Map(variables.decisoes.map(d => [d.employeeId, d.pagar]));
        const updatedFuncs = (valeResult.funcionarios || []).map((f: any) => {
          const decisao = decisoesMap.get(f.employeeId);
          if (decisao === true) {
            return { ...f, temAlerta: false, bloqueado: false, status: 'calculado' };
          } else if (decisao === false) {
            return { ...f, temAlerta: false, bloqueado: false, status: 'rejeitado' };
          }
          return f;
        });
        setValeResult({ ...valeResult, funcionarios: updatedFuncs });
      }
    },
    onError: (err) => toast.error(`Erro ao registrar decisão: ${err.message}`),
  });

  const decidirFolhaAvisoMut = trpc.payrollEngine.decidirFolhaAviso.useMutation({
    onSuccess: (data, variables) => {
      toast.success(data.message);
      payrollPeriod.refetch();
      // Rev. 3986 — patch local imediato: sem isso o card mostrava "excluído com
      // sucesso" mas o funcionário continuava na tabela até rodar nova simulação
      // (payroll_payments só é regenerada em simularPagamento; refetch do getPeriod
      // trazia o snapshot antigo). Espelha o padrão já usado em decidirValeMut.
      setPagamentoResult((prev: any) => {
        if (!prev) return prev;
        const decisoesMap = new Map(variables.decisoes.map((d: any) => [d.employeeId, d.pagar]));
        const naoPagarIds = new Set(variables.decisoes.filter((d: any) => !d.pagar).map((d: any) => d.employeeId));
        const funcionarios = (prev.funcionarios || [])
          .filter((f: any) => !naoPagarIds.has(f.employeeId))
          .map((f: any) => (decisoesMap.get(f.employeeId) === true ? { ...f, alertaAvisoEncerrado: false } : f));
        const alertasAvisoEncerrado = (prev.alertasAvisoEncerrado || []).filter((f: any) => !decisoesMap.has(f.employeeId));
        const totalBruto = funcionarios.reduce((s: number, f: any) => s + (f.salarioBruto || 0), 0);
        const totalDescontos = funcionarios.reduce((s: number, f: any) => s + (f.totalDescontos || 0), 0);
        const totalLiquido = funcionarios.reduce((s: number, f: any) => s + (f.salarioLiquido || 0), 0);
        return {
          ...prev,
          funcionarios,
          alertasAvisoEncerrado,
          totalFuncionarios: funcionarios.length,
          totalBruto,
          totalDescontos,
          totalLiquido,
        };
      });
    },
    onError: (err: any) => toast.error(`Erro ao registrar decisão: ${err.message}`),
  });

  const reverterValeMut = trpc.payrollEngine.reverterVale.useMutation({
    onSuccess: (data, variables) => {
      toast.success(data.message);
      if (valeResult) {
        const updatedFuncs = (valeResult.funcionarios || []).map((f: any) => {
          if (f.employeeId === variables.employeeId) {
            return { ...f, status: 'calculado' };
          }
          return f;
        });
        setValeResult({ ...valeResult, funcionarios: updatedFuncs });
      }
    },
    onError: (err) => toast.error(`Erro ao reverter vale: ${err.message}`),
  });

  const editarValeMut = trpc.payrollEngine.editarValorVale.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setValeEditId(null);
      setValeEditValor("");
      if (valeResult && data.employeeId) {
        const updatedFuncs = valeResult.funcionarios.map((f: any) => {
          if (f.employeeId === data.employeeId) {
            return {
              ...f,
              valorTotalVale: parseFloat(data.novoValor) || f.valorTotalVale,
              valorAdiantamento: parseFloat(data.novoValor) || f.valorAdiantamento,
              irRetido: parseFloat(data.novoIR) || 0,
              valorLiquido: parseFloat(data.novoLiquido) || f.valorLiquido,
              editadoManualmente: true,
            };
          }
          return f;
        });
        const novoTotal = updatedFuncs
          .filter((f: any) => f.status !== 'rejeitado')
          .reduce((s: number, f: any) => s + (parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0))), 0);
        setValeResult({ ...valeResult, funcionarios: updatedFuncs, totalVale: novoTotal });
      } else {
        payrollPeriod.refetch();
      }
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const [valeEditId, setValeEditId] = useState<number | null>(null);
  const [valeEditValor, setValeEditValor] = useState("");

  const editarLiquidoMut = trpc.payrollEngine.editarLiquidoVale.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setLiqEditId(null);
      setLiqEditValor("");
      if (valeResult && data.employeeId) {
        const updatedFuncs = valeResult.funcionarios.map((f: any) => {
          if (f.employeeId === data.employeeId) {
            return {
              ...f,
              valorTotalVale: parseFloat(data.novoBruto) || f.valorTotalVale,
              valorAdiantamento: parseFloat(data.novoBruto) || f.valorAdiantamento,
              irRetido: parseFloat(data.novoIR) || 0,
              valorLiquido: parseFloat(data.novoLiquido) || f.valorLiquido,
              editadoManualmente: true,
            };
          }
          return f;
        });
        const novoTotal = updatedFuncs
          .filter((f: any) => f.status !== 'rejeitado')
          .reduce((s: number, f: any) => s + (parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0))), 0);
        setValeResult({ ...valeResult, funcionarios: updatedFuncs, totalVale: novoTotal });
      } else {
        payrollPeriod.refetch();
      }
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const [liqEditId, setLiqEditId] = useState<number | null>(null);
  const [liqEditValor, setLiqEditValor] = useState("");

  // ===== HE MÓDULO =====
  const hePeriods = trpc.horasExtras.listarPeriods.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && !!mesAno }
  );

  useEffect(() => {
    if (hePeriods.data && hePeriods.data.length > 0 && heViewPeriodId === null) {
      const active = (hePeriods.data as any[]).find((p: any) => p.status === 'calculado' || p.status === 'aprovado');
      if (active) setHeViewPeriodId(Number(active.id));
    }
  }, [hePeriods.data]);

  const heDetalhe = trpc.horasExtras.getDetalhe.useQuery(
    { hePeriodId: heViewPeriodId! },
    { enabled: heViewPeriodId !== null }
  );
  const heCalcularMut = trpc.horasExtras.calcularHE.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setHeCalcResult(data);
      setHeViewPeriodId(data.hePeriodId);
      hePeriods.refetch();
      heDetalhe.refetch();
    },
    onError: (err) => toast.error(`Erro ao calcular HE: ${err.message}`),
  });
  const heAprovarMut = trpc.horasExtras.aprovar.useMutation({
    onSuccess: () => { toast.success("Período de HE aprovado!"); hePeriods.refetch(); heDetalhe.refetch(); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const heDeletearCanceladoMut = trpc.horasExtras.deletarCancelado.useMutation({
    onSuccess: () => { toast.success("Período excluído com sucesso."); hePeriods.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const heCancelarMut = trpc.horasExtras.cancelar.useMutation({
    onSuccess: () => { toast.success("Período cancelado. Você pode recalcular agora."); hePeriods.refetch(); if (heViewPeriodId) setHeViewPeriodId(null); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const heDestinoPadrao = trpc.horasExtras.getHeDestinoPadrao.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const heDestinoIsBanco = (heDestinoPadrao.data ?? "banco_horas") === "banco_horas";

  // Banco de Horas queries
  const saldoBanco = trpc.horasExtras.getSaldoBanco.useQuery(
    { companyId },
    { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "he_modulo" }
  );
  const alertasExpiracao = trpc.horasExtras.getAlertasExpiracao.useQuery(
    { companyId },
    { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "he_modulo" }
  );
  const lancamentosBanco = trpc.horasExtras.getLancamentos.useQuery(
    { employeeId: heLancamentosEmpId!, companyId },
    { enabled: !!heLancamentosEmpId && viewMode === "he_modulo" }
  );
  // Banco de Horas mutations
  const setDestinacaoMut = trpc.horasExtras.setDestinacao.useMutation({
    onError: (err) => toast.error(`Erro ao salvar destinação: ${err.message}`),
  });
  const setDestinacaoMassaMut = trpc.horasExtras.setDestinacaoMassa.useMutation({
    onSuccess: () => heDetalhe.refetch(),
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const aprovarComDestinacaoMut = trpc.horasExtras.aprovarComDestinacao.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Período aprovado e processado!");
      hePeriods.refetch();
      heDetalhe.refetch();
      saldoBanco.refetch();
      alertasExpiracao.refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const heMarcarPagoMut = trpc.horasExtras.marcarPago.useMutation({
    onSuccess: () => { toast.success("Pagamentos confirmados!"); hePeriods.refetch(); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const debitarBancoMut = trpc.horasExtras.debitarBanco.useMutation({
    onSuccess: () => {
      toast.success("Débito registrado com sucesso!");
      saldoBanco.refetch();
      alertasExpiracao.refetch();
      if (heLancamentosEmpId) lancamentosBanco.refetch();
      setHeDebitarEmpId(null);
      setHeDebitarHoras(0);
      setHeDebitarMins(0);
      setHeDebitarDesc("");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // ===== MUTATIONS =====
  const importarAutoMut = trpc.folha.importarFolhaAuto.useMutation({
    onSuccess: (data) => {
      const parts = [
        `${data.totalFuncionarios} funcionários processados`,
        `${data.match.matched} vinculados`,
        data.match.unmatched > 0 ? `${data.match.unmatched} não encontrados` : null,
        data.match.divergentes > 0 ? `${data.match.divergentes} com divergências` : null,
        data.match.codigosAtualizados > 0 ? `${data.match.codigosAtualizados} códigos cadastrados` : null,
      ].filter(Boolean);

      // Alerta de redirecionamento de mês
      if (data.mesRedirecionado && data.alertaMes) {
        toast.warning(
          <div>
            <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Mês Redirecionado</p>
            <p className="text-sm mt-1">{data.alertaMes}</p>
          </div>,
          { duration: 15000 }
        );
        // Navegar para o mês correto
        if (data.mesDetectado) {
          const [ano, mes] = data.mesDetectado.split("-");
          setAnoSelecionado(parseInt(ano, 10));
          setMesSelecionado(parseInt(mes, 10));
        }
      }

      toast.success(
        <div>
          <p className="font-medium">{parts.join(" | ")}</p>
          <p className="text-xs mt-1 opacity-80">Arquivos: {data.arquivosProcessados.map((f: any) => `${f.tipo}: ${f.registros}`).join(", ")}</p>
        </div>,
        { duration: 8000 }
      );
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
      stopUploadProgress(100);
      setUploading(null);
    },
    onError: (err) => {
      toast.error(`Erro na importação: ${err.message}`);
      stopUploadProgress(0);
      setUploading(null);
    },
  });

  const reprocessarMut = trpc.folha.reprocessarMatch.useMutation({
    onSuccess: (data) => {
      const parts = [
        `Re-match: ${data.matched} vinculados`,
        data.unmatched > 0 ? `${data.unmatched} não encontrados` : null,
        data.divergentes > 0 ? `${data.divergentes} divergentes` : null,
        data.codigosAtualizados > 0 ? `${data.codigosAtualizados} códigos atualizados` : null,
      ].filter(Boolean);
      toast.success(parts.join(" | "), { duration: 6000 });
      itensDetail.refetch();
      statusMes.refetch();
      lancamentos.refetch();
    },
  });

  // ===== ESTADO DO DIALOG DE INCONSISTÊNCIAS =====
  const [showInconsistDialog, setShowInconsistDialog] = useState(false);
  const [inconsistDialogData, setInconsistDialogData] = useState<{message: string, lancId: number} | null>(null);

  // Rev. 2194: Conferência com Contabilidade removida da Folha de Pagamento (UI + dialog).
  // consolidarLancamento agora envia ignorarConferencia:true sempre, pra contornar a checagem server-side.
  const consolidarMut = trpc.folha.consolidarLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento consolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch();
    },
    onError: (err) => {
      if (err.message.includes('Consolidação bloqueada') || err.message.includes('inconsistência')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else if (err.message.includes('sem obra vinculada')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else if (err.message.includes('OBRIGATÓRIA')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else {
        toast.error(err.message);
      }
    },
  });
  const desconsolidarMut = trpc.folha.desconsolidarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento desconsolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); },
  });
  // Consolidar/Desconsolidar VALE INTERNO (via payrollEngine — sem checagens de PDF contábil)
  const consolidarValeMut = trpc.payrollEngine.consolidarVale.useMutation({
    onSuccess: () => { toast.success("Vale consolidado e travado!"); payrollPeriod.refetch(); statusMes.refetch(); lancamentos.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const desconsolidarValeMut = trpc.payrollEngine.desconsolidarVale.useMutation({
    onSuccess: () => { toast.success("Vale desconsolidado — pode ser recalculado."); payrollPeriod.refetch(); statusMes.refetch(); lancamentos.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const consolidarHEMut = trpc.payrollEngine.consolidarHE.useMutation({
    onSuccess: () => { toast.success("Hora Extra consolidada!"); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const desconsolidarHEMut = trpc.payrollEngine.desconsolidarHE.useMutation({
    onSuccess: () => { toast.success("Hora Extra desconsolidada."); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const consolidarAfericaoMut = trpc.payrollEngine.consolidarAfericao.useMutation({
    onSuccess: () => { toast.success("Aferição consolidada!"); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const desconsolidarAfericaoMut = trpc.payrollEngine.desconsolidarAfericao.useMutation({
    onSuccess: () => { toast.success("Aferição desconsolidada."); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const consolidarPagamentoMut = trpc.payrollEngine.consolidarPagamento.useMutation({
    onSuccess: () => { toast.success("Pagamento consolidado!"); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const desconsolidarPagamentoMut = trpc.payrollEngine.desconsolidarPagamento.useMutation({
    onSuccess: () => { toast.success("Pagamento desconsolidado."); payrollPeriod.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  function baixarArquivoRemessa(data: { arquivo: string; nomeArquivo: string }) {
    const blob = new Blob([data.arquivo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  const gerarRemessaMut = trpc.payrollEngine.gerarRemessaCnab.useMutation({
    onSuccess: (data) => {
      baixarArquivoRemessa(data);
      toast.success(`Remessa ${data.banco} gerada: ${data.totalFuncionarios} funcionários, ${formatBRL(data.totalValor)}`);
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. — "Gerar Remessas Selecionadas": usuário marca N bancos e o sistema gera
  // 1 arquivo .rem POR BANCO marcado (nunca um único arquivo combinado). Reusa a
  // mesma mutation gerarRemessaCnab (que já agrupa por conta-empresa), disparando
  // sequencialmente para não estourar o gate de sessão do backend nem embaralhar
  // downloads simultâneos no navegador.
  async function gerarRemessasSelecionadas(contas: Array<{ id: number; codigoBanco: string }>) {
    if (contas.length === 0) return;
    setGerandoRemessasLote(true);
    let sucesso = 0;
    const falhas: string[] = [];
    try {
      for (const conta of contas) {
        try {
          const data = await gerarRemessaMut.mutateAsync({
            companyId,
            mesReferencia: mesAno,
            codigoBanco: conta.codigoBanco,
            contaBancariaId: conta.id,
          });
          baixarArquivoRemessa(data);
          sucesso++;
          await new Promise((r) => setTimeout(r, 250));
        } catch (e: any) {
          falhas.push(e?.message || `Conta ${conta.id}`);
        }
      }
    } finally {
      setGerandoRemessasLote(false);
    }
    if (sucesso > 0) toast.success(`${sucesso} remessa${sucesso !== 1 ? "s" : ""} gerada${sucesso !== 1 ? "s" : ""} (1 arquivo por banco).`);
    if (falhas.length > 0) toast.error(`${falhas.length} falha(s): ${falhas.join(" | ")}`);
  }
  const excluirMut = trpc.folha.excluirLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento excluído!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); setViewMode("resumo"); },
  });

  // ── MO Alocação ─────────────────────────────────────────────────────────────
  const fecharFolhaMut = trpc.moAlocacao.fecharFolhaMes.useMutation({
    onSuccess: (d) => { toast.success(`Folha fechada — ${d.count} lançamentos encerrados.`); setFecharFolhaResult(d); lancamentos.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const exportarCustosObraMut = trpc.folha.exportarCustosObra.useMutation({
    onSuccess: (data) => {
      if (!data.base64) { toast.error("Nenhum dado para exportar"); return; }
      const byteCharacters = atob(data.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel exportado com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao exportar: ${err.message}`),
  });

  const limparMesMut = trpc.folha.limparMes.useMutation({
    onSuccess: () => {
      toast.success(`Mês ${formatMesAno(mesAno)} limpo com sucesso.`);
      setShowLimparMes(false);
      mesesComLanc.refetch();
      statusMes.refetch();
      lancamentos.refetch();
    },
    onError: (err) => toast.error(`Erro ao limpar mês: ${err.message}`),
  });

  const vincularObraMut = trpc.folha.vincularObrasManualmente.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.vinculados} funcionário(s) vinculado(s) com sucesso!`);
      custosPorObra.refetch();
      obrasListQuery.refetch();
      setSelectedSemObra(new Set());
      setVinculacaoObraId(null);
      setVinculacaoJustificativa("");
      setShowVinculacaoPanel(false);
    },
    onError: (err) => toast.error(`Erro ao vincular: ${err.message}`),
  });

  const handleVincularObra = () => {
    if (selectedSemObra.size === 0) return toast.error("Selecione pelo menos um funcionário");
    if (!vinculacaoObraId) return toast.error("Selecione uma obra");
    if (vinculacaoJustificativa.trim().length < 5) return toast.error("Justificativa deve ter pelo menos 5 caracteres");
    vincularObraMut.mutate({ companyId, companyIds, mesReferencia: mesAno,
      obraId: vinculacaoObraId,
      justificativa: vinculacaoJustificativa.trim(),
      employeeIds: Array.from(selectedSemObra),
      atribuidoPor: user?.name || undefined,
    });
  };

  // ===== HANDLERS =====
  const handleFileSelect = useCallback(async (files: FileList | null, tipo: "vale" | "pagamento" | "decimo_terceiro_1" | "decimo_terceiro_2") => {
    if (!files || files.length === 0) return;
    setUploading(tipo);
    startUploadProgress(files.length);

    const arquivos: Array<{ fileName: string; fileBase64: string; mimeType: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      arquivos.push({ fileName: file.name, fileBase64: base64, mimeType: file.type || "application/pdf" });
    }

    importarAutoMut.mutate({ companyId, companyIds, mesReferencia: mesAno,
      tipoLancamento: tipo,
      arquivos,
    });

    // Reset input
    if (tipo === "vale" && valeInputRef.current) valeInputRef.current.value = "";
    if (tipo === "pagamento" && pagInputRef.current) pagInputRef.current.value = "";
    if (tipo === "decimo_terceiro_1" && decimo1InputRef.current) decimo1InputRef.current.value = "";
    if (tipo === "decimo_terceiro_2" && decimo2InputRef.current) decimo2InputRef.current.value = "";
  }, [companyId, mesAno, importarAutoMut, startUploadProgress]);

  function openView(mode: ViewMode, lancId?: number, tipo?: string) {
    setViewMode(mode);
    if (lancId) setViewLancId(lancId);
    if (tipo) setViewTipo(tipo);
    setSearchTerm("");
    setFilterStatus("all");
    setFilterFuncao("all");
    setExpandedRows(new Set());
  }

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getMonthStatus(mes: number): "sem_dados" | "parcial" | "completo" | "consolidado" {
    const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
    const info = mesesComLanc.data?.[mesRef];
    if (!info) return "sem_dados";
    if (info.vale === "consolidado" && info.pagamento === "consolidado") return "consolidado";
    if (info.vale || info.pagamento) return "completo";
    return "parcial";
  }

  // Filter itens
  const filteredItens = useMemo(() => {
    if (!itensDetail.data) return [];
    let items = [...itensDetail.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter((i: any) =>
        i.nomeColaborador.toUpperCase().includes(term) ||
        (i.codigoContabil && i.codigoContabil.includes(term)) ||
        (i.funcao && i.funcao.toUpperCase().includes(term))
      );
    }
    if (filterStatus !== "all") items = items.filter((i: any) => i.matchStatus === filterStatus);
    if (filterFuncao !== "all") items = items.filter((i: any) => (i.funcao || "").toUpperCase() === filterFuncao);
    return items;
  }, [itensDetail.data, searchTerm, filterStatus, filterFuncao]);

  // Unique funcoes for filter
  const funcoes = useMemo(() => {
    if (!itensDetail.data) return [];
    const set = new Set<string>();
    itensDetail.data.forEach((i: any) => { if (i.funcao) set.add(i.funcao.toUpperCase()); });
    return Array.from(set).sort();
  }, [itensDetail.data]);

  const vale = statusMes.data?.vale;
  const pagamento = statusMes.data?.pagamento;
  const decimoTerceiro1 = statusMes.data?.decimoTerceiro1;
  const decimoTerceiro2 = statusMes.data?.decimoTerceiro2;
  const isNovembro = mesSelecionado === 11;
  const isDezembro = mesSelecionado === 12;

  // Hidden file inputs for direct upload
  const fileInputs = (
    <>
      <input ref={valeInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "vale")} />
      <input ref={pagInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "pagamento")} />
      <input ref={decimo1InputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "decimo_terceiro_1")} />
      <input ref={decimo2InputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "decimo_terceiro_2")} />
    </>
  );

  // ===== SUB-VIEWS =====
  if (viewMode === "detalhes" && viewLancId) {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Detalhes — {viewTipo}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | {filteredItens.length} funcionários</p>
              </div>
            </div>
            <PrintActions title={`Folha de Pagamento - ${viewTipo} - ${formatMesAno(mesAno)}`} />
          </div>

          {/* Stats bar — clicável como filtro */}
          {itensDetail.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total", value: itensDetail.data.length, filter: "all", bg: "bg-blue-50", bgActive: "bg-blue-200 ring-2 ring-blue-500", text: "text-blue-700" },
                { label: "Vinculados", value: itensDetail.data.filter((i: any) => i.matchStatus === "matched").length, filter: "matched", bg: "bg-green-50", bgActive: "bg-green-200 ring-2 ring-green-500", text: "text-green-700" },
                { label: "Divergentes", value: itensDetail.data.filter((i: any) => i.matchStatus === "divergente").length, filter: "divergente", bg: "bg-amber-50", bgActive: "bg-amber-200 ring-2 ring-amber-500", text: "text-amber-700" },
                { label: "Não Encontrados", value: itensDetail.data.filter((i: any) => i.matchStatus === "unmatched").length, filter: "unmatched", bg: "bg-red-50", bgActive: "bg-red-200 ring-2 ring-red-500", text: "text-red-700" },
              ].map(c => (
                <button key={c.label} onClick={() => setFilterStatus(filterStatus === c.filter ? "all" : c.filter)}
                  className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:scale-105 hover:shadow-md border-0 ${filterStatus === c.filter ? c.bgActive : c.bg}`}>
                  <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Buscar nome, código ou função..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todos os Status</option>
              <option value="matched">Vinculados</option>
              <option value="divergente">Divergentes</option>
              <option value="unmatched">Não Encontrados</option>
            </select>
            <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background max-w-[200px]">
              <option value="all">Todas as Funções</option>
              {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => { itensDetail.refetch(); verificacao.refetch(); toast.info("Dados atualizados!"); }}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${itensDetail.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => reprocessarMut.mutate({ folhaLancamentoId: viewLancId, companyId })}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reprocessarMut.isPending ? "animate-spin" : ""}`} /> Re-Match
            </Button>
          </div>

          {/* Table */}
          {itensDetail.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="p-2.5 font-medium w-8"></th>
                        <th className="p-2.5 font-medium">Cód.</th>
                        <th className="p-2.5 font-medium">Colaborador</th>
                        <th className="p-2.5 font-medium">Função</th>
                        <th className="p-2.5 font-medium text-center">Status</th>
                        <th className="p-2.5 font-medium text-right">Proventos</th>
                        <th className="p-2.5 font-medium text-right">Descontos</th>
                        <th className="p-2.5 font-medium text-right">Líquido</th>
                        <th className="p-2.5 font-medium">Divergências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItens.map((item: any) => {
                        const divergencias = item.divergencias ? (typeof item.divergencias === "string" ? JSON.parse(item.divergencias) : item.divergencias) : [];
                        const isExpanded = expandedRows.has(item.id);
                        const proventos = item.proventos ? (typeof item.proventos === "string" ? JSON.parse(item.proventos) : item.proventos) : [];
                        const descontos = item.descontos ? (typeof item.descontos === "string" ? JSON.parse(item.descontos) : item.descontos) : [];
                        return (
                          <tr key={item.id} className="contents">
                            <tr className={`border-b hover:bg-muted/30 cursor-pointer ${
                              item.matchStatus === "unmatched" ? "bg-red-50/50" :
                              item.matchStatus === "divergente" ? "bg-amber-50/50" : ""
                            }`} onClick={() => toggleRow(item.id)}>
                              <td className="p-2.5">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </td>
                              <td className="p-2.5 font-mono text-xs">{item.codigoContabil || "—"}</td>
                              <td className="p-2.5 font-medium text-sm">{item.nomeColaborador}</td>
                              <td className="p-2.5 text-xs text-muted-foreground">{item.funcao || "—"}</td>
                              <td className="p-2.5 text-center">
                                {item.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                                {item.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                                {item.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                              </td>
                              <td className="p-2.5 text-right text-sm">{formatBRL(item.totalProventos)}</td>
                              <td className="p-2.5 text-right text-sm text-red-600">{formatBRL(item.totalDescontos)}</td>
                              <td className="p-2.5 text-right font-bold text-sm">{formatBRL(item.liquido)}</td>
                              <td className="p-2.5">
                                {divergencias.length > 0 ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">{divergencias.length} alerta{divergencias.length > 1 ? "s" : ""}</Badge>
                                ) : item.matchStatus === "unmatched" ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Não encontrado</Badge>
                                ) : null}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-muted/20 border-b">
                                <td colSpan={9} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Proventos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-green-700 mb-2 flex items-center gap-1">
                                        <TrendingUp className="h-3.5 w-3.5" /> Proventos
                                      </h4>
                                      {proventos.length > 0 ? proventos.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{p.descricao}</span>
                                          <span className="font-medium">{formatBRL(p.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-green-700">{formatBRL(item.totalProventos)}</span>
                                      </div>
                                    </div>
                                    {/* Descontos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-red-700 mb-2 flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5" /> Descontos
                                      </h4>
                                      {descontos.length > 0 ? descontos.map((d: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{d.descricao}</span>
                                          <span className="font-medium text-red-600">{formatBRL(d.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-red-700">{formatBRL(item.totalDescontos)}</span>
                                      </div>
                                    </div>
                                    {/* Info */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-blue-700 mb-2 flex items-center gap-1">
                                        <Info className="h-3.5 w-3.5" /> Informações
                                      </h4>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between"><span className="text-muted-foreground">Admissão</span><span>{item.dataAdmissao || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span>{item.salarioBase ? formatBRL(item.salarioBase) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Horas Mensais</span><span>{item.horasMensais || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">INSS</span><span>{item.valorInss ? formatBRL(item.valorInss) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">FGTS</span><span>{item.valorFgts ? formatBRL(item.valorFgts) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">IRRF</span><span>{item.valorIrrf ? formatBRL(item.valorIrrf) : "—"}</span></div>
                                      </div>
                                      {divergencias.length > 0 && (
                                        <div className="mt-2 pt-2 border-t">
                                          <h5 className="text-xs font-semibold text-red-700 mb-1">Divergências:</h5>
                                          {divergencias.map((d: string, i: number) => (
                                            <p key={i} className="text-xs text-red-600">{d}</p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredItens.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item encontrado.</div>
                  )}
                </div>
                {/* Rodapé somatório dinâmico */}
                {filteredItens.length > 0 && (() => {
                  const totalProventos = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.totalProventos), 0);
                  const totalDescontos = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.totalDescontos), 0);
                  const totalLiquido = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.liquido), 0);
                  return (
                    <div className="border-t-2 border-[#1B2A4A] bg-[#1B2A4A]/5 p-4 rounded-b-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#1B2A4A]">TOTAL ({filteredItens.length} funcionários)</span>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Proventos</p>
                            <p className="text-sm font-bold text-green-700">{formatBRL(totalProventos)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Descontos</p>
                            <p className="text-sm font-bold text-red-600">{formatBRL(totalDescontos)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Líquido</p>
                            <p className="text-lg font-black text-[#1B2A4A]">{formatBRL(totalLiquido)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "custos_obra") {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#1B2A4A]" /> Custos por Obra — {viewTipo === "vale" ? "Vale" : "Pagamento"}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | Distribuição proporcional</p>
              </div>
            </div>
            <PrintActions title={`Custos por Obra — ${viewTipo === "vale" ? "Vale" : "Pagamento"} — ${formatMesAno(mesAno)}`} showExcel onExportExcel={() => {
              if (!viewLancId) return;
              exportarCustosObraMut.mutate({
                folhaLancamentoId: viewLancId,
                companyId,
                mesReferencia: mesAno,
                tipo: viewTipo,
              });
            }} />
          </div>

          {custosPorObra.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando custos por obra...</div>
          ) : custosPorObra.data && (custosPorObra.data.obrasResumo.length > 0 || custosPorObra.data.semObra) ? (
            <>
              {/* Summary cards */}
              {(() => {
                const rg = (custosPorObra.data as any).resumoGlobal;
                const comp = (custosPorObra.data as any).comparativos;
                const allObras = [...custosPorObra.data.obrasResumo, ...(custosPorObra.data.semObra ? [custosPorObra.data.semObra] : [])];
                const totalFuncs = rg?.totalFuncionarios ?? allObras.reduce((s: number, o: any) => s + (o.funcionarios?.length || 0), 0);
                const totalHN = rg?.totalHorasNormais ?? allObras.reduce((s: number, o: any) => s + (o.totalHoras || 0), 0);
                const totalHE = rg?.totalHorasExtras ?? allObras.reduce((s: number, o: any) => s + (o.totalHE || 0), 0);
                const pctHN = rg?.pctHorasNormais ?? 0;
                const pctHE = rg?.pctHorasExtras ?? 0;
                const VariacaoTag = ({ valor }: { valor: number }) => {
                  if (valor === 0) return <span className="text-xs text-gray-400">—</span>;
                  const isUp = valor > 0;
                  return <span className={`text-xs font-semibold ${isUp ? "text-red-600" : "text-green-600"}`}>{isUp ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}%</span>;
                };
                const mesAnteriorLabel = comp?.mesAnterior?.label ? formatMesAno(comp.mesAnterior.label) : "Mês anterior";
                const anoAnteriorLabel = comp?.anoAnterior?.label ? formatMesAno(comp.anoAnterior.label) : "Ano anterior";
                return (
                  <div className="space-y-3">
                    {/* Cards principais */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-700">{custosPorObra.data.obrasResumo.length}</p>
                        <p className="text-xs text-muted-foreground">Obras</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-green-700">{formatBRL(custosPorObra.data.totalGeral)}</p>
                        <p className="text-xs text-muted-foreground">Custo Total</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-purple-700">{totalFuncs}</p>
                        <p className="text-xs text-muted-foreground">Funcionários</p>
                      </div>
                      <div className="bg-sky-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-sky-700">{totalHN.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Horas Normais <span className="font-semibold">({pctHN}%)</span></p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-amber-700">{totalHE.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Horas Extras <span className="font-semibold">({pctHE}%)</span></p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{(totalHN + totalHE).toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Total Horas</p>
                      </div>
                    </div>

                    {/* Comparativos */}
                    {comp && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Mês anterior */}
                        <div className="border rounded-lg p-3 bg-white">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Comparativo com {mesAnteriorLabel}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-sm font-bold">Custo</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoCusto} />
                              {comp.mesAnterior.custoTotal > 0 && <p className="text-[10px] text-muted-foreground">{formatBRL(String(comp.mesAnterior.custoTotal.toFixed(2)).replace(".", ","))}</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Normais</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoHorasNormais} />
                              {comp.mesAnterior.horasNormais > 0 && <p className="text-[10px] text-muted-foreground">{comp.mesAnterior.horasNormais}h</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Extras</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoHE} />
                              {comp.mesAnterior.horasExtras > 0 && <p className="text-[10px] text-muted-foreground">{comp.mesAnterior.horasExtras}h</p>}
                            </div>
                          </div>
                        </div>
                        {/* Ano anterior */}
                        <div className="border rounded-lg p-3 bg-white">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Comparativo com {anoAnteriorLabel}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-sm font-bold">Custo</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoCusto} />
                              {comp.anoAnterior.custoTotal > 0 && <p className="text-[10px] text-muted-foreground">{formatBRL(String(comp.anoAnterior.custoTotal.toFixed(2)).replace(".", ","))}</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Normais</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoHorasNormais} />
                              {comp.anoAnterior.horasNormais > 0 && <p className="text-[10px] text-muted-foreground">{comp.anoAnterior.horasNormais}h</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Extras</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoHE} />
                              {comp.anoAnterior.horasExtras > 0 && <p className="text-[10px] text-muted-foreground">{comp.anoAnterior.horasExtras}h</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Obra cards */}
              <div className="space-y-3">
                {/* Obras com funcionários */}
                {custosPorObra.data.obrasResumo.map((obra: any) => (
                  <Card key={obra.obraId} className="border-l-4 border-l-[#1B2A4A]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base">{obra.obraNome}</h3>
                          <p className="text-xs text-muted-foreground">{obra.funcionarios?.length || 0} funcionários | {(obra.totalHoras || 0).toFixed(1)}h trabalhadas | {(obra.totalHE || 0).toFixed(1)}h extras</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-[#1B2A4A]">{formatBRL(obra.totalCusto)}</p>
                          <p className="text-xs text-muted-foreground">
                            {((parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100).toFixed(1)}% do total
                          </p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-[#1B2A4A] h-2 rounded-full" style={{
                          width: `${Math.min(100, (parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100)}%`
                        }} />
                      </div>
                      {obra.funcionarios && obra.funcionarios.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="pb-1 font-medium">Funcionário</th>
                                <th className="pb-1 font-medium">Função</th>
                                <th className="pb-1 font-medium text-right">Horas Trab.</th>
                                <th className="pb-1 font-medium text-right">Horas Extras</th>
                                <th className="pb-1 font-medium text-right">% Aloc.</th>
                                <th className="pb-1 font-medium text-right">Custo Alocado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {obra.funcionarios.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0">
                                  <td className="py-1.5 font-medium">{f.nome}</td>
                                  <td className="py-1.5 text-muted-foreground">{f.funcao || "—"}</td>
                                  <td className="py-1.5 text-right">{(f.horas || 0).toFixed(1)}h</td>
                                  <td className="py-1.5 text-right">{(f.horasExtras || 0) > 0 ? <span className="text-amber-600 font-medium">{f.horasExtras.toFixed(1)}h</span> : "—"}</td>
                                  <td className="py-1.5 text-right">{f.percentual != null ? <span className="text-blue-600 font-medium">{f.percentual.toFixed(1)}%</span> : "100%"}</td>
                                  <td className="py-1.5 text-right font-bold">{formatBRL(f.custoEstimado)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Seção Sem Obra Vinculada - com vinculação manual */}
                {custosPorObra.data.semObra && (custosPorObra.data.semObra as any).funcionarios?.length > 0 && ((() => {
                  const semObraData = custosPorObra.data.semObra as any;
                  return (
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Sem Obra Vinculada
                          </h3>
                          <p className="text-xs text-muted-foreground">{semObraData.funcionarios.length} funcionários | {(semObraData.totalHoras || 0).toFixed(1)}h trabalhadas</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {!showVinculacaoPanel && (
                            <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setShowVinculacaoPanel(true)}>
                              <Briefcase className="w-3.5 h-3.5 mr-1" /> Vincular Obra
                            </Button>
                          )}
                          <div className="text-right">
                            <p className="text-xl font-bold text-amber-600">{formatBRL(semObraData.totalCusto)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((parseBRLNum(semObraData.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100).toFixed(1)}% do total
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Painel de vinculação em lote */}
                      {showVinculacaoPanel && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-amber-600" />
                              Vincular Funcionários Selecionados a uma Obra
                            </h4>
                            <Button size="sm" variant="ghost" onClick={() => { setShowVinculacaoPanel(false); setSelectedSemObra(new Set()); }}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Obra destino *</label>
                              <select
                                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                                value={vinculacaoObraId || ""}
                                onChange={(e) => setVinculacaoObraId(e.target.value ? parseInt(e.target.value) : null)}
                              >
                                <option value="">Selecione a obra...</option>
                                {obrasParaSelect.map((o: any) => (
                                  <option key={o.id} value={o.id}>{o.nome}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Justificativa * (min. 5 caracteres)</label>
                              <input
                                type="text"
                                className="w-full border rounded-md px-3 py-2 text-sm"
                                placeholder="Ex: Funcionário sem ponto no período..."
                                value={vinculacaoJustificativa}
                                onChange={(e) => setVinculacaoJustificativa(e.target.value)}
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                size="sm"
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={handleVincularObra}
                                disabled={vincularObraMut.isPending || selectedSemObra.size === 0}
                              >
                                {vincularObraMut.isPending ? "Vinculando..." : `Vincular ${selectedSemObra.size} selecionado(s)`}
                              </Button>
                            </div>
                          </div>
                          {selectedSemObra.size === 0 && (
                            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                              <Info className="w-3 h-3" /> Marque os funcionários na tabela abaixo para vinculá-los.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full" style={{
                          width: `${Math.min(100, (parseBRLNum(semObraData.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100)}%`
                        }} />
                      </div>

                      {/* Tabela com checkboxes */}
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left">
                              {showVinculacaoPanel && (
                                <th className="pb-1 w-8">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={selectedSemObra.size === semObraData.funcionarios.length && semObraData.funcionarios.length > 0}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedSemObra(new Set(semObraData.funcionarios.map((f: any) => f.id)));
                                      } else {
                                        setSelectedSemObra(new Set());
                                      }
                                    }}
                                  />
                                </th>
                              )}
                              <th className="pb-1 font-medium">Funcionário</th>
                              <th className="pb-1 font-medium">Função</th>
                              <th className="pb-1 font-medium text-right">Horas Trab.</th>
                              <th className="pb-1 font-medium text-right">Horas Extras</th>
                              <th className="pb-1 font-medium text-right">% Aloc.</th>
                              <th className="pb-1 font-medium text-right">Custo Alocado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {semObraData.funcionarios.map((f: any) => (
                              <tr key={f.id} className={`border-b last:border-0 ${showVinculacaoPanel ? "cursor-pointer hover:bg-amber-50/50" : ""} ${selectedSemObra.has(f.id) ? "bg-amber-100/50" : ""}`}
                                onClick={() => {
                                  if (!showVinculacaoPanel) return;
                                  setSelectedSemObra(prev => {
                                    const next = new Set(prev);
                                    if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                                    return next;
                                  });
                                }}
                              >
                                {showVinculacaoPanel && (
                                  <td className="py-1.5 w-8">
                                    <input type="checkbox" className="rounded" checked={selectedSemObra.has(f.id)} readOnly />
                                  </td>
                                )}
                                <td className="py-1.5 font-medium">{f.nome}</td>
                                <td className="py-1.5 text-muted-foreground">{f.funcao || "—"}</td>
                                <td className="py-1.5 text-right">{(f.horas || 0).toFixed(1)}h</td>
                                <td className="py-1.5 text-right">{(f.horasExtras || 0) > 0 ? <span className="text-amber-600 font-medium">{f.horasExtras.toFixed(1)}h</span> : "—"}</td>
                                <td className="py-1.5 text-right">{f.percentual != null ? <span className="text-blue-600 font-medium">{f.percentual.toFixed(1)}%</span> : "100%"}</td>
                                <td className="py-1.5 text-right font-bold">{formatBRL(f.custoEstimado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })())}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum dado de custos por obra disponível.</p>
              <p className="text-xs text-muted-foreground mt-1">É necessário ter o controle de ponto importado e a folha de pagamento processada.</p>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "horas_extras") {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" /> Horas Extras — {formatMesAno(mesAno)}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Análise detalhada de horas extras por funcionário e por obra</p>
              </div>
            </div>
            <PrintActions title={`Horas Extras - ${formatMesAno(mesAno)}`} />
          </div>

          {horasExtras.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando horas extras...</div>
          ) : horasExtras.data ? (
            <>
              {/* Resumo Consolidado */}
              {(() => {
                const funcs = horasExtras.data.funcionarios || [];
                const totalHE = funcs.reduce((s: number, f: any) => s + f.totalHE, 0);
                const totalHE50 = funcs.reduce((s: number, f: any) => s + f.he50, 0);
                const totalHE100 = funcs.reduce((s: number, f: any) => s + f.he100, 0);
                const totalValor = funcs.reduce((s: number, f: any) => s + (f.valorEstimado || 0), 0);
                const totalFuncs = funcs.length;
                const totalObras = horasExtras.data.rankingObras?.length || 0;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card className="border-l-4 border-l-amber-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Total HE</p>
                        <p className="text-xl font-black text-amber-700">{totalHE.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-blue-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">HE 50%</p>
                        <p className="text-xl font-black text-blue-700">{totalHE50.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-red-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">HE 100%</p>
                        <p className="text-xl font-black text-red-700">{totalHE100.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-green-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Custo Estimado</p>
                        <p className="text-xl font-black text-green-700">{formatBRL(totalValor)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-slate-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Funcionários / Obras</p>
                        <p className="text-xl font-black">{totalFuncs} <span className="text-sm font-normal text-muted-foreground">/ {totalObras} obras</span></p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Ranking de Obras */}
              {horasExtras.data.rankingObras && horasExtras.data.rankingObras.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-amber-600" /> Ranking de Obras — Horas Extras
                    </h3>
                    <div className="space-y-2">
                      {horasExtras.data.rankingObras.map((obra: any, idx: number) => {
                        const obraKey = obra.obraId ? String(obra.obraId) : "sem";
                        const isActive = heObraFilter === obraKey;
                        return (
                          <button key={obraKey}
                            onClick={() => setHeObraFilter(isActive ? "all" : obraKey)}
                            className={`flex items-center gap-3 w-full text-left rounded-lg p-2 transition-all cursor-pointer ${
                              isActive ? "bg-amber-100 ring-2 ring-amber-500 shadow-sm" : "hover:bg-muted/50"
                            }`}>
                            <span className={`font-bold text-lg w-8 text-center ${idx === 0 ? "text-amber-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-orange-700" : "text-muted-foreground"}`}>
                              {idx + 1}º
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{obra.obraNome || "Sem Obra"}</span>
                                <span className="font-bold text-amber-700">{obra.totalHE.toFixed(1)}h</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-amber-500 h-2 rounded-full" style={{
                                  width: `${Math.min(100, (obra.totalHE / (horasExtras.data.rankingObras[0]?.totalHE || 1)) * 100)}%`
                                }} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{obra.totalHE.toFixed(1)}h extras</p>
                            </div>
                          </button>
                        );
                      })}
                      {heObraFilter !== "all" && (
                        <button onClick={() => setHeObraFilter("all")} className="text-xs text-amber-700 underline mt-1 cursor-pointer">
                          Limpar filtro
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de funcionários */}
              {horasExtras.data.funcionarios && horasExtras.data.funcionarios.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" /> Funcionários com Horas Extras
                        {heObraFilter !== "all" && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">Filtrado por obra</Badge>}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const filtered = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                            if (heObraFilter === "sem") return !f.obraId;
                            return String(f.obraId) === heObraFilter;
                          });
                          return `${filtered.length} funcionário${filtered.length !== 1 ? "s" : ""}`;
                        })()}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="p-2.5 font-medium">Funcionário</th>
                            <th className="p-2.5 font-medium">Função</th>
                            <th className="p-2.5 font-medium">Obra</th>
                            <th className="p-2.5 font-medium text-right">HE 50%</th>
                            <th className="p-2.5 font-medium text-right">HE 100%</th>
                            <th className="p-2.5 font-medium text-right">Total HE</th>
                            <th className="p-2.5 font-medium text-right">Valor Est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const funcs = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                              if (heObraFilter === "sem") return !f.obraId;
                              return String(f.obraId) === heObraFilter;
                            });
                            return funcs.map((f: any) => (
                              <tr key={f.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-2.5 font-medium">{f.nome}</td>
                                <td className="p-2.5 text-xs text-muted-foreground">{f.funcao || "—"}</td>
                                <td className="p-2.5 text-xs">{f.obraNome || "—"}</td>
                                <td className="p-2.5 text-right">{f.he50 > 0 ? `${f.he50.toFixed(1)}h` : "—"}</td>
                                <td className="p-2.5 text-right">{f.he100 > 0 ? `${f.he100.toFixed(1)}h` : "—"}</td>
                                <td className="p-2.5 text-right font-bold text-amber-700">{f.totalHE.toFixed(1)}h</td>
                                <td className="p-2.5 text-right font-bold">{formatBRL(f.valorEstimado)}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                      {/* Rodapé somatório HE */}
                      {horasExtras.data.funcionarios.length > 0 && (() => {
                        const funcs = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                          if (heObraFilter === "sem") return !f.obraId;
                          return String(f.obraId) === heObraFilter;
                        });
                        const totalHE = funcs.reduce((s: number, f: any) => s + f.totalHE, 0);
                        const totalValor = funcs.reduce((s: number, f: any) => s + (f.valorEstimado || 0), 0);
                        return (
                          <div className="border-t-2 border-amber-600 bg-amber-50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-amber-800">TOTAL ({funcs.length} funcionários)</span>
                              <div className="flex items-center gap-8">
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Total HE</p>
                                  <p className="text-sm font-bold text-amber-700">{totalHE.toFixed(1)}h</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Valor Estimado</p>
                                  <p className="text-lg font-black text-amber-800">{formatBRL(totalValor)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(!horasExtras.data.funcionarios || horasExtras.data.funcionarios.length === 0) && (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma hora extra registrada neste período.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "verificacao" && viewLancId) {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-700" /> Verificação Cruzada
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | Folha × Ponto × Cadastro</p>
              </div>
            </div>
            <PrintActions title={`Verificação Cruzada - ${formatMesAno(mesAno)}`} />
          </div>

          {verificacao.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Processando verificação cruzada...</div>
          ) : verificacao.data ? (
            <>
              {(() => {
                const comPonto = verificacao.data.verificacoes.filter((v: any) => v.ponto).length;
                const semPonto = verificacao.data.verificacoes.filter((v: any) => !v.ponto).length;
                const ok = verificacao.data.totalItens - verificacao.data.totalAlertas;
                const cards = [
                  { key: "all", label: "Total na Folha", value: verificacao.data.totalItens, bg: "bg-blue-50", bgActive: "bg-blue-200 ring-2 ring-blue-500", text: "text-blue-700" },
                  { key: "ok", label: "OK", value: ok, bg: "bg-green-50", bgActive: "bg-green-200 ring-2 ring-green-500", text: "text-green-700" },
                  { key: "alertas", label: "Com Alertas", value: verificacao.data.totalAlertas, bg: verificacao.data.totalAlertas > 0 ? "bg-red-50" : "bg-green-50", bgActive: "bg-red-200 ring-2 ring-red-500", text: verificacao.data.totalAlertas > 0 ? "text-red-600" : "text-green-600" },
                  { key: "comPonto", label: "Com Ponto", value: comPonto, bg: "bg-purple-50", bgActive: "bg-purple-200 ring-2 ring-purple-500", text: "text-purple-700" },
                  { key: "semPonto", label: "Sem Ponto", value: semPonto, bg: "bg-gray-50", bgActive: "bg-gray-300 ring-2 ring-gray-500", text: "text-gray-700" },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {cards.map(c => (
                      <button key={c.key} onClick={() => setVerificacaoFilter(verificacaoFilter === c.key ? "all" : c.key)}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:scale-105 hover:shadow-md border-0 ${verificacaoFilter === c.key && c.key !== "all" ? c.bgActive : c.bg}`}>
                        <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
                        <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                      </button>
                    ))}
                  </div>
                );
              })()}

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="p-2.5 font-medium">Cód.</th>
                          <th className="p-2.5 font-medium">Colaborador</th>
                          <th className="p-2.5 font-medium text-center">Match</th>
                          <th className="p-2.5 font-medium text-right">Líquido Folha</th>
                          <th className="p-2.5 font-medium text-right">Líquido ERP</th>
                          <th className="p-2.5 font-medium">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verificacao.data.verificacoes.filter((v: any) => {
                          if (verificacaoFilter === "all") return true;
                          if (verificacaoFilter === "ok") return v.alertas.length === 0;
                          if (verificacaoFilter === "alertas") return v.alertas.length > 0;
                          if (verificacaoFilter === "comPonto") return !!v.ponto;
                          if (verificacaoFilter === "semPonto") return !v.ponto;
                          return true;
                        }).map((v: any) => (
                          <tr key={v.id} className={`border-b last:border-0 hover:bg-muted/30 ${v.alertas.length > 0 ? "bg-red-50/30" : ""}`}>
                            <td className="p-2.5 font-mono text-xs">{v.codigo || "—"}</td>
                            <td className="p-2.5 font-medium">{v.nome}</td>
                            <td className="p-2.5 text-center">
                              {v.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                              {v.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                              {v.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                            </td>
                            <td className="p-2.5 text-right font-bold">{formatBRL(v.liquido)}</td>
                            <td className="p-2.5 text-right">{v.liquidoErp ? formatBRL(v.liquidoErp) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-2.5">
                              {v.alertas.length > 0 ? (
                                <div className="space-y-0.5">
                                  {v.alertas.map((a: string, i: number) => (
                                    <p key={i} className="text-xs text-red-600">{a}</p>
                                  ))}
                                </div>
                              ) : <CheckCircle className="h-4 w-4 text-green-500" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Nenhum dado disponível.</div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ===== DESCONTOS EPI VIEW =====
  if (viewMode === "descontos_epi") {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <DescontosEPIView companyId={companyId} mesAno={mesAno} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== DESCONTOS CLT VIEW =====
  if (viewMode === "descontos_clt" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <DescontosCLTView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== CRUZAMENTO HE VIEW =====
  if (viewMode === "consolidado" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <RelatorioConsolidadoView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  if (viewMode === "comparativo_completo" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <ComparativoFolhaErpView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  if (viewMode === "cruzamento_he" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <CruzamentoHEView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== CÁLCULO VALE VIEW =====
  if (viewMode === "calculo_vale" && valeResult) {
    const todosFunc = valeResult.funcionarios || [];
    const funcionariosComAlerta = todosFunc.filter((f: any) => f.temAlerta).sort((a: any, b: any) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    const funcionariosSemAlerta = todosFunc.filter((f: any) => !f.temAlerta).sort((a: any, b: any) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    const totalSemAlerta = funcionariosSemAlerta.reduce((s: number, f: any) => s + parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0)), 0);
    const totalSemAlertaEfetivo = funcionariosSemAlerta
      .filter((f: any) => f.status !== 'rejeitado' && !valeExcluirSel.has(f.employeeId))
      .reduce((s: number, f: any) => s + parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0)), 0);
    const hasAnyExcluidos = funcionariosSemAlerta.some((f: any) => f.status === 'rejeitado') || valeExcluirSel.size > 0;
    const totalComAlerta = funcionariosComAlerta.reduce((s: number, f: any) => s + parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0)), 0);
    const totalIRRetido = todosFunc.reduce((s: number, f: any) => s + (f.irRetido || 0), 0);
    const totalValeDinamico = todosFunc
      .filter((f: any) => f.status !== 'rejeitado' && !valeExcluirSel.has(f.employeeId))
      .reduce((s: number, f: any) => s + parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? 0)), 0);
    const funcPagos = todosFunc.filter((f: any) => f.status !== 'rejeitado');
    const funcNaoPagos = todosFunc.filter((f: any) => f.status === 'rejeitado');
    const comHE = todosFunc.filter((f: any) => (f.valorHE || 0) > 0);
    const totalHE = comHE.reduce((s: number, f: any) => s + (f.valorHE || 0), 0);

    const isEditado = (f: any) => f.editadoManualmente === true || (f.observacoes && (f.observacoes.includes('[EDITADO') || f.observacoes.includes('LÍQUIDO EDITADO')));
    const funcEditados = todosFunc.filter(isEditado);

    const matchSearch = (f: any) => !valeSearch || f.nome?.toUpperCase().includes(valeSearch.toUpperCase());
    const matchFilter = (f: any) => {
      if (valeFilter === "aprovados") return !f.temAlerta;
      if (valeFilter === "alertas") return !!f.temAlerta;
      if (valeFilter === "he") return (f.valorHE || 0) > 0;
      if (valeFilter === "pago") return f.status !== 'rejeitado';
      if (valeFilter === "naopago") return f.status === 'rejeitado';
      if (valeFilter === "editados") return isEditado(f);
      return true;
    };
    const rowVisible = (f: any) => matchSearch(f) && matchFilter(f);
    const filteredComAlerta = funcionariosComAlerta.filter(rowVisible);
    const filteredSemAlerta = funcionariosSemAlerta.filter(rowVisible);

    const cardClass = (active: boolean) =>
      `cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${active ? "ring-2 ring-primary ring-offset-1" : ""}`;
    
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Cálculo Interno — Vale / Adiantamento</h1>
                <p className="text-muted-foreground text-sm flex items-center gap-2">
                  {formatMesAno(mesAno)} • {valeResult.totalFuncionarios} funcionários • {valeResult.percentual}% do salário
                  {(payrollPeriod.data as any)?.status === 'vale_consolidado' && (
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      <Lock className="h-3 w-3" /> Consolidado
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 no-print">
              {isMaster && (
                <Button size="sm" variant="outline" className="text-xs"
                  onClick={() => { setArredOrigem('vale'); setArredOpen(true); }}
                  disabled={(payrollPeriod.data as any)?.status === 'vale_consolidado'}
                  title={(payrollPeriod.data as any)?.status === 'vale_consolidado' ? 'Vale consolidado — desconsolide para arredondar' : 'Arredondar líquidos para real cheio'}>
                  <Calculator className="h-4 w-4 mr-1" /> Arredondamento
                </Button>
              )}
              {(payrollPeriod.data as any)?.status !== 'vale_consolidado' && (
                <div className="flex flex-col items-end gap-0.5">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    onClick={() => consolidarValeMut.mutate({ companyId, mesReferencia: mesAno })}
                    disabled={consolidarValeMut.isPending || funcionariosComAlerta.length > 0}
                    title={funcionariosComAlerta.length > 0 ? `Resolva os ${funcionariosComAlerta.length} alerta(s) pendente(s) antes de consolidar` : undefined}>
                    <Lock className="h-4 w-4 mr-1" />
                    {consolidarValeMut.isPending ? "Consolidando..." : "Consolidar Vale"}
                  </Button>
                  {funcionariosComAlerta.length > 0 && (
                    <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {funcionariosComAlerta.length} alerta(s) pendente(s) — resolva antes de consolidar
                    </span>
                  )}
                </div>
              )}
              {(payrollPeriod.data as any)?.status === 'vale_consolidado' && (
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50"
                  onClick={() => desconsolidarValeMut.mutate({ companyId, mesReferencia: mesAno })}
                  disabled={desconsolidarValeMut.isPending}>
                  <Unlock className="h-4 w-4 mr-1" />
                  {desconsolidarValeMut.isPending ? "Abrindo..." : "Desconsolidar"}
                </Button>
              )}
              <PrintActions title={`Cálculo Vale - ${formatMesAno(mesAno)}`} />
            </div>
          </div>

          {/* RESUMO CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 no-print">
            <Card className={cardClass(valeFilter === "all")} onClick={() => setValeFilter("all")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-orange-700">{fmtNum(valeResult.totalFuncionarios)}</p>
                <p className="text-[10px] text-muted-foreground">Todos os Funcionários</p>
                {valeFilter === "all" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            <Card className={cardClass(false)}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{formatBRL(totalValeDinamico)}</p>
                <p className="text-[10px] text-muted-foreground">Total Vale (Geral)</p>
              </CardContent>
            </Card>
            <Card className={cardClass(valeFilter === "aprovados")} onClick={() => setValeFilter(valeFilter === "aprovados" ? "all" : "aprovados")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{fmtNum(funcionariosSemAlerta.length)}</p>
                <p className="text-[10px] text-muted-foreground">Aprovados Automaticamente</p>
                {valeFilter === "aprovados" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            <Card className={`${cardClass(valeFilter === "alertas")} ${funcionariosComAlerta.length > 0 ? "border-2 border-amber-400" : ""}`} onClick={() => setValeFilter(valeFilter === "alertas" ? "all" : "alertas")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{fmtNum(funcionariosComAlerta.length)}</p>
                <p className="text-[10px] text-muted-foreground">Com Alerta (Pendente)</p>
                {valeFilter === "alertas" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            <Card className={cardClass(valeFilter === "he")} onClick={() => setValeFilter(valeFilter === "he" ? "all" : "he")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{fmtNum(comHE.length)}</p>
                <p className="text-[10px] text-muted-foreground">Com Hora Extra</p>
                <p className="text-[10px] text-purple-600 mt-0.5">{formatBRL(totalHE)}</p>
                {valeFilter === "he" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            <Card className={`${cardClass(valeFilter === "pago")} border-green-200`} onClick={() => setValeFilter(valeFilter === "pago" ? "all" : "pago")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{fmtNum(funcPagos.length)}</p>
                <p className="text-[10px] text-muted-foreground">Pago</p>
                {valeFilter === "pago" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            <Card className={`${cardClass(valeFilter === "naopago")} ${funcNaoPagos.length > 0 ? "border-red-200" : ""}`} onClick={() => setValeFilter(valeFilter === "naopago" ? "all" : "naopago")}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{fmtNum(funcNaoPagos.length)}</p>
                <p className="text-[10px] text-muted-foreground">Não Pago</p>
                {valeFilter === "naopago" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
              </CardContent>
            </Card>
            {funcEditados.length > 0 && (
              <Card className={`${cardClass(valeFilter === "editados")} border-blue-200`} onClick={() => setValeFilter(valeFilter === "editados" ? "all" : "editados")}>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{fmtNum(funcEditados.length)}</p>
                  <p className="text-[10px] text-muted-foreground">Editado Manual</p>
                  {valeFilter === "editados" && <p className="text-[10px] text-primary mt-1 font-semibold">▲ Filtro ativo</p>}
                </CardContent>
              </Card>
            )}
            <Card className={cardClass(false)}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{fmtNum(valeResult.diasUteis)}</p>
                <p className="text-[10px] text-muted-foreground">Dias Úteis</p>
              </CardContent>
            </Card>
          </div>

          {valeResult.excluidos?.length > 0 && (
            <Card className="border-2 border-red-300 bg-red-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-red-500 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-red-800">{valeResult.excluidos.length} Funcionário(s) Excluído(s) do Cálculo</p>
                    <p className="text-xs text-red-600">Estes funcionários estão ativos como CLT mas não possuem valor hora cadastrado. Corrija no cadastro para incluí-los.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                  {valeResult.excluidos.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm text-red-700 bg-red-100 rounded px-2 py-1">
                      <Users className="h-3 w-3 shrink-0" />
                      <span className="font-medium">{e.nome}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ALERTAS - DECISÃO DO USUÁRIO */}
          {funcionariosComAlerta.length > 0 && (
            <Card className="border-2 border-amber-400 bg-amber-50/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-amber-800">Funcionários com Alerta — Decisão Necessária</p>
                    <p className="text-xs text-amber-700">Estes funcionários possuem situações que requerem sua análise. Decida se deseja pagar ou não o vale para cada um.</p>
                  </div>
                  <div className="ml-auto flex gap-2 no-print">
                    <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        const decisoes = funcionariosComAlerta.map((f: any) => ({ employeeId: f.employeeId, pagar: true }));
                        decidirValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirValeMut.isPending}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Aprovar Todos
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const decisoes = funcionariosComAlerta.map((f: any) => ({ employeeId: f.employeeId, pagar: false }));
                        decidirValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirValeMut.isPending}>
                      <XCircle className="h-3 w-3 mr-1" /> Rejeitar Todos
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-amber-300">
                        <th className="text-left py-2 px-2">Funcionário</th>
                        <th className="text-left py-2 px-2">Motivo do Alerta</th>
                        <th className="text-right py-2 px-2">Faltas (1-15)</th>
                        <th className="text-right py-2 px-2">Bruto</th>
                        <th className="text-right py-2 px-2">IR</th>
                        <th className="text-right py-2 px-2">Líquido</th>
                        <th className="text-center py-2 px-2 no-print">Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComAlerta.map((f: any, i: number) => (
                        <tr key={i} className="border-b border-amber-200 hover:bg-amber-100/50">
                          <td className="py-2 px-2 font-medium">
                            <button
                              className="text-left hover:text-blue-600 hover:underline focus:outline-none"
                              onClick={() => { setEspelhoPopupEmpId(f.employeeId); setEspelhoPopupEmpNome(f.nome || `ID ${f.employeeId}`); }}
                              title="Abrir espelho de ponto"
                            >
                              {f.nome}
                            </button>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              {f.alertaMotivo?.split(' | ').map((motivo: string, j: number) => (
                                <Badge key={j} className="bg-amber-200 text-amber-800 text-[10px]">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> {motivo}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="text-right py-2 px-2 font-medium text-red-600">{f.faltas}</td>
                          <td className="text-right py-2 px-2 font-bold">
                            {valeEditId === f.employeeId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-slate-400">R$</span>
                                <input
                                  type="text"
                                  value={valeEditValor}
                                  onChange={e => setValeEditValor(e.target.value)}
                                  className="w-24 h-7 text-right text-sm border rounded px-1 font-bold"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      editarValeMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoValor: valeEditValor });
                                    } else if (e.key === "Escape") {
                                      setValeEditId(null); setValeEditValor("");
                                    }
                                  }}
                                />
                                <button className="text-green-600 hover:text-green-800" title="Salvar" disabled={editarValeMut.isPending}
                                  onClick={() => editarValeMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoValor: valeEditValor })}>
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button className="text-slate-400 hover:text-slate-600" title="Cancelar"
                                  onClick={() => { setValeEditId(null); setValeEditValor(""); }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatBRL(f.valorTotalVale)}
                                {f.isMensalista && <span className="text-[9px] text-purple-600 font-normal ml-0.5">(M)</span>}
                                {isMaster && (
                                  <button className="text-slate-300 hover:text-blue-600 transition-colors no-print" title="Editar valor (Master)"
                                    onClick={() => { setValeEditId(f.employeeId); setValeEditValor(String(parseFloat(String(f.valorTotalVale || "0").replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2))); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-right py-2 px-2 text-red-600 text-xs">
                            {(f.irRetido || 0) > 0 ? `-${formatBRL(f.irRetido)}` : '—'}
                          </td>
                          <td className="text-right py-2 px-2 font-bold text-green-700">
                            {liqEditId === f.employeeId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-slate-400">R$</span>
                                <input
                                  type="text"
                                  value={liqEditValor}
                                  onChange={e => setLiqEditValor(e.target.value)}
                                  className="w-24 h-7 text-right text-sm border rounded px-1 font-bold text-green-700"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      editarLiquidoMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: liqEditValor });
                                    } else if (e.key === "Escape") {
                                      setLiqEditId(null); setLiqEditValor("");
                                    }
                                  }}
                                />
                                <button className="text-green-600 hover:text-green-800" title="Salvar" disabled={editarLiquidoMut.isPending}
                                  onClick={() => editarLiquidoMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: liqEditValor })}>
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button className="text-slate-400 hover:text-slate-600" title="Cancelar"
                                  onClick={() => { setLiqEditId(null); setLiqEditValor(""); }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatBRL(f.valorLiquido ?? f.valorTotalVale)}
                                {isMaster && (
                                  <button className="text-slate-300 hover:text-green-600 transition-colors no-print" title="Editar líquido (Master)"
                                    onClick={() => { setLiqEditId(f.employeeId); setLiqEditValor(String(parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? "0").toString().replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2))); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-center py-2 px-2 no-print">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50"
                                disabled={decidirValeMut.isPending}
                                onClick={() => decidirValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: true }] })}>
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Pagar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-500 text-red-700 hover:bg-red-50"
                                disabled={decidirValeMut.isPending}
                                onClick={() => decidirValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: false }] })}>
                                <XCircle className="h-3 w-3 mr-0.5" /> Não Pagar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-amber-400 bg-amber-100/50 font-bold">
                        <td className="py-2 px-2" colSpan={3}>TOTAL COM ALERTA ({funcionariosComAlerta.length})</td>
                        <td className="text-right py-2 px-2 text-lg">{formatBRL(totalComAlerta)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rev. 3317 — TOGGLE VISÃO GERAL / POR BANCO (espelha a Folha de Pagamento) */}
          <div className="flex items-center gap-2 flex-wrap no-print">
            <Button
              variant={valeSubView === "geral" ? "default" : "outline"}
              size="sm"
              onClick={() => setValeSubView("geral")}
              className="text-xs"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Visão Geral
            </Button>
            <Button
              variant={valeSubView === "por_banco" ? "default" : "outline"}
              size="sm"
              onClick={() => setValeSubView("por_banco")}
              className="text-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1" /> Por Banco
            </Button>
          </div>

          {valeSubView === "geral" && (<>
          {/* CAMPO DE BUSCA */}
          <div className="relative no-print">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar funcionário pelo nome..."
              value={valeSearch}
              onChange={e => setValeSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* TABELA DE FUNCIONÁRIOS APROVADOS */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 no-print">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-semibold text-sm">Funcionários Aprovados ({filteredSemAlerta.length})</span>
                {valeExcluirSel.size > 0 && (
                  <>
                    <span className="ml-2 text-xs text-muted-foreground">{valeExcluirSel.size} selecionado(s)</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto border-red-400 text-red-700 hover:bg-red-50 h-7 px-3 text-xs"
                      disabled={decidirValeMut.isPending}
                      onClick={() => {
                        if (!confirm(`Confirmar exclusão manual de ${valeExcluirSel.size} funcionário(s) do vale deste mês?`)) return;
                        const decisoes = Array.from(valeExcluirSel).map(id => ({ employeeId: id, pagar: false }));
                        decidirValeMut.mutate(
                          { companyId, companyIds, mesReferencia: mesAno, decisoes },
                          { onSuccess: () => setValeExcluirSel(new Set()) }
                        );
                      }}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Não Pagar Selecionados
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setValeExcluirSel(new Set())}>
                      Limpar
                    </Button>
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="py-2 px-2 w-8 no-print">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={filteredSemAlerta.filter((f: any) => f.status !== 'rejeitado').length > 0 && filteredSemAlerta.filter((f: any) => f.status !== 'rejeitado').every((f: any) => valeExcluirSel.has(f.employeeId))}
                          onChange={e => {
                            if (e.target.checked) {
                              setValeExcluirSel(new Set(filteredSemAlerta.filter((f: any) => f.status !== 'rejeitado').map((f: any) => f.employeeId)));
                            } else {
                              setValeExcluirSel(new Set());
                            }
                          }}
                          title="Selecionar todos"
                        />
                      </th>
                      <th className="text-left py-2 px-2">Funcionário</th>
                      <th className="text-right py-2 px-2">Salário</th>
                      <th className="text-right py-2 px-2">Adiantamento ({valeResult.percentual}%)</th>
                      <th className="text-right py-2 px-2">Bruto</th>
                      <th className="text-right py-2 px-2">IR</th>
                      <th className="text-right py-2 px-2">Líquido</th>
                      <th className="text-center py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSemAlerta.map((f: any, i: number) => {
                      const isSel = valeExcluirSel.has(f.employeeId);
                      const isRejeitado = f.status === 'rejeitado';
                      const isHighlighted = isSel || isRejeitado;
                      return (
                        <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 ${isHighlighted ? "bg-red-50/40" : ""}`}>
                          <td className="py-2 px-2 no-print">
                            {!isRejeitado && (
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={isSel}
                                onChange={e => {
                                  setValeExcluirSel(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(f.employeeId);
                                    else next.delete(f.employeeId);
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </td>
                          <td className="py-2 px-2 font-medium">
                            <div className="flex items-center gap-1.5">
                              <button
                                className="text-left hover:text-blue-600 hover:underline focus:outline-none"
                                onClick={() => { setEspelhoPopupEmpId(f.employeeId); setEspelhoPopupEmpNome(f.nome || `ID ${f.employeeId}`); }}
                                title="Abrir espelho de ponto"
                              >
                                {f.nome}
                              </button>
                              {isEditado(f) && (
                                <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0 no-print" title="Valor editado manualmente">
                                  <PenLine className="h-2.5 w-2.5 mr-0.5" /> Editado
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="text-right py-2 px-2">{formatBRL(f.salarioBruto)}</td>
                          <td className="text-right py-2 px-2">{formatBRL(f.valorAdiantamento)}</td>
                          <td className={`text-right py-2 px-2 font-bold ${isHighlighted ? "line-through text-red-500" : ""}`}>
                            {valeEditId === f.employeeId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-slate-400">R$</span>
                                <input
                                  type="text"
                                  value={valeEditValor}
                                  onChange={e => setValeEditValor(e.target.value)}
                                  className="w-24 h-7 text-right text-sm border rounded px-1 font-bold"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      editarValeMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoValor: valeEditValor });
                                    } else if (e.key === "Escape") {
                                      setValeEditId(null); setValeEditValor("");
                                    }
                                  }}
                                />
                                <button className="text-green-600 hover:text-green-800" title="Salvar" disabled={editarValeMut.isPending}
                                  onClick={() => editarValeMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoValor: valeEditValor })}>
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button className="text-slate-400 hover:text-slate-600" title="Cancelar"
                                  onClick={() => { setValeEditId(null); setValeEditValor(""); }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatBRL(f.valorTotalVale)}
                                {f.isMensalista && <span className="text-[9px] text-purple-600 font-normal ml-0.5">(M)</span>}
                                {isMaster && !isRejeitado && (
                                  <button className="text-slate-300 hover:text-blue-600 transition-colors no-print" title="Editar valor (Master)"
                                    onClick={() => { setValeEditId(f.employeeId); setValeEditValor(String(parseFloat(String(f.valorTotalVale || "0").replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2))); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className={`text-right py-2 px-2 text-red-600 text-xs ${isHighlighted ? "line-through" : ""}`}>
                            {(f.irRetido || 0) > 0 ? `-${formatBRL(f.irRetido)}` : '—'}
                          </td>
                          <td className={`text-right py-2 px-2 font-bold text-green-700 ${isHighlighted ? "line-through text-red-500" : ""}`}>
                            {liqEditId === f.employeeId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-slate-400">R$</span>
                                <input
                                  type="text"
                                  value={liqEditValor}
                                  onChange={e => setLiqEditValor(e.target.value)}
                                  className="w-24 h-7 text-right text-sm border rounded px-1 font-bold text-green-700"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      editarLiquidoMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: liqEditValor });
                                    } else if (e.key === "Escape") {
                                      setLiqEditId(null); setLiqEditValor("");
                                    }
                                  }}
                                />
                                <button className="text-green-600 hover:text-green-800" title="Salvar" disabled={editarLiquidoMut.isPending}
                                  onClick={() => editarLiquidoMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: liqEditValor })}>
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button className="text-slate-400 hover:text-slate-600" title="Cancelar"
                                  onClick={() => { setLiqEditId(null); setLiqEditValor(""); }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatBRL(f.valorLiquido ?? f.valorTotalVale)}
                                {isMaster && !isRejeitado && (
                                  <button className="text-slate-300 hover:text-green-600 transition-colors no-print" title="Editar líquido (Master)"
                                    onClick={() => { setLiqEditId(f.employeeId); setLiqEditValor(String(parseFloat(String(f.valorLiquido ?? f.valorTotalVale ?? "0").toString().replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2))); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-center py-2 px-2">
                            {isRejeitado ? (
                              <button
                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                                onClick={() => {
                                  if (!confirm(`Reverter vale de ${f.nome}? O funcionário voltará a receber o adiantamento.`)) return;
                                  reverterValeMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId });
                                }}
                                disabled={reverterValeMut.isPending}
                              >
                                <RefreshCw className="h-3 w-3 mr-0.5" /> Reverter
                              </button>
                            ) : (
                              // Rev. 3313 — antes era um Badge NÃO-clicável ("Excluir"/"OK"):
                              // o usuário clicava esperando excluir e nada acontecia (a única
                              // ação real era o botão de lote "Não Pagar Selecionados"). Agora é
                              // um botão que exclui ESTE funcionário do vale (decidirVale pagar:false).
                              <button
                                className="text-[10px] text-red-600 hover:text-red-800 hover:underline flex items-center gap-0.5 mx-auto no-print disabled:opacity-50"
                                title="Excluir este funcionário do vale (não pagar este mês)"
                                onClick={() => {
                                  if (!confirm(`Excluir ${f.nome} do vale deste mês? O funcionário NÃO receberá o adiantamento.`)) return;
                                  decidirValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: false }] });
                                  setValeExcluirSel(prev => { const n = new Set(prev); n.delete(f.employeeId); return n; });
                                }}
                                disabled={decidirValeMut.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-0.5" /> Excluir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                      <td className="py-2 px-2 no-print"></td>
                      <td className="py-2 px-2">TOTAL APROVADOS</td>
                      <td className="text-right py-2 px-2">—</td>
                      <td className="text-right py-2 px-2">—</td>
                      <td className="text-right py-2 px-2">
                        {hasAnyExcluidos ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-sm line-through text-red-400">{formatBRL(totalSemAlerta)}</span>
                            <span className="text-lg text-[#1B2A4A]">{formatBRL(totalSemAlertaEfetivo)}</span>
                          </div>
                        ) : (
                          <span className="text-lg">{formatBRL(totalSemAlerta)}</span>
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
          </>)}

          {valeSubView === "por_banco" && (() => {
            // Rev. 3317 — Agrupa o vale pela CONTA DA EMPRESA PARA PAGAMENTO
            // (mesma lógica da Folha de Pagamento). O snapshot do vale não carrega
            // os campos de conta-empresa, então fazemos o JOIN com o mapa
            // `contasBancariasFolha` (employeeId → conta-empresa). Funcionários sem
            // conta-empresa definida caem em "Sem conta definida".
            const SEM_CONTA = "__sem_conta__";
            const mapaContas = new Map<number, any>(
              (contasBancariasFolha.data || []).map((c: any) => [Number(c.employeeId), c])
            );
            const valeFuncs = ((valeResult?.funcionarios || []) as any[])
              .filter((f: any) => f.status !== 'rejeitado' && !valeExcluirSel.has(f.employeeId));
            const liqDe = (f: any) => parseBRLNum(String(f.valorLiquido ?? f.valorTotalVale ?? 0));
            const brutoDe = (f: any) => parseBRLNum(String(f.valorTotalVale ?? 0));
            const irDe = (f: any) => parseBRLNum(String(f.irRetido ?? 0));
            const byAcct: Record<string, any[]> = {};
            const acctMeta: Record<string, any> = {};
            for (const f of valeFuncs) {
              const cb = mapaContas.get(Number(f.employeeId));
              const key = cb?.contaEmpresaId ? String(cb.contaEmpresaId) : SEM_CONTA;
              if (!byAcct[key]) {
                byAcct[key] = [];
                acctMeta[key] = key === SEM_CONTA ? null : {
                  id: cb.contaEmpresaId,
                  banco: cb.contaEmpresaBanco || "Banco",
                  agencia: cb.contaEmpresaAgencia || null,
                  conta: cb.contaEmpresaConta || null,
                  tipo: cb.contaEmpresaTipo || null,
                  apelido: cb.contaEmpresaApelido || null,
                };
              }
              byAcct[key].push({ ...f, _cb: cb });
            }
            const acctKeys = Object.keys(byAcct).sort((a, b) => {
              if (a === SEM_CONTA) return 1;
              if (b === SEM_CONTA) return -1;
              const ma = acctMeta[a], mb = acctMeta[b];
              return ((ma?.banco || '').localeCompare(mb?.banco || '')) || ((ma?.agencia || '').localeCompare(mb?.agencia || ''));
            });
            const bankColors: Record<string, string> = {
              "Caixa": "bg-blue-600", "Bradesco": "bg-red-600", "Santander": "bg-red-700",
              "Itaú": "bg-orange-500", "C6": "bg-gray-800", "Nubank": "bg-purple-600",
              "Inter": "bg-orange-600", "Banco do Brasil": "bg-yellow-600",
            };
            const dotColorFor = (meta: any): string => {
              if (!meta) return "bg-gray-400";
              const banco = meta.banco || '';
              for (const k of Object.keys(bankColors)) {
                if (banco.toLowerCase().includes(k.toLowerCase())) return bankColors[k];
              }
              return "bg-gray-500";
            };
            const acctLabel = (meta: any): string => !meta ? "Sem conta definida" : (meta.apelido || meta.banco);
            const acctSubtitle = (meta: any): string | null => {
              if (!meta) return null;
              const parts: string[] = [];
              if (meta.apelido && meta.banco && meta.apelido !== meta.banco) parts.push(meta.banco);
              if (meta.agencia) parts.push(`Ag ${meta.agencia}`);
              if (meta.conta) parts.push(`Cc ${meta.conta}`);
              return parts.length ? parts.join(' • ') : null;
            };
            if (valeFuncs.length === 0) {
              return (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum funcionário no vale para exibir por banco.
                </CardContent></Card>
              );
            }
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {acctKeys.map(key => {
                    const meta = acctMeta[key];
                    const bkFuncs = byAcct[key];
                    const totalLiq = bkFuncs.reduce((s: number, f: any) => s + liqDe(f), 0);
                    const subtitle = acctSubtitle(meta);
                    return (
                      <div key={key} className="bg-white border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`h-3 w-3 rounded-full ${dotColorFor(meta)}`} />
                          <span className="text-sm font-semibold">{acctLabel(meta)}</span>
                        </div>
                        {subtitle && <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{subtitle}</p>}
                        <p className="text-lg font-bold text-[#1B2A4A]">{formatBRL(totalLiq)}</p>
                        <p className="text-[10px] text-muted-foreground">{bkFuncs.length} funcionário{bkFuncs.length !== 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>

                {acctKeys.map(key => {
                  const meta = acctMeta[key];
                  const bkFuncs = byAcct[key];
                  const totalLiq = bkFuncs.reduce((s: number, f: any) => s + liqDe(f), 0);
                  const totalBruto = bkFuncs.reduce((s: number, f: any) => s + brutoDe(f), 0);
                  const totalIr = bkFuncs.reduce((s: number, f: any) => s + irDe(f), 0);
                  const subtitle = acctSubtitle(meta);
                  return (
                    <Card key={key} className="overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-3.5 w-3.5 rounded-full shrink-0 ${dotColorFor(meta)}`} />
                          <h3 className="font-semibold text-sm truncate">{acctLabel(meta)}</h3>
                          {subtitle && <span className="text-[10px] text-muted-foreground font-mono truncate hidden sm:inline">{subtitle}</span>}
                          <span className="text-xs text-muted-foreground bg-gray-200 px-2 py-0.5 rounded-full shrink-0">{bkFuncs.length}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-green-700">Bruto: <strong>{formatBRL(totalBruto)}</strong></span>
                          {totalIr > 0 && <span className="text-red-600">IR: <strong>-{formatBRL(totalIr)}</strong></span>}
                          <span className="text-[#1B2A4A] text-sm font-bold">{formatBRL(totalLiq)}</span>
                        </div>
                      </div>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                                <th className="text-left py-2 px-3 font-semibold">Funcionário</th>
                                <th className="text-left py-2 px-2 font-semibold">CPF</th>
                                <th className="text-left py-2 px-2 font-semibold">Agência</th>
                                <th className="text-left py-2 px-2 font-semibold">Conta</th>
                                <th className="text-left py-2 px-2 font-semibold">Tipo</th>
                                <th className="text-left py-2 px-2 font-semibold">Pix</th>
                                <th className="text-right py-2 px-2 font-semibold text-green-700">Bruto</th>
                                <th className="text-right py-2 px-2 font-semibold text-red-600">IR</th>
                                <th className="text-right py-2 px-3 font-semibold text-[#1B2A4A]">Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bkFuncs.sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || '')).map((f: any, i: number) => {
                                const zebra = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                                const cb = f._cb;
                                const pixInfo = cb?.tipoChavePix ? `${cb.tipoChavePix}: ${cb.chavePix || '—'}` : '—';
                                const ir = irDe(f);
                                return (
                                  <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${zebra}`}>
                                    <td className="py-2 px-3 font-medium whitespace-nowrap">{f.nome}</td>
                                    <td className="py-2 px-2 text-muted-foreground font-mono text-[10px]">{cb?.cpf || '—'}</td>
                                    <td className="py-2 px-2 font-mono text-[10px]">{meta?.agencia || '—'}</td>
                                    <td className="py-2 px-2 font-mono text-[10px]">{meta?.conta || '—'}</td>
                                    <td className="py-2 px-2 text-[10px]">{meta?.tipo || '—'}</td>
                                    <td className="py-2 px-2 text-[10px] max-w-[160px] truncate" title={pixInfo}>{pixInfo}</td>
                                    <td className="text-right py-2 px-2 text-green-700">{formatBRL(brutoDe(f))}</td>
                                    <td className="text-right py-2 px-2 text-red-600">{ir > 0 ? `-${formatBRL(ir)}` : '—'}</td>
                                    <td className="text-right py-2 px-3 font-bold text-[#1B2A4A]">{formatBRL(liqDe(f))}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-xs">
                                <td className="py-2.5 px-3" colSpan={6}>SUBTOTAL — {bkFuncs.length} funcionário{bkFuncs.length !== 1 ? 's' : ''}</td>
                                <td className="text-right py-2.5 px-2 text-green-700">{formatBRL(totalBruto)}</td>
                                <td className="text-right py-2.5 px-2 text-red-600">{totalIr > 0 ? `-${formatBRL(totalIr)}` : '—'}</td>
                                <td className="text-right py-2.5 px-3 text-[#1B2A4A] text-sm">{formatBRL(totalLiq)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <ArredondamentoDialog
          open={arredOpen && arredOrigem === 'vale'}
          onOpenChange={setArredOpen}
          origem="vale"
          funcionarios={valeResult?.funcionarios || []}
          isPending={arredondarMut.isPending}
          onAplicar={aplicarArred}
        />
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  // ===== CÁLCULO PAGAMENTO VIEW =====
  if (viewMode === "alertas_afericao") {
    const alertas = (alertasAfericao.data || []) as any[];
    const alertasAgrupados = alertas.reduce((acc: Record<string, any[]>, a: any) => {
      const key = `${a.employeeId}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(a);
      return acc;
    }, {} as Record<string, any[]>);
    const funcionariosList = Object.values(alertasAgrupados).map((dias: any[]) => ({
      employeeId: dias[0].employeeId,
      nomeCompleto: dias[0].nomeCompleto,
      codigoInterno: dias[0].codigoInterno,
      funcao: dias[0].funcao,
      diasSemRegistro: dias.length,
      valorTotal: dias.reduce((s: number, d: any) => s + parseBRLNum(d.valorTotal || '0'), 0),
      datas: dias.map((d: any) => d.data),
    }));
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Alertas da Aferição — Sem Registro de Ponto</h1>
                <p className="text-sm text-muted-foreground">Funcionários sem batida no DIXI durante o período "no escuro". Corrija no Espelho de Ponto e depois reaferição.</p>
              </div>
            </div>
          </div>

          {alertasAfericao.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando alertas...</div>
          ) : alertas.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-800 font-medium">Nenhum alerta de sem registro.</p>
              <p className="text-sm text-green-600 mt-1">Todos os funcionários tiveram registro no período escuro, ou já foram corrigidos.</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">{alertas.length} dia(s) sem registro — {funcionariosList.length} funcionário(s)</p>
                    <p className="text-sm text-amber-700 mt-1">Estes funcionários estavam escalados no período "no escuro" mas não tiveram batida no relógio DIXI.</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-800">Como resolver:</p>
                    <ol className="text-sm text-blue-700 mt-1 list-decimal ml-4 space-y-1">
                      <li>Clique no nome do funcionário para ver o detalhamento dia a dia</li>
                      <li>Vá ao <strong>Espelho de Ponto</strong> e corrija as batidas manualmente (adicionar batida, justificar falta, etc.)</li>
                      <li>Depois de corrigir, volte à Folha e clique <strong>"Reaferir"</strong> para reprocessar</li>
                    </ol>
                    <p className="text-xs text-blue-600 mt-2">Enquanto houver dias sem registro, o desconto será calculado na folha. Após corrigir no ponto e reaferir, os valores serão recalculados automaticamente.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-medium">Funcionário</th>
                      <th className="text-left p-3 font-medium">Função</th>
                      <th className="text-center p-3 font-medium">Dias s/ Registro</th>
                      <th className="text-right p-3 font-medium">Desconto Estimado</th>
                      <th className="text-center p-3 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionariosList.map((f: any) => (
                      <tr key={f.employeeId} className="border-t hover:bg-amber-50/50">
                        <td className="p-3">
                          <button className="text-left font-medium text-blue-700 hover:text-blue-900 hover:underline cursor-pointer" onClick={() => setDetalheAfericaoEmpId(f.employeeId)}>
                            {f.nomeCompleto || `ID ${f.employeeId}`}
                          </button>
                          <div className="text-xs text-muted-foreground">{fmtNum(f.codigoInterno)}</div>
                        </td>
                        <td className="p-3 text-muted-foreground">{f.funcao || '-'}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                            {f.diasSemRegistro} dia(s)
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-red-600">{formatBRL(f.valorTotal)}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => setDetalheAfericaoEmpId(f.employeeId)}>
                              <Eye className="h-3 w-3 mr-1" /> Detalhes
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                              onClick={() => { setEspelhoPopupEmpId(f.employeeId); setEspelhoPopupEmpNome(f.nomeCompleto || `ID ${f.employeeId}`); }}>
                              <FileText className="h-3 w-3 mr-1" /> Espelho
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <Dialog open={!!editadosConfirm?.show} onOpenChange={(open) => { if (!open) setEditadosConfirm(null); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  Valores Editados Manualmente
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-slate-700">
                      {editadosConfirm?.count} funcionário(s) tiveram valores de vale editados manualmente:
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                      <ul className="text-sm space-y-1">
                        {editadosConfirm?.nomes.map((nome, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Pencil className="h-3 w-3 text-amber-600 shrink-0" />
                            <span className="font-medium">{nome}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-sm text-slate-600">
                      O que deseja fazer?
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  variant="outline"
                  className="border-slate-300"
                  onClick={() => { setEditadosConfirm(null); }}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setEditadosConfirm(null);
                    gerarValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, preservarEditados: true });
                  }}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Manter Editados
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setEditadosConfirm(null);
                    gerarValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno, forcarRecalculoTodos: true });
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Recalcular Tudo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!detalheAfericaoEmpId} onOpenChange={(open) => { if (!open) setDetalheAfericaoEmpId(null); }}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-0" resizable={false}>
              <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
                <DialogTitle className="flex items-center gap-2 text-base pr-8">
                  <CalendarDays className="h-5 w-5 text-amber-600 shrink-0" />
                  Detalhamento Dia a Dia — Período no Escuro
                </DialogTitle>
                {detalheAfericaoDias.data && (
                  <DialogDescription asChild>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">{detalheAfericaoDias.data.employee.nome} <span className="font-normal text-muted-foreground">({detalheAfericaoDias.data.employee.funcao || 'Sem função'})</span></div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span>Jornada: {(() => {
                          const j = detalheAfericaoDias.data!.employee.jornada;
                          if (!j) return '44h';
                          if (typeof j === 'string' && !j.startsWith('{') && !j.startsWith('[')) return j;
                          try {
                            const parsed = typeof j === 'string' ? JSON.parse(j) : j;
                            if (typeof parsed === 'object' && parsed !== null) {
                              const seg = parsed.seg || parsed.segunda;
                              if (seg?.entrada && seg?.saida) {
                                return `${seg.entrada} - ${seg.saida} (${seg.intervalo || '01:00'} intervalo)`;
                              }
                            }
                            return '44h';
                          } catch { return String(j).substring(0, 30); }
                        })()}</span>
                        <span>Período: {new Date(detalheAfericaoDias.data.periodoInicio + 'T12:00:00').toLocaleDateString('pt-BR')} a {new Date(detalheAfericaoDias.data.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        {(detalheAfericaoDias.data as any).descontoDiario > 0 && (
                          <span>Valor diário: <strong className="text-foreground">R$ {((detalheAfericaoDias.data as any).descontoDiario as number).toFixed(2)}</strong></span>
                        )}
                      </div>
                    </div>
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
              {detalheAfericaoDias.error ? (
                <div className="text-center py-8 text-red-600">Erro ao carregar: {detalheAfericaoDias.error.message}</div>
              ) : !detalheAfericaoDias.data ? (
                <div className="text-center py-8 text-muted-foreground">Carregando detalhamento...</div>
              ) : detalheAfericaoDias.data ? (() => {
                const dd = detalheAfericaoDias.data;
                const diasUteisSemReg = dd.dias.filter((d: any) => d.classificacao === 'dia_util' && !d.temRegistro);
                const diasComReg = dd.dias.filter((d: any) => d.temRegistro);
                const feriados = dd.dias.filter((d: any) => d.classificacao === 'feriado');
                const sabados = dd.dias.filter((d: any) => d.classificacao === 'sabado');
                const domingos = dd.dias.filter((d: any) => d.classificacao === 'domingo');
                const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <div className="text-lg font-bold text-green-700">{diasComReg.length}</div>
                        <div className="text-green-600">Com registro</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <div className="text-lg font-bold text-red-700">{diasUteisSemReg.length}</div>
                        <div className="text-red-600">Úteis s/ registro</div>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded p-2">
                        <div className="text-lg font-bold text-purple-700">{feriados.length}</div>
                        <div className="text-purple-600">Feriados</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded p-2">
                        <div className="text-lg font-bold text-blue-700">{sabados.length}</div>
                        <div className="text-blue-600">Sábados</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded p-2">
                        <div className="text-lg font-bold text-gray-700">{domingos.length}</div>
                        <div className="text-gray-600">Domingos</div>
                      </div>
                    </div>

                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 font-medium">Data</th>
                            <th className="text-center p-2 font-medium">Dia</th>
                            <th className="text-center p-2 font-medium">Classificação</th>
                            <th className="text-center p-2 font-medium">Registro?</th>
                            <th className="text-left p-2 font-medium">Obra</th>
                            <th className="text-center p-2 font-medium">Entrada</th>
                            <th className="text-center p-2 font-medium">Saída</th>
                            <th className="text-center p-2 font-medium">Horas</th>
                            <th className="text-right p-2 font-medium">Desconto</th>
                            <th className="text-center p-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dd.dias.map((dia: any, idx: number) => {
                            const bgClass = dia.classificacao === 'feriado' ? 'bg-purple-50'
                              : dia.classificacao === 'sabado' ? 'bg-blue-50/50'
                              : dia.classificacao === 'domingo' ? 'bg-gray-100'
                              : !dia.temRegistro ? 'bg-red-50' : '';
                            const descontoDia = dd.descontoDiario || 0;
                            const temDesconto = dia.classificacao === 'dia_util' && !dia.temRegistro && descontoDia > 0;
                            return (
                              <tr key={idx} className={`border-t ${bgClass}`}>
                                <td className="p-2 font-mono">{new Date(dia.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                <td className="p-2 text-center">{diasSemana[dia.diaSemana]}</td>
                                <td className="p-2 text-center">
                                  {dia.classificacao === 'feriado' && <Badge variant="outline" className="bg-purple-100 text-purple-700 text-[10px]">{dia.nomeFeriado}</Badge>}
                                  {dia.classificacao === 'sabado' && <Badge variant="outline" className="bg-blue-100 text-blue-700 text-[10px]">Sábado</Badge>}
                                  {dia.classificacao === 'domingo' && <Badge variant="outline" className="bg-gray-200 text-gray-700 text-[10px]">Domingo</Badge>}
                                  {dia.classificacao === 'dia_util' && <Badge variant="outline" className="text-[10px]">Dia Útil</Badge>}
                                </td>
                                <td className="p-2 text-center">
                                  {dia.temRegistro ? <CheckCircle className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                    : dia.classificacao === 'dia_util' ? <XCircle className="h-3.5 w-3.5 text-red-600 mx-auto" />
                                    : <span className="text-muted-foreground text-[10px]">N/A</span>}
                                </td>
                                <td className="p-2 text-left text-[10px] max-w-[120px] truncate" title={dia.obraNome || ''}>{dia.obraNome || '—'}</td>
                                <td className="p-2 text-center font-mono text-[10px]">{dia.entrada1 || '—'}</td>
                                <td className="p-2 text-center font-mono text-[10px]">{dia.saida2 || dia.saida1 || '—'}</td>
                                <td className="p-2 text-center font-mono text-[10px]">{dia.horasTrabalhadas || '—'}</td>
                                <td className="p-2 text-right font-mono text-[10px]">
                                  {temDesconto ? <span className="text-red-600 font-semibold">R$ {descontoDia.toFixed(2)}</span> : '—'}
                                </td>
                                <td className="p-2 text-center text-[10px]">
                                  {dia.classificacao === 'dia_util' ? (
                                    dia.temRegistro
                                      ? <Badge className="bg-green-100 text-green-700">{dia.afericaoResultado || 'ok'}</Badge>
                                      : <Badge className="bg-red-100 text-red-700">falta</Badge>
                                  ) : (
                                    dia.temRegistro
                                      ? <Badge className="bg-green-100 text-green-700">ok</Badge>
                                      : <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {diasUteisSemReg.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-red-800">
                              {diasUteisSemReg.length} dia(s) útil(eis) sem registro de ponto
                              {(dd.descontoDiario || 0) > 0 && (
                                <span className="ml-2 text-red-700 font-normal">
                                  — Desconto total estimado: R$ {(diasUteisSemReg.length * (dd.descontoDiario || 0)).toFixed(2)}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-red-700 mt-1">Estes dias eram dias úteis no período no escuro e o funcionário não teve nenhuma batida registrada no relógio. Corrija no Espelho de Ponto e depois reaferição.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : null}
              </div>
              <DialogFooter className="flex gap-2 px-6 py-3 shrink-0 border-t">
                <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    const nome = detalheAfericaoDias.data?.employee?.nome || `ID ${detalheAfericaoEmpId}`;
                    setDetalheAfericaoEmpId(null);
                    setEspelhoPopupEmpId(detalheAfericaoEmpId);
                    setEspelhoPopupEmpNome(nome);
                  }}>
                  <FileText className="h-4 w-4 mr-1" /> Abrir Espelho de Ponto
                </Button>
                <Button variant="outline" onClick={() => setDetalheAfericaoEmpId(null)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!memorialHePeriodId && !!memorialEmployeeId} onOpenChange={(open) => { if (!open) { setMemorialHePeriodId(null); setMemorialEmployeeId(null); } }}>
            {/* Rev. 1837 — Memorial HE redesign: header gradiente, KPIs de topo, tabela com sticky header e zebra moderna, fórmula em chips. */}
            <DialogContent className="max-w-4xl max-h-[92dvh] flex flex-col p-0 gap-0 overflow-hidden" resizable={false}>
              <DialogHeader className="px-5 sm:px-6 py-4 border-b shrink-0 bg-gradient-to-r from-purple-700 via-purple-600 to-fuchsia-600 text-white">
                <DialogTitle className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base sm:text-lg font-semibold leading-tight">Memorial de Cálculo</div>
                    <div className="text-xs font-normal text-purple-100/90 leading-tight">Hora Extra — detalhamento dia a dia</div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/60">
                {memorialQ.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                    <p className="text-sm">Carregando memorial...</p>
                  </div>
                ) : memorialQ.error ? (
                  <div className="m-4 sm:m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Erro ao carregar memorial: {memorialQ.error.message}</span>
                  </div>
                ) : memorialQ.data ? (() => {
                  const m = memorialQ.data;
                  const minsToHM = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}min`;
                  const periodoFmt = m.periodo.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_: any, y: string, mo: string, d: string) => `${d}/${mo}/${y}`);
                  const diasComHE = m.dias.filter((d: any) => d.heMins > 0).length;
                  return (
                    <div className="p-4 sm:p-6 space-y-4">
                      {/* Card funcionário + 4 chips */}
                      <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 px-4 py-3 border-b border-purple-200 flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-purple-700 shrink-0" />
                          <p className="font-bold uppercase tracking-wide text-sm text-purple-900 truncate" title={m.nome}>{m.nome}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-purple-100">
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Período</p>
                            <p className="text-xs font-semibold text-purple-900 truncate" title={periodoFmt}>{periodoFmt}</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Valor/hora</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">R$ {m.valorHora.toFixed(2).replace(".", ",")}</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Adic. útil</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">{m.percentualUtil}%</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Adic. dom/fer</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">{m.percentualFim}%</p>
                          </div>
                        </div>
                      </div>

                      {/* KPIs de topo */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl border border-blue-200 p-3 sm:p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-blue-600">Total HE</p>
                            <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-blue-700 tabular-nums leading-tight">{minsToHM(m.totalHEMins)}</p>
                          {(m.descontoAtrasoMins ?? 0) > 0 && (
                            <p className="text-[10px] text-amber-700 mt-1">líquido (após atrasos)</p>
                          )}
                        </div>
                        <div className="bg-white rounded-xl border border-purple-200 p-3 sm:p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-purple-600">Valor Total</p>
                            <Wallet className="h-4 w-4 text-purple-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-purple-700 tabular-nums leading-tight">R$ {m.valorTotal.toFixed(2).replace(".", ",")}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-emerald-200 p-3 sm:p-4 shadow-sm col-span-2 sm:col-span-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-emerald-600">Dias com HE</p>
                            <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums leading-tight">{diasComHE}<span className="text-sm font-medium text-emerald-500"> / {m.dias.length}</span></p>
                        </div>
                      </div>

                      {/* Tabela detalhada */}
                      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-slate-500" />
                          <h3 className="text-sm font-semibold text-slate-700">Detalhamento por dia</h3>
                          <span className="ml-auto text-[10px] text-slate-500">{m.dias.length} {m.dias.length === 1 ? "dia" : "dias"} no período</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-xs">
                            <thead>
                              <tr className="bg-slate-100/80 text-slate-700 text-[11px] uppercase tracking-wide">
                                <th className="py-2 px-3 font-semibold text-left">Data</th>
                                <th className="py-2 px-3 font-semibold text-center">Dia</th>
                                <th className="py-2 px-3 font-semibold text-center">Horários</th>
                                <th className="py-2 px-3 font-semibold text-right">Trab.</th>
                                <th className="py-2 px-3 font-semibold text-right">Jornada</th>
                                <th className="py-2 px-3 font-semibold text-right">HE</th>
                                <th className="py-2 px-3 font-semibold text-center">Adic.</th>
                                <th className="py-2 px-3 font-semibold text-center">Fonte</th>
                                <th className="py-2 px-3 font-semibold text-right">Cálculo</th>
                                <th className="py-2 px-3 font-semibold text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.dias.map((d: any, i: number) => (
                                <tr key={i} className={`border-t border-slate-100 ${d.feriado ? "bg-purple-50/60" : d.diaSemana === "Dom" ? "bg-red-50/60" : i % 2 === 0 ? "" : "bg-slate-50/40"} hover:bg-purple-50/40 transition-colors`}>
                                  <td className="py-1.5 px-3 font-mono whitespace-nowrap">{d.data.split("-").reverse().join("/")}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <span className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                      d.feriado ? "bg-purple-100 text-purple-700" :
                                      d.diaSemana === "Dom" ? "bg-red-100 text-red-700" :
                                      d.diaSemana === "Sáb" ? "bg-orange-100 text-orange-700" :
                                      "bg-slate-100 text-slate-700"
                                    }`} title={d.feriado ? "Feriado — HE 100%" : undefined}>{d.feriado ? "Fer" : d.diaSemana}</span>
                                  </td>
                                  <td className="py-1.5 px-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap">{d.horarios}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">{d.trabalhado}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">{d.jornada}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">{Math.floor(d.heMins / 60)}:{String(d.heMins % 60).padStart(2, "0")}</td>
                                  <td className="py-1.5 px-3 text-center tabular-nums">{d.percentual}%</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      d.fonte === "dixi" ? "bg-emerald-100 text-emerald-700" :
                                      d.fonte === "manual" ? "bg-purple-100 text-purple-700" :
                                      "bg-slate-100 text-slate-600"
                                    }`}>
                                      {d.fonte || "—"}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                    ({d.heMins}÷60)×{m.valorHora.toFixed(2)}×{d.fator.toFixed(1)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-bold text-purple-700 tabular-nums whitespace-nowrap">R$ {d.valorDia.toFixed(2).replace(".", ",")}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              {(m.descontoAtrasoMins ?? 0) > 0 ? (
                                <>
                                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs">
                                    <td colSpan={5} className="py-2 px-3 text-right text-slate-700 font-medium">HE Bruto</td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums text-blue-700">{minsToHM(m.totalHEGrossMins ?? m.totalHEMins)}</td>
                                    <td colSpan={3} className="py-2 px-3 text-right text-[10px] font-mono text-muted-foreground">
                                      {(m.totalHEUtilGrossMins ?? 0) > 0 && <span>Úteis: {minsToHM(m.totalHEUtilGrossMins)} </span>}
                                      {(m.totalHEFimGrossMins ?? 0) > 0 && <span>Dom/Fer: {minsToHM(m.totalHEFimGrossMins)}</span>}
                                    </td>
                                    <td className="py-2 px-3 text-right" />
                                  </tr>
                                  <tr className="bg-amber-50 text-xs">
                                    <td colSpan={5} className="py-2 px-3 text-right text-amber-800 font-medium" title={`Atrasos do período: ${minsToHM(m.totalAtrasoMins)} (descontados ${minsToHM(m.descontoAtrasoMins)} do HE)`}>
                                      (−) Atrasos descontados
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-800">−{minsToHM(m.descontoAtrasoMins)}</td>
                                    <td colSpan={3} className="py-2 px-3 text-right text-[10px] text-muted-foreground">
                                      Atraso total: {minsToHM(m.totalAtrasoMins)}
                                    </td>
                                    <td className="py-2 px-3 text-right" />
                                  </tr>
                                </>
                              ) : null}
                              <tr className="border-t-2 border-purple-200 bg-gradient-to-r from-purple-50 to-fuchsia-50 font-bold">
                                <td colSpan={5} className="py-2.5 px-3 text-right text-purple-900 uppercase text-[11px] tracking-wide">{(m.descontoAtrasoMins ?? 0) > 0 ? "Total Líquido" : "Total"}</td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">{minsToHM(m.totalHEMins)}</td>
                                <td colSpan={3} className="py-2.5 px-3 text-right text-[11px] font-mono text-muted-foreground">
                                  {m.totalHEUtilMins > 0 && <span>Úteis: {minsToHM(m.totalHEUtilMins)} </span>}
                                  {m.totalHEFimMins > 0 && <span>Dom/Fer: {minsToHM(m.totalHEFimMins)}</span>}
                                </td>
                                <td className="py-2.5 px-3 text-right text-base sm:text-lg text-purple-700 tabular-nums whitespace-nowrap">R$ {m.valorTotal.toFixed(2).replace(".", ",")}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Fórmula */}
                      <div className="bg-white rounded-xl border p-4 text-xs space-y-2 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Calculator className="h-4 w-4 text-slate-500" />
                          <p className="font-semibold text-slate-700 text-sm">Fórmula aplicada</p>
                        </div>
                        <p className="text-muted-foreground font-mono bg-slate-50 rounded px-2 py-1.5 border border-slate-100">Valor HE = (minutos HE ÷ 60) × Valor/Hora × (1 + Adicional% ÷ 100)</p>
                        <div className="space-y-1.5 pt-1">
                          {m.totalHEUtilMins > 0 && (
                            <p className="text-muted-foreground">
                              <span className="inline-block min-w-[110px] font-medium text-slate-600">Dias úteis:</span>
                              <span className="font-mono">({m.totalHEUtilMins}÷60) × R$ {m.valorHora.toFixed(2).replace(".",",")} × {(1 + m.percentualUtil / 100).toFixed(1)}</span>
                              <span className="mx-1.5">=</span>
                              <strong className="text-purple-700 tabular-nums">R$ {m.valorTotalUtil.toFixed(2).replace(".",",")}</strong>
                            </p>
                          )}
                          {m.totalHEFimMins > 0 && (
                            <p className="text-muted-foreground">
                              <span className="inline-block min-w-[110px] font-medium text-slate-600">Dom/Feriados:</span>
                              <span className="font-mono">({m.totalHEFimMins}÷60) × R$ {m.valorHora.toFixed(2).replace(".",",")} × {(1 + m.percentualFim / 100).toFixed(1)}</span>
                              <span className="mx-1.5">=</span>
                              <strong className="text-purple-700 tabular-nums">R$ {m.valorTotalFim.toFixed(2).replace(".",",")}</strong>
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-2 border-t mt-2">
                            <span className="font-semibold text-slate-800 text-sm">Total geral:</span>
                            <span className="ml-auto font-bold text-purple-700 text-base tabular-nums">R$ {m.valorTotal.toFixed(2).replace(".",",")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!espelhoPopupEmpId} onOpenChange={(open) => { if (!open) { setEspelhoPopupEmpId(null); setEspelhoEditDate(null); } }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" resizable={false}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Espelho de Ponto — {espelhoPopupEmpNome}
                </DialogTitle>
                <DialogDescription>
                  Período no Escuro: {espelhoPeriodo.inicio ? new Date(espelhoPeriodo.inicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''} a {espelhoPeriodo.fim ? new Date(espelhoPeriodo.fim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                  {' • '}Clique em <Pencil className="h-3 w-3 inline" /> para editar as batidas de um dia.
                </DialogDescription>
              </DialogHeader>

              {!espelhoPopupQ.data ? (
                <div className="text-center py-8 text-muted-foreground">Carregando espelho...</div>
              ) : (() => {
                const recordMap = (espelhoPopupQ.data as any)?.records || {};
                const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                const dateList: string[] = [];
                if (espelhoPeriodo.inicio && espelhoPeriodo.fim) {
                  const cur = new Date(espelhoPeriodo.inicio + 'T12:00:00');
                  const end = new Date(espelhoPeriodo.fim + 'T12:00:00');
                  while (cur <= end) { dateList.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
                }
                return (
                  <div className="space-y-3">
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 font-medium">Data</th>
                            <th className="text-center p-2 font-medium">Dia</th>
                            <th className="text-center p-2 font-medium">Entrada</th>
                            <th className="text-center p-2 font-medium">Saída</th>
                            <th className="text-center p-2 font-medium">Entrada 2</th>
                            <th className="text-center p-2 font-medium">Saída 2</th>
                            <th className="text-center p-2 font-medium">Horas</th>
                            <th className="text-center p-2 font-medium">Status</th>
                            <th className="text-center p-2 font-medium w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dateList.map((dateStr) => {
                            const dt = new Date(dateStr + 'T12:00:00');
                            const dow = dt.getDay();
                            const isSab = dow === 6;
                            const isDom = dow === 0;
                            const d = recordMap[dateStr] || null;
                            const temBatida = !!(d?.entrada1 || d?.saida1);
                            const bgClass = isDom ? 'bg-gray-100' : isSab ? 'bg-blue-50/50' : !temBatida ? 'bg-red-50' : '';
                            return (
                              <tr key={dateStr} className={`border-t ${bgClass} hover:bg-slate-50`}>
                                <td className="p-2 font-mono">{dt.toLocaleDateString('pt-BR')}</td>
                                <td className="p-2 text-center">{diasSemana[dow]}</td>
                                <td className="p-2 text-center font-mono">{d?.entrada1 || '—'}</td>
                                <td className="p-2 text-center font-mono">{d?.saida1 || '—'}</td>
                                <td className="p-2 text-center font-mono">{d?.entrada2 || '—'}</td>
                                <td className="p-2 text-center font-mono">{d?.saida2 || '—'}</td>
                                <td className="p-2 text-center font-mono">{d?.horasTrabalhadas || '—'}</td>
                                <td className="p-2 text-center">
                                  {!temBatida && !isDom && !isSab ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">SEM REG</span>
                                  ) : isDom ? (
                                    <span className="text-[10px] text-gray-400">DOM</span>
                                  ) : isSab ? (
                                    <span className="text-[10px] text-blue-400">SÁB</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">OK</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {!isDom && (
                                    <button
                                      className="p-1 rounded hover:bg-blue-100 text-blue-600"
                                      title="Editar batidas"
                                      onClick={() => {
                                        setEspelhoEditDate(dateStr);
                                        setEspelhoEditRecord(d);
                                        setEspelhoEditForm({
                                          entrada1: d?.entrada1 || "", saida1: d?.saida1 || "",
                                          entrada2: d?.entrada2 || "", saida2: d?.saida2 || "",
                                          justificativa: d?.justificativa || "", motivoAjuste: "Correção manual",
                                        });
                                      }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setEspelhoPopupEmpId(null); setEspelhoEditDate(null); }}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!espelhoEditDate} onOpenChange={(open) => { if (!open) setEspelhoEditDate(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Pencil className="h-4 w-4 text-slate-500" />
                  Editar Ponto — {espelhoEditDate ? new Date(espelhoEditDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  <span>Esta edição será gravada como <strong>ajuste manual</strong> e substituirá o registro original.</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 1</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">Entrada</label>
                      <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.entrada1} onChange={e => setEspelhoEditForm(f => ({ ...f, entrada1: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, entrada1: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">Saída</label>
                      <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.saida1} onChange={e => setEspelhoEditForm(f => ({ ...f, saida1: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, saida1: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 2 <span className="font-normal normal-case">(intervalo)</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">Entrada</label>
                      <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.entrada2} onChange={e => setEspelhoEditForm(f => ({ ...f, entrada2: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, entrada2: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500">Saída</label>
                      <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.saida2} onChange={e => setEspelhoEditForm(f => ({ ...f, saida2: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, saida2: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Motivo</label>
                  <input type="text" value={espelhoEditForm.motivoAjuste} onChange={e => setEspelhoEditForm(f => ({ ...f, motivoAjuste: e.target.value }))} placeholder="Motivo do ajuste" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Observação <span className="font-normal">(opcional)</span></label>
                  <textarea value={espelhoEditForm.justificativa} onChange={e => setEspelhoEditForm(f => ({ ...f, justificativa: e.target.value }))} rows={2} placeholder="Justificativa adicional..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setEspelhoEditDate(null)} className="flex-1">
                  <X className="h-4 w-4 mr-1.5" /> Cancelar
                </Button>
                <Button onClick={() => {
                  if (!espelhoEditDate || !espelhoPopupEmpId) return;
                  const dt = new Date(espelhoEditDate + 'T12:00:00');
                  const mesRef = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                  espelhoSaveMut.mutate({
                    companyId, employeeId: espelhoPopupEmpId, mesReferencia: mesRef, data: espelhoEditDate,
                    entrada1: espelhoEditForm.entrada1 || undefined, saida1: espelhoEditForm.saida1 || undefined,
                    entrada2: espelhoEditForm.entrada2 || undefined, saida2: espelhoEditForm.saida2 || undefined,
                    justificativa: espelhoEditForm.justificativa || undefined, motivoAjuste: espelhoEditForm.motivoAjuste || undefined,
                  });
                }} disabled={espelhoSaveMut.isPending} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white">
                  {espelhoSaveMut.isPending ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</> : <><Save className="h-4 w-4 mr-1.5" />Salvar Ajuste</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "calculo_pagamento" && pagamentoResult) {
    const pagamentoConsolidado = !!(payrollPeriod.data as any)?.pagamentoConsolidadoEm;
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Pagamento / Saldo</h1>
                <p className="text-muted-foreground text-xs">{formatMesAno(mesAno)} • {pagamentoResult.totalFuncionarios} funcionários • Pagamento previsto: {pagamentoResult.dataPagamentoPrevista}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMaster && (
                <Button size="sm" variant="outline" className="text-xs print:hidden"
                  onClick={() => { setArredOrigem('folha'); setArredOpen(true); }}
                  disabled={pagamentoConsolidado}
                  title={pagamentoConsolidado ? 'Pagamento consolidado — desconsolide para arredondar' : 'Arredondar líquidos para real cheio'}>
                  <Calculator className="h-4 w-4 mr-1" />
                  Arredondamento
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs print:hidden"
                onClick={() => setViewMode("auditoria_folha")}
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                Auditoria
              </Button>
              <PrintActions title={`Cálculo Pagamento - ${formatMesAno(mesAno)}`} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border rounded-lg p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{fmtNum(pagamentoResult.totalFuncionarios)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Funcionários</p>
              </div>
            </div>
            <div className="bg-white border rounded-lg p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-green-700">{formatBRL(pagamentoResult.totalBruto)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Bruto</p>
              </div>
            </div>
            <div className="bg-white border rounded-lg p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-red-600">{formatBRL(pagamentoResult.totalDescontos)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Descontos</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2D4A7A] rounded-lg p-3 flex items-center gap-3 text-white">
              <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatBRL(pagamentoResult.totalLiquido)}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-80">Total Líquido</p>
              </div>
            </div>
          </div>

          {pagamentoResult.pontoProcessado === false && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 print:hidden">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 text-sm">
                    Ponto não processado para {formatMesAno(mesAno)}
                  </p>
                  <p className="text-amber-700 text-xs mt-1">
                    Faltas, atrasos e DSR não serão computados porque o ponto ainda não foi processado nesta competência.
                    Volte à etapa de Ponto, importe os registros e processe antes de simular o pagamento.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(() => {
            const div = divergenciasFolha.data;
            const simDiv = pagamentoResult.divergencias;
            const hasSimDiv = simDiv && simDiv.length > 0;
            const hasLiveDiv = div && div.temDivergencia;
            if (!hasSimDiv && !hasLiveDiv) return null;
            const excluidos = hasLiveDiv ? div.excluidos : simDiv;
            const indevidos = hasLiveDiv ? div.indevidos : [];
            const totalAtivos = hasLiveDiv ? div.totalCltAtivos : pagamentoResult.totalCltAtivos;
            const totalFolha = hasLiveDiv ? div.totalNaFolha : pagamentoResult.totalFuncionarios;
            return (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 print:hidden">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-800 text-sm">
                      Divergência detectada: {totalAtivos} CLTs ativos no cadastro, mas {totalFolha} na folha
                    </p>
                    {excluidos && excluidos.length > 0 && (
                      <>
                        <p className="text-amber-700 text-xs mt-1">
                          {excluidos.length} funcionário(s) CLT ativo(s) excluído(s) da folha:
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {excluidos.map((d: any, i: number) => (
                            <li key={`exc-${i}`} className="text-xs text-amber-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
                              <strong>{d.nome}</strong>
                              {d.funcao && <span className="text-amber-600">({d.funcao})</span>}
                              <span className="text-amber-600">— {d.motivo}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {indevidos && indevidos.length > 0 && (
                      <>
                        <p className="text-red-700 text-xs mt-2 font-semibold">
                          {indevidos.length} funcionário(s) na folha que NÃO são CLT ativo:
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {indevidos.map((d: any, i: number) => (
                            <li key={`ind-${i}`} className="text-xs text-red-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                              <strong>{d.nome}</strong>
                              {d.funcao && <span className="text-red-600">({d.funcao})</span>}
                              <span className="text-red-600">— {d.motivo}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="text-amber-700 text-[10px] mt-2 italic">
                      Corrija o cadastro e resimule a folha para corrigir as divergências.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {pagamentoResult.valeForaDaFolha && pagamentoResult.valeForaDaFolha.length > 0 && (
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 print:hidden">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-blue-800 text-sm">
                    {pagamentoResult.valeForaDaFolha.length} funcionário(s) com vale calculado mas fora da folha mensal — bruto {formatBRL(pagamentoResult.totalValeForaDaFolha)} / líquido {formatBRL(pagamentoResult.totalValeForaDaFolhaLiquido ?? pagamentoResult.totalValeForaDaFolha)}
                  </p>
                  <p className="text-blue-700 text-xs mt-1">
                    Esses funcionários receberam vale mas não estão sendo descontados nesta folha (provavelmente terminados, sem ponto válido ou sem vínculo CLT ativo no mês). Por isso o total descontado em "VALE" é menor que o total do card "Calcular Vale". A coluna ao lado de cada nome mostra o valor BRUTO do vale.
                  </p>
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {pagamentoResult.valeForaDaFolha.map((f: any, i: number) => (
                      <li key={`vfa-${i}`} className="text-xs text-blue-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                        <strong>{f.nome}</strong>
                        {f.funcao && <span className="text-blue-600">({f.funcao})</span>}
                        <span className="text-blue-600 ml-auto">{formatBRL(f.valorBruto)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {pagamentoResult.alertasAvisoEncerrado && pagamentoResult.alertasAvisoEncerrado.length > 0 && (
            <Card className="border-2 border-amber-400 bg-amber-50/50 print:hidden">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-amber-800">Aviso Prévio Encerrando no Mês — Decisão Necessária</p>
                    <p className="text-xs text-amber-700">
                      Estes funcionários têm aviso prévio que ENCERRA dentro do mês de referência. Decida se devem ser pagos nesta folha. Eles ficam FORA dos totais até a decisão.
                    </p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        const decisoes = pagamentoResult.alertasAvisoEncerrado.map((f: any) => ({ employeeId: f.employeeId, pagar: true }));
                        decidirFolhaAvisoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirFolhaAvisoMut.isPending}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Pagar Todos
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const decisoes = pagamentoResult.alertasAvisoEncerrado.map((f: any) => ({ employeeId: f.employeeId, pagar: false }));
                        decidirFolhaAvisoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirFolhaAvisoMut.isPending}>
                      <XCircle className="h-3 w-3 mr-1" /> Excluir Todos
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-amber-300">
                        <th className="text-left py-2 px-2">Funcionário</th>
                        <th className="text-left py-2 px-2">Função</th>
                        <th className="text-left py-2 px-2">Aviso encerra em</th>
                        <th className="text-right py-2 px-2">Líquido Estimado</th>
                        <th className="text-center py-2 px-2">Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentoResult.alertasAvisoEncerrado.map((f: any, i: number) => (
                        <tr key={i} className="border-b border-amber-200 hover:bg-amber-100/50">
                          <td className="py-2 px-2 font-medium">{f.nome}</td>
                          <td className="py-2 px-2 text-slate-600">{f.funcao || '—'}</td>
                          <td className="py-2 px-2">{f.avisoDataFim ? new Date(f.avisoDataFim + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                          <td className="text-right py-2 px-2 font-bold text-green-700">{formatBRL(f.valorLiquidoEstimado)}</td>
                          <td className="text-center py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50"
                                disabled={decidirFolhaAvisoMut.isPending}
                                onClick={() => decidirFolhaAvisoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: true }] })}>
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Pagar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-500 text-red-700 hover:bg-red-50"
                                disabled={decidirFolhaAvisoMut.isPending}
                                onClick={() => decidirFolhaAvisoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: false }] })}>
                                <XCircle className="h-3 w-3 mr-0.5" /> Não Pagar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={pagamentoSubView === "geral" ? "default" : "outline"}
              size="sm"
              onClick={() => setPagamentoSubView("geral")}
              className="text-xs"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Visão Geral
            </Button>
            <Button
              variant={pagamentoSubView === "por_banco" ? "default" : "outline"}
              size="sm"
              onClick={() => setPagamentoSubView("por_banco")}
              className="text-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1" /> Por Banco
            </Button>
            {/* Toggle DSR Falta — Lei 605/49 Art. 6º */}
            <div className="ml-auto flex items-center gap-3 border rounded-md px-3 py-1.5 bg-amber-50 border-amber-200 print:hidden">
              <label className="flex items-center gap-1.5 text-[11px] text-amber-900 cursor-pointer">
                <Switch
                  checked={aplicarDsrFalta}
                  onCheckedChange={(v: boolean) => {
                    setAplicarDsrFalta(v);
                    if (pagamentoConsolidado) return;
                    setCalcType("pagamento");
                    simularPagamentoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, aplicarDsrFalta: v, manterOverrides: true, pontoInicioManual: periodoInicio, pontoFimManual: periodoFim });
                  }}
                  disabled={simularPagamentoMut.isPending || pagamentoConsolidado}
                />
                Descontar DSR Falta
              </label>
            </div>
            {/* Toggle Somar Diferença do Dissídio — Rev. 3989 */}
            <div className="flex items-center gap-3 border rounded-md px-3 py-1.5 bg-blue-50 border-blue-200 print:hidden">
              <label className="flex items-center gap-1.5 text-[11px] text-blue-900 cursor-pointer">
                <Switch
                  checked={somarDiferencaDissidio}
                  onCheckedChange={(v: boolean) => {
                    setSomarDiferencaDissidio(v);
                    if (pagamentoConsolidado) return;
                    setCalcType("pagamento");
                    simularPagamentoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, somarDiferencaDissidio: v, manterOverrides: true, pontoInicioManual: periodoInicio, pontoFimManual: periodoFim });
                  }}
                  disabled={simularPagamentoMut.isPending || pagamentoConsolidado}
                />
                Somar Diferença do Dissídio
              </label>
            </div>
          </div>

          {pagamentoSubView === "geral" && (() => {
            const allFuncs = (pagamentoResult.funcionarios || []) as any[];
            const funcoesUnicas = Array.from(new Set(
              allFuncs.map((f: any) => (f.funcao || '').trim()).filter(Boolean)
            )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
            return (
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={pagamentoSearch}
                    onChange={(e) => setPagamentoSearch(e.target.value)}
                    className="pl-8 h-9 text-xs"
                  />
                </div>
                <Select value={pagamentoFuncao} onValueChange={setPagamentoFuncao}>
                  <SelectTrigger className="md:w-72 h-9 text-xs">
                    <SelectValue placeholder="Filtrar por função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as funções ({funcoesUnicas.length})</SelectItem>
                    {funcoesUnicas.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(pagamentoSearch || pagamentoFuncao !== "__all__") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPagamentoSearch(""); setPagamentoFuncao("__all__"); }}
                    className="h-9 text-xs"
                  >
                    Limpar
                  </Button>
                )}
              </div>
            );
          })()}

          {pagamentoSubView === "por_banco" ? (() => {
            const funcs = (pagamentoResult.funcionarios || []) as any[];
            // Rev. — Agrupa pela CONTA DA EMPRESA PARA PAGAMENTO (conta salário
            // pela qual a empresa paga), NÃO pelo banco pessoal do funcionário.
            // Funcionários sem conta-empresa definida caem em "Sem conta definida"
            // (sem botão de remessa CNAB).
            const SEM_CONTA = "__sem_conta__";
            const byAcct: Record<string, any[]> = {};
            const acctMeta: Record<string, any> = {};
            for (const f of funcs) {
              const key = f.contaEmpresaId ? String(f.contaEmpresaId) : SEM_CONTA;
              if (!byAcct[key]) {
                byAcct[key] = [];
                acctMeta[key] = key === SEM_CONTA ? null : {
                  id: f.contaEmpresaId,
                  banco: f.contaEmpresaBanco || "Banco",
                  codigoBanco: f.contaEmpresaCodigoBanco || null,
                  agencia: f.contaEmpresaAgencia || null,
                  conta: f.contaEmpresaConta || null,
                  tipo: f.contaEmpresaTipo || null,
                  apelido: f.contaEmpresaApelido || null,
                };
              }
              byAcct[key].push(f);
            }
            const acctKeys = Object.keys(byAcct).sort((a, b) => {
              if (a === SEM_CONTA) return 1;
              if (b === SEM_CONTA) return -1;
              const ma = acctMeta[a], mb = acctMeta[b];
              return ((ma?.banco || '').localeCompare(mb?.banco || '')) || ((ma?.agencia || '').localeCompare(mb?.agencia || ''));
            });
            const bankColors: Record<string, string> = {
              "Caixa": "bg-blue-600",
              "Bradesco": "bg-red-600",
              "Santander": "bg-red-700",
              "Itaú": "bg-orange-500",
              "C6": "bg-gray-800",
              "Nubank": "bg-purple-600",
              "Inter": "bg-orange-600",
              "Banco do Brasil": "bg-yellow-600",
            };
            function getBankCode(bancoName: string): string | null {
              const lower = (bancoName || '').toLowerCase();
              if (lower.includes('caixa')) return '104';
              if (lower.includes('santander')) return '033';
              if (lower.includes('bradesco')) return '237';
              if (lower.includes('itau') || lower.includes('itaú')) return '341';
              if (lower.includes('c6')) return '336';
              if (lower.includes('nubank')) return '260';
              if (lower.includes('inter')) return '077';
              if (lower.includes('banco do brasil')) return '001';
              return null;
            }
            function dotColorFor(meta: any): string {
              if (!meta) return "bg-gray-400";
              const banco = meta.banco || '';
              for (const k of Object.keys(bankColors)) {
                if (banco.toLowerCase().includes(k.toLowerCase())) return bankColors[k];
              }
              return "bg-gray-500";
            }
            function acctLabel(meta: any): string {
              if (!meta) return "Sem conta definida";
              return meta.apelido || meta.banco;
            }
            function acctSubtitle(meta: any): string | null {
              if (!meta) return null;
              const parts: string[] = [];
              if (meta.apelido && meta.banco && meta.apelido !== meta.banco) parts.push(meta.banco);
              if (meta.agencia) parts.push(`Ag ${meta.agencia}`);
              if (meta.conta) parts.push(`Cc ${meta.conta}`);
              return parts.length ? parts.join(' • ') : null;
            }
            // Rev. — Contas elegíveis para remessa CNAB (mesmo gate do botão individual:
            // precisa de meta + codigoBanco + id numérico). Usado pela seleção em lote.
            const contasElegiveis: Array<{ key: string; id: number; codigoBanco: string; banco: string }> = acctKeys
              .map(key => {
                const meta = acctMeta[key];
                if (!meta) return null;
                const codigoBanco = meta.codigoBanco || getBankCode(meta.banco);
                if (!codigoBanco || !Number.isFinite(Number(meta.id))) return null;
                return { key, id: Number(meta.id), codigoBanco, banco: acctLabel(meta) };
              })
              .filter((c): c is { key: string; id: number; codigoBanco: string; banco: string } => c !== null);
            const todasSelecionadas = contasElegiveis.length > 0 && contasElegiveis.every(c => contasRemessaSelecionadas.has(c.id));
            function toggleConta(id: number) {
              setContasRemessaSelecionadas(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              });
            }
            function toggleTodas() {
              setContasRemessaSelecionadas(prev => {
                if (todasSelecionadas) return new Set();
                return new Set(contasElegiveis.map(c => c.id));
              });
            }
            return (
              <div className="space-y-4">
                {contasElegiveis.length > 0 && (
                  <div className="flex items-center justify-between gap-3 bg-white border rounded-lg p-3 print:hidden">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                      <Checkbox checked={todasSelecionadas} onCheckedChange={toggleTodas} />
                      Selecionar todos os bancos ({contasElegiveis.length})
                    </label>
                    <Button
                      size="sm"
                      className="text-xs h-8"
                      disabled={contasRemessaSelecionadas.size === 0 || gerandoRemessasLote}
                      onClick={() => gerarRemessasSelecionadas(contasElegiveis.filter(c => contasRemessaSelecionadas.has(c.id)))}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      {gerandoRemessasLote
                        ? "Gerando remessas..."
                        : `Gerar Remessas Selecionadas${contasRemessaSelecionadas.size > 0 ? ` (${contasRemessaSelecionadas.size})` : ""}`}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {acctKeys.map(key => {
                    const meta = acctMeta[key];
                    const bkFuncs = byAcct[key];
                    const totalLiq = bkFuncs.reduce((s: number, f: any) => s + (f.salarioLiquido || 0), 0);
                    const dotColor = dotColorFor(meta);
                    const subtitle = acctSubtitle(meta);
                    const elegivel = meta && Number.isFinite(Number(meta.id)) && contasElegiveis.some(c => c.id === Number(meta.id));
                    return (
                      <div key={key} className="bg-white border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {elegivel && (
                            <Checkbox
                              className="print:hidden"
                              checked={contasRemessaSelecionadas.has(Number(meta.id))}
                              onCheckedChange={() => toggleConta(Number(meta.id))}
                            />
                          )}
                          <div className={`h-3 w-3 rounded-full ${dotColor}`} />
                          <span className="text-sm font-semibold">{acctLabel(meta)}</span>
                        </div>
                        {subtitle && <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{subtitle}</p>}
                        <p className="text-lg font-bold text-[#1B2A4A]">{formatBRL(totalLiq)}</p>
                        <p className="text-[10px] text-muted-foreground">{bkFuncs.length} funcionário{bkFuncs.length !== 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>

                {acctKeys.map(key => {
                  const meta = acctMeta[key];
                  const bkFuncs = byAcct[key];
                  const totalLiq = bkFuncs.reduce((s: number, f: any) => s + (f.salarioLiquido || 0), 0);
                  const totalBruto = bkFuncs.reduce((s: number, f: any) => s + (f.totalProventos || 0), 0);
                  const totalDesc = bkFuncs.reduce((s: number, f: any) => s + (f.totalDescontos || 0), 0);
                  const dotColor = dotColorFor(meta);
                  const subtitle = acctSubtitle(meta);
                  const codigoBanco = meta ? (meta.codigoBanco || getBankCode(meta.banco)) : null;
                  const elegivelCard = meta && codigoBanco && Number.isFinite(Number(meta.id));
                  return (
                    <Card key={key} className="overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                        <div className="flex items-center gap-2 min-w-0">
                          {elegivelCard && (
                            <Checkbox
                              className="print:hidden shrink-0"
                              checked={contasRemessaSelecionadas.has(Number(meta.id))}
                              onCheckedChange={() => toggleConta(Number(meta.id))}
                            />
                          )}
                          <div className={`h-3.5 w-3.5 rounded-full shrink-0 ${dotColor}`} />
                          <h3 className="font-semibold text-sm truncate">{acctLabel(meta)}</h3>
                          {subtitle && <span className="text-[10px] text-muted-foreground font-mono truncate hidden sm:inline">{subtitle}</span>}
                          <span className="text-xs text-muted-foreground bg-gray-200 px-2 py-0.5 rounded-full shrink-0">{bkFuncs.length}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-green-700">Bruto: <strong>{formatBRL(totalBruto)}</strong></span>
                          <span className="text-red-600">Desc: <strong>{formatBRL(totalDesc)}</strong></span>
                          <span className="text-[#1B2A4A] text-sm font-bold">{formatBRL(totalLiq)}</span>
                          {meta && codigoBanco && Number.isFinite(Number(meta.id)) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 ml-2 print:hidden"
                              disabled={gerarRemessaMut.isPending}
                              onClick={() => gerarRemessaMut.mutate({
                                companyId,
                                mesReferencia: mesAno,
                                codigoBanco: codigoBanco!,
                                contaBancariaId: Number(meta.id),
                              })}
                            >
                              <FileDown className="h-3.5 w-3.5 mr-1" />
                              {gerarRemessaMut.isPending ? "Gerando..." : "Gerar Remessa CNAB"}
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                                <th className="text-left py-2 px-3 font-semibold">Funcionário</th>
                                <th className="text-left py-2 px-2 font-semibold">CPF</th>
                                <th className="text-left py-2 px-2 font-semibold">Agência</th>
                                <th className="text-left py-2 px-2 font-semibold">Conta</th>
                                <th className="text-left py-2 px-2 font-semibold">Tipo</th>
                                <th className="text-left py-2 px-2 font-semibold">Pix</th>
                                <th className="text-right py-2 px-2 font-semibold text-green-700">Proventos</th>
                                <th className="text-right py-2 px-2 font-semibold text-red-600">Descontos</th>
                                <th className="text-right py-2 px-3 font-semibold text-[#1B2A4A]">Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bkFuncs.sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || '')).map((f: any, i: number) => {
                                const zebra = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                                const pixInfo = f.tipoChavePix ? `${f.tipoChavePix}: ${f.chavePix || '—'}` : '—';
                                return (
                                  <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${zebra}`}>
                                    <td className="py-2 px-3 font-medium whitespace-nowrap">{f.nome}</td>
                                    <td className="py-2 px-2 text-muted-foreground font-mono text-[10px]">{f.cpf || '—'}</td>
                                    <td className="py-2 px-2 font-mono text-[10px]">{meta?.agencia || '—'}</td>
                                    <td className="py-2 px-2 font-mono text-[10px]">{meta?.conta || '—'}</td>
                                    <td className="py-2 px-2 text-[10px]">{meta?.tipo || '—'}</td>
                                    <td className="py-2 px-2 text-[10px] max-w-[160px] truncate" title={pixInfo}>{pixInfo}</td>
                                    <td className="text-right py-2 px-2 text-green-700">{formatBRL(f.totalProventos)}</td>
                                    <td className="text-right py-2 px-2 text-red-600">{formatBRL(f.totalDescontos)}</td>
                                    <td className="text-right py-2 px-3 font-bold text-[#1B2A4A]">
                                      {formatBRL(f.salarioLiquido)}
                                      {Number(f.diferencaDissidioValor || 0) > 0 && (
                                        <span
                                          className="block text-[9px] font-normal whitespace-nowrap text-blue-600"
                                          title={`Inclui R$ ${formatBRL(Number(f.diferencaDissidioValor))} de diferença retroativa do dissídio (somada por opção do toggle).`}
                                        >
                                          + {formatBRL(Number(f.diferencaDissidioValor))} dissídio
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-xs">
                                <td className="py-2.5 px-3" colSpan={6}>SUBTOTAL — {bkFuncs.length} funcionário{bkFuncs.length !== 1 ? 's' : ''}</td>
                                <td className="text-right py-2.5 px-2 text-green-700">{formatBRL(totalBruto)}</td>
                                <td className="text-right py-2.5 px-2 text-red-600">{formatBRL(totalDesc)}</td>
                                <td className="text-right py-2.5 px-3 text-[#1B2A4A] text-sm">{formatBRL(totalLiq)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })() : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2.5 px-2 sticky left-0 bg-gray-50 z-10 font-semibold text-gray-700" rowSpan={2}>Funcionário</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-gray-700" rowSpan={2}>Função</th>
                      <th className="text-center py-1.5 px-1 font-semibold text-green-700 border-l border-green-200 bg-green-50/50" colSpan={3}>Proventos</th>
                      <th className="text-center py-1.5 px-1 font-semibold text-red-700 border-l border-red-200 bg-red-50/30" colSpan={12}>Descontos</th>
                      <th className="text-center py-1.5 px-1 font-semibold text-[#1B2A4A] border-l border-blue-200 bg-blue-50/50" colSpan={2}>Resultado</th>
                    </tr>
                    <tr className="bg-gray-50/80 border-b-2 border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                      <th className="text-right py-1.5 px-2 border-l border-green-200 bg-green-50/30">Salário</th>
                      <th className="text-right py-1.5 px-2 bg-green-50/30">H.E.</th>
                      <th className="text-right py-1.5 px-2 bg-green-50/30 font-bold text-green-700">Total</th>
                      <th className="text-right py-1.5 px-2 border-l border-red-200 bg-orange-50/30">Vale</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">INSS</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">IR</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">Faltas</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">Atrasos</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">Sindicato</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">Pensão</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">VT</th>
                      <th className="text-right py-1.5 px-2 bg-purple-50/30">Convênios</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">EPIs</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/20">Outros</th>
                      <th className="text-right py-1.5 px-2 bg-red-50/30 font-bold text-red-700">Total</th>
                      <th className="text-right py-1.5 px-2 border-l border-blue-200 bg-blue-50/30 font-bold text-[#1B2A4A]">Líquido</th>
                      <th className="text-right py-1.5 px-2 bg-gray-50/50 text-[9px]">FGTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const term = pagamentoSearch.trim().toLowerCase();
                      const funcaoFilter = pagamentoFuncao;
                      const filtered = (pagamentoResult.funcionarios || []).filter((f: any) => {
                        if (term && !(f.nome || '').toLowerCase().includes(term)) return false;
                        if (funcaoFilter !== "__all__" && (f.funcao || '').trim() !== funcaoFilter) return false;
                        return true;
                      }).sort((a: any, b: any) =>
                        (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
                      );
                      if (filtered.length === 0) {
                        return (
                          <tr><td colSpan={19} className="py-6 text-center text-xs text-muted-foreground">
                            Nenhum funcionário encontrado com os filtros aplicados.
                          </td></tr>
                        );
                      }
                      return filtered.map((f: any, i: number) => {
                      const manuais = f.descontosManuais || {};
                      // Bases calculadas para 11 categorias (Rev. 1217)
                      // Detecta payload legado (Rev. ≤ 1216): calculadoOriginal antigo só tinha 7 chaves (sem 'ir').
                      // Em legado, VA era coluna separada — folding em "outros" para a soma horizontal fechar com o Total.
                      const isLegacy = !f.calculadoOriginal || f.calculadoOriginal.ir === undefined;
                      const calcVale = f.descontoAdiantamento || 0;
                      const calcInss = f.descontoInss || 0;
                      const calcIr = f.descontoIrrf || 0;
                      // Rev. 3987 — VR de falta não entra na folha (só no Vale Alimentação); VT de falta some ao VT.
                      const calcFaltas = f.descontoFaltas || 0;
                      const calcAtrasos = f.descontoAtrasos || 0;
                      const calcSindicato = f.descontoSindicato || 0;
                      const calcPensao = f.descontoPensao || 0;
                      const calcVt = f.vtValor || 0;
                      const calcConv = f.descontoConvenio || 0;
                      const calcEpi = f.descontoEpi || 0;
                      const calcOutros = isLegacy
                        ? ((f.descontoOutros || 0) + (f.descontoVaTotal || 0))
                        : ((f.descontoOutros != null)
                            ? f.descontoOutros
                            : ((f.seguroVidaValor || 0) + (f.acertoEscuroValor || 0) + (f.descontoVaTotal || 0)));
                      const valVale = manuais.vale != null ? Number(manuais.vale) : calcVale;
                      const valInss = manuais.inss != null ? Number(manuais.inss) : calcInss;
                      const valIr = manuais.ir != null ? Number(manuais.ir) : calcIr;
                      const valFaltas = manuais.faltas != null ? Number(manuais.faltas) : calcFaltas;
                      const valAtrasos = manuais.atrasos != null ? Number(manuais.atrasos) : calcAtrasos;
                      const valSindicato = manuais.sindicato != null ? Number(manuais.sindicato) : calcSindicato;
                      const valPensao = manuais.pensao != null ? Number(manuais.pensao) : calcPensao;
                      const valVt = manuais.vt != null ? Number(manuais.vt) : calcVt;
                      const valConv = manuais.convenio != null ? Number(manuais.convenio) : calcConv;
                      const valEpi = manuais.epi != null ? Number(manuais.epi) : calcEpi;
                      const valOutros = manuais.outros != null ? Number(manuais.outros) : calcOutros;
                      const onSaveCell = (campo: CampoDesconto, valorNovo: number | null, motivo?: string) =>
                        editarDescontoMut.mutate({
                          companyId, mesReferencia: mesAno,
                          employeeId: Number(f.employeeId), campo, valorNovo, motivo,
                        });
                      const zebra = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                      return (
                        <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${zebra}`}>
                          <td className={`py-2 px-2 font-medium sticky left-0 z-10 whitespace-nowrap ${zebra}`}>{f.nome}</td>
                          <td className="py-2 px-2 text-muted-foreground text-[10px] whitespace-nowrap max-w-[140px] truncate" title={f.funcao}>{f.funcao}</td>
                          <td className="text-right py-2 px-2 border-l border-green-100">{formatBRL(f.salarioBruto)}</td>
                          <td className="text-right py-2 px-2 text-green-700">{f.valorHE > 0 ? formatBRL(f.valorHE) : '—'}</td>
                          <td className="text-right py-2 px-2 font-semibold text-green-800">
                            {formatBRL(f.totalProventos)}
                          </td>
                          <DescontoCell f={f} campo="vale" valor={valVale} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="border-l border-red-100 text-orange-600 text-right" />
                          <DescontoCell f={f} campo="inss" valor={valInss} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="ir" valor={valIr} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="faltas" valor={valFaltas} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="atrasos" valor={valAtrasos} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="sindicato" valor={valSindicato} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="pensao" valor={valPensao} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="vt" valor={valVt} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="convenio" valor={valConv} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-purple-700 text-right" />
                          <DescontoCell f={f} campo="epi" valor={valEpi} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <DescontoCell f={f} campo="outros" valor={valOutros} onSave={onSaveCell} isLoading={editarDescontoMut.isPending} baseClassName="text-red-600 text-right" />
                          <td className="text-right py-2 px-2 font-semibold text-red-700">{formatBRL(f.totalDescontos)}</td>
                          <td className="text-right py-2 px-2 border-l border-blue-100 font-bold text-[#1B2A4A]">
                            {pgLiqEditId === f.employeeId ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-slate-400">R$</span>
                                <input
                                  type="text"
                                  value={pgLiqEditValor}
                                  onChange={e => setPgLiqEditValor(e.target.value)}
                                  className="w-24 h-7 text-right text-sm border rounded px-1 font-bold text-[#1B2A4A]"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      editarLiquidoFolhaMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: pgLiqEditValor });
                                    } else if (e.key === "Escape") {
                                      setPgLiqEditId(null); setPgLiqEditValor("");
                                    }
                                  }}
                                />
                                <button className="text-green-600 hover:text-green-800" title="Salvar" disabled={editarLiquidoFolhaMut.isPending}
                                  onClick={() => editarLiquidoFolhaMut.mutate({ companyId, mesReferencia: mesAno, employeeId: f.employeeId, novoLiquido: pgLiqEditValor })}>
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button className="text-slate-400 hover:text-slate-600" title="Cancelar"
                                  onClick={() => { setPgLiqEditId(null); setPgLiqEditValor(""); }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatBRL(f.salarioLiquido)}
                                {isMaster && (
                                  <button className="text-slate-300 hover:text-blue-600 transition-colors no-print" title="Editar líquido (Master)"
                                    onClick={() => { setPgLiqEditId(f.employeeId); setPgLiqEditValor(String(parseFloat(String(f.salarioLiquido || "0").replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2))); }}>
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            {(f.liquidoEditadoManualmente === true || (f.observacoes && String(f.observacoes).includes('LÍQUIDO EDITADO'))) && (
                              <span className="block text-[9px] font-normal text-orange-600 flex items-center justify-end gap-0.5" title="Líquido editado manualmente">
                                <PenLine className="h-2.5 w-2.5" /> Editado
                              </span>
                            )}
                            {Number(f.diferencaDissidioValor || 0) > 0 && (
                              <span
                                className="block text-[9px] font-normal whitespace-nowrap text-blue-600"
                                title={`Inclui R$ ${formatBRL(Number(f.diferencaDissidioValor))} de diferença retroativa do dissídio (somada por opção do toggle "Somar Diferença do Dissídio").`}
                              >
                                + {formatBRL(Number(f.diferencaDissidioValor))} dissídio
                              </span>
                            )}
                            {Math.abs(Number(f.ajusteArredondamento || 0)) >= 0.005 && (
                              <span
                                className={`block text-[9px] font-normal whitespace-nowrap ${Number(f.ajusteArredondamento) >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}
                                title={`Ajuste de arredondamento p/ R$ 1.\nLíquido exato: ${formatBRL(Number(f.salarioLiquidoExato ?? f.salarioLiquido))}\nSaldo anterior: ${formatBRL(Number(f.saldoAnteriorArredondamento || 0))}\nAjuste: ${Number(f.ajusteArredondamento) >= 0 ? '+' : ''}${formatBRL(Number(f.ajusteArredondamento))}\nResidual carregado p/ o próximo evento.`}
                              >
                                {Number(f.ajusteArredondamento) >= 0 ? '+' : '−'} {formatBRL(Math.abs(Number(f.ajusteArredondamento)))} arred.
                              </span>
                            )}
                          </td>
                          <td className="text-right py-2 px-2 text-[10px] text-muted-foreground">{formatBRL(f.descontoFgts)}</td>
                        </tr>
                      );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-xs">
                      <td className="py-3 px-2 sticky left-0 bg-gray-100 z-10" colSpan={2}>TOTAL — {pagamentoResult.totalFuncionarios} funcionários</td>
                      <td className="text-right py-3 px-2 border-l border-green-200" colSpan={2}></td>
                      <td className="text-right py-3 px-2 text-green-800">{formatBRL(pagamentoResult.totalBruto)}</td>
                      {(() => {
                        const eff = (f: any, campo: CampoDesconto, fallback: number) => {
                          const m = f.descontosManuais || {};
                          return m[campo] != null ? Number(m[campo]) : fallback;
                        };
                        const sum = (campo: CampoDesconto, getCalc: (f: any) => number) =>
                          (pagamentoResult.funcionarios || []).reduce((s: number, f: any) => s + eff(f, campo, getCalc(f)), 0);
                        const totVale = sum('vale', (f) => f.descontoAdiantamento || 0);
                        const totInss = sum('inss', (f) => f.descontoInss || 0);
                        const totIr = sum('ir', (f) => f.descontoIrrf || 0);
                        const totFaltas = sum('faltas', (f) => f.descontoFaltas || 0);
                        const totAtrasos = sum('atrasos', (f) => f.descontoAtrasos || 0);
                        const totSindicato = sum('sindicato', (f) => f.descontoSindicato || 0);
                        const totPensao = sum('pensao', (f) => f.descontoPensao || 0);
                        const totVt = sum('vt', (f) => f.vtValor || 0);
                        const totConv = sum('convenio', (f) => f.descontoConvenio || 0);
                        const totEpi = sum('epi', (f) => f.descontoEpi || 0);
                        const totOutros = sum('outros', (f) => {
                          const isLegacy = !f.calculadoOriginal || f.calculadoOriginal.ir === undefined;
                          if (isLegacy) return (Number(f.descontoOutros) || 0) + (Number(f.descontoVaTotal) || 0);
                          return (f.descontoOutros != null) ? Number(f.descontoOutros) : ((f.seguroVidaValor || 0) + (f.acertoEscuroValor || 0) + (f.descontoVaTotal || 0));
                        });
                        return (
                          <>
                            <td className="text-right py-3 px-2 border-l border-red-200 text-orange-600">{formatBRL(totVale)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totInss)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totIr)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totFaltas)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totAtrasos)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totSindicato)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totPensao)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totVt)}</td>
                            <td className="text-right py-3 px-2 text-purple-700">{formatBRL(totConv)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totEpi)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{formatBRL(totOutros)}</td>
                          </>
                        );
                      })()}
                      <td className="text-right py-3 px-2 text-red-700">{formatBRL(pagamentoResult.totalDescontos)}</td>
                      <td className="text-right py-3 px-2 border-l border-blue-200 text-base text-[#1B2A4A]">{formatBRL(pagamentoResult.totalLiquido)}</td>
                      <td className="text-right py-3 px-2 text-[10px] text-muted-foreground">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoFgts || 0), 0) || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
          )}
          {pagamentoSubView === "geral" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="inline-block w-2 h-2 bg-orange-200 border border-orange-400 mr-1 align-middle"></span>
              Célula laranja com <b className="text-orange-700">*</b> = valor alterado manualmente. Clique em qualquer desconto para ver o memorial de cálculo ou editar.
            </p>
          )}
        </div>

        {/* Dialog: confirma o que fazer com overrides na re-simulação */}
        <Dialog open={overridesPrompt.open} onOpenChange={(o) => setOverridesPrompt(p => ({ ...p, open: o }))}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Existem alterações manuais nesta folha</DialogTitle>
              <DialogDescription>
                <b>{overridesPrompt.count}</b> funcionário(s) com valores editados manualmente. Marque quem deve <b>manter o ajuste</b>; os desmarcados serão ressimulados do zero.
              </DialogDescription>
            </DialogHeader>
            {overridesPrompt.lista.length > 0 && (
              <div className="max-h-[45vh] overflow-y-auto rounded-md border divide-y">
                {overridesPrompt.lista.map((f) => {
                  const marcado = overridesPrompt.manterIds.includes(f.id);
                  return (
                    <label key={f.id} className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={marcado}
                        onChange={() => setOverridesPrompt(p => ({
                          ...p,
                          manterIds: marcado ? p.manterIds.filter(id => id !== f.id) : [...p.manterIds, f.id],
                        }))}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium break-words">{f.nome}</span>
                        {f.campos.length > 0 && (
                          <span className="block text-[11px] text-muted-foreground break-words">Ajuste em: {f.campos.join(', ')}</span>
                        )}
                        <span className={`block text-[11px] ${marcado ? 'text-emerald-600' : 'text-red-600'}`}>{marcado ? 'Manter ajuste manual' : 'Ressimular do zero'}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3 text-[11px]">
              <button type="button" className="underline text-muted-foreground" onClick={() => setOverridesPrompt(p => ({ ...p, manterIds: p.lista.map(f => f.id) }))}>Marcar todos</button>
              <button type="button" className="underline text-muted-foreground" onClick={() => setOverridesPrompt(p => ({ ...p, manterIds: [] }))}>Desmarcar todos</button>
            </div>
            <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
              <Button variant="outline" onClick={() => setOverridesPrompt({ open: false, count: 0, lista: [], manterIds: [] })}>Cancelar</Button>
              <Button disabled={simularPagamentoMut.isPending || overridesPrompt.lista.length === 0} title={overridesPrompt.lista.length === 0 ? 'Não foi possível carregar a lista de funcionários editados — feche e tente novamente' : ''} onClick={() => {
                const manterIds = overridesPrompt.manterIds;
                setOverridesPrompt({ open: false, count: 0, lista: [], manterIds: [] });
                setCalcType("pagamento");
                simularPagamentoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, manterOverridesIds: manterIds, pontoInicioManual: periodoInicio, pontoFimManual: periodoFim, forcarRecalculoPonto: true });
              }}>Aplicar e ressimular</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ArredondamentoDialog
          open={arredOpen && arredOrigem === 'folha'}
          onOpenChange={setArredOpen}
          origem="folha"
          funcionarios={pagamentoResult?.funcionarios || []}
          isPending={arredondarMut.isPending}
          onAplicar={aplicarArred}
        />

        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  // ===== AUDITORIA FOLHA VIEW =====
  if (viewMode === "auditoria_folha") {
    const auditoria = auditoriaFolha;
    const aud = auditoria.data as any;
    const s = aud?.secoes;
    const openSections = auditOpenSections;
    const toggle = (key: string) => setAuditOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

    const AuditSection = ({ id, icon, title, count, color, children }: {
      id: string; icon: JSX.Element; title: string; count: number; color: string; children: React.ReactNode;
    }) => {
      if (count === 0) return null;
      const isOpen = openSections[id] ?? false;
      return (
        <div className={`border rounded-lg overflow-hidden mb-3 ${color}`}>
          <div className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:opacity-80" onClick={() => toggle(id)}>
            {icon}
            <span className="font-semibold text-sm flex-1">{title}</span>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
            {isOpen ? <ChevronUp className="h-4 w-4 print:hidden" /> : <ChevronDown className="h-4 w-4 print:hidden" />}
          </div>
          {(isOpen || false) && <div className="border-t bg-white px-4 py-3">{children}</div>}
          <div className="hidden print:block border-t bg-white px-4 py-2">{children}</div>
        </div>
      );
    };

    const fmtR = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

    return (
      <DashboardLayout>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("calculo_pagamento")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Auditoria da Folha
              </h1>
              <p className="text-muted-foreground text-xs">{formatMesAno(mesAno)} • {aud?.diasUteisNoMes || '-'} dias úteis</p>
            </div>
          </div>
          <PrintActions title={`Auditoria Folha - ${formatMesAno(mesAno)}`} />
        </div>

        {auditoria.isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
            <span className="text-muted-foreground">Analisando folha...</span>
          </div>
        )}

        {auditoria.isError && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-center">
            <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="font-medium text-red-800">Erro ao carregar auditoria</p>
            <p className="text-xs text-red-600 mt-1">{(auditoria.error as any)?.message || 'Tente novamente'}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => auditoria.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
            </Button>
          </div>
        )}

        {aud && s && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="bg-white border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{aud.totalCltAtivos}</p>
                <p className="text-[10px] text-muted-foreground uppercase">CLTs Ativos</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${aud.totalNaFolha !== aud.totalCltAtivos ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <p className={`text-2xl font-bold ${aud.totalNaFolha !== aud.totalCltAtivos ? 'text-red-600' : 'text-green-700'}`}>{aud.totalNaFolha}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Na Folha</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${aud.totalNoVale < aud.totalCltAtivos ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                <p className={`text-2xl font-bold ${aud.totalNoVale < aud.totalCltAtivos ? 'text-amber-600' : 'text-blue-700'}`}>{aud.totalNoVale}</p>
                <p className="text-[10px] text-muted-foreground uppercase">No Vale</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${aud.totalErros > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-2xl font-bold ${aud.totalErros > 0 ? 'text-red-600' : 'text-green-600'}`}>{aud.totalErros}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{aud.totalErros > 0 ? 'Erros' : 'Sem erros'}</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${aud.totalWarnings > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-2xl font-bold ${aud.totalWarnings > 0 ? 'text-amber-600' : 'text-green-600'}`}>{aud.totalWarnings}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Avisos</p>
              </div>
            </div>

            <AuditSection id="semPagamento" count={s.semPagamento.length} color="border-red-300 bg-red-50"
              icon={<XCircle className="h-4 w-4 text-red-600" />} title="Excluídos da folha de pagamento">
              <p className="text-xs text-red-700 mb-2 italic">Funcionários CLT ativos que NÃO foram incluídos na simulação. Corrija o cadastro e resimule.</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2">Motivo</th>
                </tr></thead>
                <tbody>
                  {s.semPagamento.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-red-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-red-700">{r.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </AuditSection>

            <AuditSection id="semVale" count={s.semVale.length} color="border-amber-300 bg-amber-50"
              icon={<Wallet className="h-4 w-4 text-amber-600" />} title="Não receberam vale (adiantamento)">
              <p className="text-xs text-amber-700 mb-2 italic">Funcionários CLT ativos que não tiveram adiantamento calculado neste mês e o motivo.</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2">Status</th><th className="py-1 px-2">Motivo</th>
                </tr></thead>
                <tbody>
                  {s.semVale.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-amber-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2"><Badge variant="outline" className="text-[10px]">{r.status}</Badge></td><td className="py-1.5 px-2 text-amber-700">{r.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </AuditSection>

            {s.valeBloqueado.length > 0 && (
              <AuditSection id="valeBloqueado" count={s.valeBloqueado.length} color="border-orange-300 bg-orange-50"
                icon={<Ban className="h-4 w-4 text-orange-600" />} title="Vales bloqueados">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-right">Valor</th><th className="py-1 px-2">Motivo do bloqueio</th>
                  </tr></thead>
                  <tbody>
                    {s.valeBloqueado.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-orange-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-right">{formatBRL(r.valor)}</td><td className="py-1.5 px-2 text-orange-700 text-[11px]">{r.motivo}</td></tr>
                    ))}
                  </tbody>
                </table>
              </AuditSection>
            )}

            <AuditSection id="variacaoSalarial" count={s.variacaoSalarial.length} color="border-purple-300 bg-purple-50"
              icon={<Scale className="h-4 w-4 text-purple-600" />} title="Variação salarial na mesma função">
              <p className="text-xs text-purple-700 mb-3 italic">Funções onde funcionários recebem valores brutos diferentes (variação {'>'} 5%). Pode indicar erro de lançamento ou diferenças legítimas (HE, bônus).</p>
              {s.variacaoSalarial.map((v: any, vi: number) => (
                <div key={vi} className={`mb-4 ${vi > 0 ? 'border-t border-purple-200 pt-3' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-sm text-purple-900">{v.funcao}</span>
                    <Badge variant={v.variacao > 20 ? "destructive" : "secondary"} className="text-[10px]">
                      {v.variacao.toFixed(1)}% de variação
                    </Badge>
                    <span className="text-xs text-muted-foreground">{v.qtd} funcionários</span>
                  </div>
                  <div className="bg-purple-50/50 rounded px-3 py-1.5 mb-2 text-xs text-purple-800 flex items-start gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{v.explicacao}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2 text-right">VH</th><th className="py-1 px-2 text-right">Bruto</th><th className="py-1 px-2 text-right">HE</th><th className="py-1 px-2 text-right">Líquido</th>
                    </tr></thead>
                    <tbody>
                      {v.funcionarios.map((f: any, fi: number) => {
                        const isMin = f.bruto === Math.min(...v.funcionarios.map((x: any) => x.bruto));
                        const isMax = f.bruto === Math.max(...v.funcionarios.map((x: any) => x.bruto));
                        return (
                          <tr key={fi} className={`border-b border-purple-100 ${isMin ? 'bg-red-50/50' : isMax ? 'bg-green-50/50' : ''}`}>
                            <td className="py-1 px-2 font-medium">{f.nome} {isMin && <span className="text-red-500 text-[10px]">menor</span>}{isMax && <span className="text-green-600 text-[10px]">maior</span>}</td>
                            <td className="py-1 px-2 text-right">R$ {f.valorHora}</td>
                            <td className="py-1 px-2 text-right font-medium">{fmtR(f.bruto)}</td>
                            <td className="py-1 px-2 text-right text-blue-600">{f.he > 0 ? fmtR(f.he) : '-'}</td>
                            <td className="py-1 px-2 text-right">{fmtR(f.liquido)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </AuditSection>

            <AuditSection id="descontosExcessivos" count={s.descontosExcessivos.length} color="border-red-300 bg-red-50"
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />} title="Descontos superiores a 50% do bruto">
              <p className="text-xs text-red-700 mb-2 italic">Funcionários cujos descontos totais ultrapassam 50% do salário bruto. Pode indicar erro.</p>
              {s.descontosExcessivos.map((r: any, i: number) => (
                <div key={i} className={`${i > 0 ? 'border-t border-red-200 pt-2 mt-2' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">{r.nome}</span>
                    <span className="text-xs text-muted-foreground">({r.funcao || '-'})</span>
                    <Badge variant="destructive" className="text-[10px]">{r.percentual.toFixed(1)}%</Badge>
                  </div>
                  <div className="flex gap-4 text-xs mb-1">
                    <span>Bruto: <strong>{fmtR(r.bruto)}</strong></span>
                    <span className="text-red-600">Descontos: <strong>{fmtR(r.totalDesc)}</strong></span>
                    <span>Líquido: <strong>{fmtR(r.liquido)}</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {Object.entries(r.composicao).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                      <span key={k}>{k}: {fmtR(v as number)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </AuditSection>

            <AuditSection id="comFaltas" count={s.comFaltas.length} color="border-amber-300 bg-amber-50"
              icon={<Ban className="h-4 w-4 text-amber-600" />} title="Faltas no mês">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-center">Faltas</th><th className="py-1 px-2 text-right">Desconto</th><th className="py-1 px-2 text-right">Bruto</th>
                </tr></thead>
                <tbody>
                  {s.comFaltas.map((r: any, i: number) => (
                    <tr key={i} className={`border-b border-amber-100 ${r.faltas >= 3 ? 'bg-red-50/50' : ''}`}>
                      <td className="py-1.5 px-2 font-medium">{r.nome} {r.faltas >= 3 && <AlertTriangle className="h-3 w-3 text-red-500 inline" />}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td>
                      <td className="py-1.5 px-2 text-center font-bold">{r.faltas}</td>
                      <td className="py-1.5 px-2 text-right text-red-600 font-medium">{fmtR(r.valor)}</td>
                      <td className="py-1.5 px-2 text-right">{fmtR(r.bruto)}</td>
                    </tr>
                  ))}
                </tbody>
                {s.comFaltas.length > 0 && (
                  <tfoot><tr className="bg-amber-100/50 font-semibold">
                    <td className="py-1.5 px-2" colSpan={2}>Total</td>
                    <td className="py-1.5 px-2 text-center">{s.comFaltas.reduce((s: number, r: any) => s + r.faltas, 0)}</td>
                    <td className="py-1.5 px-2 text-right text-red-600">{fmtR(s.comFaltas.reduce((s: number, r: any) => s + r.valor, 0))}</td>
                    <td className="py-1.5 px-2" />
                  </tr></tfoot>
                )}
              </table>
            </AuditSection>

            <AuditSection id="comAtrasos" count={s.comAtrasos.length} color="border-amber-200 bg-amber-50/50"
              icon={<Clock className="h-4 w-4 text-amber-500" />} title="Atrasos no mês">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-center">Tempo</th><th className="py-1 px-2 text-right">Desconto</th>
                </tr></thead>
                <tbody>
                  {s.comAtrasos.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-amber-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-center">{r.minutos >= 60 ? Math.floor(r.minutos/60) + 'h' + (r.minutos%60 > 0 ? String(r.minutos%60).padStart(2,'0') + 'min' : '') : r.minutos + 'min'}</td><td className="py-1.5 px-2 text-right text-red-600">{fmtR(r.valor)}</td></tr>
                  ))}
                </tbody>
                {s.comAtrasos.length > 0 && (
                  <tfoot><tr className="bg-amber-100/30 font-semibold">
                    <td className="py-1.5 px-2" colSpan={2}>Total</td>
                    <td className="py-1.5 px-2 text-center">{(() => { const t = s.comAtrasos.reduce((s: number, r: any) => s + r.minutos, 0); return t >= 60 ? Math.floor(t/60) + 'h' + (t%60 > 0 ? String(t%60).padStart(2,'0') + 'min' : '') : t + 'min'; })()}</td>
                    <td className="py-1.5 px-2 text-right text-red-600">{fmtR(s.comAtrasos.reduce((s: number, r: any) => s + r.valor, 0))}</td>
                  </tr></tfoot>
                )}
              </table>
            </AuditSection>

            <AuditSection id="comHorasExtras" count={s.comHorasExtras.length} color="border-blue-200 bg-blue-50/50"
              icon={<Clock className="h-4 w-4 text-blue-600" />} title="Funcionários com horas extras">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-right">Valor HE</th><th className="py-1 px-2 text-right">Bruto</th><th className="py-1 px-2 text-right">Total Proventos</th>
                </tr></thead>
                <tbody>
                  {s.comHorasExtras.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-blue-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-right text-blue-700 font-medium">{fmtR(r.valorHE)}</td><td className="py-1.5 px-2 text-right">{fmtR(r.bruto)}</td><td className="py-1.5 px-2 text-right">{fmtR(r.totalProventos)}</td></tr>
                  ))}
                </tbody>
                {s.comHorasExtras.length > 0 && (
                  <tfoot><tr className="bg-blue-100/30 font-semibold">
                    <td className="py-1.5 px-2" colSpan={2}>Total</td>
                    <td className="py-1.5 px-2 text-right text-blue-700">{fmtR(s.comHorasExtras.reduce((s: number, r: any) => s + r.valorHE, 0))}</td>
                    <td className="py-1.5 px-2" colSpan={2} />
                  </tr></tfoot>
                )}
              </table>
            </AuditSection>

            {s.comPensao.length > 0 && (
              <AuditSection id="comPensao" count={s.comPensao.length} color="border-indigo-200 bg-indigo-50/50"
                icon={<Scale className="h-4 w-4 text-indigo-600" />} title="Pensão alimentícia">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-right">Valor</th>
                  </tr></thead>
                  <tbody>
                    {s.comPensao.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-indigo-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-right">{fmtR(r.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </AuditSection>
            )}

            {s.ajustesManuais.length > 0 && (
              <AuditSection id="ajustesManuais" count={s.ajustesManuais.length} color="border-gray-300 bg-gray-50"
                icon={<Wrench className="h-4 w-4 text-gray-600" />} title="Ajustes manuais">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2 text-right">Valor</th><th className="py-1 px-2">Detalhes</th>
                  </tr></thead>
                  <tbody>
                    {s.ajustesManuais.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2 text-right">{fmtR(r.valor)}</td><td className="py-1.5 px-2 text-muted-foreground">{r.detalhes || '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </AuditSection>
            )}

            <AuditSection id="dadosBancariosIncompletos" count={s.dadosBancariosIncompletos.length} color="border-yellow-300 bg-yellow-50"
              icon={<CreditCard className="h-4 w-4 text-yellow-600" />} title="Dados bancários incompletos (impede CNAB)">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 px-2">Funcionário</th><th className="py-1 px-2">Função</th><th className="py-1 px-2">Campos faltando</th>
                </tr></thead>
                <tbody>
                  {s.dadosBancariosIncompletos.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-yellow-100"><td className="py-1.5 px-2 font-medium">{r.nome}</td><td className="py-1.5 px-2 text-muted-foreground">{r.funcao || '-'}</td><td className="py-1.5 px-2">{r.problemas.map((p: string, pi: number) => <Badge key={pi} variant="outline" className="text-[10px] mr-1 mb-0.5 border-yellow-400 text-yellow-700">{p}</Badge>)}</td></tr>
                  ))}
                </tbody>
              </table>
            </AuditSection>

            {aud.totalErros === 0 && aud.totalWarnings === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-700">Nenhuma divergência encontrada</p>
                <p className="text-xs text-muted-foreground">A folha está consistente com o cadastro de funcionários.</p>
              </div>
            )}
          </>
        )}
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  // ===== HE MÓDULO VIEW =====
  if (viewMode === "he_modulo") {
    const pdHE = payrollPeriod.data as any;
    const heConsolidadoMod = !!(pdHE)?.heConsolidadoEm;
    const allPeriods = (hePeriods.data as any[]) || [];
    const periods = allPeriods.filter((p: any) => p.status !== 'cancelado');
    const detalhe = heDetalhe.data;
    const selectedEmps = (detalhe?.employees as any[]) || [];
    const saldos = (saldoBanco.data as any[]) || [];
    const alertas = (alertasExpiracao.data as any[]) || [];
    const lancamentos = (lancamentosBanco.data as any[]) || [];
    const statusColor = (s: string) =>
      s === "aprovado" ? "bg-green-100 text-green-700" :
      s === "pago" ? "bg-blue-100 text-blue-700" :
      s === "cancelado" ? "bg-gray-100 text-gray-500" :
      "bg-purple-100 text-purple-700";
    const minsToHHMM = (m: number) => {
      const abs = Math.abs(m);
      const h = Math.floor(abs / 60);
      const min = abs % 60;
      if (h === 0) return `${min}min`;
      if (min === 0) return `${h}h`;
      return `${h}h ${min}min`;
    };
    const saldoMap = new Map<number, number>();
    for (const s of saldos) saldoMap.set(Number(s.employeeId), Number(s.saldoMinutos));
    const totalBancoMins = saldos.reduce((acc: number, s: any) => acc + Number(s.saldoMinutos), 0);

    const handleSetDestinacao = (empRowId: number, dest: "pagamento" | "banco_horas") => {
      if (heConsolidadoMod) return;
      setDestinacaoMap(prev => ({ ...prev, [empRowId]: dest }));
      setDestinacaoMut.mutate({ hePeriodEmployeeId: empRowId, destinacao: dest });
    };
    const handleSetDestinacaoMassa = (dest: "pagamento" | "banco_horas") => {
      if (!heViewPeriodId || heConsolidadoMod) return;
      const newMap = { ...destinacaoMap };
      for (const emp of selectedEmps) newMap[emp.id] = dest;
      setDestinacaoMap(newMap);
      setDestinacaoMassaMut.mutate({ hePeriodId: heViewPeriodId, destinacao: dest });
    };
    const debitarEmpNome = heDebitarEmpId ? (saldos.find((s: any) => Number(s.employeeId) === heDebitarEmpId)?.nomeCompleto || "Funcionário") : null;
    const lancamentosEmpNome = heLancamentosEmpId ? (saldos.find((s: any) => Number(s.employeeId) === heLancamentosEmpId)?.nomeCompleto || "Funcionário") : null;

    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-6">

          {/* HEADER */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setViewMode("resumo"); setHeViewPeriodId(null); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-purple-700" /> Módulo Hora Extra — {formatMesAno(mesAno)}
                </h1>
                <p className="text-sm text-muted-foreground">Período configurável · Banco de Horas · Histórico rastreado</p>
              </div>
            </div>
            {heConsolidadoMod && (
              <div className="w-full flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-sm">
                <Lock className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">HE consolidada — valores travados. Desconsolide na tela principal para permitir alterações.</span>
              </div>
            )}
            <div className="flex gap-2 no-print">
              <Button size="sm"
                variant={heSubView === "periodos" ? "default" : "outline"}
                className={heSubView === "periodos" ? "bg-purple-700 hover:bg-purple-800" : ""}
                onClick={() => setHeSubView("periodos")}>
                <Clock className="h-4 w-4 mr-1" /> Períodos HE
              </Button>
              <Button size="sm"
                variant={heSubView === "banco_horas" ? "default" : "outline"}
                className={heSubView === "banco_horas" ? "bg-blue-700 hover:bg-blue-800" : ""}
                onClick={() => setHeSubView("banco_horas")}>
                <Wallet className="h-4 w-4 mr-1" /> Banco de Horas
                {saldos.length > 0 && <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px]">{saldos.length}</Badge>}
              </Button>
            </div>
          </div>

          {/* EXPIRY ALERT BANNER */}
          {alertas.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm no-print">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-amber-800">Atenção — horas a vencer: </span>
                <span className="text-amber-700">{alertas.length} funcionário(s) com horas em banco há mais de 12 meses. </span>
                <button className="underline font-medium text-amber-800" onClick={() => setHeSubView("banco_horas")}>Ver alertas →</button>
              </div>
            </div>
          )}

          {/* Rev. 2218 — Alerta: HE aprovada SEM ponto batido no período */}
          <HEAprovadaSemPontoAlert
            companyId={companyId}
            companyIds={companyIds}
            dataInicio={heDataInicio}
            dataFim={heDataFim}
            title="HE aprovada SEM ponto no horário aprovado — não entrou no cálculo da folha"
          />

          {/* ============ SUB-VIEW: PERÍODOS ============ */}
          {heSubView === "periodos" && (
            <>
              {/* CALCULAR NOVO PERÍODO */}
              <Card className="border-purple-200">
                <CardContent className="p-5">
                  <p className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-purple-700" /> Calcular Novo Período de HE
                  </p>
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Data Início</label>
                      <input type="date" value={heDataInicio} onChange={e => setHeDataInicio(e.target.value)}
                        disabled={heDatasLocked}
                        className={`border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${heDatasLocked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Data Fim</label>
                      <input type="date" value={heDataFim} onChange={e => setHeDataFim(e.target.value)}
                        disabled={heDatasLocked}
                        className={`border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${heDatasLocked ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-9 px-3 ${heDatasLocked ? "text-slate-500 border-slate-300" : "text-amber-700 border-amber-300 bg-amber-50"}`}
                      onClick={() => {
                        if (!heDatasLocked) {
                          setHeDataInicio(defaultHeInicio);
                          setHeDataFim(defaultHeFim);
                        }
                        setHeDatasLocked(!heDatasLocked);
                      }}
                      title={heDatasLocked ? "Desbloquear datas para edição manual" : "Travar datas e restaurar padrão"}
                    >
                      {heDatasLocked
                        ? <><Lock className="h-3.5 w-3.5 mr-1.5" /> Desbloquear</>
                        : <><Unlock className="h-3.5 w-3.5 mr-1.5" /> Travar</>}
                    </Button>
                    <Button className="bg-purple-700 hover:bg-purple-800" disabled={heCalcularMut.isPending || heConsolidadoMod}
                      onClick={() => heCalcularMut.mutate({ companyId, companyIds, mesReferencia: mesAno, dataInicio: heDataInicio, dataFim: heDataFim })}
                      title={heConsolidadoMod ? "HE consolidada — desconsolide primeiro para recalcular" : ""}>
                      {heCalcularMut.isPending
                        ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Calculando...</>
                        : heConsolidadoMod ? <><Lock className="h-4 w-4 mr-2" /> Consolidado</>
                        : <><Zap className="h-4 w-4 mr-2" /> Calcular HE</>}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {heDatasLocked
                        ? <p className="text-green-700 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Período padrão: dia 16 do mês anterior ao dia 15 do mês atual</p>
                        : <p className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Datas desbloqueadas — edição manual habilitada</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PERÍODOS REGISTRADOS */}
              {hePeriods.isLoading ? (
                <div className="text-center py-6 text-muted-foreground">Carregando períodos...</div>
              ) : periods.length > 0 ? (
                <Card>
                  <CardContent className="p-5">
                    <p className="font-semibold text-sm mb-3">Períodos Registrados — {formatMesAno(mesAno)}</p>
                    <div className="space-y-3">
                      {periods.map((p: any) => {
                        const isOpen = heViewPeriodId === p.id;
                        // Rev. 2183 / 2185 — filtro por obra. A Rev. 2185 mudou a chave
                        // de Map<employeeId, …> para Map<"empId|origem", …> porque o
                        // server agora separa as obras por origem (aprovada usa obra
                        // da solicitação; sem_solicitacao usa time_records). Assim
                        // cada linha split (Rev. 2179) só passa pelo filtro da obra
                        // CORRETA, sem misturar obras de outras origens.
                        const obrasPorEmp: Array<{ employeeId: number; origem?: "aprovada" | "sem_solicitacao"; obraId: number | null; obraNome: string | null }> =
                          isOpen ? ((detalhe as any)?.obrasPorEmp || []) : [];
                        const obrasMap = new Map<string, Set<string>>();
                        const obrasDoPeriodo = new Map<string, string>();
                        for (const o of obrasPorEmp) {
                          // Rev. 2187 — entradas sem obraId (ponto sem tag) NÃO entram no
                          // dropdown nem no mapa de filtro. O funcionário continua
                          // visível em "Todas as obras"; só não fica órfão num bucket
                          // "Sem Obra" confuso pro usuário.
                          if (o.obraId == null) continue;
                          const key = String(o.obraId);
                          // Fallback: payloads antigos sem 'origem' caem em ambas as origens
                          // (compatibilidade durante o deploy — não afeta dados novos).
                          const origens: Array<"aprovada" | "sem_solicitacao"> = o.origem ? [o.origem] : ["aprovada", "sem_solicitacao"];
                          for (const origem of origens) {
                            const mapKey = `${o.employeeId}|${origem}`;
                            if (!obrasMap.has(mapKey)) obrasMap.set(mapKey, new Set());
                            obrasMap.get(mapKey)!.add(key);
                          }
                          if (!obrasDoPeriodo.has(key)) obrasDoPeriodo.set(key, o.obraNome || `Obra #${key}`);
                        }
                        const obrasOptions = Array.from(obrasDoPeriodo.entries())
                          .map(([id, nome]) => ({ id, nome }))
                          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
                        // Aplica filtro por obra ANTES dos KPIs (cards refletem o escopo da obra).
                        // Rev. 2185: filtro casa por (employeeId + origem da linha).
                        const periodEmpsAllRaw = isOpen ? selectedEmps : [];
                        const periodEmpsAll = heObraFilterMod === "all"
                          ? periodEmpsAllRaw
                          : periodEmpsAllRaw.filter((e: any) => {
                              const origem = (e.origem || "sem_solicitacao") as "aprovada" | "sem_solicitacao";
                              return obrasMap.get(`${Number(e.employeeId)}|${origem}`)?.has(heObraFilterMod);
                            });
                        // Rev. 2182 — KPIs por origem (sempre sobre o conjunto FULL, não filtrado)
                        const kpiAprovadas = periodEmpsAll.filter((e: any) => (e.origem || "sem_solicitacao") === "aprovada");
                        const kpiSemSol = periodEmpsAll.filter((e: any) => (e.origem || "sem_solicitacao") !== "aprovada");
                        const sumValor = (arr: any[]) => arr.reduce((s: number, e: any) => s + Number(e.valorHETotal || 0), 0);
                        const sumMins  = (arr: any[]) => arr.reduce((s: number, e: any) => s + Number(e.heTotalMins || 0), 0);
                        const uniqFunc = (arr: any[]) => new Set(arr.map((e: any) => Number(e.employeeId))).size;
                        // Filtro aplicado à tabela (cards clicáveis)
                        const periodEmps = heOrigemFilter === "todos"
                          ? periodEmpsAll
                          : heOrigemFilter === "aprovada"
                            ? kpiAprovadas
                            : kpiSemSol;
                        const pagamentoCount = periodEmps.filter((e: any) => (destinacaoMap[e.id] ?? (e.destinacao || "pagamento")) === "pagamento").length;
                        const bancoCount = periodEmps.filter((e: any) => (destinacaoMap[e.id] ?? (e.destinacao || "pagamento")) === "banco_horas").length;
                        return (
                          <div key={p.id} className={`border rounded-lg ${isOpen ? "border-purple-400 bg-purple-50/20" : "border-gray-200"}`}>
                            {/* Period header row */}
                            <div className="p-3 flex flex-wrap items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-sm">{fmtDateBR(p.dataInicio)} → {fmtDateBR(p.dataFim)}</span>
                                <span className="ml-3 text-sm text-muted-foreground">{p.totalFuncionarios} func · {formatBRL(Number(p.totalValorHE))}</span>
                                <Badge className={`ml-2 text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                                {p.criadoPor && <span className="ml-2 text-xs text-muted-foreground">por {p.criadoPor}</span>}
                              </div>
                              <div className="flex gap-2 no-print flex-wrap">
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => setHeViewPeriodId(isOpen ? null : p.id)}>
                                  <Eye className="h-3 w-3 mr-1" /> {isOpen ? "Fechar" : "Revisar"}
                                </Button>
                                {p.status === "aprovado" && (
                                  <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                    onClick={() => { if (confirm("Confirmar pagamento em dinheiro dos funcionários marcados como Pagar neste período?")) heMarcarPagoMut.mutate({ hePeriodId: p.id, companyId }); }}
                                    disabled={heMarcarPagoMut.isPending}>
                                    <CheckCircle className="h-3 w-3 mr-1" /> Confirmar Pagamento
                                  </Button>
                                )}
                                {p.status === "calculado" && !heConsolidadoMod && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                                    onClick={() => heCalcularMut.mutate({ companyId, companyIds, mesReferencia: mesAno, dataInicio: String(p.dataInicio).slice(0, 10), dataFim: String(p.dataFim).slice(0, 10) })}
                                    disabled={heCalcularMut.isPending}>
                                    {heCalcularMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Recalculando...</> : <><RefreshCw className="h-3 w-3 mr-1" /> Recalcular</>}
                                  </Button>
                                )}
                                {p.status !== "pago" && p.status !== "cancelado" && !heConsolidadoMod && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                                    onClick={() => { if (confirm("Cancelar este período? Isso permite recalcular o mesmo intervalo.")) heCancelarMut.mutate({ hePeriodId: p.id, companyId }); }}
                                    disabled={heCancelarMut.isPending}>
                                    <XCircle className="h-3 w-3 mr-1" /> Cancelar
                                  </Button>
                                )}
                                {isMaster && p.status === "cancelado" && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-500 text-red-700 hover:bg-red-50"
                                    onClick={() => { if (confirm("Excluir permanentemente este período cancelado? Esta ação não pode ser desfeita.")) heDeletearCanceladoMut.mutate({ hePeriodId: p.id, companyId }); }}
                                    disabled={heDeletearCanceladoMut.isPending}>
                                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* EXPANDED DETAIL */}
                            {isOpen && (
                              <div className="border-t border-purple-200 p-4 space-y-4">
                                {heDetalhe.isLoading ? (
                                  <div className="text-center py-4 text-muted-foreground text-sm">Carregando funcionários...</div>
                                ) : (
                                  <>
                                    {/* BATCH DESTINAÇÃO */}
                                    {p.status === "calculado" && (
                                      <div className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-lg p-3">
                                        <span className="text-sm font-medium text-gray-700">Destinação em massa:</span>
                                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                          onClick={() => handleSetDestinacaoMassa("pagamento")}
                                          disabled={setDestinacaoMassaMut.isPending}>
                                          💵 Pagar todos
                                        </Button>
                                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                          onClick={() => handleSetDestinacaoMassa("banco_horas")}
                                          disabled={setDestinacaoMassaMut.isPending}>
                                          🏦 Banco para todos
                                        </Button>
                                        {periodEmps.length > 0 && (
                                          <span className="text-xs text-muted-foreground ml-auto">
                                            {pagamentoCount > 0 && <span className="text-green-700 mr-3">💵 {pagamentoCount} para pagamento</span>}
                                            {bancoCount > 0 && <span className="text-blue-700">🏦 {bancoCount} para banco</span>}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Rev. 2183 — Filtro por OBRA (Select) acima dos cards */}
                                    {obrasOptions.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 no-print">
                                        <label className="text-xs font-medium text-gray-700">🏗️ Filtrar por obra:</label>
                                        <select
                                          value={heObraFilterMod}
                                          onChange={(e) => setHeObraFilterMod(e.target.value)}
                                          className="h-8 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:border-[#1B2A4A] focus:outline-none focus:ring-1 focus:ring-[#1B2A4A]/30 min-w-[200px]"
                                        >
                                          <option value="all">Todas as obras ({obrasOptions.length})</option>
                                          {obrasOptions.map((o) => (
                                            <option key={o.id} value={o.id}>{o.nome}</option>
                                          ))}
                                        </select>
                                        {heObraFilterMod !== "all" && (
                                          <button
                                            type="button"
                                            onClick={() => setHeObraFilterMod("all")}
                                            className="text-xs text-purple-600 hover:underline"
                                          >
                                            Limpar obra
                                          </button>
                                        )}
                                        <span className="text-[11px] text-muted-foreground ml-auto">
                                          {heObraFilterMod === "all"
                                            ? `${periodEmpsAllRaw.length} func no período`
                                            : `${periodEmpsAll.length} func nesta obra`}
                                        </span>
                                      </div>
                                    )}

                                    {/* Rev. 2182 — KPI CARDS por origem (clicáveis para filtrar a tabela) */}
                                    {periodEmpsAll.length > 0 && (() => {
                                      const totVal = sumValor(periodEmpsAll);
                                      const totMin = sumMins(periodEmpsAll);
                                      const totFun = uniqFunc(periodEmpsAll);
                                      const aprVal = sumValor(kpiAprovadas);
                                      const aprMin = sumMins(kpiAprovadas);
                                      const aprFun = uniqFunc(kpiAprovadas);
                                      const ssVal = sumValor(kpiSemSol);
                                      const ssMin = sumMins(kpiSemSol);
                                      const ssFun = uniqFunc(kpiSemSol);
                                      const cardBase = "rounded-lg border-2 p-3 text-left transition-all cursor-pointer hover:shadow-md focus:outline-none";
                                      return (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
                                          {/* TOTAL — azul FC #1B2A4A (regra de ouro) */}
                                          <button
                                            type="button"
                                            onClick={() => setHeOrigemFilter("todos")}
                                            className={`${cardBase} ${heOrigemFilter === "todos" ? "border-[#1B2A4A] bg-[#1B2A4A] text-white ring-2 ring-[#1B2A4A]/30" : "border-gray-200 bg-white hover:border-[#1B2A4A]/50"}`}
                                            title="Mostrar todos"
                                          >
                                            <div className="flex items-center justify-between mb-1">
                                              <span className={`text-[11px] font-semibold uppercase tracking-wider ${heOrigemFilter === "todos" ? "text-white/90" : "text-[#1B2A4A]"}`}>Total HE</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${heOrigemFilter === "todos" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>{totFun} func</span>
                                            </div>
                                            <div className={`text-xl font-bold ${heOrigemFilter === "todos" ? "text-white" : "text-[#1B2A4A]"}`}>{formatBRL(totVal)}</div>
                                            <div className={`text-[11px] mt-0.5 ${heOrigemFilter === "todos" ? "text-white/80" : "text-gray-500"}`}>{minsToHHMM(totMin)} acumuladas</div>
                                          </button>
                                          {/* APROVADAS — verde */}
                                          <button
                                            type="button"
                                            onClick={() => setHeOrigemFilter(heOrigemFilter === "aprovada" ? "todos" : "aprovada")}
                                            className={`${cardBase} ${heOrigemFilter === "aprovada" ? "border-green-600 bg-green-600 text-white ring-2 ring-green-600/30" : "border-gray-200 bg-white hover:border-green-400"}`}
                                            title="Filtrar apenas Aprovadas"
                                          >
                                            <div className="flex items-center justify-between mb-1">
                                              <span className={`text-[11px] font-semibold uppercase tracking-wider ${heOrigemFilter === "aprovada" ? "text-white/90" : "text-green-700"}`}>✅ Aprovadas</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${heOrigemFilter === "aprovada" ? "bg-white/20 text-white" : "bg-green-50 text-green-700"}`}>{aprFun} func</span>
                                            </div>
                                            <div className={`text-xl font-bold ${heOrigemFilter === "aprovada" ? "text-white" : "text-green-700"}`}>{formatBRL(aprVal)}</div>
                                            <div className={`text-[11px] mt-0.5 ${heOrigemFilter === "aprovada" ? "text-white/80" : "text-gray-500"}`}>{minsToHHMM(aprMin)} · {totVal > 0 ? Math.round((aprVal / totVal) * 100) : 0}% do total</div>
                                          </button>
                                          {/* SEM SOLICITAÇÃO — âmbar */}
                                          <button
                                            type="button"
                                            onClick={() => setHeOrigemFilter(heOrigemFilter === "sem_solicitacao" ? "todos" : "sem_solicitacao")}
                                            className={`${cardBase} ${heOrigemFilter === "sem_solicitacao" ? "border-amber-600 bg-amber-600 text-white ring-2 ring-amber-600/30" : "border-gray-200 bg-white hover:border-amber-400"}`}
                                            title="Filtrar apenas Sem solicitação"
                                          >
                                            <div className="flex items-center justify-between mb-1">
                                              <span className={`text-[11px] font-semibold uppercase tracking-wider ${heOrigemFilter === "sem_solicitacao" ? "text-white/90" : "text-amber-700"}`}>⚠️ Sem solicitação</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${heOrigemFilter === "sem_solicitacao" ? "bg-white/20 text-white" : "bg-amber-50 text-amber-700"}`}>{ssFun} func</span>
                                            </div>
                                            <div className={`text-xl font-bold ${heOrigemFilter === "sem_solicitacao" ? "text-white" : "text-amber-700"}`}>{formatBRL(ssVal)}</div>
                                            <div className={`text-[11px] mt-0.5 ${heOrigemFilter === "sem_solicitacao" ? "text-white/80" : "text-gray-500"}`}>{minsToHHMM(ssMin)} · {totVal > 0 ? Math.round((ssVal / totVal) * 100) : 0}% do total</div>
                                          </button>
                                        </div>
                                      );
                                    })()}

                                    {/* EMPLOYEE TABLE */}
                                    {heOrigemFilter !== "todos" && periodEmpsAll.length > 0 && (
                                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span>Filtrando: <strong>{heOrigemFilter === "aprovada" ? "Aprovadas" : "Sem solicitação"}</strong> ({periodEmps.length} linhas)</span>
                                        <button type="button" onClick={() => setHeOrigemFilter("todos")} className="text-purple-600 hover:underline">Limpar filtro</button>
                                      </div>
                                    )}
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b-2 border-gray-200 text-left">
                                            <th className="py-2 px-2">Funcionário</th>
                                            {/* Rev. 2179 — coluna Solicitação (Aprovada / Sem solicitação) */}
                                            <th className="text-center py-2 px-2">Solicitação</th>
                                            <th className="text-right py-2 px-2">HE Úteis</th>
                                            <th className="text-right py-2 px-2">HE Fim Sem.</th>
                                            <th className="text-right py-2 px-2">Total HE</th>
                                            <th className="text-right py-2 px-2">Valor HE</th>
                                            {periodEmps.some((e: any) => e.valorPlanilha != null) && (
                                              <>
                                                <th className="text-right py-2 px-2 text-orange-700">Ref. Planilha</th>
                                                <th className="text-right py-2 px-2 text-orange-700">Divergência</th>
                                              </>
                                            )}
                                            <th className="text-right py-2 px-2">Saldo Banco</th>
                                            <th className="text-center py-2 px-2">Destinação</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(() => {
                                            // Rev. 2179 — agrupa por employeeId (assume já ordenado).
                                            // Nome e Saldo Banco usam rowSpan; HE/Valor/Solicitação/Destinação por linha.
                                            const hasPlanilha = periodEmps.some((x: any) => x.valorPlanilha != null);
                                            const groups = new Map<number, any[]>();
                                            for (const e of periodEmps) {
                                              const k = Number(e.employeeId);
                                              if (!groups.has(k)) groups.set(k, []);
                                              groups.get(k)!.push(e);
                                            }
                                            const rows: JSX.Element[] = [];
                                            for (const [empKey, items] of groups) {
                                              const saldo = saldoMap.get(empKey) || 0;
                                              const first = items[0];
                                              items.forEach((e: any, idx: number) => {
                                                const dest = destinacaoMap[e.id] ?? (e.destinacao || "pagamento");
                                                const origem = e.origem || "sem_solicitacao";
                                                const isFirst = idx === 0;
                                                const isLast  = idx === items.length - 1;
                                                // Rev. 3348 — abrir o Memorial de Cálculo (detalhamento dia a dia
                                                // das horas extras) clicando nas próprias horas, não só no ícone.
                                                const abrirMemorial = () => {
                                                  const perId = Number(p.id);
                                                  if (!empKey || !perId) {
                                                    toast.error(`Não foi possível abrir o detalhamento: dados ausentes (período=${perId}, funcionário=${empKey})`);
                                                    return;
                                                  }
                                                  setMemorialHePeriodId(perId);
                                                  setMemorialEmployeeId(empKey);
                                                };
                                                rows.push(
                                                  <tr key={e.id}
                                                    className={`hover:bg-white/80 ${dest === "banco_horas" ? "bg-blue-50/30" : ""} ${isLast ? "border-b border-gray-200" : "border-b border-gray-50"}`}>
                                                    {isFirst && (
                                                      <td rowSpan={items.length} className="py-2 px-2 font-medium align-top border-r border-gray-100">
                                                        {/* Rev. 2189 — avatar do colaborador (employees.fotoUrl) */}
                                                        <div className="flex items-center gap-2">
                                                          {first.fotoUrl ? (
                                                            <button
                                                              type="button"
                                                              title="Toque para ampliar a foto"
                                                              aria-label={`Ampliar foto de ${first.nomeCompleto || first.nome || `ID ${empKey}`}`}
                                                              onClick={() => setFotoZoom({ url: first.fotoUrl, nome: first.nomeCompleto || first.nome || `ID ${empKey}` })}
                                                              className="relative flex-shrink-0 group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                                            >
                                                              <img
                                                                src={first.fotoUrl}
                                                                alt={first.nomeCompleto || `ID ${empKey}`}
                                                                className="w-8 h-8 rounded-full object-cover border border-gray-200 bg-gray-50 cursor-zoom-in group-hover:ring-2 group-hover:ring-blue-400 group-active:ring-2 group-active:ring-blue-500 transition"
                                                                onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                              />
                                                              <span className="absolute -bottom-0.5 -right-0.5 bg-blue-600 text-white rounded-full p-0.5 shadow ring-1 ring-white opacity-80 group-hover:opacity-100 group-active:opacity-100">
                                                                <ZoomIn className="h-2.5 w-2.5" aria-hidden="true" />
                                                              </span>
                                                            </button>
                                                          ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0">
                                                              {String(first.nomeCompleto || first.nome || "?").trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                                            </div>
                                                          )}
                                                          <button className="text-left hover:text-blue-600 hover:underline focus:outline-none"
                                                            onClick={() => { setEspelhoPopupEmpId(empKey); setEspelhoPopupEmpNome(first.nomeCompleto || first.nome || `ID ${empKey}`); }}
                                                            title="Abrir espelho de ponto">
                                                            {first.nomeCompleto || first.nome}
                                                          </button>
                                                        </div>
                                                      </td>
                                                    )}
                                                    <td className="text-center py-2 px-2">
                                                      {origem === "aprovada" ? (
                                                        // Rev. 2184 — clicável: abre dialog com a(s) solicitação(ões)
                                                        // HE aprovada(s) que cobrem este funcionário no período.
                                                        <button
                                                          type="button"
                                                          title="Ver solicitação(ões) HE aprovada(s) que cobrem este período"
                                                          onClick={(ev) => {
                                                            ev.stopPropagation();
                                                            setSolicAprovDialog({
                                                              empId: Number(empKey),
                                                              empNome: first.nomeCompleto || first.nome || `ID ${empKey}`,
                                                              dataInicio: String(p.dataInicio).slice(0, 10),
                                                              dataFim: String(p.dataFim).slice(0, 10),
                                                            });
                                                          }}
                                                          className="focus:outline-none focus:ring-2 focus:ring-green-300 rounded"
                                                        >
                                                          <Badge className="text-[10px] bg-green-100 text-green-800 border border-green-200 cursor-pointer hover:bg-green-200">✅ Aprovada</Badge>
                                                        </button>
                                                      ) : (
                                                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200">⚠️ Sem solicitação</Badge>
                                                      )}
                                                    </td>
                                                    <td className="text-right py-2 px-2 text-xs text-muted-foreground">
                                                      {e.heUtilMins > 0 ? (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); abrirMemorial(); }}
                                                          title="Ver os dias dessas horas extras"
                                                          className="hover:text-purple-700 hover:underline focus-visible:ring-2 focus-visible:ring-purple-300 rounded cursor-pointer">
                                                          {minsToHHMM(e.heUtilMins)}
                                                        </button>
                                                      ) : "—"}
                                                    </td>
                                                    <td className="text-right py-2 px-2 text-xs text-muted-foreground">
                                                      {e.heFimMins > 0 ? (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); abrirMemorial(); }}
                                                          title="Ver os dias dessas horas extras"
                                                          className="hover:text-purple-700 hover:underline focus-visible:ring-2 focus-visible:ring-purple-300 rounded cursor-pointer">
                                                          {minsToHHMM(e.heFimMins)}
                                                        </button>
                                                      ) : "—"}
                                                    </td>
                                                    <td className="text-right py-2 px-2 font-medium">
                                                      {e.heTotalMins > 0 ? (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); abrirMemorial(); }}
                                                          title="Ver os dias dessas horas extras"
                                                          className="hover:text-purple-700 hover:underline focus-visible:ring-2 focus-visible:ring-purple-300 rounded cursor-pointer font-medium">
                                                          {minsToHHMM(e.heTotalMins)}
                                                        </button>
                                                      ) : minsToHHMM(e.heTotalMins)}
                                                    </td>
                                                    <td className="text-right py-2 px-2 font-bold text-purple-700">
                                                      <span className="inline-flex items-center gap-1">
                                                        {formatBRL(Number(e.valorHETotal))}
                                                        <button
                                                          type="button"
                                                          title="Memorial de cálculo"
                                                          onClick={(ev) => {
                                                            ev.stopPropagation();
                                                            const perId = Number(p.id);
                                                            if (!empKey || !perId) {
                                                              toast.error(`Não foi possível abrir o memorial: dados ausentes (período=${perId}, funcionário=${empKey})`);
                                                              return;
                                                            }
                                                            setMemorialHePeriodId(perId);
                                                            setMemorialEmployeeId(empKey);
                                                          }}
                                                          className="text-purple-400 hover:text-purple-700 transition-colors ml-0.5 cursor-pointer"
                                                        >
                                                          <FileText className="h-3.5 w-3.5" />
                                                        </button>
                                                      </span>
                                                    </td>
                                                    {hasPlanilha && (() => {
                                                      const vp = e.valorPlanilha != null ? Number(e.valorPlanilha) : null;
                                                      const ve = Number(e.valorHETotal);
                                                      const diff = vp !== null ? vp - ve : null;
                                                      return (
                                                        <>
                                                          <td className="text-right py-2 px-2 text-xs">
                                                            {vp !== null ? <span className="font-medium text-orange-700">{formatBRL(vp)}</span> : <span className="text-gray-300">—</span>}
                                                          </td>
                                                          <td className="text-right py-2 px-2 text-xs font-bold">
                                                            {diff !== null ? (
                                                              Math.abs(diff) < 0.02 ? (
                                                                <span className="text-green-600">✓ OK</span>
                                                              ) : diff > 0 ? (
                                                                <span className="text-red-600">+{formatBRL(diff)}</span>
                                                              ) : (
                                                                <span className="text-blue-600">{formatBRL(diff)}</span>
                                                              )
                                                            ) : <span className="text-gray-300">—</span>}
                                                          </td>
                                                        </>
                                                      );
                                                    })()}
                                                    {isFirst && (
                                                      <td rowSpan={items.length} className="text-right py-2 px-2 align-top">
                                                        {saldo > 0
                                                          ? <span className="text-blue-600 font-medium text-xs">{minsToHHMM(saldo)}</span>
                                                          : <span className="text-gray-300 text-xs">—</span>}
                                                      </td>
                                                    )}
                                                    <td className="text-center py-2 px-2">
                                                      {p.status === "calculado" ? (
                                                        <div className="inline-flex rounded border overflow-hidden">
                                                          <button
                                                            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${dest === "pagamento" ? "bg-green-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                                                            onClick={() => handleSetDestinacao(e.id, "pagamento")}>
                                                            💵 Pagar
                                                          </button>
                                                          <button
                                                            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${dest === "banco_horas" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                                                            onClick={() => handleSetDestinacao(e.id, "banco_horas")}>
                                                            🏦 Banco
                                                          </button>
                                                        </div>
                                                      ) : (
                                                        <Badge className={`text-[10px] ${dest === "banco_horas" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                                                          {dest === "banco_horas" ? "🏦 Banco" : "💵 Pagamento"}
                                                        </Badge>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              });
                                            }
                                            return rows;
                                          })()}
                                        </tbody>
                                        <tfoot>
                                          {(() => {
                                            const hasPlanilha = periodEmps.some((e: any) => e.valorPlanilha != null);
                                            const totalERP = periodEmps.reduce((s: number, e: any) => s + Number(e.valorHETotal), 0);
                                            const totalPlan = hasPlanilha ? periodEmps.reduce((s: number, e: any) => s + (e.valorPlanilha != null ? Number(e.valorPlanilha) : 0), 0) : 0;
                                            const totalDiff = totalPlan - totalERP;
                                            return (
                                              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                                                <td className="py-2 px-2" colSpan={5}>TOTAL</td>
                                                <td className="text-right py-2 px-2 text-lg text-purple-700">
                                                  {formatBRL(totalERP)}
                                                </td>
                                                {hasPlanilha && (
                                                  <>
                                                    <td className="text-right py-2 px-2 text-orange-700">{formatBRL(totalPlan)}</td>
                                                    <td className="text-right py-2 px-2">
                                                      {Math.abs(totalDiff) < 0.02 ? (
                                                        <span className="text-green-600">✓ OK</span>
                                                      ) : totalDiff > 0 ? (
                                                        <span className="text-red-600">+{formatBRL(totalDiff)}</span>
                                                      ) : (
                                                        <span className="text-blue-600">{formatBRL(totalDiff)}</span>
                                                      )}
                                                    </td>
                                                  </>
                                                )}
                                                <td colSpan={2} />
                                              </tr>
                                            );
                                          })()}
                                        </tfoot>
                                      </table>
                                    </div>

                                    {/* APPROVE BUTTON */}
                                    {p.status === "calculado" && periodEmps.length > 0 && !heConsolidadoMod && (
                                      <div className="flex items-center gap-3 pt-2 border-t no-print">
                                        <Button className="bg-green-600 hover:bg-green-700"
                                          onClick={() => aprovarComDestinacaoMut.mutate({ hePeriodId: p.id, companyId })}
                                          disabled={aprovarComDestinacaoMut.isPending}>
                                          {aprovarComDestinacaoMut.isPending
                                            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                                            : <><CheckCircle className="h-4 w-4 mr-2" /> Aprovar e Processar</>}
                                        </Button>
                                        <span className="text-xs text-muted-foreground">
                                          Pagamentos serão registrados para confirmação · Banco de Horas será creditado imediatamente
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center text-muted-foreground text-sm">
                  Nenhum período de HE calculado para {formatMesAno(mesAno)}. Use o formulário acima para calcular.
                </div>
              )}
            </>
          )}

          {/* ============ SUB-VIEW: BANCO DE HORAS ============ */}
          {heSubView === "banco_horas" && (
            <>
              {/* SUMMARY CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total em Banco</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{minsToHHMM(totalBancoMins)}</p>
                    <p className="text-xs text-muted-foreground mt-1">horas acumuladas</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Funcionários com Saldo</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{saldos.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">com banco ativo</p>
                  </CardContent>
                </Card>
                <Card className={alertas.length > 0 ? "border-amber-300 bg-amber-50/30" : "border-gray-200"}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Alertas de Expiração</p>
                    <p className={`text-2xl font-bold mt-1 ${alertas.length > 0 ? "text-amber-600" : "text-gray-400"}`}>{alertas.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">há mais de 12 meses</p>
                  </CardContent>
                </Card>
              </div>

              {/* EXPIRY ALERTS TABLE */}
              {alertas.length > 0 && (
                <Card className="border-amber-300">
                  <CardContent className="p-5">
                    <p className="font-semibold text-sm mb-3 flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" /> Horas a Vencer — créditos há mais de 12 meses em banco
                    </p>
                    <div className="space-y-2">
                      {alertas.map((a: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-200 text-sm flex-wrap gap-2">
                          <span className="font-medium">{a.nomeCompleto}</span>
                          <span className="text-amber-700">Saldo: {minsToHHMM(Number(a.saldoMinutos))} · Mais antigo: {String(a.creditoMaisAntigo).slice(0, 10)}</span>
                          <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
                            onClick={() => { setHeDebitarEmpId(Number(a.employeeId)); setHeDebitarDesc(""); setHeDebitarHoras(0); setHeDebitarMins(0); }}>
                            Debitar Horas
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* EMPLOYEE SALDO TABLE */}
              {saldoBanco.isLoading ? (
                <div className="text-center py-6 text-muted-foreground">Carregando saldos...</div>
              ) : saldos.length > 0 ? (
                <Card>
                  <CardContent className="p-5">
                    <p className="font-semibold text-sm mb-3">Saldo por Funcionário</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 px-2">Funcionário</th>
                            <th className="text-left py-2 px-2">Cargo</th>
                            <th className="text-right py-2 px-2">Saldo</th>
                            <th className="text-right py-2 px-2">Última Movim.</th>
                            <th className="text-center py-2 px-2 no-print">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {saldos.map((s: any) => {
                            const isExpiring = alertas.some((a: any) => Number(a.employeeId) === Number(s.employeeId));
                            return (
                              <tr key={s.employeeId} className={`border-b border-gray-100 hover:bg-gray-50 ${isExpiring ? "bg-amber-50/30" : ""}`}>
                                <td className="py-2 px-2 font-medium">
                                  {s.nomeCompleto}
                                  {isExpiring && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">⚠ Vencendo</span>}
                                </td>
                                <td className="py-2 px-2 text-xs text-muted-foreground">{s.funcao || "—"}</td>
                                <td className="text-right py-2 px-2 font-bold text-blue-700">{minsToHHMM(Number(s.saldoMinutos))}</td>
                                <td className="text-right py-2 px-2 text-xs text-muted-foreground">
                                  {s.ultimoLancamento ? new Date(s.ultimoLancamento).toLocaleDateString("pt-BR") : "—"}
                                </td>
                                <td className="text-center py-2 px-2 no-print">
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-xs"
                                      onClick={() => { setHeLancamentosEmpId(heLancamentosEmpId === Number(s.employeeId) ? null : Number(s.employeeId)); }}>
                                      {heLancamentosEmpId === Number(s.employeeId) ? "Fechar" : "Histórico"}
                                    </Button>
                                    <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
                                      onClick={() => { setHeDebitarEmpId(heDebitarEmpId === Number(s.employeeId) ? null : Number(s.employeeId)); setHeDebitarDesc(""); setHeDebitarHoras(0); setHeDebitarMins(0); }}>
                                      Debitar
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-muted-foreground text-sm">
                  Nenhum funcionário com saldo no banco de horas. Saldos aparecem após aprovação de períodos com destinação "Banco de Horas".
                </div>
              )}

              {/* HISTORY PANEL */}
              {heLancamentosEmpId && (
                <Card className="border-gray-300">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-sm">Histórico — {lancamentosEmpNome}</p>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setHeLancamentosEmpId(null)}>Fechar</Button>
                    </div>
                    {lancamentosBanco.isLoading ? (
                      <div className="text-center py-3 text-muted-foreground text-sm">Carregando histórico...</div>
                    ) : lancamentos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-1.5 px-2">Data</th>
                              <th className="text-left py-1.5 px-2">Tipo</th>
                              <th className="text-right py-1.5 px-2">Horas</th>
                              <th className="text-left py-1.5 px-2">Descrição</th>
                              <th className="text-left py-1.5 px-2">Por</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lancamentos.map((l: any) => (
                              <tr key={l.id} className="border-b border-gray-100">
                                <td className="py-1.5 px-2 text-xs">{String(l.data).slice(0, 10)}</td>
                                <td className="py-1.5 px-2">
                                  <Badge className={`text-[10px] ${l.tipo === "credito" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                    {l.tipo === "credito" ? "+ Crédito" : "− Débito"}
                                  </Badge>
                                </td>
                                <td className="text-right py-1.5 px-2 font-medium">{minsToHHMM(Number(l.minutos))}</td>
                                <td className="py-1.5 px-2 text-xs text-muted-foreground">{l.descricao || "—"}</td>
                                <td className="py-1.5 px-2 text-xs text-muted-foreground">{l.criadoPor || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground text-sm py-3">Nenhum lançamento encontrado.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* DEBIT FORM */}
              {heDebitarEmpId && (
                <Card className="border-orange-300 bg-orange-50/20">
                  <CardContent className="p-5">
                    <p className="font-semibold text-sm mb-4 flex items-center gap-2 text-orange-700">
                      <CreditCard className="h-4 w-4" /> Registrar Débito — {debitarEmpNome}
                      <span className="ml-auto text-xs text-muted-foreground font-normal">
                        Saldo atual: <strong className="text-blue-700">{minsToHHMM(saldoMap.get(heDebitarEmpId) || 0)}</strong>
                      </span>
                    </p>
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Data do Afastamento</label>
                        <input type="date" value={heDebitarData} onChange={e => setHeDebitarData(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Horas</label>
                        <input type="number" min="0" max="23" value={heDebitarHoras}
                          onChange={e => setHeDebitarHoras(Math.max(0, parseInt(e.target.value) || 0))}
                          className="border rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Minutos</label>
                        <input type="number" min="0" max="59" value={heDebitarMins}
                          onChange={e => setHeDebitarMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="border rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="0" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-muted-foreground block mb-1">Motivo</label>
                        <input type="text" value={heDebitarDesc} onChange={e => setHeDebitarDesc(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-300"
                          placeholder="Ex: Folga compensatória 20/03/2026" />
                      </div>
                      <Button className="bg-orange-600 hover:bg-orange-700"
                        disabled={debitarBancoMut.isPending || (heDebitarHoras === 0 && heDebitarMins === 0) || heDebitarDesc.trim().length < 3}
                        onClick={() => debitarBancoMut.mutate({
                          employeeId: heDebitarEmpId,
                          companyId,
                          minutos: heDebitarHoras * 60 + heDebitarMins,
                          descricao: heDebitarDesc,
                          data: heDebitarData,
                        })}>
                        {debitarBancoMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Registrando...</> : "Registrar Débito"}
                      </Button>
                      <Button variant="outline" onClick={() => setHeDebitarEmpId(null)}>Cancelar</Button>
                    </div>
                    {(heDebitarHoras > 0 || heDebitarMins > 0) && (
                      <p className="text-xs text-orange-700 mt-2">
                        Total a debitar: <strong>{minsToHHMM(heDebitarHoras * 60 + heDebitarMins)}</strong> ·
                        Saldo restante após débito: <strong>{minsToHHMM(Math.max(0, (saldoMap.get(heDebitarEmpId) || 0) - (heDebitarHoras * 60 + heDebitarMins)))}</strong>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Dialog open={!!memorialHePeriodId && !!memorialEmployeeId} onOpenChange={(open) => { if (!open) { setMemorialHePeriodId(null); setMemorialEmployeeId(null); } }}>
            {/* Rev. 1837 — Memorial HE redesign: header gradiente, KPIs de topo, tabela com sticky header e zebra moderna, fórmula em chips. */}
            <DialogContent className="max-w-4xl max-h-[92dvh] flex flex-col p-0 gap-0 overflow-hidden" resizable={false}>
              <DialogHeader className="px-5 sm:px-6 py-4 border-b shrink-0 bg-gradient-to-r from-purple-700 via-purple-600 to-fuchsia-600 text-white">
                <DialogTitle className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base sm:text-lg font-semibold leading-tight">Memorial de Cálculo</div>
                    <div className="text-xs font-normal text-purple-100/90 leading-tight">Hora Extra — detalhamento dia a dia</div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/60">
                {memorialQ.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                    <p className="text-sm">Carregando memorial...</p>
                  </div>
                ) : memorialQ.error ? (
                  <div className="m-4 sm:m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Erro ao carregar memorial: {memorialQ.error.message}</span>
                  </div>
                ) : memorialQ.data ? (() => {
                  const m = memorialQ.data;
                  const minsToHM = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}min`;
                  const periodoFmt = m.periodo.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_: any, y: string, mo: string, d: string) => `${d}/${mo}/${y}`);
                  const diasComHE = m.dias.filter((d: any) => d.heMins > 0).length;
                  return (
                    <div className="p-4 sm:p-6 space-y-4">
                      {/* Card funcionário + 4 chips */}
                      <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 px-4 py-3 border-b border-purple-200 flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-purple-700 shrink-0" />
                          <p className="font-bold uppercase tracking-wide text-sm text-purple-900 truncate" title={m.nome}>{m.nome}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-purple-100">
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Período</p>
                            <p className="text-xs font-semibold text-purple-900 truncate" title={periodoFmt}>{periodoFmt}</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Valor/hora</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">R$ {m.valorHora.toFixed(2).replace(".", ",")}</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Adic. útil</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">{m.percentualUtil}%</p>
                          </div>
                          <div className="px-4 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-purple-500 font-medium">Adic. dom/fer</p>
                            <p className="text-xs font-semibold text-purple-900 tabular-nums">{m.percentualFim}%</p>
                          </div>
                        </div>
                      </div>

                      {/* KPIs de topo */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl border border-blue-200 p-3 sm:p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-blue-600">Total HE</p>
                            <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-blue-700 tabular-nums leading-tight">{minsToHM(m.totalHEMins)}</p>
                          {(m.descontoAtrasoMins ?? 0) > 0 && (
                            <p className="text-[10px] text-amber-700 mt-1">líquido (após atrasos)</p>
                          )}
                        </div>
                        <div className="bg-white rounded-xl border border-purple-200 p-3 sm:p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-purple-600">Valor Total</p>
                            <Wallet className="h-4 w-4 text-purple-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-purple-700 tabular-nums leading-tight">R$ {m.valorTotal.toFixed(2).replace(".", ",")}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-emerald-200 p-3 sm:p-4 shadow-sm col-span-2 sm:col-span-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-medium text-emerald-600">Dias com HE</p>
                            <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
                          </div>
                          <p className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums leading-tight">{diasComHE}<span className="text-sm font-medium text-emerald-500"> / {m.dias.length}</span></p>
                        </div>
                      </div>

                      {/* Tabela detalhada */}
                      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-slate-500" />
                          <h3 className="text-sm font-semibold text-slate-700">Detalhamento por dia</h3>
                          <span className="ml-auto text-[10px] text-slate-500">{m.dias.length} {m.dias.length === 1 ? "dia" : "dias"} no período</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-xs">
                            <thead>
                              <tr className="bg-slate-100/80 text-slate-700 text-[11px] uppercase tracking-wide">
                                <th className="py-2 px-3 font-semibold text-left">Data</th>
                                <th className="py-2 px-3 font-semibold text-center">Dia</th>
                                <th className="py-2 px-3 font-semibold text-center">Horários</th>
                                <th className="py-2 px-3 font-semibold text-right">Trab.</th>
                                <th className="py-2 px-3 font-semibold text-right">Jornada</th>
                                <th className="py-2 px-3 font-semibold text-right">HE</th>
                                <th className="py-2 px-3 font-semibold text-center">Adic.</th>
                                <th className="py-2 px-3 font-semibold text-center">Fonte</th>
                                <th className="py-2 px-3 font-semibold text-right">Cálculo</th>
                                <th className="py-2 px-3 font-semibold text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.dias.map((d: any, i: number) => (
                                <tr key={i} className={`border-t border-slate-100 ${d.feriado ? "bg-purple-50/60" : d.diaSemana === "Dom" ? "bg-red-50/60" : i % 2 === 0 ? "" : "bg-slate-50/40"} hover:bg-purple-50/40 transition-colors`}>
                                  <td className="py-1.5 px-3 font-mono whitespace-nowrap">{d.data.split("-").reverse().join("/")}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <span className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                      d.feriado ? "bg-purple-100 text-purple-700" :
                                      d.diaSemana === "Dom" ? "bg-red-100 text-red-700" :
                                      d.diaSemana === "Sáb" ? "bg-orange-100 text-orange-700" :
                                      "bg-slate-100 text-slate-700"
                                    }`} title={d.feriado ? "Feriado — HE 100%" : undefined}>{d.feriado ? "Fer" : d.diaSemana}</span>
                                  </td>
                                  <td className="py-1.5 px-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap">{d.horarios}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">{d.trabalhado}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">{d.jornada}</td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">{Math.floor(d.heMins / 60)}:{String(d.heMins % 60).padStart(2, "0")}</td>
                                  <td className="py-1.5 px-3 text-center tabular-nums">{d.percentual}%</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      d.fonte === "dixi" ? "bg-emerald-100 text-emerald-700" :
                                      d.fonte === "manual" ? "bg-purple-100 text-purple-700" :
                                      "bg-slate-100 text-slate-600"
                                    }`}>
                                      {d.fonte || "—"}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                    ({d.heMins}÷60)×{m.valorHora.toFixed(2)}×{d.fator.toFixed(1)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-bold text-purple-700 tabular-nums whitespace-nowrap">R$ {d.valorDia.toFixed(2).replace(".", ",")}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              {(m.descontoAtrasoMins ?? 0) > 0 ? (
                                <>
                                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs">
                                    <td colSpan={5} className="py-2 px-3 text-right text-slate-700 font-medium">HE Bruto</td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums text-blue-700">{minsToHM(m.totalHEGrossMins ?? m.totalHEMins)}</td>
                                    <td colSpan={3} className="py-2 px-3 text-right text-[10px] font-mono text-muted-foreground">
                                      {(m.totalHEUtilGrossMins ?? 0) > 0 && <span>Úteis: {minsToHM(m.totalHEUtilGrossMins)} </span>}
                                      {(m.totalHEFimGrossMins ?? 0) > 0 && <span>Dom/Fer: {minsToHM(m.totalHEFimGrossMins)}</span>}
                                    </td>
                                    <td className="py-2 px-3 text-right" />
                                  </tr>
                                  <tr className="bg-amber-50 text-xs">
                                    <td colSpan={5} className="py-2 px-3 text-right text-amber-800 font-medium" title={`Atrasos do período: ${minsToHM(m.totalAtrasoMins)} (descontados ${minsToHM(m.descontoAtrasoMins)} do HE)`}>
                                      (−) Atrasos descontados
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-800">−{minsToHM(m.descontoAtrasoMins)}</td>
                                    <td colSpan={3} className="py-2 px-3 text-right text-[10px] text-muted-foreground">
                                      Atraso total: {minsToHM(m.totalAtrasoMins)}
                                    </td>
                                    <td className="py-2 px-3 text-right" />
                                  </tr>
                                </>
                              ) : null}
                              <tr className="border-t-2 border-purple-200 bg-gradient-to-r from-purple-50 to-fuchsia-50 font-bold">
                                <td colSpan={5} className="py-2.5 px-3 text-right text-purple-900 uppercase text-[11px] tracking-wide">{(m.descontoAtrasoMins ?? 0) > 0 ? "Total Líquido" : "Total"}</td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">{minsToHM(m.totalHEMins)}</td>
                                <td colSpan={3} className="py-2.5 px-3 text-right text-[11px] font-mono text-muted-foreground">
                                  {m.totalHEUtilMins > 0 && <span>Úteis: {minsToHM(m.totalHEUtilMins)} </span>}
                                  {m.totalHEFimMins > 0 && <span>Dom/Fer: {minsToHM(m.totalHEFimMins)}</span>}
                                </td>
                                <td className="py-2.5 px-3 text-right text-base sm:text-lg text-purple-700 tabular-nums whitespace-nowrap">R$ {m.valorTotal.toFixed(2).replace(".", ",")}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Fórmula */}
                      <div className="bg-white rounded-xl border p-4 text-xs space-y-2 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Calculator className="h-4 w-4 text-slate-500" />
                          <p className="font-semibold text-slate-700 text-sm">Fórmula aplicada</p>
                        </div>
                        <p className="text-muted-foreground font-mono bg-slate-50 rounded px-2 py-1.5 border border-slate-100">Valor HE = (minutos HE ÷ 60) × Valor/Hora × (1 + Adicional% ÷ 100)</p>
                        <div className="space-y-1.5 pt-1">
                          {m.totalHEUtilMins > 0 && (
                            <p className="text-muted-foreground">
                              <span className="inline-block min-w-[110px] font-medium text-slate-600">Dias úteis:</span>
                              <span className="font-mono">({m.totalHEUtilMins}÷60) × R$ {m.valorHora.toFixed(2).replace(".",",")} × {(1 + m.percentualUtil / 100).toFixed(1)}</span>
                              <span className="mx-1.5">=</span>
                              <strong className="text-purple-700 tabular-nums">R$ {m.valorTotalUtil.toFixed(2).replace(".",",")}</strong>
                            </p>
                          )}
                          {m.totalHEFimMins > 0 && (
                            <p className="text-muted-foreground">
                              <span className="inline-block min-w-[110px] font-medium text-slate-600">Dom/Feriados:</span>
                              <span className="font-mono">({m.totalHEFimMins}÷60) × R$ {m.valorHora.toFixed(2).replace(".",",")} × {(1 + m.percentualFim / 100).toFixed(1)}</span>
                              <span className="mx-1.5">=</span>
                              <strong className="text-purple-700 tabular-nums">R$ {m.valorTotalFim.toFixed(2).replace(".",",")}</strong>
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-2 border-t mt-2">
                            <span className="font-semibold text-slate-800 text-sm">Total geral:</span>
                            <span className="ml-auto font-bold text-purple-700 text-base tabular-nums">R$ {m.valorTotal.toFixed(2).replace(".",",")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </DialogContent>
          </Dialog>

          {/* Rev. 2184 — Dialog: Solicitações HE aprovadas que cobrem o funcionário no período. */}
          <Dialog open={!!solicAprovDialog} onOpenChange={(open) => { if (!open) setSolicAprovDialog(null); }}>
            <DialogContent className="max-w-3xl max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden" resizable={false}>
              <DialogHeader className="px-5 sm:px-6 py-4 border-b shrink-0 bg-gradient-to-r from-green-700 via-emerald-600 to-teal-600 text-white">
                <DialogTitle className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base sm:text-lg font-semibold leading-tight">Solicitações HE Aprovadas</div>
                    <div className="text-xs font-normal text-green-100/90 leading-tight truncate">
                      {solicAprovDialog?.empNome} · {solicAprovDialog ? `${fmtDateBR(solicAprovDialog.dataInicio)} → ${fmtDateBR(solicAprovDialog.dataFim)}` : ""}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/60 p-4 sm:p-6">
                {solicAprovQ.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-green-100 border-t-green-600 animate-spin" />
                    <p className="text-sm">Carregando solicitações...</p>
                  </div>
                ) : solicAprovQ.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Erro ao carregar solicitações: {solicAprovQ.error.message}</span>
                  </div>
                ) : (() => {
                  const di = solicAprovDialog?.dataInicio || "";
                  const df = solicAprovDialog?.dataFim || "";
                  const todas = (solicAprovQ.data || []) as any[];
                  const aprovadas = todas.filter((s) => {
                    const st = String(s.status || "").toLowerCase();
                    const heSt = String(s.heStatus || "").toLowerCase();
                    if (st !== "aprovada" && heSt !== "aprovada") return false;
                    const d = String(s.dataSolicitacao || "").slice(0, 10);
                    return d >= di && d <= df;
                  });
                  if (aprovadas.length === 0) {
                    return (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Nenhuma solicitação HE aprovada encontrada para este funcionário no intervalo do período.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {aprovadas.map((s: any) => (
                        <div key={s.id} className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge className="text-[10px] bg-green-600 text-white">#{s.id}</Badge>
                              <span className="font-semibold text-sm text-green-900">{fmtDateBR(s.dataSolicitacao)}</span>
                              {s.horaInicio && s.horaFim && (
                                <span className="text-xs text-green-700 tabular-nums">{s.horaInicio}–{s.horaFim}</span>
                              )}
                              {s.horasRealizadas && (
                                <span className="text-[11px] text-green-700">· {s.horasRealizadas}h realizadas</span>
                              )}
                            </div>
                            <Badge className="text-[10px] bg-green-100 text-green-800 border border-green-200">✅ {String(s.status || "aprovada")}</Badge>
                          </div>
                          <div className="px-4 py-3 space-y-1.5 text-xs">
                            {s.obraNome && (
                              <p><span className="font-medium text-slate-600 inline-block min-w-[100px]">Obra:</span> {s.obraNome}</p>
                            )}
                            <p><span className="font-medium text-slate-600 inline-block min-w-[100px]">Motivo:</span> {s.motivo || "—"}</p>
                            <p><span className="font-medium text-slate-600 inline-block min-w-[100px]">Solicitado por:</span> {s.solicitadoPor || "—"}</p>
                            <p>
                              <span className="font-medium text-slate-600 inline-block min-w-[100px]">Aprovado por:</span>{" "}
                              {s.aprovadoPor || "—"}
                              {s.aprovadoEm && <span className="text-muted-foreground"> · em {fmtDateBR(String(s.aprovadoEm).slice(0,10))}</span>}
                            </p>
                            {s.observacaoAdmin && (
                              <p><span className="font-medium text-slate-600 inline-block min-w-[100px]">Obs. admin:</span> {s.observacaoAdmin}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </DialogContent>
          </Dialog>

        </div>
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  if (viewMode === "aprovacoes_rh") {
    return (
      <DashboardLayout>
        <FolhaAprovacoesRh
          companyId={companyId}
          mesAno={mesAno}
          onBack={() => { setViewMode("resumo"); pendenciasCount.refetch(); }}
        />
      </DashboardLayout>
    );
  }

  // ===== MAIN VIEW (resumo) =====
  return (
    <DashboardLayout>
      <PrintHeader />
      {fileInputs}
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-[#E8B931]" />
              Folha de Pagamento
            </h1>
            <p className="text-muted-foreground text-sm">Fluxo mensal: Ponto → Vale → Pagamento → Conferência</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button size="sm" variant="outline" onClick={() => openView("horas_extras")}>
              <Clock className="h-4 w-4 mr-1" /> Horas Extras
            </Button>
            <Button size="sm" variant="outline" className="text-amber-700 border-amber-200" onClick={() => setViewMode("descontos_epi")}>
              <HardHat className="h-4 w-4 mr-1" /> Descontos EPI
            </Button>
            <Button size="sm" variant="outline" className="text-rose-700 border-rose-200 relative" onClick={() => setViewMode("aprovacoes_rh")}>
              <ClipboardCheck className="h-4 w-4 mr-1" /> Aprovações RH
              {totalPendenciasAprovacao > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {totalPendenciasAprovacao}
                </span>
              )}
            </Button>
            <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200" onClick={() => setShowDissidioRel(true)}>
              <FileBarChart className="h-4 w-4 mr-1" /> Diferenças Dissídio
            </Button>
            <PrintActions title={`Folha de Pagamento - ${formatMesAno(mesAno)}`} />
          </div>
        </div>

        {/* CALENDÁRIO */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-bold text-lg min-w-[60px] text-center">{fmtNum(anoSelecionado)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Com lançamento</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /> Consolidado</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_CURTOS.map((nome, i) => {
                const mes = i + 1;
                const isSelected = mes === mesSelecionado;
                const status = getMonthStatus(mes);
                // Rev. 2200 — Alinhar visual com o calendário de Fechamento de Ponto:
                // cores SÓLIDAS (bg-{cor}-500 text-white) + Lock no canto superior
                // direito. Seleção mantém a cor de status e ganha ring escuro + scale.
                const statusClasses =
                  status === "consolidado" ? "bg-green-500 text-white hover:bg-green-600 border-green-600" :
                  status === "completo" ? "bg-blue-500 text-white hover:bg-blue-600 border-blue-600" :
                  "bg-gray-200 text-gray-500 hover:bg-gray-300 border-gray-300";
                const selectionClasses = isSelected
                  ? "ring-2 ring-offset-1 ring-[#1B2A4A] shadow-md scale-105"
                  : "";
                return (
                  <button key={mes} onClick={() => setMesSelecionado(mes)}
                    className={`relative rounded-lg py-2 px-1 text-center text-sm font-medium transition-all border-2 ${statusClasses} ${selectionClasses}`}>
                    {nome}
                    {status === "consolidado" && <Lock className="h-3 w-3 absolute top-0.5 right-0.5 text-white/80" />}
                    {status === "completo" && <FileText className="h-3 w-3 absolute top-0.5 right-0.5 text-white/80" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MÊS SELECIONADO */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
            <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
          </div>
          {isMaster && (
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400 gap-1.5"
              onClick={() => setShowLimparMes(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Limpar mês
            </Button>
          )}
        </div>

        {/* DIALOG — LIMPAR MÊS */}
        <Dialog open={showLimparMes} onOpenChange={setShowLimparMes}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Limpar {formatMesAno(mesAno)}
              </DialogTitle>
              <DialogDescription className="space-y-2 pt-1">
                <p>Esta ação irá <strong>apagar permanentemente</strong> todos os dados de folha do mês selecionado:</p>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Cálculo de Vale e Pagamento (Cálculo Interno)</li>
                  <li>Adiantamentos, ajustes e arredondamentos</li>
                  <li>PDFs importados (fluxo legado)</li>
                  <li>Status do período volta a "aberta"</li>
                </ul>
                <p className="font-semibold text-red-600">Ação irreversível. Confirma?</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowLimparMes(false)} disabled={limparMesMut.isPending}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={limparMesMut.isPending}
                onClick={() => limparMesMut.mutate({ companyId, mesReferencia: mesAno })}>
                {limparMesMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Limpando...</> : <><Trash2 className="h-4 w-4 mr-1" /> Confirmar limpeza</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== RELATÓRIO DE DIFERENÇAS SALARIAIS (DISSÍDIO) ===== */}
        <Dialog open={showDissidioRel} onOpenChange={setShowDissidioRel}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <FileBarChart className="h-5 w-5 text-emerald-600" />
                Diferenças Salariais Retroativas (Dissídio) — {fmtNum(anoSelecionado)}
                {dissidioRelQuery.data && dissidioRelQuery.data.rows.length > 0 && (
                  <Button size="sm" variant="outline" className="ml-auto border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={handlePrintDissidioRel}>
                    <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir / PDF
                  </Button>
                )}
              </DialogTitle>
              <DialogDescription>
                Diferenças geradas ao aplicar um dissídio com data de vigência no passado (ex.: data-base 01/05). Paga À PARTE da folha mensal (guia própria de INSS/IRRF) — NÃO entra nos totais da folha.
              </DialogDescription>
            </DialogHeader>
            {dissidioRelQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Carregando relatório...
              </div>
            ) : !dissidioRelQuery.data || dissidioRelQuery.data.rows.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-gray-500">Nenhuma diferença salarial gerada para {fmtNum(anoSelecionado)}. Diferenças surgem ao aplicar um dissídio com data de vigência no passado (Configurações › Sindical/Dissídio).</p>
                <p className="text-xs text-gray-400">Se o dissídio foi aplicado no mesmo mês da vigência (ex.: vigência 01/05 aplicada em maio), use o botão abaixo para calcular as diferenças retroativas.</p>
                <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  disabled={recalcularDifsMut.isPending}
                  onClick={() => recalcularDifsMut.mutate({ companyId, companyIds, anoReferencia: anoSelecionado })}>
                  {recalcularDifsMut.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Calculando...</> : <><RefreshCw className="h-3 w-3 mr-1" /> Calcular Diferenças Retroativas</>}
                </Button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                  <div className="bg-emerald-50 rounded-md p-2 border border-emerald-100">
                    <p className="text-[10px] text-gray-500 uppercase">Total Bruto</p>
                    <p className="text-sm font-bold text-emerald-700">{formatBRL(dissidioRelQuery.data.totalGeral)}</p>
                  </div>
                  <div className="bg-red-50 rounded-md p-2 border border-red-100">
                    <p className="text-[10px] text-gray-500 uppercase">Total INSS</p>
                    <p className="text-sm font-bold text-red-700">{formatBRL(dissidioRelQuery.data.totalInss ?? 0)}</p>
                  </div>
                  <div className="bg-red-50 rounded-md p-2 border border-red-100">
                    <p className="text-[10px] text-gray-500 uppercase">Total IRRF</p>
                    <p className="text-sm font-bold text-red-700">{formatBRL(dissidioRelQuery.data.totalIrrf ?? 0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-md p-2 border border-blue-100">
                    <p className="text-[10px] text-gray-500 uppercase">Total Líquido</p>
                    <p className="text-sm font-bold text-blue-700">{formatBRL(dissidioRelQuery.data.totalLiquido ?? 0)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="bg-emerald-50 rounded-md p-2 border border-emerald-100">
                    <p className="text-[10px] text-gray-500 uppercase">Na Folha</p>
                    <p className="text-sm font-bold text-emerald-700">{formatBRL(dissidioRelQuery.data.totalFolha)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-md p-2 border border-emerald-100">
                    <p className="text-[10px] text-gray-500 uppercase">Resc. Complementar</p>
                    <p className="text-sm font-bold text-amber-700">{formatBRL(dissidioRelQuery.data.totalComplementar)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-md p-2 border border-amber-100">
                    <p className="text-[10px] text-gray-500 uppercase">Total FGTS (informativo)</p>
                    <p className="text-sm font-bold text-amber-700">{formatBRL(dissidioRelQuery.data.totalFgts ?? 0)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-md p-2 border border-emerald-100">
                    <p className="text-[10px] text-gray-500 uppercase">Funcionários</p>
                    <p className="text-sm font-bold text-gray-700">{fmtNum(dissidioRelQuery.data.qtdFuncionarios)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-emerald-200 text-[10px] text-gray-500 uppercase">
                        <th className="text-left py-1.5 px-2">Funcionário</th>
                        <th className="text-left py-1.5 px-2">Ano</th>
                        <th className="text-center py-1.5 px-2">Tipo</th>
                        <th className="text-center py-1.5 px-2">Pagto</th>
                        <th className="text-right py-1.5 px-2">%</th>
                        <th className="text-right py-1.5 px-2">Base (verbas)</th>
                        <th className="text-right py-1.5 px-2">Bruto</th>
                        <th className="text-right py-1.5 px-2">INSS</th>
                        <th className="text-right py-1.5 px-2">IRRF</th>
                        <th className="text-right py-1.5 px-2">Líquido</th>
                        <th className="text-center py-1.5 px-2">Editar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dissidioRelQuery.data.rows].sort((a: any, b: any) => (a.employeeName || '').localeCompare(b.employeeName || '', 'pt-BR')).map((r: any) => (
                        <tr key={r.id} className={`border-b border-emerald-100 hover:bg-emerald-50/40 ${r.editadoManualmente ? 'bg-amber-50/50' : ''}`}>
                          <td className="py-1.5 px-2 font-medium">{r.employeeName || `#${r.employeeId}`}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{r.anoReferencia ?? '—'}</td>
                          <td className="py-1.5 px-2 text-center">
                            {r.diferencaTipo === 'rescisao_complementar' ? (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">Resc. Compl.</Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px]">Folha</Badge>
                            )}
                            {r.editadoManualmente && (
                              <Badge
                                variant="outline"
                                className="border-orange-300 text-orange-700 text-[10px] ml-1"
                                title={`Editado manualmente${r.diferencaOverrideJson?.editadoPorNome ? ` por ${r.diferencaOverrideJson.editadoPorNome}` : ''}${r.diferencaOverrideJson?.editadoEm ? ` em ${new Date(r.diferencaOverrideJson.editadoEm).toLocaleString('pt-BR')}` : ''}`}
                              >
                                Manual
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-center text-muted-foreground">{r.diferencaMesPagamento || '—'}</td>
                          <td className="py-1.5 px-2 text-right">{r.percentualAplicado}%</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{r.diferencaBaseVerbas ? formatBRL(r.diferencaBaseVerbas) : '—'}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">{formatBRL(r.valorRetroativo)}</td>
                          <td className="py-1.5 px-2 text-right text-red-600">{r.inss > 0 ? `- ${formatBRL(r.inss)}` : '—'}</td>
                          <td className="py-1.5 px-2 text-right text-red-600">{r.irrf > 0 ? `- ${formatBRL(r.irrf)}` : '—'}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-blue-700">{formatBRL(r.valorLiquido)}</td>
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Editar manualmente"
                                onClick={() => abrirEdicaoDif(r)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-gray-500" />
                              </Button>
                              {r.editadoManualmente && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Restaurar valor calculado"
                                  disabled={removerEdicaoDifMut.isPending}
                                  onClick={() => removerEdicaoDifMut.mutate({ companyId, companyIds, id: r.id })}
                                >
                                  <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ===== EDIÇÃO MANUAL DA DIFERENÇA RETROATIVA (Rev. 3993) ===== */}
        <Dialog open={!!editDifRow} onOpenChange={(open) => { if (!open) setEditDifRow(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-600" />
                Editar Diferença Manualmente
              </DialogTitle>
              <DialogDescription className="break-words">
                {editDifRow?.employeeName || `Funcionário #${editDifRow?.employeeId}`} — ajuste Bruto/INSS/IRRF; o Líquido é recalculado automaticamente. Esse valor passará a prevalecer sobre o cálculo automático até ser restaurado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bruto (diferença retroativa)</label>
                <Input
                  value={editDifBruto}
                  onChange={(e) => setEditDifBruto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">INSS</label>
                  <Input
                    value={editDifInss}
                    onChange={(e) => setEditDifInss(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">IRRF</label>
                  <Input
                    value={editDifIrrf}
                    onChange={(e) => setEditDifIrrf(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-blue-700 font-medium">Líquido</span>
                <span className="font-semibold text-blue-800">
                  {(() => {
                    const b = parseFloat(editDifBruto.replace(',', '.')) || 0;
                    const i = parseFloat(editDifInss.replace(',', '.')) || 0;
                    const ir = parseFloat(editDifIrrf.replace(',', '.')) || 0;
                    return formatBRL(Math.max(0, b - i - ir));
                  })()}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDifRow(null)}>Cancelar</Button>
              <Button onClick={salvarEdicaoDif} disabled={editarDifMut.isPending}>
                {editarDifMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== OVERLAY DE PROGRESSO DO CÁLCULO ===== */}
        <Dialog open={calcType !== null}>
          <DialogContent className="sm:max-w-md" onInteractOutside={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {calcType === "vale" ? <CreditCard className="h-5 w-5 text-orange-600" /> : <DollarSign className="h-5 w-5 text-green-600" />}
                {calcType === "vale" ? "Calculando Vale" : "Simulando Pagamento"}
              </DialogTitle>
              <DialogDescription>
                {calcType === "vale"
                  ? "Calculando adiantamentos (40% do salário) para todos os funcionários CLT ativos."
                  : "Calculando folha completa: salário bruto, descontos, INSS, FGTS, rateio por obra."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-[#1B2A4A] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {calcType === "vale"
                    ? <CreditCard className="h-6 w-6 text-orange-600" />
                    : <DollarSign className="h-6 w-6 text-green-600" />}
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#1B2A4A] tabular-nums">
                  {Math.floor(calcElapsed / 60) > 0
                    ? `${Math.floor(calcElapsed / 60)}m ${calcElapsed % 60}s`
                    : `${calcElapsed}s`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">tempo decorrido</p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-[#1B2A4A] rounded-full animate-pulse" style={{ width: `${Math.min(95, (calcElapsed / 120) * 100)}%`, transition: 'width 1s linear' }} />
              </div>
              <div className="text-center text-xs text-muted-foreground space-y-1 bg-blue-50 rounded-lg p-3 w-full">
                <p className="font-medium text-blue-700">Como funciona:</p>
                {calcType === "vale" ? <>
                  <p>1. Busca faltas e ausências do ponto (1 a 15)</p>
                  <p>2. Calcula 40% do salário para cada funcionário</p>
                  <p>3. Registra adiantamentos e lança no Financeiro</p>
                  <p className="font-medium text-blue-700 mt-1">Os resultados aparecerão em "Calcular Vale → Ver Resultado"</p>
                </> : <>
                  <p>1. Busca adiantamentos, faltas e horas extras do mês</p>
                  <p>2. Calcula salário líquido com todos os descontos</p>
                  <p>3. Faz rateio por obra para cada funcionário</p>
                  <p className="font-medium text-blue-700 mt-1">Os resultados aparecerão em "Simular Pagamento → Ver Resultado"</p>
                </>}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== CÁLCULO INTERNO (PayrollEngine) — Wizard de Etapas ===== */}
        {(() => {
          const pd = payrollPeriod.data as any;
          const valeOk = !!pd?.valeGeradoEm;
          const heOk = (() => {
            const activePeriods = (hePeriods.data as any[] || []).filter((p: any) => p.status !== 'cancelado');
            return activePeriods.some((p: any) => p.status === 'aprovado' || p.status === 'pago');
          })();
          const afericaoOk = pd?.afericaoRealizada === 1 || pd?.afericaoRealizada === true;
          const pagOk = !!pd?.pagamentoSimuladoEm;
          const pontoOk = !!statusMes.data?.pontoConsolidado;
          const heConsolidado = !!(pd as any)?.heConsolidadoEm;
          const afericaoConsolidada = !!(pd as any)?.afericaoConsolidadoEm;
          const pagamentoConsolidado = !!(pd as any)?.pagamentoConsolidadoEm;

          const step1Ready = true;
          const step2Ready = true;
          const step3Ready = pontoOk;
          const step4Ready = valeOk;

          const etapas = [
            { num: 1, done: valeOk, ready: step1Ready },
            { num: 2, done: heOk, ready: step2Ready },
            { num: 3, done: afericaoOk, ready: step3Ready },
            { num: 4, done: pagOk, ready: step4Ready },
          ];
          const etapasConcluidas = etapas.filter(e => e.done).length;
          const percentProgresso = Math.round((etapasConcluidas / 4) * 100);

          const fmtTimestamp = (ts: string | null | undefined) => {
            if (!ts) return null;
            try {
              const d = new Date(ts);
              const fmt = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return fmt;
            } catch { return null; }
          };

          return (
          <Card className="border-2 border-[#1B2A4A]/20 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
                  <Calculator className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-base text-[#1B2A4A]">Cálculo Interno</p>
                  <p className="text-xs text-muted-foreground">Simulação automática a partir do ponto {pontoOk ? <Badge className="bg-green-100 text-green-700 text-[10px] ml-1"><CheckCircle className="h-3 w-3 mr-0.5" /> Ponto Consolidado</Badge> : <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-1"><AlertTriangle className="h-3 w-3 mr-0.5" /> Ponto Não Consolidado</Badge>}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pd && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    Status: {String(pd.status).replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#1B2A4A]">{etapasConcluidas} de 4 etapas concluídas</span>
                <span className="text-xs font-bold text-[#1B2A4A]">{percentProgresso}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all duration-500 ${percentProgresso === 100 ? 'bg-green-500' : 'bg-[#1B2A4A]'}`} style={{ width: `${percentProgresso}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-stretch">
              {/* ETAPA 1 — CALCULAR VALE */}
              <div className={`bg-white rounded-lg border p-4 flex flex-col transition-all duration-300 ${valeOk ? 'border-green-300 bg-green-50/30' : step1Ready ? 'border-orange-200' : 'border-slate-200 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${valeOk ? 'bg-green-500 text-white' : step1Ready ? 'bg-orange-600 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {valeOk ? <CheckCircle className="h-3.5 w-3.5" /> : '1'}
                    </div>
                    <span className="font-semibold text-sm">Calcular Vale</span>
                  </div>
                  <CreditCard className="h-4 w-4 text-orange-600" />
                </div>
                {(() => {
                  const pct = valeOk ? 100 : (stepProgress['vale'] || 0);
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-[9px] font-bold ${pct === 100 ? 'text-green-600' : pct > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{pct > 0 ? `${Math.round(pct)}%` : '0%'}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-orange-400' : 'bg-slate-200'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground mb-2 flex-1">Adiantamento — {(() => { const p = (pd as any); return p?.percentualAdiantamento || 40; })()}% do salário (sem HE)</p>
                {valeOk && valeResult && (
                  <div className="mb-2 bg-orange-50 border border-orange-200 rounded-lg p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="text-center">
                        <p className="text-[9px] text-orange-600 font-medium">Funcionários</p>
                        <p className="text-sm font-black text-orange-800">{valeResult.totalFuncionarios}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-orange-600 font-medium">Total Vale</p>
                        <p className="text-sm font-black text-orange-800">{formatBRL(valeResult.totalVale)}</p>
                      </div>
                    </div>
                    {(valeResult.totalAlertas || 0) > 0 && <p className="text-[9px] text-amber-600 text-center mt-1">{valeResult.totalAlertas} alerta(s)</p>}
                  </div>
                )}
                {valeResult?.excluidos?.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
                    <p className="text-[9px] text-red-600 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {valeResult.excluidos.length} funcionário(s) excluído(s) — sem valor hora cadastrado:
                    </p>
                    {valeResult.excluidos.map((e: any) => (
                      <p key={e.id} className="text-[10px] text-red-700 ml-4">• {e.nome}</p>
                    ))}
                  </div>
                )}
                {valeOk && pd?.valeGeradoEm && (
                  <div className="mb-2">
                    <div className="flex items-center gap-1 text-[10px] text-green-700">
                      <CheckCircle className="h-3 w-3" />
                      <span>Concluído {fmtTimestamp(pd.valeGeradoEm)}{pd.valeGeradoPor ? ` por ${pd.valeGeradoPor}` : ''}</span>
                    </div>
                  </div>
                )}
                <Button size="sm" className={`w-full mt-auto ${valeOk ? 'bg-slate-500 hover:bg-slate-600' : 'bg-orange-600 hover:bg-orange-700'}`}
                  disabled={gerarValeMut.isPending || !step1Ready}
                  onClick={() => { setCalcType("vale"); gerarValeMut.mutate({ companyId, companyIds, mesReferencia: mesAno }); }}>
                  {gerarValeMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Calculando...</> : valeOk ? <><RefreshCw className="h-3 w-3 mr-1" /> Recalcular</> : <><Zap className="h-3 w-3 mr-1" /> Calcular Vale</>}
                </Button>
                {valeResult && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-xs text-orange-700" onClick={() => setViewMode("calculo_vale")}>
                    <Eye className="h-3 w-3 mr-1" /> Ver Resultado
                  </Button>
                )}
              </div>

              {/* ETAPA 2 — HORA EXTRA */}
              <div className={`bg-white rounded-lg border p-4 flex flex-col transition-all duration-300 ${heOk ? 'border-green-300 bg-green-50/30' : step2Ready ? 'border-purple-300' : 'border-slate-200 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${heOk ? 'bg-green-500 text-white' : step2Ready ? 'bg-purple-700 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {heOk ? <CheckCircle className="h-3.5 w-3.5" /> : '2'}
                    </div>
                    <span className="font-semibold text-sm">Hora Extra</span>
                  </div>
                  <TrendingUp className="h-4 w-4 text-purple-700" />
                </div>
                {(() => {
                  const pct = heOk ? 100 : 0;
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-[9px] font-bold ${pct === 100 ? 'text-green-600' : 'text-slate-400'}`}>{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-slate-200'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground mb-1 flex-1">Período configurável com detecção de duplicidade</p>
                <div className={`text-[10px] font-bold px-2 py-1 rounded mb-2 text-center ${heDestinoIsBanco ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                  Destino: {heDestinoIsBanco ? "Banco de Horas" : "Pagamento em Folha"}
                </div>
                {heOk && (() => {
                  const activePds = (hePeriods.data as any[] || []).filter((p: any) => p.status === 'aprovado' || p.status === 'pago');
                  const lastP = activePds[0];
                  return lastP ? (
                    <div className="mb-2 bg-purple-50 border border-purple-200 rounded-lg p-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="text-center">
                          <p className="text-[9px] text-purple-600 font-medium">Funcionários</p>
                          <p className="text-sm font-black text-purple-800">{lastP.totalFuncionarios || '-'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-purple-600 font-medium">Total HE</p>
                          <p className="text-sm font-black text-purple-800">{lastP.totalValorHE ? formatBRL(lastP.totalValorHE) : lastP.totalHEMins ? `${Math.floor(lastP.totalHEMins / 60)}h${String(lastP.totalHEMins % 60).padStart(2, '0')}` : '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-green-700 mt-1.5 justify-center">
                        <CheckCircle className="h-3 w-3" />
                        <span>HE processada e aprovada</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-2">
                      <div className="flex items-center gap-1 text-[10px] text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        <span>HE processada e aprovada</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-auto">
                  {(() => {
                    if (!step2Ready) return (
                      <Button size="sm" className="w-full bg-slate-300 text-slate-500" disabled>
                        <Zap className="h-3 w-3 mr-1" /> Calcular HE
                      </Button>
                    );
                    const activePeriods = (hePeriods.data as any[] || []).filter((p: any) => p.status !== 'cancelado');
                    return activePeriods.length > 0 ? (
                      <div className="space-y-1">
                        {activePeriods.slice(0, 2).map((p: any) => (
                          <Button key={p.id} size="sm" variant="ghost" className="w-full text-xs text-purple-700 h-7"
                            onClick={() => { setHeViewPeriodId(p.id); setViewMode("he_modulo"); }}>
                            <Eye className="h-3 w-3 mr-1" />
                            {fmtDateBR(p.dataInicio)} → {fmtDateBR(p.dataFim)}
                            <Badge className={`ml-1 text-[9px] ${p.status === 'aprovado' ? 'bg-green-100 text-green-700' : p.status === 'pago' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{p.status}</Badge>
                          </Button>
                        ))}
                        <Button size="sm" variant="outline" className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={() => setViewMode("he_modulo")}>
                          <TrendingUp className="h-3 w-3 mr-1" /> Gerenciar HE
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="w-full bg-purple-700 hover:bg-purple-800"
                        onClick={() => setViewMode("he_modulo")}>
                        <Zap className="h-3 w-3 mr-1" /> Calcular HE
                      </Button>
                    );
                  })()}
                  {heOk && (
                    <div className="mt-2">
                      {!(pd as any)?.heConsolidadoEm ? (
                        <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => consolidarHEMut.mutate({ companyId, mesReferencia: mesAno })}
                          disabled={consolidarHEMut.isPending}>
                          <Lock className="h-3 w-3 mr-1" />
                          {consolidarHEMut.isPending ? "Consolidando..." : "Consolidar HE"}
                        </Button>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] text-green-700 justify-center">
                            <Lock className="h-3 w-3" />
                            <span>Consolidado {(pd as any).heConsolidadoEm ? new Date((pd as any).heConsolidadoEm).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}{(pd as any).heConsolidadoPor ? ` por ${(pd as any).heConsolidadoPor}` : ''}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="w-full text-[10px] text-slate-500 h-6"
                            onClick={() => desconsolidarHEMut.mutate({ companyId, mesReferencia: mesAno })}
                            disabled={desconsolidarHEMut.isPending}>
                            <Unlock className="h-3 w-3 mr-1" />
                            {desconsolidarHEMut.isPending ? "Abrindo..." : "Desconsolidar"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ETAPA 3 — AFERIR ESCURO */}
              <div className={`bg-white rounded-lg border p-4 flex flex-col transition-all duration-300 ${afericaoOk ? 'border-green-300 bg-green-50/30' : step3Ready ? 'border-amber-300' : 'border-slate-200 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${afericaoOk ? 'bg-green-500 text-white' : step3Ready ? 'bg-amber-600 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {afericaoOk ? <CheckCircle className="h-3.5 w-3.5" /> : '3'}
                    </div>
                    <span className="font-semibold text-sm">Aferir Escuro</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Moon className="h-4 w-4 text-amber-600" />
                    <button type="button" className="text-slate-400 hover:text-blue-600 transition-colors" title="O que é o período no escuro?"
                      onClick={() => setShowAfericaoInfo(true)}>
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {(() => {
                  const pct = afericaoOk ? 100 : (stepProgress['afericao'] || 0);
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-[9px] font-bold ${pct === 100 ? 'text-green-600' : pct > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{pct > 0 ? `${Math.round(pct)}%` : '0%'}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className="mb-2 space-y-1">
                  <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                    <CalendarDays className="h-3 w-3 mr-0.5" /> Conferindo: {mesEscuroLabel}
                  </Badge>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {escuroInicio} a {escuroFim}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2 flex-1">Confere o que foi estimado no escuro com o ponto real (DIXI) recebido</p>
                {afericaoOk && (
                  <div className="mb-2 space-y-1">
                    {afericaoResult ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <div className="grid grid-cols-3 gap-1">
                          <div className="text-center">
                            <p className="text-[9px] text-amber-600 font-medium">Aferidos</p>
                            <p className="text-sm font-black text-amber-800">{afericaoResult.totalAferidos}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-green-600 font-medium">OK</p>
                            <p className="text-sm font-black text-green-700">{afericaoResult.totalOk || 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-red-600 font-medium">Diverg.</p>
                            <p className="text-sm font-black text-red-700">{afericaoResult.divergencias}</p>
                          </div>
                        </div>
                        {afericaoResult.faltas > 0 && (
                          <div className="flex justify-between mt-1 text-[9px]">
                            <span className="text-red-600">{afericaoResult.faltas} falta(s)</span>
                            <span className="text-amber-600">{afericaoResult.atrasos || 0} atraso(s)</span>
                          </div>
                        )}
                        <button onClick={() => setShowAfericaoReport(true)} className="text-[10px] text-blue-600 underline mt-1 w-full text-center hover:text-blue-800">
                          Ver relatório completo
                        </button>
                      </div>
                    ) : (pd.totalDivergenciasAferidas || 0) > 0 ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                        <p className="text-sm font-black text-amber-800">{pd.totalDivergenciasAferidas}</p>
                        <p className="text-[9px] text-amber-600 font-medium">divergência(s)</p>
                      </div>
                    ) : null}
                    {pd?.afericaoEm && (
                      <div className="flex items-center gap-1 text-[10px] text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        <span>Concluído {fmtTimestamp(pd.afericaoEm)}{pd.afericaoPor ? ` por ${pd.afericaoPor}` : ''}</span>
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" className={`w-full mt-auto ${afericaoConsolidada ? 'bg-gray-400 cursor-not-allowed' : afericaoOk ? 'bg-slate-500 hover:bg-slate-600' : 'bg-amber-600 hover:bg-amber-700'}`}
                  disabled={afericaoMut.isPending || !step3Ready || afericaoConsolidada}
                  title={afericaoConsolidada ? "Aferição consolidada — desconsolide primeiro para reaferir" : ""}
                  onClick={() => afericaoMut.mutate({ companyId, companyIds, mesReferencia: mesAno })}>
                  {afericaoMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Aferindo...</> : afericaoConsolidada ? <><Lock className="h-3 w-3 mr-1" /> Consolidado</> : afericaoOk ? <><RefreshCw className="h-3 w-3 mr-1" /> Reaferir</> : <><Zap className="h-3 w-3 mr-1" /> Aferir Escuro</>}
                </Button>
                {afericaoResult && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-xs text-amber-700" onClick={() => setShowAfericaoReport(true)}>
                    <Eye className="h-3 w-3 mr-1" /> Ver Resultado
                  </Button>
                )}
                {afericaoResult && afericaoResult.faltas > 0 && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-amber-700 text-[10px] h-6" onClick={() => setViewMode("alertas_afericao")}>
                    <AlertTriangle className="h-3 w-3 mr-1" /> {afericaoResult.faltas} falta(s) — Ver Alertas
                  </Button>
                )}
                {(alertasAfericao.data as any[] || []).length > 0 && !afericaoResult && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-amber-700 text-[10px] h-6" onClick={() => setViewMode("alertas_afericao")}>
                    <AlertTriangle className="h-3 w-3 mr-1" /> {(alertasAfericao.data as any[]).length} alerta(s) — Corrigir no Ponto
                  </Button>
                )}
                {afericaoOk && (
                  <div className="mt-2">
                    {!(pd as any)?.afericaoConsolidadoEm ? (
                      <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => consolidarAfericaoMut.mutate({ companyId, mesReferencia: mesAno })}
                        disabled={consolidarAfericaoMut.isPending}>
                        <Lock className="h-3 w-3 mr-1" />
                        {consolidarAfericaoMut.isPending ? "Consolidando..." : "Consolidar Aferição"}
                      </Button>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] text-green-700 justify-center">
                          <Lock className="h-3 w-3" />
                          <span>Consolidado {(pd as any).afericaoConsolidadoEm ? new Date((pd as any).afericaoConsolidadoEm).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}{(pd as any).afericaoConsolidadoPor ? ` por ${(pd as any).afericaoConsolidadoPor}` : ''}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="w-full text-[10px] text-slate-500 h-6"
                          onClick={() => desconsolidarAfericaoMut.mutate({ companyId, mesReferencia: mesAno })}
                          disabled={desconsolidarAfericaoMut.isPending}>
                          <Unlock className="h-3 w-3 mr-1" />
                          {desconsolidarAfericaoMut.isPending ? "Abrindo..." : "Desconsolidar"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ETAPA 4 — SIMULAR PAGAMENTO */}
              <div className={`bg-white rounded-lg border p-4 flex flex-col transition-all duration-300 ${pagOk ? 'border-green-300 bg-green-50/30' : step4Ready ? 'border-green-200' : 'border-slate-200 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${pagOk ? 'bg-green-500 text-white' : step4Ready ? 'bg-green-600 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {pagOk ? <CheckCircle className="h-3.5 w-3.5" /> : '4'}
                    </div>
                    <span className="font-semibold text-sm">Simular Pagamento</span>
                  </div>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                {(() => {
                  const pct = pagOk ? 100 : (stepProgress['pagamento'] || 0);
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-[9px] font-bold ${pct === 100 ? 'text-green-600' : pct > 0 ? 'text-green-500' : 'text-slate-400'}`}>{pct > 0 ? `${Math.round(pct)}%` : '0%'}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-green-400' : 'bg-slate-200'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground mb-1">100% salário − adiantamento − faltas − INSS − descontos</p>
                <div className="mb-2 border rounded-md p-2 bg-slate-50">
                  <div className="flex items-center gap-1 mb-1.5">
                    <CalendarDays className="h-3 w-3 text-slate-500" />
                    <span className="text-[10px] font-semibold text-slate-600">Período do Ponto</span>
                    {periodoCustomizado && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-amber-400 text-amber-700 bg-amber-50">Personalizado</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Início</label>
                      <input type="date" className="w-full text-[11px] px-1.5 py-1 border rounded bg-white" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} disabled={pagamentoConsolidado} />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Fim</label>
                      <input type="date" className="w-full text-[11px] px-1.5 py-1 border rounded bg-white" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} disabled={pagamentoConsolidado} />
                    </div>
                  </div>
                  {periodoCustomizado && (
                    <button className="text-[9px] text-blue-600 hover:underline mt-1" onClick={() => { setPeriodoInicio(periodoPadrao.inicio); setPeriodoFim(periodoPadrao.fim); }}>
                      Restaurar padrão ({fmtDateBR(periodoPadrao.inicio)} a {fmtDateBR(periodoPadrao.fim)})
                    </button>
                  )}
                </div>
                {pagOk && pagamentoResult && (
                  <div className="mb-2 bg-green-50 border border-green-200 rounded-lg p-2">
                    <div className="grid grid-cols-3 gap-1">
                      <div className="text-center">
                        <p className="text-[9px] text-green-600 font-medium">Bruto</p>
                        <p className="text-[11px] font-black text-green-800">{formatBRL(pagamentoResult.totalBruto)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-red-500 font-medium">Descontos</p>
                        <p className="text-[11px] font-black text-red-600">{formatBRL(pagamentoResult.totalDescontos)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-[#1B2A4A] font-medium">Líquido</p>
                        <p className="text-[11px] font-black text-[#1B2A4A]">{formatBRL(pagamentoResult.totalLiquido)}</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-green-600 text-center mt-1">{pagamentoResult.totalFuncionarios} funcionários</p>
                  </div>
                )}
                {pagOk && pd?.pagamentoSimuladoEm && (
                  <div className="mb-2">
                    <div className="flex items-center gap-1 text-[10px] text-green-700">
                      <CheckCircle className="h-3 w-3" />
                      <span>Concluído {fmtTimestamp(pd.pagamentoSimuladoEm)}{pd.pagamentoSimuladoPor ? ` por ${pd.pagamentoSimuladoPor}` : ''}</span>
                    </div>
                  </div>
                )}
                <Button size="sm" className={`w-full mt-auto ${pagamentoConsolidado ? 'bg-gray-400 cursor-not-allowed' : pagOk ? 'bg-slate-500 hover:bg-slate-600' : 'bg-green-600 hover:bg-green-700'}`}
                  disabled={simularPagamentoMut.isPending || !step4Ready || pagamentoConsolidado}
                  title={pagamentoConsolidado ? "Pagamento consolidado — desconsolide primeiro para resimular" : ""}
                  onClick={() => {
                    // Detecta overrides ANTES de disparar a simulação para abrir o diálogo na hora,
                    // evitando que o usuário fique esperando "Simulando..." e só veja a confirmação ao
                    // entrar em "Ver Resultado". Conta funcionários com descontosManuais não-vazio.
                    const editados = ((pagamentoResult as any)?.funcionarios || []).filter(
                      (f: any) => f && f.descontosManuais && Object.keys(f.descontosManuais).length > 0
                    );
                    if (editados.length > 0) {
                      const lista = editados.map((f: any) => ({
                        id: Number(f.employeeId),
                        nome: String(f.nome || f.nomeCompleto || f.employeeNome || `Funcionário ${f.employeeId}`),
                        campos: Object.keys(f.descontosManuais || {}),
                      }));
                      setOverridesPrompt({ open: true, count: lista.length, lista, manterIds: lista.map((f: any) => f.id) });
                      return;
                    }
                    setCalcType("pagamento");
                    simularPagamentoMut.mutate({ companyId, companyIds, mesReferencia: mesAno, pontoInicioManual: periodoInicio, pontoFimManual: periodoFim, forcarRecalculoPonto: true });
                  }}>
                  {simularPagamentoMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Simulando...</> : pagamentoConsolidado ? <><Lock className="h-3 w-3 mr-1" /> Consolidado</> : pagOk ? <><RefreshCw className="h-3 w-3 mr-1" /> Resimular</> : <><Zap className="h-3 w-3 mr-1" /> Simular Pagamento</>}
                </Button>
                {pagamentoResult && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-xs text-green-700" onClick={() => setViewMode("calculo_pagamento")}>
                    <Eye className="h-3 w-3 mr-1" /> Ver Resultado
                  </Button>
                )}
                {pagOk && (
                  <div className="mt-2">
                    {!(pd as any)?.pagamentoConsolidadoEm ? (
                      <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => consolidarPagamentoMut.mutate({ companyId, mesReferencia: mesAno })}
                        disabled={consolidarPagamentoMut.isPending}>
                        <Lock className="h-3 w-3 mr-1" />
                        {consolidarPagamentoMut.isPending ? "Consolidando..." : "Consolidar Pagamento"}
                      </Button>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] text-green-700 justify-center">
                          <Lock className="h-3 w-3" />
                          <span>Consolidado {(pd as any).pagamentoConsolidadoEm ? new Date((pd as any).pagamentoConsolidadoEm).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}{(pd as any).pagamentoConsolidadoPor ? ` por ${(pd as any).pagamentoConsolidadoPor}` : ''}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="w-full text-[10px] text-slate-500 h-6"
                          onClick={() => desconsolidarPagamentoMut.mutate({ companyId, mesReferencia: mesAno })}
                          disabled={desconsolidarPagamentoMut.isPending}>
                          <Unlock className="h-3 w-3 mr-1" />
                          {desconsolidarPagamentoMut.isPending ? "Abrindo..." : "Desconsolidar"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!pontoOk && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">O ponto deste mês ainda não foi consolidado. Os cálculos podem não refletir todos os registros. Consolide o ponto no módulo <strong>Fechamento de Ponto</strong> para resultados precisos.</p>
              </div>
            )}
          </CardContent>
        </Card>
          );
        })()}

        {/* Dialog informativo — Aferir Escuro */}
        <Dialog open={showAfericaoInfo} onOpenChange={setShowAfericaoInfo}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Moon className="h-5 w-5 text-amber-600" /> O que é o período "no escuro"?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                O período <strong>"no escuro"</strong> é o intervalo entre o dia 16 do mês anterior e o dia 15 do mês de referência. 
                Como a folha precisa ser processada antes de receber o cartão de ponto (DIXI) desse período, 
                os valores são estimados. Quando o ponto real chega (dia 15), a aferição compara o estimado com o real.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-amber-800 mb-1">Fluxo da Folha — Exemplo com Março:</p>
                <ol className="text-xs text-amber-700 space-y-1.5 list-decimal list-inside">
                  <li>Dia <strong>15/02</strong> — RH recebe os cartões de ponto (DIXI) referentes a 16/01 a 15/02</li>
                  <li>Dia <strong>20/02</strong> — Pagamento do vale (40% do salário) + horas extras calculadas</li>
                  <li>O período <strong>16/02 a 15/03</strong> é fechado <strong>no escuro</strong> (estimado, pois o ponto ainda não chegou)</li>
                  <li>Dia <strong>15/03</strong> — Chega o novo cartão de ponto. A <strong>aferição</strong> compara o escuro com o real</li>
                  <li><strong>5º dia útil de Abril</strong> — Pagamento do salário de Março, já com os descontos da aferição</li>
                </ol>
              </div>
              <div className="space-y-2">
                <p className="font-semibold">O que a aferição identifica:</p>
                <ul className="list-disc list-inside text-xs space-y-1 text-slate-600">
                  <li><strong>Faltas</strong> — dias sem registro real de ponto</li>
                  <li><strong>Atrasos</strong> — entradas fora do horário esperado</li>
                  <li><strong>Registros ausentes</strong> — dias sem dado no relógio (possível erro do equipamento)</li>
                  <li><strong>Descontos</strong> — gerados automaticamente para aplicar na folha atual</li>
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  Nesta competência, estamos conferindo o período no escuro de <strong>{escuroInicio} a {escuroFim}</strong>. 
                  As divergências encontradas serão descontadas na folha de <strong>{MESES[mesSelecionado - 1]} {anoSelecionado}</strong> (paga no 5º dia útil de {MESES[mesSelecionado % 12]} {mesSelecionado === 12 ? anoSelecionado + 1 : anoSelecionado}).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAfericaoInfo(false)}>Entendi</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bhConfirmOpen} onOpenChange={setBhConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Converter em banco de horas negativo?</DialogTitle>
              <DialogDescription>
                Não haverá desconto no salário — o saldo será abatido com horas extras futuras.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setBhConfirmOpen(false)}>Cancelar</Button>
              <Button className="bg-amber-500 hover:bg-amber-600 text-white" disabled={decidirAfericaoMut.isPending} onClick={() => {
                const ids = bhConfirmIds;
                decidirAfericaoMut.mutate(
                  { companyId, companyIds, mesReferencia: mesAno, decisoes: ids.map(id => ({ adjustmentId: id, decisao: "banco_horas" as const })) },
                  { onSuccess: () => {
                    const upd = { ...afericaoResult };
                    (upd.divergenciasList || []).forEach((d: any) => { if (ids.includes(d.adjustmentId)) { d._cancelado = true; } });
                    const remaining = (upd.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado);
                    upd.faltas = remaining.filter((d: any) => d.tipo === 'falta').length;
                    upd.atrasos = remaining.filter((d: any) => d.tipo === 'atraso').length;
                    upd.divergencias = remaining.length;
                    setAfericaoResult(upd);
                    setAfericaoSel(new Set());
                    setBhConfirmOpen(false);
                    setBhConfirmIds([]);
                  }}
                );
              }}>
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* RELATÓRIO DE AFERIÇÃO */}
        <Dialog open={showAfericaoReport} onOpenChange={(v) => {
          setShowAfericaoReport(v);
          if (!v) {
            setAfericaoFilter('todos');
            setAfericaoSel(new Set());
            setAfericaoResult(null);
            lastLoadedPeriodId.current = null;
            payrollPeriod.refetch();
          }
        }}>
          <DialogContent resizable={false} className="overflow-hidden flex flex-col" style={{ width: "calc(100vw - 2rem)", maxWidth: "calc(100vw - 2rem)", height: "95vh", maxHeight: "95vh" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" /> Relatório de Aferição — {mesEscuroLabel}
              </DialogTitle>
              <DialogDescription>
                Resultado da comparação entre o ponto estimado (escuro) e o ponto real (DIXI)
              </DialogDescription>
            </DialogHeader>
            {afericaoResult && (
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* Summary cards — clicáveis como filtros */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button onClick={() => setAfericaoFilter(f => f === 'todos' ? 'todos' : 'todos')} className={`rounded-lg p-3 text-center transition-all cursor-pointer ${afericaoFilter === 'todos' ? 'ring-2 ring-slate-500 bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <div className="text-2xl font-bold text-slate-700">{afericaoResult.totalAferidos}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Dias Aferidos</div>
                  </button>
                  <button onClick={() => setAfericaoFilter(f => f === 'ok' ? 'todos' : 'ok')} className={`rounded-lg p-3 text-center transition-all cursor-pointer border ${afericaoFilter === 'ok' ? 'ring-2 ring-green-500 bg-green-100 border-green-400' : 'bg-green-50 border-green-200 hover:bg-green-100'}`}>
                    <div className="text-2xl font-bold text-green-700">{afericaoResult.totalOk || 0}</div>
                    <div className="text-[10px] text-green-600 font-medium">Validados OK</div>
                  </button>
                  <button onClick={() => setAfericaoFilter(f => f === 'faltas' ? 'todos' : 'faltas')} className={`rounded-lg p-3 text-center transition-all cursor-pointer border ${afericaoFilter === 'faltas' ? 'ring-2 ring-red-500 bg-red-100 border-red-400' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}>
                    <div className="text-2xl font-bold text-red-700">{afericaoResult.faltas || 0}</div>
                    <div className="text-[10px] text-red-600 font-medium">Faltas</div>
                  </button>
                  <button onClick={() => setAfericaoFilter(f => f === 'atrasos' ? 'todos' : 'atrasos')} className={`rounded-lg p-3 text-center transition-all cursor-pointer border ${afericaoFilter === 'atrasos' ? 'ring-2 ring-orange-500 bg-orange-100 border-orange-400' : 'bg-orange-50 border-orange-200 hover:bg-orange-100'}`}>
                    <div className="text-2xl font-bold text-orange-700">{afericaoResult.atrasos || 0}</div>
                    <div className="text-[10px] text-orange-600 font-medium">Atrasos</div>
                  </button>
                  {(afericaoResult.totalJustificados || 0) > 0 && (
                    <button onClick={() => setAfericaoFilter(f => f === 'justificados' ? 'todos' : 'justificados')} className={`rounded-lg p-3 text-center transition-all cursor-pointer border ${afericaoFilter === 'justificados' ? 'ring-2 ring-blue-500 bg-blue-100 border-blue-400' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'}`}>
                      <div className="text-2xl font-bold text-blue-700">{afericaoResult.totalJustificados}</div>
                      <div className="text-[10px] text-blue-600 font-medium">Justificados</div>
                    </button>
                  )}
                  {(afericaoResult.jaConfirmados || 0) > 0 && (
                    <div className="rounded-lg p-3 text-center border bg-emerald-50 border-emerald-200">
                      <div className="text-2xl font-bold text-emerald-700">{afericaoResult.jaConfirmados}</div>
                      <div className="text-[10px] text-emerald-600 font-medium">Já Verificados</div>
                    </div>
                  )}
                </div>
                {afericaoFilter !== 'todos' && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>Filtrando por: <strong>{afericaoFilter === 'ok' ? 'Validados OK' : afericaoFilter === 'faltas' ? 'Faltas' : afericaoFilter === 'atrasos' ? 'Atrasos' : 'Justificados'}</strong></span>
                    <button onClick={() => setAfericaoFilter('todos')} className="text-red-600 hover:text-red-800 underline">Limpar filtro</button>
                  </div>
                )}

                {/* Validados OK — visível quando filtro = ok */}
                {afericaoFilter === 'ok' && (afericaoResult.validadosList || []).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-green-700 mb-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> Validados OK ({(afericaoResult.validadosList || []).length})
                    </h4>
                    <div className="rounded-lg border border-green-200 overflow-hidden max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-green-50 text-green-700">
                            <th className="py-2 px-3 text-left font-semibold">Funcionário</th>
                            <th className="py-2 px-3 text-center font-semibold">Data</th>
                            <th className="py-2 px-3 text-center font-semibold">Entrada Escuro</th>
                            <th className="py-2 px-3 text-center font-semibold">Saída Escuro</th>
                            <th className="py-2 px-3 text-center font-semibold">Entrada Real</th>
                            <th className="py-2 px-3 text-center font-semibold">Saída Real</th>
                            <th className="py-2 px-3 text-center font-semibold">Horas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(afericaoResult.validadosList || []).map((v: any, i: number) => (
                            <tr key={i} className={`border-t ${i % 2 === 0 ? '' : 'bg-green-50/30'}`}>
                              <td className="py-1.5 px-3 font-medium">
                                <button className="text-left text-blue-700 hover:underline cursor-pointer" onClick={() => { setEspelhoPopupEmpId(Number(v.employeeId)); setEspelhoPopupEmpNome(v.employeeName || `ID ${v.employeeId}`); }}>
                                  {v.employeeName || `ID ${v.employeeId}`}
                                </button>
                              </td>
                              <td className="py-1.5 px-3 text-center font-mono">{v.data ? v.data.split('-').reverse().join('/') : '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono text-slate-500">{v.escuroEntrada1 || '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono text-slate-500">{v.escuroSaida1 || '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono">{v.realEntrada1 || '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono">{v.realSaida1 || '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono font-bold text-green-700">{v.horasTrabalhadas || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Justificados — visível quando filtro = justificados */}
                {afericaoFilter === 'justificados' && (afericaoResult.justificadosList || []).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-1">
                      <Info className="h-4 w-4" /> Justificados ({(afericaoResult.justificadosList || []).length})
                    </h4>
                    <div className="rounded-lg border border-blue-200 overflow-hidden max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-blue-50 text-blue-700">
                            <th className="py-2 px-3 text-left font-semibold">Funcionário</th>
                            <th className="py-2 px-3 text-left font-semibold">Função</th>
                            <th className="py-2 px-3 text-center font-semibold">Status</th>
                            <th className="py-2 px-3 text-center font-semibold">Data</th>
                            <th className="py-2 px-3 text-center font-semibold">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(afericaoResult.justificadosList || []).map((j: any, i: number) => (
                            <tr key={i} className={`border-t ${i % 2 === 0 ? '' : 'bg-blue-50/30'}`}>
                              <td className="py-1.5 px-3 font-medium">{j.employeeName || `ID ${j.employeeId}`}</td>
                              <td className="py-1.5 px-3 text-slate-500">{j.funcao || '-'}</td>
                              <td className="py-1.5 px-3 text-center"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">{j.empStatus || '-'}</span></td>
                              <td className="py-1.5 px-3 text-center font-mono">{j.data ? j.data.split('-').reverse().join('/') : '-'}</td>
                              <td className="py-1.5 px-3 text-center font-medium text-blue-700">{j.motivo || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Divergências */}
                {(afericaoFilter === 'todos' || afericaoFilter === 'faltas' || afericaoFilter === 'atrasos') && (afericaoResult.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> {afericaoFilter === 'faltas' ? 'Faltas' : afericaoFilter === 'atrasos' ? 'Atrasos' : 'Divergências Encontradas'} ({(afericaoResult.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado && (afericaoFilter === 'todos' || (afericaoFilter === 'faltas' && d.tipo === 'falta') || (afericaoFilter === 'atrasos' && d.tipo === 'atraso'))).length})
                    </h4>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-800 mb-1">O que significa cada tipo:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-start gap-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap mt-0.5">FALTA</span>
                          <span>O relógio DIXI <strong>não registrou batida válida</strong> neste dia — o funcionário não trabalhou. Corrija no Espelho de Ponto se necessário.</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 whitespace-nowrap mt-0.5">ATRASO</span>
                          <span>O funcionário registrou entrada, mas <strong>após o horário</strong> previsto (além da tolerância de 5 min — CLT Art. 58 §1º / Súm. 366 TST: desconto integral).</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 italic">Clique no nome do funcionário para abrir o cartão de ponto e validar a informação.</p>
                    </div>
                    {(() => {
                      const filteredDivs = (afericaoResult.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado && (afericaoFilter === 'todos' || (afericaoFilter === 'faltas' && d.tipo === 'falta') || (afericaoFilter === 'atrasos' && d.tipo === 'atraso')));
                      const allIds = filteredDivs.map((d: any) => d.adjustmentId).filter(Boolean);
                      const allSelected = allIds.length > 0 && allIds.every((id: number) => afericaoSel.has(id));
                      return (
                      <>
                      {afericaoSel.size > 0 && (
                        <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <span className="text-xs font-semibold text-blue-800">{afericaoSel.size} selecionado(s)</span>
                          <Button size="sm" className="h-7 px-3 text-[10px] bg-green-600 hover:bg-green-700 text-white" disabled={decidirAfericaoMut.isPending}
                            onClick={() => {
                              const ids = Array.from(afericaoSel);
                              if (!ids.length) return;
                              decidirAfericaoMut.mutate(
                                { companyId, companyIds, mesReferencia: mesAno, decisoes: ids.map(id => ({ adjustmentId: id, decisao: "falta_real" as const })) },
                                { onSuccess: () => {
                                  const upd = { ...afericaoResult };
                                  (upd.divergenciasList || []).forEach((d: any) => { if (afericaoSel.has(d.adjustmentId)) { d._confirmado = true; } });
                                  const remaining = (upd.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado);
                                  upd.faltas = remaining.filter((d: any) => d.tipo === 'falta').length;
                                  upd.atrasos = remaining.filter((d: any) => d.tipo === 'atraso').length;
                                  upd.divergencias = remaining.length;
                                  setAfericaoResult(upd);
                                  setAfericaoSel(new Set());
                                }}
                              );
                            }}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Confirmar Selecionados
                          </Button>
                          <Button size="sm" className="h-7 px-3 text-[10px] bg-gray-500 hover:bg-gray-600 text-white" disabled={decidirAfericaoMut.isPending}
                            onClick={() => {
                              const ids = Array.from(afericaoSel);
                              if (!ids.length) return;
                              decidirAfericaoMut.mutate(
                                { companyId, companyIds, mesReferencia: mesAno, decisoes: ids.map(id => ({ adjustmentId: id, decisao: "erro_relogio" as const })) },
                                { onSuccess: () => {
                                  const upd = { ...afericaoResult };
                                  (upd.divergenciasList || []).forEach((d: any) => { if (afericaoSel.has(d.adjustmentId)) { d._cancelado = true; } });
                                  const remaining = (upd.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado);
                                  upd.faltas = remaining.filter((d: any) => d.tipo === 'falta').length;
                                  upd.atrasos = remaining.filter((d: any) => d.tipo === 'atraso').length;
                                  upd.divergencias = remaining.length;
                                  setAfericaoResult(upd);
                                  setAfericaoSel(new Set());
                                }}
                              );
                            }}>
                            <XCircle className="h-3 w-3 mr-1" /> Erro Relógio Selecionados
                          </Button>
                          <Button size="sm" className="h-7 px-3 text-[10px] bg-amber-500 hover:bg-amber-600 text-white" disabled={decidirAfericaoMut.isPending}
                            onClick={() => {
                              const ids = Array.from(afericaoSel);
                              if (!ids.length) return;
                              setBhConfirmIds(ids);
                              setBhConfirmOpen(true);
                            }}
                          >
                            <Clock className="h-3 w-3 mr-1" /> BH Selecionados
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-slate-500" onClick={() => setAfericaoSel(new Set())}>Limpar</Button>
                        </div>
                      )}
                      <div className="rounded-lg border border-red-200 overflow-visible">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-red-50 text-red-700">
                            <th className="py-2 px-1 text-center w-8">
                              <input type="checkbox" checked={allSelected} onChange={(e) => {
                                if (e.target.checked) { setAfericaoSel(new Set(allIds)); } else { setAfericaoSel(new Set()); }
                              }} className="rounded" />
                            </th>
                            <th className="py-2 px-3 text-left font-semibold">Funcionário</th>
                            <th className="py-2 px-3 text-left font-semibold">Função</th>
                            <th className="py-2 px-3 text-left font-semibold">Obra</th>
                            <th className="py-2 px-3 text-center font-semibold">Status</th>
                            <th className="py-2 px-3 text-center font-semibold">Data</th>
                            <th className="py-2 px-3 text-center font-semibold">Tipo</th>
                            <th className="py-2 px-3 text-right font-semibold">Desconto</th>
                            <th className="py-2 px-3 text-center font-semibold">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDivs.map((d: any, i: number) => (
                            <tr key={i} className={`border-t ${afericaoSel.has(d.adjustmentId) ? 'bg-blue-50' : i % 2 === 0 ? '' : 'bg-red-50/30'}`}>
                              <td className="py-2 px-1 text-center">
                                <input type="checkbox" checked={afericaoSel.has(d.adjustmentId)} onChange={(e) => {
                                  const ns = new Set(afericaoSel);
                                  if (e.target.checked) ns.add(d.adjustmentId); else ns.delete(d.adjustmentId);
                                  setAfericaoSel(ns);
                                }} className="rounded" />
                              </td>
                              <td className="py-2 px-3">
                                <button
                                  className="text-left text-blue-700 hover:text-blue-900 hover:underline cursor-pointer font-medium"
                                  onClick={() => { setEspelhoPopupEmpId(Number(d.employeeId)); setEspelhoPopupEmpNome(d.employeeName || `ID ${d.employeeId}`); }}
                                  title="Abrir espelho de ponto"
                                >
                                  {d.employeeName || `ID ${d.employeeId}`}
                                </button>
                                {d.codigoInterno && (
                                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{d.codigoInterno}</p>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{d.funcao || '-'}</td>
                              <td className="py-2 px-3 text-slate-500 text-xs">{d.obraNome || <span className="text-gray-300">—</span>}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  d.empStatus === 'Ferias' ? 'bg-orange-100 text-orange-700' :
                                  d.empStatus === 'Afastado' ? 'bg-blue-100 text-blue-700' :
                                  d.empStatus === 'Desligado' ? 'bg-gray-200 text-gray-700' :
                                  d.empStatus === 'Recluso' ? 'bg-purple-100 text-purple-700' :
                                  d.empStatus === 'Lista_Negra' ? 'bg-gray-300 text-gray-800' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {d.empStatus === 'Lista_Negra' ? 'LISTA NEGRA' : (d.empStatus || 'Ativo').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center font-mono">{d.data ? d.data.split('-').reverse().join('/') : '-'}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  d.tipo === 'atraso' ? 'bg-orange-100 text-orange-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {d.tipo === 'atraso' ? `ATRASO ${d.minutos ? `(${d.minutos >= 60 ? Math.floor(d.minutos/60) + 'h' + (d.minutos%60 > 0 ? String(d.minutos%60).padStart(2,'0') + 'min' : '') : d.minutos + 'min'})` : ''}` : 'FALTA'}
                                </span>
                                {d.tipo === 'atraso' && (
                                  <span className="block text-[8px] text-gray-400 mt-0.5 italic">Súm. 366 TST</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-red-600 relative">
                                <div className="inline-flex items-center gap-1">
                                  <span>R$ {typeof d.valorDesconto === 'number' ? d.valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : d.valorDesconto || '0,00'}</span>
                                  {d.memoria && (
                                    <button className="text-slate-400 hover:text-blue-600 relative group/mem" onClick={(e) => {
                                      const pop = e.currentTarget.querySelector('.mem-pop') as HTMLElement;
                                      if (!pop) return;
                                      pop.classList.toggle('hidden');
                                      if (!pop.classList.contains('hidden')) {
                                        requestAnimationFrame(() => {
                                          const rect = pop.getBoundingClientRect();
                                          if (rect.bottom > window.innerHeight - 10) {
                                            pop.style.top = 'auto';
                                            pop.style.bottom = '100%';
                                            pop.style.marginBottom = '4px';
                                          } else {
                                            pop.style.top = '20px';
                                            pop.style.bottom = 'auto';
                                            pop.style.marginBottom = '0';
                                          }
                                        });
                                      }
                                    }} title="Ver memória de cálculo">
                                      <Info className="h-3.5 w-3.5" />
                                      <div className="mem-pop hidden absolute right-0 top-5 z-[9999] bg-white border border-slate-300 rounded-lg shadow-xl p-3 text-left text-[11px] text-slate-700 w-64 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <p className="font-bold text-slate-900 mb-1.5 text-xs border-b pb-1">Memória de Cálculo</p>
                                        {d.tipo === 'falta' ? (
                                          <div className="space-y-0.5">
                                            <p>Valor/hora: <strong>R$ {(d.memoria.valorHora || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></p>
                                            <p>Carga diária: <strong>{d.memoria.cargaHorariaDiaria || 0}h</strong></p>
                                            <p>Desc. salarial: {d.memoria.cargaHorariaDiaria}h × R$ {(d.memoria.valorHora || 0).toFixed(2)} = <strong>R$ {(d.memoria.descontoSalarial || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></p>
                                            <p>Desc. VR: <strong>R$ {(d.memoria.descontoVR || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></p>
                                            <p>Desc. VT: <strong>R$ {(d.memoria.descontoVT || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></p>
                                            <p className="border-t pt-1 mt-1 font-bold text-red-700">Total: R$ {(d.memoria.totalDesconto || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                          </div>
                                        ) : (
                                          <div className="space-y-0.5">
                                            <p>Entrada esperada: <strong>{d.memoria.entradaEsperada || '-'}</strong></p>
                                            <p>Entrada real: <strong>{d.memoria.entradaReal || '-'}</strong></p>
                                            <p>Tolerância legal: <strong>{d.memoria.toleranciaLegal ?? 5} min</strong> <span className="text-[9px] text-gray-400">(CLT Art. 58 §1º)</span></p>
                                            <p>Atraso: <strong>{d.memoria.minutosAtraso || 0} min</strong> <span className="text-[9px] text-gray-400">(ultrapassou {d.memoria.toleranciaLegal ?? 5} min → desconto integral, Súmula 366 TST)</span></p>
                                            <p className="border-t pt-1 mt-1">Valor/hora: <strong>R$ {(d.memoria.valorHora || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></p>
                                            <p>Valor/min: <strong>R$ {(d.memoria.valorMinuto || 0).toFixed(4)}</strong></p>
                                            <p className="font-bold text-red-700">{d.memoria.minutosAtraso} min × R$ {(d.memoria.valorMinuto || 0).toFixed(4)} = R$ {(d.valorDesconto || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                  <div className="flex items-center gap-1 justify-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                                      disabled={decidirAfericaoMut.isPending}
                                      onClick={() => {
                                        if (!d.adjustmentId) { toast.error("ID do ajuste não encontrado. Refaça a aferição."); return; }
                                        decidirAfericaoMut.mutate(
                                          { companyId, companyIds, mesReferencia: mesAno, decisoes: [{ adjustmentId: d.adjustmentId, decisao: "falta_real" }] },
                                          { onSuccess: () => {
                                            d._confirmado = true;
                                            const upd = { ...afericaoResult };
                                            if (d.tipo === 'falta') upd.faltas = Math.max(0, (upd.faltas || 0) - 1);
                                            else if (d.tipo === 'atraso') upd.atrasos = Math.max(0, (upd.atrasos || 0) - 1);
                                            upd.divergencias = Math.max(0, (upd.divergencias || 0) - 1);
                                            setAfericaoResult(upd);
                                          } }
                                        );
                                      }}
                                      title="Confirmar desconto"
                                    >
                                      <CheckCircle className="h-3 w-3 mr-0.5" /> Confirmar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] text-blue-700 border-blue-300 hover:bg-blue-50"
                                      onClick={() => {
                                        setEspelhoPopupEmpId(Number(d.employeeId));
                                        setEspelhoPopupEmpNome(d.employeeName || `ID ${d.employeeId}`);
                                      }}
                                      title="Editar ponto no espelho"
                                    >
                                      <PenLine className="h-3 w-3 mr-0.5" /> Editar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] text-gray-600 border-gray-300 hover:bg-gray-50"
                                      disabled={decidirAfericaoMut.isPending}
                                      onClick={() => {
                                        if (!d.adjustmentId) { toast.error("ID do ajuste não encontrado. Refaça a aferição."); return; }
                                        decidirAfericaoMut.mutate(
                                          { companyId, companyIds, mesReferencia: mesAno, decisoes: [{ adjustmentId: d.adjustmentId, decisao: "erro_relogio" }] },
                                          { onSuccess: () => {
                                            d._cancelado = true;
                                            const upd = { ...afericaoResult };
                                            if (d.tipo === 'falta') upd.faltas = Math.max(0, (upd.faltas || 0) - 1);
                                            else if (d.tipo === 'atraso') upd.atrasos = Math.max(0, (upd.atrasos || 0) - 1);
                                            upd.divergencias = Math.max(0, (upd.divergencias || 0) - 1);
                                            setAfericaoResult(upd);
                                          } }
                                        );
                                      }}
                                      title={d.tipo === 'atraso' ? "Desconsiderar atraso (erro do relógio)" : "Marcar como erro do relógio (trabalhado normalmente)"}
                                    >
                                      <XCircle className="h-3 w-3 mr-0.5" /> Erro Relógio
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] text-amber-600 border-amber-300 hover:bg-amber-50"
                                      disabled={decidirAfericaoMut.isPending}
                                      onClick={() => {
                                        if (!d.adjustmentId) { toast.error("ID do ajuste não encontrado. Refaça a aferição."); return; }
                                        setBhConfirmIds([d.adjustmentId]);
                                        setBhConfirmOpen(true);
                                      }}
                                      title={d.tipo === 'atraso' ? "Converter atraso em banco de horas negativo (sem desconto)" : "Converter em banco de horas negativo (sem desconto, abate com HE)"}
                                    >
                                      <Clock className="h-3 w-3 mr-0.5" /> BH
                                    </Button>
                                  </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-red-300 bg-red-50 font-bold">
                            <td colSpan={6} className="py-2 px-3 text-right text-red-700">Total Descontos:</td>
                            <td className="py-2 px-3 text-right font-mono text-red-700">
                              R$ {(afericaoResult.divergenciasList || []).filter((d: any) => !d._cancelado && !d._confirmado).reduce((s: number, d: any) => s + (typeof d.valorDesconto === 'number' ? d.valorDesconto : 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    </>
                    );
                    })()}
                  </div>
                )}

                {/* Justificados (Férias, Afastados, Desligados, Reclusos) */}
                {(afericaoResult.justificadosList || []).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4" /> Ausências Justificadas ({afericaoResult.justificadosList.length})
                    </h4>
                    <div className="rounded-lg border border-blue-200 overflow-hidden max-h-[250px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-blue-50 text-blue-700">
                            <th className="py-2 px-3 text-left font-semibold">Funcionário</th>
                            <th className="py-2 px-3 text-left font-semibold">Função</th>
                            <th className="py-2 px-3 text-center font-semibold">Data</th>
                            <th className="py-2 px-3 text-center font-semibold">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(afericaoResult.justificadosList || []).map((j: any, i: number) => (
                            <tr key={i} className={`border-t ${i % 2 === 0 ? '' : 'bg-blue-50/30'}`}>
                              <td className="py-2 px-3 font-medium">
                                <button
                                  className="text-left text-blue-700 hover:text-blue-900 hover:underline cursor-pointer font-medium"
                                  onClick={() => { setEspelhoPopupEmpId(Number(j.employeeId)); setEspelhoPopupEmpNome(j.employeeName || `ID ${j.employeeId}`); }}
                                  title="Abrir espelho de ponto"
                                >
                                  {j.employeeName || `ID ${j.employeeId}`}
                                </button>
                              </td>
                              <td className="py-2 px-3 text-slate-500">{j.funcao || '-'}</td>
                              <td className="py-2 px-3 text-center font-mono">{j.data ? j.data.split('-').reverse().join('/') : '-'}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  j.motivo === 'Férias' ? 'bg-orange-100 text-orange-700' :
                                  j.motivo === 'Afastado' ? 'bg-blue-100 text-blue-700' :
                                  j.motivo === 'Desligado' ? 'bg-gray-200 text-gray-700' :
                                  j.motivo === 'Recluso' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-300 text-gray-800'
                                }`}>
                                  {j.motivo.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Validados OK */}
                {(afericaoResult.validadosList || []).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-green-700 mb-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> Registros Validados ({afericaoResult.validadosList.length})
                    </h4>
                    <div className="rounded-lg border border-green-200 overflow-hidden max-h-[250px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-green-50 text-green-700">
                            <th className="py-2 px-3 text-left font-semibold">Funcionário</th>
                            <th className="py-2 px-3 text-center font-semibold">Data</th>
                            <th className="py-2 px-3 text-center font-semibold">Escuro (E/S)</th>
                            <th className="py-2 px-3 text-center font-semibold">Real (E/S)</th>
                            <th className="py-2 px-3 text-center font-semibold">Horas Trab.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(afericaoResult.validadosList || []).map((v: any, i: number) => (
                            <tr key={i} className={`border-t ${i % 2 === 0 ? '' : 'bg-green-50/30'}`}>
                              <td className="py-1.5 px-3 font-medium">{v.employeeName || `ID ${v.employeeId}`}</td>
                              <td className="py-1.5 px-3 text-center font-mono">{v.data ? v.data.split('-').reverse().join('/') : '-'}</td>
                              <td className="py-1.5 px-3 text-center font-mono text-slate-500">{v.escuroEntrada1}/{v.escuroSaida1}</td>
                              <td className="py-1.5 px-3 text-center font-mono text-green-700">{v.realEntrada1}/{v.realSaida1}</td>
                              <td className="py-1.5 px-3 text-center font-mono">{v.horasTrabalhadas}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {afericaoResult.divergencias === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="font-semibold text-green-700">Nenhuma divergência encontrada!</p>
                    <p className="text-xs text-green-600 mt-1">Todos os registros do período no escuro foram confirmados pelo ponto real.</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex gap-2 mt-2">
              <Button
                variant="default"
                className="bg-green-700 hover:bg-green-800 text-white"
                disabled={atualizarAfericaoMut.isPending}
                onClick={() => {
                  if (!afericaoResult) return;
                  const cleaned = {
                    ...afericaoResult,
                    divergenciasList: (afericaoResult.divergenciasList || []).filter((d: any) => !d._confirmado && !d._cancelado),
                  };
                  cleaned.divergencias = cleaned.divergenciasList.length;
                  cleaned.faltas = cleaned.divergenciasList.filter((d: any) => d.tipo === 'falta').length;
                  cleaned.atrasos = cleaned.divergenciasList.filter((d: any) => d.tipo === 'atraso').length;
                  cleaned.totalOk = (cleaned.totalAferidos || 0) - cleaned.divergencias;
                  setAfericaoResult(cleaned);
                  atualizarAfericaoMut.mutate({
                    companyId, companyIds, mesReferencia: mesAno,
                    afericaoResult: cleaned,
                  });
                }}
              >
                {atualizarAfericaoMut.isPending ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</> : <><Save className="h-4 w-4 mr-1.5" />Atualizar</>}
              </Button>
              <Button variant="outline" onClick={() => setShowAfericaoReport(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================
            CONFERÊNCIA COM CONTABILIDADE (Rev. 2517 — restaurado)
            Bloco removido na Rev. 2194 e reintegrado a pedido do usuário.
            Compara o que o ERP calculou (Pagamento simulado) com o PDF da
            folha emitido pela contabilidade. Backend intacto desde 2194:
            • trpc.folha.importarFolhaAuto (upload analítico/sintético)
            • trpc.folha.verificacaoCruzada (Folha × Ponto × Cadastro)
            • trpc.folha.comparativoDescontos (descontos CLT × ERP)
            • trpc.folha.cruzamentoHE (HE folha × ponto)
            ============================================================ */}
        {(() => {
          const pag = statusMes.data?.pagamento;
          const uploadsList = (statusMes.data as any)?.uploads || [];
          const uploadsPagamento = uploadsList.filter((u: any) =>
            u.category === "espelho_folha_analitico" || u.category === "folha_sintetico"
          );
          const temAnalitico = !!(pag?.analiticoUploadId) || uploadsPagamento.some((u: any) => u.category === "espelho_folha_analitico");
          const temSintetico = !!(pag?.sinteticoUploadId) || uploadsPagamento.some((u: any) => u.category === "folha_sintetico");
          const importado = !!(pag && pag.id && (pag.totalFuncionarios || 0) > 0);
          const totalDiv = pag?.totalDivergencias || 0;
          const divResolvidas = pag?.divergenciasResolvidas || 0;
          const divPendentes = Math.max(0, totalDiv - divResolvidas);
          const totalFunc = pag?.totalFuncionarios || 0;
          const ativos = (divergenciasFolha.data as any)?.ativos ?? null;
          const isPending = importarAutoMut.isPending && uploading === "pagamento";

          return (
            <Card className="border-2 border-[#1B2A4A]/20 bg-gradient-to-r from-emerald-50/40 to-blue-50/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-base text-[#1B2A4A]">Conferência com Contabilidade</p>
                      <p className="text-xs text-muted-foreground">
                        Comparativo entre o pagamento simulado do ERP e a folha emitida pela contabilidade ({formatMesAno(mesAno)}).
                      </p>
                    </div>
                  </div>
                  {importado ? (
                    <Badge className={divPendentes > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                      {divPendentes > 0
                        ? <><AlertTriangle className="h-3 w-3 mr-1" /> {divPendentes} divergência(s) pendente(s)</>
                        : <><CheckCircle className="h-3 w-3 mr-1" /> Conferido sem divergências</>}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Folha da contabilidade não importada
                    </Badge>
                  )}
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Funcionários (Folha)</p>
                    <p className="text-2xl font-black text-[#1B2A4A] mt-0.5">{importado ? totalFunc : "—"}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Funcionários (ERP Ativos)</p>
                    <p className="text-2xl font-black text-[#1B2A4A] mt-0.5">{ativos ?? "—"}</p>
                  </div>
                  <div className={`rounded-lg border p-3 text-center ${divPendentes > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Divergências</p>
                    <p className={`text-2xl font-black mt-0.5 ${divPendentes > 0 ? "text-red-700" : "text-green-700"}`}>
                      {importado ? divPendentes : "—"}
                    </p>
                    {importado && divResolvidas > 0 && (
                      <p className="text-[9px] text-emerald-600 mt-0.5">{divResolvidas} resolvida(s)</p>
                    )}
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Arquivos</p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${temAnalitico ? "border-green-400 text-green-700 bg-green-50" : "border-slate-300 text-slate-400"}`}>
                        {temAnalitico ? <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> : <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                        Analítico
                      </Badge>
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${temSintetico ? "border-green-400 text-green-700 bg-green-50" : "border-slate-300 text-slate-400"}`}>
                        {temSintetico ? <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> : <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                        Sintético
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* AÇÕES */}
                {!importado ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900">Importe os PDFs da contabilidade para liberar a conferência</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Aceita o <strong>Espelho/Analítico</strong> (com proventos e descontos por funcionário) e/ou o <strong>Sintético</strong> (relação de líquidos).
                          Selecione múltiplos PDFs ao mesmo tempo — o sistema detecta o tipo e o mês de referência automaticamente.
                        </p>
                      </div>
                    </div>
                    {isPending ? (
                      <div className="w-full rounded-lg bg-[#1B2A4A] text-white px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold mb-2">
                          <span className="flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            {uploadPhase || "Processando PDFs…"}
                          </span>
                          <span className="tabular-nums">{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-green-400 transition-[width] duration-300 ease-out"
                            style={{ width: `${Math.max(2, Math.min(100, uploadProgress))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 gap-2"
                        onClick={() => pagInputRef.current?.click()}
                      >
                        <FileText className="h-4 w-4" /> Importar Folha da Contabilidade ({formatMesAno(mesAno)})
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Rev. 2524 — Banner do Relatório Consolidado (CTA principal pra RH) */}
                    <button
                      onClick={() => openView("consolidado", pag!.id)}
                      className="w-full mb-3 rounded-lg border-2 border-red-300 bg-gradient-to-r from-red-50 via-rose-50 to-amber-50 hover:from-red-100 hover:via-rose-100 hover:to-amber-100 transition-all p-4 text-left group shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-lg bg-red-600 group-hover:bg-red-700 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm text-red-900">Relatório Consolidado de Divergências</p>
                            {divPendentes > 0 && (
                              <Badge className="bg-red-600 text-white text-[10px]">
                                {divPendentes} pendente(s)
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-red-800/80 leading-tight mt-0.5">
                            Visão unificada de TODAS as inconsistências (cadastro, ponto, descontos CLT e horas extras) por funcionário, pronta pra análise detalhada do RH.
                          </p>
                        </div>
                        <span className="text-[11px] text-red-700 font-bold whitespace-nowrap group-hover:underline">
                          Abrir →
                        </span>
                      </div>
                    </button>

                    {/* Rev. 2527 — Banner Comparativo Folha × ERP (verba por verba) */}
                    <button
                      onClick={() => openView("comparativo_completo", pag!.id)}
                      className="w-full mb-3 rounded-lg border-2 border-blue-300 bg-gradient-to-r from-blue-50 via-sky-50 to-cyan-50 hover:from-blue-100 hover:via-sky-100 hover:to-cyan-100 transition-all p-4 text-left group shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-lg bg-blue-600 group-hover:bg-blue-700 flex items-center justify-center shrink-0">
                          <Scale className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-blue-900">Comparativo Folha × ERP (verba por verba)</p>
                          <p className="text-[11px] text-blue-800/80 leading-tight mt-0.5">
                            Tabela completa por funcionário: Salário Base, HE, Descontos e Líquido lado a lado. Expanda cada linha pra ver o detalhamento por verba do PDF.
                          </p>
                        </div>
                        <span className="text-[11px] text-blue-700 font-bold whitespace-nowrap group-hover:underline">
                          Abrir →
                        </span>
                      </div>
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <button
                        onClick={() => openView("verificacao", pag!.id)}
                        className="bg-white rounded-lg border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all p-4 text-left group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center">
                            <ShieldCheck className="h-4 w-4 text-blue-700" />
                          </div>
                          <p className="font-bold text-sm text-blue-900">Verificação Cruzada</p>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-tight">
                          Confronta a folha da contabilidade com o ponto consolidado e o cadastro do funcionário (salário, função, faltas).
                        </p>
                        <p className="text-[10px] text-blue-700 font-semibold mt-2 group-hover:underline">Abrir relatório →</p>
                      </button>

                      <button
                        onClick={() => openView("descontos_clt", pag!.id)}
                        className="bg-white rounded-lg border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all p-4 text-left group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-8 w-8 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center">
                            <FileCheck className="h-4 w-4 text-purple-700" />
                          </div>
                          <p className="font-bold text-sm text-purple-900">Comparativo de Descontos</p>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-tight">
                          Confronta os descontos CLT calculados pelo ERP (INSS, IRRF, FGTS, faltas) com os valores da folha da contabilidade.
                        </p>
                        <p className="text-[10px] text-purple-700 font-semibold mt-2 group-hover:underline">Abrir relatório →</p>
                      </button>

                      <button
                        onClick={() => openView("cruzamento_he", pag!.id)}
                        className="bg-white rounded-lg border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50/50 transition-all p-4 text-left group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-8 w-8 rounded-lg bg-orange-100 group-hover:bg-orange-200 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-orange-700" />
                          </div>
                          <p className="font-bold text-sm text-orange-900">Cruzamento Hora Extra</p>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-tight">
                          Compara as horas extras pagas na folha da contabilidade com as horas apuradas pelo ponto eletrônico do ERP.
                        </p>
                        <p className="text-[10px] text-orange-700 font-semibold mt-2 group-hover:underline">Abrir relatório →</p>
                      </button>
                    </div>

                    {isPending ? (
                      <div className="w-full rounded-lg bg-[#1B2A4A] text-white px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold mb-2">
                          <span className="flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            {uploadPhase || "Processando PDFs…"}
                          </span>
                          <span className="tabular-nums">{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-green-400 transition-[width] duration-300 ease-out"
                            style={{ width: `${Math.max(2, Math.min(100, uploadProgress))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <span>Importou a folha errada? Reimporte os PDFs para sobrescrever os dados.</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-[#1B2A4A] border-[#1B2A4A]/30 hover:bg-[#1B2A4A]/5"
                          onClick={() => pagInputRef.current?.click()}
                        >
                          <RefreshCw className="h-3 w-3" /> Reimportar
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* FECHAR FOLHA PARA MO */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center">
                <Lock className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">Fechar Folha para Custo de MO</p>
                <p className="text-xs text-muted-foreground">Encerra o mês e libera a importação de custo de MO no Planejamento</p>
              </div>
            </div>
          </div>
          {fecharFolhaResult ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800 font-medium">Folha de {formatMesAno(mesAno)} fechada — {fecharFolhaResult.count} lançamentos.</span>
              <span className="text-xs text-green-600 ml-2">Acesse Planejamento → projeto → "Importar Custos MO".</span>
            </div>
          ) : (
            <Button
              className="w-full bg-slate-700 hover:bg-slate-800 gap-2"
              disabled={fecharFolhaMut.isPending}
              onClick={() => {
                if (!window.confirm(`Fechar folha de ${formatMesAno(mesAno)}? Esta ação marca todos os lançamentos do mês como "fechado", liberando a importação de custo de MO no Planejamento.`)) return;
                fecharFolhaMut.mutate({ companyId, mesReferencia: mesAno });
              }}
            >
              {fecharFolhaMut.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Fechando...</>
                : <><Lock className="h-4 w-4" /> Fechar Folha de {formatMesAno(mesAno)}</>}
            </Button>
          )}
        </div>

        {/* ALERTA DE DIVERGÊNCIA: ATIVOS SEM FOLHA */}
        <AlertaDivergenciaFolha mesReferencia={mesAno} mesLabel={formatMesAno(mesAno)} variant="full" />


        {/* CARDS 13º SALÁRIO - Só aparecem em Nov e Dez */}
        {(isNovembro || isDezembro) && (
          <div className={`grid gap-4 ${isNovembro ? 'md:grid-cols-1' : isDezembro ? 'md:grid-cols-2' : ''}`}>
            {/* 1ª PARCELA - Novembro */}
            {isNovembro && (
              <Card className={`border-2 relative overflow-hidden ${decimoTerceiro1 ? 'border-purple-200' : 'border-dashed border-purple-300'}`}>
                <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-purple-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <span className="text-lg font-black text-purple-600">13</span>
                      </div>
                      <div>
                        <p className="font-bold text-base">13º Salário — 1ª Parcela</p>
                        <p className="text-xs text-muted-foreground">Pago até 30/Nov (CLT Art. 2º Lei 4.749/65)</p>
                      </div>
                    </div>
                    {decimoTerceiro1 && (
                      <Badge className={decimoTerceiro1.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}>
                        {decimoTerceiro1.status === 'consolidado' && <Lock className="h-3 w-3 mr-1" />}
                        {decimoTerceiro1.status.charAt(0).toUpperCase() + decimoTerceiro1.status.slice(1)}
                      </Badge>
                    )}
                  </div>
                  {decimoTerceiro1 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-purple-700">{decimoTerceiro1.totalFuncionarios}</p>
                          <p className="text-[10px] text-muted-foreground">Funcionários</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-purple-700">{formatBRL(decimoTerceiro1.totalLiquido)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className={`text-lg font-bold ${(decimoTerceiro1.totalDivergencias || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {decimoTerceiro1.totalDivergencias || 0}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Divergências</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView('detalhes', decimoTerceiro1.id, '13º 1ª Parcela')}>
                          <Eye className="h-3 w-3 mr-1" /> Detalhes
                        </Button>
                        {decimoTerceiro1.status !== 'consolidado' && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: decimoTerceiro1.id })}>
                            <Lock className="h-3 w-3 mr-1" /> Consolidar
                          </Button>
                        )}
                        {decimoTerceiro1.status === 'consolidado' && isAdmin && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: decimoTerceiro1.id })}>
                            <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                          </Button>
                        )}
                        {decimoTerceiro1.status !== 'consolidado' && isAdmin && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                            if (confirm('Excluir lançamento de 13º 1ª Parcela?')) excluirMut.mutate({ folhaLancamentoId: decimoTerceiro1.id });
                          }}>
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        )}
                      </div>
                      {decimoTerceiro1.status !== 'consolidado' && (
                        <Button size="sm" variant="ghost" className="text-xs w-full text-purple-700 hover:bg-purple-50"
                          disabled={uploading === 'decimo_terceiro_1'}
                          onClick={() => decimo1InputRef.current?.click()}>
                          {uploading === 'decimo_terceiro_1' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span className="text-4xl font-black text-purple-200 block mb-3">13</span>
                      <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de 13º 1ª Parcela</p>
                      <Button className="bg-purple-600 hover:bg-purple-700"
                        disabled={uploading === 'decimo_terceiro_1'}
                        onClick={() => decimo1InputRef.current?.click()}>
                        {uploading === 'decimo_terceiro_1' ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar 13º 1ª Parcela</>}
                      </Button>
                      <p className="text-[10px] text-muted-foreground mt-2">Selecione os PDFs da 1ª parcela do 13º salário.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 2ª PARCELA - Dezembro */}
            {isDezembro && (
              <>
                {/* 1ª Parcela em Dez (caso não tenha sido importada em Nov) */}
                <Card className={`border-2 relative overflow-hidden ${decimoTerceiro1 ? 'border-purple-200' : 'border-dashed border-purple-300'}`}>
                  <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-purple-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <span className="text-lg font-black text-purple-600">13</span>
                        </div>
                        <div>
                          <p className="font-bold text-base">13º Salário — 1ª Parcela</p>
                          <p className="text-xs text-muted-foreground">Referência Nov/{anoSelecionado}</p>
                        </div>
                      </div>
                      {decimoTerceiro1 && (
                        <Badge className="bg-purple-100 text-purple-700">
                          {decimoTerceiro1.status.charAt(0).toUpperCase() + decimoTerceiro1.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {decimoTerceiro1 ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-purple-700">{decimoTerceiro1.totalFuncionarios}</p>
                          <p className="text-[10px] text-muted-foreground">Funcionários</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-purple-700">{formatBRL(decimoTerceiro1.totalLiquido)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3">1ª Parcela não importada. Importe em Novembro.</p>
                    )}
                  </CardContent>
                </Card>

                {/* 2ª Parcela */}
                <Card className={`border-2 relative overflow-hidden ${decimoTerceiro2 ? 'border-indigo-200' : 'border-dashed border-indigo-300'}`}>
                  <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-indigo-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <span className="text-lg font-black text-indigo-600">13</span>
                        </div>
                        <div>
                          <p className="font-bold text-base">13º Salário — 2ª Parcela</p>
                          <p className="text-xs text-muted-foreground">Pago até 20/Dez (CLT Art. 1º Lei 4.749/65)</p>
                        </div>
                      </div>
                      {decimoTerceiro2 && (
                        <Badge className={decimoTerceiro2.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>
                          {decimoTerceiro2.status === 'consolidado' && <Lock className="h-3 w-3 mr-1" />}
                          {decimoTerceiro2.status.charAt(0).toUpperCase() + decimoTerceiro2.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {decimoTerceiro2 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-indigo-700">{decimoTerceiro2.totalFuncionarios}</p>
                            <p className="text-[10px] text-muted-foreground">Funcionários</p>
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className="text-base font-bold text-indigo-700">{formatBRL(decimoTerceiro2.totalLiquido)}</p>
                            <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className={`text-lg font-bold ${(decimoTerceiro2.totalDivergencias || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {decimoTerceiro2.totalDivergencias || 0}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Divergências</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView('detalhes', decimoTerceiro2.id, '13º 2ª Parcela')}>
                            <Eye className="h-3 w-3 mr-1" /> Detalhes
                          </Button>
                          {decimoTerceiro2.status !== 'consolidado' && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: decimoTerceiro2.id })}>
                              <Lock className="h-3 w-3 mr-1" /> Consolidar
                            </Button>
                          )}
                          {decimoTerceiro2.status === 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: decimoTerceiro2.id })}>
                              <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                            </Button>
                          )}
                          {decimoTerceiro2.status !== 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                              if (confirm('Excluir lançamento de 13º 2ª Parcela?')) excluirMut.mutate({ folhaLancamentoId: decimoTerceiro2.id });
                            }}>
                              <Trash2 className="h-3 w-3 mr-1" /> Excluir
                            </Button>
                          )}
                        </div>
                        {decimoTerceiro2.status !== 'consolidado' && (
                          <Button size="sm" variant="ghost" className="text-xs w-full text-indigo-700 hover:bg-indigo-50"
                            disabled={uploading === 'decimo_terceiro_2'}
                            onClick={() => decimo2InputRef.current?.click()}>
                            {uploading === 'decimo_terceiro_2' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <span className="text-4xl font-black text-indigo-200 block mb-3">13</span>
                        <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de 13º 2ª Parcela</p>
                        <Button className="bg-indigo-600 hover:bg-indigo-700"
                          disabled={uploading === 'decimo_terceiro_2'}
                          onClick={() => decimo2InputRef.current?.click()}>
                          {uploading === 'decimo_terceiro_2' ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar 13º 2ª Parcela</>}
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-2">Selecione os PDFs da 2ª parcela do 13º salário.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* RESUMO GERAL DO MÊS - formato tabela profissional */}
        {(vale || pagamento || decimoTerceiro1 || decimoTerceiro2) && (() => {
          const valeProventos = vale ? parseBRLNum(vale.totalProventos) : 0;
          const valeDescontos = vale ? parseBRLNum(vale.totalDescontos) : 0;
          const valeLiquido = vale ? parseBRLNum(vale.totalLiquido) : 0;
          const valeQtd = vale?.totalFuncionarios || 0;

          const pagProventos = pagamento ? parseBRLNum(pagamento.totalProventos) : 0;
          const pagDescontos = pagamento ? parseBRLNum(pagamento.totalDescontos) : 0;
          const pagLiquido = pagamento ? parseBRLNum(pagamento.totalLiquido) : 0;
          const pagQtd = pagamento?.totalFuncionarios || 0;

          const d13_1Proventos = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalProventos) : 0;
          const d13_1Descontos = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalDescontos) : 0;
          const d13_1Liquido = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalLiquido) : 0;
          const d13_1Qtd = decimoTerceiro1?.totalFuncionarios || 0;

          const d13_2Proventos = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalProventos) : 0;
          const d13_2Descontos = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalDescontos) : 0;
          const d13_2Liquido = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalLiquido) : 0;
          const d13_2Qtd = decimoTerceiro2?.totalFuncionarios || 0;

          const totalProventos = valeProventos + pagProventos + d13_1Proventos + d13_2Proventos;
          const totalDescontos = valeDescontos + pagDescontos + d13_1Descontos + d13_2Descontos;
          const totalLiquido = valeLiquido + pagLiquido + d13_1Liquido + d13_2Liquido;
          const totalQtd = Math.max(valeQtd, pagQtd, d13_1Qtd, d13_2Qtd);

          // Colunas dinâmicas baseadas no que existe
          type Col = { label: string; qtd: number; proventos: number; descontos: number; liquido: number };
          const cols: Col[] = [];
          if (vale) cols.push({ label: "VALE / ADIANT.", qtd: valeQtd, proventos: valeProventos, descontos: valeDescontos, liquido: valeLiquido });
          if (pagamento) cols.push({ label: "PAGAMENTO", qtd: pagQtd, proventos: pagProventos, descontos: pagDescontos, liquido: pagLiquido });
          if (decimoTerceiro1) cols.push({ label: "13º - 1ª PARCELA", qtd: d13_1Qtd, proventos: d13_1Proventos, descontos: d13_1Descontos, liquido: d13_1Liquido });
          if (decimoTerceiro2) cols.push({ label: "13º - 2ª PARCELA", qtd: d13_2Qtd, proventos: d13_2Proventos, descontos: d13_2Descontos, liquido: d13_2Liquido });

          return (
            <Card className="border-2 border-[#1B2A4A]/30 bg-gradient-to-r from-[#1B2A4A]/5 to-[#1B2A4A]/10">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-[#1B2A4A]">Resumo Geral</p>
                    <p className="text-xs text-muted-foreground">{formatMesAno(mesAno)}</p>
                  </div>
                </div>

                {/* Tabela Resumo Geral */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#1B2A4A]/30">
                        <th className="text-left py-2 pr-4 font-bold text-[#1B2A4A] min-w-[120px]">RESUMO GERAL</th>
                        {cols.map((c, i) => (
                          <th key={i} className="text-right py-2 px-3 font-bold text-[#1B2A4A] min-w-[130px]">{c.label}</th>
                        ))}
                        <th className="text-right py-2 pl-3 font-black text-[#1B2A4A] min-w-[140px] bg-[#1B2A4A]/10 rounded-tr-lg">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Quantidade</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium">{c.qtd}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold bg-[#1B2A4A]/5">{totalQtd}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Proventos</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium text-green-700">{formatBRL(c.proventos)}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold text-green-700 bg-[#1B2A4A]/5">{formatBRL(totalProventos)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Descontos</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium text-red-600">{formatBRL(c.descontos)}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold text-red-600 bg-[#1B2A4A]/5">{formatBRL(totalDescontos)}</td>
                      </tr>
                      <tr className="border-b-2 border-[#1B2A4A]/30 bg-[#1B2A4A]/5">
                        <td className="py-2.5 pr-4 font-black text-[#1B2A4A]">Líquido</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2.5 px-3 font-black text-[#1B2A4A]">{formatBRL(c.liquido)}</td>
                        ))}
                        <td className="text-right py-2.5 pl-3 font-black text-[#1B2A4A] text-lg">{formatBRL(totalLiquido)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* INFO PONTO */}
        {statusMes.data?.pontoConsolidado && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Ponto Consolidado</p>
              <p className="text-sm text-blue-700">O controle de ponto deste mês está consolidado. A verificação cruzada e custos por obra utilizam os dados do ponto.</p>
            </div>
          </div>
        )}

        {/* UPLOAD PROGRESS */}
        {uploading && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-amber-600 animate-spin shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Processando importação...</p>
              <p className="text-sm text-amber-700">Os PDFs estão sendo analisados, classificados e processados automaticamente. Aguarde.</p>
            </div>
          </div>
        )}

        {/* ===== DIALOG DE INCONSISTÊNCIAS COM ANÁLISE IA ===== */}
        <FullScreenDialog open={showInconsistDialog} onClose={() => setShowInconsistDialog(false)} title="Consolidação Bloqueada" subtitle="O sistema identificou inconsistências que precisam ser resolvidas antes da consolidação." icon={<AlertTriangle className="h-5 w-5 text-white" />}>
            
            {inconsistDialogData && (() => {
              const msg = inconsistDialogData.message;
              const isInconsistencia = msg.includes('inconsistência');
              const isObra = msg.includes('sem obra vinculada');
              
              return (
                <div className="space-y-4">
                  {/* ALERTA PRINCIPAL */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-red-800 text-sm">O que aconteceu?</p>
                        <p className="text-sm text-red-700 mt-1">
                          {isInconsistencia 
                            ? "Existem funcionários na folha de pagamento com dados que não conferem com o cadastro do sistema. Isso pode causar erros nos relatórios e cálculos."
                            : isObra
                            ? "Existem funcionários que não estão vinculados a nenhuma obra. Para gerar relatórios de custos por obra corretamente, todos precisam estar vinculados."
                            : msg
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ANÁLISE IA AUTOMÁTICA */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="w-full">
                        <p className="font-semibold text-blue-800 text-sm">Análise Automática — Como Resolver</p>
                        <div className="mt-3 space-y-3">
                          {isInconsistencia && (
                            <>
                              {msg.includes('divergências de dados') && (
                                <div className="bg-white rounded-md p-3 border border-blue-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <span className="font-semibold text-sm text-amber-800">Divergências de Dados</span>
                                  </div>
                                  <p className="text-xs text-gray-700 mb-2">
                                    Dados como data de admissão, função, salário ou status do funcionário na folha estão diferentes do cadastro.
                                  </p>
                                  <div className="bg-amber-50 rounded p-2 space-y-1.5">
                                    <p className="text-xs font-semibold text-amber-900">Passo a passo para resolver:</p>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                      <span>Clique em <strong>"Detalhes"</strong> no lançamento para ver a lista de divergências</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                      <span>Filtre por <strong>"Divergentes"</strong> para ver apenas os funcionários com problemas</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                      <span>Clique no nome do funcionário para expandir e ver qual dado está diferente</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">4</span>
                                      <span>Vá em <strong>Colaboradores</strong> no menu lateral e edite o cadastro do funcionário para corrigir o dado</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">5</span>
                                      <span>Após corrigir, clique em <strong>"Re-Match"</strong> para o sistema reanalisar automaticamente</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {msg.includes('não encontrados') && (
                                <div className="bg-white rounded-md p-3 border border-blue-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="font-semibold text-sm text-red-800">Funcionários Não Encontrados</span>
                                  </div>
                                  <p className="text-xs text-gray-700 mb-2">
                                    Esses funcionários aparecem na folha da contabilidade mas não existem no cadastro do sistema.
                                  </p>
                                  <div className="bg-red-50 rounded p-2 space-y-1.5">
                                    <p className="text-xs font-semibold text-red-900">Passo a passo para resolver:</p>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                      <span>Vá em <strong>Colaboradores</strong> no menu lateral</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                      <span>Clique em <strong>"+Novo"</strong> e cadastre o funcionário com o mesmo CPF que aparece na folha</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                      <span>Volte aqui e clique em <strong>"Re-Match"</strong> para vincular automaticamente</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          {isObra && (
                            <div className="bg-white rounded-md p-3 border border-blue-100">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="h-4 w-4 text-purple-600" />
                                <span className="font-semibold text-sm text-purple-800">Funcionários Sem Obra Vinculada</span>
                              </div>
                              <p className="text-xs text-gray-700 mb-2">
                                Para consolidar, todos os funcionários precisam estar vinculados a uma obra (via ponto ou manualmente).
                              </p>
                              <div className="bg-purple-50 rounded p-2 space-y-1.5">
                                <p className="text-xs font-semibold text-purple-900">Passo a passo para resolver:</p>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                  <span>Clique em <strong>"Custos/Obra"</strong> no lançamento</span>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                  <span>Veja quais funcionários estão na aba <strong>"Sem Obra"</strong></span>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                  <span>Selecione a obra e clique em <strong>"Vincular"</strong> para cada funcionário</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DICA EXTRA - Apenas para Admin Master */}
                  {isMaster && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Wrench className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Dica do Sistema</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Você pode desativar esta verificação em <strong>Configurações &gt; Critérios do Sistema &gt; Folha de Pagamento</strong> alterando o critério "Bloquear consolidação com inconsistências" para Não. Porém, recomendamos manter ativo para garantir a integridade dos dados.
                        </p>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowInconsistDialog(false)}>Fechar</Button>
              <Button onClick={() => { setShowInconsistDialog(false); setFilterStatus("divergente"); setViewMode("detalhes"); }}>
                <Eye className="h-4 w-4 mr-1" /> Ver Detalhes
              </Button>
            </div>
        </FullScreenDialog>


        <Dialog open={!!espelhoPopupEmpId} onOpenChange={(open) => { if (!open) { setEspelhoPopupEmpId(null); setEspelhoEditDate(null); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" resizable={false} draggable>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Espelho de Ponto — {espelhoPopupEmpNome}
              </DialogTitle>
              <DialogDescription>
                Período no Escuro: {espelhoPeriodo.inicio ? new Date(espelhoPeriodo.inicio + 'T12:00:00').toLocaleDateString('pt-BR') : ''} a {espelhoPeriodo.fim ? new Date(espelhoPeriodo.fim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                {' • '}Clique em <Pencil className="h-3 w-3 inline" /> para editar as batidas de um dia.
              </DialogDescription>
            </DialogHeader>
            {!espelhoPopupQ.data ? (
              <div className="text-center py-8 text-muted-foreground">Carregando espelho...</div>
            ) : (() => {
              const recordMap = (espelhoPopupQ.data as any)?.records || {};
              const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
              const dateList: string[] = [];
              if (espelhoPeriodo.inicio && espelhoPeriodo.fim) {
                const cur = new Date(espelhoPeriodo.inicio + 'T12:00:00');
                const end = new Date(espelhoPeriodo.fim + 'T12:00:00');
                while (cur <= end) { dateList.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
              }
              return (
                <div className="space-y-3">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 font-medium">Data</th>
                          <th className="text-center p-2 font-medium">Dia</th>
                          <th className="text-center p-2 font-medium">Entrada</th>
                          <th className="text-center p-2 font-medium">Saída</th>
                          <th className="text-center p-2 font-medium">Entrada 2</th>
                          <th className="text-center p-2 font-medium">Saída 2</th>
                          <th className="text-center p-2 font-medium">Horas</th>
                          <th className="text-center p-2 font-medium">Status</th>
                          <th className="text-center p-2 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dateList.map((dateStr) => {
                          const dt = new Date(dateStr + 'T12:00:00');
                          const dow = dt.getDay();
                          const isSab = dow === 6;
                          const isDom = dow === 0;
                          const d = recordMap[dateStr] || null;
                          const temBatida = !!(d?.entrada1 || d?.saida1);
                          const bgClass = isDom ? 'bg-gray-100' : isSab ? 'bg-blue-50/50' : !temBatida ? 'bg-red-50' : '';
                          return (
                            <tr key={dateStr} className={`border-t ${bgClass} hover:bg-slate-50`}>
                              <td className="p-2 font-mono">{dt.toLocaleDateString('pt-BR')}</td>
                              <td className="p-2 text-center">{diasSemana[dow]}</td>
                              <td className="p-2 text-center font-mono">{d?.entrada1 || '—'}</td>
                              <td className="p-2 text-center font-mono">{d?.saida1 || '—'}</td>
                              <td className="p-2 text-center font-mono">{d?.entrada2 || '—'}</td>
                              <td className="p-2 text-center font-mono">{d?.saida2 || '—'}</td>
                              <td className="p-2 text-center font-mono">{d?.horasTrabalhadas || '—'}</td>
                              <td className="p-2 text-center">
                                {!temBatida && !isDom && !isSab ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">SEM REG</span>
                                ) : isDom ? (
                                  <span className="text-[10px] text-gray-400">DOM</span>
                                ) : isSab ? (
                                  <span className="text-[10px] text-blue-400">SÁB</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">OK</span>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                {!isDom && (
                                  <button
                                    className="p-1 rounded hover:bg-blue-100 text-blue-600"
                                    title="Editar batidas"
                                    onClick={() => {
                                      setEspelhoEditDate(dateStr);
                                      setEspelhoEditRecord(d);
                                      setEspelhoEditForm({
                                        entrada1: d?.entrada1 || "", saida1: d?.saida1 || "",
                                        entrada2: d?.entrada2 || "", saida2: d?.saida2 || "",
                                        justificativa: d?.justificativa || "", motivoAjuste: "Correção manual",
                                      });
                                    }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEspelhoPopupEmpId(null); setEspelhoEditDate(null); }}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!espelhoEditDate} onOpenChange={(open) => { if (!open) setEspelhoEditDate(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Pencil className="h-4 w-4 text-slate-500" />
                Editar Ponto — {espelhoEditDate ? new Date(espelhoEditDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>Esta edição será gravada como <strong>ajuste manual</strong> e substituirá o registro original.</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 1</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Entrada</label>
                    <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.entrada1} onChange={e => setEspelhoEditForm(f => ({ ...f, entrada1: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, entrada1: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Saída</label>
                    <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.saida1} onChange={e => setEspelhoEditForm(f => ({ ...f, saida1: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, saida1: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 2 <span className="font-normal normal-case">(intervalo)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Entrada</label>
                    <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.entrada2} onChange={e => setEspelhoEditForm(f => ({ ...f, entrada2: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, entrada2: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Saída</label>
                    <input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={espelhoEditForm.saida2} onChange={e => setEspelhoEditForm(f => ({ ...f, saida2: maskTimeValue(e.target.value) }))} onBlur={e => setEspelhoEditForm(f => ({ ...f, saida2: normalizeTimeOnBlur(e.target.value) }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white w-full" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Motivo</label>
                <input type="text" value={espelhoEditForm.motivoAjuste} onChange={e => setEspelhoEditForm(f => ({ ...f, motivoAjuste: e.target.value }))} placeholder="Motivo do ajuste" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Observação <span className="font-normal">(opcional)</span></label>
                <textarea value={espelhoEditForm.justificativa} onChange={e => setEspelhoEditForm(f => ({ ...f, justificativa: e.target.value }))} rows={2} placeholder="Justificativa adicional..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none" />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setEspelhoEditDate(null)} className="flex-1">
                <X className="h-4 w-4 mr-1.5" /> Cancelar
              </Button>
              <Button onClick={() => {
                if (!espelhoEditDate || !espelhoPopupEmpId) return;
                const dt = new Date(espelhoEditDate + 'T12:00:00');
                const mesRef = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                espelhoSaveMut.mutate({
                  companyId, employeeId: espelhoPopupEmpId, mesReferencia: mesRef, data: espelhoEditDate,
                  entrada1: espelhoEditForm.entrada1 || undefined, saida1: espelhoEditForm.saida1 || undefined,
                  entrada2: espelhoEditForm.entrada2 || undefined, saida2: espelhoEditForm.saida2 || undefined,
                  justificativa: espelhoEditForm.justificativa || undefined, motivoAjuste: espelhoEditForm.motivoAjuste || undefined,
                });
              }} disabled={espelhoSaveMut.isPending} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white">
                {espelhoSaveMut.isPending ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</> : <><Save className="h-4 w-4 mr-1.5" />Salvar Ajuste</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 2196 — Lightbox da foto do colaborador (clique no avatar amplia).
            Rev. 3364 — robustez iPad/iOS Safari: imagem maior, SEM transform (evita o
            bug de compositing em branco do Radix Dialog no WebKit), fallback onError e
            botão "Abrir" (window/nova aba) como escape hatch garantido. */}
        <Dialog open={!!fotoZoom} onOpenChange={(o) => !o && setFotoZoom(null)}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/95 border-none">
            <DialogHeader className="px-4 pt-3 pb-2">
              <DialogTitle className="text-white text-sm font-medium flex items-center justify-between gap-2">
                <span className="truncate">{fotoZoom?.nome}</span>
                {fotoZoom && (
                  <a
                    href={fotoZoom.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </a>
                )}
              </DialogTitle>
            </DialogHeader>
            {fotoZoom && (
              <div className="flex items-center justify-center p-4 pt-0 min-h-[220px]">
                <img
                  src={fotoZoom.url}
                  alt={fotoZoom.nome}
                  style={{ transform: "none" }}
                  className="max-w-full max-h-[78vh] rounded-lg shadow-2xl object-contain bg-white"
                  onError={(ev) => {
                    const el = ev.currentTarget as HTMLImageElement;
                    el.style.display = "none";
                    const fb = el.nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = "flex";
                  }}
                />
                <div style={{ display: "none" }} className="flex-col items-center gap-2 text-center text-white/70 text-sm px-6">
                  <span>Não foi possível carregar a foto aqui.</span>
                  <a href={fotoZoom.url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">Abrir em nova aba</a>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// ===== DESCONTOS CLT VIEW COMPONENT =====
function DescontosCLTView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const { data: comparativo, isLoading } = trpc.folha.comparativoDescontos.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-red-700" /> Descontos CLT
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Sistema vs Contabilidade — {mesAno}</p>
          </div>
        </div>
        <PrintActions title={`Comparativo Descontos CLT - ${mesAno}`} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !comparativo?.comparativo?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado de desconto encontrado para este mês</p>
          <p className="text-xs mt-1">Certifique-se de que os descontos foram calculados no Fechamento de Ponto</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-center px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium">Sistema (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Contabilidade (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Diferença (R$)</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {comparativo.comparativo.map((c: any, i: number) => {
                const diff = c.diferenca || 0;
                const hasDiff = Math.abs(diff) > 0.01;
                return (
                  <tr key={i} className={`border-t border-border ${hasDiff ? 'bg-red-50/50' : 'hover:bg-muted/30'}`}>
                    <td className="px-4 py-2 font-medium">{c.nome}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{c.tipo}</span>
                    </td>
                    <td className="px-3 py-2 text-right">R$ {(c.valorSistema || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">R$ {(c.valorContabilidade || 0).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${hasDiff ? 'text-red-700' : 'text-green-700'}`}>
                      {hasDiff ? `R$ ${diff.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasDiff ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="w-3 h-3" /> Divergente</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle className="w-3 h-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== CRUZAMENTO HE VIEW COMPONENT =====
function CruzamentoHEView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const { data: cruzamento, isLoading } = trpc.folha.cruzamentoHE.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-700" /> Cruzamento HE
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Ponto vs Folha — {mesAno}</p>
          </div>
        </div>
        <PrintActions title={`Cruzamento HE - ${mesAno}`} />
      </div>

      {/* Resumo */}
      {cruzamento && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total HE Sistema</div>
            <div className="text-lg font-bold">{cruzamento.resumo?.totalHeSistema || '0'}h</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total HE Folha</div>
            <div className="text-lg font-bold">R$ {cruzamento.resumo?.totalHeContabValor?.toFixed(2) || '0'}</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Divergências</div>
            <div className="text-lg font-bold text-red-700">{cruzamento.resumo?.comHeNaoAutorizada || 0}</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Conferidos OK</div>
            <div className="text-lg font-bold text-green-700">{cruzamento.resumo?.totalFuncionarios || 0}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !cruzamento?.cruzamento?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado de HE encontrado para cruzamento</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-right px-3 py-2 font-medium">HE Sistema (h)</th>
                <th className="text-right px-3 py-2 font-medium">HE Folha (h)</th>
                <th className="text-right px-3 py-2 font-medium">Diferença (h)</th>
                <th className="text-right px-3 py-2 font-medium">Valor Sistema (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Valor Folha (R$)</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {cruzamento.cruzamento.map((f: any, i: number) => {
                const diffH = (f.heSistema || 0) - (f.heFolha || 0);
                const hasDiff = Math.abs(diffH) > 0.1;
                return (
                  <tr key={i} className={`border-t border-border ${hasDiff ? 'bg-amber-50/50' : 'hover:bg-muted/30'}`}>
                    <td className="px-4 py-2 font-medium">{f.nome}</td>
                    <td className="px-3 py-2 text-right">{(f.heSistema || 0).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{(f.heFolha || 0).toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${hasDiff ? 'text-red-700' : 'text-green-700'}`}>
                      {hasDiff ? diffH.toFixed(1) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">R$ {(f.valorSistema || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">R$ {(f.valorFolha || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      {hasDiff ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="w-3 h-3" /> Divergente</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle className="w-3 h-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== DESCONTOS EPI VIEW COMPONENT =====
function DescontosEPIView({ companyId, mesAno, onBack }: { companyId: number; mesAno: string; onBack: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [validandoId, setValidandoId] = useState<number | null>(null);
  const [acao, setAcao] = useState<"confirmado" | "cancelado">("confirmado");
  const [justificativa, setJustificativa] = useState("");

  const { data: alertas, isLoading, refetch } = trpc.epis.listDiscountAlerts.useQuery(
    { companyId, status: statusFilter === "all" ? undefined : statusFilter as any },
    { enabled: companyId > 0 }
  );

  const validateMut = trpc.epis.validateDiscount.useMutation({
    onSuccess: () => {
      toast.success(acao === "confirmado" ? "Desconto confirmado na folha" : "Desconto cancelado");
      setValidandoId(null);
      setJustificativa("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleValidar = (id: number, action: "confirmado" | "cancelado") => {
    if (validandoId === id && acao === action) {
      setValidandoId(null);
    } else {
      setValidandoId(id);
      setAcao(action);
      setJustificativa("");
    }
  };

  const allAlertas = alertas || [];
  const pendentes = allAlertas.filter((a: any) => a.status === "pendente");
  const confirmados = allAlertas.filter((a: any) => a.status === "confirmado");
  const cancelados = allAlertas.filter((a: any) => a.status === "cancelado");
  const totalPendente = pendentes.reduce((s: number, a: any) => s + parseFloat(String(a.valorTotal || "0")), 0);
  const totalConfirmado = confirmados.reduce((s: number, a: any) => s + parseFloat(String(a.valorTotal || "0")), 0);

  const filteredAlertas = statusFilter === "all" ? allAlertas :
    allAlertas.filter((a: any) => a.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <HardHat className="h-5 w-5 text-amber-600" /> Descontos de EPI
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Descontos gerados por perda, dano ou mau uso — Art. 462, §1º da CLT
            </p>
          </div>
        </div>
        <PrintActions title={`Descontos EPI - ${mesAno}`} />
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className={`border-l-4 border-l-amber-500 cursor-pointer ${statusFilter === "pendente" ? "ring-2 ring-amber-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "pendente" ? "all" : "pendente")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold text-amber-700">{pendentes.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-sm font-semibold text-amber-700">{formatBRL(totalPendente)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 border-l-green-500 cursor-pointer ${statusFilter === "confirmado" ? "ring-2 ring-green-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "confirmado" ? "all" : "confirmado")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Confirmados</p>
                <p className="text-xl font-bold text-green-700">{confirmados.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-sm font-semibold text-green-700">{formatBRL(totalConfirmado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 border-l-gray-400 cursor-pointer ${statusFilter === "cancelado" ? "ring-2 ring-gray-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "cancelado" ? "all" : "cancelado")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Cancelados</p>
                <p className="text-xl font-bold text-gray-500">{cancelados.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total geral</p>
                <p className="text-sm font-semibold">{(alertas || []).length} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1"><FileText className="h-4 w-4" /> Como funciona:</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>Motivo <strong>"Perda"</strong>, <strong>"Dano"</strong> ou <strong>"Mau Uso"</strong> gera alerta de desconto automaticamente ao registrar entrega de EPI.</li>
          <li>Valor = preço unitário do EPI + BDI configurado.</li>
          <li>O DP deve validar (confirmar ou cancelar) antes de fechar a folha.</li>
          <li>Se a entrega de EPI for excluída, o desconto pendente é cancelado automaticamente.</li>
          <li>Base legal: <strong>Art. 462, §1º da CLT</strong>.</li>
        </ul>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !filteredAlertas.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{statusFilter === "all" ? "Nenhum desconto de EPI registrado" : `Nenhum desconto ${statusFilter}`}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-left px-3 py-2 font-medium">EPI</th>
                <th className="text-center px-3 py-2 font-medium">Motivo</th>
                <th className="text-center px-3 py-2 font-medium">Qtd</th>
                <th className="text-right px-3 py-2 font-medium">Unitário</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-center px-3 py-2 font-medium">Ref.</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="text-center px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlertas.map((a: any) => (
                <tr key={a.id} className={`border-t border-border ${a.status === "pendente" ? "bg-amber-50/30" : a.status === "cancelado" ? "bg-gray-50/50 opacity-60" : "hover:bg-muted/30"}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-sm">{a.nomeFunc || "—"}</div>
                    {a.funcaoFunc && <div className="text-xs text-muted-foreground">{a.funcaoFunc}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm">{a.epiNome}</div>
                    {a.ca && <div className="text-xs text-muted-foreground">CA {a.ca}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className={`text-xs ${a.motivoCobranca === "mau_uso" ? "border-amber-300 text-amber-700" : a.motivoCobranca === "perda" ? "border-red-300 text-red-700" : "border-orange-300 text-orange-700"}`}>
                      {a.motivoCobranca}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center font-medium">{a.quantidade}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(a.valorUnitario)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-700">{formatBRL(a.valorTotal)}</td>
                  <td className="px-3 py-2 text-center text-xs">{a.mesReferencia}</td>
                  <td className="px-3 py-2 text-center">
                    {a.status === "pendente" && <Badge className="bg-amber-100 text-amber-800 text-xs">Pendente</Badge>}
                    {a.status === "confirmado" && <Badge className="bg-green-100 text-green-800 text-xs">Confirmado</Badge>}
                    {a.status === "cancelado" && <Badge className="bg-gray-100 text-gray-600 text-xs">Cancelado</Badge>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {a.status === "pendente" ? (
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-green-300 text-green-700 hover:bg-green-50" onClick={() => handleValidar(a.id, "confirmado")}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-red-300 text-red-700 hover:bg-red-50" onClick={() => handleValidar(a.id, "cancelado")}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.validadoPor || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={validandoId !== null} onOpenChange={(v) => { if (!v) setValidandoId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao === "confirmado" ? "Confirmar Desconto na Folha" : "Cancelar Desconto"}
            </DialogTitle>
            <DialogDescription>
              {acao === "confirmado"
                ? "O valor será descontado na folha de pagamento do funcionário."
                : "O desconto não será lançado na folha."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Justificativa (opcional)"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setValidandoId(null)}>Cancelar</Button>
            <Button
              className={acao === "confirmado" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => {
                if (validandoId) validateMut.mutate({ id: validandoId, acao, justificativa });
              }}
              disabled={validateMut.isPending}
            >
              {validateMut.isPending && <RefreshCw className="h-3 w-3 animate-spin mr-1" />}
              {acao === "confirmado" ? "Confirmar Desconto" : "Cancelar Desconto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Rev. 2524 — RELATÓRIO CONSOLIDADO DE DIVERGÊNCIAS
// Consolida verificacaoCruzada (cadastro/ponto) + comparativoDescontos (CLT) +
// cruzamentoHE (hora extra) em UMA tela por funcionário, pra análise do RH.
// ============================================================================
function RelatorioConsolidadoView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const verif = trpc.folha.verificacaoCruzada.useQuery(
    { folhaLancamentoId: lancamentoId, companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && lancamentoId > 0 }
  );
  const descCLT = trpc.folha.comparativoDescontos.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );
  const heCruz = trpc.folha.cruzamentoHE.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  type TipoDiv = "cadastro" | "ponto" | "desconto" | "he" | "nao_vinculado";
  const TODOS_TIPOS: TipoDiv[] = ["nao_vinculado", "cadastro", "ponto", "desconto", "he"];

  // Rev. 2526 — filtros multi + severidade + ordenação + modo visão
  const [tiposSelecionados, setTiposSelecionados] = useState<Set<TipoDiv>>(new Set());
  const [filtroSeveridade, setFiltroSeveridade] = useState<"todas" | "alta" | "media">("todas");
  const [ordenarPor, setOrdenarPor] = useState<"severidade" | "impacto" | "qtd" | "nome">("severidade");
  const [modoVisao, setModoVisao] = useState<"funcionario" | "tipo">("funcionario");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isLoading = verif.isLoading || descCLT.isLoading || heCruz.isLoading;

  type Divergencia = {
    tipo: TipoDiv;
    severidade: "alta" | "media" | "baixa";
    titulo: string;
    folha?: string;
    sistema?: string;
    diferenca?: string;
    impactoFinanceiro?: number; // R$ pra ranking/soma (HE em horas é convertido a ~R$50/h proxy)
  };

  type LinhaConsolidada = {
    key: string;
    employeeId: number | null;
    nome: string;
    codigo?: string;
    funcao?: string;
    liquido?: string;
    divergencias: Divergencia[];
  };

  const linhas = useMemo<LinhaConsolidada[]>(() => {
    const mapByEmp = new Map<string, LinhaConsolidada>();

    // 1) Verificação cruzada (cadastro + ponto + não-vinculado)
    if (verif.data?.verificacoes) {
      for (const v of verif.data.verificacoes as any[]) {
        const key = v.id ? `item:${v.id}` : `nome:${v.nome}`;
        const divs: Divergencia[] = [];
        for (const alerta of (v.alertas || [])) {
          const a = String(alerta);
          if (a.startsWith("Funcionário não vinculado")) {
            divs.push({ tipo: "nao_vinculado", severidade: "alta", titulo: "Não vinculado ao cadastro do ERP", folha: v.nome });
          } else if (a.startsWith("Funcionário com status")) {
            divs.push({ tipo: "cadastro", severidade: "alta", titulo: a });
          } else if (a.startsWith("Salário divergente")) {
            divs.push({
              tipo: "cadastro", severidade: "alta", titulo: "Salário divergente",
              folha: v.salarioFolha ? `R$ ${v.salarioFolha}` : "—",
              sistema: v.salarioCadastro ? `R$ ${v.salarioCadastro}` : "—",
            });
          } else if (a.startsWith("Função divergente")) {
            divs.push({
              tipo: "cadastro", severidade: "media", titulo: "Função divergente",
              folha: v.funcaoFolha || "—",
              sistema: v.funcaoCadastro || "—",
            });
          } else if (a.includes("falta")) {
            divs.push({ tipo: "ponto", severidade: "media", titulo: a, sistema: v.ponto ? `${v.ponto.faltas} falta(s)` : undefined });
          } else if (a.startsWith("Sem registros de ponto")) {
            divs.push({ tipo: "ponto", severidade: "alta", titulo: "Sem registros de ponto no mês" });
          } else {
            divs.push({ tipo: "cadastro", severidade: "media", titulo: a });
          }
        }
        if (divs.length === 0) continue;
        const empId = v.employeeId ?? null;
        const baseKey = empId ? `emp:${empId}` : `nome:${(v.nome || "").trim().toUpperCase().replace(/\s+/g, " ")}`;
        mapByEmp.set(baseKey, {
          key: baseKey,
          employeeId: empId,
          nome: v.nome,
          codigo: v.codigo || undefined,
          funcao: v.funcaoFolha || v.funcaoCadastro || undefined,
          liquido: v.liquido,
          divergencias: divs,
        });
      }
    }

    // Helper de lookup endurecido (anti-homonímia):
    //  - SEMPRE prioriza employeeId quando os dois lados têm ID.
    //  - Fallback por nome SÓ quando AMBOS lados não têm employeeId
    //    (caso de funcionário não-vinculado na verificacaoCruzada).
    const normNome = (s: string) => (s || "").trim().toUpperCase().replace(/\s+/g, " ");
    const findLinha = (empId: number | null | undefined, nome: string): LinhaConsolidada | null => {
      if (empId) {
        for (const l of mapByEmp.values()) if (l.employeeId === empId) return l;
        return null; // tem ID e não achou → cria nova, não cola em homônimo
      }
      const n = normNome(nome);
      if (!n) return null;
      for (const l of mapByEmp.values()) if (!l.employeeId && normNome(l.nome) === n) return l;
      return null;
    };
    const addDivergencia = (empId: number | null | undefined, nome: string, funcao: string | undefined, div: Divergencia) => {
      const existing = findLinha(empId, nome);
      if (existing) {
        existing.divergencias.push(div);
        return;
      }
      const key = empId ? `emp:${empId}` : `nome:${normNome(nome)}`;
      mapByEmp.set(key, {
        key, employeeId: empId ?? null, nome, funcao,
        divergencias: [div],
      });
    };

    // 2) Comparativo de Descontos CLT
    if (descCLT.data?.comparativo) {
      for (const c of descCLT.data.comparativo as any[]) {
        if (c.status === "ok") continue;
        addDivergencia(c.employeeId, c.nome, c.cargo, {
          tipo: "desconto",
          severidade: Math.abs(c.diferenca) > 50 ? "alta" : "media",
          titulo: c.status === "sistema_maior" ? "Descontos CLT: Sistema > Contabilidade" : "Descontos CLT: Contabilidade > Sistema",
          sistema: `R$ ${Number(c.sistemaTotal || 0).toFixed(2)}`,
          folha: `R$ ${Number(c.contabTotal || 0).toFixed(2)}`,
          diferenca: `R$ ${Number(c.diferenca || 0).toFixed(2)}`,
          impactoFinanceiro: Math.abs(Number(c.diferenca || 0)),
        });
      }
    }

    // 3) Cruzamento HE — server retorna sistemaHoras (string), aprovadoHoras (string),
    //    contabTotalValor (R$ number), heNaoAutorizadaMin (number).
    //    Unidades diferentes (h × R$) → divergência principal é HE NÃO AUTORIZADA
    //    (registrada no ponto sem solicitação aprovada). Também alerto quando a folha
    //    paga HE mas o ponto não registrou nada (e vice-versa).
    if (heCruz.data?.cruzamento) {
      for (const h of heCruz.data.cruzamento as any[]) {
        const sistemaH = parseFloat(String(h.sistemaHoras || "0"));
        const aprovadoH = parseFloat(String(h.aprovadoHoras || "0"));
        const contabValor = Number(h.contabTotalValor || 0);
        const naoAutMin = Number(h.heNaoAutorizadaMin || 0);
        const naoAutH = naoAutMin / 60;

        // Caso A: HE não autorizada (ponto > aprovado)
        if (naoAutMin > 0) {
          addDivergencia(h.employeeId, h.nome, h.cargo, {
            tipo: "he",
            severidade: naoAutH > 5 ? "alta" : "media",
            titulo: "Horas extras registradas sem solicitação aprovada",
            sistema: `${sistemaH.toFixed(1)}h registradas`,
            folha: `${aprovadoH.toFixed(1)}h aprovadas`,
            diferenca: `${naoAutH.toFixed(1)}h sem aprovação`,
            impactoFinanceiro: Math.round(naoAutH * 50), // proxy R$50/h
          });
        }

        // Caso B: folha pagou HE mas ponto não registrou
        if (contabValor > 0 && sistemaH < 0.1) {
          addDivergencia(h.employeeId, h.nome, h.cargo, {
            tipo: "he",
            severidade: contabValor > 100 ? "alta" : "media",
            titulo: "Folha pagou HE sem registro no ponto",
            sistema: "0h registradas",
            folha: `R$ ${contabValor.toFixed(2)} pagos`,
            diferenca: `R$ ${contabValor.toFixed(2)}`,
            impactoFinanceiro: contabValor,
          });
        }

        // Caso C: ponto tem HE mas folha não pagou nada
        if (sistemaH > 0.1 && contabValor < 0.01) {
          addDivergencia(h.employeeId, h.nome, h.cargo, {
            tipo: "he",
            severidade: sistemaH > 5 ? "alta" : "media",
            titulo: "Ponto registrou HE mas folha não pagou",
            sistema: `${sistemaH.toFixed(1)}h registradas`,
            folha: "R$ 0,00 pagos",
            diferenca: `${sistemaH.toFixed(1)}h a apurar`,
            impactoFinanceiro: Math.round(sistemaH * 50),
          });
        }
      }
    }

    return Array.from(mapByEmp.values()).sort((a, b) => {
      const sevOrder = (l: LinhaConsolidada) => {
        if (l.divergencias.some(d => d.severidade === "alta")) return 0;
        if (l.divergencias.some(d => d.severidade === "media")) return 1;
        return 2;
      };
      const so = sevOrder(a) - sevOrder(b);
      if (so !== 0) return so;
      return b.divergencias.length - a.divergencias.length;
    });
  }, [verif.data, descCLT.data, heCruz.data]);

  // KPIs por tipo
  const kpis = useMemo(() => {
    const k = { total: linhas.length, cadastro: 0, ponto: 0, desconto: 0, he: 0, nao_vinculado: 0 };
    for (const l of linhas) {
      const tipos = new Set(l.divergencias.map(d => d.tipo));
      if (tipos.has("cadastro")) k.cadastro++;
      if (tipos.has("ponto")) k.ponto++;
      if (tipos.has("desconto")) k.desconto++;
      if (tipos.has("he")) k.he++;
      if (tipos.has("nao_vinculado")) k.nao_vinculado++;
    }
    return k;
  }, [linhas]);

  const tipoLabel: Record<TipoDiv, { label: string; cls: string; icon: any; chipActive: string }> = {
    cadastro: { label: "Cadastro", cls: "bg-amber-100 text-amber-800 border-amber-300", chipActive: "bg-amber-500 text-white border-amber-500", icon: User },
    ponto: { label: "Ponto", cls: "bg-purple-100 text-purple-800 border-purple-300", chipActive: "bg-purple-600 text-white border-purple-600", icon: Clock },
    desconto: { label: "Desconto CLT", cls: "bg-red-100 text-red-800 border-red-300", chipActive: "bg-red-600 text-white border-red-600", icon: Scale },
    he: { label: "Hora Extra", cls: "bg-orange-100 text-orange-800 border-orange-300", chipActive: "bg-orange-600 text-white border-orange-600", icon: TrendingUp },
    nao_vinculado: { label: "Não vinculado", cls: "bg-slate-200 text-slate-800 border-slate-300", chipActive: "bg-slate-700 text-white border-slate-700", icon: XCircle },
  };

  // Rev. 2526 (revisão pós-architect) — TUDO que envolve métricas de
  // linha (ordenação, KPI Impacto, badges) usa SÓ o subset visível
  // após filtros de tipo+severidade. Pra evitar recálculo, gero um
  // Map(key→divsVisiveis[]) uma única vez por mudança de filtro.
  const divsVisiveisPorLinha = useMemo(() => {
    const tipos = tiposSelecionados;
    const map = new Map<string, LinhaConsolidada["divergencias"]>();
    for (const l of linhas) {
      const filtradas = l.divergencias.filter(d =>
        (tipos.size === 0 || tipos.has(d.tipo)) &&
        (filtroSeveridade === "todas" || d.severidade === filtroSeveridade)
      );
      map.set(l.key, filtradas);
    }
    return map;
  }, [linhas, tiposSelecionados, filtroSeveridade]);

  // Helpers que operam APENAS no subset visível
  const impactoVisivel = (l: LinhaConsolidada) =>
    (divsVisiveisPorLinha.get(l.key) || []).reduce((s, d) => s + (d.impactoFinanceiro || 0), 0);
  const severidadeRankVisivel = (l: LinhaConsolidada) => {
    let r = 0;
    for (const d of divsVisiveisPorLinha.get(l.key) || []) {
      if (d.severidade === "alta") r = Math.max(r, 2);
      else if (d.severidade === "media") r = Math.max(r, 1);
    }
    return r;
  };
  const qtdVisivel = (l: LinhaConsolidada) => (divsVisiveisPorLinha.get(l.key) || []).length;
  const temAltaVisivel = (l: LinhaConsolidada) =>
    (divsVisiveisPorLinha.get(l.key) || []).some(d => d.severidade === "alta");

  // Filtros + ordenação aplicados (sobre o subset visível)
  const linhasFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtradas = linhas.filter(l => {
      if (qtdVisivel(l) === 0) return false;
      if (s && !l.nome.toLowerCase().includes(s) && !(l.codigo || "").toLowerCase().includes(s)) return false;
      return true;
    });

    return filtradas.sort((a, b) => {
      switch (ordenarPor) {
        case "impacto":
          return impactoVisivel(b) - impactoVisivel(a);
        case "qtd":
          return qtdVisivel(b) - qtdVisivel(a);
        case "nome":
          return a.nome.localeCompare(b.nome, "pt-BR");
        case "severidade":
        default: {
          const so = severidadeRankVisivel(b) - severidadeRankVisivel(a);
          if (so !== 0) return so;
          return qtdVisivel(b) - qtdVisivel(a);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, divsVisiveisPorLinha, search, ordenarPor]);

  // Impacto total das linhas filtradas (KPI dinâmico) — subset visível
  const impactoTotal = useMemo(
    () => linhasFiltradas.reduce((s, l) => s + impactoVisivel(l), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhasFiltradas, divsVisiveisPorLinha]
  );

  // Agregado "Por Tipo" — todas as divergências planas, agrupadas por tipo, ordenadas por impacto desc
  type DivFlat = LinhaConsolidada["divergencias"][number] & { funcionarioNome: string; funcionarioCodigo?: string; key: string };
  const porTipo = useMemo(() => {
    const map: Record<TipoDiv, DivFlat[]> = { cadastro: [], ponto: [], desconto: [], he: [], nao_vinculado: [] };
    for (const l of linhasFiltradas) {
      for (const d of l.divergencias) {
        if (tiposSelecionados.size > 0 && !tiposSelecionados.has(d.tipo)) continue;
        if (filtroSeveridade !== "todas" && d.severidade !== filtroSeveridade) continue;
        map[d.tipo].push({ ...d, funcionarioNome: l.nome, funcionarioCodigo: l.codigo, key: `${l.key}#${d.tipo}#${map[d.tipo].length}` });
      }
    }
    for (const t of TODOS_TIPOS) {
      map[t].sort((a, b) => {
        const so = (b.severidade === "alta" ? 2 : b.severidade === "media" ? 1 : 0)
                 - (a.severidade === "alta" ? 2 : a.severidade === "media" ? 1 : 0);
        if (so !== 0) return so;
        return (b.impactoFinanceiro || 0) - (a.impactoFinanceiro || 0);
      });
    }
    return map;
  }, [linhasFiltradas, tiposSelecionados, filtroSeveridade]);

  const toggleTipo = (t: TipoDiv) => {
    setTiposSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  };
  const limparFiltros = () => {
    setTiposSelecionados(new Set());
    setFiltroSeveridade("todas");
    setSearch("");
  };
  const filtrosAtivos = tiposSelecionados.size > 0 || filtroSeveridade !== "todas" || search.trim() !== "";

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const expandAll = () => setExpanded(new Set(linhasFiltradas.map(l => l.key)));
  const collapseAll = () => setExpanded(new Set());

  // Export CSV (divergências planas filtradas)
  const exportarCSV = () => {
    const headers = ["Funcionário", "Código", "Tipo", "Severidade", "Descrição", "Folha (Contabilidade)", "Sistema (ERP)", "Diferença", "Impacto R$"];
    const rows: string[][] = [];
    for (const l of linhasFiltradas) {
      for (const d of l.divergencias) {
        if (tiposSelecionados.size > 0 && !tiposSelecionados.has(d.tipo)) continue;
        if (filtroSeveridade !== "todas" && d.severidade !== filtroSeveridade) continue;
        rows.push([
          l.nome,
          l.codigo || "",
          tipoLabel[d.tipo].label,
          d.severidade.toUpperCase(),
          d.titulo,
          d.folha || "",
          d.sistema || "",
          d.diferenca || "",
          d.impactoFinanceiro ? d.impactoFinanceiro.toFixed(2) : "",
        ]);
      }
    }
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `divergencias-folha-${mesAno}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fmtBRL = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Relatório Consolidado de Divergências
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Cadastro × Ponto × Descontos CLT × Hora Extra — {mesAno}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={isLoading || linhasFiltradas.length === 0}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
          <PrintActions title={`Relatório Consolidado - ${mesAno}`} />
        </div>
      </div>

      {/* KPIs (clicáveis pra filtrar — multi-select) */}
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
        <button
          onClick={() => setTiposSelecionados(new Set())}
          className={`rounded-lg p-3 text-center border-2 transition-all ${tiposSelecionados.size === 0 ? "border-[#1B2A4A] bg-[#1B2A4A]/5" : "border-slate-200 hover:border-slate-300 bg-white"}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Funcionários</p>
          <p className="text-2xl font-black text-[#1B2A4A] mt-0.5">{kpis.total}</p>
        </button>
        {TODOS_TIPOS.map(tipo => {
          const meta = tipoLabel[tipo];
          const Icon = meta.icon;
          const v = kpis[tipo];
          const active = tiposSelecionados.has(tipo);
          return (
            <button
              key={tipo}
              onClick={() => toggleTipo(tipo)}
              className={`rounded-lg p-3 text-center border-2 transition-all ${active ? `${meta.chipActive}` : "border-slate-200 hover:border-slate-300 bg-white"}`}
            >
              <p className={`text-[10px] font-medium uppercase tracking-wide flex items-center justify-center gap-1 ${active ? "text-white/90" : "text-slate-500"}`}>
                <Icon className="h-3 w-3" /> {meta.label}
              </p>
              <p className={`text-2xl font-black mt-0.5 ${active ? "text-white" : v > 0 ? "text-red-700" : "text-slate-400"}`}>{v}</p>
            </button>
          );
        })}
        {/* Impacto Financeiro (KPI dinâmico) */}
        <div className="rounded-lg p-3 text-center border-2 border-emerald-300 bg-emerald-50">
          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 flex items-center justify-center gap-1">
            <DollarSign className="h-3 w-3" /> Impacto R$
          </p>
          <p className="text-lg font-black mt-0.5 text-emerald-800">{fmtBRL(impactoTotal)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Severidade — chips */}
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
          {(["todas", "alta", "media"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroSeveridade(s)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${filtroSeveridade === s
                ? s === "alta" ? "bg-red-600 text-white" : s === "media" ? "bg-amber-500 text-white" : "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-100"}`}
            >
              {s === "todas" ? "Todas severidades" : s === "alta" ? "Alta" : "Média"}
            </button>
          ))}
        </div>
        {/* Ordenação */}
        <select
          value={ordenarPor}
          onChange={e => setOrdenarPor(e.target.value as any)}
          className="text-xs border border-slate-200 rounded-md px-2 py-2 bg-white"
        >
          <option value="severidade">Ordenar: Severidade</option>
          <option value="impacto">Ordenar: Impacto R$</option>
          <option value="qtd">Ordenar: Qtd divergências</option>
          <option value="nome">Ordenar: Nome</option>
        </select>
        {filtrosAtivos && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-slate-600">
            <X className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        )}
        {modoVisao === "funcionario" && (
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronDown className="h-3.5 w-3.5 mr-1" /> Expandir
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronUp className="h-3.5 w-3.5 mr-1" /> Recolher
            </Button>
          </div>
        )}
      </div>

      {/* Tabs Por Funcionário / Por Tipo + contador */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setModoVisao("funcionario")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${modoVisao === "funcionario" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <User className="inline h-3.5 w-3.5 mr-1" /> Por Funcionário
          </button>
          <button
            onClick={() => setModoVisao("tipo")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${modoVisao === "tipo" ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <Filter className="inline h-3.5 w-3.5 mr-1" /> Por Tipo
          </button>
        </div>
        <p className="text-xs text-muted-foreground pr-1">
          Mostrando <strong>{linhasFiltradas.length}</strong> de <strong>{linhas.length}</strong> funcionário(s)
        </p>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : linhasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-green-300 bg-green-50/50 rounded-lg">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" />
          <p className="font-semibold text-green-700">Nenhuma divergência encontrada</p>
          <p className="text-xs mt-1">
            {filtrosAtivos ? "Tente limpar os filtros." : "Folha conferida sem inconsistências."}
          </p>
        </div>
      ) : modoVisao === "funcionario" ? (
        <div className="space-y-2">
          {linhasFiltradas.map(linha => {
            const isOpen = expanded.has(linha.key);
            const divsVisiveis = divsVisiveisPorLinha.get(linha.key) || [];
            const sevAlta = temAltaVisivel(linha);
            const impacto = impactoVisivel(linha);
            return (
              <Card key={linha.key} className={`border-l-4 ${sevAlta ? "border-l-red-500" : "border-l-amber-400"}`}>
                <button
                  onClick={() => toggleExpand(linha.key)}
                  className="w-full p-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {linha.codigo && <span className="font-mono text-xs text-slate-500 mr-2">#{linha.codigo}</span>}
                          {linha.nome}
                        </p>
                        {linha.funcao && <p className="text-[11px] text-muted-foreground truncate">{linha.funcao}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {Array.from(new Set(divsVisiveis.map(d => d.tipo))).map(t => {
                        const meta = tipoLabel[t];
                        return (
                          <Badge key={t} variant="outline" className={`text-[10px] ${meta.cls}`}>
                            {meta.label}
                          </Badge>
                        );
                      })}
                      {impacto > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300 font-mono">
                          {fmtBRL(impacto)}
                        </Badge>
                      )}
                      <Badge className={`text-[10px] ${sevAlta ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                        {divsVisiveis.length} divergência(s)
                      </Badge>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-200 bg-slate-50/50 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500 uppercase tracking-wide text-[10px]">
                          <th className="px-4 py-2 font-medium">Tipo</th>
                          <th className="px-3 py-2 font-medium">Descrição</th>
                          <th className="px-3 py-2 font-medium text-right">Folha (Contabilidade)</th>
                          <th className="px-3 py-2 font-medium text-right">Sistema (ERP)</th>
                          <th className="px-3 py-2 font-medium text-right">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {divsVisiveis.map((d, i) => {
                          const meta = tipoLabel[d.tipo];
                          return (
                            <tr key={i} className="border-b last:border-0 border-slate-200">
                              <td className="px-4 py-2">
                                <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                                  {meta.label}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                <span className={d.severidade === "alta" ? "font-semibold text-red-700" : ""}>{d.titulo}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">{d.folha || "—"}</td>
                              <td className="px-3 py-2 text-right font-mono">{d.sistema || "—"}</td>
                              <td className="px-3 py-2 text-right font-mono font-semibold text-red-700">{d.diferenca || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        // ===== MODO POR TIPO =====
        <div className="space-y-4">
          {TODOS_TIPOS.map(tipo => {
            const itens = porTipo[tipo];
            if (itens.length === 0) return null;
            const meta = tipoLabel[tipo];
            const Icon = meta.icon;
            const somaImpacto = itens.reduce((s, d) => s + (d.impactoFinanceiro || 0), 0);
            return (
              <Card key={tipo}>
                <div className={`px-4 py-2.5 border-b flex items-center justify-between ${meta.cls}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <h3 className="font-semibold text-sm">{meta.label}</h3>
                    <Badge variant="outline" className="bg-white/80 text-[10px] font-mono">{itens.length} divergência(s)</Badge>
                  </div>
                  {somaImpacto > 0 && (
                    <span className="text-xs font-mono font-semibold">Impacto: {fmtBRL(somaImpacto)}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 uppercase tracking-wide text-[10px] bg-slate-50">
                        <th className="px-4 py-2 font-medium">Funcionário</th>
                        <th className="px-3 py-2 font-medium">Descrição</th>
                        <th className="px-3 py-2 font-medium text-right">Folha</th>
                        <th className="px-3 py-2 font-medium text-right">Sistema</th>
                        <th className="px-3 py-2 font-medium text-right">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(d => (
                        <tr key={d.key} className={`border-b last:border-0 border-slate-200 ${d.severidade === "alta" ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-2">
                            <p className="font-medium text-slate-800">{d.funcionarioNome}</p>
                            {d.funcionarioCodigo && <p className="font-mono text-[10px] text-slate-500">#{d.funcionarioCodigo}</p>}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            <span className={d.severidade === "alta" ? "font-semibold text-red-700" : ""}>{d.titulo}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{d.folha || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{d.sistema || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-red-700">{d.diferenca || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="text-[11px] text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
        <p><strong>Como ler este relatório:</strong></p>
        <p>• <strong>Folha (Contabilidade)</strong> = valor importado do PDF emitido pela contabilidade.</p>
        <p>• <strong>Sistema (ERP)</strong> = valor calculado pelo ERP (ponto, cadastro, motor CLT).</p>
        <p>• <strong>Impacto R$</strong> = soma dos R$ em jogo (descontos CLT divergentes + HE em risco @ R$50/h proxy). É um indicador de prioridade, não o valor exato a corrigir.</p>
        <p>• Borda <span className="text-red-700 font-semibold">vermelha</span> = alta severidade (ação obrigatória do RH); <span className="text-amber-700 font-semibold">âmbar</span> = revisão recomendada.</p>
        <p>• KPIs no topo são <strong>clicáveis</strong> e combinam (multi-select). Combine com Severidade + Busca pra isolar exatamente o que precisa.</p>
      </div>
    </div>
  );
}

// ============================================================================
// Rev. 2527 — COMPARATIVO FOLHA × ERP (verba por verba)
// Tela única com 1 linha por funcionário e expand pra detalhamento por verba.
// Reusa: listarItens (PDF analítico) + comparativoDescontos + cruzamentoHE.
// ERP recalcula APENAS: Salário Base (do cadastro), HE (proxy R$50/h),
// Descontos operacionais (faltas/atrasos/DSR via motor CLT).
// INSS/IRRF/FGTS NÃO são recalculados (ERP exibe "—" + nota na legenda).
// ============================================================================
function ComparativoFolhaErpView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const itens = trpc.folha.listarItens.useQuery(
    { folhaLancamentoId: lancamentoId },
    { enabled: lancamentoId > 0 }
  );
  const descCLT = trpc.folha.comparativoDescontos.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );
  const heCruz = trpc.folha.cruzamentoHE.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );
  // Rev. 3310 — líquido REAL calculado pelo ERP (pagamento simulado/consolidado),
  // vindo de payroll_payments via payrollEngine.listarPagamentos. É a fonte honesta
  // pra comparar o LÍQUIDO Folha (PDF) × Líquido ERP (inclui INSS/IRRF/FGTS).
  const pagsErp = trpc.payrollEngine.listarPagamentos.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  const [search, setSearch] = useState("");
  const [somenteDivergencia, setSomenteDivergencia] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState<"nome" | "diferenca" | "liquido">("nome");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const isLoading = itens.isLoading || descCLT.isLoading || heCruz.isLoading || pagsErp.isLoading;

  const descMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of ((descCLT.data?.comparativo as any[]) || [])) {
      if (c.employeeId) m.set(c.employeeId, c);
    }
    return m;
  }, [descCLT.data]);

  const heMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const h of ((heCruz.data?.cruzamento as any[]) || [])) {
      if (h.employeeId) m.set(h.employeeId, h);
    }
    return m;
  }, [heCruz.data]);

  // Rev. 3310 — employeeId → líquido REAL do ERP (salarioLiquido = valor pago).
  // Só entra no mapa quando há pagamento simulado/consolidado COM líquido numérico
  // válido (NaN é descartado); a PRESENÇA da chave = "tem simulação no mês" (não o
  // valor > 0, senão líquido 0/negativo seria lido como "sem simulação" e mascararia
  // divergência real).
  const pagMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of ((pagsErp.data as any[]) || [])) {
      if (p.employeeId == null) continue;
      const liq = parseFloat(String(p.salarioLiquido ?? ""));
      if (Number.isFinite(liq)) m.set(Number(p.employeeId), liq);
    }
    return m;
  }, [pagsErp.data]);

  const linhas = useMemo(() => {
    return ((itens.data as any[]) || []).map((it) => {
      const empId = it.employeeId;
      const desc = empId ? descMap.get(empId) : null;
      const he = empId ? heMap.get(empId) : null;

      const salFolha = parseFloat(String(it.salarioBase || "0"));
      const salErp = it.employee ? parseFloat(String(it.employee.salario || "0")) : 0;
      const liqFolha = parseFloat(String(it.liquido || "0"));

      const heSistemaH = he ? parseFloat(String(he.sistemaHoras || "0")) : 0;
      const heContabValor = he ? Number(he.contabTotalValor || 0) : 0;
      // Proxy honesto: usa (salário/220)*1.5 quando há cadastro; fallback R$50/h.
      const heHoraBase = salErp > 0 ? (salErp / 220) : 50;
      const heErpValor = heSistemaH * heHoraBase * 1.5;

      const descContab = desc ? Number(desc.contabTotal || 0) : 0;
      const descErp = desc ? Number(desc.sistemaTotal || 0) : 0;

      // Líquido ERP parcial: Sal. Base + HE − Descontos operacionais (sem INSS/IRRF/FGTS)
      const liqErpParcial = salErp + heErpValor - descErp;

      // Rev. 3310 — Líquido ERP REAL (pagamento simulado/consolidado do ERP), quando existe.
      // "tem simulação" = chave presente no pagMap (valor numérico válido, inclusive 0
      // ou negativo); NÃO usar `> 0`, senão líquido 0 viraria "—" e esconderia divergência.
      const temLiqErp = empId != null && pagMap.has(Number(empId));
      const liqErpRealRaw = temLiqErp ? (pagMap.get(Number(empId)) as number) : null;
      const liqErpReal = liqErpRealRaw;
      const diffLiq = temLiqErp ? Math.abs(liqFolha - (liqErpRealRaw as number)) : 0;

      const diffSal = salErp > 0 ? Math.abs(salFolha - salErp) : 0;
      const diffHe = he ? Math.abs(heContabValor - heErpValor) : 0;
      const diffDesc = desc ? Math.abs(descContab - descErp) : 0;
      const diffTotal = diffSal + diffHe + diffDesc;

      return {
        id: it.id as number,
        empId,
        nome: (it.nome || "") as string,
        codigo: (it.codigo || "") as string,
        cargo: (it.funcao || it.employee?.cargo || "") as string,
        item: it,
        salFolha, salErp, diffSal,
        heContabValor, heErpValor, heSistemaH, diffHe,
        descContab, descErp, diffDesc,
        liqFolha, liqErpParcial,
        liqErpReal, temLiqErp, diffLiq,
        diffTotal,
        // Rev. 3310 — a divergência também dispara pela diferença de LÍQUIDO (o valor
        // mais importante na conferência com a contabilidade), tolerância R$1.
        temDivergencia: diffTotal > 1 || diffLiq > 1,
      };
    });
  }, [itens.data, descMap, heMap, pagMap]);

  const linhasFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    const arr = linhas.filter(l => {
      if (somenteDivergencia && !l.temDivergencia) return false;
      if (s && !l.nome.toLowerCase().includes(s) && !l.codigo.toLowerCase().includes(s)) return false;
      return true;
    });
    arr.sort((a, b) => {
      switch (ordenarPor) {
        case "diferenca": return b.diffTotal - a.diffTotal;
        case "liquido": return b.liqFolha - a.liqFolha;
        case "nome":
        default: return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
      }
    });
    return arr;
  }, [linhas, search, somenteDivergencia, ordenarPor]);

  const totais = useMemo(() => {
    let liqFolha = 0, liqErpReal = 0, diffLiq = 0, diff = 0, comDiv = 0, comLiqErp = 0;
    for (const l of linhasFiltradas) {
      liqFolha += l.liqFolha;
      if (l.temLiqErp) { liqErpReal += (l.liqErpReal as number); diffLiq += l.diffLiq; comLiqErp++; }
      diff += l.diffTotal;
      if (l.temDivergencia) comDiv++;
    }
    return { liqFolha, liqErpReal, diffLiq, diff, count: linhasFiltradas.length, comDiv, comLiqErp };
  }, [linhasFiltradas]);

  const fmtBRL = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const exportarCSV = () => {
    const headers = ["Funcionário", "Código", "Cargo", "Sal.Base Folha", "Sal.Base ERP", "HE Folha", "HE ERP (proxy)", "Descontos Folha", "Descontos ERP", "Líquido Folha", "Líquido ERP", "Dif. Líquido", "Líquido ERP parcial", "Diferença total", "Status"];
    const rows = linhasFiltradas.map(l => [
      l.nome, l.codigo, l.cargo,
      l.salFolha.toFixed(2), l.salErp.toFixed(2),
      l.heContabValor.toFixed(2), l.heErpValor.toFixed(2),
      l.descContab.toFixed(2), l.descErp.toFixed(2),
      l.liqFolha.toFixed(2),
      l.temLiqErp ? (l.liqErpReal as number).toFixed(2) : "",
      l.temLiqErp ? l.diffLiq.toFixed(2) : "",
      l.liqErpParcial.toFixed(2),
      l.diffTotal.toFixed(2),
      l.temDivergencia ? "DIVERGÊNCIA" : "OK",
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparativo-folha-erp-${mesAno}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-blue-700" /> Comparativo Folha × ERP
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Verba por verba, por funcionário — {mesAno}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={isLoading || linhasFiltradas.length === 0}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
          <PrintActions title={`Comparativo Folha × ERP - ${mesAno}`} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <div className="rounded-lg p-3 text-center border-2 border-slate-200 bg-white">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Funcionários</p>
          <p className="text-2xl font-black text-[#1B2A4A]">{totais.count}</p>
        </div>
        <div className="rounded-lg p-3 text-center border-2 border-blue-200 bg-blue-50">
          <p className="text-[10px] uppercase tracking-wide text-blue-700">Líquido Folha</p>
          <p className="text-base font-black text-blue-900">{fmtBRL(totais.liqFolha)}</p>
        </div>
        <div className="rounded-lg p-3 text-center border-2 border-indigo-200 bg-indigo-50">
          <p className="text-[10px] uppercase tracking-wide text-indigo-700">Líquido ERP</p>
          <p className="text-base font-black text-indigo-900">{totais.comLiqErp > 0 ? fmtBRL(totais.liqErpReal) : "—"}</p>
          <p className="text-[9px] text-indigo-500">{totais.comLiqErp}/{totais.count} c/ simulação</p>
        </div>
        <div className="rounded-lg p-3 text-center border-2 border-purple-200 bg-purple-50">
          <p className="text-[10px] uppercase tracking-wide text-purple-700">Dif. Líquido</p>
          <p className="text-base font-black text-purple-900">{totais.comLiqErp > 0 ? fmtBRL(totais.diffLiq) : "—"}</p>
        </div>
        <div className="rounded-lg p-3 text-center border-2 border-amber-200 bg-amber-50">
          <p className="text-[10px] uppercase tracking-wide text-amber-700">Soma diferenças</p>
          <p className="text-base font-black text-amber-900">{fmtBRL(totais.diff)}</p>
        </div>
        <div className="rounded-lg p-3 text-center border-2 border-red-200 bg-red-50">
          <p className="text-[10px] uppercase tracking-wide text-red-700">Com divergência</p>
          <p className="text-2xl font-black text-red-900">{totais.comDiv}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs px-3 py-2 border border-slate-200 rounded-md bg-white cursor-pointer hover:bg-slate-50 select-none">
          <input
            type="checkbox"
            checked={somenteDivergencia}
            onChange={e => setSomenteDivergencia(e.target.checked)}
            className="cursor-pointer"
          />
          Só com divergência
        </label>
        <select
          value={ordenarPor}
          onChange={e => setOrdenarPor(e.target.value as any)}
          className="text-xs border border-slate-200 rounded-md px-2 py-2 bg-white"
        >
          <option value="nome">Ordenar: Nome</option>
          <option value="diferenca">Ordenar: Maior diferença</option>
          <option value="liquido">Ordenar: Maior líquido</option>
        </select>
        <p className="text-xs text-muted-foreground self-center ml-auto">
          Mostrando <strong>{totais.count}</strong> funcionário(s) · <strong className="text-red-700">{totais.comDiv}</strong> com divergência
        </p>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : linhasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-slate-300 rounded-lg">
          <p className="font-semibold">Nenhum funcionário encontrado.</p>
          <p className="text-xs mt-1">
            {somenteDivergencia ? "Tente desmarcar 'Só com divergência'." : "Importe a folha do mês ou ajuste a busca."}
          </p>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr className="text-left text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="px-2 py-2 font-medium w-8"></th>
                <th className="px-3 py-2 font-medium">Funcionário</th>
                <th className="px-3 py-2 font-medium text-right">Sal. Base Folha</th>
                <th className="px-3 py-2 font-medium text-right">Sal. Base ERP</th>
                <th className="px-3 py-2 font-medium text-right">HE Folha</th>
                <th className="px-3 py-2 font-medium text-right">HE ERP*</th>
                <th className="px-3 py-2 font-medium text-right">Desc. Folha</th>
                <th className="px-3 py-2 font-medium text-right">Desc. ERP</th>
                <th className="px-3 py-2 font-medium text-right border-l border-slate-200">Líquido Folha</th>
                <th className="px-3 py-2 font-medium text-right">Líquido ERP</th>
                <th className="px-3 py-2 font-medium text-right">Dif. Líquido</th>
                <th className="px-3 py-2 font-medium text-right border-l border-slate-200">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.flatMap(l => {
                const isOpen = expanded.has(l.id);
                const rows: any[] = [
                  <tr
                    key={`row-${l.id}`}
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${l.temDivergencia ? "bg-red-50/40" : ""}`}
                    onClick={() => toggle(l.id)}
                  >
                    <td className="px-2 py-2">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">
                        {l.codigo && <span className="font-mono text-[10px] text-slate-500 mr-1">#{l.codigo}</span>}
                        {l.nome}
                      </p>
                      {l.cargo && <p className="text-[10px] text-muted-foreground">{l.cargo}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtBRL(l.salFolha)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.diffSal > 1 ? "text-red-700 font-semibold" : "text-slate-600"}`}>
                      {l.salErp > 0 ? fmtBRL(l.salErp) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.heContabValor > 0 ? fmtBRL(l.heContabValor) : <span className="text-slate-400">—</span>}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.diffHe > 1 ? "text-red-700 font-semibold" : "text-slate-600"}`}>
                      {l.heErpValor > 0 ? fmtBRL(l.heErpValor) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.descContab > 0 ? fmtBRL(l.descContab) : <span className="text-slate-400">—</span>}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.diffDesc > 1 ? "text-red-700 font-semibold" : "text-slate-600"}`}>
                      {l.descErp > 0 ? fmtBRL(l.descErp) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-blue-900 border-l border-slate-200">{fmtBRL(l.liqFolha)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-indigo-900">
                      {l.temLiqErp ? fmtBRL(l.liqErpReal as number) : <span className="text-slate-400" title="ERP ainda não simulou/consolidou o pagamento deste mês para este funcionário">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${l.temLiqErp ? (l.diffLiq > 1 ? "text-red-700" : "text-emerald-700") : "text-slate-400"}`}>
                      {l.temLiqErp ? (l.diffLiq > 0.01 ? fmtBRL(l.diffLiq) : "OK") : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold border-l border-slate-200 ${l.temDivergencia ? "text-red-700" : "text-emerald-700"}`}>
                      {l.diffTotal > 0.01 ? fmtBRL(l.diffTotal) : "OK"}
                    </td>
                  </tr>
                ];
                if (isOpen) {
                  rows.push(
                    <tr key={`exp-${l.id}`} className="border-b border-slate-200 bg-slate-50/70">
                      <td colSpan={12} className="px-4 py-3">
                        <DetalhamentoVerbasFuncionario linha={l} />
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Legenda */}
      <div className="text-[11px] text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
        <p><strong>Como ler este comparativo:</strong></p>
        <p>• <strong>Folha</strong> = valores importados do PDF da contabilidade (verdade fiscal).</p>
        <p>• <strong>ERP</strong> = valores calculados pelo ERP. <strong>Apenas Sal. Base (do cadastro), HE (proxy = salário ÷ 220 × 1,5/h; fallback R$50/h) e Descontos operacionais (faltas/atrasos/DSR via motor CLT) são recalculados nas colunas por verba.</strong> INSS, IRRF e FGTS o ERP NÃO recalcula nessas colunas (exibe "—").</p>
        <p>• <strong className="text-indigo-800">Líquido ERP</strong> = líquido REAL do <strong>pagamento simulado/consolidado do ERP</strong> (motor CLT completo, já com INSS/IRRF). É o que deve bater com o <strong>Líquido Folha</strong> do PDF. Aparece "—" quando o pagamento do mês ainda não foi simulado/consolidado no ERP para o funcionário (rode "Simular Pagamento" antes).</p>
        <p>• <strong className="text-purple-800">Dif. Líquido</strong> = |Líquido Folha − Líquido ERP|. <strong>É o número mais importante da conferência com a contabilidade.</strong></p>
        <p>• <strong>Líquido ERP parcial</strong> (CSV/detalhe) = Sal. Base + HE − Descontos operacionais, SEM INSS/IRRF/FGTS — só referência grosseira de prioridade quando não há simulação.</p>
        <p>• Linha <span className="bg-red-50/60 px-1 rounded font-semibold">vermelha</span> = diferença &gt; R$ 1,00 nos campos comparáveis OU no Líquido.</p>
        <p>• Clique em qualquer linha pra expandir o detalhamento completo (proventos e descontos verba-por-verba do PDF).</p>
      </div>
    </div>
  );
}

function DetalhamentoVerbasFuncionario({ linha }: { linha: any }) {
  const item = linha.item;
  const proventos: any[] = Array.isArray(item.proventos) ? item.proventos : [];
  const descontos: any[] = Array.isArray(item.descontos) ? item.descontos : [];
  const fmt = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const proventosExtras = proventos.filter(p => {
    const d = String(p.descricao || "").toLowerCase();
    return !d.includes("salário base") && !d.includes("salario base");
  });
  const descontosExtras = descontos.filter(d => {
    const desc = String(d.descricao || "").toLowerCase();
    return !desc.includes("inss") && !desc.includes("irrf") && !desc.includes("imposto de renda") && !desc.includes("fgts");
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* PROVENTOS */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Proventos (Folha)
        </p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <th className="px-2 py-1 text-left font-medium">Verba</th>
              <th className="px-2 py-1 text-right font-medium">Folha</th>
              <th className="px-2 py-1 text-right font-medium">ERP</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1 font-medium">Salário Base</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(linha.salFolha)}</td>
              <td className={`px-2 py-1 text-right font-mono ${linha.diffSal > 1 ? "text-red-700 font-semibold" : ""}`}>
                {linha.salErp > 0 ? fmt(linha.salErp) : <span className="text-slate-400">—</span>}
              </td>
            </tr>
            {proventosExtras.length === 0 ? (
              <tr><td colSpan={3} className="px-2 py-2 text-center text-slate-400 italic">Nenhum provento adicional no PDF.</td></tr>
            ) : proventosExtras.map((p, i) => {
              const d = String(p.descricao || "").toLowerCase();
              const isHE = d.includes("hora extra") || d.startsWith("h.e") || d.includes("h. extra") || d.includes("h.extra");
              return (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-2 py-1">{p.descricao}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(Number(p.valor || 0))}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {isHE && linha.heErpValor > 0
                      ? <span className="text-slate-600">~{fmt(linha.heErpValor)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* DESCONTOS */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 mb-1 flex items-center gap-1">
          <TrendingDown className="h-3 w-3" /> Descontos (Folha)
        </p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <th className="px-2 py-1 text-left font-medium">Verba</th>
              <th className="px-2 py-1 text-right font-medium">Folha</th>
              <th className="px-2 py-1 text-right font-medium">ERP</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1 font-medium">INSS</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(Number(item.valorInss || 0))}</td>
              <td className="px-2 py-1 text-right font-mono text-slate-400">—</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1 font-medium">IRRF</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(Number(item.valorIrrf || 0))}</td>
              <td className="px-2 py-1 text-right font-mono text-slate-400">—</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1 font-medium" title="FGTS é informativo — não desconta do líquido">FGTS (informativo)</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(Number(item.valorFgts || 0))}</td>
              <td className="px-2 py-1 text-right font-mono text-slate-400">—</td>
            </tr>
            {descontosExtras.length === 0 ? (
              <tr><td colSpan={3} className="px-2 py-2 text-center text-slate-400 italic">Nenhum outro desconto no PDF.</td></tr>
            ) : descontosExtras.map((d, i) => {
              const desc = String(d.descricao || "").toLowerCase();
              const isOper = desc.includes("falta") || desc.includes("atraso") || desc.includes("dsr");
              return (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-2 py-1">{d.descricao}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(Number(d.valor || 0))}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {isOper && linha.descErp > 0
                      ? <span className={`${linha.diffDesc > 1 ? "text-red-700 font-semibold" : "text-slate-600"}`}>~{fmt(linha.descErp)}*</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-100">
              <td className="px-2 py-1 font-bold">Total Descontos Oper. (CLT)</td>
              <td className="px-2 py-1 text-right font-mono font-bold">{fmt(linha.descContab)}</td>
              <td className={`px-2 py-1 text-right font-mono font-bold ${linha.diffDesc > 1 ? "text-red-700" : ""}`}>
                {linha.descErp > 0 ? fmt(linha.descErp) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Rodapé — LÍQUIDO oficial */}
      <div className="md:col-span-2 mt-2 pt-2 border-t border-slate-300 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted-foreground max-w-xl">
          *ERP só recalcula HE (proxy = salário ÷ 220 × 1,5/h; fallback R$50/h) e Descontos Operacionais (faltas/atrasos/DSR pelo motor CLT). INSS, IRRF e FGTS são lidos do PDF — o ERP não os recalcula. Use este detalhamento como ponto de partida pra auditoria contábil.
        </p>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-500">Líquido Folha (oficial — PDF)</p>
            <p className="text-base font-black text-blue-900 font-mono">{fmt(linha.liqFolha)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-500">Líquido ERP (simulado/consolidado)</p>
            <p className="text-base font-black text-indigo-900 font-mono">
              {linha.temLiqErp ? fmt(linha.liqErpReal) : <span className="text-slate-400">—</span>}
            </p>
          </div>
          {linha.temLiqErp && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-slate-500">Diferença</p>
              <p className={`text-base font-black font-mono ${linha.diffLiq > 1 ? "text-red-700" : "text-emerald-700"}`}>
                {linha.diffLiq > 0.01 ? fmt(linha.diffLiq) : "OK"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
