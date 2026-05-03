import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { oraculoSessions, oraculoMessages } from "../../drizzle/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";

// ============================================================
// CONTEXT BUILDER — snapshot de dados de todos os módulos
// ============================================================
async function buildContext(companyId: number, companyIds?: number[]): Promise<string> {
  const db = await getDb();
  if (!db) return "{}";

  const ids = companyIds && companyIds.length > 0 ? companyIds : (companyId ? [companyId] : []);
  if (ids.length === 0) return "{}";

  const now = new Date();
  const mesAtual = now.toISOString().slice(0, 7);
  const trintaDias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [empRes, obrasRes, processosRes, warnRes, atesRes, folhaRes, frotaRes, epiRes] = await Promise.allSettled([
    db.execute(sql`
      SELECT status, COUNT(*)::int as total
      FROM employees
      WHERE "companyId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL
      GROUP BY status
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN status = 'Em andamento' THEN 1 END)::int as em_andamento,
        COUNT(CASE WHEN status = 'Concluída' THEN 1 END)::int as concluidas,
        COUNT(CASE WHEN status = 'Paralisada' THEN 1 END)::int as paralisadas
      FROM obras
      WHERE "companyId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL
    `),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM processos_trabalhistas WHERE "companyId" = ANY(${ids}::int[])) as trabalhistas,
        (SELECT COUNT(*)::int FROM processos_tributarios WHERE "companyId" = ANY(${ids}::int[])) as tributarios,
        (SELECT COUNT(*)::int FROM processos_civis WHERE "companyId" = ANY(${ids}::int[])) as civis
    `),
    db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM warnings
      WHERE "companyId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL AND "createdAt"::date >= ${trintaDias}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM atestados
      WHERE "companyId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL AND "dataInicio" >= ${trintaDias}
    `),
    db.execute(sql`
      SELECT
        SUM(CASE WHEN tipo_lancamento = 'clt' THEN valor ELSE 0 END)::numeric as custo_clt,
        SUM(CASE WHEN tipo_lancamento = 'pj' THEN valor ELSE 0 END)::numeric as custo_pj,
        SUM(valor)::numeric as custo_total,
        competencia
      FROM monthly_payroll_summary
      WHERE "companyId" = ANY(${ids}::int[]) AND competencia = ${mesAtual}
      GROUP BY competencia
    `),
    db.execute(sql`
      SELECT COUNT(*)::int as total_veiculos,
        COUNT(CASE WHEN status = 'Ativo' THEN 1 END)::int as ativos
      FROM frota_veiculos
      WHERE "companyId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL
    `),
    db.execute(sql`
      SELECT COUNT(*)::int as pendentes
      FROM epi_discount_alerts
      WHERE "companyId" = ANY(${ids}::int[]) AND status = 'pendente'
    `),
  ]);

  const ctx: Record<string, any> = {
    data_consulta: now.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    mes_referencia: mesAtual,
  };

  if (empRes.status === "fulfilled") {
    const rows = (empRes.value as any).rows ?? empRes.value ?? [];
    const col: Record<string, number> = {};
    let total = 0;
    for (const r of rows) { col[r.status] = Number(r.total); total += Number(r.total); }
    ctx.colaboradores = { ...col, TOTAL: total };
  }

  if (obrasRes.status === "fulfilled") {
    const r = ((obrasRes.value as any).rows ?? obrasRes.value ?? [])[0] ?? {};
    ctx.obras = { total: Number(r.total) || 0, em_andamento: Number(r.em_andamento) || 0, concluidas: Number(r.concluidas) || 0, paralisadas: Number(r.paralisadas) || 0 };
  }

  if (processosRes.status === "fulfilled") {
    const r = ((processosRes.value as any).rows ?? processosRes.value ?? [])[0] ?? {};
    const t = Number(r.trabalhistas) || 0, tr = Number(r.tributarios) || 0, ci = Number(r.civis) || 0;
    ctx.processos_juridicos = { trabalhistas: t, tributarios: tr, civis: ci, total: t + tr + ci };
  }

  if (warnRes.status === "fulfilled") {
    const r = ((warnRes.value as any).rows ?? warnRes.value ?? [])[0] ?? {};
    ctx.advertencias_30_dias = Number(r.total) || 0;
  }

  if (atesRes.status === "fulfilled") {
    const r = ((atesRes.value as any).rows ?? atesRes.value ?? [])[0] ?? {};
    ctx.atestados_30_dias = Number(r.total) || 0;
  }

  if (folhaRes.status === "fulfilled") {
    const r = ((folhaRes.value as any).rows ?? folhaRes.value ?? [])[0];
    if (r) ctx.folha_pagamento = { custo_clt: Number(r.custo_clt) || 0, custo_pj: Number(r.custo_pj) || 0, custo_total: Number(r.custo_total) || 0, competencia: r.competencia };
  }

  if (frotaRes.status === "fulfilled") {
    const r = ((frotaRes.value as any).rows ?? frotaRes.value ?? [])[0] ?? {};
    ctx.frota = { total_veiculos: Number(r.total_veiculos) || 0, ativos: Number(r.ativos) || 0 };
  }

  if (epiRes.status === "fulfilled") {
    const r = ((epiRes.value as any).rows ?? epiRes.value ?? [])[0] ?? {};
    ctx.epi_alertas_pendentes = Number(r.pendentes) || 0;
  }

  return JSON.stringify(ctx, null, 2);
}

// ============================================================
// SYSTEM PROMPT
// ============================================================
const SYSTEM_PROMPT = `Você é o ORÁCULO — assistente analítica de inteligência artificial integrada ao ERP/RH da FC Engenharia.

Você é especialista em análise de dados de RH, folha de pagamento, obras, financeiro, processos jurídicos, frota, compras, EPI e segurança do trabalho.

Seu perfil:
- Analítica, precisa e perspicaz
- Proativa: detecta anomalias e riscos sem precisar ser perguntada
- Objetiva: respostas claras, diretas e bem estruturadas
- Profissional mas acessível — usa linguagem natural em português do Brasil
- Usa bullet points e formatação quando listar informações

Regras absolutas:
- Responda SEMPRE em português do Brasil
- Use os dados do snapshot para embasar respostas com números reais
- Quando detectar algo preocupante nos dados, aponte proativamente
- Se os dados forem insuficientes, diga isso e oriente como obter a informação
- NUNCA invente dados que não estejam no contexto
- Mantenha respostas concisas mas completas

Empresas do grupo no sistema:
- FC ENGENHARIA (60002) — Construção civil
- HOTEL CONSAGRADO (60004) — Hotelaria
- LOCNOW (90001) — Locação de equipamentos`;

// ============================================================
// ROUTER
// ============================================================
export const oraculoRouter = router({

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(oraculoSessions)
        .where(eq(oraculoSessions.userId, ctx.user.id))
        .orderBy(desc(oraculoSessions.updatedAt))
        .limit(input.limit ?? 50);
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const [session] = await db.select().from(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      if (!session) return null;
      const messages = await db.select().from(oraculoMessages)
        .where(eq(oraculoMessages.sessionId, input.sessionId))
        .orderBy(asc(oraculoMessages.createdAt));
      return { session, messages };
    }),

  createSession: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [session] = await db.insert(oraculoSessions).values({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Admin",
        companyId: input.companyId ?? null,
        title: "Nova conversa",
        messageCount: 0,
      }).returning();
      return session;
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(oraculoMessages).where(eq(oraculoMessages.sessionId, input.sessionId));
      await db.delete(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      return { success: true };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      sessionId:  z.number(),
      message:    z.string().min(1).max(4000),
      companyId:  z.number().optional(),
      companyIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify session belongs to user
      const [session] = await db.select().from(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      // Get history BEFORE saving user message
      const history = await db.select().from(oraculoMessages)
        .where(eq(oraculoMessages.sessionId, input.sessionId))
        .orderBy(asc(oraculoMessages.createdAt))
        .limit(30);

      // Save user message
      await db.insert(oraculoMessages).values({
        sessionId: input.sessionId,
        role: "user",
        content: input.message,
      });

      // Build context snapshot
      const contextSnapshot = await buildContext(input.companyId ?? 0, input.companyIds);

      // Build messages for LLM
      const historyMessages = history.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const systemWithContext = `${SYSTEM_PROMPT}

SNAPSHOT DE DADOS EM TEMPO REAL:
\`\`\`json
${contextSnapshot}
\`\`\``;

      let aiResponse = "";
      try {
        const result = await invokeLLM({
          messages: [
            { role: "user", content: `[CONTEXTO DO SISTEMA]\n${systemWithContext}\n[/CONTEXTO]\n\n${history.length === 0 ? input.message : ""}` },
            ...(history.length === 0 ? [] : [
              { role: "assistant" as const, content: "Entendido. Estou pronta para analisar os dados da FC Engenharia." },
              ...historyMessages,
              { role: "user" as const, content: input.message },
            ]),
          ],
          maxTokens: 2000,
        });

        const content = result?.choices?.[0]?.message?.content;
        aiResponse = typeof content === "string" ? content : (Array.isArray(content) ? (content[0] as any)?.text ?? "" : "");
      } catch (e: any) {
        console.error("[ORÁCULO] LLM error:", e?.message);
        aiResponse = "Desculpe, tive um problema ao processar sua solicitação. Tente novamente em instantes.";
      }

      // Save assistant response
      await db.insert(oraculoMessages).values({
        sessionId: input.sessionId,
        role: "assistant",
        content: aiResponse,
      });

      // Update session title from first message and message count
      const newCount = history.length + 2;
      const shouldUpdateTitle = session.title === "Nova conversa" || session.messageCount === 0;
      const titleFromMsg = input.message.slice(0, 80).replace(/\n/g, " ");

      await db.update(oraculoSessions)
        .set({
          messageCount: newCount,
          updatedAt: new Date().toISOString(),
          ...(shouldUpdateTitle ? { title: titleFromMsg } : {}),
        })
        .where(eq(oraculoSessions.id, input.sessionId));

      return { response: aiResponse, sessionId: input.sessionId };
    }),

  tts: protectedProcedure
    .input(z.object({ text: z.string().max(5000) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) return { audio: null, fallback: true };

      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: input.text.slice(0, 4800) },
            voice: { languageCode: "pt-BR", name: "pt-BR-Neural2-C", ssmlGender: "FEMALE" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.05, pitch: 1.0 },
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("[ORÁCULO TTS] Google error:", err);
          return { audio: null, fallback: true };
        }
        const data = await res.json();
        return { audio: data.audioContent as string, fallback: false };
      } catch (e) {
        console.error("[ORÁCULO TTS] Error:", e);
        return { audio: null, fallback: true };
      }
    }),
});
