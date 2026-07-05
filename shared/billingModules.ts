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

// Rev. 4047 — preços de ENTRADA reduzidos (~metade do valor original) para
// baixar a barreira de quem está abrindo a construtora agora. São só o SEED
// inicial: o valor efetivamente exibido/cobrado pode ser ajustado depois pelo
// admin_master em "Painel SaaS → Preços" (tabela billing_module_prices),
// permitindo reajustar gradualmente conforme o cliente se familiariza.
export const BILLING_MODULES: BillingModuleDefinition[] = [
  { id: "rh-dp", label: "RH & DP", description: "Recursos Humanos e Departamento Pessoal", monthlyPriceCents: 14900, envPriceKey: "STRIPE_PRICE_RH_DP" },
  { id: "sst", label: "SST", description: "Saúde e Segurança do Trabalho", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_SST" },
  { id: "juridico", label: "Jurídico", description: "Gestão Jurídica — Trabalhista, Tributário e Civil", monthlyPriceCents: 7900, envPriceKey: "STRIPE_PRICE_JURIDICO" },
  { id: "avaliacao", label: "Avaliação de Desempenho", description: "Ciclos de avaliação, ranking e competências", monthlyPriceCents: 4900, envPriceKey: "STRIPE_PRICE_AVALIACAO" },
  { id: "terceiros", label: "Terceiros", description: "Gestão de Empresas Terceirizadas e Subcontratadas", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_TERCEIROS" },
  { id: "parceiros", label: "Parceiros", description: "Portal de Parceiros Conveniados", monthlyPriceCents: 4900, envPriceKey: "STRIPE_PRICE_PARCEIROS" },
  { id: "orcamento", label: "Orçamento", description: "Importação de planilhas, curva ABC de insumos", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_ORCAMENTO" },
  { id: "medicao", label: "Medição", description: "Boletins de medição e faturamento por avanço físico", monthlyPriceCents: 7900, envPriceKey: "STRIPE_PRICE_MEDICAO" },
  { id: "almoxarifado", label: "Almoxarifado & Equipamentos", description: "Materiais, ferramentas, empréstimos e inventário", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_ALMOXARIFADO" },
  { id: "financeiro", label: "Financeiro", description: "Contas a pagar/receber, conciliação, DRE, fluxo de caixa", monthlyPriceCents: 14900, envPriceKey: "STRIPE_PRICE_FINANCEIRO" },
  { id: "compras", label: "Compras", description: "Solicitações, cotações e ordens de compra", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_COMPRAS" },
  { id: "gestao-documentos", label: "Gestão de Documentos", description: "Central de documentos, ISO, templates", monthlyPriceCents: 4900, envPriceKey: "STRIPE_PRICE_GESTAO_DOCUMENTOS" },
  { id: "frotas", label: "Frotas", description: "Gestão de veículos e integração Infleet", monthlyPriceCents: 7900, envPriceKey: "STRIPE_PRICE_FROTAS" },
  { id: "planejamento", label: "Planejamento", description: "MSP, Curva S, % previsto x realizado", monthlyPriceCents: 9900, envPriceKey: "STRIPE_PRICE_PLANEJAMENTO" },
];

export function getBillingModule(id: string): BillingModuleDefinition | undefined {
  return BILLING_MODULES.find(m => m.id === id);
}

/**
 * Mescla os defaults estáticos acima com overrides vindos de `billing_module_prices`
 * (editados pelo admin_master em Painel SaaS → Preços). Overrides ausentes = usa o
 * default. `seat` não está em BILLING_MODULES, então é tratado à parte pelo chamador.
 */
export function applyPriceOverrides<T extends { id: string; monthlyPriceCents: number }>(
  modules: T[],
  overrides: Record<string, number>,
): T[] {
  return modules.map(m => (overrides[m.id] != null ? { ...m, monthlyPriceCents: overrides[m.id] } : m));
}

/** Preço mensal por assento (usuário) em centavos — cobrança "por quantidade de usuários". */
export const SEAT_MONTHLY_PRICE_CENTS = 2900;
export const SEAT_ENV_PRICE_KEY = "STRIPE_PRICE_SEAT";

export const TRIAL_PERIOD_DAYS = 3;
