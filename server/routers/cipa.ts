import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { cipaElections, cipaMembers, cipaMeetings, cipaCandidates, cipaVoters, cipaVotes, cipaActionItems, employees, companies } from "../../drizzle/schema";
import { eq, and, sql, isNull, desc, asc, count, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

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
        }).returning({ id: cipaElections.id });
        return { success: true, id: result.id };
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

  checkEstabilidade: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date().toISOString().split("T")[0];
      const rows = await db.select({
        id: cipaMembers.id,
        cargoCipa: cipaMembers.cargoCipa,
        representacao: cipaMembers.representacao,
        statusMembro: cipaMembers.statusMembro,
        inicioEstabilidade: cipaMembers.inicioEstabilidade,
        fimEstabilidade: cipaMembers.fimEstabilidade,
        mandatoInicio: cipaElections.mandatoInicio,
        mandatoFim: cipaElections.mandatoFim,
      })
      .from(cipaMembers)
      .innerJoin(cipaElections, eq(cipaMembers.electionId, cipaElections.id))
      .where(and(
        eq(cipaMembers.employeeId, input.employeeId),
        sql`${cipaMembers.statusMembro} != 'Encerrado'`,
      ));

      const ativos = rows.filter(r => {
        if (r.fimEstabilidade && r.fimEstabilidade >= hoje) return true;
        if (!r.fimEstabilidade && r.mandatoFim && r.mandatoFim >= hoje) return true;
        return false;
      });

      if (ativos.length === 0) return { temEstabilidade: false, membros: [] };

      return {
        temEstabilidade: true,
        membros: ativos.map(r => ({
          cargoCipa: r.cargoCipa,
          representacao: r.representacao,
          mandatoInicio: r.mandatoInicio,
          mandatoFim: r.mandatoFim,
          fimEstabilidade: r.fimEstabilidade,
        })),
      };
    }),

  // ============================================================
  // CANDIDATOS (inscrição p/ a eleição)
  // ============================================================
  candidatos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return await db.select({
          id: cipaCandidates.id,
          electionId: cipaCandidates.electionId,
          employeeId: cipaCandidates.employeeId,
          numero: cipaCandidates.numero,
          proposta: cipaCandidates.proposta,
          fotoUrl: cipaCandidates.fotoUrl,
          status: cipaCandidates.status,
          votosCache: cipaCandidates.votosCache,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeMatricula: employees.matricula,
          employeeFoto: employees.fotoUrl,
        })
        .from(cipaCandidates)
        .innerJoin(employees, eq(cipaCandidates.employeeId, employees.id))
        .where(and(
          companyFilter(cipaCandidates.companyId, input),
          eq(cipaCandidates.electionId, input.electionId),
        ))
        .orderBy(desc(cipaCandidates.votosCache), asc(cipaCandidates.numero));
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        electionId: z.number(),
        employeeId: z.number(),
        numero: z.number().optional(),
        proposta: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard: eleição e funcionário precisam pertencer à empresa acessível
        const [eleicao] = await db.select({ id: cipaElections.id })
          .from(cipaElections)
          .where(and(eq(cipaElections.id, input.electionId), companyFilter(cipaElections.companyId, input))).limit(1);
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND", message: "Eleição não encontrada." });
        const [func] = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), companyFilter(employees.companyId, input))).limit(1);
        if (!func) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
        // impede candidato duplicado na mesma eleição
        const [existe] = await db.select({ id: cipaCandidates.id })
          .from(cipaCandidates)
          .where(and(eq(cipaCandidates.electionId, input.electionId), eq(cipaCandidates.employeeId, input.employeeId)))
          .limit(1);
        if (existe) throw new TRPCError({ code: "CONFLICT", message: "Funcionário já inscrito como candidato nesta eleição." });
        await db.insert(cipaCandidates).values({
          companyId: input.companyId,
          electionId: input.electionId,
          employeeId: input.employeeId,
          numero: input.numero ?? null,
          proposta: input.proposta || null,
          status: 'inscrito',
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        numero: z.number().optional(),
        proposta: z.string().optional(),
        status: z.enum(['inscrito', 'deferido', 'indeferido']).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard: candidato precisa pertencer à empresa acessível
        const [cand] = await db.select({ id: cipaCandidates.id })
          .from(cipaCandidates)
          .where(and(eq(cipaCandidates.id, input.id), companyFilter(cipaCandidates.companyId, input))).limit(1);
        if (!cand) throw new TRPCError({ code: "NOT_FOUND" });
        const { id, companyId, companyIds, ...rest } = input;
        const data: any = { updatedAt: new Date().toISOString() };
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) data[k] = v; });
        await db.update(cipaCandidates).set(data).where(eq(cipaCandidates.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard: candidato precisa pertencer à empresa acessível
        const [cand] = await db.select({ id: cipaCandidates.id })
          .from(cipaCandidates)
          .where(and(eq(cipaCandidates.id, input.id), companyFilter(cipaCandidates.companyId, input))).limit(1);
        if (!cand) throw new TRPCError({ code: "NOT_FOUND" });
        await db.delete(cipaCandidates).where(eq(cipaCandidates.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // ELEIÇÃO DIGITAL (votação por link + apuração)
  // ============================================================
  eleicaoDigital: router({
    /** Abre a votação: gera 1 link/token por empregado ativo (sem duplicar) e marca status. */
    abrirVotacao: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [eleicao] = await db.select().from(cipaElections)
          .where(and(companyFilter(cipaElections.companyId, input), eq(cipaElections.id, input.electionId)));
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND", message: "Eleição não encontrada." });

        // candidatos deferidos são obrigatórios p/ abrir
        const [{ total: nCand } = { total: 0 }] = await db.select({ total: count() })
          .from(cipaCandidates)
          .where(and(eq(cipaCandidates.electionId, input.electionId), eq(cipaCandidates.status, 'deferido')));
        if ((nCand || 0) < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Defira ao menos 1 candidato antes de abrir a votação." });

        const elegiveis = await db.select({ id: employees.id })
          .from(employees)
          .where(and(companyFilter(employees.companyId, input), eq(employees.status, 'Ativo'), isNull(employees.deletedAt)));

        const jaTem = await db.select({ employeeId: cipaVoters.employeeId })
          .from(cipaVoters).where(eq(cipaVoters.electionId, input.electionId));
        const jaSet = new Set(jaTem.map(v => v.employeeId));

        const novos = elegiveis.filter(e => !jaSet.has(e.id)).map(e => ({
          companyId: input.companyId,
          electionId: input.electionId,
          employeeId: e.id,
          token: randomBytes(24).toString('hex'),
          jaVotou: 0,
        }));
        if (novos.length > 0) {
          // insere em lotes p/ evitar payload gigante; onConflictDoNothing no índice
          // único (election_id, employee_id) torna a operação à prova de corrida
          // (chamadas concorrentes não duplicam o eleitor/token).
          for (let i = 0; i < novos.length; i += 200) {
            await db.insert(cipaVoters).values(novos.slice(i, i + 200))
              .onConflictDoNothing({ target: [cipaVoters.electionId, cipaVoters.employeeId] });
          }
        }
        await db.update(cipaElections)
          .set({ statusEleicao: 'Votação Aberta', updatedAt: new Date().toISOString() })
          .where(eq(cipaElections.id, input.electionId));
        return { success: true, eleitoresGerados: novos.length, totalEleitores: elegiveis.length };
      }),

    /** Lista os eleitores + token (para gerar/copiar os links). */
    listEleitores: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return await db.select({
          id: cipaVoters.id,
          employeeId: cipaVoters.employeeId,
          token: cipaVoters.token,
          jaVotou: cipaVoters.jaVotou,
          votouEm: cipaVoters.votouEm,
          employeeName: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
        })
        .from(cipaVoters)
        .innerJoin(employees, eq(cipaVoters.employeeId, employees.id))
        .where(and(companyFilter(cipaVoters.companyId, input), eq(cipaVoters.electionId, input.electionId)))
        .orderBy(asc(employees.nomeCompleto));
      }),

    statusVotacao: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [tot] = await db.select({ total: count() }).from(cipaVoters)
          .where(and(companyFilter(cipaVoters.companyId, input), eq(cipaVoters.electionId, input.electionId)));
        const [vot] = await db.select({ total: count() }).from(cipaVoters)
          .where(and(companyFilter(cipaVoters.companyId, input), eq(cipaVoters.electionId, input.electionId), eq(cipaVoters.jaVotou, 1)));
        const totalEleitores = tot?.total || 0;
        const votaram = vot?.total || 0;
        return {
          totalEleitores,
          votaram,
          abstencoes: totalEleitores - votaram,
          percentual: totalEleitores > 0 ? Math.round((votaram / totalEleitores) * 1000) / 10 : 0,
        };
      }),

    /** Apuração ao vivo (tally) — leitura, agrupa votos por candidato. */
    resultado: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const tally = await db.select({ candidateId: cipaVotes.candidateId, votos: count() })
          .from(cipaVotes)
          .where(and(companyFilter(cipaVotes.companyId, input), eq(cipaVotes.electionId, input.electionId)))
          .groupBy(cipaVotes.candidateId);
        const map = new Map<number, number>();
        let brancos = 0;
        for (const t of tally) {
          if (t.candidateId === 0) { brancos = Number(t.votos); continue; }
          map.set(t.candidateId, Number(t.votos));
        }
        const cands = await db.select({
          id: cipaCandidates.id,
          employeeId: cipaCandidates.employeeId,
          numero: cipaCandidates.numero,
          status: cipaCandidates.status,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
        })
        .from(cipaCandidates)
        .innerJoin(employees, eq(cipaCandidates.employeeId, employees.id))
        .where(and(eq(cipaCandidates.electionId, input.electionId), eq(cipaCandidates.status, 'deferido')));

        const ranking = cands.map(c => ({ ...c, votos: map.get(c.id) || 0 }))
          .sort((a, b) => b.votos - a.votos);
        const totalVotos = ranking.reduce((s, c) => s + c.votos, 0) + brancos;
        return { ranking, brancos, totalVotos };
      }),

    /** Encerra a votação, congela votosCache por candidato e marca status 'Apurada'. */
    encerrar: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [eleicao] = await db.select().from(cipaElections)
          .where(and(companyFilter(cipaElections.companyId, input), eq(cipaElections.id, input.electionId)));
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND" });
        const tally = await db.select({ candidateId: cipaVotes.candidateId, votos: count() })
          .from(cipaVotes)
          .where(and(eq(cipaVotes.companyId, eleicao.companyId), eq(cipaVotes.electionId, input.electionId)))
          .groupBy(cipaVotes.candidateId);
        for (const t of tally) {
          if (t.candidateId === 0) continue;
          await db.update(cipaCandidates).set({ votosCache: Number(t.votos), updatedAt: new Date().toISOString() })
            .where(eq(cipaCandidates.id, t.candidateId));
        }
        await db.update(cipaElections).set({ statusEleicao: 'Apurada', updatedAt: new Date().toISOString() })
          .where(eq(cipaElections.id, input.electionId));
        return { success: true };
      }),

    /** Efetiva os mais votados como membros (Titular/Suplente) com estabilidade. */
    efetivarEleitos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), electionId: z.number(), numTitulares: z.number().min(1), numSuplentes: z.number().min(0) }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [eleicao] = await db.select().from(cipaElections)
          .where(and(companyFilter(cipaElections.companyId, input), eq(cipaElections.id, input.electionId)));
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND" });

        const ranking = await db.select({ employeeId: cipaCandidates.employeeId, votosCache: cipaCandidates.votosCache })
          .from(cipaCandidates)
          .where(and(eq(cipaCandidates.electionId, input.electionId), eq(cipaCandidates.status, 'deferido')))
          .orderBy(desc(cipaCandidates.votosCache));

        // estabilidade: do início do mandato até 1 ano após o fim (NR-5 / art. 165 CLT)
        const fim = new Date(eleicao.mandatoFim);
        const fimEstab = new Date(fim.getFullYear() + 1, fim.getMonth(), fim.getDate());
        const fimEstabStr = fimEstab.toISOString().split("T")[0];

        const jaMembros = await db.select({ employeeId: cipaMembers.employeeId })
          .from(cipaMembers).where(eq(cipaMembers.electionId, input.electionId));
        const jaSet = new Set(jaMembros.map(m => m.employeeId));

        let efetivados = 0;
        for (let i = 0; i < ranking.length && i < (input.numTitulares + input.numSuplentes); i++) {
          const r = ranking[i];
          if (jaSet.has(r.employeeId)) continue;
          const cargo = i < input.numTitulares ? 'Titular' : 'Suplente';
          await db.insert(cipaMembers).values({
            companyId: eleicao.companyId,
            electionId: input.electionId,
            employeeId: r.employeeId,
            cargoCipa: cargo,
            representacao: 'Empregados',
            inicioEstabilidade: eleicao.mandatoInicio,
            fimEstabilidade: fimEstabStr,
            statusMembro: 'Ativo',
          });
          efetivados++;
        }
        await db.update(cipaElections).set({ statusEleicao: 'Concluída', updatedAt: new Date().toISOString() })
          .where(eq(cipaElections.id, input.electionId));
        return { success: true, efetivados };
      }),

    // ── PÚBLICO (votação por link, sem login) ──────────────────────────────
    /** Retorna a cédula (eleição + candidatos deferidos) a partir do token. */
    getCedula: publicProcedure
      .input(z.object({ token: z.string().min(10) }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [voter] = await db.select().from(cipaVoters).where(eq(cipaVoters.token, input.token)).limit(1);
        if (!voter) throw new TRPCError({ code: "NOT_FOUND", message: "Link de votação inválido." });
        const [eleicao] = await db.select().from(cipaElections).where(eq(cipaElections.id, voter.electionId)).limit(1);
        if (!eleicao) throw new TRPCError({ code: "NOT_FOUND", message: "Eleição não encontrada." });
        const [empresa] = await db.select({ razaoSocial: companies.razaoSocial, nomeFantasia: companies.nomeFantasia, logoUrl: companies.logoUrl })
          .from(companies).where(eq(companies.id, voter.companyId)).limit(1);
        const [eleitor] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, voter.employeeId)).limit(1);
        const candidatos = await db.select({
          id: cipaCandidates.id,
          numero: cipaCandidates.numero,
          proposta: cipaCandidates.proposta,
          fotoUrl: cipaCandidates.fotoUrl,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeFoto: employees.fotoUrl,
        })
        .from(cipaCandidates)
        .innerJoin(employees, eq(cipaCandidates.employeeId, employees.id))
        .where(and(eq(cipaCandidates.electionId, voter.electionId), eq(cipaCandidates.status, 'deferido')))
        .orderBy(asc(cipaCandidates.numero));
        return {
          jaVotou: voter.jaVotou === 1,
          aberta: eleicao.statusEleicao === 'Votação Aberta',
          eleitorNome: eleitor?.nome || null,
          empresa: empresa || null,
          eleicao: { mandatoInicio: eleicao.mandatoInicio, mandatoFim: eleicao.mandatoFim, statusEleicao: eleicao.statusEleicao },
          candidatos,
        };
      }),

    /** Registra UM voto (secreto). Atômico: claim do eleitor antes de gravar o voto. */
    registrarVoto: publicProcedure
      .input(z.object({ token: z.string().min(10), candidateId: z.number().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [voter] = await db.select().from(cipaVoters).where(eq(cipaVoters.token, input.token)).limit(1);
        if (!voter) throw new TRPCError({ code: "NOT_FOUND", message: "Link de votação inválido." });
        const [eleicao] = await db.select().from(cipaElections).where(eq(cipaElections.id, voter.electionId)).limit(1);
        if (!eleicao || eleicao.statusEleicao !== 'Votação Aberta') throw new TRPCError({ code: "BAD_REQUEST", message: "A votação não está aberta." });

        // valida candidato (0/null = branco)
        let candId = 0;
        if (input.candidateId && input.candidateId > 0) {
          const [c] = await db.select({ id: cipaCandidates.id }).from(cipaCandidates)
            .where(and(eq(cipaCandidates.id, input.candidateId), eq(cipaCandidates.electionId, voter.electionId), eq(cipaCandidates.status, 'deferido'))).limit(1);
          if (!c) throw new TRPCError({ code: "BAD_REQUEST", message: "Candidato inválido." });
          candId = c.id;
        }

        // claim atômico: só prossegue se ainda não votou (evita corrida/duplo voto)
        const claim: any = await db.update(cipaVoters)
          .set({ jaVotou: 1, votouEm: new Date().toISOString() })
          .where(and(eq(cipaVoters.id, voter.id), eq(cipaVoters.jaVotou, 0)))
          .returning({ id: cipaVoters.id });
        const claimed = Array.isArray(claim) ? claim.length : (claim?.rowCount ?? 0);
        if (!claimed) throw new TRPCError({ code: "CONFLICT", message: "Este link já foi utilizado para votar." });

        const ip = (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim()
          || (ctx as any)?.req?.socket?.remoteAddress || null;
        await db.insert(cipaVotes).values({
          companyId: voter.companyId,
          electionId: voter.electionId,
          candidateId: candId,
          ip: ip ? String(ip).slice(0, 60) : null,
        });
        return { success: true };
      }),
  }),

  // ============================================================
  // PLANOS DE AÇÃO (deliberações / pendências das reuniões)
  // ============================================================
  planosAcao: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mandateId: z.number().optional(), meetingId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conds = [companyFilter(cipaActionItems.companyId, input)];
        if (input.mandateId) conds.push(eq(cipaActionItems.mandateId, input.mandateId));
        if (input.meetingId) conds.push(eq(cipaActionItems.meetingId, input.meetingId));
        return await db.select().from(cipaActionItems)
          .where(and(...conds))
          .orderBy(asc(cipaActionItems.status), asc(cipaActionItems.prazo));
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        mandateId: z.number(),
        meetingId: z.number().optional(),
        descricao: z.string().min(1),
        responsavel: z.string().optional(),
        prazo: z.string().optional(),
        prioridade: z.enum(['baixa', 'media', 'alta']).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard: o mandato (eleição) precisa pertencer à empresa acessível
        const [mandato] = await db.select({ id: cipaElections.id })
          .from(cipaElections)
          .where(and(eq(cipaElections.id, input.mandateId), companyFilter(cipaElections.companyId, input))).limit(1);
        if (!mandato) throw new TRPCError({ code: "NOT_FOUND", message: "Mandato não encontrado." });
        await db.insert(cipaActionItems).values({
          companyId: input.companyId,
          mandateId: input.mandateId,
          meetingId: input.meetingId ?? null,
          descricao: input.descricao,
          responsavel: input.responsavel || null,
          prazo: input.prazo || null,
          prioridade: input.prioridade || 'media',
          status: 'pendente',
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number(),
        companyIds: z.array(z.number()).optional(),
        descricao: z.string().optional(),
        responsavel: z.string().optional(),
        prazo: z.string().optional(),
        prioridade: z.enum(['baixa', 'media', 'alta']).optional(),
        status: z.enum(['pendente', 'em_andamento', 'concluido']).optional(),
        evidencia: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // tenant guard: confirma que o item pertence à empresa acessível
        const [item] = await db.select({ id: cipaActionItems.id })
          .from(cipaActionItems)
          .where(and(eq(cipaActionItems.id, input.id), companyFilter(cipaActionItems.companyId, input))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        const { id, companyId, companyIds, status, ...rest } = input;
        const data: any = { updatedAt: new Date().toISOString() };
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) data[k] = v; });
        if (status !== undefined) {
          data.status = status;
          data.dataConclusao = status === 'concluido' ? new Date().toISOString().split("T")[0] : null;
        }
        await db.update(cipaActionItems).set(data).where(eq(cipaActionItems.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [item] = await db.select({ id: cipaActionItems.id })
          .from(cipaActionItems)
          .where(and(eq(cipaActionItems.id, input.id), companyFilter(cipaActionItems.companyId, input))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        await db.delete(cipaActionItems).where(eq(cipaActionItems.id, input.id));
        return { success: true };
      }),
  }),
});
