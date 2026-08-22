import React, { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { nowBrasilia } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, RefreshCw, User, ChevronDown, FileText,
  Clock, AlertCircle, CalendarOff, Pencil, Save, X, Info, AlertTriangle, Trash2, Lock, Unlock, ShieldAlert, Calculator,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import ManualEntryDialog, { type ManualEntryInitialData } from "@/components/ponto/ManualEntryDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHHMM(str: string | null | undefined): number {
  if (!str || str === "0:00" || str === "") return 0;
  const p = str.split(":").map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

function minsToHHMM(m: number, fallback = "—"): string {
  if (m <= 0) return fallback;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function defaultPeriodo() {
  // Período padrão: começa no dia 16 do mês anterior (início do ciclo da
  // competência em curso) e termina no ÚLTIMO dia do mês atual. Cobre tanto o
  // ciclo de folha (16→15) quanto os dias do "escuro" (16→fim) que serão
  // fechados na competência seguinte. Isso evita que inconsistências do
  // escuro fiquem ocultas no espelho individual.
  const n = new Date();
  const pm = n.getMonth() === 0 ? 11 : n.getMonth() - 1;
  const py = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
  const ano = n.getFullYear();
  const mes = n.getMonth() + 1;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    inicio: `${py}-${String(pm + 1).padStart(2, "0")}-16`,
    fim: `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

function generateDays(a: string, b: string): string[] {
  const days: string[] = [];
  const end = new Date(b + "T12:00:00Z");
  const cur = new Date(a + "T12:00:00Z");
  while (cur <= end) { days.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
  return days;
}

const PT_DAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function dayInfo(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  const dow = dt.getUTCDay();
  return {
    dow, name: PT_DAYS[dow], num: dt.getUTCDate(),
    month: PT_MONTHS[dt.getUTCMonth()], year: dt.getUTCFullYear(),
    isSun: dow === 0, isSat: dow === 6,
    monthNum: String(dt.getUTCMonth() + 1).padStart(2, "0"),
  };
}

function getBatidas(r: any): string[] {
  return [r.entrada1, r.saida1, r.entrada2, r.saida2, r.entrada3, r.saida3].filter(Boolean);
}

// Rev. 1877 — novo status `cargo_confianca` p/ funcionários isentos de controle
// de jornada (CLT Art. 62, I/II/III). Substitui "falta"/"incompleto" em todos os
// dias úteis sem batida, e zera faltas/atrasos/HE nos cards de resumo.
type DayStatus = "normal" | "he" | "falta" | "ferias" | "incompleto" | "atraso" | "sabado" | "domingo" | "desligado" | "escuro" | "apontamento" | "feriado" | "atestado" | "bh" | "cargo_confianca";

function nextDay(d: string): string {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function getDayStatus(dateStr: string, rec: any | null, feriasDates?: Set<string>, dataDesligamento?: string | null, empStatus?: string | null, feriadosSet?: Set<string>, isCargoConfianca?: boolean, atestadoDates?: Set<string>, atestadoHorasDates?: Set<string>): DayStatus {
  // Só marca como "desligado" se o status atual do cadastro for Desligado E a data
  // for posterior ao desligamento. Isso evita que uma dataDesligamentoEfetiva
  // residual (de um desligamento cancelado) mascare dias de funcionário Ativo.
  if (empStatus === "Desligado" && dataDesligamento && dateStr >= nextDay(dataDesligamento)) return "desligado";
  // Tipo do dia gravado pelo lançamento manual tem prioridade — abona o dia
  // mesmo sem batidas, sem contar como falta.
  if (rec?.tipoDia === "feriado") return "feriado";
  if (rec?.tipoDia === "atestado") return "atestado";
  if (rec?.tipoDia === "bh") return "bh";
  const { dow, isSun, isSat } = dayInfo(dateStr);
  if (isSun) return "domingo";
  if (isSat) return "sabado";
  // Rev. 3222 — Atestado projetado da tabela `atestados` (não está em time_records).
  // Tipo "dia" cobre o dia inteiro → marca "Atestado" (abonado), mesmo em dia futuro.
  if (atestadoDates?.has(dateStr)) return "atestado";
  if (feriasDates?.has(dateStr)) return "ferias";
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr > today) return "escuro";
  const noBatidas = !rec?.horasTrabalhadas || rec.horasTrabalhadas === "0:00" || rec.horasTrabalhadas === "";
  // Rev. 1840 — Feriados nacionais/empresa: dia sem batida = "feriado" (NÃO é falta).
  // Se o funcionário trabalhou no feriado (tem batidas), segue o fluxo normal e o dia
  // vira "he"/"normal"/"atraso" conforme as batidas — feriado trabalhado é HE 100%.
  if (feriadosSet?.has(dateStr) && noBatidas) return "feriado";
  // Rev. 3222 — Atestado de HORAS (ausência parcial): só marca "Atestado" quando NÃO
  // houve batida no dia (senão o trabalho parcial é preservado e o dia segue normal).
  if (atestadoHorasDates?.has(dateStr) && noBatidas) return "atestado";
  if (noBatidas) {
    if ((rec?.fonte === "apontamento" || rec?.fonte === "dixi+apontamento") && rec?.justificativa) return "apontamento";
    // Rev. 1877 — Funcionário Art. 62 CLT (cargo de confiança/externo): dia útil
    // sem batida NÃO é falta, é isenção legal. Não conta no card de Faltas, nem
    // gera atraso/HE/desconto (o backend já zera em fechamentoPonto.ts L626).
    if (isCargoConfianca) return "cargo_confianca";
    return "falta";
  }
  const bat = getBatidas(rec);
  if (bat.length > 0 && bat.length % 2 !== 0) {
    // Mesmo cargo de confiança que bata por engano: incompleto vira informativo,
    // mas tratamos como cargo_confianca pra não gerar alerta de desconto.
    return isCargoConfianca ? "cargo_confianca" : "incompleto";
  }
  if (parseHHMM(rec.horasExtras) > 0) return isCargoConfianca ? "cargo_confianca" : "he";
  if (parseHHMM(rec.atrasos) > 0) return isCargoConfianca ? "cargo_confianca" : "atraso";
  // Rev. 5045 — falta parcial (saída antecipada convertida em falta pelo fechamento):
  // o servidor projeta deficitMins; sem isso o dia aparecia "Normal" só com horas positivas.
  if (Number(rec.deficitMins || 0) > 0) return isCargoConfianca ? "cargo_confianca" : "atraso";
  return isCargoConfianca ? "cargo_confianca" : "normal";
}

const STATUS_STYLE: Record<DayStatus, { row: string; badge: string; label: string }> = {
  normal:     { row: "",                badge: "bg-green-100 text-green-700",   label: "Normal" },
  he:         { row: "bg-blue-50/40",   badge: "bg-blue-100 text-blue-700",     label: "H. Extra" },
  falta:      { row: "bg-red-50/30",    badge: "bg-red-100 text-red-700",       label: "Falta" },
  ferias:     { row: "bg-teal-50/40",   badge: "bg-teal-100 text-teal-700",     label: "Férias" },
  incompleto: { row: "bg-orange-50/30", badge: "bg-orange-100 text-orange-700", label: "Incompleto" },
  atraso:     { row: "bg-amber-50/20",  badge: "bg-amber-100 text-amber-700",   label: "Atraso" },
  sabado:     { row: "bg-slate-50/60",  badge: "bg-slate-100 text-slate-500",   label: "Sábado" },
  domingo:    { row: "bg-slate-50/30",  badge: "",                              label: "Domingo" },
  apontamento:{ row: "bg-amber-50/30",   badge: "bg-amber-100 text-amber-700",   label: "Apontamento" },
  desligado:  { row: "bg-gray-100/50",  badge: "bg-gray-200 text-gray-500",    label: "Desligado" },
  escuro:     { row: "bg-indigo-50/30", badge: "bg-indigo-100 text-indigo-600", label: "Pendente" },
  feriado:    { row: "bg-orange-50/40", badge: "bg-orange-100 text-orange-700", label: "Feriado" },
  atestado:   { row: "bg-purple-50/40", badge: "bg-purple-100 text-purple-700", label: "Atestado" },
  bh:         { row: "bg-blue-50/40",   badge: "bg-blue-100 text-blue-700",     label: "BH" },
  // Rev. 1877 — CLT Art. 62 (cargo de confiança / sem controle de jornada).
  cargo_confianca: { row: "bg-indigo-50/40", badge: "bg-indigo-100 text-indigo-700", label: "Art. 62 CLT" },
};

function initials(name: string) {
  const p = name.trim().split(" ").filter(Boolean);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function fmtDate(d: string) { return d.split("-").reverse().join("/"); }

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

interface EditForm {
  entrada1: string; saida1: string;
  entrada2: string; saida2: string;
  entrada3: string; saida3: string;
  justificativa: string;
  motivoAjuste: string;
  tipoDia: "normal" | "feriado" | "atestado" | "bh";
}

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  dateStr: string;
  record: any | null;
  employeeId: number;
  companyId: number;
  companyIds?: number[];
  isAdminMaster: boolean;
  onSaved: () => void;
}

function EditDialog({ open, onClose, dateStr, record, employeeId, companyId, companyIds, isAdminMaster, onSaved }: EditDialogProps) {
  const { name, num, monthNum, month, year, dow } = dayInfo(dateStr);
  const mesReferencia = `${year}-${monthNum}`;

  const isApontamento = record?.fonte === "apontamento" || record?.fonte === "dixi+apontamento";
  const [timeLocked, setTimeLocked] = useState(isApontamento);

  // Verifica se o dia está em um ciclo consolidado (bloqueia edição)
  const lockedQ = trpc.fechamentoPonto.isDateLocked.useQuery(
    { companyId, companyIds, data: dateStr },
    { enabled: open && !!dateStr && (companyId > 0 || (companyIds?.length ?? 0) > 0) }
  );
  const cycleLocked = lockedQ.data?.locked === true;
  const cycleMesRef = lockedQ.data?.mesReferencia;
  const checkingLock = lockedQ.isLoading;

  const [form, setForm] = useState<EditForm>({
    entrada1: record?.entrada1 || "",
    saida1:   record?.saida1   || "",
    entrada2: record?.entrada2 || "",
    saida2:   record?.saida2   || "",
    entrada3: record?.entrada3 || "",
    saida3:   record?.saida3   || "",
    justificativa: record?.justificativa || "",
    motivoAjuste: "Correção manual",
    tipoDia: (record?.tipoDia === "feriado" || record?.tipoDia === "atestado" || record?.tipoDia === "bh") ? record.tipoDia : "normal",
  });

  useEffect(() => {
    setTimeLocked(record?.fonte === "apontamento");
    setForm({
      entrada1: record?.entrada1 || "",
      saida1:   record?.saida1   || "",
      entrada2: record?.entrada2 || "",
      saida2:   record?.saida2   || "",
      entrada3: record?.entrada3 || "",
      saida3:   record?.saida3   || "",
      justificativa: record?.justificativa || "",
      motivoAjuste: "Correção manual",
      tipoDia: (record?.tipoDia === "feriado" || record?.tipoDia === "atestado" || record?.tipoDia === "bh") ? record.tipoDia : "normal",
    });
  }, [dateStr, record]);

  const saveMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onSuccess: () => {
      toast.success(`Ponto de ${name} ${num}/${month} salvo com sucesso`);
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  function handleSave() {
    if (cycleLocked) {
      toast.error(`Dia ${dateStr} pertence ao ciclo consolidado${cycleMesRef ? ` de ${cycleMesRef}` : ""}. Desconsolide antes de alterar.`);
      return;
    }
    const isAbonado = form.tipoDia === "feriado" || form.tipoDia === "atestado" || form.tipoDia === "bh";
    saveMut.mutate({
      companyId,
      employeeId,
      mesReferencia,
      data: dateStr,
      entrada1: isAbonado ? undefined : (form.entrada1 || undefined),
      saida1:   isAbonado ? undefined : (form.saida1   || undefined),
      entrada2: isAbonado ? undefined : (form.entrada2 || undefined),
      saida2:   isAbonado ? undefined : (form.saida2   || undefined),
      entrada3: isAbonado ? undefined : (form.entrada3 || undefined),
      saida3:   isAbonado ? undefined : (form.saida3   || undefined),
      justificativa: form.justificativa || undefined,
      motivoAjuste:  form.motivoAjuste  || undefined,
      tipoDia: form.tipoDia,
    });
  }

  const f = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const TimeInput = ({ label, field, disabled }: { label: string; field: keyof EditForm; disabled?: boolean }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const localRef = useRef(form[field] as string);
    useEffect(() => { localRef.current = form[field] as string; }, [form[field]]);

    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="--:--"
            disabled={disabled}
            defaultValue={form[field] as string}
            onFocus={(e) => {
              if (disabled) return;
              if (!e.target.value) { e.target.value = '--:--'; localRef.current = '--:--'; }
              setTimeout(() => e.target.setSelectionRange(0, 0), 0);
            }}
            onBlur={(e) => {
              if (disabled) return;
              const val = e.target.value;
              if (!val || val === '--:--') {
                e.target.value = '';
                setForm(prev => ({ ...prev, [field]: '' }));
                return;
              }
              const clean = val.replace(/-/g, '0');
              const parts = clean.split(':');
              const h = Math.min(23, parseInt(parts[0] || '0', 10));
              const m = Math.min(59, parseInt(parts[1] || '0', 10));
              const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
              e.target.value = formatted;
              setForm(prev => ({ ...prev, [field]: formatted }));
            }}
            onKeyDown={(e) => {
              if (disabled) { e.preventDefault(); return; }
              if (['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
                if (e.key === 'Backspace') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const pos = el.selectionStart ?? 0;
                  if (pos <= 0) return;
                  const slots = [0,1,3,4];
                  const prevSlots = slots.filter(s => s < pos);
                  if (prevSlots.length === 0) return;
                  const target = prevSlots[prevSlots.length - 1];
                  const chars = el.value.split('');
                  chars[target] = '-';
                  el.value = chars.join('');
                  el.setSelectionRange(target, target);
                }
                return;
              }
              if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); return; }
              e.preventDefault();
              const el = e.currentTarget;
              const pos = el.selectionStart ?? 0;
              let chars = el.value.split('');
              if (chars.length < 5) chars = ['-','-',':','-','-'];
              const slots = [0,1,3,4];
              const idx = slots.findIndex(s => s >= pos);
              const slot = idx >= 0 ? idx : slots.length - 1;
              chars[slots[slot]] = e.key;
              el.value = chars.join('');
              const nextPos = slot + 1 < slots.length ? slots[slot + 1] : 5;
              el.setSelectionRange(nextPos, nextPos);
            }}
            onChange={() => {}}
            className={`border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 w-full pr-8 ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'}`}
          />
          <Clock className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-slate-500" />
            Editar Ponto — {name}, {String(num).padStart(2,"0")}/{monthNum}/{year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Aviso de ciclo consolidado — bloqueia edição */}
          {cycleLocked && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
              <div className="space-y-1">
                <p className="font-semibold">Dia em ciclo consolidado{cycleMesRef ? ` (${cycleMesRef})` : ""} — edição bloqueada.</p>
                {isAdminMaster ? (
                  <p>
                    Para alterar este dia, vá em <strong>Fechamento de Ponto</strong>, abra o mês <strong>{cycleMesRef || mesReferencia}</strong> e use <strong>Desconsolidar Ciclo</strong>. Depois retorne aqui para registrar o ajuste.
                  </p>
                ) : (
                  <p>
                    Solicite ao <strong>Admin Master</strong> que desconsolide o ciclo de <strong>{cycleMesRef || mesReferencia}</strong> em Fechamento de Ponto antes de ajustar este dia.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Info note */}
          {!cycleLocked && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <span>Esta edição será gravada como <strong>ajuste manual</strong> e sincronizada com o Fechamento de Ponto, substituindo o registro original.</span>
            </div>
          )}

          {isApontamento && !cycleLocked && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                {timeLocked ? <Lock className="h-3.5 w-3.5 text-slate-400" /> : <Unlock className="h-3.5 w-3.5 text-amber-600" />}
                <span>Horários do apontamento {timeLocked ? 'protegidos' : 'liberados para edição'}</span>
              </div>
              <button
                type="button"
                onClick={() => setTimeLocked(!timeLocked)}
                className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${timeLocked ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              >
                {timeLocked ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
          )}

          {/* Tipo do dia — Normal | Feriado | Atestado | BH */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo do dia</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { v: "normal",   label: "Normal",   colorActive: "bg-slate-700 text-white border-slate-700",   colorIdle: "bg-white text-slate-700 border-slate-200 hover:bg-slate-50" },
                { v: "feriado",  label: "Feriado",  colorActive: "bg-orange-500 text-white border-orange-500", colorIdle: "bg-white text-orange-700 border-orange-200 hover:bg-orange-50" },
                { v: "atestado", label: "Atestado", colorActive: "bg-purple-600 text-white border-purple-600", colorIdle: "bg-white text-purple-700 border-purple-200 hover:bg-purple-50" },
                { v: "bh",       label: "BH",       colorActive: "bg-blue-600 text-white border-blue-600",     colorIdle: "bg-white text-blue-700 border-blue-200 hover:bg-blue-50" },
              ] as const).map(opt => {
                const active = form.tipoDia === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    disabled={cycleLocked}
                    onClick={() => setForm(prev => ({ ...prev, tipoDia: opt.v }))}
                    className={`text-xs font-semibold rounded-lg px-2 py-2 border transition-colors ${active ? opt.colorActive : opt.colorIdle} ${cycleLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {form.tipoDia === "bh" ? (
              <p className="text-[11px] text-blue-700 mt-1.5">
                Falta alocada como <strong>Banco de Horas</strong> — a jornada esperada do dia será debitada do saldo de BH do colaborador. As batidas serão zeradas e o dia não contará como falta na folha.
              </p>
            ) : form.tipoDia !== "normal" && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Dia abonado — as batidas serão zeradas e o dia não conta como falta nem trabalho.
              </p>
            )}
          </div>

          {/* Turno 1 */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 1</p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada1" disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
              <TimeInput label="Saída"   field="saida1"   disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
            </div>
          </div>

          {/* Turno 2 */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 2 <span className="font-normal normal-case">(intervalo)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada2" disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
              <TimeInput label="Saída"   field="saida2"   disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
            </div>
          </div>

          {/* Turno 3 (optional) */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 3 <span className="font-normal normal-case">(opcional)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada3" disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
              <TimeInput label="Saída"   field="saida3"   disabled={timeLocked || cycleLocked || form.tipoDia !== "normal"} />
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Motivo do ajuste</label>
            <input
              type="text"
              value={form.motivoAjuste}
              onChange={f("motivoAjuste")}
              disabled={cycleLocked}
              placeholder="Ex: Correção de batida, esquecimento de registro..."
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 ${cycleLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Observação */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Observação <span className="font-normal normal-case">(opcional)</span></label>
            <textarea
              value={form.justificativa}
              onChange={f("justificativa")}
              disabled={cycleLocked}
              rows={5}
              placeholder="Justificativa adicional..."
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-y ${cycleLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="h-4 w-4 mr-1.5" /> Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending || cycleLocked || checkingLock}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            title={cycleLocked ? "Dia em ciclo consolidado — desconsolide antes de alterar" : undefined}
          >
            {saveMut.isPending
              ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Salvando…</>
              : cycleLocked
                ? <><Lock className="h-4 w-4 mr-1.5" />Bloqueado</>
                : <><Save className="h-4 w-4 mr-1.5" />Salvar Ajuste</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EspelhoPonto() {
  const { isAdminMaster, hasGroup, groupCanAccessRoute, isLoading: permissionsLoading } = usePermissions();
  const { selectedCompanyId, selectedCompany, getCompanyIdsForQuery, isConstrutoras } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompanyId
    ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const canAccess = isAdminMaster || !hasGroup || groupCanAccessRoute("/espelho-ponto");

  const def = useMemo(() => defaultPeriodo(), []);
  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim,    setDataFim]    = useState(def.fim);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [queryParams, setQueryParams] = useState<{ employeeId: number; dataInicio: string; dataFim: string } | null>(null);

  // Manual entry dialog (período)
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualSeed, setManualSeed] = useState<ManualEntryInitialData | undefined>(undefined);

  // Edit dialog state
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<any | null>(null);

  // Limpar ponto dialog
  const [showLimpar, setShowLimpar] = useState(false);
  const [limparInicio, setLimparInicio] = useState("");
  const [limparFim, setLimparFim] = useState("");
  const [limparConfirmText, setLimparConfirmText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const empId = p.get("funcionario");
    const mes = p.get("mes");
    const ini = p.get("inicio");
    const fim = p.get("fim");
    if (empId && ini && fim) {
      const id = parseInt(empId);
      setDataInicio(ini); setDataFim(fim); setEmployeeId(id);
      setQueryParams({ employeeId: id, dataInicio: ini, dataFim: fim });
    } else if (empId && mes) {
      const id = parseInt(empId);
      const [y, m] = mes.split("-").map(Number);
      const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      const inicio = `${py}-${String(pm).padStart(2,"0")}-16`;
      const fimD   = `${y}-${String(m).padStart(2,"0")}-15`;
      setDataInicio(inicio); setDataFim(fimD); setEmployeeId(id);
      setQueryParams({ employeeId: id, dataInicio: inicio, dataFim: fimD });
    }
  }, []);

  if (permissionsLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-slate-400 mb-4" />
          <p className="text-slate-500 font-medium">Carregando permissões...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!canAccess) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <ShieldAlert className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
          <p className="text-slate-600 max-w-md">
            Você não tem permissão para acessar esta página. 
            Entre em contato com o administrador do sistema se acreditar que isso é um erro.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const [incluirDesligados, setIncluirDesligados] = useState(false);
  const empAllQ = trpc.employees.list.useQuery(
    { companyId, companyIds },
    { enabled: canAccess && (companyId > 0 || companyIds.length > 0) }
  );
  const allEmps: any[] = (empAllQ.data as any[]) || [];
  const empList: any[] = incluirDesligados
    ? allEmps
    : allEmps.filter(e => !["Desligado", "Lista_Negra", "Inativo"].includes(e.status));

  const espelhoQ = trpc.horasExtras.getEspelhoPontoRange.useQuery(
    queryParams
      ? { companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, ...queryParams }
      : { companyId: 0, employeeId: 0, dataInicio: "", dataFim: "" },
    { enabled: !!queryParams && (queryCompanyId > 0 || companyIds.length > 0) }
  );

  const filteredEmps = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return empList;
    return empList.filter(e =>
      String(e.nomeCompleto).toLowerCase().includes(q) ||
      String(e.codigoInterno || "").includes(q) ||
      String(e.cpf || "").includes(q)
    );
  }, [empList, searchQuery]);

  const hiddenDesligados = useMemo(() => {
    if (incluirDesligados) return 0;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return 0;
    return allEmps.filter(e =>
      ["Desligado", "Lista_Negra", "Inativo"].includes(e.status) &&
      (String(e.nomeCompleto).toLowerCase().includes(q) || String(e.codigoInterno || "").includes(q))
    ).length;
  }, [allEmps, searchQuery, incluirDesligados]);

  const selectedEmp = useMemo(
    () => employeeId ? allEmps.find(e => Number(e.id) === employeeId) : null,
    [allEmps, employeeId]
  );

  const recordMap: Record<string, any> = (espelhoQ.data?.records as any) || {};
  const empData: any = espelhoQ.data?.employee;
  const avisoPrevio: any = (espelhoQ.data as any)?.avisoPrevio || null;
  const feriasDatesSet = useMemo(
    () => new Set<string>(((espelhoQ.data as any)?.feriasDates as string[]) || []),
    [espelhoQ.data]
  );
  // Rev. 3222 — Atestados projetados pelo backend a partir da tabela `atestados`
  // (dia inteiro e horas), pra que o atestado lançado na Central de Documentos
  // apareça no Espelho de Ponto (antes o dia ficava como "Falta").
  const atestadoDatesSet = useMemo(
    () => new Set<string>(((espelhoQ.data as any)?.atestadoDates as string[]) || []),
    [espelhoQ.data]
  );
  const atestadoHorasDatesSet = useMemo(
    () => new Set<string>(((espelhoQ.data as any)?.atestadoHorasDates as string[]) || []),
    [espelhoQ.data]
  );
  // Rev. 1840 — Set de feriados (nacionais + empresa + móveis) do período exibido.
  // Usado em getDayStatus pra que dias de feriado sem batida apareçam como "Feriado"
  // (laranja) em vez de "Falta" (vermelho), igual ao que o relatório do servidor já faz.
  const feriadosQ = trpc.feriados.listarPeriodo.useQuery(
    queryParams
      ? { companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, dataInicio: queryParams.dataInicio, dataFim: queryParams.dataFim }
      : { companyId: 0, dataInicio: "", dataFim: "" },
    { enabled: !!queryParams && (queryCompanyId > 0 || companyIds.length > 0), staleTime: 5 * 60 * 1000 }
  );
  const feriadosSet = useMemo(
    () => new Set<string>((feriadosQ.data as string[]) || []),
    [feriadosQ.data]
  );
  const hasData = !!queryParams && !espelhoQ.isLoading && !!empData;

  const allDays = useMemo(
    () => queryParams ? generateDays(queryParams.dataInicio, queryParams.dataFim) : [],
    [queryParams]
  );

  const empStatus: string | null = empData?.status ?? null;
  const dataDesligamento: string | null =
    empStatus === "Desligado" ? (empData?.dataDesligamentoEfetiva ?? null) : null;

  // Rev. 1877 — Isenção de controle de jornada (CLT Art. 62). Vem do backend
  // (`getEspelhoPontoRange` projeta `cargoConfianca` + inciso/desde/observação).
  // Quando true: tabela troca "Falta" por "Art. 62 CLT", cards Faltas/Atrasos/HE
  // ficam zerados/Isento e um banner azul aparece após o cabeçalho do colaborador.
  const isCargoConfianca: boolean = !!empData?.cargoConfianca;
  const cargoConfiancaInciso: string | null = (empData?.cargoConfiancaInciso ?? null) as string | null;
  const cargoConfiancaDesde: string | null = empData?.cargoConfiancaDesde
    ? String(empData.cargoConfiancaDesde).slice(0, 10)
    : null;
  const cargoConfiancaObs: string | null = (empData?.cargoConfiancaObservacao ?? null) as string | null;

  // Rev. 1877 (fix architect SEV) — Isenção é date-aware: vale só a partir de
  // `cargoConfiancaDesde`. Sem esse cuidado, dias anteriores ao enquadramento
  // (que tinham obrigação de bater ponto) eram tratados como Art. 62 e faltas/
  // HE/atrasos reais ficavam mascarados. Quando `desde` é null, vale o período
  // inteiro (enquadrado desde sempre).
  const cargoConfiancaAtivoEm = (dateStr: string): boolean =>
    isCargoConfianca && (!cargoConfiancaDesde || dateStr >= cargoConfiancaDesde);
  // "Integral" = todos os dias do período são isentos (cards mostram "Isento").
  // Se a isenção começa no meio, cards mostram números reais do trecho anterior.
  const cargoConfiancaIntegralNoPeriodo: boolean =
    isCargoConfianca && (!cargoConfiancaDesde || !queryParams?.dataInicio || cargoConfiancaDesde <= queryParams.dataInicio);

  const summary = useMemo(() => {
    let trabalhados = 0, diasFalta = 0, diasFerias = 0, totalHEMins = 0, totalAtrasoMins = 0, totalTrabMins = 0;
    for (const d of allDays) {
      if (dataDesligamento && d >= nextDay(dataDesligamento)) continue;
      const { dow } = dayInfo(d);
      const isWeekendDay = dow === 0 || dow === 6;
      const r = recordMap[d];
      const isFerias = feriasDatesSet.has(d);
      // Rev. 3222 — Dia de atestado projetado (tabela `atestados`): dia inteiro abona
      // sempre; atestado de horas só abona quando não houve batida no dia.
      const hasBatidasDia = !!(r && r.horasTrabalhadas && r.horasTrabalhadas !== "0:00" && r.horasTrabalhadas !== "");
      const isAtestadoProj = atestadoDatesSet.has(d) || (atestadoHorasDatesSet.has(d) && !hasBatidasDia);
      const isAbonadoManual = r?.tipoDia === "feriado" || r?.tipoDia === "atestado" || r?.tipoDia === "bh" || isAtestadoProj;
      // Rev. 1840 — Feriado nacional sem batidas é abonado (não falta, não trabalho).
      // COM batidas, o funcionário trabalhou no feriado: HE/atrasos do dia entram
      // normalmente nos totais (HE 100% via hePercentualDomingo no servidor).
      const isFeriadoNac = feriadosSet.has(d);
      const hasBatidasFeriadoNac = isFeriadoNac && !!(r && r.horasTrabalhadas && r.horasTrabalhadas !== "0:00" && r.horasTrabalhadas !== "");
      const isFeriadoNacAbonado = isFeriadoNac && !hasBatidasFeriadoNac;
      const isAbonado = isAbonadoManual || isFeriadoNacAbonado;
      // Rev. 1877 (fix SEV) — date-aware: dia isento (Art. 62) não soma HE/atraso/falta.
      const isCcDia = cargoConfiancaAtivoEm(d);
      if (r && !isFerias && !isAbonado && !isCcDia) { totalHEMins += parseHHMM(r.horasExtras); totalAtrasoMins += parseHHMM(r.atrasos) + Number(r.deficitMins || 0); }
      if (isWeekendDay) continue;
      if (isFerias) { diasFerias++; continue; }
      // Dias abonados (feriado/atestado manual OU feriado nacional sem batida)
      // não contam falta nem trabalho — saem do cálculo de jornada útil.
      if (isAbonado) continue;
      // Feriado nacional COM batidas: contabiliza como dia trabalhado (HE 100%).
      if (hasBatidasFeriadoNac) { trabalhados++; totalTrabMins += parseHHMM(r.horasTrabalhadas); continue; }
      const today = new Date().toISOString().slice(0, 10);
      if (d > today) continue;
      if (!r?.horasTrabalhadas || r.horasTrabalhadas === "0:00" || r.horasTrabalhadas === "") {
        if ((r?.fonte === "apontamento" || r?.fonte === "dixi+apontamento") && r?.justificativa) { trabalhados++; }
        else if (isCcDia) { /* Art. 62: dia útil sem batida NÃO é falta */ }
        else diasFalta++;
      }
      else { trabalhados++; totalTrabMins += parseHHMM(r.horasTrabalhadas); }
    }
    const saldoHEMins = totalHEMins - totalAtrasoMins;
    return { trabalhados, diasFalta, diasFerias, totalHEMins, totalAtrasoMins, totalTrabMins, saldoHEMins };
  }, [allDays, recordMap, feriasDatesSet, atestadoDatesSet, atestadoHorasDatesSet, feriadosSet, dataDesligamento, isCargoConfianca, cargoConfiancaDesde]);

  // Hide Ent.3/Saí.3 column when no records have a third shift
  const hasThirdShift = useMemo(
    () => Object.values(recordMap).some((r: any) => r?.entrada3 || r?.saida3),
    [recordMap]
  );

  // Grid template: conditionally include 3rd-shift column
  const gridCols = hasThirdShift
    ? "7rem 4.5rem 4.5rem 4.5rem 4.5rem 4.5rem 5.5rem 5rem minmax(8rem,1fr) 7rem 2.5rem"
    : "7rem 4.5rem 4.5rem 4.5rem 4.5rem 5.5rem 5rem minmax(8rem,1fr) 7rem 2.5rem";

  const limparMut = trpc.fechamentoPonto.limparPontoPeriodo.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} registro(s) de ponto removido(s) com sucesso`);
      setShowLimpar(false);
      setLimparConfirmText("");
      espelhoQ.refetch();
    },
    onError: (err) => toast.error(`Erro ao limpar ponto: ${err.message}`),
  });

  const recalcMut = trpc.fechamentoPonto.recalcularPeriodo.useMutation({
    onSuccess: (data) => {
      const partes: string[] = [];
      if (data.recalculados > 0) partes.push(`${data.recalculados} dia(s) atualizado(s)`);
      if (data.pulados > 0)      partes.push(`${data.pulados} já corretos`);
      if (data.lockedSkipped > 0) partes.push(`${data.lockedSkipped} bloqueados (ciclo consolidado)`);
      const msg = partes.length > 0 ? partes.join(" • ") : "Nenhum dia precisou ser ajustado";
      if (data.recalculados > 0) toast.success(msg);
      else toast.info(msg);
      espelhoQ.refetch();
    },
    onError: (err) => toast.error(`Erro ao recalcular: ${err.message}`),
  });

  function handleSelectEmp(emp: any) { setEmployeeId(Number(emp.id)); setSearchQuery(""); setShowDropdown(false); }
  function handleBuscar() { if (!employeeId || !dataInicio || !dataFim) return; setQueryParams({ employeeId, dataInicio, dataFim }); }

  // Rev. 1978 — Busca automática: dispara assim que funcionário+datas estão preenchidos.
  // User reclamou (IMG_0839): selecionou ALEX + 01/jan→31/mai mas nada aparecia (precisava clicar Buscar).
  // Debounce 250ms evita disparos a cada keystroke em <input type=date>. Botão Buscar continua disponível.
  useEffect(() => {
    if (!employeeId || !dataInicio || !dataFim) return;
    if (dataInicio > dataFim) return;
    if (queryParams
      && queryParams.employeeId === employeeId
      && queryParams.dataInicio === dataInicio
      && queryParams.dataFim === dataFim) return;
    const t = setTimeout(() => {
      setQueryParams({ employeeId, dataInicio, dataFim });
    }, 250);
    return () => clearTimeout(t);
  }, [employeeId, dataInicio, dataFim]);
  function handleEditSaved() { espelhoQ.refetch(); }
  function openEdit(dateStr: string, record: any | null) { setEditDate(dateStr); setEditRecord(record); }

  function setQuickPeriod(tipo: "periodo" | "mes" | "30d") {
    const n = new Date();
    if (tipo === "periodo") { const {inicio,fim} = defaultPeriodo(); setDataInicio(inicio); setDataFim(fim); }
    else if (tipo === "mes") {
      const y = n.getFullYear(), m = n.getMonth()+1;
      setDataInicio(`${y}-${String(m).padStart(2,"0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2,"0")}-${new Date(y,m,0).getDate()}`);
    } else {
      const p = new Date(n); p.setDate(p.getDate()-30);
      setDataInicio(p.toISOString().slice(0,10)); setDataFim(n.toISOString().slice(0,10));
    }
  }

  // Cell helper — shows time or dash
  const T = (v: string | null | undefined) =>
    v ? <span className="font-mono text-base text-slate-700">{v}</span>
       : <span className="text-slate-300 text-base">—</span>;


  return (
    <DashboardLayout>
      <PrintHeader />

      {/* Edit Dialog */}
      {editDate && (
        <EditDialog
          open={!!editDate}
          onClose={() => setEditDate(null)}
          dateStr={editDate}
          record={editRecord}
          employeeId={employeeId!}
          companyId={queryCompanyId || companyId}
          companyIds={isConstrutoras ? companyIds : undefined}
          isAdminMaster={isAdminMaster}
          onSaved={handleEditSaved}
        />
      )}

      <div className="max-w-6xl mx-auto space-y-4">

        {/* ── FILTROS ─────────────────────────────────────────────── */}
        <div className="no-print bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-slate-400" />
            <h1 className="text-sm font-bold text-slate-800">Espelho de Ponto Individual</h1>
            <span className="text-xs text-slate-400">— selecione o funcionário e o período</span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Employee autocomplete */}
            <div className="flex-1 min-w-[260px] relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-500">Funcionário</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={incluirDesligados} onChange={e => setIncluirDesligados(e.target.checked)}
                    className="h-3 w-3 rounded border-gray-300 text-slate-600 focus:ring-slate-500" />
                  <span className="text-[10px] text-slate-400">Incluir desligados</span>
                </label>
              </div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery || (selectedEmp ? selectedEmp.nomeCompleto : "")}
                  onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); if (!e.target.value) setEmployeeId(null); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder={empAllQ.isLoading ? "Carregando…" : "Nome ou matrícula…"}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                />
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
              </div>
              {showDropdown && (filteredEmps.length > 0 || hiddenDesligados > 0) && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {filteredEmps.slice(0,40).map((e: any) => (
                      <button key={e.id} onMouseDown={() => handleSelectEmp(e)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">{initials(e.nomeCompleto)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-medium truncate ${e.status === "Desligado" ? "text-slate-400" : "text-slate-800"}`}>{e.nomeCompleto}</p>
                            {e.status === "Desligado" && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-gray-200 text-gray-500 shrink-0">DESLIGADO</span>}
                          </div>
                          <p className="text-xs text-slate-400">{e.funcao}{e.codigoInterno ? ` · Mat. ${e.codigoInterno}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {hiddenDesligados > 0 && (
                    <button
                      onMouseDown={() => setIncluirDesligados(true)}
                      className="w-full text-left px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border-t border-amber-200 flex items-center gap-2 text-amber-700"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">
                        {hiddenDesligados === 1 ? "1 funcionário desligado encontrado" : `${hiddenDesligados} funcionários desligados encontrados`}
                        {" — "}
                        <span className="font-semibold underline">clique para incluir</span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Data início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Data fim</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>

            <Button onClick={handleBuscar} disabled={!employeeId || espelhoQ.isLoading}
              className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-5 h-9">
              {espelhoQ.isLoading
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Buscando…</>
                : <><Search className="h-3.5 w-3.5 mr-1.5" />Buscar</>}
            </Button>

            {queryParams && (
              <Button
                variant="outline"
                title="Reaplica a regra de cálculo (atrasos, HE e total) em todos os dias do período sem alterar as batidas. Útil para corrigir dias importados antes da lógica completa rodar."
                onClick={() => {
                  if (!queryParams) return;
                  recalcMut.mutate({
                    companyId: queryCompanyId,
                    companyIds: isConstrutoras ? companyIds : undefined,
                    employeeId: queryParams.employeeId,
                    dataInicio: queryParams.dataInicio,
                    dataFim: queryParams.dataFim,
                  });
                }}
                disabled={recalcMut.isPending}
                className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 rounded-lg px-4 h-9"
              >
                {recalcMut.isPending
                  ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Recalculando…</>
                  : <><Calculator className="h-3.5 w-3.5 mr-1.5" />Recalcular Período</>}
              </Button>
            )}

            {queryParams && (
              <Button variant="outline" onClick={() => { setLimparInicio(dataInicio); setLimparFim(dataFim); setLimparConfirmText(""); setShowLimpar(true); }}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg px-4 h-9">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Limpar Ponto
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-slate-400">Atalhos:</span>
            {([["Período 16→15","periodo"],["Mês atual","mes"],["Últimos 30 dias","30d"]] as const).map(([l,t]) => (
              <button key={t} onClick={() => setQuickPeriod(t as any)}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                {l}
              </button>
            ))}
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setManualSeed({
                    employeeId: employeeId || 0,
                    obraId: 0,
                  });
                  setShowManualDialog(true);
                }}
                className="border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 rounded-lg h-8 px-3 gap-1.5"
                title="Lançar registros manuais para um intervalo de datas"
              >
                <PenLine className="h-3.5 w-3.5" />
                Lançamento Manual
              </Button>
            </div>
          </div>
        </div>

        {/* Manual Entry Dialog (modo período) */}
        <ManualEntryDialog
          open={showManualDialog}
          onClose={() => setShowManualDialog(false)}
          mode="periodo"
          companyId={queryCompanyId || companyId}
          companyIds={isConstrutoras ? companyIds : undefined}
          dataInicio={dataInicio}
          dataFim={dataFim}
          initialData={manualSeed}
          onSaved={() => espelhoQ.refetch()}
        />

        {/* ── EMPTY STATE ──────────────────────────────────────────── */}
        {!queryParams && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm text-slate-700 font-medium">
              {!employeeId ? "Selecione um funcionário e o período" : "Aguardando funcionário e datas válidas…"}
            </p>
            <p className="text-xs text-slate-400 mt-1">A busca dispara automaticamente — ou clique em <strong>Buscar</strong>.</p>
          </div>
        )}

        {queryParams && espelhoQ.isLoading && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin mb-2" />
            <p className="text-sm">Carregando registros…</p>
          </div>
        )}

        {/* Rev. 1980 — Estado de ERRO: query falhou (rede, permissão, server). Sem isso a tela ficava em branco. */}
        {queryParams && !espelhoQ.isLoading && espelhoQ.isError && (
          <div className="flex flex-col items-center py-16 text-center bg-red-50 border border-red-200 rounded-xl">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-3">
              <span className="text-red-600 text-2xl">⚠</span>
            </div>
            <p className="text-sm text-red-700 font-semibold">Erro ao carregar espelho de ponto</p>
            <p className="text-xs text-red-600 mt-1 max-w-xl px-4">
              {String((espelhoQ.error as any)?.message || espelhoQ.error || "Falha desconhecida")}
            </p>
            <button
              type="button"
              onClick={() => espelhoQ.refetch()}
              className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
            >Tentar de novo</button>
          </div>
        )}

        {/* Rev. 1980 — Query habilitada mas desligada por falta de empresa selecionada. Antes ficava em branco. */}
        {queryParams && !espelhoQ.isLoading && !espelhoQ.isError && !espelhoQ.fetchStatus && queryCompanyId <= 0 && companyIds.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center bg-amber-50 border border-amber-200 rounded-xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-3">
              <span className="text-amber-600 text-2xl">🏢</span>
            </div>
            <p className="text-sm text-amber-800 font-semibold">Selecione uma empresa no topo da página</p>
            <p className="text-xs text-amber-700 mt-1">O espelho de ponto precisa de uma empresa ativa pra carregar.</p>
          </div>
        )}

        {/* Rev. 1980 — Query rodou, sem erro, mas funcionário não encontrado pra essa empresa/período. Antes ficava em branco. */}
        {queryParams && !espelhoQ.isLoading && !espelhoQ.isError && espelhoQ.data !== undefined && !empData && (queryCompanyId > 0 || companyIds.length > 0) && (
          <div className="flex flex-col items-center py-16 text-center bg-slate-50 border border-slate-200 rounded-xl">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <span className="text-slate-500 text-2xl">🔎</span>
            </div>
            <p className="text-sm text-slate-700 font-semibold">Funcionário não encontrado nesta empresa</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md px-4">
              O funcionário selecionado não pertence à empresa ativa no topo da página, ou foi removido. Confira o seletor de empresa ou escolha outro funcionário.
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* ── CABEÇALHO DO FUNCIONÁRIO ─────────────────────────── */}
            <div className={`bg-white rounded-xl border px-5 py-4 ${avisoPrevio ? "border-orange-300 ring-1 ring-orange-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${avisoPrevio ? "bg-orange-50 border-orange-200" : "bg-slate-100 border-slate-200"}`}>
                    <span className={`text-sm font-bold ${avisoPrevio ? "text-orange-700" : "text-slate-600"}`}>{initials(empData.nomeCompleto)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-slate-900">{empData.nomeCompleto}</h2>
                      {avisoPrevio && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                          ⚠ Aviso Prévio — {avisoPrevio.tipo === "empregador_indenizado" ? "Indenizado" : avisoPrevio.tipo === "pedido_demissao" ? "Pedido de Demissão" : "Trabalhado"} · até {fmtDate(avisoPrevio.dataFim)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-slate-500">
                      {empData.funcao && <span>{empData.funcao}</span>}
                      {empData.codigoInterno && <span>Mat. <strong>{empData.codigoInterno}</strong></span>}
                      {empData.cpf && <span>CPF {empData.cpf}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right text-xs">
                    <p className="text-slate-400 font-medium">Período</p>
                    <p className="text-slate-700 font-bold mt-0.5">{fmtDate(queryParams!.dataInicio)} a {fmtDate(queryParams!.dataFim)}</p>
                  </div>
                  <div className="no-print">
                    <PrintActions title="Espelho de Ponto" />
                  </div>
                </div>
              </div>
            </div>

            {/* Rev. 1877 — Banner CLT Art. 62 (isento de controle de jornada).
                Aparece apenas quando o colaborador está marcado como cargoConfianca.
                Mostra a base legal + inciso + data de enquadramento + observação,
                pra deixar claro pra RH/auditoria por que não há batidas/HE/faltas. */}
            {isCargoConfianca && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <Lock className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                <div className="text-sm text-indigo-900 leading-relaxed flex-1 min-w-0">
                  <p className="font-semibold">
                    Isento de controle de jornada — CLT Art. 62
                    {cargoConfiancaInciso ? `, inciso ${cargoConfiancaInciso}` : ""}
                  </p>
                  <p className="text-xs text-indigo-800 mt-0.5">
                    {cargoConfiancaInciso === "I"   && "Atividade externa incompatível com fixação de horário."}
                    {cargoConfiancaInciso === "II"  && "Cargo de gestão / confiança (gerente, diretor) — gratificação mínima 40%."}
                    {cargoConfiancaInciso === "III" && "Trabalho em regime de teletrabalho por produção/tarefa."}
                    {!cargoConfiancaInciso && "Funcionário sem controle de jornada / sem horas extras."}
                    {" "}Por força legal, o cartão de ponto NÃO é exigido — não há faltas, atrasos, banco de horas, adicional noturno padrão nem inconsistências por dias sem registro.
                  </p>
                  {(cargoConfiancaDesde || cargoConfiancaObs) && (
                    <p className="text-[11px] text-indigo-700 mt-1">
                      {cargoConfiancaDesde && <>Enquadrado em <strong>{fmtDate(String(cargoConfiancaDesde).slice(0,10))}</strong>. </>}
                      {cargoConfiancaObs && <>Observação: <em>{cargoConfiancaObs}</em></>}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── RESUMO ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                // Rev. 1877 — Cargo de confiança (Art. 62 CLT). Os cards mostram
                // "Isento" APENAS se a isenção cobre todo o período (cargoConfiancaIntegralNoPeriodo).
                // Se o enquadramento começou no meio do período, o summary já reflete
                // corretamente faltas/HE/atrasos do trecho anterior — exibimos os
                // números reais e o banner explica a data de enquadramento.
                { icon: Clock,       label: "Dias Trabalhados", value: `${summary.trabalhados}`, sub: cargoConfiancaIntegralNoPeriodo ? "Isento de controle (Art. 62)" : minsToHHMM(summary.totalTrabMins, "0h") + " total", color: cargoConfiancaIntegralNoPeriodo ? "text-indigo-600" : "text-slate-700", border: cargoConfiancaIntegralNoPeriodo ? "border-t-indigo-400" : "border-t-slate-400" },
                { icon: Clock,       label: "Saldo HE",          value: cargoConfiancaIntegralNoPeriodo ? "—" : (summary.saldoHEMins !== 0 ? `${summary.saldoHEMins > 0 ? "+" : "-"}${minsToHHMM(Math.abs(summary.saldoHEMins))}` : "—"), sub: cargoConfiancaIntegralNoPeriodo ? "Sem hora extra (Art. 62)" : (summary.totalHEMins > 0 || summary.totalAtrasoMins > 0 ? `HE ${minsToHHMM(summary.totalHEMins, "0h")} − Atr. ${minsToHHMM(summary.totalAtrasoMins, "0h")}` : "nenhuma ocorrência"), color: cargoConfiancaIntegralNoPeriodo ? "text-indigo-600" : (summary.saldoHEMins > 0 ? "text-blue-600" : summary.saldoHEMins < 0 ? "text-red-600" : "text-slate-400"), border: cargoConfiancaIntegralNoPeriodo ? "border-t-indigo-400" : (summary.saldoHEMins > 0 ? "border-t-blue-400" : summary.saldoHEMins < 0 ? "border-t-red-400" : "border-t-slate-200") },
                { icon: CalendarOff, label: "Faltas",            value: cargoConfiancaIntegralNoPeriodo ? "—" : `${summary.diasFalta}`, sub: cargoConfiancaIntegralNoPeriodo ? "Não se aplica (Art. 62)" : (summary.diasFalta > 0 ? "dias sem registro" : "sem faltas"), color: cargoConfiancaIntegralNoPeriodo ? "text-indigo-600" : (summary.diasFalta > 0 ? "text-red-600" : "text-slate-400"), border: cargoConfiancaIntegralNoPeriodo ? "border-t-indigo-400" : (summary.diasFalta > 0 ? "border-t-red-400" : "border-t-slate-200") },
                { icon: AlertCircle, label: "Atrasos",           value: cargoConfiancaIntegralNoPeriodo ? "—" : (summary.totalAtrasoMins > 0 ? minsToHHMM(summary.totalAtrasoMins) : "—"), sub: cargoConfiancaIntegralNoPeriodo ? "Não se aplica (Art. 62)" : (summary.totalAtrasoMins > 0 ? "total acumulado" : "nenhum no período"), color: cargoConfiancaIntegralNoPeriodo ? "text-indigo-600" : (summary.totalAtrasoMins > 0 ? "text-amber-600" : "text-slate-400"), border: cargoConfiancaIntegralNoPeriodo ? "border-t-indigo-400" : (summary.totalAtrasoMins > 0 ? "border-t-amber-400" : "border-t-slate-200") },
              ].map(({ icon: Icon, label, value, sub, color, border }) => (
                <div key={label} className={`bg-white rounded-xl border border-slate-200 border-t-2 ${border} px-4 py-3`}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
                  <p className={`text-2xl font-black leading-none ${color}`}>{value}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* ── CARTÃO DE PONTO ──────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

              {/* Legenda */}
              <div className="no-print px-5 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap">
                <span className="text-xs font-semibold text-slate-500">Legenda:</span>
                {[
                  ["bg-blue-100 text-blue-700","Hora Extra"],
                  ["bg-red-100 text-red-700","Falta"],
                  ["bg-orange-100 text-orange-700","Incompleto"],
                  ["bg-amber-100 text-amber-700","Atraso"],
                  ["bg-amber-100 text-amber-700","Apontamento"],
                  ["bg-slate-100 text-slate-500","Fim de semana"],
                  ["bg-indigo-100 text-indigo-600","Pendente"],
                ].map(([cls, lbl]) => (
                  <span key={lbl} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
                ))}
                <span className="ml-auto no-print text-[11px] text-slate-400 flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Clique nos horários ou no lápis para editar
                </span>
              </div>

              {/* Table header */}
              <div className="grid border-b-2 border-slate-300 bg-slate-100 text-xs font-bold uppercase tracking-widest text-slate-500"
                style={{ gridTemplateColumns: gridCols }}>
                <div className="px-4 py-3">Data</div>
                <div className="px-2 py-3 text-center">Ent. 1</div>
                <div className="px-2 py-3 text-center">Saí. 1</div>
                <div className="px-2 py-3 text-center">Ent. 2</div>
                <div className="px-2 py-3 text-center">Saí. 2</div>
                {hasThirdShift && <div className="px-2 py-3 text-center">Ent. 3 / Saí. 3</div>}
                <div className="px-2 py-3 text-center">Total</div>
                <div className="px-2 py-3 text-center">H. Extra</div>
                <div className="px-2 py-3">Obra</div>
                <div className="px-2 py-3 text-center">Ocorrência</div>
                <div className="px-2 py-3 no-print" />
              </div>

              {/* Rows */}
              {allDays.map((dateStr) => {
                const { name, num, monthNum, isSun, isSat } = dayInfo(dateStr);
                const rec = recordMap[dateStr] || null;
                const s = getDayStatus(dateStr, rec, feriasDatesSet, dataDesligamento, empStatus, feriadosSet, cargoConfiancaAtivoEm(dateStr), atestadoDatesSet, atestadoHorasDatesSet);
                const cfg = STATUS_STYLE[s];
                // Dia em férias só bloqueia edição quando NÃO há registro. Se existe
                // batida (ainda que ímpar), permitimos editar para corrigir/excluir —
                // isso acontece quando a catraca registrou algo por engano e precisa
                // ser limpo mesmo estando em férias.
                const isFerias = s === "ferias";
                const hasRec = !!rec;
                const blockEdit = isFerias && !hasRec;
                const isWeekend = isSun || isSat;
                const heM = rec ? parseHHMM(rec.horasExtras) : 0;
                // Rev. 5045 — inclui déficit de jornada (falta parcial/saída antecipada)
                const atrasM = rec ? (parseHHMM(rec.atrasos) || Number(rec.deficitMins || 0)) : 0;

                // Rev. 1877 — Cargo de Confiança (Art. 62 CLT) sem batida: linha
                // compacta com a mensagem legal cobrindo as colunas de batida,
                // em vez de mostrar travessões que parecem falta. Mantém edição
                // disponível (pode haver lançamento manual eventual).
                if (s === "cargo_confianca" && !rec) return (
                  <div key={dateStr}
                    className={`group grid border-b border-slate-200 hover:brightness-97 transition-all ${cfg.row} cursor-pointer`}
                    style={{ gridTemplateColumns: gridCols }}
                    onClick={() => openEdit(dateStr, rec)}
                    title="CLT Art. 62 — sem obrigação de marcar ponto. Clique para lançar manualmente se necessário."
                  >
                    <div className="px-4 py-2 flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wide ${isWeekend ? "text-slate-300" : "text-slate-400"}`}>{name}</span>
                      <span className={`text-base font-bold ml-1.5 ${isWeekend ? "text-slate-300" : "text-slate-800"}`}>{String(num).padStart(2,"0")}/{monthNum}</span>
                    </div>
                    <div className="px-2 py-2 flex items-center justify-center text-xs italic text-indigo-700"
                         style={{ gridColumn: hasThirdShift ? "span 8" : "span 7" }}>
                      Isento de controle de jornada — CLT Art. 62{cargoConfiancaInciso ? `, ${cargoConfiancaInciso}` : ""}
                    </div>
                    <div className="px-2 py-2 flex items-center justify-center">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                    <div className="px-1 py-2 flex items-center justify-center no-print">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(dateStr, rec); }} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-colors" title="Lançar manualmente">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );

                // Very compact weekend (sunday with no record)
                if (isSun && !rec) return (
                  <div key={dateStr}
                    className={`grid border-b border-slate-100 ${cfg.row}`}
                    style={{ gridTemplateColumns: gridCols }}>
                    <div className="px-4 py-2 flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-medium">{name}</span>
                      <span className="text-base font-bold text-slate-200">{String(num).padStart(2,"0")}/{monthNum}</span>
                    </div>
                    {Array(hasThirdShift ? 9 : 8).fill(null).map((_,i) => (
                      <div key={i} className="px-2 py-2 text-center">
                        <span className="text-slate-200 text-base">—</span>
                      </div>
                    ))}
                    <div className="px-2 py-2 no-print" />
                  </div>
                );

                return (
                  <div key={dateStr}
                    className={`group grid border-b border-slate-200 hover:brightness-97 transition-all ${cfg.row}`}
                    style={{ gridTemplateColumns: gridCols }}>

                    {/* Data */}
                    <div className="px-4 py-3 flex items-center gap-1.5">
                      <div>
                        <span className={`text-xs font-bold uppercase tracking-wide ${isWeekend ? "text-slate-300" : "text-slate-400"}`}>{name}</span>
                        <span className={`text-base font-bold ml-1.5 ${isWeekend ? "text-slate-300" : "text-slate-800"}`}>{String(num).padStart(2,"0")}/{monthNum}</span>
                      </div>
                    </div>

                    {/* Entrada 1 — clicável (bloqueado em férias sem registro) */}
                    <div className={`px-2 py-3 text-center no-print rounded transition-colors ${blockEdit ? "cursor-default" : "cursor-pointer hover:bg-blue-50/60"}`} onClick={() => !blockEdit && openEdit(dateStr, rec)}>{isFerias && !hasRec ? <span className="text-teal-300 text-xs">—</span> : T(rec?.entrada1)}</div>
                    {/* Saída 1 — clicável */}
                    <div className={`px-2 py-3 text-center no-print rounded transition-colors ${blockEdit ? "cursor-default" : "cursor-pointer hover:bg-blue-50/60"}`} onClick={() => !blockEdit && openEdit(dateStr, rec)}>{isFerias && !hasRec ? <span className="text-teal-300 text-xs">—</span> : T(rec?.saida1)}</div>
                    {/* Entrada 2 — clicável */}
                    <div className={`px-2 py-3 text-center no-print rounded transition-colors ${blockEdit ? "cursor-default" : "cursor-pointer hover:bg-blue-50/60"}`} onClick={() => !blockEdit && openEdit(dateStr, rec)}>{isFerias && !hasRec ? <span className="text-teal-300 text-xs">—</span> : T(rec?.entrada2)}</div>
                    {/* Saída 2 — clicável */}
                    <div className={`px-2 py-3 text-center no-print rounded transition-colors ${blockEdit ? "cursor-default" : "cursor-pointer hover:bg-blue-50/60"}`} onClick={() => !blockEdit && openEdit(dateStr, rec)}>{isFerias && !hasRec ? <span className="text-teal-300 text-xs">—</span> : T(rec?.saida2)}</div>
                    {/* Turno 3 — só mostra se algum dia do período tem 3º turno */}
                    {hasThirdShift && (
                      <div className={`px-2 py-3 text-center no-print rounded transition-colors ${blockEdit ? "cursor-default" : "cursor-pointer hover:bg-blue-50/60"}`} onClick={() => !blockEdit && openEdit(dateStr, rec)}>
                        {rec?.entrada3 || rec?.saida3
                          ? <span className="font-mono text-sm text-slate-600">{rec?.entrada3 || "—"} / {rec?.saida3 || "—"}</span>
                          : <span className="text-slate-200 text-base">—</span>}
                      </div>
                    )}

                    {/* Total */}
                    <div className="px-2 py-3 text-center">
                      {isFerias
                        ? <span className="text-teal-300 text-xs">—</span>
                        : rec?.horasTrabalhadas && rec.horasTrabalhadas !== "0:00" && rec.horasTrabalhadas !== ""
                          ? <span className="font-mono text-base font-bold text-slate-700">{rec.horasTrabalhadas}</span>
                          : <span className="text-slate-300 text-base">—</span>}
                    </div>

                    {/* HE */}
                    <div className="px-2 py-3 text-center">
                      {isFerias
                        ? <span className="text-teal-300 text-xs">—</span>
                        : heM > 0
                          ? <span className="font-mono text-base font-bold text-blue-600">+{minsToHHMM(heM)}</span>
                          : atrasM > 0
                            ? <span className="font-mono text-sm text-amber-600">-{minsToHHMM(atrasM)}</span>
                            : <span className="text-slate-200 text-base">—</span>}
                    </div>

                    {/* Obra + Fonte (oculto em férias) */}
                    <div className="px-2 py-3 flex flex-col justify-center gap-0.5 min-w-0">
                      {isFerias
                        ? <span className="text-teal-300 text-xs">—</span>
                        : <>
                          {rec?.obraNome
                            ? <span className="text-xs text-slate-600 truncate leading-tight" title={rec.obraNome}>{rec.obraNome}</span>
                            : <span className="text-slate-200 text-sm">—</span>}
                          {rec && (
                            <div className="flex gap-1 flex-wrap">
                              {rec.fonte === 'dixi+apontamento' ? (
                                <>
                                  <span className="text-[10px] font-semibold px-1.5 py-px rounded w-fit leading-tight bg-slate-100 text-slate-400">Dixi</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-px rounded w-fit leading-tight bg-amber-100 text-amber-700">Apontamento</span>
                                </>
                              ) : (
                                <span className={`text-[10px] font-semibold px-1.5 py-px rounded w-fit leading-tight ${
                                  rec.fonte === 'manual' || rec.ajusteManual
                                    ? 'bg-amber-100 text-amber-700'
                                    : rec.fonte === 'apontamento'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {rec.fonte === 'apontamento' ? 'Apontamento' : rec.ajusteManual ? 'Manual' : rec.fonte === 'dixi' ? 'Dixi' : rec.fonte || 'manual'}
                                </span>
                              )}
                            </div>
                          )}
                        </>}
                    </div>

                    {/* Ocorrência */}
                    <div className="px-2 py-3 flex items-center justify-center">
                      {cfg.badge
                        ? <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                        : <span className="text-xs text-slate-300">{isWeekend ? cfg.label : ""}</span>}
                    </div>

                    {/* Editar — oculto na impressão, bloqueado em férias sem registro */}
                    <div className="px-1 py-3 flex items-center justify-center no-print">
                      <button
                        onClick={() => !blockEdit && openEdit(dateStr, rec)}
                        disabled={blockEdit}
                        className={`p-1.5 rounded-md transition-colors ${blockEdit ? "cursor-not-allowed opacity-30 text-teal-400" : "hover:bg-blue-50 text-slate-300 hover:text-blue-600"}`}
                        title={blockEdit ? "Funcionário em férias — edição bloqueada" : (isFerias && hasRec ? "Corrigir batida registrada durante férias" : "Editar horários deste dia")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* TOTAIS */}
              <div className="grid bg-slate-50 border-t-2 border-slate-200 font-semibold"
                style={{ gridTemplateColumns: gridCols }}>
                <div className={`px-4 py-3 flex items-center ${hasThirdShift ? "col-span-6" : "col-span-5"}`}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total do Período</span>
                </div>
                <div className="px-2 py-3 text-center">
                  <span className="font-mono text-sm font-black text-slate-700">{minsToHHMM(summary.totalTrabMins, "0h00")}</span>
                </div>
                <div className="px-2 py-3 text-center">
                  <span className={`font-mono text-sm font-black ${summary.saldoHEMins > 0 ? "text-blue-600" : summary.saldoHEMins < 0 ? "text-red-600" : "text-slate-300"}`}>
                    {summary.saldoHEMins !== 0 ? `${summary.saldoHEMins > 0 ? "+" : "-"}${minsToHHMM(Math.abs(summary.saldoHEMins))}` : "—"}
                  </span>
                </div>
                <div className="px-2 py-3 col-span-3 flex items-center gap-1 flex-wrap">
                  {summary.totalHEMins > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">HE +{minsToHHMM(summary.totalHEMins)}</span>}
                  {summary.totalAtrasoMins > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Atr. -{minsToHHMM(summary.totalAtrasoMins)}</span>}
                  {summary.diasFalta > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{summary.diasFalta} falta(s)</span>}
                  {summary.totalHEMins === 0 && summary.totalAtrasoMins === 0 && summary.diasFalta === 0 && <span className="text-[10px] text-slate-400">Sem ocorrências</span>}
                </div>
              </div>

              {/* RESUMO HE por tipo de dia */}
              {summary.totalHEMins > 0 && (() => {
                const pUtil = parseFloat(empData?.heNormal50 || "50");
                const pDom  = parseFloat(empData?.he100 || "100");
                let heUtil = 0, heSab = 0, heDom = 0;
                for (const d of allDays) {
                  const r = recordMap[d];
                  if (!r) continue;
                  const he = parseHHMM(r.horasExtras);
                  if (he <= 0) continue;
                  const dow = new Date(d + "T12:00:00Z").getUTCDay();
                  if (dow === 0) heDom += he;
                  else if (dow === 6) heSab += he;
                  else heUtil += he;
                }
                const parts: string[] = [];
                if (heUtil > 0) parts.push(`${minsToHHMM(heUtil)} a ${pUtil}% (dias úteis)`);
                if (heSab  > 0) parts.push(`${minsToHHMM(heSab)} a ${pUtil}% (sábados)`);
                if (heDom  > 0) parts.push(`${minsToHHMM(heDom)} a ${pDom}% (domingos)`);
                if (parts.length === 0) return null;
                return (
                  <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">HE</span>
                    <span className="text-xs text-blue-700 font-medium">= {parts.join(" + ")}</span>
                  </div>
                );
              })()}
            </div>

            {/* ── ASSINATURAS ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-10 mt-6 pt-4">
              {["Assinatura da Diretoria","Assinatura da Chefia Imediata","Assinatura do Funcionário"].map(l => (
                <div key={l} className="text-center">
                  <div className="border-b border-slate-300 mb-2 pb-10" />
                  <p className="text-xs text-slate-400">{l}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ============================================================ */}
      {/* Rev. 2204 — IMPRESSÃO LIMPA do Espelho de Ponto.             */}
      {/* ------------------------------------------------------------ */}
      {/* Substitui a impressão "da tela viva" (que gerava 5 páginas,  */}
      {/* a primeira em branco, pq o grid display:grid + cards/banner  */}
      {/* empurram a tabela pra fora). Renderiza um bloco .print-only  */}
      {/* (CSS em index.css L364-370 esconde todo o resto via :has()), */}
      {/* com tabela HTML real, header e rodapé self-contained.        */}
      {/* ============================================================ */}
      {hasData && queryParams && (() => {
        const empresaNome = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "";
        const empresaCnpj = selectedCompany?.cnpj || "";
        const logoUrl = selectedCompany?.logoUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/logo-fc.jpg`;
        const userLabel = user?.name || user?.username || "—";
        const stamp = nowBrasilia();
        // breakdown HE
        const pUtil = parseFloat(empData?.heNormal50 || "50");
        const pDom = parseFloat(empData?.he100 || "100");
        let heUtil = 0, heSab = 0, heDom = 0;
        for (const d of allDays) {
          const r = recordMap[d]; if (!r) continue;
          const he = parseHHMM(r.horasExtras); if (he <= 0) continue;
          const dow = new Date(d + "T12:00:00Z").getUTCDay();
          if (dow === 0) heDom += he; else if (dow === 6) heSab += he; else heUtil += he;
        }
        return (
          <div className="print-only hidden print:block" style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1a1a1a", fontSize: "10px" }}>
            {/* Cabeçalho institucional FC */}
            <div style={{ borderBottom: "2px solid #1B2A4A", paddingBottom: "8px", marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <img src={logoUrl} alt="Logo" style={{ height: "40px", objectFit: "contain" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B2A4A", textTransform: "uppercase" }}>{empresaNome}</div>
                  {empresaCnpj && <div style={{ fontSize: "9px", color: "#666" }}>CNPJ: {empresaCnpj}</div>}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: "9px", color: "#666", lineHeight: 1.5 }}>
                <div><strong style={{ color: "#1B2A4A" }}>Gerado por:</strong> {userLabel}</div>
                <div>{stamp}</div>
              </div>
            </div>

            {/* Faixa título */}
            <div style={{ background: "#1B2A4A", color: "white", padding: "8px 12px", textAlign: "center", letterSpacing: "3px", fontWeight: 700, fontSize: "12px", marginBottom: "10px", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
              ESPELHO DE PONTO
            </div>

            {/* Cartão funcionário */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "10px" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "6px 8px", width: "50%" }}>
                    <div><strong>Funcionário:</strong> {empData.nomeCompleto}</div>
                    {empData.funcao && <div><strong>Função:</strong> {empData.funcao}</div>}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "6px 8px", width: "25%" }}>
                    {empData.codigoInterno && <div><strong>Matrícula:</strong> {empData.codigoInterno}</div>}
                    {empData.cpf && <div><strong>CPF:</strong> {empData.cpf}</div>}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "6px 8px", width: "25%" }}>
                    <div><strong>Período:</strong></div>
                    <div>{fmtDate(queryParams.dataInicio)} a {fmtDate(queryParams.dataFim)}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Banner CLT 62 se aplicável */}
            {isCargoConfianca && (
              <div style={{ border: "1px solid #c7d2fe", background: "#eef2ff", padding: "6px 10px", fontSize: "9.5px", color: "#3730a3", marginBottom: "8px", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                <strong>Isento de controle de jornada — CLT Art. 62{cargoConfiancaInciso ? `, inciso ${cargoConfiancaInciso}` : ""}.</strong>
                {cargoConfiancaDesde && <> Enquadrado em {fmtDate(String(cargoConfiancaDesde).slice(0, 10))}.</>}
              </div>
            )}

            {/* KPIs resumo */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "9.5px" }}>
              <tbody>
                <tr>
                  {[
                    { lbl: "Dias Trab.", val: cargoConfiancaIntegralNoPeriodo ? "Isento" : String(summary.trabalhados), sub: cargoConfiancaIntegralNoPeriodo ? "" : minsToHHMM(summary.totalTrabMins, "0h") },
                    { lbl: "Saldo HE", val: cargoConfiancaIntegralNoPeriodo ? "—" : (summary.saldoHEMins !== 0 ? `${summary.saldoHEMins > 0 ? "+" : "-"}${minsToHHMM(Math.abs(summary.saldoHEMins))}` : "—"), sub: "" },
                    { lbl: "Faltas", val: cargoConfiancaIntegralNoPeriodo ? "—" : String(summary.diasFalta), sub: "" },
                    { lbl: "Atrasos", val: cargoConfiancaIntegralNoPeriodo ? "—" : minsToHHMM(summary.totalAtrasoMins, "—"), sub: "" },
                  ].map((k) => (
                    <td key={k.lbl} style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "center", width: "25%" }}>
                      <div style={{ fontSize: "8px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>{k.lbl}</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#1B2A4A", marginTop: "1px" }}>{k.val}</div>
                      {k.sub && <div style={{ fontSize: "8px", color: "#999" }}>{k.sub}</div>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* Tabela principal */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
              <thead style={{ display: "table-header-group" }}>
                <tr style={{ background: "#1B2A4A", color: "white", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", textAlign: "left", width: "12%" }}>Dia</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "8%" }}>Ent. 1</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "8%" }}>Saí. 1</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "8%" }}>Ent. 2</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "8%" }}>Saí. 2</th>
                  {hasThirdShift && <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "10%" }}>Ent.3 / Saí.3</th>}
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "8%" }}>Total</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "9%" }}>HE / Atr.</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", textAlign: "left" }}>Obra</th>
                  <th style={{ border: "1px solid #1B2A4A", padding: "5px 4px", width: "13%" }}>Ocorrência</th>
                </tr>
              </thead>
              <tbody>
                {allDays.map((dateStr) => {
                  const { name, num, monthNum, isSun, isSat } = dayInfo(dateStr);
                  const rec = recordMap[dateStr] || null;
                  const s = getDayStatus(dateStr, rec, feriasDatesSet, dataDesligamento, empStatus, feriadosSet, cargoConfiancaAtivoEm(dateStr), atestadoDatesSet, atestadoHorasDatesSet);
                  const cfg = STATUS_STYLE[s];
                  const isWeekend = isSun || isSat;
                  const heM = rec ? parseHHMM(rec.horasExtras) : 0;
                  const atrasM = rec ? (parseHHMM(rec.atrasos) || Number(rec.deficitMins || 0)) : 0;
                  const rowBg = isWeekend ? "#f8fafc" : (s === "falta" ? "#fef2f2" : s === "ferias" ? "#ecfeff" : s === "feriado" ? "#fefce8" : "white");
                  const cellBase: React.CSSProperties = { border: "1px solid #ddd", padding: "3px 4px", textAlign: "center", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
                  if (s === "cargo_confianca" && !rec) {
                    return (
                      <tr key={dateStr} style={{ background: "#eef2ff", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                        <td style={{ ...cellBase, textAlign: "left" }}><strong>{name}</strong> {String(num).padStart(2, "0")}/{monthNum}</td>
                        <td colSpan={hasThirdShift ? 8 : 7} style={{ ...cellBase, fontStyle: "italic", color: "#3730a3" }}>Isento — CLT Art. 62{cargoConfiancaInciso ? `, ${cargoConfiancaInciso}` : ""}</td>
                        <td style={{ ...cellBase, color: "#3730a3" }}>{cfg.label}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={dateStr} style={{ background: rowBg, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                      <td style={{ ...cellBase, textAlign: "left", color: isWeekend ? "#94a3b8" : "#1a1a1a" }}>
                        <strong>{name}</strong> {String(num).padStart(2, "0")}/{monthNum}
                      </td>
                      <td style={cellBase}>{rec?.entrada1 || "—"}</td>
                      <td style={cellBase}>{rec?.saida1 || "—"}</td>
                      <td style={cellBase}>{rec?.entrada2 || "—"}</td>
                      <td style={cellBase}>{rec?.saida2 || "—"}</td>
                      {hasThirdShift && <td style={cellBase}>{(rec?.entrada3 || rec?.saida3) ? `${rec?.entrada3 || "—"} / ${rec?.saida3 || "—"}` : "—"}</td>}
                      <td style={{ ...cellBase, fontWeight: 700 }}>{rec?.horasTrabalhadas && rec.horasTrabalhadas !== "0:00" ? rec.horasTrabalhadas : "—"}</td>
                      <td style={{ ...cellBase, color: heM > 0 ? "#1d4ed8" : atrasM > 0 ? "#b45309" : "#999", fontWeight: 600 }}>
                        {heM > 0 ? `+${minsToHHMM(heM)}` : atrasM > 0 ? `-${minsToHHMM(atrasM)}` : "—"}
                      </td>
                      <td style={{ ...cellBase, textAlign: "left", fontSize: "8.5px" }}>{rec?.obraNome || "—"}</td>
                      <td style={{ ...cellBase, fontSize: "8.5px" }}>{cfg.label || (isWeekend ? (isSun ? "Domingo" : "Sábado") : "")}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ display: "table-row-group" }}>
                <tr style={{ background: "#e2e8f0", fontWeight: 700, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                  <td colSpan={hasThirdShift ? 6 : 5} style={{ border: "1px solid #94a3b8", padding: "5px 8px", textAlign: "right", textTransform: "uppercase", fontSize: "9px", letterSpacing: "1px" }}>Total do Período</td>
                  <td style={{ border: "1px solid #94a3b8", padding: "5px 4px", textAlign: "center" }}>{minsToHHMM(summary.totalTrabMins, "0h00")}</td>
                  <td style={{ border: "1px solid #94a3b8", padding: "5px 4px", textAlign: "center" }}>
                    {summary.saldoHEMins !== 0 ? `${summary.saldoHEMins > 0 ? "+" : "-"}${minsToHHMM(Math.abs(summary.saldoHEMins))}` : "—"}
                  </td>
                  <td colSpan={2} style={{ border: "1px solid #94a3b8", padding: "5px 8px", fontSize: "8.5px", textAlign: "left" }}>
                    {summary.totalHEMins > 0 && <span>HE +{minsToHHMM(summary.totalHEMins)} </span>}
                    {summary.totalAtrasoMins > 0 && <span>· Atr. -{minsToHHMM(summary.totalAtrasoMins)} </span>}
                    {summary.diasFalta > 0 && <span>· {summary.diasFalta} falta(s)</span>}
                    {summary.totalHEMins === 0 && summary.totalAtrasoMins === 0 && summary.diasFalta === 0 && <span>Sem ocorrências</span>}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Breakdown HE */}
            {summary.totalHEMins > 0 && (heUtil + heSab + heDom) > 0 && (
              <div style={{ marginTop: "6px", padding: "5px 8px", background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: "9px", color: "#1e40af", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                <strong>HE:</strong>
                {heUtil > 0 && ` ${minsToHHMM(heUtil)} a ${pUtil}% (dias úteis)`}
                {heSab > 0 && `${heUtil > 0 ? " + " : " "}${minsToHHMM(heSab)} a ${pUtil}% (sábados)`}
                {heDom > 0 && `${(heUtil + heSab) > 0 ? " + " : " "}${minsToHHMM(heDom)} a ${pDom}% (domingos)`}
              </div>
            )}

            {/* Assinaturas */}
            <table style={{ width: "100%", marginTop: "30px", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  {["Assinatura da Diretoria", "Assinatura da Chefia Imediata", "Assinatura do Funcionário"].map((l) => (
                    <td key={l} style={{ width: "33%", padding: "0 12px", textAlign: "center", verticalAlign: "bottom" }}>
                      <div style={{ borderBottom: "1px solid #1a1a1a", height: "40px" }} />
                      <div style={{ fontSize: "9px", color: "#666", marginTop: "3px" }}>{l}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* Footer LGPD */}
            <div style={{ marginTop: "16px", borderTop: "1px solid #ccc", paddingTop: "6px", fontSize: "7.5px", color: "#888", textAlign: "center", lineHeight: 1.5 }}>
              Documento gerado por <strong>{userLabel}</strong> em {stamp} · ERP Gestão Integrada · Contém dados pessoais protegidos pela LGPD (Lei nº 13.709/2018).
            </div>
          </div>
        );
      })()}

      <PrintFooterLGPD />

      {/* ── DIALOG: LIMPAR PONTO ─────────────────────────────── */}
      <Dialog open={showLimpar} onOpenChange={setShowLimpar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Limpar Registros de Ponto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Atenção: Esta ação é irreversível!
              </p>
              <p className="text-xs text-red-600 mt-1">
                Todos os registros de ponto do funcionário selecionado no período informado serão excluídos permanentemente.
              </p>
            </div>

            {selectedEmp && (
              <div className="text-sm text-slate-700">
                <span className="font-medium">Funcionário:</span> {selectedEmp.nomeCompleto}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Data início</label>
                <input type="date" value={limparInicio} onChange={e => setLimparInicio(e.target.value)}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Data fim</label>
                <input type="date" value={limparFim} onChange={e => setLimparFim(e.target.value)}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">
                Digite <span className="font-bold text-red-600">LIMPAR</span> para confirmar
              </label>
              <input type="text" value={limparConfirmText} onChange={e => setLimparConfirmText(e.target.value)}
                placeholder="LIMPAR"
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLimpar(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={limparConfirmText !== "LIMPAR" || !limparInicio || !limparFim || !employeeId || limparMut.isPending}
              onClick={() => {
                if (!employeeId) return;
                limparMut.mutate({ companyId: queryCompanyId, employeeId, dataInicio: limparInicio, dataFim: limparFim });
              }}
            >
              {limparMut.isPending ? "Removendo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
