/**
 * Semeia no Stripe (modo TESTE) os produtos/preços de cada módulo vendável
 * (shared/billingModules.ts) + o preço por assento (seat).
 *
 * Idempotente: procura por produto ativo com o nome exato antes de criar.
 * Grava `moduleId`/`seat` no metadata do PRICE — usado no webhook
 * (billingProvisioning.ts) para casar item da assinatura → módulo contratado.
 *
 * Rodar com: npx tsx scripts/seed-products.ts
 */
import { getUncachableStripeClient } from '../server/stripeClient';
import { BILLING_MODULES, SEAT_MONTHLY_PRICE_CENTS } from '../shared/billingModules';

async function findOrCreatePrice(params: {
  productName: string;
  productDescription: string;
  unitAmountCents: number;
  metadata: Record<string, string>;
}) {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.products.search({
    query: `name:'${params.productName}' AND active:'true'`,
  });

  let product = existing.data[0];
  if (product) {
    console.log(`Produto já existe: ${product.name} (${product.id}) — reaproveitando.`);
  } else {
    product = await stripe.products.create({
      name: params.productName,
      description: params.productDescription,
      metadata: params.metadata,
    });
    console.log(`Produto criado: ${product.name} (${product.id})`);
  }

  const existingPrices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
  let price = existingPrices.data.find(
    p => p.unit_amount === params.unitAmountCents && p.recurring?.interval === 'month'
  );
  if (price) {
    console.log(`  Preço mensal já existe: R$ ${(params.unitAmountCents / 100).toFixed(2)} (${price.id})`);
  } else {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: params.unitAmountCents,
      currency: 'brl',
      recurring: { interval: 'month' },
      metadata: params.metadata,
    });
    console.log(`  Preço mensal criado: R$ ${(params.unitAmountCents / 100).toFixed(2)}/mês (${price.id})`);
  }
  return price.id;
}

async function main() {
  console.log('Semeando produtos/preços de billing no Stripe (SaaS ERP FC Engenharia)...\n');
  const created: Record<string, string> = {};

  for (const mod of BILLING_MODULES) {
    const priceId = await findOrCreatePrice({
      productName: `Módulo: ${mod.label}`,
      productDescription: mod.description,
      unitAmountCents: mod.monthlyPriceCents,
      metadata: { moduleId: mod.id },
    });
    created[mod.envPriceKey] = priceId;
  }

  const seatPriceId = await findOrCreatePrice({
    productName: 'Assento adicional (usuário)',
    productDescription: 'Cobrança por quantidade de usuários (assentos) do ERP',
    unitAmountCents: SEAT_MONTHLY_PRICE_CENTS,
    metadata: { moduleId: 'seat' },
  });
  created['STRIPE_PRICE_SEAT'] = seatPriceId;

  console.log('\n✓ Seed concluído. Price IDs gerados:\n');
  for (const [key, value] of Object.entries(created)) {
    console.log(`${key}=${value}`);
  }
  console.log('\n(Opcional: salve estes valores como env vars se quiser referenciá-los por env em vez de buscar por metadata.moduleId no Stripe.)');
}

main().catch(e => {
  console.error('Erro ao semear produtos:', e.message || e);
  process.exit(1);
});
