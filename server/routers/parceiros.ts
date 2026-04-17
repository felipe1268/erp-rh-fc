import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  parceirosConveniados,
  lancamentosParceiros,
  pagamentosParceiros,
  employees,
} from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";

// Sanitiza payload do parceiro: converte vírgula decimal para ponto e
// transforma strings vazias em null nos campos numéricos.
function sanitizeParceiroPayload<T extends Record<string, any>>(input: T): T {
  const out: any = { ...input };
  // Campo NUMERIC no Postgres — Drizzle envia como string
  if (out.limiteMensalPorColaborador !== undefined) {
    const v = String(out.limiteMensalPorColaborador ?? "").trim();
    if (v === "") {
      out.limiteMensalPorColaborador = null;
    } else {
      // Aceita "150,00", "1.500,00", "1500.00", "150"
      const normalized = v.includes(",")
        ? v.replace(/\./g, "").replace(",", ".")
        : v;
      const num = Number(normalized);
      out.limiteMensalPorColaborador = Number.isFinite(num) ? String(num) : null;
    }
  }
  // Inteiros opcionais que podem vir como string vazia do form
  for (const k of ["diaFechamento", "prazoPagamento"] as const) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

export const parceirosRouter = router({
  // ============================================================
  // PARCEIROS CONVENIADOS
  // ============================================================
  cadastro: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(parceirosConveniados)
          .where(and(companyFilter(parceirosConveniados.companyId, input), isNull(parceirosConveniados.deletedAt)))
          .orderBy(parceirosConveniados.razaoSocial);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(parceirosConveniados).where(eq(parceirosConveniados.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), razaoSocial: z.string().min(1),
        nomeFantasia: z.string().optional(),
        cnpj: z.string().min(1),
        inscricaoEstadual: z.string().optional(),
        inscricaoMunicipal: z.string().optional(),
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        complemento: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        telefone: z.string().optional(),
        celular: z.string().optional(),
        emailPrincipal: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoConvenio: z.enum(["farmacia", "posto_combustivel", "restaurante", "mercado", "outros"]),
        tipoConvenioOutro: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        diaFechamento: z.number().optional(),
        prazoPagamento: z.number().optional(),
        limiteMensalPorColaborador: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const data = sanitizeParceiroPayload(input);
        const [row] = await db
          .insert(parceirosConveniados)
          .values({
            ...data,
            createdBy: ctx.user?.name || "Sistema",
          } as any)
          .returning({ id: parceirosConveniados.id });
        return { id: row.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        razaoSocial: z.string().nullish(),
        nomeFantasia: z.string().nullish(),
        cnpj: z.string().nullish(),
        inscricaoEstadual: z.string().nullish(),
        inscricaoMunicipal: z.string().nullish(),
        cep: z.string().nullish(),
        logradouro: z.string().nullish(),
        numero: z.string().nullish(),
        complemento: z.string().nullish(),
        bairro: z.string().nullish(),
        cidade: z.string().nullish(),
        estado: z.string().nullish(),
        telefone: z.string().nullish(),
        celular: z.string().nullish(),
        emailPrincipal: z.string().nullish(),
        emailFinanceiro: z.string().nullish(),
        responsavelNome: z.string().nullish(),
        responsavelCargo: z.string().nullish(),
        tipoConvenio: z.enum(["farmacia", "posto_combustivel", "restaurante", "mercado", "outros"]).nullish(),
        tipoConvenioOutro: z.string().nullish(),
        banco: z.string().nullish(),
        agencia: z.string().nullish(),
        conta: z.string().nullish(),
        tipoConta: z.enum(["corrente", "poupanca"]).nullish(),
        titularConta: z.string().nullish(),
        cpfCnpjTitular: z.string().nullish(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).nullish(),
        pixChave: z.string().nullish(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).nullish(),
        diaFechamento: z.number().nullish(),
        prazoPagamento: z.number().nullish(),
        limiteMensalPorColaborador: z.union([z.string(), z.number()]).nullish(),
        status: z.enum(["ativo", "suspenso", "inativo"]).nullish(),
        observacoes: z.string().nullish(),
        contratoConvenioUrl: z.string().nullish(),
        contratoSocialUrl: z.string().nullish(),
        alvaraUrl: z.string().nullish(),
      }).passthrough())
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const data = sanitizeParceiroPayload(rest);
        await db.update(parceirosConveniados).set(data as any).where(eq(parceirosConveniados.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(parceirosConveniados).set({ deletedAt: new Date().toISOString() }).where(eq(parceirosConveniados.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        parceiroId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `parceiros/${input.parceiroId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(parceirosConveniados).set({ [input.field]: url } as any).where(eq(parceirosConveniados.id, input.parceiroId));
        return { url };
      }),
  }),

  // ============================================================
  // LANÇAMENTOS
  // ============================================================
  lancamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), parceiroId: z.number().optional(),
        competencia: z.string().optional(),
        status: z.enum(["pendente", "aprovado", "rejeitado"]).optional(),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(lancamentosParceiros.companyId, input)];
        if (input.parceiroId) conditions.push(eq(lancamentosParceiros.parceiroId, input.parceiroId));
        if (input.competencia) conditions.push(eq(lancamentosParceiros.competenciaDesconto, input.competencia));
        if (input.status) conditions.push(eq(lancamentosParceiros.status, input.status));
        return db.select().from(lancamentosParceiros).where(and(...conditions)).orderBy(desc(lancamentosParceiros.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        parceiroId: z.number().optional(),
        parceiroConveniadoId: z.number().optional(),
        companyId: z.number(),
        employeeId: z.number(),
        employeeNome: z.string().nullish(),
        dataCompra: z.string(),
        descricaoItens: z.string().nullish(),
        valor: z.union([z.string(), z.number()]),
        competenciaDesconto: z.string().nullish(),
      }).passthrough())
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const parceiroId = input.parceiroId ?? input.parceiroConveniadoId;
        if (!parceiroId) throw new Error("Parceiro é obrigatório");

        // Sanitiza valor (aceita "129,51", "1.500,00", "129.51", 129.51)
        const rawV = String(input.valor ?? "").trim();
        const normV = rawV.includes(",")
          ? rawV.replace(/\./g, "").replace(",", ".")
          : rawV;
        const valorNum = Number(normV);
        if (!Number.isFinite(valorNum) || valorNum <= 0) {
          throw new Error("Valor inválido");
        }

        // Resolve nome do colaborador se não enviado
        let employeeNome = input.employeeNome ?? "";
        if (!employeeNome) {
          const [emp] = await db
            .select({ nome: employees.nomeCompleto })
            .from(employees)
            .where(eq(employees.id, input.employeeId));
          employeeNome = emp?.nome ?? "";
        }
        if (!employeeNome) throw new Error("Colaborador não encontrado");

        const [row] = await db
          .insert(lancamentosParceiros)
          .values({
            parceiroId,
            companyId: input.companyId,
            employeeId: input.employeeId,
            employeeNome,
            dataCompra: input.dataCompra,
            descricaoItens: input.descricaoItens ?? null,
            valor: String(valorNum),
            competenciaDesconto: input.competenciaDesconto ?? null,
            lancadoPor: ctx.user?.name || "Sistema",
          } as any)
          .returning({ id: lancamentosParceiros.id });
        return { id: row.id };
      }),

    aprovar: protectedProcedure
      .input(z.object({ id: z.number(), aprovado: z.boolean(), motivoRejeicao: z.string().optional(), comentarioAdmin: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const updateData: any = {
          status: input.aprovado ? "aprovado" : "rejeitado",
          aprovadoPor: ctx.user?.name || "Sistema",
          aprovadoEm: new Date().toISOString(),
        };
        if (!input.aprovado && input.motivoRejeicao) updateData.motivoRejeicao = input.motivoRejeicao;
        if (input.comentarioAdmin) updateData.comentarioAdmin = input.comentarioAdmin;
        await db.update(lancamentosParceiros).set(updateData).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    cancelarAprovacao: protectedProcedure
      .input(z.object({ id: z.number(), comentario: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(lancamentosParceiros).set({
          status: "pendente",
          aprovadoPor: null,
          aprovadoEm: null,
          motivoRejeicao: null,
          comentarioAdmin: input.comentario || null,
        }).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    editarLancamento: protectedProcedure
      .input(z.object({
        id: z.number(),
        employeeId: z.number().optional(),
        employeeNome: z.string().optional(),
        dataCompra: z.string().optional(),
        descricaoItens: z.string().optional(),
        valor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        const updateData: any = {};
        if (data.employeeId) updateData.employeeId = data.employeeId;
        if (data.employeeNome) updateData.employeeNome = data.employeeNome;
        if (data.dataCompra) updateData.dataCompra = data.dataCompra;
        if (data.descricaoItens !== undefined) updateData.descricaoItens = data.descricaoItens;
        if (data.valor) updateData.valor = data.valor;
        await db.update(lancamentosParceiros).set(updateData).where(eq(lancamentosParceiros.id, id));
        return { success: true };
      }),

    excluirLancamento: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(lancamentosParceiros).where(eq(lancamentosParceiros.id, input.id));
        return { success: true };
      }),

    uploadComprovante: protectedProcedure
      .input(z.object({
        lancamentoId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `parceiros/lancamentos/${input.lancamentoId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(lancamentosParceiros).set({ comprovanteUrl: url }).where(eq(lancamentosParceiros.id, input.lancamentoId));
        return { url };
      }),
  }),

  // ============================================================
  // GUIA DE DESCONTOS
  // ============================================================
  guiaDescontos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), competencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const lancamentos = await db.select().from(lancamentosParceiros)
        .where(and(
          companyFilter(lancamentosParceiros.companyId, input),
          eq(lancamentosParceiros.competenciaDesconto, input.competencia),
          eq(lancamentosParceiros.status, "aprovado"),
        ))
        .orderBy(lancamentosParceiros.employeeNome);

      // Group by employee
      const byEmployee: Record<number, { nome: string; total: number; lancamentos: any[] }> = {};
      for (const l of lancamentos) {
        if (!byEmployee[l.employeeId]) {
          byEmployee[l.employeeId] = { nome: l.employeeNome, total: 0, lancamentos: [] };
        }
        byEmployee[l.employeeId].total += parseFloat(l.valor as string);
        byEmployee[l.employeeId].lancamentos.push(l);
      }
      return {
        competencia: input.competencia,
        totalGeral: lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor), 0),
        porColaborador: Object.entries(byEmployee).map(([empId, data]) => ({
          employeeId: parseInt(empId),
          ...data,
        })),
      };
    }),

  // ============================================================
  // PAGAMENTOS
  // ============================================================
  pagamentos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), parceiroId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(pagamentosParceiros.companyId, input)];
        if (input.parceiroId) conditions.push(eq(pagamentosParceiros.parceiroId, input.parceiroId));
        return db.select().from(pagamentosParceiros).where(and(...conditions)).orderBy(desc(pagamentosParceiros.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        parceiroId: z.number(),
        companyId: z.number(),
        competencia: z.string(),
        valorTotal: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(pagamentosParceiros).values(input as any);
        return { id: result[0].id };
      }),

    registrarPagamento: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataPagamento: z.string(),
        comprovanteUrl: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(pagamentosParceiros).set({
          status: "pago",
          dataPagamento: input.dataPagamento,
          comprovanteUrl: input.comprovanteUrl || null,
          observacoes: input.observacoes || null,
          pagoBy: ctx.user?.name || "Sistema",
        } as any).where(eq(pagamentosParceiros.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PAINEL / DASHBOARD
  // ============================================================
  painel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const parceiros = await db.select().from(parceirosConveniados)
        .where(and(companyFilter(parceirosConveniados.companyId, input), isNull(parceirosConveniados.deletedAt)));

      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const lancamentos = await db.select().from(lancamentosParceiros)
        .where(and(companyFilter(lancamentosParceiros.companyId, input), eq(lancamentosParceiros.competenciaDesconto, competenciaAtual)));

      const pagamentos = await db.select().from(pagamentosParceiros)
        .where(and(companyFilter(pagamentosParceiros.companyId, input), eq(pagamentosParceiros.competencia, competenciaAtual)));

      return {
        parceiros: {
          total: parceiros.length,
          ativos: parceiros.filter((p: any) => p.statusParceiro === "ativo").length,
          porTipo: {
            farmacia: parceiros.filter((p: any) => p.tipoConvenio === "farmacia").length,
            posto: parceiros.filter((p: any) => p.tipoConvenio === "posto_combustivel").length,
            restaurante: parceiros.filter((p: any) => p.tipoConvenio === "restaurante").length,
            mercado: parceiros.filter((p: any) => p.tipoConvenio === "mercado").length,
            outros: parceiros.filter((p: any) => p.tipoConvenio === "outros").length,
          },
        },
        lancamentosMes: {
          total: lancamentos.length,
          pendentes: lancamentos.filter((l: any) => l.status === "pendente").length,
          aprovados: lancamentos.filter((l: any) => l.status === "aprovado").length,
          rejeitados: lancamentos.filter((l: any) => l.status === "rejeitado").length,
          valorTotal: lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0),
        },
        pagamentosMes: {
          total: pagamentos.length,
          pagos: pagamentos.filter((p: any) => p.status === "pago").length,
          pendentes: pagamentos.filter((p: any) => p.status === "pendente").length,
          valorTotal: pagamentos.reduce((sum: number, p: any) => sum + parseFloat(p.valorTotal || "0"), 0),
        },
      };
    }),
});
