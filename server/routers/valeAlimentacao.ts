import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { vrBenefits, employees, obras, obraFuncionarios, mealBenefitConfigs } from "../../drizzle/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";

function parseBRL(v: string | null | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
}

function formatBRL(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

export const valeAlimentacaoRouter = router({
  // ============================================================
  // LISTAR LANÇAMENTOS DO MÊS
  // ============================================================
  listLancamentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [rows] = await db.execute(
        sql`SELECT vr.*, e.nomeCompleto, e.cpf, e.cargo, e.funcao, e.status as empStatus,
            o.nome as obraNome
            FROM vr_benefits vr
            LEFT JOIN employees e ON vr.employeeId = e.id
            LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
            LEFT JOIN obras o ON of2.obraId = o.id
            WHERE vr.companyId = ${input.companyId} AND vr.mesReferencia = ${input.mesReferencia}
            AND (e.status NOT IN ('Desligado', 'Lista_Negra') OR e.status IS NULL)
            ORDER BY e.nomeCompleto ASC`
      ) as any[];
      return rows || [];
    }),

  // ============================================================
  // STATS DO MÊS
  // ============================================================
  getStats: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      // Total colaboradores ativos
      const [empRows] = await db.execute(
        sql`SELECT COUNT(*) as total FROM employees WHERE companyId = ${input.companyId} AND status = 'Ativo' AND deletedAt IS NULL`
      ) as any[];
      const totalAtivos = empRows?.[0]?.total || 0;

      // Lançamentos do mês
      const [vrRows] = await db.execute(
        sql`SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN vr.status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN vr.status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
          SUM(CASE WHEN vr.status = 'pago' THEN 1 ELSE 0 END) as pagos,
          SUM(CASE WHEN vr.status = 'cancelado' THEN 1 ELSE 0 END) as cancelados,
          SUM(CASE WHEN vr.status != 'cancelado' THEN CAST(REPLACE(REPLACE(vr.valorTotal, '.', ''), ',', '.') AS DECIMAL(10,2)) ELSE 0 END) as totalValor
        FROM vr_benefits vr
        LEFT JOIN employees e ON vr.employeeId = e.id
        WHERE vr.companyId = ${input.companyId} AND vr.mesReferencia = ${input.mesReferencia}
        AND (e.status NOT IN ('Desligado', 'Lista_Negra') OR e.status IS NULL)`
      ) as any[];
      
      const stats = vrRows?.[0] || {};
      return {
        totalAtivos: Number(totalAtivos),
        totalLancamentos: Number(stats.total || 0),
        pendentes: Number(stats.pendentes || 0),
        aprovados: Number(stats.aprovados || 0),
        pagos: Number(stats.pagos || 0),
        cancelados: Number(stats.cancelados || 0),
        totalValor: Number(stats.totalValor || 0),
      };
    }),

  // ============================================================
  // GERAR LANÇAMENTOS DO MÊS (baseado nas configs de meal_benefit_configs)
  // ============================================================
  gerarMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      diasUteis: z.number().default(22),
      geradoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = input.geradoPor || ctx.user?.name || "Sistema";

      // Verificar se já existem lançamentos para o mês
      const [existing] = await db.execute(
        sql`SELECT COUNT(*) as total FROM vr_benefits WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}`
      ) as any[];
      if (existing?.[0]?.total > 0) {
        return { success: false, message: `Já existem ${existing[0].total} lançamentos para este mês. Use "Regerar" para substituir.` };
      }

      // Buscar configuração padrão da empresa
      const [cfgRows] = await db.execute(
        sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${input.companyId} AND ativo = 1 ORDER BY obraId IS NULL DESC LIMIT 10`
      ) as any[];
      const configs = cfgRows || [];
      
      // Config padrão (obraId IS NULL)
      const cfgPadrao = configs.find((c: any) => !c.obraId) || null;
      // Configs por obra
      const cfgPorObra: Record<number, any> = {};
      for (const c of configs) {
        if (c.obraId) cfgPorObra[c.obraId] = c;
      }

      // Buscar colaboradores ativos
      const [empRows] = await db.execute(
        sql`SELECT e.id, e.nomeCompleto, e.cpf, e.cargo, e.funcao,
            of2.obraId
            FROM employees e
            LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
            WHERE e.companyId = ${input.companyId} AND e.status = 'Ativo' AND e.deletedAt IS NULL
            ORDER BY e.nomeCompleto ASC`
      ) as any[];
      const emps = empRows || [];

      // Agrupar por employeeId (pode ter múltiplas obras)
      const empMap: Record<number, { emp: any; obraId: number | null }> = {};
      for (const e of emps) {
        if (!empMap[e.id]) {
          empMap[e.id] = { emp: e, obraId: e.obraId };
        }
      }

      let gerados = 0;
      for (const { emp, obraId } of Object.values(empMap)) {
        // Buscar config: primeiro por obra, depois padrão
        const cfg = (obraId && cfgPorObra[obraId]) || cfgPadrao;
        if (!cfg) continue; // Sem config, pular

        const diasUteis = input.diasUteis || cfg.diasUteisRef || 22;
        const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
        const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
        const jantaAtivo = cfg.jantaAtivo === 1 || cfg.jantaAtivo === true;

        const cafeDia = cafeAtivo ? parseBRL(cfg.cafeManhaDia) : 0;
        const lancheDia = lancheAtivo ? parseBRL(cfg.lancheTardeDia) : 0;
        const jantaDia = jantaAtivo ? parseBRL(cfg.jantaDia) : 0;
        const vaMes = parseBRL(cfg.valeAlimentacaoMes);

        const valorCafe = cafeDia * diasUteis;
        const valorLanche = lancheDia * diasUteis;
        const valorJanta = jantaDia * diasUteis;
        const valorVA = vaMes;
        const valorDiario = cafeDia + lancheDia + jantaDia;
        const valorTotal = valorCafe + valorLanche + valorJanta + valorVA;

        if (valorTotal <= 0) continue; // Sem valor, pular

        await db.execute(
          sql`INSERT INTO vr_benefits (companyId, employeeId, mesReferencia, valorDiario, diasUteis, valorTotal, valorCafe, valorLanche, valorJanta, valorVA, operadora, status, geradoPor)
          VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatBRL(valorDiario)}, ${diasUteis}, ${formatBRL(valorTotal)}, ${formatBRL(valorCafe)}, ${formatBRL(valorLanche)}, ${formatBRL(valorJanta)}, ${formatBRL(valorVA)}, 'iFood Benefícios', 'pendente', ${userName})`
        );
        gerados++;
      }

      return { success: true, gerados, message: `${gerados} lançamentos gerados com sucesso!` };
    }),

  // ============================================================
  // REGERAR MÊS (apaga e gera novamente)
  // ============================================================
  regerarMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      diasUteis: z.number().default(22),
      geradoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Apagar lançamentos existentes que não estão pagos
      await db.execute(
        sql`DELETE FROM vr_benefits WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status != 'pago'`
      );
      // Chamar geração
      const userName = input.geradoPor || ctx.user?.name || "Sistema";

      // Buscar configuração
      const [cfgRows] = await db.execute(
        sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${input.companyId} AND ativo = 1 ORDER BY obraId IS NULL DESC LIMIT 10`
      ) as any[];
      const configs = cfgRows || [];
      const cfgPadrao = configs.find((c: any) => !c.obraId) || null;
      const cfgPorObra: Record<number, any> = {};
      for (const c of configs) {
        if (c.obraId) cfgPorObra[c.obraId] = c;
      }

      const [empRows] = await db.execute(
        sql`SELECT e.id, e.nomeCompleto, of2.obraId
            FROM employees e
            LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
            WHERE e.companyId = ${input.companyId} AND e.status = 'Ativo' AND e.deletedAt IS NULL
            ORDER BY e.nomeCompleto ASC`
      ) as any[];
      const emps = empRows || [];
      const empMap: Record<number, { emp: any; obraId: number | null }> = {};
      for (const e of emps) {
        if (!empMap[e.id]) empMap[e.id] = { emp: e, obraId: e.obraId };
      }

      // Check which employees already have paid records
      const [paidRows] = await db.execute(
        sql`SELECT employeeId FROM vr_benefits WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status = 'pago'`
      ) as any[];
      const paidEmpIds = new Set((paidRows || []).map((r: any) => r.employeeId));

      let gerados = 0;
      for (const { emp, obraId } of Object.values(empMap)) {
        if (paidEmpIds.has(emp.id)) continue; // Não regerar pagos
        const cfg = (obraId && cfgPorObra[obraId]) || cfgPadrao;
        if (!cfg) continue;

        const diasUteis = input.diasUteis || cfg.diasUteisRef || 22;
        const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
        const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
        const jantaAtivo = cfg.jantaAtivo === 1 || cfg.jantaAtivo === true;

        const cafeDia = cafeAtivo ? parseBRL(cfg.cafeManhaDia) : 0;
        const lancheDia = lancheAtivo ? parseBRL(cfg.lancheTardeDia) : 0;
        const jantaDia = jantaAtivo ? parseBRL(cfg.jantaDia) : 0;
        const vaMes = parseBRL(cfg.valeAlimentacaoMes);

        const valorCafe = cafeDia * diasUteis;
        const valorLanche = lancheDia * diasUteis;
        const valorJanta = jantaDia * diasUteis;
        const valorVA = vaMes;
        const valorDiario = cafeDia + lancheDia + jantaDia;
        const valorTotal = valorCafe + valorLanche + valorJanta + valorVA;
        if (valorTotal <= 0) continue;

        await db.execute(
          sql`INSERT INTO vr_benefits (companyId, employeeId, mesReferencia, valorDiario, diasUteis, valorTotal, valorCafe, valorLanche, valorJanta, valorVA, operadora, status, geradoPor)
          VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatBRL(valorDiario)}, ${diasUteis}, ${formatBRL(valorTotal)}, ${formatBRL(valorCafe)}, ${formatBRL(valorLanche)}, ${formatBRL(valorJanta)}, ${formatBRL(valorVA)}, 'iFood Benefícios', 'pendente', ${userName})`
        );
        gerados++;
      }

      return { success: true, gerados, message: `${gerados} lançamentos regerados!` };
    }),

  // ============================================================
  // EDITAR LANÇAMENTO INDIVIDUAL
  // ============================================================
  editarLancamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      valorTotal: z.string().optional(),
      valorCafe: z.string().optional(),
      valorLanche: z.string().optional(),
      valorJanta: z.string().optional(),
      valorVA: z.string().optional(),
      diasUteis: z.number().optional(),
      status: z.enum(["pendente", "aprovado", "pago", "cancelado"]).optional(),
      motivoAlteracao: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const sets: string[] = [];
      if (input.valorTotal !== undefined) sets.push(`valorTotal = '${input.valorTotal}'`);
      if (input.valorCafe !== undefined) sets.push(`valorCafe = '${input.valorCafe}'`);
      if (input.valorLanche !== undefined) sets.push(`valorLanche = '${input.valorLanche}'`);
      if (input.valorJanta !== undefined) sets.push(`valorJanta = '${input.valorJanta}'`);
      if (input.valorVA !== undefined) sets.push(`valorVA = '${input.valorVA}'`);
      if (input.diasUteis !== undefined) sets.push(`diasUteis = ${input.diasUteis}`);
      if (input.status !== undefined) sets.push(`status = '${input.status}'`);
      if (input.motivoAlteracao !== undefined) sets.push(`motivoAlteracao = '${input.motivoAlteracao.replace(/'/g, "''")}'`);
      if (input.observacoes !== undefined) sets.push(`observacoes = '${input.observacoes.replace(/'/g, "''")}'`);
      
      if (sets.length === 0) return { success: false, message: "Nenhum campo para atualizar" };

      await db.execute(sql.raw(`UPDATE vr_benefits SET ${sets.join(", ")} WHERE id = ${input.id}`));
      return { success: true };
    }),

  // ============================================================
  // APROVAR LANÇAMENTOS EM LOTE
  // ============================================================
  aprovarLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      ids: z.array(z.number()).optional(), // Se vazio, aprova todos pendentes
      aprovadoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = input.aprovadoPor || ctx.user?.name || "RH";
      
      if (input.ids && input.ids.length > 0) {
        await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado', aprovadoPor = ${userName} WHERE id IN (${sql.raw(input.ids.join(","))}) AND status = 'pendente'`
        );
        return { success: true, aprovados: input.ids.length };
      } else {
        const [result] = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado', aprovadoPor = ${userName} WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status = 'pendente'`
        ) as any;
        return { success: true, aprovados: result?.affectedRows || 0 };
      }
    }),

  // ============================================================
  // MARCAR COMO PAGO EM LOTE
  // ============================================================
  marcarPago: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      ids: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      if (input.ids && input.ids.length > 0) {
        await db.execute(
          sql`UPDATE vr_benefits SET status = 'pago' WHERE id IN (${sql.raw(input.ids.join(","))}) AND status = 'aprovado'`
        );
        return { success: true, pagos: input.ids.length };
      } else {
        const [result] = await db.execute(
          sql`UPDATE vr_benefits SET status = 'pago' WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status = 'aprovado'`
        ) as any;
        return { success: true, pagos: result?.affectedRows || 0 };
      }
    }),

  // ============================================================
  // REVERTER PAGO → APROVADO (corrigir clique errado)
  // ============================================================
  reverterPago: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      ids: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      if (input.ids && input.ids.length > 0) {
        await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado' WHERE id IN (${sql.raw(input.ids.join(","))}) AND status = 'pago'`
        );
        return { success: true, revertidos: input.ids.length };
      } else {
        const [result] = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado' WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status = 'pago'`
        ) as any;
        return { success: true, revertidos: result?.affectedRows || 0 };
      }
    }),

  // ============================================================
  // CANCELAR LANÇAMENTO
  // ============================================================
  cancelarLancamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(
        sql`UPDATE vr_benefits SET status = 'cancelado', motivoAlteracao = ${input.motivo || 'Cancelado pelo usuário'} WHERE id = ${input.id}`
      );
      return { success: true };
    }),

  // ============================================================
  // HISTÓRICO POR COLABORADOR
  // ============================================================
  historicoColaborador: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [rows] = await db.execute(
        sql`SELECT * FROM vr_benefits WHERE companyId = ${input.companyId} AND employeeId = ${input.employeeId} ORDER BY mesReferencia DESC`
      ) as any[];
      return rows || [];
    }),

  // ============================================================
  // EXCLUIR TODOS OS LANÇAMENTOS DO MÊS (apenas pendentes)
  // ============================================================
  limparMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.execute(
        sql`DELETE FROM vr_benefits WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status IN ('pendente', 'cancelado')`
      ) as any;
      return { success: true, removidos: result?.affectedRows || 0 };
    }),
});
