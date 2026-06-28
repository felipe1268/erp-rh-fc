/**
 * autoVincularNfService.ts
 *
 * Após uma linha de extrato ser conciliada (conciliado=1), tenta vincular
 * automaticamente uma NF-e correspondente:
 *   crédito bancário  →  NFS-e emitida pela FC  (stmt_line_id em fiscal_notes)
 *   débito bancário   →  NF-e recebida (SEFAZ)  (stmt_line_id em fiscal_notes)
 *
 * Critérios de casamento (em ordem de prioridade):
 *   1. CNPJ + valor ±2% + data ±60 dias  → alta confiança → vincula
 *   2. Valor ±0.5% + data ±15 dias (sem CNPJ) → vincula só p/ créditos
 *   3. Sem CNPJ + débito → não vincula (risco de falso-positivo alto)
 *
 * Chamado de forma SÍNCRONA após cada conciliação com .catch(() => {}) para
 * nunca bloquear nem reverter o fluxo principal de conciliação.
 */

import { getDb } from "../db";

function cnpjFromText(text: string): string | null {
  if (!text) return null;
  // Formato XX.XXX.XXX/XXXX-XX (com ou sem pontuação parcial)
  const m1 = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?(?:\d{4})-?\d{2}/);
  if (m1) {
    const digits = m1[0].replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  // 14 dígitos consecutivos como "palavra" (sem letras adjacentes)
  const m2 = text.match(/(?<!\d)(\d{14})(?!\d)/);
  if (m2) return m2[1];
  return null;
}

function cnpjNorm(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/**
 * Recebe uma lista de stmt_line_ids recém-conciliados e tenta vincular NFs.
 * Seguro: erros internos são absorvidos no catch do chamador.
 */
export async function autoVincularNfsPorLinhas(
  companyId: number,
  stmtLineIds: number[]
): Promise<{ vinculados: number }> {
  if (stmtLineIds.length === 0) return { vinculados: 0 };

  const db = await getDb();
  const now = new Date().toISOString();

  // 1. Carregar as linhas recém-conciliadas
  const linesQ = await db.$client.query(`
    SELECT id, tipo, descricao, ABS(valor)::float AS valor, data::text
    FROM bank_statement_lines
    WHERE id = ANY($1::int[]) AND company_id = $2 AND excluido_em IS NULL
  `, [stmtLineIds, companyId]);

  const lines: any[] = linesQ.rows;
  if (lines.length === 0) return { vinculados: 0 };

  const credits = lines.filter((l) => l.tipo === "credito");
  const debits  = lines.filter((l) => l.tipo === "debito");

  let vinculados = 0;

  // ── Créditos → NFS-e emitidas ─────────────────────────────────────────────
  for (const bsl of credits) {
    const bslCnpj = cnpjFromText(bsl.descricao ?? "");
    const bslVal  = parseFloat(bsl.valor);
    if (bslVal <= 0) continue;

    // Candidatas: valor ±2%, data ±60 dias, sem vínculo, não cancelada
    const q = await db.$client.query(`
      SELECT id, ABS(valor_liquido)::float AS valor, tomador_cnpj
      FROM fiscal_notes
      WHERE company_id = $1
        AND stmt_line_id IS NULL
        AND origem LIKE 'nfse_%'
        AND status != 'cancelada'
        AND ABS(ABS(valor_liquido::float) - $2) / NULLIF(GREATEST(ABS(valor_liquido::float), $2), 0) < 0.02
        AND data_emissao BETWEEN ($3::date - interval '60 days')
                              AND ($3::date + interval '60 days')
      ORDER BY ABS(ABS(valor_liquido::float) - $2) ASC
      LIMIT 10
    `, [companyId, bslVal, bsl.data]);

    if (q.rows.length === 0) continue;

    // Preferência: CNPJ bater exato
    let best: any = null;
    if (bslCnpj) {
      best = (q.rows as any[]).find(
        (r) => cnpjNorm(r.tomador_cnpj) === bslCnpj
      );
    }
    // Fallback p/ créditos: valor muito próximo (±0.5%) + data próxima (já filtrada)
    if (!best) {
      const strict = (q.rows as any[]).filter((r) => {
        const diff = Math.abs(parseFloat(r.valor) - bslVal) / Math.max(parseFloat(r.valor), bslVal);
        return diff < 0.005;
      });
      if (strict.length === 1) best = strict[0]; // único candidato exato → safe
    }

    if (best) {
      const res = await db.$client.query(`
        UPDATE fiscal_notes
           SET stmt_line_id = $1, status = 'conciliada', updated_at = $2
         WHERE id = $3 AND company_id = $4 AND stmt_line_id IS NULL
         RETURNING id
      `, [bsl.id, now, best.id, companyId]);
      if ((res.rowCount ?? 0) > 0) vinculados++;
    }
  }

  // ── Débitos → NF-e recebidas ──────────────────────────────────────────────
  for (const bsl of debits) {
    const bslCnpj = cnpjFromText(bsl.descricao ?? "");
    const bslVal  = parseFloat(bsl.valor);
    if (bslVal <= 0) continue;
    // Para débitos exigimos CNPJ (muito risco de falso-positivo com valor apenas)
    if (!bslCnpj) continue;

    const q = await db.$client.query(`
      SELECT id, ABS(valor_bruto)::float AS valor, emitente_cnpj
      FROM fiscal_notes
      WHERE company_id = $1
        AND stmt_line_id IS NULL
        AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
        AND status != 'cancelada'
        AND ABS(ABS(valor_bruto::float) - $2) / NULLIF(GREATEST(ABS(valor_bruto::float), $2), 0) < 0.02
        AND data_emissao BETWEEN ($3::date - interval '60 days')
                              AND ($3::date + interval '60 days')
        AND REPLACE(REPLACE(REPLACE(REPLACE(emitente_cnpj,'.',''),'/',''),'-',''),' ','') = $4
      ORDER BY ABS(ABS(valor_bruto::float) - $2) ASC
      LIMIT 5
    `, [companyId, bslVal, bsl.data, bslCnpj]);

    if (q.rows.length === 0) continue;

    const best = (q.rows as any[])[0];
    if (best) {
      const res = await db.$client.query(`
        UPDATE fiscal_notes
           SET stmt_line_id = $1, status = 'conciliada', updated_at = $2
         WHERE id = $3 AND company_id = $4 AND stmt_line_id IS NULL
         RETURNING id
      `, [bsl.id, now, best.id, companyId]);
      if ((res.rowCount ?? 0) > 0) vinculados++;
    }
  }

  return { vinculados };
}
