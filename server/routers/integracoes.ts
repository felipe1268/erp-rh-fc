import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employeeIntegrations, clientes, employees } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

function calcularStatus(dataVencimento: string | null | undefined): { status: string; diasRestantes: number } {
  if (!dataVencimento) return { status: "SEM_VENCIMENTO", diasRestantes: 9999 };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + "T00:00:00");
  const diff = Math.floor((venc.getTime() - hoje.getTime()) / 86400000);
  if (diff < 0) return { status: "VENCIDA", diasRestantes: diff };
  if (diff <= 30) return { status: "A_VENCER", diasRestantes: diff };
  return { status: "ATIVA", diasRestantes: diff };
}

export const integracoesRouter = router({

  listar: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      employeeId: z.number().optional(),
      clienteId:  z.number().optional(),
      tipo:       z.string().optional(),
      status:     z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select({
          integracao: employeeIntegrations,
          nomeCompleto: employees.nomeCompleto,
          matricula:    employees.matricula,
          funcao:       employees.funcao,
          fotoUrl:      employees.fotoUrl, // Rev. 4639 — foto na listagem
        })
        .from(employeeIntegrations)
        .leftJoin(employees, eq(employees.id, employeeIntegrations.employeeId))
        .where(and(
          eq(employeeIntegrations.companyId, input.companyId),
          input.employeeId ? eq(employeeIntegrations.employeeId, input.employeeId) : undefined,
          input.clienteId  ? eq(employeeIntegrations.clienteId, input.clienteId)   : undefined,
          input.tipo       ? eq(employeeIntegrations.tipo, input.tipo)              : undefined,
        ))
        .orderBy(desc(employeeIntegrations.dataRealizacao));

      return rows.map(r => {
        const { status, diasRestantes } = calcularStatus(r.integracao.dataVencimento);
        return {
          ...r.integracao,
          nomeCompleto: r.nomeCompleto,
          matricula:    r.matricula,
          funcao:       r.funcao,
          fotoUrl:      r.fotoUrl,
          statusCalc:   status,
          diasRestantes,
        };
      }).filter(r => !input.status || r.statusCalc === input.status);
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      employeeId:     z.number(),
      tipo:           z.string().default("externa"),
      clienteId:      z.number().optional(),
      clienteNome:    z.string().optional(),
      dataRealizacao: z.string(),
      dataVencimento: z.string().optional(),
      evidencia:      z.string().optional(),
      observacoes:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).user?.id ?? null;

      let clienteNome = input.clienteNome;
      if (!clienteNome && input.clienteId) {
        const [c] = await db.select({ razaoSocial: clientes.razaoSocial }).from(clientes).where(eq(clientes.id, input.clienteId));
        clienteNome = c?.razaoSocial;
      }

      const [row] = await db.insert(employeeIntegrations).values({
        companyId:      input.companyId,
        employeeId:     input.employeeId,
        tipo:           input.tipo,
        clienteId:      input.clienteId ?? null,
        clienteNome:    clienteNome ?? (input.tipo === "interna" ? "FC Engenharia (Interna)" : null),
        dataRealizacao: input.dataRealizacao,
        dataVencimento: input.dataVencimento ?? null,
        evidencia:      input.evidencia ?? null,
        observacoes:    input.observacoes ?? null,
        registradoPor:  userId,
      }).returning();
      return row;
    }),

  criarLote: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      employeeIds:    z.array(z.number()).min(1),
      tipo:           z.string().default("externa"),
      clienteId:      z.number().optional(),
      clienteNome:    z.string().optional(),
      dataRealizacao: z.string(),
      dataVencimento: z.string().optional(),
      evidencia:      z.string().optional(),
      observacoes:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).user?.id ?? null;

      let clienteNome = input.clienteNome;
      if (!clienteNome && input.clienteId) {
        const [c] = await db.select({ razaoSocial: clientes.razaoSocial }).from(clientes).where(eq(clientes.id, input.clienteId));
        clienteNome = c?.razaoSocial;
      }
      const nomeFinal = clienteNome ?? (input.tipo === "interna" ? "FC Engenharia (Interna)" : null);

      const values = input.employeeIds.map((employeeId) => ({
        companyId:      input.companyId,
        employeeId,
        tipo:           input.tipo,
        clienteId:      input.clienteId ?? null,
        clienteNome:    nomeFinal,
        dataRealizacao: input.dataRealizacao,
        dataVencimento: input.dataVencimento ?? null,
        evidencia:      input.evidencia ?? null,
        observacoes:    input.observacoes ?? null,
        registradoPor:  userId,
      }));

      const rows = await db.insert(employeeIntegrations).values(values).returning();
      return { criados: rows.length, ids: rows.map((r: any) => r.id) };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id:             z.number(),
      companyId:      z.number(),
      employeeId:     z.number().optional(),
      tipo:           z.string().optional(),
      clienteId:      z.number().nullable().optional(),
      dataRealizacao: z.string().optional(),
      dataVencimento: z.string().optional(),
      evidencia:      z.string().optional(),
      observacoes:    z.string().optional(),
      clienteNome:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(employeeIntegrations)
        .set({ ...data, atualizadoEm: new Date().toISOString() })
        .where(and(eq(employeeIntegrations.id, id), eq(employeeIntegrations.companyId, companyId)));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(employeeIntegrations)
        .where(and(eq(employeeIntegrations.id, input.id), eq(employeeIntegrations.companyId, input.companyId)));
      return { success: true };
    }),

  verificarColaborador: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      employeeId: z.number(),
      clienteId:  z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(employeeIntegrations)
        .where(and(
          eq(employeeIntegrations.companyId, input.companyId),
          eq(employeeIntegrations.employeeId, input.employeeId),
          eq(employeeIntegrations.clienteId, input.clienteId),
        ))
        .orderBy(desc(employeeIntegrations.dataRealizacao))
        .limit(1);

      if (rows.length === 0) return { temIntegracao: false, status: "SEM_REGISTRO", registro: null };
      const { status, diasRestantes } = calcularStatus(rows[0].dataVencimento);
      return { temIntegracao: true, status, diasRestantes, registro: rows[0] };
    }),

  kpis: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(employeeIntegrations)
        .where(eq(employeeIntegrations.companyId, input.companyId));

      let ativas = 0, aVencer = 0, vencidas = 0, semVencimento = 0;
      for (const r of rows) {
        const { status } = calcularStatus(r.dataVencimento);
        if (status === "ATIVA") ativas++;
        else if (status === "A_VENCER") aVencer++;
        else if (status === "VENCIDA") vencidas++;
        else semVencimento++;
      }
      return { total: rows.length, ativas, aVencer, vencidas, semVencimento };
    }),

  clientesComIntegracao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select({ id: clientes.id, razaoSocial: clientes.razaoSocial, nomeFantasia: clientes.nomeFantasia })
        .from(clientes)
        .where(and(eq(clientes.companyId, input.companyId), eq(clientes.integracaoRequer, true)))
        .orderBy(clientes.razaoSocial);
    }),
});
