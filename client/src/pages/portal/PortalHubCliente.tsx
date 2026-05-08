import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2, LogOut, ArrowRight, CalendarRange, Users, FileText, MessageSquare, ShieldCheck,
} from "lucide-react";

type Modulo = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  accentFrom: string;
  accentTo: string;
  accentGlow: string;
  iconBg: string;
  features: string[];
  path: string;
};

const MODULOS: Modulo[] = [
  {
    id: "planejamento",
    title: "Planejamento da Obra",
    subtitle: "Cronograma, Curva S, Avanço e Efetivo",
    description: "Visão executiva da obra: cronograma físico, Gantt, curva S físico-financeira, avanço semanal, programação, efetivo CLT + Terceiros e custos de mão de obra.",
    icon: CalendarRange,
    accentFrom: "#3B82F6",
    accentTo: "#1D4ED8",
    accentGlow: "rgba(59,130,246,0.35)",
    iconBg: "rgba(59,130,246,0.12)",
    features: ["Cronograma Gantt", "Curva S R$", "Avanço Semanal", "Efetivo CLT + Terceiros", "Caminho Crítico"],
    path: "planejamento",
  },
  {
    id: "rh-documentos",
    title: "RH / Controle de Documentos",
    subtitle: "ASOs, Treinamentos, Atestados e Advertências",
    description: "Documentação trabalhista dos funcionários alocados nesta obra: ASOs vigentes, atestados, treinamentos NR e advertências, com indicadores de conformidade.",
    icon: ShieldCheck,
    accentFrom: "#10B981",
    accentTo: "#059669",
    accentGlow: "rgba(16,185,129,0.35)",
    iconBg: "rgba(16,185,129,0.12)",
    features: ["ASO Vigente / Vencido", "Treinamentos NR", "Atestados Médicos", "Advertências", "Conformidade RH"],
    path: "rh-documentos",
  },
  {
    id: "proj-doc",
    title: "Proj./Doc. Técnicos",
    subtitle: "Documentos do Projeto e Revisões",
    description: "Acervo técnico do projeto: plantas, memoriais, ART/RRT, com controle de revisão, status de aprovação e download direto.",
    icon: FileText,
    accentFrom: "#A855F7",
    accentTo: "#7E22CE",
    accentGlow: "rgba(168,85,247,0.35)",
    iconBg: "rgba(168,85,247,0.12)",
    features: ["Plantas & Memoriais", "Revisões", "Status (Aprovado, Revisão...)", "Download direto", "Acervo por Obra"],
    path: "proj-doc",
  },
  {
    id: "mensagens",
    title: "Mensagens & Avaliação",
    subtitle: "Canal direto com a FC e avaliação NPS",
    description: "Converse diretamente com a equipe FC, registre solicitações por obra e envie sua avaliação periódica sobre equipe, prazo e qualidade.",
    icon: MessageSquare,
    accentFrom: "#F59E0B",
    accentTo: "#D97706",
    accentGlow: "rgba(245,158,11,0.35)",
    iconBg: "rgba(245,158,11,0.12)",
    features: ["Canal Direto FC", "Comentários por Obra", "Avaliação NPS", "Histórico"],
    path: "mensagens",
  },
];

export default function PortalHubCliente() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";
  const nomeEmpresa = localStorage.getItem("portal_nome") || "Cliente";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo]);

  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token });
  useEffect(() => {
    if (tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.clear();
      toast.error("Sessão expirada");
      navigate("/portal/cliente/login");
    }
  }, [tokenCheck.data]);

  const { data: minhasObras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery(
    { token }, { enabled: !!token && tipo === "cliente" }
  );

  const handleClick = (modulo: Modulo) => {
    if (modulo.id === "mensagens") {
      navigate("/portal/cliente/dashboard");
      return;
    }
    if (minhasObras.length === 1) {
      const obraId = (minhasObras[0] as any).id;
      if (modulo.id === "planejamento") navigate(`/portal/cliente/obra/${obraId}`);
      else if (modulo.id === "rh-documentos") navigate(`/portal/cliente/rh/${obraId}`);
      else if (modulo.id === "proj-doc") navigate(`/portal/cliente/projdoc/${obraId}`);
      return;
    }
    navigate(`/portal/cliente/modulo/${modulo.id}`);
  };

  const logout = () => {
    localStorage.clear();
    navigate("/portal/cliente/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shrink-0">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-base leading-tight truncate">Portal do Cliente</h1>
              <p className="text-[11px] text-slate-500 truncate">{nomeEmpresa}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Bem-vindo(a), {nomeEmpresa}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Escolha o módulo que deseja acessar. Você verá apenas dados das obras vinculadas à sua empresa
            ({minhasObras.length} obra{minhasObras.length !== 1 ? "s" : ""}).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MODULOS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => handleClick(m)}
                className="group text-left bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
                style={{ boxShadow: `0 1px 3px rgba(0,0,0,0.05)` }}
              >
                <div
                  className="absolute -top-16 -right-16 w-44 h-44 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
                  style={{ background: m.accentGlow }}
                />
                <div className="relative flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${m.accentFrom} 0%, ${m.accentTo} 100%)` }}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-slate-800">{m.title}</h3>
                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{m.subtitle}</p>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{m.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {m.features.map((f) => (
                        <span
                          key={f}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: m.iconBg,
                            color: m.accentTo,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {minhasObras.length === 0 && (
          <div className="mt-8 p-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-center">
            <p className="text-sm text-amber-800 font-medium">
              Nenhuma obra vinculada ao seu cadastro ainda. Entre em contato com a FC Engenharia.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
