import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  empresasTerceiras,
  funcionariosTerceiros,
  obrigacoesMensaisTerceiros,
  alertasTerceiros,
  obras,
} from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, like, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

export const terceirosRouter = router({
  // ============================================================
  // EMPRESAS TERCEIRAS
  // ============================================================
  empresas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        return db.select().from(empresasTerceiras)
          .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)))
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
        }).returning({ id: empresasTerceiras.id });
        return { id: result.id };
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(empresasTerceiras)
          .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)];
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
        return { id: result[0].id };
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const all = await db.select().from(funcionariosTerceiros)
          .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number().optional(), competencia: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(obrigacoesMensaisTerceiros.companyId, input)];
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
        return { id: result[0].id };
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), resolvido: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [companyFilter(alertasTerceiros.companyId, input)];
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
    enviar: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), empresaTerceiraId: z.number(),
        tipo: z.string(),
        titulo: z.string(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [result] = await db.insert(alertasTerceiros).values({
          companyId: input.companyId,
          empresaTerceiraId: input.empresaTerceiraId,
          tipo: input.tipo as any,
          titulo: input.titulo,
          descricao: input.descricao || "",
        });
        return { success: true, id: result[0].id };
      }),
  }),
  // ============================================================
  // CONFORMIDADE / MEDIÇÃO
  // ============================================================
  conformidade: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const empresas = await db.select().from(empresasTerceiras)
        .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
      const funcs = await db.select().from(funcionariosTerceiros)
        .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const obrigacoes = await db.select().from(obrigacoesMensaisTerceiros)
        .where(and(companyFilter(obrigacoesMensaisTerceiros.companyId, input), eq(obrigacoesMensaisTerceiros.competencia, competenciaAtual)));
      const obrasList = await db.select().from(obras)
        .where(and(companyFilter(obras.companyId, input), isNull(obras.deletedAt)));
      // Build conformidade per empresa
      const resultado = empresas.map((emp: any) => {
        const funcsDaEmpresa = funcs.filter((f: any) => f.empresaTerceiraId === emp.id);
        const obrigDaEmpresa = obrigacoes.filter((o: any) => o.empresaTerceiraId === emp.id);
        const docsEmpresa = {
          pgr: { url: emp.pgrUrl, validade: emp.pgrValidade, status: emp.pgrUrl ? (emp.pgrValidade && new Date(emp.pgrValidade) < now ? "vencido" : "ok") : "pendente" },
          pcmso: { url: emp.pcmsoUrl, validade: emp.pcmsoValidade, status: emp.pcmsoUrl ? (emp.pcmsoValidade && new Date(emp.pcmsoValidade) < now ? "vencido" : "ok") : "pendente" },
          contratoSocial: { url: emp.contratoSocialUrl, status: emp.contratoSocialUrl ? "ok" : "pendente" },
          alvara: { url: emp.alvaraUrl, validade: emp.alvaraValidade, status: emp.alvaraUrl ? (emp.alvaraValidade && new Date(emp.alvaraValidade) < now ? "vencido" : "ok") : "pendente" },
        };
        const docsOk = Object.values(docsEmpresa).filter((d: any) => d.status === "ok").length;
        const docsTotal = Object.keys(docsEmpresa).length;
        const funcsAptos = funcsDaEmpresa.filter((f: any) => f.statusAptidaoTerceiro === "apto").length;
        const obrigCompleta = obrigDaEmpresa.length > 0 && obrigDaEmpresa.every((o: any) => o.statusGeral === "completo");
        const conformeGeral = docsOk === docsTotal && funcsAptos === funcsDaEmpresa.length && obrigCompleta;
        return {
          empresa: { id: emp.id, razaoSocial: emp.razaoSocial, cnpj: emp.cnpj, status: emp.status },
          documentos: docsEmpresa,
          docsOk, docsTotal,
          funcionarios: { total: funcsDaEmpresa.length, aptos: funcsAptos },
          obrigacaoMensal: obrigDaEmpresa[0] || null,
          conformeGeral,
        };
      });
      return { empresas: resultado, obras: obrasList };
    }),

  // ============================================================
  // PAINEL / DASHBOARD
  // ============================================================
  painel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const empresas = await db.select().from(empresasTerceiras)
        .where(and(companyFilter(empresasTerceiras.companyId, input), isNull(empresasTerceiras.deletedAt)));
      const funcs = await db.select().from(funcionariosTerceiros)
        .where(and(companyFilter(funcionariosTerceiros.companyId, input), isNull(funcionariosTerceiros.deletedAt)));
      const alertas = await db.select().from(alertasTerceiros)
        .where(and(companyFilter(alertasTerceiros.companyId, input), eq(alertasTerceiros.resolvido, 0)));

      const now = new Date();
      const competenciaAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const obrigacoes = await db.select().from(obrigacoesMensaisTerceiros)
        .where(and(companyFilter(obrigacoesMensaisTerceiros.companyId, input), eq(obrigacoesMensaisTerceiros.competencia, competenciaAtual)));

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
  // ============================================================
  // IA - VALIDAÇÃO DE DOCUMENTOS
  // ============================================================
  ia: router({
    validarDocumento: protectedProcedure
      .input(z.object({
        documentoUrl: z.string(),
        tipoDocumento: z.string(),
        empresaNome: z.string(),
        competencia: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `Você é um especialista em validação de documentos trabalhistas brasileiros. Analise o documento fornecido e retorne um JSON com a seguinte estrutura:
{
  "valido": boolean,
  "tipoDetectado": string,
  "empresa": string,
  "competencia": string,
  "valor": string,
  "observacoes": string[],
  "alertas": string[],
  "confianca": number (0-100)
}
Seja rigoroso na validação. Verifique se o tipo do documento corresponde ao esperado, se a competência está correta e se os dados são consistentes.`
              },
              {
                role: "user",
                content: [
                  {
                    type: "text" as const,
                    text: `Valide este documento:\n- Tipo esperado: ${input.tipoDocumento}\n- Empresa: ${input.empresaNome}\n- Competência: ${input.competencia}\n- URL do documento: ${input.documentoUrl}\n\nAnalise e retorne o JSON de validação.`
                  }
                ]
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "validacao_documento",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    valido: { type: "boolean", description: "Se o documento é válido" },
                    tipoDetectado: { type: "string", description: "Tipo do documento detectado" },
                    empresa: { type: "string", description: "Nome da empresa no documento" },
                    competencia: { type: "string", description: "Competência do documento" },
                    valor: { type: "string", description: "Valor principal do documento" },
                    observacoes: { type: "array", items: { type: "string" }, description: "Observações sobre o documento" },
                    alertas: { type: "array", items: { type: "string" }, description: "Alertas de inconsistência" },
                    confianca: { type: "number", description: "Nível de confiança da validação (0-100)" }
                  },
                  required: ["valido", "tipoDetectado", "empresa", "competencia", "valor", "observacoes", "alertas", "confianca"],
                  additionalProperties: false
                }
              }
            }
          });
          const content = String(response.choices?.[0]?.message?.content || "{}");
          return JSON.parse(content);
        } catch (error) {
          return {
            valido: false,
            tipoDetectado: "Erro na análise",
            empresa: input.empresaNome,
            competencia: input.competencia,
            valor: "N/A",
            observacoes: ["Não foi possível analisar o documento automaticamente"],
            alertas: ["Erro na validação com IA. Verifique manualmente."],
            confianca: 0
          };
        }
      }),
  }),
});
