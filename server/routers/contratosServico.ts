/**
 * Contratos de Serviço Continuado — Rev. 5151
 * Gestão de contratos recorrentes (contabilidade, jurídico, saúde ocupacional, etc.)
 * com itens de cobrança variáveis linkados ao RH (headcount, admissões, demissões, folha).
 */
import { z } from "zod";
import { sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

const db = getDb();

function assertAdmin(ctx: any) {
  if (!["admin_master", "admin"].includes(ctx.user?.role ?? ""))
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
}

function assertCompany(ctx: any, companyId: number) {
  const u = ctx.user;
  if (u.role === "admin_master") return;
  const ids: number[] = Array.isArray(u.allowedCompanyIds) ? u.allowedCompanyIds : [];
  if (!ids.includes(companyId))
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
}

const TIPOS_SERVICO = ["contabilidade","juridico","saude_ocupacional","limpeza","seguranca","ti","outro"] as const;
const TIPOS_ITEM   = ["fixo","por_funcionario_ativo","por_admissao","por_demissao","por_exame","por_folha","outro"] as const;
const STATUS_COMP  = ["aberta","com_fatura","aprovada","paga"] as const;

// ─── listar ──────────────────────────────────────────────────────────────────
export const contratosServicoRouter = router({

  listar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      const rows = await db.execute(sql`
        SELECT cs.id, cs.nome, cs.tipo_servico, cs.status, cs.vigencia_inicio, cs.vigencia_fim,
               cs.renovacao_automatica, cs.dia_vencimento, cs.tolerancia_divergencia,
               f.razao_social AS fornecedor_nome, f.id AS fornecedor_id,
               (SELECT count(*)::int FROM contratos_servico_itens WHERE contrato_id = cs.id) AS total_itens,
               (SELECT sum(valor_unitario) FROM contratos_servico_itens
                WHERE contrato_id = cs.id AND tipo = 'fixo') AS valor_fixo_mensal
        FROM contratos_servico cs
        LEFT JOIN fornecedores f ON f.id = cs.fornecedor_id
        WHERE cs.company_id = ${input.companyId} AND cs.deleted_at IS NULL
        ORDER BY cs.nome
      `);
      return (rows.rows ?? rows) as any[];
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      const rows = await db.execute(sql`
        SELECT cs.*, f.razao_social AS fornecedor_nome
        FROM contratos_servico cs
        LEFT JOIN fornecedores f ON f.id = cs.fornecedor_id
        WHERE cs.id = ${input.id} AND cs.company_id = ${input.companyId} AND cs.deleted_at IS NULL
      `);
      const contrato = (rows.rows ?? rows)[0];
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND" });

      const itens = await db.execute(sql`
        SELECT * FROM contratos_servico_itens
        WHERE contrato_id = ${input.id}
        ORDER BY id
      `);
      const comps = await db.execute(sql`
        SELECT * FROM contratos_servico_competencias
        WHERE contrato_id = ${input.id}
        ORDER BY competencia DESC
        LIMIT 24
      `);
      return {
        ...contrato,
        itens: (itens.rows ?? itens) as any[],
        competencias: (comps.rows ?? comps) as any[],
      };
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(2),
      tipoServico: z.enum(TIPOS_SERVICO),
      fornecedorId: z.number().nullable().optional(),
      vigenciaInicio: z.string().nullable().optional(),
      vigenciaFim: z.string().nullable().optional(),
      renovacaoAutomatica: z.boolean().default(false),
      diaVencimento: z.number().min(1).max(31).default(10),
      toleranciaDivergencia: z.number().min(0).max(100).default(5),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      const r = await db.execute(sql`
        INSERT INTO contratos_servico (
          company_id, nome, tipo_servico, fornecedor_id,
          vigencia_inicio, vigencia_fim, renovacao_automatica,
          dia_vencimento, tolerancia_divergencia, observacoes,
          status, created_by, created_at, updated_at
        ) VALUES (
          ${input.companyId}, ${input.nome}, ${input.tipoServico},
          ${input.fornecedorId ?? null},
          ${input.vigenciaInicio ?? null}, ${input.vigenciaFim ?? null},
          ${input.renovacaoAutomatica}, ${input.diaVencimento},
          ${input.toleranciaDivergencia}, ${input.observacoes ?? null},
          'ativo', ${ctx.user.id}, now(), now()
        ) RETURNING id
      `);
      return { id: (r.rows ?? r)[0].id };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(2),
      tipoServico: z.enum(TIPOS_SERVICO),
      fornecedorId: z.number().nullable().optional(),
      vigenciaInicio: z.string().nullable().optional(),
      vigenciaFim: z.string().nullable().optional(),
      renovacaoAutomatica: z.boolean(),
      diaVencimento: z.number().min(1).max(31),
      toleranciaDivergencia: z.number().min(0).max(100),
      observacoes: z.string().nullable().optional(),
      status: z.enum(["ativo", "encerrado"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      await db.execute(sql`
        UPDATE contratos_servico SET
          nome = ${input.nome}, tipo_servico = ${input.tipoServico},
          fornecedor_id = ${input.fornecedorId ?? null},
          vigencia_inicio = ${input.vigenciaInicio ?? null},
          vigencia_fim = ${input.vigenciaFim ?? null},
          renovacao_automatica = ${input.renovacaoAutomatica},
          dia_vencimento = ${input.diaVencimento},
          tolerancia_divergencia = ${input.toleranciaDivergencia},
          observacoes = ${input.observacoes ?? null},
          status = ${input.status ?? "ativo"},
          updated_at = now()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
      `);
      return { ok: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      await db.execute(sql`
        UPDATE contratos_servico
        SET deleted_at = now()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  // ── Fornecedores (para o select) ──────────────────────────────────────────
  listarFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx);
      assertCompany(ctx, input.companyId);
      const rows = await db.execute(sql`
        SELECT id, razao_social, cnpj
        FROM fornecedores
        WHERE company_id = ${input.companyId}
        ORDER BY razao_social
        LIMIT 200
      `);
      return (rows.rows ?? rows) as any[];
    }),

  // ── Itens de cobrança ─────────────────────────────────────────────────────
  itens: router({
    criar: protectedProcedure
      .input(z.object({
        contratoId: z.number(),
        companyId: z.number(),
        tipo: z.enum(TIPOS_ITEM),
        descricao: z.string().nullable().optional(),
        valorUnitario: z.number().nullable().optional(),
        percentual: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);
        // Verify contrato belongs to company
        const chk = await db.execute(sql`
          SELECT id FROM contratos_servico
          WHERE id = ${input.contratoId} AND company_id = ${input.companyId} AND deleted_at IS NULL
        `);
        if (!(chk.rows ?? chk).length) throw new TRPCError({ code: "NOT_FOUND" });

        await db.execute(sql`
          INSERT INTO contratos_servico_itens (contrato_id, company_id, tipo, descricao, valor_unitario, percentual)
          VALUES (${input.contratoId}, ${input.companyId}, ${input.tipo},
                  ${input.descricao ?? null}, ${input.valorUnitario ?? null}, ${input.percentual ?? null})
        `);
        return { ok: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);
        await db.execute(sql`
          DELETE FROM contratos_servico_itens WHERE id = ${input.id} AND company_id = ${input.companyId}
        `);
        return { ok: true };
      }),
  }),

  // ── Competências (ciclo mensal) ───────────────────────────────────────────
  competencias: router({

    listar: protectedProcedure
      .input(z.object({ contratoId: z.number(), companyId: z.number() }))
      .query(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);
        const rows = await db.execute(sql`
          SELECT * FROM contratos_servico_competencias
          WHERE contrato_id = ${input.contratoId} AND company_id = ${input.companyId}
          ORDER BY competencia DESC
        `);
        return (rows.rows ?? rows) as any[];
      }),

    /** Calcula valor esperado para uma competência a partir dos dados de RH */
    calcular: protectedProcedure
      .input(z.object({
        contratoId: z.number(),
        companyId: z.number(),
        competencia: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
        valorFolha: z.number().nullable().optional(), // override manual da folha
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);

        // Verify contrato
        const cRows = await db.execute(sql`
          SELECT cs.*, cs.company_id AS cid
          FROM contratos_servico cs
          WHERE cs.id = ${input.contratoId} AND cs.company_id = ${input.companyId} AND cs.deleted_at IS NULL
        `);
        if (!(cRows.rows ?? cRows).length) throw new TRPCError({ code: "NOT_FOUND" });

        // Fetch itens
        const itensR = await db.execute(sql`
          SELECT * FROM contratos_servico_itens WHERE contrato_id = ${input.contratoId}
        `);
        const itens = (itensR.rows ?? itensR) as any[];

        // Period bounds for the competência
        const [ano, mes] = input.competencia.split("-").map(Number);
        const startDate = `${input.competencia}-01`;
        const lastDay = new Date(ano, mes, 0).getDate();
        const endDate = `${input.competencia}-${String(lastDay).padStart(2, "0")}`;

        // RH counts
        let qtdAtivos = 0, qtdAdmissoes = 0, qtdDemissoes = 0, valorFolha = 0;
        try {
          const rhR = await db.execute(sql`
            SELECT
              COUNT(*) FILTER (
                WHERE "dataAdmissao"::date <= ${endDate}::date
                  AND (COALESCE("dataDesligamentoEfetiva", "dataDemissao") IS NULL
                       OR COALESCE("dataDesligamentoEfetiva", "dataDemissao")::date >= ${startDate}::date)
              ) AS ativos,
              COUNT(*) FILTER (
                WHERE "dataAdmissao"::date BETWEEN ${startDate}::date AND ${endDate}::date
              ) AS admissoes,
              COUNT(*) FILTER (
                WHERE COALESCE("dataDesligamentoEfetiva", "dataDemissao")::date
                      BETWEEN ${startDate}::date AND ${endDate}::date
              ) AS demissoes
            FROM employees
            WHERE "companyId" = ${input.companyId}
          `);
          const rh = (rhR.rows ?? rhR)[0] as any;
          qtdAtivos    = Number(rh?.ativos ?? 0);
          qtdAdmissoes = Number(rh?.admissoes ?? 0);
          qtdDemissoes = Number(rh?.demissoes ?? 0);
        } catch (_) {}

        // Folha (try payroll table, fallback to manual input)
        if (input.valorFolha != null) {
          valorFolha = input.valorFolha;
        } else {
          try {
            const folhaR = await db.execute(sql`
              SELECT SUM(("salarioBase"::numeric + COALESCE("totalProventos"::numeric, 0)))::numeric AS total
              FROM folha_pagamento
              WHERE "companyId" = ${input.companyId}
                AND competencia = ${input.competencia}
            `);
            const fRow = (folhaR.rows ?? folhaR)[0] as any;
            valorFolha = Number(fRow?.total ?? 0);
          } catch (_) {}
        }

        // Calculate expected value
        let valorEsperado = 0;
        const breakdown: { tipo: string; descricao: string; qtd: number; valor: number }[] = [];

        for (const item of itens) {
          const vu = Number(item.valor_unitario ?? 0);
          const pct = Number(item.percentual ?? 0);
          let valor = 0;
          let qtd = 0;
          switch (item.tipo) {
            case "fixo":
              valor = vu; qtd = 1; break;
            case "por_funcionario_ativo":
              qtd = qtdAtivos; valor = vu * qtdAtivos; break;
            case "por_admissao":
              qtd = qtdAdmissoes; valor = vu * qtdAdmissoes; break;
            case "por_demissao":
              qtd = qtdDemissoes; valor = vu * qtdDemissoes; break;
            case "por_exame":
              qtd = 0; valor = 0; break; // filled manually in lancar
            case "por_folha":
              qtd = 1; valor = (pct / 100) * valorFolha; break;
            case "outro":
              qtd = 0; valor = 0; break;
          }
          valorEsperado += valor;
          breakdown.push({ tipo: item.tipo, descricao: item.descricao ?? item.tipo, qtd, valor });
        }

        // Upsert competência
        await db.execute(sql`
          INSERT INTO contratos_servico_competencias (
            contrato_id, company_id, competencia,
            valor_esperado, qtd_funcionarios, qtd_admissoes, qtd_demissoes, valor_folha,
            status, created_at, updated_at
          ) VALUES (
            ${input.contratoId}, ${input.companyId}, ${input.competencia},
            ${valorEsperado.toFixed(2)}, ${qtdAtivos}, ${qtdAdmissoes}, ${qtdDemissoes},
            ${valorFolha.toFixed(2)}, 'aberta', now(), now()
          )
          ON CONFLICT (contrato_id, competencia) DO UPDATE SET
            valor_esperado  = EXCLUDED.valor_esperado,
            qtd_funcionarios = EXCLUDED.qtd_funcionarios,
            qtd_admissoes   = EXCLUDED.qtd_admissoes,
            qtd_demissoes   = EXCLUDED.qtd_demissoes,
            valor_folha     = EXCLUDED.valor_folha,
            updated_at      = now()
        `);

        return { valorEsperado, qtdAtivos, qtdAdmissoes, qtdDemissoes, valorFolha, breakdown };
      }),

    /** Registra o valor cobrado pelo fornecedor */
    lancar: protectedProcedure
      .input(z.object({
        contratoId: z.number(),
        companyId: z.number(),
        competencia: z.string().regex(/^\d{4}-\d{2}$/),
        valorCobrado: z.number(),
        notaNumero: z.string().nullable().optional(),
        notaChave: z.string().nullable().optional(),
        observacoes: z.string().nullable().optional(),
        qtdExames: z.number().nullable().optional(), // para itens por_exame
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);

        // Fetch expected to check divergence
        const compR = await db.execute(sql`
          SELECT id, valor_esperado, status
          FROM contratos_servico_competencias
          WHERE contrato_id = ${input.contratoId}
            AND company_id  = ${input.companyId}
            AND competencia = ${input.competencia}
        `);
        let compRow = ((compR.rows ?? compR)[0] as any) ?? null;

        const tolR = await db.execute(sql`
          SELECT tolerancia_divergencia FROM contratos_servico
          WHERE id = ${input.contratoId} AND company_id = ${input.companyId}
        `);
        const tol = Number(((tolR.rows ?? tolR)[0] as any)?.tolerancia_divergencia ?? 5);

        const valorEsperado = Number(compRow?.valor_esperado ?? 0);
        let divergencia = false;
        if (valorEsperado > 0) {
          const diff = Math.abs(input.valorCobrado - valorEsperado) / valorEsperado * 100;
          divergencia = diff > tol;
        }

        if (compRow) {
          if (compRow.status === "aprovada" || compRow.status === "paga")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Competência já aprovada/paga — não pode ser alterada." });
          await db.execute(sql`
            UPDATE contratos_servico_competencias SET
              valor_cobrado = ${input.valorCobrado.toFixed(2)},
              nota_numero   = ${input.notaNumero ?? null},
              nota_chave    = ${input.notaChave ?? null},
              divergencia   = ${divergencia},
              observacoes   = ${input.observacoes ?? null},
              status        = 'com_fatura',
              updated_at    = now()
            WHERE contrato_id = ${input.contratoId}
              AND company_id  = ${input.companyId}
              AND competencia = ${input.competencia}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO contratos_servico_competencias (
              contrato_id, company_id, competencia,
              valor_cobrado, nota_numero, nota_chave,
              divergencia, observacoes, status, created_at, updated_at
            ) VALUES (
              ${input.contratoId}, ${input.companyId}, ${input.competencia},
              ${input.valorCobrado.toFixed(2)}, ${input.notaNumero ?? null},
              ${input.notaChave ?? null}, ${divergencia}, ${input.observacoes ?? null},
              'com_fatura', now(), now()
            )
          `);
        }

        return { divergencia, valorEsperado };
      }),

    /** Aprova a fatura e gera título no Contas a Pagar */
    aprovar: protectedProcedure
      .input(z.object({
        contratoId: z.number(),
        companyId: z.number(),
        competencia: z.string().regex(/^\d{4}-\d{2}$/),
        valorAprovado: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx);
        assertCompany(ctx, input.companyId);

        const compR = await db.execute(sql`
          SELECT csc.*, cs.nome AS contrato_nome, cs.dia_vencimento,
                 f.razao_social AS fornecedor_nome
          FROM contratos_servico_competencias csc
          JOIN contratos_servico cs ON cs.id = csc.contrato_id
          LEFT JOIN fornecedores f ON f.id = cs.fornecedor_id
          WHERE csc.contrato_id = ${input.contratoId}
            AND csc.company_id  = ${input.companyId}
            AND csc.competencia = ${input.competencia}
        `);
        const comp = ((compR.rows ?? compR)[0] as any);
        if (!comp) throw new TRPCError({ code: "NOT_FOUND" });
        if (comp.status === "aprovada" || comp.status === "paga")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Já aprovado." });

        const [ano, mes] = input.competencia.split("-").map(Number);
        const diaVenc = Number(comp.dia_vencimento ?? 10);
        const lastDay = new Date(ano, mes, 0).getDate();
        const diaReal = Math.min(diaVenc, lastDay);
        const dataVencimento = `${input.competencia}-${String(diaReal).padStart(2, "0")}`;
        const descricao = `${comp.contrato_nome} — ${input.competencia}${comp.fornecedor_nome ? ` (${comp.fornecedor_nome})` : ""}`;

        // Create financial entry
        const feR = await db.execute(sql`
          INSERT INTO financial_entries (
            "companyId", tipo, natureza, "valorPrevisto", "dataCompetencia",
            "dataVencimento", status, "origemModulo", "origemId",
            "origemDescricao", descricao, "criadoPorId", "criadoPorNome"
          ) VALUES (
            ${input.companyId}, 'despesa', 'operacional',
            ${input.valorAprovado.toFixed(2)},
            ${input.competencia + "-01"}, ${dataVencimento},
            'pendente', 'contrato_servico', ${comp.id},
            ${descricao}, ${descricao},
            ${ctx.user.id}, ${ctx.user.name ?? ctx.user.email ?? "Sistema"}
          ) RETURNING id
        `);
        const feId = ((feR.rows ?? feR)[0] as any)?.id;

        await db.execute(sql`
          UPDATE contratos_servico_competencias SET
            status           = 'aprovada',
            valor_cobrado    = ${input.valorAprovado.toFixed(2)},
            financial_entry_id = ${feId ?? null},
            aprovado_por_id  = ${ctx.user.id},
            aprovado_por_nome = ${ctx.user.name ?? ctx.user.email ?? "Sistema"},
            aprovado_em      = now(),
            updated_at       = now()
          WHERE contrato_id = ${input.contratoId}
            AND company_id  = ${input.companyId}
            AND competencia = ${input.competencia}
        `);

        return { ok: true, financialEntryId: feId };
      }),
  }),
});
