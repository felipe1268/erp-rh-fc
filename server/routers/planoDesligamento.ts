import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getCompaniesForUser, createAuditLog } from "../db";
import { planoDesligamento, employees } from "../../drizzle/schema";
import { eq, and, sql, isNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import { assertAiModuleEnabled } from "../_core/aiConfig";

// Plano de Desligamento (layoff) — fila sequencial de demissões programadas por mês.
// Acesso: Admin Master + equipe RH (gating padrão do módulo rh-dp) + tenancy por empresa.

const STATUS_VALIDOS = ["planejado", "em_analise", "ferias", "aviso_previo", "desligado", "cancelado"] as const;

async function assertAcesso(ctxUser: any, companyId: number) {
  const empresas = await getCompaniesForUser(ctxUser.id, ctxUser.role);
  if (!empresas.some((c: any) => Number(c.id) === Number(companyId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
  }
  // Dados confidenciais de layoff: só Admin (Master) ou grupo com acesso ao módulo RH & DP.
  if (ctxUser.role === "admin_master" || ctxUser.role === "admin") return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const res: any = await db.execute(sql`
    SELECT 1 FROM user_group_members ugm
    JOIN user_groups ug ON ug.id = ugm."groupId"
    WHERE ugm."userId" = ${ctxUser.id} AND ug.ativo = 1
      AND (ug.module_access IS NULL OR ug.module_access = '' OR ug.module_access LIKE '%rh-dp%')
    LIMIT 1
  `);
  const rows = (Array.isArray(res) ? res : res?.rows ?? []);
  if (rows.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao RH" });
  }
}

// Obra atual (alocação ativa; fallback: histórico aberto — empresas que alocam só via ESH)
const obraAtualSub = sql<string | null>`COALESCE(
  (SELECT o.nome FROM obra_funcionarios ofx
   JOIN obras o ON o.id = ofx."obraId"
   WHERE ofx."employeeId" = ${employees.id} AND ofx."isActive" = 1
     AND ofx."companyId" = ${planoDesligamento.companyId}
   ORDER BY ofx."dataInicio" DESC NULLS LAST, ofx.id DESC LIMIT 1),
  (SELECT o.nome FROM employee_site_history esh
   JOIN obras o ON o.id = esh."obraId"
   WHERE esh."employeeId" = ${employees.id} AND esh."dataFim" IS NULL
     AND esh.tipo IN ('alocacao','transferencia')
     AND esh."companyId" = ${planoDesligamento.companyId}
   ORDER BY esh."dataInicio" DESC NULLS LAST, esh.id DESC LIMIT 1)
)`;

// Situação de férias do funcionário — apoio ao cronograma de desembolso do plano.
// Férias vencida paga em dobro na rescisão → sugerir gozo antes do desligamento.
const feriasVencidasSub = sql<number>`(
  SELECT COUNT(*)::int FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL
    AND vp.status IN ('pendente', 'vencida')
    AND vp."periodoConcessivoFim" < CURRENT_DATE AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
)`;
const feriasProxVencSub = sql<string | null>`(
  SELECT MIN(vp."periodoConcessivoFim")::text FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL
    AND vp.status IN ('pendente', 'vencida') AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
)`;
// Rev. 4987 — nº do período do vencimento mais próximo (1º pode prorrogar; 2º não)
const feriasProxVencNumSub = sql<number | null>`(
  SELECT vp."numeroPeriodo" FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL
    AND vp.status IN ('pendente', 'vencida') AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
  ORDER BY vp."periodoConcessivoFim" ASC, vp."numeroPeriodo" ASC
  LIMIT 1
)`;
// Vencimento do 2º período (limite duro): o próximo concessivo depois do mais próximo;
// se o período seguinte ainda não foi gerado, projeta +1 ano (períodos são anuais).
const feriasVenc2Sub = sql<string | null>`(
  SELECT COALESCE(
    (SELECT MIN(vp2."periodoConcessivoFim")::text FROM vacation_periods vp2
      WHERE vp2."employeeId" = ${employees.id} AND vp2."deletedAt" IS NULL AND vp2.status IN ('pendente', 'vencida') AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
        AND vp2."periodoConcessivoFim" > (
          SELECT MIN(vp3."periodoConcessivoFim") FROM vacation_periods vp3
          WHERE vp3."employeeId" = ${employees.id} AND vp3."deletedAt" IS NULL AND vp3.status IN ('pendente', 'vencida'))),
    (SELECT (MIN(vp4."periodoConcessivoFim") + INTERVAL '1 year')::date::text FROM vacation_periods vp4
      WHERE vp4."employeeId" = ${employees.id} AND vp4."deletedAt" IS NULL AND vp4.status IN ('pendente', 'vencida') AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO'))
  )
)`;
const feriasPendentesSub = sql<number>`(
  SELECT COUNT(*)::int FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL AND vp.status = 'pendente' AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
)`;
const feriasAgendadaSub = sql<string | null>`(
  SELECT MIN(vp."dataInicio")::text FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL AND vp.status = 'agendada' AND UPPER(COALESCE(${employees.tipoContrato}, '')) NOT IN ('PJ', 'SOCIO')
)`;
const feriasEmGozoFimSub = sql<string | null>`(
  SELECT MAX(COALESCE(vp."periodo3Fim", vp."periodo2Fim", vp."dataFim"))::text FROM vacation_periods vp
  WHERE vp."employeeId" = ${employees.id} AND vp."deletedAt" IS NULL AND vp.status = 'em_gozo'
)`;
// Custo médio MENSAL real de EPI/uniforme: total entregue (valor do item × qtd) ÷ meses
// decorridos desde a 1ª entrega registrada (mín. 1). Projeta o consumo histórico pra frente.
const epiMedioMesSub = sql<string | null>`(
  SELECT ROUND(SUM(ed.quantidade * COALESCE(ep."valor_produto", 0))::numeric
    / GREATEST(1, (EXTRACT(YEAR FROM AGE(CURRENT_DATE, MIN(ed."dataEntrega"))) * 12
      + EXTRACT(MONTH FROM AGE(CURRENT_DATE, MIN(ed."dataEntrega"))) + 1)), 2)::text
  FROM epi_deliveries ed
  JOIN epis ep ON ep.id = ed."epiId"
  WHERE ed."employeeId" = ${employees.id} AND ed."deletedAt" IS NULL
)`;

// ── Governança: consolidação + revisões + solicitações de mudança ──
// Consolidado = travado: só Admin Master edita direto; RH abre solicitação
// de mudança (rastreável) que só vale após o OK do master (gera nova revisão).
const rowsOf = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
const isMaster = (u: any) => u?.role === "admin_master";

async function getEstadoPlano(db: any, companyId: number): Promise<{ consolidado: boolean; revisaoAtual: number }> {
  const r: any = await db.execute(sql`
    SELECT consolidado, revisao_atual FROM plano_desligamento_estado WHERE company_id = ${companyId}
  `);
  const row = rowsOf(r)[0];
  return { consolidado: Number(row?.consolidado ?? 0) === 1, revisaoAtual: Number(row?.revisao_atual ?? 0) };
}

// Snapshot do plano ativo (vira o conteúdo da revisão)
async function snapshotPlano(db: any, companyId: number): Promise<any[]> {
  const r: any = await db.execute(sql`
    SELECT pd.employee_id AS "employeeId", e."nomeCompleto" AS nome, pd.mes_planejado AS mes, pd.status
    FROM plano_desligamento pd JOIN employees e ON e.id = pd.employee_id
    WHERE pd.company_id = ${companyId} AND pd.deleted_at IS NULL
      AND pd.status NOT IN ('desligado','cancelado')
    ORDER BY pd.mes_planejado, pd.ordem
  `);
  return rowsOf(r);
}

async function gravarRevisao(db: any, companyId: number, descricao: string, criadoPor: string): Promise<number> {
  const snap = await snapshotPlano(db, companyId);
  const r: any = await db.execute(sql`
    UPDATE plano_desligamento_estado SET revisao_atual = revisao_atual + 1 WHERE company_id = ${companyId}
    RETURNING revisao_atual
  `);
  let numero = Number(rowsOf(r)[0]?.revisao_atual ?? 0);
  if (!numero) {
    await db.execute(sql`INSERT INTO plano_desligamento_estado (company_id, consolidado, revisao_atual) VALUES (${companyId}, 0, 1) ON CONFLICT (company_id) DO NOTHING`);
    numero = 1;
  }
  await db.execute(sql`
    INSERT INTO plano_desligamento_revisoes (company_id, numero, descricao, snapshot, criado_por)
    VALUES (${companyId}, ${numero}, ${descricao}, ${JSON.stringify(snap)}::jsonb, ${criadoPor})
  `);
  return numero;
}

// Plano consolidado + usuário não-master: a escrita vira solicitação pendente
async function registrarMudanca(db: any, companyId: number, m: {
  tipo: string; itemId?: number | null; employeeId?: number | null; employeeNome?: string | null;
  de?: string | null; para?: string | null; detalhe?: string | null;
}, criadoPor: string) {
  await db.execute(sql`
    INSERT INTO plano_desligamento_mudancas (company_id, tipo, item_id, employee_id, employee_nome, de, para, detalhe, criado_por)
    VALUES (${companyId}, ${m.tipo}, ${m.itemId ?? null}, ${m.employeeId ?? null}, ${m.employeeNome ?? null},
            ${m.de ?? null}, ${m.para ?? null}, ${m.detalhe ?? null}, ${criadoPor})
  `);
}

export const planoDesligamentoRouter = router({
  // Estado de governança: consolidação, solicitações pendentes e histórico de revisões
  governanca: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) return { consolidado: false, revisaoAtual: 0, pendentes: [], revisoes: [], master: false };
      const estado = await getEstadoPlano(db, input.companyId);
      const pend: any = await db.execute(sql`
        SELECT id, tipo, item_id AS "itemId", employee_id AS "employeeId", employee_nome AS "employeeNome",
               de, para, detalhe, criado_por AS "criadoPor", criado_em::text AS "criadoEm"
        FROM plano_desligamento_mudancas
        WHERE company_id = ${input.companyId} AND status = 'pendente'
        ORDER BY id
      `);
      const revs: any = await db.execute(sql`
        SELECT numero, descricao, criado_por AS "criadoPor", criado_em::text AS "criadoEm",
               COALESCE(jsonb_array_length(snapshot), 0) AS "qtdItens"
        FROM plano_desligamento_revisoes
        WHERE company_id = ${input.companyId} ORDER BY numero DESC LIMIT 50
      `);
      return {
        consolidado: estado.consolidado, revisaoAtual: estado.revisaoAtual,
        pendentes: rowsOf(pend), revisoes: rowsOf(revs), master: isMaster(ctx.user),
      };
    }),

  // Consolida (trava) o plano — só Admin Master. Gera revisão.
  consolidar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      if (!isMaster(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Só o Admin Master pode consolidar o plano" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO plano_desligamento_estado (company_id, consolidado, consolidado_por, consolidado_em)
        VALUES (${input.companyId}, 1, ${ctx.user.name || ctx.user.email || ""}, NOW())
        ON CONFLICT (company_id) DO UPDATE SET consolidado = 1, consolidado_por = EXCLUDED.consolidado_por, consolidado_em = NOW()
      `);
      const numero = await gravarRevisao(db, input.companyId, "Plano consolidado", ctx.user.name || ctx.user.email || "");
      try { await createAuditLog({ companyId: input.companyId, userId: ctx.user.id, userName: ctx.user.name || "", action: "update", entityType: "plano_desligamento", entityId: 0, details: `Plano de Desligamento CONSOLIDADO (Rev. ${numero})` }); } catch {}
      return { ok: true, revisao: numero };
    }),

  // Destrava o plano — só Admin Master
  desconsolidar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      if (!isMaster(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Só o Admin Master pode desconsolidar o plano" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`UPDATE plano_desligamento_estado SET consolidado = 0 WHERE company_id = ${input.companyId}`);
      try { await createAuditLog({ companyId: input.companyId, userId: ctx.user.id, userName: ctx.user.name || "", action: "update", entityType: "plano_desligamento", entityId: 0, details: "Plano de Desligamento DESCONSOLIDADO (edição liberada)" }); } catch {}
      return { ok: true };
    }),

  // Master decide solicitações (aprovar aplica a mudança; lote = 1 revisão)
  decidirMudancas: protectedProcedure
    .input(z.object({ companyId: z.number(), ids: z.array(z.number()).min(1), aprovar: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      if (!isMaster(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Só o Admin Master pode aprovar/rejeitar" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const quem = ctx.user.name || ctx.user.email || "";
      const r: any = await db.execute(sql`
        SELECT * FROM plano_desligamento_mudancas
        WHERE company_id = ${input.companyId} AND status = 'pendente'
          AND id IN (${sql.join(input.ids.map(i => sql`${i}`), sql`, `)})
        ORDER BY id
      `);
      const muds = rowsOf(r);
      if (muds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma solicitação pendente encontrada" });
      let aplicadas = 0;
      let conflitos = 0;
      const resumo: string[] = [];
      const marcarConflito = async (id: number, motivo: string) => {
        conflitos++;
        await db.execute(sql`
          UPDATE plano_desligamento_mudancas
          SET status = 'rejeitada', detalhe = COALESCE(detalhe || ' · ', '') || ${`conflito: ${motivo}`}
          WHERE id = ${id}`);
      };
      for (const m of muds) {
        // Claim atômico: só quem virar o status de 'pendente' aplica (evita decisão dupla)
        const claimR: any = await db.execute(sql`
          UPDATE plano_desligamento_mudancas
          SET status = ${input.aprovar ? "aprovada" : "rejeitada"}, decidido_por = ${quem}, decidido_em = NOW()
          WHERE id = ${m.id} AND company_id = ${input.companyId} AND status = 'pendente'
          RETURNING *`);
        const cm = rowsOf(claimR)[0];
        if (!cm) continue; // já decidida por outra chamada concorrente
        if (!input.aprovar) continue;
        try {
          if (cm.tipo === "adicionar" && cm.employee_id && cm.para) {
            const mx: any = await db.execute(sql`
              SELECT COALESCE(MAX(ordem), 0)::int AS mx FROM plano_desligamento
              WHERE company_id = ${input.companyId} AND mes_planejado = ${cm.para} AND deleted_at IS NULL`);
            const ordem = Number(rowsOf(mx)[0]?.mx ?? 0) + 1;
            const ins: any = await db.execute(sql`
              INSERT INTO plano_desligamento (company_id, employee_id, mes_planejado, ordem, status, criado_por)
              VALUES (${input.companyId}, ${cm.employee_id}, ${cm.para}, ${ordem}, 'planejado', ${cm.criado_por || quem})
              ON CONFLICT (company_id, employee_id) WHERE deleted_at IS NULL DO NOTHING
              RETURNING id`);
            if (!rowsOf(ins)[0]) { await marcarConflito(cm.id, "funcionário já está no plano"); continue; }
          } else if (cm.tipo === "mover" && cm.item_id && cm.para) {
            const mx: any = await db.execute(sql`
              SELECT COALESCE(MAX(ordem), 0)::int AS mx FROM plano_desligamento
              WHERE company_id = ${input.companyId} AND mes_planejado = ${cm.para} AND deleted_at IS NULL`);
            // Valida o estado esperado ("de"): se o mês já mudou desde a solicitação, é conflito
            const up: any = await db.execute(sql`
              UPDATE plano_desligamento SET mes_planejado = ${cm.para}, ordem = ${Number(rowsOf(mx)[0]?.mx ?? 0) + 1}, atualizado_em = NOW()
              WHERE id = ${cm.item_id} AND company_id = ${input.companyId} AND deleted_at IS NULL
                AND (${cm.de ?? null}::text IS NULL OR mes_planejado = ${cm.de})
              RETURNING id`);
            if (!rowsOf(up)[0]) { await marcarConflito(cm.id, "o item mudou de mês ou foi removido depois da solicitação"); continue; }
          } else if (cm.tipo === "status" && cm.item_id && cm.para) {
            const up: any = await db.execute(sql`
              UPDATE plano_desligamento SET status = ${cm.para}, atualizado_em = NOW()
              WHERE id = ${cm.item_id} AND company_id = ${input.companyId} AND deleted_at IS NULL
                AND (${cm.de ?? null}::text IS NULL OR status = ${cm.de})
              RETURNING id`);
            if (!rowsOf(up)[0]) { await marcarConflito(cm.id, "o status mudou ou o item foi removido depois da solicitação"); continue; }
          } else if (cm.tipo === "remover" && cm.item_id) {
            const up: any = await db.execute(sql`
              UPDATE plano_desligamento SET deleted_at = NOW()
              WHERE id = ${cm.item_id} AND company_id = ${input.companyId} AND deleted_at IS NULL
              RETURNING id`);
            if (!rowsOf(up)[0]) { await marcarConflito(cm.id, "o item já não estava mais no plano"); continue; }
          } else {
            await marcarConflito(cm.id, "solicitação incompleta");
            continue;
          }
          aplicadas++;
          resumo.push(`${cm.tipo}: ${cm.employee_nome ?? `item ${cm.item_id}`}${cm.para ? ` → ${cm.para}` : ""}`);
        } catch (e) {
          console.error("[planoDesligamento] aplicar mudança falhou:", e);
          await marcarConflito(cm.id, "erro ao aplicar").catch(() => {});
        }
      }
      let revisao: number | null = null;
      if (input.aprovar && aplicadas > 0) {
        revisao = await gravarRevisao(db, input.companyId, `Aprovadas ${aplicadas} mudança(s): ${resumo.join("; ").slice(0, 900)}`, quem);
      }
      try { await createAuditLog({ companyId: input.companyId, userId: ctx.user.id, userName: quem, action: "update", entityType: "plano_desligamento", entityId: 0, details: `Solicitações ${input.aprovar ? "APROVADAS" : "REJEITADAS"} (${muds.length})${conflitos ? `, ${conflitos} conflito(s)` : ""}${revisao ? ` — Rev. ${revisao}` : ""}` }); } catch {}
      return { ok: true, aplicadas, conflitos, revisao };
    }),

  // Lista completa do plano + resumo (headcount, meta 50%, progresso)
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) return { itens: [], resumo: null };

      // Self-heal: quem está EM FÉRIAS agora entra na demissão do mês seguinte ao retorno
      // (regra do gestor: voltou das férias → desliga no próximo mês, automaticamente)
      // Plano CONSOLIDADO = imutável: o self-heal não roda (nada muda sem aprovação).
      const estadoList = await getEstadoPlano(db, input.companyId).catch(() => ({ consolidado: false, revisaoAtual: 0 }));
      if (!estadoList.consolidado) try {
        await db.execute(sql`
          UPDATE plano_desligamento pd
          SET mes_planejado = t.alvo, atualizado_em = NOW()
          FROM (
            SELECT pd2.id,
              to_char(date_trunc('month', MAX(COALESCE(vp."periodo3Fim", vp."periodo2Fim", vp."dataFim"))::date) + INTERVAL '1 month', 'YYYY-MM') AS alvo
            FROM plano_desligamento pd2
            JOIN vacation_periods vp ON vp."employeeId" = pd2.employee_id AND vp.status = 'em_gozo'
            WHERE pd2.company_id = ${input.companyId} AND pd2.deleted_at IS NULL
              AND pd2.status NOT IN ('desligado', 'cancelado')
            GROUP BY pd2.id
          ) t
          WHERE pd.id = t.id AND pd.mes_planejado < t.alvo
        `);
      } catch (e) { console.error("[planoDesligamento] auto-move pós-férias falhou:", e); }

      // Auto-sync 1: quem está de AVISO PRÉVIO entra automaticamente no plano no mês corrente
      // (previsto × realizado: o aviso já é um desligamento em execução). Só quando não consolidado.
      if (!estadoList.consolidado) try {
        await db.execute(sql`
          INSERT INTO plano_desligamento (company_id, employee_id, mes_planejado, ordem, status, observacoes, criado_por, criado_em, atualizado_em)
          SELECT e."companyId", e.id, to_char(CURRENT_DATE, 'YYYY-MM'), 999, 'aviso_previo',
            'Incluído automaticamente: aviso prévio em andamento', 'sistema', NOW(), NOW()
          FROM employees e
          WHERE e."companyId" = ${input.companyId} AND e."deletedAt" IS NULL
            AND (e.status = 'Aviso' OR EXISTS (
              SELECT 1 FROM termination_notices tn
              WHERE tn."employeeId" = e.id AND tn."companyId" = ${input.companyId}
                AND tn."deletedAt" IS NULL AND tn.status IN ('em_andamento', 'aguardando_pagamento')))
            AND NOT EXISTS (
              SELECT 1 FROM plano_desligamento pd3
              WHERE pd3.employee_id = e.id AND pd3.company_id = ${input.companyId} AND pd3.deleted_at IS NULL)
        `);
      } catch (e) { console.error("[planoDesligamento] auto-add aviso falhou:", e); }

      // Auto-sync 2 (REALIZADO): funcionário desligado de verdade → item vira 'desligado'
      // Roda sempre — só espelha a realidade executada, não muda a intenção do plano.
      try {
        await db.execute(sql`
          UPDATE plano_desligamento pd
          SET status = 'desligado', atualizado_em = NOW()
          FROM employees e
          WHERE e.id = pd.employee_id AND pd.company_id = ${input.companyId}
            AND pd.deleted_at IS NULL AND pd.status NOT IN ('desligado', 'cancelado')
            AND e.status IN ('Desligado', 'Lista_Negra', 'Inativo')
        `);
      } catch (e) { console.error("[planoDesligamento] auto-realizado falhou:", e); }

      const itens = await db.select({
        id: planoDesligamento.id,
        employeeId: planoDesligamento.employeeId,
        mesPlanejado: planoDesligamento.mesPlanejado,
        ordem: planoDesligamento.ordem,
        status: planoDesligamento.status,
        observacoes: planoDesligamento.observacoes,
        nome: employees.nomeCompleto,
        funcao: employees.funcao,
        fotoUrl: employees.fotoUrl,
        // PJ: valor mensal vem do contrato ativo no cadastro de prestadores (fonte de verdade), não do salarioBase
        salarioBase: sql<string | null>`CASE WHEN UPPER(COALESCE(${employees.tipoContrato}, '')) = 'PJ'
          THEN COALESCE((SELECT pc."valorMensal"::text FROM pj_contracts pc
            WHERE pc."employeeId" = ${employees.id} AND pc."companyId" = ${input.companyId}
              AND pc.status = 'ativo' AND pc."deletedAt" IS NULL
            ORDER BY pc.id DESC LIMIT 1), ${employees.salarioBase})
          ELSE ${employees.salarioBase} END`,
        dataAdmissao: employees.dataAdmissao,
        // Data real do desligamento (p/ CONGELAR o cálculo de quem já saiu — realizado não sobe mais)
        dataDesligamentoRef: sql<string | null>`COALESCE(${employees.dataDesligamentoEfetiva}::text, ${employees.dataDemissao}::text)`,
        dataNascimento: employees.dataNascimento,
        tipoContrato: employees.tipoContrato,
        statusFuncionario: employees.status,
        obraAtual: obraAtualSub,
        feriasVencidas: feriasVencidasSub,
        feriasProxVenc: feriasProxVencSub,
        feriasProxVencNumero: feriasProxVencNumSub,
        feriasVenc2: feriasVenc2Sub,
        feriasPendentes: feriasPendentesSub,
        feriasAgendada: feriasAgendadaSub,
        feriasEmGozoFim: feriasEmGozoFimSub,
        epiMedioMes: epiMedioMesSub,
        faltas12m: sql<number>`(SELECT COUNT(*)::int FROM time_records tr
          WHERE tr."employeeId" = ${employees.id} AND tr."companyId" = ${input.companyId}
            AND tr.data BETWEEN (CURRENT_DATE - INTERVAL '12 months')::date AND CURRENT_DATE
            AND (CASE
              WHEN tr.faltas ~ '^\\d+:\\d+$' THEN split_part(tr.faltas, ':', 1)::numeric + split_part(tr.faltas, ':', 2)::numeric / 60
              WHEN tr.faltas ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr.faltas, ',', '.')::numeric
              ELSE 0 END) > 0
            AND to_char(tr.data, 'YYYY-MM') IN (
              SELECT pc."mesReferencia" FROM ponto_consolidacao pc
              WHERE pc."companyId" = ${input.companyId} AND pc.status = 'consolidado'))`,
        habilidades: sql<any>`(SELECT COALESCE(json_agg(json_build_object('nome', s.nome, 'nivel', es.nivel) ORDER BY s.nome), '[]'::json)
          FROM employee_skills es JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
          WHERE es."employeeId" = ${employees.id} AND es."companyId" = ${input.companyId} AND es.deleted_at IS NULL)`,
        atestados12m: sql<number>`(SELECT COUNT(*)::int FROM atestados a
          WHERE a."employeeId" = ${employees.id} AND a."companyId" = ${input.companyId} AND a."deletedAt" IS NULL
            AND a."dataEmissao" >= (CURRENT_DATE - INTERVAL '12 months')::date)`,
      })
        .from(planoDesligamento)
        .innerJoin(employees, eq(planoDesligamento.employeeId, employees.id))
        .where(and(
          eq(planoDesligamento.companyId, input.companyId),
          isNull(planoDesligamento.deletedAt),
          isNull(employees.deletedAt),
        ))
        .orderBy(asc(planoDesligamento.mesPlanejado), asc(planoDesligamento.ordem), asc(planoDesligamento.id));

      // Headcount CLT ativo atual (mesma régua do painel: status não-terminal)
      const hc: any = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM employees
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL
          AND status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
      `);
      const hcRow = (Array.isArray(hc) ? hc[0] : hc?.rows?.[0]) as any;
      const headcountAtivo = Number(hcRow?.total ?? 0);

      // Custo mensal de alimentação (VA/refeitório) vigente — p/ economia mensal por desligamento
      let vaMensal = 0;
      try {
        const va: any = await db.execute(sql`
          SELECT COALESCE(NULLIF(REPLACE("totalVA_iFood", ',', '.'), '')::numeric, 0) AS va
          FROM meal_benefit_configs
          WHERE "companyId" = ${input.companyId} AND ativo = 1 AND "obraId" IS NULL
            AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURRENT_DATE)
            AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
          ORDER BY id DESC LIMIT 1
        `);
        vaMensal = Number(((Array.isArray(va) ? va[0] : va?.rows?.[0]) as any)?.va ?? 0);
      } catch { /* config ausente = 0 */ }

      const desligados = itens.filter(i => i.status === "desligado").length;
      const ativosNoPlano = itens.filter(i => i.status !== "cancelado" && i.status !== "desligado").length;
      // Meta: configurável pelo gestor (companies.plano_deslig_meta); NULL = automático (50% do quadro inicial)
      const baseInicial = headcountAtivo + desligados;
      let metaCustom: number | null = null;
      let tetoMes: number | null = null;
      try {
        const mc: any = await db.execute(sql`SELECT plano_deslig_meta, plano_deslig_teto_mes FROM companies WHERE id = ${input.companyId} LIMIT 1`);
        const row = ((Array.isArray(mc) ? mc[0] : mc?.rows?.[0]) as any) || {};
        const v = row?.plano_deslig_meta;
        metaCustom = v != null && Number(v) > 0 ? Number(v) : null;
        const t = row?.plano_deslig_teto_mes;
        tetoMes = t != null && Number(t) > 0 ? Number(t) : null;
      } catch { /* coluna ausente = automático */ }
      const meta = metaCustom ?? Math.ceil(baseInicial / 2);

      return {
        itens,
        resumo: { headcountAtivo, baseInicial, meta, metaCustom, tetoMes, programados: ativosNoPlano, desligados, vaMensal },
      };
    }),

  // Configura a meta de desligamentos (nº de pessoas). null = voltar ao automático (50%)
  setMeta: protectedProcedure
    .input(z.object({ companyId: z.number(), meta: z.number().int().min(1).max(10000).nullable() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.execute(sql`UPDATE companies SET plano_deslig_meta = ${input.meta} WHERE id = ${input.companyId}`);
      return { ok: true };
    }),

  // Teto de desembolso mensal do plano (R$). null = sem teto
  setTetoMes: protectedProcedure
    .input(z.object({ companyId: z.number(), teto: z.number().min(1).max(100000000).nullable() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.execute(sql`UPDATE companies SET plano_deslig_teto_mes = ${input.teto} WHERE id = ${input.companyId}`);
      return { ok: true };
    }),

  // Funcionários elegíveis (ativos, ainda fora do plano)
  elegiveis: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) return [];
      const rows: any = await db.execute(sql`
        WITH ponto_agg AS (
          -- Agregado do controle de ponto (12 meses): faltas, atrasos, frequência e pontualidade.
          -- Falta = dia com marcador de falta no fechamento (mesmo com horas parciais — regra do DIXI).
          -- Valores em formato misto: "9:06" (HH:MM), "8,5" ou "8.5" — parse defensivo.
          SELECT emp_id,
            COUNT(*) FILTER (WHERE falta_h > 0)::int AS faltas,
            COUNT(*) FILTER (WHERE atraso_min > 0)::int AS atrasos,
            COUNT(*)::int AS dias_total,
            COUNT(*) FILTER (WHERE trab_h > 0)::int AS dias_trab
          FROM (
            SELECT tr."employeeId" AS emp_id, tr.data,
              SUM(CASE
                WHEN tr.faltas ~ '^\\d+:\\d+$' THEN split_part(tr.faltas, ':', 1)::numeric + split_part(tr.faltas, ':', 2)::numeric / 60
                WHEN tr.faltas ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr.faltas, ',', '.')::numeric
                ELSE 0 END) AS falta_h,
              SUM(CASE
                WHEN tr.atrasos ~ '^\\d+:\\d+$' THEN split_part(tr.atrasos, ':', 1)::numeric * 60 + split_part(tr.atrasos, ':', 2)::numeric
                WHEN tr.atrasos ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr.atrasos, ',', '.')::numeric
                ELSE 0 END) AS atraso_min,
              SUM(CASE
                WHEN tr."horasTrabalhadas" ~ '^\\d+:\\d+$' THEN split_part(tr."horasTrabalhadas", ':', 1)::numeric + split_part(tr."horasTrabalhadas", ':', 2)::numeric / 60
                WHEN tr."horasTrabalhadas" ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr."horasTrabalhadas", ',', '.')::numeric
                ELSE 0 END) AS trab_h
            FROM time_records tr
            WHERE tr."companyId" = ${input.companyId}
              AND tr.data BETWEEN (CURRENT_DATE - INTERVAL '12 months')::date AND CURRENT_DATE
              -- Só meses CONSOLIDADOS no Fechamento de Ponto: meses abertos ainda têm
              -- inconsistências brutas do DIXI (faltas/atrasos falsos antes da validação do RH)
              AND to_char(tr.data, 'YYYY-MM') IN (
                SELECT pc."mesReferencia" FROM ponto_consolidacao pc
                WHERE pc."companyId" = ${input.companyId} AND pc.status = 'consolidado'
              )
            GROUP BY tr."employeeId", tr.data
          ) d GROUP BY emp_id
        ),
        atest_agg AS (
          SELECT a."employeeId" AS emp_id, COUNT(*)::int AS qtd, COALESCE(SUM(a."diasAfastamento"), 0)::int AS dias
          FROM atestados a
          WHERE a."companyId" = ${input.companyId} AND a."deletedAt" IS NULL
            AND a."dataEmissao" >= (CURRENT_DATE - INTERVAL '12 months')::date
          GROUP BY a."employeeId"
        ),
        adv_agg AS (
          SELECT w."employeeId" AS emp_id, COUNT(*)::int AS qtd
          FROM warnings w
          WHERE w."companyId" = ${input.companyId} AND w."deletedAt" IS NULL
            AND w."dataOcorrencia" >= (CURRENT_DATE - INTERVAL '12 months')::date
          GROUP BY w."employeeId"
        )
        SELECT e.id, e."nomeCompleto" AS nome, e.funcao, e."fotoUrl",
          e."dataAdmissao" AS "dataAdmissao", e."dataNascimento" AS "dataNascimento", e.status AS "statusFuncionario",
          e."licencaTipo" AS "licencaTipo", COALESCE(e."licencaMaternidade", 0) AS "licencaMaternidade",
          -- Estabilidade CIPA: membro ativo ou dentro da janela de estabilidade
          (SELECT MAX(COALESCE(cm."fimEstabilidade", '9999-12-31'::date))
             FROM cipa_members cm
             WHERE cm."employeeId" = e.id AND cm."companyId" = ${input.companyId}
               AND (cm."statusMembro" = 'Ativo' OR cm."fimEstabilidade" >= CURRENT_DATE)) AS "cipaEstabilidadeFim",
          e."tipoContrato" AS "tipoContrato",
          COALESCE(pa.faltas, 0) AS "faltas12m",
          COALESCE(pa.atrasos, 0) AS "atrasos12m",
          CASE WHEN COALESCE(pa.dias_total, 0) > 0
            THEN ROUND(100.0 * (pa.dias_total - COALESCE(pa.faltas, 0)) / pa.dias_total)::int
            ELSE NULL END AS "freqPct",
          CASE WHEN COALESCE(pa.dias_trab, 0) > 0
            THEN ROUND(100.0 * (pa.dias_trab - COALESCE(pa.atrasos, 0)) / pa.dias_trab)::int
            ELSE NULL END AS "pontPct",
          COALESCE(at.qtd, 0) AS "atestados12m",
          COALESCE(at.dias, 0) AS "atestadosDias12m",
          COALESCE(ad.qtd, 0) AS "advertencias12m",
          COALESCE(
            (SELECT o.nome FROM obra_funcionarios ofx JOIN obras o ON o.id = ofx."obraId"
             WHERE ofx."employeeId" = e.id AND ofx."isActive" = 1 AND ofx."companyId" = ${input.companyId}
             ORDER BY ofx."dataInicio" DESC NULLS LAST, ofx.id DESC LIMIT 1),
            (SELECT o.nome FROM employee_site_history esh JOIN obras o ON o.id = esh."obraId"
             WHERE esh."employeeId" = e.id AND esh."dataFim" IS NULL AND esh.tipo IN ('alocacao','transferencia')
               AND esh."companyId" = ${input.companyId}
             ORDER BY esh."dataInicio" DESC NULLS LAST, esh.id DESC LIMIT 1)
          ) AS "obraAtual",
          -- Já está de aviso prévio? (status do cadastro OU aviso ativo no módulo)
          (e.status = 'Aviso' OR EXISTS (
            SELECT 1 FROM termination_notices tn
            WHERE tn."employeeId" = e.id AND tn."companyId" = ${input.companyId}
              AND tn."deletedAt" IS NULL AND tn.status IN ('em_andamento', 'aguardando_pagamento')
          )) AS "avisoAtivo",
          (SELECT ROUND(SUM(ed.quantidade * COALESCE(ep."valor_produto", 0))::numeric
             / GREATEST(1, (EXTRACT(YEAR FROM AGE(CURRENT_DATE, MIN(ed."dataEntrega"))) * 12
               + EXTRACT(MONTH FROM AGE(CURRENT_DATE, MIN(ed."dataEntrega"))) + 1)), 2)::text
           FROM epi_deliveries ed JOIN epis ep ON ep.id = ed."epiId"
           WHERE ed."employeeId" = e.id AND ed."deletedAt" IS NULL) AS "epiMedioMes"
        FROM employees e
        LEFT JOIN ponto_agg pa ON pa.emp_id = e.id
        LEFT JOIN atest_agg at ON at.emp_id = e.id
        LEFT JOIN adv_agg ad ON ad.emp_id = e.id
        WHERE e."companyId" = ${input.companyId} AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
          -- Quem já está de aviso prévio sai da lista: o desligamento já está em andamento
          AND NOT (e.status = 'Aviso' OR EXISTS (
            SELECT 1 FROM termination_notices tn2
            WHERE tn2."employeeId" = e.id AND tn2."companyId" = ${input.companyId}
              AND tn2."deletedAt" IS NULL AND tn2.status IN ('em_andamento', 'aguardando_pagamento')
          ))
          AND NOT EXISTS (
            SELECT 1 FROM plano_desligamento pd
            WHERE pd.employee_id = e.id AND pd.company_id = ${input.companyId} AND pd.deleted_at IS NULL
          )
        ORDER BY e."nomeCompleto"
      `);
      return (Array.isArray(rows) ? rows : rows?.rows ?? []) as any[];
    }),

  // Adiciona funcionários ao plano num mês
  add: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeIds: z.array(z.number()).min(1),
      mesPlanejado: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Tenancy do recurso: só funcionários da própria empresa
      const emps = await db.select({ id: employees.id }).from(employees).where(and(
        eq(employees.companyId, input.companyId),
        isNull(employees.deletedAt),
        sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`,
        // Quem já está de aviso prévio não entra no plano — o desligamento já está em andamento
        sql`${employees.status} <> 'Aviso'`,
        sql`NOT EXISTS (
          SELECT 1 FROM termination_notices tn
          WHERE tn."employeeId" = ${employees.id} AND tn."companyId" = ${input.companyId}
            AND tn."deletedAt" IS NULL AND tn.status IN ('em_andamento', 'aguardando_pagamento')
        )`,
        sql`${employees.id} IN (${sql.join(input.employeeIds.map(i => sql`${i}`), sql`, `)})`,
      ));
      const validIds = new Set(emps.map(e => e.id));
      const aInserir = input.employeeIds.filter(id => validIds.has(id));
      if (aInserir.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum funcionário válido" });

      // Consolidado + não-master: vira solicitação pendente de aprovação (rastreável)
      const estadoAdd = await getEstadoPlano(db, input.companyId);
      if (estadoAdd.consolidado && !isMaster(ctx.user)) {
        const nomesR: any = await db.execute(sql`
          SELECT id, "nomeCompleto" AS nome FROM employees
          WHERE id IN (${sql.join(aInserir.map(i => sql`${i}`), sql`, `)})`);
        const nomes = new Map(rowsOf(nomesR).map((x: any) => [Number(x.id), String(x.nome)]));
        for (const empId of aInserir) {
          await registrarMudanca(db, input.companyId, {
            tipo: "adicionar", employeeId: empId, employeeNome: nomes.get(empId) ?? null, para: input.mesPlanejado,
          }, ctx.user.name || ctx.user.email || "");
        }
        return { inseridos: 0, pendente: true, enviadas: aInserir.length };
      }

      // ordem sequencial dentro do mês
      const maxRow: any = await db.execute(sql`
        SELECT COALESCE(MAX(ordem), 0)::int AS mx FROM plano_desligamento
        WHERE company_id = ${input.companyId} AND mes_planejado = ${input.mesPlanejado} AND deleted_at IS NULL
      `);
      let ordem = Number(((Array.isArray(maxRow) ? maxRow[0] : maxRow?.rows?.[0]) as any)?.mx ?? 0);

      let inseridos = 0;
      for (const empId of aInserir) {
        ordem += 1;
        // dedup: 1 entrada ativa por funcionário (índice único parcial garante no banco)
        const r: any = await db.execute(sql`
          INSERT INTO plano_desligamento (company_id, employee_id, mes_planejado, ordem, status, criado_por)
          VALUES (${input.companyId}, ${empId}, ${input.mesPlanejado}, ${ordem}, 'planejado', ${ctx.user.name || ctx.user.email || ""})
          ON CONFLICT (company_id, employee_id) WHERE deleted_at IS NULL DO NOTHING
          RETURNING id
        `);
        const row = (Array.isArray(r) ? r[0] : r?.rows?.[0]);
        if (row) inseridos++;
      }
      try { await createAuditLog({ companyId: input.companyId, userId: ctx.user.id, userName: ctx.user.name || "", action: "create", entityType: "plano_desligamento", entityId: 0, details: `Plano de Desligamento: ${inseridos} funcionário(s) programado(s) para ${input.mesPlanejado}` }); } catch {}
      // Master adicionando em plano consolidado: registra revisão
      if (estadoAdd.consolidado && isMaster(ctx.user) && inseridos > 0) {
        try { await gravarRevisao(db, input.companyId, `Admin Master adicionou ${inseridos} pessoa(s) em ${input.mesPlanejado}`, ctx.user.name || ctx.user.email || ""); } catch {}
      }
      return { inseridos };
    }),

  // Atualiza mês, ordem, status ou observações
  update: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      mesPlanejado: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      ordem: z.number().optional(),
      status: z.enum(STATUS_VALIDOS).optional(),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(planoDesligamento).where(and(
        eq(planoDesligamento.id, input.id),
        eq(planoDesligamento.companyId, input.companyId),
        isNull(planoDesligamento.deletedAt),
      ));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      // Consolidado + não-master: mudança de mês/status vira solicitação pendente
      const estadoUpd = await getEstadoPlano(db, input.companyId);
      if (estadoUpd.consolidado && !isMaster(ctx.user)) {
        const mudaMes = input.mesPlanejado !== undefined && input.mesPlanejado !== row.mesPlanejado;
        const mudaStatus = input.status !== undefined && input.status !== row.status;
        if (mudaMes || mudaStatus) {
          const nomeR: any = await db.execute(sql`SELECT "nomeCompleto" AS nome FROM employees WHERE id = ${row.employeeId}`);
          const nome = String(rowsOf(nomeR)[0]?.nome ?? "");
          if (mudaMes) await registrarMudanca(db, input.companyId, { tipo: "mover", itemId: input.id, employeeId: row.employeeId, employeeNome: nome, de: row.mesPlanejado, para: input.mesPlanejado! }, ctx.user.name || ctx.user.email || "");
          if (mudaStatus) await registrarMudanca(db, input.companyId, { tipo: "status", itemId: input.id, employeeId: row.employeeId, employeeNome: nome, de: row.status, para: input.status! }, ctx.user.name || ctx.user.email || "");
          // Observações continuam liberadas (não alteram o plano aprovado)
          if (input.observacoes !== undefined) {
            await db.update(planoDesligamento).set({ observacoes: input.observacoes, atualizadoEm: new Date() }).where(eq(planoDesligamento.id, input.id));
          }
          return { ok: true, pendente: true };
        }
        // Reordenação dentro do mês também é parte do plano aprovado — bloqueia
        if (input.ordem !== undefined && input.ordem !== row.ordem) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Plano consolidado — reordenação só pelo Admin Master ou via solicitação" });
        }
      }

      const upd: any = { atualizadoEm: new Date() };
      if (input.mesPlanejado !== undefined && input.mesPlanejado !== row.mesPlanejado) {
        upd.mesPlanejado = input.mesPlanejado;
        // Mudou de mês: entra no FIM da fila do novo mês (ordem sequencial real)
        if (input.ordem === undefined) {
          const mx: any = await db.execute(sql`
            SELECT COALESCE(MAX(ordem), 0)::int AS mx FROM plano_desligamento
            WHERE company_id = ${input.companyId} AND mes_planejado = ${input.mesPlanejado} AND deleted_at IS NULL
          `);
          upd.ordem = Number(((Array.isArray(mx) ? mx[0] : mx?.rows?.[0]) as any)?.mx ?? 0) + 1;
        }
      }
      if (input.ordem !== undefined) upd.ordem = input.ordem;
      if (input.status !== undefined) upd.status = input.status;
      if (input.observacoes !== undefined) upd.observacoes = input.observacoes;
      await db.update(planoDesligamento).set(upd).where(eq(planoDesligamento.id, input.id));
      // Master editando plano consolidado: registra revisão (trilha de auditoria)
      if (estadoUpd.consolidado && isMaster(ctx.user) && (upd.mesPlanejado !== undefined || upd.status !== undefined)) {
        try { await gravarRevisao(db, input.companyId, `Edição direta do Admin Master: item #${input.id}${upd.mesPlanejado ? ` → ${upd.mesPlanejado}` : ""}${upd.status ? ` (status ${upd.status})` : ""}`, ctx.user.name || ctx.user.email || ""); } catch {}
      }
      return { ok: true };
    }),

  // IA: sugere cronograma de desligamento mês a mês considerando fluxo de caixa
  sugerirCronogramaIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      mesPico: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      mesesDiluicao: z.number().int().min(1).max(36).optional(),
      maxPorMes: z.number().positive().optional(),
      minPorMes: z.number().positive().optional(),
      instrucoes: z.string().max(400).optional(),
      prioridades: z.array(z.enum(["faltas", "atestados", "advertencias", "pontualidade"])).max(4).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      await assertAiModuleEnabled(input.companyId, "plano_desligamento");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
      // Itens ativos do plano + dados p/ custo estimado da rescisão
      const itensRes: any = await db.execute(sql`
        SELECT pd.id, pd.mes_planejado AS mes, e."nomeCompleto" AS nome,
               CASE WHEN UPPER(COALESCE(e."tipoContrato", '')) = 'PJ'
                 THEN COALESCE((SELECT pc."valorMensal"::text FROM pj_contracts pc
                   WHERE pc."employeeId" = e.id AND pc."companyId" = ${input.companyId}
                     AND pc.status = 'ativo' AND pc."deletedAt" IS NULL
                   ORDER BY pc.id DESC LIMIT 1), e."salarioBase")
                 ELSE e."salarioBase" END AS sal,
               e."dataAdmissao" AS adm, e."tipoContrato" AS tipo_contrato,
               (SELECT COUNT(*) FROM vacation_periods vp WHERE vp."employeeId" = e.id AND vp."deletedAt" IS NULL
                 AND vp.status IN ('pendente','vencida') AND vp."periodoConcessivoFim" < CURRENT_DATE AND UPPER(COALESCE(e."tipoContrato",'')) NOT IN ('PJ','SOCIO')) AS ferias_vencidas,
               (SELECT COUNT(*) FROM vacation_periods vp WHERE vp."employeeId" = e.id AND vp."deletedAt" IS NULL
                 AND vp.status IN ('pendente','vencida') AND UPPER(COALESCE(e."tipoContrato",'')) NOT IN ('PJ','SOCIO')) AS ferias_pendentes,
               (SELECT COUNT(*) FROM time_records tr
                 WHERE tr."employeeId" = e.id AND tr."companyId" = ${input.companyId}
                   AND tr.data BETWEEN (CURRENT_DATE - INTERVAL '12 months')::date AND CURRENT_DATE
                   AND (CASE
                     WHEN tr.faltas ~ '^\\d+:\\d+$' THEN split_part(tr.faltas, ':', 1)::numeric + split_part(tr.faltas, ':', 2)::numeric / 60
                     WHEN tr.faltas ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr.faltas, ',', '.')::numeric
                     ELSE 0 END) > 0
                   AND to_char(tr.data, 'YYYY-MM') IN (
                     SELECT pc."mesReferencia" FROM ponto_consolidacao pc
                     WHERE pc."companyId" = ${input.companyId} AND pc.status = 'consolidado')) AS faltas_12m,
               (SELECT COUNT(*) FROM atestados a
                 WHERE a."employeeId" = e.id AND a."companyId" = ${input.companyId} AND a."deletedAt" IS NULL
                   AND a."dataEmissao" >= (CURRENT_DATE - INTERVAL '12 months')::date) AS atestados_12m,
               (SELECT COUNT(*) FROM warnings w
                 WHERE w."employeeId" = e.id AND w."companyId" = ${input.companyId} AND w."deletedAt" IS NULL
                   AND w."dataOcorrencia" >= (CURRENT_DATE - INTERVAL '12 months')::date) AS advertencias_12m,
               (SELECT COUNT(*) FROM time_records tr
                 WHERE tr."employeeId" = e.id AND tr."companyId" = ${input.companyId}
                   AND tr.data BETWEEN (CURRENT_DATE - INTERVAL '12 months')::date AND CURRENT_DATE
                   AND (CASE
                     WHEN tr.atrasos ~ '^\\d+:\\d+$' THEN split_part(tr.atrasos, ':', 1)::numeric * 60 + split_part(tr.atrasos, ':', 2)::numeric
                     WHEN tr.atrasos ~ '^\\d+([.,]\\d+)?$' THEN REPLACE(tr.atrasos, ',', '.')::numeric
                     ELSE 0 END) > 0
                   AND to_char(tr.data, 'YYYY-MM') IN (
                     SELECT pc."mesReferencia" FROM ponto_consolidacao pc
                     WHERE pc."companyId" = ${input.companyId} AND pc.status = 'consolidado')) AS atrasos_12m
        FROM plano_desligamento pd
        JOIN employees e ON e.id = pd.employee_id
        WHERE pd.company_id = ${input.companyId} AND pd.deleted_at IS NULL
          AND pd.status NOT IN ('desligado','cancelado')
      `);
      const itens = rows(itensRes);
      if (itens.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum desligamento programado no plano." });

      const parseBR = (v: any): number => {
        if (v === null || v === undefined) return 0;
        let s = String(v).replace(/[R$\s]/g, "");
        if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "3.000" = milhar BR
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      };
      const custo = (it: any): number => {
        const sal = parseBR(it.sal);
        if (!sal) return 0;
        if (String(it.tipo_contrato || "").toUpperCase() === "PJ") return (sal / 30) * 15;
        const adm = new Date(String(it.adm ?? "").slice(0, 10) + "T00:00:00");
        if (isNaN(adm.getTime())) return sal * 2;
        const meses = Math.max(0, Math.floor((Date.now() - adm.getTime()) / (30.44 * 86400000)));
        const dias = Math.min(90, 30 + Math.floor(meses / 12) * 3);
        const aviso = (sal / 30) * dias;
        const decimo = sal * ((new Date().getMonth() + 1) / 12);
        // Férias vencida paga em DOBRO na rescisão (art. 137 CLT) + 1/3
        const ferias = (Number(it.ferias_vencidas ?? 0) * sal * 2 + sal * ((meses % 12) / 12)) * (4 / 3);
        return aviso + decimo + ferias + sal * 0.08 * meses * 0.4;
      };

      // Fluxo de caixa: realizado (últimos 6 meses) + pendente por vencimento (próximos 6)
      const fluxoRes: any = await db.execute(sql`
        SELECT to_char(data_pagamento, 'YYYY-MM') AS mes, tipo, ROUND(SUM(COALESCE(valor_realizado, 0)))::bigint AS total
        FROM financial_entries
        WHERE company_id = ${input.companyId} AND data_pagamento >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY 1, 2 ORDER BY 1
      `);
      const pendRes: any = await db.execute(sql`
        SELECT to_char(data_vencimento, 'YYYY-MM') AS mes, tipo, ROUND(SUM(COALESCE(valor_previsto, 0)))::bigint AS total
        FROM financial_entries
        WHERE company_id = ${input.companyId} AND status = 'pendente'
          AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months'
        GROUP BY 1, 2 ORDER BY 1
      `);

      const hoje = new Date();
      const mesesValidos: string[] = [];
      for (let i = 0; i < 36; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        mesesValidos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const lista = itens.map((it: any) => ({
        id: Number(it.id), nome: String(it.nome), mesAtual: String(it.mes),
        custoEstimado: Math.round(custo(it)),
        feriasVencidas: Number(it.ferias_vencidas ?? 0), feriasPendentes: Number(it.ferias_pendentes ?? 0),
        pj: String(it.tipo_contrato || "").toUpperCase() === "PJ",
        faltas12m: Number(it.faltas_12m ?? 0), atestados12m: Number(it.atestados_12m ?? 0),
        advertencias12m: Number(it.advertencias_12m ?? 0), atrasos12m: Number(it.atrasos_12m ?? 0),
      }));

      // Critérios de prioridade escolhidos pelo gestor (default: faltas + atestados)
      const prios = input.prioridades && input.prioridades.length ? input.prioridades : ["faltas", "atestados"];
      const PRIO_LABEL: Record<string, string> = {
        faltas: "faltas12m (faltas)", atestados: "atestados12m (atestados)",
        advertencias: "advertencias12m (advertências disciplinares)", pontualidade: "atrasos12m (atrasos/pontualidade)",
      };

      const prompt = `Você é o planejador financeiro de uma construtora. Distribua as demissões programadas nos próximos meses para DILUIR o desembolso das rescisões conforme o fluxo de caixa, mantendo a meta de reduzir o quadro o quanto antes.

FLUXO DE CAIXA REALIZADO (últimos meses, R$): ${JSON.stringify(rows(fluxoRes))}
CONTAS PENDENTES POR VENCIMENTO (próximos meses, R$): ${JSON.stringify(rows(pendRes))}
DEMISSÕES PROGRAMADAS (custo estimado da rescisão em R$): ${JSON.stringify(lista)}
MESES VÁLIDOS: ${mesesValidos.join(", ")}

Regras:
${input.mesInicio ? `- DIRETRIZ DO GESTOR (OBRIGATÓRIA): NENHUMA demissão antes de ${input.mesInicio}. Todos os meses sugeridos devem ser >= ${input.mesInicio}. Quem precisa gozar férias antes deve iniciar as férias de modo que a demissão caia a partir de ${input.mesInicio}.` : ""}
${input.mesPico ? `- DIRETRIZ DO GESTOR (OBRIGATÓRIA): concentrar o MAIOR número de demissões em ${input.mesPico}, distribuindo o restante nos meses vizinhos conforme o caixa.` : ""}
${input.mesesDiluicao ? `- DIRETRIZ DO GESTOR (OBRIGATÓRIA): diluir TODAS as demissões em no máximo ${input.mesesDiluicao} mês(es) a partir do mês inicial — nenhuma sugestão fora dessa janela.` : ""}
${input.maxPorMes ? `- DIRETRIZ DO GESTOR (OBRIGATÓRIA): o desembolso total de rescisões em CADA mês não pode passar de R$ ${Math.round(input.maxPorMes)}. Some os custoEstimado por mês e respeite o teto.` : ""}
${input.minPorMes ? `- DIRETRIZ DO GESTOR: sempre que houver itens suficientes, cada mês usado deve somar pelo menos R$ ${Math.round(input.minPorMes)} em rescisões (evitar meses com valor irrisório — melhor concentrar).` : ""}
${input.instrucoes ? `- INSTRUÇÕES ADICIONAIS DO GESTOR (prioridade máxima): ${JSON.stringify(input.instrucoes.slice(0, 400))}` : ""}
${!input.mesInicio && !input.mesPico ? `- DIRETRIZ PADRÃO: começar com POUCOS desligamentos no mês corrente (só os mais baratos/urgentes, ex.: PJ e quem tem férias em dia e baixo custo) e concentrar a MAIORIA nos 4 meses seguintes, distribuída de forma equilibrada.` : ""}
- Quem tem feriasVencidas>0 ou feriasPendentes>0: sugerir mês que permita gozar férias antes (1-2 meses depois), reduzindo o custo da rescisão.
- Espalhar os custos para nenhum mês concentrar desembolso muito acima dos demais, priorizando meses de caixa mais folgado.
- PJ é barato de desligar (15 dias) — pode antecipar.
- PRINCÍPIO DE PRIORIDADE (regra do gestor): os critérios escolhidos são ${prios.map(p => PRIO_LABEL[p]).join(" + ")}. Quem tem os maiores valores nesses campos é o mais problemático — dentro das diretrizes acima, priorize desligar essas pessoas PRIMEIRO (meses mais cedo). Quem tem zero nesses critérios pode ficar para os últimos meses.
- Responda SOMENTE JSON: {"resumo":"texto curto (3-5 frases) explicando a lógica","sugestoes":[{"id":<id do item>,"mes":"YYYY-MM","motivo":"curto"}]} com TODOS os itens.`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4000,
        response_format: { type: "json_object" },
        fast: true,
      } as any);

      // Sanitização determinística: ids do plano, meses válidos, textos limitados
      let parsed: any = null;
      try {
        const c = (result as any)?.choices?.[0]?.message?.content;
        const raw = typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
        parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, ""));
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA retornou um formato inválido. Tente novamente." });
      }
      const idsValidos = new Map(lista.map((l: any) => [l.id, l]));
      // Mapa 1-para-1: dedup por id (primeira sugestão válida vence)…
      const porId = new Map<number, any>();
      for (const s of (Array.isArray(parsed?.sugestoes) ? parsed.sugestoes : [])) {
        const id = Number(s?.id);
        // Janela de diluição: mês inicial (informado ou mês corrente) + N-1 meses
        let mesFimJanela: string | null = null;
        if (input.mesesDiluicao) {
          const base = input.mesInicio ?? mesesValidos[0];
          const [by, bm] = base.split("-").map(Number);
          const fim = new Date(by, bm - 1 + input.mesesDiluicao - 1, 1);
          mesFimJanela = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}`;
        }
        const mesOk = mesesValidos.includes(String(s?.mes))
          && (!input.mesInicio || String(s?.mes) >= input.mesInicio)
          && (!mesFimJanela || String(s?.mes) <= mesFimJanela);
        if (idsValidos.has(id) && mesOk && !porId.has(id)) porId.set(id, s);
      }
      if (porId.size === 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não retornou sugestões válidas. Tente novamente." });
      // …e itens omitidos pela IA entram como "mantém o mês atual" (nunca sumir gente da lista)
      const sugestoes = lista.map((base: any) => {
        const s = porId.get(base.id);
        return {
          id: base.id, nome: base.nome, mesAtual: base.mesAtual,
          mesSugerido: s ? String(s.mes) : base.mesAtual, custoEstimado: base.custoEstimado,
          faltas12m: base.faltas12m ?? 0, atestados12m: base.atestados12m ?? 0,
          advertencias12m: base.advertencias12m ?? 0, atrasos12m: base.atrasos12m ?? 0,
          motivo: s ? String(s?.motivo ?? "").slice(0, 200) : "(sem sugestão da IA — mantido)",
        };
      });

      // Redistribuição DETERMINÍSTICA: a IA às vezes concentra tudo em poucos meses.
      // Se o gestor pediu diluição e/ou teto por mês, o servidor re-empacota mês a mês
      // (na ordem sugerida pela IA), garantindo teto respeitado e janela inteira usada.
      if (input.mesesDiluicao || input.maxPorMes) {
        const base = input.mesInicio ?? mesesValidos[0];
        const [by, bm] = base.split("-").map(Number);
        const nMeses = input.mesesDiluicao ?? Math.max(1, mesesValidos.filter(m => m >= base).length);
        const janela: string[] = [];
        for (let i = 0; i < nMeses; i++) {
          const d = new Date(by, bm - 1 + i, 1);
          janela.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        // Ordena pela preferência da IA (mês sugerido), depois problemáticos primeiro
        // (mais faltas/atestados = prioridade de desligamento), depois custo menor
        const probl = (x: any) =>
          (prios.includes("faltas") ? (Number(x.faltas12m) || 0) * 2 : 0) +
          (prios.includes("advertencias") ? (Number(x.advertencias12m) || 0) * 2 : 0) +
          (prios.includes("atestados") ? (Number(x.atestados12m) || 0) : 0) +
          (prios.includes("pontualidade") ? (Number(x.atrasos12m) || 0) * 0.5 : 0);
        const fila = [...sugestoes].sort((a, b) =>
          a.mesSugerido < b.mesSugerido ? -1 : a.mesSugerido > b.mesSugerido ? 1 :
          probl(b) - probl(a) ||
          ((Number(a.custoEstimado) || 0) - (Number(b.custoEstimado) || 0)));
        const totalCusto = fila.reduce((s, x) => s + (Number(x.custoEstimado) || 0), 0);
        // Teto efetivo: o informado, ou (sem teto) a média p/ diluir de forma equilibrada
        const teto = input.maxPorMes ?? Math.max(1, Math.ceil(totalCusto / janela.length));
        let mi = 0; let acum = 0; let qtdNoMes = 0;
        for (const item of fila) {
          const c = Number(item.custoEstimado) || 0;
          // Estoura o teto e o mês já tem alguém? Avança (até o último mês da janela)
          while (mi < janela.length - 1 && qtdNoMes > 0 && acum + c > teto) { mi++; acum = 0; qtdNoMes = 0; }
          const novoMes = janela[mi];
          if (novoMes !== item.mesSugerido) {
            item.mesSugerido = novoMes;
            item.motivo = `${item.motivo} · remanejado p/ respeitar teto/diluição`.slice(0, 240);
          }
          acum += c; qtdNoMes++;
        }
      }
      return { resumo: String(parsed?.resumo ?? "").slice(0, 800), sugestoes };
    }),

  // Remove do plano (soft delete)
  remove: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertAcesso(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Consolidado + não-master: remoção vira solicitação pendente
      const estadoDel = await getEstadoPlano(db, input.companyId);
      if (estadoDel.consolidado && !isMaster(ctx.user)) {
        const rDel: any = await db.execute(sql`
          SELECT pd.employee_id AS eid, pd.mes_planejado AS mes, e."nomeCompleto" AS nome
          FROM plano_desligamento pd JOIN employees e ON e.id = pd.employee_id
          WHERE pd.id = ${input.id} AND pd.company_id = ${input.companyId} AND pd.deleted_at IS NULL`);
        const rowDel = rowsOf(rDel)[0];
        if (!rowDel) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        await registrarMudanca(db, input.companyId, { tipo: "remover", itemId: input.id, employeeId: Number(rowDel.eid), employeeNome: String(rowDel.nome), de: String(rowDel.mes) }, ctx.user.name || ctx.user.email || "");
        return { ok: true, pendente: true };
      }
      const res = await db.update(planoDesligamento)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(planoDesligamento.id, input.id),
          eq(planoDesligamento.companyId, input.companyId),
          isNull(planoDesligamento.deletedAt),
        ));
      // Master removendo de plano consolidado: registra revisão
      if (estadoDel.consolidado && isMaster(ctx.user)) {
        try { await gravarRevisao(db, input.companyId, `Admin Master removeu item #${input.id} do plano`, ctx.user.name || ctx.user.email || ""); } catch {}
      }
      return { ok: true };
    }),
});
