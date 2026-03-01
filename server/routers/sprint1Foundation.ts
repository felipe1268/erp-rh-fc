import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getDb, createAuditLog } from "../db";
import { companyDocuments, convencaoColetiva, employeeAptidao, employees, asos, trainings, companies, obras } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// ============================================================
// SPRINT 1 - DOCUMENTOS REGULATÓRIOS DA EMPRESA
// ============================================================
const companyDocumentsRouter = router({
  list: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(companyDocuments)
      .where(eq(companyDocuments.companyId, input.companyId))
      .orderBy(desc(companyDocuments.createdAt));
  }),

  create: protectedProcedure.input(z.object({
    companyId: z.number(),
    tipo: z.enum(['PGR','PCMSO','LTCAT','AET','LAUDO_INSALUBRIDADE','LAUDO_PERICULOSIDADE','ALVARA','CONTRATO_SOCIAL','CNPJ_CARTAO','CERTIDAO_NEGATIVA','OUTRO']),
    nome: z.string().min(1),
    descricao: z.string().optional(),
    dataEmissao: z.string().optional(),
    dataValidade: z.string().optional(),
    elaboradoPor: z.string().optional(),
    status: z.enum(['vigente','vencido','pendente','em_renovacao']).optional(),
    observacoes: z.string().optional(),
    documentoBase64: z.string().optional(),
    documentoMimeType: z.string().optional(),
    documentoNomeOriginal: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    let documentoUrl: string | undefined;
    if (input.documentoBase64 && input.documentoMimeType) {
      const buffer = Buffer.from(input.documentoBase64, "base64");
      const ext = input.documentoNomeOriginal?.split('.').pop() || "pdf";
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const key = `company-docs/${input.companyId}/${input.tipo}-${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.documentoMimeType);
      documentoUrl = url;
    }

    const [result] = await db.insert(companyDocuments).values({
      companyId: input.companyId,
      tipo: input.tipo,
      nome: input.nome,
      descricao: input.descricao || null,
      dataEmissao: input.dataEmissao || null,
      dataValidade: input.dataValidade || null,
      elaboradoPor: input.elaboradoPor || null,
      status: input.status || 'pendente',
      observacoes: input.observacoes || null,
      documentoUrl: documentoUrl || null,
      criadoPor: ctx.user.name || "Sistema",
      criadoPorUserId: ctx.user.id,
    });
    const newId = Number(result.insertId);

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "CREATE",
      module: "documentos_empresa",
      entityType: "company_document",
      entityId: newId,
      details: `Documento ${input.tipo} criado: ${input.nome}`,
    });

    return { id: newId, documentoUrl };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    nome: z.string().optional(),
    descricao: z.string().optional(),
    dataEmissao: z.string().optional(),
    dataValidade: z.string().optional(),
    elaboradoPor: z.string().optional(),
    status: z.enum(['vigente','vencido','pendente','em_renovacao']).optional(),
    observacoes: z.string().optional(),
    documentoBase64: z.string().optional(),
    documentoMimeType: z.string().optional(),
    documentoNomeOriginal: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [existing] = await db.select().from(companyDocuments).where(eq(companyDocuments.id, input.id));
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });

    let documentoUrl = existing.documentoUrl;
    if (input.documentoBase64 && input.documentoMimeType) {
      const buffer = Buffer.from(input.documentoBase64, "base64");
      const ext = input.documentoNomeOriginal?.split('.').pop() || "pdf";
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const key = `company-docs/${existing.companyId}/${existing.tipo}-${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.documentoMimeType);
      documentoUrl = url;
    }

    const { id, documentoBase64, documentoMimeType, documentoNomeOriginal, ...updateData } = input;
    await db.update(companyDocuments).set({
      ...updateData,
      documentoUrl,
    }).where(eq(companyDocuments.id, id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: existing.companyId,
      action: "UPDATE",
      module: "documentos_empresa",
      entityType: "company_document",
      entityId: id,
      details: `Documento atualizado: ${input.nome || existing.nome}`,
    });

    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [existing] = await db.select().from(companyDocuments).where(eq(companyDocuments.id, input.id));
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });

    await db.delete(companyDocuments).where(eq(companyDocuments.id, input.id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: existing.companyId,
      action: "DELETE",
      module: "documentos_empresa",
      entityType: "company_document",
      entityId: input.id,
      details: `Documento excluído: ${existing.nome}`,
    });

    return { success: true };
  }),
});

// ============================================================
// SPRINT 1 - CONVENÇÃO COLETIVA
// ============================================================
const convencaoRouter = router({
  list: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const conditions = [eq(convencaoColetiva.companyId, input.companyId)];
    if (input.obraId !== undefined) {
      conditions.push(eq(convencaoColetiva.obraId, input.obraId));
    }
    return db.select().from(convencaoColetiva)
      .where(and(...conditions))
      .orderBy(desc(convencaoColetiva.createdAt));
  }),

  listAll: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(convencaoColetiva)
      .where(eq(convencaoColetiva.companyId, input.companyId))
      .orderBy(desc(convencaoColetiva.createdAt));
  }),

  listGlobal: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const convs = await db.select().from(convencaoColetiva).orderBy(desc(convencaoColetiva.createdAt));
    // Enrich with company and obra names
    const companyIds = [...new Set(convs.map((c: any) => c.companyId))];
    const obraIds = [...new Set(convs.filter((c: any) => c.obraId).map((c: any) => c.obraId!))];
    const allCompanies = companyIds.length > 0 ? await db.select({ id: companies.id, nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial }).from(companies) : [];
    const allObras = obraIds.length > 0 ? await db.select({ id: obras.id, nome: obras.nome }).from(obras) : [];
    const companyMap = Object.fromEntries(allCompanies.map((c: any) => [c.id, c.nomeFantasia || c.razaoSocial]));
    const obraMap = Object.fromEntries(allObras.map((o: any) => [o.id, o.nome]));
    return convs.map((c: any) => ({ ...c, nomeEmpresa: companyMap[c.companyId] || "N/A", nomeObra: c.obraId ? (obraMap[c.obraId] || null) : null }));
  }),

  create: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
    nome: z.string().min(1),
    sindicato: z.string().optional(),
    cnpjSindicato: z.string().optional(),
    dataBase: z.string().optional(),
    vigenciaInicio: z.string().optional(),
    vigenciaFim: z.string().optional(),
    pisoSalarial: z.string().optional(),
    percentualReajuste: z.string().optional(),
    adicionalInsalubridade: z.string().optional(),
    adicionalPericulosidade: z.string().optional(),
    horaExtraDiurna: z.string().optional(),
    horaExtraNoturna: z.string().optional(),
    horaExtraDomingo: z.string().optional(),
    adicionalNoturno: z.string().optional(),
    valeRefeicao: z.string().optional(),
    valeAlimentacao: z.string().optional(),
    valeTransporte: z.string().optional(),
    cestaBasica: z.string().optional(),
    auxilioFarmacia: z.string().optional(),
    planoSaude: z.string().optional(),
    seguroVida: z.string().optional(),
    outrosBeneficios: z.string().optional(),
    clausulasEspeciais: z.string().optional(),
    isMatriz: z.boolean().optional(),
    status: z.enum(['vigente','vencida','em_negociacao']).optional(),
    observacoes: z.string().optional(),
    documentoBase64: z.string().optional(),
    documentoMimeType: z.string().optional(),
    documentoNomeOriginal: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    let documentoUrl: string | undefined;
    if (input.documentoBase64 && input.documentoMimeType) {
      const buffer = Buffer.from(input.documentoBase64, "base64");
      const ext = input.documentoNomeOriginal?.split('.').pop() || "pdf";
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const key = `convencoes/${input.companyId}/${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.documentoMimeType);
      documentoUrl = url;
    }

    const [result] = await db.insert(convencaoColetiva).values({
      companyId: input.companyId,
      obraId: input.obraId || null,
      nome: input.nome,
      sindicato: input.sindicato || null,
      cnpjSindicato: input.cnpjSindicato || null,
      dataBase: input.dataBase || null,
      vigenciaInicio: input.vigenciaInicio || null,
      vigenciaFim: input.vigenciaFim || null,
      pisoSalarial: input.pisoSalarial || null,
      percentualReajuste: input.percentualReajuste || null,
      adicionalInsalubridade: input.adicionalInsalubridade || null,
      adicionalPericulosidade: input.adicionalPericulosidade || null,
      horaExtraDiurna: input.horaExtraDiurna || null,
      horaExtraNoturna: input.horaExtraNoturna || null,
      horaExtraDomingo: input.horaExtraDomingo || null,
      adicionalNoturno: input.adicionalNoturno || null,
      valeRefeicao: input.valeRefeicao || null,
      valeAlimentacao: input.valeAlimentacao || null,
      valeTransporte: input.valeTransporte || null,
      cestaBasica: input.cestaBasica || null,
      auxilioFarmacia: input.auxilioFarmacia || null,
      planoSaude: input.planoSaude || null,
      seguroVida: input.seguroVida || null,
      outrosBeneficios: input.outrosBeneficios || null,
      clausulasEspeciais: input.clausulasEspeciais || null,
      documentoUrl: documentoUrl || null,
      isMatriz: input.isMatriz ? 1 : 0,
      status: input.status || 'vigente',
      observacoes: input.observacoes || null,
      criadoPor: ctx.user.name || "Sistema",
      criadoPorUserId: ctx.user.id,
    });
    const newConvId = Number(result.insertId);

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "CREATE",
      module: "convencao_coletiva",
      entityType: "convencao",
      entityId: newConvId,
      details: `Convenção criada: ${input.nome}`,
    });

    return { id: newConvId };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number().optional(),
    obraId: z.number().optional().nullable(),
    nome: z.string().optional(),
    sindicato: z.string().optional(),
    cnpjSindicato: z.string().optional(),
    dataBase: z.string().optional(),
    vigenciaInicio: z.string().optional(),
    vigenciaFim: z.string().optional(),
    pisoSalarial: z.string().optional(),
    percentualReajuste: z.string().optional(),
    adicionalInsalubridade: z.string().optional(),
    adicionalPericulosidade: z.string().optional(),
    horaExtraDiurna: z.string().optional(),
    horaExtraNoturna: z.string().optional(),
    horaExtraDomingo: z.string().optional(),
    adicionalNoturno: z.string().optional(),
    valeRefeicao: z.string().optional(),
    valeAlimentacao: z.string().optional(),
    valeTransporte: z.string().optional(),
    cestaBasica: z.string().optional(),
    auxilioFarmacia: z.string().optional(),
    planoSaude: z.string().optional(),
    seguroVida: z.string().optional(),
    outrosBeneficios: z.string().optional(),
    clausulasEspeciais: z.string().optional(),
    isMatriz: z.boolean().optional(),
    status: z.enum(['vigente','vencida','em_negociacao']).optional(),
    observacoes: z.string().optional(),
    documentoBase64: z.string().optional(),
    documentoMimeType: z.string().optional(),
    documentoNomeOriginal: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [existing] = await db.select().from(convencaoColetiva).where(eq(convencaoColetiva.id, input.id));
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Convenção não encontrada" });

    let documentoUrl = existing.documentoUrl;
    if (input.documentoBase64 && input.documentoMimeType) {
      const buffer = Buffer.from(input.documentoBase64, "base64");
      const ext = input.documentoNomeOriginal?.split('.').pop() || "pdf";
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const key = `convencoes/${existing.companyId}/${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.documentoMimeType);
      documentoUrl = url;
    }

    const { id, documentoBase64, documentoMimeType, documentoNomeOriginal, isMatriz, obraId, companyId, ...updateData } = input;
    await db.update(convencaoColetiva).set({
      ...updateData,
      isMatriz: isMatriz !== undefined ? (isMatriz ? 1 : 0) : undefined,
      obraId: obraId !== undefined ? (obraId || null) : undefined,
      companyId: companyId !== undefined ? companyId : undefined,
      documentoUrl,
    }).where(eq(convencaoColetiva.id, id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: existing.companyId,
      action: "UPDATE",
      module: "convencao_coletiva",
      entityType: "convencao",
      entityId: id,
      details: `Convenção atualizada: ${input.nome || existing.nome}`,
    });

    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [existing] = await db.select().from(convencaoColetiva).where(eq(convencaoColetiva.id, input.id));
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Convenção não encontrada" });

    await db.delete(convencaoColetiva).where(eq(convencaoColetiva.id, input.id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: existing.companyId,
      action: "DELETE",
      module: "convencao_coletiva",
      entityType: "convencao",
      entityId: input.id,
      details: `Convenção excluída: ${existing.nome}`,
    });

    return { success: true };
  }),
  // ============================================================
  // IA - EXTRAÇÃO DE PDF DA CONVENÇÃO COLETIVA
  // ============================================================
  extractPdf: protectedProcedure.input(z.object({
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string().optional(),
  })).mutation(async ({ input }) => {
    // Upload PDF to S3 to get a URL for the LLM
    const buffer = Buffer.from(input.fileBase64, "base64");
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ext = input.fileName.split('.').pop() || "pdf";
    const key = `convencoes/temp/${suffix}.${ext}`;
    const { url: pdfUrl } = await storagePut(key, buffer, input.mimeType || "application/pdf");

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Você é um especialista em direito trabalhista brasileiro. Analise o documento PDF de Convenção Coletiva de Trabalho (CCT) e extraia TODOS os dados relevantes. Retorne um JSON estruturado com os campos extraídos. Para campos numéricos (valores em R$ ou percentuais), retorne apenas o número sem símbolos. Para datas, use formato YYYY-MM-DD. Se um campo não for encontrado no documento, retorne string vazia "".`
          },
          {
            role: "user",
            content: [
              {
                type: "file_url" as const,
                file_url: {
                  url: pdfUrl,
                  mime_type: "application/pdf" as const,
                }
              },
              {
                type: "text" as const,
                text: "Extraia todos os dados desta Convenção Coletiva de Trabalho. Analise cuidadosamente cláusulas sobre salários, adicionais, benefícios, vigência e informações do sindicato."
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "extracao_convencao",
            strict: true,
            schema: {
              type: "object",
              properties: {
                nome: { type: "string", description: "Nome/título completo da convenção coletiva" },
                sindicato: { type: "string", description: "Nome do sindicato dos trabalhadores" },
                cnpjSindicato: { type: "string", description: "CNPJ do sindicato (formato XX.XXX.XXX/XXXX-XX)" },
                sindicatoPatronal: { type: "string", description: "Nome do sindicato patronal" },
                dataBase: { type: "string", description: "Mês da data-base da categoria (ex: Maio, Janeiro)" },
                vigenciaInicio: { type: "string", description: "Data de início da vigência (YYYY-MM-DD)" },
                vigenciaFim: { type: "string", description: "Data de fim da vigência (YYYY-MM-DD)" },
                pisoSalarial: { type: "string", description: "Piso salarial em reais (apenas número, ex: 1800.00)" },
                percentualReajuste: { type: "string", description: "Percentual de reajuste salarial (apenas número, ex: 5.5)" },
                adicionalInsalubridade: { type: "string", description: "Percentual de insalubridade (apenas número)" },
                adicionalPericulosidade: { type: "string", description: "Percentual de periculosidade (apenas número)" },
                horaExtraDiurna: { type: "string", description: "Percentual de hora extra diurna (apenas número, ex: 50)" },
                horaExtraNoturna: { type: "string", description: "Percentual de hora extra noturna (apenas número, ex: 70)" },
                horaExtraDomingo: { type: "string", description: "Percentual de hora extra domingo/feriado (apenas número, ex: 100)" },
                adicionalNoturno: { type: "string", description: "Percentual de adicional noturno (apenas número, ex: 20)" },
                valeRefeicao: { type: "string", description: "Valor do vale refeição em reais (apenas número)" },
                valeAlimentacao: { type: "string", description: "Valor do vale alimentação/cesta básica em reais (apenas número)" },
                valeTransporte: { type: "string", description: "Informações sobre vale transporte" },
                cestaBasica: { type: "string", description: "Valor da cesta básica em reais (apenas número)" },
                auxilioFarmacia: { type: "string", description: "Valor do auxílio farmácia em reais (apenas número)" },
                planoSaude: { type: "string", description: "Detalhes do plano de saúde previsto" },
                seguroVida: { type: "string", description: "Valor ou detalhes do seguro de vida" },
                outrosBeneficios: { type: "string", description: "Outros benefícios previstos na convenção" },
                clausulasEspeciais: { type: "string", description: "Cláusulas especiais relevantes (estabilidade, garantias, etc.)" },
                observacoes: { type: "string", description: "Observações gerais e informações adicionais relevantes" },
              },
              required: ["nome","sindicato","cnpjSindicato","sindicatoPatronal","dataBase","vigenciaInicio","vigenciaFim","pisoSalarial","percentualReajuste","adicionalInsalubridade","adicionalPericulosidade","horaExtraDiurna","horaExtraNoturna","horaExtraDomingo","adicionalNoturno","valeRefeicao","valeAlimentacao","valeTransporte","cestaBasica","auxilioFarmacia","planoSaude","seguroVida","outrosBeneficios","clausulasEspeciais","observacoes"],
              additionalProperties: false
            }
          }
        }
      });

      const content = String(response.choices?.[0]?.message?.content || "{}");
      const extracted = JSON.parse(content);
      return { success: true, data: extracted, documentoUrl: pdfUrl };
    } catch (err: any) {
      console.error("Erro na extração IA do PDF:", err.message);
      return { success: false, data: null, documentoUrl: pdfUrl, error: "Erro ao processar o PDF com IA. Tente novamente ou preencha manualmente." };
    }
  }),

  // ============================================================
  // IA - COMPARATIVO DE CONVENÇÕES
  // ============================================================
  compararIA: protectedProcedure
    .input(z.object({
      convencaoMatrizId: z.number(),
      convencaoLocalId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [matriz] = await db.select().from(convencaoColetiva).where(eq(convencaoColetiva.id, input.convencaoMatrizId));
      const [local] = await db.select().from(convencaoColetiva).where(eq(convencaoColetiva.id, input.convencaoLocalId));
      if (!matriz || !local) throw new TRPCError({ code: "NOT_FOUND", message: "Convenção não encontrada" });
      const formatConv = (c: any) => `Nome: ${c.nome}\nSindicato: ${c.sindicato}\nVigência: ${c.vigenciaInicio} a ${c.vigenciaFim}\nPiso: ${c.pisoSalarial}\nReajuste: ${c.percentualReajuste}%\nInsalubridade: ${c.adicionalInsalubridade}%\nPericulosidade: ${c.adicionalPericulosidade}%\nHE Diurna: ${c.horaExtraDiurna}%\nHE Noturna: ${c.horaExtraNoturna}%\nHE Domingo: ${c.horaExtraDomingo}%\nAdicional Noturno: ${c.adicionalNoturno}%\nVR: ${c.valeRefeicao}\nVA: ${c.valeAlimentacao}\nVT: ${c.valeTransporte}\nCesta Básica: ${c.cestaBasica}\nAux Farmácia: ${c.auxilioFarmacia}\nPlano Saúde: ${c.planoSaude}\nSeguro Vida: ${c.seguroVida}\nOutros: ${c.outrosBeneficios}\nCláusulas: ${c.clausulasEspeciais}`;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em direito trabalhista brasileiro e convenções coletivas. Compare as duas convenções coletivas e retorne um JSON com análise comparativa detalhada." },
            { role: "user", content: `Compare:\n\n=== MATRIZ ===\n${formatConv(matriz)}\n\n=== LOCAL ===\n${formatConv(local)}` }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "comparativo_convencoes",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  resumo: { type: "string", description: "Resumo geral" },
                  divergencias: { type: "array", items: { type: "object", properties: { item: { type: "string" }, valorMatriz: { type: "string" }, valorLocal: { type: "string" }, maisVantajoso: { type: "string" }, impacto: { type: "string" } }, required: ["item","valorMatriz","valorLocal","maisVantajoso","impacto"], additionalProperties: false } },
                  recomendacoes: { type: "array", items: { type: "string" } },
                  riscos: { type: "array", items: { type: "string" } }
                },
                required: ["resumo","divergencias","recomendacoes","riscos"],
                additionalProperties: false
              }
            }
          }
        });
        const content = String(response.choices?.[0]?.message?.content || "{}");
        return { ...JSON.parse(content), matrizNome: matriz.nome, localNome: local.nome };
      } catch {
        return { resumo: "Erro na análise.", divergencias: [], recomendacoes: ["Compare manualmente."], riscos: ["Erro IA."], matrizNome: matriz.nome, localNome: local.nome };
      }
    }),
});

// ============================================================
// SPRINT 1 - APTIDÃO DO COLABORADOR
// ============================================================
const aptidaoRouter = router({
  // Verificar aptidão de um colaborador específico
  check: protectedProcedure.input(z.object({
    companyId: z.number(),
    employeeId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;

    // Buscar dados do funcionário
    const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
    if (!emp) return null;

    // Verificar ASO vigente
    const asosResult = await db.select().from(asos)
      .where(and(
        eq(asos.employeeId, input.employeeId),
        eq(asos.companyId, input.companyId),
      ))
      .orderBy(desc(asos.dataExame));
    
    const hoje = new Date().toISOString().split('T')[0];
    const asoVigente = asosResult.length > 0 && asosResult[0].dataValidade && asosResult[0].dataValidade >= hoje;

    // Verificar treinamentos obrigatórios (NR-6, NR-18, NR-35 para construção civil)
    const treinamentosResult = await db.select().from(trainings)
      .where(and(
        eq(trainings.employeeId, input.employeeId),
        eq(trainings.companyId, input.companyId),
      ));
    
    const treinamentosVigentes = treinamentosResult.filter((t: any) => 
      t.dataValidade && t.dataValidade >= hoje
    );
    const treinamentosObrigatoriosOk = treinamentosVigentes.length > 0;

    // Verificar documentos pessoais básicos
    const docsOk = !!(emp.cpf && emp.nomeCompleto && emp.dataNascimento);

    // Calcular pendências
    const pendencias: string[] = [];
    if (!asoVigente) pendencias.push("ASO vencido ou inexistente");
    if (!treinamentosObrigatoriosOk) pendencias.push("Nenhum treinamento vigente");
    if (!docsOk) pendencias.push("Dados pessoais incompletos (CPF, nome ou data nascimento)");
    if (!emp.fotoUrl) pendencias.push("Foto não cadastrada");

    const statusCalc = pendencias.length === 0 ? 'apto' : 'inapto';

    // Upsert na tabela de aptidão
    const [existing] = await db.select().from(employeeAptidao)
      .where(and(
        eq(employeeAptidao.employeeId, input.employeeId),
        eq(employeeAptidao.companyId, input.companyId),
      ));

    if (existing) {
      await db.update(employeeAptidao).set({
        status: statusCalc,
        motivoInapto: pendencias.length > 0 ? JSON.stringify(pendencias) : null,
        ultimaVerificacao: sql`NOW()`,
        asoVigente: asoVigente ? 1 : 0,
        treinamentosObrigatoriosOk: treinamentosObrigatoriosOk ? 1 : 0,
        documentosPessoaisOk: docsOk ? 1 : 0,
        nrObrigatoriasOk: treinamentosObrigatoriosOk ? 1 : 0,
      }).where(eq(employeeAptidao.id, existing.id));
    } else {
      await db.insert(employeeAptidao).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        status: statusCalc,
        motivoInapto: pendencias.length > 0 ? JSON.stringify(pendencias) : null,
        ultimaVerificacao: sql`NOW()`,
        asoVigente: asoVigente ? 1 : 0,
        treinamentosObrigatoriosOk: treinamentosObrigatoriosOk ? 1 : 0,
        documentosPessoaisOk: docsOk ? 1 : 0,
        nrObrigatoriasOk: treinamentosObrigatoriosOk ? 1 : 0,
      });
    }

    return {
      status: statusCalc,
      pendencias,
      asoVigente: !!asoVigente,
      treinamentosObrigatoriosOk,
      documentosPessoaisOk: docsOk,
      fotoOk: !!emp.fotoUrl,
      ultimoAso: asosResult[0] || null,
      totalTreinamentosVigentes: treinamentosVigentes.length,
    };
  }),

  // Listar aptidão de todos os colaboradores de uma empresa
  listByCompany: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(employeeAptidao)
      .where(eq(employeeAptidao.companyId, input.companyId))
      .orderBy(desc(employeeAptidao.updatedAt));
  }),

  // Recalcular aptidão de todos os colaboradores ativos de uma empresa
  recalcAll: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const emps = await db.select({ id: employees.id }).from(employees)
      .where(and(
        eq(employees.companyId, input.companyId),
        eq(employees.status, 'Ativo'),
        isNull(employees.deletedAt),
      ));

    const hoje = new Date().toISOString().split('T')[0];
    let aptos = 0;
    let inaptos = 0;

    for (const emp of emps) {
      const [empData] = await db.select().from(employees).where(eq(employees.id, emp.id));
      
      const asosResult = await db.select().from(asos)
        .where(and(eq(asos.employeeId, emp.id), eq(asos.companyId, input.companyId)))
        .orderBy(desc(asos.dataExame));
      
      const asoVigente = asosResult.length > 0 && asosResult[0].dataValidade && asosResult[0].dataValidade >= hoje;

      const treinamentosResult = await db.select().from(trainings)
        .where(and(eq(trainings.employeeId, emp.id), eq(trainings.companyId, input.companyId)));
      
      const treinamentosVigentes = treinamentosResult.filter((t: any) => t.dataValidade && t.dataValidade >= hoje);
      const treinamentosOk = treinamentosVigentes.length > 0;
      const docsOk = !!(empData?.cpf && empData?.nomeCompleto && empData?.dataNascimento);

      const pendencias: string[] = [];
      if (!asoVigente) pendencias.push("ASO vencido ou inexistente");
      if (!treinamentosOk) pendencias.push("Nenhum treinamento vigente");
      if (!docsOk) pendencias.push("Dados pessoais incompletos");
      if (!empData?.fotoUrl) pendencias.push("Foto não cadastrada");

      const statusCalc = pendencias.length === 0 ? 'apto' : 'inapto';
      if (statusCalc === 'apto') aptos++; else inaptos++;

      const [existing] = await db.select().from(employeeAptidao)
        .where(and(eq(employeeAptidao.employeeId, emp.id), eq(employeeAptidao.companyId, input.companyId)));

      if (existing) {
        await db.update(employeeAptidao).set({
          status: statusCalc,
          motivoInapto: pendencias.length > 0 ? JSON.stringify(pendencias) : null,
          ultimaVerificacao: sql`NOW()`,
          asoVigente: asoVigente ? 1 : 0,
          treinamentosObrigatoriosOk: treinamentosOk ? 1 : 0,
          documentosPessoaisOk: docsOk ? 1 : 0,
          nrObrigatoriasOk: treinamentosOk ? 1 : 0,
          verificadoPor: ctx.user.name || "Sistema",
          verificadoPorUserId: ctx.user.id,
        }).where(eq(employeeAptidao.id, existing.id));
      } else {
        await db.insert(employeeAptidao).values({
          companyId: input.companyId,
          employeeId: emp.id,
          status: statusCalc,
          motivoInapto: pendencias.length > 0 ? JSON.stringify(pendencias) : null,
          ultimaVerificacao: sql`NOW()`,
          asoVigente: asoVigente ? 1 : 0,
          treinamentosObrigatoriosOk: treinamentosOk ? 1 : 0,
          documentosPessoaisOk: docsOk ? 1 : 0,
          nrObrigatoriasOk: treinamentosOk ? 1 : 0,
          verificadoPor: ctx.user.name || "Sistema",
          verificadoPorUserId: ctx.user.id,
        });
      }
    }

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "UPDATE",
      module: "aptidao",
      entityType: "aptidao_batch",
      entityId: 0,
      details: `Recálculo de aptidão: ${aptos} aptos, ${inaptos} inaptos de ${emps.length} colaboradores`,
    });

    return { total: emps.length, aptos, inaptos };
  }),
});

// ============================================================
// EXPORT COMBINED ROUTER
// ============================================================
export const sprint1Router = router({
  companyDocs: companyDocumentsRouter,
  convencao: convencaoRouter,
  aptidao: aptidaoRouter,
});
