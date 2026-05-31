import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
  { bg: string; border: string; text: string; ring: string; label: string }
> = {
  efetivar: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-300",
    text: "text-green-700 dark:text-green-400",
    ring: "stroke-green-500",
    label: "Recomendado Efetivar",
  },
  atencao: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-300",
    text: "text-yellow-700 dark:text-yellow-400",
    ring: "stroke-yellow-500",
    label: "Efetivar com Ressalvas",
  },
  prorrogar: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-300",
    text: "text-orange-700 dark:text-orange-400",
    ring: "stroke-orange-500",
    label: "Avaliar Prorrogação",
  },
  desligar: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300",
    text: "text-red-700 dark:text-red-400",
    ring: "stroke-red-500",
    label: "Avaliar Desligamento",
  },
};

function ScoreGauge({ score, ring }: { score: number; ring: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={ring}
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "danger" | "warn" | "ok";
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-orange-600"
        : tone === "ok"
          ? "text-green-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function AnaliseExperiencia({ employeeId, companyId, open, onClose }: Props) {
  const { data, isLoading, error } = trpc.employees.analiseExperiencia.useQuery(
    { employeeId: employeeId!, companyId: companyId! },
    { enabled: open && !!employeeId && !!companyId },
  );

  const style = data ? NIVEL_STYLE[data.veredito.nivel] || NIVEL_STYLE.atencao : NIVEL_STYLE.atencao;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-orange-600" />
            Análise de Experiência
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cruzando ocorrências do período...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30">
            Não foi possível gerar a análise: {error.message}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Cabeçalho do colaborador */}
            <div className="flex items-center gap-3">
              {data.employee.fotoUrl ? (
                <img
                  src={data.employee.fotoUrl}
                  alt={data.employee.nome}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-700">
                  {data.employee.nome?.charAt(0) || "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{data.employee.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {data.employee.funcao || "—"} ·{" "}
                  {data.periodo.tipo === "30_30" ? "30+30" : "45+45"} dias ·{" "}
                  {data.periodo.status === "prorrogado" ? "2º período" : "1º período"}
                </p>
              </div>
            </div>

            {/* Veredito */}
            <div className={`flex items-center gap-4 rounded-xl border-2 ${style.border} ${style.bg} p-4`}>
              <ScoreGauge score={data.veredito.score} ring={style.ring} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recomendação sugerida
                </p>
                <p className={`text-xl font-bold ${style.text}`}>{data.veredito.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.periodo.diasDecorridos} dia(s) decorridos ·{" "}
                  {data.periodo.diasRestantes < 0
                    ? `Vencido há ${Math.abs(data.periodo.diasRestantes)}d`
                    : data.periodo.diasRestantes === 0
                      ? "Vence hoje"
                      : `${data.periodo.diasRestantes}d restantes`}
                </p>
              </div>
            </div>

            {/* Aviso honesto: cartão de ponto ausente/incompleto */}
            {data.cartao.semCartao ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
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
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
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

            {/* Critério usado pelo ERP */}
            <div className="flex items-start gap-2 rounded-lg border bg-blue-50/60 p-3 text-[12px] leading-relaxed text-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span>
                <strong>Critério:</strong> uma <strong>falta</strong> é cada dia do cartão de ponto
                com faltas {">"} 0; <strong>atraso</strong> é cada dia com entrada além do horário; a{" "}
                <strong>assiduidade</strong> = dias trabalhados ÷ (dias trabalhados + faltas), apenas
                sobre os dias que existem no cartão. Abra "Cartão de Ponto (dados analisados)" abaixo
                para ver exatamente o que o ERP enxergou.
              </span>
            </div>

            {/* Motivos do veredito */}
            {data.veredito.motivos.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
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
                      <span>{m.texto}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Período */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                icon={CalendarClock}
                label="Início"
                value={<span className="text-base">{fmtData(data.periodo.inicio)}</span>}
              />
              <StatCard
                icon={CalendarCheck}
                label="Fim 1º período"
                value={<span className="text-base">{fmtData(data.periodo.fim1)}</span>}
              />
              <StatCard
                icon={CalendarCheck}
                label="Fim 2º período"
                value={<span className="text-base">{fmtData(data.periodo.fim2)}</span>}
              />
              <StatCard
                icon={data.assiduidade.verificada && data.assiduidade.percentual >= 90 ? TrendingUp : TrendingDown}
                label="Assiduidade"
                value={data.assiduidade.verificada ? `${data.assiduidade.percentual}%` : "N/D"}
                sub={data.assiduidade.verificada ? `${data.assiduidade.diasTrabalhados} dias trab.` : "sem cartão de ponto"}
                tone={
                  !data.assiduidade.verificada
                    ? "warn"
                    : data.assiduidade.percentual >= 90
                      ? "ok"
                      : data.assiduidade.percentual >= 75
                        ? "warn"
                        : "danger"
                }
              />
            </div>

            {/* Indicadores principais */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                icon={AlertTriangle}
                label="Advertências"
                value={data.advertencias.total}
                sub={`${data.advertencias.verbais}V · ${data.advertencias.escritas}E · ${data.advertencias.suspensoes}S`}
                tone={data.advertencias.total > 0 ? "danger" : "ok"}
              />
              <StatCard
                icon={XCircle}
                label="Faltas"
                value={data.assiduidade.verificada ? data.assiduidade.faltas : "N/D"}
                sub={data.assiduidade.verificada ? undefined : "sem cartão de ponto"}
                tone={
                  !data.assiduidade.verificada
                    ? "warn"
                    : data.assiduidade.faltas > 0
                      ? "danger"
                      : "ok"
                }
              />
              <StatCard
                icon={Clock}
                label="Atrasos"
                value={data.atrasos.total}
                sub={`${Math.floor(data.atrasos.minutos / 60)}h${String(data.atrasos.minutos % 60).padStart(2, "0")} acum.`}
                tone={data.atrasos.total > 0 ? "warn" : "ok"}
              />
              <StatCard
                icon={Stethoscope}
                label="Atestados"
                value={data.atestados.total}
                sub={`${data.atestados.diasAfastamento} dia(s) afast.`}
                tone={data.atestados.total > 0 ? "warn" : "ok"}
              />
            </div>

            {/* Cartão de Ponto — dados brutos analisados pelo ERP */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-sky-700 dark:text-sky-400">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" /> Cartão de Ponto (dados analisados)
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {data.cartao.totalRegistros} dia(s) ·{" "}
                  {data.cartao.mesesComRegistro.length}/{data.cartao.mesesNaJanela.length} mês(es) com registro
                </span>
              </div>

              {data.cartao.semCartao ? (
                <div className="mt-3 flex flex-col items-center gap-1.5 rounded-md border border-dashed py-6 text-center">
                  <CalendarX className="h-7 w-7 text-amber-500" />
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
                  <div className="mt-2 hidden overflow-x-auto sm:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-2 font-medium">Data</th>
                          <th className="py-1.5 pr-2 font-medium">Entrada/Saída</th>
                          <th className="py-1.5 pr-2 font-medium">H. Trab.</th>
                          <th className="py-1.5 pr-2 font-medium">Falta</th>
                          <th className="py-1.5 pr-2 font-medium">Atraso</th>
                          <th className="py-1.5 font-medium">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cartao.detalhe.map((p, i) => {
                          const temFalta = Number(p.faltas || 0) > 0;
                          const temAtraso = !!p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00";
                          return (
                            <tr
                              key={i}
                              className={`border-b last:border-0 ${temFalta ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}
                            >
                              <td className="py-1.5 pr-2 font-mono">{fmtData(p.data)}</td>
                              <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                                {[p.entrada1, p.saida1, p.entrada2, p.saida2].filter(Boolean).join(" · ") || "—"}
                              </td>
                              <td className="py-1.5 pr-2">{p.horasTrabalhadas || "—"}</td>
                              <td className={`py-1.5 pr-2 ${temFalta ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                                {temFalta ? p.faltas : "—"}
                              </td>
                              <td className={`py-1.5 pr-2 ${temAtraso ? "font-semibold text-orange-600" : "text-muted-foreground"}`}>
                                {temAtraso ? p.atrasos : "—"}
                              </td>
                              <td className="py-1.5 text-muted-foreground">
                                {p.justificativa || (p.tipoDia && p.tipoDia !== "normal" ? p.tipoDia : "—")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards (mobile) */}
                  <div className="mt-2 space-y-2 sm:hidden">
                    {data.cartao.detalhe.map((p, i) => {
                      const temFalta = Number(p.faltas || 0) > 0;
                      const temAtraso = !!p.atrasos && p.atrasos !== "0:00" && p.atrasos !== "00:00";
                      return (
                        <div
                          key={i}
                          className={`rounded-md border p-2 text-xs ${temFalta ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : ""}`}
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
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
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
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  Meses do período sem nenhum registro: {data.cartao.mesesSemRegistro.map((m) => fmtMes(m)).join(", ")}.
                </p>
              )}
            </div>

            {/* Listas de detalhe */}
            {data.advertencias.lista.length > 0 && (
              <Section icon={AlertTriangle} title={`Advertências (${data.advertencias.lista.length})`} color="text-red-600">
                {data.advertencias.lista.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-1.5 text-sm">
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
              <Section icon={XCircle} title={`Faltas (${data.assiduidade.faltasDetalhe.length})`} color="text-red-600">
                <div className="flex flex-wrap gap-1.5 py-1">
                  {data.assiduidade.faltasDetalhe.map((f, i) => (
                    <Badge key={i} variant="outline" className="font-mono text-[11px] text-red-700">
                      {fmtData(f.data)}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {data.atrasos.detalhe.length > 0 && (
              <Section icon={Clock} title={`Atrasos (${data.atrasos.detalhe.length})`} color="text-orange-600">
                {data.atrasos.detalhe.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1 text-sm">
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
              <Section icon={Stethoscope} title={`Atestados (${data.atestados.lista.length})`} color="text-amber-600">
                {data.atestados.lista.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
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
              <Section icon={HeartPulse} title={`Acidentes de Trabalho (${data.acidentes.lista.length})`} color="text-rose-600">
                {data.acidentes.lista.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
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
              <Section icon={History} title={`Histórico / Ocorrências (${data.ocorrencias.length})`} color="text-slate-600">
                {data.ocorrencias.map((h, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-1.5 text-sm">
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

            <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mr-1 inline h-3 w-3" />
              Esta análise é uma <strong>sugestão automática</strong> baseada nas ocorrências
              registradas no período de experiência. A decisão final de efetivar, prorrogar ou
              desligar é de responsabilidade do RH e da Diretoria. Atestados e acidentes de
              trabalho são exibidos como informação e <strong>não reduzem</strong> a pontuação.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: any;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      <ul className="mt-1 divide-y">{children}</ul>
    </div>
  );
}
