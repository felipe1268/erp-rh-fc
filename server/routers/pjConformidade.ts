import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Tipos de conformidade monitorados:
// - das         : DAS-MEI mensal (vence dia 20)
// - nf          : NF de prestação de serviço mensal
// - cnd         : Certidão Negativa de Débitos do CNPJ (validade)
// - seguro_vida : Seguro de Vida (Cláusula 5.1 do contrato — validade)
// - status_cnpj : Status do CNPJ na Receita
const TIPOS_VALIDOS = ["das", "nf", "cnd", "seguro_vida", "status_cnpj"] as const;
const TIPOS_MENSAIS = new Set(["das", "nf"]);
const STATUS_VALIDOS = ["pendente", "ok", "vencido", "na"] as const;

// Confere que o usuário autenticado tem acesso à empresa informada.
// admin_master tem acesso a tudo; demais usuários precisam ter vínculo em user_companies.
async function assertUserCanAccessCompany(ctx: any, db: any, companyId: number) {
  const user = ctx?.user;
  if (!user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
  }
  if (user.role === 'admin_master') return;
  const r: any = await db.execute(sql`
    SELECT 1 FROM user_companies
    WHERE "userId" = ${user.id} AND "companyId" = ${companyId}
    LIMIT 1
  `);
  if ((r?.rows ?? []).length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa selecionada" });
  }
}

// Garante que o employee pertence à companyId informada.
async function assertEmployeeInCompany(db: any, employeeId: number, companyId: number) {
  const r: any = await db.execute(sql`
    SELECT id, "companyId" FROM employees WHERE id = ${employeeId} AND "deletedAt" IS NULL LIMIT 1
  `);
  const row = (r?.rows ?? [])[0];
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
  }
  if (row.companyId !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Funcionário não pertence à empresa informada" });
  }
}

export const pjConformidadeRouter = router({
  // Lista PJs ativos com snapshot de conformidade do mês escolhido + itens vigentes (CND/Seguro/CNPJ)
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const mesRef = input.mesReferencia || (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      })();

      const empsRes: any = await db.execute(sql`
        SELECT DISTINCT e.id, e."nomeCompleto", e."cpf", e."funcao", e."status",
               e."tipoContrato", e."companyId"
        FROM employees e
        INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
          AND pc."deletedAt" IS NULL
          AND pc."companyId" = ${input.companyId}
          AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
        WHERE e."companyId" = ${input.companyId}
          AND e."deletedAt" IS NULL
          AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
        ORDER BY e."nomeCompleto" ASC
      `);
      const emps = empsRes?.rows ?? [];
      if (emps.length === 0) return { mesReferencia: mesRef, funcionarios: [] };

      const empIds = emps.map((e: any) => e.id);

      // Filtro defensivo: companyId no WHERE para evitar leak entre tenants
      const itensRes: any = await db.execute(sql`
        SELECT * FROM pj_conformidade
        WHERE "deletedAt" IS NULL
          AND "companyId" = ${input.companyId}
          AND "employeeId" = ANY(${empIds}::int[])
          AND (
            ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
            OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
          )
        ORDER BY "createdAt" DESC
      `);
      const itens: any[] = itensRes?.rows ?? [];

      const today = new Date().toISOString().slice(0, 10);
      const funcionarios = emps.map((emp: any) => {
        const itemsEmp = itens.filter((i: any) => i.employeeId === emp.id);
        const byTipo: Record<string, any> = {};
        for (const tipo of TIPOS_VALIDOS) {
          if (TIPOS_MENSAIS.has(tipo)) {
            const it = itemsEmp.find((x: any) => x.tipo === tipo && x.competencia === mesRef);
            byTipo[tipo] = it || { tipo, competencia: mesRef, status: "pendente" };
          } else {
            const it = itemsEmp.filter((x: any) => x.tipo === tipo)[0];
            if (it && it.dataVencimento) {
              if (it.dataVencimento < today && it.status !== "na") {
                it.statusComputed = "vencido";
              } else if (it.status === "ok") {
                it.statusComputed = "ok";
              } else {
                it.statusComputed = it.status;
              }
            } else if (it) {
              it.statusComputed = it.status;
            }
            byTipo[tipo] = it || { tipo, competencia: null, status: "pendente" };
          }
        }
        const pendencias = TIPOS_VALIDOS.filter((t) => {
          const s = byTipo[t]?.statusComputed || byTipo[t]?.status;
          return s === "pendente" || s === "vencido";
        }).length;
        return { ...emp, itens: byTipo, pendencias };
      });

      return { mesReferencia: mesRef, funcionarios };
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.enum(TIPOS_VALIDOS),
      competencia: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
      status: z.enum(STATUS_VALIDOS).default("pendente"),
      dataVencimento: z.string().nullable().optional(),
      dataEnvio: z.string().nullable().optional(),
      valor: z.string().nullable().optional(),
      documentoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Tenant guards
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      await assertEmployeeInCompany(db, input.employeeId, input.companyId);

      const competencia = TIPOS_MENSAIS.has(input.tipo) ? (input.competencia || null) : null;

      // Idempotência: lookup por (employeeId, tipo, competencia) — casa para mensais e vigentes (competencia IS NULL)
      let existente: any = null;
      if (competencia === null) {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ${input.employeeId}
            AND "tipo" = ${input.tipo}
            AND "competencia" IS NULL
          ORDER BY "createdAt" DESC LIMIT 1
        `);
        existente = (r?.rows ?? [])[0] || null;
      } else {
        const r: any = await db.execute(sql`
          SELECT * FROM pj_conformidade
          WHERE "deletedAt" IS NULL
            AND "companyId" = ${input.companyId}
            AND "employeeId" = ${input.employeeId}
            AND "tipo" = ${input.tipo}
            AND "competencia" = ${competencia}
          ORDER BY "createdAt" DESC LIMIT 1
        `);
        existente = (r?.rows ?? [])[0] || null;
      }

      if (existente) {
        await db.execute(sql`
          UPDATE pj_conformidade SET
            "status" = ${input.status},
            "dataVencimento" = ${input.dataVencimento || null}::date,
            "dataEnvio" = ${input.dataEnvio || null}::date,
            "valor" = ${input.valor || null}::numeric,
            "documentoUrl" = ${input.documentoUrl || null},
            "observacoes" = ${input.observacoes || null},
            "updatedAt" = NOW()
          WHERE id = ${existente.id} AND "companyId" = ${input.companyId}
        `);
        return { id: existente.id, updated: true };
      }
      const r: any = await db.execute(sql`
        INSERT INTO pj_conformidade
          ("companyId","employeeId","tipo","competencia","status","dataVencimento","dataEnvio","valor","documentoUrl","observacoes")
        VALUES
          (${input.companyId}, ${input.employeeId}, ${input.tipo}, ${competencia}, ${input.status},
           ${input.dataVencimento || null}::date, ${input.dataEnvio || null}::date, ${input.valor || null}::numeric,
           ${input.documentoUrl || null}, ${input.observacoes || null})
        RETURNING id
      `);
      const newId = (r?.rows ?? [])[0]?.id;
      return { id: newId, created: true };
    }),

  remover: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      const r: any = await db.execute(sql`
        UPDATE pj_conformidade SET "deletedAt" = NOW()
        WHERE id = ${input.id} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        RETURNING id
      `);
      const updated = (r?.rows ?? []).length > 0;
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado ou não pertence à empresa" });
      }
      return { ok: true };
    }),

  // Resumo das pendências de um funcionário PJ (usado no Raio-X)
  resumoPorEmployee: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Tenant guards
      await assertUserCanAccessCompany(ctx, db, input.companyId);
      await assertEmployeeInCompany(db, input.employeeId, input.companyId);

      const d = new Date();
      const mesRef = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const today = d.toISOString().slice(0, 10);

      const r: any = await db.execute(sql`
        SELECT * FROM pj_conformidade
        WHERE "deletedAt" IS NULL
          AND "companyId" = ${input.companyId}
          AND "employeeId" = ${input.employeeId}
          AND (
            ("tipo" IN ('das','nf') AND "competencia" = ${mesRef})
            OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
          )
      `);
      const itens: any[] = r?.rows ?? [];
      const byTipo: Record<string, any> = {};
      for (const tipo of TIPOS_VALIDOS) {
        if (TIPOS_MENSAIS.has(tipo)) {
          byTipo[tipo] = itens.find(i => i.tipo === tipo && i.competencia === mesRef) || { tipo, competencia: mesRef, status: "pendente" };
        } else {
          const it = itens.filter(i => i.tipo === tipo).sort((a,b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
          if (it && it.dataVencimento && it.dataVencimento < today && it.status !== "na") {
            it.statusComputed = "vencido";
          } else if (it) {
            it.statusComputed = it.status;
          }
          byTipo[tipo] = it || { tipo, competencia: null, status: "pendente" };
        }
      }
      const pendencias = TIPOS_VALIDOS.filter(t => {
        const s = byTipo[t]?.statusComputed || byTipo[t]?.status;
        return s === "pendente" || s === "vencido";
      }).length;
      return { mesReferencia: mesRef, itens: byTipo, pendencias };
    }),
});
