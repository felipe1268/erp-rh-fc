import { trpc } from "@/lib/trpc";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  FileBarChart,
  CalendarClock,
  CalendarCheck,
  AlertTriangle,
  Clock,
  Stethoscope,
  HeartPulse,
  History,
  CheckCircle2,
  XCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  CalendarX,
  FileSpreadsheet,
  X,
  Briefcase,
  CalendarDays,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

type Props = {
  employeeId: number | null;
  companyId: number | undefined;
  open: boolean;
  onClose: () => void;
};

const fmtData = (d?: string | null) => {
  if (!d) return "—";
  const s = String(d).split("T")[0];
  const [y, m, dd] = s.split("-");
  if (!y || !m || !dd) return s;
  return `${dd}/${m}/${y}`;
};

const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const fmtMes = (ym?: string | null) => {
  if (!ym) return "—";
  const [y, m] = String(ym).split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return String(ym);
  return `${MESES_PT[idx]}/${y}`;
};

const NIVEL_STYLE: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    ring: string;
    label: string;
    grad: string;
    chip: string;
  }
> = {
  efetivar: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-300 dark:border-green-800",
    text: "text-green-700 dark:text-green-400",
    ring: "stroke-green-500",
    label: "Recomendado Efetivar",
    grad: "from-green-500/15 via-emerald-500/5 to-transparent",
    chip: "bg-green-500/15 text-green-700 dark:text-green-300 ring-green-500/30",
  },
  atencao: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-300 dark:border-yellow-800",
    text: "text-yellow-700 dark:text-yellow-400",
    ring: "stroke-yellow-500",
    label: "Efetivar com Ressalvas",
    grad: "from-yellow-500/15 via-amber-500/5 to-transparent",
    chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 ring-yellow-500/30",
  },
  prorrogar: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-300 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-400",
    ring: "stroke-orange-500",
    label: "Avaliar Prorrogação",
    grad: "from-orange-500/15 via-orange-500/5 to-transparent",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/30",
  },
  desligar: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    ring: "stroke-red-500",
    label: "Avaliar Desligamento",
    grad: "from-red-500/15 via-rose-500/5 to-transparent",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30",
  },
};

function ScoreGauge({ score, ring }: { score: number; ring: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative h-32 w-32 shrink-0 sm:h-40 sm:w-40">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={ring}
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">{score}</span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

const TONE: Record<
  string,
  { wrap: string; icon: string; value: string; accent: string }
> = {
  default: {
    wrap: "border-border bg-card hover:border-foreground/20",
    icon: "bg-muted text-foreground",
    value: "text-foreground",
    accent: "",
  },
  ok: {
    wrap: "border-green-200 bg-green-50/50 hover:border-green-300 dark:border-green-900 dark:bg-green-950/20",
    icon: "bg-green-500/15 text-green-600 dark:text-green-400",
    value: "text-green-600 dark:text-green-400",
    accent: "",
  },
  warn: {
    wrap: "border-orange-200 bg-orange-50/50 hover:border-orange-300 dark:border-orange-900 dark:bg-orange-950/20",
    icon: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    value: "text-orange-600 dark:text-orange-400",
    accent: "",
  },
  danger: {
    wrap: "border-red-200 bg-red-50/50 hover:border-red-300 dark:border-red-900 dark:bg-red-950/20",
    icon: "bg-red-500/15 text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
    accent: "",
  },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "danger" | "warn" | "ok";
  onClick?: () => void;
}) {
  const t = TONE[tone] || TONE.default;
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group relative flex flex-col gap-2.5 rounded-2xl border p-4 text-left transition-all ${t.wrap} ${
        clickable ? "cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none" : "cursor-default"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {clickable && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        )}
      </div>
      <div>
        <div className={`text-2xl font-bold leading-none sm:text-3xl ${t.value}`}>{value}</div>
        <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </button>
  );
}

export default function AnaliseExperiencia({ employeeId, companyId, open, onClose }: Props) {
  const { data, isLoading, error } = trpc.employees.analiseExperiencia.useQuery(
    { employeeId: employeeId!, companyId: companyId! },
    { enabled: open && !!employeeId && !!companyId },
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTo = (id: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const style = data ? NIVEL_STYLE[data.veredito.nivel] || NIVEL_STYLE.atencao : NIVEL_STYLE.atencao;

  const totalDias =
    data ? data.periodo.diasDecorridos + Math.max(0, data.periodo.diasRestantes) : 0;
  const progressoPct =
    totalDias > 0 ? Math.min(100, Math.round((data!.periodo.diasDecorridos / totalDias) * 100)) : 100;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        resizable={false}
        showCloseButton={false}
        className="left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-muted/30 p-0 sm:p-0 grid-rows-[auto_1fr] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <DialogTitle className="sr-only">Análise de Experiência</DialogTitle>

        {/* ===== Header sticky ===== */}
        <header className="relative z-10 border-b bg-gradient-to-r from-[#1B2A4A] to-[#243860] text-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <FileBarChart className="h-5 w-5 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold leading-tight sm:text-base">
                Análise de Experiência
              </h2>
              {data && (
                <p className="truncate text-[11px] text-white/60 sm:text-xs">
                  {data.employee.nome}
                </p>
              )}
            </div>
            {data && (
              <span
                className={`hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:inline-flex ${style.chip}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {data.veredito.score}/100 · {data.veredito.label}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ===== Body scrollable ===== */}
        <div ref={scrollRef} className="min-h-0 overflow-y-auto overscroll-contain">
          {isLoading && (
            <div className="flex h-full items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cruzando ocorrências do período...
            </div>
          )}

          {error && (
            <div className="mx-auto max-w-3xl p-6">
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30">
                Não foi possível gerar a análise: {error.message}
              </div>
            </div>
          )}

          {data && (
            <div className="mx-auto max-w-7xl space-y-5 p-4 sm:space-y-6 sm:p-6">
              {/* ===== Hero: identidade + veredito + motivos ===== */}
              <section className="grid gap-4 lg:grid-cols-3">
                {/* Veredito (col 1-2) */}
                <div
                  className={`relative overflow-hidden rounded-3xl border-2 ${style.border} bg-card p-5 sm:p-6 lg:col-span-2`}
                >
                  <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.grad}`} />
                  <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                    {/* Identidade */}
                    <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:text-center">
                      {data.employee.fotoUrl ? (
                        <img
                          src={data.employee.fotoUrl}
                          alt={data.employee.nome}
                          className="h-16 w-16 rounded-2xl object-cover ring-2 ring-background shadow-md sm:h-20 sm:w-20"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-2xl font-bold text-orange-700 ring-2 ring-background shadow-md sm:h-20 sm:w-20">
                          {data.employee.nome?.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="min-w-0 sm:max-w-[10rem]">
                        <p className="truncate text-base font-semibold sm:text-sm">{data.employee.nome}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground sm:justify-center">
                          <Briefcase className="h-3 w-3" /> {data.employee.funcao || "—"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1 sm:justify-center">
                          <Badge variant="secondary" className="text-[10px]">
                            {data.periodo.tipo === "30_30" ? "30+30" : "45+45"} dias
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {data.periodo.status === "prorrogado" ? "2º período" : "1º período"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Gauge + recomendação */}
                    <div className="flex flex-1 items-center gap-4 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                      <ScoreGauge score={data.veredito.score} ring={style.ring} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Recomendação sugerida
                        </p>
                        <p className={`text-xl font-bold leading-tight sm:text-2xl ${style.text}`}>
                          {data.veredito.label}
                        </p>
                        {/* Progresso do período */}
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{data.periodo.diasDecorridos} dia(s) decorridos</span>
                            <span className="font-medium">
                              {data.periodo.diasRestantes < 0
                                ? `Vencido há ${Math.abs(data.periodo.diasRestantes)}d`
                                : data.periodo.diasRestantes === 0
                                  ? "Vence hoje"
                                  : `${data.periodo.diasRestantes}d restantes`}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${
                                data.veredito.nivel === "efetivar"
                                  ? "from-green-400 to-green-600"
                                  : data.veredito.nivel === "atencao"
                                    ? "from-yellow-400 to-yellow-600"
                                    : data.veredito.nivel === "prorrogar"
                                      ? "from-orange-400 to-orange-600"
                                      : "from-red-400 to-red-600"
                              }`}
                              style={{ width: `${progressoPct}%`, transition: "width 0.9s ease" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Motivos do veredito (col 3) */}
                <div className="rounded-3xl border bg-card p-5">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Info className="h-3.5 w-3.5" /> Por que esta recomendação
                  </p>
                  {data.veredito.motivos.length > 0 ? (
                    <div className="space-y-2.5">
                      {data.veredito.motivos.map((m, i) => {
                        const Icon =
                          m.tipo === "positivo" ? CheckCircle2 : m.tipo === "negativo" ? XCircle : Info;
                        const cls =
                          m.tipo === "positivo"
                            ? "text-green-600"
                            : m.tipo === "negativo"
                              ? "text-red-600"
                              : "text-blue-600";
                        return (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
                            <span className="leading-snug">{m.texto}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem ressalvas registradas no período.</p>
                  )}
                </div>
              </section>

              {/* ===== Avisos honestos ===== */}
              {data.cartao.semCartao ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Cartão de ponto não importado neste período</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed">
                      O ERP só conta <strong>faltas</strong> e calcula <strong>assiduidade</strong> a
                      partir do cartão de ponto (time records). Como nenhum dia foi importado/fechado
                      para o período de experiência, <strong>"0 faltas" e "100%" não significam presença
                      real</strong> — significam ausência de dados. Importe/feche o ponto dos meses{" "}
                      {data.cartao.mesesNaJanela.map((m) => fmtMes(m)).join(", ")} para validar.
                    </p>
                  </div>
                </div>
              ) : data.cartao.mesesSemRegistro.length > 0 ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Cartão de ponto incompleto</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed">
                      Sem registros de ponto em{" "}
                      <strong>{data.cartao.mesesSemRegistro.map((m) => fmtMes(m)).join(", ")}</strong>.
                      A assiduidade e o total de faltas podem estar <strong>subestimados</strong> até o
                      fechamento desses meses.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* ===== Indicadores (KPIs clicáveis = rastreio) ===== */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" /> Indicadores do período
                  <span className="text-[11px] font-normal text-muted-foreground">
                    · toque num card para ver o detalhe
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <KpiCard
                    icon={data.assiduidade.verificada && data.assiduidade.percentual >= 90 ? TrendingUp : TrendingDown}
                    label="Assiduidade"
                    value={data.assiduidade.verificada ? `${data.assiduidade.percentual}%` : "N/D"}
                    sub={data.assiduidade.verificada ? `${data.assiduidade.diasTrabalhados} dias trab.` : "sem cartão"}
                    tone={
                      !data.assiduidade.verificada
                        ? "warn"
                        : data.assiduidade.percentual >= 90
                          ? "ok"
                          : data.assiduidade.percentual >= 75
                            ? "warn"
                            : "danger"
                    }
                    onClick={() => scrollTo("sec-cartao")}
                  />
                  <KpiCard
                    icon={XCircle}
                    label="Faltas"
                    value={data.assiduidade.verificada ? data.assiduidade.faltas : "N/D"}
                    sub={data.assiduidade.verificada ? undefined : "sem cartão"}
                    tone={
                      !data.assiduidade.verificada
                        ? "warn"
                        : data.assiduidade.faltas > 0
                          ? "danger"
                          : "ok"
                    }
                    onClick={
                      data.assiduidade.faltasDetalhe.length > 0 ? () => scrollTo("sec-faltas") : undefined
                    }
                  />
                  <KpiCard
                    icon={Clock}
                    label="Atrasos"
                    value={data.atrasos.total}
                    sub={`${Math.floor(data.atrasos.minutos / 60)}h${String(data.atrasos.minutos % 60).padStart(2, "0")} acum.`}
                    tone={data.atrasos.total > 0 ? "warn" : "ok"}
                    onClick={data.atrasos.detalhe.length > 0 ? () => scrollTo("sec-atrasos") : undefined}
                  />
                  <KpiCard
                    icon={AlertTriangle}
                    label="Advertências"
                    value={data.advertencias.total}
                    sub={`${data.advertencias.verbais}V · ${data.advertencias.escritas}E · ${data.advertencias.suspensoes}S`}
                    tone={data.advertencias.total > 0 ? "danger" : "ok"}
                    onClick={
                      data.advertencias.lista.length > 0 ? () => scrollTo("sec-advertencias") : undefined
                    }
                  />
                  <KpiCard
                    icon={Stethoscope}
                    label="Atestados"
                    value={data.atestados.total}
                    sub={`${data.atestados.diasAfastamento} dia(s) afast.`}
                    tone={data.atestados.total > 0 ? "warn" : "ok"}
                    onClick={
                      data.atestados.lista.length > 0 ? () => scrollTo("sec-atestados") : undefined
                    }
                  />
                  <KpiCard
                    icon={HeartPulse}
                    label="Acidentes"
                    value={data.acidentes.lista.length}
                    sub={data.acidentes.lista.length > 0 ? "trabalho" : "nenhum"}
                    tone={data.acidentes.lista.length > 0 ? "danger" : "ok"}
                    onClick={
                      data.acidentes.lista.length > 0 ? () => scrollTo("sec-acidentes") : undefined
                    }
                  />
                </div>
              </section>

              {/* ===== Período (timeline) ===== */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Início
                  </div>
                  <div className="mt-1 text-lg font-semibold">{fmtData(data.periodo.inicio)}</div>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarCheck className="h-3.5 w-3.5" /> Fim 1º período
                  </div>
                  <div className="mt-1 text-lg font-semibold">{fmtData(data.periodo.fim1)}</div>
                </div>
                <div className="col-span-2 rounded-2xl border bg-card p-4 sm:col-span-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> Fim 2º período
                  </div>
                  <div className="mt-1 text-lg font-semibold">{fmtData(data.periodo.fim2)}</div>
                </div>
              </section>

              {/* ===== Critério ===== */}
              <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-[12px] leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  <strong>Critério:</strong> uma <strong>falta</strong> é cada dia do cartão de ponto
                  com faltas {">"} 0; <strong>atraso</strong> é cada dia com entrada além do horário; a{" "}
                  <strong>assiduidade</strong> = dias trabalhados ÷ (dias trabalhados + faltas), apenas
                  sobre os dias que existem no cartão. Veja abaixo exatamente o que o ERP enxergou.
                </span>
              </div>

              {/* ===== Cartão de Ponto (rastreio) ===== */}
              <section id="sec-cartao" className="scroll-mt-4 rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-400">
                    <FileSpreadsheet className="h-4 w-4" /> Cartão de Ponto (dados analisados)
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {data.cartao.totalRegistros} dia(s) ·{" "}
                    {data.cartao.mesesComRegistro.length}/{data.cartao.mesesNaJanela.length} mês(es) com registro
                  </span>
                </div>

                {data.cartao.semCartao ? (
                  <div className="mt-3 flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-10 text-center">
                    <CalendarX className="h-8 w-8 text-amber-500" />
                    <p className="text-sm font-medium">Nenhum registro de ponto importado</p>
                    <p className="max-w-md px-3 text-[12px] text-muted-foreground">
                      Não há linhas de cartão de ponto para o período de experiência
                      ({data.cartao.mesesNaJanela.map((m) => fmtMes(m)).join(", ")}). Por isso o ERP
                      não pôde verificar faltas nem assiduidade.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tabela (sm+) */}
                    <div className="mt-3 hidden overflow-x-auto rounded-xl border sm:block">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Data</th>
                            <th className="px-3 py-2 font-medium">Entrada/Saída</th>
                            <th className="px-3 py-2 font-medium">H. Trab.</th>
                            <th className="px-3 py-2 font-medium">Falta</th>
                            <th className="px-3 py-2 font-medium">Atraso</th>
                            <th className="px-3 py-2 font-medium">Obs.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.cartao.detalhe.map((p, i) => {
                            const temFalta = Number(p.faltas || 0) > 0;
                            const temAtraso = !!p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00";
                            return (
                              <tr
                                key={i}
                                className={`border-b last:border-0 ${temFalta ? "bg-red-50/60 dark:bg-red-950/20" : "odd:bg-muted/20"}`}
                              >
                                <td className="px-3 py-2 font-mono">{fmtData(p.data)}</td>
                                <td className="px-3 py-2 font-mono text-muted-foreground">
                                  {[p.entrada1, p.saida1, p.entrada2, p.saida2].filter(Boolean).join(" · ") || "—"}
                                </td>
                                <td className="px-3 py-2">{p.horasTrabalhadas || "—"}</td>
                                <td className={`px-3 py-2 ${temFalta ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                                  {temFalta ? p.faltas : "—"}
                                </td>
                                <td className={`px-3 py-2 ${temAtraso ? "font-semibold text-orange-600" : "text-muted-foreground"}`}>
                                  {temAtraso ? p.atrasos : "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {p.justificativa || (p.tipoDia && p.tipoDia !== "normal" ? p.tipoDia : "—")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Cards (mobile) */}
                    <div className="mt-3 space-y-2 sm:hidden">
                      {data.cartao.detalhe.map((p, i) => {
                        const temFalta = Number(p.faltas || 0) > 0;
                        const temAtraso = !!p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00";
                        return (
                          <div
                            key={i}
                            className={`rounded-xl border p-3 text-xs ${temFalta ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : "bg-card"}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold">{fmtData(p.data)}</span>
                              <span className="flex gap-1.5">
                                {temFalta && (
                                  <Badge variant="outline" className="text-[10px] text-red-700">
                                    Falta
                                  </Badge>
                                )}
                                {temAtraso && (
                                  <Badge variant="outline" className="text-[10px] text-orange-700">
                                    +{p.atrasos}
                                  </Badge>
                                )}
                              </span>
                            </div>
                            <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                              {[p.entrada1, p.saida1, p.entrada2, p.saida2].filter(Boolean).join(" · ") || "Sem batidas"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              H. trab.: {p.horasTrabalhadas || "—"}
                              {p.justificativa ? ` · ${p.justificativa}` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {!data.cartao.semCartao && data.cartao.mesesSemRegistro.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    Meses do período sem nenhum registro: {data.cartao.mesesSemRegistro.map((m) => fmtMes(m)).join(", ")}.
                  </p>
                )}
              </section>

              {/* ===== Listas de detalhe ===== */}
              <div className="grid gap-4 lg:grid-cols-2">
                {data.advertencias.lista.length > 0 && (
                  <Section id="sec-advertencias" icon={AlertTriangle} title={`Advertências (${data.advertencias.lista.length})`} color="text-red-600">
                    {data.advertencias.lista.map((a, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0">
                          <Badge variant="outline" className="mr-2 text-[10px]">
                            {a.tipo}
                          </Badge>
                          {a.motivo}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtData(a.data)}</span>
                      </li>
                    ))}
                  </Section>
                )}

                {data.assiduidade.faltasDetalhe.length > 0 && (
                  <Section id="sec-faltas" icon={XCircle} title={`Faltas (${data.assiduidade.faltasDetalhe.length})`} color="text-red-600">
                    <div className="flex flex-wrap gap-1.5 py-2">
                      {data.assiduidade.faltasDetalhe.map((f, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-[11px] text-red-700">
                          {fmtData(f.data)}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                {data.atrasos.detalhe.length > 0 && (
                  <Section id="sec-atrasos" icon={Clock} title={`Atrasos (${data.atrasos.detalhe.length})`} color="text-orange-600">
                    {data.atrasos.detalhe.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{fmtData(a.data)}</span>
                        <span>
                          Entrada {a.entrada1 || "—"} ·{" "}
                          <span className="font-semibold text-orange-700">+{a.atraso}</span>
                        </span>
                      </li>
                    ))}
                  </Section>
                )}

                {data.atestados.lista.length > 0 && (
                  <Section id="sec-atestados" icon={Stethoscope} title={`Atestados (${data.atestados.lista.length})`} color="text-amber-600">
                    {data.atestados.lista.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          {a.tipo || "Atestado"}
                          {a.cid ? <span className="ml-1 text-xs text-muted-foreground">CID {a.cid}</span> : null}
                          {a.dias ? <span className="ml-1 text-xs">· {a.dias} dia(s)</span> : null}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{fmtData(a.data)}</span>
                      </li>
                    ))}
                  </Section>
                )}

                {data.acidentes.lista.length > 0 && (
                  <Section id="sec-acidentes" icon={HeartPulse} title={`Acidentes de Trabalho (${data.acidentes.lista.length})`} color="text-rose-600">
                    {data.acidentes.lista.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <Badge variant="outline" className="mr-2 text-[10px]">
                            {a.gravidade}
                          </Badge>
                          {a.tipo}
                          {a.dias ? <span className="ml-1 text-xs">· {a.dias} dia(s) afast.</span> : null}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{fmtData(a.data)}</span>
                      </li>
                    ))}
                  </Section>
                )}

                {data.ocorrencias.length > 0 && (
                  <Section id="sec-ocorrencias" icon={History} title={`Histórico / Ocorrências (${data.ocorrencias.length})`} color="text-slate-600">
                    {data.ocorrencias.map((h, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0">
                          <Badge variant="outline" className="mr-2 text-[10px]">
                            {h.tipo}
                          </Badge>
                          {h.descricao}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtData(h.data)}</span>
                      </li>
                    ))}
                  </Section>
                )}
              </div>

              {/* ===== Disclaimer ===== */}
              <p className="rounded-2xl border bg-muted/30 p-4 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mr-1 inline h-3 w-3" />
                Esta análise é uma <strong>sugestão automática</strong> baseada nas ocorrências
                registradas no período de experiência. A decisão final de efetivar, prorrogar ou
                desligar é de responsabilidade do RH e da Diretoria. Atestados e acidentes de
                trabalho são exibidos como informação e <strong>não reduzem</strong> a pontuação.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  color,
  children,
}: {
  id?: string;
  icon: any;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      <ul className="mt-1 divide-y">{children}</ul>
    </div>
  );
}
