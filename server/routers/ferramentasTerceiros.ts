// Rev. 1880 — Controle de Ferramentas de Terceiros
// Empresas terceirizadas (locação, autônomos, prestadores) trazem ferramentas
// para a obra → registra ENTRADA com foto + identificação completa do responsável.
// Quando levam embora → registra SAIDA vinculada à ENTRADA original, marcando
// quais itens voltaram, em que condição, e quem fez a retirada. Tudo auditado
// para evitar "sumiço" e disputas de propriedade ao final da obra.

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { storagePut } from "../storage";
import { auditLogs } from "../../drizzle/schema";

const TIPOS = ["ENTRADA", "SAIDA"] as const;
const CONDICOES = ["nova", "boa", "regular", "ruim", "danificada"] as const;
const STATUS_ITEM = ["na_obra", "devolvido", "perda", "danificada"] as const;
const STATUS_REG = ["em_obra", "devolvido_parcial", "devolvido_total", "concluido"] as const;

const MAX_FOTO_BYTES = 8 * 1024 * 1024; // 8MB por foto (já comprimida no client)

// Decodifica base64 → buffer com validação. Lança TRPCError em vez de Error
// para que o cliente receba a mensagem amigável (não "Internal Server Error").
function decodeFoto(b64: string, mime: string, label: string): Buffer {
  if (!b64) throw new TRPCError({ code: "BAD_REQUEST", message: `Foto "${label}" vazia.` });
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(mime)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Tipo de imagem inválido em "${label}": ${mime}` });
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Foto "${label}" inválida.` });
  if (buf.length > MAX_FOTO_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Foto "${label}" muito grande (${(buf.length/1024/1024).toFixed(1)}MB). Limite: 8MB.` });
  }
  return buf;
}
function extFromMime(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

const itemInputSchema = z.object({
  descricao: z.string().min(1).max(255),
  marca: z.string().max(100).optional().nullable(),
  modelo: z.string().max(100).optional().nullable(),
  numeroSerie: z.string().max(100).optional().nullable(),
  quantidade: z.number().int().min(1).default(1),
  fotoBase64: z.string().min(1),                          // OBRIGATÓRIA
  fotoMime: z.string(),
  condicao: z.enum(CONDICOES).default("boa"),
  observacao: z.string().max(500).optional().nullable(),
  itemEntradaId: z.number().int().optional().nullable(),  // só usado em SAIDA p/ vincular ao item original
});

export const ferramentasTerceirosRouter = router({

  // ─── KPIs do topo ───────────────────────────────────────────────
  kpis: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional().nullable() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const obraFilter = input.obraId ? sql`AND r.obra_id = ${input.obraId}` : sql``;
      // Itens "na obra": items com status_item='na_obra' cujo registro pai (ENTRADA) não foi deletado.
      // Itens devolvidos: items com status_item='devolvido'.
      // Total em aberto (registros): entradas com status='em_obra' ou 'devolvido_parcial'.
      const res = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE i.status_item = 'na_obra') AS itens_na_obra,
          COUNT(*) FILTER (WHERE i.status_item = 'devolvido') AS itens_devolvidos,
          COUNT(*) FILTER (WHERE i.status_item IN ('perda','danificada')) AS itens_problema
        FROM ferramentas_terceiros_itens i
        JOIN ferramentas_terceiros_registros r ON r.id = i.registro_id
        WHERE r.company_id = ${input.companyId}
          AND r.deleted_at IS NULL
          AND r.tipo = 'ENTRADA'
          ${obraFilter}
      `);
      const counts = (res.rows?.[0] || {}) as any;
      // Entradas e saídas de HOJE (operação corrente).
      const hojeRes = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE tipo = 'ENTRADA') AS entradas_hoje,
          COUNT(*) FILTER (WHERE tipo = 'SAIDA') AS saidas_hoje
        FROM ferramentas_terceiros_registros
        WHERE company_id = ${input.companyId}
          AND deleted_at IS NULL
          AND data_hora::date = CURRENT_DATE
          ${obraFilter}
      `);
      const hoje = (hojeRes.rows?.[0] || {}) as any;
      return {
        itensNaObra: Number(counts.itens_na_obra || 0),
        itensDevolvidos: Number(counts.itens_devolvidos || 0),
        itensProblema: Number(counts.itens_problema || 0),
        entradasHoje: Number(hoje.entradas_hoje || 0),
        saidasHoje: Number(hoje.saidas_hoje || 0),
      };
    }),

  // ─── Lista paginada de registros (header + qtd itens) ───────────
  listarRegistros: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional().nullable(),
      tipo: z.enum(TIPOS).optional(),
      status: z.string().optional(),
      busca: z.string().optional(),                       // empresa/responsavel
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const obraFilter = input.obraId ? sql`AND r.obra_id = ${input.obraId}` : sql``;
      const tipoFilter = input.tipo ? sql`AND r.tipo = ${input.tipo}` : sql``;
      const statusFilter = input.status ? sql`AND r.status = ${input.status}` : sql``;
      const buscaFilter = input.busca
        ? sql`AND (r.empresa_terceira ILIKE ${'%' + input.busca + '%'} OR r.responsavel_nome ILIKE ${'%' + input.busca + '%'})`
        : sql``;
      const res = await db.execute(sql`
        SELECT r.*, COALESCE(c.qtd_itens, 0) AS qtd_itens,
               COALESCE(c.qtd_na_obra, 0) AS qtd_na_obra
        FROM ferramentas_terceiros_registros r
        LEFT JOIN (
          SELECT registro_id,
                 COUNT(*) AS qtd_itens,
                 COUNT(*) FILTER (WHERE status_item = 'na_obra') AS qtd_na_obra
          FROM ferramentas_terceiros_itens
          GROUP BY registro_id
        ) c ON c.registro_id = r.id
        WHERE r.company_id = ${input.companyId}
          AND r.deleted_at IS NULL
          ${obraFilter} ${tipoFilter} ${statusFilter} ${buscaFilter}
        ORDER BY r.data_hora DESC
        LIMIT ${input.limit}
      `);
      return res.rows;
    }),

  // ─── Detalhe + itens ────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const regRes = await db.execute(sql`
        SELECT * FROM ferramentas_terceiros_registros
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
        LIMIT 1
      `);
      if (!regRes.rows?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      const itensRes = await db.execute(sql`
        SELECT * FROM ferramentas_terceiros_itens
        WHERE registro_id = ${input.id} AND company_id = ${input.companyId}
        ORDER BY id
      `);
      return { registro: regRes.rows[0], itens: itensRes.rows };
    }),

  // ─── Lista itens "na obra" (p/ tela de Saída — escolher o que devolver) ─
  itensNaObraPorRegistro: protectedProcedure
    .input(z.object({ companyId: z.number(), registroPaiId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Confirma que o registro pai é uma ENTRADA da mesma company (multi-tenant defense).
      const paiRes = await db.execute(sql`
        SELECT id FROM ferramentas_terceiros_registros
        WHERE id = ${input.registroPaiId} AND company_id = ${input.companyId}
          AND tipo = 'ENTRADA' AND deleted_at IS NULL LIMIT 1
      `);
      if (!paiRes.rows?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada não encontrada." });
      const itens = await db.execute(sql`
        SELECT * FROM ferramentas_terceiros_itens
        WHERE registro_id = ${input.registroPaiId}
          AND company_id = ${input.companyId}
          AND status_item = 'na_obra'
        ORDER BY id
      `);
      return itens.rows;
    }),

  // ─── ENTRADAS ainda em aberto p/ escolha rápida no modal de saída ─
  entradasEmAberto: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const res = await db.execute(sql`
        SELECT r.id, r.empresa_terceira, r.responsavel_nome, r.data_hora, r.obra_nome,
               COUNT(i.id) FILTER (WHERE i.status_item = 'na_obra') AS qtd_na_obra
        FROM ferramentas_terceiros_registros r
        JOIN ferramentas_terceiros_itens i ON i.registro_id = r.id
        WHERE r.company_id = ${input.companyId}
          AND r.tipo = 'ENTRADA'
          AND r.deleted_at IS NULL
          AND r.status IN ('em_obra','devolvido_parcial')
        GROUP BY r.id
        HAVING COUNT(i.id) FILTER (WHERE i.status_item = 'na_obra') > 0
        ORDER BY r.data_hora DESC
      `);
      return res.rows;
    }),

  // ─── Criar ENTRADA (header + N itens, fotos no storage) ─────────
  criarEntrada: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional().nullable(),
      obraNome: z.string().max(255).optional().nullable(),
      empresaTerceira: z.string().min(1).max(255),
      cnpj: z.string().max(20).optional().nullable(),
      responsavelNome: z.string().min(1).max(255),
      responsavelCpf: z.string().max(14).optional().nullable(),
      responsavelTelefone: z.string().max(20).optional().nullable(),
      quemEntregou: z.string().max(255).optional().nullable(),
      // Architect review Rev. 1880: `quemRecebeu` é obrigatório pela UI e é o
      // campo-chave de rastreabilidade ("quem assumiu a guarda na obra") —
      // backend agora bloqueia explicitamente quando vazio.
      quemRecebeu: z.string().min(1, "Informe quem recebeu na obra (rastreabilidade).").max(255),
      observacoes: z.string().max(2000).optional().nullable(),
      fotoDocumentoBase64: z.string().optional().nullable(),
      fotoDocumentoMime: z.string().optional().nullable(),
      itens: z.array(itemInputSchema).min(1, "Adicione ao menos 1 ferramenta."),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // 1) Upload das fotos PRIMEIRO (todas falham junto se uma falhar — evita
      //    registro persistido no DB sem fotos correspondentes no storage).
      const ts = Date.now();
      const fotosItens: string[] = [];
      for (let i = 0; i < input.itens.length; i++) {
        const it = input.itens[i];
        const buf = decodeFoto(it.fotoBase64, it.fotoMime, `Item #${i + 1} — ${it.descricao}`);
        const key = `ferramentas-terceiros/${input.companyId}/entradas/${ts}/item-${i + 1}.${extFromMime(it.fotoMime)}`;
        const { url } = await storagePut(key, buf, it.fotoMime);
        fotosItens.push(url);
      }
      let fotoDocUrl: string | null = null;
      if (input.fotoDocumentoBase64 && input.fotoDocumentoMime) {
        const buf = decodeFoto(input.fotoDocumentoBase64, input.fotoDocumentoMime, "Documento do responsável");
        const key = `ferramentas-terceiros/${input.companyId}/entradas/${ts}/documento.${extFromMime(input.fotoDocumentoMime)}`;
        const { url } = await storagePut(key, buf, input.fotoDocumentoMime);
        fotoDocUrl = url;
      }

      // 2) Persiste header + itens com status_item='na_obra'.
      const regRes = await db.execute(sql`
        INSERT INTO ferramentas_terceiros_registros (
          company_id, obra_id, obra_nome, tipo, empresa_terceira, cnpj,
          responsavel_nome, responsavel_cpf, responsavel_telefone,
          quem_entregou, quem_recebeu, lancado_por_user_id, lancado_por_nome,
          foto_documento_url, observacoes, status
        ) VALUES (
          ${input.companyId}, ${input.obraId ?? null}, ${input.obraNome ?? null}, 'ENTRADA',
          ${input.empresaTerceira}, ${input.cnpj ?? null},
          ${input.responsavelNome}, ${input.responsavelCpf ?? null}, ${input.responsavelTelefone ?? null},
          ${input.quemEntregou ?? null}, ${input.quemRecebeu ?? null},
          ${ctx.user.id}, ${ctx.user.name},
          ${fotoDocUrl}, ${input.observacoes ?? null}, 'em_obra'
        ) RETURNING id
      `);
      const registroId = Number((regRes.rows?.[0] as any)?.id);
      if (!registroId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar registro." });

      for (let i = 0; i < input.itens.length; i++) {
        const it = input.itens[i];
        await db.execute(sql`
          INSERT INTO ferramentas_terceiros_itens (
            registro_id, company_id, descricao, marca, modelo, numero_serie,
            quantidade, foto_url, condicao, observacao, status_item
          ) VALUES (
            ${registroId}, ${input.companyId}, ${it.descricao}, ${it.marca ?? null},
            ${it.modelo ?? null}, ${it.numeroSerie ?? null}, ${it.quantidade},
            ${fotosItens[i]}, ${it.condicao}, ${it.observacao ?? null}, 'na_obra'
          )
        `);
      }

      // 3) Auditoria.
      await db.insert(auditLogs).values({
        userId: ctx.user.id, userName: ctx.user.name, companyId: input.companyId,
        action: "CREATE", module: "ALMOXARIFADO", entityType: "FERRAMENTA_TERCEIRO_ENTRADA",
        entityId: registroId,
        details: `Entrada — ${input.empresaTerceira} / ${input.responsavelNome} — ${input.itens.length} ferramenta(s)`,
      });
      return { id: registroId };
    }),

  // ─── Criar SAIDA (vinculada a ENTRADA pai) ──────────────────────
  // Para cada item escolhido, marca o item original como 'devolvido' (ou
  // perda/danificada) e atualiza o status do registro pai.
  criarSaida: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      registroPaiId: z.number(),
      quemEntregou: z.string().max(255).optional().nullable(),  // pessoa do terceiro que veio buscar
      quemRecebeu: z.string().max(255).optional().nullable(),   // pessoa da obra que entregou
      responsavelNome: z.string().min(1).max(255),
      responsavelCpf: z.string().max(14).optional().nullable(),
      observacoes: z.string().max(2000).optional().nullable(),
      itensDevolvidos: z.array(z.object({
        itemEntradaId: z.number(),
        condicaoSaida: z.enum(CONDICOES),
        statusItem: z.enum(["devolvido", "perda", "danificada"]),
        fotoBase64: z.string().min(1),       // foto da condição NA SAÍDA — obrigatória
        fotoMime: z.string(),
        observacao: z.string().max(500).optional().nullable(),
      })).min(1, "Marque ao menos 1 ferramenta devolvida.")
        // Rev. 1880 — Architect review: bloqueia payloads com itemEntradaId duplicado
        // (UI não permite, mas chamadas tRPC diretas/replay sim — sem isso o check
        // de cardinalidade falha de forma confusa e dá pra criar linhas-espelho
        // múltiplas pro mesmo item.).
        .refine(arr => new Set(arr.map(i => i.itemEntradaId)).size === arr.length, {
          message: "Item duplicado no payload de saída.",
        }),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // 1) Valida pai pertence à company.
      const paiRes = await db.execute(sql`
        SELECT id, empresa_terceira, obra_id, obra_nome
        FROM ferramentas_terceiros_registros
        WHERE id = ${input.registroPaiId} AND company_id = ${input.companyId}
          AND tipo = 'ENTRADA' AND deleted_at IS NULL LIMIT 1
      `);
      if (!paiRes.rows?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada de origem não encontrada." });
      const pai = paiRes.rows[0] as any;

      // 2) Valida que TODOS os itens informados são do pai e estão 'na_obra'.
      const itensIds = input.itensDevolvidos.map(i => i.itemEntradaId);
      const itensRes = await db.execute(sql`
        SELECT id, descricao FROM ferramentas_terceiros_itens
        WHERE registro_id = ${input.registroPaiId}
          AND company_id = ${input.companyId}
          AND status_item = 'na_obra'
          AND id IN (${sql.join(itensIds.map(id => sql`${id}`), sql`, `)})
      `);
      if ((itensRes.rows?.length || 0) !== itensIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais itens não estão disponíveis para saída." });
      }

      // 3) Upload fotos da saída.
      const ts = Date.now();
      const fotosSaida: string[] = [];
      for (let i = 0; i < input.itensDevolvidos.length; i++) {
        const it = input.itensDevolvidos[i];
        const buf = decodeFoto(it.fotoBase64, it.fotoMime, `Item saída #${i + 1}`);
        const key = `ferramentas-terceiros/${input.companyId}/saidas/${ts}/item-${i + 1}.${extFromMime(it.fotoMime)}`;
        const { url } = await storagePut(key, buf, it.fotoMime);
        fotosSaida.push(url);
      }

      // 4) Cria header SAIDA.
      const regRes = await db.execute(sql`
        INSERT INTO ferramentas_terceiros_registros (
          company_id, obra_id, obra_nome, tipo, empresa_terceira,
          responsavel_nome, responsavel_cpf, quem_entregou, quem_recebeu,
          lancado_por_user_id, lancado_por_nome,
          registro_pai_id, observacoes, status
        ) VALUES (
          ${input.companyId}, ${pai.obra_id ?? null}, ${pai.obra_nome ?? null}, 'SAIDA',
          ${pai.empresa_terceira}, ${input.responsavelNome}, ${input.responsavelCpf ?? null},
          ${input.quemEntregou ?? null}, ${input.quemRecebeu ?? null},
          ${ctx.user.id}, ${ctx.user.name},
          ${input.registroPaiId}, ${input.observacoes ?? null}, 'concluido'
        ) RETURNING id
      `);
      const saidaId = Number((regRes.rows?.[0] as any)?.id);

      // 5) Para cada item devolvido: ATUALIZA o item original com guarda atômica
      //    (`AND status_item='na_obra' RETURNING id`) — só insere a linha-espelho
      //    se o UPDATE afetou 1 linha. Isso evita race condition (duas saídas
      //    concorrentes do mesmo item passando pela validação inicial e ambas
      //    persistindo). Architect review: sem isso, dá pra criar 2 saídas para
      //    o mesmo item.
      for (let i = 0; i < input.itensDevolvidos.length; i++) {
        const it = input.itensDevolvidos[i];
        const origRow = (itensRes.rows as any[]).find(r => Number(r.id) === it.itemEntradaId);
        const updRes = await db.execute(sql`
          UPDATE ferramentas_terceiros_itens
          SET status_item = ${it.statusItem}
          WHERE id = ${it.itemEntradaId}
            AND company_id = ${input.companyId}
            AND status_item = 'na_obra'
          RETURNING id
        `);
        if (!updRes.rows?.length) {
          // Outro processo já devolveu este item entre nossa validação inicial e
          // este UPDATE. Aborta a operação inteira com erro de concorrência —
          // o cliente deve refazer com a lista atualizada. Itens já atualizados
          // nesta iteração permanecem; o usuário verá quais ainda restam.
          throw new TRPCError({
            code: "CONFLICT",
            message: `O item "${origRow?.descricao || it.itemEntradaId}" já foi processado em outra operação. Recarregue a lista e tente novamente.`,
          });
        }
        await db.execute(sql`
          INSERT INTO ferramentas_terceiros_itens (
            registro_id, company_id, descricao, foto_url, condicao,
            observacao, item_entrada_id, status_item, quantidade
          ) VALUES (
            ${saidaId}, ${input.companyId}, ${origRow?.descricao || 'item devolvido'},
            ${fotosSaida[i]}, ${it.condicaoSaida}, ${it.observacao ?? null},
            ${it.itemEntradaId}, ${it.statusItem}, 1
          )
        `);
      }

      // 6) Atualiza status do registro pai: se ainda restam itens 'na_obra' →
      //    'devolvido_parcial'; senão → 'devolvido_total'.
      const restRes = await db.execute(sql`
        SELECT COUNT(*) AS resta FROM ferramentas_terceiros_itens
        WHERE registro_id = ${input.registroPaiId}
          AND company_id = ${input.companyId}
          AND status_item = 'na_obra'
      `);
      const resta = Number((restRes.rows?.[0] as any)?.resta || 0);
      const novoStatusPai = resta === 0 ? 'devolvido_total' : 'devolvido_parcial';
      await db.execute(sql`
        UPDATE ferramentas_terceiros_registros
        SET status = ${novoStatusPai}, updated_at = NOW()
        WHERE id = ${input.registroPaiId} AND company_id = ${input.companyId}
      `);

      await db.insert(auditLogs).values({
        userId: ctx.user.id, userName: ctx.user.name, companyId: input.companyId,
        action: "CREATE", module: "ALMOXARIFADO", entityType: "FERRAMENTA_TERCEIRO_SAIDA",
        entityId: saidaId,
        details: `Saída — ${pai.empresa_terceira} — ${input.itensDevolvidos.length} item(ns) [pai #${input.registroPaiId} → ${novoStatusPai}]`,
      });

      return { id: saidaId, statusPai: novoStatusPai };
    }),

  // ─── Soft delete (admin) ───────────────────────────────────────
  remover: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode remover registros." });
      }
      const db = (await getDb())!;
      const res = await db.execute(sql`
        UPDATE ferramentas_terceiros_registros
        SET deleted_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
        RETURNING id
      `);
      if (!res.rows?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      await db.insert(auditLogs).values({
        userId: ctx.user.id, userName: ctx.user.name, companyId: input.companyId,
        action: "DELETE", module: "ALMOXARIFADO", entityType: "FERRAMENTA_TERCEIRO_REGISTRO",
        entityId: input.id, details: `Remoção (soft) de registro #${input.id}`,
      });
      return { ok: true };
    }),
});
