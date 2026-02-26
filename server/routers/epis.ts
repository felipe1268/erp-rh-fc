import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { epis, epiDeliveries, employees, systemCriteria, caepiDatabase, epiDiscountAlerts, obras, fornecedoresEpi } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, gte } from "drizzle-orm";
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
      fornecedorCnpj: z.string().optional(),
      fornecedorContato: z.string().optional(),
      fornecedorTelefone: z.string().optional(),
      fornecedorEmail: z.string().optional(),
      fornecedorEndereco: z.string().optional(),
      categoria: z.enum(['EPI','Uniforme','Calcado']).default('EPI'),
      tamanho: z.string().optional(),
      quantidadeEstoque: z.number().default(0),
      valorProduto: z.number().optional(),
      tempoMinimoTroca: z.number().optional(),
      corCapacete: z.string().nullable().optional(),
      condicao: z.enum(['Novo','Reutilizado']).default('Novo'),
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
        fornecedorCnpj: input.fornecedorCnpj || null,
        fornecedorContato: input.fornecedorContato || null,
        fornecedorTelefone: input.fornecedorTelefone || null,
        fornecedorEmail: input.fornecedorEmail || null,
        fornecedorEndereco: input.fornecedorEndereco || null,
        categoria: input.categoria,
        tamanho: input.tamanho || null,
        quantidadeEstoque: input.quantidadeEstoque,
        valorProduto: input.valorProduto != null ? String(input.valorProduto) : null,
        tempoMinimoTroca: input.tempoMinimoTroca || null,
        corCapacete: input.corCapacete || null,
        condicao: input.condicao,
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
      fornecedorCnpj: z.string().nullable().optional(),
      fornecedorContato: z.string().nullable().optional(),
      fornecedorTelefone: z.string().nullable().optional(),
      fornecedorEmail: z.string().nullable().optional(),
      fornecedorEndereco: z.string().nullable().optional(),
      categoria: z.enum(['EPI','Uniforme','Calcado']).optional(),
      tamanho: z.string().nullable().optional(),
      quantidadeEstoque: z.number().optional(),
      valorProduto: z.number().nullable().optional(),
      tempoMinimoTroca: z.number().nullable().optional(),
      corCapacete: z.string().nullable().optional(),
      condicao: z.enum(['Novo','Reutilizado']).optional(),
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
      if (data.fornecedorCnpj !== undefined) updateData.fornecedorCnpj = data.fornecedorCnpj;
      if (data.fornecedorContato !== undefined) updateData.fornecedorContato = data.fornecedorContato;
      if (data.fornecedorTelefone !== undefined) updateData.fornecedorTelefone = data.fornecedorTelefone;
      if (data.fornecedorEmail !== undefined) updateData.fornecedorEmail = data.fornecedorEmail;
      if (data.fornecedorEndereco !== undefined) updateData.fornecedorEndereco = data.fornecedorEndereco;
      if (data.categoria !== undefined) updateData.categoria = data.categoria;
      if (data.tamanho !== undefined) updateData.tamanho = data.tamanho;
      if (data.quantidadeEstoque !== undefined) updateData.quantidadeEstoque = data.quantidadeEstoque;
      if (data.valorProduto !== undefined) updateData.valorProduto = data.valorProduto != null ? String(data.valorProduto) : null;
      if (data.tempoMinimoTroca !== undefined) updateData.tempoMinimoTroca = data.tempoMinimoTroca;
      if (data.corCapacete !== undefined) updateData.corCapacete = data.corCapacete;
      if (data.condicao !== undefined) updateData.condicao = data.condicao;
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
      // Cancel any pending discount alerts linked to this delivery
      await db.update(epiDiscountAlerts).set({
        status: 'cancelado',
        validadoPor: ctx.user.name ?? 'Sistema',
        dataValidacao: sql`NOW()`,
        justificativa: 'Entrega excluída - desconto cancelado automaticamente',
      } as any).where(and(
        eq(epiDiscountAlerts.epiDeliveryId, input.id),
        eq(epiDiscountAlerts.status, 'pendente')
      ));
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

      // Unidades entregues (soma de quantidades)
      const unidadesEntregues = allDeliveries.reduce((sum, d) => sum + (d.quantidade || 1), 0);

      // ---- ANALYTICS EXPANDIDOS ----

      // 1. Distribuição por categoria (EPI, Uniforme, Calçado)
      const porCategoria = allEpis.reduce((acc, e) => {
        const cat = e.categoria || 'EPI';
        if (!acc[cat]) acc[cat] = { qtdItens: 0, estoque: 0, valor: 0 };
        acc[cat].qtdItens++;
        acc[cat].estoque += (e.quantidadeEstoque || 0);
        acc[cat].valor += (e.valorProduto ? parseFloat(String(e.valorProduto)) : 0) * (e.quantidadeEstoque || 0);
        return acc;
      }, {} as Record<string, { qtdItens: number; estoque: number; valor: number }>);

      // 2. Consumo mensal (últimos 12 meses)
      const consumoMensal: { mes: string; entregas: number; unidades: number; custo: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mesLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        const entregas = allDeliveries.filter(del => del.dataEntrega?.startsWith(mesKey));
        const unidades = entregas.reduce((s, del) => s + (del.quantidade || 1), 0);
        const custo = entregas.reduce((s, del) => s + parseFloat(String(del.valorCobrado || '0')), 0);
        consumoMensal.push({ mes: mesLabel, entregas: entregas.length, unidades, custo });
      }

      // 3. Top 10 EPIs mais entregues
      const epiEntregaCount: Record<number, { nome: string; ca: string; entregas: number; unidades: number }> = {};
      allDeliveries.forEach(del => {
        if (!epiEntregaCount[del.epiId]) {
          const epiInfo = allEpis.find(e => e.id === del.epiId);
          epiEntregaCount[del.epiId] = { nome: epiInfo?.nome || 'Desconhecido', ca: epiInfo?.ca || '-', entregas: 0, unidades: 0 };
        }
        epiEntregaCount[del.epiId].entregas++;
        epiEntregaCount[del.epiId].unidades += (del.quantidade || 1);
      });
      const topEpis = Object.values(epiEntregaCount)
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 10);

      // 4. Top 10 funcionários que mais recebem EPIs
      const funcEntregaCount: Record<number, { nome: string; entregas: number; unidades: number }> = {};
      const allEmployees = await db.select({ id: employees.id, nome: employees.nomeCompleto })
        .from(employees).where(eq(employees.companyId, input.companyId));
      const empMap = new Map(allEmployees.map(e => [e.id, e.nome]));
      allDeliveries.forEach(del => {
        if (!funcEntregaCount[del.employeeId]) {
          funcEntregaCount[del.employeeId] = { nome: empMap.get(del.employeeId) || 'Desconhecido', entregas: 0, unidades: 0 };
        }
        funcEntregaCount[del.employeeId].entregas++;
        funcEntregaCount[del.employeeId].unidades += (del.quantidade || 1);
      });
      const topFuncionarios = Object.values(funcEntregaCount)
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 10);

      // 5. CAs vencendo nos próximos 90 dias
      const em90dias = new Date();
      em90dias.setDate(em90dias.getDate() + 90);
      const em90diasStr = em90dias.toISOString().split("T")[0];
      const casVencendo = allEpis
        .filter(e => e.validadeCa && e.validadeCa >= hoje && e.validadeCa <= em90diasStr)
        .map(e => ({ nome: e.nome, ca: e.ca, validadeCa: e.validadeCa, estoque: e.quantidadeEstoque || 0 }))
        .sort((a, b) => (a.validadeCa || '').localeCompare(b.validadeCa || ''));

      // 6. Custo médio por funcionário (baseado em valor cobrado nas entregas)
      const totalCusto = allDeliveries.reduce((s, d) => s + parseFloat(String(d.valorCobrado || '0')), 0);
      const funcUnicos = new Set(allDeliveries.map(d => d.employeeId)).size;
      const custoMedioPorFunc = funcUnicos > 0 ? totalCusto / funcUnicos : 0;

      // 7. Entregas por motivo de troca
      const porMotivo: Record<string, number> = {};
      allDeliveries.forEach(del => {
        const motivo = del.motivoTroca || del.motivo || 'Entrega regular';
        porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
      });

      // 8. Custo por obra
      const allObras = await db.select({ id: obras.id, nome: obras.nome })
        .from(obras).where(eq(obras.companyId, input.companyId));
      const obraMap = new Map(allObras.map(o => [o.id, o.nome]));
      const custoPorObra: Record<string, { nome: string; entregas: number; unidades: number; custo: number }> = {};
      for (const del of allDeliveries) {
        const emp = allEmployees.find(e => e.id === del.employeeId);
        // Get employee's obra from the full employee record
        const empFull = await db.select({ obraAtualId: employees.obraAtualId }).from(employees).where(eq(employees.id, del.employeeId)).limit(1);
        const obraId = empFull[0]?.obraAtualId;
        const obraNome = obraId ? (obraMap.get(obraId) || 'Sem obra') : 'Sem obra';
        if (!custoPorObra[obraNome]) custoPorObra[obraNome] = { nome: obraNome, entregas: 0, unidades: 0, custo: 0 };
        custoPorObra[obraNome].entregas++;
        custoPorObra[obraNome].unidades += (del.quantidade || 1);
        custoPorObra[obraNome].custo += parseFloat(String(del.valorCobrado || '0'));
      }
      const custoPorObraList = Object.values(custoPorObra).sort((a, b) => b.unidades - a.unidades);

      // 9. Alertas de desconto pendentes
      const alertasPendentes = await db.select().from(epiDiscountAlerts)
        .where(and(eq(epiDiscountAlerts.companyId, input.companyId), eq(epiDiscountAlerts.status, 'pendente')));
      const valorDescontosPendentes = alertasPendentes.reduce((s, a) => s + parseFloat(String(a.valorTotal || '0')), 0);

      return {
        totalItens,
        estoqueTotal,
        estoqueBaixo,
        caVencido,
        totalEntregas,
        entregasMes,
        valorTotalInventario,
        unidadesEntregues,
        // Analytics expandidos
        porCategoria,
        consumoMensal,
        topEpis,
        topFuncionarios,
        casVencendo,
        custoMedioPorFunc,
        porMotivo,
        custoPorObraList,
        alertasPendentes: alertasPendentes.length,
        valorDescontosPendentes,
        funcUnicos,
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
        
        let records: any[] = [];
        let fetched = false;
        let sourceUsed = '';

        // ============================================================
        // ESTRATÉGIA 1: FTP do MTE (fonte primária, atualizada diariamente)
        // Arquivo pipe-delimited (|) com header na primeira linha
        // ============================================================
        const ftpUrl = "ftp://ftp.mtps.gov.br/portal/fiscalizacao/seguranca-e-saude-no-trabalho/caepi/tgg_export_caepi.zip";
        try {
          const { execSync } = await import('child_process');
          // Download zip via curl (FTP) with 120s timeout
          execSync(`curl -s --max-time 120 "${ftpUrl}" -o /tmp/caepi_download.zip`, { timeout: 130000 });
          // Unzip
          execSync('cd /tmp && unzip -o caepi_download.zip', { timeout: 30000 });
          // Read the text file
          const fs = await import('fs');
          const rawText = fs.readFileSync('/tmp/tgg_export_caepi.txt', 'utf-8');
          const lines = rawText.split('\n').filter(l => l.trim());
          
          if (lines.length > 1) {
            // Header: NR Registro CA|DATA DE VALIDADE|SITUACAO|NR DO PROCESSO|CNPJ|RAZAO SOCIAL|NATUREZA|EQUIPAMENTO|DESCRICAO EQUIPAMENTO|MARCA CA|REFERENCIA|COR|APROVADO PARA LAUDO|...
            const headers = lines[0].split('|').map(h => h.trim());
            
            // Parse each line
            const parsed = lines.slice(1).map(line => {
              const values = line.split('|');
              const obj: any = {};
              headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
              return obj;
            });
            
            // Deduplicate by CA number (keep first occurrence of each unique CA)
            const caMap = new Map<string, any>();
            for (const item of parsed) {
              const ca = String(item['NR Registro CA'] || '').replace(/\D/g, '');
              if (ca && ca.length > 0 && !caMap.has(ca)) {
                caMap.set(ca, {
                  ca,
                  validade: item['DATA DE VALIDADE'] || null,
                  situacao: item['SITUACAO'] || null,
                  cnpj: item['CNPJ'] || null,
                  fabricante: item['RAZAO SOCIAL'] || null,
                  natureza: item['NATUREZA'] || null,
                  equipamento: item['EQUIPAMENTO'] || null,
                  descricao: item['DESCRICAO EQUIPAMENTO'] || null,
                  referencia: item['REFERENCIA'] || null,
                  cor: item['COR'] || null,
                  aprovadoPara: item['APROVADO PARA LAUDO'] || null,
                });
              }
            }
            records = Array.from(caMap.values());
            if (records.length > 0) {
              fetched = true;
              sourceUsed = 'FTP MTE (ftp.mtps.gov.br)';
            }
          }
          // Cleanup temp files
          try {
            execSync('rm -f /tmp/caepi_download.zip /tmp/tgg_export_caepi.txt', { timeout: 5000 });
          } catch { /* ignore cleanup errors */ }
        } catch (ftpErr: any) {
          console.error('CAEPI FTP download failed:', ftpErr.message);
        }

        // ============================================================
        // ESTRATÉGIA 2: Fallback — dados.gov.br API para descobrir URL dinâmica do XLSX
        // ============================================================
        if (!fetched) {
          try {
            const apiResp = await fetch(
              'https://dados.gov.br/api/publico/conjuntos-dados/cadastro-de-equipamento-de-protecao-individual',
              { headers: { 'User-Agent': 'Mozilla/5.0 ERP-RH-FC/1.0' }, signal: AbortSignal.timeout(15000) }
            );
            if (apiResp.ok) {
              const apiData = await apiResp.json();
              const xlsxResource = apiData.resources?.find((r: any) => 
                r.format?.toUpperCase().includes('XLS') && r.url
              );
              if (xlsxResource?.url) {
                const xlsResp = await fetch(xlsxResource.url, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                  signal: AbortSignal.timeout(60000)
                });
                if (xlsResp.ok) {
                  // TODO: Parse XLSX if needed in the future
                  console.log('XLSX resource found but XLSX parsing not implemented in fallback');
                }
              }
            }
          } catch { /* fallback failed */ }
        }

        if (!fetched || records.length === 0) {
          const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(caepiDatabase);
          return {
            success: false,
            error: "Não foi possível baixar dados atualizados. O servidor FTP do MTE pode estar temporariamente indisponível. Tente novamente mais tarde.",
            totalImported: countResult?.count || 0,
          };
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
          message: `Base CAEPI atualizada com ${records.length.toLocaleString()} CAs únicos. Fonte: ${sourceUsed}`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao atualizar: ${err.message || 'Erro desconhecido'}`,
          totalImported: 0,
        };
      }
    }),

  // ============================================================
  // FORNECEDORES DE EPIs
  // ============================================================
  fornecedoresList: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(fornecedoresEpi)
        .where(and(eq(fornecedoresEpi.companyId, input.companyId), eq(fornecedoresEpi.ativo, 1)))
        .orderBy(fornecedoresEpi.nome);
    }),

  fornecedoresCreate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      cnpj: z.string().optional(),
      contato: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      endereco: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(fornecedoresEpi).values({
        companyId: input.companyId,
        nome: input.nome,
        cnpj: input.cnpj || null,
        contato: input.contato || null,
        telefone: input.telefone || null,
        email: input.email || null,
        endereco: input.endereco || null,
        observacoes: input.observacoes || null,
      });
      return { id: result[0].insertId };
    }),

  fornecedoresUpdate: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1),
      cnpj: z.string().optional(),
      contato: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      endereco: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(fornecedoresEpi).set({
        nome: data.nome,
        cnpj: data.cnpj || null,
        contato: data.contato || null,
        telefone: data.telefone || null,
        email: data.email || null,
        endereco: data.endereco || null,
        observacoes: data.observacoes || null,
      }).where(eq(fornecedoresEpi.id, id));
      return { success: true };
    }),

  fornecedoresDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fornecedoresEpi).set({ ativo: 0 }).where(eq(fornecedoresEpi.id, input.id));
      return { success: true };
    }),
});
