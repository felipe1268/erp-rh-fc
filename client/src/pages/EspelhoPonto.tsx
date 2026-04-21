import React, { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, RefreshCw, User, ChevronDown, FileText,
  Clock, AlertCircle, CalendarOff, Pencil, Save, X, Info, AlertTriangle, Trash2, Lock, Unlock, ShieldAlert, Calculator,
} from "lucide-react";
import { toast } from "sonner";

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

type DayStatus = "normal" | "he" | "falta" | "ferias" | "incompleto" | "atraso" | "sabado" | "domingo" | "desligado" | "escuro" | "apontamento";

function nextDay(d: string): string {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function getDayStatus(dateStr: string, rec: any | null, feriasDates?: Set<string>, dataDesligamento?: string | null, empStatus?: string | null): DayStatus {
  // Só marca como "desligado" se o status atual do cadastro for Desligado E a data
  // for posterior ao desligamento. Isso evita que uma dataDesligamentoEfetiva
  // residual (de um desligamento cancelado) mascare dias de funcionário Ativo.
  if (empStatus === "Desligado" && dataDesligamento && dateStr >= nextDay(dataDesligamento)) return "desligado";
  const { dow, isSun, isSat } = dayInfo(dateStr);
  if (isSun) return "domingo";
  if (isSat) return "sabado";
  if (feriasDates?.has(dateStr)) return "ferias";
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr > today) return "escuro";
  if (!rec?.horasTrabalhadas || rec.horasTrabalhadas === "0:00" || rec.horasTrabalhadas === "") {
    if ((rec?.fonte === "apontamento" || rec?.fonte === "dixi+apontamento") && rec?.justificativa) return "apontamento";
    return "falta";
  }
  const bat = getBatidas(rec);
  if (bat.length > 0 && bat.length % 2 !== 0) return "incompleto";
  if (parseHHMM(rec.horasExtras) > 0) return "he";
  if (parseHHMM(rec.atrasos) > 0) return "atraso";
  return "normal";
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
    saveMut.mutate({
      companyId,
      employeeId,
      mesReferencia,
      data: dateStr,
      entrada1: form.entrada1 || undefined,
      saida1:   form.saida1   || undefined,
      entrada2: form.entrada2 || undefined,
      saida2:   form.saida2   || undefined,
      entrada3: form.entrada3 || undefined,
      saida3:   form.saida3   || undefined,
      justificativa: form.justificativa || undefined,
      motivoAjuste:  form.motivoAjuste  || undefined,
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

          {/* Turno 1 */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 1</p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada1" disabled={timeLocked || cycleLocked} />
              <TimeInput label="Saída"   field="saida1" disabled={timeLocked || cycleLocked} />
            </div>
          </div>

          {/* Turno 2 */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 2 <span className="font-normal normal-case">(intervalo)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada2" disabled={timeLocked || cycleLocked} />
              <TimeInput label="Saída"   field="saida2" disabled={timeLocked || cycleLocked} />
            </div>
          </div>

          {/* Turno 3 (optional) */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Turno 3 <span className="font-normal normal-case">(opcional)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Entrada" field="entrada3" disabled={timeLocked || cycleLocked} />
              <TimeInput label="Saída"   field="saida3" disabled={timeLocked || cycleLocked} />
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
  const { selectedCompanyId, getCompanyIdsForQuery, isConstrutoras } = useCompany();
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
    const empId = p.get("funcionario"), mes = p.get("mes");
    if (empId && mes) {
      const id = parseInt(empId);
      const [y, m] = mes.split("-").map(Number);
      const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      const inicio = `${py}-${String(pm).padStart(2,"0")}-16`;
      const fim    = `${y}-${String(m).padStart(2,"0")}-15`;
      setDataInicio(inicio); setDataFim(fim); setEmployeeId(id);
      setQueryParams({ employeeId: id, dataInicio: inicio, dataFim: fim });
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
  const hasData = !!queryParams && !espelhoQ.isLoading && !!empData;

  const allDays = useMemo(
    () => queryParams ? generateDays(queryParams.dataInicio, queryParams.dataFim) : [],
    [queryParams]
  );

  const empStatus: string | null = empData?.status ?? null;
  const dataDesligamento: string | null =
    empStatus === "Desligado" ? (empData?.dataDesligamentoEfetiva ?? null) : null;

  const summary = useMemo(() => {
    let trabalhados = 0, diasFalta = 0, diasFerias = 0, totalHEMins = 0, totalAtrasoMins = 0, totalTrabMins = 0;
    for (const d of allDays) {
      if (dataDesligamento && d >= nextDay(dataDesligamento)) continue;
      const { dow } = dayInfo(d);
      const isWeekendDay = dow === 0 || dow === 6;
      const r = recordMap[d];
      const isFerias = feriasDatesSet.has(d);
      if (r && !isFerias) { totalHEMins += parseHHMM(r.horasExtras); totalAtrasoMins += parseHHMM(r.atrasos); }
      if (isWeekendDay) continue;
      if (isFerias) { diasFerias++; continue; }
      const today = new Date().toISOString().slice(0, 10);
      if (d > today) continue;
      if (!r?.horasTrabalhadas || r.horasTrabalhadas === "0:00" || r.horasTrabalhadas === "") {
        if ((r?.fonte === "apontamento" || r?.fonte === "dixi+apontamento") && r?.justificativa) { trabalhados++; }
        else diasFalta++;
      }
      else { trabalhados++; totalTrabMins += parseHHMM(r.horasTrabalhadas); }
    }
    const saldoHEMins = totalHEMins - totalAtrasoMins;
    return { trabalhados, diasFalta, diasFerias, totalHEMins, totalAtrasoMins, totalTrabMins, saldoHEMins };
  }, [allDays, recordMap, feriasDatesSet, dataDesligamento]);

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

          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-slate-400">Atalhos:</span>
            {([["Período 16→15","periodo"],["Mês atual","mes"],["Últimos 30 dias","30d"]] as const).map(([l,t]) => (
              <button key={t} onClick={() => setQuickPeriod(t as any)}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── EMPTY STATE ──────────────────────────────────────────── */}
        {!queryParams && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Selecione um funcionário e o período</p>
          </div>
        )}

        {queryParams && espelhoQ.isLoading && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin mb-2" />
            <p className="text-sm">Carregando registros…</p>
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

            {/* ── RESUMO ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Clock,       label: "Dias Trabalhados", value: `${summary.trabalhados}`, sub: minsToHHMM(summary.totalTrabMins, "0h") + " total", color: "text-slate-700", border: "border-t-slate-400" },
                { icon: Clock,       label: "Saldo HE",          value: summary.saldoHEMins !== 0 ? `${summary.saldoHEMins > 0 ? "+" : "-"}${minsToHHMM(Math.abs(summary.saldoHEMins))}` : "—", sub: summary.totalHEMins > 0 || summary.totalAtrasoMins > 0 ? `HE ${minsToHHMM(summary.totalHEMins, "0h")} − Atr. ${minsToHHMM(summary.totalAtrasoMins, "0h")}` : "nenhuma ocorrência", color: summary.saldoHEMins > 0 ? "text-blue-600" : summary.saldoHEMins < 0 ? "text-red-600" : "text-slate-400", border: summary.saldoHEMins > 0 ? "border-t-blue-400" : summary.saldoHEMins < 0 ? "border-t-red-400" : "border-t-slate-200" },
                { icon: CalendarOff, label: "Faltas",            value: `${summary.diasFalta}`, sub: summary.diasFalta > 0 ? "dias sem registro" : "sem faltas", color: summary.diasFalta > 0 ? "text-red-600" : "text-slate-400", border: summary.diasFalta > 0 ? "border-t-red-400" : "border-t-slate-200" },
                { icon: AlertCircle, label: "Atrasos",           value: summary.totalAtrasoMins > 0 ? minsToHHMM(summary.totalAtrasoMins) : "—", sub: summary.totalAtrasoMins > 0 ? "total acumulado" : "nenhum no período", color: summary.totalAtrasoMins > 0 ? "text-amber-600" : "text-slate-400", border: summary.totalAtrasoMins > 0 ? "border-t-amber-400" : "border-t-slate-200" },
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
                const s = getDayStatus(dateStr, rec, feriasDatesSet, dataDesligamento, empStatus);
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
                const atrasM = rec ? parseHHMM(rec.atrasos) : 0;

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
