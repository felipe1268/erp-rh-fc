import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  HeartPulse, AlertTriangle, FileWarning, Activity, Users, Clock,
  TrendingUp, TrendingDown, Stethoscope, ShieldAlert, FileCheck2, Calendar, RefreshCw,
  BarChart3, ArrowDown, ArrowUp, Layers, MapPin, AlarmClock, DollarSign,
  CalendarClock, Repeat, CalendarDays, User as UserIcon, X as XIcon,
  Search, Info, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area, AreaChart,
} from "recharts";
import { ChartCard } from "@/components/sst/ChartCard";
import { cidDescricao } from "@shared/cid10";
import { EmployeeDetailDialog } from "@/components/sst/EmployeeDetailDialog";
import { PersonPhoto } from "@/components/PersonPhoto";

function truncate(s: string, n = 22) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Rev. 1979 — Tempo de empresa em "Xa Ym Zd" (ex: "5a 3m 12d"). Null → "—".
function fmtTempoEmpresa(dataAdmissao: string | null | undefined): string {
  if (!dataAdmissao) return "—";
  const ini = new Date(String(dataAdmissao).slice(0, 10) + "T00:00:00");
  if (isNaN(ini.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - ini.getFullYear();
  let meses = hoje.getMonth() - ini.getMonth();
  let dias = hoje.getDate() - ini.getDate();
  if (dias < 0) {
    meses -= 1;
    const ultDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
    dias += ultDia;
  }
  if (meses < 0) { anos -= 1; meses += 12; }
  const parts: string[] = [];
  if (anos > 0) parts.push(`${anos}a`);
  if (meses > 0) parts.push(`${meses}m`);
  parts.push(`${dias}d`);
  return parts.join(" ");
}

// Rev. 1979 — Idade em anos completos. Null → null (não renderiza).
function fmtIdade(dataNascimento: string | null | undefined): string | null {
  if (!dataNascimento) return null;
  const ini = new Date(String(dataNascimento).slice(0, 10) + "T00:00:00");
  if (isNaN(ini.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - ini.getFullYear();
  const m = hoje.getMonth() - ini.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < ini.getDate())) anos -= 1;
  return `${anos} anos`;
}

// Rev. 1979 — Badge CIPA: Ativo (verde sólido) ou Estabilidade até DD/MM/YYYY (âmbar). null → nada.
function CipaBadge({ ativo, estabilidade, fim }: { ativo: boolean; estabilidade: boolean; fim: string | null }) {
  if (ativo) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 border border-green-300" title="Membro ativo da CIPA">
        CIPA
      </span>
    );
  }
  if (estabilidade) {
    const fmt = fim ? new Date(String(fim).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—";
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300" title={`Ex-membro com estabilidade CIPA até ${fmt}`}>
        CIPA · estab. {fmt}
      </span>
    );
  }
  return null;
}

// Rev. 1979 — Bloco compacto de metadados (tempo / idade / obra / CIPA) sob o nome.
function EmployeeMeta({ f }: { f: any }) {
  const tempo = fmtTempoEmpresa(f.dataAdmissao);
  const idade = fmtIdade(f.dataNascimento);
  const obra = f.obraAtual as string | null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
      <span title="Tempo de empresa">⏱ {tempo}</span>
      {idade && <span title="Idade">· 🎂 {idade}</span>}
      <span title="Obra atual">· 🏗 {obra || "Sem alocação"}</span>
      <CipaBadge ativo={!!f.cipaAtivo} estabilidade={!!f.cipaEstabilidade} fim={f.cipaFimEstabilidade || null} />
    </div>
  );
}

// Rev. 1976 — Avatar do funcionário (miniatura clicável que abre modal de zoom).
// Mostra foto se houver fotoUrl; senão, círculo com iniciais sobre fundo cinza.
function EmployeeAvatar({ fotoUrl, nome, onZoom }: { fotoUrl: string | null | undefined; nome: string; onZoom: (url: string, nome: string) => void }) {
  const iniciais = (nome || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
  if (!fotoUrl) {
    return (
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[11px] font-semibold text-slate-600 border border-slate-300"
        title={nome}
        aria-label={`Sem foto cadastrada para ${nome}`}
      >
        {iniciais}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden border border-slate-300 hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
      onClick={(e) => { e.stopPropagation(); onZoom(fotoUrl, nome); }}
      title={`Ampliar foto de ${nome}`}
      aria-label={`Ampliar foto de ${nome}`}
    >
      <img
        src={fotoUrl}
        alt={nome}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    </button>
  );
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];
const GRAV_COLORS: Record<string, string> = {
  Leve: "#10b981",
  Moderado: "#f59e0b",
  Moderada: "#f59e0b",
  Grave: "#ef4444",
  Gravissima: "#7f1d1d",
  Gravíssima: "#7f1d1d",
  Fatal: "#000000",
};

function fmtNum(v: number, d = 0) {
  return (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function mesLabel(ym: string) {
  const [y, m] = ym.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}
function defaultIni() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function defaultFim() {
  return new Date().toISOString().slice(0, 10);
}

// Rev. 1968 — Tooltip customizado pt-BR para gráficos combo (bar+line).
// Mostra mês em negrito + lista de séries com dot colorido + valor formatado.
// Esconde séries com valor 0 pra reduzir ruído nos meses futuros vazios.
function TooltipPtBR({ active, payload, label, hideZeros = false, valueSuffix }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const items = hideZeros ? payload.filter((p: any) => (p.value ?? 0) !== 0) : payload;
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-900 mb-1">{label}</p>
      <div className="space-y-0.5">
        {items.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || p.fill || p.stroke }} />
            <span className="text-gray-700">{p.name}:</span>
            <span className="font-semibold tabular-nums text-gray-900">{fmtNum(p.value ?? 0)}{valueSuffix?.[p.dataKey] ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPI({
  icon: Icon, label, value, sub, color = "text-blue-600", bg = "bg-blue-50", border = "border-blue-200",
  onClick, hint,
}: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: string; bg?: string; border?: string;
  onClick?: () => void; hint?: string;
}) {
  const clickable = !!onClick;
  return (
    <Card
      className={`${bg} ${border} border ${clickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">{label}</p>
            <p className={`text-2xl font-bold ${color} mt-1`}>{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
            {clickable && (
              <p className={`text-[11px] ${color} mt-1.5 flex items-center gap-1 font-medium opacity-80`}>
                <Search className="h-3 w-3" /> {hint || "Clique para ver o detalhamento"}
              </p>
            )}
          </div>
          <Icon className={`${color} h-8 w-8 flex-shrink-0`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardAtestadosAcidentes() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : companyId > 0;

  const [dataInicio, setDataInicio] = useState(defaultIni());
  const [dataFim, setDataFim] = useState(defaultFim());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showCustoDetalhe, setShowCustoDetalhe] = useState(false);
  const [indicadorDetalhe, setIndicadorDetalhe] = useState<{ titulo: string; descricao: string; lista: any[] } | null>(null);
  const [reincidenciaDetalhe, setReincidenciaDetalhe] = useState(false);
  const [diaSemanaDetalhe, setDiaSemanaDetalhe] = useState<{ tipo: "atestado" | "acidente"; diaIdx: number; dia: string } | null>(null);
  // Rev. 2687 — Drill-down "de onde vem o número" dos cards Total Atestados / Dias Afastamento.
  const [diasDetalhe, setDiasDetalhe] = useState(false);
  const [diasFiltro, setDiasFiltro] = useState("");
  // Rev. 1976 — Modal de foto ampliada do funcionário (clique na miniatura)
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);
  // Rev. 1977 — Toggle de séries da "Evolução Mensal" via click na legenda (Set de dataKeys ocultas)
  const [evolHidden, setEvolHidden] = useState<Set<string>>(new Set());
  const toggleEvolSeries = (dk: string) => {
    setEvolHidden((prev) => {
      const next = new Set(prev);
      if (next.has(dk)) next.delete(dk); else next.add(dk);
      return next;
    });
  };

  const diaSemanaQuery = trpc.sstAnalytics.funcionariosPorDiaSemana.useQuery(
    {
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      dataInicio, dataFim,
      tipo: diaSemanaDetalhe?.tipo ?? "atestado",
      diaIdx: diaSemanaDetalhe?.diaIdx ?? 0,
    },
    { enabled: !!diaSemanaDetalhe && hasValidCompany },
  );

  const dash = trpc.sstAnalytics.atestadosAcidentes.useQuery(
    {
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      dataInicio, dataFim,
    },
    { enabled: hasValidCompany },
  );

  const d = dash.data;

  const evolucaoData = useMemo(() => {
    return (d?.evolucaoMensal ?? []).map((m: any) => ({
      ...m, mesLabel: mesLabel(m.mes),
    }));
  }, [d]);

  // Helpers de drill-down nos gráficos
  const fmtDateBR = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "—");
  const drillCols = [
    { key: "dataEmissao", label: "Data", render: (r: any) => fmtDateBR(r.dataEmissao) },
    { key: "nome", label: "Funcionário", render: (r: any) => (
      <span>{r.nome}{r.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{r.codigoInterno}</span> : null}</span>
    )},
    { key: "funcao", label: "Função", render: (r: any) => r.funcao || "—" },
    { key: "tipo", label: "Tipo" },
    { key: "cid", label: "CID", render: (r: any) => {
      if (!r.cid) return "—";
      const desc = cidDescricao(r.cid);
      return (
        <span className="inline-flex flex-col">
          <span className="font-mono text-xs">{r.cid}</span>
          {desc && <span className="text-[11px] text-gray-500">{desc}</span>}
        </span>
      );
    }},
    { key: "motivo", label: "Motivo" },
    { key: "dias", label: "Dias", align: "right" as const },
  ];
  const drillColsAcid = [
    { key: "dataAcidente", label: "Data", render: (r: any) => fmtDateBR(r.dataAcidente) },
    { key: "nome", label: "Funcionário", render: (r: any) => (
      <span>{r.nome}{r.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{r.codigoInterno}</span> : null}</span>
    )},
    { key: "funcao", label: "Função", render: (r: any) => r.funcao || "—" },
    { key: "tipo", label: "Tipo" },
    { key: "gravidade", label: "Gravidade" },
    { key: "parteCorpo", label: "Parte do corpo" },
    { key: "local", label: "Local" },
    { key: "dias", label: "Dias", align: "right" as const },
  ];

  const drillAtestadosBy = (field: keyof NonNullable<typeof d>["atestadosLista"][number], labelOf: (r: any) => string) => ({
    getRows: (row: any) => (d?.atestadosLista ?? []).filter((a: any) => a[field] === labelOf(row)),
    columns: drillCols,
    labelKey: ((row: any) => labelOf(row)) as any,
    onRowClick: (r: any) => setSelectedEmployeeId(r.employeeId),
    emptyMessage: "Nenhum atestado nesta categoria.",
  });

  const drillAcidentesBy = (field: keyof NonNullable<typeof d>["acidentesLista"][number], labelOf: (r: any) => string) => ({
    getRows: (row: any) => (d?.acidentesLista ?? []).filter((a: any) => a[field] === labelOf(row)),
    columns: drillColsAcid,
    labelKey: ((row: any) => labelOf(row)) as any,
    onRowClick: (r: any) => setSelectedEmployeeId(r.employeeId),
    emptyMessage: "Nenhum acidente nesta categoria.",
  });

  const fmtISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const setRange = (months: number) => {
    const fim = new Date();
    const ini = new Date();
    ini.setMonth(ini.getMonth() - (months - 1));
    ini.setDate(1);
    setDataInicio(fmtISO(ini));
    setDataFim(fmtISO(fim));
  };

  const hoje = new Date();
  const [anoSel, setAnoSel] = useState<number>(hoje.getFullYear());
  const anosDisp = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - i);
  const mesesPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const setMesAno = (year: number, month0: number) => {
    setDataInicio(fmtISO(new Date(year, month0, 1)));
    setDataFim(fmtISO(new Date(year, month0 + 1, 0)));
  };
  const setTrimestre = (year: number, q: 1 | 2 | 3 | 4) => {
    const m = (q - 1) * 3;
    setDataInicio(fmtISO(new Date(year, m, 1)));
    setDataFim(fmtISO(new Date(year, m + 3, 0)));
  };
  const setSemestre = (year: number, s: 1 | 2) => {
    const m = s === 1 ? 0 : 6;
    setDataInicio(fmtISO(new Date(year, m, 1)));
    setDataFim(fmtISO(new Date(year, m + 6, 0)));
  };
  const setAnoCheio = (year: number) => {
    setDataInicio(`${year}-01-01`);
    setDataFim(`${year}-12-31`);
  };

  const isAtivo = (ini: string, fim: string) => dataInicio === ini && dataFim === fim;
  const trimAtivo = (q: 1 | 2 | 3 | 4) => {
    const m = (q - 1) * 3;
    return isAtivo(fmtISO(new Date(anoSel, m, 1)), fmtISO(new Date(anoSel, m + 3, 0)));
  };
  const semAtivo = (s: 1 | 2) => {
    const m = s === 1 ? 0 : 6;
    return isAtivo(fmtISO(new Date(anoSel, m, 1)), fmtISO(new Date(anoSel, m + 6, 0)));
  };
  const anoCheioAtivo = (y: number) => isAtivo(`${y}-01-01`, `${y}-12-31`);
  const mesAtivoIdx = (() => {
    for (let i = 0; i < 12; i++) {
      if (isAtivo(fmtISO(new Date(anoSel, i, 1)), fmtISO(new Date(anoSel, i + 1, 0)))) return i;
    }
    return -1;
  })();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <HeartPulse className="h-7 w-7 text-emerald-600" />
              Análise de Atestados & Acidentes
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Indicadores SST consolidados por período: absenteísmo médico, gravidade, taxas e tendências.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => dash.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Linha 1: Período personalizado (datas) + atalhos */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div className="min-w-0">
                <Label className="text-xs text-gray-600">Data Início</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-gray-600">Data Fim</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setRange(1)}>Mês</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(3)}>3M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(6)}>6M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(12)}>12M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(24)}>24M</Button>
              </div>
            </div>

            {/* Linha 2: Ano de referência + Ano todo */}
            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
              <Label className="text-xs text-gray-600 whitespace-nowrap">Ano de referência</Label>
              <select
                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={anoSel}
                onChange={(e) => setAnoSel(parseInt(e.target.value, 10))}
              >
                {anosDisp.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant={anoCheioAtivo(anoSel) ? "default" : "outline"}
                onClick={() => setAnoCheio(anoSel)}
                title={`Período: 01/01/${anoSel} a 31/12/${anoSel}`}
              >
                Ano todo
              </Button>
            </div>

            {/* Linha 3: Trimestre / Semestre / Mês — grid para evitar sobreposição */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-500 mr-1 whitespace-nowrap">Trimestre:</span>
                {([1, 2, 3, 4] as const).map((q) => (
                  <Button
                    key={`t${q}`}
                    size="sm"
                    variant={trimAtivo(q) ? "default" : "outline"}
                    onClick={() => setTrimestre(anoSel, q)}
                    className="px-2"
                  >
                    T{q}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-500 mr-1 whitespace-nowrap">Semestre:</span>
                {([1, 2] as const).map((s) => (
                  <Button
                    key={`s${s}`}
                    size="sm"
                    variant={semAtivo(s) ? "default" : "outline"}
                    onClick={() => setSemestre(anoSel, s)}
                    className="px-2"
                  >
                    S{s}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-600 whitespace-nowrap">Mês:</Label>
                <select
                  className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1 min-w-0"
                  value={mesAtivoIdx}
                  onChange={(e) => {
                    const idx = parseInt(e.target.value, 10);
                    if (idx >= 0) setMesAno(anoSel, idx);
                  }}
                >
                  <option value={-1}>—</option>
                  {mesesPt.map((m, i) => (
                    <option key={m} value={i}>{m}/{String(anoSel).slice(2)}</option>
                  ))}
                </select>
              </div>
            </div>
            {d && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                <Badge variant="outline" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {d.periodo.meses} {d.periodo.meses === 1 ? "mês" : "meses"}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" /> {fmtNum(d.headcount)} colaboradores ativos
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {fmtNum(d.horasHomem)} HH no período (220h/mês)
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {!hasValidCompany && (
          <Card><CardContent className="p-8 text-center text-gray-500">Selecione uma empresa para visualizar.</CardContent></Card>
        )}

        {hasValidCompany && dash.isLoading && (
          <Card><CardContent className="p-8 text-center text-gray-500">Carregando indicadores...</CardContent></Card>
        )}

        {d && (
          <Tabs defaultValue="visaoGeral" className="space-y-4">
            <TabsList className="bg-white border">
              <TabsTrigger value="visaoGeral">Visão Geral</TabsTrigger>
              <TabsTrigger value="atestados">Atestados</TabsTrigger>
              <TabsTrigger value="acidentes">Acidentes</TabsTrigger>
              <TabsTrigger value="avancado">Indicadores Avançados</TabsTrigger>
              <TabsTrigger value="obras">Obras / Ações</TabsTrigger>
            </TabsList>

            {/* ============ VISÃO GERAL ============ */}
            <TabsContent value="visaoGeral" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={FileCheck2} label="Total Atestados" value={fmtNum(d.atestados.total)}
                  sub={`${fmtNum(d.atestados.colaboradoresAfetados)} colaboradores`} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200"
                  onClick={() => { setDiasFiltro(""); setDiasDetalhe(true); }} hint="Ver por colaborador" />
                <KPI icon={Clock} label="Dias Afastamento (Atestado)" value={fmtNum(d.atestados.totalDiasAfastamento)}
                  sub={`Média ${fmtNum(d.atestados.mediaDiasAtestado, 1)} dias/atestado`} color="text-blue-600" bg="bg-blue-50" border="border-blue-200"
                  onClick={() => { setDiasFiltro(""); setDiasDetalhe(true); }} hint="De onde vem esse número?" />
                <KPI icon={AlertTriangle} label="Total Acidentes" value={fmtNum(d.acidentes.total)}
                  sub={`${fmtNum(d.acidentes.colaboradoresAfetados)} colaboradores`} color="text-orange-600" bg="bg-orange-50" border="border-orange-200" />
                <KPI icon={ShieldAlert} label="Dias Perdidos (Acidente)" value={fmtNum(d.acidentes.totalDiasAfastamento)}
                  sub={`${fmtNum(d.acidentes.comAfastamento)} c/ afastamento`} color="text-red-600" bg="bg-red-50" border="border-red-200" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={Activity} label="Taxa de Frequência (TF)" value={fmtNum(d.acidentes.taxaFrequencia, 2)}
                  sub="acidentes c/ afast. × 1M ÷ HH" color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
                <KPI icon={TrendingUp} label="Taxa de Gravidade (TG)" value={fmtNum(d.acidentes.taxaGravidade, 2)}
                  sub="dias perdidos × 1M ÷ HH" color="text-pink-600" bg="bg-pink-50" border="border-pink-200" />
                <KPI icon={Stethoscope} label="Atestados c/ INSS" value={fmtNum(d.atestados.totalAfastamentosINSS)}
                  sub="afastamentos > 15 dias" color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200" />
                <KPI icon={FileWarning} label="Acidentes c/ CAT" value={`${fmtNum(d.acidentes.comCAT)} / ${fmtNum(d.acidentes.total)}`}
                  sub={`${fmtNum(d.acidentes.semCAT)} sem CAT registrada`} color="text-amber-600" bg="bg-amber-50" border="border-amber-200" />
              </div>

              {/* Evolução mensal combinada */}
              <ChartCard
                title="Evolução Mensal — Atestados x Acidentes"
                icon={<BarChart3 className="h-4 w-4" />}
                height={320}
                isEmpty={evolucaoData.length === 0}
                tableData={evolucaoData}
                tableColumns={[
                  { key: "mesLabel", label: "Mês" },
                  { key: "atestados", label: "Atestados", align: "right" },
                  { key: "acidentes", label: "Acidentes", align: "right" },
                  { key: "diasAtestado", label: "Dias Atestado", align: "right" },
                  { key: "diasAcidente", label: "Dias Acidente", align: "right" },
                ]}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    {/* Rev. 1968 — margens ajustadas pra acomodar Y-axis labels (left=24, right=24).
                        Custom TooltipPtBR esconde séries zeradas (meses futuros) e mostra valor formatado pt-BR. */}
                    <ComposedChart data={evolucaoData} margin={{ top: 10, right: 24, left: 24, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} tickMargin={6} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false}
                        label={{ value: "Quantidade", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#6b7280" }, offset: -2 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false}
                        label={{ value: "Dias", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#6b7280" }, offset: -2 }} />
                      <Tooltip cursor={{ fill: "rgba(59,130,246,0.05)" }} content={<TooltipPtBR hideZeros valueSuffix={{ diasAtestado: " d", diasAcidente: " d" }} />} />
                      {/* Rev. 1977 — Legenda clicável: toggle on/off de cada série. Item oculto fica cinza+riscado. */}
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 12, paddingTop: 8, cursor: "pointer", userSelect: "none" }}
                        onClick={(o: any) => { if (o?.dataKey) toggleEvolSeries(String(o.dataKey)); }}
                        formatter={(value: string, entry: any) => {
                          const dk = String(entry?.dataKey ?? "");
                          const off = evolHidden.has(dk);
                          return (
                            <span style={{ color: off ? "#9ca3af" : "#374151", textDecoration: off ? "line-through" : "none" }}>
                              {value}
                            </span>
                          );
                        }}
                      />
                      <Bar yAxisId="left" dataKey="atestados" name="Atestados" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} hide={evolHidden.has("atestados")} />
                      <Bar yAxisId="left" dataKey="acidentes" name="Acidentes" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={48} hide={evolHidden.has("acidentes")} />
                      <Line yAxisId="right" type="monotone" dataKey="diasAtestado" name="Dias Atestado" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} hide={evolHidden.has("diasAtestado")} />
                      <Line yAxisId="right" type="monotone" dataKey="diasAcidente" name="Dias Acidente" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} hide={evolHidden.has("diasAcidente")} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              />

              {/* Últimos eventos */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-emerald-600" /> Últimos Atestados</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {d.ultimosAtestados.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum atestado no período.</p>}
                      {/* Rev. 1968 — Linhas agora clicáveis: abrem o raio-x do colaborador (EmployeeDetailDialog). */}
                      {d.ultimosAtestados.map((a) => (
                        <button key={a.id} type="button" onClick={() => (a as any).employeeId && setSelectedEmployeeId((a as any).employeeId)}
                          className="w-full text-left p-3 hover:bg-emerald-50/50 transition-colors flex items-start gap-3 cursor-pointer"
                          title="Clique para abrir o detalhe do colaborador">
                          <span className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <PersonPhoto src={(a as any).fotoUrl} alt={a.nome || "—"} size="sm" caption={a.funcao || undefined} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-blue-700 hover:underline">{a.nome}</p>
                            <p className="text-xs text-gray-500 truncate">{a.funcao || "—"} · {a.tipo}{a.cid ? ` · CID ${a.cid}` : ""}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-blue-600 tabular-nums">{a.dias} dia(s)</p>
                            <p className="text-[10px] text-gray-500 tabular-nums">{a.data}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Últimos Acidentes</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {d.ultimosAcidentes.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum acidente no período.</p>}
                      {/* Rev. 1968 — Linhas clicáveis idem Últimos Atestados. */}
                      {d.ultimosAcidentes.map((a) => (
                        <button key={a.id} type="button" onClick={() => (a as any).employeeId && setSelectedEmployeeId((a as any).employeeId)}
                          className="w-full text-left p-3 hover:bg-red-50/50 transition-colors flex items-start gap-3 cursor-pointer"
                          title="Clique para abrir o detalhe do colaborador">
                          <span className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <PersonPhoto src={(a as any).fotoUrl} alt={a.nome || "—"} size="sm" caption={a.funcao || undefined} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-blue-700 hover:underline">{a.nome}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {a.funcao || "—"} · {a.tipo} · <span style={{ color: GRAV_COLORS[a.gravidade] || "#6b7280" }}>{a.gravidade}</span>
                              {a.parteCorpo ? ` · ${a.parteCorpo}` : ""}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-red-600 tabular-nums">{a.dias} dia(s)</p>
                            <p className="text-[10px] text-gray-500 tabular-nums">{a.data}{a.hora ? ` ${a.hora}` : ""}</p>
                            {a.catNumero ? <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-0.5">CAT {a.catNumero}</Badge> :
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-0.5 border-amber-300 text-amber-700">s/ CAT</Badge>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ============ ATESTADOS ============ */}
            <TabsContent value="atestados" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={FileCheck2} label="Total" value={fmtNum(d.atestados.total)} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" />
                <KPI icon={Clock} label="Dias de Afastamento" value={fmtNum(d.atestados.totalDiasAfastamento)} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
                <KPI icon={Users} label="Colaboradores Afetados" value={fmtNum(d.atestados.colaboradoresAfetados)} color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200" />
                <KPI icon={Stethoscope} label="Com CID / Sem CID" value={`${fmtNum(d.atestados.comCID)} / ${fmtNum(d.atestados.semCID)}`} color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Atestados por Tipo"
                  height={280}
                  isEmpty={d.atestados.porTipo.length === 0}
                  tableData={d.atestados.porTipo}
                  tableColumns={[
                    { key: "tipo", label: "Tipo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                    { key: "dias", label: "Dias", align: "right" },
                  ]}
                  drillDown={drillAtestadosBy("tipo", (r: any) => r.tipo)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <PieChart>
                        <Pie data={d.atestados.porTipo} dataKey="quantidade" nameKey="tipo" cx="50%" cy="45%" outerRadius={Math.min(110, h / 3)} labelLine={false}>
                          {d.atestados.porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [`${fmtNum(v as number)}`, n]} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Top 10 CIDs"
                  height={280}
                  emptyMessage="Nenhum CID registrado."
                  isEmpty={d.atestados.topCIDs.length === 0}
                  tableData={(d.atestados.topCIDs ?? []).map((r: any) => ({ ...r, descricao: cidDescricao(r.cid) || "—" }))}
                  tableColumns={[
                    { key: "cid", label: "CID" },
                    { key: "descricao", label: "Descrição (CID-10)" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                    { key: "dias", label: "Dias", align: "right" },
                  ]}
                  drillDown={drillAtestadosBy("cid", (r: any) => r.cid)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={d.atestados.topCIDs} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="cid" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip
                          formatter={(v: any) => v}
                          labelFormatter={(l: any) => {
                            const desc = cidDescricao(l);
                            return desc ? `${l} — ${desc}` : String(l);
                          }}
                        />
                        <Bar dataKey="quantidade" name="Qtd" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <ChartCard
                title="Top 10 Motivos"
                height={300}
                isEmpty={d.atestados.porMotivo.length === 0}
                emptyMessage="Sem motivos registrados."
                tableData={d.atestados.porMotivo}
                tableColumns={[
                  { key: "motivo", label: "Motivo" },
                  { key: "quantidade", label: "Quantidade", align: "right" },
                  { key: "dias", label: "Dias", align: "right" },
                ]}
                drillDown={drillAtestadosBy("motivo", (r: any) => r.motivo)}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={(d.atestados.porMotivo ?? []).map((m: any) => ({ ...m, motivoCurto: truncate(m.motivo, 16) }))} margin={{ top: 10, right: 20, left: 0, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="motivoCurto" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} height={80} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).motivo : "")} />
                      <Legend />
                      <Bar dataKey="quantidade" name="Qtd" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="dias" name="Dias" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              />

              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Funcionários — Atestados</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Dias Afastamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {d.atestados.topFuncionarios.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sem dados.</td></tr>
                        )}
                        {d.atestados.topFuncionarios.map((f, i) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500 align-top">{i + 1}</td>
                            <td className="px-3 py-2 font-medium align-top">
                              <div className="flex items-start gap-2">
                                <EmployeeAvatar fotoUrl={(f as any).fotoUrl} nome={f.nome} onZoom={(url, nome) => setFotoZoom({ url, nome })} />
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                    onClick={() => setSelectedEmployeeId(f.employeeId)}
                                    title="Ver todos os atestados deste funcionário"
                                  >
                                    {f.nome}
                                  </button>
                                  {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                                  <EmployeeMeta f={f} />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{f.dias}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ ACIDENTES ============ */}
            <TabsContent value="acidentes" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={AlertTriangle} label="Total Acidentes" value={fmtNum(d.acidentes.total)} color="text-red-600" bg="bg-red-50" border="border-red-200" />
                <KPI icon={Clock} label="Dias Perdidos" value={fmtNum(d.acidentes.totalDiasAfastamento)} color="text-orange-600" bg="bg-orange-50" border="border-orange-200" />
                <KPI icon={Activity} label="Taxa Frequência" value={fmtNum(d.acidentes.taxaFrequencia, 2)} sub="× 1.000.000 / HH" color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
                <KPI icon={TrendingUp} label="Taxa Gravidade" value={fmtNum(d.acidentes.taxaGravidade, 2)} sub="× 1.000.000 / HH" color="text-pink-600" bg="bg-pink-50" border="border-pink-200" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Por Gravidade"
                  height={280}
                  isEmpty={d.acidentes.porGravidade.length === 0}
                  tableData={d.acidentes.porGravidade}
                  tableColumns={[
                    { key: "gravidade", label: "Gravidade" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  drillDown={drillAcidentesBy("gravidade", (r: any) => r.gravidade)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <PieChart>
                        <Pie data={d.acidentes.porGravidade} dataKey="quantidade" nameKey="gravidade" cx="50%" cy="45%" outerRadius={Math.min(110, h / 3)} labelLine={false}>
                          {d.acidentes.porGravidade.map((g, i) => <Cell key={i} fill={GRAV_COLORS[g.gravidade] || COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Por Tipo de Acidente"
                  height={280}
                  isEmpty={d.acidentes.porTipo.length === 0}
                  tableData={d.acidentes.porTipo}
                  tableColumns={[
                    { key: "tipo", label: "Tipo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  drillDown={drillAcidentesBy("tipo", (r: any) => r.tipo)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porTipo ?? []).map((x: any) => ({ ...x, tipoCurto: truncate(x.tipo, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="tipoCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).tipo : "")} />
                        <Bar dataKey="quantidade" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Top Partes do Corpo Atingidas"
                  height={280}
                  isEmpty={d.acidentes.porParteCorpo.length === 0}
                  tableData={d.acidentes.porParteCorpo}
                  tableColumns={[
                    { key: "parte", label: "Parte do corpo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  drillDown={drillAcidentesBy("parteCorpo", (r: any) => r.parte)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porParteCorpo ?? []).map((x: any) => ({ ...x, parteCurto: truncate(x.parte, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="parteCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).parte : "")} />
                        <Bar dataKey="quantidade" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Top Locais"
                  height={280}
                  isEmpty={d.acidentes.porLocal.length === 0}
                  tableData={d.acidentes.porLocal}
                  tableColumns={[
                    { key: "local", label: "Local" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  drillDown={drillAcidentesBy("local", (r: any) => r.local)}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porLocal ?? []).map((x: any) => ({ ...x, localCurto: truncate(x.local, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="localCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).local : "")} />
                        <Bar dataKey="quantidade" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Funcionários — Acidentes</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Dias Afastamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {d.acidentes.topFuncionarios.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sem dados.</td></tr>
                        )}
                        {d.acidentes.topFuncionarios.map((f, i) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500 align-top">{i + 1}</td>
                            <td className="px-3 py-2 font-medium align-top">
                              <div className="flex items-start gap-2">
                                <EmployeeAvatar fotoUrl={(f as any).fotoUrl} nome={f.nome} onZoom={(url, nome) => setFotoZoom({ url, nome })} />
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                    onClick={() => setSelectedEmployeeId(f.employeeId)}
                                    title="Ver todos os acidentes deste funcionário"
                                  >
                                    {f.nome}
                                  </button>
                                  {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                                  <EmployeeMeta f={f} />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-orange-700">{f.dias}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ AVANÇADO ============ */}
            <TabsContent value="avancado" className="space-y-4">
              {/* Indicadores Acionáveis para reduzir absenteísmo */}
              {d.indicadoresAcionaveis && (
                <Card className="border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-blue-600" /> Indicadores Acionáveis — Foco em Reduzir Absenteísmo
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">Sinais de alerta para investigar causas. Clique em cada card para ver os colaboradores envolvidos.</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Card className="bg-rose-50 border-rose-200 cursor-pointer hover:shadow transition" onClick={() => setIndicadorDetalhe({ titulo: "Atestados de curta duração (1–2 dias)", descricao: "Atestados curtos repetidos podem indicar absenteísmo voluntário. Avalie políticas de bonificação por assiduidade.", lista: d.indicadoresAcionaveis.atestadosCurtaDuracao.lista })}>
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Curta duração (1–2 dias)</p>
                          <p className="text-2xl font-bold text-rose-700">{d.indicadoresAcionaveis.atestadosCurtaDuracao.quantidade}</p>
                          <p className="text-[11px] text-gray-500">{d.indicadoresAcionaveis.atestadosCurtaDuracao.dias} dias afastados</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50 border-purple-200 cursor-pointer hover:shadow transition" onClick={() => setIndicadorDetalhe({ titulo: "Atestados de longa duração (≥15 dias / INSS)", descricao: "Afastamentos longos a partir do 16º dia caem para o INSS. Reabilitação e adaptação de função reduzem custo.", lista: d.indicadoresAcionaveis.atestadosLongaDuracao.lista })}>
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Longa duração (≥15 dias)</p>
                          <p className="text-2xl font-bold text-purple-700">{d.indicadoresAcionaveis.atestadosLongaDuracao.quantidade}</p>
                          <p className="text-[11px] text-gray-500">{d.indicadoresAcionaveis.atestadosLongaDuracao.dias} dias afastados</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-amber-50 border-amber-200 cursor-pointer hover:shadow transition" onClick={() => setIndicadorDetalhe({ titulo: "Atestados em segunda-feira", descricao: "Concentração às segundas é forte indício de absenteísmo de fim-de-semana estendido. Avalie clima organizacional e turno.", lista: d.indicadoresAcionaveis.atestadosSegundaFeira.lista })}>
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Atestados na 2ª-feira</p>
                          <p className="text-2xl font-bold text-amber-700">{d.indicadoresAcionaveis.atestadosSegundaFeira.quantidade} <span className="text-sm font-normal text-amber-600">({fmtNum(d.indicadoresAcionaveis.atestadosSegundaFeira.pct, 1)}%)</span></p>
                          <p className="text-[11px] text-gray-500">do total de atestados</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50 border-orange-200 cursor-pointer hover:shadow transition" onClick={() => setIndicadorDetalhe({ titulo: "Atestados em sexta-feira", descricao: "Picos às sextas também sinalizam fim-de-semana estendido.", lista: d.indicadoresAcionaveis.atestadosSextaFeira.lista })}>
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Atestados na 6ª-feira</p>
                          <p className="text-2xl font-bold text-orange-700">{d.indicadoresAcionaveis.atestadosSextaFeira.quantidade} <span className="text-sm font-normal text-orange-600">({fmtNum(d.indicadoresAcionaveis.atestadosSextaFeira.pct, 1)}%)</span></p>
                          <p className="text-[11px] text-gray-500">do total de atestados</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-50 border-red-200 cursor-pointer hover:shadow transition" onClick={() => setReincidenciaDetalhe(true)}>
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Reincidência mesmo CID</p>
                          <p className="text-2xl font-bold text-red-700">{d.indicadoresAcionaveis.reincidenciaCID.length}</p>
                          <p className="text-[11px] text-gray-500">colaborador(es) com 2+ atestados do mesmo CID</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-3">
                          <p className="text-[11px] uppercase text-gray-600">Absenteísmo médio</p>
                          <p className="text-2xl font-bold text-blue-700">{fmtNum(d.indicadoresAcionaveis.absenteismoPct, 2)}%</p>
                          <p className="text-[11px] text-gray-500">% de HH perdidas no período</p>
                          <p className="text-[10px] text-gray-500 mt-1">Cadência média: 1 atestado a cada {fmtNum(d.indicadoresAcionaveis.cadenciaMediaDias, 1)} dias</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Comparativo período anterior */}
              {d.comparativoPeriodoAnterior && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Comparativo com Período Anterior</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500 mb-3">Período anterior: {d.comparativoPeriodoAnterior.periodoAnterior.dataInicio} → {d.comparativoPeriodoAnterior.periodoAnterior.dataFim}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Atestados", k: d.comparativoPeriodoAnterior.atestados, color: "text-emerald-700" },
                        { label: "Dias Atestado", k: d.comparativoPeriodoAnterior.diasAtestado, color: "text-blue-700" },
                        { label: "Acidentes", k: d.comparativoPeriodoAnterior.acidentes, color: "text-red-700" },
                        { label: "Dias Acidente", k: d.comparativoPeriodoAnterior.diasAcidente, color: "text-orange-700" },
                      ].map((it) => {
                        const up = it.k.varPct > 0;
                        const down = it.k.varPct < 0;
                        const isAtestadoOuAcidente = /Atestado|Acidente/i.test(it.label);
                        const ruim = isAtestadoOuAcidente ? up : up;
                        return (
                          <div key={it.label} className="border rounded-lg p-3">
                            <p className="text-xs uppercase text-gray-500">{it.label}</p>
                            <p className={`text-2xl font-bold ${it.color}`}>{fmtNum(it.k.atual)}</p>
                            <p className="text-[11px] text-gray-500">vs. {fmtNum(it.k.anterior)} anterior</p>
                            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${ruim ? "text-red-600" : down ? "text-emerald-600" : "text-gray-500"}`}>
                              {up ? <ArrowUp className="h-3 w-3" /> : down ? <ArrowDown className="h-3 w-3" /> : null}
                              {fmtNum(Math.abs(it.k.varPct), 1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pirâmide de Bird + Cobertura CAT + Custo */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-amber-600" /> Pirâmide de Bird</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { label: "Graves / Fatal", v: d.piramideBird?.graves ?? 0, color: "bg-red-600", w: "w-1/4" },
                        { label: "Moderados / Leve c/ Afast", v: d.piramideBird?.moderados ?? 0, color: "bg-orange-500", w: "w-2/4" },
                        { label: "Leves / Primeiros Socorros", v: d.piramideBird?.leves ?? 0, color: "bg-yellow-500", w: "w-3/4" },
                        { label: "Quase-acidentes", v: d.piramideBird?.quaseAcidentes ?? 0, color: "bg-blue-500", w: "w-full" },
                      ].map((it, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className={`mx-auto ${it.w} ${it.color} text-white text-center py-2 rounded-md font-bold text-lg shadow`}>{it.v}</div>
                          </div>
                          <div className="w-56 text-xs text-gray-700">{it.label}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3">A pirâmide invertida mostra que pequenos eventos (base) prenunciam os graves (topo). Quanto maior a base reportada, melhor a maturidade SST.</p>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <Card className="bg-amber-50 border-amber-200 border">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase text-gray-600">Cobertura CAT</p>
                        <p className="text-3xl font-bold text-amber-700">{fmtNum(d.coberturaCAT ?? 0, 1)}%</p>
                        <p className="text-[11px] text-gray-500 mt-1">% de acidentes (que exigem) com CAT emitida</p>
                      </div>
                      <FileWarning className="h-10 w-10 text-amber-600" />
                    </CardContent>
                  </Card>
                  <Card
                    className="bg-green-50 border-green-200 border cursor-pointer hover:bg-green-100 hover:shadow transition"
                    onClick={() => setShowCustoDetalhe(true)}
                    title="Clique para ver a memória de cálculo por colaborador"
                  >
                    <CardContent className="p-4">
                      <p className="text-xs uppercase text-gray-600 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Custo Estimado de Afastamento</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">R$ {fmtNum(d.custoEstimadoAfastamento?.total ?? 0, 2)}</p>
                      <div className="text-[11px] text-gray-600 mt-2 grid grid-cols-2 gap-1">
                        <div>Atestados: <span className="font-semibold">R$ {fmtNum(d.custoEstimadoAfastamento?.atestados ?? 0, 2)}</span></div>
                        <div>Acidentes: <span className="font-semibold">R$ {fmtNum(d.custoEstimadoAfastamento?.acidentes ?? 0, 2)}</span></div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">Base: salário-base ÷ 30 × dias afastados (não inclui encargos)</p>
                      <p className="text-[10px] text-green-700 font-medium mt-1">→ Clique para ver memória de cálculo por colaborador</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Heatmap dia/hora */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlarmClock className="h-4 w-4" /> Mapa de Calor — Acidentes por Dia da Semana × Hora</CardTitle></CardHeader>
                <CardContent>
                  {(d.heatmapDiaHora ?? []).length === 0 ? <p className="text-sm text-gray-500">Sem registros com hora informada.</p> : (() => {
                    const max = Math.max(1, ...(d.heatmapDiaHora ?? []).map((c: any) => c.qtd));
                    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                    const cellMap = new Map<string, number>();
                    for (const c of d.heatmapDiaHora ?? []) cellMap.set(`${c.diaIdx}_${c.hora}`, c.qtd);
                    return (
                      <div className="overflow-x-auto">
                        <table className="text-xs border-collapse">
                          <thead><tr><th className="p-1"></th>{Array.from({ length: 24 }, (_, h) => <th key={h} className="p-1 text-gray-500 font-normal">{h}h</th>)}</tr></thead>
                          <tbody>
                            {dias.map((dia, di) => (
                              <tr key={dia}>
                                <td className="p-1 pr-2 font-semibold text-gray-700">{dia}</td>
                                {Array.from({ length: 24 }, (_, h) => {
                                  const v = cellMap.get(`${di}_${h}`) || 0;
                                  const op = v === 0 ? 0 : 0.15 + (v / max) * 0.85;
                                  return (
                                    <td key={h} className="p-0.5">
                                      <div className="w-7 h-7 rounded text-center text-[10px] font-bold flex items-center justify-center"
                                        style={{ backgroundColor: v > 0 ? `rgba(220, 38, 38, ${op})` : "#f3f4f6", color: op > 0.5 ? "white" : "#374151" }}
                                        title={`${dia} ${h}h: ${v} acidente(s)`}>
                                        {v || ""}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Atestados/Acidentes por dia da semana */}
              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Atestados por Dia da Semana"
                  icon={<CalendarDays className="h-4 w-4 text-emerald-600" />}
                  height={260}
                  isEmpty={(d.atestadosPorDiaSemana ?? []).length === 0}
                  tableData={d.atestadosPorDiaSemana ?? []}
                  tableColumns={[
                    { key: "dia", label: "Dia" },
                    { key: "qtd", label: "Atestados", align: "right" },
                    { key: "dias", label: "Dias", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart
                        data={d.atestadosPorDiaSemana ?? []}
                        margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                        onClick={(e: any) => {
                          const p = e?.activePayload?.[0]?.payload;
                          if (p && typeof p.diaIdx === "number" && p.qtd > 0) {
                            setDiaSemanaDetalhe({ tipo: "atestado", diaIdx: p.diaIdx, dia: p.dia });
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="qtd" name="Atestados" fill="#10b981" radius={[4, 4, 0, 0]} cursor="pointer" />
                        <Bar dataKey="dias" name="Dias" fill="#3b82f6" radius={[4, 4, 0, 0]} cursor="pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Acidentes por Dia da Semana"
                  icon={<CalendarDays className="h-4 w-4 text-red-600" />}
                  height={260}
                  isEmpty={(d.acidentesPorDiaSemana ?? []).length === 0}
                  tableData={d.acidentesPorDiaSemana ?? []}
                  tableColumns={[
                    { key: "dia", label: "Dia" },
                    { key: "qtd", label: "Acidentes", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart
                        data={d.acidentesPorDiaSemana ?? []}
                        margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                        onClick={(e: any) => {
                          const p = e?.activePayload?.[0]?.payload;
                          if (p && typeof p.diaIdx === "number" && p.qtd > 0) {
                            setDiaSemanaDetalhe({ tipo: "acidente", diaIdx: p.diaIdx, dia: p.dia });
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="qtd" name="Acidentes" fill="#ef4444" radius={[4, 4, 0, 0]} cursor="pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              {/* Atestados recorrentes */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4 text-purple-600" /> Funcionários com Atestados Recorrentes (3+)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd Atestados</th>
                          <th className="px-3 py-2 text-right">Dias Acumulados</th>
                          <th className="px-3 py-2 text-right">Média/Atestado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.atestadosRecorrentes ?? []).length === 0 && (<tr><td colSpan={5} className="p-4 text-center text-gray-500">Nenhum funcionário com atestado recorrente no período.</td></tr>)}
                        {(d.atestadosRecorrentes ?? []).map((f: any) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">
                              <div className="flex items-center gap-2">
                                <PersonPhoto src={f.fotoUrl} alt={f.nome || "—"} size="sm" caption={f.funcao || undefined} />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                    onClick={() => setSelectedEmployeeId(f.employeeId)}
                                    title="Ver todos os atestados deste funcionário"
                                  >
                                    {f.nome}
                                  </button>
                                  {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-purple-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{f.dias}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtNum(f.dias / Math.max(1, f.quantidade), 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ OBRAS / AÇÕES ============ */}
            <TabsContent value="obras" className="space-y-4">
              {/* Atestados & Afastamentos por Obra */}
              <ChartCard
                title="Atestados & Afastamentos — por Obra"
                icon={<MapPin className="h-4 w-4 text-blue-600" />}
                height={Math.max(260, (d.atestadosPorObra ?? []).filter((o: any) => o.qtdAtestados > 0).length * 32)}
                isEmpty={(d.atestadosPorObra ?? []).filter((o: any) => o.qtdAtestados > 0).length === 0}
                emptyMessage="Sem atestados vinculados a obras no período."
                tableData={(d.atestadosPorObra ?? []).filter((o: any) => o.qtdAtestados > 0)}
                tableColumns={[
                  { key: "obraNome", label: "Obra" },
                  { key: "qtdAtestados", label: "Atestados", align: "right" },
                  { key: "diasAfastamento", label: "Dias Afast.", align: "right" },
                  { key: "afastamentosINSS", label: "INSS (≥15d)", align: "right" },
                  { key: "colaboradoresAfetados", label: "Colab.", align: "right" },
                ]}
                drillDown={{
                  getRows: (row: any) =>
                    (d?.atestadosLista ?? []).filter((a: any) =>
                      row.obraId == null ? a.obraId == null : a.obraId === row.obraId
                    ),
                  columns: drillCols,
                  labelKey: ((row: any) => row.obraNome) as any,
                  onRowClick: (r: any) => setSelectedEmployeeId(r.employeeId),
                  emptyMessage: "Nenhum atestado nesta obra.",
                }}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart
                      data={(d.atestadosPorObra ?? [])
                        .filter((o: any) => o.qtdAtestados > 0)
                        .slice(0, 15)
                        .map((o: any) => ({ ...o, obraCurta: truncate(o.obraNome, 24) }))}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="obraCurta" type="category" tick={{ fontSize: 11 }} width={170} />
                      <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).obraNome : "")} />
                      <Legend />
                      <Bar dataKey="qtdAtestados" name="Atestados" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="diasAfastamento" name="Dias Afast." fill="#06b6d4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              />

              {/* Atestados por Obra — Ranking (Rev. 2948) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-blue-600" /> Atestados por Obra — Ranking
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left w-12">#</th>
                          <th className="px-3 py-2 text-left">Obra</th>
                          <th className="px-3 py-2 text-right">Atestados</th>
                          <th className="px-3 py-2 text-right">Dias Afast.</th>
                          <th className="px-3 py-2 text-right">Colab. Afetados</th>
                          <th className="px-3 py-2 text-right">INSS (≥15d)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(() => {
                          const rank = (d.atestadosPorObra ?? [])
                            .filter((o: any) => (o.qtdAtestados ?? 0) > 0)
                            .slice()
                            .sort((a: any, b: any) => (b.qtdAtestados - a.qtdAtestados) || (b.diasAfastamento - a.diasAfastamento));
                          if (rank.length === 0) {
                            return (<tr><td colSpan={6} className="p-4 text-center text-gray-500">Sem atestados vinculados a obras no período.</td></tr>);
                          }
                          const totAt = rank.reduce((s: number, o: any) => s + (o.qtdAtestados || 0), 0);
                          const totDias = rank.reduce((s: number, o: any) => s + (o.diasAfastamento || 0), 0);
                          const totColab = rank.reduce((s: number, o: any) => s + (o.colaboradoresAfetados || 0), 0);
                          const totInss = rank.reduce((s: number, o: any) => s + (o.afastamentosINSS || 0), 0);
                          return (
                            <>
                              {rank.map((o: any, i: number) => (
                                <tr key={o.obraId ?? `semobra-${i}`} className={`hover:bg-gray-50 ${i === 0 ? "bg-blue-50/40" : ""}`}>
                                  <td className="px-3 py-2 font-semibold text-gray-500">{i + 1}º</td>
                                  <td className="px-3 py-2 font-medium">{o.obraNome}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`font-bold text-lg ${i === 0 ? "text-blue-700" : "text-blue-600"}`}>{fmtNum(o.qtdAtestados)}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-700">{fmtNum(o.diasAfastamento)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{fmtNum(o.colaboradoresAfetados)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{fmtNum(o.afastamentosINSS)}</td>
                                </tr>
                              ))}
                              <tr className="bg-gray-50 font-semibold text-gray-700">
                                <td className="px-3 py-2" />
                                <td className="px-3 py-2 text-right">Total ({rank.length} obra{rank.length > 1 ? "s" : ""})</td>
                                <td className="px-3 py-2 text-right text-blue-700">{fmtNum(totAt)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(totDias)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(totColab)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(totInss)}</td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Dias sem acidente */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600" /> Dias sem Acidente — por Obra</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Obra</th>
                          <th className="px-3 py-2 text-left">Último Acidente</th>
                          <th className="px-3 py-2 text-right">Dias sem Acidente</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.diasSemAcidente ?? []).length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-gray-500">Sem obras cadastradas.</td></tr>)}
                        {(d.diasSemAcidente ?? []).map((o: any) => (
                          <tr key={o.obraId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{o.obraNome}</td>
                            <td className="px-3 py-2 text-gray-600">{o.ultimaData ? o.ultimaData.split("-").reverse().join("/") : <span className="text-emerald-600">Nunca</span>}</td>
                            <td className="px-3 py-2 text-right">
                              {o.dias === null
                                ? <span className="font-bold text-gray-400">—</span>
                                : o.ultimaData
                                  ? <span className={`font-bold text-lg ${o.dias >= 90 ? "text-emerald-600" : o.dias >= 30 ? "text-blue-600" : "text-orange-600"}`}>{o.dias}</span>
                                  : <span className="font-bold text-lg text-emerald-600">{o.dias}</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {!o.ultimaData
                                ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">Sem registros</Badge>
                                : o.dias >= 90 ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">Excelente</Badge>
                                  : o.dias >= 30 ? <Badge className="bg-blue-100 text-blue-700 border-blue-300" variant="outline">Bom</Badge>
                                    : <Badge className="bg-orange-100 text-orange-700 border-orange-300" variant="outline">Atenção</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Ranking de obras por nº acidentes */}
              <ChartCard
                title="Ranking de Obras com Mais Acidentes"
                icon={<BarChart3 className="h-4 w-4 text-red-600" />}
                height={Math.max(260, (d.rankingObras ?? []).length * 32)}
                isEmpty={(d.rankingObras ?? []).length === 0}
                emptyMessage="Sem acidentes vinculados a obras no período."
                tableData={d.rankingObras ?? []}
                tableColumns={[
                  { key: "obraNome", label: "Obra" },
                  { key: "qtd", label: "Acidentes", align: "right" },
                  { key: "dias", label: "Dias Perdidos", align: "right" },
                ]}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={(d.rankingObras ?? []).map((o: any) => ({ ...o, obraCurta: truncate(o.obraNome, 24) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="obraCurta" type="category" tick={{ fontSize: 11 }} width={170} />
                      <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).obraNome : "")} />
                      <Legend />
                      <Bar dataKey="qtd" name="Acidentes" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="dias" name="Dias Perdidos" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              />

              {/* Ações corretivas */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPI icon={Activity} label="Ações Corretivas (total)" value={fmtNum(d.acoesCorretivas?.total ?? 0)} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
                <KPI icon={ShieldAlert} label="Ações em Aberto" value={fmtNum(d.acoesCorretivas?.abertas ?? 0)} color="text-amber-600" bg="bg-amber-50" border="border-amber-200" />
                <KPI icon={AlertTriangle} label="Ações Vencidas" value={fmtNum(d.acoesCorretivas?.vencidas ?? 0)} color="text-red-600" bg="bg-red-50" border="border-red-200" />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Ações Corretivas Vencidas</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Obra</th>
                          <th className="px-3 py-2 text-left">Ação</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-right">Prazo</th>
                          <th className="px-3 py-2 text-right">Dias Vencido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.acoesCorretivas?.listaVencidas ?? []).length === 0 && (<tr><td colSpan={6} className="p-4 text-center text-emerald-600">Nenhuma ação vencida 🎉</td></tr>)}
                        {(d.acoesCorretivas?.listaVencidas ?? []).map((a: any) => {
                          const dv = Math.floor((new Date().getTime() - new Date(a.prazo + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <tr key={a.id} className="hover:bg-red-50">
                              <td className="px-3 py-2">{a.employeeNome || "—"}</td>
                              <td className="px-3 py-2 text-gray-700">{a.obraNome || "—"}</td>
                              <td className="px-3 py-2 text-gray-700 max-w-md truncate">{a.acao}</td>
                              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{a.status}</Badge></td>
                              <td className="px-3 py-2 text-right text-gray-700">{a.prazo}</td>
                              <td className="px-3 py-2 text-right font-bold text-red-600">{dv} dia(s)</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <EmployeeDetailDialog
          open={selectedEmployeeId !== null}
          onOpenChange={(v) => { if (!v) setSelectedEmployeeId(null); }}
          employeeId={selectedEmployeeId}
          dataInicio={dataInicio}
          dataFim={dataFim}
        />

        {/* Rev. 1976 — Modal de foto ampliada (lightbox). Clica no fundo ou ESC fecha. */}
        <Dialog open={fotoZoom !== null} onOpenChange={(v) => { if (!v) setFotoZoom(null); }}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-auto sm:h-auto sm:max-w-[90vw] sm:max-h-[90vh] p-0 overflow-hidden bg-black/95 sm:rounded-xl border-0 flex flex-col items-center justify-center"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{fotoZoom?.nome || "Foto do funcionário"}</DialogTitle>
            </DialogHeader>
            <button
              type="button"
              onClick={() => setFotoZoom(null)}
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
              aria-label="Fechar"
            >
              <XIcon className="w-5 h-5" />
            </button>
            {fotoZoom && (
              <>
                <img
                  src={fotoZoom.url}
                  alt={fotoZoom.nome}
                  className="max-w-full max-h-[calc(100vh-80px)] sm:max-h-[80vh] object-contain"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 py-4 text-white text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium">
                    <UserIcon className="w-4 h-4" />
                    {fotoZoom.nome}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Memória de cálculo do Custo Estimado de Afastamento */}
        <Dialog open={showCustoDetalhe} onOpenChange={setShowCustoDetalhe}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
                Custo Estimado de Afastamento — Memória de Cálculo
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1">
                Período: {dataInicio.split("-").reverse().join("/")} a {dataFim.split("-").reverse().join("/")} ·
                Fórmula por colaborador: <strong>(salário-base ÷ 30) × dias afastados</strong>.
                Não inclui encargos (INSS patronal, FGTS, provisões).
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {(() => {
                const det: any[] = (d?.custoEstimadoAfastamento as any)?.detalhe ?? [];
                const totAt = d?.custoEstimadoAfastamento?.atestados ?? 0;
                const totAc = d?.custoEstimadoAfastamento?.acidentes ?? 0;
                const tot = d?.custoEstimadoAfastamento?.total ?? 0;
                const totDiasAt = det.reduce((s, r) => s + (r.diasAtestado || 0), 0);
                const totDiasAc = det.reduce((s, r) => s + (r.diasAcidente || 0), 0);
                if (det.length === 0) {
                  return <p className="text-sm text-gray-500 py-12 text-center">Nenhum afastamento com salário-base cadastrado no período.</p>;
                }
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                      <Card className="bg-gray-50 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-gray-500">Colaboradores afetados</p>
                        <p className="text-xl font-bold text-gray-800 mt-1">{det.length}</p>
                      </CardContent></Card>
                      <Card className="bg-blue-50 border-blue-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-blue-700">Custo Atestados</p>
                        <p className="text-xl font-bold text-blue-800 mt-1">R$ {fmtNum(totAt, 2)}</p>
                        <p className="text-[10px] text-blue-700 mt-0.5">{totDiasAt} dia(s)</p>
                      </CardContent></Card>
                      <Card className="bg-red-50 border-red-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-red-700">Custo Acidentes</p>
                        <p className="text-xl font-bold text-red-800 mt-1">R$ {fmtNum(totAc, 2)}</p>
                        <p className="text-[10px] text-red-700 mt-0.5">{totDiasAc} dia(s)</p>
                      </CardContent></Card>
                      <Card className="bg-green-50 border-green-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-green-700">Custo Total</p>
                        <p className="text-xl font-bold text-green-800 mt-1">R$ {fmtNum(tot, 2)}</p>
                        <p className="text-[10px] text-green-700 mt-0.5">{totDiasAt + totDiasAc} dia(s)</p>
                      </CardContent></Card>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 text-gray-700 text-xs uppercase">
                          <tr>
                            <th className="text-left p-2 w-10">#</th>
                            <th className="text-left p-2">Colaborador</th>
                            <th className="text-left p-2">Função</th>
                            <th className="text-right p-2">Salário-base</th>
                            <th className="text-right p-2">Valor/dia</th>
                            <th className="text-right p-2 text-blue-700">Dias atest.</th>
                            <th className="text-right p-2 text-red-700">Dias acid.</th>
                            <th className="text-right p-2 text-blue-700">Custo atest.</th>
                            <th className="text-right p-2 text-red-700">Custo acid.</th>
                            <th className="text-right p-2 text-green-700">Custo total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.map((r: any, i: number) => (
                            <tr
                              key={r.employeeId}
                              className="border-t hover:bg-gray-50 cursor-pointer"
                              onClick={() => { setShowCustoDetalhe(false); setSelectedEmployeeId(r.employeeId); }}
                              title="Ver detalhamento do colaborador"
                            >
                              <td className="p-2 text-gray-500">{i + 1}</td>
                              <td className="p-2">
                                <div className="font-medium text-gray-800">{r.nome}</div>
                                <div className="text-[10px] text-gray-500">#{r.codigoInterno || r.matricula || r.employeeId}</div>
                              </td>
                              <td className="p-2 text-gray-600 text-xs">{r.funcao || "—"}</td>
                              <td className="p-2 text-right tabular-nums">R$ {fmtNum(r.salarioBase, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-gray-600">R$ {fmtNum(r.valorDia, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-blue-700">{r.diasAtestado || 0}</td>
                              <td className="p-2 text-right tabular-nums text-red-700">{r.diasAcidente || 0}</td>
                              <td className="p-2 text-right tabular-nums text-blue-700">R$ {fmtNum(r.custoAtestado, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-red-700">R$ {fmtNum(r.custoAcidente, 2)}</td>
                              <td className="p-2 text-right tabular-nums font-semibold text-green-700">R$ {fmtNum(r.custoTotal, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold text-sm">
                          <tr className="border-t-2">
                            <td colSpan={5} className="p-2 text-right text-gray-700">TOTAIS</td>
                            <td className="p-2 text-right tabular-nums text-blue-700">{totDiasAt}</td>
                            <td className="p-2 text-right tabular-nums text-red-700">{totDiasAc}</td>
                            <td className="p-2 text-right tabular-nums text-blue-700">R$ {fmtNum(totAt, 2)}</td>
                            <td className="p-2 text-right tabular-nums text-red-700">R$ {fmtNum(totAc, 2)}</td>
                            <td className="p-2 text-right tabular-nums text-green-800">R$ {fmtNum(tot, 2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <p className="text-[11px] text-gray-500 mt-3">
                      Dica: clique em uma linha para abrir o detalhamento completo do colaborador (atestados, acidentes e documentos).
                    </p>
                  </>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* Detalhe de Indicador Acionável */}
        <Dialog open={!!indicadorDetalhe} onOpenChange={(v) => { if (!v) setIndicadorDetalhe(null); }}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-blue-600" />
                {indicadorDetalhe?.titulo}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1">{indicadorDetalhe?.descricao}</p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {(indicadorDetalhe?.lista ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">Nenhum registro neste indicador.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs uppercase font-semibold text-gray-600 border-b flex justify-between">
                    <span>Colaboradores envolvidos — clique para ver o detalhe completo</span>
                    <span>{indicadorDetalhe?.lista.length} registro(s)</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-left">Função</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">CID</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-right">Dias</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(indicadorDetalhe?.lista ?? []).map((a: any, i: number) => (
                        <tr key={i} className="hover:bg-blue-50 cursor-pointer" onClick={() => { setIndicadorDetalhe(null); setSelectedEmployeeId(a.employeeId); }}>
                          <td className="px-3 py-2 text-gray-600">{a.dataEmissao?.split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2 font-medium text-blue-700">{a.nome}{a.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{a.codigoInterno}</span> : null}</td>
                          <td className="px-3 py-2 text-gray-600">{a.funcao || "—"}</td>
                          <td className="px-3 py-2">{a.tipo}</td>
                          <td className="px-3 py-2">{a.cid || "—"}</td>
                          <td className="px-3 py-2">{a.motivo}</td>
                          <td className="px-3 py-2 text-right font-semibold">{a.dias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Detalhe de Reincidência por CID */}
        <Dialog open={reincidenciaDetalhe} onOpenChange={setReincidenciaDetalhe}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Reincidência — Mesmo Colaborador / Mesmo CID
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1">Colaboradores com 2 ou mais atestados do mesmo CID no período. Indicação clara de necessidade de avaliação ocupacional, exame complementar ou mudança de função.</p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {(d?.indicadoresAcionaveis?.reincidenciaCID ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">Nenhum caso de reincidência detectado no período.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-left">Função</th>
                        <th className="px-3 py-2 text-left">CID</th>
                        <th className="px-3 py-2 text-right">Atestados</th>
                        <th className="px-3 py-2 text-right">Dias afastados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(d?.indicadoresAcionaveis?.reincidenciaCID ?? []).map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-red-50 cursor-pointer" onClick={() => { setReincidenciaDetalhe(false); setSelectedEmployeeId(r.employeeId); }}>
                          <td className="px-3 py-2 font-medium text-blue-700">{r.nome}{r.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{r.codigoInterno}</span> : null}</td>
                          <td className="px-3 py-2 text-gray-600">{r.funcao || "—"}</td>
                          <td className="px-3 py-2 font-mono">{r.cid}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-700">{r.quantidade}</td>
                          <td className="px-3 py-2 text-right">{r.dias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Drill-down: Funcionários por Dia da Semana */}
        <Dialog open={!!diaSemanaDetalhe} onOpenChange={(v) => { if (!v) setDiaSemanaDetalhe(null); }}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[96vw] sm:h-[92vh] sm:max-w-5xl p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className={`h-5 w-5 ${diaSemanaDetalhe?.tipo === "atestado" ? "text-emerald-600" : "text-red-600"}`} />
                {diaSemanaDetalhe?.tipo === "atestado" ? "Atestados" : "Acidentes"} de {diaSemanaDetalhe?.dia}
                {diaSemanaQuery.data ? <Badge variant="secondary" className="ml-2">{diaSemanaQuery.data.total} registro(s)</Badge> : null}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1">Período: {dataInicio.split("-").reverse().join("/")} a {dataFim.split("-").reverse().join("/")}</p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {diaSemanaQuery.isLoading ? (
                <p className="text-sm text-gray-500 py-12 text-center">Carregando...</p>
              ) : (diaSemanaQuery.data?.registros ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">Nenhum registro neste dia.</p>
              ) : diaSemanaDetalhe?.tipo === "atestado" ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-left">Função</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">CID</th>
                        <th className="px-3 py-2 text-right">Dias</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(diaSemanaQuery.data?.registros ?? []).map((r: any) => (
                        <tr
                          key={r.id}
                          className="hover:bg-emerald-50 cursor-pointer"
                          onClick={() => { setDiaSemanaDetalhe(null); setSelectedEmployeeId(r.employeeId); }}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">{(r.dataEmissao || "").split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2 font-medium text-blue-700">
                            {r.employeeNome || `Funcionário #${r.employeeId}`}
                            {r.employeeMatricula ? <span className="text-xs text-gray-400 ml-1">#{r.employeeMatricula}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{r.employeeFuncao || "—"}</td>
                          <td className="px-3 py-2">{r.tipo || "—"}</td>
                          <td className="px-3 py-2 text-gray-700">{r.motivo || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.cid || "—"}</td>
                          <td className="px-3 py-2 text-right">{r.diasAfastamento ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-left">Função</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Gravidade</th>
                        <th className="px-3 py-2 text-left">Parte do Corpo</th>
                        <th className="px-3 py-2 text-right">Dias</th>
                        <th className="px-3 py-2 text-center">CAT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(diaSemanaQuery.data?.registros ?? []).map((r: any) => (
                        <tr
                          key={r.id}
                          className="hover:bg-red-50 cursor-pointer"
                          onClick={() => { setDiaSemanaDetalhe(null); setSelectedEmployeeId(r.employeeId); }}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">{(r.dataAcidente || "").split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2 font-medium text-blue-700">
                            {r.employeeNome || `Funcionário #${r.employeeId}`}
                            {r.employeeMatricula ? <span className="text-xs text-gray-400 ml-1">#{r.employeeMatricula}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{r.employeeFuncao || "—"}</td>
                          <td className="px-3 py-2">{r.tipoAcidente || "—"}</td>
                          <td className="px-3 py-2">{r.gravidade || "—"}</td>
                          <td className="px-3 py-2 text-gray-700">{r.parteCorpoAtingida || "—"}</td>
                          <td className="px-3 py-2 text-right">{r.diasAfastamento ?? 0}</td>
                          <td className="px-3 py-2 text-center">{r.houveCAT === 1 ? "Sim" : "Não"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Rev. 2687 — Drill-down "de onde vem o número": Total Atestados / Dias Afastamento por colaborador */}
        <Dialog open={diasDetalhe} onOpenChange={setDiasDetalhe}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-blue-600" />
                Dias de Afastamento — De onde vem o número?
              </DialogTitle>
              <div className="text-xs text-gray-600 mt-2 bg-blue-50 border border-blue-100 rounded-md p-3 flex gap-2 items-start">
                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  O total de <b>{fmtNum(d?.atestados.totalDiasAfastamento ?? 0)} dias</b> é a <b>soma</b> do campo
                  {" "}<b>"Dias de Afastamento"</b> gravado em cada atestado emitido no período
                  {" "}<b>{dataInicio.split("-").reverse().join("/")}</b> a <b>{dataFim.split("-").reverse().join("/")}</b>
                  {" "}({fmtNum(d?.atestados.total ?? 0)} atestados de {fmtNum(d?.atestados.colaboradoresAfetados ?? 0)} colaboradores).
                  {" "}A tabela abaixo mostra o detalhamento por colaborador — clique num nome para ver os atestados dele.
                </span>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {(() => {
                const lista = d?.atestados.todosFuncionarios ?? [];
                const q = diasFiltro.trim().toLowerCase();
                const filtrada = q
                  ? lista.filter((f: any) =>
                      (f.nome || "").toLowerCase().includes(q) ||
                      (f.funcao || "").toLowerCase().includes(q) ||
                      (f.codigoInterno || "").toLowerCase().includes(q) ||
                      (f.matricula || "").toLowerCase().includes(q),
                    )
                  : lista;
                const totDias = filtrada.reduce((s: number, f: any) => s + (f.dias || 0), 0);
                const totQtd = filtrada.reduce((s: number, f: any) => s + (f.quantidade || 0), 0);
                const exportCSV = () => {
                  const head = ["#", "Funcionario", "Codigo", "Funcao", "Qtd Atestados", "Dias Afastamento"];
                  const linhas = filtrada.map((f: any, i: number) => [
                    i + 1,
                    `"${(f.nome || "").replace(/"/g, '""')}"`,
                    f.codigoInterno || f.matricula || f.employeeId,
                    `"${(f.funcao || "").replace(/"/g, '""')}"`,
                    f.quantidade || 0,
                    f.dias || 0,
                  ].join(";"));
                  const csv = [head.join(";"), ...linhas, ["", "", "", "TOTAL", totQtd, totDias].join(";")].join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `dias-afastamento_${dataInicio}_${dataFim}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                };
                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                      <div className="relative flex-1 max-w-md">
                        <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={diasFiltro}
                          onChange={(e) => setDiasFiltro(e.target.value)}
                          placeholder="Filtrar por nome, função ou matrícula..."
                          className="pl-9"
                        />
                      </div>
                      <div className="text-xs text-gray-500 flex-1">
                        {filtrada.length} colaborador(es){q ? ` (de ${lista.length})` : ""}
                      </div>
                      <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtrada.length === 0}>
                        <Download className="h-4 w-4 mr-1" /> CSV
                      </Button>
                    </div>

                    {filtrada.length === 0 ? (
                      <p className="text-sm text-gray-500 py-12 text-center">Nenhum colaborador encontrado.</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                            <tr>
                              <th className="px-3 py-2 text-left w-10">#</th>
                              <th className="px-3 py-2 text-left">Funcionário</th>
                              <th className="px-3 py-2 text-left">Função</th>
                              <th className="px-3 py-2 text-right">Qtd Atestados</th>
                              <th className="px-3 py-2 text-right text-blue-700">Dias Afastamento</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {filtrada.map((f: any, i: number) => (
                              <tr
                                key={f.employeeId}
                                className="hover:bg-blue-50 cursor-pointer"
                                onClick={() => { setDiasDetalhe(false); setSelectedEmployeeId(f.employeeId); }}
                                title="Ver todos os atestados deste colaborador"
                              >
                                <td className="px-3 py-2 text-gray-500 align-top">{i + 1}</td>
                                <td className="px-3 py-2 align-top">
                                  <div className="flex items-start gap-2">
                                    <EmployeeAvatar fotoUrl={(f as any).fotoUrl} nome={f.nome} onZoom={(url, nome) => setFotoZoom({ url, nome })} />
                                    <div className="min-w-0 flex-1">
                                      <span className="font-medium text-blue-700 hover:underline">{f.nome}</span>
                                      {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{f.quantidade}</td>
                                <td className="px-3 py-2 text-right font-semibold text-blue-700">{f.dias}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 font-semibold text-sm">
                            <tr className="border-t-2">
                              <td colSpan={3} className="px-3 py-2 text-right text-gray-700">TOTAIS</td>
                              <td className="px-3 py-2 text-right text-emerald-700">{fmtNum(totQtd)}</td>
                              <td className="px-3 py-2 text-right text-blue-800">{fmtNum(totDias)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-3">
                      Dica: clique em uma linha para abrir o detalhamento completo do colaborador (todos os atestados, datas e dias).
                    </p>
                  </>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
