import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { processosTrabalhistas, processosAndamentos, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

export const processosTrabRouter = router({
  // ============================================================
  // LISTAR PROCESSOS
  // ============================================================
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let query = db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.companyId, input.companyId));

      const processos = await query;

      // Filtrar por status se fornecido
      let filtered = processos;
      if (input.status && input.status !== "all") {
        filtered = processos.filter(p => p.status === input.status);
      }

      // Enriquecer com dados do funcionário
      const empIds = Array.from(new Set(filtered.filter(p => p.employeeId).map(p => p.employeeId)));
      let empMap = new Map<number, any>();
      if (empIds.length > 0) {
        const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
        empMap = new Map(emps.map(e => [e.id, e]));
      }

      return filtered.map(p => ({
        ...p,
        employee: empMap.get(p.employeeId) || null,
        pedidos: typeof p.pedidos === "string" ? JSON.parse(p.pedidos) : (p.pedidos || []),
      })).sort((a, b) => {
        // Ordenar: em_andamento primeiro, encerrado por último
        const statusOrder: Record<string, number> = {
          em_andamento: 0, aguardando_audiencia: 1, aguardando_pericia: 2,
          recurso: 3, execucao: 4, sentenca: 5, acordo: 6, arquivado: 7, encerrado: 8,
        };
        return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      });
    }),

  // ============================================================
  // OBTER PROCESSO POR ID (com andamentos)
  // ============================================================
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [processo] = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.id, input.id));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

      // Buscar funcionário
      const [emp] = await db.select().from(employees)
        .where(eq(employees.id, processo.employeeId));

      // Buscar andamentos
      const andamentos = await db.select().from(processosAndamentos)
        .where(eq(processosAndamentos.processoId, input.id))
        .orderBy(desc(processosAndamentos.data));

      return {
        ...processo,
        pedidos: typeof processo.pedidos === "string" ? JSON.parse(processo.pedidos) : (processo.pedidos || []),
        employee: emp || null,
        andamentos,
      };
    }),

  // ============================================================
  // CRIAR PROCESSO
  // ============================================================
  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      numeroProcesso: z.string().min(1),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      tipoAcao: z.enum(['reclamatoria', 'indenizatoria', 'rescisao_indireta', 'acidente_trabalho', 'doenca_ocupacional', 'assedio', 'outros']).default('reclamatoria'),
      reclamante: z.string().min(1),
      advogadoReclamante: z.string().optional(),
      advogadoEmpresa: z.string().optional(),
      valorCausa: z.string().optional(),
      dataDistribuicao: z.string().optional(),
      dataDesligamento: z.string().optional(),
      dataCitacao: z.string().optional(),
      dataAudiencia: z.string().optional(),
      status: z.enum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'acordo', 'sentenca', 'recurso', 'execucao', 'arquivado', 'encerrado']).default('em_andamento'),
      fase: z.enum(['conhecimento', 'recursal', 'execucao', 'encerrado']).default('conhecimento'),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).default('medio'),
      pedidos: z.array(z.string()).optional(),
      clienteCnpj: z.string().optional(),
      clienteRazaoSocial: z.string().optional(),
      clienteNomeFantasia: z.string().optional(),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(processosTrabalhistas).values({
        ...input,
        pedidos: input.pedidos ? JSON.stringify(input.pedidos) : null,
      });
      return { id: result[0].insertId };
    }),

  // ============================================================
  // ATUALIZAR PROCESSO
  // ============================================================
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      numeroProcesso: z.string().optional(),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      tipoAcao: z.enum(['reclamatoria', 'indenizatoria', 'rescisao_indireta', 'acidente_trabalho', 'doenca_ocupacional', 'assedio', 'outros']).optional(),
      advogadoReclamante: z.string().optional(),
      advogadoEmpresa: z.string().optional(),
      valorCausa: z.string().optional(),
      valorCondenacao: z.string().optional(),
      valorAcordo: z.string().optional(),
      valorPago: z.string().optional(),
      dataDistribuicao: z.string().nullable().optional(),
      dataDesligamento: z.string().nullable().optional(),
      dataCitacao: z.string().nullable().optional(),
      dataAudiencia: z.string().nullable().optional(),
      dataEncerramento: z.string().nullable().optional(),
      status: z.enum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'acordo', 'sentenca', 'recurso', 'execucao', 'arquivado', 'encerrado']).optional(),
      fase: z.enum(['conhecimento', 'recursal', 'execucao', 'encerrado']).optional(),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).optional(),
      pedidos: z.array(z.string()).optional(),
      clienteCnpj: z.string().nullable().optional(),
      clienteRazaoSocial: z.string().nullable().optional(),
      clienteNomeFantasia: z.string().nullable().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, pedidos, ...data } = input;
      const db = (await getDb())!;
      const updateData: any = { ...data };
      if (pedidos !== undefined) updateData.pedidos = JSON.stringify(pedidos);
      await db.update(processosTrabalhistas).set(updateData)
        .where(eq(processosTrabalhistas.id, id));
      return { success: true };
    }),

  // ============================================================
  // EXCLUIR PROCESSO
  // ============================================================
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Soft delete: marca deletedAt em vez de remover permanentemente
      await db.update(processosTrabalhistas).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      } as any).where(eq(processosTrabalhistas.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // ANDAMENTOS
  // ============================================================
  listarAndamentos: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(processosAndamentos)
        .where(eq(processosAndamentos.processoId, input.processoId))
        .orderBy(desc(processosAndamentos.data));
    }),

  criarAndamento: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      data: z.string(),
      tipo: z.enum(['audiencia', 'despacho', 'sentenca', 'recurso', 'pericia', 'acordo', 'pagamento', 'citacao', 'intimacao', 'peticao', 'outros']).default('outros'),
      descricao: z.string().min(1),
      resultado: z.string().optional(),
      documentoUrl: z.string().optional(),
      documentoNome: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(processosAndamentos).values(input);
      return { id: result[0].insertId };
    }),

  excluirAndamento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(processosAndamentos).where(eq(processosAndamentos.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // ESTATÍSTICAS
  // ============================================================
  estatisticas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const processos = await db.select().from(processosTrabalhistas)
        .where(eq(processosTrabalhistas.companyId, input.companyId));

      const total = processos.length;
      const emAndamento = processos.filter(p => !['encerrado', 'arquivado'].includes(p.status)).length;
      const encerrados = processos.filter(p => ['encerrado', 'arquivado'].includes(p.status)).length;

      const parseBRL = (val: string | null) => {
        if (!val) return 0;
        const clean = val.replace(/R\$\s*/g, "").trim();
        if (clean.includes(",")) {
          return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
        }
        return parseFloat(clean) || 0;
      };

      const totalValorCausa = processos.reduce((s, p) => s + parseBRL(p.valorCausa), 0);
      const totalValorPago = processos.reduce((s, p) => s + parseBRL(p.valorPago), 0);

      const porRisco = {
        baixo: processos.filter(p => p.risco === 'baixo' && !['encerrado', 'arquivado'].includes(p.status)).length,
        medio: processos.filter(p => p.risco === 'medio' && !['encerrado', 'arquivado'].includes(p.status)).length,
        alto: processos.filter(p => p.risco === 'alto' && !['encerrado', 'arquivado'].includes(p.status)).length,
        critico: processos.filter(p => p.risco === 'critico' && !['encerrado', 'arquivado'].includes(p.status)).length,
      };

      const porStatus: Record<string, number> = {};
      for (const p of processos) {
        porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      }

      // Próximas audiências
      const hoje = new Date().toISOString().split('T')[0];
      const proximasAudiencias = processos
        .filter(p => p.dataAudiencia && p.dataAudiencia >= hoje && !['encerrado', 'arquivado'].includes(p.status))
        .sort((a, b) => (a.dataAudiencia || "").localeCompare(b.dataAudiencia || ""))
        .slice(0, 5);

      return {
        total, emAndamento, encerrados,
        totalValorCausa, totalValorPago,
        porRisco, porStatus,
        proximasAudiencias,
      };
    }),

  // ============================================================
  // BUSCAR FUNCIONÁRIOS DESLIGADOS (para vincular ao processo)
  // ============================================================
  funcionariosDesligados: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const desligados = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        dataDemissao: employees.dataDemissao,
        status: employees.status,
      }).from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, 'Desligado'),
          sql`${employees.deletedAt} IS NULL`,
        ));
      return desligados;
    }),
});
