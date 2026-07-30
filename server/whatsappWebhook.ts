/**
 * Rev. 4767 — WhatsApp RH: webhook da Meta Cloud API.
 *
 * Recebe TODAS as mensagens enviadas ao número WhatsApp Business da empresa
 * e arquiva no ERP: cria/atualiza conversa (whatsapp_conversas), grava a
 * mensagem (whatsapp_mensagens) e baixa mídias (foto/áudio/doc) para o
 * storage interno via storagePut. Vínculo automático com funcionário pelo
 * telefone (match por sufixo de dígitos — celular/telefone do cadastro).
 *
 * Segurança: GET valida hub.verify_token contra whatsapp_configs; POST
 * localiza a config pelo phone_number_id (só processa números cadastrados).
 * Download de mídia SEMPRE via graph.facebook.com (nunca URL do cliente).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { storagePut } from "./storage";

const GRAPH = "https://graph.facebook.com/v20.0";

function soDigitos(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** Match de funcionário por telefone: compara os últimos 8 dígitos (ignora DDI/DDD/9º dígito). */
async function matchEmployee(db: any, companyId: number, waId: string): Promise<number | null> {
  const dig = soDigitos(waId);
  if (dig.length < 8) return null;
  const suf = dig.slice(-8);
  try {
    const r: any = await db.execute(sql`
      SELECT id FROM employees
      WHERE "companyId" = ${companyId}
        AND (
          RIGHT(regexp_replace(COALESCE(celular, ''), '[^0-9]', '', 'g'), 8) = ${suf}
          OR RIGHT(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), 8) = ${suf}
        )
      ORDER BY CASE WHEN status NOT IN ('Desligado', 'Lista_Negra', 'Inativo') THEN 0 ELSE 1 END, id DESC
      LIMIT 1
    `);
    const rows = (r as any).rows ?? r;
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function baixarMidia(mediaId: string, accessToken: string, companyId: number): Promise<{ url: string; mime: string; nome: string } | null> {
  try {
    const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meta.ok) { console.warn(`[WhatsApp] media meta ${mediaId} HTTP ${meta.status}`); return null; }
    const info: any = await meta.json();
    if (!info?.url) return null;
    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!bin.ok) { console.warn(`[WhatsApp] media bin ${mediaId} HTTP ${bin.status}`); return null; }
    const buf = Buffer.from(await bin.arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) { console.warn(`[WhatsApp] mídia ${mediaId} > 30MB, ignorada`); return null; }
    const mime = String(info.mime_type || bin.headers.get("content-type") || "application/octet-stream").split(";")[0];
    const ext = ({
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr",
      "video/mp4": "mp4", "application/pdf": "pdf",
    } as Record<string, string>)[mime] || "bin";
    const nome = `${mediaId}.${ext}`;
    const { url } = await storagePut(`whatsapp/${companyId}/${nome}`, buf, mime);
    return { url, mime, nome };
  } catch (e: any) {
    console.warn("[WhatsApp] falha ao baixar mídia:", e?.message || e);
    return null;
  }
}

/** GET /api/whatsapp/webhook — verificação inicial da Meta. */
export async function whatsappWebhookVerify(req: any, res: any) {
  try {
    const mode = req.query["hub.mode"];
    const token = String(req.query["hub.verify_token"] ?? "");
    const challenge = req.query["hub.challenge"];
    if (mode !== "subscribe" || !token) return res.sendStatus(403);
    const db = await getDb();
    const r: any = await db.execute(sql`SELECT id FROM whatsapp_configs WHERE verify_token = ${token} AND ativo = 1 LIMIT 1`);
    const rows = (r as any).rows ?? r;
    if (!rows?.length) return res.sendStatus(403);
    return res.status(200).send(String(challenge ?? ""));
  } catch (e: any) {
    console.error("[WhatsApp] verify erro:", e?.message || e);
    return res.sendStatus(500);
  }
}

/** Valida X-Hub-Signature-256 (HMAC SHA-256 do corpo RAW com o App Secret da Meta). */
function assinaturaValida(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  try {
    const esperado = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const recebido = header.slice(7);
    const a = Buffer.from(esperado, "hex");
    const b = Buffer.from(recebido, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** POST /api/whatsapp/webhook — recepção de mensagens (corpo RAW via express.raw). */
export async function whatsappWebhookReceive(req: any, res: any) {
  try {
    // corpo chega como Buffer (express.raw) — parse manual
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    let body: any;
    try { body = JSON.parse(rawBody.toString("utf8")); } catch { return res.sendStatus(400); }
    if (body?.object !== "whatsapp_business_account") return res.status(200).json({ ok: true });

    const db = await getDb();
    // Localiza config pelo phone_number_id ANTES de aceitar (gate) e valida assinatura
    const pnids = new Set<string>();
    for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
      const p = change?.value?.metadata?.phone_number_id;
      if (p) pnids.add(String(p));
    }
    if (pnids.size > 0) {
      const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;
      for (const pnid of pnids) {
        const cfgR: any = await db.execute(sql`SELECT app_secret FROM whatsapp_configs WHERE phone_number_id = ${pnid} AND ativo = 1 LIMIT 1`);
        const c = ((cfgR as any).rows ?? cfgR)?.[0];
        if (!c) continue;
        if (c.app_secret) {
          if (!assinaturaValida(rawBody, sigHeader, c.app_secret)) {
            console.warn(`[WhatsApp] assinatura X-Hub-Signature-256 INVÁLIDA (pnid=${pnid}) — evento descartado`);
            return res.sendStatus(403);
          }
        } else {
          console.warn(`[WhatsApp] config pnid=${pnid} sem App Secret — assinatura não verificada (configure o App Secret!)`);
        }
      }
    }
    res.status(200).json({ ok: true }); // ACK após validar assinatura (Meta reenvia se demorar)
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change?.value;
        if (!value?.messages?.length) continue;
        const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
        if (!phoneNumberId) continue;
        const cfgR: any = await db.execute(sql`SELECT * FROM whatsapp_configs WHERE phone_number_id = ${phoneNumberId} AND ativo = 1 LIMIT 1`);
        const cfg = ((cfgR as any).rows ?? cfgR)?.[0];
        if (!cfg) { console.warn(`[WhatsApp] phone_number_id não cadastrado: ${phoneNumberId}`); continue; }
        const companyId = Number(cfg.company_id);
        const contatos: Record<string, string> = {};
        for (const c of value.contacts ?? []) contatos[soDigitos(c?.wa_id)] = c?.profile?.name ?? "";

        for (const msg of value.messages) {
          try {
            const waId = soDigitos(msg.from);
            if (!waId) continue;
            const nomePerfil = contatos[waId] || null;
            // conversa (upsert)
            let convR: any = await db.execute(sql`
              INSERT INTO whatsapp_conversas (company_id, wa_id, nome_perfil, ultima_mensagem_em)
              VALUES (${companyId}, ${waId}, ${nomePerfil}, NOW())
              ON CONFLICT (company_id, wa_id) DO UPDATE
                SET ultima_mensagem_em = NOW(),
                    nome_perfil = COALESCE(EXCLUDED.nome_perfil, whatsapp_conversas.nome_perfil)
              RETURNING id, employee_id
            `);
            const conv = ((convR as any).rows ?? convR)?.[0];
            if (!conv) continue;
            // vínculo automático se ainda não tem funcionário
            if (conv.employee_id == null) {
              const empId = await matchEmployee(db, companyId, waId);
              if (empId) await db.execute(sql`UPDATE whatsapp_conversas SET employee_id = ${empId} WHERE id = ${conv.id} AND employee_id IS NULL`);
            }
            // corpo + mídia por tipo
            const tipo = String(msg.type ?? "text");
            let corpo: string | null = null;
            let midia: { url: string; mime: string; nome: string } | null = null;
            if (tipo === "text") corpo = msg.text?.body ?? null;
            else if (tipo === "image") { corpo = msg.image?.caption ?? null; if (msg.image?.id) midia = await baixarMidia(msg.image.id, cfg.access_token, companyId); }
            else if (tipo === "video") { corpo = msg.video?.caption ?? null; if (msg.video?.id) midia = await baixarMidia(msg.video.id, cfg.access_token, companyId); }
            else if (tipo === "audio") { if (msg.audio?.id) midia = await baixarMidia(msg.audio.id, cfg.access_token, companyId); }
            else if (tipo === "document") { corpo = msg.document?.caption ?? msg.document?.filename ?? null; if (msg.document?.id) { midia = await baixarMidia(msg.document.id, cfg.access_token, companyId); if (midia && msg.document?.filename) midia.nome = String(msg.document.filename).slice(0, 250); } }
            else if (tipo === "sticker") { if (msg.sticker?.id) midia = await baixarMidia(msg.sticker.id, cfg.access_token, companyId); }
            else if (tipo === "location") corpo = `📍 Localização: ${msg.location?.latitude}, ${msg.location?.longitude}${msg.location?.name ? ` (${msg.location.name})` : ""}`;
            else if (tipo === "contacts") corpo = `👤 Contato compartilhado: ${(msg.contacts ?? []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(", ")}`;
            else if (tipo === "button") corpo = msg.button?.text ?? null;
            else if (tipo === "interactive") corpo = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
            else corpo = `[mensagem do tipo "${tipo}" não suportada]`;

            const tsWa = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
            await db.execute(sql`
              INSERT INTO whatsapp_mensagens (conversa_id, company_id, wa_message_id, direcao, tipo, corpo, midia_url, midia_nome, midia_mime, timestamp_wa)
              VALUES (${conv.id}, ${companyId}, ${msg.id ?? null}, 'in', ${tipo}, ${corpo}, ${midia?.url ?? null}, ${midia?.nome ?? null}, ${midia?.mime ?? null}, ${tsWa}::timestamp)
              ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
            `);
          } catch (e: any) {
            console.error("[WhatsApp] erro ao processar mensagem:", e?.message || e);
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[WhatsApp] webhook erro:", e?.message || e);
    if (!res.headersSent) res.sendStatus(200);
  }
}
