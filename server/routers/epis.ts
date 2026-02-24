import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { epis, epiDeliveries, employees, systemCriteria } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { storagePut } from "../storage";

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
  // CONSULTA CA - Busca dados do EPI pelo número do CA (site oficial CAEPI/MTE)
  // ============================================================
  consultaCa: protectedProcedure
    .input(z.object({ ca: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const caNum = input.ca.replace(/\D/g, "");
        if (!caNum) return { found: false as const, error: "Número do CA inválido" };

        const baseUrl = "https://caepi.mte.gov.br/internet/consultacainternet.aspx";
        const defaultHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        };
        const ajaxHeaders: Record<string, string> = {
          ...defaultHeaders,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-MicrosoftAjax": "Delta=true",
          "X-Requested-With": "XMLHttpRequest",
        };

        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 15000);

        // Step 1: Get initial page to obtain ViewState tokens
        const initRes = await fetch(baseUrl, { headers: defaultHeaders, signal: controller1.signal });
        clearTimeout(timeout1);
        if (!initRes.ok) return { found: false as const, error: `Erro ao acessar site do CAEPI (status ${initRes.status})` };
        const initHtml = await initRes.text();

        const extractToken = (html: string, id: string) => {
          const m = html.match(new RegExp(`id="${id}"\\s+value="([^"]*)"`));
          return m ? m[1] : "";
        };
        const extractAjaxToken = (text: string, id: string) => {
          const m = text.match(new RegExp(`\\|${id}\\|([^|]+)\\|`));
          return m ? m[1] : "";
        };

        const vs1 = extractToken(initHtml, "__VIEWSTATE");
        const vsg1 = extractToken(initHtml, "__VIEWSTATEGENERATOR");
        const ev1 = extractToken(initHtml, "__EVENTVALIDATION");

        // Get cookies from initial request
        const setCookieHeaders = initRes.headers.getSetCookie?.() || [];
        const cookieStr = setCookieHeaders.map((c: string) => c.split(";")[0]).join("; ");

        // Step 2: AJAX search request
        const searchData = new URLSearchParams({
          "ctl00$ScriptManager1": "ctl00$PlaceHolderConteudo$UpdatePanel1|ctl00$PlaceHolderConteudo$btnConsultar",
          "__EVENTTARGET": "",
          "__EVENTARGUMENT": "",
          "__VIEWSTATE": vs1,
          "__VIEWSTATEGENERATOR": vsg1,
          "__EVENTVALIDATION": ev1,
          "ctl00$PlaceHolderConteudo$txtNumeroCA": caNum,
          "ctl00$PlaceHolderConteudo$cboEquipamento": "*******Selecione*******",
          "ctl00$PlaceHolderConteudo$cboFabricante": "*******Selecione*******",
          "ctl00$PlaceHolderConteudo$cboTipoProtecao": "*******Selecione*******",
          "__ASYNCPOST": "true",
          "ctl00$PlaceHolderConteudo$btnConsultar": "Consultar",
        });

        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 15000);

        const searchRes = await fetch(baseUrl, {
          method: "POST",
          headers: { ...ajaxHeaders, "Cookie": cookieStr },
          body: searchData.toString(),
          signal: controller2.signal,
        });
        clearTimeout(timeout2);

        if (!searchRes.ok) return { found: false as const, error: `Erro na consulta ao CAEPI (status ${searchRes.status})` };
        const searchHtml = await searchRes.text();

        if (!searchHtml.includes("grdListaResultado")) {
          return { found: false as const, error: "CA não encontrado no sistema CAEPI" };
        }

        // Step 3: Extract new tokens and click detail button
        const vs2 = extractAjaxToken(searchHtml, "__VIEWSTATE");
        const vsg2 = extractAjaxToken(searchHtml, "__VIEWSTATEGENERATOR") || vsg1;
        const ev2 = extractAjaxToken(searchHtml, "__EVENTVALIDATION");

        const cookies2 = searchRes.headers.getSetCookie?.()?.map((c: string) => c.split(";")[0]).join("; ") || cookieStr;

        const detailData = new URLSearchParams({
          "ctl00$ScriptManager1": "ctl00$PlaceHolderConteudo$UpdatePanel1|ctl00$PlaceHolderConteudo$grdListaResultado$ctl02$btnDetalhar",
          "__EVENTTARGET": "",
          "__EVENTARGUMENT": "",
          "__VIEWSTATE": vs2,
          "__VIEWSTATEGENERATOR": vsg2,
          "__EVENTVALIDATION": ev2,
          "ctl00$PlaceHolderConteudo$txtNumeroCA": caNum,
          "ctl00$PlaceHolderConteudo$cboEquipamento": "*******Selecione*******",
          "ctl00$PlaceHolderConteudo$cboFabricante": "*******Selecione*******",
          "ctl00$PlaceHolderConteudo$cboTipoProtecao": "*******Selecione*******",
          "ctl00$PlaceHolderConteudo$txtNumeroCAFiltro": "",
          "__ASYNCPOST": "true",
          "ctl00$PlaceHolderConteudo$grdListaResultado$ctl02$btnDetalhar.x": "10",
          "ctl00$PlaceHolderConteudo$grdListaResultado$ctl02$btnDetalhar.y": "10",
        });

        const controller3 = new AbortController();
        const timeout3 = setTimeout(() => controller3.abort(), 15000);

        const detailRes = await fetch(baseUrl, {
          method: "POST",
          headers: { ...ajaxHeaders, "Cookie": cookies2 },
          body: detailData.toString(),
          signal: controller3.signal,
        });
        clearTimeout(timeout3);

        if (!detailRes.ok) return { found: false as const, error: `Erro ao obter detalhes do CA (status ${detailRes.status})` };
        const detailHtml = await detailRes.text();

        // Extract data using span IDs from the CAEPI detail page
        const extractSpan = (spanId: string): string => {
          const m = detailHtml.match(new RegExp(`id="PlaceHolderConteudo_${spanId}"[^>]*>([^<]*)</span>`));
          return m ? m[1].trim() : "";
        };

        const ca = extractSpan("lblNRRegistroCA");
        const situacao = extractSpan("lblSituacao");
        const validadeRaw = extractSpan("lblDTValidade"); // "23/09/2030 00:00:00"
        const processo = extractSpan("lblNRProcesso");
        const cnpj = extractSpan("lblNRCNPJ");
        const razaoSocial = extractSpan("lblNORazaoSocial");
        const natureza = extractSpan("lblNatureza");
        const nomeEquipamento = extractSpan("lblNOEquipamento");
        const descricao = extractSpan("lblEquipamentoDSEquipamentoTexto");
        const marcacao = extractSpan("lblDSLocalMarcacaoCA");
        const referencia = extractSpan("lblDSReferencia");
        const tamanho = extractSpan("lblDSTamanho");
        const cor = extractSpan("lblDSCor");
        const aprovadoPara = extractSpan("lblDSAprovadoParaLaudo");

        if (!ca && !nomeEquipamento && !descricao) {
          return { found: false as const, error: "CA não encontrado" };
        }

        // Convert validade "DD/MM/YYYY HH:MM:SS" to "YYYY-MM-DD"
        let validadeISO = "";
        if (validadeRaw) {
          const datePart = validadeRaw.split(" ")[0]; // "23/09/2030"
          const parts = datePart.split("/");
          if (parts.length === 3) {
            validadeISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        // Build EPI name from reference + equipment name
        let nomeEpi = referencia || "";
        if (!nomeEpi && nomeEquipamento) {
          nomeEpi = nomeEquipamento.split(" ").slice(0, 8).join(" ");
        }

        return {
          found: true as const,
          ca: ca || caNum,
          nome: nomeEpi,
          descricao: descricao || nomeEquipamento,
          fabricante: razaoSocial,
          fabricanteRazao: razaoSocial,
          nomeFantasia: "",
          situacao,
          validade: validadeISO,
          natureza,
          referencia,
          marcacao,
          tamanho,
          cor,
          cnpj,
          aprovadoPara,
        };
      } catch (err: any) {
        console.error("[ConsultaCA] Erro:", err.name, err.message);
        if (err.name === "AbortError") {
          return { found: false as const, error: "Tempo limite excedido. O site do CAEPI pode estar lento. Tente novamente." };
        }
        return { found: false as const, error: `Erro ao consultar CA: ${err.message || "Tente novamente"}` };
      }
    }),
});
