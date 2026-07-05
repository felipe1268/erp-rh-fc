// Rev. 4037 — Dashboard APR (Análise Preliminar de Risco)
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import {
  ShieldAlert, ArrowLeft, BarChart3, Building2, Activity,
  Clock, CheckCircle2, ListChecks, XCircle, TrendingUp, Grid3x3, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", em_analise: "Em Análise", aprovada: "Aprovada",
  concluida: "Concluída", cancelada: "Cancelada",
};
const NIVEL_COLORS: Record<string, string> = {
  Baixo: "#22c55e", Médio: "#eab308", Alto: "#f97316", Crítico: "#dc2626",
};
const STATUS_COLORS: Record<string, string> = {
  rascunho: "#94a3b8", em_analise: "#f59e0b", aprovada: "#10b981",
  concluida: "#0891b2", cancelada: "#ef4444",
};

function fmtNum(v: number) {
  return (v ?? 0).toLocaleString("pt-BR");
}
function mesLabel(ym: string) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}
function fmtDataBR(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function nivelDaCelula(p: number, g: number): { nivel: string; cor: string } {
  const n = p * g;
  if (n <= 4) return { nivel: "Baixo", cor: "#22c55e" };
  if (n <= 9) return { nivel: "Médio", cor: "#eab308" };
  if (n <= 16) return { nivel: "Alto", cor: "#f97316" };
  return { nivel: "Crítico", cor: "#dc2626" };
}
function heatCellBg(total: number, max: number, cor: string) {
  if (total === 0) return "#f8fafc";
  const intensidade = Math.max(0.18, Math.min(1, total / Math.max(1, max)));
  return cor + Math.round(intensidade * 255).toString(16).padStart(2, "0");
}

function KPI({
  icon: Icon, label, value, color, bg, border, dot,
}: {
  icon: any; label: string; value: string | number;
  color: string; bg: string; border: string; dot: string;
}) {
  return (
    <Card className={`${bg} ${border} border`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot} flex-shrink-0`} />
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">{label}</p>
        </div>
        <p className={`text-2xl font-bold ${color} mt-2`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardAprAnalise() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = trpc.aprAnalises.dashboard.useQuery(
    { companyId },
    { enabled: companyId > 0 },
  );

  if (companyId <= 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              Selecione uma empresa para visualizar o dashboard de APR.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const s = data?.stats;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Button size="sm" variant="ghost" onClick={() => navigate("/sst/apr")} className="h-7 px-2 text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar à APR
              </Button>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
              Dashboard de APR — Análise Preliminar de Risco
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Volume, status, matriz de riscos e distribuição por obra das Análises Preliminares de Risco.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs">
            {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-8 text-center text-gray-500">Carregando...</CardContent></Card>
        ) : !data ? (
          <Card><CardContent className="p-8 text-center text-gray-500">Sem dados.</CardContent></Card>
        ) : (
          <>
            {/* KPI cards — mesmo padrão flat/dot da tela de PT (Rev. 4036) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KPI icon={ListChecks} label="Total" value={fmtNum(s!.total)}
                color="text-slate-700" bg="bg-slate-50" border="border-slate-200" dot="bg-slate-500" />
              <KPI icon={Clock} label="Em Análise" value={fmtNum(s!.em_analise)}
                color="text-amber-700" bg="bg-amber-50" border="border-amber-200" dot="bg-amber-500" />
              <KPI icon={CheckCircle2} label="Aprovadas" value={fmtNum(s!.aprovada)}
                color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" dot="bg-emerald-500" />
              <KPI icon={Activity} label="Concluídas" value={fmtNum(s!.concluida)}
                color="text-blue-700" bg="bg-blue-50" border="border-blue-200" dot="bg-blue-500" />
              <KPI icon={XCircle} label="Canceladas" value={fmtNum(s!.cancelada)}
                color="text-rose-700" bg="bg-rose-50" border="border-rose-200" dot="bg-rose-500" />
            </div>

            {/* Charts row 1 — Timeline + Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-600" /> APRs criadas por mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.timeline.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem registros</div>
                  ) : (
                    <div className="w-full h-[260px] min-h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.timeline.map((r: any) => ({ ...r, mesLabel: mesLabel(r.mes) }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="total" name="APRs" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-600" /> Distribuição por status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-[260px] min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(STATUS_LABELS).map(([k, label]) => ({ key: k, name: label, value: (s as any)[k] ?? 0 }))
                            .filter((r) => r.value > 0)}
                          dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                          label={(e: any) => `${e.value}`} labelLine={false}
                        >
                          {Object.keys(STATUS_LABELS).map((k, i) => (
                            <Cell key={i} fill={STATUS_COLORS[k]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts row 2 — Matriz de risco + Obras */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-600" /> Riscos por nível (Matriz P×G)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.porNivelRisco.every((r: any) => r.total === 0) ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Nenhum risco cadastrado</div>
                  ) : (
                    <div className="w-full h-[260px] min-h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.porNivelRisco}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="nivel" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="total">
                            {data.porNivelRisco.map((r: any, i: number) => (
                              <Cell key={i} fill={NIVEL_COLORS[r.nivel] || "#94a3b8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-600" /> APRs por obra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.porObra.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem registros</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.porObra.length * 28) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.porObra} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="obraNome" tick={{ fontSize: 10 }} width={150} />
                          <Tooltip />
                          <Bar dataKey="total" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts row 3 — Matriz P×G + Top Perigos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-red-600" /> Matriz de Risco (Probabilidade × Gravidade)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.matrizRisco.every((c: any) => c.total === 0) ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Nenhum risco cadastrado</div>
                  ) : (
                    <div className="overflow-x-auto">
                      {(() => {
                        const max = Math.max(1, ...data.matrizRisco.map((c: any) => c.total));
                        return (
                          <table className="border-collapse mx-auto">
                            <thead>
                              <tr>
                                <th className="text-[10px] text-gray-400 font-normal p-1"></th>
                                {[1, 2, 3, 4, 5].map((g) => (
                                  <th key={g} className="text-[10px] text-gray-500 font-medium p-1 text-center w-14">G{g}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[5, 4, 3, 2, 1].map((p) => (
                                <tr key={p}>
                                  <td className="text-[10px] text-gray-500 font-medium p-1 text-right pr-2">P{p}</td>
                                  {[1, 2, 3, 4, 5].map((g) => {
                                    const cell = data.matrizRisco.find((c: any) => c.probabilidade === p && c.gravidade === g);
                                    const total = cell?.total ?? 0;
                                    const { nivel, cor } = nivelDaCelula(p, g);
                                    return (
                                      <td key={g} className="p-1">
                                        <div
                                          title={`P${p} × G${g} = ${nivel} — ${total} risco(s)`}
                                          className="w-14 h-10 rounded flex items-center justify-center text-xs font-bold border"
                                          style={{ backgroundColor: heatCellBg(total, max, cor), borderColor: cor, color: total > 0 ? "#1f2937" : "#cbd5e1" }}
                                        >
                                          {total || ""}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()}
                      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-gray-500">
                        {Object.entries(NIVEL_COLORS).map(([nivel, cor]) => (
                          <span key={nivel} className="flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ backgroundColor: cor }} /> {nivel}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" /> Perigos mais recorrentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topPerigos.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Nenhum perigo cadastrado</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.topPerigos.length * 30) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.topPerigos} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="perigo" tick={{ fontSize: 10 }} width={170}
                            tickFormatter={(t) => (t.length > 22 ? t.slice(0, 21) + "…" : t)} />
                          <Tooltip />
                          <Bar dataKey="total" fill="#f97316" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Chart row 4 — Evolução por status (empilhado) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-600" /> Evolução mensal por status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.timelinePorStatus.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem registros</div>
                ) : (
                  <div className="w-full h-[280px] min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.timelinePorStatus.map((r: any) => ({ ...r, mesLabel: mesLabel(r.mes) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v: string) => STATUS_LABELS[v] || v} />
                        {Object.keys(STATUS_LABELS).map((st) => (
                          <Bar key={st} dataKey={st} stackId="s" fill={STATUS_COLORS[st]} name={STATUS_LABELS[st]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recentes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-slate-600" /> APRs recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentes.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma APR cadastrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b">
                        <tr className="text-left text-gray-600">
                          <th className="py-2 px-2">Número</th>
                          <th className="py-2 px-2">Data</th>
                          <th className="py-2 px-2">Obra</th>
                          <th className="py-2 px-2">Atividade</th>
                          <th className="py-2 px-2">Status</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentes.map((r: any) => (
                          <tr key={r.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2 font-medium">{r.numero}</td>
                            <td className="py-2 px-2 whitespace-nowrap">{fmtDataBR(r.dataEmissao)}</td>
                            <td className="py-2 px-2 max-w-[180px] truncate" title={r.obraNome}>{r.obraNome}</td>
                            <td className="py-2 px-2 max-w-[260px] truncate" title={r.atividade}>{r.atividade || "—"}</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-[10px]"
                                style={{ borderColor: STATUS_COLORS[r.status], color: STATUS_COLORS[r.status] }}>
                                {STATUS_LABELS[r.status] || r.status}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                                onClick={() => navigate("/sst/apr")}>
                                Abrir
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
