// Lista canônica de módulos VENDÁVEIS para o billing SaaS (Stripe).
// Desacoplada de ERP_MODULES (shared/modules.ts, usado em permissões) e de
// ActiveModuleId (client/src/contexts/ModuleContext.tsx, usado na sidebar),
// pois nem todo módulo de permissão/sidebar é um item de cobrança — e o
// contrário também é verdade (ex.: "cadastro" e "usuarios" são base plan).
//
// `envPriceKey` é o nome da env var que guarda o Stripe Price ID (recorrente
// mensal) gerado pelo scripts/seed-products.ts. companySubscriptionModules
// grava o priceId real usado no momento da contratação (histórico imutável).

export interface BillingModuleDefinition {
  id: string;
  label: string;
  description: string;
  /** Preço mensal em centavos (BRL) usado no seed-products.ts */
  monthlyPriceCents: number;
  envPriceKey: string;
}

export const BILLING_MODULES: BillingModuleDefinition[] = [
  { id: "rh-dp", label: "RH & DP", description: "Recursos Humanos e Departamento Pessoal", monthlyPriceCents: 29900, envPriceKey: "STRIPE_PRICE_RH_DP" },
  { id: "sst", label: "SST", description: "Saúde e Segurança do Trabalho", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_SST" },
  { id: "juridico", label: "Jurídico", description: "Gestão Jurídica — Trabalhista, Tributário e Civil", monthlyPriceCents: 14900, envPriceKey: "STRIPE_PRICE_JURIDICO" },
  { id: "avaliacao", label: "Avaliação de Desempenho", description: "Ciclos de avaliação, ranking e competências", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_AVALIACAO" },
  { id: "terceiros", label: "Terceiros", description: "Gestão de Empresas Terceirizadas e Subcontratadas", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_TERCEIROS" },
  { id: "parceiros", label: "Parceiros", description: "Portal de Parceiros Conveniados", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_PARCEIROS" },
  { id: "orcamento", label: "Orçamento", description: "Importação de planilhas, curva ABC de insumos", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_ORCAMENTO" },
  { id: "medicao", label: "Medição", description: "Boletins de medição e faturamento por avanço físico", monthlyPriceCents: 14900, envPriceKey: "STRIPE_PRICE_MEDICAO" },
  { id: "almoxarifado", label: "Almoxarifado & Equipamentos", description: "Materiais, ferramentas, empréstimos e inventário", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_ALMOXARIFADO" },
  { id: "financeiro", label: "Financeiro", description: "Contas a pagar/receber, conciliação, DRE, fluxo de caixa", monthlyPriceCents: 29900, envPriceKey: "STRIPE_PRICE_FINANCEIRO" },
  { id: "compras", label: "Compras", description: "Solicitações, cotações e ordens de compra", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_COMPRAS" },
  { id: "gestao-documentos", label: "Gestão de Documentos", description: "Central de documentos, ISO, templates", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_GESTAO_DOCUMENTOS" },
  { id: "frotas", label: "Frotas", description: "Gestão de veículos e integração Infleet", monthlyPriceCents: 14900, envPriceKey: "STRIPE_PRICE_FROTAS" },
  { id: "planejamento", label: "Planejamento", description: "MSP, Curva S, % previsto x realizado", monthlyPriceCents: 19900, envPriceKey: "STRIPE_PRICE_PLANEJAMENTO" },
];

export function getBillingModule(id: string): BillingModuleDefinition | undefined {
  return BILLING_MODULES.find(m => m.id === id);
}

/** Preço mensal por assento (usuário) em centavos — cobrança "por quantidade de usuários". */
export const SEAT_MONTHLY_PRICE_CENTS = 4900;
export const SEAT_ENV_PRICE_KEY = "STRIPE_PRICE_SEAT";

export const TRIAL_PERIOD_DAYS = 3;
