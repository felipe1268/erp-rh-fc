import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  almoxarifadoItens,
  almoxarifadoMovimentacoes,
  warehouseLoans,
  warehouseInventorySessions,
  warehouseInventorySessionItems,
  employees,
  warnings,
} from "../../drizzle/schema";

const isAdmin = (ctx: any) =>
  ctx.user.role === "admin" || ctx.user.role === "admin_master";

function getSemanaRef() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export const warehouseRouter = router({

  // ── DASHBOARD ─────────────────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const itens = await db
        .select()
        .from(almoxarifadoItens)
        .where(
          and(
            eq(almoxarifadoItens.companyId, input.companyId),
            eq(almoxarifadoItens.ativo, true)
          )
        );

      const criticos = itens.filter((i) => {
        const atual = parseFloat(String(i.quantidadeAtual) || "0");
        const minimo = parseFloat(String(i.quantidadeMinima) || "0");
        return minimo > 0 && atual <= minimo;
      });

      const valorTotal = itens.reduce(
        (s, i) =>
          s +
          parseFloat(String(i.quantidadeAtual) || "0") *
            parseFloat(String((i as any).valorUnitario) || "0"),
        0
      );

      const hoje = new Date().toISOString().split("T")[0];
      const emprestimosHoje = await db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.dataEmprestimo, hoje)
          )
        );

      const pendentes = emprestimosHoje.filter(
        (e) => e.status === "emprestado" || e.status === "pendente"
      );

      return {
        totalItens: itens.length,
        itensCriticos: criticos.length,
        valorTotalEstoque: valorTotal,
        emprestimosHoje: emprestimosHoje.length,
        pendentesDevolucao: pendentes.length,
        itensCriticosList: criticos.slice(0, 5).map((i) => ({
          id: i.id,
          nome: i.nome,
          quantidadeAtual: parseFloat(String(i.quantidadeAtual) || "0"),
          quantidadeMinima: parseFloat(String(i.quantidadeMinima) || "0"),
        })),
      };
    }),

  // ── ENTRADA DE MATERIAL ────────────────────────────────────────
  registerEntry: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        quantidade: z.number().positive(),
        motivo: z.string().optional(),
        notaFiscal: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const antes = parseFloat(String(item.quantidadeAtual) || "0");
      const depois = antes + input.quantidade;

      await db
        .update(almoxarifadoItens)
        .set({ quantidadeAtual: String(depois) } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "entrada",
        quantidade: String(input.quantidade),
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        motivo: input.motivo || (input.notaFiscal ? `NF: ${input.notaFiscal}` : null),
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, quantidadeAtual: depois };
    }),

  // ── SAÍDA DE MATERIAL ──────────────────────────────────────────
  registerExit: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        quantidade: z.number().positive(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
        motivo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const antes = parseFloat(String(item.quantidadeAtual) || "0");
      if (antes < input.quantidade)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente" });

      const depois = antes - input.quantidade;

      await db
        .update(almoxarifadoItens)
        .set({ quantidadeAtual: String(depois) } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "saida",
        quantidade: String(input.quantidade),
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        motivo: input.motivo || null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, quantidadeAtual: depois };
    }),

  // ── HISTÓRICO DE MOVIMENTAÇÕES ─────────────────────────────────
  listMovements: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number().optional(),
        tipo: z.string().optional(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(almoxarifadoMovimentacoes.companyId, input.companyId),
      ];
      if (input.itemId) conditions.push(eq(almoxarifadoMovimentacoes.itemId, input.itemId));
      if (input.tipo) conditions.push(eq(almoxarifadoMovimentacoes.tipo, input.tipo));

      const movs = await db
        .select({
          id: almoxarifadoMovimentacoes.id,
          tipo: almoxarifadoMovimentacoes.tipo,
          quantidade: almoxarifadoMovimentacoes.quantidade,
          obraId: almoxarifadoMovimentacoes.obraId,
          obraNome: almoxarifadoMovimentacoes.obraNome,
          motivo: almoxarifadoMovimentacoes.motivo,
          usuarioNome: almoxarifadoMovimentacoes.usuarioNome,
          observacoes: almoxarifadoMovimentacoes.observacoes,
          criadoEm: almoxarifadoMovimentacoes.criadoEm,
          itemId: almoxarifadoMovimentacoes.itemId,
          itemNome: almoxarifadoItens.nome,
          unidade: almoxarifadoItens.unidade,
        })
        .from(almoxarifadoMovimentacoes)
        .leftJoin(almoxarifadoItens, eq(almoxarifadoMovimentacoes.itemId, almoxarifadoItens.id))
        .where(and(...conditions))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limit);

      return movs;
    }),

  // ── EMPRÉSTIMO (COMODATO DIÁRIO) ───────────────────────────────
  registerLoan: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        obraId: z.number().optional(),
        quantidade: z.number().positive().default(1),
        funcionarioCodigo: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [funcionario] = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.companyId, input.companyId),
            eq(employees.codigoInterno, input.funcionarioCodigo)
          )
        )
        .limit(1);

      if (!funcionario)
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado pelo código" });

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const atual = parseFloat(String(item.quantidadeAtual) || "0");
      if (atual < input.quantidade)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente para empréstimo" });

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      await db.insert(warehouseLoans).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        itemId: input.itemId,
        itemNome: item.nome,
        quantidade: String(input.quantidade),
        funcionarioId: funcionario.id,
        funcionarioCodigo: input.funcionarioCodigo,
        funcionarioNome: funcionario.nomeCompleto,
        dataEmprestimo: hoje,
        horaEmprestimo: hora,
        almoxarifeId: ctx.user.id,
        almoxarifeNome: ctx.user.name || "",
        status: "emprestado",
      } as any);

      await db
        .update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`GREATEST(${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}, 0)`,
        } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "saida",
        quantidade: String(input.quantidade),
        motivo: `Empréstimo para ${funcionario.nomeCompleto}`,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, funcionarioNome: funcionario.nomeCompleto };
    }),

  // Listar empréstimos do dia
  listTodayLoans: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const hoje = new Date().toISOString().split("T")[0];
      return db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.dataEmprestimo, hoje)
          )
        )
        .orderBy(desc(warehouseLoans.createdAt));
    }),

  // Listar todos empréstimos em aberto
  listOpenLoans: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.status, "emprestado")
          )
        )
        .orderBy(desc(warehouseLoans.createdAt));
    }),

  // Devolver item
  returnLoanById: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado" });

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      await db
        .update(warehouseLoans)
        .set({ status: "devolvido", dataDevolucao: hoje, horaDevolucao: hora } as any)
        .where(eq(warehouseLoans.id, input.loanId));

      await db
        .update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${loan.quantidade}::numeric`,
        } as any)
        .where(eq(almoxarifadoItens.id, loan.itemId));

      return { success: true };
    }),

  // Marcar como perdido
  markLoanLost: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(warehouseLoans)
        .set({ status: "perdido" } as any)
        .where(eq(warehouseLoans.id, input.loanId));

      if (loan.funcionarioId) {
        await db.insert(warnings).values({
          companyId: loan.companyId,
          employeeId: loan.funcionarioId,
          tipoAdvertencia: "Advertencia",
          motivo: `Ferramenta não devolvida: ${loan.itemNome} — emprestada em ${loan.dataEmprestimo}`,
          dataOcorrencia: new Date().toISOString().split("T")[0],
          aplicadoPor: ctx.user.name || "Sistema",
          sequencia: 1,
        } as any);
      }

      return { success: true };
    }),

  // ── BUSCAR FUNCIONÁRIO PELO CÓDIGO ─────────────────────────────
  getFuncionarioByCodigo: protectedProcedure
    .input(z.object({ companyId: z.number(), codigo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [func] = await db
        .select({
          id: employees.id,
          nomeCompleto: employees.nomeCompleto,
          codigoInterno: employees.codigoInterno,
          cargo: (employees as any).cargo,
          fotoUrl: (employees as any).fotoPerfil,
        })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, input.companyId),
            eq(employees.codigoInterno, input.codigo)
          )
        )
        .limit(1);

      return func || null;
    }),

  // ── INVENTÁRIO SEMANAL ─────────────────────────────────────────
  getInventorySession: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const semanaRef = getSemanaRef();

      const [session] = await db
        .select()
        .from(warehouseInventorySessions)
        .where(
          and(
            eq(warehouseInventorySessions.companyId, input.companyId),
            eq(warehouseInventorySessions.semanaRef, semanaRef)
          )
        )
        .limit(1);

      return session || null;
    }),

  startInventorySession: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const semanaRef = getSemanaRef();

      const itens = await db
        .select()
        .from(almoxarifadoItens)
        .where(
          and(
            eq(almoxarifadoItens.companyId, input.companyId),
            eq(almoxarifadoItens.ativo, true)
          )
        );

      const [result] = await db
        .insert(warehouseInventorySessions)
        .values({
          companyId: input.companyId,
          semanaRef,
          status: "em_andamento",
          totalItens: itens.length,
          iniciadoEm: new Date().toISOString(),
          almoxarifeId: ctx.user.id,
          almoxarifeNome: ctx.user.name || "",
        } as any)
        .returning({ id: warehouseInventorySessions.id });

      const sessionId = result.id;

      for (const item of itens) {
        await db.insert(warehouseInventorySessionItems).values({
          sessionId,
          itemId: item.id,
          itemNome: item.nome,
          quantidadeSistema: item.quantidadeAtual ?? "0",
          status: "pendente",
        } as any);
      }

      return { sessionId };
    }),

  getInventorySessionItems: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId))
        .orderBy(warehouseInventorySessionItems.id);
    }),

  confirmInventoryItem: protectedProcedure
    .input(
      z.object({
        sessionItemId: z.number(),
        quantidadeFisica: z.number(),
        observacoes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sessionItem] = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.id, input.sessionItemId));
      if (!sessionItem) throw new TRPCError({ code: "NOT_FOUND" });

      const sistemaQtd = parseFloat(String(sessionItem.quantidadeSistema) || "0");
      const diferenca = input.quantidadeFisica - sistemaQtd;
      const status = Math.abs(diferenca) < 0.001 ? "conferido" : "divergente";

      await db
        .update(warehouseInventorySessionItems)
        .set({
          quantidadeFisica: String(input.quantidadeFisica),
          diferenca: String(diferenca),
          status,
          conferidoEm: new Date().toISOString(),
          observacoes: input.observacoes || null,
        } as any)
        .where(eq(warehouseInventorySessionItems.id, input.sessionItemId));

      // Atualizar contadores da sessão
      const sessionItems = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, sessionItem.sessionId));

      const conferidos = sessionItems.filter((i) => i.status !== "pendente").length;
      const divergentes = sessionItems.filter((i) => i.status === "divergente").length;
      const allDone = conferidos === sessionItems.length;

      await db
        .update(warehouseInventorySessions)
        .set({
          itensConferidos: conferidos,
          itensDivergentes: divergentes,
          status: allDone ? "concluido" : "em_andamento",
          concluidoEm: allDone ? new Date().toISOString() : null,
        } as any)
        .where(eq(warehouseInventorySessions.id, sessionItem.sessionId));

      return { status, diferenca };
    }),

  finishInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(warehouseInventorySessions)
        .set({ status: "concluido", concluidoEm: new Date().toISOString() } as any)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true };
    }),

  cancelInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId));

      await db
        .delete(warehouseInventorySessions)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true };
    }),
});
