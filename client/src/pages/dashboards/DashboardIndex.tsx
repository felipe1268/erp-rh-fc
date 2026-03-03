import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { useEffect, useState } from "react";
import { usePermissions } from "@/contexts/PermissionsContext";
import {
  Users, Clock, Wallet, Timer, HardHat, Gavel, AlertTriangle, Palmtree,
  ArrowRight, Eye, Activity, ChevronRight, Building2, ShieldCheck, CalendarDays,
} from "lucide-react";

/* ─── Data ─── */
const panoramica = {
  path: "/dashboards/visao-panoramica",
  title: "Visão Panorâmica",
  desc: "Centro de comando executivo com indicadores estratégicos consolidados, análise de riscos e inteligência artificial para tomada de decisão.",
  icon: Eye,
  badge: "CEO / Diretoria",
  features: ["KPIs Consolidados", "Análise de Riscos", "Insights com IA", "Tempo Real"],
};

const dashboards = [
  {
    path: "/dashboards/funcionarios",
    title: "Funcionários",
    desc: "Quadro de pessoal, distribuição por setor, função, gênero, turnover e ranking de advertências.",
    icon: Users,
    color: "#3B82F6",
    bgLight: "bg-blue-50",
    textColor: "text-blue-600",
    borderColor: "border-blue-200",
    hoverBg: "hover:bg-blue-50/80",
    stats: "Quadro de Pessoal",
  },
  {
    path: "/dashboards/cartao-ponto",
    title: "Cartão de Ponto",
    desc: "Frequência, faltas, atrasos, horas trabalhadas por dia e ranking de ausências.",
    icon: Clock,
    color: "#10B981",
    bgLight: "bg-emerald-50",
    textColor: "text-emerald-600",
    borderColor: "border-emerald-200",
    hoverBg: "hover:bg-emerald-50/80",
    stats: "Frequência & Assiduidade",
  },
  {
    path: "/dashboards/folha-pagamento",
    title: "Folha de Pagamento",
    desc: "Custos totais, proventos, descontos, encargos, evolução mensal e top salários.",
    icon: Wallet,
    color: "#8B5CF6",
    bgLight: "bg-violet-50",
    textColor: "text-violet-600",
    borderColor: "border-violet-200",
    hoverBg: "hover:bg-violet-50/80",
    stats: "Custos & Encargos",
  },
  {
    path: "/dashboards/horas-extras",
    title: "Horas Extras",
    desc: "Ranking por pessoa, obra e setor, custo mensal, % sobre folha e evolução anual.",
    icon: Timer,
    color: "#F59E0B",
    bgLight: "bg-amber-50",
    textColor: "text-amber-600",
    borderColor: "border-amber-200",
    hoverBg: "hover:bg-amber-50/80",
    stats: "Custo & Produtividade",
  },
  {
    path: "/dashboards/epis",
    title: "EPIs",
    desc: "Estoque, entregas mensais, CAs vencidos, top EPIs e funcionários com mais entregas.",
    icon: HardHat,
    color: "#14B8A6",
    bgLight: "bg-teal-50",
    textColor: "text-teal-600",
    borderColor: "border-teal-200",
    hoverBg: "hover:bg-teal-50/80",
    stats: "Segurança & Estoque",
  },
  {
    path: "/dashboards/juridico",
    title: "Jurídico",
    desc: "Processos trabalhistas: status, risco, valores, audiências e pedidos mais comuns.",
    icon: Gavel,
    color: "#EF4444",
    bgLight: "bg-red-50",
    textColor: "text-red-600",
    borderColor: "border-red-200",
    hoverBg: "hover:bg-red-50/80",
    stats: "Risco & Provisão",
  },
  {
    path: "/dashboards/aviso-previo",
    title: "Aviso Prévio",
    desc: "Avisos prévios: tipos, custos, prazos, vencimentos, setores e composição de rescisão.",
    icon: AlertTriangle,
    color: "#F97316",
    bgLight: "bg-orange-50",
    textColor: "text-orange-600",
    borderColor: "border-orange-200",
    hoverBg: "hover:bg-orange-50/80",
    stats: "Rescisões & Custos",
  },
  {
    path: "/dashboards/ferias",
    title: "Férias",
    desc: "Períodos aquisitivos, concessivos, custos, vencidas, timeline mensal e fracionamento.",
    icon: Palmtree,
    color: "#22C55E",
    bgLight: "bg-green-50",
    textColor: "text-green-600",
    borderColor: "border-green-200",
    hoverBg: "hover:bg-green-50/80",
    stats: "Planejamento & Custos",
  },
  {
    path: "/dashboards/efetivo-obra",
    title: "Efetivo por Obra",
    desc: "Histograma de mão de obra por obra, evolução mensal, inconsistências ponto x alocação e funcionários sem obra.",
    icon: Building2,
    color: "#F97316",
    bgLight: "bg-orange-50",
    textColor: "text-orange-600",
    borderColor: "border-orange-200",
    hoverBg: "hover:bg-orange-50/80",
    stats: "Alocação & Efetivo",
  },
  {
    path: "/dashboards/controle-documentos",
    title: "Controle de Documentos",
    desc: "Compliance documental: ASOs, treinamentos, CNH e documentos pessoais. Alertas de vencimento e funcionários com pendências.",
    icon: ShieldCheck,
    color: "#0EA5E9",
    bgLight: "bg-sky-50",
    textColor: "text-sky-600",
    borderColor: "border-sky-200",
    hoverBg: "hover:bg-sky-50/80",
    stats: "Compliance & Validade",
  },
  {
    path: "/dashboards/competencias",
    title: "Competências",
    desc: "Visão consolidada anual: evolução salarial, encargos, benefícios, inconsistências e custo por obra.",
    icon: CalendarDays,
    color: "#6366F1",
    bgLight: "bg-indigo-50",
    textColor: "text-indigo-600",
    borderColor: "border-indigo-200",
    hoverBg: "hover:bg-indigo-50/80",
    stats: "Anual & Rateio",
  },
];

// Map dashboard paths to the main route they relate to
const DASH_TO_ROUTE: Record<string, string> = {
  "/dashboards/funcionarios": "/colaboradores",
  "/dashboards/cartao-ponto": "/fechamento-ponto",
  "/dashboards/folha-pagamento": "/folha-pagamento",
  "/dashboards/horas-extras": "/solicitacao-he",
  "/dashboards/epis": "/epis",
  "/dashboards/juridico": "/processos-trabalhistas",
  "/dashboards/aviso-previo": "/aviso-previo",
  "/dashboards/ferias": "/ferias",
  "/dashboards/efetivo-obra": "/efetivo-obra",
  "/dashboards/controle-documentos": "/controle-documentos",
  "/dashboards/competencias": "/gestao-competencias",
  "/dashboards/visao-panoramica": "/dashboards",
};

export default function DashboardIndex() {
  const [time, setTime] = useState(new Date());
  const { hasGroup, groupCanAccessRoute, isAdminMaster } = usePermissions();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ─── HEADER ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Centro de Comando
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Dashboards Analíticos &bull; FC Gestão Integrada
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-gray-600">{dashboards.length + 1} módulos ativos</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-xs font-medium text-gray-600">{timeStr}</span>
            </div>
          </div>
        </div>

        {/* ─── HERO: VISÃO PANORÂMICA ─── */}
        {(isAdminMaster || !hasGroup) && <Link href={panoramica.path}>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 cursor-pointer group transition-all duration-300 hover:shadow-xl hover:shadow-blue-200/50">
            {/* Subtle pattern */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)`,
              }}
            />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 mb-4">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <span className="text-[11px] font-semibold text-white/90 tracking-wider uppercase">{panoramica.badge}</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
                    {panoramica.title}
                  </h2>
                  <p className="text-sm text-white/75 max-w-xl leading-relaxed">
                    {panoramica.desc}
                  </p>

                  {/* Feature chips */}
                  <div className="flex flex-wrap items-center gap-2 mt-5">
                    {panoramica.features.map(f => (
                      <div key={f} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 border border-white/15">
                        <span className="text-[11px] font-medium text-white/85">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right side — icon + arrow */}
                <div className="hidden md:flex flex-col items-center gap-4 ml-8">
                  <div className="p-4 rounded-2xl bg-white/10 border border-white/15 group-hover:bg-white/15 transition-all">
                    <Eye className="h-10 w-10 text-white/80 group-hover:text-white transition-colors" />
                  </div>
                  <div className="p-2 rounded-full bg-white/10 border border-white/15 group-hover:bg-white/20 transition-all">
                    <ArrowRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Link>}

        {/* ─── SECTION DIVIDER ─── */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-semibold text-gray-400 tracking-[0.15em] uppercase">Módulos Analíticos</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* ─── DASHBOARD GRID ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dashboards.filter(d => {
            if (isAdminMaster || !hasGroup) return true;
            const mainRoute = DASH_TO_ROUTE[d.path];
            return mainRoute ? groupCanAccessRoute(mainRoute) : false;
          }).map((d) => {
            const Icon = d.icon;
            return (
              <Link key={d.path} href={d.path}>
                <div className={`relative rounded-xl bg-white border border-gray-200 p-5 cursor-pointer h-full group transition-all duration-300 hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5 ${d.hoverBg}`}>
                  {/* Top accent line */}
                  <div className="absolute top-0 left-5 right-5 h-0.5 rounded-b-full" style={{ background: d.color }} />

                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${d.bgLight}`}>
                      <Icon className="h-5 w-5" style={{ color: d.color }} />
                    </div>
                    <span className="relative flex h-2 w-2 mt-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: d.color }} />
                      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: d.color }} />
                    </span>
                  </div>

                  {/* Title & subtitle */}
                  <h3 className="font-bold text-gray-900 text-sm mb-0.5 group-hover:text-gray-700 transition-colors">{d.title}</h3>
                  <p className="text-[10px] font-semibold tracking-wide uppercase mb-2" style={{ color: d.color }}>
                    {d.stats}
                  </p>

                  {/* Description */}
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">{d.desc}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-[11px] font-medium text-gray-400 tracking-wide">Acessar módulo</span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ─── FOOTER STATUS BAR ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-medium text-emerald-600 tracking-wide">Sistema Operacional</span>
            </div>
            <div className="hidden sm:block h-3 w-px bg-gray-300" />
            <span className="hidden sm:block text-[11px] text-gray-500">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-mono">v.121</span>
            <div className="h-3 w-px bg-gray-300" />
            <span className="text-[11px] text-gray-500 font-mono">{timeStr}</span>
          </div>
        </div>
      </div>
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
