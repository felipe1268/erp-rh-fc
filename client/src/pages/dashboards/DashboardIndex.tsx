import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, Clock, Wallet, Timer, HardHat, Gavel, AlertTriangle, Palmtree,
  LayoutDashboard, TrendingUp, ArrowRight, Sparkles, BarChart3, PieChart,
  Shield, FileText, Activity, Target,
} from "lucide-react";

const panoramica = {
  path: "/dashboards/visao-panoramica",
  title: "Visão Panorâmica",
  desc: "Dashboard executivo com todos os indicadores estratégicos da empresa, análise de riscos e insights com IA para tomada de decisão",
  icon: LayoutDashboard,
  gradient: "from-blue-600 via-indigo-600 to-purple-700",
  badge: "CEO / Diretoria",
};

const dashboards = [
  {
    path: "/dashboards/funcionarios",
    title: "Funcionários",
    desc: "Quadro de pessoal, distribuição por setor, função, gênero, turnover e ranking de advertências",
    icon: Users,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    accentBorder: "border-l-blue-500",
    stats: "Quadro de Pessoal",
  },
  {
    path: "/dashboards/cartao-ponto",
    title: "Cartão de Ponto",
    desc: "Frequência, faltas, atrasos, horas trabalhadas por dia e ranking de ausências",
    icon: Clock,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    accentBorder: "border-l-emerald-500",
    stats: "Frequência & Assiduidade",
  },
  {
    path: "/dashboards/folha-pagamento",
    title: "Folha de Pagamento",
    desc: "Custos totais, proventos, descontos, encargos, evolução mensal e top salários",
    icon: Wallet,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
    accentBorder: "border-l-violet-500",
    stats: "Custos & Encargos",
  },
  {
    path: "/dashboards/horas-extras",
    title: "Horas Extras",
    desc: "Ranking por pessoa, obra e setor, custo mensal, % sobre folha e evolução anual",
    icon: Timer,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
    accentBorder: "border-l-orange-500",
    stats: "Custo & Produtividade",
  },
  {
    path: "/dashboards/epis",
    title: "EPIs",
    desc: "Estoque, entregas mensais, CAs vencidos, top EPIs e funcionários com mais entregas",
    icon: HardHat,
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-500",
    accentBorder: "border-l-teal-500",
    stats: "Segurança & Estoque",
  },
  {
    path: "/dashboards/juridico",
    title: "Jurídico",
    desc: "Processos trabalhistas: status, risco, valores, audiências e pedidos mais comuns",
    icon: Gavel,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    accentBorder: "border-l-red-500",
    stats: "Risco & Provisão",
  },
  {
    path: "/dashboards/aviso-previo",
    title: "Aviso Prévio",
    desc: "Avisos prévios: tipos, custos, prazos, vencimentos, setores e composição de rescisão",
    icon: AlertTriangle,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    accentBorder: "border-l-amber-500",
    stats: "Rescisões & Custos",
  },
  {
    path: "/dashboards/ferias",
    title: "Férias",
    desc: "Períodos aquisitivos, concessivos, custos, vencidas, timeline mensal e fracionamento",
    icon: Palmtree,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
    accentBorder: "border-l-green-500",
    stats: "Planejamento & Custos",
  },
];

export default function DashboardIndex() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-500" />
              <h1 className="text-2xl font-bold">Dashboards Analíticos</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              Indicadores estratégicos e operacionais da empresa
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <Activity className="h-3.5 w-3.5" />
            <span>{dashboards.length + 1} dashboards disponíveis</span>
          </div>
        </div>

        {/* Visão Panorâmica — Card Destaque */}
        <Link href={panoramica.path}>
          <div className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${panoramica.gradient} p-6 cursor-pointer group transition-all hover:shadow-xl hover:shadow-blue-500/20`}>
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/4" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
            </div>

            <div className="relative flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 bg-white/20 rounded-lg backdrop-blur-sm">
                    <LayoutDashboard className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-white/80 bg-white/15 px-2 py-0.5 rounded-full mb-1">
                      <Sparkles className="h-3 w-3" />
                      {panoramica.badge}
                    </span>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white mb-1">{panoramica.title}</h2>
                <p className="text-sm text-white/80 max-w-lg leading-relaxed">{panoramica.desc}</p>

                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <PieChart className="h-3.5 w-3.5" />
                    <span>KPIs Consolidados</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Análise de Riscos</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Insights com IA</span>
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center">
                <div className="p-3 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors">
                  <ArrowRight className="h-6 w-6 text-white group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* Grid de Dashboards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dashboards.map(d => {
            const Icon = d.icon;
            return (
              <Link key={d.path} href={d.path}>
                <div className={`relative bg-card rounded-lg border border-border border-l-4 ${d.accentBorder} p-4 cursor-pointer hover:shadow-md transition-all group h-full`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${d.iconBg} shrink-0`}>
                      <Icon className={`h-5 w-5 ${d.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm group-hover:text-blue-500 transition-colors">{d.title}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wider">{d.stats}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed line-clamp-2">{d.desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground group-hover:text-blue-500 transition-colors">
                    <span>Acessar</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
