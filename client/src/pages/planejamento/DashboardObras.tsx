import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import {
  Building2, DollarSign, TrendingUp, AlertTriangle,
  CheckCircle2, Activity, BarChart3, Target, ArrowUpRight,
  ArrowDownRight, Minus, Filter, ChevronDown, ChevronUp, Calendar,
  Loader2, Gauge, Users, Layers, Eye,
} from "lucide-react";

const n = (v: any) => parseFloat(v || "0") || 0;

// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), sem abreviar.
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBRLFull(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(v: number) {
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function spiColor(spi: number) {
  if (spi >= 1.0) return "text-emerald-400";
  if (spi >= 0.9) return "text-amber-400";
  return "text-red-400";
}

function spiLabel(spi: number, type: "spi" | "cpi") {
  if (type === "spi") {
    if (spi >= 1.0) return "Dentro do prazo";
    if (spi >= 0.9) return "Atenção ao prazo";
    return "Atraso significativo";
  }
  if (spi >= 1.0) return "Custo sob controle";
  if (spi >= 0.9) return "Custo em alerta";
  return "Estouro de custo";
}

function desvioIcon(desvio: number) {
  if (desvio > 0.5) return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
  if (desvio < -0.5) return <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-gray-500" />;
}

function DualProgressBar({ previsto, realizado }: { previsto: number; realizado: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-blue-400 font-medium">Prev: {formatPct(previsto)}</span>
        <span className={`font-medium ${realizado >= previsto ? "text-emerald-400" : "text-red-400"}`}>
          Real: {formatPct(realizado)}
        </span>
      </div>
      <div className="relative w-full bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
        <div className="absolute inset-0 bg-blue-500/40 rounded-full" style={{ width: `${Math.min(100, previsto)}%` }} />
        <div className={`absolute inset-0 rounded-full ${realizado >= previsto ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, realizado)}%`, opacity: 0.85 }} />
      </div>
    </div>
  );
}

interface DashboardObrasProps {
  onNavigate: (projetoId: number) => void;
}

export default function DashboardObras({ onNavigate }: DashboardObrasProps) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const { isAdminMaster, isSensitiveHidden } = usePermissions();
  const hideFinancial = !isAdminMaster && isSensitiveHidden("planejamento", "valores_planejamento");

  const [filtroObra, setFiltroObra] = useState<number | "all">("all");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [ordenacao, setOrdenacao] = useState<"nome" | "avanco" | "spi" | "valor" | "prazo">("avanco");

  const { data, isLoading } = trpc.planejamento.dashboardGeral.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const projetos = useMemo(() => {
    if (!data?.projetos) return [];
    let list = data.projetos as any[];
    if (filtroObra !== "all") list = list.filter(p => p.id === filtroObra);
    return [...list].sort((a, b) => {
      switch (ordenacao) {
        case "nome": return (a.nome || "").localeCompare(b.nome || "");
        case "avanco": return b.avancoRealizado - a.avancoRealizado;
        case "spi": return a.spi - b.spi;
        case "valor": return b.valorContrato - a.valorContrato;
        case "prazo": return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999);
        default: return 0;
      }
    });
  }, [data, filtroObra, ordenacao]);

  const kpis = useMemo(() => {
    if (!projetos.length) return null;
    const total = projetos.length;
    const emAndamento = projetos.filter(p => (p.status || "").toLowerCase().includes("andamento")).length;
    const concluidos = projetos.filter(p => (p.status || "").toLowerCase().includes("conclu")).length;
    const atrasados = projetos.filter(p => p.atrasado).length;
    const valorTotal = projetos.reduce((s: number, p: any) => s + n(p.valorContrato), 0);
    const custoMetaTotal = projetos.reduce((s: number, p: any) => s + n(p.custoMeta), 0);
    const avgAvancoPrev = projetos.reduce((s: number, p: any) => s + n(p.avancoPrevisto), 0) / total;
    const avgAvancoReal = projetos.reduce((s: number, p: any) => s + n(p.avancoRealizado), 0) / total;
    const withPrev = projetos.filter((p: any) => n(p.avancoPrevisto) > 0);
    const avgSPI = withPrev.length > 0 ? withPrev.reduce((s: number, p: any) => s + n(p.spi), 0) / withPrev.length : 1;
    const withCost = projetos.filter((p: any) => n(p.custoPrevisto) > 0);
    const avgCPI = withCost.length > 0 ? withCost.reduce((s: number, p: any) => s + n(p.cpi), 0) / withCost.length : 1;
    const totalAtividades = projetos.reduce((s: number, p: any) => s + (p.totalAtividades || 0), 0);
    return { total, emAndamento, concluidos, atrasados, valorTotal, custoMetaTotal, avgAvancoPrev, avgAvancoReal, avgSPI, avgCPI, totalAtividades };
  }, [projetos]);

  const toggleExpanded = (id: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando indicadores...</span>
      </div>
    );
  }

  if (!kpis || projetos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
        <BarChart3 className="h-10 w-10 opacity-30" />
        <p className="text-sm">Nenhum projeto encontrado para análise</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-medium">Filtrar:</span>
        </div>
        <select
          value={filtroObra === "all" ? "all" : String(filtroObra)}
          onChange={e => setFiltroObra(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="border border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-[#1E293B] text-white"
        >
          <option value="all">Todas as Obras ({data?.projetos?.length || 0})</option>
          {(data?.projetos || []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <select
          value={ordenacao}
          onChange={e => setOrdenacao(e.target.value as any)}
          className="border border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-[#1E293B] text-white"
        >
          <option value="avanco">Ordenar: Avanço</option>
          <option value="spi">Ordenar: SPI (menor primeiro)</option>
          <option value="valor">Ordenar: Valor</option>
          <option value="prazo">Ordenar: Prazo</option>
          <option value="nome">Ordenar: Nome</option>
        </select>
      </div>

      {/* KPIs Gerais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Building2 className="w-5 h-5" />} label="Total de Obras" value={String(kpis.total)} color="blue" />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Em Andamento" value={String(kpis.emAndamento)} color="green" />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5" />} label="Concluídas" value={String(kpis.concluidos)} color="cyan" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Atrasadas" value={String(kpis.atrasados)} color="red" />
        {!hideFinancial && (
          <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Valor Total" value={formatBRL(kpis.valorTotal)} color="purple" />
        )}
        <KpiCard icon={<Layers className="w-5 h-5" />} label="Atividades" value={String(kpis.totalAtividades)} color="indigo" />
      </div>

      {/* Indicadores Consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-700 bg-[#1E293B] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-medium text-gray-300">Avanço Médio (Geral)</span>
          </div>
          <DualProgressBar previsto={kpis.avgAvancoPrev} realizado={kpis.avgAvancoReal} />
        </div>

        <div className="rounded-lg border border-gray-700 bg-[#1E293B] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">SPI Médio (Prazo)</span>
          </div>
          <p className={`text-2xl font-bold ${spiColor(kpis.avgSPI)}`}>{kpis.avgSPI.toFixed(3)}</p>
          <p className="text-[10px] text-gray-500 mt-1">{spiLabel(kpis.avgSPI, "spi")}</p>
        </div>

        <div className="rounded-lg border border-gray-700 bg-[#1E293B] p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-medium text-gray-300">CPI Médio (Custo)</span>
          </div>
          <p className={`text-2xl font-bold ${spiColor(kpis.avgCPI)}`}>{kpis.avgCPI.toFixed(3)}</p>
          <p className="text-[10px] text-gray-500 mt-1">{spiLabel(kpis.avgCPI, "cpi")}</p>
        </div>

        {!hideFinancial && (
          <div className="rounded-lg border border-gray-700 bg-[#1E293B] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-medium text-gray-300">Custo Meta Total</span>
            </div>
            <p className="text-lg font-bold text-white">{formatBRL(kpis.custoMetaTotal)}</p>
            <p className="text-[10px] text-gray-500 mt-1">
              Margem bruta: {kpis.valorTotal > 0 ? formatPct(((kpis.valorTotal - kpis.custoMetaTotal) / kpis.valorTotal) * 100) : "—"}
            </p>
          </div>
        )}
      </div>

      {/* Análise por Obra */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          Análise por Obra
        </h3>
        <div className="space-y-3">
          {projetos.map((p: any, idx: number) => {
            const expanded = expandedCards.has(p.id);
            return (
              <div
                key={p.id}
                className={`rounded-lg border bg-[#1E293B] transition-all ${p.atrasado ? "border-red-500/40" : "border-gray-700"}`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0 ? "bg-amber-500/20 text-amber-400" : idx === 1 ? "bg-gray-600/40 text-gray-300" : idx === 2 ? "bg-orange-500/20 text-orange-400" : "bg-gray-700/50 text-gray-500"
                    }`}>
                      {idx + 1}º
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-white text-sm truncate">{p.nome}</h4>
                        {p.atrasado && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                            <AlertTriangle className="h-3 w-3" /> Atrasado
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          (p.status || "").toLowerCase().includes("andamento") ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                          (p.status || "").toLowerCase().includes("conclu") ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                          "bg-gray-600/30 text-gray-400 border-gray-600"
                        }`}>
                          {p.status}
                        </span>
                      </div>

                      {(p.cliente || p.responsavel) && (
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                          {p.cliente && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{p.cliente}</span>}
                          {p.responsavel && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{p.responsavel}</span>}
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">Avanço:</span>
                          <span className={`text-xs font-bold ${n(p.avancoRealizado) >= n(p.avancoPrevisto) ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPct(n(p.avancoRealizado))}
                          </span>
                          <span className="text-[10px] text-gray-600">/ {formatPct(n(p.avancoPrevisto))}</span>
                          {desvioIcon(n(p.desvio))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">SPI:</span>
                          <span className={`text-xs font-bold ${spiColor(n(p.spi))}`}>{n(p.spi).toFixed(3)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">CPI:</span>
                          <span className={`text-xs font-bold ${spiColor(n(p.cpi))}`}>{n(p.cpi).toFixed(3)}</span>
                        </div>
                        {p.diasRestantes !== null && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-gray-600" />
                            <span className={`text-xs font-medium ${p.diasRestantes < 0 ? "text-red-400" : p.diasRestantes < 30 ? "text-amber-400" : "text-gray-400"}`}>
                              {p.diasRestantes < 0 ? `${Math.abs(p.diasRestantes)}d atrasado` : `${p.diasRestantes}d restantes`}
                            </span>
                          </div>
                        )}
                        {!hideFinancial && n(p.valorContrato) > 0 && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-3 w-3 text-gray-600" />
                            <span className="text-xs font-medium text-gray-300">{formatBRL(n(p.valorContrato))}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5">
                        <DualProgressBar previsto={n(p.avancoPrevisto)} realizado={n(p.avancoRealizado)} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onNavigate(p.id)}
                        className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                        title="Abrir projeto"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleExpanded(p.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 transition-colors"
                        title={expanded ? "Recolher" : "Expandir detalhes"}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-gray-700 px-4 py-3 bg-[#161F2E]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                      <DetailItem label="Início" value={p.dataInicio || "—"} icon={<Calendar className="h-3 w-3" />} />
                      <DetailItem label="Término Contratual" value={p.dataTerminoContratual || "—"} icon={<Calendar className="h-3 w-3" />} />
                      <DetailItem label="Atividades" value={`${p.totalAtividades || 0} tarefas · ${p.totalMarcos || 0} marcos`} icon={<Layers className="h-3 w-3" />} />
                      {!hideFinancial && (
                        <>
                          <DetailItem label="Custo Meta" value={n(p.custoMeta) > 0 ? formatBRLFull(n(p.custoMeta)) : "—"} icon={<Target className="h-3 w-3" />} />
                          <DetailItem label="Margem" value={n(p.valorContrato) > 0 && n(p.custoMeta) > 0 ? formatPct(((n(p.valorContrato) - n(p.custoMeta)) / n(p.valorContrato)) * 100) : "—"} icon={<DollarSign className="h-3 w-3" />} />
                        </>
                      )}
                      <DetailItem label="Desvio (Prev - Real)" value={`${n(p.desvio) >= 0 ? "+" : ""}${formatPct(n(p.desvio))}`} icon={<Activity className="h-3 w-3" />} />
                      <DetailItem label="Último REFIS" value={p.ultimoRefisSemana || "Nenhum"} icon={<BarChart3 className="h-3 w-3" />} />
                      {!hideFinancial && (
                        <>
                          <DetailItem label="Custo Previsto" value={n(p.custoPrevisto) > 0 ? formatBRLFull(n(p.custoPrevisto)) : "—"} icon={<DollarSign className="h-3 w-3" />} />
                          <DetailItem label="Custo Realizado" value={n(p.custoRealizado) > 0 ? formatBRLFull(n(p.custoRealizado)) : "—"} icon={<DollarSign className="h-3 w-3" />} />
                          <DetailItem label="Valor Contrato" value={n(p.valorContrato) > 0 ? formatBRLFull(n(p.valorContrato)) : "—"} icon={<DollarSign className="h-3 w-3" />} />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Matriz de Saúde */}
      <div className="rounded-lg border border-gray-700 bg-[#1E293B] p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          Matriz de Saúde das Obras
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {projetos.map((p: any) => {
            const spi = n(p.spi);
            const cpi = n(p.cpi);
            let health: "green" | "yellow" | "red" = "green";
            if (spi < 0.9 || cpi < 0.9 || p.atrasado) health = "red";
            else if (spi < 1.0 || cpi < 1.0) health = "yellow";

            const colors = {
              green: "border-emerald-500/30 bg-emerald-500/10",
              yellow: "border-amber-500/30 bg-amber-500/10",
              red: "border-red-500/30 bg-red-500/10",
            };
            const dots = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500" };

            return (
              <div
                key={p.id}
                className={`rounded-lg border p-2.5 cursor-pointer hover:brightness-110 transition-all ${colors[health]}`}
                onClick={() => onNavigate(p.id)}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${dots[health]} shrink-0`} />
                  <span className="text-xs font-medium text-white truncate">{p.nome}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                  <span>SPI: {spi.toFixed(2)}</span>
                  <span>CPI: {cpi.toFixed(2)}</span>
                  <span>{formatPct(n(p.avancoRealizado))}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Saudável (SPI/CPI ≥ 1.0)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Atenção (0.9–1.0)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Crítico (&lt; 0.9)</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const bgMap: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/10",
    green: "border-green-500/30 bg-green-500/10",
    cyan: "border-cyan-500/30 bg-cyan-500/10",
    red: "border-red-500/30 bg-red-500/10",
    purple: "border-purple-500/30 bg-purple-500/10",
    indigo: "border-indigo-500/30 bg-indigo-500/10",
    amber: "border-amber-500/30 bg-amber-500/10",
  };
  const iconMap: Record<string, string> = {
    blue: "text-blue-400",
    green: "text-green-400",
    cyan: "text-cyan-400",
    red: "text-red-400",
    purple: "text-purple-400",
    indigo: "text-indigo-400",
    amber: "text-amber-400",
  };
  return (
    <div className={`rounded-lg border p-4 ${bgMap[color] || bgMap.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={iconMap[color] || iconMap.blue}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function DetailItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-5 h-5 rounded bg-gray-700/50 flex items-center justify-center text-gray-500 shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
        <p className="text-xs font-medium text-gray-300 leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}
