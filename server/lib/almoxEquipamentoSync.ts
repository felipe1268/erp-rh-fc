import { sql } from "drizzle-orm";

/**
 * Rev. 2405 — Garante que todo equipamento (próprio ou locado) com obra
 * indicada apareça como item de almoxarifado dessa obra, com vínculo
 * bidirecional via `equipamento_vinculado_tipo/_id`.
 *
 * Idempotente:
 *  - Se já existe item de almox vinculado a este equipamento na obra correta: no-op.
 *  - Se existe vinculado em obra DIFERENTE (transferência): UPDATE obra_id.
 *  - Se não existe: INSERT novo item com quantidade_atual=1.
 *
 * NÃO faz nada quando obraId é null/undefined (equipamento "no almox central"
 * ou sem obra alvo).
 *
 * R-001/R-007/R-010 OK — sem DROP/DELETE; só INSERT/UPDATE.
 */
export async function ensureAlmoxItemForEquipamento(
  db: any,
  params: {
    companyId: number;
    tipo: "proprio" | "locado";
    equipamentoId: number;
    obraId: number | null | undefined;
    nome: string;
    categoria?: string | null;
    fotoUrl?: string | null;
    fornecedorNome?: string | null;
    dataInicio?: string | null;
    dataFim?: string | null;
    valorMensal?: number | string | null;
    valorUnitario?: number | string | null;
    userId?: number | null;
    userName?: string | null;
  },
): Promise<{ itemId: number; acao: "criado" | "transferido" | "nenhum" } | null> {
  if (!params.obraId) return null;
  try {
    const existing: any = await db.execute(sql`
      SELECT id, obra_id FROM almoxarifado_itens
      WHERE company_id = ${params.companyId}
        AND equipamento_vinculado_tipo = ${params.tipo}
        AND equipamento_vinculado_id = ${params.equipamentoId}
      LIMIT 1
    `);
    const row = existing?.rows?.[0];
    if (row) {
      if (Number(row.obra_id) === Number(params.obraId)) {
        return { itemId: Number(row.id), acao: "nenhum" };
      }
      await db.execute(sql`
        UPDATE almoxarifado_itens
        SET obra_id = ${params.obraId},
            atualizado_em = NOW(),
            atualizado_por_id = ${params.userId ?? null},
            atualizado_por_nome = ${params.userName ?? null}
        WHERE id = ${row.id}
      `);
      return { itemId: Number(row.id), acao: "transferido" };
    }
    const origem = params.tipo === "locado" ? "locacao" : "proprio";
    const valorUnit = params.valorUnitario != null ? String(params.valorUnitario) : null;
    const valorMen = params.valorMensal != null ? String(params.valorMensal) : null;
    await db.execute(sql`SELECT pg_advisory_xact_lock(${params.companyId}::int, 1010::int)`);
    const inserted: any = await db.execute(sql`
      WITH base AS (
        SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_interno FROM '^MAT-(\\d+)$') AS INTEGER)), 0) AS m
        FROM almoxarifado_itens WHERE company_id = ${params.companyId} AND codigo_interno ~ '^MAT-\\d+$'
      )
      INSERT INTO almoxarifado_itens (
        company_id, obra_id, nome, unidade, categoria,
        quantidade_atual, foto_url, origem,
        fornecedor_locacao, data_inicio_locacao, data_vencimento_locacao,
        valor_unitario, valor_locacao_mensal,
        equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
        codigo_interno, criado_por_id, criado_por_nome, criado_em, atualizado_em
      )
      SELECT
        ${params.companyId}, ${params.obraId}, padronizar_nome_material(${params.nome}::text), 'un', ${params.categoria ?? null},
        1, ${params.fotoUrl ?? null}, ${origem},
        ${params.fornecedorNome ?? null}, ${params.dataInicio ?? null}, ${params.dataFim ?? null},
        ${valorUnit}, ${valorMen},
        ${params.tipo}, ${params.equipamentoId}, NOW(),
        'MAT-' || LPAD((base.m + 1)::text, 4, '0'),
        ${params.userId ?? null}, ${params.userName ?? "[Rev.2405 auto]"}, NOW(), NOW()
      FROM base
      RETURNING id
    `);
    return { itemId: Number(inserted?.rows?.[0]?.id), acao: "criado" };
  } catch (e: any) {
    console.error("[ensureAlmoxItemForEquipamento] falhou:", e?.message || e);
    return null;
  }
}

/**
 * Backfill em lote: garante vínculo no almox pra TODOS os equipamentos próprios
 * e locados que tenham obra indicada e ainda não estejam vinculados a um item.
 * Executado no startup do servidor. Idempotente: rodar várias vezes não duplica.
 *
 * R-001/R-007/R-010 OK: só INSERT (zero DELETE/DROP/ALTER destrutivo).
 */
export async function backfillAlmoxFromEquipamentos(
  db: any,
): Promise<{ locadosInseridos: number; propriosInseridos: number }> {
  let locadosInseridos = 0;
  let propriosInseridos = 0;

  // Check de existência das tabelas (dev sem `pnpm db:push` não tem).
  const tablesCheck: any = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('equipamentos_locados','equipamentos_proprios','almoxarifado_itens')
  `);
  const present = new Set<string>((tablesCheck?.rows ?? []).map((r: any) => String(r.table_name)));
  if (!present.has("almoxarifado_itens")) return { locadosInseridos: 0, propriosInseridos: 0 };

  if (present.has("equipamentos_locados")) {
    try {
      const companyIds: any = await db.execute(sql`
        SELECT DISTINCT el.company_id FROM equipamentos_locados el
        WHERE el.obra_id IS NOT NULL AND el.status <> 'devolvido'
          AND NOT EXISTS (
            SELECT 1 FROM almoxarifado_itens ai
            WHERE ai.company_id = el.company_id
              AND ai.equipamento_vinculado_tipo = 'locado'
              AND ai.equipamento_vinculado_id = el.id
          )
      `);
      for (const { company_id: companyId } of companyIds?.rows ?? []) {
        await db.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, 1010::int)`);
        const r: any = await db.execute(sql`
          WITH base AS (
            SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_interno FROM '^MAT-(\\d+)$') AS INTEGER)), 0) AS m
            FROM almoxarifado_itens WHERE company_id = ${companyId} AND codigo_interno ~ '^MAT-\\d+$'
          ),
          candidatos AS (
            SELECT el.*, ROW_NUMBER() OVER (ORDER BY el.id ASC) AS rn
            FROM equipamentos_locados el
            WHERE el.company_id = ${companyId}
              AND el.obra_id IS NOT NULL
              AND el.status <> 'devolvido'
              AND NOT EXISTS (
                SELECT 1 FROM almoxarifado_itens ai
                WHERE ai.company_id = el.company_id
                  AND ai.equipamento_vinculado_tipo = 'locado'
                  AND ai.equipamento_vinculado_id = el.id
              )
          )
          INSERT INTO almoxarifado_itens (
            company_id, obra_id, nome, unidade, categoria,
            quantidade_atual, foto_url, origem,
            fornecedor_locacao, data_inicio_locacao, data_vencimento_locacao,
            valor_locacao_mensal,
            equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
            codigo_interno, criado_por_nome, criado_em, atualizado_em
          )
          SELECT
            c.company_id, c.obra_id, padronizar_nome_material(c.descricao), 'un', c.categoria,
            1,
            COALESCE(c.foto_url, (c.fotos_recebimento_json->0->>'url')),
            'locacao',
            c.fornecedor_nome, c.data_inicio, c.data_fim_prevista,
            c.valor_mensal,
            'locado', c.id, NOW(),
            'MAT-' || LPAD(((SELECT m FROM base) + c.rn)::text, 4, '0'),
            '[Rev.2405 backfill]', NOW(), NOW()
          FROM candidatos c
          RETURNING id
        `);
        locadosInseridos += r?.rows?.length ?? 0;
      }
    } catch (e: any) {
      console.error("[BackfillAlmoxEquip] FALHA locados:", e?.message || e);
    }
  }

  if (present.has("equipamentos_proprios")) {
    try {
      const companyIds: any = await db.execute(sql`
        SELECT DISTINCT ep.company_id FROM equipamentos_proprios ep
        WHERE ep.localizacao_atual_obra_id IS NOT NULL AND ep.localizacao_atual_tipo = 'obra'
          AND COALESCE(ep.ativo, true) = true
          AND NOT EXISTS (
            SELECT 1 FROM almoxarifado_itens ai
            WHERE ai.company_id = ep.company_id
              AND ai.equipamento_vinculado_tipo = 'proprio'
              AND ai.equipamento_vinculado_id = ep.id
          )
      `);
      for (const { company_id: companyId } of companyIds?.rows ?? []) {
        await db.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, 1010::int)`);
        const r: any = await db.execute(sql`
          WITH base AS (
            SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_interno FROM '^MAT-(\\d+)$') AS INTEGER)), 0) AS m
            FROM almoxarifado_itens WHERE company_id = ${companyId} AND codigo_interno ~ '^MAT-\\d+$'
          ),
          candidatos AS (
            SELECT ep.*, ROW_NUMBER() OVER (ORDER BY ep.id ASC) AS rn
            FROM equipamentos_proprios ep
            WHERE ep.company_id = ${companyId}
              AND ep.localizacao_atual_obra_id IS NOT NULL
              AND ep.localizacao_atual_tipo = 'obra'
              AND COALESCE(ep.ativo, true) = true
              AND NOT EXISTS (
                SELECT 1 FROM almoxarifado_itens ai
                WHERE ai.company_id = ep.company_id
                  AND ai.equipamento_vinculado_tipo = 'proprio'
                  AND ai.equipamento_vinculado_id = ep.id
              )
          )
          INSERT INTO almoxarifado_itens (
            company_id, obra_id, nome, unidade, categoria,
            quantidade_atual, foto_url, origem,
            valor_unitario,
            equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
            codigo_interno, criado_por_nome, criado_em, atualizado_em
          )
          SELECT
            c.company_id, c.localizacao_atual_obra_id, padronizar_nome_material(c.descricao), 'un', c.categoria,
            1,
            (c.fotos_json->0->>'url'),
            'proprio',
            c.valor_aquisicao,
            'proprio', c.id, NOW(),
            'MAT-' || LPAD(((SELECT m FROM base) + c.rn)::text, 4, '0'),
            '[Rev.2405 backfill]', NOW(), NOW()
          FROM candidatos c
          RETURNING id
        `);
        propriosInseridos += r?.rows?.length ?? 0;
      }
    } catch (e: any) {
      console.error("[BackfillAlmoxEquip] FALHA proprios:", e?.message || e);
    }
  }

  return { locadosInseridos, propriosInseridos };
}

/**
 * Rev. 2411 — Remove o item de almoxarifado vinculado a um equipamento
 * (próprio ou locado) específico. Usado quando o locado é devolvido ao
 * fornecedor ou excluído do cadastro — o item DEVE sumir do almox local
 * porque deixou de estar fisicamente na obra.
 *
 * Idempotente: se não existe vínculo, retorna 0.
 * R-001/R-007/R-010 OK — DELETE de linhas, sem DROP/ALTER.
 */
export async function removeAlmoxItemForEquipamento(
  db: any,
  params: { companyId: number; tipo: "proprio" | "locado"; equipamentoId: number },
): Promise<number> {
  try {
    const r: any = await db.execute(sql`
      DELETE FROM almoxarifado_itens
      WHERE company_id = ${params.companyId}
        AND equipamento_vinculado_tipo = ${params.tipo}
        AND equipamento_vinculado_id = ${params.equipamentoId}
      RETURNING id
    `);
    return r?.rows?.length ?? 0;
  } catch (e: any) {
    console.error("[removeAlmoxItemForEquipamento] falhou:", e?.message || e);
    return 0;
  }
}

/**
 * Rev. 2411 — Versão bulk pra `locadosExcluirLote`. Remove TODOS os
 * itens almox vinculados aos `ids` do tipo dado em 1 round-trip.
 */
export async function removeAlmoxItemsForEquipamentos(
  db: any,
  params: { companyId: number; tipo: "proprio" | "locado"; ids: number[] },
): Promise<number> {
  if (!params.ids || params.ids.length === 0) return 0;
  try {
    const r: any = await db.execute(sql`
      DELETE FROM almoxarifado_itens
      WHERE company_id = ${params.companyId}
        AND equipamento_vinculado_tipo = ${params.tipo}
        AND equipamento_vinculado_id = ANY(${params.ids}::int[])
      RETURNING id
    `);
    return r?.rows?.length ?? 0;
  } catch (e: any) {
    console.error("[removeAlmoxItemsForEquipamentos] falhou:", e?.message || e);
    return 0;
  }
}

/**
 * Rev. 2411 — Limpa vínculos órfãos no almox no startup. Remove items
 * almox que apontam pra:
 *  - locado que não existe mais no banco (excluído via DELETE),
 *  - locado com status = 'devolvido' (devolvido ao fornecedor),
 *  - próprio que não existe mais ou está inativo.
 *
 * Sintoma sem essa limpeza: depois que o user excluiu locados, almox
 * continuou mostrando cards "Equipamento Locado #8221" apontando pra
 * ID inexistente.
 *
 * R-001/R-007/R-010 OK — DELETE de linhas, sem DROP/ALTER.
 */
export async function purgeStaleAlmoxLinks(db: any): Promise<{
  locadosRemovidos: number;
  propriosRemovidos: number;
}> {
  let locadosRemovidos = 0;
  let propriosRemovidos = 0;

  const tablesCheck: any = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('equipamentos_locados','equipamentos_proprios','almoxarifado_itens')
  `);
  const present = new Set<string>((tablesCheck?.rows ?? []).map((r: any) => String(r.table_name)));
  if (!present.has("almoxarifado_itens")) return { locadosRemovidos: 0, propriosRemovidos: 0 };

  if (present.has("equipamentos_locados")) {
    try {
      const r: any = await db.execute(sql`
        DELETE FROM almoxarifado_itens ai
        WHERE ai.equipamento_vinculado_tipo = 'locado'
          AND (
            NOT EXISTS (
              SELECT 1 FROM equipamentos_locados el
              WHERE el.id = ai.equipamento_vinculado_id
                AND el.company_id = ai.company_id
            )
            OR EXISTS (
              SELECT 1 FROM equipamentos_locados el
              WHERE el.id = ai.equipamento_vinculado_id
                AND el.company_id = ai.company_id
                AND el.status = 'devolvido'
            )
          )
        RETURNING id
      `);
      locadosRemovidos = r?.rows?.length ?? 0;
    } catch (e: any) {
      console.error("[purgeStaleAlmoxLinks] FALHA locados:", e?.message || e);
    }
  }

  if (present.has("equipamentos_proprios")) {
    try {
      const r: any = await db.execute(sql`
        DELETE FROM almoxarifado_itens ai
        WHERE ai.equipamento_vinculado_tipo = 'proprio'
          AND NOT EXISTS (
            SELECT 1 FROM equipamentos_proprios ep
            WHERE ep.id = ai.equipamento_vinculado_id
              AND ep.company_id = ai.company_id
              AND COALESCE(ep.ativo, true) = true
          )
        RETURNING id
      `);
      propriosRemovidos = r?.rows?.length ?? 0;
    } catch (e: any) {
      console.error("[purgeStaleAlmoxLinks] FALHA proprios:", e?.message || e);
    }
  }

  return { locadosRemovidos, propriosRemovidos };
}
