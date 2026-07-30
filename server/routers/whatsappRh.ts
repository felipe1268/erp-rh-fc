/**
 * Rev. 4767 — WhatsApp RH: router tRPC.
 * Config por empresa (cadastro fácil: só Phone Number ID + token; verify token
 * é gerado automaticamente), listagem de conversas/mensagens e vínculo manual
 * com funcionário. Recepção fica em server/whatsappWebhook.ts.
 * Tenancy: todas as procedures validam acesso à empresa (padrão _assertCompanyAccess).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";

async function assertAccess(ctxUser: any, companyId: number) {
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowed = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number") as number[];
  if (allowed.length > 0 && !allowed.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

function rows(r: any): any[] {
  return (r as any).rows ?? r ?? [];
}

export const whatsappRhRouter = router({
  // ── Configuração ──
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user, input.companyId);
      const db = await getDb();
      const r = rows(await db.execute(sql`SELECT id, company_id, phone_number_id, verify_token, numero_exibicao, ativo, created_at, updated_at,
        CASE WHEN access_token IS NOT NULL AND access_token <> '' THEN 1 ELSE 0 END AS tem_token,
        CASE WHEN app_secret IS NOT NULL AND app_secret <> '' THEN 1 ELSE 0 END AS tem_app_secret
        FROM whatsapp_configs WHERE company_id = ${input.companyId} LIMIT 1`));
      const c = r[0];
      if (!c) return null;
      // access_token e app_secret NUNCA voltam pro client
      return {
        id: c.id, companyId: c.company_id, phoneNumberId: c.phone_number_id,
        verifyToken: c.verify_token, numeroExibicao: c.numero_exibicao,
        ativo: Number(c.ativo) === 1, temToken: Number(c.tem_token) === 1,
        temAppSecret: Number(c.tem_app_secret) === 1,
      };
    }),

  salvarConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      phoneNumberId: z.string().min(5).max(50),
      accessToken: z.string().max(2000).optional(), // vazio = manter o atual
      appSecret: z.string().max(200).optional(), // vazio = manter o atual
      numeroExibicao: z.string().max(30).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAccess(ctx.user, input.companyId);
      const db = await getDb();
      const existente = rows(await db.execute(sql`SELECT id, access_token, verify_token, app_secret FROM whatsapp_configs WHERE company_id = ${input.companyId} LIMIT 1`))[0];
      const token = (input.accessToken ?? "").trim();
      const appSecret = (input.appSecret ?? "").trim();
      if (!existente && !token) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o Token de Acesso da Meta." });
      const ativo = input.ativo === false ? 0 : 1;
      if (existente) {
        await db.execute(sql`UPDATE whatsapp_configs SET
          phone_number_id = ${input.phoneNumberId.trim()},
          access_token = ${token || existente.access_token},
          app_secret = ${appSecret || existente.app_secret || null},
          numero_exibicao = ${input.numeroExibicao?.trim() || null},
          ativo = ${ativo}, updated_at = NOW()
          WHERE id = ${existente.id}`);
        return { ok: true, verifyToken: existente.verify_token };
      }
      const verifyToken = `fc-${randomBytes(12).toString("hex")}`;
      await db.execute(sql`INSERT INTO whatsapp_configs (company_id, phone_number_id, access_token, verify_token, numero_exibicao, ativo, app_secret)
        VALUES (${input.companyId}, ${input.phoneNumberId.trim()}, ${token}, ${verifyToken}, ${input.numeroExibicao?.trim() || null}, ${ativo}, ${appSecret || null})`);
      return { ok: true, verifyToken };
    }),

  // ── Conversas ──
  listarConversas: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user, input.companyId);
      const db = await getDb();
      const busca = (input.busca ?? "").trim();
      const conds = busca
        ? sql` AND (c.wa_id ILIKE ${"%" + busca + "%"} OR c.nome_perfil ILIKE ${"%" + busca + "%"} OR e."nomeCompleto" ILIKE ${"%" + busca + "%"})`
        : sql``;
      const r = rows(await db.execute(sql`
        SELECT c.id, c.wa_id, c.nome_perfil, c.employee_id, c.ultima_mensagem_em,
               e."nomeCompleto" AS employee_nome, e."fotoUrl" AS employee_foto,
               (SELECT corpo FROM whatsapp_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_msg,
               (SELECT tipo FROM whatsapp_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima_tipo,
               (SELECT COUNT(*) FROM whatsapp_mensagens m WHERE m.conversa_id = c.id) AS total_msgs
        FROM whatsapp_conversas c
        LEFT JOIN employees e ON e.id = c.employee_id
        WHERE c.company_id = ${input.companyId} ${conds}
        ORDER BY c.ultima_mensagem_em DESC NULLS LAST
        LIMIT 300
      `));
      return r.map((c: any) => ({
        id: c.id, waId: c.wa_id, nomePerfil: c.nome_perfil, employeeId: c.employee_id,
        employeeNome: c.employee_nome, employeeFoto: c.employee_foto,
        ultimaMensagemEm: c.ultima_mensagem_em, ultimaMsg: c.ultima_msg, ultimaTipo: c.ultima_tipo,
        totalMsgs: Number(c.total_msgs ?? 0),
      }));
    }),

  listarMensagens: protectedProcedure
    .input(z.object({ conversaId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // IDOR guard: deriva a empresa da PRÓPRIA conversa e valida acesso
      const conv = rows(await db.execute(sql`SELECT id, company_id FROM whatsapp_conversas WHERE id = ${input.conversaId} LIMIT 1`))[0];
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
      await assertAccess(ctx.user, Number(conv.company_id));
      const r = rows(await db.execute(sql`
        SELECT id, direcao, tipo, corpo, midia_url, midia_nome, midia_mime, timestamp_wa, created_at
        FROM whatsapp_mensagens WHERE conversa_id = ${input.conversaId}
        ORDER BY COALESCE(timestamp_wa, created_at) ASC, id ASC
        LIMIT 2000
      `));
      return r.map((m: any) => ({
        id: m.id, direcao: m.direcao, tipo: m.tipo, corpo: m.corpo,
        midiaUrl: m.midia_url, midiaNome: m.midia_nome, midiaMime: m.midia_mime,
        timestampWa: m.timestamp_wa ?? m.created_at,
      }));
    }),

  vincularFuncionario: protectedProcedure
    .input(z.object({ conversaId: z.number(), employeeId: z.number().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const conv = rows(await db.execute(sql`SELECT id, company_id FROM whatsapp_conversas WHERE id = ${input.conversaId} LIMIT 1`))[0];
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
      const companyId = Number(conv.company_id);
      await assertAccess(ctx.user, companyId);
      if (input.employeeId != null) {
        // funcionário precisa pertencer à MESMA empresa (evita cross-tenant)
        const emp = rows(await db.execute(sql`SELECT id FROM employees WHERE id = ${input.employeeId} AND "companyId" = ${companyId} LIMIT 1`))[0];
        if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário não pertence a esta empresa." });
      }
      await db.execute(sql`UPDATE whatsapp_conversas SET employee_id = ${input.employeeId} WHERE id = ${input.conversaId}`);
      return { ok: true };
    }),

  // Funcionários para o seletor de vínculo (id + nome, ativos primeiro)
  listarFuncionarios: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user, input.companyId);
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT id, "nomeCompleto" AS nome, status, celular, telefone FROM employees
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        ORDER BY CASE WHEN status NOT IN ('Desligado','Lista_Negra','Inativo') THEN 0 ELSE 1 END, "nomeCompleto" ASC
      `));
      return r.map((e: any) => ({ id: e.id, nome: e.nome, status: e.status, celular: e.celular ?? e.telefone ?? null }));
    }),
});
