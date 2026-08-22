/**
 * gestaoInterna — Dashboard Executivo de Gestão Interna (Rev. gestaoInterna-v2)
 *
 * Endpoint único: gestaoInterna.dashboard
 * Retorna KPIs agregados por empresa(s) e opcionalmente por obra.
 * NUNCA retorna: nomes de pessoas, CID, motivos, descrições médicas,
 *   valores financeiros, orçamento/custo/saldo/CPI.
 *
 * Colunas verificadas contra Neon (snake_case / camelCase real por tabela):
 *   dds_sessoes         → snake_case (company_id, obra_id, deleted_at)
 *   dds_sessao_funcionarios → snake_case (sessao_id, employee_id)
 *   accidents           → misto: companyId/employeeId/dataAcidente/gravidade camel,
 *                         obra_id/deleted_at snake
 *   planejamento_avancos  → snake_case (projeto_id, atividade_id, revisao_id,
 *                           percentual_acumulado, criado_em)
 *   planejamento_refis    → snake_case (avanco_previsto, avanco_realizado, status)
 *   obra_funcionarios   → camelCase (obraId, employeeId, companyId, isActive,
 *                         dataInicio, dataFim)
 *   time_records        → camelCase (companyId, employeeId, obraId,
 *                         horasTrabalhadas, faltas)
 *   compras_ordens      → snake_case (company_id, obra_id, cotacao_id,
 *                         solicitacao_id, created_at, status)
 *   compras_cotacoes    → snake_case (company_id, solicitacao_id, obra_id, created_at)
 *   compras_solicitacoes → snake_case (company_id, obra_id, status, created_at)
 *   compras_entregas_programadas → snake_case (ordem_item_id, data_entrega, status)
 *   compras_ordens_itens → snake_case (ordem_id)
 *   planejamento_projetos → snake_case (company_id, obra_id, previsto_semanas_json,
 *                           data_corte_atual)
 *   planejamento_revisoes → snake_case (projeto_id, status, numero)
 *   planejamento_atividades → snake_case (revisao_id, is_grupo, is_marco,
 *                             disabled, data_inicio, data_fim, data_fim_real)
 *   obras               → camelCase (companyId, dataPrevisaoFim, deletedAt, isActive)
 *   atestados           → camelCase (companyId, employeeId, dataEmissao, deletedAt)
 *   warnings            → camelCase (companyId, employeeId, dataOcorrencia, deletedAt)
 */
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getCompaniesForUser,
  getDb,
  getEffectiveAllowedObraIds,
  userCanViewModulePage,
} from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { emptyGestaoInternaDashboard } from "./gestaoInternaEmpty";

// ─── ACL helpers (padrão canônico — memory: company-access-guard.md) ───────

async function assertCompaniesAccess(
  user: { id: number; role?: string | null },
  companyIds: number[],
): Promise<void> {
  const role = user?.role;
  if (role === "admin" || role === "admin_master") return;

  const allowed = new Set(
    (await getCompaniesForUser(user.id, role ?? "user"))
      .map((company: any) => Number(company.id))
      .filter(Number.isFinite),
  );
  if (companyIds.some((companyId) => !allowed.has(companyId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

async function assertModuleEnabled(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, companyIds: number[]) {
  const configRows = rows(await db.execute(sql`
    SELECT
      "companyId" AS company_id,
      enabled,
      disabled_pages
    FROM module_config
    WHERE "companyId" IN (${sql.raw(companyIds.join(","))})
      AND module_key = 'gestao-interna'
  `));

  for (const config of configRows) {
    let disabledPages: string[] = [];
    try {
      disabledPages = JSON.parse(String(config.disabled_pages ?? "[]"));
    } catch {}
    if (Number(config.enabled) === 0 || disabledPages.includes("/gestao-interna")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "O módulo Gestão Interna está desabilitado." });
    }
  }
}

// ─── Helpers de datas ────────────────────────────────────────────────────────

function hojeStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function segundaFeira(ref: string): string {
  const d = new Date(`${ref}T12:00:00Z`);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getTime() + diff * 86_400_000);
  return m.toISOString().slice(0, 10);
}

function addDays(ref: string, n: number): string {
  const d = new Date(`${ref}T12:00:00Z`);
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

function inicioMes(ref: string): string {
  return ref.slice(0, 7) + "-01";
}

// ─── Safe error message (ponto 9) ────────────────────────────────────────────
// Log completo no servidor, devolve mensagem genérica ao cliente.
function safeErrorMsg(ctx: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[gestaoInterna.dashboard] ${ctx}: ${msg}`);
  return `Erro ao carregar ${ctx}. Contacte o suporte se persistir.`;
}

// ─── Rows helper ────────────────────────────────────────────────────────────
function rows(r: unknown): any[] {
  return (r as any).rows ?? (r as any[]) ?? [];
}

/**
 * time_records guarda duração em formatos mistos ("9:04", "9", "9,5").
 * Nunca faça CAST direto: além de falhar em HH:MM, uma falha aqui não pode
 * transformar uma ausência em presença no painel.
 */
function hasPositiveDuration(column: string): string {
  const value = `TRIM(COALESCE(${column}, ''))`;
  return `CASE
    WHEN ${value} = '' THEN false
    WHEN ${value} ~ '^[0-9]+:[0-9]+$'
      THEN split_part(${value}, ':', 1)::integer > 0
        OR split_part(${value}, ':', 2)::integer > 0
    WHEN ${value} ~ '^[0-9]+([,.][0-9]+)?$'
      THEN REPLACE(${value}, ',', '.')::numeric > 0
    ELSE false
  END`;
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const dashboardInput = z.object({
  companyIds: z.array(z.number().int().positive()).min(1),
  obraId: z.number().int().positive().nullish(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const gestaoInternaRouter = router({
  dashboard: protectedProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => {
      // Central executiva exibida em TV: acesso exclusivo do Admin Master.
      // A proteção precisa existir no servidor; ocultar o card no Hub não basta.
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "A Gestão Interna é exclusiva do Admin Master." });
      }
      // 1. Validar CADA companyId (padrão canônico)
      await assertCompaniesAccess(ctx.user, input.companyIds);
      if (!await userCanViewModulePage(
        ctx.user.id,
        ctx.user.role,
        "gestao-interna",
        "gestao_interna",
        "/gestao-interna",
      )) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso ao módulo Gestão Interna." });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados indisponível.",
        });
      }
      await assertModuleEnabled(db, input.companyIds);

      // Todos validados como inteiros positivos — safe para sql.raw
      const idsLiteral = input.companyIds.map(Number).join(",");
      const allowedObraIds = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (Array.isArray(allowedObraIds) && allowedObraIds.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a obras para esta central." });
      }
      const allowedObraCondition = Array.isArray(allowedObraIds)
        ? `AND id IN (${allowedObraIds.map(Number).join(",")})`
        : "";

      // 2. Janelas temporais
      const hoje = hojeStr();
      const weekStart = segundaFeira(hoje);
      const weekEnd = hoje;
      const prevWeekStart = addDays(weekStart, -7);
      const prevWeekEnd = addDays(weekStart, -1);
      const monthStart = inicioMes(hoje);
      const yearStart = `${hoje.slice(0, 4)}-01-01`;
      const in7Days = addDays(hoje, 7);

      const period = {
        today: hoje,
        weekStart,
        weekEnd,
        previousWeekStart: prevWeekStart,
        previousWeekEnd: prevWeekEnd,
        monthStart,
        yearStart,
      };

      // 3. Validar obraId (ownership) se informado
      let obraIdFilter: number | null = null;
      const activeObraCondition = `
        AND COALESCE("isActive", 1) = 1
        AND LOWER(REPLACE(COALESCE(status, ''), ' ', '_')) = 'em_andamento'
        ${allowedObraCondition}
      `;
      if (input.obraId) {
        // Só uma obra ativa/em andamento pode ser selecionada nesta central.
        const obraCheck = await db.execute(sql`
          SELECT id FROM obras
          WHERE id = ${input.obraId}
            AND "companyId" IN (${sql.raw(idsLiteral)})
            AND "deletedAt" IS NULL
            ${sql.raw(activeObraCondition)}
          LIMIT 1
        `);
        if (rows(obraCheck).length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Obra não está ativa ou não pertence a uma das empresas solicitadas.",
          });
        }
        obraIdFilter = input.obraId;
      }

      // Fragmentos SQL reutilizáveis. Gestão Interna mostra exclusivamente
      // obras ativas/em andamento; concluídas, canceladas e inativas não entram
      // em nenhum card, radar, filtro ou gráfico.
      const obraWhereBase = obraIdFilter != null
        ? `${activeObraCondition} AND id = ${obraIdFilter}`
        : activeObraCondition;

      // 4. Lista de obras (com dataPrevisaoFim para o radar)
      // obras: camelCase — companyId, deletedAt, isActive, dataPrevisaoFim, status
      const obrasQ = await db.execute(sql`
        SELECT id, nome, "companyId", status, "dataPrevisaoFim"
        FROM obras
        WHERE "companyId" IN (${sql.raw(idsLiteral)})
          AND "deletedAt" IS NULL
          ${sql.raw(obraWhereBase)}
        ORDER BY nome
      `);
      const obras: Array<{
        id: number; nome: string; companyId: number; status: string;
        dataPrevisaoFim: string | null;
      }> = rows(obrasQ).map((r: any) => ({
        id: Number(r.id),
        nome: String(r.nome ?? ""),
        companyId: Number(r.companyId ?? r.company_id),
        status: String(r.status ?? ""),
        dataPrevisaoFim: r.dataPrevisaoFim ? String(r.dataPrevisaoFim).slice(0, 10) : null,
      }));

      // Resposta pública não inclui dataPrevisaoFim (usado internamente para radar)
      const obrasPublic = obras.map(({ id, nome, companyId, status }) => ({ id, nome, companyId, status }));

      const obraIds = obras.map((o) => o.id);
      const obraIdsLiteral = obraIds.length > 0 ? obraIds.join(",") : "0";
      const obraInClause = obraIds.length > 0 ? `AND obra_id IN (${obraIdsLiteral})` : "";
      // obra_funcionarios usa camelCase
      const obraInClauseCamel = obraIds.length > 0 ? `AND "obraId" IN (${obraIdsLiteral})` : "";

      // Fail closed: nenhuma obra ATIVA dentro do escopo autorizado significa
      // nenhum dado operacional. Não remova filtros condicionais e não consulte
      // agregados da empresa inteira, pois isso vazaria métricas de obras irmãs.
      if (obraIds.length === 0) {
        return emptyGestaoInternaDashboard(period);
      }

      // ── Headline ─────────────────────────────────────────────────────────

      // Obras ativas / atrasadas — tudo em camelCase (obras table)
      let obrasAtivas = 0;
      let obrasAtrasadas = 0;
      try {
        const hObraQ = await db.execute(sql`
          SELECT
            COUNT(*) AS ativas,
            COUNT(*) FILTER (
              WHERE "dataPrevisaoFim" IS NOT NULL
              AND "dataPrevisaoFim" < ${hoje}
            ) AS atrasadas
          FROM obras
          WHERE "companyId" IN (${sql.raw(idsLiteral)})
            AND "deletedAt" IS NULL
            ${sql.raw(obraWhereBase)}
        `);
        const hr = rows(hObraQ)[0] ?? {};
        obrasAtivas = Number(hr.ativas ?? 0);
        obrasAtrasadas = Number(hr.atrasadas ?? 0);
      } catch (e) { safeErrorMsg("obras headline", e); }

      // Colaboradores ativos — employees camelCase (companyId, deletedAt, status)
      let colaboradoresAtivos = 0;
      try {
        const hEmpQ = await db.execute(sql`
          SELECT COUNT(DISTINCT e.id) AS n
          FROM employees e
          JOIN obra_funcionarios of2
            ON of2."employeeId" = e.id
           AND of2."companyId" = e."companyId"
           AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
           AND of2."isActive" = 1
           AND (of2."dataFim" IS NULL OR of2."dataFim" >= ${hoje})
           AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= ${hoje})
          WHERE e."companyId" IN (${sql.raw(idsLiteral)})
            AND e."deletedAt" IS NULL
            AND e.status NOT IN ('Desligado','Lista_Negra')
        `);
        colaboradoresAtivos = Number(rows(hEmpQ)[0]?.n ?? 0);
      } catch (e) { safeErrorMsg("colaboradores ativos", e); }

      // Alocados hoje — obra_funcionarios camelCase (obraId, companyId, employeeId, isActive, dataInicio, dataFim)
      let alocadosHoje = 0;
      try {
        const hAlocQ = await db.execute(sql`
          SELECT COUNT(DISTINCT "employeeId") AS n
          FROM obra_funcionarios
          WHERE "companyId" IN (${sql.raw(idsLiteral)})
            AND "isActive" = 1
            ${sql.raw(obraInClauseCamel)}
            AND ("dataFim" IS NULL OR "dataFim" >= ${hoje})
            AND ("dataInicio" IS NULL OR "dataInicio" <= ${hoje})
        `);
        alocadosHoje = Number(rows(hAlocQ)[0]?.n ?? 0);
      } catch (e) { safeErrorMsg("alocados hoje", e); }

      // Presentes DDS hoje — dds_sessoes snake_case + dds_sessao_funcionarios snake_case
      let presentesDdsHoje = 0;
      try {
        const hDdsQ = await db.execute(sql`
          SELECT COUNT(DISTINCT sf.employee_id) AS n
          FROM dds_sessao_funcionarios sf
          JOIN dds_sessoes s ON s.id = sf.sessao_id
          WHERE s.company_id IN (${sql.raw(idsLiteral)})
            AND s.data = ${hoje}
            AND s.deleted_at IS NULL
            AND sf.presente = 1
            ${sql.raw(obraIds.length > 0 ? `AND s.obra_id IN (${obraIdsLiteral})` : "")}
        `);
        presentesDdsHoje = Number(rows(hDdsQ)[0]?.n ?? 0);
      } catch (e) { safeErrorMsg("presentes DDS", e); }

      const possiveisAusenciasDdsHoje = Math.max(0, alocadosHoje - presentesDdsHoje);

      // Faltas hoje — time_records camelCase (companyId, employeeId, obraId, horasTrabalhadas, faltas, data)
      let faltasHoje = 0;
      try {
        const hFaltaQ = await db.execute(sql`
          WITH ponto_dia AS (
            SELECT
              tr."employeeId",
              BOOL_OR(${sql.raw(hasPositiveDuration('tr."horasTrabalhadas"'))}) AS tem_horas
            FROM time_records tr
            WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
              AND tr.data = ${hoje}
            GROUP BY tr."employeeId"
          ),
          falta_no_escopo AS (
            SELECT DISTINCT tr."employeeId"
            FROM time_records tr
            WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
              AND tr.data = ${hoje}
              AND tr."obraId" IN (${sql.raw(obraIdsLiteral)})
              AND ${sql.raw(hasPositiveDuration("tr.faltas"))}
          )
          SELECT COUNT(*) AS n
          FROM falta_no_escopo f
          JOIN ponto_dia p ON p."employeeId" = f."employeeId"
          WHERE NOT p.tem_horas
        `);
        faltasHoje = Number(rows(hFaltaQ)[0]?.n ?? 0);
      } catch (e) { safeErrorMsg("faltas hoje", e); }

      // Compras pendentes / entregas atrasadas — todas snake_case
      let comprasPendentes = 0;
      let entregasAtrasadasHeadline = 0;
      try {
        const hCpQ = await db.execute(sql`
          SELECT COUNT(*) AS n
          FROM compras_solicitacoes
          WHERE company_id IN (${sql.raw(idsLiteral)})
            AND status NOT IN ('cancelada','cancelado','concluida','concluido','entregue')
            ${sql.raw(obraIds.length > 0 ? `AND obra_id IN (${obraIdsLiteral})` : "")}
        `);
        comprasPendentes = Number(rows(hCpQ)[0]?.n ?? 0);

        const hEntQ = await db.execute(sql`
          SELECT COUNT(*) AS n
          FROM compras_entregas_programadas ep
          JOIN compras_ordens_itens oi ON oi.id = ep.ordem_item_id
          JOIN compras_ordens o ON o.id = oi.ordem_id
          WHERE o.company_id IN (${sql.raw(idsLiteral)})
            AND ep.status NOT IN ('entregue','cancelado','cancelada')
            AND ep.data_entrega < ${hoje}
            ${sql.raw(obraIds.length > 0 ? `AND o.obra_id IN (${obraIdsLiteral})` : "")}
        `);
        entregasAtrasadasHeadline = Number(rows(hEntQ)[0]?.n ?? 0);
      } catch (e) { safeErrorMsg("compras headline", e); }

      const headline = {
        obrasAtivas,
        obrasAtrasadas,
        colaboradoresAtivos,
        alocadosHoje,
        presentesDdsHoje,
        possiveisAusenciasDdsHoje,
        faltasHoje,
        comprasPendentes,
        entregasAtrasadas: entregasAtrasadasHeadline,
      };

      // ── Pessoas — semana ────────────────────────────────────────────────

      // faltas semana: time_records camelCase
      // atestados: atestados camelCase (companyId, employeeId, dataEmissao, deletedAt)
      // warnings: camelCase (companyId, employeeId, dataOcorrencia, deletedAt)
      // accidents: misto — companyId/dataAcidente/gravidade camel, obra_id/deleted_at snake
      // employees: camelCase (companyId, dataAdmissao, dataDemissao, deletedAt)
      // obra_funcionarios: camelCase (companyId, dataInicio)

      let pessoasSemana = {
        faltas: 0, atestados: 0, advertencias: 0, acidentes: 0,
        acidentesGraves: 0, admissoes: 0, demissoes: 0, movimentacoes: 0,
      };
      let saudePeriodos = {
        atestados: { semana: 0, mes: 0, ano: 0 },
        acidentes: { semana: 0, mes: 0, ano: 0 },
      };
      try {
        const [faltasR, atesR, advR, acidR, acidGravR, admR, demR, movR] = await Promise.all([
          // Faltas semana (dist employee+data, zero horas + falta>0)
          db.execute(sql`
            WITH ponto_dia AS (
              SELECT
                tr."employeeId",
                tr.data,
                BOOL_OR(${sql.raw(hasPositiveDuration('tr."horasTrabalhadas"'))}) AS tem_horas
              FROM time_records tr
              WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
                AND tr.data BETWEEN ${weekStart} AND ${weekEnd}
              GROUP BY tr."employeeId", tr.data
            ),
            falta_no_escopo AS (
              SELECT DISTINCT tr."employeeId", tr.data
              FROM time_records tr
              WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
                AND tr.data BETWEEN ${weekStart} AND ${weekEnd}
                AND tr."obraId" IN (${sql.raw(obraIdsLiteral)})
                AND ${sql.raw(hasPositiveDuration("tr.faltas"))}
            )
            SELECT COUNT(*) AS n
            FROM falta_no_escopo f
            JOIN ponto_dia p
              ON p."employeeId" = f."employeeId"
             AND p.data = f.data
            WHERE NOT p.tem_horas
          `),
          // Atestados (camelCase)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM atestados
            WHERE atestados."companyId" IN (${sql.raw(idsLiteral)})
              AND atestados."deletedAt" IS NULL
              AND atestados."dataEmissao" BETWEEN ${weekStart} AND ${weekEnd}
              AND EXISTS (
                SELECT 1
                FROM obra_funcionarios of2
                WHERE of2."employeeId" = atestados."employeeId"
                  AND of2."companyId" = atestados."companyId"
                  AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                  AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= atestados."dataEmissao")
                  AND (of2."dataFim" IS NULL OR of2."dataFim" >= atestados."dataEmissao")
              )
          `),
          // Advertências (camelCase)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM warnings
            WHERE warnings."companyId" IN (${sql.raw(idsLiteral)})
              AND warnings."deletedAt" IS NULL
              AND warnings."dataOcorrencia" BETWEEN ${weekStart} AND ${weekEnd}
              AND EXISTS (
                SELECT 1
                FROM obra_funcionarios of2
                WHERE of2."employeeId" = warnings."employeeId"
                  AND of2."companyId" = warnings."companyId"
                  AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                  AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= warnings."dataOcorrencia")
                  AND (of2."dataFim" IS NULL OR of2."dataFim" >= warnings."dataOcorrencia")
              )
          `),
          // Acidentes totais (misto: companyId camel, deleted_at snake)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM accidents
            WHERE "companyId" IN (${sql.raw(idsLiteral)})
              AND deleted_at IS NULL
              AND "dataAcidente" BETWEEN ${weekStart} AND ${weekEnd}
              AND obra_id IN (${sql.raw(obraIdsLiteral)})
          `),
          // Acidentes graves (misto)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM accidents
            WHERE "companyId" IN (${sql.raw(idsLiteral)})
              AND deleted_at IS NULL
              AND "dataAcidente" BETWEEN ${weekStart} AND ${weekEnd}
              AND gravidade IN ('Grave','Gravíssimo','Fatal')
              AND obra_id IN (${sql.raw(obraIdsLiteral)})
          `),
          // Admissões (camelCase)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM employees e
            WHERE e."companyId" IN (${sql.raw(idsLiteral)})
              AND e."deletedAt" IS NULL
              AND e."dataAdmissao" BETWEEN ${weekStart} AND ${weekEnd}
              AND EXISTS (
                SELECT 1
                FROM obra_funcionarios of2
                WHERE of2."employeeId" = e.id
                  AND of2."companyId" = e."companyId"
                  AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                  AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= e."dataAdmissao")
                  AND (of2."dataFim" IS NULL OR of2."dataFim" >= e."dataAdmissao")
              )
          `),
          // Demissões (camelCase)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM employees e
            WHERE e."companyId" IN (${sql.raw(idsLiteral)})
              AND e."deletedAt" IS NULL
              AND e."dataDemissao" BETWEEN ${weekStart} AND ${weekEnd}
              AND EXISTS (
                SELECT 1
                FROM obra_funcionarios of2
                WHERE of2."employeeId" = e.id
                  AND of2."companyId" = e."companyId"
                  AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                  AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= e."dataDemissao")
                  AND (of2."dataFim" IS NULL OR of2."dataFim" >= e."dataDemissao")
              )
          `),
          // Movimentações (novas alocações na semana, camelCase)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM obra_funcionarios
            WHERE "companyId" IN (${sql.raw(idsLiteral)})
              AND "dataInicio" BETWEEN ${weekStart} AND ${weekEnd}
              AND "obraId" IN (${sql.raw(obraIdsLiteral)})
          `),
        ]);

        pessoasSemana = {
          faltas: Number(rows(faltasR)[0]?.n ?? 0),
          atestados: Number(rows(atesR)[0]?.n ?? 0),
          advertencias: Number(rows(advR)[0]?.n ?? 0),
          acidentes: Number(rows(acidR)[0]?.n ?? 0),
          acidentesGraves: Number(rows(acidGravR)[0]?.n ?? 0),
          admissoes: Number(rows(admR)[0]?.n ?? 0),
          demissoes: Number(rows(demR)[0]?.n ?? 0),
          movimentacoes: Number(rows(movR)[0]?.n ?? 0),
        };
      } catch (e) { safeErrorMsg("pessoas semana", e); }

      // Saúde e segurança em três janelas — sempre limitada às obras visíveis.
      // Atestados usam a alocação válida na data do documento; acidentes já
      // carregam a obra de ocorrência no próprio registro.
      try {
        const [atestadosPeriodosQ, acidentesPeriodosQ] = await Promise.all([
          db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE a."dataEmissao"::date BETWEEN ${weekStart} AND ${weekEnd}) AS semana,
              COUNT(*) FILTER (WHERE a."dataEmissao"::date BETWEEN ${monthStart} AND ${weekEnd}) AS mes,
              COUNT(*) AS ano
            FROM atestados a
            WHERE a."companyId" IN (${sql.raw(idsLiteral)})
              AND a."deletedAt" IS NULL
              AND a."dataEmissao"::date BETWEEN ${yearStart} AND ${weekEnd}
              AND EXISTS (
                SELECT 1
                FROM obra_funcionarios of2
                WHERE of2."employeeId" = a."employeeId"
                  AND of2."companyId" = a."companyId"
                  AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                  AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= a."dataEmissao"::date)
                  AND (of2."dataFim" IS NULL OR of2."dataFim" >= a."dataEmissao"::date)
              )
          `),
          db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE "dataAcidente"::date BETWEEN ${weekStart} AND ${weekEnd}) AS semana,
              COUNT(*) FILTER (WHERE "dataAcidente"::date BETWEEN ${monthStart} AND ${weekEnd}) AS mes,
              COUNT(*) AS ano
            FROM accidents
            WHERE "companyId" IN (${sql.raw(idsLiteral)})
              AND deleted_at IS NULL
              AND obra_id IN (${sql.raw(obraIdsLiteral)})
              AND "dataAcidente"::date BETWEEN ${yearStart} AND ${weekEnd}
          `),
        ]);
        const at = rows(atestadosPeriodosQ)[0] ?? {};
        const ac = rows(acidentesPeriodosQ)[0] ?? {};
        saudePeriodos = {
          atestados: { semana: Number(at.semana ?? 0), mes: Number(at.mes ?? 0), ano: Number(at.ano ?? 0) },
          acidentes: { semana: Number(ac.semana ?? 0), mes: Number(ac.mes ?? 0), ano: Number(ac.ano ?? 0) },
        };
      } catch (e) { safeErrorMsg("saúde por período", e); }

      // ── Pessoas por obra ────────────────────────────────────────────────
      // Atestados/advertências por obra: join com obra_funcionarios ativa
      // (aceito como cobertura parcial — duplicação possível para multi-alocação).
      // Zero PII: somente contagens.

      let pessoasPorObra: Array<{
        obraId: number; obraNome: string;
        alocadosHoje: number; equipePropria: number; terceiros: number; efetivoTotal: number;
        presentesDdsHoje: number; possiveisAusenciasDdsHoje: number;
        faltasSemana: number; atestadosSemana: number; advertenciasSemana: number; acidentesSemana: number;
      }> = [];

      if (obraIds.length > 0) {
        try {
          const porObraQ = await db.execute(sql`
            WITH obra_lista AS (
              SELECT id, nome FROM obras
              WHERE id IN (${sql.raw(obraIdsLiteral)})
                AND "companyId" IN (${sql.raw(idsLiteral)})
            ),
            aloc AS (
              SELECT of2."obraId", COUNT(DISTINCT e.id) AS n
              FROM obra_funcionarios of2
              JOIN employees e
                ON e.id = of2."employeeId"
               AND e."companyId" = of2."companyId"
              WHERE of2."companyId" IN (${sql.raw(idsLiteral)})
                AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
                AND of2."isActive" = 1
                AND (of2."dataFim" IS NULL OR of2."dataFim" >= ${hoje})
                AND (of2."dataInicio" IS NULL OR of2."dataInicio" <= ${hoje})
                AND e."deletedAt" IS NULL
                AND e.status NOT IN ('Desligado','Lista_Negra','Inativo')
              GROUP BY of2."obraId"
            ),
            terc AS (
              SELECT ft."obraId", COUNT(DISTINCT ft.id) AS n
              FROM funcionarios_terceiros ft
              WHERE ft."companyId" IN (${sql.raw(idsLiteral)})
                AND ft."obraId" IN (${sql.raw(obraIdsLiteral)})
                AND ft.status <> 'inativo'
                AND ft.deleted_at IS NULL
              GROUP BY ft."obraId"
            ),
            dds_pres AS (
              SELECT s.obra_id, COUNT(DISTINCT sf.employee_id) AS n
              FROM dds_sessao_funcionarios sf
              JOIN dds_sessoes s ON s.id = sf.sessao_id
              WHERE s.company_id IN (${sql.raw(idsLiteral)})
                AND s.obra_id IN (${sql.raw(obraIdsLiteral)})
                AND s.data = ${hoje}
                AND s.deleted_at IS NULL
                AND sf.presente = 1
              GROUP BY s.obra_id
            ),
            ponto_dia AS (
              SELECT
                tr."employeeId",
                tr.data,
                BOOL_OR(${sql.raw(hasPositiveDuration('tr."horasTrabalhadas"'))}) AS tem_horas
              FROM time_records tr
              WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
                AND tr.data BETWEEN ${weekStart} AND ${weekEnd}
              GROUP BY tr."employeeId", tr.data
            ),
            faltas_obra AS (
              SELECT
                tr."obraId",
                COUNT(DISTINCT (tr."employeeId", tr.data)) AS n
              FROM time_records tr
              JOIN ponto_dia pd
                ON pd."employeeId" = tr."employeeId"
               AND pd.data = tr.data
              WHERE tr."companyId" IN (${sql.raw(idsLiteral)})
                AND tr."obraId" IN (${sql.raw(obraIdsLiteral)})
                AND tr.data BETWEEN ${weekStart} AND ${weekEnd}
                AND ${sql.raw(hasPositiveDuration("tr.faltas"))}
                AND NOT pd.tem_horas
              GROUP BY tr."obraId"
            ),
            ates_obra AS (
              -- Cobertura parcial: atestado vinculado à obra corrente do funcionário (alocação ativa)
              SELECT of2."obraId", COUNT(DISTINCT a.id) AS n
              FROM atestados a
              JOIN obra_funcionarios of2 ON of2."employeeId" = a."employeeId"
                AND of2."companyId" = a."companyId"
                AND of2."isActive" = 1
              WHERE a."companyId" IN (${sql.raw(idsLiteral)})
                AND a."deletedAt" IS NULL
                AND a."dataEmissao" BETWEEN ${weekStart} AND ${weekEnd}
                AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
              GROUP BY of2."obraId"
            ),
            adv_obra AS (
              -- Cobertura parcial: advertência vinculada à obra corrente
              SELECT of2."obraId", COUNT(DISTINCT w.id) AS n
              FROM warnings w
              JOIN obra_funcionarios of2 ON of2."employeeId" = w."employeeId"
                AND of2."companyId" = w."companyId"
                AND of2."isActive" = 1
              WHERE w."companyId" IN (${sql.raw(idsLiteral)})
                AND w."deletedAt" IS NULL
                AND w."dataOcorrencia" BETWEEN ${weekStart} AND ${weekEnd}
                AND of2."obraId" IN (${sql.raw(obraIdsLiteral)})
              GROUP BY of2."obraId"
            ),
            acid_obra AS (
              -- accidents: obra_id é snake_case; companyId e dataAcidente são camelCase
              SELECT obra_id, COUNT(*) AS n
              FROM accidents
              WHERE "companyId" IN (${sql.raw(idsLiteral)})
                AND deleted_at IS NULL
                AND "dataAcidente" BETWEEN ${weekStart} AND ${weekEnd}
                AND obra_id IN (${sql.raw(obraIdsLiteral)})
              GROUP BY obra_id
            )
            SELECT
              ol.id    AS obra_id,
              ol.nome  AS obra_nome,
              COALESCE(aloc.n, 0)::int       AS alocados,
              COALESCE(terc.n, 0)::int       AS terceiros,
              COALESCE(dds_pres.n, 0)::int   AS presentes_dds,
              COALESCE(faltas_obra.n, 0)::int AS faltas,
              COALESCE(ates_obra.n, 0)::int   AS atestados,
              COALESCE(adv_obra.n, 0)::int    AS advertencias,
              COALESCE(acid_obra.n, 0)::int   AS acidentes
            FROM obra_lista ol
            LEFT JOIN aloc        ON aloc."obraId"    = ol.id
            LEFT JOIN terc        ON terc."obraId"    = ol.id
            LEFT JOIN dds_pres    ON dds_pres.obra_id = ol.id
            LEFT JOIN faltas_obra ON faltas_obra."obraId" = ol.id
            LEFT JOIN ates_obra   ON ates_obra."obraId"   = ol.id
            LEFT JOIN adv_obra    ON adv_obra."obraId"    = ol.id
            LEFT JOIN acid_obra   ON acid_obra.obra_id    = ol.id
            ORDER BY ol.nome
          `);

          pessoasPorObra = rows(porObraQ).map((r: any) => {
            const al = Number(r.alocados ?? 0);
            const terceiros = Number(r.terceiros ?? 0);
            const pr = Number(r.presentes_dds ?? 0);
            return {
              obraId: Number(r.obra_id),
              obraNome: String(r.obra_nome ?? ""),
              alocadosHoje: al,
              equipePropria: al,
              terceiros,
              efetivoTotal: al + terceiros,
              presentesDdsHoje: pr,
              possiveisAusenciasDdsHoje: Math.max(0, al - pr),
              faltasSemana: Number(r.faltas ?? 0),
              atestadosSemana: Number(r.atestados ?? 0),
              advertenciasSemana: Number(r.advertencias ?? 0),
              acidentesSemana: Number(r.acidentes ?? 0),
            };
          });
        } catch (e) {
          safeErrorMsg("pessoas por obra", e);
        }
      }

      const pessoas = { semana: pessoasSemana, saude: saudePeriodos, porObra: pessoasPorObra };

      // ── Produção ─────────────────────────────────────────────────────────
      // apontamentos_producao: snake_case (company_id, obra_id, data, status, ativo)

      type ProducaoPeriodo = { total: number; validados: number; pendentes: number; glosados: number };
      const emptyProd = (): ProducaoPeriodo => ({ total: 0, validados: 0, pendentes: 0, glosados: 0 });

      let producaoHoje = emptyProd();
      let producaoSemanaAnterior = emptyProd();
      let producaoSemanaAtual = emptyProd();
      let producaoMesAtual = emptyProd();
      let producaoPorObra: Array<{
        obraId: number; obraNome: string;
        semanaAnterior: ProducaoPeriodo; semanaAtual: ProducaoPeriodo; mesAtual: ProducaoPeriodo;
      }> = [];
      const qualidadeProducao: { fonte: string; status: "ok" | "parcial" | "sem_dados"; mensagem: string }[] = [];

      if (obraIds.length > 0) {
        try {
          const prodQ = await db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE data = ${hoje}) AS ho_t,
              COUNT(*) FILTER (WHERE data = ${hoje} AND status = 'validado') AS ho_v,
              COUNT(*) FILTER (WHERE data = ${hoje} AND status = 'apontado') AS ho_p,
              COUNT(*) FILTER (WHERE data = ${hoje} AND status = 'glosado') AS ho_g,
              COUNT(*) FILTER (WHERE data BETWEEN ${prevWeekStart} AND ${prevWeekEnd}) AS pa_t,
              COUNT(*) FILTER (WHERE data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND status = 'validado') AS pa_v,
              COUNT(*) FILTER (WHERE data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND status = 'apontado') AS pa_p,
              COUNT(*) FILTER (WHERE data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND status = 'glosado')  AS pa_g,
              COUNT(*) FILTER (WHERE data BETWEEN ${weekStart} AND ${weekEnd}) AS ca_t,
              COUNT(*) FILTER (WHERE data BETWEEN ${weekStart} AND ${weekEnd} AND status = 'validado') AS ca_v,
              COUNT(*) FILTER (WHERE data BETWEEN ${weekStart} AND ${weekEnd} AND status = 'apontado') AS ca_p,
              COUNT(*) FILTER (WHERE data BETWEEN ${weekStart} AND ${weekEnd} AND status = 'glosado')  AS ca_g,
              COUNT(*) FILTER (WHERE data >= ${monthStart}) AS ma_t,
              COUNT(*) FILTER (WHERE data >= ${monthStart} AND status = 'validado') AS ma_v,
              COUNT(*) FILTER (WHERE data >= ${monthStart} AND status = 'apontado') AS ma_p,
              COUNT(*) FILTER (WHERE data >= ${monthStart} AND status = 'glosado')  AS ma_g
            FROM apontamentos_producao
            WHERE company_id IN (${sql.raw(idsLiteral)})
              AND obra_id IN (${sql.raw(obraIdsLiteral)})
              AND ativo = 1
          `);
          const pr = rows(prodQ)[0] ?? {};
          producaoHoje           = { total: Number(pr.ho_t ?? 0), validados: Number(pr.ho_v ?? 0), pendentes: Number(pr.ho_p ?? 0), glosados: Number(pr.ho_g ?? 0) };
          producaoSemanaAnterior = { total: Number(pr.pa_t ?? 0), validados: Number(pr.pa_v ?? 0), pendentes: Number(pr.pa_p ?? 0), glosados: Number(pr.pa_g ?? 0) };
          producaoSemanaAtual    = { total: Number(pr.ca_t ?? 0), validados: Number(pr.ca_v ?? 0), pendentes: Number(pr.ca_p ?? 0), glosados: Number(pr.ca_g ?? 0) };
          producaoMesAtual       = { total: Number(pr.ma_t ?? 0), validados: Number(pr.ma_v ?? 0), pendentes: Number(pr.ma_p ?? 0), glosados: Number(pr.ma_g ?? 0) };

          const prodObraQ = await db.execute(sql`
            SELECT
              ap.obra_id,
              o.nome AS obra_nome,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${prevWeekStart} AND ${prevWeekEnd}) AS pa_t,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND ap.status = 'validado') AS pa_v,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND ap.status = 'apontado') AS pa_p,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${prevWeekStart} AND ${prevWeekEnd} AND ap.status = 'glosado')  AS pa_g,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${weekStart} AND ${weekEnd}) AS ca_t,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${weekStart} AND ${weekEnd} AND ap.status = 'validado') AS ca_v,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${weekStart} AND ${weekEnd} AND ap.status = 'apontado') AS ca_p,
              COUNT(*) FILTER (WHERE ap.data BETWEEN ${weekStart} AND ${weekEnd} AND ap.status = 'glosado')  AS ca_g,
              COUNT(*) FILTER (WHERE ap.data >= ${monthStart}) AS ma_t,
              COUNT(*) FILTER (WHERE ap.data >= ${monthStart} AND ap.status = 'validado') AS ma_v,
              COUNT(*) FILTER (WHERE ap.data >= ${monthStart} AND ap.status = 'apontado') AS ma_p,
              COUNT(*) FILTER (WHERE ap.data >= ${monthStart} AND ap.status = 'glosado')  AS ma_g
            FROM apontamentos_producao ap
            JOIN obras o ON o.id = ap.obra_id
            WHERE ap.company_id IN (${sql.raw(idsLiteral)})
              AND ap.obra_id IN (${sql.raw(obraIdsLiteral)})
              AND ap.ativo = 1
            GROUP BY ap.obra_id, o.nome
            ORDER BY o.nome
          `);
          producaoPorObra = rows(prodObraQ).map((r: any) => ({
            obraId: Number(r.obra_id),
            obraNome: String(r.obra_nome ?? ""),
            semanaAnterior: { total: Number(r.pa_t ?? 0), validados: Number(r.pa_v ?? 0), pendentes: Number(r.pa_p ?? 0), glosados: Number(r.pa_g ?? 0) },
            semanaAtual:    { total: Number(r.ca_t ?? 0), validados: Number(r.ca_v ?? 0), pendentes: Number(r.ca_p ?? 0), glosados: Number(r.ca_g ?? 0) },
            mesAtual:       { total: Number(r.ma_t ?? 0), validados: Number(r.ma_v ?? 0), pendentes: Number(r.ma_p ?? 0), glosados: Number(r.ma_g ?? 0) },
          }));

          qualidadeProducao.push({ fonte: "apontamentos_producao", status: "ok", mensagem: "Dados de produção carregados." });
        } catch (e) {
          qualidadeProducao.push({ fonte: "apontamentos_producao", status: "sem_dados", mensagem: safeErrorMsg("producao", e) });
        }
      } else {
        qualidadeProducao.push({ fonte: "apontamentos_producao", status: "sem_dados", mensagem: "Nenhuma obra no escopo." });
      }

      const producao = { hoje: producaoHoje, semanaAnterior: producaoSemanaAnterior, semanaAtual: producaoSemanaAtual, mesAtual: producaoMesAtual, porObra: producaoPorObra };

      // ── Planejamento ─────────────────────────────────────────────────────
      // planejamento_projetos: snake_case (company_id, obra_id, previsto_semanas_json,
      //   data_corte_atual, status)
      // planejamento_revisoes: snake_case (projeto_id, status, numero)
      // planejamento_atividades: snake_case (revisao_id, is_grupo, is_marco, disabled,
      //   data_inicio, data_fim, data_fim_real)
      // planejamento_refis: snake_case (projeto_id, avanco_previsto, avanco_realizado,
      //   status, semana, consolidado_em)
      //
      // Realizado: último planejamento_refis consolidado (status IN ('consolidado','fechado'))
      // por projeto. NÃO usa CPI/custos. Motor de previsto NÃO é alterado.

      type PlanejamentoObra = {
        obraId: number; obraNome: string;
        previstoPercent: number | null; realizadoPercent: number | null; desvioPercent: number | null;
        status: string; cobertura: "ok" | "parcial" | "sem_dados";
      };

      let obrasComPlanejamento = 0;
      let atividadesAtrasadas = 0;
      let atividadesEmRisco = 0;
      let planejamentoPorObra: PlanejamentoObra[] = [];
      const qualidadePlan: { fonte: string; status: "ok" | "parcial" | "sem_dados"; mensagem: string }[] = [];

      if (obraIds.length > 0) {
        try {
          // Projetos com revisão ativa (todos snake_case)
          const planQ = await db.execute(sql`
            SELECT
              pp.obra_id,
              pp.id AS projeto_id,
              pp.status AS projeto_status,
              pp.previsto_semanas_json,
              COALESCE(
                (SELECT r.id FROM planejamento_revisoes r
                 WHERE r.projeto_id = pp.id AND r.status = 'aprovada'
                 ORDER BY r.numero DESC, r.id DESC LIMIT 1),
                (SELECT r.id FROM planejamento_revisoes r
                 WHERE r.projeto_id = pp.id
                 ORDER BY r.numero DESC, r.id DESC LIMIT 1)
              ) AS revisao_id
            FROM planejamento_projetos pp
            WHERE pp.company_id IN (${sql.raw(idsLiteral)})
              AND pp.obra_id IN (${sql.raw(obraIdsLiteral)})
            ORDER BY pp.obra_id, pp.id DESC
          `);

          const planList = rows(planQ);
          const obraProjetoMap = new Map<number, any>();
          for (const r of planList) {
            const oid = Number(r.obra_id);
            if (!obraProjetoMap.has(oid)) obraProjetoMap.set(oid, r);
          }
          obrasComPlanejamento = obraProjetoMap.size;

          const revisaoIds = [...obraProjetoMap.values()]
            .map((r: any) => Number(r.revisao_id))
            .filter((n) => n > 0);

          if (revisaoIds.length > 0) {
            const revLit = revisaoIds.join(",");
            const ativQ = await db.execute(sql`
              SELECT
                COUNT(*) FILTER (
                  WHERE data_fim < ${hoje}
                  AND (data_fim_real IS NULL OR data_fim_real > data_fim)
                ) AS atrasadas,
                COUNT(*) FILTER (
                  WHERE data_fim >= ${hoje} AND data_fim <= ${in7Days}
                  AND (data_fim_real IS NULL OR data_fim_real > data_fim)
                ) AS em_risco
              FROM planejamento_atividades
              WHERE revisao_id IN (${sql.raw(revLit)})
                AND is_grupo = false
                AND is_marco = false
                AND disabled = false
                AND data_inicio IS NOT NULL
                AND data_fim IS NOT NULL
            `);
            const ar = rows(ativQ)[0] ?? {};
            atividadesAtrasadas = Number(ar.atrasadas ?? 0);
            atividadesEmRisco   = Number(ar.em_risco ?? 0);
          }

          // Por obra: previsto do snapshot + realizado do último REFI consolidado
          // Último planejamento_refis com status consolidado/fechado por projeto,
          // semana <= hoje. Evita usar CPI ou custos.
          const projetoIds = [...obraProjetoMap.values()]
            .map((r: any) => Number(r.projeto_id))
            .filter((n) => n > 0);

          const refiByProjeto = new Map<number, { previsto: number; realizado: number }>();
          if (projetoIds.length > 0) {
            const projetosLit = projetoIds.join(",");
            const refiQ = await db.execute(sql`
              SELECT DISTINCT ON (projeto_id)
                projeto_id,
                avanco_previsto,
                avanco_realizado
              FROM planejamento_refis
              WHERE projeto_id IN (${sql.raw(projetosLit)})
                AND semana <= ${hoje}
                AND status IN ('consolidado','fechado','aprovado')
              ORDER BY projeto_id, semana DESC, id DESC
            `);
            for (const r of rows(refiQ)) {
              refiByProjeto.set(Number(r.projeto_id), {
                previsto: Number(r.avanco_previsto ?? 0),
                realizado: Number(r.avanco_realizado ?? 0),
              });
            }
          }

          for (const o of obras) {
            const proj = obraProjetoMap.get(o.id);
            if (!proj) {
              planejamentoPorObra.push({
                obraId: o.id, obraNome: o.nome,
                previstoPercent: null, realizadoPercent: null, desvioPercent: null,
                status: "sem_planejamento", cobertura: "sem_dados",
              });
              continue;
            }

            // Previsto: snapshot do motor (NÃO recalcula — motor congelado)
            let previstoPercent: number | null = null;
            try {
              if (proj.previsto_semanas_json) {
                const snap = JSON.parse(String(proj.previsto_semanas_json));
                const raiz: number[] = snap?.raiz ?? [];
                const semanas: string[] = snap?.semanas ?? [];
                let idx = -1;
                for (let i = 0; i < semanas.length; i++) {
                  if (String(semanas[i]).slice(0, 10) <= hoje) idx = i; else break;
                }
                if (idx >= 0 && idx < raiz.length) previstoPercent = Number(raiz[idx]);
              }
            } catch { /* JSON inesperado → null */ }

            // Realizado: planejamento_refis consolidado
            const refi = refiByProjeto.get(Number(proj.projeto_id));
            let realizadoPercent: number | null = null;
            if (refi) {
              realizadoPercent = refi.realizado;
              // Se previsto vem do refi, prefere consistência interna
              if (previstoPercent == null) previstoPercent = refi.previsto;
            }

            const desvioPercent = previstoPercent != null && realizadoPercent != null
              ? realizadoPercent - previstoPercent
              : null;

            const cobertura: "ok" | "parcial" | "sem_dados" =
              previstoPercent != null && realizadoPercent != null ? "ok"
              : previstoPercent != null || realizadoPercent != null ? "parcial"
              : "sem_dados";

            planejamentoPorObra.push({
              obraId: o.id, obraNome: o.nome,
              previstoPercent, realizadoPercent, desvioPercent,
              status: String(proj.projeto_status ?? ""),
              cobertura,
            });
          }

          qualidadePlan.push({ fonte: "planejamento_projetos", status: "ok", mensagem: "Planejamento carregado." });
        } catch (e) {
          qualidadePlan.push({ fonte: "planejamento_projetos", status: "sem_dados", mensagem: safeErrorMsg("planejamento", e) });
        }
      } else {
        qualidadePlan.push({ fonte: "planejamento_projetos", status: "sem_dados", mensagem: "Nenhuma obra no escopo." });
      }

      const planejamento = { obrasComPlanejamento, atividadesAtrasadas, atividadesEmRisco, porObra: planejamentoPorObra };

      // ── Compras ──────────────────────────────────────────────────────────
      // Todas as tabelas de compras: snake_case
      // NUNCA valores — somente contagens e timestamps.
      // Lead time: subquery das últimas 30 OCs encerradas com timestamps, então AVG.

      type ComprasObra = { obraId: number; obraNome: string; solicitacoesAbertas: number; ordensAbertas: number; entregasAtrasadas: number };

      let solicitacoesAbertas = 0;
      let cotacoesAbertas = 0;
      let ordensAbertas = 0;
      let comprasEntregasAtrasadas = 0;
      let leadTime = {
        scCotacaoHoras: null as number | null,
        cotacaoOcHoras: null as number | null,
        scOcHoras: null as number | null,
        amostra: 0,
      };
      let comprasPorObra: ComprasObra[] = [];
      const qualidadeCompras: { fonte: string; status: "ok" | "parcial" | "sem_dados"; mensagem: string }[] = [];

      try {
        const obraFilterSc = obraIds.length > 0 ? `AND cs.obra_id IN (${obraIdsLiteral})` : "";
        const obraFilterOc = obraIds.length > 0 ? `AND co.obra_id IN (${obraIdsLiteral})` : "";

        const [scR, cotR, ocR, entR] = await Promise.all([
          db.execute(sql`
            SELECT COUNT(*) AS n
            FROM compras_solicitacoes cs
            WHERE cs.company_id IN (${sql.raw(idsLiteral)})
              AND cs.status NOT IN ('cancelada','cancelado','concluida','concluido','entregue')
              ${sql.raw(obraFilterSc)}
          `),
          db.execute(sql`
            SELECT COUNT(*) AS n
            FROM compras_cotacoes cc
            WHERE cc.company_id IN (${sql.raw(idsLiteral)})
              AND cc.status NOT IN ('cancelada','cancelado','aprovada','concluida','concluido')
              ${sql.raw(obraIds.length > 0 ? `AND cc.obra_id IN (${obraIdsLiteral})` : "")}
          `),
          db.execute(sql`
            SELECT COUNT(*) AS n
            FROM compras_ordens co
            WHERE co.company_id IN (${sql.raw(idsLiteral)})
              AND co.status NOT IN ('cancelada','cancelado','entregue','concluida','concluido')
              ${sql.raw(obraFilterOc)}
          `),
          db.execute(sql`
            SELECT COUNT(*) AS n
            FROM compras_entregas_programadas ep
            JOIN compras_ordens_itens oi ON oi.id = ep.ordem_item_id
            JOIN compras_ordens co ON co.id = oi.ordem_id
            WHERE co.company_id IN (${sql.raw(idsLiteral)})
              AND ep.status NOT IN ('entregue','cancelado','cancelada')
              AND ep.data_entrega < ${hoje}
              ${sql.raw(obraFilterOc)}
          `),
        ]);

        solicitacoesAbertas = Number(rows(scR)[0]?.n ?? 0);
        cotacoesAbertas     = Number(rows(cotR)[0]?.n ?? 0);
        ordensAbertas       = Number(rows(ocR)[0]?.n ?? 0);
        comprasEntregasAtrasadas = Number(rows(entR)[0]?.n ?? 0);

        // Lead time: subquery com LIMIT nas últimas 30 OCs encerradas,
        // depois AVG/COUNT sobre esse conjunto. Nunca valores financeiros.
        try {
          const ltQ = await db.execute(sql`
            SELECT
              ROUND(AVG(sc_to_oc_h)::numeric, 1) AS sc_oc_horas,
              ROUND(AVG(sc_to_cot_h)::numeric, 1) AS sc_cot_horas,
              ROUND(AVG(cot_to_oc_h)::numeric, 1) AS cot_oc_horas,
              COUNT(*) AS amostra
            FROM (
              SELECT
                EXTRACT(EPOCH FROM (co.created_at - sc.created_at)) / 3600.0 AS sc_to_oc_h,
                EXTRACT(EPOCH FROM (cc.created_at - sc.created_at)) / 3600.0 AS sc_to_cot_h,
                EXTRACT(EPOCH FROM (co.created_at - cc.created_at)) / 3600.0 AS cot_to_oc_h
              FROM compras_ordens co
              JOIN compras_cotacoes cc ON cc.id = co.cotacao_id
              JOIN compras_solicitacoes sc ON sc.id = cc.solicitacao_id
              WHERE co.company_id IN (${sql.raw(idsLiteral)})
                AND co.status IN ('entregue','concluida','concluido')
                AND co.created_at IS NOT NULL
                AND cc.created_at IS NOT NULL
                AND sc.created_at IS NOT NULL
                ${sql.raw(obraFilterOc)}
              ORDER BY co.created_at DESC
              LIMIT 30
            ) sub
          `);
          const lt = rows(ltQ)[0] ?? {};
          const amostra = Number(lt.amostra ?? 0);
          if (amostra > 0) {
            leadTime = {
              scOcHoras:     lt.sc_oc_horas  != null ? Number(lt.sc_oc_horas)  : null,
              scCotacaoHoras:lt.sc_cot_horas != null ? Number(lt.sc_cot_horas) : null,
              cotacaoOcHoras:lt.cot_oc_horas != null ? Number(lt.cot_oc_horas) : null,
              amostra,
            };
          }
        } catch (e) { safeErrorMsg("compras lead time", e); }

        qualidadeCompras.push({ fonte: "compras_solicitacoes", status: "ok", mensagem: "Dados de compras carregados." });

        // Por obra
        if (obraIds.length > 0) {
          const cpObraQ = await db.execute(sql`
            SELECT
              o.id AS obra_id,
              o.nome AS obra_nome,
              COALESCE(sc.n, 0)::int  AS sc_abertas,
              COALESCE(oc.n, 0)::int  AS oc_abertas,
              COALESCE(ep.n, 0)::int  AS ent_atrasadas
            FROM obras o
            LEFT JOIN (
              SELECT obra_id, COUNT(*) AS n
              FROM compras_solicitacoes
              WHERE company_id IN (${sql.raw(idsLiteral)})
                AND obra_id IN (${sql.raw(obraIdsLiteral)})
                AND status NOT IN ('cancelada','cancelado','concluida','concluido','entregue')
              GROUP BY obra_id
            ) sc ON sc.obra_id = o.id
            LEFT JOIN (
              SELECT obra_id, COUNT(*) AS n
              FROM compras_ordens
              WHERE company_id IN (${sql.raw(idsLiteral)})
                AND obra_id IN (${sql.raw(obraIdsLiteral)})
                AND status NOT IN ('cancelada','cancelado','entregue','concluida','concluido')
              GROUP BY obra_id
            ) oc ON oc.obra_id = o.id
            LEFT JOIN (
              SELECT co2.obra_id, COUNT(*) AS n
              FROM compras_entregas_programadas ep2
              JOIN compras_ordens_itens oi2 ON oi2.id = ep2.ordem_item_id
              JOIN compras_ordens co2 ON co2.id = oi2.ordem_id
              WHERE co2.company_id IN (${sql.raw(idsLiteral)})
                AND co2.obra_id IN (${sql.raw(obraIdsLiteral)})
                AND ep2.status NOT IN ('entregue','cancelado','cancelada')
                AND ep2.data_entrega < ${hoje}
              GROUP BY co2.obra_id
            ) ep ON ep.obra_id = o.id
            WHERE o.id IN (${sql.raw(obraIdsLiteral)})
              AND o."companyId" IN (${sql.raw(idsLiteral)})
            ORDER BY o.nome
          `);
          comprasPorObra = rows(cpObraQ).map((r: any) => ({
            obraId: Number(r.obra_id),
            obraNome: String(r.obra_nome ?? ""),
            solicitacoesAbertas: Number(r.sc_abertas ?? 0),
            ordensAbertas: Number(r.oc_abertas ?? 0),
            entregasAtrasadas: Number(r.ent_atrasadas ?? 0),
          }));
        }
      } catch (e) {
        qualidadeCompras.push({ fonte: "compras_solicitacoes", status: "sem_dados", mensagem: safeErrorMsg("compras", e) });
      }

      const compras = {
        solicitacoesAbertas,
        cotacoesAbertas,
        ordensAbertas,
        entregasAtrasadas: comprasEntregasAtrasadas,
        leadTime,
        porObra: comprasPorObra,
      };

      // ── Radar ─────────────────────────────────────────────────────────────
      // Deriva atraso no campo: dataPrevisaoFim < hoje (vem de obras[] interno)

      type RadarItem = {
        obraId: number; obraNome: string;
        severidade: "critico" | "atencao" | "normal";
        score: number; motivos: string[];
      };

      const radar: RadarItem[] = obras.map((o) => {
        const pessoasO = pessoasPorObra.find((p) => p.obraId === o.id);
        const planO    = planejamentoPorObra.find((p) => p.obraId === o.id);
        const comprasO = comprasPorObra.find((c) => c.obraId === o.id);

        let score = 0;
        const motivos: string[] = [];

        // Atraso derivado de dataPrevisaoFim (campo real da obra)
        if (o.dataPrevisaoFim && o.dataPrevisaoFim < hoje &&
            !["Concluída","Cancelada","Encerrada","Cancelado"].includes(o.status)) {
          score += 3; motivos.push("Obra com data prevista de término ultrapassada");
        }

        if (pessoasO) {
          const al = pessoasO.alocadosHoje;
          if (al > 0 && pessoasO.possiveisAusenciasDdsHoje / al > 0.2) {
            score += 2; motivos.push("Possíveis ausências DDS acima de 20% dos alocados");
          }
          if (pessoasO.acidentesSemana > 0) {
            score += 3; motivos.push("Acidente(s) registrado(s) na semana");
          }
          if (pessoasO.faltasSemana > 2) {
            score += 1; motivos.push("Mais de 2 faltas na semana");
          }
        }

        if (planO?.desvioPercent != null && planO.desvioPercent < -10) {
          score += 3; motivos.push("Atraso no cronograma acima de 10%");
        } else if (planO?.desvioPercent != null && planO.desvioPercent < -5) {
          score += 1; motivos.push("Atraso no cronograma entre 5% e 10%");
        }

        if (comprasO && comprasO.entregasAtrasadas > 0) {
          score += 1; motivos.push(`${comprasO.entregasAtrasadas} entrega(s) de material atrasada(s)`);
        }

        const severidade: "critico" | "atencao" | "normal" =
          score >= 5 ? "critico" : score >= 2 ? "atencao" : "normal";
        return { obraId: o.id, obraNome: o.nome, severidade, score, motivos };
      }).sort((a, b) => b.score - a.score);

      // ── Qualidade consolidada ────────────────────────────────────────────

      const qualidade = [
        {
          fonte: "obras",
          status: obras.length > 0 ? "ok" as const : "sem_dados" as const,
          mensagem: obras.length > 0 ? `${obras.length} obra(s) no escopo.` : "Nenhuma obra encontrada.",
        },
        ...qualidadeProducao,
        ...qualidadePlan,
        ...qualidadeCompras,
      ];

      return {
        generatedAt: new Date().toISOString(),
        period,
        obras: obrasPublic,
        headline,
        pessoas,
        producao,
        planejamento,
        compras,
        radar,
        qualidade,
      };
    }),
});
