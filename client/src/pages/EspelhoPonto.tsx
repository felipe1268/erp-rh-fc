import { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  Search, RefreshCw, User, ChevronDown,
  TrendingUp, AlertTriangle, CheckCircle2, Timer,
  Printer, FileText
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHHMM(str: string | null | undefined): number {
  if (!str || str === "0:00" || str === "") return 0;
  const p = str.split(":").map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

function formatMins(mins: number, fallback = "0h00"): string {
  if (mins <= 0) return fallback;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

function defaultPeriodo() {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    inicio: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-16`,
    fim: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`,
  };
}

function generateDays(a: string, b: string): string[] {
  const days: string[] = [];
  const end = new Date(b + "T12:00:00Z");
  const cur = new Date(a + "T12:00:00Z");
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const PT_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function dayInfo(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  return {
    dow,
    dayName: PT_DAYS[dow],
    dayNum: d.getUTCDate(),
    monthName: PT_MONTHS[d.getUTCMonth()],
    isWeekend: dow === 0 || dow === 6,
    isSunday: dow === 0,
  };
}

function getBatidas(r: any): string[] {
  return [r.entrada1, r.saida1, r.entrada2, r.saida2, r.entrada3, r.saida3].filter(Boolean);
}

type DayStatus = "normal" | "he" | "falta" | "incompleto" | "atraso" | "sabado" | "domingo";

function getDayStatus(dateStr: string, record: any | null): DayStatus {
  const { dow, isSunday, isWeekend } = dayInfo(dateStr);
  if (isSunday) return "domingo";
  if (dow === 6) return "sabado";
  if (!record || !record.horasTrabalhadas || record.horasTrabalhadas === "0:00" || record.horasTrabalhadas === "") return "falta";
  const batidas = getBatidas(record);
  if (batidas.length > 0 && batidas.length % 2 !== 0) return "incompleto";
  if (parseHHMM(record.horasExtras) > 0) return "he";
  if (parseHHMM(record.atrasos) > 0) return "atraso";
  return "normal";
}

const STATUS_CONFIG: Record<DayStatus, { bar: string; bg: string; badge: string; label: string; dot: string }> = {
  normal:     { bar: "bg-emerald-500",  bg: "bg-emerald-50/30",   badge: "bg-emerald-100 text-emerald-800",  label: "Normal",      dot: "bg-emerald-400" },
  he:         { bar: "bg-violet-500",   bg: "bg-violet-50/40",    badge: "bg-violet-100 text-violet-800",    label: "HE",          dot: "bg-violet-400" },
  falta:      { bar: "bg-rose-500",     bg: "bg-rose-50/40",      badge: "bg-rose-100 text-rose-800 font-semibold", label: "Falta", dot: "bg-rose-400" },
  incompleto: { bar: "bg-orange-400",   bg: "bg-orange-50/40",    badge: "bg-orange-100 text-orange-800",    label: "Incompleto",  dot: "bg-orange-400" },
  atraso:     { bar: "bg-amber-400",    bg: "bg-amber-50/30",     badge: "bg-amber-100 text-amber-800",      label: "Atraso",      dot: "bg-amber-400" },
  sabado:     { bar: "bg-slate-300",    bg: "bg-slate-50/50",     badge: "bg-slate-100 text-slate-500",      label: "Sábado",      dot: "bg-slate-300" },
  domingo:    { bar: "bg-slate-200",    bg: "bg-slate-50/30",     badge: "bg-slate-100 text-slate-400",      label: "Domingo",     dot: "bg-slate-200" },
};

function getOcorrenciaLabel(dateStr: string, record: any | null): string {
  const status = getDayStatus(dateStr, record);
  if (status === "he") return `+${formatMins(parseHHMM(record?.horasExtras))} HE`;
  if (status === "atraso") return `Atraso ${formatMins(parseHHMM(record?.atrasos))}`;
  if (record?.justificativa && status === "falta") return record.justificativa;
  return STATUS_CONFIG[status].label;
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EspelhoPonto() {
  const { selectedCompanyId, getCompanyIdsForQuery, isConstrutoras } = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== "construtoras")
    ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const def = useMemo(() => defaultPeriodo(), []);
  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim, setDataFim] = useState(def.fim);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [queryParams, setQueryParams] = useState<{ employeeId: number; dataInicio: string; dataFim: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const empId = params.get("funcionario");
    const mes = params.get("mes");
    if (empId && mes) {
      const id = parseInt(empId);
      const [y, m] = mes.split("-").map(Number);
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      const inicio = `${prevY}-${String(prevM).padStart(2, "0")}-16`;
      const fim = `${y}-${String(m).padStart(2, "0")}-15`;
      setDataInicio(inicio); setDataFim(fim); setEmployeeId(id);
      setQueryParams({ employeeId: id, dataInicio: inicio, dataFim: fim });
    }
  }, []);

  const empListQuery = trpc.employees.list.useQuery(
    { companyId, companyIds, excludeTerminated: true },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const empList: any[] = (empListQuery.data as any[]) || [];

  const espelhoQuery = trpc.horasExtras.getEspelhoPontoRange.useQuery(
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

  const selectedEmp = useMemo(
    () => employeeId ? empList.find(e => Number(e.id) === employeeId) : null,
    [empList, employeeId]
  );

  function handleSelectEmp(emp: any) {
    setEmployeeId(Number(emp.id));
    setSearchQuery("");
    setShowDropdown(false);
  }

  function handleBuscar() {
    if (!employeeId || !dataInicio || !dataFim) return;
    setQueryParams({ employeeId, dataInicio, dataFim });
  }

  function setQuickPeriod(tipo: "periodo" | "mes" | "30d") {
    const now = new Date();
    if (tipo === "periodo") {
      const { inicio, fim } = defaultPeriodo();
      setDataInicio(inicio); setDataFim(fim);
    } else if (tipo === "mes") {
      const y = now.getFullYear(), m = now.getMonth() + 1;
      setDataInicio(`${y}-${String(m).padStart(2,"0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2,"0")}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`);
    } else {
      const p = new Date(now); p.setDate(p.getDate() - 30);
      setDataInicio(p.toISOString().slice(0,10));
      setDataFim(now.toISOString().slice(0,10));
    }
  }

  const allDays = useMemo(
    () => queryParams ? generateDays(queryParams.dataInicio, queryParams.dataFim) : [],
    [queryParams]
  );

  const recordMap: Record<string, any> = (espelhoQuery.data?.records as any) || {};
  const empData: any = espelhoQuery.data?.employee;
  const hasData = !!queryParams && !espelhoQuery.isLoading && !!empData;

  const summary = useMemo(() => {
    let trabalhados = 0, diasFalta = 0, totalHEMins = 0, totalAtrasoMins = 0;
    for (const dateStr of allDays) {
      const { dow } = dayInfo(dateStr);
      if (dow === 0 || dow === 6) continue;
      const r = recordMap[dateStr];
      if (!r || !r.horasTrabalhadas || r.horasTrabalhadas === "0:00" || r.horasTrabalhadas === "") diasFalta++;
      else trabalhados++;
      if (r) { totalHEMins += parseHHMM(r.horasExtras); totalAtrasoMins += parseHHMM(r.atrasos); }
    }
    return { trabalhados, diasFalta, totalHEMins, totalAtrasoMins };
  }, [allDays, recordMap]);

  const fmtDate = (d: string) => d.split("-").reverse().join("/");

  return (
    <DashboardLayout>
      <PrintHeader />

      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── FILTER BAR ─────────────────────────────────────────────── */}
        <div className="no-print">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            {/* Title row */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">Espelho de Ponto</h1>
                <p className="text-xs text-slate-400">Visualização individual por período livre</p>
              </div>
            </div>

            {/* Inputs row */}
            <div className="flex flex-wrap items-end gap-3">

              {/* Employee search */}
              <div className="flex-1 min-w-[240px] relative">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Funcionário
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery || (selectedEmp ? selectedEmp.nomeCompleto : "")}
                    onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); if (!e.target.value) setEmployeeId(null); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder={empListQuery.isLoading ? "Carregando…" : "Buscar por nome ou matrícula…"}
                    className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
                </div>

                {showDropdown && filteredEmps.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="max-h-56 overflow-y-auto">
                      {filteredEmps.slice(0, 40).map((e: any) => (
                        <button
                          key={e.id}
                          onMouseDown={() => handleSelectEmp(e)}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-bold">{initials(e.nomeCompleto)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{e.nomeCompleto}</p>
                            <p className="text-xs text-slate-400">
                              {e.funcao}{e.codigoInterno ? ` · Mat. ${e.codigoInterno}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Date range */}
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="py-2.5 px-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="py-2.5 px-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all" />
              </div>

              <Button
                onClick={handleBuscar}
                disabled={!employeeId || espelhoQuery.isLoading}
                className="rounded-xl px-5 py-2.5 bg-slate-900 hover:bg-slate-700 text-white shrink-0 h-auto"
              >
                {espelhoQuery.isLoading
                  ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Buscando…</>
                  : <><Search className="h-4 w-4 mr-2" />Buscar</>}
              </Button>
            </div>

            {/* Quick period pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Atalhos</span>
              {([
                { label: "Período 16→15", tipo: "periodo" as const },
                { label: "Mês atual", tipo: "mes" as const },
                { label: "Últimos 30 dias", tipo: "30d" as const },
              ]).map(({ label, tipo }) => (
                <button key={tipo} onClick={() => setQuickPeriod(tipo)}
                  className="text-xs px-3 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-all">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── EMPTY STATE ──────────────────────────────────────────────── */}
        {!queryParams && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
              <FileText className="h-9 w-9 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400 font-medium">Selecione um funcionário e o período</p>
            <p className="text-xs text-slate-300 mt-1">para visualizar o espelho de ponto</p>
          </div>
        )}

        {/* ── LOADING ──────────────────────────────────────────────────── */}
        {queryParams && espelhoQuery.isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Carregando registros…</p>
          </div>
        )}

        {/* ── RESULTADO ──────────────────────────────────────────────── */}
        {hasData && (
          <>
            {/* ── EMPLOYEE PROFILE CARD ───────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden shadow-sm">
              {/* Dark header */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                      <span className="text-xl font-black text-white">{initials(empData.nomeCompleto)}</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white leading-tight">{empData.nomeCompleto}</h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {empData.funcao && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-medium">
                            {empData.funcao}
                          </span>
                        )}
                        {empData.codigoInterno && (
                          <span className="text-xs text-slate-400">Mat. {empData.codigoInterno}</span>
                        )}
                        {empData.cpf && (
                          <span className="text-xs text-slate-400">CPF {empData.cpf}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Período</p>
                      <p className="text-sm text-white font-semibold mt-0.5">
                        {fmtDate(queryParams!.dataInicio)} → {fmtDate(queryParams!.dataFim)}
                      </p>
                    </div>
                    <div className="no-print">
                      <PrintActions title="Espelho de Ponto" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats strip */}
              <div className="bg-slate-800 border-t border-white/5 grid grid-cols-4 divide-x divide-white/10">
                {[
                  { icon: CheckCircle2, value: `${summary.trabalhados}`, unit: "dias", label: "Trabalhados", color: "text-emerald-400" },
                  { icon: Timer, value: formatMins(summary.totalHEMins), unit: "", label: "Hora Extra", color: "text-violet-400" },
                  { icon: AlertTriangle, value: `${summary.diasFalta}`, unit: summary.diasFalta === 1 ? "dia" : "dias", label: "Faltas", color: summary.diasFalta > 0 ? "text-rose-400" : "text-slate-500" },
                  { icon: TrendingUp, value: formatMins(summary.totalAtrasoMins), unit: "", label: "Atrasos", color: summary.totalAtrasoMins > 0 ? "text-amber-400" : "text-slate-500" },
                ].map(({ icon: Icon, value, unit, label, color }) => (
                  <div key={label} className="px-5 py-3 flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                    <div>
                      <div className={`text-lg font-black leading-none ${color}`}>
                        {value} {unit && <span className="text-xs font-normal text-slate-400">{unit}</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-medium">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── LEGEND ──────────────────────────────────────────────── */}
            <div className="no-print flex items-center gap-4 flex-wrap px-1">
              {(Object.entries(STATUS_CONFIG) as [DayStatus, typeof STATUS_CONFIG[DayStatus]][])
                .filter(([s]) => !["domingo"].includes(s))
                .map(([status, cfg]) => (
                  <span key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                ))}
            </div>

            {/* ── DAILY TIMELINE ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Table header */}
              <div className="grid grid-cols-[5rem_1fr_6rem_8rem] gap-0 border-b-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <div>Dia</div>
                <div>Batidas</div>
                <div className="text-right">Trabalhado</div>
                <div className="text-center">Ocorrência</div>
              </div>

              {/* Rows */}
              {allDays.map((dateStr) => {
                const { dow, dayName, dayNum, monthName, isWeekend, isSunday } = dayInfo(dateStr);
                const record = recordMap[dateStr] || null;
                const status = getDayStatus(dateStr, record);
                const cfg = STATUS_CONFIG[status];
                const batidas = record ? getBatidas(record) : [];
                const ocorrencia = getOcorrenciaLabel(dateStr, record);
                const isCompact = isWeekend && !record;

                if (isCompact && isSunday) return (
                  <div key={dateStr} className="grid grid-cols-[5rem_1fr_6rem_8rem] gap-0 border-b border-slate-50 bg-slate-50/40">
                    <div className="flex items-center gap-2 py-1.5 px-4">
                      <div className={`w-1 self-stretch rounded-full mr-1 ${cfg.bar} opacity-30`} />
                      <span className="text-[10px] text-slate-300 font-medium">{dayName} {dayNum}</span>
                    </div>
                    <div className="py-1.5 px-2 text-[10px] text-slate-300">—</div>
                    <div className="py-1.5 px-2 text-[10px] text-slate-300 text-right">—</div>
                    <div className="py-1.5 px-4">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                  </div>
                );

                return (
                  <div
                    key={dateStr}
                    className={`grid grid-cols-[5rem_1fr_6rem_8rem] gap-0 border-b border-slate-100 transition-colors hover:brightness-95 ${isWeekend ? "bg-slate-50/60" : cfg.bg}`}
                  >
                    {/* Day column */}
                    <div className="flex items-center gap-2 py-3 px-4">
                      <div className={`w-1 self-stretch rounded-full ${cfg.bar}`} />
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase leading-none">{dayName}</p>
                        <p className={`text-lg font-black leading-tight ${isWeekend ? "text-slate-300" : "text-slate-800"}`}>{dayNum}</p>
                        <p className="text-[9px] text-slate-300 leading-none">{monthName}</p>
                      </div>
                    </div>

                    {/* Batidas column */}
                    <div className="flex items-center py-3 px-2 flex-wrap gap-1">
                      {batidas.length > 0 ? (
                        batidas.map((b, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            <span className={`font-mono text-xs font-semibold px-2 py-1 rounded-lg ${
                              i % 2 === 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}>{b}</span>
                            {i < batidas.length - 1 && (
                              <span className="text-slate-300 text-[10px] mx-0.5">
                                {i % 2 === 0 ? "→" : "•"}
                              </span>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-300 italic">sem registro</span>
                      )}
                    </div>

                    {/* Hours worked */}
                    <div className="flex items-center justify-end py-3 px-3">
                      {record?.horasTrabalhadas && record.horasTrabalhadas !== "0:00" && record.horasTrabalhadas !== ""
                        ? <span className="font-mono text-sm font-bold text-slate-700">{record.horasTrabalhadas}</span>
                        : <span className="text-sm text-slate-300">—</span>
                      }
                    </div>

                    {/* Ocorrência */}
                    <div className="flex items-center justify-center py-3 px-3">
                      {status !== "normal" && (
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                          {ocorrencia}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Totals footer */}
              <div className="bg-slate-900 px-4 py-4 grid grid-cols-[5rem_1fr_6rem_8rem] gap-0">
                <div className="col-span-2 flex items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo do Período</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="font-mono text-sm font-black text-white">{summary.trabalhados}d</span>
                </div>
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  {summary.totalHEMins > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900 text-violet-300">
                      HE {formatMins(summary.totalHEMins)}
                    </span>
                  )}
                  {summary.diasFalta > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-900 text-rose-300">
                      Faltas {summary.diasFalta}d
                    </span>
                  )}
                  {summary.totalAtrasoMins > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900 text-amber-300">
                      Atr. {formatMins(summary.totalAtrasoMins)}
                    </span>
                  )}
                  {summary.totalHEMins === 0 && summary.diasFalta === 0 && summary.totalAtrasoMins === 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold">Sem ocorrências</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── SIGNATURE BLOCK ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-8 mt-8 pt-6">
              {["Assinatura da Diretoria", "Assinatura da Chefia Imediata", "Assinatura do Funcionário"].map(label => (
                <div key={label} className="text-center">
                  <div className="border-b-2 border-slate-300 mb-3 pb-8" />
                  <p className="text-xs text-slate-400 font-medium">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
