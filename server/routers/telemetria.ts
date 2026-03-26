import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function requireAdminMaster(ctx: any) {
  if (!ctx.user || ctx.user.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a Admin Master" });
  }
}

function resolveCompanyId(ctx: any, inputCompanyId?: number): number {
  const userCompanyId = ctx.user?.companyId ?? ctx.user?.company_id ?? 0;
  if (ctx.user?.role === "admin_master" && inputCompanyId && inputCompanyId > 0) {
    return inputCompanyId;
  }
  return userCompanyId > 0 ? userCompanyId : (inputCompanyId ?? 0);
}

export const telemetriaRouter = router({
  trackPageVisit: protectedProcedure
    .input(z.object({
      pagina: z.string().max(500),
      modulo: z.string().max(100).optional(),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = resolveCompanyId(ctx, input.companyId);
      if (cid <= 0) return { ok: true };
      try {
        const db = await getDb();
        await db.execute(sql`
          INSERT INTO user_activity_log (company_id, user_id, user_name, tipo, pagina, modulo)
          VALUES (
            ${cid},
            ${(ctx as any).user?.id ?? 0},
            ${(ctx as any).user?.name ?? ""},
            'page_visit',
            ${input.pagina},
            ${input.modulo ?? null}
          )
        `);
      } catch (e) {
        console.warn("[Telemetria] trackPageVisit erro:", (e as any)?.message ?? e);
      }
      return { ok: true };
    }),

  trackPageLeave: protectedProcedure
    .input(z.object({
      pagina: z.string().max(500),
      duracao_segundos: z.number().min(0).max(86400),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = resolveCompanyId(ctx, input.companyId);
      if (cid <= 0) return { ok: true };
      try {
        const db = await getDb();
        await db.execute(sql`
          UPDATE user_activity_log
          SET duracao_segundos = ${Math.round(input.duracao_segundos)}
          WHERE id = (
            SELECT id FROM user_activity_log
            WHERE user_id = ${(ctx as any).user?.id ?? 0}
              AND company_id = ${cid}
              AND pagina = ${input.pagina}
              AND tipo = 'page_visit'
            ORDER BY criado_em DESC
            LIMIT 1
          )
        `);
      } catch (e) {
        console.warn("[Telemetria] trackPageLeave erro:", (e as any)?.message ?? e);
      }
      return { ok: true };
    }),

  trackAction: protectedProcedure
    .input(z.object({
      pagina: z.string().max(500),
      acao: z.string().max(500),
      modulo: z.string().max(100).optional(),
      detalhes: z.string().max(2000).optional(),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = resolveCompanyId(ctx, input.companyId);
      if (cid <= 0) return { ok: true };
      try {
        const db = await getDb();
        await db.execute(sql`
          INSERT INTO user_activity_log (company_id, user_id, user_name, tipo, pagina, acao, modulo, detalhes)
          VALUES (
            ${cid},
            ${(ctx as any).user?.id ?? 0},
            ${(ctx as any).user?.name ?? ""},
            'action',
            ${input.pagina},
            ${input.acao},
            ${input.modulo ?? null},
            ${input.detalhes ?? null}
          )
        `);
      } catch (e) {
        console.warn("[Telemetria] trackAction erro:", (e as any)?.message ?? e);
      }
      return { ok: true };
    }),

  dashboardGeral: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      periodo: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
    }))
    .query(async ({ input, ctx }) => {
      requireAdminMaster(ctx);
      const db = await getDb();
      const cid = resolveCompanyId(ctx, input.companyId);
      const intervalMap: Record<string, string> = {
        "7d": "7 days", "30d": "30 days", "90d": "90 days", "all": "3650 days",
      };
      const interval = intervalMap[input.periodo];

      const [totalAcessos, usuariosAtivos, tempoMedio, paginasMaisAcessadas,
             rankingUsuarios, usoPorDia, usoPorHora, usoPorModulo,
             paginasSemAcesso, usuariosInativos] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*) as total FROM user_activity_log
          WHERE company_id = ${cid} AND tipo = 'page_visit'
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
        `),
        db.execute(sql`
          SELECT COUNT(DISTINCT user_id) as total FROM user_activity_log
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
        `),
        db.execute(sql`
          SELECT COALESCE(AVG(duracao_segundos), 0) as media FROM user_activity_log
          WHERE company_id = ${cid} AND tipo = 'page_visit'
            AND duracao_segundos > 0
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
        `),
        db.execute(sql`
          SELECT pagina, COUNT(*) as total,
                 COALESCE(AVG(duracao_segundos) FILTER (WHERE duracao_segundos > 0), 0) as tempo_medio
          FROM user_activity_log
          WHERE company_id = ${cid} AND tipo = 'page_visit'
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY pagina ORDER BY total DESC LIMIT 30
        `),
        db.execute(sql`
          SELECT user_id, user_name,
                 COUNT(*) FILTER (WHERE tipo = 'page_visit') as total_paginas,
                 COUNT(*) FILTER (WHERE tipo = 'action') as total_acoes,
                 COUNT(DISTINCT pagina) as paginas_distintas,
                 COALESCE(SUM(duracao_segundos) FILTER (WHERE duracao_segundos > 0), 0) as tempo_total,
                 MAX(criado_em) as ultimo_acesso
          FROM user_activity_log
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY user_id, user_name ORDER BY total_paginas DESC LIMIT 50
        `),
        db.execute(sql`
          SELECT DATE(criado_em) as dia, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid} AND tipo = 'page_visit'
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY DATE(criado_em) ORDER BY dia
        `),
        db.execute(sql`
          SELECT EXTRACT(HOUR FROM criado_em)::int as hora, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY hora ORDER BY hora
        `),
        db.execute(sql`
          SELECT modulo, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid} AND modulo IS NOT NULL
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY modulo ORDER BY total DESC
        `),
        db.execute(sql`
          SELECT pagina, MAX(criado_em) as ultimo_acesso,
                 COUNT(*) as total_historico
          FROM user_activity_log
          WHERE company_id = ${cid} AND tipo = 'page_visit'
          GROUP BY pagina
          HAVING MAX(criado_em) < NOW() - INTERVAL '30 days'
          ORDER BY ultimo_acesso ASC LIMIT 20
        `),
        db.execute(sql`
          SELECT user_id, user_name,
                 MAX(criado_em) as ultimo_acesso,
                 COUNT(*) as total_acessos
          FROM user_activity_log
          WHERE company_id = ${cid}
          GROUP BY user_id, user_name
          HAVING MAX(criado_em) < NOW() - INTERVAL '7 days'
          ORDER BY ultimo_acesso ASC
        `),
      ]);

      return {
        totalAcessos: Number((totalAcessos as any).rows?.[0]?.total ?? 0),
        usuariosAtivos: Number((usuariosAtivos as any).rows?.[0]?.total ?? 0),
        tempoMedio: Number((tempoMedio as any).rows?.[0]?.media ?? 0),
        paginasMaisAcessadas: (paginasMaisAcessadas as any).rows ?? [],
        rankingUsuarios: (rankingUsuarios as any).rows ?? [],
        usoPorDia: (usoPorDia as any).rows ?? [],
        usoPorHora: (usoPorHora as any).rows ?? [],
        usoPorModulo: (usoPorModulo as any).rows ?? [],
        paginasSemAcesso: (paginasSemAcesso as any).rows ?? [],
        usuariosInativos: (usuariosInativos as any).rows ?? [],
      };
    }),

  perfilUsuario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      userId: z.number(),
      periodo: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
    }))
    .query(async ({ input, ctx }) => {
      requireAdminMaster(ctx);
      const db = await getDb();
      const cid = resolveCompanyId(ctx, input.companyId);
      const intervalMap: Record<string, string> = {
        "7d": "7 days", "30d": "30 days", "90d": "90 days", "all": "3650 days",
      };
      const interval = intervalMap[input.periodo];

      const [info, paginas, acoes, porDia, porHora] = await Promise.all([
        db.execute(sql`
          SELECT user_name,
                 COUNT(*) FILTER (WHERE tipo = 'page_visit') as total_paginas,
                 COUNT(*) FILTER (WHERE tipo = 'action') as total_acoes,
                 COUNT(DISTINCT pagina) as paginas_distintas,
                 COALESCE(SUM(duracao_segundos) FILTER (WHERE duracao_segundos > 0), 0) as tempo_total,
                 MIN(criado_em) as primeiro_acesso,
                 MAX(criado_em) as ultimo_acesso
          FROM user_activity_log
          WHERE company_id = ${cid} AND user_id = ${input.userId}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY user_name
        `),
        db.execute(sql`
          SELECT pagina, COUNT(*) as total,
                 COALESCE(AVG(duracao_segundos) FILTER (WHERE duracao_segundos > 0), 0) as tempo_medio
          FROM user_activity_log
          WHERE company_id = ${cid} AND user_id = ${input.userId}
            AND tipo = 'page_visit'
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY pagina ORDER BY total DESC
        `),
        db.execute(sql`
          SELECT acao, pagina, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid} AND user_id = ${input.userId}
            AND tipo = 'action'
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY acao, pagina ORDER BY total DESC LIMIT 30
        `),
        db.execute(sql`
          SELECT DATE(criado_em) as dia, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid} AND user_id = ${input.userId}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY DATE(criado_em) ORDER BY dia
        `),
        db.execute(sql`
          SELECT EXTRACT(HOUR FROM criado_em)::int as hora, COUNT(*) as total
          FROM user_activity_log
          WHERE company_id = ${cid} AND user_id = ${input.userId}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY hora ORDER BY hora
        `),
      ]);

      return {
        info: (info as any).rows?.[0] ?? null,
        paginas: (paginas as any).rows ?? [],
        acoes: (acoes as any).rows ?? [],
        porDia: (porDia as any).rows ?? [],
        porHora: (porHora as any).rows ?? [],
      };
    }),

  analyticsIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      periodo: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
    }))
    .query(async ({ input, ctx }) => {
      requireAdminMaster(ctx);
      const db = await getDb();
      const cid = resolveCompanyId(ctx, input.companyId);
      const intervalMap: Record<string, string> = {
        "7d": "7 days", "30d": "30 days", "90d": "90 days", "all": "3650 days",
      };
      const interval = intervalMap[input.periodo];

      const [total, porModulo, porUsuario, porDia, ultimasPerguntas] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*) as total FROM ia_modulo_conversas
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
        `),
        db.execute(sql`
          SELECT modulo, COUNT(*) as total
          FROM ia_modulo_conversas
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY modulo ORDER BY total DESC
        `),
        db.execute(sql`
          SELECT user_name, user_id, COUNT(*) as total, MAX(criado_em) as ultimo_uso
          FROM ia_modulo_conversas
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY user_name, user_id ORDER BY total DESC
        `),
        db.execute(sql`
          SELECT DATE(criado_em) as dia, COUNT(*) as total
          FROM ia_modulo_conversas
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY DATE(criado_em) ORDER BY dia
        `),
        db.execute(sql`
          SELECT id, user_name, modulo, pergunta, resposta, criado_em
          FROM ia_modulo_conversas
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - CAST(${interval} AS INTERVAL)
          ORDER BY criado_em DESC LIMIT 100
        `),
      ]);

      return {
        totalConsultas: Number((total as any).rows?.[0]?.total ?? 0),
        porModulo: (porModulo as any).rows ?? [],
        porUsuario: (porUsuario as any).rows ?? [],
        porDia: (porDia as any).rows ?? [],
        ultimasPerguntas: (ultimasPerguntas as any).rows ?? [],
      };
    }),

  historicoCompleto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      userId: z.number().optional(),
      pagina: z.string().optional(),
      modulo: z.string().optional(),
      tipo: z.enum(["page_visit", "action", "all"]).default("all"),
      limite: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      requireAdminMaster(ctx);
      const db = await getDb();
      const cid = resolveCompanyId(ctx, input.companyId);

      let query = sql`
        SELECT id, user_id, user_name, tipo, pagina, acao, modulo, detalhes, duracao_segundos, criado_em
        FROM user_activity_log
        WHERE company_id = ${cid}
      `;
      if (input.userId) query = sql`${query} AND user_id = ${input.userId}`;
      if (input.pagina) query = sql`${query} AND pagina ILIKE ${'%' + input.pagina + '%'}`;
      if (input.modulo) query = sql`${query} AND modulo = ${input.modulo}`;
      if (input.tipo !== "all") query = sql`${query} AND tipo = ${input.tipo}`;
      query = sql`${query} ORDER BY criado_em DESC LIMIT ${input.limite} OFFSET ${input.offset}`;

      const rows = await db.execute(query);
      return (rows as any).rows ?? [];
    }),

  scoreEngajamento: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminMaster(ctx);
      const db = await getDb();
      const cid = resolveCompanyId(ctx, input.companyId);
      const rows = await db.execute(sql`
        WITH user_stats AS (
          SELECT
            user_id, user_name,
            COUNT(*) FILTER (WHERE tipo = 'page_visit') as visitas,
            COUNT(*) FILTER (WHERE tipo = 'action') as acoes,
            COUNT(DISTINCT pagina) as paginas_unicas,
            COUNT(DISTINCT DATE(criado_em)) as dias_ativos,
            COALESCE(SUM(duracao_segundos) FILTER (WHERE duracao_segundos > 0), 0) as tempo_total,
            MAX(criado_em) as ultimo_acesso
          FROM user_activity_log
          WHERE company_id = ${cid}
            AND criado_em >= NOW() - INTERVAL '30 days'
          GROUP BY user_id, user_name
        )
        SELECT *,
          LEAST(100, (
            LEAST(dias_ativos * 3, 30) +
            LEAST(paginas_unicas * 2, 20) +
            LEAST(visitas / 5, 20) +
            LEAST(acoes / 3, 15) +
            LEAST(tempo_total / 3600, 15)
          )) as score
        FROM user_stats
        ORDER BY score DESC
      `);
      return (rows as any).rows ?? [];
    }),
});
