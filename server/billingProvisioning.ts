// Provisionamento automático (100% self-service) de empresas-cliente a partir
// de eventos do Stripe. Gatilho: assinatura criada (checkout de /assinar).
// ZERO revisão manual da FC — acesso liberado assim que o Stripe confirma a
// assinatura (mesmo em trial, pois trial exige cartão no ato).
import { getDb } from "./db";
import { companies, companySubscriptions, companySubscriptionModules, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";
import { setUserCompanies } from "./db";

function readMeta(obj: any, key: string): string | undefined {
  return obj?.metadata?.[key] ?? obj?.subscription_data?.metadata?.[key];
}

function tsToIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Cria company + usuário adm_cliente + registros de assinatura/módulos a
 * partir de uma subscription do Stripe recém-criada. Idempotente: se já
 * existe companySubscriptions para essa stripeSubscriptionId, não duplica.
 */
export async function provisionCompanyFromSubscription(subscriptionLike: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const subscriptionId: string | undefined = subscriptionLike?.id?.startsWith?.('sub_')
    ? subscriptionLike.id
    : subscriptionLike?.subscription; // checkout.session traz o id da sub em `.subscription`

  if (!subscriptionId) {
    console.warn('[billingProvisioning] Evento sem subscriptionId — ignorado.');
    return;
  }

  const existing = await db.select().from(companySubscriptions)
    .where(eq(companySubscriptions.stripeSubscriptionId, subscriptionId));
  if (existing.length > 0) {
    console.log(`[billingProvisioning] Assinatura ${subscriptionId} já provisionada (companyId=${existing[0].companyId}). Ignorando duplicata.`);
    return;
  }

  const stripe = await getUncachableStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const meta = subscription.metadata || {};

  const razaoSocial = meta.razaoSocial || 'Empresa sem nome';
  const cnpj = meta.cnpj || '00000000000000';
  const adminName = meta.adminName || 'Administrador';
  const adminEmail = meta.adminEmail;
  const adminUsername = meta.adminUsername || (adminEmail ? adminEmail.split('@')[0] : `cliente_${Date.now()}`);
  const moduleIds = (meta.moduleIds || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const seats = Number(meta.seats || 1);

  const [company] = await db.insert(companies).values({
    cnpj, razaoSocial, nomeFantasia: razaoSocial, email: adminEmail || null,
  } as any).returning();

  const bcrypt = await import("bcryptjs");
  const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!";
  const hashed = bcrypt.hashSync(tempPassword, 10);
  const openId = `saas_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const [user] = await db.insert(users).values({
    openId, name: adminName, email: adminEmail || null,
    username: adminUsername, password: hashed,
    mustChangePassword: 1, loginMethod: "local", role: "adm_cliente",
  } as any).returning();

  await setUserCompanies(Number(user.id), [Number(company.id)]);

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const [subRow] = await db.insert(companySubscriptions).values({
    companyId: Number(company.id),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    seats,
    trialEnd: tsToIso((subscription as any).trial_end),
    currentPeriodEnd: tsToIso((subscription as any).current_period_end),
  } as any).returning();

  if (moduleIds.length > 0) {
    const items = subscription.items?.data || [];
    await db.insert(companySubscriptionModules).values(
      moduleIds.map((moduleId: string) => {
        const item = items.find((it: any) => it.price?.metadata?.moduleId === moduleId);
        return {
          subscriptionId: Number(subRow.id),
          moduleId,
          stripePriceId: item?.price?.id || null,
        };
      })
    );
  }

  console.log(`[billingProvisioning] Empresa "${razaoSocial}" provisionada automaticamente (companyId=${company.id}, adm_cliente=${adminUsername}, módulos=${moduleIds.join(',') || 'nenhum'}).`);

  // Credenciais temporárias — em produção, enviar por e-mail (SMTP já configurado
  // no projeto). Por ora, log server-side apenas (senha nunca deve ir por resposta HTTP pública).
  console.log(`[billingProvisioning] Login inicial: usuário=${adminUsername} senha_temporaria=${tempPassword} (troca obrigatória no 1º login).`);
}

/**
 * Sincroniza status/período de uma assinatura existente a partir de eventos
 * subsequentes do Stripe (upgrade, cancelamento, falha/sucesso de cobrança).
 */
export async function syncSubscriptionStatus(objectLike: any, eventType: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  let subscriptionId: string | undefined = objectLike?.id?.startsWith?.('sub_') ? objectLike.id : objectLike?.subscription;
  if (!subscriptionId) return;

  const rows = await db.select().from(companySubscriptions).where(eq(companySubscriptions.stripeSubscriptionId, subscriptionId));
  if (rows.length === 0) {
    console.warn(`[billingProvisioning] syncSubscriptionStatus: assinatura ${subscriptionId} não encontrada localmente (evento ${eventType}).`);
    return;
  }

  const patch: Record<string, any> = { updatedAt: new Date().toISOString() };

  if (eventType === 'invoice.payment_failed') {
    patch.status = 'past_due';
    patch.paymentFailedAt = new Date().toISOString();
  } else if (eventType === 'invoice.payment_succeeded') {
    patch.paymentFailedAt = null;
    const stripe = await getUncachableStripeClient();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    patch.status = sub.status;
    patch.currentPeriodEnd = tsToIso((sub as any).current_period_end);
  } else if (eventType === 'customer.subscription.updated') {
    patch.status = objectLike.status;
    patch.currentPeriodEnd = tsToIso(objectLike.current_period_end);
    patch.seats = objectLike.items?.data?.reduce((acc: number, it: any) => it.price?.metadata?.moduleId ? acc : acc + (it.quantity || 0), 0) || rows[0].seats;
  } else if (eventType === 'customer.subscription.deleted') {
    patch.status = 'canceled';
    patch.canceledAt = new Date().toISOString();
  }

  await db.update(companySubscriptions).set(patch as any).where(eq(companySubscriptions.stripeSubscriptionId, subscriptionId));
  console.log(`[billingProvisioning] Assinatura ${subscriptionId} sincronizada (evento ${eventType}) → status=${patch.status ?? rows[0].status}.`);
}
