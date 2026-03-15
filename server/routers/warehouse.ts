import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  almoxarifadoItens,
  almoxarifadoMovimentacoes,
  almoxarifadoDescontoFolha,
  warehouseLoans,
  warehouseInventorySessions,
  warehouseInventorySessionItems,
  employees,
  warnings,
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
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(almoxarifadoMovimentacoes.companyId, input.companyId),
      ];
      if (input.itemId) conditions.push(eq(almoxarifadoMovimentacoes.itemId, input.itemId));
      if (input.tipo) conditions.push(eq(almoxarifadoMovimentacoes.tipo, input.tipo));

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
        funcionarioCodigo: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

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

      await db.insert(warehouseLoans).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        itemId: input.itemId,
        itemNome: item.nome,
        quantidade: String(input.quantidade),
        funcionarioId: funcionario.id,
        funcionarioCodigo: input.funcionarioCodigo,
        funcionarioNome: funcionario.nomeCompleto,
        dataEmprestimo: hoje,
        horaEmprestimo: hora,
        almoxarifeId: ctx.user.id,
        almoxarifeNome: ctx.user.name || "",
        status: "emprestado",
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
        motivo: `Empréstimo para ${funcionario.nomeCompleto}`,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "",
      } as any);

      return { success: true, funcionarioNome: funcionario.nomeCompleto };
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(warehouseLoans)
        .where(
          and(
            eq(warehouseLoans.companyId, input.companyId),
            eq(warehouseLoans.status, "emprestado")
          )
        )
        .orderBy(desc(warehouseLoans.createdAt));
    }),

  // Devolver item
  returnLoanById: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
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
      const { ilike, or, isNull } = await import("drizzle-orm");
      const q = input.q.trim();
      if (q.length < 2) return [];

      return db
        .select({
          id: employees.id,
          nomeCompleto: employees.nomeCompleto,
          codigoInterno: employees.codigoInterno,
          cargo: (employees as any).cargo,
          funcao: (employees as any).funcao,
          fotoUrl: (employees as any).fotoUrl,
        })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, input.companyId),
            isNull(employees.deletedAt),
            or(
              ilike(employees.nomeCompleto, `%${q}%`),
              ilike(employees.codigoInterno, `%${q}%`),
              ilike((employees as any).cargo, `%${q}%`),
            )
          )
        )
        .orderBy(employees.nomeCompleto)
        .limit(6);
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
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error("GOOGLE_API_KEY não configurada");

        const catList = (input.categorias ?? []).join(", ") || "Ferramentas, Materiais de construção, EPIs, Elétrico, Hidráulico, Outros";
        const unidList = (input.unidades ?? []).join(", ") || "un, kg, m, m², L, cx, sc, rolo, barra, pç";

        console.log("[sugerirCadastroItem] Iniciando. base64 length:", input.base64.length, "mimeType:", input.mimeType);

        const prompt = `Analise esta imagem de um produto de construção civil ou ferramenta industrial. Sugira os dados de cadastro para um sistema de almoxarifado.

Categorias disponíveis: ${catList}
Unidades disponíveis: ${unidList}

Responda SOMENTE com JSON válido (sem markdown, sem explicações):
{"nome":"nome técnico do produto","categoria":"categoria das disponíveis","unidade":"unidade das disponíveis","observacoes":"especificações breves ou vazio"}`;

        // Use Gemini native API — suporta inline base64 com garantia
        const body = {
          contents: [{
            parts: [
              { inline_data: { mime_type: input.mimeType, data: input.base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        };

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error("[sugerirCadastroItem] Gemini error:", errText.slice(0, 400));
          throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data: any = await res.json();
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        console.log("[sugerirCadastroItem] Resposta:", text.slice(0, 300));

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, "").trim();
        if (!clean) {
          console.warn("[sugerirCadastroItem] Resposta vazia do Gemini.");
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
});
