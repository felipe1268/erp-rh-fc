import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser, userCanAccessObra, getEffectiveAllowedObraIds } from "../db";
import { epis, epiDeliveries, employees, systemCriteria, caepiDatabase, epiDiscountAlerts, obras, fornecedoresEpi, epiEstoqueObra, epiTransferencias, obraFuncionarios, companies, comprasSolicitacoes, comprasSolicitacoesItens, epiEstoqueMinimo, epiAssinaturas } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, gte, inArray, ilike, or, getTableColumns } from "drizzle-orm";
import { getConstrutorasIds } from "../db";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { buscarFotoParaItem } from "../_core/autoFoto";
import { generateEpiFichaPdf } from "../utils/generateEpiFichaPdf";
import { lockEGerarNumeroSc } from "./compras";

// Rev. 2950 — Guards de escrita de estoque por OBRA (permissão por obra do usuário).
// `assertObraWrite`: hard-guard anti-IDOR — só escreve no estoque de uma obra que o
// usuário tem acesso (admin/admin_master = global via userCanAccessObra → null).
async function assertObraWrite(ctx: any, obraId: number | null | undefined) {
  const ok = await userCanAccessObra(ctx.user.id, ctx.user.role, obraId);
  if (!ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para ajustar o estoque desta obra." });
  }
}
// `assertCentralWrite`: permite admin (allowed=null) E usuários de obra (allowed.length>0).
// Bloqueia apenas usuários sem nenhuma obra atribuída (allowed=[]).
// Rev. 4419 — por solicitação do usuário, qualquer usuário com permissão de obra pode
// cadastrar/ajustar no Almoxarifado Central (antes era exclusivo de administradores).
async function assertCentralWrite(ctx: any) {
  const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
  if (allowed !== null && allowed.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para cadastrar/ajustar no Almoxarifado Central. Solicite ao administrador acesso a pelo menos uma obra." });
  }
}

export const episRouter = router({
  // ============================================================
  // Rev. 2914 — NECESSIDADE x ESTOQUE (camisa/calça/calçado)
  // Cruza os tamanhos cadastrados dos funcionários ATIVOS com o estoque
  // (central + obras), descontando o que já foi entregue, p/ mostrar o
  // déficit por tamanho e facilitar a compra.
  // ============================================================
  getNecessidadeConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [c] = await db
        .select({ camisa: companies.epiNecCamisa, calca: companies.epiNecCalca, calcado: companies.epiNecCalcado })
        .from(companies)
        .where(eq(companies.id, input.companyId));
      return {
        camisa: c?.camisa ?? 1,
        calca: c?.calca ?? 1,
        calcado: c?.calcado ?? 1,
      };
    }),

  setNecessidadeConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      camisa: z.number().int().min(0).max(99),
      calca: z.number().int().min(0).max(99),
      calcado: z.number().int().min(0).max(99),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Guard de tenant: escrita em `companies` é cross-tenant sensível — valida
      // que o usuário tem acesso à empresa-alvo (admin/admin_master = global).
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      await db
        .update(companies)
        .set({ epiNecCamisa: input.camisa, epiNecCalca: input.calca, epiNecCalcado: input.calcado })
        .where(eq(companies.id, input.companyId));
      return { ok: true };
    }),

  necessidadeVsEstoque: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];

      // Classificação em "buckets": calçado / calça / camisa.
      // - calçado = categoria 'Calcado'
      // - calça   = categoria 'Uniforme' + tamanho numérico (36..58)
      // - camisa  = categoria 'Uniforme' + tamanho com letra (PP..EXG)
      const normSize = (s: any) => String(s ?? "").trim().toUpperCase();
      const bucketOf = (categoria: any, tamanho: any): "camisa" | "calca" | "calcado" | null => {
        const cat = String(categoria ?? "").trim().toLowerCase();
        const tam = normSize(tamanho);
        if (!tam) return null;
        if (cat === "calcado") return "calcado";
        if (cat === "uniforme") return /^[0-9]+$/.test(tam) ? "calca" : "camisa";
        return null;
      };

      const [emps, deliveries, central, obra, confs] = await Promise.all([
        db.select({
          id: employees.id,
          companyId: employees.companyId,
          camisa: employees.tamanhoCamisa,
          calca: employees.tamanhoCalca,
          calcado: employees.tamanhoCalcado,
        }).from(employees).where(and(inArray(employees.companyId, ids), eq(employees.status, "Ativo"))),
        db.select({
          employeeId: epiDeliveries.employeeId,
          categoria: epis.categoria,
          tamanho: epis.tamanho,
          quantidade: epiDeliveries.quantidade,
        }).from(epiDeliveries)
          .innerJoin(epis, eq(epiDeliveries.epiId, epis.id))
          .where(and(inArray(epiDeliveries.companyId, ids), isNull(epiDeliveries.deletedAt))),
        db.select({ categoria: epis.categoria, tamanho: epis.tamanho, q: epis.quantidadeEstoque })
          .from(epis).where(inArray(epis.companyId, ids)),
        db.select({ categoria: epis.categoria, tamanho: epis.tamanho, q: epiEstoqueObra.quantidade })
          .from(epiEstoqueObra)
          .innerJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
          .where(inArray(epiEstoqueObra.companyId, ids)),
        db.select({ id: companies.id, camisa: companies.epiNecCamisa, calca: companies.epiNecCalca, calcado: companies.epiNecCalcado })
          .from(companies).where(inArray(companies.id, ids)),
      ]);

      // Config POR EMPRESA — em modo grupo (companyIds) cada funcionário usa a
      // necessidade da SUA empresa, evitando aplicar uma config única ao agregado.
      type Cfg = { camisa: number; calca: number; calcado: number };
      const configByCompany = new Map<number, Cfg>();
      for (const c of confs) {
        configByCompany.set(c.id, { camisa: c.camisa ?? 1, calca: c.calca ?? 1, calcado: c.calcado ?? 1 });
      }
      // Config "principal" devolvida ao editor = a da empresa de entrada.
      const config: Cfg = configByCompany.get(input.companyId) ?? { camisa: 1, calca: 1, calcado: 1 };

      // Entregas já feitas, por funcionário+bucket (somando quantidade).
      const deliveredByEmpBucket = new Map<string, number>();
      for (const d of deliveries) {
        const b = bucketOf(d.categoria, d.tamanho);
        if (!b) continue;
        const k = `${d.employeeId}|${b}`;
        deliveredByEmpBucket.set(k, (deliveredByEmpBucket.get(k) || 0) + (Number(d.quantidade) || 0));
      }

      // Estoque total (central + obras) por bucket+tamanho.
      const stock: Record<"camisa" | "calca" | "calcado", Map<string, number>> = {
        camisa: new Map(), calca: new Map(), calcado: new Map(),
      };
      const addStock = (categoria: any, tamanho: any, q: any) => {
        const b = bucketOf(categoria, tamanho);
        if (!b) return;
        const s = normSize(tamanho);
        stock[b].set(s, (stock[b].get(s) || 0) + (Number(q) || 0));
      };
      for (const r of central) addStock(r.categoria, r.tamanho, r.q);
      for (const r of obra) addStock(r.categoria, r.tamanho, r.q);

      // Demanda por bucket+tamanho a partir dos funcionários ativos.
      type Acc = { funcionarios: number; necessidade: number; jaEntregue: number; liquida: number };
      const demand: Record<"camisa" | "calca" | "calcado", Map<string, Acc>> = {
        camisa: new Map(), calca: new Map(), calcado: new Map(),
      };
      const semTamanho = { camisa: 0, calca: 0, calcado: 0 };
      const BUCKETS = ["camisa", "calca", "calcado"] as const;
      for (const e of emps) {
        const empCfg = configByCompany.get(e.companyId) ?? config;
        for (const b of BUCKETS) {
          const need = empCfg[b];
          const size = normSize((e as any)[b]);
          if (!size) { if (need > 0) semTamanho[b]++; continue; }
          const delivered = deliveredByEmpBucket.get(`${e.id}|${b}`) || 0;
          const atendido = Math.min(delivered, need);
          const remaining = Math.max(0, need - delivered);
          const row = demand[b].get(size) || { funcionarios: 0, necessidade: 0, jaEntregue: 0, liquida: 0 };
          row.funcionarios += 1;
          row.necessidade += need;
          row.jaEntregue += atendido;
          row.liquida += remaining;
          demand[b].set(size, row);
        }
      }

      const CAMISA_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "EXG"];
      const sortSize = (a: { tamanho: string }, b: { tamanho: string }) => {
        const aNum = /^[0-9]+$/.test(a.tamanho), bNum = /^[0-9]+$/.test(b.tamanho);
        if (aNum && bNum) return parseFloat(a.tamanho) - parseFloat(b.tamanho);
        if (!aNum && !bNum) {
          const ia = CAMISA_ORDER.indexOf(a.tamanho), ib = CAMISA_ORDER.indexOf(b.tamanho);
          if (ia >= 0 && ib >= 0) return ia - ib;
          return a.tamanho.localeCompare(b.tamanho);
        }
        return aNum ? 1 : -1; // letras antes de números (não deve misturar no mesmo bucket)
      };

      const buildBucket = (b: "camisa" | "calca" | "calcado") => {
        const sizes = new Set<string>([...demand[b].keys(), ...stock[b].keys()]);
        const rows = [...sizes].map((size) => {
          const d = demand[b].get(size) || { funcionarios: 0, necessidade: 0, jaEntregue: 0, liquida: 0 };
          const estoque = stock[b].get(size) || 0;
          const deficit = Math.max(0, d.liquida - estoque);
          const sobra = Math.max(0, estoque - d.liquida);
          return { tamanho: size, funcionarios: d.funcionarios, necessidade: d.necessidade, jaEntregue: d.jaEntregue, liquida: d.liquida, estoque, deficit, sobra };
        });
        rows.sort(sortSize);
        const totais = rows.reduce((a, r) => ({
          funcionarios: a.funcionarios + r.funcionarios,
          necessidade: a.necessidade + r.necessidade,
          jaEntregue: a.jaEntregue + r.jaEntregue,
          liquida: a.liquida + r.liquida,
          estoque: a.estoque + r.estoque,
          deficit: a.deficit + r.deficit,
          sobra: a.sobra + r.sobra,
        }), { funcionarios: 0, necessidade: 0, jaEntregue: 0, liquida: 0, estoque: 0, deficit: 0, sobra: 0 });
        return { rows, totais, semTamanho: semTamanho[b] };
      };

      return {
        config,
        totalFuncionariosAtivos: emps.length,
        camisa: buildBucket("camisa"),
        calca: buildBucket("calca"),
        calcado: buildBucket("calcado"),
      };
    }),

  // ============================================================
  // CATÁLOGO DE EPIs
  // ============================================================
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      limit: z.number().min(1).max(2000).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      categoria: z.string().optional(),
      condicao: z.string().optional(),
      tamanho: z.string().optional(),
      filtroEstoque: z.enum(['todos','zerado','critico','baixo']).optional(),
      // Rev. 2950 — escopo do estoque exibido: ausente/0 = Almoxarifado Central;
      // com obraId, a coluna "Estoque" reflete o saldo DAQUELA obra (epi_estoque_obra).
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const conditions: any[] = [inArray(epis.companyId, ids)];
      if (input.search && input.search.trim().length > 0) {
        const term = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(sql`(LOWER(${epis.nome}) LIKE ${term} OR LOWER(COALESCE(${epis.ca},'')) LIKE ${term} OR LOWER(COALESCE(${epis.fabricante},'')) LIKE ${term})`);
      }
      if (input.categoria && input.categoria !== 'Todos') {
        conditions.push(eq(epis.categoria, input.categoria));
      }
      if (input.condicao && input.condicao !== 'Todos') {
        conditions.push(sql`COALESCE(${epis.condicao}, 'Novo') = ${input.condicao}`);
      }
      if (input.tamanho && input.tamanho !== 'Todos') {
        conditions.push(eq(epis.tamanho, input.tamanho));
      }
      // Rev. 2950 — quando há obraId, todo o filtro/exibição de "Estoque" passa a
      // refletir o saldo DAQUELA obra (subquery em epi_estoque_obra), não o central.
      const stockExpr = input.obraId
        ? sql<number>`COALESCE((SELECT ${epiEstoqueObra.quantidade} FROM ${epiEstoqueObra} WHERE ${epiEstoqueObra.epiId} = ${epis.id} AND ${epiEstoqueObra.obraId} = ${input.obraId}), 0)`
        : sql<number>`COALESCE(${epis.quantidadeEstoque}, 0)`;
      if (input.filtroEstoque === 'zerado') {
        conditions.push(sql`${stockExpr} = 0`);
      } else if (input.filtroEstoque === 'critico') {
        conditions.push(sql`${stockExpr} >= 1 AND ${stockExpr} <= 3`);
      } else if (input.filtroEstoque === 'baixo') {
        conditions.push(sql`${stockExpr} >= 4 AND ${stockExpr} <= 10`);
      }
      const cond = and(...conditions);
      // Com obraId: mantém TODAS as colunas do catálogo, troca `quantidadeEstoque`
      // pelo saldo da obra e expõe `estoqueCentral` (saldo do Almoxarifado Central).
      const selectObj: any = input.obraId
        ? { ...getTableColumns(epis), estoqueCentral: epis.quantidadeEstoque, quantidadeEstoque: stockExpr }
        : undefined;
      const [rows, countResult] = await Promise.all([
        (selectObj ? db.select(selectObj) : db.select()).from(epis).where(cond!).orderBy(epis.nome).limit(input.limit).offset(input.offset),
        db.select({ total: sql<number>`COUNT(*)` }).from(epis).where(cond!),
      ]);
      return { items: rows, total: Number(countResult[0]?.total ?? 0) };
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
      quantidadeEstoque: z.number().min(0).default(0),
      valorProduto: z.number().optional(),
      tempoMinimoTroca: z.number().optional(),
      corCapacete: z.string().nullable().optional(),
      condicao: z.enum(['Novo','Reutilizado']).default('Novo'),
      criadoPor: z.string().optional(),
      // Rev. 2950 — local do estoque inicial: ausente = Almoxarifado Central;
      // com obraLocalId, a quantidade inicial entra no estoque DAQUELA obra.
      obraLocalId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || input.criadoPor || 'Sistema';
      // Rev. 2950 — guard de permissão por obra:
      //  • com obraLocalId → exige acesso à obra (assertObraWrite, anti-IDOR);
      //  • sem obraLocalId (estoque inicial vai p/ o Central) → exige permissão de
      //    Central (usuário restrito a obras é bloqueado de poluir o Almoxarifado).
      if (input.obraLocalId) {
        await assertObraWrite(ctx, input.obraLocalId);
      } else if ((input.quantidadeEstoque ?? 0) !== 0) {
        await assertCentralWrite(ctx);
      }
      const usaObra = !!input.obraLocalId;
      const qtdInicial = input.quantidadeEstoque ?? 0;
      const [inserted] = await db.insert(epis).values({
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
        // Quando o estoque inicial é de uma obra, o Central nasce ZERADO (a qtd vai
        // pra epi_estoque_obra logo abaixo) — caixas independentes não se misturam.
        quantidadeEstoque: usaObra ? 0 : qtdInicial,
        valorProduto: input.valorProduto != null ? String(input.valorProduto) : null,
        tempoMinimoTroca: input.tempoMinimoTroca || null,
        corCapacete: input.corCapacete || null,
        condicao: input.condicao,
        criadoPor: userName,
      } as any).returning({ id: epis.id });
      // Rev. 2950 — entrada inicial no estoque da OBRA (caixa independente) +
      // histórico (rastreabilidade: quem cadastrou e onde) — espelha entradaDiretaObra.
      if (usaObra && qtdInicial > 0) {
        await db.insert(epiEstoqueObra).values({
          companyId: input.companyId,
          epiId: inserted.id,
          obraId: input.obraLocalId!,
          quantidade: qtdInicial,
          criadoPor: userName,
        } as any);
        const today = new Date().toISOString().split('T')[0];
        await db.insert(epiTransferencias).values({
          companyId: input.companyId,
          epiId: inserted.id,
          tipoOrigem: 'entrada_direta',
          origemObraId: null,
          destinoObraId: input.obraLocalId!,
          quantidade: qtdInicial,
          data: today,
          observacoes: 'Cadastro de EPI direto no estoque da obra',
          criadoPor: userName,
          criadoPorUserId: ctx.user?.id || null,
        } as any);
      }
      return { id: inserted.id };
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
      alteradoPor: z.string().optional(),
      fotoUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      // Rev. 2950 — guard de tenant + permissão de Central. Carrega a linha p/
      // derivar a empresa (anti-IDOR) e o saldo atual do Central.
      const [epiRow] = await db.select({ companyId: epis.companyId, quantidadeEstoque: epis.quantidadeEstoque }).from(epis).where(eq(epis.id, id));
      if (!epiRow) throw new TRPCError({ code: "NOT_FOUND", message: "EPI não encontrado." });
      const allowedCos = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCos.some((c) => c.id === epiRow.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este EPI." });
      }
      // Só bloqueia se a edição REALMENTE altera o saldo do Almoxarifado Central
      // (mexer em nome/CA/foto etc. continua livre p/ quem gerencia o catálogo).
      if (data.quantidadeEstoque !== undefined && data.quantidadeEstoque !== (epiRow.quantidadeEstoque ?? 0)) {
        await assertCentralWrite(ctx);
      }
      const updateData: any = {};
      updateData.alteradoPor = ctx.user?.name || data.alteradoPor || 'Sistema';
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
      if (data.fotoUrl !== undefined) updateData.fotoUrl = data.fotoUrl;
      await db.update(epis).set(updateData).where(eq(epis.id, id));
      return { success: true };
    }),

  // Atualizar só a foto (ação rápida)
  atualizarFoto: protectedProcedure
    .input(z.object({ id: z.number(), fotoUrl: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(epis).set({ fotoUrl: input.fotoUrl, alteradoPor: ctx.user?.name || 'Sistema' } as any).where(eq(epis.id, input.id));
      return { success: true };
    }),

  // Upload de foto do EPI
  // Armazena como data URI diretamente no banco (Neon é externo e persiste entre redeploys).
  // O cliente comprime a imagem antes de enviar (max 500px, quality 0.75) para manter tamanho razoável.
  uploadFotoEpi: protectedProcedure
    .input(z.object({ id: z.number(), fileBase64: z.string(), mimeType: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Valida tamanho máximo (~400KB base64 ≈ ~300KB imagem comprimida)
      if (input.fileBase64.length > 600_000) {
        throw new Error("Imagem muito grande. Por favor selecione uma imagem menor ou o sistema comprimirá automaticamente.");
      }
      const mime = input.mimeType.startsWith('image/') ? input.mimeType : 'image/jpeg';
      const url = `data:${mime};base64,${input.fileBase64}`;
      await db.update(epis).set({ fotoUrl: url, alteradoPor: ctx.user?.name || 'Sistema' } as any).where(eq(epis.id, input.id));
      return { url };
    }),

  // Sugerir foto do EPI via IA (Gemini busca imagem do produto)
  sugerirFotoIA: protectedProcedure
    .input(z.object({ nomeEpi: z.string(), ca: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        const url = await buscarFotoParaItem(input.nomeEpi);
        return { url: url || null, fonte: url ? "Openverse (CC)" : null };
      } catch (e) {
        return { url: null, fonte: null };
      }
    }),

  autoFotoBulk: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const semFoto = await db.execute(sql`
        SELECT id, nome, categoria FROM epis
        WHERE "companyId" = ${input.companyId}
          AND ("fotoUrl" IS NULL OR "fotoUrl" = '')
          AND lower(coalesce(nome,'')) NOT LIKE '%uniforme%'
          AND lower(coalesce(categoria,'')) NOT LIKE '%uniforme%'
        ORDER BY nome
      `);
      const itens = (semFoto?.rows ?? semFoto ?? []) as { id: number; nome: string; categoria: string }[];
      let atualizados = 0;
      const erros: string[] = [];
      for (const item of itens) {
        try {
          const url = await buscarFotoParaItem(item.nome);
          if (url) {
            await db.execute(sql`UPDATE epis SET "fotoUrl" = ${url} WHERE id = ${item.id}`);
            atualizados++;
          } else {
            erros.push(item.nome);
          }
        } catch (e) {
          erros.push(item.nome);
        }
      }
      return { total: itens.length, atualizados, semResultado: erros };
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
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number().optional(),
      epiId: z.number().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const conds: any[] = [inArray(epiDeliveries.companyId, ids), isNull(epiDeliveries.deletedAt)];
      if (input.employeeId) conds.push(eq(epiDeliveries.employeeId, input.employeeId));
      if (input.epiId) conds.push(eq(epiDeliveries.epiId, input.epiId));
      // Rev. 2911 — busca SERVER-SIDE (varre TODAS as páginas, não só a carregada).
      // Antes a busca era client-side sobre a página de 50 → funcionário fora do top-50
      // (ex.: JAMES, pos 63) ficava "invisível". Agora filtra por nome/função/EPI/CA no banco.
      const searchTerm = (input.search || "").trim();
      if (searchTerm) {
        const like = `%${searchTerm}%`;
        const searchCond = or(
          ilike(employees.nomeCompleto, like),
          ilike(employees.funcao, like),
          ilike(epis.nome, like),
          ilike(epis.ca, like),
        );
        if (searchCond) conds.push(searchCond);
      }

      const whereClause = and(...conds);

      const [rows, countResult] = await Promise.all([
        db.select({
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
          grupoEntregaId: epiDeliveries.grupoEntregaId,
          assinaturaUrl: epiDeliveries.assinaturaUrl,
          assinaturaResponsavelUrl: epiDeliveries.assinaturaResponsavelUrl,
          assinaturaResponsavelNome: epiDeliveries.assinaturaResponsavelNome,
          assinaturaResponsavelEm: epiDeliveries.assinaturaResponsavelEm,
          fotoUrl: employees.fotoUrl,
          foraDoKit: epiDeliveries.foraDoKit,
        })
          .from(epiDeliveries)
          .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
          .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
          .where(whereClause)
          .orderBy(desc(epiDeliveries.dataEntrega))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: sql<number>`COUNT(*)` })
          .from(epiDeliveries)
          .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
          .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
          .where(whereClause),
      ]);

      const empIds = [...new Set(rows.map(r => r.employeeId))];
      let obraMap = new Map<number, string>();
      if (empIds.length > 0) {
        const alocs = await db.execute(sql`
          SELECT DISTINCT ON (of2."employeeId") of2."employeeId", o.nome AS "obraNome"
          FROM obra_funcionarios of2
          JOIN obras o ON o.id = of2."obraId"
          WHERE of2."employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`,`)})
            AND of2."isActive" = 1
        `);
        ((alocs?.rows ?? alocs ?? []) as any[]).forEach((a: any) => {
          obraMap.set(a.employeeId, a.obraNome);
        });
      }

      return {
        items: rows.map(r => ({ ...r, obraNome: obraMap.get(r.employeeId) || null })),
        total: Number(countResult[0]?.total ?? 0),
      };
    }),

  checkVidaUtil: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      epiId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [epi] = await db.select({
        id: epis.id,
        nome: epis.nome,
        vidaUtilMeses: epis.vidaUtilMeses,
      }).from(epis).where(eq(epis.id, input.epiId));

      if (!epi || !epi.vidaUtilMeses || epi.vidaUtilMeses <= 0) {
        return { alerta: false };
      }

      const lastDelivery = ((await db.execute(sql`
        SELECT id, "dataEntrega", quantidade, motivo, "fotoEstadoUrl"
        FROM epi_deliveries
        WHERE "companyId" = ${input.companyId}
          AND "employeeId" = ${input.employeeId}
          AND "epiId" = ${input.epiId}
          AND "deletedAt" IS NULL
          AND "dataDevolucao" IS NULL
        ORDER BY "dataEntrega" DESC
        LIMIT 1
      `)) as any).rows?.[0];

      if (!lastDelivery) return { alerta: false };

      const dataEntrega = new Date(lastDelivery.dataEntrega);
      const dataExpiracao = new Date(dataEntrega);
      dataExpiracao.setMonth(dataExpiracao.getMonth() + epi.vidaUtilMeses);
      const hoje = new Date();

      if (hoje < dataExpiracao) {
        const diasRestantes = Math.ceil((dataExpiracao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        return {
          alerta: true,
          epiNome: epi.nome,
          vidaUtilMeses: epi.vidaUtilMeses,
          ultimaEntrega: lastDelivery.dataEntrega,
          dataExpiracao: dataExpiracao.toISOString().split('T')[0],
          diasRestantes,
          fotoAnteriorUrl: lastDelivery.fotoEstadoUrl,
          fotoObrigatoria: true,
          mensagem: `Este EPI (${epi.nome}) foi entregue em ${lastDelivery.dataEntrega} e tem vida útil de ${epi.vidaUtilMeses} meses. Ainda restam ${diasRestantes} dias. É necessário informar o motivo da troca. Para desgaste normal ou mau uso, é obrigatório anexar foto do EPI danificado.`,
        };
      }

      return { alerta: false };
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
      origemEntrega: z.enum(['central','obra']).default('central'),
      obraId: z.number().optional(),
      grupoEntregaId: z.string().optional(),
      foraDoKit: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Rev. 4664 — guard de tenant (code review): empresa, funcionário e EPI
      // precisam estar no escopo do usuário (antes aceitava ids arbitrários)
      const allowedCreate = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      if (!allowedCreate.has(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso à empresa informada.' });
      }
      const [empGuard] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, input.employeeId));
      if (!empGuard || !allowedCreate.has(empGuard.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Funcionário fora do seu escopo de empresas.' });
      }
      const [epiGuard] = await db.select({ companyId: epis.companyId }).from(epis).where(eq(epis.id, input.epiId));
      if (!epiGuard || !allowedCreate.has(epiGuard.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'EPI fora do seu escopo de empresas.' });
      }

      if (input.motivoTroca && ['desgaste_normal', 'mau_uso'].includes(input.motivoTroca) && !input.fotoEstadoBase64) {
        const motivoLabel = input.motivoTroca === 'desgaste_normal' ? 'desgaste normal' : 'mau uso';
        throw new Error(`Foto do EPI danificado é obrigatória para troca por ${motivoLabel}.`);
      }

      // Rev. 3889 — observação obrigatória quando EPI não consta no kit da função
      if (input.foraDoKit && !input.observacoes?.trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Observação obrigatória: este EPI não pertence ao kit da função. Registre o motivo antes de confirmar a entrega.',
        });
      }

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
        origemEntrega: input.origemEntrega,
        obraId: input.obraId || null,
        grupoEntregaId: input.grupoEntregaId || null,
        foraDoKit: input.foraDoKit ? 1 : 0,
      } as any).returning();

      // Update stock based on origin
      if (input.origemEntrega === 'obra' && input.obraId) {
        // Descontar do estoque da obra
        const [estoqueObra] = await db.select().from(epiEstoqueObra)
          .where(and(eq(epiEstoqueObra.epiId, input.epiId), eq(epiEstoqueObra.obraId, input.obraId)));
        if (estoqueObra) {
          await db.update(epiEstoqueObra)
            .set({ quantidade: sql`GREATEST(${epiEstoqueObra.quantidade} - ${input.quantidade}, 0)` })
            .where(eq(epiEstoqueObra.id, estoqueObra.id));
        }
      } else {
        // Descontar do estoque central
        await db.update(epis)
          .set({ quantidadeEstoque: sql`GREATEST(${epis.quantidadeEstoque} - ${input.quantidade}, 0)` })
          .where(eq(epis.id, input.epiId));
      }

      // Verificar se atingiu estoque mínimo e gerar SC automática (apenas para estoque central)
      if (input.origemEntrega !== 'obra') {
        try {
          const [epiAtual] = await db.select({ quantidadeEstoque: epis.quantidadeEstoque, nome: epis.nome, ca: epis.ca, tamanho: epis.tamanho })
            .from(epis).where(eq(epis.id, input.epiId));
          const estoqueAtual = epiAtual?.quantidadeEstoque || 0;

          const [minConfig] = await db.select({ quantidadeMinima: epiEstoqueMinimo.quantidadeMinima })
            .from(epiEstoqueMinimo)
            .where(and(
              eq(epiEstoqueMinimo.companyId, input.companyId),
              eq(epiEstoqueMinimo.epiId, input.epiId),
              sql`${epiEstoqueMinimo.obraId} IS NULL`,
            ));

          if (minConfig && estoqueAtual < minConfig.quantidadeMinima) {
            const epiNomeEscaped = (epiAtual.nome || '').replace(/'/g, "''");
            const recentSC = await db.select({ id: comprasSolicitacoesItens.id })
              .from(comprasSolicitacoesItens)
              .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
              .where(and(
                eq(comprasSolicitacoes.companyId, input.companyId),
                sql`${comprasSolicitacoes.titulo} LIKE '%Reposição automática de EPI%'`,
                sql`${comprasSolicitacoes.status} NOT IN ('cancelada','concluida')`,
                sql`${comprasSolicitacoes.criadoEm} > NOW() - INTERVAL '7 days'`,
                sql`${comprasSolicitacoesItens.descricao} LIKE ${'%' + epiAtual.nome + '%'}`,
              ))
              .limit(1);

            if (recentSC.length === 0) {
              const deficit = minConfig.quantidadeMinima - estoqueAtual;
              const descItem = `${epiAtual.nome}${epiAtual.ca ? ` (CA ${epiAtual.ca})` : ''}${epiAtual.tamanho ? ` - Tam. ${epiAtual.tamanho}` : ''}`;

              // Rev. 1795 — advisory lock + MAX(seq)+1 + INSERTs SC e itens TODOS dentro
              // da mesma transaction (consistência: nunca SC sem itens em caso de falha).
              const sc = await db.transaction(async (tx: any) => {
                const numeroSc = await lockEGerarNumeroSc(tx, input.companyId);
                const [row] = await tx.insert(comprasSolicitacoes).values({
                  companyId: input.companyId,
                  numeroSc,
                  departamento: "SST / Almoxarifado",
                  titulo: `Reposição automática de EPI — ${epiAtual.nome} (estoque: ${estoqueAtual})`,
                  prioridade: "alta",
                  tipo: "material",
                  status: "pendente",
                  aprovacaoStatus: "aguardando",
                  observacoes: `SC gerada automaticamente. Estoque atual: ${estoqueAtual}, mínimo configurado: ${minConfig.quantidadeMinima}.`,
                  criadoPorNome: "Sistema (Auto)",
                } as any).returning();
                await tx.insert(comprasSolicitacoesItens).values({
                  solicitacaoId: row.id,
                  descricao: descItem,
                  unidade: "un",
                  quantidade: String(deficit),
                  statusItem: "pendente",
                });
                return row;
              });

              console.log(`[EPI-AutoSC] SC ${sc.numeroSc} criada para ${epiAtual.nome} (estoque ${estoqueAtual} < mínimo ${minConfig.quantidadeMinima})`);
            }
          }
        } catch (err) {
          console.error("[EPI-AutoSC] Erro ao verificar estoque mínimo:", err);
        }
      }

      // Se motivo é cobrável, criar alerta de desconto automaticamente
      if (valorCobrado && parseFloat(valorCobrado) > 0) {
        const now = new Date();
        const mesRef = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await db.insert(epiDiscountAlerts).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          epiDeliveryId: result[0].id,
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

      try {
        const [emp] = await db.select({
          nomeCompleto: employees.nomeCompleto,
          cpf: employees.cpf,
          cargo: employees.cargo,
          setor: employees.setor,
          matricula: employees.matricula,
        }).from(employees).where(eq(employees.id, input.employeeId));

        const [comp] = await db.select({
          razaoSocial: companies.razaoSocial,
          cnpj: companies.cnpj,
        }).from(companies).where(eq(companies.id, input.companyId));

        if (emp && comp) {
          const fichaUrl = await generateEpiFichaPdf({
            companyName: comp.razaoSocial,
            companyCnpj: comp.cnpj,
            employeeName: emp.nomeCompleto,
            employeeCpf: emp.cpf,
            employeeCargo: emp.cargo || '',
            employeeSetor: emp.setor || '',
            employeeMatricula: emp.matricula || '',
            epiNome: epi?.nome || 'EPI',
            epiCa: epi?.ca || '',
            quantidade: input.quantidade,
            dataEntrega: input.dataEntrega,
            motivo: input.motivo || '',
            observacoes: input.observacoes || '',
            deliveryId: result[0].id,
            companyId: input.companyId,
          });
          await db.update(epiDeliveries)
            .set({ fichaUrl } as any)
            .where(eq(epiDeliveries.id, result[0].id));
        }
      } catch (pdfErr) {
        console.error('[EPI] Erro ao gerar ficha PDF automaticamente:', pdfErr);
      }

      return { id: result[0].id, valorCobrado };
    }),

  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.number(), epiId: z.number(), quantidade: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Buscar a entrega antes de deletar para saber a origem
      const [delivery] = await db.select({
        origemEntrega: epiDeliveries.origemEntrega,
        obraId: epiDeliveries.obraId,
        companyId: epiDeliveries.companyId,
        epiId: epiDeliveries.epiId,
        quantidade: epiDeliveries.quantidade,
        deletedAt: epiDeliveries.deletedAt,
      }).from(epiDeliveries).where(eq(epiDeliveries.id, input.id));
      // Rev. 4664 — guard de tenant + anti-tampering (code review): valida a
      // empresa da ENTREGA e usa epiId/quantidade do BANCO, não do cliente
      // (input manipulado podia inflar/desviar estoque de outro tenant).
      if (!delivery) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrega não encontrada.' });
      if (delivery.deletedAt) return { success: true }; // idempotente
      const allowedDel = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      if (!allowedDel.has(delivery.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso à empresa desta entrega.' });
      }
      const realEpiId = delivery.epiId;
      const realQtd = delivery.quantidade;
      await db.update(epiDeliveries).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id
      } as any).where(eq(epiDeliveries.id, input.id));
      // Return to correct stock based on origin
      if (delivery?.origemEntrega === 'obra' && delivery?.obraId) {
        // Devolver ao estoque da obra
        const [estoqueObra] = await db.select().from(epiEstoqueObra)
          .where(and(eq(epiEstoqueObra.epiId, realEpiId), eq(epiEstoqueObra.obraId, delivery.obraId)));
        if (estoqueObra) {
          await db.update(epiEstoqueObra)
            .set({ quantidade: sql`${epiEstoqueObra.quantidade} + ${realQtd}` })
            .where(eq(epiEstoqueObra.id, estoqueObra.id));
        } else {
          // Se não existe mais o registro de estoque da obra, criar
          await db.insert(epiEstoqueObra).values({
            companyId: delivery.companyId,
            epiId: realEpiId,
            obraId: delivery.obraId,
            quantidade: realQtd,
            criadoPor: ctx.user?.name || 'Sistema',
          });
        }
      } else {
        // Devolver ao estoque central
        await db.update(epis)
          .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${realQtd}` })
          .where(eq(epis.id, realEpiId));
      }
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

  updateDelivery: protectedProcedure
    .input(z.object({
      id: z.number(),
      epiId: z.number().optional(),
      employeeId: z.number().optional(),
      quantidade: z.number().min(1).optional(),
      dataEntrega: z.string().optional(),
      motivo: z.string().optional(),
      observacoes: z.string().optional(),
      motivoTroca: z.string().nullable().optional(),
      oldEpiId: z.number().optional(),
      oldQuantidade: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [existing] = await db.select().from(epiDeliveries).where(eq(epiDeliveries.id, input.id));
      if (!existing) throw new Error("Entrega não encontrada");
      if ((existing as any).assinaturaUrl) {
        throw new Error("Entrega já assinada pelo funcionário — não pode ser editada.");
      }
      // Rev. 4664 — guard de tenant (code review): entrega, novo EPI e novo
      // funcionário precisam estar no escopo de empresas do usuário
      const allowedUpd = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      if (!allowedUpd.has(existing.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso à empresa desta entrega.' });
      }
      if (input.epiId !== undefined && input.epiId !== existing.epiId) {
        const [epiNovo] = await db.select({ companyId: epis.companyId }).from(epis).where(eq(epis.id, input.epiId));
        if (!epiNovo || !allowedUpd.has(epiNovo.companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'EPI fora do seu escopo de empresas.' });
        }
      }
      if (input.employeeId !== undefined && input.employeeId !== existing.employeeId) {
        const [empNovo] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, input.employeeId));
        if (!empNovo || !allowedUpd.has(empNovo.companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Funcionário fora do seu escopo de empresas.' });
        }
      }

      const updates: any = {};
      if (input.dataEntrega !== undefined) updates.dataEntrega = input.dataEntrega;
      if (input.motivo !== undefined) updates.motivo = input.motivo || null;
      if (input.observacoes !== undefined) updates.observacoes = input.observacoes || null;
      if (input.motivoTroca !== undefined) updates.motivoTroca = input.motivoTroca || null;

      const epiChanged = input.epiId !== undefined && input.epiId !== existing.epiId;
      const qtyChanged = input.quantidade !== undefined && input.quantidade !== existing.quantidade;

      if (epiChanged || qtyChanged) {
        const oldEpiId = existing.epiId;
        const oldQty = existing.quantidade;
        const newEpiId = input.epiId ?? oldEpiId;
        const newQty = input.quantidade ?? oldQty;
        const isObra = (existing as any).origemEntrega === 'obra' && (existing as any).obraId;

        const adjustStock = async (epiId: number, delta: number) => {
          if (isObra) {
            await db.update(epiEstoqueObra)
              .set({ quantidade: sql`GREATEST(${epiEstoqueObra.quantidade} + ${delta}, 0)` })
              .where(and(eq(epiEstoqueObra.epiId, epiId), eq(epiEstoqueObra.obraId, (existing as any).obraId)));
          } else {
            await db.update(epis)
              .set({ quantidadeEstoque: sql`GREATEST(${epis.quantidadeEstoque} + ${delta}, 0)` })
              .where(eq(epis.id, epiId));
          }
        };

        if (epiChanged) {
          await adjustStock(oldEpiId, oldQty);
          await adjustStock(newEpiId, -newQty);
          updates.epiId = newEpiId;
        } else {
          const diff = newQty - oldQty;
          if (diff !== 0) {
            await adjustStock(oldEpiId, -diff);
          }
        }
        updates.quantidade = newQty;
      }

      if (input.employeeId !== undefined) updates.employeeId = input.employeeId;

      if (input.motivoTroca !== undefined) {
        const newMotivo = input.motivoTroca;
        const epiIdForCharge = input.epiId ?? existing.epiId;
        if (newMotivo && ['perda', 'mau_uso', 'furto'].includes(newMotivo)) {
          const [epi] = await db.select().from(epis).where(eq(epis.id, epiIdForCharge));
          if (epi?.valorProduto) {
            const bdiRows = await db.select().from(systemCriteria)
              .where(and(
                eq(systemCriteria.companyId, existing.companyId),
                eq(systemCriteria.chave, 'epi_bdi_percentual')
              ));
            const bdiPct = bdiRows.length > 0 ? parseFloat(bdiRows[0].valor) : 40;
            const custoBase = parseFloat(String(epi.valorProduto));
            updates.valorCobrado = String(Math.round(custoBase * (1 + bdiPct / 100) * 100) / 100);
          }
        } else {
          updates.valorCobrado = null;
        }
      }

      await db.update(epiDeliveries).set(updates).where(eq(epiDeliveries.id, input.id));
      return { success: true };
    }),

  backfillFichas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const missing = await db.select({
        id: epiDeliveries.id,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        motivo: epiDeliveries.motivo,
        observacoes: epiDeliveries.observacoes,
      }).from(epiDeliveries).where(and(
        eq(epiDeliveries.companyId, input.companyId),
        isNull(epiDeliveries.fichaUrl),
        isNull(epiDeliveries.deletedAt),
      ));

      const [comp] = await db.select({
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
      }).from(companies).where(eq(companies.id, input.companyId));

      if (!comp) return { generated: 0, errors: 0 };

      let generated = 0;
      let errors = 0;

      for (const d of missing) {
        try {
          const [emp] = await db.select({
            nomeCompleto: employees.nomeCompleto,
            cpf: employees.cpf,
            cargo: employees.cargo,
            setor: employees.setor,
            matricula: employees.matricula,
          }).from(employees).where(eq(employees.id, d.employeeId));

          const [epi] = await db.select({
            nome: epis.nome,
            ca: epis.ca,
          }).from(epis).where(eq(epis.id, d.epiId));

          if (emp) {
            const fichaUrl = await generateEpiFichaPdf({
              companyName: comp.razaoSocial,
              companyCnpj: comp.cnpj,
              employeeName: emp.nomeCompleto,
              employeeCpf: emp.cpf,
              employeeCargo: emp.cargo || '',
              employeeSetor: emp.setor || '',
              employeeMatricula: emp.matricula || '',
              epiNome: epi?.nome || 'EPI',
              epiCa: epi?.ca || '',
              quantidade: d.quantidade,
              dataEntrega: d.dataEntrega,
              motivo: d.motivo || '',
              observacoes: d.observacoes || '',
              deliveryId: d.id,
              companyId: input.companyId,
            });
            await db.update(epiDeliveries)
              .set({ fichaUrl } as any)
              .where(eq(epiDeliveries.id, d.id));
            generated++;
          }
        } catch (err) {
          console.error(`[EPI Backfill] Erro delivery #${d.id}:`, err);
          errors++;
        }
      }

      return { generated, errors, total: missing.length };
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const hoje = new Date().toISOString().split("T")[0];
      const ha30dias = new Date();
      ha30dias.setDate(ha30dias.getDate() - 30);
      const ha30diasStr = ha30dias.toISOString().split("T")[0];
      const em90dias = new Date();
      em90dias.setDate(em90dias.getDate() + 90);
      const em90diasStr = em90dias.toISOString().split("T")[0];

      const [episStats, deliveryStats, obrasValorRows, categoriaRows, entregasMesCount, alertasRows] = await Promise.all([
        db.select({
          totalItens: sql<number>`COUNT(*)`,
          estoqueTotal: sql<number>`COALESCE(SUM(${epis.quantidadeEstoque}), 0)`,
          estoqueBaixo: sql<number>`COUNT(CASE WHEN COALESCE(${epis.quantidadeEstoque}, 0) <= 5 THEN 1 END)`,
          caVencido: sql<number>`COUNT(CASE WHEN ${epis.validadeCa} IS NOT NULL AND ${epis.validadeCa} < ${hoje} THEN 1 END)`,
          valorTotalInventario: sql<number>`COALESCE(SUM(COALESCE(${epis.valorProduto}, 0) * COALESCE(${epis.quantidadeEstoque}, 0)), 0)`,
        }).from(epis).where(inArray(epis.companyId, ids)),

        db.select({
          totalEntregas: sql<number>`COUNT(*)`,
          unidadesEntregues: sql<number>`COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0)`,
          totalCusto: sql<number>`COALESCE(SUM(COALESCE(${epiDeliveries.valorCobrado}::numeric, 0)), 0)`,
          funcUnicos: sql<number>`COUNT(DISTINCT ${epiDeliveries.employeeId})`,
        }).from(epiDeliveries).where(and(inArray(epiDeliveries.companyId, ids), isNull(epiDeliveries.deletedAt))),

        db.select({
          valorObras: sql<number>`COALESCE(SUM(${epiEstoqueObra.quantidade} * COALESCE(${epis.valorProduto}, 0)), 0)`,
        }).from(epiEstoqueObra)
          .leftJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
          .where(and(inArray(epiEstoqueObra.companyId, ids), sql`${epiEstoqueObra.quantidade} > 0`)),

        db.select({
          categoria: sql<string>`COALESCE(${epis.categoria}, 'EPI')`,
          qtdItens: sql<number>`COUNT(*)`,
          estoque: sql<number>`COALESCE(SUM(${epis.quantidadeEstoque}), 0)`,
          valor: sql<number>`COALESCE(SUM(COALESCE(${epis.valorProduto}, 0) * COALESCE(${epis.quantidadeEstoque}, 0)), 0)`,
        }).from(epis).where(inArray(epis.companyId, ids)).groupBy(sql`COALESCE(${epis.categoria}, 'EPI')`),

        db.select({
          entregasMes: sql<number>`COUNT(*)`,
        }).from(epiDeliveries).where(and(
          inArray(epiDeliveries.companyId, ids),
          isNull(epiDeliveries.deletedAt),
          gte(epiDeliveries.dataEntrega, ha30diasStr),
        )),

        db.select({
          total: sql<number>`COUNT(*)`,
          valorTotal: sql<number>`COALESCE(SUM(COALESCE(${epiDiscountAlerts.valorTotal}::numeric, 0)), 0)`,
        }).from(epiDiscountAlerts)
          .where(and(eq(epiDiscountAlerts.companyId, input.companyId), eq(epiDiscountAlerts.status, 'pendente'))),
      ]);

      const eStats = episStats[0];
      const dStats = deliveryStats[0];
      const totalItens = Number(eStats?.totalItens ?? 0);
      const estoqueTotal = Number(eStats?.estoqueTotal ?? 0);
      const estoqueBaixo = Number(eStats?.estoqueBaixo ?? 0);
      const caVencido = Number(eStats?.caVencido ?? 0);
      const valorTotalInventario = parseFloat(String(eStats?.valorTotalInventario ?? 0));
      const totalEntregas = Number(dStats?.totalEntregas ?? 0);
      const unidadesEntregues = Number(dStats?.unidadesEntregues ?? 0);
      const totalCusto = parseFloat(String(dStats?.totalCusto ?? 0));
      const funcUnicos = Number(dStats?.funcUnicos ?? 0);
      const valorObras = parseFloat(String(obrasValorRows[0]?.valorObras || 0));
      const valorTotalGeral = valorTotalInventario + valorObras;
      const entregasMes = Number(entregasMesCount[0]?.entregasMes ?? 0);
      const custoMedioPorFunc = funcUnicos > 0 ? totalCusto / funcUnicos : 0;

      const porCategoria: Record<string, { qtdItens: number; estoque: number; valor: number }> = {};
      categoriaRows.forEach(r => {
        porCategoria[String(r.categoria)] = {
          qtdItens: Number(r.qtdItens),
          estoque: Number(r.estoque),
          valor: parseFloat(String(r.valor)),
        };
      });

      const consumoMensal: { mes: string; entregas: number; unidades: number; custo: number }[] = [];
      const monthConditions: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        monthConditions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      const consumoRows = await db.execute(sql`
        SELECT
          to_char(${epiDeliveries.dataEntrega}::date, 'YYYY-MM') AS mes_key,
          COUNT(*) AS entregas,
          COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0) AS unidades,
          COALESCE(SUM(COALESCE(${epiDeliveries.valorCobrado}::numeric, 0)), 0) AS custo
        FROM ${epiDeliveries}
        WHERE ${epiDeliveries.companyId} IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND ${epiDeliveries.deletedAt} IS NULL
          AND to_char(${epiDeliveries.dataEntrega}::date, 'YYYY-MM') IN (${sql.join(monthConditions.map(m => sql`${m}`), sql`,`)})
        GROUP BY to_char(${epiDeliveries.dataEntrega}::date, 'YYYY-MM')
      `);
      const consumoMap = new Map((consumoRows?.rows ?? consumoRows ?? []).map((r: any) => [r.mes_key, r]));
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mesLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        const row = consumoMap.get(mesKey) as any;
        consumoMensal.push({
          mes: mesLabel,
          entregas: row ? Number(row.entregas) : 0,
          unidades: row ? Number(row.unidades) : 0,
          custo: row ? parseFloat(String(row.custo)) : 0,
        });
      }

      const topEpisRows = await db.select({
        nome: epis.nome,
        ca: epis.ca,
        entregas: sql<number>`COUNT(*)`,
        unidades: sql<number>`COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0)`,
      }).from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .where(and(inArray(epiDeliveries.companyId, ids), isNull(epiDeliveries.deletedAt)))
        .groupBy(epiDeliveries.epiId, epis.nome, epis.ca)
        .orderBy(sql`COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0) DESC`)
        .limit(10);
      const topEpis = topEpisRows.map(r => ({
        nome: r.nome || 'Desconhecido', ca: r.ca || '-',
        entregas: Number(r.entregas), unidades: Number(r.unidades),
      }));

      const topFuncRows = await db.select({
        nome: employees.nomeCompleto,
        entregas: sql<number>`COUNT(*)`,
        unidades: sql<number>`COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0)`,
      }).from(epiDeliveries)
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(inArray(epiDeliveries.companyId, ids), isNull(epiDeliveries.deletedAt)))
        .groupBy(epiDeliveries.employeeId, employees.nomeCompleto)
        .orderBy(sql`COALESCE(SUM(COALESCE(${epiDeliveries.quantidade}, 1)), 0) DESC`)
        .limit(10);
      const topFuncionarios = topFuncRows.map(r => ({
        nome: r.nome || 'Desconhecido',
        entregas: Number(r.entregas), unidades: Number(r.unidades),
      }));

      const casVencendo = await db.select({
        nome: epis.nome,
        ca: epis.ca,
        validadeCa: epis.validadeCa,
        estoque: sql<number>`COALESCE(${epis.quantidadeEstoque}, 0)`,
      }).from(epis)
        .where(and(
          inArray(epis.companyId, ids),
          sql`${epis.validadeCa} IS NOT NULL`,
          gte(epis.validadeCa, hoje),
          sql`${epis.validadeCa} <= ${em90diasStr}`,
        ))
        .orderBy(epis.validadeCa);

      const motivoRows = await db.execute(sql`
        SELECT COALESCE(NULLIF(${epiDeliveries.motivoTroca}, ''), NULLIF(${epiDeliveries.motivo}, ''), 'Entrega regular') AS motivo,
               COUNT(*) AS total
        FROM ${epiDeliveries}
        WHERE ${epiDeliveries.companyId} IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND ${epiDeliveries.deletedAt} IS NULL
        GROUP BY COALESCE(NULLIF(${epiDeliveries.motivoTroca}, ''), NULLIF(${epiDeliveries.motivo}, ''), 'Entrega regular')
      `);
      const porMotivo: Record<string, number> = {};
      ((motivoRows?.rows ?? motivoRows ?? []) as any[]).forEach((r: any) => {
        porMotivo[r.motivo] = Number(r.total);
      });

      const custoPorObraRows = await db.execute(sql`
        SELECT COALESCE(o.nome, 'Sem obra') AS obra_nome,
               COUNT(*) AS entregas,
               COALESCE(SUM(COALESCE(ed.quantidade, 1)), 0) AS unidades,
               COALESCE(SUM(COALESCE(ed."valor_cobrado"::numeric, 0)), 0) AS custo
        FROM epi_deliveries ed
        LEFT JOIN LATERAL (
          SELECT of2."obraId" FROM obra_funcionarios of2
          WHERE of2."employeeId" = ed."employeeId" AND of2."isActive" = 1
          LIMIT 1
        ) aloc ON true
        LEFT JOIN obras o ON o.id = aloc."obraId"
        WHERE ed."companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND ed."deletedAt" IS NULL
        GROUP BY COALESCE(o.nome, 'Sem obra')
        ORDER BY unidades DESC
      `);
      const custoPorObraList = ((custoPorObraRows?.rows ?? custoPorObraRows ?? []) as any[]).map((r: any) => ({
        nome: r.obra_nome,
        entregas: Number(r.entregas),
        unidades: Number(r.unidades),
        custo: parseFloat(String(r.custo)),
      }));

      return {
        totalItens,
        estoqueTotal,
        estoqueBaixo,
        caVencido,
        totalEntregas,
        entregasMes,
        valorTotalInventario,
        valorObras,
        valorTotalGeral,
        unidadesEntregues,
        porCategoria,
        consumoMensal,
        topEpis,
        topFuncionarios,
        casVencendo,
        custoMedioPorFunc,
        porMotivo,
        custoPorObraList,
        alertasPendentes: Number(alertasRows[0]?.total ?? 0),
        valorDescontosPendentes: parseFloat(String(alertasRows[0]?.valorTotal ?? 0)),
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
        // ESTRATÉGIA 2: Fallback — dados.gov.br API + XLSX parser
        // ============================================================
        if (!fetched) {
          try {
            console.log('CAEPI: Tentando fallback via dados.gov.br API...');
            const apiResp = await fetch(
              'https://dados.gov.br/api/publico/conjuntos-dados/cadastro-de-equipamento-de-protecao-individual',
              { headers: { 'User-Agent': 'Mozilla/5.0 ERP-RH-FC/1.0' }, signal: AbortSignal.timeout(15000) }
            );
            if (apiResp.ok) {
              const apiData = await apiResp.json();
              // Find XLSX/XLSM resource - check recursos array (new API format) or resources
              const resourceList = apiData.recursos || apiData.resources || [];
              const xlsxResource = resourceList.find((r: any) => {
                const fmt = (r.formato || r.format || '').toUpperCase();
                const url = r.link || r.url || '';
                return (fmt.includes('XLS') || fmt.includes('XLSM')) && url;
              });
              const xlsUrl = xlsxResource?.link || xlsxResource?.url;
              if (xlsUrl) {
                console.log('CAEPI: Baixando XLSX de', xlsUrl);
                const xlsResp = await fetch(xlsUrl, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                  signal: AbortSignal.timeout(120000),
                  redirect: 'follow',
                });
                if (xlsResp.ok) {
                  const arrayBuf = await xlsResp.arrayBuffer();
                  const XLSX = (await import('xlsx')).default;
                  const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array' });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 0 });
                  console.log(`CAEPI: XLSX parsed, ${rows.length} rows`);
                  
                  if (rows.length > 0) {
                    const caMap = new Map<string, any>();
                    for (const item of rows) {
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
                      sourceUsed = 'Portal de Dados Abertos (dados.gov.br)';
                      console.log(`CAEPI: ${records.length} CAs únicos via XLSX`);
                    }
                  }
                }
              }
            }
          } catch (xlsErr: any) {
            console.error('CAEPI XLSX fallback failed:', xlsErr.message);
          }
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      return db.select().from(fornecedoresEpi)
        .where(and(inArray(fornecedoresEpi.companyId, ids), eq(fornecedoresEpi.ativo, 1)))
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
      }).returning();
      return { id: result[0].id };
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

  // ============================================================
  // ESTOQUE POR OBRA
  // ============================================================
  estoqueObraList: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const conds: any[] = [inArray(epiEstoqueObra.companyId, ids)];
      if (input.obraId) conds.push(eq(epiEstoqueObra.obraId, input.obraId));
      const rows = await db.select({
        id: epiEstoqueObra.id,
        companyId: epiEstoqueObra.companyId,
        epiId: epiEstoqueObra.epiId,
        obraId: epiEstoqueObra.obraId,
        quantidade: epiEstoqueObra.quantidade,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        categoriaEpi: epis.categoria,
        tamanhoEpi: epis.tamanho, // Rev. 2776 — mostrar numeração/tamanho na tela
        condicaoEpi: epis.condicao,
        valorProdutoEpi: epis.valorProduto,
        nomeObra: obras.nome,
        createdAt: epiEstoqueObra.createdAt,
        updatedAt: epiEstoqueObra.updatedAt,
        criadoPor: epiEstoqueObra.criadoPor,
        alteradoPor: epiEstoqueObra.alteradoPor,
      })
        .from(epiEstoqueObra)
        .leftJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
        .leftJoin(obras, eq(epiEstoqueObra.obraId, obras.id))
        .where(and(...conds))
        .orderBy(obras.nome, epis.nome);
      return rows;
    }),

  // Resumo de estoque por obra (agrupado)
  estoqueObraResumo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const rows = await db.select({
        obraId: epiEstoqueObra.obraId,
        nomeObra: obras.nome,
        totalItens: sql<number>`COUNT(DISTINCT ${epiEstoqueObra.epiId})`,
        totalUnidades: sql<number>`SUM(${epiEstoqueObra.quantidade})`,
        valorTotal: sql<number>`COALESCE(SUM(${epiEstoqueObra.quantidade} * COALESCE(${epis.valorProduto}, 0)), 0)`,
      })
        .from(epiEstoqueObra)
        .leftJoin(obras, eq(epiEstoqueObra.obraId, obras.id))
        .leftJoin(epis, eq(epiEstoqueObra.epiId, epis.id))
        .where(and(inArray(epiEstoqueObra.companyId, ids), sql`${epiEstoqueObra.quantidade} > 0`))
        .groupBy(epiEstoqueObra.obraId, obras.nome)
        .orderBy(obras.nome);
      return rows;
    }),

  estoqueCentralResumo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const rows = await db.select({
        totalItens: sql<number>`COUNT(CASE WHEN ${epis.quantidadeEstoque} > 0 THEN 1 END)`,
        totalUnidades: sql<number>`COALESCE(SUM(${epis.quantidadeEstoque}), 0)`,
        valorTotal: sql<number>`COALESCE(SUM(${epis.quantidadeEstoque} * COALESCE(${epis.valorProduto}, 0)), 0)`,
      })
        .from(epis)
        .where(inArray(epis.companyId, ids));
      return rows[0] ?? { totalItens: 0, totalUnidades: 0, valorTotal: 0 };
    }),

  // Rev. 2928 — Ajuste DIRETO do estoque de UMA obra (caixa independente).
  // Edita SOMENTE `epi_estoque_obra.quantidade`; NUNCA toca `epis.quantidadeEstoque`
  // (o saldo do Almoxarifado Central). Antes, a tela "Estoque por Obra" abria o
  // editor do CATÁLOGO central, então "corrigir a obra" mexia no central (bug).
  ajustarEstoqueObra: protectedProcedure
    .input(z.object({ id: z.number(), quantidade: z.number().int().min(0), epiId: z.number().optional(), obraId: z.number().optional(), observacao: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 2998 — Alvo por CHAVE NATURAL COMPOSTA (id + epiId + obraId), não só
      // pelo id. A tabela epi_estoque_obra foi criada SEM PRIMARY KEY e um restore
      // reabasteceu a sequence → ids duplicados (ex.: "id=2" em 2 EPIs distintos).
      // Com WHERE id=X, ajustar uma luva "grudava" o valor na outra. O front envia
      // epiId/obraId da própria linha; aqui exigimos linha ÚNICA antes de escrever.
      const sel: any[] = [eq(epiEstoqueObra.id, input.id)];
      if (typeof input.epiId === "number") sel.push(eq(epiEstoqueObra.epiId, input.epiId));
      if (typeof input.obraId === "number") sel.push(eq(epiEstoqueObra.obraId, input.obraId));
      const found = await db.select().from(epiEstoqueObra).where(and(...sel));
      if (found.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Registro de estoque da obra não encontrado." });
      if (found.length > 1) throw new TRPCError({ code: "CONFLICT", message: "Registro de estoque ambíguo (id duplicado). Recarregue a tela e tente novamente." });
      const row = found[0];
      // Guard de tenant/IDOR — deriva a empresa do PRÓPRIO registro.
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c) => c.id === row.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este estoque." });
      }
      // Rev. 2950 — guard de permissão por OBRA: só ajusta o estoque de obras que o
      // usuário gerencia (admin = global). Evita "bagunça" entre obras (anti-IDOR).
      await assertObraWrite(ctx, row.obraId);
      // UPDATE também pela chave natural completa (defesa-em-profundidade): mesmo
      // que um id duplicado escape no futuro, só a linha (id,epiId,obraId,company) muda.
      await db.update(epiEstoqueObra)
        .set({ quantidade: input.quantidade, alteradoPor: ctx.user?.name || 'Sistema', updatedAt: new Date().toISOString() } as any)
        .where(and(
          eq(epiEstoqueObra.id, row.id),
          eq(epiEstoqueObra.epiId, row.epiId),
          eq(epiEstoqueObra.obraId, row.obraId),
          eq(epiEstoqueObra.companyId, row.companyId),
        ));
      return { success: true };
    }),

  // ============================================================
  // TRANSFERÊNCIAS DE ESTOQUE
  // ============================================================
  transferir: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      quantidade: z.number().min(1),
      tipoOrigem: z.enum(['central','obra']),
      origemObraId: z.number().optional(),
      tipoDestino: z.enum(['central','obra']).default('obra'),
      destinoObraId: z.number().optional(),
      data: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Validar: não pode transferir central→central
      if (input.tipoOrigem === 'central' && input.tipoDestino === 'central') {
        throw new Error('Não é possível transferir do central para o central');
      }

      // Guard de tenant/IDOR — deriva a empresa do PRÓPRIO EPI e exige acesso.
      const epiCo = await db.select({ companyId: epis.companyId }).from(epis).where(eq(epis.id, input.epiId));
      if (!epiCo[0]) throw new TRPCError({ code: "NOT_FOUND", message: "EPI não encontrado." });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c) => c.id === epiCo[0].companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este EPI." });
      }
      // Empresa-dona do EPI (vale p/ novos registros de estoque/obra — alinha o tenant).
      const epiCompanyId = epiCo[0].companyId;

      // Rev. 2928 — Guard de tenant/IDOR nas OBRAS: origem/destino DEVEM pertencer à
      // empresa-dona do EPI (senão dá pra poluir estoque de outra empresa via API direta).
      const obraIdsToCheck = [
        input.tipoOrigem === 'obra' ? input.origemObraId : undefined,
        input.tipoDestino === 'obra' ? input.destinoObraId : undefined,
      ].filter((x): x is number => typeof x === 'number' && x > 0);
      if (obraIdsToCheck.length) {
        const uniqueObraIds = Array.from(new Set(obraIdsToCheck));
        const obrasOk = await db.select({ id: obras.id }).from(obras)
          .where(and(inArray(obras.id, uniqueObraIds), eq(obras.companyId, epiCompanyId)));
        if (obrasOk.length !== uniqueObraIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Obra de origem/destino inválida para esta empresa." });
        }
        // Rev. 2950 — permissão por OBRA: o usuário só transfere de/para obras que
        // gerencia (admin = global). Cada obra envolvida é validada (anti-IDOR).
        for (const oid of uniqueObraIds) {
          await assertObraWrite(ctx, oid);
        }
      }

      // Rev. 2950 — permissão de CENTRAL: usuário RESTRITO (allowedObraIds != null) NÃO
      // pode escrever no Almoxarifado Central, NEM via transferência (origem central =
      // débito do central; destino central = crédito no central). admin/full-access ok.
      if (input.tipoOrigem === 'central' || input.tipoDestino === 'central') {
        await assertCentralWrite(ctx);
      }

      // Rev. 2928 — TUDO numa transação: origem, destino e histórico ou TODOS revertem.
      // Antes, sem transação, uma falha no meio (ex.: insert do histórico) deixava o
      // saldo corrompido (descontou de um lado e não creditou o outro).
      await db.transaction(async (tx: any) => {
        // ---- Descontar da ORIGEM ----
        if (input.tipoOrigem === 'central') {
          // Rev. 2928 — débito ATÔMICO (concorrência-safe): só desconta se ainda há
          // saldo (`>= quantidade`) na MESMA query; sem janela entre SELECT e UPDATE.
          const debitado = await tx.update(epis)
            .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} - ${input.quantidade}` })
            .where(and(eq(epis.id, input.epiId), gte(epis.quantidadeEstoque, input.quantidade)))
            .returning({ id: epis.id });
          if (debitado.length === 0) {
            const [epi] = await tx.select({ quantidadeEstoque: epis.quantidadeEstoque }).from(epis).where(eq(epis.id, input.epiId));
            throw new Error(`Estoque central insuficiente. Disponível: ${epi?.quantidadeEstoque || 0}`);
          }
        } else {
          if (!input.origemObraId) throw new Error('Obra de origem é obrigatória para transferência entre obras');
          // Rev. 2928 — débito ATÔMICO da obra de origem (mesma proteção do central).
          const debitado = await tx.update(epiEstoqueObra)
            .set({ quantidade: sql`${epiEstoqueObra.quantidade} - ${input.quantidade}` })
            .where(and(
              eq(epiEstoqueObra.epiId, input.epiId),
              eq(epiEstoqueObra.obraId, input.origemObraId),
              gte(epiEstoqueObra.quantidade, input.quantidade),
            ))
            .returning({ id: epiEstoqueObra.id });
          if (debitado.length === 0) {
            const [estoqueOrigem] = await tx.select().from(epiEstoqueObra)
              .where(and(eq(epiEstoqueObra.epiId, input.epiId), eq(epiEstoqueObra.obraId, input.origemObraId)));
            throw new Error(`Estoque da obra insuficiente. Disponível: ${estoqueOrigem?.quantidade || 0}`);
          }
        }

        // ---- Creditar no DESTINO ----
        if (input.tipoDestino === 'central') {
          await tx.update(epis)
            .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${input.quantidade}` })
            .where(eq(epis.id, input.epiId));
        } else {
          if (!input.destinoObraId) throw new Error('Obra de destino é obrigatória');
          const [existente] = await tx.select().from(epiEstoqueObra)
            .where(and(eq(epiEstoqueObra.epiId, input.epiId), eq(epiEstoqueObra.obraId, input.destinoObraId)));
          if (existente) {
            await tx.update(epiEstoqueObra)
              .set({ quantidade: sql`${epiEstoqueObra.quantidade} + ${input.quantidade}` })
              .where(eq(epiEstoqueObra.id, existente.id));
          } else {
            await tx.insert(epiEstoqueObra).values({
              companyId: epiCompanyId,
              epiId: input.epiId,
              obraId: input.destinoObraId,
              quantidade: input.quantidade,
              criadoPor: ctx.user?.name || 'Sistema',
            });
          }
        }

        // ---- Histórico ----
        // `destinoObraId` é NOT NULL no schema; destino=central usa sentinela 0
        // (a UI trata 0 como falsy → exibe "Almoxarifado Central"). Isso conserta a
        // transferência obra→central, que antes gravava null e podia violar NOT NULL.
        await tx.insert(epiTransferencias).values({
          companyId: epiCompanyId,
          epiId: input.epiId,
          quantidade: input.quantidade,
          tipoOrigem: input.tipoOrigem,
          origemObraId: input.tipoOrigem === 'obra' ? (input.origemObraId ?? null) : null,
          destinoObraId: input.tipoDestino === 'central' ? 0 : input.destinoObraId,
          data: input.data,
          observacoes: input.observacoes || null,
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
        } as any);
      });

      return { success: true };
    }),

  listarTransferencias: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      epiId: z.number().optional(),
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const conds: any[] = [inArray(epiTransferencias.companyId, ids)];
      if (input.epiId) conds.push(eq(epiTransferencias.epiId, input.epiId));
      if (input.obraId) {
        conds.push(sql`(${epiTransferencias.origemObraId} = ${input.obraId} OR ${epiTransferencias.destinoObraId} = ${input.obraId})`);
      }
      const rows = await db.select({
        id: epiTransferencias.id,
        epiId: epiTransferencias.epiId,
        quantidade: epiTransferencias.quantidade,
        tipoOrigem: epiTransferencias.tipoOrigem,
        origemObraId: epiTransferencias.origemObraId,
        destinoObraId: epiTransferencias.destinoObraId,
        data: epiTransferencias.data,
        observacoes: epiTransferencias.observacoes,
        criadoPor: epiTransferencias.criadoPor,
        criadoPorUserId: epiTransferencias.criadoPorUserId,
        createdAt: epiTransferencias.createdAt,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        tamanhoEpi: epis.tamanho,
        categoriaEpi: epis.categoria,
      })
        .from(epiTransferencias)
        .leftJoin(epis, eq(epiTransferencias.epiId, epis.id))
        .where(and(...conds))
        .orderBy(desc(epiTransferencias.createdAt));

      // Enrich with obra names
      const obraIds = Array.from(new Set([
        ...rows.filter(r => r.origemObraId).map(r => r.origemObraId!),
        ...rows.map(r => r.destinoObraId),
      ]));
      let obraMap: Record<number, string> = {};
      if (obraIds.length > 0) {
        const obraList = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
          .where(sql`${obras.id} IN (${sql.join(obraIds.map(id => sql`${id}`), sql`,`)})`);
        obraList.forEach(o => { obraMap[o.id] = o.nome; });
      }
      return rows.map(r => ({
        ...r,
        origemNome: r.tipoOrigem === 'central' ? 'Almoxarifado Central' : (r.origemObraId ? obraMap[r.origemObraId] || 'Obra' : 'Obra'),
        destinoNome: obraMap[r.destinoObraId] || 'Obra',
      }));
    }),

  // Entrada de estoque (compra / recebimento no central)
  entradaEstoque: protectedProcedure
    .input(z.object({
      epiId: z.number(),
      quantidade: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 2950 — guard de tenant/IDOR (empresa derivada do PRÓPRIO EPI) + permissão de
      // CENTRAL: esta rota credita o Almoxarifado Central, então usuário RESTRITO é bloqueado.
      const epiCo = await db.select({ companyId: epis.companyId }).from(epis).where(eq(epis.id, input.epiId));
      if (!epiCo[0]) throw new TRPCError({ code: "NOT_FOUND", message: "EPI não encontrado." });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c) => c.id === epiCo[0].companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este EPI." });
      }
      await assertCentralWrite(ctx);
      await db.update(epis)
        .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${input.quantidade}` })
        .where(eq(epis.id, input.epiId));
      return { success: true };
    }),

  // Entrada direta de EPI no estoque da obra (TST local cadastra EPIs que já tem)
  entradaDiretaObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      obraId: z.number(),
      quantidade: z.number().min(1),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 2950 — guard de tenant (empresa do EPI) + permissão por OBRA (anti-IDOR).
      const [epiCo] = await db.select({ companyId: epis.companyId }).from(epis).where(eq(epis.id, input.epiId));
      if (!epiCo) throw new TRPCError({ code: "NOT_FOUND", message: "EPI não encontrado." });
      const allowedCos = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCos.some((c) => c.id === epiCo.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este EPI." });
      }
      await assertObraWrite(ctx, input.obraId);
      // Verificar se já existe registro de estoque para este EPI nesta obra
      const [existing] = await db.select().from(epiEstoqueObra)
        .where(and(eq(epiEstoqueObra.epiId, input.epiId), eq(epiEstoqueObra.obraId, input.obraId)));
      if (existing) {
        await db.update(epiEstoqueObra)
          .set({ quantidade: sql`${epiEstoqueObra.quantidade} + ${input.quantidade}` })
          .where(eq(epiEstoqueObra.id, existing.id));
      } else {
        await db.insert(epiEstoqueObra).values({
          companyId: input.companyId,
          epiId: input.epiId,
          obraId: input.obraId,
          quantidade: input.quantidade,
          criadoPor: ctx.user?.name || 'Sistema',
        });
      }
      // Registrar como transferência tipo "entrada_direta" para histórico
      const today = new Date().toISOString().split('T')[0];
      await db.insert(epiTransferencias).values({
        companyId: input.companyId,
        epiId: input.epiId,
        tipoOrigem: 'entrada_direta',
        origemObraId: null,
        destinoObraId: input.obraId,
        quantidade: input.quantidade,
        data: today,
        observacoes: input.observacao || 'Entrada direta - EPI já existente na obra',
        criadoPor: ctx.user?.name || 'Sistema',
        criadoPorUserId: ctx.user?.id || null,
      } as any);
      return { success: true };
    }),

  gerarSCEstoqueMinimo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      epiIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];

      const minimos = await db.select({
        epiId: epiEstoqueMinimo.epiId,
        quantidadeMinima: epiEstoqueMinimo.quantidadeMinima,
        obraId: epiEstoqueMinimo.obraId,
      }).from(epiEstoqueMinimo)
        .where(inArray(epiEstoqueMinimo.companyId, ids));

      const episData = await db.select({
        id: epis.id,
        nome: epis.nome,
        ca: epis.ca,
        categoria: epis.categoria,
        quantidadeEstoque: epis.quantidadeEstoque,
        companyId: epis.companyId,
        tamanho: epis.tamanho,
      }).from(epis).where(inArray(epis.companyId, ids));

      const episMap = new Map(episData.map(e => [e.id, e]));

      const itensSC: { descricao: string; unidade: string; quantidade: number; epiId: number }[] = [];

      for (const min of minimos) {
        if (min.obraId) continue;
        if (input.epiIds && input.epiIds.length > 0 && !input.epiIds.includes(min.epiId)) continue;
        const epi = episMap.get(min.epiId);
        if (!epi) continue;
        const estoqueAtual = epi.quantidadeEstoque || 0;
        if (estoqueAtual < min.quantidadeMinima) {
          const deficit = min.quantidadeMinima - estoqueAtual;
          itensSC.push({
            descricao: `${epi.nome}${epi.ca ? ` (CA ${epi.ca})` : ''}${epi.tamanho ? ` - Tam. ${epi.tamanho}` : ''}`,
            unidade: "un",
            quantidade: deficit,
            epiId: epi.id,
          });
        }
      }

      if (itensSC.length === 0) {
        return { ok: false, mensagem: "Nenhum item abaixo do estoque mínimo encontrado." };
      }

      // Rev. 1795 — advisory lock + MAX(seq)+1 + INSERTs SC e itens TODOS dentro
      // da mesma transaction (consistência: nunca SC sem itens em caso de falha).
      const sc = await db.transaction(async (tx: any) => {
        const numeroSc = await lockEGerarNumeroSc(tx, input.companyId);
        const [row] = await tx.insert(comprasSolicitacoes).values({
          companyId: input.companyId,
          numeroSc,
          departamento: "SST / Almoxarifado",
          titulo: `Reposição automática de EPIs — Estoque mínimo (${itensSC.length} ${itensSC.length === 1 ? 'item' : 'itens'})`,
          prioridade: "alta",
          tipo: "material",
          status: "pendente",
          aprovacaoStatus: "aguardando",
          observacoes: `SC gerada automaticamente pelo sistema de controle de estoque mínimo de EPIs em ${new Date().toLocaleDateString("pt-BR")}.`,
          criadoPorId: input.userId ?? null,
          criadoPorNome: input.userName ?? "Sistema",
        } as any).returning();
        await tx.insert(comprasSolicitacoesItens).values(
          itensSC.map(it => ({
            solicitacaoId: row.id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            statusItem: "pendente",
          }))
        );
        return row;
      });

      return {
        ok: true,
        scId: sc.id,
        numeroSc: sc.numeroSc,
        totalItens: itensSC.length,
        mensagem: `SC ${sc.numeroSc} criada com ${itensSC.length} ${itensSC.length === 1 ? 'item' : 'itens'} para reposição.`,
      };
    }),

  // ============================================================
  // Rev. 3888 — Catálogo gerenciado de motivos de entrega de EPI
  // Leitura: todos; Escrita: admin / admin_master apenas.
  // ZERO DELETE: desativar = ativo=0 (soft).
  // ============================================================
  listMotivos: protectedProcedure
    .query(async () => {
      const db = (await getDb())!;
      const rows = await db.execute(sql`SELECT id, nome, ativo, ordem FROM epi_motivos ORDER BY ordem, nome`);
      return (rows?.rows ?? rows ?? []) as { id: number; nome: string; ativo: number; ordem: number }[];
    }),

  createMotivo: protectedProcedure
    .input(z.object({ nome: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'admin_master'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem gerenciar os motivos de entrega.' });
      }
      const db = (await getDb())!;
      const exists = await db.execute(sql`SELECT id FROM epi_motivos WHERE LOWER(TRIM(nome)) = LOWER(TRIM(${input.nome})) LIMIT 1`);
      if ((exists?.rows ?? exists as any[] ?? []).length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Já existe um motivo com esse nome.' });
      }
      await db.execute(sql`INSERT INTO epi_motivos (nome, ordem) VALUES (${input.nome.trim()}, COALESCE((SELECT MAX(ordem) FROM epi_motivos), 0) + 1)`);
      return { ok: true };
    }),

  updateMotivo: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1).max(255).optional(), ativo: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'admin_master'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem gerenciar os motivos de entrega.' });
      }
      const db = (await getDb())!;
      if (input.nome !== undefined) {
        await db.execute(sql`UPDATE epi_motivos SET nome = ${input.nome.trim()} WHERE id = ${input.id}`);
      }
      if (input.ativo !== undefined) {
        await db.execute(sql`UPDATE epi_motivos SET ativo = ${input.ativo} WHERE id = ${input.id}`);
      }
      return { ok: true };
    }),

  // ============================================================
  // Rev. 4644 — FICHA DE EPI (documento por funcionário, NR-06 /
  // art. 158 + 166 CLT). Consolida TODAS as entregas do colaborador
  // com assinatura digital + metadados de autenticação (hash SHA-256,
  // IP, data/hora), p/ enviar a cliente ou Ministério do Trabalho.
  // ============================================================
  fichaEpiResumo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 4645 — guard anti-IDOR: INTERSECTA os companyIds do input com as
      // empresas acessíveis do usuário (memória group-expansion-idor)
      const allowed = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      const requested = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const ids = requested.filter(id => allowed.has(id));
      if (ids.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à(s) empresa(s) informada(s)." });
      // Rev. 4650 — fallback de foto: cadastro duplicado em empresa irmã do
      // grupo (mesmo CPF) pode ter a foto que o registro local não tem
      // (memórias: employee-cross-company-group-duplication + cpf mixed format)
      const rows = await db.execute(sql`
        SELECT e.id, e."nomeCompleto", e.funcao, e.cpf, e.status,
               COALESCE(NULLIF(e."fotoUrl", ''), f2."fotoUrl") AS "fotoUrl",
               ob."obraId" AS obra_id, ob.obra_nome,
               COUNT(d.id)::int AS total_entregas,
               COUNT(d.id) FILTER (WHERE d.assinatura_url IS NOT NULL)::int AS entregas_assinadas,
               MAX(d."dataEntrega")::text AS ultima_entrega
        FROM employees e
        LEFT JOIN epi_deliveries d
          ON d."employeeId" = e.id
         AND d."companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
         AND d."deletedAt" IS NULL
        LEFT JOIN LATERAL (
          SELECT e2."fotoUrl" FROM employees e2
          WHERE (e."fotoUrl" IS NULL OR e."fotoUrl" = '')
            AND e2.id <> e.id
            -- Rev. 4658 — tenant guard: fallback só em empresas ACESSÍVEIS ao user
            AND e2."companyId" IN (${sql.join(Array.from(allowed).map(id => sql`${id}`), sql`,`)})
            AND e2."fotoUrl" IS NOT NULL AND e2."fotoUrl" <> ''
            AND e2."deletedAt" IS NULL
            AND length(regexp_replace(COALESCE(e.cpf,''), '[^0-9]', '', 'g')) = 11
            AND regexp_replace(COALESCE(e2.cpf,''), '[^0-9]', '', 'g') = regexp_replace(e.cpf, '[^0-9]', '', 'g')
          ORDER BY e2.id DESC LIMIT 1
        ) f2 ON true
        LEFT JOIN LATERAL (
          -- Rev. 4651 — obra atual do funcionário (alocação ativa)
          SELECT of2."obraId", o.nome AS obra_nome
          FROM obra_funcionarios of2
          JOIN obras o ON o.id = of2."obraId"
          WHERE of2."employeeId" = e.id AND of2."isActive" = 1
          ORDER BY of2.id DESC LIMIT 1
        ) ob ON true
        WHERE e."companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          -- Rev. 4657 — base = TODO CLT não-desligado (mesmo sem nenhuma entrega:
          -- precisa aparecer como "Sem ficha" p/ providenciar) + qualquer um que
          -- já tenha entrega de EPI (PJ etc.)
          AND (
            (e."tipoContrato" = 'CLT'
              AND e.status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
              AND e."deletedAt" IS NULL)
            OR d.id IS NOT NULL
          )
        GROUP BY e.id, e."nomeCompleto", e.funcao, e.cpf, e."fotoUrl", f2."fotoUrl", e.status, ob."obraId", ob.obra_nome
        ORDER BY e."nomeCompleto" ASC
      `);
      return { funcionarios: ((rows as any)?.rows ?? rows ?? []) as any[] };
    }),

  fichaEpiFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 4645 — guard anti-IDOR: interseção com empresas acessíveis do user
      const allowed = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      const requested = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const ids = requested.filter(id => allowed.has(id));
      if (ids.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à(s) empresa(s) informada(s)." });

      // Entregas do funcionário DENTRO das empresas informadas (guard de tenant:
      // a própria cláusula companyId IN (...) impede vazamento cross-tenant)
      const entregas = await db.select({
        id: epiDeliveries.id,
        companyId: epiDeliveries.companyId,
        epiId: epiDeliveries.epiId, // Rev. 4663 — p/ editar/excluir da ficha
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        dataDevolucao: epiDeliveries.dataDevolucao,
        dataValidade: epiDeliveries.dataValidade,
        motivo: epiDeliveries.motivo,
        assinaturaUrl: epiDeliveries.assinaturaUrl,
        assinaturaResponsavelNome: epiDeliveries.assinaturaResponsavelNome,
        createdAt: epiDeliveries.createdAt,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        categoriaEpi: epis.categoria,
        tamanhoEpi: epis.tamanho,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .where(and(
          inArray(epiDeliveries.companyId, ids),
          eq(epiDeliveries.employeeId, input.employeeId),
          isNull(epiDeliveries.deletedAt),
        ))
        .orderBy(desc(epiDeliveries.dataEntrega), desc(epiDeliveries.id));

      if (entregas.length === 0) {
        // Sem entregas nas empresas acessadas — ainda valida o funcionário
        const [emp0] = await db.select({ id: employees.id, companyId: employees.companyId })
          .from(employees).where(eq(employees.id, input.employeeId));
        if (!emp0 || !ids.includes(emp0.companyId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
        }
      }

      const [emp] = await db.select({
        id: employees.id,
        companyId: employees.companyId,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        fotoUrl: employees.fotoUrl,
        codigoInterno: employees.codigoInterno,
        matricula: employees.matricula,
        dataAdmissao: employees.dataAdmissao,
        status: employees.status,
      }).from(employees).where(eq(employees.id, input.employeeId));

      // Rev. 4650 — fallback de foto: puxa do cadastro irmão (mesmo CPF em
      // empresa do grupo) quando o registro local não tem foto
      if (emp && !(emp.fotoUrl || "").trim() && (emp.cpf || "").replace(/\D/g, "").length === 11) {
        const fb = await db.execute(sql`
          SELECT e2."fotoUrl" FROM employees e2
          WHERE e2.id <> ${emp.id}
            -- Rev. 4658 — tenant guard: fallback só em empresas ACESSÍVEIS ao user
            AND e2."companyId" IN (${sql.join(Array.from(allowed).map(id => sql`${id}`), sql`,`)})
            AND e2."fotoUrl" IS NOT NULL AND e2."fotoUrl" <> ''
            AND e2."deletedAt" IS NULL
            AND regexp_replace(COALESCE(e2.cpf,''), '[^0-9]', '', 'g') = ${(emp.cpf || "").replace(/\D/g, "")}
          ORDER BY e2.id DESC LIMIT 1
        `);
        const fbRow = ((fb as any)?.rows ?? fb ?? [])[0];
        if (fbRow?.fotoUrl) (emp as any).fotoUrl = fbRow.fotoUrl;
      }

      // Empresa da FICHA = empresa das entregas (ou do funcionário)
      const fichaCompanyId = entregas[0]?.companyId ?? emp?.companyId ?? input.companyId;
      const [empresa] = await db.select({
        id: companies.id,
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
        logoUrl: companies.logoUrl,
        endereco: companies.endereco,
        cidade: companies.cidade,
        estado: companies.estado,
      }).from(companies).where(eq(companies.id, fichaCompanyId));

      // Metadados de autenticação das assinaturas (epi_assinaturas)
      const deliveryIds = entregas.map(e => e.id);
      let assinMap = new Map<number, any>();
      if (deliveryIds.length > 0) {
        const assins = await db.select({
          deliveryId: epiAssinaturas.deliveryId,
          tipo: epiAssinaturas.tipo,
          assinadoEm: epiAssinaturas.assinadoEm,
          ipAddress: epiAssinaturas.ipAddress,
          hashSha256: epiAssinaturas.hashSha256,
          entregadorNome: epiAssinaturas.entregadorNome,
        })
          .from(epiAssinaturas)
          .where(and(
            inArray(epiAssinaturas.deliveryId, deliveryIds),
            eq(epiAssinaturas.employeeId, input.employeeId),
          ));
        for (const a of assins) {
          if (a.deliveryId != null && !assinMap.has(a.deliveryId)) assinMap.set(a.deliveryId, a);
        }
      }

      // Rev. 4654 — assinaturas antigas (antes da persistência em uploaded_files)
      // podem ter o ARQUIVO perdido; sinaliza p/ o front mostrar o registro de
      // autenticação em vez de imagem quebrada ("?" azul no Safari/iPad)
      const sigKeys = entregas
        .map(e => (e.assinaturaUrl || "").match(/^\/uploads\/([^?]+)/)?.[1])
        .filter(Boolean) as string[];
      const okKeys = new Set<string>();
      if (sigKeys.length > 0) {
        const found = await db.execute(sql`
          SELECT file_key FROM uploaded_files WHERE file_key IN (${sql.join(sigKeys.map(k => sql`${k}`), sql`,`)})
        `);
        for (const r of ((found as any)?.rows ?? found ?? [])) okKeys.add(r.file_key);
      }
      const arquivoOk = (u?: string | null) => {
        const m = (u || "").match(/^\/uploads\/([^?]+)/);
        if (!m) return !!u; // data:/http externo → considera ok
        return okKeys.has(m[1]);
      };

      return {
        empresa: empresa || null,
        funcionario: emp ? {
          id: emp.id,
          nomeCompleto: emp.nomeCompleto,
          cpf: emp.cpf,
          funcao: emp.funcao,
          fotoUrl: emp.fotoUrl,
          numeroInterno: emp.codigoInterno || emp.matricula || null,
          dataAdmissao: emp.dataAdmissao,
          status: emp.status,
        } : null,
        entregas: entregas.map(e => ({
          ...e,
          autenticacao: assinMap.get(e.id) || null,
          assinaturaArquivoOk: arquivoOk(e.assinaturaUrl),
        })),
      };
    }),
});
