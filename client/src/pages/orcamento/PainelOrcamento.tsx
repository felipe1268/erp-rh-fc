import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calculator, FolderOpen, DollarSign, Target, ArrowRight,
  TrendingDown, TrendingUp, BarChart3, Percent, Building2,
  Clock, CalendarDays,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadialBarChart, RadialBar,
} from "recharts";

function formatBRL(v: number, compact = false) {
  if (compact) {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`;
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
// KPI: sempre formato completo com centavos
function fBRL(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function pct2(v: number) { return `${v.toFixed(1)}%`; }

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  rascunho:             { label: "Rascunho",      color: "#94a3b8" },
  aguardando_aprovacao: { label: "Ag. Aprovação",  color: "#f59e0b" },
  aprovado:             { label: "Aprovado",        color: "#22c55e" },
  fechado:              { label: "Fechado",          color: "#3b82f6" },
};

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[220px]">
      {label && <p className="font-semibold text-slate-700 mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-800">
            {typeof p.value === "number" && p.value > 1000
              ? formatBRL(p.value)
              : typeof p.value === "number"
                ? p.name?.toLowerCase().includes("bdi") || p.name?.toLowerCase().includes("margem")
                  ? pct2(p.value)
                  : p.value.toLocaleString("pt-BR")
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function KpiCard({ title, value, sub, icon: Icon, iconBg, iconColor, trend }: any) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-lg font-bold mt-1 break-all leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <div className={`p-2 rounded-lg ${iconBg} shrink-0 ml-2`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pct2(Math.abs(trend))} {trend >= 0 ? "acima" : "abaixo"} da meta
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PainelOrcamento() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;

  const { data, isLoading } = trpc.orcamento.painel.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const total       = data?.total        ?? 0;
  const totalComBdi = data?.totalComBdi  ?? 0;
  const totalVenda  = data?.totalVenda   ?? 0;
  const totalCusto  = data?.totalCusto   ?? 0;
  const totalMeta   = data?.totalMeta    ?? 0;
  const totalMat    = data?.totalMat     ?? 0;
  const totalMdo    = data?.totalMdo     ?? 0;
  const totalEquip  = data?.totalEquip   ?? 0;
  const bdiMedio        = data?.bdiMedio        ?? 0;
  const margemMedia     = data?.margemMedia     ?? 0;
  const lucroMensalPrev = data?.lucroMensalPrev ?? 0;
  const lucroMensalReal = data?.lucroMensalReal ?? 0;

  const porStatus = data?.porStatus ?? [];
  const porCliente = data?.porCliente ?? [];
  const porBdi     = data?.porBdi ?? [];
  const porMargem  = data?.porMargem ?? [];
  const recentes   = data?.recentes ?? [];

  // Composição de custos
  const custosTotais = totalMat + totalMdo + totalEquip;
  const composicaoCustos = custosTotais > 0 ? [
    { name: "Materiais",    value: totalMat,   color: "#3b82f6" },
    { name: "Mão de Obra",  value: totalMdo,   color: "#f59e0b" },
    { name: "Equipamentos", value: totalEquip, color: "#8b5cf6" },
  ].filter(c => c.value > 0) : [];

  // Status com configs
  const statusData = porStatus.map(s => ({
    ...s,
    label: STATUS_CFG[s.status]?.label ?? s.status,
    color: STATUS_CFG[s.status]?.color ?? "#94a3b8",
  }));

  const Loading = () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      Carregando...
    </div>
  );

  const EmptyChart = ({ msg }: { msg: string }) => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-xs text-center px-4">
      {msg}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 max-w-[1600px] mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              Dashboard de Orçamentos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Análise estratégica e indicadores de desempenho
            </p>
          </div>
          <Link href="/orcamento/lista">
            <Button variant="outline" size="sm" className="gap-2">
              <FolderOpen className="h-4 w-4" /> Ver Orçamentos
            </Button>
          </Link>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <div className="col-span-2">
            <KpiCard
              title="Orçamentos" icon={FolderOpen}
              value={isLoading ? "..." : String(total)}
              sub="cadastrados na empresa"
              iconBg="bg-blue-50" iconColor="text-blue-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Carteira Total" icon={DollarSign}
              value={isLoading ? "..." : fBRL(totalVenda)}
              sub={`${totalComBdi} orçamento${totalComBdi !== 1 ? "s" : ""} com BDI aplicado`}
              iconBg="bg-green-50" iconColor="text-green-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Custo Direto" icon={TrendingDown}
              value={isLoading ? "..." : fBRL(totalCusto)}
              sub="materiais + MO + equip."
              iconBg="bg-amber-50" iconColor="text-amber-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Resultado Bruto" icon={TrendingUp}
              value={isLoading ? "..." : fBRL(totalVenda - totalCusto)}
              sub={`margem ${pct(margemMedia)} sobre venda`}
              iconBg="bg-emerald-50" iconColor="text-emerald-600"
              trend={margemMedia * 100}
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="BDI Médio" icon={Percent}
              value={isLoading ? "..." : pct(bdiMedio)}
              sub="ponderado por custo (orç. c/ BDI)"
              iconBg="bg-indigo-50" iconColor="text-indigo-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Meta de Compras" icon={Target}
              value={isLoading ? "..." : fBRL(totalMeta)}
              sub="alvo de negociação"
              iconBg="bg-purple-50" iconColor="text-purple-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Economia Alvo" icon={Calculator}
              value={isLoading ? "..." : fBRL(totalCusto - totalMeta)}
              sub="custo − meta de compras"
              iconBg="bg-rose-50" iconColor="text-rose-600"
            />
          </div>
          <div className="col-span-2">
            <KpiCard
              title="Total Materiais" icon={Building2}
              value={isLoading ? "..." : fBRL(totalMat)}
              sub={custosTotais > 0 ? `${pct(totalMat / custosTotais)} do custo` : "do custo"}
              iconBg="bg-sky-50" iconColor="text-sky-600"
            />
          </div>
          <div className="col-span-2 lg:col-span-4">
            <KpiCard
              title="Lucro Médio Mensal — Previsto" icon={CalendarDays}
              value={isLoading ? "..." : lucroMensalPrev > 0 ? fBRL(lucroMensalPrev) : "—"}
              sub={lucroMensalPrev > 0 ? "lucro ÷ duração do cronograma" : "nenhum projeto com cronograma vinculado"}
              iconBg="bg-amber-50" iconColor="text-amber-600"
            />
          </div>
          <div className="col-span-2 lg:col-span-4">
            <KpiCard
              title="Lucro Médio Mensal — Realizado" icon={CalendarDays}
              value={isLoading ? "..." : lucroMensalReal > 0 ? fBRL(lucroMensalReal) : "—"}
              sub={lucroMensalReal > 0 ? "conforme avanço físico registrado" : "sem avanço registrado nos projetos"}
              iconBg="bg-emerald-50" iconColor="text-emerald-600"
            />
          </div>
        </div>

        {/* ── Linha 2: Status + Composição Custos + BDI ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Status */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Orçamentos por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                {isLoading ? <Loading /> : statusData.length === 0 ? (
                  <EmptyChart msg="Sem orçamentos" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData} cx="45%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        dataKey="count" nameKey="label"
                        paddingAngle={3}
                      >
                        {statusData.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Legend
                        iconType="circle" iconSize={8}
                        formatter={(v) => <span className="text-xs">{v}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!isLoading && statusData.length > 0 && (
                <div className="mt-2 space-y-1">
                  {statusData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <span className="font-semibold">{s.count} · {formatBRL(s.venda, true)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Composição de Custos */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Composição de Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                {isLoading ? <Loading /> : composicaoCustos.length === 0 ? (
                  <EmptyChart msg="Importe uma planilha com dados de custo" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={composicaoCustos} cx="45%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        dataKey="value" nameKey="name"
                        paddingAngle={3}
                      >
                        {composicaoCustos.map((c, i) => (
                          <Cell key={i} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Legend
                        iconType="circle" iconSize={8}
                        formatter={(v) => <span className="text-xs">{v}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!isLoading && custosTotais > 0 && (
                <div className="mt-2 space-y-1">
                  {composicaoCustos.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="font-semibold">{pct(c.value / custosTotais)} · {formatBRL(c.value, true)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Radial BDI médio */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Indicadores Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                {isLoading ? <Loading /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      cx="50%" cy="55%"
                      innerRadius="20%" outerRadius="90%"
                      data={[
                        { name: "Margem", value: Math.min(margemMedia * 100, 100), fill: "#22c55e" },
                        { name: "BDI",    value: Math.min(bdiMedio * 100, 100),    fill: "#6366f1" },
                        { name: "Economia Alvo", value: totalCusto > 0 ? Math.min(((totalCusto - totalMeta) / totalCusto) * 100, 100) : 0, fill: "#8b5cf6" },
                      ]}
                      startAngle={180} endAngle={0}
                    >
                      <RadialBar dataKey="value" cornerRadius={4} label={false} />
                      <Legend
                        iconType="circle" iconSize={8}
                        formatter={(v) => <span className="text-xs">{v}</span>}
                      />
                      <Tooltip
                        formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Margem</p>
                  <p className="text-sm font-bold text-green-600">{pct(margemMedia)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">BDI Médio</p>
                  <p className="text-sm font-bold text-indigo-600">{pct(bdiMedio)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">∆ Meta</p>
                  <p className="text-sm font-bold text-purple-600">
                    {totalCusto > 0 ? pct((totalCusto - totalMeta) / totalCusto) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Linha 3: Custo vs Venda por Orçamento + Top Clientes ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Custo vs Venda top 10 */}
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Custo × Venda × Meta — Top 10 por Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {isLoading ? <Loading /> : porMargem.length === 0 ? (
                  <EmptyChart msg="Importe orçamentos para visualizar" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porMargem} margin={{ left: 10, right: 10, top: 5, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="codigo" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => formatBRL(v, true)} width={60} />
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                      <Bar dataKey="custo"  name="Custo"  fill="#f59e0b" radius={[3,3,0,0]} />
                      <Bar dataKey="venda"  name="Venda"  fill="#22c55e" radius={[3,3,0,0]} />
                      <Bar dataKey="meta"   name="Meta"   fill="#a78bfa" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Clientes */}
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Top Clientes por Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {isLoading ? <Loading /> : porCliente.length === 0 ? (
                  <EmptyChart msg="Sem clientes cadastrados" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porCliente} layout="vertical" margin={{ left: 4, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={v => formatBRL(v, true)} />
                      <YAxis dataKey="cliente" type="category" tick={{ fontSize: 9 }} width={80} />
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Bar dataKey="venda" name="Venda" fill="#3b82f6" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Linha 4: BDI por Orçamento + Margem por Orçamento ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* BDI por Orçamento */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">BDI por Orçamento — Top 10</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                {isLoading ? <Loading /> : porBdi.length === 0 ? (
                  <EmptyChart msg="Sem BDI cadastrado nos orçamentos" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porBdi} margin={{ left: 10, right: 10, top: 5, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="codigo" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={36} />
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Bar dataKey="bdi" name="BDI %" fill="#6366f1" radius={[4,4,0,0]}>
                        {porBdi.map((_, i) => (
                          <Cell key={i} fill={`hsl(${245 - i * 12}, 70%, ${55 + i * 3}%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Margem por Orçamento */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Margem % por Orçamento — Top 10</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                {isLoading ? <Loading /> : porMargem.length === 0 ? (
                  <EmptyChart msg="Sem orçamentos com custo e venda" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porMargem} margin={{ left: 10, right: 10, top: 5, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="codigo" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={36} />
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                      <Bar dataKey="margem" name="Margem %" radius={[4,4,0,0]}>
                        {porMargem.map((d, i) => (
                          <Cell key={i} fill={d.margem >= 20 ? "#22c55e" : d.margem >= 10 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />≥ 20% bom ·
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mx-1" />10–20% atenção ·
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-1" />&lt; 10% crítico
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Orçamentos Recentes ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Orçamentos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
            ) : !recentes.length ? (
              <div className="py-10 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum orçamento cadastrado ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentes.map((orc: any) => {
                  const st = STATUS_CFG[orc.status] ?? { label: orc.status, color: "#94a3b8" };
                  const bdi = orc.bdiPercentual ? parseFloat(orc.bdiPercentual) : 0;
                  const venda = parseFloat(orc.totalVenda || "0");
                  const custo = parseFloat(orc.totalCusto || "0");
                  const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
                  return (
                    <Link key={orc.id} href={`/orcamento/${orc.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Calculator className="h-4 w-4 text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{orc.codigo}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {orc.cliente || "—"}{orc.local ? ` · ${orc.local}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          {bdi > 0 && (
                            <span className="text-xs text-indigo-600 font-medium hidden sm:inline">
                              BDI {(bdi * 100).toFixed(1)}%
                            </span>
                          )}
                          {margem > 0 && (
                            <span className={`text-xs font-medium hidden md:inline ${margem >= 20 ? "text-green-600" : margem >= 10 ? "text-amber-600" : "text-red-500"}`}>
                              Mrg {margem.toFixed(1)}%
                            </span>
                          )}
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold text-green-600">{formatBRL(venda, true)}</p>
                            <p className="text-xs text-muted-foreground">venda</p>
                          </div>
                          <span className="text-xs text-white px-2 py-0.5 rounded-full" style={{ background: st.color }}>
                            {st.label}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {(data?.total ?? 0) > 5 && (
                  <Link href="/orcamento/lista">
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-muted-foreground hover:text-foreground">
                      Ver todos os {data?.total} orçamentos <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
