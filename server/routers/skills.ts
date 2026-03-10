import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb as _getDb } from "../db";
import { skills, employeeSkills, employees } from "../../drizzle/schema";
import { eq, and, sql, inArray, isNull, desc, asc, count } from "drizzle-orm";
import { companyFilter, resolveCompanyIds } from "../companyHelper";
import { TRPCError } from "@trpc/server";

async function getDb() {
  const db = await _getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

const companyInput = z.object({
  companyId: z.number(),
  companyIds: z.array(z.number()).optional(),
});

// ─── Skills CRUD ────────────────────────────────────────────────────

export const skillsRouter = router({
  // List all skills (not deleted)
  list: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      const rows = await db
        .select()
        .from(skills)
        .where(and(
          inArray(skills.companyId, ids),
          isNull(skills.deletedAt),
        ))
        .orderBy(asc(skills.categoria), asc(skills.nome));
      return rows;
    }),

  // Get a single skill by id
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .select()
        .from(skills)
        .where(and(eq(skills.id, input.id), isNull(skills.deletedAt)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Habilidade não encontrada" });
      return row;
    }),

  // Create a new skill
  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      categoria: z.string().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [result] = await db.insert(skills).values({
        companyId: input.companyId,
        nome: input.nome,
        categoria: input.categoria || null,
        descricao: input.descricao || null,
      });
      return { id: result.insertId, success: true };
    }),

  // Update a skill
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      categoria: z.string().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(skills).set(data).where(eq(skills.id, id));
      return { success: true };
    }),

  // Soft delete a skill
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(skills)
        .set({ deletedAt: sql`NOW()` })
        .where(eq(skills.id, input.id));
      // Also soft-delete all employee_skills with this skill
      await db.update(employeeSkills)
        .set({ deletedAt: sql`NOW()` })
        .where(eq(employeeSkills.skillId, input.id));
      return { success: true };
    }),

  // Get distinct categories for autocomplete
  categories: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      const rows = await db
        .select({ categoria: skills.categoria })
        .from(skills)
        .where(and(
          inArray(skills.companyId, ids),
          isNull(skills.deletedAt),
          sql`${skills.categoria} IS NOT NULL AND ${skills.categoria} != ''`,
        ))
        .groupBy(skills.categoria)
        .orderBy(asc(skills.categoria));
      return rows.map(r => r.categoria).filter(Boolean) as string[];
    }),

  // ─── Employee Skills ────────────────────────────────────────────

  // List skills for a specific employee
  employeeSkills: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select({
          id: employeeSkills.id,
          employeeId: employeeSkills.employeeId,
          skillId: employeeSkills.skillId,
          companyId: employeeSkills.companyId,
          nivel: employeeSkills.nivel,
          tempoExperiencia: employeeSkills.tempoExperiencia,
          observacao: employeeSkills.observacao,
          createdAt: employeeSkills.createdAt,
          updatedAt: employeeSkills.updatedAt,
          skillNome: skills.nome,
          skillCategoria: skills.categoria,
        })
        .from(employeeSkills)
        .innerJoin(skills, eq(employeeSkills.skillId, skills.id))
        .where(and(
          eq(employeeSkills.employeeId, input.employeeId),
          isNull(employeeSkills.deletedAt),
          isNull(skills.deletedAt),
        ))
        .orderBy(asc(skills.categoria), asc(skills.nome));
      return rows;
    }),

  // Assign a skill to an employee
  assignSkill: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      skillId: z.number(),
      companyId: z.number(),
      nivel: z.enum(["Basico", "Intermediario", "Avancado"]).default("Basico"),
      tempoExperiencia: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Check if already assigned (not deleted)
      const [existing] = await db
        .select({ id: employeeSkills.id })
        .from(employeeSkills)
        .where(and(
          eq(employeeSkills.employeeId, input.employeeId),
          eq(employeeSkills.skillId, input.skillId),
          isNull(employeeSkills.deletedAt),
        ));
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este funcionário já possui esta habilidade cadastrada",
        });
      }
      const [result] = await db.insert(employeeSkills).values({
        employeeId: input.employeeId,
        skillId: input.skillId,
        companyId: input.companyId,
        nivel: input.nivel,
        tempoExperiencia: input.tempoExperiencia || null,
        observacao: input.observacao || null,
      });
      return { id: result.insertId, success: true };
    }),

  // Update an employee skill assignment
  updateEmployeeSkill: protectedProcedure
    .input(z.object({
      id: z.number(),
      nivel: z.enum(["Basico", "Intermediario", "Avancado"]).optional(),
      tempoExperiencia: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(employeeSkills).set(data).where(eq(employeeSkills.id, id));
      return { success: true };
    }),

  // Remove a skill from an employee (soft delete)
  removeEmployeeSkill: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(employeeSkills)
        .set({ deletedAt: sql`NOW()` })
        .where(eq(employeeSkills.id, input.id));
      return { success: true };
    }),

  // ─── Search / Aggregation ───────────────────────────────────────

  // Search employees by skill (for Colaboradores filter)
  searchBySkill: protectedProcedure
    .input(z.object({
      ...companyInput.shape,
      skillId: z.number().optional(),
      skillIds: z.array(z.number()).optional(),
      categoria: z.string().optional(),
      nivel: z.enum(["Basico", "Intermediario", "Avancado"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      const conditions: any[] = [
        inArray(employeeSkills.companyId, ids),
        isNull(employeeSkills.deletedAt),
        isNull(skills.deletedAt),
      ];

      if (input.skillId) {
        conditions.push(eq(employeeSkills.skillId, input.skillId));
      }
      if (input.skillIds && input.skillIds.length > 0) {
        conditions.push(inArray(employeeSkills.skillId, input.skillIds));
      }
      if (input.nivel) {
        conditions.push(eq(employeeSkills.nivel, input.nivel));
      }
      if (input.categoria) {
        conditions.push(eq(skills.categoria, input.categoria));
      }

      const rows = await db
        .select({
          employeeId: employeeSkills.employeeId,
          skillId: employeeSkills.skillId,
          nivel: employeeSkills.nivel,
          tempoExperiencia: employeeSkills.tempoExperiencia,
          skillNome: skills.nome,
          skillCategoria: skills.categoria,
          empNome: employees.nomeCompleto,
          empFuncao: employees.funcao,
          empStatus: employees.status,
          empCompanyId: employees.companyId,
        })
        .from(employeeSkills)
        .innerJoin(skills, eq(employeeSkills.skillId, skills.id))
        .innerJoin(employees, eq(employeeSkills.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(asc(skills.nome), asc(employees.nomeCompleto));
      return rows;
    }),

  // Summary: count employees per skill (for obra cards)
  skillSummaryByObra: protectedProcedure
    .input(z.object({
      ...companyInput.shape,
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      // Get employees in the obra from obra_funcionarios, then count their skills
      const [rows] = await db.execute(sql`
        SELECT 
          s.id as skillId,
          s.nome as skillNome,
          s.categoria as skillCategoria,
          COUNT(DISTINCT es.employeeId) as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es.skillId AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2.employeeId = es.employeeId AND of2.deletedAt IS NULL
        INNER JOIN employees e ON e.id = es.employeeId AND e.deletedAt IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es.companyId IN (${sql.raw(ids.join(','))})
          ${input.obraId ? sql`AND of2.obraId = ${input.obraId}` : sql``}
        GROUP BY s.id, s.nome, s.categoria
        ORDER BY qtd DESC, s.nome ASC
      `);
      return rows || [];
    }),

  // Summary: skills per obra for all obras (for obra cards)
  skillsByAllObras: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      const [rows] = await db.execute(sql`
        SELECT 
          of2.obraId,
          s.id as skillId,
          s.nome as skillNome,
          COUNT(DISTINCT es.employeeId) as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es.skillId AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2.employeeId = es.employeeId 
          AND of2.deletedAt IS NULL AND of2.isActive = 1
        INNER JOIN employees e ON e.id = es.employeeId AND e.deletedAt IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es.companyId IN (${sql.raw(ids.join(','))})
        GROUP BY of2.obraId, s.id, s.nome
        ORDER BY of2.obraId, qtd DESC
      `);
      return rows || [];
    }),

  // Summary: count employees per skill globally (for dashboard)
  skillSummaryGlobal: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      const [rows] = await db.execute(sql`
        SELECT 
          s.id as skillId,
          s.nome as skillNome,
          s.categoria as skillCategoria,
          es.nivel,
          COUNT(DISTINCT es.employeeId) as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es.skillId AND s.deleted_at IS NULL
        INNER JOIN employees e ON e.id = es.employeeId AND e.deletedAt IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es.companyId IN (${sql.raw(ids.join(','))})
        GROUP BY s.id, s.nome, s.categoria, es.nivel
        ORDER BY s.categoria, s.nome, es.nivel
      `);
      return rows || [];
    }),
});
