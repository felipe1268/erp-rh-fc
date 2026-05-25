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
    const inserted: any = await db.execute(sql`
      INSERT INTO almoxarifado_itens (
        company_id, obra_id, nome, unidade, categoria,
        quantidade_atual, foto_url, origem,
        fornecedor_locacao, data_inicio_locacao, data_vencimento_locacao,
        valor_unitario, valor_locacao_mensal,
        equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
        criado_por_id, criado_por_nome, criado_em, atualizado_em
      ) VALUES (
        ${params.companyId}, ${params.obraId}, ${params.nome}, 'un', ${params.categoria ?? null},
        1, ${params.fotoUrl ?? null}, ${origem},
        ${params.fornecedorNome ?? null}, ${params.dataInicio ?? null}, ${params.dataFim ?? null},
        ${valorUnit}, ${valorMen},
        ${params.tipo}, ${params.equipamentoId}, NOW(),
        ${params.userId ?? null}, ${params.userName ?? "[Rev.2405 auto]"}, NOW(), NOW()
      )
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
      const r: any = await db.execute(sql`
        INSERT INTO almoxarifado_itens (
          company_id, obra_id, nome, unidade, categoria,
          quantidade_atual, foto_url, origem,
          fornecedor_locacao, data_inicio_locacao, data_vencimento_locacao,
          valor_locacao_mensal,
          equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
          criado_por_nome, criado_em, atualizado_em
        )
        SELECT
          el.company_id, el.obra_id, el.descricao, 'un', el.categoria,
          1,
          COALESCE(el.foto_url, (el.fotos_recebimento_json->0->>'url')),
          'locacao',
          el.fornecedor_nome, el.data_inicio, el.data_fim_prevista,
          el.valor_mensal,
          'locado', el.id, NOW(),
          '[Rev.2405 backfill]', NOW(), NOW()
        FROM equipamentos_locados el
        WHERE el.obra_id IS NOT NULL
          AND el.status <> 'devolvido'
          AND NOT EXISTS (
            SELECT 1 FROM almoxarifado_itens ai
            WHERE ai.company_id = el.company_id
              AND ai.equipamento_vinculado_tipo = 'locado'
              AND ai.equipamento_vinculado_id = el.id
          )
        RETURNING id
      `);
      locadosInseridos = r?.rows?.length ?? 0;
    } catch (e: any) {
      console.error("[BackfillAlmoxEquip] FALHA locados:", e?.message || e);
    }
  }

  if (present.has("equipamentos_proprios")) {
    try {
      const r: any = await db.execute(sql`
      INSERT INTO almoxarifado_itens (
        company_id, obra_id, nome, unidade, categoria,
        quantidade_atual, foto_url, origem,
        valor_unitario,
        equipamento_vinculado_tipo, equipamento_vinculado_id, equipamento_vinculado_em,
        criado_por_nome, criado_em, atualizado_em
      )
      SELECT
        ep.company_id, ep.localizacao_atual_obra_id, ep.descricao, 'un', ep.categoria,
        1,
        (ep.fotos_json->0->>'url'),
        'proprio',
        ep.valor_aquisicao,
        'proprio', ep.id, NOW(),
        '[Rev.2405 backfill]', NOW(), NOW()
      FROM equipamentos_proprios ep
      WHERE ep.localizacao_atual_obra_id IS NOT NULL
        AND ep.localizacao_atual_tipo = 'obra'
        AND COALESCE(ep.ativo, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM almoxarifado_itens ai
          WHERE ai.company_id = ep.company_id
            AND ai.equipamento_vinculado_tipo = 'proprio'
            AND ai.equipamento_vinculado_id = ep.id
        )
      RETURNING id
    `);
      propriosInseridos = r?.rows?.length ?? 0;
    } catch (e: any) {
      console.error("[BackfillAlmoxEquip] FALHA proprios:", e?.message || e);
    }
  }

  return { locadosInseridos, propriosInseridos };
}
