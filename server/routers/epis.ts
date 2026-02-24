import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { epis, epiDeliveries, employees, systemCriteria, caepiDatabase, epiDiscountAlerts } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

export const episRouter = router({
  // ============================================================
  // CATÁLOGO DE EPIs
  // ============================================================
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epis).where(eq(epis.companyId, input.companyId)).orderBy(epis.nome);
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      fornecedor: z.string().optional(),
      categoria: z.enum(['EPI','Uniforme','Calcado']).default('EPI'),
      tamanho: z.string().optional(),
      quantidadeEstoque: z.number().default(0),
      valorProduto: z.number().optional(),
      tempoMinimoTroca: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(epis).values({
        companyId: input.companyId,
        nome: input.nome,
        ca: input.ca || null,
        validadeCa: input.validadeCa || null,
        fabricante: input.fabricante || null,
        fornecedor: input.fornecedor || null,
        categoria: input.categoria,
        tamanho: input.tamanho || null,
        quantidadeEstoque: input.quantidadeEstoque,
        valorProduto: input.valorProduto != null ? String(input.valorProduto) : null,
        tempoMinimoTroca: input.tempoMinimoTroca || null,
      } as any);
      return { id: result[0].insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      fornecedor: z.string().optional(),
      categoria: z.enum(['EPI','Uniforme','Calcado']).optional(),
      tamanho: z.string().nullable().optional(),
      quantidadeEstoque: z.number().optional(),
      valorProduto: z.number().nullable().optional(),
      tempoMinimoTroca: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      const updateData: any = {};
      if (data.nome !== undefined) updateData.nome = data.nome;
      if (data.ca !== undefined) updateData.ca = data.ca;
      if (data.validadeCa !== undefined) updateData.validadeCa = data.validadeCa;
      if (data.fabricante !== undefined) updateData.fabricante = data.fabricante;
      if (data.fornecedor !== undefined) updateData.fornecedor = data.fornecedor;
      if (data.categoria !== undefined) updateData.categoria = data.categoria;
      if (data.tamanho !== undefined) updateData.tamanho = data.tamanho;
      if (data.quantidadeEstoque !== undefined) updateData.quantidadeEstoque = data.quantidadeEstoque;
      if (data.valorProduto !== undefined) updateData.valorProduto = data.valorProduto != null ? String(data.valorProduto) : null;
      if (data.tempoMinimoTroca !== undefined) updateData.tempoMinimoTroca = data.tempoMinimoTroca;
      await db.update(epis).set(updateData).where(eq(epis.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiDeliveries).where(eq(epiDeliveries.epiId, input.id));
      await db.delete(epis).where(eq(epis.id, input.id));
      return { success: true };
    }),

  deleteBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { inArray } = await import("drizzle-orm");
      await db.delete(epiDeliveries).where(inArray(epiDeliveries.epiId, input.ids));
      await db.delete(epis).where(inArray(epis.id, input.ids));
      return { success: true, deleted: input.ids.length };
    }),

  // ============================================================
  // ENTREGAS DE EPIs
  // ============================================================
  listDeliveries: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number().optional(),
      epiId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [eq(epiDeliveries.companyId, input.companyId), isNull(epiDeliveries.deletedAt)];
      if (input.employeeId) conds.push(eq(epiDeliveries.employeeId, input.employeeId));
      if (input.epiId) conds.push(eq(epiDeliveries.epiId, input.epiId));

      return db.select({
        id: epiDeliveries.id,
        companyId: epiDeliveries.companyId,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        dataDevolucao: epiDeliveries.dataDevolucao,
        motivo: epiDeliveries.motivo,
        observacoes: epiDeliveries.observacoes,
        motivoTroca: epiDeliveries.motivoTroca,
        valorCobrado: epiDeliveries.valorCobrado,
        fichaUrl: epiDeliveries.fichaUrl,
        fotoEstadoUrl: epiDeliveries.fotoEstadoUrl,
        createdAt: epiDeliveries.createdAt,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        valorProdutoEpi: epis.valorProduto,
        tempoMinimoTrocaEpi: epis.tempoMinimoTroca,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDeliveries.dataEntrega));
    }),

  createDelivery: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      employeeId: z.number(),
      quantidade: z.number().min(1).default(1),
      dataEntrega: z.string(),
      dataDevolucao: z.string().optional(),
      motivo: z.string().optional(),
      observacoes: z.string().optional(),
      motivoTroca: z.string().optional(),
      fotoEstadoBase64: z.string().optional(),
      fotoEstadoFileName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Upload foto do estado do EPI se fornecida
      let fotoEstadoUrl: string | null = null;
      if (input.fotoEstadoBase64 && input.fotoEstadoFileName) {
        const buffer = Buffer.from(input.fotoEstadoBase64, 'base64');
        const ext = input.fotoEstadoFileName.split('.').pop() || 'jpg';
        const key = `epi-fotos/${input.companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(key, buffer, `image/${ext}`);
        fotoEstadoUrl = url;
      }

      // Get EPI info for charge calculation
      const [epi] = await db.select().from(epis).where(eq(epis.id, input.epiId));
      let valorCobrado: string | null = null;

      // If motivo_troca is perda or mau_uso, calculate charge with BDI
      if (input.motivoTroca && ['perda', 'mau_uso', 'furto'].includes(input.motivoTroca) && epi?.valorProduto) {
        // Get BDI percentage from system criteria
        const bdiRows = await db.select().from(systemCriteria)
          .where(and(
            eq(systemCriteria.companyId, input.companyId),
            eq(systemCriteria.chave, 'epi_bdi_percentual')
          ));
        const bdiPct = bdiRows.length > 0 ? parseFloat(bdiRows[0].valor) : 40; // default 40%
        const custoBase = parseFloat(String(epi.valorProduto));
        valorCobrado = String(Math.round(custoBase * (1 + bdiPct / 100) * 100) / 100);
      }

      const result = await db.insert(epiDeliveries).values({
        companyId: input.companyId,
        epiId: input.epiId,
        employeeId: input.employeeId,
        quantidade: input.quantidade,
        dataEntrega: input.dataEntrega,
        dataDevolucao: input.dataDevolucao || null,
        motivo: input.motivo || null,
        observacoes: input.observacoes || null,
        motivoTroca: input.motivoTroca || null,
        valorCobrado,
        fotoEstadoUrl,
      } as any);

      // Update stock (decrement)
      await db.update(epis)
        .set({ quantidadeEstoque: sql`GREATEST(${epis.quantidadeEstoque} - ${input.quantidade}, 0)` })
        .where(eq(epis.id, input.epiId));

      // Se motivo é cobrável, criar alerta de desconto automaticamente
      if (valorCobrado && parseFloat(valorCobrado) > 0) {
        const now = new Date();
        const mesRef = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await db.insert(epiDiscountAlerts).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          epiDeliveryId: result[0].insertId,
          epiNome: epi?.nome || 'EPI',
          ca: epi?.ca || null,
          quantidade: input.quantidade,
          valorUnitario: valorCobrado,
          valorTotal: String(parseFloat(valorCobrado) * input.quantidade),
          motivoCobranca: input.motivoTroca || 'mau_uso',
          mesReferencia: mesRef,
          status: 'pendente',
        } as any);
      }

      return { id: result[0].insertId, valorCobrado };
    }),

  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.number(), epiId: z.number(), quantidade: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(epiDeliveries).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id
      } as any).where(eq(epiDeliveries.id, input.id));
      // Return to stock
      await db.update(epis)
        .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${input.quantidade}` })
        .where(eq(epis.id, input.epiId));
      return { success: true };
    }),

  // Upload signed EPI delivery form
  uploadFicha: protectedProcedure
    .input(z.object({ deliveryId: z.number(), fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "pdf";
      const key = `documentos/epi-fichas/${input.deliveryId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
      await db.update(epiDeliveries).set({ fichaUrl: url } as any).where(eq(epiDeliveries.id, input.deliveryId));
      return { url };
    }),

  // ============================================================
  // BDI CONFIGURATION
  // ============================================================
  getBdi: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_bdi_percentual')
        ));
      return { bdiPercentual: rows.length > 0 ? parseFloat(rows[0].valor) : 40 };
    }),

  setBdi: protectedProcedure
    .input(z.object({ companyId: z.number(), bdiPercentual: z.number().min(0).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_bdi_percentual')
        ));
      if (existing.length > 0) {
        await db.update(systemCriteria).set({
          valor: String(input.bdiPercentual),
          atualizadoPor: ctx.user.name ?? 'Sistema',
        }).where(eq(systemCriteria.id, existing[0].id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          categoria: 'epi',
          chave: 'epi_bdi_percentual',
          valor: String(input.bdiPercentual),
          descricao: 'Percentual de BDI sobre custo de EPI para cobrança por perda/mau uso',
          valorPadraoClt: '40',
          unidade: '%',
          atualizadoPor: ctx.user.name ?? 'Sistema',
        });
      }
      return { success: true };
    }),

  // ============================================================
  // EPI FORM TEXT CONFIGURATION
  // ============================================================
  getFormText: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_ficha_texto')
        ));
      return {
        texto: rows.length > 0 ? rows[0].valor : 'Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário, conforme Art. 462, §1º da CLT e NR-6 do MTE.'
      };
    }),

  setFormText: protectedProcedure
    .input(z.object({ companyId: z.number(), texto: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_ficha_texto')
        ));
      if (existing.length > 0) {
        await db.update(systemCriteria).set({
          valor: input.texto,
          atualizadoPor: ctx.user.name ?? 'Sistema',
        }).where(eq(systemCriteria.id, existing[0].id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          categoria: 'epi',
          chave: 'epi_ficha_texto',
          valor: input.texto,
          descricao: 'Texto padrão da ficha de entrega de EPI',
          unidade: 'texto',
          atualizadoPor: ctx.user.name ?? 'Sistema',
        });
      }
      return { success: true };
    }),

  // ============================================================
  // STATS
  // ============================================================
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const allEpis = await db.select().from(epis).where(eq(epis.companyId, input.companyId));
      const allDeliveries = await db.select().from(epiDeliveries)
        .where(and(eq(epiDeliveries.companyId, input.companyId), isNull(epiDeliveries.deletedAt)));

      const hoje = new Date().toISOString().split("T")[0];
      const totalItens = allEpis.length;
      const estoqueTotal = allEpis.reduce((sum, e) => sum + (e.quantidadeEstoque || 0), 0);
      const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5).length;
      const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje).length;
      const totalEntregas = allDeliveries.length;

      // Valor total do inventário
      const valorTotalInventario = allEpis.reduce((sum, e) => {
        const valor = e.valorProduto ? parseFloat(String(e.valorProduto)) : 0;
        const qtd = e.quantidadeEstoque || 0;
        return sum + (valor * qtd);
      }, 0);

      // Entregas últimos 30 dias
      const ha30dias = new Date();
      ha30dias.setDate(ha30dias.getDate() - 30);
      const ha30diasStr = ha30dias.toISOString().split("T")[0];
      const entregasMes = allDeliveries.filter(d => d.dataEntrega >= ha30diasStr).length;

      return {
        totalItens,
        estoqueTotal,
        estoqueBaixo,
        caVencido,
        totalEntregas,
        entregasMes,
        valorTotalInventario,
      };
    }),

  // ============================================================
  // CONSULTA CA - Busca dados do EPI pelo número do CA (base local CAEPI/MTE)
  // ============================================================
  consultaCa: protectedProcedure
    .input(z.object({ ca: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const caNum = input.ca.replace(/\D/g, "");
        if (!caNum) return { found: false as const, error: "Número do CA inválido" };

        const db = (await getDb())!;
        const results = await db.select().from(caepiDatabase).where(eq(caepiDatabase.ca, caNum)).limit(1);

        if (results.length === 0) {
          return { found: false as const, error: "CA não encontrado na base de dados. Tente atualizar a base de CAs nas Configurações." };
        }

        const r = results[0];

        // Convert validade "DD/MM/YYYY" to "YYYY-MM-DD"
        let validadeISO = "";
        if (r.validade) {
          const parts = r.validade.split("/");
          if (parts.length === 3) {
            validadeISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        // Build EPI name from reference + equipment name
        let nomeEpi = r.referencia || "";
        if (!nomeEpi && r.equipamento) {
          nomeEpi = r.equipamento.split(" ").slice(0, 8).join(" ");
        }

        return {
          found: true as const,
          ca: caNum,
          nome: nomeEpi,
          descricao: r.descricao || r.equipamento || "",
          fabricante: r.fabricante || "",
          fabricanteRazao: r.fabricante || "",
          nomeFantasia: "",
          situacao: r.situacao || "",
          validade: validadeISO,
          natureza: r.natureza || "",
          referencia: r.referencia || "",
          marcacao: "",
          tamanho: "",
          cor: r.cor || "",
          cnpj: r.cnpj || "",
          aprovadoPara: r.aprovadoPara || "",
        };
      } catch (err: any) {
        console.error("[ConsultaCA] Erro:", err.message);
        return { found: false as const, error: `Erro ao consultar CA: ${err.message || "Tente novamente"}` };
      }
    }),

  // ============================================================
  // ALERTAS DE DESCONTO DE EPI
  // ============================================================
  listDiscountAlerts: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number().optional(),
      status: z.enum(['pendente','confirmado','cancelado']).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [eq(epiDiscountAlerts.companyId, input.companyId)];
      if (input.employeeId) conds.push(eq(epiDiscountAlerts.employeeId, input.employeeId));
      if (input.status) conds.push(eq(epiDiscountAlerts.status, input.status));

      return db.select({
        id: epiDiscountAlerts.id,
        companyId: epiDiscountAlerts.companyId,
        employeeId: epiDiscountAlerts.employeeId,
        epiDeliveryId: epiDiscountAlerts.epiDeliveryId,
        epiNome: epiDiscountAlerts.epiNome,
        ca: epiDiscountAlerts.ca,
        quantidade: epiDiscountAlerts.quantidade,
        valorUnitario: epiDiscountAlerts.valorUnitario,
        valorTotal: epiDiscountAlerts.valorTotal,
        motivoCobranca: epiDiscountAlerts.motivoCobranca,
        mesReferencia: epiDiscountAlerts.mesReferencia,
        status: epiDiscountAlerts.status,
        validadoPor: epiDiscountAlerts.validadoPor,
        dataValidacao: epiDiscountAlerts.dataValidacao,
        justificativa: epiDiscountAlerts.justificativa,
        createdAt: epiDiscountAlerts.createdAt,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDiscountAlerts)
        .leftJoin(employees, eq(epiDiscountAlerts.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDiscountAlerts.createdAt));
    }),

  validateDiscount: protectedProcedure
    .input(z.object({
      id: z.number(),
      acao: z.enum(['confirmado','cancelado']),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(epiDiscountAlerts).set({
        status: input.acao,
        validadoPor: ctx.user.name ?? 'Sistema',
        validadoPorUserId: ctx.user.id,
        dataValidacao: sql`NOW()`,
        justificativa: input.justificativa || null,
      } as any).where(eq(epiDiscountAlerts.id, input.id));
      return { success: true };
    }),

  pendingDiscountsCount: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(epiDiscountAlerts)
        .where(and(
          eq(epiDiscountAlerts.companyId, input.companyId),
          eq(epiDiscountAlerts.status, 'pendente')
        ));
      return { count: result?.count || 0 };
    }),

  // ============================================================
  // ESTATÍSTICAS DA BASE CAEPI
  // ============================================================
  caepiStats: protectedProcedure
    .query(async () => {
      try {
        const db = (await getDb())!;
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(caepiDatabase);
        const [lastUpdate] = await db.select({ updatedAt: caepiDatabase.updatedAt }).from(caepiDatabase).orderBy(desc(caepiDatabase.updatedAt)).limit(1);
        return {
          totalCas: countResult?.count || 0,
          lastUpdate: lastUpdate?.updatedAt || null,
        };
      } catch {
        return { totalCas: 0, lastUpdate: null };
      }
    }),

  // ============================================================
  // ATUALIZAR BASE CAEPI (download do Portal de Dados Abertos)
  // ============================================================
  // ============================================================
  // SUGESTÃO DE VIDA ÚTIL POR IA
  // ============================================================
  suggestLifespan: protectedProcedure
    .input(z.object({
      nomeEpi: z.string().min(1),
      aprovadoPara: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Você é um especialista em Segurança do Trabalho no Brasil com amplo conhecimento sobre EPIs (Equipamentos de Proteção Individual). Sua tarefa é estimar a vida útil média em dias de um EPI com base no seu nome e descrição de uso.

Regras:
- Considere o desgaste normal em obra de construção civil
- Considere as normas NR-6 e práticas comuns do mercado brasileiro
- Retorne APENAS o JSON solicitado, sem texto adicional
- Se não conseguir determinar, use 180 dias como padrão
- A vida útil deve ser em DIAS

Exemplos de referência:
- Luva de proteção mecânica: 30-60 dias
- Capacete de segurança classe A/B: 365 dias
- Botina/Sapato de segurança: 180-365 dias
- Protetor auricular tipo plug: 30-90 dias
- Protetor auricular tipo concha: 365 dias
- Óculos de proteção: 180 dias
- Respirador PFF2 descartável: 15-30 dias
- Respirador com filtro: 90-180 dias
- Cinto de segurança tipo paraquedista: 365 dias
- Máscara de solda: 365 dias
- Avental de raspa: 180-365 dias
- Uniforme/Calça: 180 dias
- Camiseta: 90-120 dias
- Colete refletivo: 180 dias
- Creme protetor solar: 30 dias`,
            },
            {
              role: "user",
              content: `EPI: ${input.nomeEpi}${input.aprovadoPara ? `\nAprovado para: ${input.aprovadoPara}` : ''}\n\nQual a vida útil estimada em dias deste EPI?`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "epi_lifespan",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  vidaUtilDias: { type: "integer", description: "Vida útil estimada em dias" },
                  justificativa: { type: "string", description: "Breve justificativa da estimativa" },
                  confianca: { type: "string", enum: ["alta", "media", "baixa"], description: "Nível de confiança da estimativa" },
                },
                required: ["vidaUtilDias", "justificativa", "confianca"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c.text || '').join('') : '';
        const parsed = JSON.parse(text);
        return {
          vidaUtilDias: parsed.vidaUtilDias || 180,
          justificativa: parsed.justificativa || 'Estimativa padrão',
          confianca: parsed.confianca || 'media',
        };
      } catch (err: any) {
        console.error('Erro ao sugerir vida útil:', err.message);
        return {
          vidaUtilDias: 180,
          justificativa: 'Não foi possível estimar — usando valor padrão de 180 dias',
          confianca: 'baixa' as const,
        };
      }
    }),

  refreshCaepiDatabase: protectedProcedure
    .mutation(async () => {
      try {
        const db = (await getDb())!;
        
        // URL do Portal de Dados Abertos do Governo Federal
        const dataUrl = "https://dados.gov.br/dados/conjuntos-dados/cadastro-de-certificado-de-aprovacao-de-equipamento-de-protecao-individual1";
        
        // Try to fetch from the API endpoint
        const apiUrl = "https://dados.gov.br/api/publico/conjuntos-dados/cadastro-de-certificado-de-aprovacao-de-equipamento-de-protecao-individual1";
        
        let jsonData: any[] = [];
        let fetched = false;
        
        // Attempt 1: Try the direct CSV/JSON resource URLs from dados.gov.br
        const resourceUrls = [
          "https://www.gov.br/trabalho-e-emprego/pt-br/servicos/seguranca-e-saude-no-trabalho/certificado-de-aprovacao-de-equipamento-de-protecao-individual/dados-abertos/caepi.json",
          "https://www.gov.br/trabalho-e-emprego/pt-br/servicos/seguranca-e-saude-no-trabalho/certificado-de-aprovacao-de-equipamento-de-protecao-individual/dados-abertos/caepi.csv",
        ];
        
        for (const url of resourceUrls) {
          try {
            const resp = await fetch(url, { 
              headers: { 'User-Agent': 'Mozilla/5.0 ERP-RH-FC/1.0' },
              signal: AbortSignal.timeout(30000)
            });
            if (resp.ok) {
              const contentType = resp.headers.get('content-type') || '';
              if (contentType.includes('json') || url.endsWith('.json')) {
                jsonData = await resp.json();
                fetched = true;
                break;
              } else if (contentType.includes('csv') || url.endsWith('.csv')) {
                const csvText = await resp.text();
                // Parse CSV
                const lines = csvText.split('\n').filter(l => l.trim());
                if (lines.length > 1) {
                  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
                  jsonData = lines.slice(1).map(line => {
                    const values = line.split(';').map(v => v.trim().replace(/"/g, ''));
                    const obj: any = {};
                    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
                    return obj;
                  });
                  fetched = true;
                  break;
                }
              }
            }
          } catch { /* try next URL */ }
        }
        
        if (!fetched || jsonData.length === 0) {
          // Return current stats if we can't fetch new data
          const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(caepiDatabase);
          return {
            success: false,
            error: "Não foi possível baixar dados atualizados do Portal de Dados Abertos. A base local permanece inalterada.",
            totalImported: countResult?.count || 0,
          };
        }
        
        // Map fields from government data format
        const records = jsonData.map((item: any) => {
          const ca = String(item.NrCA || item.CA || item.ca || item.NumeroCA || '').replace(/\D/g, '');
          return {
            ca,
            validade: item.DataValidade || item.Validade || item.validade || null,
            situacao: item.Situacao || item.situacao || item.Status || null,
            cnpj: item.CNPJ || item.cnpj || null,
            fabricante: item.RazaoSocial || item.Fabricante || item.fabricante || null,
            natureza: item.Natureza || item.natureza || null,
            equipamento: item.Equipamento || item.equipamento || item.Descricao || null,
            descricao: item.DescricaoEquipamento || item.descricao || item.Descricao || null,
            referencia: item.Referencia || item.referencia || null,
            cor: item.Cor || item.cor || null,
            aprovadoPara: item.AprovadoPara || item.aprovadoPara || null,
          };
        }).filter((r: any) => r.ca && r.ca.length > 0);
        
        if (records.length === 0) {
          return { success: false, error: "Dados baixados mas nenhum CA válido encontrado.", totalImported: 0 };
        }
        
        // Clear existing data and insert new
        await db.delete(caepiDatabase).where(sql`1=1`);
        
        // Insert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await db.insert(caepiDatabase).values(batch as any);
        }
        
        return {
          success: true,
          totalImported: records.length,
          message: `Base CAEPI atualizada com ${records.length.toLocaleString()} CAs.`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao atualizar: ${err.message || 'Erro desconhecido'}`,
          totalImported: 0,
        };
      }
    }),
});
