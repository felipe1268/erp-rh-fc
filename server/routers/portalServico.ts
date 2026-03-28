import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  supplierContracts,
  serviceContractTokens,
  serviceContractMeasurements,
  serviceContractDocuments,
  serviceContractActionLogs,
  fornecedores,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import crypto from "crypto";

async function logAction(db: any, data: {
  companyId: number; contractId: number; supplierId?: number;
  userId?: number; userName?: string; acao: string; detalhes?: string;
}) {
  await db.insert(serviceContractActionLogs).values({
    companyId: data.companyId, contractId: data.contractId,
    supplierId: data.supplierId, userId: data.userId,
    userName: data.userName, acao: data.acao, detalhes: data.detalhes,
  } as any);
}

async function validateToken(db: any, token: string) {
  const rows = await db.select().from(serviceContractTokens)
    .where(eq(serviceContractTokens.token, token)).limit(1);
  const tok = rows?.[0];
  if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
  if (tok.expiresAt && new Date(tok.expiresAt) < new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Token expirado" });
  }
  return tok;
}

export const portalServicoRouter = router({

  verificarTokenServico: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const tok = await validateToken(db, input.token);
      await db.update(serviceContractTokens)
        .set({ accessedAt: new Date().toISOString() } as any)
        .where(eq(serviceContractTokens.token, input.token));

      const contracts = await db.select().from(supplierContracts)
        .where(eq(supplierContracts.id, tok.contractId)).limit(1);
      const contrato = contracts?.[0];
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      if (contrato.tipo !== "servico") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este portal é exclusivo para contratos de serviço" });
      }

      const medicoes = await db.select().from(serviceContractMeasurements)
        .where(eq(serviceContractMeasurements.contractId, tok.contractId))
        .orderBy(desc(serviceContractMeasurements.createdAt));

      const documentos = await db.select().from(serviceContractDocuments)
        .where(eq(serviceContractDocuments.contractId, tok.contractId))
        .orderBy(desc(serviceContractDocuments.createdAt));

      return { token: tok, contrato, medicoes, documentos };
    }),

  confirmarRecebimentoContrato: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const tok = await validateToken(db, input.token);

      const now = new Date().toISOString();
      await db.update(serviceContractTokens)
        .set({ confirmedAt: now, status: "confirmado" } as any)
        .where(eq(serviceContractTokens.token, input.token));

      await db.update(supplierContracts)
        .set({ contratoConfirmado: 1, confirmadoEm: now, updatedAt: now } as any)
        .where(eq(supplierContracts.id, tok.contractId));

      await logAction(db, {
        companyId: tok.companyId, contractId: tok.contractId,
        supplierId: tok.supplierId, acao: "confirmacao_contrato",
        detalhes: "Prestador confirmou recebimento do contrato",
      });
      return { ok: true };
    }),

  enviarMedicao: publicProcedure
    .input(z.object({
      token: z.string(),
      mesReferencia: z.string(),
      percentualConcluido: z.number().min(0).max(100),
      valorMedido: z.number().optional(),
      descricao: z.string().optional(),
      fotosBase64: z.array(z.object({
        nome: z.string(), data: z.string(), tipo: z.string(),
      })).optional(),
      relatorioBase64: z.object({
        nome: z.string(), data: z.string(), tipo: z.string(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const tok = await validateToken(db, input.token);

      let fotosUrls: string[] = [];
      if (input.fotosBase64?.length) {
        for (const foto of input.fotosBase64) {
          const buf = Buffer.from(foto.data, "base64");
          const key = `portal-servico/${tok.contractId}/medicoes/${Date.now()}-${foto.nome}`;
          const { url } = await storagePut(key, buf, foto.tipo);
          fotosUrls.push(url);
        }
      }

      let relatorioUrl: string | null = null;
      if (input.relatorioBase64) {
        const buf = Buffer.from(input.relatorioBase64.data, "base64");
        const key = `portal-servico/${tok.contractId}/relatorios/${Date.now()}-${input.relatorioBase64.nome}`;
        const { url } = await storagePut(key, buf, input.relatorioBase64.tipo);
        relatorioUrl = url;
      }

      const [med] = await db.insert(serviceContractMeasurements).values({
        companyId: tok.companyId, contractId: tok.contractId,
        supplierId: tok.supplierId, mesReferencia: input.mesReferencia,
        percentualConcluido: String(input.percentualConcluido),
        valorMedido: input.valorMedido ? String(input.valorMedido) : null,
        descricao: input.descricao,
        fotosUrls: fotosUrls.length > 0 ? fotosUrls : null,
        relatorioUrl,
        status: "pendente",
      } as any).returning();

      await logAction(db, {
        companyId: tok.companyId, contractId: tok.contractId,
        supplierId: tok.supplierId, acao: "envio_medicao",
        detalhes: `Medição ${input.mesReferencia} - ${input.percentualConcluido}% concluído`,
      });
      return med;
    }),

  enviarDocumento: publicProcedure
    .input(z.object({
      token: z.string(),
      tipo: z.string(),
      nome: z.string(),
      arquivoBase64: z.string(),
      arquivoTipo: z.string(),
      dataValidade: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const tok = await validateToken(db, input.token);

      const buf = Buffer.from(input.arquivoBase64, "base64");
      const key = `portal-servico/${tok.contractId}/docs/${Date.now()}-${input.nome}`;
      const { url } = await storagePut(key, buf, input.arquivoTipo);

      const [doc] = await db.insert(serviceContractDocuments).values({
        companyId: tok.companyId, contractId: tok.contractId,
        supplierId: tok.supplierId, tipo: input.tipo,
        nome: input.nome, arquivoUrl: url,
        dataValidade: input.dataValidade || null,
        observacoes: input.observacoes,
      } as any).returning();

      await logAction(db, {
        companyId: tok.companyId, contractId: tok.contractId,
        supplierId: tok.supplierId, acao: "upload_documento",
        detalhes: `Documento: ${input.tipo} - ${input.nome}`,
      });
      return doc;
    }),

  historicoContratos: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const tok = await validateToken(db, input.token);

      const contratos = await db.select().from(supplierContracts)
        .where(and(
          eq(supplierContracts.supplierId, tok.supplierId),
          eq(supplierContracts.companyId, tok.companyId),
          eq(supplierContracts.tipo, "servico"),
        ))
        .orderBy(desc(supplierContracts.createdAt));

      const contratosComMedicoes = await Promise.all(contratos.map(async (c: any) => {
        const medicoes = await db.select().from(serviceContractMeasurements)
          .where(eq(serviceContractMeasurements.contractId, c.id))
          .orderBy(desc(serviceContractMeasurements.createdAt));
        return { ...c, medicoes };
      }));

      return contratosComMedicoes;
    }),

  gerarTokenContrato: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      validadeDias: z.number().default(365),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const contracts = await db.select().from(supplierContracts)
        .where(eq(supplierContracts.id, input.contractId)).limit(1);
      const contrato = contracts?.[0];
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      if (contrato.tipo !== "servico") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tokens de portal são exclusivos para contratos de serviço" });
      }

      const supRows = await db.select().from(fornecedores)
        .where(eq(fornecedores.id, contrato.supplierId)).limit(1);
      const sup = supRows?.[0];

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.validadeDias);

      const [tok] = await db.insert(serviceContractTokens).values({
        companyId: contrato.companyId, contractId: input.contractId,
        supplierId: contrato.supplierId,
        supplierNome: sup?.razaoSocial || contrato.supplierNome,
        supplierEmail: sup?.email,
        token, expiresAt: expiresAt.toISOString(),
      } as any).returning();

      await logAction(db, {
        companyId: contrato.companyId, contractId: input.contractId,
        userId: ctx.user.id, userName: ctx.user.name,
        acao: "token_gerado", detalhes: "Token de acesso ao portal gerado",
      });
      return { token: tok, url: `/portal/servico/${token}` };
    }),

  listarMedicoesPendentes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(serviceContractMeasurements.companyId, input.companyId)];
      if (input.status) conditions.push(eq(serviceContractMeasurements.status, input.status));
      if (input.contractId) conditions.push(eq(serviceContractMeasurements.contractId, input.contractId));

      const medicoes = await db.select().from(serviceContractMeasurements)
        .where(and(...conditions))
        .orderBy(desc(serviceContractMeasurements.createdAt));

      const comContrato = await Promise.all(medicoes.map(async (m: any) => {
        const contracts = await db.select().from(supplierContracts)
          .where(eq(supplierContracts.id, m.contractId)).limit(1);
        return { ...m, contrato: contracts?.[0] || null };
      }));
      return comContrato;
    }),

  aprovarMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const rows = await db.select().from(serviceContractMeasurements)
        .where(eq(serviceContractMeasurements.id, input.medicaoId)).limit(1);
      const med = rows?.[0];
      if (!med) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada" });

      const now = new Date().toISOString();
      await db.update(serviceContractMeasurements).set({
        status: "aprovada", aprovadorId: ctx.user.id,
        aprovadorNome: ctx.user.name, aprovadoEm: now, updatedAt: now,
      } as any).where(eq(serviceContractMeasurements.id, input.medicaoId));

      await logAction(db, {
        companyId: med.companyId, contractId: med.contractId,
        userId: ctx.user.id, userName: ctx.user.name,
        acao: "aprovacao_medicao",
        detalhes: `Medição #${med.id} (${med.mesReferencia}) aprovada`,
      });
      return { ok: true };
    }),

  recusarMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number(), motivo: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const rows = await db.select().from(serviceContractMeasurements)
        .where(eq(serviceContractMeasurements.id, input.medicaoId)).limit(1);
      const med = rows?.[0];
      if (!med) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada" });

      const now = new Date().toISOString();
      await db.update(serviceContractMeasurements).set({
        status: "recusada", motivoRecusa: input.motivo,
        aprovadorId: ctx.user.id, aprovadorNome: ctx.user.name,
        aprovadoEm: now, updatedAt: now,
      } as any).where(eq(serviceContractMeasurements.id, input.medicaoId));

      await logAction(db, {
        companyId: med.companyId, contractId: med.contractId,
        userId: ctx.user.id, userName: ctx.user.name,
        acao: "recusa_medicao",
        detalhes: `Medição #${med.id} (${med.mesReferencia}) recusada: ${input.motivo}`,
      });
      return { ok: true };
    }),

  listarContratosServico: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [
        eq(supplierContracts.companyId, input.companyId),
        eq(supplierContracts.tipo, "servico"),
      ];
      if (input.status) conditions.push(eq(supplierContracts.status, input.status));
      const rows = await db.select().from(supplierContracts)
        .where(and(...conditions))
        .orderBy(desc(supplierContracts.createdAt));

      const comTokens = await Promise.all(rows.map(async (c: any) => {
        const tokens = await db.select().from(serviceContractTokens)
          .where(eq(serviceContractTokens.contractId, c.id))
          .orderBy(desc(serviceContractTokens.createdAt));
        return { ...c, tokens };
      }));
      return comTokens;
    }),

  listarLogAcoes: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(serviceContractActionLogs)
        .where(eq(serviceContractActionLogs.contractId, input.contractId))
        .orderBy(desc(serviceContractActionLogs.createdAt));
    }),

  criarContratoServico: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      supplierId: z.number(),
      supplierNome: z.string().optional(),
      itemNome: z.string().optional(),
      valorUnitario: z.number(),
      valorTotal: z.number().optional(),
      unidade: z.string().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      escopo: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      observacoes: z.string().optional(),
      gerarToken: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [contrato] = await db.insert(supplierContracts).values({
        companyId: input.companyId, supplierId: input.supplierId,
        supplierNome: input.supplierNome, itemNome: input.itemNome,
        valorUnitario: String(input.valorUnitario),
        valorTotal: input.valorTotal ? String(input.valorTotal) : null,
        unidade: input.unidade, dataInicio: input.dataInicio, dataFim: input.dataFim,
        tipo: "servico", escopo: input.escopo,
        condicaoPagamento: input.condicaoPagamento,
        obraId: input.obraId, obraNome: input.obraNome,
        observacoes: input.observacoes,
      } as any).returning();

      let tokenResult = null;
      if (input.gerarToken) {
        const supRows = await db.select().from(fornecedores)
          .where(eq(fornecedores.id, input.supplierId)).limit(1);
        const sup = supRows?.[0];

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 365);

        const [tok] = await db.insert(serviceContractTokens).values({
          companyId: input.companyId, contractId: contrato.id,
          supplierId: input.supplierId,
          supplierNome: sup?.razaoSocial || input.supplierNome,
          supplierEmail: sup?.email,
          token, expiresAt: expiresAt.toISOString(),
        } as any).returning();

        tokenResult = { token: tok, url: `/portal/servico/${token}` };
      }

      await logAction(db, {
        companyId: input.companyId, contractId: contrato.id,
        userId: ctx.user.id, userName: ctx.user.name,
        acao: "contrato_criado", detalhes: `Contrato de serviço criado para ${input.supplierNome}`,
      });

      return { contrato, tokenResult };
    }),
});
