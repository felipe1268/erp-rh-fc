import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getEffectiveAllowedObraIds, userCanAccessObra, userCanAccessObraAlmox, getAlmoxAllowedObraIdSet, getCompaniesForUser } from "../db";
import { eq, and, desc, sql, inArray, ne, or, isNull } from "drizzle-orm";
import crypto from "crypto";
import { buscarFotoParaItem } from "../_core/autoFoto";
import { storagePut } from "../storage";
import {
  almoxarifadoItens,
  almoxarifadoMovimentacoes,
  almoxarifadoDescontoFolha,
  almoxarifadoSaidasInsumo,
  almoxarifadoTransferencias,
  almoxarifadoRecebimentos,
  almoxarifadoRecebimentoItens,
  almoxarifadoNotificacoes,
  almoxarifadoBaias,
  almoxarifadoBaiaLeituras,
  warehouseLoans,
  warehouseInventorySessions,
  warehouseInventorySessionItems,
  warehouseInventoryAjustes,
  comprasOrdens,
  comprasOrdensItens,
  comprasSolicitacoes,
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

// Rev. 4547 — guard de tenant/obra p/ mutations do inventário semanal (antes
// inexistente: IDOR por sessionId/sessionItemId). Resolve a sessão e valida
// acesso à empresa + obra do usuário. Retorna a sessão resolvida.
async function assertInventorySessionAccess(db: any, ctx: any, sessionId: number) {
  const [sess] = await db
    .select()
    .from(warehouseInventorySessions)
    .where(eq(warehouseInventorySessions.id, sessionId))
    .limit(1);
  if (!sess) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão de inventário não encontrada." });
  const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
  if (!allowedCompanies.map((c: any) => c.id).includes(sess.companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
  if (sess.obraId != null) {
    // Mesma régua de ESCRITA do almoxarifado ("ver tudo, mexer só no seu",
    // Rev. 4539/4541): inventário só opera nas obras habilitadas p/ o user.
    const allowed = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
    if (allowed !== null && !allowed.has(sess.obraId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para operar o inventário desta obra." });
    }
  }
  return sess;
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

      // Rev. 4539 — guards de escrita: empresa do CHAMADOR + item da MESMA
      // empresa + permissão na obra do item ("ver tudo, mexer só no seu").
      const allowedCompaniesEn = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesEn.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (item.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Item não pertence a esta empresa." });
      }
      if (item.obraId != null) {
        const allowedObras = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
        if (allowedObras !== null && !allowedObras.has(Number(item.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para operar o almoxarifado desta obra (somente leitura)." });
        }
      }

      const antes = parseFloat(String(item.quantidadeAtual) || "0");
      const depois = antes + input.quantidade;

      // Rev. 2392 — reativa item se estava soft-deleted (zerou via transferência).
      await db
        .update(almoxarifadoItens)
        .set({ quantidadeAtual: String(depois), ativo: true } as any)
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

      // Rev. 4539 — guards de escrita: empresa do CHAMADOR + item da MESMA
      // empresa + permissão na obra do item ("ver tudo, mexer só no seu").
      const allowedCompaniesEx = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesEx.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (item.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Item não pertence a esta empresa." });
      }
      if (item.obraId != null) {
        const allowedObras = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
        if (allowedObras !== null && !allowedObras.has(Number(item.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para operar o almoxarifado desta obra (somente leitura)." });
        }
      }

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
  // ── TIMELINE UNIFICADA (Rev. 2457) ────────────────────────────
  // Une 4 fontes (movimentações de estoque, empréstimos de ferramenta,
  // saídas de insumo, transferências) numa única linha do tempo pro
  // gestor RASTREAR quem fez o quê e quando. Cada fonte mantém sua
  // própria mutation; aqui só LEMOS via UNION ALL com colunas
  // normalizadas. Estorno continua exclusivo da fonte 'movimentacao'
  // (as outras 3 são read-only nesta tela).
  listTimeline: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      limit:     z.number().default(1500),
      dateFrom:  z.string().optional(), // YYYY-MM-DD (>=)
      dateTo:    z.string().optional(), // YYYY-MM-DD (<=)
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Rev. 4539 — guard de empresa (visibilidade global é POR EMPRESA, nunca cross-tenant).
      const allowedCompaniesTl = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesTl.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const cid = input.companyId;
      const dFrom = input.dateFrom ?? null;
      const dTo   = input.dateTo   ?? null;
      const lim   = Math.min(Math.max(input.limit, 1), 5000);

      // UNION ALL com colunas normalizadas (15 colunas em cada SELECT).
      // ORDER BY quando DESC, LIMIT no final.
      const rows = await db.execute(sql`
        SELECT * FROM (
          SELECT
            'movimentacao'::text                          AS fonte,
            m.id                                          AS id,
            m.tipo                                        AS tipo,
            m.criado_em                                   AS quando,
            m.usuario_nome                                AS quem,
            m.item_id                                     AS item_id,
            COALESCE(i.nome, '(item removido)')           AS item_nome,
            i.unidade                                     AS unidade,
            m.quantidade                                  AS quantidade,
            m.obra_id                                     AS obra_id,
            m.obra_nome                                   AS obra_nome,
            m.motivo                                      AS motivo,
            NULL::text                                    AS contraparte,
            m.estornada_em                                AS estornada_em,
            m.estornada_por_nome                          AS estornada_por_nome,
            m.estorno_motivo                              AS estorno_motivo
          FROM almoxarifado_movimentacoes m
          LEFT JOIN almoxarifado_itens i ON i.id = m.item_id
          WHERE m.company_id = ${cid}

          UNION ALL

          SELECT
            'emprestimo'::text                            AS fonte,
            l.id                                          AS id,
            CASE WHEN l.status = 'devolvido' THEN 'devolucao'
                 WHEN l.status = 'perdido'   THEN 'perdido'
                 ELSE 'emprestimo' END                    AS tipo,
            l.created_at                                  AS quando,
            COALESCE(l.almoxarife_nome, '—')              AS quem,
            l.item_id                                     AS item_id,
            l.item_nome                                   AS item_nome,
            NULL::varchar                                 AS unidade,
            l.quantidade                                  AS quantidade,
            l.obra_id                                     AS obra_id,
            NULL::varchar                                 AS obra_nome,
            COALESCE(l.observacoes, NULL)                 AS motivo,
            l.funcionario_nome ||
              COALESCE(' (' || l.funcionario_codigo || ')', '')
                                                          AS contraparte,
            NULL::timestamp                               AS estornada_em,
            NULL::varchar                                 AS estornada_por_nome,
            NULL::text                                    AS estorno_motivo
          FROM warehouse_loans l
          WHERE l.company_id = ${cid}

          UNION ALL

          SELECT
            'insumo'::text                                AS fonte,
            s.id                                          AS id,
            'insumo'::varchar                             AS tipo,
            s.created_at                                  AS quando,
            COALESCE(s.almoxarife_nome, '—')              AS quem,
            s.item_id                                     AS item_id,
            s.item_nome                                   AS item_nome,
            s.unidade                                     AS unidade,
            s.quantidade                                  AS quantidade,
            s.obra_id                                     AS obra_id,
            s.obra_nome                                   AS obra_nome,
            s.motivo                                      AS motivo,
            s.funcionario_nome ||
              COALESCE(' (' || s.funcionario_codigo || ')', '')
                                                          AS contraparte,
            NULL::timestamp                               AS estornada_em,
            NULL::varchar                                 AS estornada_por_nome,
            NULL::text                                    AS estorno_motivo
          FROM almoxarifado_saidas_insumo s
          WHERE s.company_id = ${cid}

          UNION ALL

          SELECT
            'transferencia'::text                         AS fonte,
            t.id                                          AS id,
            'transferencia'::varchar                      AS tipo,
            t.created_at                                  AS quando,
            COALESCE(t.almoxarife_nome, '—')              AS quem,
            t.item_id_origem                              AS item_id,
            t.item_nome                                   AS item_nome,
            t.unidade                                     AS unidade,
            t.quantidade                                  AS quantidade,
            COALESCE(t.origem_obra_id, t.destino_obra_id) AS obra_id,
            COALESCE(t.origem_obra_nome, 'Central') ||
              ' → ' ||
              COALESCE(t.destino_obra_nome, 'Central')    AS obra_nome,
            t.motivo                                      AS motivo,
            COALESCE(t.destino_obra_nome, 'Central')     AS contraparte,
            NULL::timestamp                               AS estornada_em,
            NULL::varchar                                 AS estornada_por_nome,
            NULL::text                                    AS estorno_motivo
          FROM almoxarifado_transferencias t
          WHERE t.company_id = ${cid}
        ) timeline
        WHERE
          (${dFrom}::date IS NULL OR DATE(timeline.quando) >= ${dFrom}::date)
          AND
          (${dTo}::date IS NULL OR DATE(timeline.quando) <= ${dTo}::date)
        ORDER BY timeline.quando DESC
        LIMIT ${lim}
      `);

      const list = ((rows as any)?.rows ?? rows ?? []) as any[];

      // Rev. 4539 — VISIBILIDADE GLOBAL (leitura): timeline sem filtro por
      // obras permitidas — quem tem acesso ao módulo vê o giro de todas as
      // obras da empresa. Escrita continua restrita nas mutations.
      return list;
    }),

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

      // Rev. 4539 — guard de empresa (visibilidade global é POR EMPRESA, nunca cross-tenant).
      const allowedCompaniesMv = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesMv.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const conditions: any[] = [
        eq(almoxarifadoMovimentacoes.companyId, input.companyId),
      ];
      if (input.itemId) conditions.push(eq(almoxarifadoMovimentacoes.itemId, input.itemId));
      if (input.tipo) conditions.push(eq(almoxarifadoMovimentacoes.tipo, input.tipo));
      if (input.data) conditions.push(sql`DATE(${almoxarifadoMovimentacoes.criadoEm}) = ${input.data}::date`);

      // Rev. 4539 — VISIBILIDADE GLOBAL (leitura): movimentações de todas as
      // obras visíveis pra quem tem acesso ao módulo. Filtro antigo por
      // getEffectiveAllowedObraIds removido de propósito.

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
          // Rev. 2305 — campos de estorno (soft-delete auditável).
          estornadaEm: almoxarifadoMovimentacoes.estornadaEm,
          estornadaPorNome: almoxarifadoMovimentacoes.estornadaPorNome,
          estornoMotivo: almoxarifadoMovimentacoes.estornoMotivo,
        })
        .from(almoxarifadoMovimentacoes)
        .leftJoin(almoxarifadoItens, eq(almoxarifadoMovimentacoes.itemId, almoxarifadoItens.id))
        .where(and(...conditions))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limit);

      return movs;
    }),

  // ── ESTORNO DE MOVIMENTAÇÕES (Rev. 2305) ───────────────────────
  // Reverte 1+ movimentações de uma vez. Soft-delete: marca a mov como
  // estornada (preserva histórico) e devolve a quantidade ao estoque
  // do item. Operação restrita a admin/admin_master. Movimentações
  // originadas de Recebimento Inteligente (vinculadas a OC) são
  // BLOQUEADAS — devem ser revertidas pela tela de Recebimentos pra
  // não dessincronizar quantidade_entregue/status da OC.
  reverseMovements: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      movementIds: z.array(z.number()).min(1).max(200),
      motivo: z.string().min(3).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!isAdmin(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem estornar movimentações.",
        });
      }

      const sucessos: number[] = [];
      const erros: { id: number; motivo: string }[] = [];

      // Rev. 2306 — Refinamento: SÓ bloqueia movimentação vinculada a
      // uma OC (porque estornar mexeria em `qtd_entregue` e status da
      // OC sem que esta tela faça essa reversão). Recebimento avulso
      // SEM OC (motivo "Recebimento inteligente" ou "Recebimento NF:")
      // pode ser estornado livremente — só atualiza estoque. Caso real:
      // user com 606 movs, quase todas de Recebimento, todas
      // bloqueadas pelo regex antigo `/^\s*recebimento\b/i` que era
      // largo demais.
      const isLinkedToOc = (motivo: string | null | undefined) => {
        const s = String(motivo || "");
        return /\boc[\s-]/i.test(s);
      };

      for (const mid of input.movementIds) {
        try {
          // 1) Lê + valida tudo ANTES de abrir transação. Falhas de
          //    pré-condição não tocam o banco.
          const [mov] = await db
            .select()
            .from(almoxarifadoMovimentacoes)
            .where(and(
              eq(almoxarifadoMovimentacoes.id, mid),
              eq(almoxarifadoMovimentacoes.companyId, input.companyId),
            ));
          if (!mov) { erros.push({ id: mid, motivo: "Movimentação não encontrada" }); continue; }
          if (mov.estornadaEm) { erros.push({ id: mid, motivo: "Já estornada anteriormente" }); continue; }
          if (isLinkedToOc(mov.motivo)) {
            erros.push({ id: mid, motivo: "Vinculada a Ordem de Compra — estorne pela tela de Recebimentos para reverter o status da OC" });
            continue;
          }

          // Multi-tenant: item DEVE pertencer à mesma empresa da mov.
          const [item] = await db
            .select()
            .from(almoxarifadoItens)
            .where(and(
              eq(almoxarifadoItens.id, mov.itemId),
              eq(almoxarifadoItens.companyId, input.companyId),
            ));
          if (!item) { erros.push({ id: mid, motivo: "Item do estoque não encontrado nesta empresa" }); continue; }

          const qtd = parseFloat(String(mov.quantidade) || "0");
          const atual = parseFloat(String(item.quantidadeAtual) || "0");
          let novo = atual;
          if (mov.tipo === "entrada") {
            // Reverter entrada = subtrair do estoque. Bloqueia se ficaria negativo
            // (significa que o material já foi consumido depois — estorno inseguro).
            if (atual < qtd) {
              erros.push({
                id: mid,
                motivo: `Estoque atual (${atual}) menor que a quantidade a estornar (${qtd}). Material já consumido.`,
              });
              continue;
            }
            novo = atual - qtd;
          } else if (mov.tipo === "saida") {
            novo = atual + qtd;
          } else {
            erros.push({ id: mid, motivo: `Tipo "${mov.tipo}" não é estornável por esta tela` });
            continue;
          }

          // 2) Transação atômica: marca a mov como estornada APENAS se
          //    nenhuma outra requisição estornou em paralelo (condição
          //    `estornada_em IS NULL`), e ajusta o saldo do item
          //    filtrando por companyId (defesa em profundidade).
          await db.transaction(async (tx: any) => {
            const upd = await tx
              .update(almoxarifadoMovimentacoes)
              .set({
                estornadaEm: new Date().toISOString(),
                estornadaPorId: ctx.user.id,
                estornadaPorNome: ctx.user.name || "",
                estornoMotivo: input.motivo,
              } as any)
              .where(and(
                eq(almoxarifadoMovimentacoes.id, mid),
                eq(almoxarifadoMovimentacoes.companyId, input.companyId),
                sql`estornada_em IS NULL`,
              ))
              .returning({ id: almoxarifadoMovimentacoes.id });
            if (!upd || upd.length === 0) {
              throw new Error("Movimentação já estornada por outro processo");
            }
            // Rev. 2392 — reativa item se voltou a ter saldo (saiu do soft-delete por transferência).
            await tx
              .update(almoxarifadoItens)
              .set({ quantidadeAtual: String(novo), ativo: true } as any)
              .where(and(
                eq(almoxarifadoItens.id, mov.itemId),
                eq(almoxarifadoItens.companyId, input.companyId),
              ));
          });

          sucessos.push(mid);
        } catch (e: any) {
          erros.push({ id: mid, motivo: e?.message || "Erro inesperado" });
        }
      }

      return { sucessos, erros, total: input.movementIds.length };
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
        observacoes: z.string().optional(),
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

      // Rev. 4541 — guards de escrita (empréstimo = operação): empresa do
      // chamador + item da mesma empresa + permissão na obra do ITEM.
      const allowedCompaniesLoan = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesLoan.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (item.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Item não pertence a esta empresa." });
      }
      const allowedObrasLoan = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
      if (allowedObrasLoan !== null) {
        // obra do ITEM (origem do estoque) e obra DESTINO do empréstimo
        // (input.obraId) precisam ambas estar habilitadas. Central (null) ok.
        if (item.obraId != null && !allowedObrasLoan.has(Number(item.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para operar o almoxarifado desta obra (somente leitura)." });
        }
        if (input.obraId != null && !allowedObrasLoan.has(Number(input.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para registrar empréstimo nesta obra (somente leitura)." });
        }
      }

      const atual = parseFloat(String(item.quantidadeAtual) || "0");
      if (atual < input.quantidade)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente para empréstimo" });

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      const observacoes = [
        input.terceiroEmpresa ? `Empresa: ${input.terceiroEmpresa}` : null,
        input.observacoes?.trim() || null,
      ].filter(Boolean).join(" · ") || null;

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

      // Rev. 4539 — guard de empresa (visibilidade global é POR EMPRESA, nunca cross-tenant).
      const allowedCompaniesLn = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesLn.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const conditions: any[] = [eq(warehouseLoans.companyId, input.companyId)];
      if (input.data) {
        // filtrar por dia: mostra todos (emprestado + devolvido) do dia
        conditions.push(eq(warehouseLoans.dataEmprestimo, input.data));
      } else {
        // sem filtro de data: mostra só os abertos
        conditions.push(eq(warehouseLoans.status, "emprestado"));
      }
      // Rev. 4541 — REVERTE a visibilidade global aqui: empréstimo/devolução é
      // tela OPERACIONAL. Só aparecem empréstimos das obras que o usuário pode
      // OPERAR (getAlmoxAllowedObraIdSet). Visibilidade global fica só no
      // ESTOQUE (itens/consolidado). Central (obraId null) segue visível.
      const allowedLoanObras = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
      if (allowedLoanObras !== null) {
        const ids = [...allowedLoanObras];
        conditions.push(
          ids.length > 0
            ? or(isNull(warehouseLoans.obraId), inArray(warehouseLoans.obraId, ids))!
            : isNull(warehouseLoans.obraId)
        );
      }

      const rows = await db
        .select({
          id:                   warehouseLoans.id,
          companyId:            warehouseLoans.companyId,
          obraId:               warehouseLoans.obraId,
          obraNome:             obras.nome,
          itemId:               warehouseLoans.itemId,
          itemNome:             warehouseLoans.itemNome,
          quantidade:           warehouseLoans.quantidade,
          funcionarioId:        warehouseLoans.funcionarioId,
          funcionarioCodigo:    warehouseLoans.funcionarioCodigo,
          funcionarioNome:      warehouseLoans.funcionarioNome,
          // Rev. 4552 — foto do funcionário p/ facilitar a localização visual.
          funcionarioFotoUrl:   employees.fotoUrl,
          dataEmprestimo:       warehouseLoans.dataEmprestimo,
          horaEmprestimo:       warehouseLoans.horaEmprestimo,
          dataDevolucao:        warehouseLoans.dataDevolucao,
          horaDevolucao:        warehouseLoans.horaDevolucao,
          status:               warehouseLoans.status,
          observacoes:          warehouseLoans.observacoes,
          almoxarifeId:         warehouseLoans.almoxarifeId,
          almoxarifeNome:       warehouseLoans.almoxarifeNome,
          createdAt:            warehouseLoans.createdAt,
          fotoDevolucaoUrl:     warehouseLoans.fotoDevolucaoUrl,
          equipamentoProprioId: warehouseLoans.equipamentoProprioId,
          equipamentoLocadoId:  warehouseLoans.equipamentoLocadoId,
          assinaturaDevolucaoUrl: warehouseLoans.assinaturaDevolucaoUrl,
        })
        .from(warehouseLoans)
        .leftJoin(obras, eq(obras.id, warehouseLoans.obraId))
        .leftJoin(employees, eq(employees.id, warehouseLoans.funcionarioId))
        .where(and(...conditions))
        .orderBy(desc(warehouseLoans.createdAt));
      return rows;
    }),

  // Devolver item
  returnLoanById: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      // Rev. 4011 — Assinatura digital (dataURL PNG) opcional no ato da devolução.
      // Opcional pois nem todo posto de almoxarifado tem tablet disponível.
      assinaturaUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [loan] = await db
        .select()
        .from(warehouseLoans)
        .where(eq(warehouseLoans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado" });

      // Rev. 4541 — devolução só nas obras que o usuário pode OPERAR
      // (getAlmoxAllowedObraIdSet, mesma régua das demais escritas do
      // almoxarifado). Central (obraId null) segue liberada pela empresa.
      const allowedCompaniesRet = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompaniesRet.map((c: any) => c.id).includes(loan.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este empréstimo" });
      }
      if (loan.obraId != null && !(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, loan.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para operar o almoxarifado desta obra (somente leitura)." });
      }

      const hoje = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);

      await db
        .update(warehouseLoans)
        .set({
          status: "devolvido",
          dataDevolucao: hoje,
          horaDevolucao: hora,
          ...(input.assinaturaUrl ? { assinaturaDevolucaoUrl: input.assinaturaUrl } : {}),
        } as any)
        .where(eq(warehouseLoans.id, input.loanId));

      // Rev. 2392 — reativa item se estava soft-deleted (zerou via transferência).
      await db
        .update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${loan.quantidade}::numeric`,
          ativo: true,
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

  // ── EXTRAIR ITENS ALMOXARIFADO POR DOCUMENTO (IA) ─────────────
  // Rev. 4420 — Importação em lote de itens do catálogo a partir de PDF/imagem
  // (lista de materiais, planilha fotografada, orçamento). Retorna os itens
  // extraídos para validação antes de criar em massa.
  extrairItensAlmoxIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fileBase64: z.string().max(15_000_000),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      try {
        const { invokeAnthropicVision } = await import("../_core/llm");
        const prompt = `Analise este documento (lista de materiais, planilha, orçamento, catálogo ou foto) e extraia TODOS os itens listados para cadastrar em um sistema de almoxarifado de construção civil.

REGRAS:
- Extraia cada item separado como uma entrada da lista
- Ignore cabeçalhos, totais, subtotais, serviços e taxas administrativas
- Apenas materiais/produtos físicos que fazem sentido em um almoxarifado
- Se não há quantidade especificada, use 0
- Retorne SOMENTE JSON válido, sem texto adicional, sem markdown

{
  "itens": [
    {
      "nome": "nome técnico completo do material/produto",
      "unidade": "un|m|m²|m³|kg|L|cx|sc|gl|pç|rolo|barra",
      "categoria": "uma de: Ferramentas|Materiais de Construção|Elétrico|Hidráulico|EPIs|Tubulação|Cimento e Argamassa|Madeira|Metais|Tintas e Impermeabilizantes|Outros",
      "quantidade": número inteiro (0 se não especificado)
    }
  ]
}`;
        const mime = (input.mimeType === "image/jpg" ? "image/jpeg" : input.mimeType) as any;
        const text = await invokeAnthropicVision({
          prompt,
          base64: input.fileBase64,
          mimeType: mime,
          maxTokens: 4096,
        });
        let parsed: any = {};
        try {
          const clean = text.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
          parsed = JSON.parse(clean);
        } catch {
          const match = text.match(/\{[\s\S]+\}/);
          if (match) { try { parsed = JSON.parse(match[0]); } catch { /* ignore */ } }
        }
        const itens = (parsed.itens ?? [])
          .map((it: any) => ({
            nome: String(it.nome ?? "").trim().slice(0, 200),
            unidade: String(it.unidade ?? "un").slice(0, 20),
            categoria: String(it.categoria ?? "Outros").slice(0, 80),
            quantidade: Math.max(0, parseInt(it.quantidade) || 0),
          }))
          .filter((it: any) => it.nome.length > 1);
        console.log(`[extrairItensAlmoxIA] companyId=${input.companyId} itens=${itens.length}`);
        return { itens };
      } catch (err: any) {
        console.error("[extrairItensAlmoxIA] Erro:", err?.message ?? err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err?.message ?? "Erro ao analisar documento") });
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Rev. 2686 — GUARD DE ACESSO (antes inexistente: IDOR por `sessionId`).
      // O detalhe é alcançável pelo novo Histórico de Inventário, então
      // resolvemos a sessão e validamos tenant + obra ANTES de devolver itens.
      // Mantém a assinatura {sessionId} (callers existentes não mudam): a
      // company/obra vêm da própria sessão, espelhando historicoInventarioSemanal.
      const [sess] = await db
        .select({
          companyId: warehouseInventorySessions.companyId,
          obraId: warehouseInventorySessions.obraId,
        })
        .from(warehouseInventorySessions)
        .where(eq(warehouseInventorySessions.id, input.sessionId))
        .limit(1);
      if (!sess) return [];
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(sess.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (sess.obraId != null) {
        const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
        if (allowed !== null && !allowed.includes(sess.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
        }
      }

      // Rev. 2439 — LEFT JOIN com `almoxarifado_itens` pra trazer foto +
      // unidade pra cada card do Inventário Semanal (facilita aferição
      // visual no iPad sem precisar abrir o item separado).
      const rows = await db
        .select({
          id: warehouseInventorySessionItems.id,
          sessionId: warehouseInventorySessionItems.sessionId,
          itemId: warehouseInventorySessionItems.itemId,
          itemNome: warehouseInventorySessionItems.itemNome,
          quantidadeSistema: warehouseInventorySessionItems.quantidadeSistema,
          quantidadeFisica: warehouseInventorySessionItems.quantidadeFisica,
          diferenca: warehouseInventorySessionItems.diferenca,
          status: warehouseInventorySessionItems.status,
          observacoes: warehouseInventorySessionItems.observacoes,
          conferidoEm: warehouseInventorySessionItems.conferidoEm,
          itemFotoUrl: almoxarifadoItens.fotoUrl,
          itemUnidade: almoxarifadoItens.unidade,
          // Rev. 2530 — código interno pra busca/scanner no inventário.
          // Rev. 2549 — `itemCodigoBarras` REMOVIDO: a coluna `codigo_barras`
          // não existe em almoxarifado_itens (nem no schema Drizzle nem no
          // banco Neon). Selecionar `almoxarifadoItens.codigoBarras` (=undefined)
          // fazia o Drizzle lançar "Cannot convert undefined or null to object"
          // em TODA chamada → a lista de itens da sessão NUNCA carregava
          // (inventário inutilizável desde a Rev. 2530).
          itemCodigoInterno: almoxarifadoItens.codigoInterno,
        })
        .from(warehouseInventorySessionItems)
        .leftJoin(almoxarifadoItens, eq(almoxarifadoItens.id, warehouseInventorySessionItems.itemId))
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId))
        .orderBy(warehouseInventorySessionItems.id);
      return rows;
    }),

  // Rev. 2686 — HISTÓRICO de inventário semanal (read-only). Diferente do
  // getInventorySession (que só vê a semana atual): lista TODAS as sessões
  // passadas da company (+ obra opcional) ordenadas da mais recente p/ a mais
  // antiga, com o nome da obra resolvido. Detalhe por sessão = reuso de
  // getInventorySessionItems. Guards de tenant + obra espelham baiaListar.
  historicoInventarioSemanal: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant guard.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const conds: any[] = [eq(warehouseInventorySessions.companyId, input.companyId)];
      if (input.obraId === null) {
        conds.push(sql`${warehouseInventorySessions.obraId} IS NULL`);
      } else if (input.obraId !== undefined) {
        conds.push(eq(warehouseInventorySessions.obraId, input.obraId));
      }

      const rows = await db
        .select()
        .from(warehouseInventorySessions)
        .where(and(...conds))
        .orderBy(desc(warehouseInventorySessions.semanaRef), desc(warehouseInventorySessions.id))
        .limit(input.limit ?? 200);

      // Obra guard: usuários restritos só veem sessões de obras permitidas
      // (sessões do almoxarifado central — obraId null — ficam sempre visíveis).
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const filtered = allowed === null
        ? rows
        : rows.filter((r: any) => r.obraId == null || allowed.includes(r.obraId));

      // Resolve nome da obra (1 query).
      const obraIdsUnicos = Array.from(
        new Set(filtered.map((r: any) => r.obraId).filter((x: any) => x != null))
      ) as number[];
      const mapObras = new Map<number, string>();
      if (obraIdsUnicos.length > 0) {
        const obrasRows = await db
          .select({ id: obras.id, nome: obras.nome, codigo: obras.codigo })
          .from(obras)
          .where(inArray(obras.id, obraIdsUnicos));
        for (const o of obrasRows) {
          mapObras.set(o.id, o.codigo ? `${o.codigo} – ${o.nome}` : o.nome);
        }
      }

      return filtered.map((r: any) => ({
        ...r,
        obraNome: r.obraId == null ? "Almoxarifado Central" : (mapObras.get(r.obraId) ?? "Obra"),
      }));
    }),

  confirmInventoryItem: protectedProcedure
    .input(
      z.object({
        sessionItemId: z.number(),
        quantidadeFisica: z.number(),
        observacoes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sessionItem] = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.id, input.sessionItemId));
      if (!sessionItem) throw new TRPCError({ code: "NOT_FOUND" });

      // Rev. 4547 — tenant guard (antes inexistente: IDOR por sessionItemId).
      await assertInventorySessionAccess(db, ctx, sessionItem.sessionId);

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

      // Rev. 4547 — BUG FIX: NÃO marcar a sessão como "concluido" aqui.
      // O auto-conclude fazia o botão "Concluir Inventário" (que é quem chama
      // finishInventorySession e APLICA a baixa no estoque) nunca aparecer no
      // frontend (condição status === "em_andamento") → estoque nunca era
      // atualizado. A conclusão + baixa acontecem SOMENTE no finishInventorySession.
      await db
        .update(warehouseInventorySessions)
        .set({
          itensConferidos: conferidos,
          itensDivergentes: divergentes,
          status: "em_andamento",
        } as any)
        .where(eq(warehouseInventorySessions.id, sessionItem.sessionId));

      return { status, diferenca };
    }),

  finishInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Rev. 4547 — tenant guard (antes inexistente: IDOR por sessionId).
      const sess = await assertInventorySessionAccess(db, ctx, input.sessionId);

      // Idempotência: se a baixa já foi aplicada, não reaplicar (evita
      // sobrescrever movimentações posteriores do estoque com a contagem antiga).
      if ((sess as any).estoqueAplicadoEm) {
        return { success: true, divergenciasRegistradas: 0, jaAplicado: true };
      }

      // ── Aplicar correções de estoque ──────────────────────────────────────
      // Todos os itens contados (conferido + divergente) têm quantidadeFisica
      // definida. Atualiza almoxarifado_itens com a contagem física real.
      const sessionItems = await db
        .select()
        .from(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId));

      let divergenciasRegistradas = 0;
      for (const item of sessionItems) {
        if (item.quantidadeFisica != null && item.itemId) {
          // Item do catálogo (p/ valor unitário e unidade do ledger).
          const [cat] = await db
            .select({
              unidade: almoxarifadoItens.unidade,
              valorUnitario: almoxarifadoItens.valorUnitario,
            })
            .from(almoxarifadoItens)
            .where(eq(almoxarifadoItens.id, item.itemId))
            .limit(1);

          await db
            .update(almoxarifadoItens)
            .set({
              quantidadeAtual: String(item.quantidadeFisica),
              atualizadoEm: new Date(),
            } as any)
            .where(eq(almoxarifadoItens.id, item.itemId));

          // Rev. 4547 — LEDGER PERMANENTE: toda divergência aplicada vira uma
          // linha em warehouse_inventory_ajustes (sobrevive a cancelamentos e
          // permite medir o erro de processo do almoxarifado ao longo do tempo).
          const dif = parseFloat(String(item.diferenca ?? "0")) || 0;
          if (Math.abs(dif) >= 0.001) {
            const vu = cat?.valorUnitario != null ? parseFloat(String(cat.valorUnitario)) : null;
            const inserted = await db
              .insert(warehouseInventoryAjustes)
              .values({
                companyId: sess.companyId,
                obraId: sess.obraId ?? null,
                sessionId: input.sessionId,
                sessionItemId: item.id,
                semanaRef: sess.semanaRef ?? null,
                itemId: item.itemId,
                itemNome: item.itemNome ?? null,
                unidade: cat?.unidade ?? null,
                quantidadeSistema: String(item.quantidadeSistema ?? "0"),
                quantidadeFisica: String(item.quantidadeFisica),
                diferenca: String(dif),
                valorUnitario: vu != null && !isNaN(vu) ? String(vu) : null,
                valorDiferenca: vu != null && !isNaN(vu) ? (dif * vu).toFixed(2) : null,
                observacoes: item.observacoes ?? null,
                registradoPorId: ctx.user.id,
                registradoPorNome: ctx.user.name || "",
              } as any)
              .onConflictDoNothing()
              .returning({ id: warehouseInventoryAjustes.id });
            // Conta só o que foi realmente inserido (conflito = já registrado antes).
            if (inserted.length > 0) divergenciasRegistradas++;
          }
        }
      }

      await db
        .update(warehouseInventorySessions)
        .set({
          status: "concluido",
          concluidoEm: new Date().toISOString(),
          estoqueAplicadoEm: new Date().toISOString(),
        } as any)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true, divergenciasRegistradas };
    }),

  cancelInventorySession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Rev. 4547 — tenant guard (antes inexistente: IDOR por sessionId).
      await assertInventorySessionAccess(db, ctx, input.sessionId);

      await db
        .delete(warehouseInventorySessionItems)
        .where(eq(warehouseInventorySessionItems.sessionId, input.sessionId));

      await db
        .delete(warehouseInventorySessions)
        .where(eq(warehouseInventorySessions.id, input.sessionId));

      return { success: true };
    }),

  // Rev. 4547 — LISTA DO LEDGER DE DIVERGÊNCIAS (read-only). Base para medir
  // o erro de processo do almoxarifado ao longo do tempo (qtd e R$).
  listarDivergenciasInventario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const conds: any[] = [eq(warehouseInventoryAjustes.companyId, input.companyId)];
      if (input.obraId === null) {
        conds.push(sql`${warehouseInventoryAjustes.obraId} IS NULL`);
      } else if (input.obraId !== undefined) {
        conds.push(eq(warehouseInventoryAjustes.obraId, input.obraId));
      }

      const rows = await db
        .select()
        .from(warehouseInventoryAjustes)
        .where(and(...conds))
        .orderBy(desc(warehouseInventoryAjustes.criadoEm), desc(warehouseInventoryAjustes.id))
        .limit(input.limit ?? 500);

      // Obra guard: usuários restritos só veem divergências de obras permitidas.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const filtered = allowed === null
        ? rows
        : rows.filter((r: any) => r.obraId == null || allowed.includes(r.obraId));

      // Resolve nome da obra (1 query).
      const obraIdsUnicos = Array.from(
        new Set(filtered.map((r: any) => r.obraId).filter((x: any) => x != null))
      ) as number[];
      const mapObras = new Map<number, string>();
      if (obraIdsUnicos.length > 0) {
        const obrasRows = await db
          .select({ id: obras.id, nome: obras.nome, codigo: obras.codigo })
          .from(obras)
          .where(inArray(obras.id, obraIdsUnicos));
        for (const o of obrasRows) {
          mapObras.set(o.id, o.codigo ? `${o.codigo} – ${o.nome}` : o.nome);
        }
      }

      return filtered.map((r: any) => ({
        ...r,
        obraNome: r.obraId == null ? "Almoxarifado Central" : (mapObras.get(r.obraId) ?? "Obra"),
      }));
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
      funcionarioCodigo: z.string().optional(),
      terceiroNome:      z.string().optional(),
      terceiroEmpresa:   z.string().optional(),
      obraId:            z.number().optional(),
      obraNome:          z.string().optional(),
      motivo:            z.string().optional(),
      observacoes:       z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Rev. 4005 — Saída de Insumos agora aceita terceiro (igual Empréstimo de Ferramentas)
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
          .where(and(eq(employees.companyId, input.companyId), eq(employees.codigoInterno, input.funcionarioCodigo)))
          .limit(1);
        if (!funcionario) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado pelo código" });
        funcionarioId = funcionario.id;
        funcionarioNome = funcionario.nomeCompleto;
        funcionarioCodigo = input.funcionarioCodigo;
      }

      // Busca item
      const [item] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      // Verifica estoque
      const atual = parseFloat(String(item.quantidadeAtual) || "0");
      if (atual < input.quantidade) throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente. Disponível: ${atual} ${item.unidade || "un"}` });

      const observacoesFinal = input.terceiroEmpresa
        ? `Empresa: ${input.terceiroEmpresa}${input.observacoes ? ` — ${input.observacoes}` : ""}`
        : (input.observacoes || null);

      // Registra saída de insumo
      await db.insert(almoxarifadoSaidasInsumo).values({
        companyId:         input.companyId,
        itemId:            input.itemId,
        itemNome:          item.nome,
        unidade:           item.unidade || "un",
        quantidade:        String(input.quantidade),
        funcionarioId,
        funcionarioNome,
        funcionarioCodigo,
        obraId:            input.obraId || null,
        obraNome:          input.obraNome || null,
        motivo:            input.motivo || null,
        observacoes:       observacoesFinal,
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
        motivo:       `Insumo para ${funcionarioNome}${input.terceiroEmpresa ? ` (${input.terceiroEmpresa})` : ""}${input.motivo ? ` — ${input.motivo}` : ""}`,
        obraId:       input.obraId || null,
        obraNome:     input.obraNome || null,
        usuarioNome:  ctx.user.name || "Sistema",
      } as any);

      return { funcionarioNome, itemNome: item.nome };
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

  // Rev. 4039 — Repaginação do Dashboard Almoxarifado & Equipamentos:
  // agregação por FUNCIONÁRIO pedida pelo usuário — (a) quem mais retira
  // material (almoxarifado_saidas_insumo) e (b) quem está com
  // ferramentas/equipamentos emprestados AGORA (warehouse_loans status
  // 'emprestado'). Cálculo feito no banco (GROUP BY sobre a base inteira,
  // não limitada a 200/2000 registros como as listagens client-side).
  dashboardPorFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a essa empresa." });
      }
      const cid = input.companyId;

      const retiradasRows = await db.execute(sql`
        SELECT
          s.funcionario_id                                   AS funcionario_id,
          COALESCE(s.funcionario_nome, '— sem funcionário —') AS funcionario_nome,
          s.funcionario_codigo                                AS funcionario_codigo,
          COUNT(*)::int                                       AS retiradas,
          COALESCE(SUM(s.quantidade), 0)::float                AS qtd_total,
          COALESCE(SUM(s.quantidade * COALESCE(i.valor_unitario, 0)), 0)::float AS valor_total,
          MAX(s.created_at)                                    AS ultima_retirada
        FROM almoxarifado_saidas_insumo s
        LEFT JOIN almoxarifado_itens i ON i.id = s.item_id
        WHERE s.company_id = ${cid} AND s.funcionario_id IS NOT NULL
        GROUP BY s.funcionario_id, s.funcionario_nome, s.funcionario_codigo
        ORDER BY valor_total DESC
        LIMIT 25
      `);

      const emprestadosRows = await db.execute(sql`
        SELECT
          l.funcionario_id                                    AS funcionario_id,
          COALESCE(l.funcionario_nome, '— sem funcionário —')  AS funcionario_nome,
          l.funcionario_codigo                                 AS funcionario_codigo,
          COUNT(*)::int                                        AS itens_em_maos,
          MIN(l.data_emprestimo)                                AS emprestimo_mais_antigo
        FROM warehouse_loans l
        WHERE l.company_id = ${cid} AND l.status = 'emprestado' AND l.funcionario_id IS NOT NULL
        GROUP BY l.funcionario_id, l.funcionario_nome, l.funcionario_codigo
        ORDER BY itens_em_maos DESC
        LIMIT 25
      `);

      const toRows = (r: any) => (r as any)?.rows ?? r ?? [];
      return {
        topRetiradas: toRows(retiradasRows),
        comEmprestimoAberto: toRows(emprestadosRows),
      };
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

      // ── AUTHZ (Rev. 2392) — fecha IDOR cross-tenant ──
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a essa empresa." });
      }

      // 1. Busca item de origem
      const [itemOrigem] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.itemIdOrigem));
      if (!itemOrigem) throw new TRPCError({ code: "NOT_FOUND", message: "Item de origem não encontrado." });
      if (itemOrigem.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Item de outra empresa." });
      }
      // Rev. 4016 — Item 5: usa o guard ESPECÍFICO do almoxarifado (soma
      // alocação operacional via obra_funcionarios), não o guard geral de
      // segurança — senão um usuário comum alocado na obra (mas sem
      // allowed_obra_ids/grupo "todas as obras") tomava FORBIDDEN e só
      // admin/admin_master conseguiam transferir.
      if (itemOrigem.obraId && !(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, itemOrigem.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra origem." });
      }
      const destinoObraIdAuthz = input.destinoTipo === "obra" ? (input.destinoObraId ?? null) : null;
      if (input.destinoTipo === "obra") {
        if (!destinoObraIdAuthz || !Number.isInteger(destinoObraIdAuthz) || destinoObraIdAuthz <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Destino do tipo 'obra' exige destinoObraId inteiro positivo." });
        }
        // Destino: apenas valida que a obra pertence à mesma empresa (tenant guard).
        // Não exige acesso do usuário à obra destino — qualquer operador com acesso
        // ao módulo almoxarifado pode transferir material para qualquer obra ativa.
        const destinoObraCheck = await db.execute(sql`SELECT id FROM obras WHERE id = ${destinoObraIdAuthz} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL LIMIT 1`);
        const destinoObraRows = (destinoObraCheck as any)?.rows ?? destinoObraCheck ?? [];
        if (destinoObraRows.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Obra destino não pertence a esta empresa." });
        }
      }

      // Rev. 2392 — origem INFERIDA do próprio item (não confia no client → log fidedigno).
      const origemTipoServer: "central" | "obra" = itemOrigem.obraId ? "obra" : "central";
      const origemObraIdServer = itemOrigem.obraId ?? null;
      let origemObraNomeServer: string | null = null;
      if (origemObraIdServer !== null) {
        const r = await db.execute(sql`SELECT codigo, nome FROM obras WHERE id = ${origemObraIdServer} LIMIT 1`);
        const row = ((r as any)?.rows ?? r ?? [])[0];
        if (row) origemObraNomeServer = row.codigo ? `${row.codigo} – ${row.nome}` : row.nome;
      }
      // Resolve nome do destino server-side
      let destinoObraNomeServer: string | null = null;
      if (destinoObraIdAuthz !== null) {
        const r = await db.execute(sql`SELECT codigo, nome FROM obras WHERE id = ${destinoObraIdAuthz} LIMIT 1`);
        const row = ((r as any)?.rows ?? r ?? [])[0];
        if (row) destinoObraNomeServer = row.codigo ? `${row.codigo} – ${row.nome}` : row.nome;
      }
      // Bloqueia origem == destino (paridade com lote)
      if (origemTipoServer === input.destinoTipo && origemObraIdServer === destinoObraIdAuthz) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Item já está no almoxarifado de destino." });
      }

      const estoqueAtual = parseFloat(String(itemOrigem.quantidadeAtual) || "0");
      if (estoqueAtual < input.quantidade) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente. Disponível: ${estoqueAtual} ${itemOrigem.unidade}.` });
      }

      // 2. Débita da origem com GUARD de concorrência (Rev. 2392).
      // Se for item de obra (obraId IS NOT NULL) e o saldo zerar, marca
      // ativo=false na mesma UPDATE pra "sumir" da lista (que já filtra
      // por ativo=true). Itens centrais ficam visíveis mesmo a 0 (catálogo).
      const debitado = await db.update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}`,
          ativo: sql`CASE WHEN ${almoxarifadoItens.obraId} IS NOT NULL AND (${almoxarifadoItens.quantidadeAtual}::numeric - ${input.quantidade}) <= 0 THEN false ELSE ${almoxarifadoItens.ativo} END`,
        } as any)
        .where(and(
          eq(almoxarifadoItens.id, input.itemIdOrigem),
          sql`${almoxarifadoItens.quantidadeAtual}::numeric >= ${input.quantidade}`,
        ))
        .returning({ id: almoxarifadoItens.id });
      if (!debitado || debitado.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque mudou durante a transferência (concorrência). Tente novamente." });
      }

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
        // Rev. 2392 — reativa se estava inativo (item zerou antes via transferência)
        await db.update(almoxarifadoItens)
          .set({
            quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${input.quantidade}`,
            ativo: true,
          } as any)
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

      // 4. Registra a transferência — Rev. 2392: origem/destino server-side (anti-spoofing)
      await db.insert(almoxarifadoTransferencias).values({
        companyId:      input.companyId,
        itemIdOrigem:   input.itemIdOrigem,
        itemIdDestino,
        itemNome:       itemOrigem.nome,
        unidade:        itemOrigem.unidade,
        quantidade:     String(input.quantidade),
        origemTipo:     origemTipoServer,
        origemObraId:   origemObraIdServer,
        origemObraNome: origemObraNomeServer,
        destinoTipo:    input.destinoTipo,
        destinoObraId:  destinoObraId,
        destinoObraNome: destinoObraNomeServer,
        motivo:         input.motivo ?? null,
        almoxarifeId:   input.almoxarifeId ?? null,
        almoxarifeNome: input.almoxarifeNome ?? null,
      } as any);

      return { success: true, itemNome: itemOrigem.nome, novoEstoque: estoqueAtual - input.quantidade };
    }),

  // ── TRANSFERIR EM LOTE (Rev. 2390) ───────────────────────────
  // Recebe N linhas {itemIdOrigem, quantidade} pra um ÚNICO destino comum
  // (mesma obra/central) + motivo. Processa item-a-item reusando a lógica
  // do `createTransferencia` (débito origem → upsert destino → registro
  // em almoxarifado_transferencias). Não usa transação multi-item — se
  // uma linha falhar (estoque insuficiente, item sumiu), as demais já
  // processadas permanecem aplicadas. Retorna {sucessos, falhas} pra UI
  // exibir resumo.
  createTransferenciaLote: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      itens:           z.array(z.object({
        itemIdOrigem: z.number(),
        quantidade:   z.number().positive(),
      })).min(1),
      destinoTipo:     z.enum(["central", "obra"]),
      destinoObraId:   z.number().optional(),
      destinoObraNome: z.string().optional(),
      motivo:          z.string().optional(),
      almoxarifeId:    z.number().optional(),
      almoxarifeNome:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // ── AUTHZ: empresa do user + acesso à obra destino ──
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a essa empresa." });
      }
      const destinoObraId = input.destinoTipo === "obra" ? (input.destinoObraId ?? null) : null;
      if (input.destinoTipo === "obra") {
        if (!destinoObraId || !Number.isInteger(destinoObraId) || destinoObraId <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Destino do tipo 'obra' exige destinoObraId inteiro positivo." });
        }
        // Destino: apenas valida que a obra pertence à mesma empresa (tenant guard).
        // Não exige acesso do usuário à obra destino — qualquer operador com acesso
        // ao módulo almoxarifado pode transferir material para qualquer obra ativa.
        const destinoCheckLote = await db.execute(sql`SELECT id FROM obras WHERE id = ${destinoObraId} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL LIMIT 1`);
        const destinoRowsLote = (destinoCheckLote as any)?.rows ?? destinoCheckLote ?? [];
        if (destinoRowsLote.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Obra destino não pertence a esta empresa." });
        }
      }

      // Resolve nome da obra destino server-side (não confia no client)
      let destinoObraNomeResolvido: string | null = null;
      if (destinoObraId !== null) {
        const r = await db.execute(sql`SELECT codigo, nome FROM obras WHERE id = ${destinoObraId} LIMIT 1`);
        const row = ((r as any)?.rows ?? r ?? [])[0];
        if (row) destinoObraNomeResolvido = row.codigo ? `${row.codigo} – ${row.nome}` : row.nome;
      }

      const sucessos: Array<{ itemIdOrigem: number; itemNome: string; quantidade: number }> = [];
      const falhas: Array<{ itemIdOrigem: number; itemNome?: string; motivo: string }> = [];

      for (const linha of input.itens) {
        try {
          // 1. Busca item origem (fora da tx pra validações cedo)
          const [itemOrigem] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, linha.itemIdOrigem));
          if (!itemOrigem) {
            falhas.push({ itemIdOrigem: linha.itemIdOrigem, motivo: "Item não encontrado." });
            continue;
          }
          if (itemOrigem.companyId !== input.companyId) {
            falhas.push({ itemIdOrigem: linha.itemIdOrigem, itemNome: itemOrigem.nome, motivo: "Item de outra empresa." });
            continue;
          }
          // AUTHZ: user deve ter acesso à obra origem também (guard almox-específico — Rev. 4016 Item 5)
          if (itemOrigem.obraId && !(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, itemOrigem.obraId))) {
            falhas.push({ itemIdOrigem: linha.itemIdOrigem, itemNome: itemOrigem.nome, motivo: "Sem acesso à obra origem." });
            continue;
          }

          const origemTipo: "central" | "obra" = itemOrigem.obraId ? "obra" : "central";
          const origemObraId = itemOrigem.obraId ?? null;
          let origemObraNome: string | null = null;
          if (origemObraId !== null) {
            const r = await db.execute(sql`SELECT codigo, nome FROM obras WHERE id = ${origemObraId} LIMIT 1`);
            const row = ((r as any)?.rows ?? r ?? [])[0];
            if (row) origemObraNome = row.codigo ? `${row.codigo} – ${row.nome}` : row.nome;
          }

          if (origemTipo === input.destinoTipo && origemObraId === destinoObraId) {
            falhas.push({ itemIdOrigem: linha.itemIdOrigem, itemNome: itemOrigem.nome, motivo: "Item já está no almoxarifado de destino." });
            continue;
          }

          const estoqueAtual = parseFloat(String(itemOrigem.quantidadeAtual) || "0");
          if (estoqueAtual < linha.quantidade) {
            falhas.push({ itemIdOrigem: linha.itemIdOrigem, itemNome: itemOrigem.nome, motivo: `Estoque insuficiente (disp.: ${estoqueAtual} ${itemOrigem.unidade}).` });
            continue;
          }

          // ── TX ATÔMICA POR LINHA: débito + upsert destino + registro ──
          await db.transaction(async (tx: any) => {
            // 2. Débita origem (com guard de estoque pra concorrência).
            // Rev. 2392 — Se for item de obra e o saldo zerar, marca ativo=false
            // pra "sumir" da lista (que filtra por ativo=true). Centrais ficam.
            const debitado = await tx.update(almoxarifadoItens)
              .set({
                quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric - ${linha.quantidade}`,
                ativo: sql`CASE WHEN ${almoxarifadoItens.obraId} IS NOT NULL AND (${almoxarifadoItens.quantidadeAtual}::numeric - ${linha.quantidade}) <= 0 THEN false ELSE ${almoxarifadoItens.ativo} END`,
              } as any)
              .where(and(
                eq(almoxarifadoItens.id, linha.itemIdOrigem),
                sql`${almoxarifadoItens.quantidadeAtual}::numeric >= ${linha.quantidade}`,
              ))
              .returning({ id: almoxarifadoItens.id });
            if (!debitado || debitado.length === 0) {
              throw new Error("Estoque mudou durante a transferência (concorrência).");
            }

            // 3. Upsert no destino
            const destinoConditions = [
              eq(almoxarifadoItens.companyId, input.companyId),
              eq(almoxarifadoItens.nome, itemOrigem.nome),
            ];
            if (destinoObraId !== null) {
              destinoConditions.push(eq(almoxarifadoItens.obraId, destinoObraId));
            } else {
              destinoConditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
            }
            const existingDestino = await tx.select().from(almoxarifadoItens).where(and(...destinoConditions));
            let itemIdDestino: number;
            if (existingDestino.length > 0) {
              itemIdDestino = existingDestino[0].id;
              // Rev. 2392 — reativa se estava inativo (item zerou antes via transferência)
              await tx.update(almoxarifadoItens)
                .set({
                  quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${linha.quantidade}`,
                  ativo: true,
                } as any)
                .where(eq(almoxarifadoItens.id, itemIdDestino));
            } else {
              const [novoItem] = await tx.insert(almoxarifadoItens).values({
                companyId: input.companyId,
                obraId: destinoObraId,
                nome: itemOrigem.nome,
                unidade: itemOrigem.unidade,
                categoria: itemOrigem.categoria,
                codigoInterno: itemOrigem.codigoInterno,
                quantidadeAtual: String(linha.quantidade),
                quantidadeMinima: "0",
                fotoUrl: (itemOrigem as any).fotoUrl,
                ativo: true,
                criadoPorId: ctx.user?.id ?? null,
                criadoPorNome: ctx.user?.name || `Transferência em lote`,
              } as any).returning({ id: almoxarifadoItens.id });
              itemIdDestino = novoItem.id;
            }

            // 4. Registro
            await tx.insert(almoxarifadoTransferencias).values({
              companyId:       input.companyId,
              itemIdOrigem:    linha.itemIdOrigem,
              itemIdDestino,
              itemNome:        itemOrigem.nome,
              unidade:         itemOrigem.unidade,
              quantidade:      String(linha.quantidade),
              origemTipo,
              origemObraId,
              origemObraNome,
              destinoTipo:     input.destinoTipo,
              destinoObraId,
              destinoObraNome: destinoObraNomeResolvido,
              motivo:          input.motivo ?? null,
              almoxarifeId:    input.almoxarifeId ?? null,
              almoxarifeNome:  input.almoxarifeNome ?? null,
            } as any);
          });

          sucessos.push({ itemIdOrigem: linha.itemIdOrigem, itemNome: itemOrigem.nome, quantidade: linha.quantidade });
        } catch (e: any) {
          falhas.push({ itemIdOrigem: linha.itemIdOrigem, motivo: e?.message || "Erro desconhecido." });
        }
      }

      return { sucessos, falhas, total: input.itens.length };
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        sql`${comprasOrdens.status} IN ('pendente', 'aprovada', 'parcial')`,
        // Rev. 4339 — excluir OCs de locação: equipamentos têm fluxo próprio
        // em "RECEBER LOCAÇÃO" (/equipamentos/locados). "Receber Material" só mostra
        // OCs de compra de material.
        sql`(${comprasOrdens.isLocacao} IS NULL OR ${comprasOrdens.isLocacao} = false)`,
      ];
      // Rev. 2384 — autorização por obra (admin/admin_master = null = todas).
      // Aplica em AMBOS os caminhos (com ou sem obraId explícito) pra evitar
      // IDOR horizontal: user com acesso só à obra A não pode pedir obra B.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (input.obraId) {
        if (allowed !== null && !allowed.includes(input.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra solicitada" });
        }
        conditions.push(eq(comprasOrdens.obraId, input.obraId));
      } else if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(comprasOrdens.obraId, allowed));
      }

      // Rev. 4754 — contexto pro recebimento: obra de DESTINO da OC, quem criou,
      // e a SC de origem (nº, solicitante, data). Pedido do usuário: no Central
      // apareciam OCs "sem cara" e ficava a dúvida se o destino estava errado —
      // na verdade todas têm obra de destino, só faltava mostrar.
      const ocs = await db
        .select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          fornecedorNome: comprasOrdens.fornecedorNome,
          obraId: comprasOrdens.obraId,
          obraNome: obras.nome,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          status: comprasOrdens.status,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
          criadoPorNome: comprasOrdens.criadoPorNome,
          scId: comprasSolicitacoes.id,
          numeroSc: comprasSolicitacoes.numeroSc,
          scSolicitante: comprasSolicitacoes.criadoPorNome,
          scCriadoEm: comprasSolicitacoes.criadoEm,
        })
        .from(comprasOrdens)
        .leftJoin(obras, eq(obras.id, comprasOrdens.obraId))
        .leftJoin(comprasSolicitacoes, eq(comprasSolicitacoes.id, comprasOrdens.solicitacaoId))
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

      // Rev. 4424 — lista de peças para conferência (OC de locação)
      let listaRecebimento: { id: number; descricao: string; unidade: string; quantidade: number; valor_unitario: number }[] = [];
      try {
        const lr = await db.execute(sql`
          SELECT id, descricao, unidade, quantidade::float8, COALESCE(valor_unitario, 0)::float8 AS valor_unitario
          FROM oc_lista_recebimento
          WHERE oc_id = ${input.ordemCompraId} AND company_id = ${input.companyId}
          ORDER BY id
        `);
        listaRecebimento = lr.rows as any[];
      } catch { /* tabela ainda não existe — ignora */ }

      return {
        oc: {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          obraId: oc.obraId,
          status: oc.status,
          tipo: oc.tipo ?? "compra",
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
        listaRecebimento,
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
          // Rev. 2389 — Mesma guarda do fluxo OC→Almox: nada de serviço/
          // administrativo/tributo cair no almoxarifado por engano via
          // "recebimento inteligente" com `itemNovo: true`.
          const { classificarNaturezaItemAlmox } = await import("./compras");
          const classif = classificarNaturezaItemAlmox(item.itemNome, item.unidade);
          if (!classif.material) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `"${item.itemNome}" parece ser ${classif.motivo} — não pode entrar no Almoxarifado. Lance esse item como Despesa/Serviço no módulo Financeiro/Compras, não como estoque.`,
            });
          }
          const { criarItemAlmoxarifadoComCodigo } = await import("./compras");
          const newItem = await criarItemAlmoxarifadoComCodigo(db, input.companyId, {
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
          });
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
            // Rev. 2392 — reativa item se estava soft-deleted (zerou via transferência).
            await db
              .update(almoxarifadoItens)
              .set({ quantidadeAtual: String(depois), ativo: true } as any)
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

        // Rev. 4722 — o recebimento pelo Almoxarifado marcava a OC como entregue SEM
        // passar pela integração financeira (só atualizarStatusOrdem criava o título).
        // Resultado: OCs entregues que nunca apareciam no Contas a Pagar. Self-heal
        // garante o título (a_pagar) respeitando as exclusões (FD, cartão, total 0).
        try {
          const { garantirEntryDaOC } = await import("../services/purchaseFinancialBridge");
          await garantirEntryDaOC(input.ordemCompraId, input.companyId);
        } catch (e) {
          console.error("[Almox→Financeiro] Falha ao garantir título da OC", input.ordemCompraId, e);
        }
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

  // ═══════════════════════════════════════════════════════════════════════
  // Rev. 2373 — INVENTÁRIO VISUAL DE BAIAS (areia, pedra, lajota, granel)
  // ═══════════════════════════════════════════════════════════════════════
  // Operador olha a baia física e toca em 1 de 5 botões (0/25/50/75/100%).
  // Foto opcional, observação opcional, histórico fica registrado.
  // Tenant + obra isolation em TODAS as queries/mutations.
  // Hardening pós code review (Rev. 2373): checa companyId no allowlist do
  // usuário (getCompaniesForUser) ANTES de qualquer SELECT/INSERT/UPDATE, e
  // valida que obra.companyId === input.companyId no baiaCriar pra impedir
  // mismatch cross-tenant (obra de empresa A com company_id da empresa B).

  baiaListar: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional(), incluirInativas: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant guard: rejeita se a company não pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 4539 — VISIBILIDADE GLOBAL (leitura): baias de todas as obras
      // visíveis pra quem tem acesso ao módulo (leituras/edições seguem com
      // guards de escrita próprios).
      const conds: any[] = [eq(almoxarifadoBaias.companyId, input.companyId)];
      if (!input.incluirInativas) conds.push(eq(almoxarifadoBaias.ativo, true));
      if (input.obraId !== undefined) conds.push(eq(almoxarifadoBaias.obraId, input.obraId));
      const baias = await db.select().from(almoxarifadoBaias).where(and(...conds)).orderBy(desc(almoxarifadoBaias.criadoEm));
      if (baias.length === 0) return [];

      // Última leitura por baia (1 query agregada).
      const baiaIds = baias.map((b: any) => b.id);
      const ultimas: any = await db.execute(sql`
        SELECT DISTINCT ON (baia_id) baia_id, id, percentual, foto_url, observacoes,
               lida_por_id, lida_por_nome, lida_em
        FROM almoxarifado_baia_leituras
        WHERE baia_id IN (${sql.join(baiaIds.map((id: number) => sql`${id}`), sql`, `)})
        ORDER BY baia_id, lida_em DESC
      `);
      const mapUlt = new Map<number, any>();
      for (const r of (ultimas?.rows ?? [])) mapUlt.set(Number(r.baia_id), r);

      // Penúltima leitura por baia (pra calcular tendência subiu/desceu).
      const penultimas: any = await db.execute(sql`
        SELECT baia_id, percentual, lida_em FROM (
          SELECT baia_id, percentual, lida_em,
                 ROW_NUMBER() OVER (PARTITION BY baia_id ORDER BY lida_em DESC) rn
          FROM almoxarifado_baia_leituras
          WHERE baia_id IN (${sql.join(baiaIds.map((id: number) => sql`${id}`), sql`, `)})
        ) t WHERE rn = 2
      `);
      const mapPenult = new Map<number, any>();
      for (const r of (penultimas?.rows ?? [])) mapPenult.set(Number(r.baia_id), r);

      // Nome da obra (1 query).
      const obraIdsUnicos = Array.from(new Set(baias.map((b: any) => b.obraId)));
      const obrasRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIdsUnicos));
      const mapObras = new Map<number, string>();
      for (const o of obrasRows) mapObras.set(o.id, o.nome);

      // Normaliza raw SQL rows pra camelCase (evita drift com o resto da API).
      const toCamel = (r: any) => r ? ({
        id: Number(r.id),
        baiaId: Number(r.baia_id),
        percentual: Number(r.percentual),
        volumeEstimado: r.volume_estimado != null ? Number(r.volume_estimado) : null,
        fotoUrl: r.foto_url ?? null,
        observacoes: r.observacoes ?? null,
        lidaPorId: r.lida_por_id != null ? Number(r.lida_por_id) : null,
        lidaPorNome: r.lida_por_nome ?? null,
        lidaEm: r.lida_em ?? null,
      }) : null;
      return baias.map((b: any) => ({
        ...b,
        obraNome: mapObras.get(b.obraId) ?? null,
        ultimaLeitura: toCamel(mapUlt.get(b.id)),
        leituraAnterior: toCamel(mapPenult.get(b.id)),
      }));
    }),

  baiaCriar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      itemId: z.number().nullable().optional(),
      nome: z.string().min(1).max(200),
      material: z.string().min(1).max(100),
      unidade: z.string().max(20).default("m³"),
      capacidadeEstimada: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      fotoBase64: z.string().optional(),
      fotoMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Company guard + obra guard + verificar obra.companyId === input.companyId.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      const [obraRow] = await db.select({ id: obras.id, companyId: obras.companyId }).from(obras).where(eq(obras.id, input.obraId));
      if (!obraRow || obraRow.companyId !== input.companyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Obra não pertence à empresa informada." });
      }
      let fotoUrl: string | null = null;
      if (input.fotoBase64 && input.fotoMime) {
        const buf = Buffer.from(input.fotoBase64, "base64");
        const ext = input.fotoMime.includes("png") ? "png" : input.fotoMime.includes("webp") ? "webp" : "jpg";
        const hash = crypto.createHash("sha1").update(`${input.companyId}-${input.obraId}-${input.nome}-${Date.now()}`).digest("hex").slice(0, 12);
        const key = `almoxarifado/baias/${input.companyId}/${hash}.${ext}`;
        const { url } = await storagePut(key, buf, input.fotoMime);
        fotoUrl = url;
      }
      const [novo] = await db.insert(almoxarifadoBaias).values({
        companyId: input.companyId,
        obraId: input.obraId,
        itemId: input.itemId ?? null,
        nome: input.nome.trim(),
        material: input.material.trim(),
        unidade: input.unidade,
        capacidadeEstimada: input.capacidadeEstimada != null ? String(input.capacidadeEstimada) : null,
        fotoUrl,
        observacoes: input.observacoes ?? null,
        ativo: true,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name ?? null,
      } as any).returning();
      return novo;
    }),

  baiaEditar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(1).max(200).optional(),
      material: z.string().min(1).max(100).optional(),
      unidade: z.string().max(20).optional(),
      capacidadeEstimada: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      fotoBase64: z.string().optional(),
      fotoMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [existing] = await db.select().from(almoxarifadoBaias).where(and(
        eq(almoxarifadoBaias.id, input.id),
        eq(almoxarifadoBaias.companyId, input.companyId),
      ));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, existing.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      const patch: any = { atualizadoEm: new Date().toISOString() };
      if (input.nome !== undefined) patch.nome = input.nome.trim();
      if (input.material !== undefined) patch.material = input.material.trim();
      if (input.unidade !== undefined) patch.unidade = input.unidade;
      if (input.capacidadeEstimada !== undefined) patch.capacidadeEstimada = input.capacidadeEstimada != null ? String(input.capacidadeEstimada) : null;
      if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
      if (input.fotoBase64 && input.fotoMime) {
        const buf = Buffer.from(input.fotoBase64, "base64");
        const ext = input.fotoMime.includes("png") ? "png" : input.fotoMime.includes("webp") ? "webp" : "jpg";
        const hash = crypto.createHash("sha1").update(`${input.companyId}-${input.id}-${Date.now()}`).digest("hex").slice(0, 12);
        const key = `almoxarifado/baias/${input.companyId}/${hash}.${ext}`;
        const { url } = await storagePut(key, buf, input.fotoMime);
        patch.fotoUrl = url;
      }
      await db.update(almoxarifadoBaias).set(patch).where(eq(almoxarifadoBaias.id, input.id));
      return { success: true };
    }),

  baiaDesativar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [existing] = await db.select().from(almoxarifadoBaias).where(and(
        eq(almoxarifadoBaias.id, input.id),
        eq(almoxarifadoBaias.companyId, input.companyId),
      ));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, existing.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      await db.update(almoxarifadoBaias).set({ ativo: false, atualizadoEm: new Date().toISOString() } as any).where(eq(almoxarifadoBaias.id, input.id));
      return { success: true };
    }),

  baiaLeiturasListar: protectedProcedure
    .input(z.object({ companyId: z.number(), baiaId: z.number(), limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [b] = await db.select().from(almoxarifadoBaias).where(and(
        eq(almoxarifadoBaias.id, input.baiaId),
        eq(almoxarifadoBaias.companyId, input.companyId),
      ));
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, b.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      const rows = await db.select().from(almoxarifadoBaiaLeituras)
        .where(and(
          eq(almoxarifadoBaiaLeituras.companyId, input.companyId),
          eq(almoxarifadoBaiaLeituras.baiaId, input.baiaId),
        ))
        .orderBy(desc(almoxarifadoBaiaLeituras.lidaEm))
        // Rev. 2421 — bump 50→200 (user pediu "histórico completo" no click do card).
        .limit(input.limit ?? 200);
      return rows;
    }),

  baiaLeituraRegistrar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      baiaId: z.number(),
      // Rev. 2417 — percentual virou OPCIONAL (legado dos 5 níveis Rev. 2373).
      // O fluxo novo só pede volume estimado em m³/un (campo `volumeEstimado`).
      // Se nenhum dos dois vier, é erro.
      percentual: z.number().int().min(0).max(100).optional(),
      volumeEstimado: z.number().nonnegative().optional(),
      observacoes: z.string().optional(),
      fotoBase64: z.string().optional(),
      fotoMime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.percentual == null && input.volumeEstimado == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o volume restante (m³) ou o percentual." });
      }
      // Se vier percentual, valida nos 5 níveis canônicos (compat Rev. 2373).
      if (input.percentual != null) {
        const niveis = [0, 25, 50, 75, 100];
        if (!niveis.includes(input.percentual)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Percentual deve ser 0, 25, 50, 75 ou 100." });
        }
      }
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [b] = await db.select().from(almoxarifadoBaias).where(and(
        eq(almoxarifadoBaias.id, input.baiaId),
        eq(almoxarifadoBaias.companyId, input.companyId),
      ));
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, b.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      let fotoUrl: string | null = null;
      if (input.fotoBase64 && input.fotoMime) {
        const buf = Buffer.from(input.fotoBase64, "base64");
        const ext = input.fotoMime.includes("png") ? "png" : input.fotoMime.includes("webp") ? "webp" : "jpg";
        const hash = crypto.createHash("sha1").update(`${input.companyId}-${input.baiaId}-${Date.now()}`).digest("hex").slice(0, 12);
        const key = `almoxarifado/baias-leituras/${input.companyId}/${hash}.${ext}`;
        const { url } = await storagePut(key, buf, input.fotoMime);
        fotoUrl = url;
      }
      // Rev. 2417 — quando só vem volumeEstimado, deriva percentual aproximado
      // pra coluna NOT NULL (capacidade opcional → 0 fallback) usando regra
      // simples min(100, round(vol/cap*100)). Não compromete a verdade — a
      // verdade é o `volumeEstimado` digitado; percentual fica como bar visual.
      let percentualFinal: number = input.percentual ?? 0;
      if (input.percentual == null && input.volumeEstimado != null) {
        const cap = b.capacidadeEstimada != null ? Number(b.capacidadeEstimada) : 0;
        if (cap > 0) {
          const pctRaw = Math.round((Number(input.volumeEstimado) / cap) * 100);
          percentualFinal = Math.max(0, Math.min(100, pctRaw));
        }
      }
      // ─── Rev. 2437 — VALIDAÇÃO: volume estimado <= saldo do almoxarifado ──
      // Bug reportado: user digitou "restou 80 m³" num item com saldo 10 m³
      // e o ERP aceitou silenciosamente — porque a Rev. 2436 só validava o
      // caso de BAIXA (novoVol < antVol). Aqui o volume SUBIU em relação à
      // leitura anterior, então não passou pela validação de baixa, mas
      // ficou um estado FISICAMENTE IMPOSSÍVEL: 80 m³ visualmente na baia
      // sem ter 80 m³ no almoxarifado. Validação correta: o volume estimado
      // NUNCA pode exceder o saldo do item — se exceder, ou a leitura está
      // errada ou faltou registrar entrada de material.
      if (b.itemId != null && input.volumeEstimado != null) {
        const [itemPre] = await db
          .select({ qtd: almoxarifadoItens.quantidadeAtual, nome: almoxarifadoItens.nome, unid: almoxarifadoItens.unidade })
          .from(almoxarifadoItens)
          .where(eq(almoxarifadoItens.id, b.itemId));
        const saldoItem = itemPre?.qtd != null ? Number(itemPre.qtd) : 0;
        const volNovo = Number(input.volumeEstimado);
        if (volNovo > saldoItem + 1e-9) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Volume estimado de ${volNovo.toLocaleString("pt-BR")} ${itemPre?.unid ?? ""} é maior que o saldo do almoxarifado (${saldoItem.toLocaleString("pt-BR")} ${itemPre?.unid ?? ""}) do item "${itemPre?.nome ?? ""}". Registre primeiro a entrada do material ou ajuste a leitura.`,
          });
        }
      }
      const [novo] = await db.insert(almoxarifadoBaiaLeituras).values({
        companyId: input.companyId,
        baiaId: input.baiaId,
        percentual: percentualFinal,
        volumeEstimado: input.volumeEstimado != null ? String(input.volumeEstimado) : null,
        fotoUrl,
        observacoes: input.observacoes ?? null,
        lidaPorId: ctx.user.id,
        lidaPorNome: ctx.user.name ?? null,
      } as any).returning();

      // ─── Rev. 2421 — DESCONTA DO ALMOXARIFADO ───────────────────────────
      // Pedido user: "dei baixa mas não está baixando do almoxarifado, ainda
      // mostra os 100 iniciais". Quando a baia tem `itemId` E o volume novo
      // é MENOR que o da leitura anterior (=consumo real visível no campo),
      // registra uma SAÍDA pelo delta e debita o saldo do item.
      // Regra deliberadamente conservadora: se vol subiu (entrada nova
      // entre as leituras), não inferimos nada — entradas vêm da NF.
      // Idempotência: o INSERT acima é a única "trigger" → cada leitura
      // gera no máx 1 movimentação. Defensive: se update já mudou o saldo
      // mas insert falhar, transação fica inconsistente — try/catch swallow
      // ANTES de comitar movimentação evita isso (segredo: ordem certa).
      let consumoDebitado = 0;
      if (b.itemId != null && input.volumeEstimado != null) {
        const [ant] = await db
          .select({ volumeEstimado: almoxarifadoBaiaLeituras.volumeEstimado })
          .from(almoxarifadoBaiaLeituras)
          .where(and(
            eq(almoxarifadoBaiaLeituras.baiaId, input.baiaId),
            ne(almoxarifadoBaiaLeituras.id, novo.id),
          ))
          .orderBy(desc(almoxarifadoBaiaLeituras.lidaEm))
          .limit(1);
        const antVol = ant?.volumeEstimado != null ? Number(ant.volumeEstimado) : null;
        const novoVol = Number(input.volumeEstimado);
        if (antVol != null && novoVol < antVol) {
          consumoDebitado = Number((antVol - novoVol).toFixed(3));
          if (consumoDebitado > 0) {
            // Rev. 2436 — VALIDAÇÃO DURA de saldo. Antes o UPDATE usava
            // `GREATEST(... - consumo, 0)` (clamp silencioso): se o user
            // pedisse baixa de 50 num saldo de 10, o ERP debitava só 10 e
            // fingia sucesso, perdendo 40 m³ de consumo da auditoria. Agora
            // recusa a leitura ANTES de inserir mov + ANTES de mexer no saldo.
            // Defesa em profundidade junto com o bloqueio do frontend (Rev. 2435).
            const [itemRow] = await db
              .select({ qtd: almoxarifadoItens.quantidadeAtual, nome: almoxarifadoItens.nome, unid: almoxarifadoItens.unidade })
              .from(almoxarifadoItens)
              .where(eq(almoxarifadoItens.id, b.itemId));
            const saldoAtual = itemRow?.qtd != null ? Number(itemRow.qtd) : 0;
            if (consumoDebitado > saldoAtual + 1e-9) {
              // Rollback do INSERT da leitura — a leitura SÓ existe se a baixa
              // for válida. Sem isso, ficaria uma leitura órfã sem mov.
              await db.delete(almoxarifadoBaiaLeituras)
                .where(eq(almoxarifadoBaiaLeituras.id, novo.id));
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Baixa de ${consumoDebitado.toLocaleString("pt-BR")} ${itemRow?.unid ?? ""} excede o saldo do almoxarifado (${saldoAtual.toLocaleString("pt-BR")} ${itemRow?.unid ?? ""}) do item "${itemRow?.nome ?? ""}". Registre primeiro a entrada do material ou ajuste a leitura.`,
              });
            }
            // 1) Debita saldo (validado acima — pode subtrair direto, sem clamp).
            await db.update(almoxarifadoItens)
              .set({
                quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric - ${consumoDebitado}`,
              } as any)
              .where(eq(almoxarifadoItens.id, b.itemId));
            // 2) Registra movimentação auditável (aparece no histórico do item).
            const [obraRow] = await db
              .select({ nome: obras.nome })
              .from(obras)
              .where(eq(obras.id, b.obraId));
            const [movCriada] = await db.insert(almoxarifadoMovimentacoes).values({
              companyId: input.companyId,
              itemId: b.itemId,
              tipo: "saida",
              quantidade: String(consumoDebitado),
              obraId: b.obraId,
              obraNome: obraRow?.nome ?? null,
              motivo: `Inventário Visual de Baias — aferição (baia "${b.nome}")`,
              usuarioId: ctx.user.id,
              usuarioNome: ctx.user.name ?? null,
              observacoes: input.observacoes ?? null,
            } as any).returning({ id: almoxarifadoMovimentacoes.id });
            // Rev. 2422 — vincula a mov à leitura, p/ "Desfazer" estornar limpo.
            if (movCriada?.id != null) {
              await db.update(almoxarifadoBaiaLeituras)
                .set({ movimentacaoId: movCriada.id } as any)
                .where(eq(almoxarifadoBaiaLeituras.id, novo.id));
            }
          }
        }
      }
      return { ...novo, consumoDebitado };
    }),

  // ─── Rev. 2422 — DESFAZER AFERIÇÃO ─────────────────────────────────────
  // Pedido user (25/05/2026, follow-up Rev. 2421): "quero poder desfazer
  // o apontamento". Deleta a leitura mais recente da baia E, se ela gerou
  // movimentação de saída (Rev. 2421+), estorna o almox: cria mov inversa
  // "entrada — estorno aferição" (auditável no histórico do item) +
  // soma o valor de volta no saldo do `almoxarifado_itens`.
  //
  // Regras de segurança:
  //  - Só a leitura MAIS RECENTE da baia pode ser desfeita (senão a
  //    cadeia de consumo fica inconsistente — antVol da próxima ficaria
  //    apontando pra valor inexistente).
  //  - Quem pode: o próprio autor da leitura OU admin (role contém
  //    "ADMIN" — pega Master + plataforma).
  //  - Leituras antigas (sem `movimentacaoId` populado) podem ser
  //    deletadas mas SEM estorno (retorna flag pra UI avisar).
  // ─────────────────────────────────────────────────────────────────────
  baiaLeituraDeletar: protectedProcedure
    .input(z.object({ companyId: z.number(), leituraId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [leit] = await db.select().from(almoxarifadoBaiaLeituras).where(and(
        eq(almoxarifadoBaiaLeituras.id, input.leituraId),
        eq(almoxarifadoBaiaLeituras.companyId, input.companyId),
      ));
      if (!leit) throw new TRPCError({ code: "NOT_FOUND" });
      const [b] = await db.select().from(almoxarifadoBaias).where(eq(almoxarifadoBaias.id, leit.baiaId));
      if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "Baia da leitura não existe mais." });
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, b.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      // Permissão: autor da leitura OU admin.
      const isAdmin = String(ctx.user.role ?? "").toUpperCase().includes("ADMIN");
      if (!isAdmin && leit.lidaPorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Só quem registrou a aferição (ou um admin) pode desfazê-la." });
      }
      // Garantia anti-inconsistência: só a leitura MAIS RECENTE pode ser desfeita.
      const [ultima] = await db
        .select({ id: almoxarifadoBaiaLeituras.id })
        .from(almoxarifadoBaiaLeituras)
        .where(eq(almoxarifadoBaiaLeituras.baiaId, leit.baiaId))
        .orderBy(desc(almoxarifadoBaiaLeituras.lidaEm))
        .limit(1);
      if (ultima?.id !== leit.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Só é possível desfazer a leitura mais recente da baia. Desfaça as posteriores primeiro.",
        });
      }
      // Estorno do almox (se a leitura gerou movimentação de saída).
      let estornado = 0;
      const movId = (leit as any).movimentacaoId as number | null;
      if (movId != null && b.itemId != null) {
        const [mov] = await db
          .select({ quantidade: almoxarifadoMovimentacoes.quantidade })
          .from(almoxarifadoMovimentacoes)
          .where(eq(almoxarifadoMovimentacoes.id, movId));
        if (mov?.quantidade != null) {
          estornado = Number(mov.quantidade);
          // 1) Soma de volta no saldo do item.
          await db.update(almoxarifadoItens)
            .set({
              quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${estornado}`,
            } as any)
            .where(eq(almoxarifadoItens.id, b.itemId));
          // 2) Registra mov de ENTRADA (estorno) — auditável no item.
          const [obraRow] = await db
            .select({ nome: obras.nome })
            .from(obras)
            .where(eq(obras.id, b.obraId));
          await db.insert(almoxarifadoMovimentacoes).values({
            companyId: input.companyId,
            itemId: b.itemId,
            tipo: "entrada",
            quantidade: String(estornado),
            obraId: b.obraId,
            obraNome: obraRow?.nome ?? null,
            motivo: `Estorno: aferição desfeita da baia "${b.nome}" (leitura #${leit.id})`,
            usuarioId: ctx.user.id,
            usuarioNome: ctx.user.name ?? null,
            observacoes: null,
          } as any);
        }
      }
      // Deleta a leitura por último.
      await db.delete(almoxarifadoBaiaLeituras)
        .where(eq(almoxarifadoBaiaLeituras.id, leit.id));
      return { ok: true, estornado, movimentacaoEstornadaId: movId };
    }),

  // ─────────────────────────────────────────────────────────────────────
  // Rev. 2415 — AGREGADOS AUTOMÁTICOS NO INVENTÁRIO VISUAL DE BAIAS
  // Pedido user: "não quero precisar cadastrar baia... qualquer agregado
  // recebido precisa aparecer aqui automaticamente." A baia é criada
  // sob demanda (na 1ª leitura) via `baiaAutoEnsureFromItem`. Heurística
  // de agregado: nome do item match em regex (areia, brita, pedra,
  // pedrisco, lajota, tijolo, bloco, argamassa, cimento, cal, saibro,
  // terra, entulho, concreto, seixo, agregado, granel) OU a própria
  // categoria/observação cita "granel/agregado". Sem migration, reusa
  // schema rev. 2373 (almoxarifado_baias.itemId já existia).
  // ─────────────────────────────────────────────────────────────────────
  baiaAgregadosListar: protectedProcedure
    // Rev. 2416 — `obraId` agora é nullable. null = TODAS as obras que o
    // usuário tem acesso na empresa (visão consolidada dos insumos em campo).
    .input(z.object({ companyId: z.number(), obraId: z.number().nullable() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // Resolve a lista de obras-alvo + nome.
      let targetObras: { id: number; nome: string }[];
      if (input.obraId == null) {
        const allObras = await db
          .select({ id: obras.id, nome: obras.nome, companyId: obras.companyId })
          .from(obras)
          .where(eq(obras.companyId, input.companyId));
        // Rev. 2542 — usa o set allocation-aware do almoxarifado (inclui obra
        // via `obra_funcionarios`) em vez de `userCanAccessObra`, para que
        // membros da equipe ALOCADOS (não-responsáveis) vejam as baias da obra.
        const allowedSet = await getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email);
        const filtered: { id: number; nome: string }[] = [];
        for (const o of allObras) {
          if (allowedSet === null || allowedSet.has(o.id)) {
            filtered.push({ id: o.id, nome: o.nome });
          }
        }
        targetObras = filtered;
      } else {
        if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, input.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
        }
        const [obraRow] = await db.select({ id: obras.id, nome: obras.nome, companyId: obras.companyId }).from(obras).where(eq(obras.id, input.obraId));
        if (!obraRow || obraRow.companyId !== input.companyId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Obra não pertence à empresa informada." });
        }
        targetObras = [{ id: obraRow.id, nome: obraRow.nome }];
      }
      if (targetObras.length === 0) return [];
      const obraIds = targetObras.map(o => o.id);
      const obraNomeById = new Map(targetObras.map(o => [o.id, o.nome] as const));

      // 1) Itens das obras-alvo (ou sem obra = central) — só ativos.
      const { or, isNull, inArray } = await import("drizzle-orm");
      const itensRows = await db.select().from(almoxarifadoItens).where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
        or(inArray(almoxarifadoItens.obraId, obraIds), isNull(almoxarifadoItens.obraId)),
      ));

      // Rev. 2417 — filtro AGORA é SÓ pela categoria "Agregados" (decisão user:
      // "define o seguinte, so vai para baia oque estiver na categoria
      // agregados ok.. mais facil controlar desta forma"). Heurística por
      // nome/unidade da Rev. 2415 foi descontinuada — almoxarife controla
      // explicitamente o que vira baia ao classificar o item.
      // Tolerante a variações de cadastro: "Agregado", "Agregados", "AGREGADOS ",
      // "agregado de construção" etc. — basta começar com "agregado".
      const normalizarCat = (s: any) => String(s ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().toLowerCase();
      const itensAgg = itensRows.filter((it: any) => normalizarCat(it.categoria).startsWith("agregado"));

      // 3) Baias ativas dessas obras (qualquer baia, com ou sem itemId).
      const baias = await db.select().from(almoxarifadoBaias).where(and(
        eq(almoxarifadoBaias.companyId, input.companyId),
        inArray(almoxarifadoBaias.obraId, obraIds),
        eq(almoxarifadoBaias.ativo, true),
      ));
      // Indexa baias por (obraId, itemId). Baias órfãs (sem itemId) por obra.
      const baiaPorObraItem = new Map<string, any>(); // key: `${obraId}:${itemId}`
      const baiasOrfasPorObra = new Map<number, any[]>();
      for (const b of baias) {
        if (b.itemId != null) {
          baiaPorObraItem.set(`${b.obraId}:${b.itemId}`, b);
        } else {
          const list = baiasOrfasPorObra.get(b.obraId) ?? [];
          list.push(b);
          baiasOrfasPorObra.set(b.obraId, list);
        }
      }

      // 4) Última + penúltima leitura por baia.
      const baiaIds = baias.map((b: any) => b.id);
      const mapUlt = new Map<number, any>();
      const mapPenult = new Map<number, any>();
      if (baiaIds.length > 0) {
        const ultimas: any = await db.execute(sql`
          SELECT DISTINCT ON (baia_id) baia_id, id, percentual, volume_estimado, foto_url, observacoes,
                 lida_por_id, lida_por_nome, lida_em
          FROM almoxarifado_baia_leituras
          WHERE baia_id IN (${sql.join(baiaIds.map((id: number) => sql`${id}`), sql`, `)})
          ORDER BY baia_id, lida_em DESC
        `);
        for (const r of (ultimas?.rows ?? [])) mapUlt.set(Number(r.baia_id), r);
        const penultimas: any = await db.execute(sql`
          SELECT baia_id, id, percentual, volume_estimado, foto_url, observacoes,
                 lida_por_id, lida_por_nome, lida_em
          FROM (
            SELECT baia_id, id, percentual, volume_estimado, foto_url, observacoes,
                   lida_por_id, lida_por_nome, lida_em,
                   ROW_NUMBER() OVER (PARTITION BY baia_id ORDER BY lida_em DESC) rn
            FROM almoxarifado_baia_leituras
            WHERE baia_id IN (${sql.join(baiaIds.map((id: number) => sql`${id}`), sql`, `)})
          ) t WHERE rn = 2
        `);
        for (const r of (penultimas?.rows ?? [])) mapPenult.set(Number(r.baia_id), r);
      }

      // 5) Entradas de hoje por (item, obra) — badge "📦 chegou hoje".
      const itemIds = itensAgg.map((i: any) => i.id);
      const mapEntradasHoje = new Map<string, number>(); // key: `${itemId}:${obraId}`
      if (itemIds.length > 0 && obraIds.length > 0) {
        const entradas: any = await db.execute(sql`
          SELECT item_id, obra_id, COALESCE(SUM(quantidade), 0)::float AS qtd
          FROM almoxarifado_movimentacoes
          WHERE company_id = ${input.companyId}
            AND tipo = 'entrada'
            AND obra_id IN (${sql.join(obraIds.map((id: number) => sql`${id}`), sql`, `)})
            AND item_id IN (${sql.join(itemIds.map((id: number) => sql`${id}`), sql`, `)})
            AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
            AND estornada_em IS NULL
          GROUP BY item_id, obra_id
        `);
        for (const r of (entradas?.rows ?? [])) {
          mapEntradasHoje.set(`${r.item_id}:${r.obra_id}`, Number(r.qtd) || 0);
        }
      }

      // Rev. 2444 — HISTÓRICO de entradas por (item, obra), sem corte de data.
      // Usado pra decidir se um item CENTRAL (obraId=null) deve aparecer numa
      // obra na visão consolidada. Critério: aparece SÓ se já foi recebido
      // fisicamente lá (entrada ≠ estornada) OU se já existe baia explícita.
      // Antes: itens centrais eram REPLICADOS em todas as obras (bug do user
      // 22:30 — Brita/Pó de Pedra apareciam em 24 obras sem terem ido lá).
      const obrasComEntradaPorItem = new Map<number, Set<number>>();
      if (itemIds.length > 0 && obraIds.length > 0) {
        const histEntradas: any = await db.execute(sql`
          SELECT DISTINCT item_id, obra_id
          FROM almoxarifado_movimentacoes
          WHERE company_id = ${input.companyId}
            AND tipo = 'entrada'
            AND obra_id IN (${sql.join(obraIds.map((id: number) => sql`${id}`), sql`, `)})
            AND item_id IN (${sql.join(itemIds.map((id: number) => sql`${id}`), sql`, `)})
            AND estornada_em IS NULL
        `);
        for (const r of (histEntradas?.rows ?? [])) {
          const iid = Number(r.item_id); const oid = Number(r.obra_id);
          const s = obrasComEntradaPorItem.get(iid) ?? new Set<number>();
          s.add(oid); obrasComEntradaPorItem.set(iid, s);
        }
      }

      const toCamel = (r: any) => r ? ({
        id: Number(r.id),
        baiaId: Number(r.baia_id),
        percentual: Number(r.percentual),
        volumeEstimado: r.volume_estimado != null ? Number(r.volume_estimado) : null,
        fotoUrl: r.foto_url ?? null,
        observacoes: r.observacoes ?? null,
        lidaPorId: r.lida_por_id != null ? Number(r.lida_por_id) : null,
        lidaPorNome: r.lida_por_nome ?? null,
        lidaEm: r.lida_em ?? null,
      }) : null;
      // Rev. 2417 — consumo do dia = saldoAnterior + entradaHoje − saldoAtual
      // (apenas se ambas as leituras existirem e tiverem volume registrado).
      const calcConsumoHoje = (ult: any, ant: any, entradaHoje: number): number | null => {
        if (!ult || ult.volumeEstimado == null) return null;
        if (!ant || ant.volumeEstimado == null) return null;
        const consumo = Number(ant.volumeEstimado) + Number(entradaHoje || 0) - Number(ult.volumeEstimado);
        return Math.max(0, Number(consumo.toFixed(3)));
      };

      // 6) Combina: 1 linha por (obra × item agregado) + 1 linha por baia órfã.
      const result: any[] = [];
      // Rev. 2444 — itens centrais (obraId=null) NÃO replicam mais em todas
      // as obras. Aparecem só onde houve entrada física histórica OU onde
      // já existe baia explícita.
      const itensCentrais = itensAgg.filter((it: any) => it.obraId == null);
      const itensPorObra = new Map<number, any[]>();
      for (const it of itensAgg) {
        if (it.obraId != null) {
          const list = itensPorObra.get(it.obraId) ?? [];
          list.push(it);
          itensPorObra.set(it.obraId, list);
        }
      }
      for (const obra of targetObras) {
        const centraisDessaObra = itensCentrais.filter((it: any) => {
          const teveEntrada = obrasComEntradaPorItem.get(it.id)?.has(obra.id) ?? false;
          const temBaia = baiaPorObraItem.has(`${obra.id}:${it.id}`);
          return teveEntrada || temBaia;
        });
        const itensDessaObra = [
          ...(itensPorObra.get(obra.id) ?? []),
          ...centraisDessaObra,
        ];
        for (const it of itensDessaObra) {
          const baia = baiaPorObraItem.get(`${obra.id}:${it.id}`);
          const ult = baia ? toCamel(mapUlt.get(baia.id)) : null;
          const ant = baia ? toCamel(mapPenult.get(baia.id)) : null;
          const ent = mapEntradasHoje.get(`${it.id}:${obra.id}`) ?? 0;
          result.push({
            id: baia?.id ?? null,                 // null = baia ainda não criada (1º clique cria)
            itemId: it.id,
            obraId: obra.id,
            obraNome: obra.nome,
            nome: baia?.nome ?? it.nome,
            material: baia?.material ?? it.nome,
            unidade: baia?.unidade ?? it.unidade ?? "m³",
            capacidadeEstimada: baia?.capacidadeEstimada ?? null,
            fotoUrl: baia?.fotoUrl ?? it.fotoUrl ?? null,
            observacoes: baia?.observacoes ?? null,
            quantidadeAtual: Number(it.quantidadeAtual ?? 0),
            entradaHoje: ent,
            ativo: true,
            origem: "agregado_auto",
            ultimaLeitura: ult,
            leituraAnterior: ant,
            consumoHoje: calcConsumoHoje(ult, ant, ent),
          });
        }
        // Baias órfãs (sem itemId) dessa obra
        for (const b of (baiasOrfasPorObra.get(obra.id) ?? [])) {
          const ult = toCamel(mapUlt.get(b.id));
          const ant = toCamel(mapPenult.get(b.id));
          result.push({
            id: b.id,
            itemId: null,
            obraId: obra.id,
            obraNome: obra.nome,
            nome: b.nome,
            material: b.material,
            unidade: b.unidade,
            capacidadeEstimada: b.capacidadeEstimada,
            fotoUrl: b.fotoUrl,
            observacoes: b.observacoes,
            quantidadeAtual: 0,
            entradaHoje: 0,
            ativo: b.ativo,
            origem: "manual",
            ultimaLeitura: ult,
            leituraAnterior: ant,
            consumoHoje: calcConsumoHoje(ult, ant, 0),
          });
        }
      }
      // Baias com itemId apontando pra item NÃO-agregado (categoria mudou depois)
      // — listar como manual pra preservar histórico, taggeadas pela obra da baia.
      // Rev. 2445 — DEFENSIVO: filtra baias cujo itemId aponta pra item
      // INATIVO/INEXISTENTE. Antes (bug user 22:38), item deletado deixava
      // baia órfã visível eternamente no Inventário Visual.
      const itensAggIds = new Set(itensAgg.map((it: any) => it.id));
      const itensAtivosIds = new Set(itensRows.filter((it: any) => it.ativo).map((it: any) => it.id));
      for (const b of baias) {
        if (b.itemId != null && !itensAggIds.has(b.itemId)) {
          if (!itensAtivosIds.has(b.itemId)) continue; // item deletado → baia some
          const ult = toCamel(mapUlt.get(b.id));
          const ant = toCamel(mapPenult.get(b.id));
          result.push({
            id: b.id,
            itemId: b.itemId,
            obraId: b.obraId,
            obraNome: obraNomeById.get(b.obraId) ?? "—",
            nome: b.nome,
            material: b.material,
            unidade: b.unidade,
            capacidadeEstimada: b.capacidadeEstimada,
            fotoUrl: b.fotoUrl,
            observacoes: b.observacoes,
            quantidadeAtual: 0,
            entradaHoje: 0,
            ativo: b.ativo,
            origem: "manual",
            ultimaLeitura: ult,
            leituraAnterior: ant,
            consumoHoje: calcConsumoHoje(ult, ant, 0),
          });
        }
      }
      return result;
    }),

  // Cria (idempotente) uma baia ligada a um item agregado. Chamado no 1º
  // clique de nível de um item que ainda não tem baia — o user nem
  // percebe que isso aconteceu. Retorna `{ baiaId }`.
  baiaAutoEnsureFromItem: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), itemId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowedCompanies.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      if (!(await userCanAccessObraAlmox(ctx.user.id, ctx.user.role, ctx.user.email, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      const [obraRow] = await db.select({ id: obras.id, companyId: obras.companyId }).from(obras).where(eq(obras.id, input.obraId));
      if (!obraRow || obraRow.companyId !== input.companyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Obra não pertence à empresa informada." });
      }
      // Advisory lock por (company, obra, item) pra serializar cliques
      // simultâneos do mesmo almoxarife. Vive até o fim da sessão (não
      // estamos numa tx, então usamos pg_advisory_lock + unlock no finally).
      // Hash determinístico via hashtext de uma chave estável.
      const lockKey = `baia_auto:${input.companyId}:${input.obraId}:${input.itemId}`;
      await db.execute(sql`SELECT pg_advisory_lock(hashtext(${lockKey}))`);
      try {
        const [existing] = await db.select().from(almoxarifadoBaias).where(and(
          eq(almoxarifadoBaias.companyId, input.companyId),
          eq(almoxarifadoBaias.obraId, input.obraId),
          eq(almoxarifadoBaias.itemId, input.itemId),
          eq(almoxarifadoBaias.ativo, true),
        ));
        if (existing) return { baiaId: existing.id, created: false };
        const [item] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
        const [novo] = await db.insert(almoxarifadoBaias).values({
          companyId: input.companyId,
          obraId: input.obraId,
          itemId: input.itemId,
          nome: item.nome,
          material: item.nome,
          unidade: item.unidade ?? "m³",
          fotoUrl: item.fotoUrl ?? null,
          ativo: true,
          criadoPorId: ctx.user.id,
          criadoPorNome: ctx.user.name ?? null,
        } as any).returning();
        return { baiaId: novo.id, created: true };
      } finally {
        await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`);
      }
    }),
});
