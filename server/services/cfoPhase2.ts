// Rev. 1633 — FASE 2 Análise CFO
// Three-Way Match com bloqueio, Reconciliação OFX/CNAB com IA,
// Dynamic Discounting, DRE Dual (Gerencial × Fiscal), Alertas Financeiros.

import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

// ── Helper: roda raw SQL com parâmetros parametrizados ──────────────────────
async function exec(db: any, query: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const parts = query.split(/\$(\d+)/g);
  // parts: [chunk0, "1", chunk1, "2", chunk2, ...]
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i += 2) {
    const idx = parseInt(parts[i] ?? "0", 10);
    const paramVal = params[idx - 1];
    const tail = parts[i + 1] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  const res = await db.execute(built);
  return { rows: (res as any)?.rows ?? (Array.isArray(res) ? res : []) };
}

const TOL = 0.02; // 2% tolerância para variação de valor

// ════════════════════════════════════════════════════════════════════════════
// 1. THREE-WAY MATCH (PO × Recebimento × NF/AP)
// ════════════════════════════════════════════════════════════════════════════
export type MatchStatus = "OK" | "BLOQ_VALOR" | "BLOQ_RECEBIMENTO" | "BLOQ_NF" | "PARCIAL";

export type ThreeWayItem = {
  apId: number;
  ordemId: number | null;
  ordemNumero: string | null;
  supplierNome: string;
  obraNome: string | null;
  valorPO: number;
  valorAP: number;
  diferencaValor: number;
  diferencaPct: number;
  recebido: boolean;
  nfNumero: string | null;
  status: MatchStatus;
  bloqueios: string[];
  dataVencimento: string | null;
  financialEntryId: number | null;
};

export async function computeThreeWayMatch(db: any, companyIds: number[]): Promise<{
  items: ThreeWayItem[];
  resumo: { total: number; ok: number; bloqueados: number; parciais: number; valorBloqueado: number };
}> {
  const ids = companyIds.map(Number).join(",") || "0";
  const r = await exec(db, `
    SELECT
      ap.id AS ap_id,
      ap.ordem_id,
      po.numero AS ordem_numero,
      COALESCE(ap.supplier_nome, po.supplier_nome, 'Fornecedor') AS supplier_nome,
      po.obra_nome,
      COALESCE(po.valor_total, 0)::numeric AS valor_po,
      COALESCE(ap.valor_total, 0)::numeric AS valor_ap,
      ap.data_vencimento,
      ap.status AS ap_status,
      ap.financial_entry_id,
      pr.id AS receipt_id,
      pr.status AS receipt_status,
      pr.nota_fiscal_numero
    FROM purchase_accounts_payable ap
    LEFT JOIN purchase_orders po ON po.id = ap.ordem_id
    LEFT JOIN LATERAL (
      SELECT id, status, nota_fiscal_numero
      FROM purchase_receipts
      WHERE ordem_id = ap.ordem_id AND company_id = ap.company_id
      ORDER BY recebido_em DESC NULLS LAST
      LIMIT 1
    ) pr ON true
    WHERE ap.company_id IN (${ids})
      AND COALESCE(ap.status,'') NOT IN ('cancelado','pago')
    ORDER BY ap.data_vencimento ASC NULLS LAST
    LIMIT 500
  `);

  const items: ThreeWayItem[] = r.rows.map((row: any) => {
    const valorPO = Number(row.valor_po) || 0;
    const valorAP = Number(row.valor_ap) || 0;
    const dif = valorAP - valorPO;
    const difPct = valorPO > 0 ? Math.abs(dif) / valorPO : 0;
    const recebido = !!row.receipt_id && row.receipt_status === "recebido";
    const nf = row.nota_fiscal_numero || null;
    const bloqueios: string[] = [];
    if (valorPO > 0 && difPct > TOL) bloqueios.push(`Valor diverge ${(difPct * 100).toFixed(1)}% do PO`);
    if (row.ordem_id && !recebido) bloqueios.push("Recebimento físico pendente");
    if (recebido && !nf) bloqueios.push("Nota fiscal não anexada");
    // Prioridade clara: Valor > Recebimento > NF.
    // Quando há mais de um bloqueio, o status reflete o mais severo;
    // o array `bloqueios` (sempre completo) é exibido na UI para detalhamento.
    let status: MatchStatus;
    if (bloqueios.length === 0) status = "OK";
    else if (bloqueios.some(b => b.includes("Valor"))) status = "BLOQ_VALOR";
    else if (bloqueios.some(b => b.includes("Recebimento"))) status = "BLOQ_RECEBIMENTO";
    else if (bloqueios.some(b => b.includes("Nota"))) status = "BLOQ_NF";
    else status = "PARCIAL";
    return {
      apId: Number(row.ap_id),
      ordemId: row.ordem_id ? Number(row.ordem_id) : null,
      ordemNumero: row.ordem_numero ?? null,
      supplierNome: row.supplier_nome,
      obraNome: row.obra_nome ?? null,
      valorPO, valorAP,
      diferencaValor: dif,
      diferencaPct: difPct * 100,
      recebido,
      nfNumero: nf,
      status,
      bloqueios,
      dataVencimento: row.data_vencimento ? new Date(row.data_vencimento).toISOString().slice(0, 10) : null,
      financialEntryId: row.financial_entry_id ? Number(row.financial_entry_id) : null,
    };
  });

  const ok = items.filter(i => i.status === "OK").length;
  const parciais = items.filter(i => i.status === "PARCIAL").length;
  const bloqueados = items.length - ok - parciais;
  const valorBloqueado = items
    .filter(i => i.status !== "OK")
    .reduce((s, i) => s + i.valorAP, 0);

  return { items, resumo: { total: items.length, ok, bloqueados, parciais, valorBloqueado } };
}

export async function blockPaymentByThreeWay(db: any, companyId: number, financialEntryId: number, motivo: string) {
  await exec(db, `
    UPDATE financial_entries
    SET status='bloqueado', observacoes=COALESCE(observacoes,'')||$1
    WHERE id=$2 AND company_id=$3 AND status NOT IN ('pago','cancelado')
  `, [`\n[3WM] Bloqueado: ${motivo}`, financialEntryId, companyId]);
}

export async function releasePaymentByThreeWay(db: any, companyId: number, financialEntryId: number) {
  await exec(db, `
    UPDATE financial_entries
    SET status='a_pagar', observacoes=COALESCE(observacoes,'')||$1
    WHERE id=$2 AND company_id=$3 AND status='bloqueado'
  `, [`\n[3WM] Liberado por usuário em ${new Date().toLocaleString("pt-BR")}`, financialEntryId, companyId]);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. RECONCILIAÇÃO OFX/CNAB com sugestão IA
// ════════════════════════════════════════════════════════════════════════════
export type OfxLine = {
  data: string;       // YYYY-MM-DD
  valor: number;      // negativo = saída
  descricao: string;
  tipo: "credito" | "debito";
  fitId: string;      // identificador único OFX (FITID)
};

export function parseOFX(text: string): OfxLine[] {
  // Parser tolerante (OFX 1.x SGML ou OFX 2.x XML — ambos com tags semelhantes).
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const out: OfxLine[] = [];
  for (const b of blocks) {
    const get = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const dtRaw = get("DTPOSTED").slice(0, 8);
    const data = dtRaw.length === 8 ? `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}` : "";
    const valor = parseFloat((get("TRNAMT") || "0").replace(",", "."));
    const desc = (get("MEMO") || get("NAME") || "").slice(0, 200);
    const fitId = get("FITID") || `${dtRaw}-${valor}-${desc.slice(0, 20)}`;
    if (!data) continue;
    out.push({ data, valor, descricao: desc, tipo: valor < 0 ? "debito" : "credito", fitId });
  }
  return out;
}

// CNAB 240/400: extração simplificada de movimentações
export function parseCNAB(text: string): OfxLine[] {
  const lines = text.split(/\r?\n/).filter(l => l.length >= 240 || l.length >= 400);
  const out: OfxLine[] = [];
  for (const ln of lines) {
    const len = ln.length;
    // Heurística para CNAB 240 (segmento T/U) e CNAB 400
    if (len >= 240) {
      const tipoReg = ln.charAt(7);
      if (tipoReg !== "3") continue;
      const dataStr = ln.slice(73, 81); // DDMMAAAA
      const valorStr = ln.slice(81, 96);
      if (!/^\d{8}$/.test(dataStr)) continue;
      const data = `${dataStr.slice(4, 8)}-${dataStr.slice(2, 4)}-${dataStr.slice(0, 2)}`;
      const valor = parseInt(valorStr, 10) / 100;
      const desc = ln.slice(105, 145).trim();
      out.push({ data, valor: -Math.abs(valor), descricao: desc, tipo: "debito", fitId: `${data}-${valor}-${desc.slice(0, 10)}` });
    }
  }
  return out;
}

export type ReconcileSuggestion = {
  ofxLine: OfxLine;
  candidatos: Array<{ entryId: number; descricao: string; valor: number; data: string; score: number; razao: string }>;
  melhorEntryId: number | null;
  confianca: "alta" | "media" | "baixa" | "nenhuma";
};

export async function suggestReconciliation(
  db: any,
  companyIds: number[],
  contaBancariaId: number | null,
  ofxLines: OfxLine[],
  useAI = true,
): Promise<ReconcileSuggestion[]> {
  if (!ofxLines.length) return [];
  const ids = companyIds.map(Number).join(",") || "0";

  const dataMin = ofxLines.reduce((m, l) => l.data < m ? l.data : m, ofxLines[0].data);
  const dataMax = ofxLines.reduce((m, l) => l.data > m ? l.data : m, ofxLines[0].data);

  const contaFilter = contaBancariaId ? `AND (conta_bancaria_id=${Number(contaBancariaId)} OR conta_bancaria_id IS NULL)` : "";

  const r = await exec(db, `
    SELECT id, COALESCE(descricao, origem_descricao, '') AS descricao,
           COALESCE(valor_realizado, valor_previsto, 0)::numeric AS valor,
           data_vencimento, data_pagamento, tipo, status
    FROM financial_entries
    WHERE company_id IN (${ids})
      AND COALESCE(conciliado,0)=0
      AND status NOT IN ('cancelado','previsto')
      AND COALESCE(data_pagamento, data_vencimento) BETWEEN ($1::date - INTERVAL '15 days') AND ($2::date + INTERVAL '15 days')
      ${contaFilter}
    ORDER BY data_vencimento DESC
    LIMIT 500
  `, [dataMin, dataMax]);

  const candPool = r.rows.map((c: any) => ({
    id: Number(c.id),
    descricao: String(c.descricao ?? ""),
    valor: Math.abs(Number(c.valor) || 0),
    data: (c.data_pagamento || c.data_vencimento)?.toString?.().slice(0, 10) || "",
    tipo: String(c.tipo || ""),
  }));

  const sugestoes: ReconcileSuggestion[] = ofxLines.map(line => {
    const valorAbs = Math.abs(line.valor);
    const candidatos = candPool
      .map(c => {
        const dValor = c.valor > 0 ? Math.abs(c.valor - valorAbs) / c.valor : 1;
        const dDias = c.data ? Math.abs((new Date(line.data).getTime() - new Date(c.data).getTime()) / 86400000) : 30;
        let score = 0;
        if (dValor <= 0.005) score += 60;
        else if (dValor <= 0.02) score += 40;
        else if (dValor <= 0.05) score += 20;
        if (dDias <= 1) score += 30;
        else if (dDias <= 5) score += 15;
        else if (dDias <= 15) score += 5;
        // Tipo bate? débito = saída/despesa
        const esperaDebito = line.tipo === "debito";
        if (esperaDebito && c.tipo === "despesa") score += 10;
        if (!esperaDebito && c.tipo === "receita") score += 10;
        const razao = `Δvalor ${(dValor * 100).toFixed(1)}% · Δdata ${dDias.toFixed(0)}d`;
        return { entryId: c.id, descricao: c.descricao, valor: c.valor, data: c.data, score, razao };
      })
      .filter(c => c.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const melhor = candidatos[0];
    let conf: ReconcileSuggestion["confianca"] = "nenhuma";
    if (melhor) {
      conf = melhor.score >= 85 ? "alta" : melhor.score >= 65 ? "media" : "baixa";
    }
    return { ofxLine: line, candidatos, melhorEntryId: melhor?.entryId ?? null, confianca: conf };
  });

  // IA refina apenas casos ambíguos (confiança "baixa" com 2+ candidatos)
  if (useAI) {
    const ambiguos = sugestoes.filter(s => s.confianca === "baixa" && s.candidatos.length >= 2);
    if (ambiguos.length > 0 && ambiguos.length <= 30) {
      try {
        const prompt = `Você é um analista financeiro reconciliando lançamentos bancários. Para cada movimentação OFX, escolha o melhor candidato pelo entryId. Retorne JSON: {"matches":[{"fitId":"...","entryId":N,"motivo":"..."}]}.

Movimentos:
${JSON.stringify(ambiguos.map(s => ({
  fitId: s.ofxLine.fitId,
  data: s.ofxLine.data,
  valor: s.ofxLine.valor,
  desc: s.ofxLine.descricao,
  candidatos: s.candidatos.map(c => ({ entryId: c.entryId, desc: c.descricao, valor: c.valor, data: c.data })),
})), null, 2)}`;
        const res = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          responseFormat: { type: "json_object" },
          maxTokens: 2000,
        });
        const text = res.choices[0]?.message?.content;
        const parsed = JSON.parse(typeof text === "string" ? text : "{}");
        if (Array.isArray(parsed.matches)) {
          for (const m of parsed.matches) {
            const idx = sugestoes.findIndex(s => s.ofxLine.fitId === m.fitId);
            if (idx >= 0 && m.entryId) {
              sugestoes[idx].melhorEntryId = Number(m.entryId);
              sugestoes[idx].confianca = "media";
              const c = sugestoes[idx].candidatos.find(c => c.entryId === Number(m.entryId));
              if (c) c.razao = `IA: ${m.motivo || "selecionado"}`;
            }
          }
        }
      } catch (e: any) {
        console.warn("[CFO Phase 2] IA reconciliação não disponível:", e?.message);
      }
    }
  }

  return sugestoes;
}

export async function applyReconciliation(
  db: any,
  companyId: number,
  contaBancariaId: number,
  matches: Array<{ ofxLine: OfxLine; entryId: number }>,
): Promise<{ aplicados: number; saldoAtualizado: number }> {
  let aplicados = 0;
  for (const m of matches) {
    if (!m.entryId) continue;
    await exec(db, `
      INSERT INTO bank_statement_lines (company_id, conta_bancaria_id, data, descricao, valor, tipo, conciliado, entry_id, importado_em)
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7, NOW())
      ON CONFLICT DO NOTHING
    `, [companyId, contaBancariaId, m.ofxLine.data, m.ofxLine.descricao, m.ofxLine.valor, m.ofxLine.tipo, m.entryId]);
    await exec(db, `
      UPDATE financial_entries
      SET conciliado=1, data_conciliacao=$1, extrato_banco_descricao=$2
      WHERE id=$3 AND company_id=$4 AND COALESCE(conciliado,0)=0
    `, [m.ofxLine.data, m.ofxLine.descricao, m.entryId, companyId]);
    // Rev. 2693 — perna de transferência: concilia a perna irmã junto.
    await exec(db, `
      UPDATE financial_entries sib
      SET conciliado=1, data_conciliacao=$1
      FROM financial_entries cur
      WHERE cur.id=$2 AND cur.company_id=$3
        AND cur.tipo='transferencia' AND cur.transferencia_grupo_id IS NOT NULL
        AND sib.transferencia_grupo_id = cur.transferencia_grupo_id
        AND sib.company_id = cur.company_id AND sib.id <> cur.id
        AND COALESCE(sib.conciliado,0)=0
    `, [m.ofxLine.data, m.entryId, companyId]);
    aplicados++;
  }
  return { aplicados, saldoAtualizado: 0 };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. DYNAMIC DISCOUNTING
// ════════════════════════════════════════════════════════════════════════════
export type DDOffer = {
  entryId: number;
  fornecedor: string;
  valor: number;
  dataVencimento: string;
  diasAntecipacao: number;
  desconto: number;          // R$
  descontoPct: number;       // %
  valorAntecipado: number;   // valor após desconto
  apr: number;               // % a.a. equivalente
};

export async function computeDynamicDiscounting(
  db: any,
  companyIds: number[],
  taxaWaccAA: number = 18,    // taxa alvo (% a.a.)
  janelaDias: number = 60,    // só ofertar até N dias antes do vencimento
): Promise<{ offers: DDOffer[]; resumo: { totalValor: number; totalDesconto: number; mediaDescontoPct: number } }> {
  const ids = companyIds.map(Number).join(",") || "0";
  const r = await exec(db, `
    SELECT fe.id,
           COALESCE(fe.descricao, fe.origem_descricao, 'Sem descrição') AS descricao,
           COALESCE(fe.valor_previsto, 0)::numeric AS valor,
           fe.data_vencimento
    FROM financial_entries fe
    WHERE fe.company_id IN (${ids})
      AND fe.tipo='despesa'
      AND fe.status IN ('a_pagar','previsto')
      AND fe.data_vencimento BETWEEN CURRENT_DATE + INTERVAL '7 days' AND CURRENT_DATE + ($1::int || ' days')::interval
      AND COALESCE(fe.valor_previsto,0) >= 1000
    ORDER BY fe.data_vencimento ASC
    LIMIT 200
  `, [janelaDias]);

  const taxaDiaria = Math.pow(1 + taxaWaccAA / 100, 1 / 365) - 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const offers: DDOffer[] = r.rows.map((row: any) => {
    const valor = Number(row.valor) || 0;
    const venc = new Date(row.data_vencimento);
    const dias = Math.max(0, Math.round((venc.getTime() - today.getTime()) / 86400000));
    const desconto = valor * taxaDiaria * dias;
    const valorAnt = valor - desconto;
    return {
      entryId: Number(row.id),
      fornecedor: String(row.descricao).slice(0, 80),
      valor,
      dataVencimento: row.data_vencimento.toString().slice(0, 10),
      diasAntecipacao: dias,
      desconto,
      descontoPct: valor > 0 ? (desconto / valor) * 100 : 0,
      valorAntecipado: valorAnt,
      apr: taxaWaccAA,
    };
  }).filter(o => o.diasAntecipacao >= 7);

  const totalValor = offers.reduce((s, o) => s + o.valor, 0);
  const totalDesconto = offers.reduce((s, o) => s + o.desconto, 0);
  const mediaDescontoPct = offers.length ? offers.reduce((s, o) => s + o.descontoPct, 0) / offers.length : 0;

  return { offers, resumo: { totalValor, totalDesconto, mediaDescontoPct } };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. DRE DUAL (Gerencial × Fiscal)
// ════════════════════════════════════════════════════════════════════════════
export type DRELinha = { conta: string; gerencial: number; fiscal: number; diferenca: number };

export async function computeDREDual(db: any, companyIds: number[], ano: number): Promise<{ linhas: DRELinha[]; resumo: any }> {
  const ids = companyIds.map(Number).join(",") || "0";

  // Gerencial: usa todos os lançamentos (realizados + previstos do ano)
  // Fiscal: apenas realizados (regime de caixa simplificado)
  const r = await exec(db, `
    WITH base AS (
      SELECT fe.tipo, fe.natureza, fe.origem_modulo,
             COALESCE(fe.valor_realizado, 0)::numeric AS realizado,
             COALESCE(fe.valor_previsto, 0)::numeric AS previsto,
             fe.status
      FROM financial_entries fe
      WHERE fe.company_id IN (${ids})
        AND EXTRACT(YEAR FROM fe.data_competencia) = $1
        AND fe.status NOT IN ('cancelado')
    )
    SELECT
      SUM(CASE WHEN tipo='receita' THEN realizado ELSE 0 END) AS rec_fiscal,
      SUM(CASE WHEN tipo='receita' THEN GREATEST(realizado, previsto) ELSE 0 END) AS rec_gerencial,
      SUM(CASE WHEN tipo='despesa' AND natureza='direta' THEN realizado ELSE 0 END) AS cd_fiscal,
      SUM(CASE WHEN tipo='despesa' AND natureza='direta' THEN GREATEST(realizado, previsto) ELSE 0 END) AS cd_gerencial,
      SUM(CASE WHEN tipo='despesa' AND COALESCE(natureza,'') NOT IN ('direta') THEN realizado ELSE 0 END) AS ci_fiscal,
      SUM(CASE WHEN tipo='despesa' AND COALESCE(natureza,'') NOT IN ('direta') THEN GREATEST(realizado, previsto) ELSE 0 END) AS ci_gerencial,
      SUM(CASE WHEN tipo='despesa' AND origem_modulo IN ('folha_realizada','folha_projetada','encargos_projetado','folha_oficial','folha_prevista_vale','folha_prevista_pagamento') THEN realizado ELSE 0 END) AS folha_fiscal,
      SUM(CASE WHEN tipo='despesa' AND origem_modulo IN ('folha_realizada','folha_projetada','encargos_projetado','folha_oficial','folha_prevista_vale','folha_prevista_pagamento') THEN GREATEST(realizado, previsto) ELSE 0 END) AS folha_gerencial
    FROM base
  `, [ano]);

  const x = r.rows[0] || {};
  const num = (k: string) => Number(x[k] ?? 0);

  const recFiscal = num("rec_fiscal");
  const recGerencial = num("rec_gerencial");
  const cdFiscal = num("cd_fiscal");
  const cdGerencial = num("cd_gerencial");
  const ciFiscal = num("ci_fiscal");
  const ciGerencial = num("ci_gerencial");
  const folhaFiscal = num("folha_fiscal");
  const folhaGerencial = num("folha_gerencial");

  const lucroBrutoF = recFiscal - cdFiscal;
  const lucroBrutoG = recGerencial - cdGerencial;
  const ebitdaF = lucroBrutoF - ciFiscal;
  const ebitdaG = lucroBrutoG - ciGerencial;

  const linhas: DRELinha[] = [
    { conta: "Receita Bruta", gerencial: recGerencial, fiscal: recFiscal, diferenca: recGerencial - recFiscal },
    { conta: "(-) Custos Diretos", gerencial: -cdGerencial, fiscal: -cdFiscal, diferenca: -(cdGerencial - cdFiscal) },
    { conta: "= Lucro Bruto", gerencial: lucroBrutoG, fiscal: lucroBrutoF, diferenca: lucroBrutoG - lucroBrutoF },
    { conta: "(-) Despesas Operacionais", gerencial: -ciGerencial, fiscal: -ciFiscal, diferenca: -(ciGerencial - ciFiscal) },
    { conta: "    Folha + Encargos", gerencial: -folhaGerencial, fiscal: -folhaFiscal, diferenca: -(folhaGerencial - folhaFiscal) },
    { conta: "= EBITDA", gerencial: ebitdaG, fiscal: ebitdaF, diferenca: ebitdaG - ebitdaF },
  ];

  return {
    linhas,
    resumo: {
      ano,
      receitaGerencial: recGerencial,
      receitaFiscal: recFiscal,
      ebitdaGerencial: ebitdaG,
      ebitdaFiscal: ebitdaF,
      margemEbitdaG: recGerencial > 0 ? (ebitdaG / recGerencial) * 100 : 0,
      margemEbitdaF: recFiscal > 0 ? (ebitdaF / recFiscal) * 100 : 0,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5. ALERTAS PUSH FINANCEIROS
// ════════════════════════════════════════════════════════════════════════════
export type AlertaSeveridade = "info" | "atencao" | "critico";
export type AlertaTipo =
  | "vencido" | "vencendo_3d" | "decimo_terceiro" | "three_way_block"
  | "liquidez_baixa" | "concentracao_fornecedor" | "ofx_pendente"
  | "receita_prevista";

export async function generateFinancialAlerts(db: any, companyId: number): Promise<number> {
  let inseridos = 0;
  const ins = async (tipo: AlertaTipo, sev: AlertaSeveridade, titulo: string, mensagem: string, dados: any = {}) => {
    await exec(db, `
      INSERT INTO financial_alerts (company_id, tipo, severidade, titulo, mensagem, dados, lida, criado_em)
      SELECT $1, $2, $3, $4, $5, $6::jsonb, 0, NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM financial_alerts
        WHERE company_id=$1 AND tipo=$2 AND titulo=$4 AND lida=0
          AND criado_em > NOW() - INTERVAL '24 hours'
      )
    `, [companyId, tipo, sev, titulo, mensagem, JSON.stringify(dados)]);
    inseridos++;
  };

  // Vencidos
  const venc = await exec(db, `
    SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_previsto::numeric),0) AS total
    FROM financial_entries
    WHERE company_id=$1 AND tipo='despesa' AND status IN ('a_pagar','previsto','bloqueado')
      AND data_vencimento < CURRENT_DATE
  `, [companyId]);
  const qVenc = Number(venc.rows[0]?.qtd || 0);
  if (qVenc > 0) {
    const totalV = Number(venc.rows[0]?.total || 0);
    await ins("vencido", "critico", `${qVenc} título(s) vencido(s)`,
      `Total de R$ ${totalV.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em atraso. Avalie negociação ou pagamento imediato.`,
      { qtd: qVenc, total: totalV });
  }

  // Vencendo em 3 dias
  const v3 = await exec(db, `
    SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_previsto::numeric),0) AS total
    FROM financial_entries
    WHERE company_id=$1 AND tipo='despesa' AND status IN ('a_pagar','previsto')
      AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
  `, [companyId]);
  const qV3 = Number(v3.rows[0]?.qtd || 0);
  if (qV3 > 0) {
    const totalV3 = Number(v3.rows[0]?.total || 0);
    await ins("vencendo_3d", "atencao", `${qV3} título(s) vencem em até 3 dias`,
      `R$ ${totalV3.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em pagamentos próximos. Garanta saldo em conta.`,
      { qtd: qV3, total: totalV3 });
  }

  // 13º próximo (Lei 4.090/62 — 1ª parcela até 30/Nov, 2ª até 20/Dez)
  const hoje = new Date();
  const mes = hoje.getMonth() + 1; // 1-12
  if (mes === 10 || mes === 11) {
    const dec13 = await exec(db, `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_previsto::numeric),0) AS total
      FROM financial_entries
      WHERE company_id=$1 AND origem_modulo='decimo_terceiro_projetado'
        AND data_vencimento BETWEEN CURRENT_DATE AND DATE '${hoje.getFullYear()}-12-31'
    `, [companyId]);
    const qD = Number(dec13.rows[0]?.qtd || 0);
    if (qD > 0) {
      const totalD = Number(dec13.rows[0]?.total || 0);
      await ins("decimo_terceiro", "atencao", "13º Salário se aproxima",
        `Provisão de R$ ${totalD.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} para os próximos meses (Lei 4.090/62).`,
        { qtd: qD, total: totalD });
    }
  }

  // Three-way bloqueio (a partir de purchase_accounts_payable bloqueados)
  const bloq = await exec(db, `
    SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_total::numeric),0) AS total
    FROM purchase_accounts_payable
    WHERE company_id=$1 AND status='bloqueado'
  `, [companyId]);
  const qB = Number(bloq.rows[0]?.qtd || 0);
  if (qB > 0) {
    const totalB = Number(bloq.rows[0]?.total || 0);
    await ins("three_way_block", "atencao", `${qB} título(s) bloqueado(s) por 3-Way Match`,
      `R$ ${totalB.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} aguardam liberação (PO × Recebimento × NF).`,
      { qtd: qB, total: totalB });
  }

  // Rev. 3161 — RECEBÍVEIS PREVISTOS a lançar. Substitui o "aviso automático"
  // que antes vinha da materialização revenue→entries (agora desligada): conta
  // os financial_revenue em aberto e SEM par em financial_entries, pra o usuário
  // não perder de vista as receitas previstas mesmo antes de transferi-las.
  const prevRec = await exec(db, `
    SELECT COUNT(*) AS qtd,
           COALESCE(SUM(COALESCE(NULLIF(fr.valor_liquido_receber,0), fr.valor_medicao)::numeric),0) AS total
    FROM financial_revenue fr
    WHERE fr.company_id=$1
      AND fr.status NOT IN ('cancelado','recebido_total')
      AND fr.valor_medicao > 0
      AND NOT EXISTS (
        SELECT 1 FROM financial_entries fe
        WHERE fe.origem_modulo='revenue' AND fe.origem_id=fr.id AND fe.company_id=fr.company_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM financial_entries fe2
        WHERE fe2.company_id=fr.company_id
          AND fe2.origem_modulo='planejamento_medicao'
          AND fe2.origem_id=fr.medicao_id
          AND COALESCE(fe2.status,'') <> 'cancelado'
      )
  `, [companyId]);
  const qPrev = Number(prevRec.rows[0]?.qtd || 0);
  if (qPrev > 0) {
    const totalPrev = Number(prevRec.rows[0]?.total || 0);
    await ins("receita_prevista", "info", `${qPrev} recebível(is) previsto(s) a lançar`,
      `R$ ${totalPrev.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} previstos aguardam transferência para o Contas a Receber (Lançamentos → "Recebíveis Previstos").`,
      { qtd: qPrev, total: totalPrev });
  }

  return inseridos;
}

export async function getAlertsForCompany(db: any, companyIds: number[], apenasNaoLidas = false): Promise<any[]> {
  const ids = companyIds.map(Number).join(",") || "0";
  const filtro = apenasNaoLidas ? "AND lida=0" : "";
  const r = await exec(db, `
    SELECT id, tipo, severidade, titulo, mensagem, dados, lida, criado_em, lida_em
    FROM financial_alerts
    WHERE company_id IN (${ids}) ${filtro}
    ORDER BY lida ASC, criado_em DESC
    LIMIT 100
  `);
  return r.rows.map((a: any) => ({
    ...a,
    dados: typeof a.dados === "string" ? (() => { try { return JSON.parse(a.dados); } catch { return {}; } })() : a.dados,
  }));
}

export async function markAlertRead(db: any, companyId: number, alertId: number, userId: string) {
  await exec(db, `
    UPDATE financial_alerts SET lida=1, lida_em=NOW(), lida_por=$1
    WHERE id=$2 AND company_id=$3
  `, [userId, alertId, companyId]);
}
