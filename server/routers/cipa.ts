import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { cipaElections, cipaMembers, cipaMeetings, employees, companies } from "../../drizzle/schema";
import { eq, and, sql, isNull, desc, asc, count, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";

// ============================================================
// DIMENSIONAMENTO CIPA - NR-5 (Quadro I)
// Grau de Risco 3 (Construção Civil) - Tabela simplificada
// ============================================================
const DIMENSIONAMENTO_CIPA: Record<number, { efetivos: number; suplentes: number }> = {
  // grauRisco 3 (construção civil)
  20: { efetivos: 0, suplentes: 0 },   // até 19: não precisa
  50: { efetivos: 3, suplentes: 3 },   // 20-29
  100: { efetivos: 4, suplentes: 3 },  // 30-50
  120: { efetivos: 4, suplentes: 3 },  // 51-80
  140: { efetivos: 4, suplentes: 4 },  // 81-100
  300: { efetivos: 6, suplentes: 5 },  // 101-120
  500: { efetivos: 8, suplentes: 6 },  // 121-140
  1000: { efetivos: 10, suplentes: 8 }, // 141-300
};

function getDimensionamento(numFuncionarios: number) {
  if (numFuncionarios < 20) return { necessaria: false, efetivos: 0, suplentes: 0, designado: numFuncionarios >= 1 };
  
  const faixas = Object.keys(DIMENSIONAMENTO_CIPA).map(Number).sort((a, b) => a - b);
  for (const faixa of faixas) {
    if (numFuncionarios <= faixa) {
      return { necessaria: true, ...DIMENSIONAMENTO_CIPA[faixa], designado: false };
    }
  }
  // Acima de 1000
  return { necessaria: true, efetivos: 12, suplentes: 9, designado: false };
}

export const cipaRouter = router({
  // Verificar se a empresa precisa de CIPA
  verificarNecessidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.select({ total: count() })
        .from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
        ));
      
      const numFuncionarios = result?.total || 0;
      const dimensionamento = getDimensionamento(numFuncionarios);
      
      // Verificar se já tem mandato ativo
      const hoje = new Date().toISOString().split("T")[0];
      const [mandatoAtivo] = await db.select()
        .from(cipaElections)
        .where(and(
          companyFilter(cipaElections.companyId, input),
          sql`${cipaElections.mandatoFim} >= ${hoje}`,
        ))
        .orderBy(desc(cipaElections.mandatoFim))
        .limit(1);
      
      // Verificar se o mandato ativo tem membros suficientes
      let membrosAtivos = 0;
      if (mandatoAtivo) {
        const [membrosResult] = await db.select({ total: count() })
          .from(cipaMembers)
          .where(eq(cipaMembers.electionId, mandatoAtivo.id));
        membrosAtivos = membrosResult?.total || 0;
      }
      
      // Alerta só aparece se: precisa de CIPA E (não tem mandato ativo OU mandato sem membros suficientes)
      const minMembros = dimensionamento.efetivos + dimensionamento.suplentes;
      const cipaConstituida = !!mandatoAtivo && membrosAtivos >= Math.max(minMembros, 1);
      
      return {
        numFuncionarios,
        ...dimensionamento,
        mandatoAtivo: mandatoAtivo || null,
        membrosAtivos,
        cipaConstituida,
        alertaCipa: dimensionamento.necessaria && !cipaConstituida,
      };
    }),

  // ============================================================
  // ELEIÇÕES / MANDATOS
  // ============================================================
  eleicoes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select()
          .from(cipaElections)
          .where(companyFilter(cipaElections.companyId, input))
          .orderBy(desc(cipaElections.mandatoInicio));
        return rows;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(cipaElections).where(eq(cipaElections.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mandatoInicio: z.string(),
        mandatoFim: z.string(),
        statusEleicao: z.string().default('Planejamento'),
        dataEdital: z.string().optional(),
        dataInscricaoInicio: z.string().optional(),
        dataInscricaoFim: z.string().optional(),
        dataEleicao: z.string().optional(),
        dataPosse: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(cipaElections).values({
          companyId: input.companyId,
          mandatoInicio: input.mandatoInicio,
          mandatoFim: input.mandatoFim,
          statusEleicao: input.statusEleicao as any,
          dataEdital: input.dataEdital || null,
          dataInscricaoInicio: input.dataInscricaoInicio || null,
          dataInscricaoFim: input.dataInscricaoFim || null,
          dataEleicao: input.dataEleicao || null,
          dataPosse: input.dataPosse || null,
          observacoes: input.observacoes || null,
        });
        return { success: true, id: result[0].id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        statusEleicao: z.string().optional(),
        mandatoInicio: z.string().optional(),
        mandatoFim: z.string().optional(),
        dataEdital: z.string().optional(),
        dataInscricaoInicio: z.string().optional(),
        dataInscricaoFim: z.string().optional(),
        dataEleicao: z.string().optional(),
        dataPosse: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(cipaElections).set(updateData).where(eq(cipaElections.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(cipaElections).where(eq(cipaElections.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // MEMBROS
  // ============================================================
  membros: router({
    list: protectedProcedure
      .input(z.object({ electionId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select({
          id: cipaMembers.id,
          companyId: cipaMembers.companyId,
          electionId: cipaMembers.electionId,
          employeeId: cipaMembers.employeeId,
          cargoCipa: cipaMembers.cargoCipa,
          representacao: cipaMembers.representacao,
          inicioEstabilidade: cipaMembers.inicioEstabilidade,
          fimEstabilidade: cipaMembers.fimEstabilidade,
          statusMembro: cipaMembers.statusMembro,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeSetor: employees.setor,
        })
        .from(cipaMembers)
        .innerJoin(employees, eq(cipaMembers.employeeId, employees.id))
        .where(eq(cipaMembers.electionId, input.electionId));
        return rows;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number(),
        employeeId: z.number(),
        cargoCipa: z.enum(['Presidente','Vice_Presidente','Secretario','Membro_Titular','Membro_Suplente']),
        representacao: z.enum(['Empregador','Empregados']),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        
        // Buscar dados do mandato para calcular estabilidade
        const [eleicao] = await db.select().from(cipaElections).where(eq(cipaElections.id, input.electionId));
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND", message: "Eleição não encontrada" });
        
        // Estabilidade: representantes dos empregados têm estabilidade
        // desde o registro da candidatura até 1 ano após o mandato (Art. 10, II, a, ADCT)
        let inicioEstabilidade: string | null = null;
        let fimEstabilidade: string | null = null;
        
        if (input.representacao === 'Empregados') {
          inicioEstabilidade = eleicao.dataInscricaoInicio || eleicao.mandatoInicio;
          const fimMandato = new Date(eleicao.mandatoFim);
          fimMandato.setFullYear(fimMandato.getFullYear() + 1);
          fimEstabilidade = fimMandato.toISOString().split("T")[0];
        }
        
        await db.insert(cipaMembers).values({
          companyId: input.companyId,
          electionId: input.electionId,
          employeeId: input.employeeId,
          cargoCipa: input.cargoCipa,
          representacao: input.representacao,
          inicioEstabilidade,
          fimEstabilidade,
          statusMembro: 'Ativo',
        });
        
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        cargoCipa: z.string().optional(),
        statusMembro: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(cipaMembers).set(updateData).where(eq(cipaMembers.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(cipaMembers).where(eq(cipaMembers.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // REUNIÕES
  // ============================================================
  reunioes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [companyFilter(cipaMeetings.companyId, input)];
        if (input.electionId) conditions.push(eq(cipaMeetings.mandateId, input.electionId));
        
        const rows = await db.select()
          .from(cipaMeetings)
          .where(and(...conditions))
          .orderBy(desc(cipaMeetings.dataReuniao));
        return rows;
      }),

    create: protectedProcedure
      .input(z.object({
        mandateId: z.number(),
        companyId: z.number(),
        tipo: z.enum(['ordinaria','extraordinaria']).default('ordinaria'),
        dataReuniao: z.string(),
        horaInicio: z.string().optional(),
        horaFim: z.string().optional(),
        local: z.string().optional(),
        pauta: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.insert(cipaMeetings).values({
          mandateId: input.mandateId,
          companyId: input.companyId,
          tipo: input.tipo,
          dataReuniao: input.dataReuniao,
          horaInicio: input.horaInicio || null,
          horaFim: input.horaFim || null,
          local: input.local || null,
          pauta: input.pauta || null,
          status: 'agendada',
          criadoPor: ctx.user.name ?? 'Sistema',
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        tipo: z.string().optional(),
        dataReuniao: z.string().optional(),
        horaInicio: z.string().optional(),
        horaFim: z.string().optional(),
        local: z.string().optional(),
        pauta: z.string().optional(),
        ataTexto: z.string().optional(),
        ataDocumentoUrl: z.string().optional(),
        presentesJson: z.string().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(cipaMeetings).set(updateData).where(eq(cipaMeetings.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(cipaMeetings).where(eq(cipaMeetings.id, input.id));
        return { success: true };
      }),

    /** Gerar calendário anual de reuniões ordinárias (mensais) */
    gerarCalendario: protectedProcedure
      .input(z.object({
        mandateId: z.number(),
        companyId: z.number(),
        diaReuniao: z.number().default(15), // dia do mês
        horaInicio: z.string().default('14:00'),
        horaFim: z.string().default('15:00'),
        local: z.string().default('Sala de Reuniões'),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [eleicao] = await db.select().from(cipaElections).where(eq(cipaElections.id, input.mandateId));
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND" });
        
        const inicio = new Date(eleicao.mandatoInicio);
        const fim = new Date(eleicao.mandatoFim);
        const reunioes = [];
        
        let current = new Date(inicio.getFullYear(), inicio.getMonth(), input.diaReuniao);
        if (current < inicio) current.setMonth(current.getMonth() + 1);
        
        while (current <= fim) {
          reunioes.push({
            mandateId: input.mandateId,
            companyId: input.companyId,
            tipo: 'ordinaria' as const,
            dataReuniao: current.toISOString().split("T")[0],
            horaInicio: input.horaInicio,
            horaFim: input.horaFim,
            local: input.local,
            pauta: `Reunião Ordinária CIPA - ${current.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
            status: 'agendada' as const,
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          current.setMonth(current.getMonth() + 1);
        }
        
        if (reunioes.length > 0) {
          await db.insert(cipaMeetings).values(reunioes);
        }
        
        return { success: true, reunioesCriadas: reunioes.length };
      }),
  }),

  /** Cronograma completo da CIPA */
  cronograma: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      const [eleicao] = await db.select().from(cipaElections).where(eq(cipaElections.id, input.electionId));
      if (!eleicao) return null;
      
      const membros = await db.select({
        id: cipaMembers.id,
        employeeId: cipaMembers.employeeId,
        cargoCipa: cipaMembers.cargoCipa,
        representacao: cipaMembers.representacao,
        statusMembro: cipaMembers.statusMembro,
        inicioEstabilidade: cipaMembers.inicioEstabilidade,
        fimEstabilidade: cipaMembers.fimEstabilidade,
        employeeName: employees.nomeCompleto,
        employeeCargo: employees.cargo,
      })
      .from(cipaMembers)
      .innerJoin(employees, eq(cipaMembers.employeeId, employees.id))
      .where(eq(cipaMembers.electionId, input.electionId));
      
      const reunioes = await db.select()
        .from(cipaMeetings)
        .where(eq(cipaMeetings.mandateId, input.electionId))
        .orderBy(asc(cipaMeetings.dataReuniao));
      
      return { eleicao, membros, reunioes };
    }),
});
