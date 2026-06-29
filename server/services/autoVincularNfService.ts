/**
 * autoVincularNfService.ts — Rev. 3849
 *
 * Vinculação automática NF-e ↔ Extrato Bancário.
 *
 * Duas funções principais:
 *   autoVincularNfsPorLinhas  — reativa: disparada após conciliação de linhas
 *   sincronizarNfsPeriodo     — retroativa: varre TODO o período sob demanda
 *
 * Algoritmo de pontuação (score 0-100):
 *   CNPJ exato na descrição do extrato          → +50 pts
 *   Token do nome do tomador/emitente na desc.  → +30 pts
 *   Valor dentro de ±5 % do valor_liquido       → +20 pts
 *   Valor dentro de ±10%                        → +12 pts
 *   Valor dentro de ±15%                        →  +6 pts
 *   Data dentro de 30 dias após emissão         → +10 pts
 *   Data dentro de 60 dias                      →  +7 pts
 *   Data dentro de 90 dias                      →  +4 pts
 *
 * Threshold de vínculo automático:
 *   emitidas  (créditos) : score >= 60  OU  candidato único com score >= 40
 *   recebidas (débitos)  : score >= 70  (critério mais rígido p/ evitar falsos positivos)
 *
 * Por que usar valor_liquido:
 *   O extrato bancário registra o valor LÍQUIDO recebido — já descontados ISS, IR,
 *   PIS/COFINS/CSLL retidos na fonte pelo tomador (0-15 %). valor_liquido da NF-e
 *   captura as retenções declaradas; a margem de ±10-15 % cobre retenções adicionais
 *   que o cliente aplica fora da nota (ISS local de alguns municípios, IR escalonado).
 */

import { getDb } from "../db";

// ── Utilidades ────────────────────────────────────────────────────────────────

function cnpjFromText(text: string): string | null {
  if (!text) return null;
  const m1 = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?(?:\d{4})-?\d{2}/);
  if (m1) {
    const d = m1[0].replace(/\D/g, "");
    if (d.length === 14) return d;
  }
  const m2 = text.match(/(?<!\d)(\d{14})(?!\d)/);
  if (m2) return m2[1];
  return null;
}

function cnpjNorm(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/** Extrai tokens significativos do nome de uma empresa para busca textual. */
function extractTokens(nome: string | null | undefined): string[] {
  if (!nome) return [];
  const STOP = new Set([
    "ltda","eireli","epp","me","sa","sas","de","da","do","dos","das",
    "para","com","e","ou","na","no","nas","nos","a","o","um","uma",
    "construtora","engenharia","comercio","servicos","materiais",
  ]);
  return nome
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t.toLowerCase()));
}

/** Score de compatibilidade entre uma NF-e e uma linha de extrato (0-100). */
function calcScore(opts: {
  bslDescricao: string;
  bslValor: number;     // valor ABSOLUTO da linha (positivo)
  bslData: string;      // YYYY-MM-DD
  fnCnpj: string | null;
  fnNome: string | null;
  fnValorLiquido: number;
  fnDataEmissao: string; // YYYY-MM-DD
}): number {
  const { bslDescricao, bslValor, bslData, fnCnpj, fnNome, fnValorLiquido, fnDataEmissao } = opts;
  let score = 0;

  // ── CNPJ ──────────────────────────────────────────────────────────────────
  const bslCnpj = cnpjFromText(bslDescricao);
  if (bslCnpj && fnCnpj && cnpjNorm(fnCnpj) === bslCnpj) score += 50;

  // ── Nome (tokens) ─────────────────────────────────────────────────────────
  const tokens = extractTokens(fnNome);
  const descUpper = bslDescricao.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matchedTokens = tokens.filter((t) => descUpper.includes(t));
  if (matchedTokens.length >= 2) score += 30;
  else if (matchedTokens.length === 1 && matchedTokens[0].length >= 6) score += 20;
  else if (matchedTokens.length === 1) score += 12;

  // ── Valor ─────────────────────────────────────────────────────────────────
  if (fnValorLiquido > 0 && bslValor > 0) {
    const base = Math.max(fnValorLiquido, bslValor);
    const diff = Math.abs(fnValorLiquido - bslValor) / base;
    if (diff <= 0.05) score += 20;
    else if (diff <= 0.10) score += 12;
    else if (diff <= 0.15) score += 6;
    // > 15% → sem pontos de valor
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  // Extrato deve ser APÓS emissão (pagamento esperado depois da fatura)
  const msPerDay = 86_400_000;
  const emissaoMs = new Date(fnDataEmissao).getTime();
  const bslMs     = new Date(bslData).getTime();
  const diffDays  = (bslMs - emissaoMs) / msPerDay;
  if (diffDays >= -5 && diffDays <= 30)  score += 10; // janela ideal
  else if (diffDays >= -5 && diffDays <= 60)  score += 7;
  else if (diffDays >= -5 && diffDays <= 90)  score += 4;
  // fora da janela → sem pontos

  return score;
}

// ── Função 1: Reativa (disparada após conciliação) ────────────────────────────

export async function autoVincularNfsPorLinhas(
  companyId: number,
  stmtLineIds: number[]
): Promise<{ vinculados: number }> {
  if (stmtLineIds.length === 0) return { vinculados: 0 };

  const db = await getDb();
  const now = new Date().toISOString();

  const linesQ = await db.$client.query(`
    SELECT id, CASE WHEN valor>=0 THEN 'credito' ELSE 'debito' END AS tipo,
           descricao, ABS(valor)::float AS valor, data::text
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
    const bslVal = parseFloat(bsl.valor);
    if (bslVal <= 0) continue;

    const q = await db.$client.query(`
      SELECT id, ABS(valor_liquido)::float AS valor_liquido, tomador_cnpj, tomador_nome,
             data_emissao::text
      FROM fiscal_notes
      WHERE company_id = $1
        AND stmt_line_id IS NULL
        AND origem LIKE 'nfse_%'
        AND status != 'cancelada'
        AND ABS(valor_liquido::float) BETWEEN $2 * 0.82 AND $2 * 1.03
        AND data_emissao BETWEEN ($3::date - interval '5 days')
                              AND ($3::date + interval '90 days')
      LIMIT 15
    `, [companyId, bslVal, bsl.data]);

    if (q.rows.length === 0) continue;

    // Pontuar cada candidata
    const scored = (q.rows as any[]).map((r) => ({
      ...r,
      score: calcScore({
        bslDescricao: bsl.descricao ?? "",
        bslValor: bslVal,
        bslData: bsl.data,
        fnCnpj: r.tomador_cnpj,
        fnNome: r.tomador_nome,
        fnValorLiquido: parseFloat(r.valor_liquido),
        fnDataEmissao: r.data_emissao,
      }),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const autoLink = best.score >= 60 || (scored.length === 1 && best.score >= 40);
    if (!autoLink) continue;

    const res = await db.$client.query(`
      UPDATE fiscal_notes
         SET stmt_line_id = $1, status = 'conciliada', updated_at = $2
       WHERE id = $3 AND company_id = $4 AND stmt_line_id IS NULL
       RETURNING id
    `, [bsl.id, now, best.id, companyId]);
    if ((res.rowCount ?? 0) > 0) vinculados++;
  }

  // ── Débitos → NF-e recebidas ──────────────────────────────────────────────
  for (const bsl of debits) {
    const bslVal = parseFloat(bsl.valor);
    if (bslVal <= 0) continue;

    const q = await db.$client.query(`
      SELECT id, ABS(valor_bruto)::float AS valor_liquido, emitente_cnpj, emitente_nome,
             data_emissao::text
      FROM fiscal_notes
      WHERE company_id = $1
        AND stmt_line_id IS NULL
        AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
        AND status != 'cancelada'
        AND ABS(valor_bruto::float) BETWEEN $2 * 0.88 AND $2 * 1.05
        AND data_emissao BETWEEN ($3::date - interval '5 days')
                              AND ($3::date + interval '90 days')
      LIMIT 10
    `, [companyId, bslVal, bsl.data]);

    if (q.rows.length === 0) continue;

    const scored = (q.rows as any[]).map((r) => ({
      ...r,
      score: calcScore({
        bslDescricao: bsl.descricao ?? "",
        bslValor: bslVal,
        bslData: bsl.data,
        fnCnpj: r.emitente_cnpj,
        fnNome: r.emitente_nome,
        fnValorLiquido: parseFloat(r.valor_liquido),
        fnDataEmissao: r.data_emissao,
      }),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    // Débitos: critério mais rígido (falso positivo é pior)
    if (best.score < 70) continue;

    const res = await db.$client.query(`
      UPDATE fiscal_notes
         SET stmt_line_id = $1, status = 'conciliada', updated_at = $2
       WHERE id = $3 AND company_id = $4 AND stmt_line_id IS NULL
       RETURNING id
    `, [bsl.id, now, best.id, companyId]);
    if ((res.rowCount ?? 0) > 0) vinculados++;
  }

  return { vinculados };
}

// ── Função 2: Sugestões (apenas leitura — sem vincular) ───────────────────────

export interface SugestaoVinculo {
  fnId: number;
  fnNumero: string;
  fnNome: string;
  fnValorLiquido: number;
  fnDataEmissao: string;
  fnOrigem: string;
  bslId: number;
  bslDescricao: string;
  bslValor: number;
  bslData: string;
  score: number;
  confianca: "alta" | "media" | "baixa";
}

export async function obterSugestoesPeriodo(
  companyId: number,
  dataInicio: string,
  dataFim: string
): Promise<{ sugestoes: SugestaoVinculo[] }> {
  const db = await getDb();

  const extratoInicio = new Date(dataInicio);
  extratoInicio.setDate(extratoInicio.getDate() - 5);
  const extratoFim = new Date(dataFim);
  extratoFim.setDate(extratoFim.getDate() + 90);
  const extInStr  = extratoInicio.toISOString().slice(0, 10);
  const extFimStr = extratoFim.toISOString().slice(0, 10);

  // Linhas do extrato SEM vínculo
  const bslQ = await db.$client.query(`
    SELECT b.id, b.valor, ABS(b.valor)::float AS abs_valor, b.descricao, b.data::text
    FROM bank_statement_lines b
    WHERE b.company_id = $1
      AND b.data BETWEEN $2 AND $3
      AND b.excluido_em IS NULL
      AND b.desconsiderado_em IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM fiscal_notes fn WHERE fn.stmt_line_id = b.id AND fn.company_id = $1
      )
    ORDER BY b.data ASC
  `, [companyId, extInStr, extFimStr]);
  const bslAll: any[] = bslQ.rows;
  const credits = bslAll.filter((b) => parseFloat(b.valor) >= 0);
  const debits  = bslAll.filter((b) => parseFloat(b.valor) < 0);

  // NF-e emitidas SEM vínculo
  const emitQ = await db.$client.query(`
    SELECT id, COALESCE(numero_nf::text, '') AS numero_nf,
           ABS(valor_liquido)::float AS valor_liquido,
           COALESCE(tomador_nome, '') AS tomador_nome,
           tomador_cnpj, data_emissao::text, origem
    FROM fiscal_notes
    WHERE company_id = $1 AND stmt_line_id IS NULL
      AND origem LIKE 'nfse_%' AND status != 'cancelada'
      AND data_emissao BETWEEN $2 AND $3
  `, [companyId, dataInicio, dataFim]);

  // NF-e recebidas SEM vínculo
  const recQ = await db.$client.query(`
    SELECT id, COALESCE(numero_nf::text, '') AS numero_nf,
           ABS(valor_bruto)::float AS valor_liquido,
           COALESCE(emitente_nome, '') AS tomador_nome,
           emitente_cnpj AS tomador_cnpj, data_emissao::text, origem
    FROM fiscal_notes
    WHERE company_id = $1 AND stmt_line_id IS NULL
      AND (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
      AND data_emissao BETWEEN $2 AND $3
  `, [companyId, dataInicio, dataFim]);

  const sugestoes: SugestaoVinculo[] = [];

  const processar = (fns: any[], bsls: any[]) => {
    for (const fn of fns) {
      const fnVal = parseFloat(fn.valor_liquido);
      if (fnVal <= 0) continue;
      for (const bsl of bsls) {
        const bslVal = parseFloat(bsl.abs_valor);
        if (bslVal <= 0) continue;
        const base = Math.max(fnVal, bslVal);
        if (Math.abs(fnVal - bslVal) / base > 0.15) continue;
        const emissaoMs = new Date(fn.data_emissao).getTime();
        const bslMs     = new Date(bsl.data).getTime();
        const diffDays  = (bslMs - emissaoMs) / 86_400_000;
        if (diffDays < -5 || diffDays > 90) continue;

        const score = calcScore({
          bslDescricao: bsl.descricao ?? "",
          bslValor: bslVal,
          bslData: bsl.data,
          fnCnpj: fn.tomador_cnpj,
          fnNome: fn.tomador_nome,
          fnValorLiquido: fnVal,
          fnDataEmissao: fn.data_emissao,
        });
        if (score < 30) continue;

        sugestoes.push({
          fnId: fn.id,
          fnNumero: fn.numero_nf,
          fnNome: fn.tomador_nome,
          fnValorLiquido: fnVal,
          fnDataEmissao: fn.data_emissao,
          fnOrigem: fn.origem,
          bslId: bsl.id,
          bslDescricao: bsl.descricao ?? "",
          bslValor: bslVal,
          bslData: bsl.data,
          score,
          confianca: score >= 80 ? "alta" : score >= 55 ? "media" : "baixa",
        });
      }
    }
  };

  processar(emitQ.rows, credits);
  processar(recQ.rows, debits);

  // Ordenar por score desc, limitar a 200 sugestões
  sugestoes.sort((a, b) => b.score - a.score);
  return { sugestoes: sugestoes.slice(0, 200) };
}

// ── Função 3: Retroativa — varre TODO o período ───────────────────────────────

export async function sincronizarNfsPeriodo(
  companyId: number,
  dataInicio: string,
  dataFim: string
): Promise<{ vinculados: number; candidatosAnalised: number }> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Período expandido para o extrato (90 dias antes e depois)
  const extratoInicio = new Date(dataInicio);
  extratoInicio.setDate(extratoInicio.getDate() - 5);
  const extratoFim = new Date(dataFim);
  extratoFim.setDate(extratoFim.getDate() + 90);
  const extInStr  = extratoInicio.toISOString().slice(0, 10);
  const extFimStr = extratoFim.toISOString().slice(0, 10);

  // ── 1. Linhas do extrato SEM vínculo com NF-e ─────────────────────────────
  const bslQ = await db.$client.query(`
    SELECT b.id, b.valor, ABS(b.valor)::float AS abs_valor,
           b.descricao, b.data::text
    FROM bank_statement_lines b
    WHERE b.company_id = $1
      AND b.data BETWEEN $2 AND $3
      AND b.excluido_em IS NULL
      AND b.desconsiderado_em IS NULL
      -- não está vinculada a nenhuma NF
      AND NOT EXISTS (
        SELECT 1 FROM fiscal_notes fn
        WHERE fn.stmt_line_id = b.id AND fn.company_id = $1
      )
    ORDER BY b.data ASC
  `, [companyId, extInStr, extFimStr]);
  const bslAll: any[] = bslQ.rows;

  const credits = bslAll.filter((b) => parseFloat(b.valor) >= 0);
  const debits  = bslAll.filter((b) => parseFloat(b.valor) < 0);

  // ── 2. NF-e emitidas SEM vínculo no período ───────────────────────────────
  const emitQ = await db.$client.query(`
    SELECT id, ABS(valor_liquido)::float AS valor_liquido,
           tomador_cnpj, tomador_nome, data_emissao::text
    FROM fiscal_notes
    WHERE company_id = $1
      AND stmt_line_id IS NULL
      AND origem LIKE 'nfse_%'
      AND status != 'cancelada'
      AND data_emissao BETWEEN $2 AND $3
    ORDER BY data_emissao ASC
  `, [companyId, dataInicio, dataFim]);
  const emitidas: any[] = emitQ.rows;

  // ── 3. NF-e recebidas SEM vínculo no período ─────────────────────────────
  const recQ = await db.$client.query(`
    SELECT id, ABS(valor_bruto)::float AS valor_bruto,
           emitente_cnpj, emitente_nome, data_emissao::text
    FROM fiscal_notes
    WHERE company_id = $1
      AND stmt_line_id IS NULL
      AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
      AND status != 'cancelada'
      AND data_emissao BETWEEN $2 AND $3
    ORDER BY data_emissao ASC
  `, [companyId, dataInicio, dataFim]);
  const recebidas: any[] = recQ.rows;

  // ── 4. Bipartite matching greedy (score decrescente) ─────────────────────
  interface ScoredPair {
    fnId: number;
    bslId: number;
    score: number;
    tipo: "emitida" | "recebida";
    fnValorLiquido: number;
    fnDataEmissao: string;
    fnCnpj: string | null;
    fnNome: string | null;
  }

  const pairs: ScoredPair[] = [];

  // Emitidas × créditos
  for (const fn of emitidas) {
    const fnVal = parseFloat(fn.valor_liquido);
    if (fnVal <= 0) continue;
    for (const bsl of credits) {
      const bslVal = parseFloat(bsl.abs_valor);
      const base = Math.max(fnVal, bslVal);
      if (bslVal <= 0) continue;
      // Pré-filtro de valor para não calcular score em todo cruzamento
      if (Math.abs(fnVal - bslVal) / base > 0.15) continue;
      // Pré-filtro de data
      const emissaoMs = new Date(fn.data_emissao).getTime();
      const bslMs = new Date(bsl.data).getTime();
      const diffDays = (bslMs - emissaoMs) / 86_400_000;
      if (diffDays < -5 || diffDays > 90) continue;

      const score = calcScore({
        bslDescricao: bsl.descricao ?? "",
        bslValor: bslVal,
        bslData: bsl.data,
        fnCnpj: fn.tomador_cnpj,
        fnNome: fn.tomador_nome,
        fnValorLiquido: fnVal,
        fnDataEmissao: fn.data_emissao,
      });
      if (score >= 40) {
        pairs.push({ fnId: fn.id, bslId: bsl.id, score, tipo: "emitida",
                     fnValorLiquido: fnVal, fnDataEmissao: fn.data_emissao,
                     fnCnpj: fn.tomador_cnpj, fnNome: fn.tomador_nome });
      }
    }
  }

  // Recebidas × débitos
  for (const fn of recebidas) {
    const fnVal = parseFloat(fn.valor_bruto);
    if (fnVal <= 0) continue;
    for (const bsl of debits) {
      const bslVal = parseFloat(bsl.abs_valor);
      const base = Math.max(fnVal, bslVal);
      if (bslVal <= 0) continue;
      if (Math.abs(fnVal - bslVal) / base > 0.15) continue;
      const emissaoMs = new Date(fn.data_emissao).getTime();
      const bslMs = new Date(bsl.data).getTime();
      const diffDays = (bslMs - emissaoMs) / 86_400_000;
      if (diffDays < -5 || diffDays > 90) continue;

      const score = calcScore({
        bslDescricao: bsl.descricao ?? "",
        bslValor: bslVal,
        bslData: bsl.data,
        fnCnpj: fn.emitente_cnpj,
        fnNome: fn.emitente_nome,
        fnValorLiquido: fnVal,
        fnDataEmissao: fn.data_emissao,
      });
      if (score >= 40) {
        pairs.push({ fnId: fn.id, bslId: bsl.id, score, tipo: "recebida",
                     fnValorLiquido: fnVal, fnDataEmissao: fn.data_emissao,
                     fnCnpj: fn.emitente_cnpj, fnNome: fn.emitente_nome });
      }
    }
  }

  // Ordenar por score decrescente → greedy bipartite
  pairs.sort((a, b) => b.score - a.score);

  const usedFn  = new Set<number>();
  const usedBsl = new Set<number>();
  let vinculados = 0;

  for (const p of pairs) {
    if (usedFn.has(p.fnId) || usedBsl.has(p.bslId)) continue;

    // Threshold: emitidas >=60; recebidas >=70
    const minScore = p.tipo === "emitida" ? 60 : 70;
    if (p.score < minScore) continue;

    const res = await db.$client.query(`
      UPDATE fiscal_notes
         SET stmt_line_id = $1, status = 'conciliada', updated_at = $2
       WHERE id = $3 AND company_id = $4 AND stmt_line_id IS NULL
       RETURNING id
    `, [p.bslId, now, p.fnId, companyId]);

    if ((res.rowCount ?? 0) > 0) {
      usedFn.add(p.fnId);
      usedBsl.add(p.bslId);
      vinculados++;
    }
  }

  return { vinculados, candidatosAnalised: pairs.length };
}
