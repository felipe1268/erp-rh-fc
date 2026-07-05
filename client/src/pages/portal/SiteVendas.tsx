import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Building2, ClipboardCheck, Handshake, Ruler, BookOpen,
  HardHat, Warehouse, FolderOpen, Truck, ShieldCheck, Receipt,
  CheckCircle2, Sparkles, Play, Instagram, Youtube, Menu, X,
  TrendingUp, Lock, Zap, Layers, ArrowUpRight, Heart, Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import julinhoImg from "@/assets/julinho_mascot.png";

/**
 * Rev. 4047 — Landing page de vendas do ERP FC Engenharia, redesenhada:
 * tema claro/vívido (não mais dark), mascote "Julinho", copy acolhedora
 * voltada a quem está abrindo a primeira construtora. Preços dos módulos
 * agora vêm ao vivo de `billing.getCatalog` (refletindo ajustes feitos em
 * /admin/saas/precos), nunca hardcoded.
 * Links de Instagram/YouTube ainda não existem — mantidos como placeholders
 * "em breve" (SOCIAL_LINKS abaixo) até o usuário fornecer os handles reais.
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
};

const MODULES: ModuleCard[] = [
  { id: "rh-dp", title: "RH & DP", subtitle: "Recursos Humanos", description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.", icon: Users, color: "from-blue-500 to-indigo-500" },
  { id: "sst", title: "SST", subtitle: "Segurança do Trabalho", description: "EPIs, ASOs, CIPA, treinamentos de segurança e conformidade com normas regulamentadoras.", icon: Shield, color: "from-emerald-500 to-teal-600" },
  { id: "juridico", title: "Jurídico", subtitle: "Gestão Jurídica Completa", description: "Trabalhista, tributário e civil — processos, audiências, provisões e análise de risco com IA.", icon: Gavel, color: "from-slate-600 to-amber-500" },
  { id: "avaliacao", title: "Avaliação", subtitle: "Desempenho", description: "Questionários personalizáveis, ciclos de avaliação, ranking e análise de competências.", icon: ClipboardCheck, color: "from-amber-500 to-orange-600" },
  { id: "terceiros", title: "Terceiros", subtitle: "Empresas Terceirizadas", description: "Cadastro, documentação, obrigações mensais, aptidão e conformidade de terceirizadas.", icon: HardHat, color: "from-orange-500 to-red-500" },
  { id: "parceiros", title: "Parceiros", subtitle: "Portal de Convênios", description: "Farmácia, posto, restaurante e outros convênios com lançamentos e aprovações.", icon: Handshake, color: "from-purple-500 to-violet-600" },
  { id: "planejamento", title: "Planejamento", subtitle: "Gestão de Projetos", description: "Curva S, avanço físico semanal, revisões de cronograma e % previsto x realizado.", icon: CalendarRange, color: "from-green-500 to-emerald-600" },
  { id: "orcamento", title: "Orçamento", subtitle: "Orçamento de Obras", description: "Importação de planilhas com BDI, curva ABC de insumos e 3 versões de orçamento.", icon: Calculator, color: "from-cyan-500 to-sky-600" },
  { id: "compras", title: "Compras", subtitle: "Suprimentos", description: "Solicitações com aprovação, cotações comparativas e ordens de compra.", icon: ShoppingCart, color: "from-rose-500 to-pink-600" },
  { id: "financeiro", title: "Financeiro", subtitle: "Gestão Financeira", description: "Contas a pagar/receber, conciliação bancária, DRE e fluxo de caixa.", icon: DollarSign, color: "from-amber-500 to-yellow-600" },
  { id: "medicao", title: "Medição", subtitle: "Boletins de Medição", description: "Medição de contratos com % automático de avanço físico e faturamento.", icon: Ruler, color: "from-teal-500 to-cyan-600" },
  { id: "almoxarifado", title: "Almoxarifado", subtitle: "Materiais e Equipamentos", description: "Controle de estoque, ferramentas, empréstimos e inventário centralizado.", icon: Warehouse, color: "from-emerald-500 to-green-600" },
  { id: "gestao-documentos", title: "Doc. Técnicos", subtitle: "Gestão de Documentos", description: "Central de documentos técnicos com revisões, aprovações e ARTs/RRTs.", icon: FolderOpen, color: "from-indigo-500 to-blue-600" },
  { id: "frotas", title: "Frotas", subtitle: "Controle de Veículos", description: "Manutenções, combustível, multas, IPVA, seguros e rastreamento.", icon: Truck, color: "from-sky-500 to-cyan-600" },
];

const BENEFITS = [
  { icon: Zap, title: "Comece no seu ritmo", text: "Ative só os módulos que fazem sentido hoje. Nada de contrato engessado — cresça o sistema junto com a sua obra." },
  { icon: Layers, title: "Preço justo pra quem tá começando", text: "Pague só pelo que usa, por módulo e por pessoa. Sem pacotes inchados nem taxas escondidas." },
  { icon: Lock, title: "Seus dados, só seus", text: "Cada construtora tem seus dados totalmente isolados das demais, com segurança auditada continuamente." },
  { icon: Heart, title: "Feito por quem constrói de verdade", text: "Nasceu dentro de uma construtora em operação — não é uma planilha genérica maquiada de sistema." },
];

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function SiteVendas() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: catalog } = trpc.billing.getCatalog.useQuery();

  const priceFor = (moduleId: string): string | null => {
    const found = catalog?.modules.find(m => m.id === moduleId);
    return found ? formatPrice(found.monthlyPriceCents) : null;
  };

  const cheapestPrice = catalog
    ? Math.min(...catalog.modules.map(m => m.monthlyPriceCents))
    : null;

  const goToPlans = () => navigate("/contratar");

  const navLinks = [
    { label: "Módulos", href: "#modulos" },
    { label: "Por que a FC", href: "#sobre" },
    { label: "Vídeo", href: "#video" },
    { label: "Planos", href: "#planos" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-800 overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/85 border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-md shadow-orange-200">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-800">ERP FC Engenharia</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-slate-600 hover:text-orange-600 transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" className="text-slate-600 hover:text-orange-600 hover:bg-orange-50" onClick={() => navigate("/login")}>
              Entrar
            </Button>
            <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-200" onClick={goToPlans}>
              Começar grátis <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
          <button className="md:hidden text-slate-700" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-orange-100 bg-white px-4 py-4 space-y-3">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="block text-sm text-slate-600 hover:text-orange-600" onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" className="border-orange-200 text-slate-700 hover:bg-orange-50" onClick={() => navigate("/login")}>Entrar</Button>
              <Button className="bg-gradient-to-r from-orange-500 to-amber-500" onClick={goToPlans}>Começar grátis</Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(253,186,116,0.35) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 95% 10%, rgba(96,165,250,0.18) 0%, transparent 60%), linear-gradient(180deg, #FFFBF5 0%, #FFFFFF 40%)",
          }}
        />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm text-orange-700 mb-6 font-medium"
            >
              <Sparkles className="w-4 h-4" /> Pra quem tá abrindo (ou organizando) a primeira construtora
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] text-slate-900"
            >
              Comece sua construtora <br className="hidden lg:block" />
              <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                sem planilha e sem medo
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 text-lg text-slate-600 max-w-xl mx-auto lg:mx-0"
            >
              RH, folha, SST, jurídico, compras, financeiro e obras — tudo num sistema só, simples de usar
              desde o primeiro dia. Você contrata só o que precisa agora e vai adicionando conforme sua
              empresa cresce.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-9 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <Button size="lg" className="h-13 px-8 text-base bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-xl shadow-orange-200" onClick={goToPlans}>
                Começar teste grátis de 3 dias <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <a href="#modulos" className="text-sm text-slate-600 hover:text-orange-600 underline underline-offset-4 font-medium">
                Ver todos os módulos
              </a>
            </motion.div>
            <p className="mt-4 text-xs text-slate-400">
              Cartão exigido para iniciar. Cancele quando quiser antes do fim do teste, sem cobrança.
              {cheapestPrice !== null && <> Módulos a partir de <strong className="text-orange-600">{formatPrice(cheapestPrice)}/mês</strong>.</>}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative flex items-center justify-center"
          >
            <div className="absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-gradient-to-br from-orange-200 to-amber-100 blur-2xl opacity-70" />
            <img
              src={julinhoImg}
              alt="Julinho, o mascote da FC Engenharia, acenando de capacete"
              className="relative w-56 sm:w-72 lg:w-80 drop-shadow-xl"
            />
            <div className="absolute -bottom-2 sm:bottom-2 right-0 sm:right-4 bg-white rounded-2xl shadow-lg border border-orange-100 px-4 py-2.5 flex items-center gap-2 max-w-[220px]">
              <Smile className="w-5 h-5 text-orange-500 shrink-0" />
              <p className="text-xs text-slate-600 leading-snug">
                <strong className="text-slate-800">Oi, eu sou o Julinho!</strong> Vou te ajudar a organizar tudo por aqui.
              </p>
            </div>
          </motion.div>
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
            <div key={s.label} className="rounded-2xl border border-orange-100 bg-white shadow-sm px-4 py-6 text-center">
              <p className="text-2xl sm:text-3xl font-bold text-orange-500">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Módulos ── */}
      <section id="modulos" className="py-24 px-4 sm:px-6 bg-gradient-to-b from-orange-50/60 to-white">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Módulos</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 text-slate-900">Tudo que a sua obra precisa, em um só lugar</h2>
            <p className="text-slate-500 mt-4">Contrate só o que faz sentido pra sua operação hoje. Adicione mais módulos quando quiser, sem trocar de sistema.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
                className="group rounded-2xl border border-orange-100 bg-white p-6 hover:shadow-lg hover:border-orange-200 hover:-translate-y-0.5 transition-all"
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-4 shadow-md`}>
                  <m.icon className="w-5.5 h-5.5 text-white" />
                </div>
                <h3 className="font-semibold text-lg text-slate-900">{m.title}</h3>
                <p className="text-xs text-slate-400 mb-2">{m.subtitle}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{m.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-orange-600">
                    {priceFor(m.id) ? `${priceFor(m.id)}/mês` : "—"}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
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
            <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Por que confiar na FC</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight text-slate-900">
              Não é um software genérico adaptado pra construção. <span className="text-orange-600">É construção, primeiro.</span>
            </h2>
            <p className="text-slate-500 mt-5 leading-relaxed">
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
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600">{t}</p>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50/40 p-8 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-md">
                <HardHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">FC Engenharia</p>
                <p className="text-xs text-slate-500">Cliente nº 1 do próprio produto</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed italic">
              "A gente construiu esse sistema pra resolver a nossa própria dor de cabeça com planilhas soltas
              e retrabalho entre RH, obra e financeiro. Hoje é a ferramenta que usamos todo dia — e decidimos
              abrir pra outras construtoras que vivem o mesmo problema, especialmente quem tá começando agora."
            </p>
            <p className="text-xs text-slate-400 mt-4">— Equipe FC Engenharia</p>
          </motion.div>
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-white to-orange-50/50">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center max-w-xl mx-auto mb-14">
            <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Por que escolher</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 text-slate-900">Feito pra crescer junto com sua operação</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 border border-orange-200 flex items-center justify-center mx-auto mb-4">
                  <b.icon className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="font-semibold text-slate-900">{b.title}</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{b.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vídeo institucional ── */}
      <section id="video" className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Conheça na prática</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-10 text-slate-900">Veja o ERP em ação</h2>
          {INSTITUTIONAL_VIDEO_URL ? (
            <div className="rounded-2xl overflow-hidden border border-orange-100 aspect-video shadow-lg">
              <video src={INSTITUTIONAL_VIDEO_URL} controls className="w-full h-full" />
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 aspect-video flex items-center justify-center shadow-sm">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-4 border border-orange-200 shadow-sm">
                  <Play className="w-7 h-7 text-orange-500 ml-1" fill="currentColor" />
                </div>
                <p className="text-slate-500 text-sm">Vídeo institucional em produção — em breve por aqui</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Redes sociais ── */}
      <section className="pb-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h3 className="text-lg font-semibold text-slate-700 mb-6">Acompanhe a FC Engenharia</h3>
          <div className="flex items-center justify-center gap-4">
            <a
              href={SOCIAL_LINKS.instagram ?? "#"}
              target={SOCIAL_LINKS.instagram ? "_blank" : undefined}
              rel="noreferrer"
              aria-disabled={!SOCIAL_LINKS.instagram}
              className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors ${
                SOCIAL_LINKS.instagram
                  ? "border-orange-200 hover:border-orange-400 hover:bg-orange-50 text-slate-700"
                  : "border-slate-200 text-slate-400 cursor-not-allowed"
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
                  ? "border-orange-200 hover:border-orange-400 hover:bg-orange-50 text-slate-700"
                  : "border-slate-200 text-slate-400 cursor-not-allowed"
              }`}
              onClick={(e) => { if (!SOCIAL_LINKS.youtube) e.preventDefault(); }}
            >
              <Youtube className="w-4 h-4" /> YouTube {!SOCIAL_LINKS.youtube && <span className="text-[10px] opacity-70">(em breve)</span>}
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA final / Planos ── */}
      <section id="planos" className="py-24 px-4 sm:px-6 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-500 relative overflow-hidden">
        <img src={julinhoImg} alt="" className="hidden sm:block absolute -right-4 bottom-0 w-48 lg:w-64 opacity-90 pointer-events-none select-none" />
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Pronto pra organizar a gestão da sua construtora?</h2>
          <p className="mt-4 text-orange-50 text-lg">3 dias grátis. Cancele quando quiser. Sem letras miúdas.</p>
          <Button size="lg" className="mt-8 h-13 px-8 text-base bg-white text-orange-600 hover:bg-orange-50 shadow-xl" onClick={goToPlans}>
            Ver planos e começar agora <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 border-t border-orange-100">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-slate-500">ERP FC Engenharia — Plataforma corporativa</span>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} FC Engenharia. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
