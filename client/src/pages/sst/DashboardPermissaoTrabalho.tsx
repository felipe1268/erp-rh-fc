// Rev. 4037 — Dashboard PT (Permissão de Trabalho)
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import {
  ClipboardCheck, ArrowLeft, BarChart3, Building2, Wrench,
  Clock, CheckCircle2, ListChecks, XCircle, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", em_andamento: "Em Andamento", liberada: "Liberada",
  concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  rascunho: "#94a3b8", em_andamento: "#f59e0b", liberada: "#10b981",
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

function KPI({
  label, value, color, bg, border, dot,
}: {
  label: string; value: string | number;
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

export default function DashboardPermissaoTrabalho() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = trpc.ptPermissoes.dashboard.useQuery(
    { companyId },
    { enabled: companyId > 0 },
  );

  if (companyId <= 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              Selecione uma empresa para visualizar o dashboard de PT.
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
              <Button size="sm" variant="ghost" onClick={() => navigate("/sst/pt")} className="h-7 px-2 text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar à PT
              </Button>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-cyan-600" />
              Dashboard de PT — Permissão de Trabalho
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Volume, status, tipos de trabalho (NRs) e distribuição por obra das Permissões de Trabalho.
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
            {/* KPI cards — mesmo padrão flat/dot da PT (Rev. 4036) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KPI label="Total" value={fmtNum(s!.total)}
                color="text-slate-700" bg="bg-slate-50" border="border-slate-200" dot="bg-slate-500" />
              <KPI label="Em Andamento" value={fmtNum(s!.em_andamento)}
                color="text-amber-700" bg="bg-amber-50" border="border-amber-200" dot="bg-amber-500" />
              <KPI label="Liberadas" value={fmtNum(s!.liberada)}
                color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" dot="bg-emerald-500" />
              <KPI label="Concluídas" value={fmtNum(s!.concluida)}
                color="text-blue-700" bg="bg-blue-50" border="border-blue-200" dot="bg-blue-500" />
              <KPI label="Canceladas" value={fmtNum(s!.cancelada)}
                color="text-rose-700" bg="bg-rose-50" border="border-rose-200" dot="bg-rose-500" />
            </div>

            {/* Charts row 1 — Timeline + Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-600" /> PTs criadas por mês
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
                          <Line type="monotone" dataKey="total" name="PTs" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
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

            {/* Charts row 2 — Tipos de trabalho (NR) + Obras */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-orange-600" /> PTs por tipo de trabalho (NR)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.porTipoTrabalho.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem registros</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.porTipoTrabalho.length * 28) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.porTipoTrabalho} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10 }} width={170}
                            tickFormatter={(t) => (t.length > 22 ? t.slice(0, 21) + "…" : t)} />
                          <Tooltip />
                          <Bar dataKey="total" fill="#f97316" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-600" /> PTs por obra
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
                          <Bar dataKey="total" fill="#0891b2" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recentes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-slate-600" /> PTs recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentes.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma PT cadastrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b">
                        <tr className="text-left text-gray-600">
                          <th className="py-2 px-2">Número</th>
                          <th className="py-2 px-2">Data</th>
                          <th className="py-2 px-2">Obra</th>
                          <th className="py-2 px-2">Empresa executante</th>
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
                            <td className="py-2 px-2 max-w-[220px] truncate" title={r.empresaExecutanteNome}>
                              {r.empresaExecutanteNome || "—"}
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-[10px]"
                                style={{ borderColor: STATUS_COLORS[r.status], color: STATUS_COLORS[r.status] }}>
                                {STATUS_LABELS[r.status] || r.status}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                                onClick={() => navigate("/sst/pt")}>
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
