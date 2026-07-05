import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ClipboardCheck, Handshake, Ruler, HardHat, Warehouse, FolderOpen, Truck,
} from "lucide-react";

/**
 * Rev. 4053 — Extraído de `SiteVendas.tsx` pra ser reusado também pela
 * página dedicada de detalhe `/planos/modulos/:id` (`ModuloDetalhe.tsx`),
 * sem duplicar o array. NENHUM dado foi alterado nessa extração.
 */
export type ModuleCard = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  color: string;
  highlights: string[];
};

export const MODULES: ModuleCard[] = [
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

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
