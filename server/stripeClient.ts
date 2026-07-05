import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { ENV } from './_core/env';

/**
 * Resolve Stripe credentials.
 *
 * Preferência de fonte:
 * 1. STRIPE_SECRET_KEY (secret manual do Replit) — usado neste projeto porque
 *    o fluxo de autorização do conector Replit foi dispensado pelo usuário;
 *    ele colou a chave de teste direto do dashboard do Stripe.
 * 2. Conector Replit (REPLIT_CONNECTORS_HOSTNAME) — mantido como fallback
 *    caso a integração seja conectada futuramente.
 */
async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  if (process.env.STRIPE_SECRET_KEY) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Stripe não configurado: defina o secret STRIPE_SECRET_KEY ou conecte a integração Stripe do Replit.'
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret_key) {
    throw new Error('Stripe integration not connected or missing secret key.');
  }

  return {
    secretKey: settings.secret_key,
    webhookSecret: settings.webhook_secret,
  };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  // Este ERP usa SEMPRE o Neon (NEON_DATABASE_URL), nunca o Postgres local do
  // Replit — ver ENV.databaseUrl / memória "db-connection.md".
  const databaseUrl = ENV.databaseUrl;
  if (!databaseUrl) {
    throw new Error('NEON_DATABASE_URL environment variable is required for Stripe sync');
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? '',
  });
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY || process.env.REPLIT_CONNECTORS_HOSTNAME);
}

/**
 * Runs the stripe-replit-sync database migrations (creates the `stripe.*`
 * schema mirroring products/prices/subscriptions/etc). `runMigrations` is a
 * standalone export of the package, NOT a method on the StripeSync instance.
 */
export async function runStripeSyncMigrations(): Promise<void> {
  const { runMigrations } = await import('stripe-replit-sync');
  const databaseUrl = ENV.databaseUrl;
  if (!databaseUrl) throw new Error('NEON_DATABASE_URL environment variable is required for Stripe sync');
  await runMigrations({ databaseUrl });
}

/**
 * Parses+verifies a raw webhook payload into a typed Stripe.Event, for use in
 * our OWN post-processing (provisioning/lifecycle), independent of
 * stripe-replit-sync's internal (void-returning) processWebhook.
 *
 * O segredo do webhook é o mesmo criado/gerenciado por findOrCreateManagedWebhook
 * na inicialização, persistido pela própria lib em `stripe._managed_webhooks`.
 * Reaproveitamos essa fonte em vez de exigir um secret manual adicional.
 */
export async function constructStripeEvent(payload: Buffer, signature: string) {
  const { secretKey, webhookSecret: manualWebhookSecret } = await getStripeCredentials();
  const stripe = new Stripe(secretKey);

  if (manualWebhookSecret) {
    return stripe.webhooks.constructEvent(payload, signature, manualWebhookSecret);
  }

  const sync = await getStripeSync();
  const accountId = await sync.getAccountId();
  const result = await sync.postgresClient.query(
    `SELECT secret FROM "stripe"."_managed_webhooks" WHERE account_id = $1 LIMIT 1`,
    [accountId]
  );
  const webhookSecret = result.rows?.[0]?.secret;
  if (!webhookSecret) {
    throw new Error('Nenhum webhook secret disponível — configure STRIPE_WEBHOOK_SECRET ou garanta que findOrCreateManagedWebhook rodou no startup.');
  }
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
