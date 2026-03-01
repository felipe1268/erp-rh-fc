import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  empresasTerceiras,
  funcionariosTerceiros,
  obrigacoesMensaisTerceiros,
  alertasTerceiros,
  obras,
} from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, like, gte, lte } from "drizzle-orm";
import { storagePut } from "../storage";

export const terceirosRouter = router({
  // ============================================================
  // EMPRESAS TERCEIRAS
  // ============================================================
  empresas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(empresasTerceiras)
          .where(and(eq(empresasTerceiras.companyId, input.companyId), isNull(empresasTerceiras.deletedAt)))
          .orderBy(empresasTerceiras.razaoSocial);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        razaoSocial: z.string().min(1),
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
        email: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoServico: z.string().optional(),
        descricaoServico: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(empresasTerceiras).values({
          ...input,
          createdBy: ctx.user?.name || "Sistema",
        });
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        razaoSocial: z.string().optional(),
        nomeFantasia: z.string().optional(),
        cnpj: z.string().optional(),
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
        email: z.string().optional(),
        emailFinanceiro: z.string().optional(),
        responsavelNome: z.string().optional(),
        responsavelCargo: z.string().optional(),
        tipoServico: z.string().optional(),
        descricaoServico: z.string().optional(),
        banco: z.string().optional(),
        agencia: z.string().optional(),
        conta: z.string().optional(),
        tipoConta: z.enum(["corrente", "poupanca"]).optional(),
        titularConta: z.string().optional(),
        cpfCnpjTitular: z.string().optional(),
        formaPagamento: z.enum(["pix", "boleto", "transferencia", "deposito"]).optional(),
        pixChave: z.string().optional(),
        pixTipoChave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional(),
        status: z.enum(["ativa", "suspensa", "inativa"]).optional(),
        observacoes: z.string().optional(),
        // Documentos
        pgrUrl: z.string().optional(),
        pgrValidade: z.string().optional(),
        pcmsoUrl: z.string().optional(),
        pcmsoValidade: z.string().optional(),
        contratoSocialUrl: z.string().optional(),
        alvaraUrl: z.string().optional(),
        alvaraValidade: z.string().optional(),
        seguroVidaUrl: z.string().optional(),
        seguroVidaValidade: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        await db.update(empresasTerceiras).set(data as any).where(eq(empresasTerceiras.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(empresasTerceiras).set({ deletedAt: new Date().toISOString() }).where(eq(empresasTerceiras.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        empresaId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/empresas/${input.empresaId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(empresasTerceiras).set({ [input.field]: url } as any).where(eq(empresasTerceiras.id, input.empresaId));
        return { url };
      }),

    // Dashboard stats
    stats: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(empresasTerceiras)
          .where(and(eq(empresasTerceiras.companyId, input.companyId), isNull(empresasTerceiras.deletedAt)));
        const ativas = all.filter((e: any) => e.statusTerceira === "ativa").length;
        const suspensas = all.filter((e: any) => e.statusTerceira === "suspensa").length;
        const inativas = all.filter((e: any) => e.statusTerceira === "inativa").length;
        return { total: all.length, ativas, suspensas, inativas };
      }),
  }),

  // ============================================================
  // FUNCIONÁRIOS TERCEIROS
  // ============================================================
  funcionarios: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), empresaTerceiraId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [eq(funcionariosTerceiros.companyId, input.companyId), isNull(funcionariosTerceiros.deletedAt)];
        if (input.empresaTerceiraId) conditions.push(eq(funcionariosTerceiros.empresaTerceiraId, input.empresaTerceiraId));
        return db.select().from(funcionariosTerceiros).where(and(...conditions)).orderBy(funcionariosTerceiros.nome);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.id));
        return row || null;
      }),

    create: protectedProcedure
      .input(z.object({
        empresaTerceiraId: z.number(),
        companyId: z.number(),
        nome: z.string().min(1),
        cpf: z.string().optional(),
        rg: z.string().optional(),
        dataNascimento: z.string().optional(),
        funcao: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(funcionariosTerceiros).values(input);
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        cpf: z.string().optional(),
        rg: z.string().optional(),
        dataNascimento: z.string().optional(),
        funcao: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
        statusAptidao: z.enum(["apto", "inapto", "pendente"]).optional(),
        motivoInapto: z.string().optional(),
        status: z.enum(["ativo", "inativo", "afastado"]).optional(),
        asoUrl: z.string().optional(),
        asoValidade: z.string().optional(),
        treinamentoNrUrl: z.string().optional(),
        treinamentoNrValidade: z.string().optional(),
        certificadosUrl: z.string().optional(),
        fotoUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...data } = input;
        await db.update(funcionariosTerceiros).set(data as any).where(eq(funcionariosTerceiros.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.update(funcionariosTerceiros).set({ deletedAt: new Date().toISOString() }).where(eq(funcionariosTerceiros.id, input.id));
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        funcTerceiroId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/funcionarios/${input.funcTerceiroId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(funcionariosTerceiros).set({ [input.field]: url } as any).where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { url };
      }),

    stats: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(funcionariosTerceiros)
          .where(and(eq(funcionariosTerceiros.companyId, input.companyId), isNull(funcionariosTerceiros.deletedAt)));
        const aptos = all.filter((f: any) => f.statusAptidaoTerceiro === "apto").length;
        const inaptos = all.filter((f: any) => f.statusAptidaoTerceiro === "inapto").length;
        const pendentes = all.filter((f: any) => f.statusAptidaoTerceiro === "pendente").length;
        return { total: all.length, aptos, inaptos, pendentes };
      }),
  }),

  // ============================================================
  // OBRIGAÇÕES MENSAIS
  // ============================================================
  obrigacoes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), empresaTerceiraId: z.number().optional(), competencia: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [eq(obrigacoesMensaisTerceiros.companyId, input.companyId)];
        if (input.empresaTerceiraId) conditions.push(eq(obrigacoesMensaisTerceiros.empresaTerceiraId, input.empresaTerceiraId));
        if (input.competencia) conditions.push(eq(obrigacoesMensaisTerceiros.competencia, input.competencia));
        return db.select().from(obrigacoesMensaisTerceiros).where(and(...conditions)).orderBy(desc(obrigacoesMensaisTerceiros.competencia));
      }),

    create: protectedProcedure
      .input(z.object({
        empresaTerceiraId: z.number(),
        companyId: z.number(),
        competencia: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(obrigacoesMensaisTerceiros).values(input);
        return { id: result.insertId };
      }),

    updateDocStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        field: z.string(),
        status: z.enum(["pendente", "enviado", "aprovado", "rejeitado"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const updateData: any = { [input.field]: input.status };
        if (input.status === "aprovado") {
          updateData.validadoPor = ctx.user?.name || "Sistema";
          updateData.validadoEm = new Date().toISOString();
        }
        await db.update(obrigacoesMensaisTerceiros).set(updateData).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        // Recalculate statusGeral
        const [row] = await db.select().from(obrigacoesMensaisTerceiros).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        if (row) {
          const statuses = [row.fgtsStatus, row.inssStatus, row.folhaPagamentoStatus, row.comprovantePagamentoStatus, row.gpsStatus, row.cndStatus];
          const allApproved = statuses.every((s: string) => s === "aprovado");
          const allPending = statuses.every((s: string) => s === "pendente");
          const statusGeral = allApproved ? "completo" : allPending ? "pendente" : "parcial";
          await db.update(obrigacoesMensaisTerceiros).set({ statusGeral } as any).where(eq(obrigacoesMensaisTerceiros.id, input.id));
        }
        return { success: true };
      }),

    uploadDoc: protectedProcedure
      .input(z.object({
        obrigacaoId: z.number(),
        field: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `terceiros/obrigacoes/${input.obrigacaoId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buf, input.contentType);
        await db.update(obrigacoesMensaisTerceiros).set({ [input.field]: url } as any).where(eq(obrigacoesMensaisTerceiros.id, input.obrigacaoId));
        return { url };
      }),
  }),

  // ============================================================
  // ALERTAS
  // ============================================================
  alertas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), resolvido: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [eq(alertasTerceiros.companyId, input.companyId)];
        if (input.resolvido !== undefined) conditions.push(eq(alertasTerceiros.resolvido, input.resolvido));
        return db.select().from(alertasTerceiros).where(and(...conditions)).orderBy(desc(alertasTerceiros.createdAt));
      }),

    resolver: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(alertasTerceiros).set({
          resolvido: 1,
          resolvidoEm: new Date().toISOString(),
          resolvidoPor: ctx.user?.name || "Sistema",
        }).where(eq(alertasTerceiros.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PAINEL / DASHBOARD
  // ============================================================
  painel: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const empresas = await db.select().from(empresasTerceiras)
        .where(and(eq(empresasTerceiras.companyId, input.companyId), isNull(empresasTerceiras.deletedAt)));
      const funcs = await db.select().from(funcionariosTerceiros)
        .where(and(eq(funcionariosTerceiros.companyId, input.companyId), isNull(funcionariosTerceiros.deletedAt)));
      const alertas = await db.select().from(alertasTerceiros)
        .where(and(eq(alertasTerceiros.companyId, input.companyId), eq(alertasTerceiros.resolvido, 0)));

      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const obrigacoes = await db.select().from(obrigacoesMensaisTerceiros)
        .where(and(eq(obrigacoesMensaisTerceiros.companyId, input.companyId), eq(obrigacoesMensaisTerceiros.competencia, competenciaAtual)));

      return {
        empresas: {
          total: empresas.length,
          ativas: empresas.filter((e: any) => e.statusTerceira === "ativa").length,
          suspensas: empresas.filter((e: any) => e.statusTerceira === "suspensa").length,
        },
        funcionarios: {
          total: funcs.length,
          aptos: funcs.filter((f: any) => f.statusAptidaoTerceiro === "apto").length,
          inaptos: funcs.filter((f: any) => f.statusAptidaoTerceiro === "inapto").length,
          pendentes: funcs.filter((f: any) => f.statusAptidaoTerceiro === "pendente").length,
        },
        obrigacoesMes: {
          total: obrigacoes.length,
          completas: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "completo").length,
          parciais: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "parcial").length,
          pendentes: obrigacoes.filter((o: any) => o.statusGeralObrigacao === "pendente").length,
        },
        alertasPendentes: alertas.length,
      };
    }),
});
