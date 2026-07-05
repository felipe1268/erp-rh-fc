import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Building2, ClipboardCheck, Handshake, Ruler, BookOpen,
  HardHat, Warehouse, FolderOpen, Truck, ShieldCheck, Receipt,
  CheckCircle2, Sparkles, Play, Instagram, Youtube, Menu, X,
  TrendingUp, Lock, Zap, Layers, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rev. 4046 — Landing page de vendas do ERP FC Engenharia.
 * Links de Instagram/YouTube ainda não existem — mantidos como placeholders
 * "em breve" (SOCIAL_LINKS abaixo) até o usuário fornecer os handles reais.
 * Substitua os valores `null` por URLs assim que estiverem disponíveis.
 */
const SOCIAL_LINKS: { instagram: string | null; youtube: string | null } = {
  instagram: null,
  youtube: null,
};

/** Vídeo institucional — ainda não gravado. Troque por um embed real quando disponível. */
const INSTITUTIONAL_VIDEO_URL: string | null = null;

type ModuleCard = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  color: string;
  priceLabel: string;
};

const MODULES: ModuleCard[] = [
  { id: "rh-dp", title: "RH & DP", subtitle: "Recursos Humanos", description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.", icon: Users, color: "from-blue-500 to-indigo-500", priceLabel: "R$ 299/mês" },
  { id: "sst", title: "SST", subtitle: "Segurança do Trabalho", description: "EPIs, ASOs, CIPA, treinamentos de segurança e conformidade com normas regulamentadoras.", icon: Shield, color: "from-emerald-500 to-teal-600", priceLabel: "R$ 199/mês" },
  { id: "juridico", title: "Jurídico", subtitle: "Gestão Jurídica Completa", description: "Trabalhista, tributário e civil — processos, audiências, provisões e análise de risco com IA.", icon: Gavel, color: "from-slate-700 to-amber-500", priceLabel: "R$ 149/mês" },
  { id: "avaliacao", title: "Avaliação", subtitle: "Desempenho", description: "Questionários personalizáveis, ciclos de avaliação, ranking e análise de competências.", icon: ClipboardCheck, color: "from-amber-500 to-orange-600", priceLabel: "R$ 99/mês" },
  { id: "terceiros", title: "Terceiros", subtitle: "Empresas Terceirizadas", description: "Cadastro, documentação, obrigações mensais, aptidão e conformidade de terceirizadas.", icon: HardHat, color: "from-orange-500 to-red-600", priceLabel: "R$ 199/mês" },
  { id: "parceiros", title: "Parceiros", subtitle: "Portal de Convênios", description: "Farmácia, posto, restaurante e outros convênios com lançamentos e aprovações.", icon: Handshake, color: "from-purple-500 to-violet-600", priceLabel: "R$ 99/mês" },
  { id: "planejamento", title: "Planejamento", subtitle: "Gestão de Projetos", description: "Curva S, avanço físico semanal, revisões de cronograma e % previsto x realizado.", icon: CalendarRange, color: "from-green-500 to-emerald-600", priceLabel: "R$ 199/mês" },
  { id: "orcamento", title: "Orçamento", subtitle: "Orçamento de Obras", description: "Importação de planilhas com BDI, curva ABC de insumos e 3 versões de orçamento.", icon: Calculator, color: "from-cyan-500 to-sky-600", priceLabel: "R$ 199/mês" },
  { id: "compras", title: "Compras", subtitle: "Suprimentos", description: "Solicitações com aprovação, cotações comparativas e ordens de compra.", icon: ShoppingCart, color: "from-rose-500 to-pink-600", priceLabel: "R$ 199/mês" },
  { id: "financeiro", title: "Financeiro", subtitle: "Gestão Financeira", description: "Contas a pagar/receber, conciliação bancária, DRE e fluxo de caixa.", icon: DollarSign, color: "from-amber-500 to-yellow-600", priceLabel: "R$ 299/mês" },
  { id: "medicao", title: "Medição", subtitle: "Boletins de Medição", description: "Medição de contratos com % automático de avanço físico e faturamento.", icon: Ruler, color: "from-teal-500 to-cyan-600", priceLabel: "R$ 149/mês" },
  { id: "almoxarifado", title: "Almoxarifado", subtitle: "Materiais e Equipamentos", description: "Controle de estoque, ferramentas, empréstimos e inventário centralizado.", icon: Warehouse, color: "from-emerald-500 to-green-600", priceLabel: "R$ 199/mês" },
  { id: "gestao-documentos", title: "Doc. Técnicos", subtitle: "Gestão de Documentos", description: "Central de documentos técnicos com revisões, aprovações e ARTs/RRTs.", icon: FolderOpen, color: "from-indigo-500 to-blue-700", priceLabel: "R$ 99/mês" },
  { id: "frotas", title: "Frotas", subtitle: "Controle de Veículos", description: "Manutenções, combustível, multas, IPVA, seguros e rastreamento.", icon: Truck, color: "from-sky-500 to-cyan-700", priceLabel: "R$ 149/mês" },
];

const BENEFITS = [
  { icon: Zap, title: "Provisionamento imediato", text: "Sua empresa é criada e liberada assim que o pagamento é confirmado — sem espera, sem suporte manual." },
  { icon: Layers, title: "Pague só pelo que usa", text: "Contrate por módulo e por quantidade de usuários. Adicione ou remova a qualquer momento." },
  { icon: Lock, title: "Isolamento total de dados", text: "Cada empresa-cliente tem seus dados completamente isolados dos demais, com auditoria contínua de segurança." },
  { icon: TrendingUp, title: "Feito por quem constrói", text: "Nascido dentro de uma construtora em operação — não é uma ferramenta genérica adaptada depois." },
];

function fmtHref(base: string, path: string) {
  return `${base}${path}`;
}

export default function SiteVendas() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const goToPlans = () => navigate("/contratar");

  const navLinks = [
    { label: "Módulos", href: "#modulos" },
    { label: "Por que a FC", href: "#sobre" },
    { label: "Vídeo", href: "#video" },
    { label: "Planos", href: "#planos" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0A0F1E]/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">ERP FC Engenharia</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-slate-300 hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/5" onClick={() => navigate("/login")}>
              Entrar
            </Button>
            <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20" onClick={goToPlans}>
              Começar grátis <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
          <button className="md:hidden text-white" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0A0F1E] px-4 py-4 space-y-3">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="block text-sm text-slate-300 hover:text-white" onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate("/login")}>Entrar</Button>
              <Button className="bg-gradient-to-r from-orange-500 to-amber-500" onClick={goToPlans}>Começar grátis</Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-20 pb-24 px-4 sm:px-6">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(249,115,22,0.25) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 90% 20%, rgba(59,130,246,0.15) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-1.5 text-sm text-orange-300 mb-6"
          >
            <Sparkles className="w-4 h-4" /> Plataforma corporativa de gestão para construção civil
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]"
          >
            Um ERP completo para <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
              gerir sua construtora
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto"
          >
            RH, folha de pagamento, SST, jurídico, compras, financeiro, planejamento de obras e muito mais —
            tudo integrado, num único sistema. Contrate só os módulos que sua empresa precisa.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" className="h-13 px-8 text-base bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-xl shadow-orange-500/25" onClick={goToPlans}>
              Começar teste grátis de 3 dias <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <a href="#modulos" className="text-sm text-slate-300 hover:text-white underline underline-offset-4">
              Ver todos os módulos
            </a>
          </motion.div>
          <p className="mt-4 text-xs text-slate-500">Cartão exigido para iniciar. Cancele quando quiser antes do fim do teste, sem cobrança.</p>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            { value: "14", label: "módulos disponíveis" },
            { value: "3 dias", label: "de teste grátis" },
            { value: "100%", label: "self-service" },
            { value: "0", label: "instalação necessária" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
              <p className="text-2xl sm:text-3xl font-bold text-orange-400">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Módulos ── */}
      <section id="modulos" className="py-24 px-4 sm:px-6 bg-[#0D1327]">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-semibold text-orange-400 tracking-widest uppercase">Módulos</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">Tudo que a sua obra precisa, em um só lugar</h2>
            <p className="text-slate-400 mt-4">Contrate só o que faz sentido pra sua operação hoje. Adicione mais módulos quando quiser, sem trocar de sistema.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <m.icon className="w-5.5 h-5.5 text-white" />
                </div>
                <h3 className="font-semibold text-lg">{m.title}</h3>
                <p className="text-xs text-slate-500 mb-2">{m.subtitle}</p>
                <p className="text-sm text-slate-400 leading-relaxed">{m.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-orange-400">{m.priceLabel}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-orange-400 transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Por que a FC (case) ── */}
      <section id="sobre" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <span className="text-xs font-semibold text-orange-400 tracking-widest uppercase">Por que confiar na FC</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight">
              Não é um software genérico adaptado pra construção. <span className="text-orange-400">É construção, primeiro.</span>
            </h2>
            <p className="text-slate-400 mt-5 leading-relaxed">
              Este ERP nasceu dentro da FC Engenharia, uma construtora em operação real, pra resolver os próprios
              problemas de RH, folha, SST, jurídico, compras e financeiro de obras. Cada módulo foi construído e
              testado no dia a dia da própria empresa antes de virar produto — não é teoria, é o sistema que
              roda a operação da FC.
            </p>
            <div className="mt-8 space-y-4">
              {[
                "Usado diariamente pela própria equipe da FC Engenharia em obras reais",
                "Evolui a partir de necessidades reais de canteiro, RH e financeiro",
                "Isolamento de dados auditado entre empresas-cliente (LGPD)",
              ].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-300">{t}</p>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
                <HardHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold">FC Engenharia</p>
                <p className="text-xs text-slate-500">Cliente nº 1 do próprio produto</p>
              </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed italic">
              "A gente construiu esse sistema pra resolver a nossa própria dor de cabeça com planilhas soltas
              e retrabalho entre RH, obra e financeiro. Hoje é a ferramenta que usamos todo dia — e decidimos
              abrir pra outras construtoras que vivem o mesmo problema."
            </p>
            <p className="text-xs text-slate-500 mt-4">— Equipe FC Engenharia</p>
          </motion.div>
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section className="py-24 px-4 sm:px-6 bg-[#0D1327]">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center max-w-xl mx-auto mb-14">
            <span className="text-xs font-semibold text-orange-400 tracking-widest uppercase">Por que escolher</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">Feito pra crescer junto com sua operação</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-400/20 border border-orange-400/20 flex items-center justify-center mx-auto mb-4">
                  <b.icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="font-semibold">{b.title}</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{b.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vídeo institucional ── */}
      <section id="video" className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-xs font-semibold text-orange-400 tracking-widest uppercase">Conheça na prática</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-10">Veja o ERP em ação</h2>
          {INSTITUTIONAL_VIDEO_URL ? (
            <div className="rounded-2xl overflow-hidden border border-white/10 aspect-video">
              <video src={INSTITUTIONAL_VIDEO_URL} controls className="w-full h-full" />
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 aspect-video flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                </div>
                <p className="text-slate-400 text-sm">Vídeo institucional em produção — em breve por aqui</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Redes sociais ── */}
      <section className="pb-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h3 className="text-lg font-semibold text-slate-300 mb-6">Acompanhe a FC Engenharia</h3>
          <div className="flex items-center justify-center gap-4">
            <a
              href={SOCIAL_LINKS.instagram ?? "#"}
              target={SOCIAL_LINKS.instagram ? "_blank" : undefined}
              rel="noreferrer"
              aria-disabled={!SOCIAL_LINKS.instagram}
              className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors ${
                SOCIAL_LINKS.instagram
                  ? "border-white/20 hover:border-orange-400/50 hover:bg-white/5 text-white"
                  : "border-white/10 text-slate-500 cursor-not-allowed"
              }`}
              onClick={(e) => { if (!SOCIAL_LINKS.instagram) e.preventDefault(); }}
            >
              <Instagram className="w-4 h-4" /> Instagram {!SOCIAL_LINKS.instagram && <span className="text-[10px] opacity-70">(em breve)</span>}
            </a>
            <a
              href={SOCIAL_LINKS.youtube ?? "#"}
              target={SOCIAL_LINKS.youtube ? "_blank" : undefined}
              rel="noreferrer"
              className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors ${
                SOCIAL_LINKS.youtube
                  ? "border-white/20 hover:border-orange-400/50 hover:bg-white/5 text-white"
                  : "border-white/10 text-slate-500 cursor-not-allowed"
              }`}
              onClick={(e) => { if (!SOCIAL_LINKS.youtube) e.preventDefault(); }}
            >
              <Youtube className="w-4 h-4" /> YouTube {!SOCIAL_LINKS.youtube && <span className="text-[10px] opacity-70">(em breve)</span>}
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA final / Planos ── */}
      <section id="planos" className="py-24 px-4 sm:px-6 bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">Pronto pra organizar a gestão da sua construtora?</h2>
          <p className="mt-4 text-orange-50/90 text-lg">3 dias grátis. Cancele quando quiser. Sem letras miúdas.</p>
          <Button size="lg" className="mt-8 h-13 px-8 text-base bg-white text-orange-700 hover:bg-orange-50 shadow-xl" onClick={goToPlans}>
            Ver planos e começar agora <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-slate-400">ERP FC Engenharia — Plataforma corporativa</span>
          </div>
          <p className="text-xs text-slate-600">© {new Date().getFullYear()} FC Engenharia. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
