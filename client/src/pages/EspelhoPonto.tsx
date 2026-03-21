import { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  Search, RefreshCw, User, ChevronDown, FileText,
  Clock, AlertCircle, CalendarOff, TrendingDown, Info
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHHMM(str: string | null | undefined): number {
  if (!str || str === "0:00" || str === "") return 0;
  const p = str.split(":").map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

function minsToHHMM(m: number): string {
  if (m <= 0) return "0h00";
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function defaultPeriodo() {
  const n = new Date();
  const pm = n.getMonth() === 0 ? 11 : n.getMonth() - 1;
  const py = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
  return {
    inicio: `${py}-${String(pm + 1).padStart(2, "0")}-16`,
    fim: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-15`,
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
  return { dow, name: PT_DAYS[dow], num: dt.getUTCDate(), month: PT_MONTHS[dt.getUTCMonth()], isSun: dow === 0, isSat: dow === 6 };
}

function getBatidas(r: any): string[] {
  return [r.entrada1, r.saida1, r.entrada2, r.saida2, r.entrada3, r.saida3].filter(Boolean);
}

type DayStatus = "normal" | "he" | "falta" | "incompleto" | "atraso" | "sabado" | "domingo";

function status(dateStr: string, rec: any | null): DayStatus {
  const { dow, isSun, isSat } = dayInfo(dateStr);
  if (isSun) return "domingo";
  if (isSat) return "sabado";
  if (!rec?.horasTrabalhadas || rec.horasTrabalhadas === "0:00" || rec.horasTrabalhadas === "") return "falta";
  const bat = getBatidas(rec);
  if (bat.length > 0 && bat.length % 2 !== 0) return "incompleto";
  if (parseHHMM(rec.horasExtras) > 0) return "he";
  if (parseHHMM(rec.atrasos) > 0) return "atraso";
  return "normal";
}

// Muted, low-saturation color system
const CFG: Record<DayStatus, { leftBorder: string; rowBg: string; pill: string; label: string }> = {
  normal:     { leftBorder: "border-l-slate-200",  rowBg: "",                  pill: "",                                          label: "" },
  he:         { leftBorder: "border-l-sky-300",    rowBg: "bg-sky-50/30",      pill: "bg-sky-100 text-sky-700",                   label: "Hora Extra" },
  falta:      { leftBorder: "border-l-red-300",    rowBg: "bg-red-50/30",      pill: "bg-red-100 text-red-700",                   label: "Falta" },
  incompleto: { leftBorder: "border-l-orange-300", rowBg: "bg-orange-50/20",   pill: "bg-orange-100 text-orange-700",             label: "Incompleto" },
  atraso:     { leftBorder: "border-l-amber-300",  rowBg: "bg-amber-50/20",    pill: "bg-amber-100 text-amber-700",               label: "Atraso" },
  sabado:     { leftBorder: "border-l-slate-150",  rowBg: "bg-slate-50/60",    pill: "bg-slate-100 text-slate-400",               label: "Sábado" },
  domingo:    { leftBorder: "border-l-transparent",rowBg: "bg-slate-50/30",    pill: "",                                          label: "Domingo" },
};

function initials(name: string) {
  const p = name.trim().split(" ").filter(Boolean);
  return p.length === 1 ? p[0].slice(0,2).toUpperCase() : (p[0][0]+p[p.length-1][0]).toUpperCase();
}

function fmtDate(d: string) { return d.split("-").reverse().join("/"); }

// ─── Component ────────────────────────────────────────────────────────────────

export default function EspelhoPonto() {
  const { selectedCompanyId, getCompanyIdsForQuery, isConstrutoras } = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== "construtoras") ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const def = useMemo(() => defaultPeriodo(), []);
  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim,    setDataFim]    = useState(def.fim);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [queryParams, setQueryParams] = useState<{ employeeId: number; dataInicio: string; dataFim: string } | null>(null);
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

  const empListQ = trpc.employees.list.useQuery(
    { companyId, companyIds, excludeTerminated: true },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const empList: any[] = (empListQ.data as any[]) || [];

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

  const selectedEmp = useMemo(
    () => employeeId ? empList.find(e => Number(e.id) === employeeId) : null,
    [empList, employeeId]
  );

  const recordMap: Record<string, any> = (espelhoQ.data?.records as any) || {};
  const empData: any = espelhoQ.data?.employee;
  const hasData = !!queryParams && !espelhoQ.isLoading && !!empData;

  const allDays = useMemo(
    () => queryParams ? generateDays(queryParams.dataInicio, queryParams.dataFim) : [],
    [queryParams]
  );

  // Summary with per-day HE list
  const { summary, heDays, totalHorasTrabMins } = useMemo(() => {
    let trabalhados = 0, diasFalta = 0, totalHEMins = 0, totalAtrasoMins = 0, totalHorasTrabMins = 0;
    const heDays: { date: string; mins: number }[] = [];
    for (const dateStr of allDays) {
      const { dow } = dayInfo(dateStr);
      if (dow === 0 || dow === 6) continue;
      const r = recordMap[dateStr];
      if (!r?.horasTrabalhadas || r.horasTrabalhadas === "0:00" || r.horasTrabalhadas === "") diasFalta++;
      else { trabalhados++; totalHorasTrabMins += parseHHMM(r.horasTrabalhadas); }
      if (r) {
        const he = parseHHMM(r.horasExtras);
        totalHEMins += he;
        if (he > 0) heDays.push({ date: dateStr, mins: he });
        totalAtrasoMins += parseHHMM(r.atrasos);
      }
    }
    return {
      summary: { trabalhados, diasFalta, totalHEMins, totalAtrasoMins },
      heDays,
      totalHorasTrabMins,
    };
  }, [allDays, recordMap]);

  function handleSelectEmp(emp: any) { setEmployeeId(Number(emp.id)); setSearchQuery(""); setShowDropdown(false); }
  function handleBuscar() { if (!employeeId || !dataInicio || !dataFim) return; setQueryParams({ employeeId, dataInicio, dataFim }); }

  function setQuickPeriod(tipo: "periodo" | "mes" | "30d") {
    const n = new Date();
    if (tipo === "periodo") { const {inicio,fim} = defaultPeriodo(); setDataInicio(inicio); setDataFim(fim); }
    else if (tipo === "mes") {
      const y = n.getFullYear(), m = n.getMonth()+1;
      setDataInicio(`${y}-${String(m).padStart(2,"0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2,"0")}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`);
    } else {
      const p = new Date(n); p.setDate(p.getDate()-30);
      setDataInicio(p.toISOString().slice(0,10)); setDataFim(n.toISOString().slice(0,10));
    }
  }

  return (
    <DashboardLayout>
      <PrintHeader />

      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── FILTROS ───────────────────────────────────────────────── */}
        <div className="no-print bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Espelho de Ponto Individual</span>
            <span className="text-xs text-slate-400 ml-1">— período livre</span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Employee */}
            <div className="flex-1 min-w-[260px] relative">
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Funcionário</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery || (selectedEmp ? selectedEmp.nomeCompleto : "")}
                  onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); if (!e.target.value) setEmployeeId(null); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder={empListQ.isLoading ? "Carregando…" : "Nome ou matrícula…"}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-all bg-white"
                />
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
              </div>

              {showDropdown && filteredEmps.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredEmps.slice(0, 40).map((e: any) => (
                      <button key={e.id} onMouseDown={() => handleSelectEmp(e)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100/80 last:border-0">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">{initials(e.nomeCompleto)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{e.nomeCompleto}</p>
                          <p className="text-xs text-slate-400">{e.funcao}{e.codigoInterno ? ` · Mat. ${e.codigoInterno}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dates */}
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">De</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all" />
            </div>

            <Button onClick={handleBuscar} disabled={!employeeId || espelhoQ.isLoading}
              className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-5 h-9">
              {espelhoQ.isLoading ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Buscando…</> : <><Search className="h-3.5 w-3.5 mr-1.5" />Buscar</>}
            </Button>
          </div>

          {/* Quick period */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400">Atalhos:</span>
            {([["Período 16→15","periodo"],["Mês atual","mes"],["Últimos 30 dias","30d"]] as const).map(([l,t]) => (
              <button key={t} onClick={() => setQuickPeriod(t as any)}
                className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── EMPTY ─────────────────────────────────────────────────── */}
        {!queryParams && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Selecione um funcionário e o período desejado</p>
            <p className="text-xs text-slate-400 mt-1">O espelho de ponto será exibido aqui</p>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────── */}
        {queryParams && espelhoQ.isLoading && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin mb-2" />
            <p className="text-sm">Carregando registros…</p>
          </div>
        )}

        {hasData && (
          <>
            {/* ── FICHA DO FUNCIONÁRIO ──────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-slate-600">{initials(empData.nomeCompleto)}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{empData.nomeCompleto}</h2>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-slate-500">
                      {empData.funcao && <span>{empData.funcao}</span>}
                      {empData.codigoInterno && <span className="text-slate-400">Mat. <span className="text-slate-600 font-medium">{empData.codigoInterno}</span></span>}
                      {empData.cpf && <span className="text-slate-400">CPF <span className="text-slate-600 font-medium">{empData.cpf}</span></span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Competência</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtDate(queryParams!.dataInicio)} a {fmtDate(queryParams!.dataFim)}</p>
                  </div>
                  <div className="no-print">
                    <PrintActions title="Espelho de Ponto" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── CARDS RESUMO ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  icon: Clock, label: "Horas Trabalhadas",
                  value: minsToHHMM(totalHorasTrabMins),
                  sub: `${summary.trabalhados} dias úteis`,
                  border: "border-t-slate-400",
                },
                {
                  icon: TrendingDown, label: "Hora Extra Total",
                  value: summary.totalHEMins > 0 ? minsToHHMM(summary.totalHEMins) : "—",
                  sub: `${heDays.length} dia(s) com HE`,
                  border: summary.totalHEMins > 0 ? "border-t-sky-400" : "border-t-slate-200",
                },
                {
                  icon: CalendarOff, label: "Faltas",
                  value: `${summary.diasFalta}`,
                  sub: summary.diasFalta === 1 ? "1 dia sem registro" : `${summary.diasFalta} dias sem registro`,
                  border: summary.diasFalta > 0 ? "border-t-red-400" : "border-t-slate-200",
                },
                {
                  icon: AlertCircle, label: "Atrasos",
                  value: summary.totalAtrasoMins > 0 ? minsToHHMM(summary.totalAtrasoMins) : "—",
                  sub: "total acumulado",
                  border: summary.totalAtrasoMins > 0 ? "border-t-amber-400" : "border-t-slate-200",
                },
              ].map(({ icon: Icon, label, value, sub, border }) => (
                <div key={label} className={`bg-white rounded-xl border border-slate-200 border-t-2 ${border} px-4 py-3`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-[11px] font-medium text-slate-500">{label}</span>
                  </div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* ── TABELA DIÁRIA ─────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

              {/* Header */}
              <div className="grid grid-cols-[4.5rem_1fr_5.5rem_5.5rem_7rem] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <div className="px-4 py-2.5">Dia</div>
                <div className="px-3 py-2.5">Batidas</div>
                <div className="px-3 py-2.5 text-right">Trabalhado</div>
                <div className="px-3 py-2.5 text-center">HE</div>
                <div className="px-4 py-2.5 text-center">Ocorrência</div>
              </div>

              {/* Body */}
              {allDays.map((dateStr) => {
                const { name, num, month, isSun, isSat } = dayInfo(dateStr);
                const rec = recordMap[dateStr] || null;
                const s = status(dateStr, rec);
                const cfg = CFG[s];
                const batidas = rec ? getBatidas(rec) : [];
                const heM = rec ? parseHHMM(rec.horasExtras) : 0;
                const atrasM = rec ? parseHHMM(rec.atrasos) : 0;
                const isWeekend = isSun || isSat;

                // Sunday: compact dim row
                if (isSun) return (
                  <div key={dateStr} className="grid grid-cols-[4.5rem_1fr_5.5rem_5.5rem_7rem] border-b border-slate-50 bg-slate-50/40 border-l-2 border-l-transparent">
                    <div className="px-4 py-1.5 flex items-center gap-1.5">
                      <div className="text-center">
                        <div className="text-[9px] text-slate-300 font-semibold uppercase">{name}</div>
                        <div className="text-sm font-bold text-slate-200">{num}</div>
                      </div>
                    </div>
                    <div className="px-3 py-1.5 flex items-center">
                      <span className="text-[11px] text-slate-300">—</span>
                    </div>
                    <div className="px-3 py-1.5 flex items-center justify-end">
                      <span className="text-[11px] text-slate-300">—</span>
                    </div>
                    <div className="px-3 py-1.5 flex items-center justify-center">
                      <span className="text-[11px] text-slate-300">—</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center justify-center">
                      <span className="text-[9px] text-slate-300">Domingo</span>
                    </div>
                  </div>
                );

                return (
                  <div key={dateStr}
                    className={`grid grid-cols-[4.5rem_1fr_5.5rem_5.5rem_7rem] border-b border-slate-100 border-l-2 ${cfg.leftBorder} ${cfg.rowBg} transition-colors`}>

                    {/* Day */}
                    <div className="px-4 py-2.5 flex items-center">
                      <div className="text-center">
                        <div className={`text-[9px] font-bold uppercase tracking-wide ${isWeekend ? "text-slate-300" : "text-slate-400"}`}>{name}</div>
                        <div className={`text-xl font-black leading-tight ${isWeekend ? "text-slate-300" : "text-slate-800"}`}>{num}</div>
                        <div className={`text-[9px] ${isWeekend ? "text-slate-200" : "text-slate-300"}`}>{month}</div>
                      </div>
                    </div>

                    {/* Batidas */}
                    <div className="px-3 py-2.5 flex items-center flex-wrap gap-1">
                      {batidas.length > 0 ? (
                        batidas.map((b, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                              i % 2 === 0
                                ? "bg-slate-100 text-slate-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>{b}</span>
                            {i < batidas.length - 1 && (
                              <span className="text-slate-300 text-[10px] select-none">{i % 2 === 0 ? "→" : "·"}</span>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-300 italic">sem registro</span>
                      )}
                    </div>

                    {/* Horas Trabalhadas */}
                    <div className="px-3 py-2.5 flex items-center justify-end">
                      {rec?.horasTrabalhadas && rec.horasTrabalhadas !== "0:00" && rec.horasTrabalhadas !== ""
                        ? <span className="font-mono text-sm font-semibold text-slate-700">{rec.horasTrabalhadas}</span>
                        : <span className="text-sm text-slate-300">—</span>}
                    </div>

                    {/* HE */}
                    <div className="px-3 py-2.5 flex items-center justify-center">
                      {heM > 0
                        ? <span className="font-mono text-sm font-bold text-sky-600">+{minsToHHMM(heM)}</span>
                        : <span className="text-sm text-slate-200">—</span>}
                    </div>

                    {/* Ocorrência */}
                    <div className="px-4 py-2.5 flex items-center justify-center">
                      {s === "normal" ? null : (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${cfg.pill}`}>
                          {s === "atraso" ? `Atraso ${minsToHHMM(atrasM)}` : cfg.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Footer totais */}
              <div className="grid grid-cols-[4.5rem_1fr_5.5rem_5.5rem_7rem] bg-slate-50 border-t-2 border-slate-200">
                <div className="px-4 py-3 col-span-2 flex items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total do período</span>
                </div>
                <div className="px-3 py-3 flex items-center justify-end">
                  <span className="font-mono text-sm font-bold text-slate-700">{minsToHHMM(totalHorasTrabMins)}</span>
                </div>
                <div className="px-3 py-3 flex items-center justify-center">
                  <span className={`font-mono text-sm font-bold ${summary.totalHEMins > 0 ? "text-sky-600" : "text-slate-300"}`}>
                    {summary.totalHEMins > 0 ? `+${minsToHHMM(summary.totalHEMins)}` : "—"}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-center flex-col gap-0.5">
                  {summary.diasFalta > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-red-100 text-red-700">{summary.diasFalta} falta(s)</span>}
                  {summary.totalAtrasoMins > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700">Atr. {minsToHHMM(summary.totalAtrasoMins)}</span>}
                  {summary.diasFalta === 0 && summary.totalAtrasoMins === 0 && <span className="text-[10px] text-slate-400">—</span>}
                </div>
              </div>
            </div>

            {/* ── DEMONSTRATIVO HE ─────────────────────────────────── */}
            {heDays.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Info className="h-4 w-4 text-sky-500" />
                  <span className="text-sm font-semibold text-slate-700">Demonstrativo de Hora Extra</span>
                  <span className="ml-auto text-xs text-slate-400">{heDays.length} dia(s) com HE no período</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {heDays.map(({ date, mins }) => {
                    const rec = recordMap[date];
                    const { name, num, month } = dayInfo(date);
                    const batidas = rec ? getBatidas(rec) : [];
                    const trabM = parseHHMM(rec?.horasTrabalhadas);
                    const normM = Math.max(0, trabM - mins);
                    return (
                      <div key={date} className="grid grid-cols-[7rem_1fr_6rem_6rem_6rem] gap-0 px-5 py-2.5 bg-sky-50/20 hover:bg-sky-50/40 transition-colors text-sm">
                        <div className="font-medium text-slate-700">{name}, {num}/{month}</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {batidas.map((b, i) => (
                            <span key={i} className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{b}</span>
                          ))}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Normal</span>
                          <span className="font-mono text-xs font-semibold text-slate-600">{minsToHHMM(normM)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">HE</span>
                          <span className="font-mono text-xs font-bold text-sky-600">+{minsToHHMM(mins)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Total</span>
                          <span className="font-mono text-xs font-semibold text-slate-700">{rec?.horasTrabalhadas || "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* HE subtotal */}
                  <div className="grid grid-cols-[7rem_1fr_6rem_6rem_6rem] gap-0 px-5 py-2.5 bg-slate-50 text-xs">
                    <div className="col-span-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px] flex items-center">Total de HE no período</div>
                    <div className="text-right font-mono font-black text-sky-600">{minsToHHMM(summary.totalHEMins)}</div>
                    <div />
                  </div>
                </div>
              </div>
            )}

            {/* ── ASSINATURAS ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-10 mt-8 pt-4">
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
    </DashboardLayout>
  );
}
