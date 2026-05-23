import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getEffectiveAllowedObraIds, userCanAccessObra } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { buscarFotoParaItem } from "../_core/autoFoto";
import {
  almoxarifadoItens,
  almoxarifadoMovimentacoes,
  almoxarifadoDescontoFolha,
  almoxarifadoSaidasInsumo,
  almoxarifadoTransferencias,
  almoxarifadoRecebimentos,
  almoxarifadoRecebimentoItens,
  almoxarifadoNotificacoes,
  warehouseLoans,
  warehouseInventorySessions,
  warehouseInventorySessionItems,
  comprasOrdens,
  comprasOrdensItens,
  employees,
  warnings,
  obras,
} from "../../drizzle/schema";

const isAdmin = (ctx: any) =>
  ctx.user.role === "admin" || ctx.user.role === "admin_master";

function getSemanaRef() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export const warehouseRouter = router({

  // ── DASHBOARD ─────────────────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const itens = await db
        .select()
        .from(almoxarifadoItens)
        .where(
          and(
            eq(almoxarifadoItens.companyId, input.companyId),
            eq(almoxarifadoItens.ativo, true)
          )
        );

      const criticos = itens.filter((i) => {
        const atual = parseFloat(String(i.quantidadeAtual) || "0");
        const minimo = parseFloat(String(i.quantidadeMinima) || "0");
        return minimo > 0 && atual <= minimo;
      });

      const valorTotal = itens.reduce(
        (s, i) =>
          s +
          parseFloat(String(i.quantidadeAtual) || "0") *
            parseFloat(String((i as any).valorUnitario) || "0"),
        0
      );

      const hoje = new Date().toISOString().split("T")[0];
      const emprestimosHoje = await db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.dataEmprestimo, hoje)
          )
        );

      const pendentes = emprestimosHoje.filter(
        (e) => e.status === "emprestado" || e.status === "pendente"
      );

      return {
        totalItens: itens.length,
        itensCriticos: criticos.length,
        valorTotalEstoque: valorTotal,
        emprestimosHoje: emprestimosHoje.length,
        pendentesDevolucao: pendentes.length,
        itensCriticosList: criticos.slice(0, 5).map((i) => ({
          id: i.id,
          nome: i.nome,
          quantidadeAtual: parseFloat(String(i.quantidadeAtual) || "0"),
          quantidadeMinima: parseFloat(String(i.quantidadeMinima) || "0"),
        })),
      };
    }),

  // ── ENTRADA DE MATERIAL ────────────────────────────────────────
  registerEntry: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        quantidade: z.number().positive(),
        motivo: z.string().optional(),
        notaFiscal: z.string().optional(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const antes = parseFloat(String(item.quantidadeAtual) || "0");
      const depois = antes + input.quantidade;

      await db
        .update(almoxarifadoItens)
        .set({ quantidadeAtual: String(depois) } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "entrada",
        quantidade: String(input.quantidade),
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        motivo: input.motivo || (input.notaFiscal ? `NF: ${input.notaFiscal}` : null),
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, quantidadeAtual: depois };
    }),

  // ── SAÍDA DE MATERIAL ──────────────────────────────────────────
  registerExit: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        quantidade: z.number().positive(),
        obraId: z.number().optional(),
        obraNome: z.string().optional(),
        motivo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const antes = parseFloat(String(item.quantidadeAtual) || "0");
      if (antes < input.quantidade)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente" });

      const depois = antes - input.quantidade;

      await db
        .update(almoxarifadoItens)
        .set({ quantidadeAtual: String(depois) } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "saida",
        quantidade: String(input.quantidade),
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        motivo: input.motivo || null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, quantidadeAtual: depois };
    }),

  // ── HISTÓRICO DE MOVIMENTAÇÕES ─────────────────────────────────
  listMovements: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number().optional(),
        tipo: z.string().optional(),
        limit: z.number().default(100),
        data: z.string().optional(), // YYYY-MM-DD
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(almoxarifadoMovimentacoes.companyId, input.companyId),
      ];
      if (input.itemId) conditions.push(eq(almoxarifadoMovimentacoes.itemId, input.itemId));
      if (input.tipo) conditions.push(eq(almoxarifadoMovimentacoes.tipo, input.tipo));
      if (input.data) conditions.push(sql`DATE(${almoxarifadoMovimentacoes.criadoEm}) = ${input.data}::date`);

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(almoxarifadoMovimentacoes.obraId, allowed));
      }

      const movs = await db
        .select({
          id: almoxarifadoMovimentacoes.id,
          tipo: almoxarifadoMovimentacoes.tipo,
          quantidade: almoxarifadoMovimentacoes.quantidade,
          obraId: almoxarifadoMovimentacoes.obraId,
          obraNome: almoxarifadoMovimentacoes.obraNome,
          motivo: almoxarifadoMovimentacoes.motivo,
          usuarioNome: almoxarifadoMovimentacoes.usuarioNome,
          observacoes: almoxarifadoMovimentacoes.observacoes,
          criadoEm: almoxarifadoMovimentacoes.criadoEm,
          itemId: almoxarifadoMovimentacoes.itemId,
          itemNome: almoxarifadoItens.nome,
          unidade: almoxarifadoItens.unidade,
        })
        .from(almoxarifadoMovimentacoes)
        .leftJoin(almoxarifadoItens, eq(almoxarifadoMovimentacoes.itemId, almoxarifadoItens.id))
        .where(and(...conditions))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limit);

      return movs;
    }),

  // ── EMPRÉSTIMO (COMODATO DIÁRIO) ───────────────────────────────
  registerLoan: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        itemId: z.number(),
        obraId: z.number().optional(),
        quantidade: z.number().positive().default(1),
        funcionarioCodigo: z.string().optional(),
        terceiroNome: z.string().optional(),
        terceiroEmpresa: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let funcionarioId: number | null = null;
      let funcionarioNome: string;
      let funcionarioCodigo: string | null = null;

      if (input.terceiroNome) {
        funcionarioNome = input.terceiroNome;
      } else {
        if (!input.funcionarioCodigo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o funcionário ou o nome do terceiro" });
        }
        const [funcionario] = await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.companyId, input.companyId),
              eq(employees.codigoInterno, input.funcionarioCodigo)
            )
          )
          .limit(1);

        if (!funcionario)
          throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado pelo código" });

        funcionarioId = funcionario.id;
        funcionarioNome = funcionario.nomeCompleto;
        funcionarioCodigo = input.funcionarioCodigo;
      }

      const [item] = await db
        .select()
        .from(almoxarifadoItens)
        .where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      const atual = parseFloat(String(item.quantidadeAtual) || "0");
      if (atual < input.quantidade)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente para empréstimo" });

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      const observacoes = input.terceiroEmpresa
        ? `Empresa: ${input.terceiroEmpresa}`
        : null;

      await db.insert(warehouseLoans).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        itemId: input.itemId,
        itemNome: item.nome,
        quantidade: String(input.quantidade),
        funcionarioId,
        funcionarioCodigo,
        funcionarioNome,
        dataEmprestimo: hoje,
        horaEmprestimo: hora,
        almoxarifeId: ctx.user.id,
        almoxarifeNome: ctx.user.name || "",
        status: "emprestado",
        observacoes,
      } as any);

      await db
        .update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`GREATEST(${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}, 0)`,
        } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      await db.insert(almoxarifadoMovimentacoes).values({
        companyId: input.companyId,
        itemId: input.itemId,
        tipo: "saida",
        quantidade: String(input.quantidade),
        motivo: input.terceiroNome
          ? `Empréstimo para ${input.terceiroNome}${input.terceiroEmpresa ? ` (${input.terceiroEmpresa})` : ""}`
          : `Empréstimo para ${funcionarioNome}`,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, funcionarioNome };
    }),

  // Listar empréstimos do dia
  listTodayLoans: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const hoje = new Date().toISOString().split("T")[0];
      return db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.dataEmprestimo, hoje)
          )
        )
        .orderBy(desc(warehouseLoans.createdAt));
    }),

  // Listar todos empréstimos em aberto
  listOpenLoans: protectedProcedure
    .input(z.object({ companyId: z.number(), data: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [eq(warehouseLoans.companyId, input.companyId)];
      if (input.data) {
        // filtrar por dia: mostra todos (emprestado + devolvido) do dia
        conditions.push(eq(warehouseLoans.dataEmprestimo, input.data));
      } else {
        // sem filtro de data: mostra só os abertos
        conditions.push(eq(warehouseLoans.status, "emprestado"));
      }
      // Filtro centralizado por obras permitidas. Empréstimos sem obra só para admin.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(warehouseLoans.obraId, allowed));
      }

      return db
        .select()
        .from(warehouseLoans)
        .where(and(...conditions))
        .orderBy(desc(warehouseLoans.createdAt));
    }),

  // Devolver item
  returnLoanById: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
      if (loan && !(await userCanAccessObra(ctx.user.id, ctx.user.role, loan.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este empréstimo" });
      }
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado" });

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      await db
        .update(warehouseLoans)
        .set({ status: "devolvido", dataDevolucao: hoje, horaDevolucao: hora } as any)
        .where(eq(warehouseLoans.id, input.loanId));

      await db
        .update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${loan.quantidade}::numeric`,
        } as any)
        .where(eq(almoxarifadoItens.id, loan.itemId));

      return { success: true };
    }),

  // Marcar como perdido
  markLoanLost: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, loan.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este empréstimo" });
      }

      await db
        .update(warehouseLoans)
        .set({ status: "perdido" } as any)
        .where(eq(warehouseLoans.id, input.loanId));

      if (loan.funcionarioId) {
        await db.insert(warnings).values({
          companyId: loan.companyId,
          employeeId: loan.funcionarioId,
          tipoAdvertencia: "Advertencia",
          motivo: `Ferramenta não devolvida: ${loan.itemNome} — emprestada em ${loan.dataEmprestimo}`,
          dataOcorrencia: new Date().toISOString().split("T")[0],
          aplicadoPor: ctx.user.name || "Sistema",
          sequencia: 1,
        } as any);
      }

      return { success: true };
    }),

  // ── BUSCAR FUNCIONÁRIO PELO CÓDIGO OU NOME ─────────────────────
  getFuncionarioByCodigo: protectedProcedure
    .input(z.object({ companyId: z.number(), codigo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { ilike, or, isNull } = await import("drizzle-orm");
      const busca = input.codigo.trim();
      if (!busca) return null;

      // Tenta código exato primeiro
      const [byCode] = await db
        .select({
          id: employees.id,
          nomeCompleto: employees.nomeCompleto,
          codigoInterno: employees.codigoInterno,
          cargo: (employees as any).cargo,
          funcao: (employees as any).funcao,
          fotoUrl: (employees as any).fotoUrl,
        })
        .from(employees)
        .where(and(eq(employees.companyId, input.companyId), eq(employees.codigoInterno, busca), isNull(employees.deletedAt)))
        .limit(1);

      if (byCode) return byCode;

      // Fallback: busca parcial por nome (retorna primeiro resultado)
      const [byName] = await db
        .select({
          id: employees.id,
          nomeCompleto: employees.nomeCompleto,
          codigoInterno: employees.codigoInterno,
          cargo: (employees as any).cargo,
          funcao: (employees as any).funcao,
          fotoUrl: (employees as any).fotoUrl,
        })
        .from(employees)
        .where(and(eq(employees.companyId, input.companyId), ilike(employees.nomeCompleto, `%${busca}%`), isNull(employees.deletedAt)))
        .limit(1);

      return byName || null;
    }),

  // ── BUSCAR FUNCIONÁRIOS (SUGESTÕES) ────────────────────────────
  searchFuncionarios: protectedProcedure
    .input(z.object({ companyId: z.number(), q: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { sql: drizzleSql } = await import("drizzle-orm");
      const q = input.q.trim();
      if (q.length < 2) return [];
      const pattern = `%${q}%`;
      const startPattern = `${q}%`;
      const rows = await db.execute(drizzleSql`
        SELECT id,
               "nomeCompleto",
               "codigoInterno",
               cargo,
               funcao,
               "fotoUrl"
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "deletedAt" IS NULL
          AND status != 'Demitido'
          AND (
            unaccent(lower("nomeCompleto")) LIKE unaccent(lower(${pattern}))
            OR lower(COALESCE("codigoInterno", '')) LIKE lower(${pattern})
            OR lower(COALESCE(matricula, '')) LIKE lower(${startPattern})
            OR unaccent(lower(COALESCE(cargo, ''))) LIKE unaccent(lower(${pattern}))
            OR unaccent(lower(COALESCE(funcao, ''))) LIKE unaccent(lower(${pattern}))
          )
        ORDER BY "nomeCompleto"
        LIMIT 8
      `);
      return (rows?.rows ?? rows ?? []) as any[];
    }),

  // ── SUGERIR CADASTRO DE ITEM POR FOTO (IA) ────────────────────
  sugerirCadastroItem: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      mimeType: z.string().default("image/jpeg"),
      categorias: z.array(z.string()).optional(),
      unidades: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const { invokeAnthropicVision } = await import("../_core/llm");

        const catList = (input.categorias ?? []).join(", ") || "Ferramentas, Materiais de construção, EPIs, Elétrico, Hidráulico, Outros";
        const unidList = (input.unidades ?? []).join(", ") || "un, kg, m, m², L, cx, sc, rolo, barra, pç";

        console.log("[sugerirCadastroItem] Iniciando. base64 length:", input.base64.length, "mimeType:", input.mimeType);

        const prompt = `Analise esta imagem de um produto de construção civil ou ferramenta industrial. Sugira os dados de cadastro para um sistema de almoxarifado.

Categorias disponíveis: ${catList}
Unidades disponíveis: ${unidList}

Responda SOMENTE com JSON válido (sem markdown, sem explicações):
{"nome":"nome técnico do produto","categoria":"categoria das disponíveis","unidade":"unidade das disponíveis","observacoes":"especificações breves ou vazio"}`;

        const text = await invokeAnthropicVision({
          prompt,
          base64: input.base64,
          mimeType: input.mimeType,
          maxTokens: 1024,
        });

        console.log("[sugerirCadastroItem] Resposta:", text.slice(0, 300));

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, "").trim();
        if (!clean) {
          console.warn("[sugerirCadastroItem] Resposta vazia da IA.");
          return { nome: "", categoria: "", unidade: "un", observacoes: "" };
        }
        const parsed = JSON.parse(clean);
        return {
          nome: String(parsed.nome ?? "").slice(0, 120),
          categoria: String(parsed.categoria ?? "").slice(0, 60),
          unidade: String(parsed.unidade ?? "un"),
          observacoes: String(parsed.observacoes ?? "").slice(0, 100),
        };
      } catch (err: any) {
        console.error("[sugerirCadastroItem] Erro:", err?.message ?? err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err?.message ?? "Erro ao analisar imagem") });
      }
    }),

  // ── IDENTIFICAR ITEM POR FOTO (IA) ────────────────────────────
  identificarPorFoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      base64: z.string(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { invokeLLM: invoke } = await import("../_core/llm");

      // Busca catálogo de itens da empresa/obra
      const { isNull } = await import("drizzle-orm");
      const conditions: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];
      if (input.obraId) {
        conditions.push(eq(almoxarifadoItens.obraId, input.obraId));
      } else {
        conditions.push(isNull(almoxarifadoItens.obraId));
      }
      const catalogo = await db
        .select({
          id: almoxarifadoItens.id,
          nome: almoxarifadoItens.nome,
          categoria: almoxarifadoItens.categoria,
          codigoInterno: almoxarifadoItens.codigoInterno,
          unidade: almoxarifadoItens.unidade,
        })
        .from(almoxarifadoItens)
        .where(and(...conditions))
        .limit(300);

      if (catalogo.length === 0) {
        return { matches: [], descricao: "Nenhum item no catálogo." };
      }

      const catalogoStr = catalogo
        .map(i => `ID:${i.id} | ${i.nome}${i.codigoInterno ? ` (${i.codigoInterno})` : ""} | ${i.categoria ?? "Sem categoria"} | ${i.unidade}`)
        .join("\n");

      const dataUrl = `data:${input.mimeType};base64,${input.base64}`;

      const result = await invoke({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
              {
                type: "text",
                text: `Você é um especialista em materiais de construção civil e ferramentas. Analise a imagem e identifique o produto/ferramenta mostrado.

Catálogo disponível (formato ID | Nome | Categoria | Unidade):
${catalogoStr}

Responda SOMENTE em JSON, sem markdown, no formato:
{
  "descricao": "descrição breve do que você vê na foto em português",
  "matches": [
    { "id": <número do ID>, "nome": "<nome do item>", "similaridade": <0 a 100>, "motivo": "<por que corresponde>" }
  ]
}

Retorne os até 5 melhores matches em ordem decrescente de similaridade. Se nenhum item do catálogo for compatível, retorne matches vazio. Use apenas IDs que existam no catálogo acima.`,
              },
            ],
          },
        ],
        maxTokens: 512,
      });

      const text = typeof result.choices[0].message.content === "string"
        ? result.choices[0].message.content
        : "";

      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        const validMatches = (parsed.matches ?? [])
          .filter((m: any) => catalogo.some(c => c.id === m.id))
          .slice(0, 5);
        return { descricao: parsed.descricao ?? "", matches: validMatches };
      } catch {
        return { descricao: text.slice(0, 200), matches: [] };
      }
    }),

  // ── INVENTÁRIO SEMANAL ─────────────────────────────────────────
  getInventorySession: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().nullable().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const semanaRef = getSemanaRef();

      const obraFilter = input.obraId === null
        ? sql`${warehouseInventorySessions.obraId} IS NULL`
        : input.obraId !== undefined
          ? eq(warehouseInventorySessions.obraId, input.obraId)
          : sql`${warehouseInventorySessions.obraId} IS NULL`;

      const [session] = await db
        .select()
        .from(warehouseInventorySessions)
        .where(
          and(
            eq(warehouseInventorySessions.companyId, input.companyId),
            eq(warehouseInventorySessions.semanaRef, semanaRef),
            obraFilter,
          )
        )
        .limit(1);

      return session || null;
    }),

  startInventorySession: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const semanaRef = getSemanaRef();
      const obraId = input.obraId ?? null;

      const itemConditions: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];
      if (obraId === null) {
        itemConditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
      } else {
        itemConditions.push(eq(almoxarifadoItens.obraId, obraId));
      }

      const itens = await db
        .select()
        .from(almoxarifadoItens)
        .where(and(...itemConditions));

      const [result] = await db
        .insert(warehouseInventorySessions)
        .values({
          companyId: input.companyId,
          obraId,
          semanaRef,
          status: "em_andamento",
          totalItens: itens.length,
          iniciadoEm: new Date().toISOString(),
          almoxarifeId: ctx.user.id,
          almoxarifeNome: ctx.user.name || "",
        } as any)
        .returning({ id: warehouseInventorySessions.id });

      const sessionId = result.id;

      for (const item of itens) {
        await db.insert(warehouseInventorySessionItems).values({
          sessionId,
          itemId: item.id,
          itemNome: item.nome,
          quantidadeSistema: item.quantidadeAtual ?? "0",
          status: "pendente",
        } as any);
      }

      return { sessionId };
    }),

  getInventorySessionItems: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId))
        .orderBy(warehouseInventorySessionItems.id);
    }),

  confirmInventoryItem: protectedProcedure
    .input(
      z.object({
        sessionItemId: z.number(),
        quantidadeFisica: z.number(),
        observacoes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sessionItem] = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.id, input.sessionItemId));
      if (!sessionItem) throw new TRPCError({ code: "NOT_FOUND" });

      const sistemaQtd = parseFloat(String(sessionItem.quantidadeSistema) || "0");
      const diferenca = input.quantidadeFisica - sistemaQtd;
      const status = Math.abs(diferenca) < 0.001 ? "conferido" : "divergente";

      await db
        .update(warehouseInventorySessionItems)
        .set({
          quantidadeFisica: String(input.quantidadeFisica),
          diferenca: String(diferenca),
          status,
          conferidoEm: new Date().toISOString(),
          observacoes: input.observacoes || null,
        } as any)
        .where(eq(warehouseInventorySessionItems.id, input.sessionItemId));

      // Atualizar contadores da sessão
      const sessionItems = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, sessionItem.sessionId));

      const conferidos = sessionItems.filter((i) => i.status !== "pendente").length;
      const divergentes = sessionItems.filter((i) => i.status === "divergente").length;
      const allDone = conferidos === sessionItems.length;

      await db
        .update(warehouseInventorySessions)
        .set({
          itensConferidos: conferidos,
          itensDivergentes: divergentes,
          status: allDone ? "concluido" : "em_andamento",
          concluidoEm: allDone ? new Date().toISOString() : null,
        } as any)
        .where(eq(warehouseInventorySessions.id, sessionItem.sessionId));

      return { status, diferenca };
    }),

  finishInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(warehouseInventorySessions)
        .set({ status: "concluido", concluidoEm: new Date().toISOString() } as any)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true };
    }),

  cancelInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId));

      await db
        .delete(warehouseInventorySessions)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true };
    }),

  // ── DESCONTO EM FOLHA — ITEM PERDIDO ─────────────────────────────

  criarDescontoFolha: protectedProcedure
    .input(z.object({
      companyId:     z.number(),
      employeeId:    z.number(),
      employeeNome:  z.string(),
      loanId:        z.number().optional(),
      itemNome:      z.string(),
      quantidade:    z.number().optional().default(1),
      valorDesconto: z.number(),
      descricao:     z.string().optional(),
      mesDesconto:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(almoxarifadoDescontoFolha).values({
        companyId:     input.companyId,
        employeeId:    input.employeeId,
        employeeNome:  input.employeeNome,
        loanId:        input.loanId ?? null,
        itemNome:      input.itemNome,
        quantidade:    String(input.quantidade ?? 1),
        valorDesconto: String(input.valorDesconto),
        descricao:     input.descricao ?? null,
        mesDesconto:   input.mesDesconto ?? null,
        status:        "pendente",
        criadoPor:     ctx.user.name || "Sistema",
      } as any);

      if (input.loanId) {
        await db
          .update(warehouseLoans)
          .set({ status: "perdido" } as any)
          .where(eq(warehouseLoans.id, input.loanId));
      }

      return { success: true };
    }),

  listarDescontosFolha: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      status:     z.string().optional(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conds: any[] = [eq(almoxarifadoDescontoFolha.companyId, input.companyId)];
      if (input.status)     conds.push(eq(almoxarifadoDescontoFolha.status, input.status));
      if (input.employeeId) conds.push(eq(almoxarifadoDescontoFolha.employeeId, input.employeeId));

      const rows = await db
        .select()
        .from(almoxarifadoDescontoFolha)
        .where(and(...conds))
        .orderBy(desc(almoxarifadoDescontoFolha.criadoEm));

      return rows;
    }),

  aprovarDescontoFolha: protectedProcedure
    .input(z.object({ id: z.number(), mesDesconto: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(almoxarifadoDescontoFolha)
        .set({
          status:      "aprovado",
          aprovadoPor: ctx.user.name || "RH",
          aprovadoEm:  new Date().toISOString(),
          mesDesconto: input.mesDesconto ?? null,
        } as any)
        .where(eq(almoxarifadoDescontoFolha.id, input.id));

      return { success: true };
    }),

  reprovarDescontoFolha: protectedProcedure
    .input(z.object({ id: z.number(), motivoReprovacao: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(almoxarifadoDescontoFolha)
        .set({
          status:           "reprovado",
          aprovadoPor:      ctx.user.name || "RH",
          aprovadoEm:       new Date().toISOString(),
          motivoReprovacao: input.motivoReprovacao ?? null,
        } as any)
        .where(eq(almoxarifadoDescontoFolha.id, input.id));

      return { success: true };
    }),

  // ══════════════════════════════════════════════════════
  // SAÍDAS DE INSUMOS / CONSUMÍVEIS PARA FUNCIONÁRIOS
  // ══════════════════════════════════════════════════════

  registerInsumo: protectedProcedure
    .input(z.object({
      companyId:         z.number(),
      itemId:            z.number(),
      quantidade:        z.number().positive(),
      funcionarioCodigo: z.string(),
      obraId:            z.number().optional(),
      obraNome:          z.string().optional(),
      motivo:            z.string().optional(),
      observacoes:       z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca funcionário pelo código
      const [funcionario] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, input.companyId), eq(employees.codigoInterno, input.funcionarioCodigo)))
        .limit(1);
      if (!funcionario) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado pelo código" });

      // Busca item
      const [item] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      // Verifica estoque
      const atual = parseFloat(String(item.quantidadeAtual) || "0");
      if (atual < input.quantidade) throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente. Disponível: ${atual} ${item.unidade || "un"}` });

      // Registra saída de insumo
      await db.insert(almoxarifadoSaidasInsumo).values({
        companyId:         input.companyId,
        itemId:            input.itemId,
        itemNome:          item.nome,
        unidade:           item.unidade || "un",
        quantidade:        String(input.quantidade),
        funcionarioId:     funcionario.id,
        funcionarioNome:   funcionario.nomeCompleto,
        funcionarioCodigo: input.funcionarioCodigo,
        obraId:            input.obraId || null,
        obraNome:          input.obraNome || null,
        motivo:            input.motivo || null,
        observacoes:       input.observacoes || null,
        almoxarifeId:      ctx.user.id,
        almoxarifeNome:    ctx.user.name || "",
      } as any);

      // Deduz do estoque
      await db.update(almoxarifadoItens)
        .set({ quantidadeAtual: sql`GREATEST(${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}, 0)` } as any)
        .where(eq(almoxarifadoItens.id, input.itemId));

      // Registra movimentação
      await db.insert(almoxarifadoMovimentacoes).values({
        companyId:    input.companyId,
        itemId:       input.itemId,
        tipo:         "saida",
        quantidade:   String(input.quantidade),
        motivo:       `Insumo para ${funcionario.nomeCompleto}${input.motivo ? ` — ${input.motivo}` : ""}`,
        obraId:       input.obraId || null,
        obraNome:     input.obraNome || null,
        usuarioNome:  ctx.user.name || "Sistema",
      } as any);

      return { funcionarioNome: funcionario.nomeCompleto, itemNome: item.nome };
    }),

  listInsumos: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      limit:          z.number().default(200),
      funcionarioId:  z.number().optional(),
      obraId:         z.number().optional(),
      data:           z.string().optional(), // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.execute(
        sql`SELECT * FROM almoxarifado_saidas_insumo
            WHERE company_id = ${input.companyId}
            ${input.funcionarioId ? sql`AND funcionario_id = ${input.funcionarioId}` : sql``}
            ${input.obraId ? sql`AND obra_id = ${input.obraId}` : sql``}
            ${input.data ? sql`AND DATE(created_at) = ${input.data}::date` : sql``}
            ORDER BY created_at DESC
            LIMIT ${input.limit}`
      );
      return (rows as any)?.rows ?? rows ?? [];
    }),

  listInsumosHoje: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const hoje = new Date().toISOString().split("T")[0];
      const rows = await db.execute(
        sql`SELECT * FROM almoxarifado_saidas_insumo
            WHERE company_id = ${input.companyId}
            AND DATE(created_at) = ${hoje}::date
            ORDER BY created_at DESC`
      );
      return (rows as any)?.rows ?? rows ?? [];
    }),

  // ── CRIAR TRANSFERÊNCIA ENTRE ALMOXARIFADOS ─────────────────
  createTransferencia: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      itemIdOrigem:   z.number(),
      quantidade:     z.number().positive(),
      origemTipo:     z.enum(["central", "obra"]),
      origemObraId:   z.number().optional(),
      origemObraNome: z.string().optional(),
      destinoTipo:    z.enum(["central", "obra"]),
      destinoObraId:  z.number().optional(),
      destinoObraNome: z.string().optional(),
      motivo:         z.string().optional(),
      almoxarifeId:   z.number().optional(),
      almoxarifeNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Busca item de origem
      const [itemOrigem] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.itemIdOrigem));
      if (!itemOrigem) throw new TRPCError({ code: "NOT_FOUND", message: "Item de origem não encontrado." });

      const estoqueAtual = parseFloat(String(itemOrigem.quantidadeAtual) || "0");
      if (estoqueAtual < input.quantidade) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente. Disponível: ${estoqueAtual} ${itemOrigem.unidade}.` });
      }

      // 2. Débita da origem
      await db.update(almoxarifadoItens)
        .set({ quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}` } as any)
        .where(eq(almoxarifadoItens.id, input.itemIdOrigem));

      // 3. Localiza ou cria item no destino
      const destinoObraId = input.destinoTipo === "obra" ? (input.destinoObraId ?? null) : null;
      const destinoConditions = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.nome, itemOrigem.nome),
      ];
      if (destinoObraId !== null) {
        destinoConditions.push(eq(almoxarifadoItens.obraId, destinoObraId));
      } else {
        destinoConditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
      }

      const existingDestino = await db.select().from(almoxarifadoItens).where(and(...destinoConditions));
      let itemIdDestino: number;

      if (existingDestino.length > 0) {
        itemIdDestino = existingDestino[0].id;
        await db.update(almoxarifadoItens)
          .set({ quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${input.quantidade}` } as any)
          .where(eq(almoxarifadoItens.id, itemIdDestino));
      } else {
        // Cria novo item no destino com as mesmas propriedades
        const [novoItem] = await db.insert(almoxarifadoItens).values({
          companyId: input.companyId,
          obraId: destinoObraId,
          nome: itemOrigem.nome,
          unidade: itemOrigem.unidade,
          categoria: itemOrigem.categoria,
          codigoInterno: itemOrigem.codigoInterno,
          quantidadeAtual: String(input.quantidade),
          quantidadeMinima: "0",
          fotoUrl: (itemOrigem as any).fotoUrl,
          ativo: true,
          criadoPorId: ctx.user?.id ?? null,
          criadoPorNome: ctx.user?.name || `Transferência de ${input.origemTipo}`,
        } as any).returning({ id: almoxarifadoItens.id });
        itemIdDestino = novoItem.id;
      }

      // 4. Registra a transferência
      await db.insert(almoxarifadoTransferencias).values({
        companyId:      input.companyId,
        itemIdOrigem:   input.itemIdOrigem,
        itemIdDestino,
        itemNome:       itemOrigem.nome,
        unidade:        itemOrigem.unidade,
        quantidade:     String(input.quantidade),
        origemTipo:     input.origemTipo,
        origemObraId:   input.origemObraId ?? null,
        origemObraNome: input.origemObraNome ?? null,
        destinoTipo:    input.destinoTipo,
        destinoObraId:  destinoObraId,
        destinoObraNome: input.destinoObraNome ?? null,
        motivo:         input.motivo ?? null,
        almoxarifeId:   input.almoxarifeId ?? null,
        almoxarifeNome: input.almoxarifeNome ?? null,
      } as any);

      return { success: true, itemNome: itemOrigem.nome, novoEstoque: estoqueAtual - input.quantidade };
    }),

  // ── LISTAR TRANSFERÊNCIAS ───────────────────────────────────
  listTransferencias: protectedProcedure
    .input(z.object({ companyId: z.number(), limit: z.number().optional(), data: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(
        sql`SELECT * FROM almoxarifado_transferencias
            WHERE company_id = ${input.companyId}
            ${input.data ? sql`AND DATE(created_at) = ${input.data}::date` : sql``}
            ORDER BY created_at DESC
            LIMIT ${input.limit ?? 200}`
      );
      return (rows as any)?.rows ?? rows ?? [];
    }),

  // ── BUSCAR FOTO IA (individual) ──────────────────────────────
  buscarFotoItemIA: protectedProcedure
    .input(z.object({ itemId: z.number(), nomeItem: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, url: null };
      const url = await buscarFotoParaItem(input.nomeItem);
      if (url) {
        await db.execute(sql`UPDATE almoxarifado_itens SET foto_url = ${url} WHERE id = ${input.itemId}`);
      }
      return { success: !!url, url };
    }),

  // ── AUTO-FOTO BULK (todos sem foto) ─────────────────────────
  autoFotoBulkAlmox: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, atualizados: 0, semResultado: [] };
      const semFoto = await db.execute(sql`
        SELECT id, nome, categoria FROM almoxarifado_itens
        WHERE company_id = ${input.companyId}
          AND (foto_url IS NULL OR foto_url = '')
          AND lower(coalesce(nome,'')) NOT LIKE '%uniforme%'
          AND lower(coalesce(categoria,'')) NOT LIKE '%uniforme%'
        ORDER BY nome
      `);
      const itens = ((semFoto as any)?.rows ?? semFoto ?? []) as { id: number; nome: string; categoria: string }[];
      let atualizados = 0;
      const erros: string[] = [];
      for (const item of itens) {
        try {
          const url = await buscarFotoParaItem(item.nome);
          if (url) {
            await db.execute(sql`UPDATE almoxarifado_itens SET foto_url = ${url} WHERE id = ${item.id}`);
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

  // ════════════════════════════════════════════════════════════════
  // RECEBIMENTO INTELIGENTE — Rev. 814
  // ════════════════════════════════════════════════════════════════

  analyzeNFPhoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      try {
        const { invokeAnthropicVision } = await import("../_core/llm");

        const prompt = `Você é um sistema de leitura de Notas Fiscais (DANFE) brasileiras para um sistema de almoxarifado de construção civil.

Analise esta foto de uma Nota Fiscal e extraia TODOS os dados possíveis.

Responda SOMENTE com JSON válido (sem markdown, sem explicações):
{
  "numeroNf": "número da NF",
  "fornecedorNome": "razão social do fornecedor",
  "fornecedorCnpj": "CNPJ do fornecedor (só números)",
  "dataEmissao": "data de emissão DD/MM/YYYY",
  "itens": [
    {
      "descricao": "descrição do produto",
      "quantidade": 0,
      "unidade": "un/kg/m²/m/L/cx/sc/pç/rolo/barra/pct",
      "valorUnitario": 0.00,
      "valorTotal": 0.00
    }
  ],
  "valorTotalNf": 0.00
}

REGRAS:
- Se não conseguir ler algum campo, coloque null
- Quantidades e valores devem ser numéricos (não strings)
- Descreva os produtos da forma mais completa possível
- Unidades devem ser abreviadas: un, kg, m², m, L, cx, sc, pç, rolo, barra, pct
- Se a foto estiver ilegível, retorne {"erro": "Foto ilegível, tente novamente"}`;

        const text = await invokeAnthropicVision({
          prompt,
          base64: input.base64,
          mimeType: input.mimeType,
          maxTokens: 4096,
        });

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        if (parsed.erro) {
          return { success: false, erro: parsed.erro, dados: null };
        }

        return {
          success: true,
          erro: null,
          dados: {
            numeroNf: parsed.numeroNf || null,
            fornecedorNome: parsed.fornecedorNome || null,
            fornecedorCnpj: parsed.fornecedorCnpj || null,
            dataEmissao: parsed.dataEmissao || null,
            valorTotalNf: parsed.valorTotalNf || 0,
            itens: (parsed.itens || []).map((it: any) => ({
              descricao: String(it.descricao || ""),
              quantidade: Number(it.quantidade) || 0,
              unidade: String(it.unidade || "un"),
              valorUnitario: Number(it.valorUnitario) || 0,
              valorTotal: Number(it.valorTotal) || 0,
            })),
          },
        };
      } catch (err: any) {
        console.error("[analyzeNFPhoto] Erro:", err?.message ?? err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao analisar foto da NF" });
      }
    }),

  listPendingOCs: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        sql`${comprasOrdens.status} IN ('pendente', 'aprovada', 'parcial')`,
      ];
      if (input.obraId) {
        conditions.push(eq(comprasOrdens.obraId, input.obraId));
      }

      const ocs = await db
        .select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          fornecedorNome: comprasOrdens.fornecedorNome,
          obraId: comprasOrdens.obraId,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          status: comprasOrdens.status,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
        })
        .from(comprasOrdens)
        .where(and(...conditions))
        .orderBy(desc(comprasOrdens.criadoEm));

      const result = await Promise.all(ocs.map(async (oc) => {
        const ocItens = await db.select().from(comprasOrdensItens)
          .where(eq(comprasOrdensItens.ordemId, oc.id));
        const totalItens = ocItens.length;
        let itensEntregues = 0;
        let itensPendentes = 0;
        for (const it of ocItens) {
          const qty = parseFloat(String(it.quantidade) || "0");
          const entregue = parseFloat(String(it.quantidadeEntregue) || "0");
          if (entregue >= qty) itensEntregues++;
          else if (entregue > 0) itensPendentes++;
          else itensPendentes++;
        }
        const pendentesReal = totalItens - itensEntregues;
        return { ...oc, totalItens, itensEntregues, itensPendentes: pendentesReal };
      }));

      return result.filter(oc => oc.itensPendentes > 0);
    }),

  getOCItemsForReceiving: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ordemCompraId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [oc] = await db
        .select()
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.id, input.ordemCompraId),
          eq(comprasOrdens.companyId, input.companyId),
        ));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada" });

      const itens = await db
        .select()
        .from(comprasOrdensItens)
        .where(eq(comprasOrdensItens.ordemId, input.ordemCompraId));

      return {
        oc: {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          obraId: oc.obraId,
          status: oc.status,
        },
        itens: itens.map((it) => ({
          id: it.id,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: parseFloat(String(it.quantidade) || "0"),
          quantidadeEntregue: parseFloat(String(it.quantidadeEntregue) || "0"),
          quantidadePendente: parseFloat(String(it.quantidade) || "0") - parseFloat(String(it.quantidadeEntregue) || "0"),
          precoUnitario: parseFloat(String(it.precoUnitario) || "0"),
        })),
      };
    }),

  matchNFtoOC: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      fornecedorNome: z.string().optional(),
      itensNf: z.array(z.object({
        descricao: z.string(),
        quantidade: z.number(),
        unidade: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        sql`${comprasOrdens.status} IN ('pendente', 'aprovada', 'parcial')`,
      ];
      if (input.obraId) conditions.push(eq(comprasOrdens.obraId, input.obraId));

      const ocs = await db.select().from(comprasOrdens).where(and(...conditions));

      let bestMatch: { ocId: number; numeroOc: string; fornecedorNome: string; score: number; matchedItems: any[] } | null = null;

      for (const oc of ocs) {
        const ocItens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
        let score = 0;
        const matchedItems: any[] = [];

        if (input.fornecedorNome && oc.fornecedorNome) {
          const fornNf = input.fornecedorNome.toLowerCase().trim();
          const fornOc = oc.fornecedorNome.toLowerCase().trim();
          if (fornOc.includes(fornNf) || fornNf.includes(fornOc)) {
            score += 50;
          }
        }

        for (const nfItem of input.itensNf) {
          const descNf = nfItem.descricao.toLowerCase().trim();
          for (const ocItem of ocItens) {
            const descOc = ocItem.descricao.toLowerCase().trim();
            const words = descNf.split(/\s+/).filter(w => w.length > 2);
            const matchCount = words.filter(w => descOc.includes(w)).length;
            if (matchCount >= Math.max(1, words.length * 0.4)) {
              score += 10;
              matchedItems.push({
                nfDescricao: nfItem.descricao,
                ocItemId: ocItem.id,
                ocDescricao: ocItem.descricao,
                quantidadeNf: nfItem.quantidade,
                quantidadeOc: parseFloat(String(ocItem.quantidade) || "0"),
                quantidadeEntregue: parseFloat(String(ocItem.quantidadeEntregue) || "0"),
              });
              break;
            }
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            ocId: oc.id,
            numeroOc: oc.numeroOc,
            fornecedorNome: oc.fornecedorNome || "",
            score,
            matchedItems,
          };
        }
      }

      return { match: bestMatch };
    }),

  registerSmartEntry: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      ordemCompraId: z.number().optional(),
      numeroOc: z.string().optional(),
      numeroNf: z.string().optional(),
      fornecedorNome: z.string().optional(),
      fornecedorCnpj: z.string().optional(),
      fotoNfUrl: z.string().optional(),
      fotoMaterialUrl: z.string().optional(),
      metodoEntrada: z.enum(["manual", "foto_nf", "ordem_compra"]).default("manual"),
      itens: z.array(z.object({
        itemId: z.number().optional(),
        itemNome: z.string(),
        unidade: z.string().default("un"),
        categoria: z.string().optional(),
        quantidadeNf: z.number(),
        quantidadeRecebida: z.number(),
        valorUnitario: z.number().optional(),
        ocItemId: z.number().optional(),
        quantidadeOc: z.number().optional(),
        itemNovo: z.boolean().default(false),
        motivoDivergencia: z.string().optional(),
        fotoAvariaUrl: z.string().optional(),
        recebido: z.boolean().default(true),
      })),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.ordemCompraId) {
        const [ocCheck] = await db
          .select({
            id: comprasOrdens.id,
            numeroOc: comprasOrdens.numeroOc,
            status: comprasOrdens.status,
            obraId: comprasOrdens.obraId,
            obraNome: obras.nome,
          })
          .from(comprasOrdens)
          .leftJoin(obras, eq(obras.id, comprasOrdens.obraId))
          .where(and(eq(comprasOrdens.id, input.ordemCompraId), eq(comprasOrdens.companyId, input.companyId)));
        if (ocCheck && ocCheck.status === "entregue") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta OC já foi totalmente entregue. Não é possível registrar novo recebimento." });
        }
        if (ocCheck) {
          // Rev. 2303 — regra-de-ouro: recebimento SÓ na obra da OC.
          // Se OC tem obra vinculada e o input vier sem obra OU com obra diferente,
          // bloqueamos e devolvemos a obra correta no message pra UI orientar.
          if (ocCheck.obraId) {
            if (!input.obraId) {
              // Auto-anexa a obra da OC ao recebimento (sem obrigar refluxo de UI).
              input.obraId = ocCheck.obraId;
              if (!input.obraNome && ocCheck.obraNome) {
                input.obraNome = ocCheck.obraNome;
              }
            } else if (Number(input.obraId) !== Number(ocCheck.obraId)) {
              const ocObraNome = ocCheck.obraNome ? `"${ocCheck.obraNome}"` : `obra #${ocCheck.obraId}`;
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Esta OC ${ocCheck.numeroOc || ""} foi emitida para ${ocObraNome}. O recebimento só pode ser feito na MESMA obra da solicitação/ordem de compra.`,
              });
            }
          }
          const ocItensCheck = await db.select().from(comprasOrdensItens)
            .where(eq(comprasOrdensItens.ordemId, input.ordemCompraId));
          const allDelivered = ocItensCheck.every(it =>
            parseFloat(String(it.quantidadeEntregue) || "0") >= parseFloat(String(it.quantidade) || "0")
          );
          if (allDelivered) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Todos os itens desta OC já foram entregues. Não há pendências de recebimento." });
          }
        }
      }

      const itensRecebidos = input.itens.filter(i => i.recebido);
      const temDivergencia = input.itens.some(i =>
        !i.recebido ||
        (i.quantidadeNf > 0 && i.quantidadeRecebida < i.quantidadeNf) ||
        i.fotoAvariaUrl
      );

      const [recebimento] = await db.insert(almoxarifadoRecebimentos).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        ordemCompraId: input.ordemCompraId || null,
        numeroOc: input.numeroOc || null,
        numeroNf: input.numeroNf || null,
        fornecedorNome: input.fornecedorNome || null,
        fornecedorCnpj: input.fornecedorCnpj || null,
        fotoNfUrl: input.fotoNfUrl || null,
        fotoMaterialUrl: input.fotoMaterialUrl || null,
        metodoEntrada: input.metodoEntrada,
        status: temDivergencia ? "com_divergencia" : "concluido",
        totalItensNf: input.itens.length,
        totalItensRecebidos: itensRecebidos.length,
        temDivergencia,
        observacoes: input.observacoes || null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any).returning();

      const createdItems: number[] = [];
      const divergencias: string[] = [];

      for (const item of input.itens) {
        let itemId = item.itemId;
        let statusItem = "recebido";

        if (!item.recebido) {
          statusItem = "nao_recebido";
        } else if (item.quantidadeNf > 0 && item.quantidadeRecebida < item.quantidadeNf) {
          statusItem = "parcial";
        } else if (item.fotoAvariaUrl) {
          statusItem = "avariado";
        }

        if (item.itemNovo && !itemId && item.recebido) {
          const [newItem] = await db.insert(almoxarifadoItens).values({
            companyId: input.companyId,
            obraId: input.obraId || null,
            nome: item.itemNome,
            unidade: item.unidade,
            categoria: item.categoria || "Outros",
            quantidadeAtual: "0",
            quantidadeMinima: "0",
            origem: "proprio",
            criadoPorId: ctx.user?.id ?? null,
            criadoPorNome: ctx.user?.name || null,
          } as any).returning();
          itemId = newItem.id;
          createdItems.push(newItem.id);
        }

        if (item.recebido && itemId && item.quantidadeRecebida > 0) {
          const [existing] = await db
            .select()
            .from(almoxarifadoItens)
            .where(and(eq(almoxarifadoItens.id, itemId), eq(almoxarifadoItens.companyId, input.companyId)));

          if (existing) {
            const antes = parseFloat(String(existing.quantidadeAtual) || "0");
            const depois = antes + item.quantidadeRecebida;
            await db
              .update(almoxarifadoItens)
              .set({ quantidadeAtual: String(depois) } as any)
              .where(and(eq(almoxarifadoItens.id, itemId), eq(almoxarifadoItens.companyId, input.companyId)));

            await db.insert(almoxarifadoMovimentacoes).values({
              companyId: input.companyId,
              itemId,
              tipo: "entrada",
              quantidade: String(item.quantidadeRecebida),
              obraId: input.obraId || null,
              obraNome: input.obraNome || null,
              motivo: input.numeroNf ? `Recebimento NF: ${input.numeroNf}` : "Recebimento inteligente",
              usuarioId: ctx.user.id,
              usuarioNome: ctx.user.name || "",
            } as any);
          }
        }

        if (item.ocItemId && item.recebido && item.quantidadeRecebida > 0 && input.ordemCompraId) {
          const [validOc] = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
            .where(and(eq(comprasOrdens.id, input.ordemCompraId), eq(comprasOrdens.companyId, input.companyId)));
          if (validOc) {
            const [ocItem] = await db.select().from(comprasOrdensItens)
              .where(and(eq(comprasOrdensItens.id, item.ocItemId), eq(comprasOrdensItens.ordemId, input.ordemCompraId)));
            if (ocItem) {
              const entregueAtual = parseFloat(String(ocItem.quantidadeEntregue) || "0");
              const qtdOc = parseFloat(String(ocItem.quantidade) || "0");
              const pendente = Math.max(0, qtdOc - entregueAtual);
              if (pendente <= 0) continue;
              const qtdAceita = Math.min(item.quantidadeRecebida, pendente);
              await db.update(comprasOrdensItens)
                .set({ quantidadeEntregue: String(entregueAtual + qtdAceita) } as any)
                .where(and(eq(comprasOrdensItens.id, item.ocItemId), eq(comprasOrdensItens.ordemId, input.ordemCompraId)));
            }
          }
        }

        if (statusItem !== "recebido") {
          divergencias.push(`${item.itemNome}: ${statusItem === "parcial"
            ? `recebido ${item.quantidadeRecebida} de ${item.quantidadeNf} ${item.unidade}`
            : statusItem === "nao_recebido"
            ? "não recebido"
            : "avariado"}`);
        }

        await db.insert(almoxarifadoRecebimentoItens).values({
          recebimentoId: recebimento.id,
          itemId: itemId || null,
          itemNome: item.itemNome,
          unidade: item.unidade,
          categoria: item.categoria || null,
          quantidadeNf: String(item.quantidadeNf),
          quantidadeRecebida: String(item.quantidadeRecebida),
          valorUnitario: item.valorUnitario ? String(item.valorUnitario) : null,
          ocItemId: item.ocItemId || null,
          quantidadeOc: item.quantidadeOc ? String(item.quantidadeOc) : null,
          statusItem,
          itemNovo: item.itemNovo,
          motivoDivergencia: item.motivoDivergencia || null,
          fotoAvariaUrl: item.fotoAvariaUrl || null,
        } as any);
      }

      if (input.ordemCompraId) {
        const allOcItens = await db.select().from(comprasOrdensItens)
          .where(eq(comprasOrdensItens.ordemId, input.ordemCompraId));
        const allDelivered = allOcItens.every(it =>
          parseFloat(String(it.quantidadeEntregue) || "0") >= parseFloat(String(it.quantidade) || "0")
        );
        await db.update(comprasOrdens)
          .set({ status: allDelivered ? "entregue" : "parcial" } as any)
          .where(and(eq(comprasOrdens.id, input.ordemCompraId), eq(comprasOrdens.companyId, input.companyId)));
      }

      if (temDivergencia && divergencias.length > 0) {
        const msgDivergencia = divergencias.join("\n");

        await db.insert(almoxarifadoNotificacoes).values({
          companyId: input.companyId,
          recebimentoId: recebimento.id,
          tipo: "divergencia",
          destinoModulo: "compras",
          titulo: `Divergência no recebimento${input.numeroNf ? ` NF ${input.numeroNf}` : ""}`,
          mensagem: `Obra: ${input.obraNome || "N/A"}\nFornecedor: ${input.fornecedorNome || "N/A"}\n\nItens com divergência:\n${msgDivergencia}`,
        } as any);

        await db.insert(almoxarifadoNotificacoes).values({
          companyId: input.companyId,
          recebimentoId: recebimento.id,
          tipo: "divergencia",
          destinoModulo: "financeiro",
          titulo: `Pagamento pendente — divergência${input.numeroNf ? ` NF ${input.numeroNf}` : ""}`,
          mensagem: `Recebimento com divergência. Aguardar resolução antes de liberar pagamento.\nFornecedor: ${input.fornecedorNome || "N/A"}\n\nDivergências:\n${msgDivergencia}`,
        } as any);
      }

      const itemIdsParaFoto: { id: number; nome: string }[] = [];
      const seen = new Set<number>();
      let createdIdx = 0;
      for (const item of input.itens) {
        let iid = item.itemId;
        if (!iid && item.itemNovo && createdIdx < createdItems.length) {
          iid = createdItems[createdIdx++];
        }
        if (iid && item.recebido && !seen.has(iid)) {
          seen.add(iid);
          const [existing] = await db.select({ id: almoxarifadoItens.id, nome: almoxarifadoItens.nome, fotoUrl: almoxarifadoItens.fotoUrl })
            .from(almoxarifadoItens)
            .where(and(eq(almoxarifadoItens.id, iid), eq(almoxarifadoItens.companyId, input.companyId)));
          if (existing && !existing.fotoUrl) {
            itemIdsParaFoto.push({ id: existing.id, nome: existing.nome });
          }
        }
      }
      if (itemIdsParaFoto.length > 0) {
        (async () => {
          for (const { id, nome } of itemIdsParaFoto) {
            try {
              const url = await buscarFotoParaItem(nome);
              if (url) {
                await db.execute(sql`UPDATE almoxarifado_itens SET foto_url = ${url} WHERE id = ${id}`);
                console.log(`[autoFoto] Entrada: ${nome} → foto atualizada`);
              }
            } catch (e) {
              console.warn(`[autoFoto] Erro background para item ${id}:`, e);
            }
          }
        })();
      }

      return {
        success: true,
        recebimentoId: recebimento.id,
        totalRecebido: itensRecebidos.length,
        totalItens: input.itens.length,
        itensNovosCriados: createdItems.length,
        temDivergencia,
        divergencias,
      };
    }),

  listRecebimentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [eq(almoxarifadoRecebimentos.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(almoxarifadoRecebimentos.obraId, input.obraId));

      const recebimentos = await db
        .select()
        .from(almoxarifadoRecebimentos)
        .where(and(...conditions))
        .orderBy(desc(almoxarifadoRecebimentos.criadoEm))
        .limit(input.limit);

      return recebimentos;
    }),

  getRecebimentoDetails: protectedProcedure
    .input(z.object({ companyId: z.number(), recebimentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rec] = await db
        .select()
        .from(almoxarifadoRecebimentos)
        .where(and(
          eq(almoxarifadoRecebimentos.id, input.recebimentoId),
          eq(almoxarifadoRecebimentos.companyId, input.companyId),
        ));
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });

      const itens = await db
        .select()
        .from(almoxarifadoRecebimentoItens)
        .where(eq(almoxarifadoRecebimentoItens.recebimentoId, input.recebimentoId));

      return { recebimento: rec, itens };
    }),

  getNotificacoes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      modulo: z.string().optional(),
      apenasNaoLidas: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [eq(almoxarifadoNotificacoes.companyId, input.companyId)];
      if (input.modulo) conditions.push(eq(almoxarifadoNotificacoes.destinoModulo, input.modulo));
      if (input.apenasNaoLidas) conditions.push(eq(almoxarifadoNotificacoes.lida, false));

      const notifs = await db
        .select()
        .from(almoxarifadoNotificacoes)
        .where(and(...conditions))
        .orderBy(desc(almoxarifadoNotificacoes.criadoEm))
        .limit(50);

      return notifs;
    }),

  marcarNotificacaoLida: protectedProcedure
    .input(z.object({ companyId: z.number(), notificacaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(almoxarifadoNotificacoes)
        .set({ lida: true } as any)
        .where(and(
          eq(almoxarifadoNotificacoes.id, input.notificacaoId),
          eq(almoxarifadoNotificacoes.companyId, input.companyId),
        ));
      return { success: true };
    }),
});
