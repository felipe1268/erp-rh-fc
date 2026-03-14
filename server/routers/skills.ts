import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb as _getDb } from "../db";
import { skills, employeeSkills, employees, obras, obraFuncionarios } from "../../drizzle/schema";
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
      return { id: result[0].id, success: true };
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
      return { id: result[0].id, success: true };
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
          id: employeeSkills.id,
          employeeId: employeeSkills.employeeId,
          skillId: employeeSkills.skillId,
          nivel: employeeSkills.nivel,
          tempoExperiencia: employeeSkills.tempoExperiencia,
          observacao: employeeSkills.observacao,
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
      const rows = ((await db.execute(sql`
        SELECT 
          s.id as "skillId",
          s.nome as "skillNome",
          s.categoria as "skillCategoria",
          COUNT(DISTINCT es."employeeId") as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2."employeeId" = es."employeeId" 
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es."companyId" IN (${sql.raw(ids.join(','))})
          ${input.obraId ? sql`AND of2."obraId" = ${input.obraId}` : sql``}
        GROUP BY s.id, s.nome, s.categoria
        ORDER BY qtd DESC, s.nome ASC
      `)) as any).rows || [];
      return rows;
    }),

  // Summary: skills per obra for all obras (for obra cards)
  skillsByAllObras: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      const rows = ((await db.execute(sql`
        SELECT 
          of2."obraId",
          s.id as "skillId",
          s.nome as "skillNome",
          COUNT(DISTINCT es."employeeId") as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2."employeeId" = es."employeeId" 
           AND of2."isActive" = 1
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es."companyId" IN (${sql.raw(ids.join(','))})
        GROUP BY of2."obraId", s.id, s.nome
        ORDER BY of2."obraId", qtd DESC
      `)) as any).rows || [];
      return rows;
    }),

  // ─── Bulk Assignment ─────────────────────────────────────────────

  // Assign a skill to multiple employees at once
  assignBulk: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      employeeIds: z.array(z.number()).min(1),
      companyId: z.number(),
      nivel: z.enum(["Basico", "Intermediario", "Avancado"]).default("Basico"),
      tempoExperiencia: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let assigned = 0;
      let skipped = 0;
      for (const empId of input.employeeIds) {
        // Check if already assigned
        const [existing] = await db
          .select({ id: employeeSkills.id })
          .from(employeeSkills)
          .where(and(
            eq(employeeSkills.employeeId, empId),
            eq(employeeSkills.skillId, input.skillId),
            isNull(employeeSkills.deletedAt),
          ));
        if (existing) {
          skipped++;
          continue;
        }
        await db.insert(employeeSkills).values({
          employeeId: empId,
          skillId: input.skillId,
          companyId: input.companyId,
          nivel: input.nivel,
          tempoExperiencia: input.tempoExperiencia || null,
          observacao: input.observacao || null,
        });
        assigned++;
      }
      return { assigned, skipped, total: input.employeeIds.length };
    }),

  // ─── Report: Skills by Obra ─────────────────────────────────────

  // Detailed report of skills available per obra
  reportByObra: protectedProcedure
    .input(z.object({
      ...companyInput.shape,
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      const isMultiCompany = ids.length > 1;

      // Get all obras
      let obraRows = await db
        .select({
          id: obras.id,
          nome: obras.nome,
          status: obras.status,
          companyId: obras.companyId,
        })
        .from(obras)
        .where(and(
          inArray(obras.companyId, ids),
          isNull(obras.deletedAt),
          ...(input.obraId ? [eq(obras.id, input.obraId)] : []),
        ))
        .orderBy(asc(obras.nome));

      // Consolidate obras by name when in CONSTRUTORAS mode (multiple companies)
      // Same obra may exist in both FC Engenharia and Julio Ferraz
      let obraIdMapping = new Map<number, number>(); // maps duplicate obraId -> primary obraId
      if (isMultiCompany && !input.obraId) {
        const seen = new Map<string, any>();
        for (const r of obraRows) {
          const key = (r.nome || '').trim().toUpperCase();
          if (seen.has(key)) {
            const existing = seen.get(key)!;
            if (!existing.obraIds) existing.obraIds = [existing.id];
            existing.obraIds.push(r.id);
            obraIdMapping.set(r.id, existing.id);
          } else {
            seen.set(key, { ...r, obraIds: [r.id] });
          }
        }
        obraRows = Array.from(seen.values());
      }

      // Get skills per obra with employee details
      const skillRows = ((await db.execute(sql`
        SELECT 
          of2."obraId",
          s.id as "skillId",
          s.nome as "skillNome",
          s.categoria as "skillCategoria",
          es.nivel,
          es."tempoExperiencia",
          e.id as "employeeId",
          e."nomeCompleto" as "empNome",
          e.funcao as "empFuncao"
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2."employeeId" = es."employeeId" 
           AND of2."isActive" = 1
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es."companyId" IN (${sql.raw(ids.join(','))})
          ${input.obraId ? sql`AND of2."obraId" = ${input.obraId}` : sql``}
        ORDER BY of2."obraId", s.categoria, s.nome, e."nomeCompleto"
      `)) as any).rows || [];

      // Remap skill rows obraId to primary obraId for consolidated obras
      const remappedSkillRows = skillRows.map((r: any) => {
        const mapped = obraIdMapping.get(Number(r.obraId));
        return mapped ? { ...r, obraId: mapped } : r;
      });

      // Get all available skills for gap analysis
      const allSkills = await db
        .select({
          id: skills.id,
          nome: skills.nome,
          categoria: skills.categoria,
        })
        .from(skills)
        .where(and(
          inArray(skills.companyId, ids),
          isNull(skills.deletedAt),
        ));

      // Deduplicate allSkills by name (same skill may exist in both companies)
      const uniqueSkills = new Map<string, any>();
      for (const s of allSkills) {
        const key = (s.nome || '').trim().toUpperCase();
        if (!uniqueSkills.has(key)) uniqueSkills.set(key, s);
      }

      // Get total employees per obra
      const empCountRows = ((await db.execute(sql`
        SELECT of2."obraId", COUNT(DISTINCT of2."employeeId") as total
        FROM obra_funcionarios of2
        INNER JOIN employees e ON e.id = of2."employeeId" AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE of2."isActive" = 1
          AND of2."companyId" IN (${sql.raw(ids.join(','))})
        GROUP BY of2."obraId"
      `)) as any).rows || [];

      // Consolidate employee counts for merged obras
      const consolidatedEmpCounts: any[] = [];
      const empCountMap = new Map<number, number>();
      for (const row of empCountRows as any[]) {
        const primaryId = obraIdMapping.get(Number(row.obraId)) || Number(row.obraId);
        empCountMap.set(primaryId, (empCountMap.get(primaryId) || 0) + Number(row.total));
      }
      for (const [obraId, total] of empCountMap) {
        consolidatedEmpCounts.push({ obraId, total });
      }

      return {
        obras: obraRows,
        skillDetails: remappedSkillRows,
        allSkills: Array.from(uniqueSkills.values()),
        employeeCounts: consolidatedEmpCounts,
      };
    }),

  // ─── Dashboard Data ─────────────────────────────────────────────

  // Full dashboard data for skills/competencies
  dashboardData: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);

      // KPIs
      const totalSkillsRows = ((await db.execute(sql`
        SELECT COUNT(DISTINCT UPPER(TRIM(nome))) as total FROM skills WHERE "companyId" IN (${sql.raw(ids.join(','))}) AND deleted_at IS NULL
      `)) as any).rows || [];
      const totalAssignmentsRows = ((await db.execute(sql`
        SELECT COUNT(*) as total FROM employee_skills es
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
      `)) as any).rows || [];
      const totalEmployeesWithSkillRows = ((await db.execute(sql`
        SELECT COUNT(DISTINCT es."employeeId") as total FROM employee_skills es
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
      `)) as any).rows || [];
      const totalActiveEmployeesRows = ((await db.execute(sql`
        SELECT COUNT(*) as total FROM employees WHERE "companyId" IN (${sql.raw(ids.join(','))}) AND "deletedAt" IS NULL AND status NOT IN ('Desligado','Lista_Negra')
      `)) as any).rows || [];

      // Distribution by category
      const byCategory = ((await db.execute(sql`
        SELECT s.categoria, COUNT(DISTINCT es."employeeId") as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
        GROUP BY s.categoria ORDER BY qtd DESC
      `)) as any).rows || [];

      // Distribution by level
      const byLevel = ((await db.execute(sql`
        SELECT es.nivel, COUNT(*) as qtd
        FROM employee_skills es
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
        GROUP BY es.nivel ORDER BY CASE es.nivel WHEN 'Basico' THEN 1 WHEN 'Intermediario' THEN 2 WHEN 'Avancado' THEN 3 ELSE 4 END
      `)) as any).rows || [];

      // Top skills (most assigned)
      const topSkills = ((await db.execute(sql`
        SELECT s.id, s.nome, s.categoria, COUNT(DISTINCT es."employeeId") as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
        GROUP BY s.id, s.nome, s.categoria ORDER BY qtd DESC LIMIT 15
      `)) as any).rows || [];

      // Skills per obra - group by obra name to consolidate construtoras
      const byObra = ((await db.execute(sql`
        SELECT UPPER(TRIM(o.nome)) as "obraNome", 
          COUNT(DISTINCT es."employeeId") as "empComSkill",
          COUNT(DISTINCT s.id) as "skillsDistintas"
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN obra_funcionarios of2 ON of2."employeeId" = es."employeeId" AND of2."isActive" = 1
        INNER JOIN obras o ON o.id = of2."obraId" AND o."deletedAt" IS NULL
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        WHERE es."companyId" IN (${sql.raw(ids.join(','))}) AND es.deleted_at IS NULL
        GROUP BY UPPER(TRIM(o.nome)) ORDER BY "empComSkill" DESC
      `)) as any).rows || [];

      // Employees without any skill
      const noSkillRows = ((await db.execute(sql`
        SELECT COUNT(*) as total FROM employees e
        WHERE e."companyId" IN (${sql.raw(ids.join(','))}) AND e."deletedAt" IS NULL AND e.status NOT IN ('Desligado','Lista_Negra')
        AND e.id NOT IN (
          SELECT DISTINCT es."employeeId" FROM employee_skills es WHERE es.deleted_at IS NULL
        )
      `)) as any).rows || [];

      const totalSkills = Number(totalSkillsRows?.[0]?.total || 0);
      const totalAssignments = Number(totalAssignmentsRows?.[0]?.total || 0);
      const totalWithSkill = Number(totalEmployeesWithSkillRows?.[0]?.total || 0);
      const totalActive = Number(totalActiveEmployeesRows?.[0]?.total || 0);
      const totalNoSkill = Number(noSkillRows?.[0]?.total || 0);

      return {
        kpis: {
          totalSkills,
          totalAssignments,
          totalWithSkill,
          totalActive,
          totalNoSkill,
          coveragePercent: totalActive > 0 ? Math.round((totalWithSkill / totalActive) * 100) : 0,
        },
        byCategory: byCategory || [],
        byLevel: byLevel || [],
        topSkills: topSkills || [],
        byObra: byObra || [],
      };
    }),

  // Summary: count employees per skill globally (for dashboard)
  skillSummaryGlobal: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = resolveCompanyIds(input);
      
      const rows = ((await db.execute(sql`
        SELECT 
          s.id as "skillId",
          s.nome as "skillNome",
          s.categoria as "skillCategoria",
          es.nivel,
          COUNT(DISTINCT es."employeeId") as qtd
        FROM employee_skills es
        INNER JOIN skills s ON s.id = es."skillId" AND s.deleted_at IS NULL
        INNER JOIN employees e ON e.id = es."employeeId" AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado', 'Lista_Negra')
        WHERE es.deleted_at IS NULL
          AND es."companyId" IN (${sql.raw(ids.join(','))})
        GROUP BY s.id, s.nome, s.categoria, es.nivel
        ORDER BY s.categoria, s.nome, es.nivel
      `)) as any).rows || [];
      return rows;
    }),
});
