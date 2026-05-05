import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, Briefcase, Loader2,
  TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Calendar, ListChecks,
} from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  das: "DAS-MEI",
  nf: "NF do mês",
  cnd: "CND CNPJ",
  seguro_vida: "Seguro Vida",
  status_cnpj: "Status CNPJ",
};

function labelMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[m-1]}/${y}`;
}
function mesAnterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function mesPosterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function KpiCard({ label, value, color, icon: Icon, sub }: any) {
  const palettes: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50/40 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50/40 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/40 text-amber-700",
    red: "border-red-200 bg-red-50/40 text-red-700",
    purple: "border-purple-200 bg-purple-50/40 text-purple-700",
    gray: "border-gray-200 bg-gray-50/40 text-gray-700",
  };
  return (
    <Card className={palettes[color] || palettes.gray}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider opacity-90 flex items-center gap-1">
            {Icon && <Icon className="h-3 w-3" />} {label}
          </div>
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub && <div className="text-[11px] mt-1 opacity-75">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function BarRow({ label, ok, pendente, vencido, total }: { label: string; ok: number; pendente: number; vencido: number; total: number }) {
  const max = Math.max(total, 1);
  const okPct = (ok / max) * 100;
  const pendPct = (pendente / max) * 100;
  const vencPct = (vencido / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          <span className="text-emerald-600">{ok}</span> OK · <span className="text-amber-600">{pendente}</span> Pend. · <span className="text-red-600">{vencido}</span> Venc.
        </span>
      </div>
      <div className="flex h-3 rounded-md overflow-hidden border bg-gray-100">
        {okPct > 0 && <div className="bg-emerald-500" style={{ width: `${okPct}%` }} />}
        {pendPct > 0 && <div className="bg-amber-400" style={{ width: `${pendPct}%` }} />}
        {vencPct > 0 && <div className="bg-red-500" style={{ width: `${vencPct}%` }} />}
      </div>
    </div>
  );
}

export default function ConformidadePJDashboard() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) || 0 : 0;
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [mesRef, setMesRef] = useState(mesAtual);

  const { data, isLoading } = trpc.pjConformidade.dashboard.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const scoreColor = useMemo(() => {
    const s = data?.scoreConformidade || 0;
    if (s >= 90) return "emerald";
    if (s >= 70) return "amber";
    return "red";
  }, [data?.scoreConformidade]);

  if (companyId === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-20 text-muted-foreground">
          Selecione uma empresa para ver o dashboard de conformidade PJ.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" /> Dashboard — Conformidade PJ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada das obrigações dos prestadores PJ por tipo, com priorização das pendências.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesAnterior(mesRef))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-3 py-1.5 rounded-md border bg-white text-sm font-semibold flex items-center gap-2 min-w-[110px] justify-center">
            <Calendar className="h-4 w-4 text-purple-500" /> {labelMes(mesRef)}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesPosterior(mesRef))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {mesRef !== mesAtual && (
            <Button variant="ghost" size="sm" onClick={() => setMesRef(mesAtual)}>Hoje</Button>
          )}
          <Button variant="default" size="sm" onClick={() => window.location.assign("/terceiros/pj/conformidade")}>
            <ListChecks className="h-4 w-4 mr-1" /> Gerenciar
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="text-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Carregando dashboard...
        </div>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="PJs Ativos" value={data.totalPjs} color="blue" icon={Briefcase} />
            <KpiCard
              label="Score Conformidade"
              value={`${data.scoreConformidade.toFixed(1)}%`}
              color={scoreColor}
              icon={data.scoreConformidade >= 70 ? TrendingUp : TrendingDown}
              sub={`${data.ok} OK de ${data.totalChecks} itens`}
            />
            <KpiCard label="Em dia (OK)" value={data.ok} color="emerald" icon={CheckCircle2} />
            <KpiCard label="Pendentes" value={data.pendente} color="amber" icon={Clock} />
            <KpiCard label="Vencidos" value={data.vencido} color="red" icon={AlertTriangle} sub="ação imediata" />
            <KpiCard label="Vence em ≤30d" value={data.venceEmBreve} color="purple" icon={Calendar} />
          </div>

          {/* Por tipo */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-800">Distribuição por tipo de obrigação</h2>
                <p className="text-xs text-muted-foreground">Status consolidado — {labelMes(mesRef)}</p>
              </div>
              <div className="space-y-3">
                {Object.entries(data.porTipo).map(([tipo, agg]: [string, any]) => {
                  const total = agg.ok + agg.pendente + agg.vencido + agg.na;
                  return (
                    <BarRow
                      key={tipo}
                      label={TIPO_LABEL[tipo] || tipo}
                      ok={agg.ok}
                      pendente={agg.pendente}
                      vencido={agg.vencido}
                      total={total}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top piores */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3">
                <h2 className="font-semibold text-gray-800">PJs com mais pendências</h2>
                <p className="text-xs text-muted-foreground">
                  Ordenado por gravidade (vencidos pesam dobrado). Mostrando até 10.
                </p>
              </div>
              {data.piores.length === 0 ? (
                <div className="text-center py-8 text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                  <CheckCircle2 className="h-6 w-6 inline mr-2" />
                  Nenhum PJ com pendências neste mês — parabéns!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-700">PJ</th>
                        <th className="p-2 text-left font-medium text-gray-700">Função</th>
                        <th className="p-2 text-center font-medium text-emerald-700">OK</th>
                        <th className="p-2 text-center font-medium text-amber-700">Pendentes</th>
                        <th className="p-2 text-center font-medium text-red-700">Vencidos</th>
                        <th className="p-2 text-center font-medium text-purple-700">Vence ≤30d</th>
                        <th className="p-2 text-center font-medium text-gray-700">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.piores.map((pj: any) => (
                        <tr key={pj.id} className="border-b last:border-0 hover:bg-gray-50/50">
                          <td className="p-2 font-medium">
                            <div>{pj.nome}</div>
                            <div className="text-xs font-mono text-muted-foreground">{pj.cpf}</div>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{pj.funcao || "-"}</td>
                          <td className="p-2 text-center"><Badge className="bg-emerald-600 hover:bg-emerald-700">{pj.ok}</Badge></td>
                          <td className="p-2 text-center">{pj.pendente > 0 ? <Badge className="bg-amber-500 hover:bg-amber-600">{pj.pendente}</Badge> : <span className="text-gray-300">-</span>}</td>
                          <td className="p-2 text-center">{pj.vencido > 0 ? <Badge variant="destructive">{pj.vencido}</Badge> : <span className="text-gray-300">-</span>}</td>
                          <td className="p-2 text-center">{pj.venceEmBreve > 0 ? <Badge className="bg-purple-500 hover:bg-purple-600">{pj.venceEmBreve}</Badge> : <span className="text-gray-300">-</span>}</td>
                          <td className="p-2 text-center">
                            <a
                              href={`/relatorios/raio-x?employeeId=${pj.id}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Abrir
                            </a>
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
  );
}
