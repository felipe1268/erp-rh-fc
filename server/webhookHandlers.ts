import { getStripeSync, constructStripeEvent } from './stripeClient';
import { getDb } from './db';
import { provisionCompanyFromSubscription, syncSubscriptionStatus } from './billingProvisioning';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // 1) stripe-replit-sync valida a assinatura e replica os dados brutos do
    //    Stripe para o schema `stripe.*` no Neon (products/prices/subscriptions).
    //    processWebhook NÃO retorna o evento (void) — só espelha os dados.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // 2) Para o NOSSO pós-processamento (provisionamento/lifecycle) precisamos
    //    do evento tipado — parseamos/validamos de novo, reaproveitando o
    //    mesmo webhook secret gerenciado (constructStripeEvent).
    try {
      const db = await getDb();
      if (!db) return;
      const event = await constructStripeEvent(payload, signature);
      const type = event?.type as string | undefined;
      const object = (event as any)?.data?.object;
      if (!type || !object) return;

      switch (type) {
        case 'checkout.session.completed':
        case 'customer.subscription.created':
          await provisionCompanyFromSubscription(object);
          break;
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        case 'invoice.payment_failed':
        case 'invoice.payment_succeeded':
          await syncSubscriptionStatus(object, type);
          break;
        default:
          break;
      }
    } catch (e: any) {
      console.error('[StripeWebhook] Falha no pós-processamento (provisionamento):', e?.message || e);
    }
  }
}
