/**
 * Controle de Cheques Recebidos — Rev. 4098
 *
 * Registra cheques de terceiros recebidos como pagamento de clientes.
 * Serve para:
 *   1) Cadastro e controle (status disponivel/alocado/compensado/devolvido).
 *   2) Sugestão ao pagar fornecedor com "Cheque de Terceiro" (por proximidade de valor).
 *   3) Importação via .xlsx (headers flexíveis).
 *   4) Vínculo com cliente (empresa terceira) para filtrar/rastrear recebíveis por cliente.
 *
 * ZERO ALTER/DROP/DELETE — exclusão é soft-delete via excluido_em.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";

// ─────────────────────────── Tenant guard ───────────────────────────
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// dbExecute — mesmo padrão de cheques.ts
async function dbExecute(db: any, query: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${params[i - 1]}${sql.raw(tail)}` : sql`${built}${params[i - 1]}`;
  }
  const res = await db.execute(built);
  return { rows: (res as any)?.rows ?? (Array.isArray(res) ? res : []) };
}

// ─────────────────────────── Parsers ───────────────────────────
function parseValor(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.round(Math.abs(v) * 100) / 100;
  let s = String(v).replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) s = s.replace(/,/g, "");
    else s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma > -1) {
    const after = s.length - lastComma - 1;
    s = after === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(Math.abs(n) * 100) / 100;
}

function serialToISO(n: number): string | null {
  const dt = new Date(Math.round((n - 25569) * 86400 * 1000));
  return isNaN(dt.getTime())
    ? null
    : `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function parseData(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 1000) return serialToISO(v);
  const s = String(v).trim();
  const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmY) {
    const [, d, m, y] = dmY;
    const yr = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const mo = parseInt(m, 10), da = parseInt(d, 10);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function normTxt(s: any): string {
  return String(s ?? "")
    .replace(/[\u00BA\u00B0]/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────── Mapeador de colunas xlsx ───────────────────────────
type ColKey = "numero" | "emitente" | "banco" | "agencia" | "conta" | "valor" | "emissao" | "bomPara" | "observacao";

const COL_ALIASES: Record<ColKey, string[]> = {
  numero: ["numero", "num", "cheque", "nro", "nro cheque", "numero cheque",
           "n cheque", "no cheque", "nc", "numero do cheque", "num cheque",
           "nro do cheque", "n do cheque", "numero cheque emitido"],
  emitente: ["emitente", "emitente nome", "cliente", "sacado", "nome", "no"],
  banco:    ["banco", "banco emitente"],
  agencia:  ["agencia", "ag", "agencia bancaria"],
  conta:    ["conta", "conta corrente", "cc"],
  valor:    ["valor", "valor cheque", "r$", "valor r$"],
  emissao:  ["emissao", "data emissao", "dt emissao", "data emis"],
  bomPara:  ["bom para", "vencimento", "dt vencimento", "data vencimento", "compensacao", "dt compensacao"],
  observacao: ["obs", "observacao", "observacoes", "nota"],
};

function detectCols(header: string[]): Partial<Record<ColKey, number>> {
  const map: Partial<Record<ColKey, number>> = {};
  header.forEach((h, i) => {
    const n = normTxt(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES) as [ColKey, string[]][]) {
      if (map[key] != null) continue;
      if (aliases.some(a => n === a || n.startsWith(a))) {
        map[key] = i;
      }
    }
  });
  return map;
}

function parseWorkbookRecebidos(base64: string, companyId: number) {
  const buf = Buffer.from(base64, "base64");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const rows: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false }) as any[][];
    if (!raw.length) continue;

    let headerIdx = -1;
    let cols: Partial<Record<ColKey, number>> = {};
    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const row = raw[r] ?? [];
      const candidate = row.map((c: any) => String(c ?? "").trim());
      const detected = detectCols(candidate);
      const hasBasic = detected.numero != null && detected.valor != null;
      if (hasBasic) { headerIdx = r; cols = detected; break; }
    }
    if (headerIdx < 0) continue;

    for (let r = headerIdx + 1; r < raw.length; r++) {
      const row = raw[r] ?? [];
      const numero = String(row[cols.numero!] ?? "").trim();
      const valor = parseValor(row[cols.valor!]);
      if (!numero || !valor) continue;
      // Pula linhas de totalizador/resumo da planilha (ex.: "TOTAL", "SUBTOTAL", "SOMA")
      if (/^(total|subtotal|sub-total|soma|geral|resumo|grand\s*total)/i.test(numero)) continue;

      rows.push({
        numeroCheque: numero,
        emitenteNome: cols.emitente != null ? String(row[cols.emitente] ?? "").trim() || null : null,
        banco:        cols.banco    != null ? String(row[cols.banco]    ?? "").trim() || null : null,
        agencia:      cols.agencia  != null ? String(row[cols.agencia]  ?? "").trim() || null : null,
        conta:        cols.conta    != null ? String(row[cols.conta]    ?? "").trim() || null : null,
        valor,
        dataEmissao:  cols.emissao  != null ? parseData(row[cols.emissao])  : null,
        dataBomPara:  cols.bomPara  != null ? parseData(row[cols.bomPara])  : null,
        observacao:   cols.observacao != null ? String(row[cols.observacao] ?? "").trim() || null : null,
        companyId,
      });
    }
  }
  return rows;
}

// ─────────────────────────── Router ───────────────────────────
export const chequesRecebidosRouter = router({

  // ── Lista principal ──
  listar: protectedProcedure
    .input(z.object({
      companyId: z.coerce.number(),
      status:    z.string().optional(),
      busca:     z.string().optional(),
      mes:       z.number().int().min(1).max(12).nullable().optional(),
      ano:       z.number().int().optional(),
      clienteId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      let where = `company_id=$1 AND excluido_em IS NULL`;
      const params: unknown[] = [input.companyId];
      let idx = 2;

      if (input.status && input.status !== "todos") {
        where += ` AND status=$${idx++}`;
        params.push(input.status);
      }
      if (input.mes && input.ano) {
        where += ` AND (EXTRACT(MONTH FROM COALESCE(data_bom_para, data_emissao, criado_em::date))=$${idx} AND EXTRACT(YEAR FROM COALESCE(data_bom_para, data_emissao, criado_em::date))=$${idx + 1})`;
        params.push(input.mes, input.ano);
        idx += 2;
      } else if (input.ano) {
        where += ` AND EXTRACT(YEAR FROM COALESCE(data_bom_para, data_emissao, criado_em::date))=$${idx++}`;
        params.push(input.ano);
      }
      if (input.clienteId != null) {
        where += ` AND cliente_id=$${idx++}`;
        params.push(input.clienteId);
      }
      if (input.busca?.trim()) {
        const like = `%${input.busca.trim()}%`;
        where += ` AND (numero_cheque ILIKE $${idx} OR emitente_nome ILIKE $${idx+1} OR banco ILIKE $${idx+2} OR fornecedor_alocado_nome ILIKE $${idx+3} OR cliente_nome ILIKE $${idx+4})`;
        params.push(like, like, like, like, like);
        idx += 5;
      }

      const res = await dbExecute(db, `
        SELECT cr.*, fe.data_competencia AS entry_data, fe.descricao AS entry_descricao, fe.valor_previsto AS entry_valor
        FROM (SELECT * FROM financial_cheques_recebidos WHERE ${where}) cr
        LEFT JOIN financial_entries fe ON fe.id = cr.entry_id
        ORDER BY COALESCE(cr.data_bom_para, cr.data_emissao) DESC, cr.id DESC
        LIMIT 2000
      `, params);

      return { cheques: res.rows };
    }),

  // ── Lista clientes disponíveis (empresas_terceiras do tenant) ──
  listarClientes: protectedProcedure
    .input(z.object({ companyId: z.coerce.number() }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        SELECT id,
               COALESCE(NULLIF(TRIM(razao_social), ''), nome_fantasia, '') AS nome,
               nome_fantasia,
               COALESCE(cnpj, cpf) AS cnpj
        FROM clientes
        WHERE company_id=$1
          AND ativo IS NOT FALSE
        ORDER BY LOWER(COALESCE(NULLIF(TRIM(razao_social), ''), nome_fantasia, ''))
        LIMIT 500
      `, [input.companyId]);

      return { clientes: res.rows };
    }),

  // ── Buscar disponíveis por proximidade de valor ──
  sugerirPorValor: protectedProcedure
    .input(z.object({
      companyId: z.coerce.number(),
      valorAlvo: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        SELECT * FROM financial_cheques_recebidos
        WHERE company_id=$1 AND status='disponivel' AND excluido_em IS NULL
        ORDER BY ABS(valor - $2) ASC, data_bom_para ASC NULLS LAST
        LIMIT 50
      `, [input.companyId, input.valorAlvo]);

      return { cheques: res.rows };
    }),

  // ── Criar manualmente ──
  criar: protectedProcedure
    .input(z.object({
      companyId:    z.coerce.number(),
      numeroCheque: z.string().min(1),
      emitenteNome: z.string().optional(),
      banco:        z.string().optional(),
      agencia:      z.string().optional(),
      conta:        z.string().optional(),
      valor:        z.number().positive(),
      dataEmissao:  z.string().optional(),
      dataBomPara:  z.string().optional(),
      observacao:   z.string().optional(),
      clienteId:    z.number().nullable().optional(),
      clienteNome:  z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        INSERT INTO financial_cheques_recebidos
          (company_id, numero_cheque, emitente_nome, banco, agencia, conta,
           valor, data_emissao, data_bom_para, status, observacao,
           cliente_id, cliente_nome,
           criado_por_id, criado_por_nome, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, $4, $5, $6,
           $7, $8, $9, 'disponivel', $10,
           $11, $12,
           $13, $14, NOW(), NOW())
        RETURNING id
      `, [
        input.companyId, input.numeroCheque, input.emitenteNome ?? null,
        input.banco ?? null, input.agencia ?? null, input.conta ?? null,
        input.valor,
        input.dataEmissao ?? null, input.dataBomPara ?? null,
        input.observacao ?? null,
        input.clienteId ?? null, input.clienteNome ?? null,
        ctx.user.id, ctx.user.name ?? ctx.user.email ?? null,
      ]);

      return { id: res.rows[0]?.id, ok: true };
    }),

  // ── Atualizar status / dados ──
  atualizar: protectedProcedure
    .input(z.object({
      id:           z.number().int(),
      companyId:    z.coerce.number(),
      numeroCheque: z.string().min(1).optional(),
      emitenteNome: z.string().nullable().optional(),
      banco:        z.string().nullable().optional(),
      agencia:      z.string().nullable().optional(),
      conta:        z.string().nullable().optional(),
      valor:        z.number().positive().optional(),
      dataEmissao:  z.string().nullable().optional(),
      dataBomPara:  z.string().nullable().optional(),
      status:       z.enum(["disponivel", "alocado", "compensado", "devolvido"]).optional(),
      fornecedorAlocadoId:   z.number().nullable().optional(),
      fornecedorAlocadoNome: z.string().nullable().optional(),
      entryId:      z.number().nullable().optional(),
      observacao:   z.string().nullable().optional(),
      clienteId:    z.number().nullable().optional(),
      clienteNome:  z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const existing = await dbExecute(db, `
        SELECT id FROM financial_cheques_recebidos
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL
      `, [input.id, input.companyId]);
      if (!existing.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cheque não encontrado." });

      const sets: string[] = ["atualizado_em=NOW()"];
      const params: unknown[] = [];
      let idx = 1;

      function maybeSet(col: string, val: any) {
        if (val !== undefined) { sets.push(`${col}=$${idx++}`); params.push(val); }
      }
      maybeSet("numero_cheque", input.numeroCheque);
      maybeSet("emitente_nome", input.emitenteNome);
      maybeSet("banco", input.banco);
      maybeSet("agencia", input.agencia);
      maybeSet("conta", input.conta);
      maybeSet("valor", input.valor);
      maybeSet("data_emissao", input.dataEmissao);
      maybeSet("data_bom_para", input.dataBomPara);
      maybeSet("status", input.status);
      // compensado_em: registra o momento exato da compensação para rastreabilidade
      if (input.status === "compensado") {
        sets.push(`compensado_em=NOW()`);
      } else if (input.status !== undefined) {
        sets.push(`compensado_em=NULL`);
      }
      maybeSet("fornecedor_alocado_id", input.fornecedorAlocadoId);
      maybeSet("fornecedor_alocado_nome", input.fornecedorAlocadoNome);
      maybeSet("entry_id", input.entryId);
      maybeSet("observacao", input.observacao);
      maybeSet("cliente_id", input.clienteId);
      maybeSet("cliente_nome", input.clienteNome);

      params.push(input.id);
      await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET ${sets.join(", ")}
        WHERE id=$${idx}
      `, params);

      return { ok: true };
    }),

  // ── Atribuir cliente em lote ──
  atribuirCliente: protectedProcedure
    .input(z.object({
      companyId:   z.coerce.number(),
      ids:         z.array(z.number().int()).min(1),
      clienteId:   z.number().nullable(),
      clienteNome: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      let atualizados = 0;
      for (const id of input.ids) {
        const res = await dbExecute(db, `
          UPDATE financial_cheques_recebidos
          SET cliente_id=$1, cliente_nome=$2, atualizado_em=NOW()
          WHERE id=$3 AND company_id=$4 AND excluido_em IS NULL
          RETURNING id
        `, [input.clienteId, input.clienteNome, id, input.companyId]);
        if (res.rows.length) atualizados++;
      }
      return { atualizados };
    }),

  // ── Alocar para pagamento de fornecedor ──
  alocar: protectedProcedure
    .input(z.object({
      id:                    z.number().int(),
      companyId:             z.coerce.number(),
      fornecedorAlocadoId:   z.number().nullable().optional(),
      fornecedorAlocadoNome: z.string().optional(),
      entryId:               z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const existing = await dbExecute(db, `
        SELECT id, status FROM financial_cheques_recebidos
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL
      `, [input.id, input.companyId]);
      if (!existing.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cheque não encontrado." });
      if (existing.rows[0].status !== "disponivel") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cheque não está disponível para alocação." });
      }

      await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET status='alocado',
            fornecedor_alocado_id=$1,
            fornecedor_alocado_nome=$2,
            entry_id=$3,
            atualizado_em=NOW()
        WHERE id=$4
      `, [input.fornecedorAlocadoId ?? null, input.fornecedorAlocadoNome ?? null, input.entryId ?? null, input.id]);

      return { ok: true };
    }),

  // ── Liberar alocação (devolver para disponível) ──
  liberarAlocacao: protectedProcedure
    .input(z.object({ id: z.number().int(), companyId: z.coerce.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const existing = await dbExecute(db, `
        SELECT id, status FROM financial_cheques_recebidos
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL
      `, [input.id, input.companyId]);
      if (!existing.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cheque não encontrado." });
      if (existing.rows[0].status !== "alocado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cheque não está alocado." });
      }

      await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET status='disponivel',
            fornecedor_alocado_id=NULL,
            fornecedor_alocado_nome=NULL,
            entry_id=NULL,
            atualizado_em=NOW()
        WHERE id=$1
      `, [input.id]);

      return { ok: true };
    }),

  // ── Excluir (soft-delete) ──
  excluir: protectedProcedure
    .input(z.object({ id: z.number().int(), companyId: z.coerce.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const existing = await dbExecute(db, `
        SELECT id FROM financial_cheques_recebidos
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL
      `, [input.id, input.companyId]);
      if (!existing.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cheque não encontrado." });

      await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET excluido_em=NOW(), atualizado_em=NOW()
        WHERE id=$1
      `, [input.id]);

      return { ok: true };
    }),

  // ── Alocar em lote (cheques de terceiro no pagamento consolidado) ──
  alocarLote: protectedProcedure
    .input(z.object({
      companyId:             z.coerce.number(),
      ids:                   z.array(z.number().int()),
      fornecedorAlocadoNome: z.string().optional(),
      entryId:               z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      if (!input.ids.length) return { alocados: 0, ignorados: 0 };
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      let alocados = 0, ignorados = 0;
      for (const id of input.ids) {
        const res = await dbExecute(db, `
          UPDATE financial_cheques_recebidos
          SET status='alocado',
              fornecedor_alocado_nome=$1,
              entry_id=$2,
              atualizado_em=NOW()
          WHERE id=$3 AND company_id=$4 AND status='disponivel' AND excluido_em IS NULL
          RETURNING id
        `, [input.fornecedorAlocadoNome ?? null, input.entryId ?? null, id, input.companyId]);
        if (res.rows.length) alocados++;
        else ignorados++;
      }
      return { alocados, ignorados };
    }),

  // ── Importação via xlsx — preview dry-run ──
  importarPreview: protectedProcedure
    .input(z.object({ companyId: z.coerce.number(), base64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const rows = parseWorkbookRecebidos(input.base64, input.companyId);
      let novos = 0, duplicados = 0;
      for (const r of rows) {
        const ex = await dbExecute(db, `
          SELECT id FROM financial_cheques_recebidos
          WHERE company_id=$1 AND numero_cheque=$2 AND valor=$3 AND excluido_em IS NULL
          LIMIT 1
        `, [input.companyId, r.numeroCheque, r.valor]);
        if (ex.rows.length) duplicados++;
        else novos++;
      }
      return { total: rows.length, novos, duplicados, amostra: rows.slice(0, 5) };
    }),

  // ── Importação via xlsx — confirmar ──
  importarConfirmar: protectedProcedure
    .input(z.object({
      companyId:   z.coerce.number(),
      base64:      z.string(),
      clienteId:   z.number().nullable().optional(),
      clienteNome: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const rows = parseWorkbookRecebidos(input.base64, input.companyId);
      if (!rows.length) return { inseridos: 0, ignorados: 0 };

      let inseridos = 0, ignorados = 0;
      for (const r of rows) {
        const existing = await dbExecute(db, `
          SELECT id FROM financial_cheques_recebidos
          WHERE company_id=$1 AND numero_cheque=$2 AND valor=$3 AND excluido_em IS NULL
          LIMIT 1
        `, [input.companyId, r.numeroCheque, r.valor]);
        if (existing.rows.length) { ignorados++; continue; }

        await dbExecute(db, `
          INSERT INTO financial_cheques_recebidos
            (company_id, numero_cheque, emitente_nome, banco, agencia, conta,
             valor, data_emissao, data_bom_para, status, observacao,
             cliente_id, cliente_nome,
             criado_por_id, criado_por_nome, criado_em, atualizado_em)
          VALUES
            ($1, $2, $3, $4, $5, $6,
             $7, $8, $9, 'disponivel', $10,
             $11, $12,
             $13, $14, NOW(), NOW())
        `, [
          r.companyId, r.numeroCheque, r.emitenteNome,
          r.banco, r.agencia, r.conta,
          r.valor, r.dataEmissao, r.dataBomPara,
          r.observacao,
          input.clienteId ?? null, input.clienteNome ?? null,
          ctx.user.id, ctx.user.name ?? ctx.user.email ?? null,
        ]);
        inseridos++;
      }

      return { inseridos, ignorados };
    }),

  // ── Limpar registros de totalizador (soft-delete de linhas com numero_cheque = "TOTAL" etc.) ──
  limparTotalizadores: protectedProcedure
    .input(z.object({ companyId: z.coerce.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET excluido_em = NOW(), atualizado_em = NOW()
        WHERE company_id = $1
          AND excluido_em IS NULL
          AND numero_cheque ~* '^(total|subtotal|sub-total|soma|geral|resumo|grand\\s*total)'
        RETURNING id, numero_cheque, valor
      `, [input.companyId]);

      return { removidos: res.rows.length, registros: res.rows };
    }),

  // ── Limpar todos os registros (soft-delete — somente admin_master) ──
  limparTodos: protectedProcedure
    .input(z.object({ companyId: z.coerce.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode executar esta ação." });
      }
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        UPDATE financial_cheques_recebidos
        SET excluido_em = now()
        WHERE company_id=$1 AND excluido_em IS NULL
        RETURNING id
      `, [input.companyId]);

      return { excluidos: res.rows.length };
    }),

  // ── Resumo por mês (bolinhas do nav) ──
  resumoPorMes: protectedProcedure
    .input(z.object({ companyId: z.coerce.number(), ano: z.coerce.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      const res = await dbExecute(db, `
        SELECT
          EXTRACT(MONTH FROM COALESCE(data_bom_para, data_emissao, criado_em::date))::int AS mes,
          COUNT(*)::int AS qtd,
          COUNT(*) FILTER (WHERE status='compensado')::int AS compensados
        FROM financial_cheques_recebidos
        WHERE company_id=$1 AND excluido_em IS NULL
          AND EXTRACT(YEAR FROM COALESCE(data_bom_para, data_emissao, criado_em::date))=$2
        GROUP BY 1
      `, [input.companyId, input.ano]);
      return res.rows.map((r: any) => ({ mes: Number(r.mes), qtd: Number(r.qtd), compensados: Number(r.compensados) }));
    }),

  // ── Totais por status (resumo cards) ──
  totais: protectedProcedure
    .input(z.object({ companyId: z.coerce.number() }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const res = await dbExecute(db, `
        SELECT status, COUNT(*) as qtd, COALESCE(SUM(valor), 0) as total
        FROM financial_cheques_recebidos
        WHERE company_id=$1 AND excluido_em IS NULL
        GROUP BY status
      `, [input.companyId]);

      const out: Record<string, { qtd: number; total: number }> = {};
      for (const r of res.rows) {
        out[r.status] = { qtd: Number(r.qtd), total: Number(r.total) };
      }
      return out;
    }),
});
