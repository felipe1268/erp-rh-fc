import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useEffect, useRef, useState } from "react";
import {
  Users, Clock, Wallet, Timer, HardHat, Gavel, AlertTriangle, Palmtree,
  LayoutDashboard, ArrowRight, Sparkles, Shield, Brain,
  Zap, Activity, Eye, Cpu, Signal, Radar,
} from "lucide-react";

/* ─── Animated grid background ─── */
function CyberGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      {/* Radial glow top-right */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      {/* Radial glow bottom-left */}
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      {/* Scanning line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-pulse" />
    </div>
  );
}

/* ─── Floating particles ─── */
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-blue-400/20"
          style={{
            left: `${10 + (i * 7.5) % 90}%`,
            top: `${5 + (i * 13) % 85}%`,
            animation: `float ${3 + (i % 3)}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px) scale(1); opacity: 0.3; }
          100% { transform: translateY(-15px) scale(1.5); opacity: 0.7; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 5px rgba(59,130,246,0.1), 0 0 20px rgba(59,130,246,0.05); }
          50% { box-shadow: 0 0 10px rgba(59,130,246,0.2), 0 0 40px rgba(59,130,246,0.1); }
        }
        @keyframes border-glow {
          0%, 100% { border-color: rgba(59,130,246,0.15); }
          50% { border-color: rgba(59,130,246,0.35); }
        }
        @keyframes neon-text {
          0%, 100% { text-shadow: 0 0 5px rgba(59,130,246,0.3); }
          50% { text-shadow: 0 0 15px rgba(59,130,246,0.5), 0 0 30px rgba(59,130,246,0.2); }
        }
        @keyframes data-stream {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
        .cyber-card {
          backdrop-filter: blur(12px);
          background: linear-gradient(135deg, rgba(15,23,42,0.6), rgba(30,41,59,0.4));
          border: 1px solid rgba(59,130,246,0.12);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cyber-card:hover {
          border-color: rgba(59,130,246,0.4);
          box-shadow: 0 0 20px rgba(59,130,246,0.15), 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
          transform: translateY(-2px);
        }
        .cyber-card:hover .card-glow {
          opacity: 1;
        }
        .cyber-card:hover .card-icon {
          filter: drop-shadow(0 0 8px currentColor);
        }
        .cyber-card:hover .card-arrow {
          transform: translateX(4px);
          opacity: 1;
        }
        .hero-card {
          backdrop-filter: blur(16px);
          border: 1px solid rgba(59,130,246,0.25);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          animation: glow-pulse 4s ease-in-out infinite;
        }
        .hero-card:hover {
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 0 40px rgba(59,130,246,0.2), 0 0 80px rgba(99,102,241,0.1), 0 20px 60px rgba(0,0,0,0.4);
          transform: translateY(-3px);
        }
        .status-dot {
          animation: float 2s ease-in-out infinite alternate;
        }
        .neon-badge {
          text-shadow: 0 0 8px currentColor;
        }
      `}</style>
    </div>
  );
}

/* ─── Status indicator ─── */
function StatusPulse({ color = "emerald" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 bg-${color}-500`} />
    </span>
  );
}

/* ─── Data ─── */
const panoramica = {
  path: "/dashboards/visao-panoramica",
  title: "Visão Panorâmica",
  desc: "Centro de comando executivo com indicadores estratégicos consolidados, análise de riscos e inteligência artificial para tomada de decisão",
  icon: Eye,
  badge: "CEO / Diretoria",
};

const dashboards = [
  {
    path: "/dashboards/funcionarios",
    title: "Funcionários",
    desc: "Quadro de pessoal, distribuição por setor, função, gênero, turnover e ranking de advertências",
    icon: Users,
    color: "#3B82F6",
    colorName: "blue",
    stats: "QUADRO DE PESSOAL",
    status: "online",
  },
  {
    path: "/dashboards/cartao-ponto",
    title: "Cartão de Ponto",
    desc: "Frequência, faltas, atrasos, horas trabalhadas por dia e ranking de ausências",
    icon: Clock,
    color: "#10B981",
    colorName: "emerald",
    stats: "FREQUÊNCIA & ASSIDUIDADE",
    status: "online",
  },
  {
    path: "/dashboards/folha-pagamento",
    title: "Folha de Pagamento",
    desc: "Custos totais, proventos, descontos, encargos, evolução mensal e top salários",
    icon: Wallet,
    color: "#8B5CF6",
    colorName: "violet",
    stats: "CUSTOS & ENCARGOS",
    status: "online",
  },
  {
    path: "/dashboards/horas-extras",
    title: "Horas Extras",
    desc: "Ranking por pessoa, obra e setor, custo mensal, % sobre folha e evolução anual",
    icon: Timer,
    color: "#F59E0B",
    colorName: "amber",
    stats: "CUSTO & PRODUTIVIDADE",
    status: "online",
  },
  {
    path: "/dashboards/epis",
    title: "EPIs",
    desc: "Estoque, entregas mensais, CAs vencidos, top EPIs e funcionários com mais entregas",
    icon: HardHat,
    color: "#14B8A6",
    colorName: "teal",
    stats: "SEGURANÇA & ESTOQUE",
    status: "online",
  },
  {
    path: "/dashboards/juridico",
    title: "Jurídico",
    desc: "Processos trabalhistas: status, risco, valores, audiências e pedidos mais comuns",
    icon: Gavel,
    color: "#EF4444",
    colorName: "red",
    stats: "RISCO & PROVISÃO",
    status: "online",
  },
  {
    path: "/dashboards/aviso-previo",
    title: "Aviso Prévio",
    desc: "Avisos prévios: tipos, custos, prazos, vencimentos, setores e composição de rescisão",
    icon: AlertTriangle,
    color: "#F97316",
    colorName: "orange",
    stats: "RESCISÕES & CUSTOS",
    status: "online",
  },
  {
    path: "/dashboards/ferias",
    title: "Férias",
    desc: "Períodos aquisitivos, concessivos, custos, vencidas, timeline mensal e fracionamento",
    icon: Palmtree,
    color: "#22C55E",
    colorName: "green",
    stats: "PLANEJAMENTO & CUSTOS",
    status: "online",
  },
];

export default function DashboardIndex() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <DashboardLayout>
      <div className="relative min-h-[calc(100vh-80px)]">
        <CyberGrid />
        <Particles />

        <div className="relative space-y-6 z-10">
          {/* ─── HEADER ─── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20">
                    <Cpu className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="absolute -top-0.5 -right-0.5">
                    <StatusPulse />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight" style={{ animation: "neon-text 3s ease-in-out infinite" }}>
                    Centro de Comando
                  </h1>
                  <p className="text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
                    Dashboards Analíticos • FC Gestão Integrada
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Live clock */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/15 bg-blue-500/5">
                <Signal className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-mono text-blue-300 tracking-wider">{timeStr}</span>
              </div>
              {/* Module count */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/5">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-mono text-emerald-300">{dashboards.length + 1} módulos ativos</span>
              </div>
            </div>
          </div>

          {/* ─── HERO: VISÃO PANORÂMICA ─── */}
          <Link href={panoramica.path}>
            <div className="hero-card relative overflow-hidden rounded-2xl cursor-pointer group"
              style={{
                background: "linear-gradient(135deg, rgba(30,58,138,0.5) 0%, rgba(67,56,202,0.4) 40%, rgba(124,58,237,0.3) 100%)",
              }}
            >
              {/* Animated data streams */}
              <div className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(90deg, transparent, transparent 50px, rgba(59,130,246,0.1) 50px, rgba(59,130,246,0.1) 51px),
                    repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(99,102,241,0.08) 50px, rgba(99,102,241,0.08) 51px)
                  `,
                }}
              />
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-16 h-px bg-gradient-to-r from-blue-400/60 to-transparent" />
              <div className="absolute top-0 left-0 w-px h-16 bg-gradient-to-b from-blue-400/60 to-transparent" />
              <div className="absolute bottom-0 right-0 w-16 h-px bg-gradient-to-l from-indigo-400/60 to-transparent" />
              <div className="absolute bottom-0 right-0 w-px h-16 bg-gradient-to-t from-indigo-400/60 to-transparent" />

              {/* Holographic shimmer on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)",
                  backgroundSize: "200% 100%",
                  animation: "data-stream 3s linear infinite",
                }}
              />

              <div className="relative p-6 sm:p-8">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-400/30 bg-blue-400/10 mb-4">
                      <Sparkles className="h-3 w-3 text-blue-300 neon-badge" />
                      <span className="text-[11px] font-semibold text-blue-200 tracking-wider uppercase neon-badge">{panoramica.badge}</span>
                      <StatusPulse />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
                      {panoramica.title}
                    </h2>
                    <p className="text-sm text-blue-100/70 max-w-xl leading-relaxed">
                      {panoramica.desc}
                    </p>

                    {/* Feature chips */}
                    <div className="flex flex-wrap items-center gap-3 mt-5">
                      {[
                        { icon: Radar, label: "KPIs Consolidados", color: "blue" },
                        { icon: Shield, label: "Análise de Riscos", color: "indigo" },
                        { icon: Brain, label: "Insights com IA", color: "violet" },
                        { icon: Zap, label: "Tempo Real", color: "cyan" },
                      ].map(f => (
                        <div key={f.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-${f.color}-400/20 bg-${f.color}-400/5`}>
                          <f.icon className={`h-3 w-3 text-${f.color}-300`} />
                          <span className={`text-[10px] font-medium text-${f.color}-200 tracking-wide`}>{f.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right side — large icon + arrow */}
                  <div className="hidden md:flex flex-col items-center gap-4 ml-8">
                    <div className="relative">
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:border-blue-400/30 transition-all">
                        <Eye className="h-10 w-10 text-blue-300/80 group-hover:text-blue-200 transition-colors" style={{ filter: "drop-shadow(0 0 12px rgba(59,130,246,0.4))" }} />
                      </div>
                      {/* Orbiting dot */}
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-400/80 status-dot" style={{ filter: "blur(1px)" }} />
                    </div>
                    <div className="p-2 rounded-full bg-white/5 border border-white/10 group-hover:bg-blue-500/20 group-hover:border-blue-400/30 transition-all">
                      <ArrowRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* ─── SECTION DIVIDER ─── */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
            <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase">Módulos Analíticos</span>
            <div className="h-px flex-1 bg-gradient-to-l from-blue-500/20 to-transparent" />
          </div>

          {/* ─── DASHBOARD GRID ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {dashboards.map((d, idx) => {
              const Icon = d.icon;
              return (
                <Link key={d.path} href={d.path}>
                  <div className="cyber-card relative rounded-xl p-4 cursor-pointer h-full group overflow-hidden">
                    {/* Top glow line */}
                    <div className="absolute top-0 left-4 right-4 h-px"
                      style={{ background: `linear-gradient(90deg, transparent, ${d.color}40, transparent)` }}
                    />
                    {/* Corner accent */}
                    <div className="absolute top-0 left-0 w-8 h-px" style={{ background: `${d.color}60` }} />
                    <div className="absolute top-0 left-0 w-px h-8" style={{ background: `${d.color}60` }} />

                    {/* Hover glow overlay */}
                    <div className="card-glow absolute inset-0 opacity-0 rounded-xl transition-opacity duration-500"
                      style={{ background: `radial-gradient(circle at 30% 20%, ${d.color}08, transparent 70%)` }}
                    />

                    <div className="relative">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2 rounded-lg" style={{ background: `${d.color}15`, border: `1px solid ${d.color}20` }}>
                          <Icon className="h-5 w-5 card-icon transition-all duration-300" style={{ color: d.color }} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusPulse color={d.colorName} />
                        </div>
                      </div>

                      {/* Title & stats */}
                      <h3 className="font-bold text-sm mb-0.5 group-hover:text-blue-300 transition-colors">{d.title}</h3>
                      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase mb-2.5" style={{ color: `${d.color}90` }}>
                        {d.stats}
                      </p>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">{d.desc}</p>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2.5 border-t" style={{ borderColor: `${d.color}15` }}>
                        <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Acessar módulo</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground card-arrow opacity-50 transition-all duration-300" style={{}} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ─── FOOTER STATUS BAR ─── */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-blue-500/10 bg-blue-500/5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <StatusPulse />
                <span className="text-[10px] font-medium text-emerald-300 tracking-wider">SISTEMA OPERACIONAL</span>
              </div>
              <div className="hidden sm:block h-3 w-px bg-blue-500/20" />
              <span className="hidden sm:block text-[10px] text-muted-foreground">{dateStr}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono">v.116</span>
              <div className="h-3 w-px bg-blue-500/20" />
              <span className="text-[10px] text-blue-300 font-mono">{timeStr}</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
