import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users, Wallet, Clock, Timer, HardHat, Gavel, AlertTriangle, Palmtree,
  TrendingUp, TrendingDown, Minus, BarChart3, Sparkles, RefreshCw,
  Shield, Target, Lightbulb, AlertCircle, CheckCircle2, XCircle,
  ArrowUpRight, ArrowDownRight, Activity, FileText, Brain,
  ChevronDown, ChevronUp, Zap, Eye, DollarSign, Percent, X, Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── Helpers ──
function fmt(v: number | undefined | null): string {
  if (v === undefined || v === null) return "0";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtMoney(v: number | undefined | null): string {
  if (v === undefined || v === null) return "R$ 0";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPercent(v: number | undefined | null): string {
  if (v === undefined || v === null) return "0%";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ── Saúde Badge (clicável) ──
function SaudeBadge({ saude, pontuacao, onClick }: { saude: string; pontuacao: number; onClick?: () => void }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    verde: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Saudável" },
    amarelo: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Atenção" },
    vermelho: { bg: "bg-red-500/10", text: "text-red-600", label: "Crítico" },
  };
  const c = config[saude] || config.amarelo;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} hover:opacity-80 transition-all cursor-pointer`}
      title="Clique para ver o detalhamento da pontuação"
    >
      <div className={`w-2.5 h-2.5 rounded-full ${c.text.replace("text-", "bg-")} animate-pulse`} />
      <span className={`text-sm font-semibold ${c.text}`}>{c.label}</span>
      <span className={`text-sm font-bold ${c.text}`}>{pontuacao}/100</span>
      <Info className={`h-3.5 w-3.5 ${c.text} opacity-60`} />
    </button>
  );
}

// ── Score Detail Dialog ──
function ScoreDetailDialog({ open, onClose, analise }: { open: boolean; onClose: () => void; analise: any }) {
  if (!analise) return null;
  const config: Record<string, { bg: string; text: string; label: string; ring: string }> = {
    verde: { bg: "bg-emerald-500", text: "text-emerald-600", label: "Saudável", ring: "ring-emerald-500" },
    amarelo: { bg: "bg-amber-500", text: "text-amber-600", label: "Atenção", ring: "ring-amber-500" },
    vermelho: { bg: "bg-red-500", text: "text-red-600", label: "Crítico", ring: "ring-red-500" },
  };
  const c = config[analise.saudeGeral] || config.amarelo;
  const pct = analise.pontuacao;

  // Categorize KPIs
  const kpisCriticos = analise.kpisAlerta?.filter((k: any) => k.status === "critico") || [];
  const kpisAtencao = analise.kpisAlerta?.filter((k: any) => k.status === "atencao") || [];
  const kpisOk = analise.kpisAlerta?.filter((k: any) => k.status === "ok") || [];

  // Count impacts
  const riscosAltos = analise.riscos?.filter((r: any) => r.severidade === "critico" || r.severidade === "alto") || [];
  const pontosFortes = analise.pontosFortes?.length || 0;
  const pontosFracos = analise.pontosFracos?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Detalhamento da Pontuação de Saúde
          </DialogTitle>
        </DialogHeader>

        {/* Score Visual */}
        <div className="flex flex-col items-center py-4">
          <div className={`relative w-32 h-32 rounded-full flex items-center justify-center ring-8 ${c.ring}/20`}>
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8"
                className={c.text}
                stroke="currentColor"
                strokeDasharray={`${(pct / 100) * 327} 327`}
                strokeLinecap="round" />
            </svg>
            <div className="text-center z-10">
              <span className={`text-3xl font-bold ${c.text}`}>{pct}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>
          <span className={`mt-3 text-sm font-semibold ${c.text}`}>{c.label}</span>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">{analise.resumoExecutivo}</p>
        </div>

        {/* Composição da Nota */}
        <div className="space-y-4">
          {/* Resumo Rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
              <p className="text-lg font-bold text-emerald-600 mt-1">{pontosFortes}</p>
              <p className="text-[10px] text-muted-foreground">Pontos Fortes</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
              <XCircle className="h-5 w-5 text-red-500 mx-auto" />
              <p className="text-lg font-bold text-red-600 mt-1">{pontosFracos}</p>
              <p className="text-[10px] text-muted-foreground">Pontos Fracos</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
              <p className="text-lg font-bold text-amber-600 mt-1">{riscosAltos.length}</p>
              <p className="text-[10px] text-muted-foreground">Riscos Altos</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-center">
              <Lightbulb className="h-5 w-5 text-blue-500 mx-auto" />
              <p className="text-lg font-bold text-blue-600 mt-1">{analise.oportunidades?.length || 0}</p>
              <p className="text-[10px] text-muted-foreground">Oportunidades</p>
            </div>
          </div>

          {/* KPIs em Alerta (Críticos) */}
          {kpisCriticos.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Indicadores Críticos ({kpisCriticos.length})
              </h4>
              <div className="space-y-1.5">
                {kpisCriticos.map((k: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border-l-4 border-l-red-500">
                    <div>
                      <p className="text-sm font-medium">{k.indicador}</p>
                      <p className="text-[10px] text-muted-foreground">Meta: {k.meta}</p>
                    </div>
                    <span className="text-sm font-bold text-red-600">{k.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs em Atenção */}
          {kpisAtencao.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Indicadores em Atenção ({kpisAtencao.length})
              </h4>
              <div className="space-y-1.5">
                {kpisAtencao.map((k: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/5 border-l-4 border-l-amber-500">
                    <div>
                      <p className="text-sm font-medium">{k.indicador}</p>
                      <p className="text-[10px] text-muted-foreground">Meta: {k.meta}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-600">{k.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs OK */}
          {kpisOk.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Indicadores OK ({kpisOk.length})
              </h4>
              <div className="space-y-1.5">
                {kpisOk.map((k: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border-l-4 border-l-emerald-500">
                    <div>
                      <p className="text-sm font-medium">{k.indicador}</p>
                      <p className="text-[10px] text-muted-foreground">Meta: {k.meta}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">{k.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Principais Riscos */}
          {riscosAltos.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Riscos que Impactam a Nota
              </h4>
              <div className="space-y-1.5">
                {riscosAltos.map((r: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-lg bg-red-500/5 border-l-4 border-l-red-500">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{r.titulo}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">{r.severidade}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.descricao}</p>
                    <p className="text-xs text-blue-500 mt-1">Ação: {r.acaoImediata}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pontos Fracos que puxam a nota */}
          {analise.pontosFracos?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Pontos Fracos que Reduzem a Nota
              </h4>
              <div className="space-y-1.5">
                {analise.pontosFracos.map((p: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-lg bg-muted/30 border-l-4 border-l-red-400">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{p.titulo}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        p.impacto === "alto" ? "bg-red-500/10 text-red-600" : p.impacto === "medio" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
                      }`}>{p.impacto}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>
                    <p className="text-xs text-blue-500 mt-1">Recomendação: {p.recomendacao}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── KPI Card ──
function KpiCard({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string; sub?: string; color: string; trend?: "up" | "down" | "neutral";
}) {
  const colorMap: Record<string, { iconBg: string; iconColor: string; border: string }> = {
    blue: { iconBg: "bg-blue-500/10", iconColor: "text-blue-500", border: "border-l-blue-500" },
    green: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500", border: "border-l-emerald-500" },
    violet: { iconBg: "bg-violet-500/10", iconColor: "text-violet-500", border: "border-l-violet-500" },
    orange: { iconBg: "bg-orange-500/10", iconColor: "text-orange-500", border: "border-l-orange-500" },
    teal: { iconBg: "bg-teal-500/10", iconColor: "text-teal-500", border: "border-l-teal-500" },
    red: { iconBg: "bg-red-500/10", iconColor: "text-red-500", border: "border-l-red-500" },
    amber: { iconBg: "bg-amber-500/10", iconColor: "text-amber-500", border: "border-l-amber-500" },
    emerald: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500", border: "border-l-emerald-500" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`bg-card rounded-lg border border-border border-l-4 ${c.border} p-4`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${c.iconBg}`}>
          <Icon className={`h-4 w-4 ${c.iconColor}`} />
        </div>
        {trend === "up" && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
        {trend === "down" && <ArrowDownRight className="h-4 w-4 text-red-500" />}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section Header ──
function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`p-1.5 rounded-md bg-${color}-500/10`}>
        <Icon className={`h-4 w-4 text-${color}-500`} />
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
    </div>
  );
}

// ── Mini Bar ──
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full bg-${color}-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Insight Card ──
function InsightCard({ type, titulo, descricao, extra, extraLabel, badge, badgeColor }: {
  type: "forte" | "fraco" | "risco" | "oportunidade";
  titulo: string; descricao: string; extra?: string; extraLabel?: string;
  badge?: string; badgeColor?: string;
}) {
  const icons = {
    forte: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    fraco: <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
    risco: <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    oportunidade: <Lightbulb className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
  };
  const badgeColors: Record<string, string> = {
    alto: "bg-red-500/10 text-red-600",
    medio: "bg-amber-500/10 text-amber-600",
    baixo: "bg-emerald-500/10 text-emerald-600",
    critico: "bg-red-600/10 text-red-700",
    alta: "bg-red-500/10 text-red-600",
    media: "bg-amber-500/10 text-amber-600",
    baixa: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      {icons[type]}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{titulo}</p>
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badgeColors[badge] || "bg-muted text-muted-foreground"}`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{descricao}</p>
        {extra && (
          <p className="text-xs text-blue-500 mt-1 font-medium">
            {extraLabel ? `${extraLabel}: ` : ""}{extra}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Plano de Ação Row ──
function AcaoRow({ acao, prazo, responsavel, prioridade }: {
  acao: string; prazo: string; responsavel: string; prioridade: string;
}) {
  const prazoColors: Record<string, string> = {
    imediato: "bg-red-500/10 text-red-600",
    curto: "bg-amber-500/10 text-amber-600",
    medio: "bg-blue-500/10 text-blue-600",
    longo: "bg-emerald-500/10 text-emerald-600",
  };
  const prioColors: Record<string, string> = {
    alta: "bg-red-500/10 text-red-600",
    media: "bg-amber-500/10 text-amber-600",
    baixa: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <Target className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{acao}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${prazoColors[prazo] || "bg-muted"}`}>
            {prazo}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${prioColors[prioridade] || "bg-muted"}`}>
            {prioridade}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {responsavel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════
export default function VisaoPanoramica() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyName = (selectedCompany as any)?.nomeFantasia || (selectedCompany as any)?.razaoSocial || "Empresa";
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [showAllFortes, setShowAllFortes] = useState(false);
  const [showAllFracos, setShowAllFracos] = useState(false);
  const [showAllRiscos, setShowAllRiscos] = useState(false);
  const [showAllOportunidades, setShowAllOportunidades] = useState(false);
  const [showAllAcoes, setShowAllAcoes] = useState(false);

  const { data, isLoading } = trpc.visaoPanoramica.getData.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const analiseMutation = trpc.visaoPanoramica.analiseIA.useMutation({
    onError: () => toast.error("Erro ao gerar análise IA"),
  });

  const analise = analiseMutation.data;

  const handleGerarAnalise = () => {
    if (companyId > 0) {
      analiseMutation.mutate({ companyId, companyName });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum dado disponível</p>
          <p className="text-sm">Selecione uma empresa para visualizar os indicadores</p>
        </div>
      </DashboardLayout>
    );
  }

  const d = data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <Eye className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Visão Panorâmica</h1>
                <p className="text-xs text-muted-foreground">Dashboard Executivo — {companyName}</p>
              </div>
            </div>
          </div>
          {analise && <SaudeBadge saude={analise.saudeGeral} pontuacao={analise.pontuacao} onClick={() => setShowScoreDetail(true)} />}
        </div>

        {/* ── KPIs PESSOAL ── */}
        <div>
          <SectionHeader icon={Users} title="Quadro de Pessoal" color="blue" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={Users} label="Funcionários Ativos" value={fmt(d.pessoal.ativos)} sub={`${fmt(d.pessoal.totalFuncionarios)} total`} color="blue" />
            <KpiCard icon={TrendingUp} label="Admissões (3m)" value={fmt(d.pessoal.admissoes3m)} color="green" trend="up" />
            <KpiCard icon={AlertTriangle} label="Afastados" value={fmt(d.pessoal.afastados)} color="amber" />
            <KpiCard icon={Clock} label="Faltas no Mês" value={fmt(d.ponto.totalFaltas)} sub={`${fmt(d.ponto.totalAtrasos)} atrasos`} color="orange" />
            <KpiCard icon={FileText} label="Atestados" value={fmt(d.atestados.total)} sub={`${fmt(d.atestados.totalDias)} dias`} color="red" />
            <KpiCard icon={AlertCircle} label="Advertências" value={fmt(d.advertencias.total)} color="amber" />
          </div>
        </div>

        {/* ── KPIs FINANCEIROS ── */}
        <div>
          <SectionHeader icon={Wallet} title="Indicadores Financeiros" color="violet" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={DollarSign} label="Massa Salarial" value={fmtMoney(d.pessoal.massaSalarial)} color="violet" />
            <KpiCard icon={Wallet} label="Folha Bruta" value={fmtMoney(d.folha.custoAtual)}
              sub={`Var: ${fmtPercent(d.folha.variacaoPercentual)}`}
              color="violet"
              trend={d.folha.variacaoPercentual > 0 ? "up" : d.folha.variacaoPercentual < 0 ? "down" : "neutral"} />
            <KpiCard icon={Timer} label="Horas Extras" value={fmtMoney(d.horasExtras.totalValor)}
              sub={`${d.horasExtras.totalHoras}h (${d.horasExtras.percentualSobreFolha}% folha)`}
              color="orange" />
            <KpiCard icon={Palmtree} label="Férias Vencidas" value={fmt(d.ferias.vencidas)}
              sub={fmtMoney(d.ferias.custoVencidas)}
              color="green" trend={d.ferias.vencidas > 0 ? "down" : "neutral"} />
            <KpiCard icon={AlertTriangle} label="Avisos Prévios" value={fmt(d.avisosPrevios.emAndamento)}
              sub={fmtMoney(d.avisosPrevios.custoEstimado)}
              color="amber" />
            <KpiCard icon={Gavel} label="Valor em Risco" value={fmtMoney(d.juridico.valorEmRisco)}
              sub={`${fmt(d.juridico.processosAtivos)} processos ativos`}
              color="red" />
          </div>
        </div>

        {/* ── SEGURANÇA & JURÍDICO ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SST */}
          <div className="bg-card rounded-lg border border-border p-4">
            <SectionHeader icon={HardHat} title="Segurança do Trabalho" color="teal" />
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Itens EPI</p>
                <p className="text-xl font-bold mt-1">{fmt(d.epis.totalItens)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Estoque Baixo</p>
                <p className={`text-xl font-bold mt-1 ${d.epis.estoqueBaixo > 0 ? "text-amber-500" : ""}`}>{fmt(d.epis.estoqueBaixo)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">CAs Vencidos</p>
                <p className={`text-xl font-bold mt-1 ${d.epis.caVencido > 0 ? "text-red-500" : ""}`}>{fmt(d.epis.caVencido)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Alertas Pendentes</p>
                <p className={`text-xl font-bold mt-1 ${d.epis.alertasPendentes > 0 ? "text-amber-500" : ""}`}>{fmt(d.epis.alertasPendentes)}</p>
              </div>
            </div>
          </div>

          {/* Jurídico */}
          <div className="bg-card rounded-lg border border-border p-4">
            <SectionHeader icon={Gavel} title="Jurídico Trabalhista" color="red" />
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Processos Ativos</p>
                <p className="text-xl font-bold mt-1">{fmt(d.juridico.processosAtivos)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Alto Risco</p>
                <p className={`text-xl font-bold mt-1 ${d.juridico.processosAltoRisco > 0 ? "text-red-500" : ""}`}>{fmt(d.juridico.processosAltoRisco)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Valor em Risco</p>
                <p className="text-xl font-bold mt-1 text-red-500">{fmtMoney(d.juridico.valorEmRisco)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Próx. Audiências</p>
                <p className={`text-xl font-bold mt-1 ${d.juridico.proximasAudiencias > 0 ? "text-amber-500" : ""}`}>{fmt(d.juridico.proximasAudiencias)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── EVOLUÇÃO FOLHA (mini chart) ── */}
        {d.folha.evolucao.length > 0 && (
          <div className="bg-card rounded-lg border border-border p-4">
            <SectionHeader icon={TrendingUp} title="Evolução da Folha de Pagamento" color="violet" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {d.folha.evolucao.map((e: any) => (
                <div key={e.mes} className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground font-medium">{e.mes}</p>
                  <p className="text-sm font-bold mt-1">{fmtMoney(e.proventos)}</p>
                  <div className="mt-2">
                    <MiniBar value={e.proventos} max={Math.max(...d.folha.evolucao.map((x: any) => x.proventos))} color="violet" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Líq: {fmtMoney(e.liquido)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANÁLISE COM IA ── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Análise Estratégica com IA</h2>
                  <p className="text-xs text-white/70">Insights baseados nos dados reais da empresa</p>
                </div>
              </div>
              <Button
                onClick={handleGerarAnalise}
                disabled={analiseMutation.isPending}
                variant="secondary"
                size="sm"
                className="bg-white/20 text-white hover:bg-white/30 border-0"
              >
                {analiseMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analisando...</>
                ) : analise ? (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Atualizar</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Gerar Análise</>
                )}
              </Button>
            </div>
          </div>

          {analiseMutation.isPending && (
            <div className="p-8 flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Analisando todos os dados da empresa...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
          )}

          {analise && !analiseMutation.isPending && (
            <div className="p-5 space-y-6">
              {/* Resumo Executivo */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/5 to-indigo-500/5 border border-blue-500/10">
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-600 mb-1">Resumo Executivo</p>
                    <p className="text-sm leading-relaxed">{analise.resumoExecutivo}</p>
                  </div>
                </div>
              </div>

              {/* KPIs Alerta */}
              {analise.kpisAlerta?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-amber-500" />
                    Indicadores em Alerta
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {analise.kpisAlerta.map((k: any, i: number) => {
                      const statusColors: Record<string, string> = {
                        critico: "border-l-red-500 bg-red-500/5",
                        atencao: "border-l-amber-500 bg-amber-500/5",
                        ok: "border-l-emerald-500 bg-emerald-500/5",
                      };
                      return (
                        <div key={i} className={`p-3 rounded-lg border-l-4 ${statusColors[k.status] || ""}`}>
                          <p className="text-xs text-muted-foreground">{k.indicador}</p>
                          <p className="text-sm font-bold mt-0.5">{k.valor}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Meta: {k.meta}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grid 2x2: Fortes, Fracos, Riscos, Oportunidades */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pontos Fortes */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Pontos Fortes
                  </h3>
                  <div className="space-y-2">
                    {(showAllFortes ? analise.pontosFortes : analise.pontosFortes?.slice(0, 3))?.map((p: any, i: number) => (
                      <InsightCard key={i} type="forte" titulo={p.titulo} descricao={p.descricao} badge={p.impacto} />
                    ))}
                    {analise.pontosFortes?.length > 3 && (
                      <button onClick={() => setShowAllFortes(!showAllFortes)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        {showAllFortes ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver todos ({analise.pontosFortes.length})</>}
                      </button>
                    )}
                  </div>
                </div>

                {/* Pontos Fracos */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Pontos de Melhoria
                  </h3>
                  <div className="space-y-2">
                    {(showAllFracos ? analise.pontosFracos : analise.pontosFracos?.slice(0, 3))?.map((p: any, i: number) => (
                      <InsightCard key={i} type="fraco" titulo={p.titulo} descricao={p.descricao} badge={p.impacto} extra={p.recomendacao} extraLabel="Recomendação" />
                    ))}
                    {analise.pontosFracos?.length > 3 && (
                      <button onClick={() => setShowAllFracos(!showAllFracos)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        {showAllFracos ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver todos ({analise.pontosFracos.length})</>}
                      </button>
                    )}
                  </div>
                </div>

                {/* Riscos */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Riscos Identificados
                  </h3>
                  <div className="space-y-2">
                    {(showAllRiscos ? analise.riscos : analise.riscos?.slice(0, 3))?.map((r: any, i: number) => (
                      <InsightCard key={i} type="risco" titulo={r.titulo} descricao={r.descricao} badge={r.severidade} extra={r.acaoImediata} extraLabel="Ação" />
                    ))}
                    {analise.riscos?.length > 3 && (
                      <button onClick={() => setShowAllRiscos(!showAllRiscos)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        {showAllRiscos ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver todos ({analise.riscos.length})</>}
                      </button>
                    )}
                  </div>
                </div>

                {/* Oportunidades */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    Oportunidades
                  </h3>
                  <div className="space-y-2">
                    {(showAllOportunidades ? analise.oportunidades : analise.oportunidades?.slice(0, 3))?.map((o: any, i: number) => (
                      <InsightCard key={i} type="oportunidade" titulo={o.titulo} descricao={o.descricao} badge={o.potencial} />
                    ))}
                    {analise.oportunidades?.length > 3 && (
                      <button onClick={() => setShowAllOportunidades(!showAllOportunidades)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        {showAllOportunidades ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver todos ({analise.oportunidades.length})</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Planos de Ação */}
              {analise.planosAcao?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Target className="h-4 w-4 text-blue-500" />
                    Planos de Ação Recomendados
                  </h3>
                  <div className="space-y-2">
                    {(showAllAcoes ? analise.planosAcao : analise.planosAcao?.slice(0, 5))?.map((a: any, i: number) => (
                      <AcaoRow key={i} acao={a.acao} prazo={a.prazo} responsavel={a.responsavel} prioridade={a.prioridade} />
                    ))}
                    {analise.planosAcao?.length > 5 && (
                      <button onClick={() => setShowAllAcoes(!showAllAcoes)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        {showAllAcoes ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver todos ({analise.planosAcao.length})</>}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!analise && !analiseMutation.isPending && (
            <div className="p-8 flex flex-col items-center gap-3 text-center">
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Brain className="h-8 w-8 text-blue-500" />
              </div>
              <p className="text-sm font-medium">Análise Estratégica com Inteligência Artificial</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Clique em "Gerar Análise" para que a IA analise todos os dados da empresa e forneça
                insights estratégicos, pontos fortes, riscos e planos de ação recomendados.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Score Detail Dialog */}
      <ScoreDetailDialog open={showScoreDetail} onClose={() => setShowScoreDetail(false)} analise={analise} />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
