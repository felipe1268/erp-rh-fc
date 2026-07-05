import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Building2, ClipboardCheck, Handshake, Ruler, BookOpen,
  HardHat, Warehouse, FolderOpen, Truck, ShieldCheck, Receipt,
  CheckCircle2, Sparkles, Play, Instagram, Youtube, Menu, X,
  TrendingUp, Lock, Zap, Layers, ArrowUpRight, Heart, Smile, Quote, Info,
  Target, Compass, Award, Rocket, BrainCircuit, Plug, MousePointerClick,
  BarChart3, PieChart, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import julinhoImg from "@/assets/julinho_mascot.png";

/**
 * Rev. 4047 — Landing page de vendas do ERP Gestão Integrada, redesenhada:
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
  highlights: string[];
};

const MODULES: ModuleCard[] = [
  { id: "rh-dp", title: "RH & DP", subtitle: "Recursos Humanos", description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.", icon: Users, color: "from-blue-500 to-indigo-500", highlights: ["IA sugere férias e alerta vencimentos automaticamente", "Integração direta com ponto eletrônico e folha", "Telas simples até pra quem nunca usou ERP"] },
  { id: "sst", title: "SST", subtitle: "Segurança do Trabalho", description: "EPIs, ASOs, CIPA, treinamentos de segurança e conformidade com normas regulamentadoras.", icon: Shield, color: "from-emerald-500 to-teal-600", highlights: ["IA analisa risco de vencimento de ASO e treinamentos", "Integração com Almoxarifado (EPIs) e RH", "Central única de documentos de segurança"] },
  { id: "juridico", title: "Jurídico", subtitle: "Gestão Jurídica Completa", description: "Trabalhista, tributário e civil — processos, audiências, provisões e análise de risco com IA.", icon: Gavel, color: "from-slate-600 to-amber-500", highlights: ["IA classifica o risco de cada processo automaticamente", "Integração com RH para rescisões e SST", "Linha do tempo visual de cada processo"] },
  { id: "avaliacao", title: "Avaliação", subtitle: "Desempenho", description: "Questionários personalizáveis, ciclos de avaliação, ranking e análise de competências.", icon: ClipboardCheck, color: "from-amber-500 to-orange-600", highlights: ["Ciclos e formulários 100% personalizáveis", "Ranking automático de competências", "Interface simples pra qualquer gestor aplicar"] },
  { id: "terceiros", title: "Terceiros", subtitle: "Empresas Terceirizadas", description: "Cadastro, documentação, obrigações mensais, aptidão e conformidade de terceirizadas.", icon: HardHat, color: "from-orange-500 to-red-500", highlights: ["IA cruza obrigações e prazos de terceirizadas", "Integração com Almoxarifado e Gestão de Documentos", "Alertas automáticos de vencimento"] },
  { id: "parceiros", title: "Parceiros", subtitle: "Portal de Convênios", description: "Farmácia, posto, restaurante e outros convênios com lançamentos e aprovações.", icon: Handshake, color: "from-purple-500 to-violet-600", highlights: ["Aprovações de convênio em poucos cliques", "Integração direta com a Folha", "Portal simples pro colaborador usar no celular"] },
  { id: "planejamento", title: "Planejamento", subtitle: "Gestão de Projetos", description: "Curva S, avanço físico semanal, revisões de cronograma e % previsto x realizado.", icon: CalendarRange, color: "from-green-500 to-emerald-600", highlights: ["IA cruza avanço físico x financeiro na Curva S", "Integração com Medição e Orçamento", "Visual claro de % previsto x realizado"] },
  { id: "orcamento", title: "Orçamento", subtitle: "Orçamento de Obras", description: "Importação de planilhas com BDI, curva ABC de insumos e 3 versões de orçamento.", icon: Calculator, color: "from-cyan-500 to-sky-600", highlights: ["IA identifica insumos fora da curva ABC", "Integração direta com Compras", "Importação de planilha sem retrabalho"] },
  { id: "compras", title: "Compras", subtitle: "Suprimentos", description: "Solicitações com aprovação, cotações comparativas e ordens de compra.", icon: ShoppingCart, color: "from-rose-500 to-pink-600", highlights: ["IA compara cotações e aponta a melhor opção", "Integração com Orçamento e Financeiro", "Aprovação em poucos toques, do celular"] },
  { id: "financeiro", title: "Financeiro", subtitle: "Gestão Financeira", description: "Contas a pagar/receber, conciliação bancária, DRE e fluxo de caixa.", icon: DollarSign, color: "from-amber-500 to-yellow-600", highlights: ["IA concilia extrato bancário automaticamente", "Integração com Compras, Folha e Medição", "DRE e fluxo de caixa sempre atualizados"] },
  { id: "medicao", title: "Medição", subtitle: "Boletins de Medição", description: "Medição de contratos com % automático de avanço físico e faturamento.", icon: Ruler, color: "from-teal-500 to-cyan-600", highlights: ["IA calcula o % de avanço automaticamente", "Integração direta com Planejamento", "Boletim de medição pronto em minutos"] },
  { id: "almoxarifado", title: "Almoxarifado", subtitle: "Materiais e Equipamentos", description: "Controle de estoque, ferramentas, empréstimos e inventário centralizado.", icon: Warehouse, color: "from-emerald-500 to-green-600", highlights: ["IA estima consumo e alerta reposição", "Integração com Compras e Terceiros", "Inventário visual, fácil de conferir"] },
  { id: "gestao-documentos", title: "Doc. Técnicos", subtitle: "Gestão de Documentos", description: "Central de documentos técnicos com revisões, aprovações e ARTs/RRTs.", icon: FolderOpen, color: "from-indigo-500 to-blue-600", highlights: ["IA organiza revisões e aprovações pendentes", "Integração com SST e Jurídico", "Central única pra ART, RRT e ISO"] },
  { id: "frotas", title: "Frotas", subtitle: "Controle de Veículos", description: "Manutenções, combustível, multas, IPVA, seguros e rastreamento.", icon: Truck, color: "from-sky-500 to-cyan-600", highlights: ["IA aponta manutenção preventiva antes do problema", "Integração com rastreamento via Infleet", "Multas, seguro e IPVA num só lugar"] },
];

/**
 * Rev. 4050 — RASCUNHO da narrativa institucional do produto "ERP Gestão
 * Integrada" (não da FC Engenharia como empresa terceira — o produto é feito
 * PELA FC). Texto pendente de revisão do usuário antes de considerar final;
 * não inventa datas/números específicos não confirmados (ex.: ano de fundação,
 * qtd. de clientes) — fica genérico e alinhado ao case real já existente
 * ("nasceu dentro de uma construtora em operação").
 */
const COMPANY_STORY = {
  historia: [
    "O ERP Gestão Integrada nasceu de um problema muito concreto: uma construtora em operação real, cansada de planilhas soltas, retrabalho entre RH, obra e financeiro, e informação que nunca batia entre os times.",
    "Em vez de contratar um software genérico adaptado \"na marra\" pra construção civil, a decisão foi construir o próprio sistema — módulo por módulo, testado no dia a dia de canteiro antes de qualquer linha de código virar produto.",
    "O resultado é uma plataforma que evoluiu (e continua evoluindo) junto com quem constrói de verdade: cada novo recurso resolve uma dor real de RH, engenharia, jurídico ou financeiro — não uma suposição de mercado.",
  ],
  missao: "Simplificar a gestão de construtoras de qualquer porte, unindo RH, obra, jurídico, compras e financeiro em uma única plataforma acessível, inteligente e fácil de usar desde o primeiro dia.",
  visao: "Ser a plataforma de gestão mais confiável do setor da construção civil — reconhecida por unir inteligência artificial aplicada, integrações reais entre áreas e uma experiência simples o bastante pra qualquer equipe usar sem treinamento longo.",
  valores: [
    { icon: Heart, title: "Feito por quem constrói", text: "Cada módulo nasce de um problema real de canteiro, não de uma suposição de escritório." },
    { icon: BrainCircuit, title: "Inteligência aplicada", text: "IA a serviço da decisão: alertas, cruzamento de dados e análises que economizam tempo de verdade." },
    { icon: Lock, title: "Segurança e transparência", text: "Dados isolados por empresa, auditados continuamente, sem letras miúdas no contrato." },
    { icon: Rocket, title: "Evolução constante", text: "O sistema cresce mês a mês junto com quem usa — sempre com o pé no chão da obra." },
  ],
};

type TestimonialCard = { name: string; role: string; company: string; city: string; quote: string };

/**
 * Rev. 4048 — 50 depoimentos ILUSTRATIVOS de construtoras fictícias, usados só
 * pra exemplificar o tipo de dor/benefício que o sistema resolve pra quem tá
 * começando. NÃO são clientes reais — por isso o aviso "exemplos ilustrativos"
 * fica sempre visível no cabeçalho da seção e em cada card (ver TESTIMONIAL_DISCLAIMER).
 * O ÚNICO case real da plataforma continua sendo a FC Engenharia, na seção "Por que a FC".
 */
const TESTIMONIALS: TestimonialCard[] = [
  { name: "Marcos Ferreira", role: "Sócio-fundador", company: "MF Construções", city: "Sorocaba/SP", quote: "Abri a empresa há 8 meses e tava perdido com planilha de ponto e vale-transporte. Em uma tarde já tinha a folha do primeiro time rodando." },
  { name: "Juliana Prado", role: "Administradora", company: "Prado Engenharia", city: "Uberlândia/MG", quote: "O que mais me deixou tranquila foi só pagar pelos módulos que eu já uso. Comecei só com RH e Financeiro." },
  { name: "Ricardo Almeida", role: "Diretor técnico", company: "Almeida & Torres", city: "Curitiba/PR", quote: "Nunca tinha usado um ERP antes. O suporte pra configurar os primeiros funcionários foi bem tranquilo." },
  { name: "Camila Rezende", role: "Sócia", company: "CR Construtora", city: "Belo Horizonte/MG", quote: "Consigo ver o fluxo de caixa da minha primeira obra sem depender de planilha compartilhada com o contador." },
  { name: "Thiago Nogueira", role: "Fundador", company: "Nogueira Obras", city: "Ribeirão Preto/SP", quote: "O módulo de compras já evitou duas cotações erradas logo no início. Se pagou sozinho." },
  { name: "Patrícia Lima", role: "Gestora administrativa", company: "PL Empreendimentos", city: "Joinville/SC", quote: "Tava com medo de contratar um sistema caro demais pra uma empresa pequena. O preço por módulo fez toda diferença." },
  { name: "Eduardo Castro", role: "Sócio-diretor", company: "Castro Engenharia", city: "Campinas/SP", quote: "Ativei SST assim que contratei o primeiro encarregado. Ficou tudo documentado desde o dia 1." },
  { name: "Fernanda Duarte", role: "Administradora", company: "Duarte Construções", city: "Florianópolis/SC", quote: "O que eu mais queria era não bagunçar os dados desde o começo. O sistema já nasceu organizado com a gente." },
  { name: "Bruno Siqueira", role: "Fundador", company: "Siqueira Obras", city: "Londrina/PR", quote: "Comecei sozinho, hoje já tenho 12 pessoas na folha. O sistema cresceu junto sem eu precisar trocar de ferramenta." },
  { name: "Larissa Moura", role: "Sócia-administradora", company: "Moura Engenharia", city: "Vitória/ES", quote: "O suporte respondeu rápido quando travei configurando o primeiro contrato de terceirizada." },
  { name: "Diego Barbosa", role: "Diretor", company: "Barbosa Construtora", city: "Goiânia/GO", quote: "Já usei planilha, já usei sistema caro que não usava nem metade. Aqui uso praticamente tudo que pago." },
  { name: "Renata Vasconcelos", role: "Sócia-fundadora", company: "RV Empreendimentos", city: "Natal/RN", quote: "Consegui montar o primeiro orçamento de obra com curva ABC sem precisar contratar ninguém pra isso." },
  { name: "Felipe Andrade", role: "Fundador", company: "Andrade Engenharia", city: "Maringá/PR", quote: "A parte de jurídico me ajudou a entender um processo trabalhista que eu nem sabia como conduzir." },
  { name: "Aline Cordeiro", role: "Administradora financeira", company: "Cordeiro Obras", city: "Caxias do Sul/RS", quote: "A conciliação bancária sozinha já valeu a assinatura. Não perco mais tempo comparando extrato na mão." },
  { name: "Gustavo Teixeira", role: "Sócio", company: "GT Construções", city: "São José dos Campos/SP", quote: "Comecei com medo de sistema complicado. Em uma semana minha equipe já usava o ponto eletrônico direito." },
  { name: "Vanessa Correia", role: "Fundadora", company: "Correia Engenharia", city: "Vila Velha/ES", quote: "O módulo de almoxarifado resolveu um problema bobo que me custava caro: ferramenta sumindo de canteiro." },
  { name: "Rodrigo Peixoto", role: "Diretor de obras", company: "Peixoto Construtora", city: "Feira de Santana/BA", quote: "Consigo acompanhar o avanço físico da obra pelo celular, direto do canteiro." },
  { name: "Isabela Ramos", role: "Sócia-administradora", company: "IR Empreendimentos", city: "Juiz de Fora/MG", quote: "A parte de SST me deu confiança na primeira fiscalização. Todo documento já estava organizado." },
  { name: "Leonardo Farias", role: "Fundador", company: "Farias Engenharia", city: "Anápolis/GO", quote: "Testei três sistemas antes. Esse foi o único que realmente entendia o dia a dia de obra pequena." },
  { name: "Bianca Monteiro", role: "Administradora", company: "Monteiro Construções", city: "Blumenau/SC", quote: "Meu contador elogiou a organização do financeiro assim que comecei a usar o sistema." },
  { name: "Vinícius Cavalcante", role: "Sócio-fundador", company: "Cavalcante Obras", city: "Petrolina/PE", quote: "A gente contratou só RH e Financeiro no começo. Hoje já uso Compras e Almoxarifado também." },
  { name: "Débora Aragão", role: "Fundadora", company: "Aragão Engenharia", city: "Aracaju/SE", quote: "O que eu procurava era simplicidade sem perder controle. Foi exatamente isso que encontrei." },
  { name: "Matheus Rocha", role: "Diretor técnico", company: "Rocha Construtora", city: "Presidente Prudente/SP", quote: "Migrei de uma planilha gigante de RH em menos de uma semana, sem perder histórico de ninguém." },
  { name: "Priscila Guedes", role: "Sócia-administradora", company: "Guedes Empreendimentos", city: "Marília/SP", quote: "O preço acessível foi decisivo pra eu não adiar mais a organização da empresa." },
  { name: "Alexandre Brito", role: "Fundador", company: "Brito Engenharia", city: "Montes Claros/MG", quote: "Comecei a usar o módulo de medição no segundo contrato e já evitei um erro de faturamento." },
  { name: "Cristiane Aquino", role: "Administradora", company: "Aquino Construções", city: "Chapecó/SC", quote: "Consigo emitir os documentos trabalhistas certos sem precisar pesquisar modelo toda vez." },
  { name: "Henrique Salgado", role: "Sócio-diretor", company: "Salgado Obras", city: "Itajaí/SC", quote: "O sistema me ajudou a entender que eu estava pagando hora extra errado. Corrigi rápido." },
  { name: "Tatiane Vieira", role: "Fundadora", company: "Vieira Engenharia", city: "Bauru/SP", quote: "Adicionei o módulo de Frotas quando comprei a primeira caminhonete da obra. Ficou tudo num lugar só." },
  { name: "Otávio Machado", role: "Sócio", company: "Machado Construtora", city: "Passo Fundo/RS", quote: "Não precisei contratar um TI pra colocar o sistema pra funcionar. Foi bem direto." },
  { name: "Marina Bezerra", role: "Administradora financeira", company: "Bezerra Empreendimentos", city: "Mossoró/RN", quote: "O DRE automático me mostrou onde eu estava perdendo margem numa das obras." },
  { name: "Rafael Coutinho", role: "Fundador", company: "Coutinho Engenharia", city: "Volta Redonda/RJ", quote: "Consegui documentar as ASOs de toda a equipe assim que contratei o pessoal de campo." },
  { name: "Sabrina Leal", role: "Sócia-fundadora", company: "Leal Construções", city: "Criciúma/SC", quote: "Achei que ia precisar de um sistema caro pra ter esse nível de controle. Não foi o caso." },
  { name: "Daniel Pontes", role: "Diretor de obras", company: "Pontes Obras", city: "Cascavel/PR", quote: "Comecei sozinho com uma obra e hoje já tenho três em andamento, tudo acompanhado no mesmo lugar." },
  { name: "Fabiana Xavier", role: "Administradora", company: "Xavier Engenharia", city: "Governador Valadares/MG", quote: "O suporte me ajudou a cadastrar meus primeiros fornecedores certinho." },
  { name: "Caio Menezes", role: "Sócio", company: "Menezes Construtora", city: "Santa Maria/RS", quote: "A parte de compras com cotação comparativa já me economizou em pelo menos duas negociações." },
  { name: "Roberta Sales", role: "Fundadora", company: "Sales Empreendimentos", city: "Uberaba/MG", quote: "Gostei de poder ativar um módulo por vez, sem pressão de contratar tudo de uma vez." },
  { name: "Wesley Tavares", role: "Sócio-diretor", company: "Tavares Engenharia", city: "Dourados/MS", quote: "O painel de RH me ajudou a organizar as férias da equipe pela primeira vez desde que abri a empresa." },
  { name: "Gabriela Freitas", role: "Administradora", company: "Freitas Construções", city: "Ponta Grossa/PR", quote: "Consigo ver tudo de terceirizadas num só lugar, isso me tirou um peso enorme." },
  { name: "Igor Pacheco", role: "Fundador", company: "Pacheco Obras", city: "Rio Branco/AC", quote: "O sistema me ajudou a evitar multa de vencimento de documento de terceirizada." },
  { name: "Silvana Cunha", role: "Sócia-administradora", company: "Cunha Engenharia", city: "Teresina/PI", quote: "Como só tenho poucos funcionários ainda, o preço por módulo fez muito mais sentido pro meu bolso." },
  { name: "Alan Figueiredo", role: "Diretor", company: "Figueiredo Construtora", city: "Imperatriz/MA", quote: "A parte de avaliação de desempenho me ajudou a decidir quem promover na minha primeira equipe fixa." },
  { name: "Michele Dornelles", role: "Fundadora", company: "Dornelles Empreendimentos", city: "Pelotas/RS", quote: "O suporte foi rápido quando tive dúvida sobre o cálculo de rescisão do primeiro desligamento." },
  { name: "Anderson Lacerda", role: "Sócio", company: "Lacerda Engenharia", city: "Divinópolis/MG", quote: "Consigo acompanhar o orçamento da obra sem depender só do meu engenheiro pra me passar número." },
  { name: "Kelly Nascimento", role: "Administradora", company: "Nascimento Construções", city: "Itabuna/BA", quote: "Achei que ERP era coisa de empresa grande. Hoje uso desde o segundo mês da minha construtora." },
  { name: "Douglas Assis", role: "Fundador", company: "Assis Obras", city: "Barretos/SP", quote: "O módulo de documentos técnicos me ajudou a organizar ART e RRT sem perder prazo de nenhum." },
  { name: "Nathália Pires", role: "Sócia-fundadora", company: "Pires Engenharia", city: "Franca/SP", quote: "O que eu mais valorizei foi não precisar assinar um contrato longo pra começar a testar." },
  { name: "Jonas Werneck", role: "Diretor técnico", company: "Werneck Construtora", city: "Macaé/RJ", quote: "Uso o módulo de planejamento pra acompanhar a curva S da minha primeira obra maior." },
  { name: "Simone Andrade", role: "Administradora financeira", company: "SA Empreendimentos", city: "Arapiraca/AL", quote: "O fluxo de caixa organizado me deu confiança pra negociar melhor com fornecedor." },
  { name: "Leandro Batista", role: "Fundador", company: "Batista Engenharia", city: "Cuiabá/MT", quote: "Comecei com uma obra pequena e hoje o sistema já acompanha três equipes ao mesmo tempo." },
  { name: "Adriana Melo", role: "Sócia-administradora", company: "Melo Construções", city: "Boa Vista/RR", quote: "O suporte entendeu minha realidade de construtora iniciante e não me empurrou módulo que eu não precisava." },
];

const TESTIMONIAL_DISCLAIMER =
  "Exemplos ilustrativos de como o sistema ajuda construtoras que estão começando — ainda não são depoimentos de clientes reais.";

function TestimonialCardView({ t }: { t: TestimonialCard }) {
  return (
    <div className="relative shrink-0 w-[320px] sm:w-[360px] rounded-2xl border border-orange-100 bg-white shadow-sm p-6 mx-3 flex flex-col">
      <Quote className="w-6 h-6 text-orange-300 mb-3" />
      <p className="text-sm text-slate-600 leading-relaxed italic flex-1">"{t.quote}"</p>
      <div className="mt-5 pt-4 border-t border-slate-100">
        <p className="text-sm font-semibold text-slate-900">{t.name}</p>
        <p className="text-xs text-slate-500">{t.role} · {t.company}</p>
        <p className="text-xs text-slate-400">{t.city}</p>
      </div>
    </div>
  );
}

const BENEFITS = [
  { icon: Zap, title: "Comece no seu ritmo", text: "Ative só os módulos que fazem sentido hoje. Nada de contrato engessado — cresça o sistema junto com a sua obra." },
  { icon: Layers, title: "Preço justo pra quem tá começando", text: "Pague só pelo que usa, por módulo e por pessoa. Sem pacotes inchados nem taxas escondidas." },
  { icon: Lock, title: "Seus dados, só seus", text: "Cada construtora tem seus dados totalmente isolados das demais, com segurança auditada continuamente." },
  { icon: Heart, title: "Feito por quem constrói de verdade", text: "Nasceu dentro de uma construtora em operação — não é uma planilha genérica maquiada de sistema." },
];

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Rev. 4050 — Prévia visual "conceitual" da tela de cada módulo, aberta ao
 * clicar no card. NÃO é um screenshot real do app (o app é autenticado e
 * multi-tenant, não daria pra expor uma tela real de cliente aqui) — é uma
 * ilustração abstrata (painéis + gráfico + selo de IA) na cor do módulo,
 * deixando claro visualmente o tipo de informação que a tela mostra.
 */
function ModulePreviewMock({ m }: { m: ModuleCard }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${m.color} p-5 sm:p-6 aspect-[16/10]`}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "16px 16px" }} />
      <div className="relative h-full rounded-xl bg-white/95 backdrop-blur-sm shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${m.color} flex items-center justify-center`}>
              <m.icon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="h-2 w-20 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-center gap-1 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
            <BrainCircuit className="w-2.5 h-2.5" /> IA
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col justify-between">
            <BarChart3 className="w-4 h-4 text-slate-300" />
            <div className="flex items-end gap-1 h-10">
              {[40, 70, 55, 90, 65].map((h, i) => (
                <div key={i} className={`w-full rounded-sm bg-gradient-to-t ${m.color} opacity-70`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col items-center justify-center gap-1">
            <PieChart className="w-4 h-4 text-slate-300" />
            <div className="h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="h-1.5 w-7 rounded-full bg-slate-200" />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col gap-1.5">
            <ListChecks className="w-4 h-4 text-slate-300 mb-0.5" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${90 - i * 15}%` }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <MousePointerClick className="w-3.5 h-3.5 text-slate-300" />
          <div className="h-1.5 w-24 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function ModuleDetailDialog({ m, price, onClose, onSubscribe }: { m: ModuleCard; price: string | null; onClose: () => void; onSubscribe: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center shadow-md shrink-0`}>
              <m.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{m.title}</h3>
              <p className="text-xs text-slate-400">{m.subtitle}</p>
            </div>
          </div>
          <ModulePreviewMock m={m} />
          <p className="text-sm text-slate-500 mt-5 leading-relaxed">{m.description}</p>
          <div className="mt-5 space-y-2.5">
            {m.highlights.map((h) => (
              <div key={h} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600">{h}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
            <Play className="w-3.5 h-3.5" /> Vídeo explicativo desta tela em produção — em breve por aqui.
          </div>
          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-lg font-bold text-orange-600">
              {price ? `${price}/mês` : "Sob consulta"}
            </span>
            <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-200" onClick={onSubscribe}>
              Testar este módulo grátis <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SiteVendas() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleCard | null>(null);
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
    { label: "Quem somos", href: "#quem-somos" },
    { label: "Por que a FC", href: "#sobre" },
    { label: "Vídeo", href: "#video" },
    { label: "Planos", href: "#planos" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-800 overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-white/70 border-b border-white/60 shadow-[0_1px_20px_rgba(251,146,60,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-md shadow-orange-200">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-400 to-amber-300 blur-md opacity-50 -z-10" />
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-800">ERP Gestão Integrada</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="relative text-sm text-slate-600 hover:text-orange-600 transition-colors font-medium group">
                {l.label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-gradient-to-r from-orange-500 to-amber-400 group-hover:w-full transition-all duration-300" />
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
          className="absolute inset-0 -z-10 animate-mesh-drift"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(253,186,116,0.35) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 95% 10%, rgba(96,165,250,0.18) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 10% 25%, rgba(244,114,182,0.12) 0%, transparent 60%), linear-gradient(180deg, #FFFBF5 0%, #FFFFFF 40%)",
          }}
        />
        <div className="absolute inset-0 -z-10 opacity-[0.35] [background-image:radial-gradient(circle,rgba(251,146,60,0.35)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute top-24 left-[8%] w-2 h-2 rounded-full bg-orange-400/60 animate-float-slow hidden sm:block" />
        <div className="absolute top-40 right-[12%] w-3 h-3 rounded-full bg-amber-400/50 animate-float-slower hidden sm:block" />
        <div className="absolute bottom-16 left-[20%] w-1.5 h-1.5 rounded-full bg-sky-400/60 animate-float-slow hidden sm:block" />
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
            <div key={s.label} className="group relative rounded-2xl border border-white/60 bg-white/60 backdrop-blur-xl shadow-[0_4px_24px_rgba(251,146,60,0.08)] px-4 py-6 text-center overflow-hidden hover:border-orange-200 hover:-translate-y-0.5 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/0 via-orange-100/0 to-amber-100/0 group-hover:from-orange-100/40 group-hover:to-amber-100/20 transition-all duration-300" />
              <p className="relative text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">{s.value}</p>
              <p className="relative text-xs text-slate-500 mt-1">{s.label}</p>
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
              <motion.button
                key={m.id}
                type="button"
                onClick={() => setSelectedModule(m)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
                whileHover={{ y: -4 }}
                className="group text-left rounded-2xl border border-orange-100 bg-white/80 backdrop-blur-sm p-6 hover:shadow-xl hover:shadow-orange-100/60 hover:border-orange-300 transition-all relative overflow-hidden"
              >
                <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${m.color} opacity-0 group-hover:opacity-10 blur-xl transition-opacity`} />
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-105 transition-transform`}>
                  <m.icon className="w-5.5 h-5.5 text-white" />
                </div>
                <h3 className="font-semibold text-lg text-slate-900">{m.title}</h3>
                <p className="text-xs text-slate-400 mb-2">{m.subtitle}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{m.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-orange-600">
                    {priceFor(m.id) ? `${priceFor(m.id)}/mês` : "—"}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-slate-300 group-hover:text-orange-500 transition-colors">
                    Ver tela <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {selectedModule && (
        <ModuleDetailDialog
          m={selectedModule}
          price={priceFor(selectedModule.id)}
          onClose={() => setSelectedModule(null)}
          onSubscribe={() => { setSelectedModule(null); goToPlans(); }}
        />
      )}

      {/* ── Quem somos (missão, visão, valores, história) ── */}
      <section id="quem-somos" className="py-24 px-4 sm:px-6 bg-gradient-to-b from-white to-orange-50/40">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Quem somos</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 text-slate-900">Uma plataforma construída com propósito, não do zero por acaso</h2>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-10 items-start mb-16">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="space-y-5">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-orange-500" /> Nossa história
              </h3>
              {COMPANY_STORY.historia.map((p, i) => (
                <p key={i} className="text-sm text-slate-600 leading-relaxed">{p}</p>
              ))}
            </motion.div>
            <div className="grid gap-5">
              <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Compass className="w-5 h-5 text-orange-500" />
                  <h4 className="font-semibold text-slate-900">Missão</h4>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{COMPANY_STORY.missao}</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.08 }} className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-orange-500" />
                  <h4 className="font-semibold text-slate-900">Visão</h4>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{COMPANY_STORY.visao}</p>
              </motion.div>
            </div>
          </div>

          <motion.h3 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-lg font-semibold text-slate-900 flex items-center gap-2 justify-center mb-6">
            <Award className="w-5 h-5 text-orange-500" /> Nossos valores
          </motion.h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {COMPANY_STORY.valores.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 border border-orange-200 flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-6 h-6 text-orange-600" />
                </div>
                <h4 className="font-semibold text-slate-900">{v.title}</h4>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{v.text}</p>
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

      {/* ── Cases ilustrativos (exemplos, não clientes reais) ── */}
      <section className="py-20 bg-gradient-to-b from-orange-50/40 to-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center mb-10">
          <span className="text-xs font-semibold text-orange-600 tracking-widest uppercase">Exemplos de uso</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-3 text-slate-900">
            Como construtoras iniciantes <span className="text-orange-600">poderiam usar</span> o sistema
          </h2>
          <p className="flex items-center justify-center gap-2 text-sm text-slate-500 mt-4 max-w-2xl mx-auto">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            {TESTIMONIAL_DISCLAIMER}
          </p>
        </div>
        <div className="marquee-row relative">
          <div className="flex w-max marquee-track-left">
            {[...TESTIMONIALS.slice(0, 25), ...TESTIMONIALS.slice(0, 25)].map((t, i) => (
              <TestimonialCardView key={`row1-${i}`} t={t} />
            ))}
          </div>
        </div>
        <div className="marquee-row relative mt-2">
          <div className="flex w-max marquee-track-right">
            {[...TESTIMONIALS.slice(25, 50), ...TESTIMONIALS.slice(25, 50)].map((t, i) => (
              <TestimonialCardView key={`row2-${i}`} t={t} />
            ))}
          </div>
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
              <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group relative text-center rounded-2xl border border-transparent hover:border-orange-100 hover:bg-white/70 hover:backdrop-blur-xl hover:shadow-[0_8px_30px_rgba(251,146,60,0.12)] p-5 transition-all duration-300">
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 border border-orange-200 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-300 to-amber-300 blur-lg opacity-0 group-hover:opacity-40 transition-opacity duration-300 -z-10" />
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
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 right-1/3 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <img src={julinhoImg} alt="" className="hidden sm:block absolute -right-4 bottom-0 w-48 lg:w-64 opacity-90 pointer-events-none select-none" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Pronto pra organizar a gestão da sua construtora?</h2>
          <p className="mt-4 text-orange-50 text-lg">3 dias grátis. Cancele quando quiser. Sem letras miúdas.</p>
          <Button size="lg" className="mt-8 h-13 px-8 text-base bg-white text-orange-600 hover:bg-orange-50 shadow-xl hover:shadow-2xl hover:scale-[1.03] transition-all" onClick={goToPlans}>
            Ver planos e começar agora <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 border-t border-orange-100">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-slate-500">ERP Gestão Integrada — Plataforma corporativa</span>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} FC Engenharia. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
