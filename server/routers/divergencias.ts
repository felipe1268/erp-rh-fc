/**
 * server/routers/divergencias.ts
 * Rev. 4682 — POKA-YOKE 2/6: CENTRAL DE DIVERGÊNCIAS ENTRE MÓDULOS
 *
 * Verificações 100% de LEITURA que cruzam módulos e apontam registros
 * desencontrados. Nada é corrigido automaticamente — o usuário decide.
 * Cada check roda em try/catch próprio: falha vira item em falhasChecks
 * (nunca "0 divergências" falso — regra da Rev. 4681).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { sql } from "drizzle-orm";

const DESLIGADOS = ["Desligado", "Lista_Negra", "Inativo"];

async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  // Rev. 4682 — aqui NÃO seguimos o padrão legado "lista vazia = global":
  // esta tela cruza dados de RH + Financeiro; sem vínculo explícito = negado.
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

export const divergenciasRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const c = input.companyId;

      const falhasChecks: string[] = [];
      const run = async (label: string, fn: () => Promise<any[]>): Promise<any[]> => {
        try { return await fn(); } catch (e: any) {
          console.error(`[Divergencias] check "${label}" falhou:`, e?.message ?? e);
          falhasChecks.push(label);
          return [];
        }
      };
      const rows = async (q: any) => ((await db.execute(q)) as any)?.rows ?? [];

      const [avisoAtivo, desligadoObra, desligadoEpi, desligadoSeguro, chequeTitulo, medicaoDupla, ocSemFinanceiro, financeiroOrfao, feriasPonto] = await Promise.all([
        // 1. Funcionário "Ativo" com aviso prévio em andamento
        run("Ativo com aviso prévio", () => rows(sql`
          SELECT DISTINCT ON (e.id) e.id AS "employeeId", e."nomeCompleto" AS nome,
                 tn."dataInicio" AS "avisoInicio", tn."dataFim" AS "avisoFim"
          FROM employees e
          JOIN termination_notices tn ON tn."employeeId" = e.id AND tn.status = 'em_andamento'
          WHERE e."companyId" = ${c} AND e.status = 'Ativo'
          ORDER BY e.id, tn."dataFim" DESC
          LIMIT 200
        `)),
        // 2. Desligado ainda alocado em obra (isActive=1)
        run("Desligado alocado em obra", () => rows(sql`
          SELECT DISTINCT ON (e.id) e.id AS "employeeId", e."nomeCompleto" AS nome, e.status,
                 o.nome AS obra
          FROM obra_funcionarios ofu
          JOIN employees e ON e.id = ofu."employeeId"
          LEFT JOIN obras o ON o.id = ofu."obraId"
          WHERE ofu."companyId" = ${c} AND ofu."isActive" = 1
            AND e.status IN (${DESLIGADOS[0]}, ${DESLIGADOS[1]}, ${DESLIGADOS[2]})
          ORDER BY e.id
          LIMIT 200
        `)),
        // 3a. Desligado com EPI não devolvido
        run("Desligado com EPI em aberto", () => rows(sql`
          SELECT e.id AS "employeeId", e."nomeCompleto" AS nome, COUNT(*)::int AS "episAbertos"
          FROM epi_deliveries d
          JOIN employees e ON e.id = d."employeeId"
          WHERE d."companyId" = ${c} AND d."dataDevolucao" IS NULL AND d."deletedAt" IS NULL
            AND e.status IN (${DESLIGADOS[0]}, ${DESLIGADOS[1]}, ${DESLIGADOS[2]})
          GROUP BY e.id, e."nomeCompleto"
          ORDER BY 3 DESC
          LIMIT 200
        `)),
        // 3b. Desligado com seguro de vida ativo
        run("Desligado com seguro ativo", () => rows(sql`
          SELECT e.id AS "employeeId", e."nomeCompleto" AS nome, sv.status AS "seguroStatus"
          FROM seguro_vida_coberturas sv
          JOIN employees e ON e.id = sv.employee_id
          WHERE sv.company_id = ${c} AND sv.status IN ('ativo', 'pendente_inclusao')
            AND e.status IN (${DESLIGADOS[0]}, ${DESLIGADOS[1]}, ${DESLIGADOS[2]})
          LIMIT 200
        `)),
        // 4. Cheque × título desencontrados (nos 2 sentidos)
        run("Cheque × título", () => rows(sql`
          SELECT ch.id AS "chequeId", ch.numero_cheque AS "numeroCheque", ch.valor,
                 ch.status AS "chequeStatus", fe.id AS "entryId", fe.status AS "tituloStatus"
          FROM financial_cheques ch
          JOIN financial_entries fe ON fe.id = ch.lancamento_id
          WHERE ch.company_id = ${c}
            AND ((ch.status IN ('compensado', 'baixado') AND fe.status NOT IN ('pago', 'recebido', 'cancelado'))
              OR (fe.status IN ('pago', 'recebido') AND ch.status = 'pendente'))
          LIMIT 200
        `)),
        // 5. Medição duplicada no Contas a Receber
        run("Medição duplicada", () => rows(sql`
          SELECT origem_id AS "medicaoId", COUNT(*)::int AS lancamentos,
                 SUM(valor_previsto)::numeric(15,2) AS "valorTotal"
          FROM financial_entries
          WHERE company_id = ${c} AND origem_modulo = 'planejamento_medicao'
            AND origem_id IS NOT NULL AND status <> 'cancelado'
          GROUP BY origem_id
          HAVING COUNT(*) > 1
          LIMIT 200
        `)),
        // 6a. OC entregue sem lançamento financeiro
        run("OC entregue sem financeiro", () => rows(sql`
          SELECT oc.id AS "ocId", oc.numero_oc AS "numeroOc", oc.fornecedor_nome AS fornecedor, oc.status
          FROM compras_ordens oc
          WHERE oc.company_id = ${c} AND oc.status IN ('entregue', 'entregue_parcial', 'recebida')
            AND oc.financial_entry_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM financial_entries fe
              WHERE fe.company_id = oc.company_id
                AND fe.origem_modulo IN ('compras', 'compra_oc')
                AND fe.origem_id = oc.id AND fe.status <> 'cancelado')
          LIMIT 200
        `)),
        // 6b. Financeiro órfão de OC cancelada
        run("Financeiro órfão de OC cancelada", () => rows(sql`
          SELECT fe.id AS "entryId", fe.valor_previsto AS valor, fe.status AS "tituloStatus",
                 oc.numero_oc AS "numeroOc"
          FROM financial_entries fe
          JOIN compras_ordens oc ON oc.id = fe.origem_id AND oc.company_id = fe.company_id
          WHERE fe.company_id = ${c} AND fe.origem_modulo IN ('compras', 'compra_oc')
            AND oc.status = 'cancelada' AND fe.status NOT IN ('cancelado', 'pago')
          LIMIT 200
        `)),
        // 7. Férias em gozo com ponto batido no período (últimos 12 meses)
        run("Férias com ponto batido", () => rows(sql`
          SELECT e.id AS "employeeId", e."nomeCompleto" AS nome,
                 vp."dataInicio" AS "feriasInicio", vp."dataFim" AS "feriasFim",
                 COUNT(tr.id)::int AS batidas
          FROM vacation_periods vp
          JOIN employees e ON e.id = vp."employeeId"
          JOIN time_records tr ON tr."employeeId" = vp."employeeId"
            AND tr.data BETWEEN vp."dataInicio" AND vp."dataFim"
            AND COALESCE(tr.entrada1, '') <> ''
          WHERE vp."companyId" = ${c} AND vp.status NOT IN ('cancelada', 'cancelado')
            AND vp."dataFim" >= (CURRENT_DATE - INTERVAL '12 months')
          GROUP BY e.id, e."nomeCompleto", vp."dataInicio", vp."dataFim"
          LIMIT 200
        `)),
      ]);

      const checks = [
        { key: "aviso_ativo", titulo: "Funcionário \u201cAtivo\u201d com aviso prévio em andamento", modulo: "RH × Aviso Prévio", itens: avisoAtivo },
        { key: "desligado_obra", titulo: "Desligado ainda alocado em obra", modulo: "RH × Obras", itens: desligadoObra },
        { key: "desligado_epi", titulo: "Desligado com EPI não devolvido", modulo: "RH × EPI", itens: desligadoEpi },
        { key: "desligado_seguro", titulo: "Desligado com seguro de vida ativo", modulo: "RH × Seguro de Vida", itens: desligadoSeguro },
        { key: "cheque_titulo", titulo: "Cheque × título desencontrados", modulo: "Cheques × Contas a Pagar", itens: chequeTitulo },
        { key: "medicao_dupla", titulo: "Medição duplicada no Contas a Receber", modulo: "Medição × Financeiro", itens: medicaoDupla },
        { key: "oc_sem_financeiro", titulo: "OC entregue sem lançamento financeiro", modulo: "Compras × Financeiro", itens: ocSemFinanceiro },
        { key: "financeiro_orfao", titulo: "Financeiro em aberto de OC cancelada", modulo: "Compras × Financeiro", itens: financeiroOrfao },
        { key: "ferias_ponto", titulo: "Férias com ponto batido no período", modulo: "Férias × Ponto", itens: feriasPonto },
      ];
      const totalDivergencias = checks.reduce((s, ck) => s + ck.itens.length, 0);
      return { checks, totalDivergencias, falhasChecks };
    }),
});
