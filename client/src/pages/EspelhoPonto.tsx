import { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, RefreshCw, User, Calendar,
  ChevronDown, CheckCircle, XCircle, AlertCircle, Clock
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseHHMM(str: string | null | undefined): number {
  if (!str || str === "0:00" || str === "") return 0;
  const p = str.split(":").map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

function formatMins(mins: number, showDash = true): string {
  if (mins <= 0) return showDash ? "—" : "0h00";
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

function defaultPeriodo() {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const inicio = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-16`;
  const fim = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
  return { inicio, fim };
}

function generateDays(dataInicio: string, dataFim: string): string[] {
  const days: string[] = [];
  const start = new Date(dataInicio + "T12:00:00Z");
  const end = new Date(dataFim + "T12:00:00Z");
  const curr = new Date(start);
  while (curr <= end) {
    days.push(curr.toISOString().slice(0, 10));
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return days;
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getDayInfo(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00Z");
  const dow = date.getUTCDay();
  const [y, m, d] = dateStr.split("-");
  return { dow, dayName: DAY_NAMES[dow], label: `${DAY_NAMES[dow]} ${d}/${m}`, isWeekend: dow === 0 || dow === 6 };
}

function getBatidas(record: any): string[] {
  return [record.entrada1, record.saida1, record.entrada2, record.saida2, record.entrada3, record.saida3].filter(Boolean);
}

function getRowClass(dateStr: string, record: any | null): string {
  const { isWeekend, dow } = getDayInfo(dateStr);
  if (dow === 0) return "bg-gray-50/80 text-gray-300";
  if (isWeekend) return "bg-gray-50/60 text-gray-400";
  if (!record || !record.horasTrabalhadas || record.horasTrabalhadas === "0:00" || record.horasTrabalhadas === "") {
    return "bg-red-50/50";
  }
  const batidas = getBatidas(record);
  if (batidas.length > 0 && batidas.length % 2 !== 0) return "bg-orange-50/60";
  if (parseHHMM(record.horasExtras) > 0) return "bg-purple-50/40";
  if (parseHHMM(record.atrasos) > 0) return "bg-amber-50/40";
  return "";
}

type OcorrenciaTag = { label: string; cls: string } | null;

function getOcorrencia(dateStr: string, record: any | null): OcorrenciaTag {
  const { dow, isWeekend } = getDayInfo(dateStr);
  if (dow === 0) return { label: "Domingo", cls: "bg-gray-100 text-gray-400" };
  if (isWeekend) return { label: "Sábado", cls: "bg-gray-100 text-gray-500" };
  if (!record || !record.horasTrabalhadas || record.horasTrabalhadas === "0:00" || record.horasTrabalhadas === "") {
    if (record?.justificativa) return { label: record.justificativa, cls: "bg-blue-100 text-blue-700" };
    return { label: "Falta", cls: "bg-red-100 text-red-700 font-semibold" };
  }
  const justif = record.justificativa as string | null;
  if (justif) return { label: justif, cls: "bg-blue-100 text-blue-700" };
  const batidas = getBatidas(record);
  if (batidas.length > 0 && batidas.length % 2 !== 0) return { label: "Incompleto", cls: "bg-orange-100 text-orange-700" };
  const he = parseHHMM(record.horasExtras);
  if (he > 0) return { label: `HE +${formatMins(he, false)}`, cls: "bg-purple-100 text-purple-700" };
  const atraso = parseHHMM(record.atrasos);
  if (atraso > 0) return { label: `Atraso ${formatMins(atraso, false)}`, cls: "bg-amber-100 text-amber-700" };
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EspelhoPonto() {
  const { selectedCompanyId, getCompanyIdsForQuery, isConstrutoras } = useCompany();
  // Mesmo padrão do FechamentoPonto
  const companyId = (selectedCompanyId && selectedCompanyId !== "construtoras")
    ? parseInt(selectedCompanyId, 10)
    : 0;
  const companyIds = getCompanyIdsForQuery();

  const def = useMemo(() => defaultPeriodo(), []);
  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim, setDataFim] = useState(def.fim);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [queryParams, setQueryParams] = useState<{ employeeId: number; dataInicio: string; dataFim: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle URL params (navegação vinda de outras telas)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const empId = params.get("funcionario");
    const mes = params.get("mes"); // YYYY-MM
    if (empId && mes) {
      const id = parseInt(empId);
      const [y, m] = mes.split("-").map(Number);
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const inicio = `${prevYear}-${String(prevMonth).padStart(2, "0")}-16`;
      const fim = `${y}-${String(m).padStart(2, "0")}-15`;
      setDataInicio(inicio);
      setDataFim(fim);
      setEmployeeId(id);
      setQueryParams({ employeeId: id, dataInicio: inicio, dataFim: fim });
    }
  }, []);

  // Employee list — mesmo endpoint usado pelo FechamentoPonto
  const empListQuery = trpc.employees.list.useQuery(
    { companyId, companyIds, excludeTerminated: true },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const empList: any[] = (empListQuery.data as any[]) || [];

  // Espelho query
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const espelhoQuery = trpc.horasExtras.getEspelhoPontoRange.useQuery(
    queryParams
      ? { companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, ...queryParams }
      : { companyId: 0, employeeId: 0, dataInicio: "", dataFim: "" },
    { enabled: !!queryParams && (queryCompanyId > 0 || companyIds.length > 0) }
  );

  const filteredEmps = useMemo(() => {
    if (!searchQuery.trim()) return empList;
    const q = searchQuery.toLowerCase();
    return empList.filter(
      (e) =>
        String(e.nomeCompleto).toLowerCase().includes(q) ||
        String(e.codigoInterno || "").includes(q) ||
        String(e.cpf || "").includes(q)
    );
  }, [empList, searchQuery]);

  const selectedEmp = useMemo(
    () => (employeeId ? empList.find((e) => Number(e.id) === employeeId) : null),
    [empList, employeeId]
  );

  function handleSelectEmp(emp: any) {
    setEmployeeId(Number(emp.id));
    setSearchQuery("");
    setShowDropdown(false);
  }

  function handleBuscar() {
    if (!employeeId) return;
    if (!dataInicio || !dataFim) return;
    setQueryParams({ employeeId, dataInicio, dataFim });
  }

  function setQuickPeriod(tipo: "periodo" | "mesAtual" | "30dias") {
    const now = new Date();
    if (tipo === "periodo") {
      const { inicio, fim } = defaultPeriodo();
      setDataInicio(inicio);
      setDataFim(fim);
    } else if (tipo === "mesAtual") {
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
    } else {
      const past = new Date(now);
      past.setDate(past.getDate() - 30);
      setDataInicio(past.toISOString().slice(0, 10));
      setDataFim(now.toISOString().slice(0, 10));
    }
  }

  // Generate all days in the queried period
  const allDays = useMemo(
    () => (queryParams ? generateDays(queryParams.dataInicio, queryParams.dataFim) : []),
    [queryParams]
  );

  const recordMap: Record<string, any> = (espelhoQuery.data?.records as any) || {};
  const empData: any = espelhoQuery.data?.employee;

  // Summary computed from full day list (including days without records)
  const summary = useMemo(() => {
    let trabalhados = 0;
    let diasFalta = 0;
    let totalHEMins = 0;
    let totalAtrasoMins = 0;
    let totalFaltaMins = 0;

    for (const dateStr of allDays) {
      const { dow } = getDayInfo(dateStr);
      if (dow === 0 || dow === 6) continue; // pular fins de semana
      const r = recordMap[dateStr];
      if (!r || !r.horasTrabalhadas || r.horasTrabalhadas === "0:00" || r.horasTrabalhadas === "") {
        diasFalta++;
      } else {
        trabalhados++;
      }
      if (r) {
        totalHEMins += parseHHMM(r.horasExtras);
        totalAtrasoMins += parseHHMM(r.atrasos);
        totalFaltaMins += parseHHMM(r.faltas);
      }
    }

    return { trabalhados, diasFalta, totalHEMins, totalAtrasoMins, totalFaltaMins };
  }, [allDays, recordMap]);

  const hasData = !!queryParams && !espelhoQuery.isLoading && !!empData;

  return (
    <DashboardLayout>
      <PrintHeader />

      <div className="space-y-5 max-w-6xl mx-auto">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Espelho de Ponto
            </h1>
            <p className="text-sm text-muted-foreground">
              Registros individuais por período livre — qualquer intervalo de datas
            </p>
          </div>
          {hasData && (
            <div className="no-print">
              <PrintActions title="Espelho de Ponto" />
            </div>
          )}
        </div>

        {/* ── FILTROS ── */}
        <Card className="no-print">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-4">

              {/* Employee search */}
              <div className="flex-1 min-w-[240px] relative">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  <User className="inline h-3 w-3 mr-1" />
                  Funcionário
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery || (selectedEmp ? selectedEmp.nomeCompleto : "")}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                      if (!e.target.value) setEmployeeId(null);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder={empListQuery.isLoading ? "Carregando…" : "Buscar por nome ou matrícula…"}
                    className="border rounded-md px-3 py-2 text-sm w-full pr-8 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {showDropdown && filteredEmps.length > 0 && (
                  <div className="absolute z-50 bg-white border rounded-md shadow-lg w-full max-h-60 overflow-y-auto mt-0.5">
                    {filteredEmps.slice(0, 40).map((e: any) => (
                      <button
                        key={e.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2 border-b border-border/30 last:border-0"
                        onMouseDown={() => handleSelectEmp(e)}
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium block truncate">{e.nomeCompleto}</span>
                          <span className="text-xs text-muted-foreground">
                            {e.funcao}
                            {e.codigoInterno ? ` · Mat. ${e.codigoInterno}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date range */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  <Calendar className="inline h-3 w-3 mr-1" />
                  Data Início
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  <Calendar className="inline h-3 w-3 mr-1" />
                  Data Fim
                </label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                onClick={handleBuscar}
                disabled={!employeeId || espelhoQuery.isLoading}
                className="shrink-0"
              >
                {espelhoQuery.isLoading ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Buscando…</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" />Buscar</>
                )}
              </Button>
            </div>

            {/* Quick period buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Atalhos:</span>
              {([
                { label: "Período atual (16→15)", tipo: "periodo" as const },
                { label: "Mês atual", tipo: "mesAtual" as const },
                { label: "Últimos 30 dias", tipo: "30dias" as const },
              ]).map(({ label, tipo }) => (
                <button
                  key={tipo}
                  className="text-xs px-2.5 py-1 border rounded hover:bg-muted text-muted-foreground transition-colors"
                  onClick={() => setQuickPeriod(tipo)}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── ESTADO VAZIO ── */}
        {!queryParams && (
          <div className="bg-muted/30 border border-border rounded-lg p-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">
              Selecione um funcionário e o período desejado para visualizar o espelho de ponto
            </p>
          </div>
        )}

        {/* ── LOADING ── */}
        {queryParams && espelhoQuery.isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-2" />
            <p className="text-sm">Carregando registros…</p>
          </div>
        )}

        {/* ── DADOS ── */}
        {hasData && (
          <>
            {/* EMPLOYEE HEADER */}
            <Card className="border-gray-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Funcionário</p>
                    <p className="font-semibold mt-0.5">{empData.nomeCompleto}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Cargo</p>
                    <p className="font-medium mt-0.5">{empData.funcao || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Matrícula</p>
                    <p className="font-medium mt-0.5">{empData.codigoInterno || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Período</p>
                    <p className="font-medium mt-0.5">
                      {queryParams!.dataInicio.split("-").reverse().join("/")} →{" "}
                      {queryParams!.dataFim.split("-").reverse().join("/")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-green-200 bg-green-50/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Dias Trabalhados</p>
                  </div>
                  <p className="text-3xl font-bold text-green-700">{summary.trabalhados}</p>
                  <p className="text-xs text-muted-foreground mt-1">dias com registro</p>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-purple-600" />
                    <p className="text-xs text-muted-foreground">Hora Extra</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{formatMins(summary.totalHEMins, false)}</p>
                  <p className="text-xs text-muted-foreground mt-1">acumulado no período</p>
                </CardContent>
              </Card>

              <Card className={summary.diasFalta > 0 ? "border-red-200 bg-red-50/30" : "border-gray-200"}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className={`h-4 w-4 ${summary.diasFalta > 0 ? "text-red-500" : "text-gray-300"}`} />
                    <p className="text-xs text-muted-foreground">Faltas</p>
                  </div>
                  <p className={`text-3xl font-bold ${summary.diasFalta > 0 ? "text-red-600" : "text-gray-300"}`}>
                    {summary.diasFalta}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">dias sem registro</p>
                </CardContent>
              </Card>

              <Card className={summary.totalAtrasoMins > 0 ? "border-amber-200 bg-amber-50/30" : "border-gray-200"}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className={`h-4 w-4 ${summary.totalAtrasoMins > 0 ? "text-amber-500" : "text-gray-300"}`} />
                    <p className="text-xs text-muted-foreground">Atrasos</p>
                  </div>
                  <p className={`text-3xl font-bold ${summary.totalAtrasoMins > 0 ? "text-amber-600" : "text-gray-300"}`}>
                    {formatMins(summary.totalAtrasoMins, false)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">total no período</p>
                </CardContent>
              </Card>
            </div>

            {/* LEGEND */}
            <div className="no-print flex flex-wrap gap-4 text-xs text-muted-foreground">
              {([
                { cls: "bg-white border", label: "Normal" },
                { cls: "bg-purple-100", label: "Hora Extra" },
                { cls: "bg-red-100", label: "Falta" },
                { cls: "bg-orange-100", label: "Incompleto" },
                { cls: "bg-amber-100", label: "Atraso" },
                { cls: "bg-gray-100", label: "Fim de Semana" },
              ]).map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className={`w-3.5 h-3.5 rounded ${l.cls} border border-gray-200 inline-block shrink-0`} />
                  {l.label}
                </span>
              ))}
            </div>

            {/* DAILY TABLE */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="py-2.5 px-4 w-28">Data</th>
                        <th className="py-2.5 px-4">Batidas</th>
                        <th className="py-2.5 px-4 w-28 text-right">Trabalhado</th>
                        <th className="py-2.5 px-4 w-32">Ocorrência</th>
                        <th className="py-2.5 px-4 w-40 hidden md:table-cell">Obra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDays.map((dateStr) => {
                        const { dow, label, isWeekend } = getDayInfo(dateStr);
                        const record = recordMap[dateStr] || null;
                        const rowCls = getRowClass(dateStr, record);
                        const ocorrencia = getOcorrencia(dateStr, record);
                        const batidas = record ? getBatidas(record) : [];
                        const isCompactRow = isWeekend && !record;

                        if (isCompactRow) {
                          return (
                            <tr key={dateStr} className={`${rowCls} border-b border-gray-100/80`}>
                              <td className="py-1 px-4 text-[11px] font-medium">{label}</td>
                              <td className="py-1 px-4 text-[11px]">—</td>
                              <td className="py-1 px-4 text-[11px] text-right">—</td>
                              <td className="py-1 px-4">
                                {ocorrencia && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${ocorrencia.cls}`}>
                                    {ocorrencia.label}
                                  </span>
                                )}
                              </td>
                              <td className="py-1 px-4 hidden md:table-cell" />
                            </tr>
                          );
                        }

                        return (
                          <tr key={dateStr} className={`${rowCls} border-b border-gray-100 transition-colors`}>
                            <td className="py-2.5 px-4 font-semibold text-xs whitespace-nowrap">{label}</td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {batidas.length > 0 ? (
                                  batidas.map((b, i) => (
                                    <span
                                      key={i}
                                      className={`font-mono text-xs px-2 py-0.5 rounded ${
                                        i % 2 === 0
                                          ? "bg-green-100 text-green-800"
                                          : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {b}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400 text-xs italic">sem registro</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right font-medium text-xs tabular-nums">
                              {record?.horasTrabalhadas && record.horasTrabalhadas !== "0:00" && record.horasTrabalhadas !== ""
                                ? record.horasTrabalhadas
                                : "—"}
                            </td>
                            <td className="py-2.5 px-4">
                              {ocorrencia && (
                                <span className={`text-[10px] px-2 py-0.5 rounded ${ocorrencia.cls}`}>
                                  {ocorrencia.label}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[150px]">
                              {record?.obraNome || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* TOTALS FOOTER */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-xs">
                        <td className="py-3 px-4 uppercase tracking-wide" colSpan={2}>
                          Resumo do Período
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {summary.trabalhados} dia(s)
                        </td>
                        <td className="py-3 px-4" colSpan={2}>
                          <div className="flex flex-col gap-0.5">
                            {summary.totalHEMins > 0 && (
                              <span className="text-purple-700">HE: {formatMins(summary.totalHEMins)}</span>
                            )}
                            {summary.diasFalta > 0 && (
                              <span className="text-red-600">Faltas: {summary.diasFalta} dia(s)</span>
                            )}
                            {summary.totalAtrasoMins > 0 && (
                              <span className="text-amber-700">Atrasos: {formatMins(summary.totalAtrasoMins)}</span>
                            )}
                            {summary.totalHEMins === 0 && summary.diasFalta === 0 && summary.totalAtrasoMins === 0 && (
                              <span className="text-green-600">Sem ocorrências</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* SIGNATURE BLOCK — visível na impressão */}
            <div className="mt-10 grid grid-cols-3 gap-10 text-center print:block">
              <div className="border-t border-gray-400 pt-2 text-xs text-gray-600">
                <p>Assinatura da Diretoria</p>
              </div>
              <div className="border-t border-gray-400 pt-2 text-xs text-gray-600">
                <p>Assinatura da Chefia Imediata</p>
              </div>
              <div className="border-t border-gray-400 pt-2 text-xs text-gray-600">
                <p>Assinatura do Funcionário</p>
              </div>
            </div>
          </>
        )}
      </div>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
