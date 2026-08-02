import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ============================================================
// HELPER: executa queries parametrizadas corretamente no Drizzle ORM
// db.execute(string, array) ignora o array — é preciso usar sql template
// ============================================================
async function dbExecute(db: any, query: string, params: unknown[]): Promise<{ rows: any[] }> {
  // Divide a query nos placeholders $1, $2, etc. e reconstrói como sql template
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const paramVal = params[i - 1];
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  const res = await db.execute(built);
  const rows: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  return { rows };
}

// ============================================================
// BRIDGE DE INTEGRAÇÃO FINANCEIRA — FC Engenharia
// Fases 2, 3, 4: Contas a Pagar, Receber e Caminho Reverso
//
// Fundamentação jurídica e contábil:
// - Lei 6.404/76 (Sociedades por Ações) — regime de competência
// - NBC TG 1000 — entidade contábil, uma origem = um lançamento
// - NBC TG 27 — propriedades de investimento / centro de custo
// - IN RFB 2.043/2021 — EFD-REINF
// - CLT Arts. 457–462 — encargos trabalhistas
// - COSO Framework 2013 — controles internos / alçada
// ============================================================

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function mesComp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function entryExists(db: any, companyId: number, origemModulo: string, origemId: number): Promise<boolean> {
  const { rows } = await dbExecute(db,
    `SELECT id FROM financial_entries WHERE company_id=$1 AND origem_modulo=$2 AND origem_id=$3 LIMIT 1`,
    [companyId, origemModulo, origemId]
  );
  return rows.length > 0;
}

// ─── Mapa canônico: conta_nome flutuante → conta_id ───────────────────────────
// Usado por insertEntry (auto-resolve) e exportado para outros importadores.
export const CONTA_ID_BY_NOME: Record<string, number> = {
  // Folha / RH
  "FOLHA DE PAGAMENTO": 506,
  "SALÁRIO - MÃO DE OBRA": 506,
  "Salários e Horas Extras (CLT)": 506,
  "HORA EXTRA - OBRA": 387,
  "VALE ADIANTAMENTO": 301,
  "RESCISÃO - MÃO DE OBRA": 280,
  // Benefícios
  "Vale Refeição / Alimentação": 265,
  "Vale Alimentação": 265,
  "VALE ALIMENTAÇÃO": 265,
  "VALE ALIMENTAÇÃO - OBRA": 265,
  "VALE ALIMENTAÇÃO - ADMINISTRATIVO": 285,
  "Vale Refeição (Projeção)": 265,
  "Vale Alimentação (Projeção)": 265,
  // Frota
  "Combustíveis e Lubrificantes": 384,
  // Financiamentos
  "FIN": 264,
  "FINANCIAMENTOS": 264,
  "Financiamento": 264,
  // Mão de obra terceirizada / subempreiteiros
  "MÃO DE OBRA TERCEIRIZADA - OBRA": 23,
  "MÃO DE OBRA TERCEIRIZADA / SUBEMPREITEIRO": 23,
  "Subempreiteiros": 23,
  // Materiais
  "Materiais e Insumos": 281,
  "Materiais para Obra": 281,
  "MATERIAIS DE OBRA": 281,
  "MATERIAIS PARA OBRA": 281,
  // Serviços / Jurídico / Marketing
  "SERV": 391,
  "PRESTAÇÃO DE SERVIÇO": 391,
  "Serviços PJ / Terceirizados": 391,
  "DESPESA JURÍDICA": 271,
  "Assessoria Jurídica": 271,
  "DESPESAS COM MARKETING": 9,
  "DESPESA COM MARKETING": 9,
  // Receitas financeiras
  "RENDIMENTO FINANCEIRO": 489,
  "Rendimento Financeiro": 489,
  "JUROS E RENDIMENTOS RECEBIDOS": 489,
  // Custos de obra (projeções de cronograma — NÃO mapear para evitar dupla contagem)
  // "Custos Diretos de Obra" → sem conta (cronograma_atividade)
  // "Custos Indiretos"       → sem conta (cronograma_atividade)
};

/** Resolve conta_id a partir do conta_nome (case-sensitive, mapa canônico). */
export function resolveContaId(contaNome: string | null | undefined): number | null {
  if (!contaNome) return null;
  return CONTA_ID_BY_NOME[contaNome] ?? null;
}

async function insertEntry(db: any, data: {
  companyId: number;
  obraId?: number | null;
  obraNome?: string | null;
  contaId?: number | null;
  contaNome?: string | null;
  tipo: "receita" | "despesa";
  natureza: "fixo" | "variavel";
  valorPrevisto: number;
  valorRealizado?: number | null;
  dataCompetencia: string;
  dataVencimento?: string | null;
  dataPagamento?: string | null;
  status: string;
  origemModulo: string;
  origemId: number;
  origemDescricao?: string;
  descricao?: string;
  formaPagamento?: string | null;
}): Promise<number | null> {
  const resolvedContaId = data.contaId ?? resolveContaId(data.contaNome);
  const { rows } = await dbExecute(db,
    `INSERT INTO financial_entries
     (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
      valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
      status, origem_modulo, origem_id, origem_descricao, descricao, forma_pagamento,
      created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      data.companyId,
      data.obraId ?? null,
      data.obraNome ?? null,
      resolvedContaId,
      data.contaNome ?? null,
      data.tipo,
      data.natureza,
      data.valorPrevisto,
      data.valorRealizado ?? null,
      data.dataCompetencia,
      data.dataVencimento ?? null,
      data.dataPagamento ?? null,
      data.status,
      data.origemModulo,
      data.origemId,
      data.origemDescricao ?? null,
      data.descricao ?? null,
      data.formaPagamento ?? null,
    ]
  );
  return rows[0]?.id ?? null;
}

async function logImport(db: any, companyId: number, origemModulo: string, mesRef: string, total: number, erros: number, detalhes?: string) {
  await dbExecute(db,
    `INSERT INTO financial_import_log (company_id, origem_modulo, mes_referencia, total_importados, total_erros, detalhes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [companyId, origemModulo, mesRef, total, erros, detalhes ?? null]
  ).catch(() => {}); // log errors silently — not critical
}

// ─────────────────────────────────────────────────────────────
// FASE 2 — CONTAS A PAGAR
// ─────────────────────────────────────────────────────────────

// 2.4 — Terceiros (medições aprovadas → contas a pagar)
// Fundamentação: contratos de prestação de serviço (art. 593-609 CC/2002)
export async function importTerceirosToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT tm.id, tm.contrato_id,
              tm.valor_medido, COALESCE(tm.valor_liquido_pagamento::numeric, 0) AS valor_liquido_pagamento,
              COALESCE(tm.fd_total_abatido::numeric, 0) AS fd_total_abatido,
              tm.data_referencia, tm.status, tm.periodo, tm.obra_id,
              COALESCE(et.nome_fantasia, et.razao_social) AS nome_empresa,
              tc.descricao AS tipo_servico, tc.valor_total AS valor_contrato,
              tc.numero_contrato AS numero_contrato,
              tc.dia_pagamento AS tc_dia_pagamento,
              tc.pagamento_conforme_recebimento AS tc_conforme_receb,
              o.terceiro_dia_pagamento AS obra_dia_pagamento,
              o.terceiro_pagamento_conforme_recebimento AS obra_conforme_receb,
              o.nome AS obra_nome
       FROM terceiro_medicoes tm
       JOIN terceiro_contratos tc ON tc.id = tm.contrato_id
       JOIN empresas_terceiras et ON et.id = tc.empresa_terceira_id
       LEFT JOIN obras o ON o.id = tm.obra_id
       WHERE tm.company_id=$1
         AND tm.status IN ('aprovada','faturada','paga')
         AND tm.periodo=$2`,
      [companyId, targetMes]
    );

    for (const r of rows) {
      if (await entryExists(db, companyId, "terceiro_medicao", r.id)) continue;
      const valorBruto = parseFloat(r.valor_medido ?? "0");
      if (valorBruto <= 0) continue;

      // Rev. 4284 — usar valor_liquido_pagamento se já calculado; senão derivar da OC.
      let valorLiquido = parseFloat(r.valor_liquido_pagamento ?? "0");
      if (valorLiquido <= 0) {
        try {
          const ocRes = await dbExecute(db,
            `SELECT adiantamento_ativo, adiantamento_tipo,
                    adiantamento_pct::numeric AS adiantamento_pct,
                    adiantamento_valor_fixo::numeric AS adiantamento_valor_fixo,
                    adiantamento_amortizacao, adiantamento_parcelas_n,
                    retencao_ativa, retencao_pct::numeric AS retencao_pct,
                    total::numeric AS oc_total
             FROM compras_ordens
             WHERE contrato_id=$1 AND status NOT IN ('cancelada','rascunho')
             ORDER BY id DESC LIMIT 1`,
            [r.contrato_id]
          );
          const oc = ocRes.rows?.[0];
          let amortValor = 0;
          let retValor = 0;
          if (oc) {
            const baseContrato = parseFloat(oc.oc_total ?? r.valor_contrato ?? "0");
            if (oc.retencao_ativa && parseFloat(oc.retencao_pct ?? "0") > 0) {
              retValor = Math.round(valorBruto * parseFloat(oc.retencao_pct) / 100 * 100) / 100;
            }
            if (oc.adiantamento_ativo && baseContrato > 0) {
              const adiantTotal = oc.adiantamento_tipo === "valor"
                ? parseFloat(oc.adiantamento_valor_fixo ?? "0")
                : Math.round(baseContrato * parseFloat(oc.adiantamento_pct ?? "5") / 100 * 100) / 100;
              if (adiantTotal > 0) {
                if (oc.adiantamento_amortizacao === "parcelas_fixas") {
                  const nParc = Math.max(1, parseInt(String(oc.adiantamento_parcelas_n ?? "1")));
                  amortValor = Math.round(adiantTotal / nParc * 100) / 100;
                } else {
                  amortValor = Math.round(valorBruto * adiantTotal / baseContrato * 100) / 100;
                }
                const saldoRes = await dbExecute(db,
                  `SELECT COALESCE(SUM(adiantamento_amortizacao_valor::numeric), 0) AS total_amort
                   FROM terceiro_medicoes
                   WHERE contrato_id=$1 AND id!=$2 AND status IN ('aprovada','faturada','paga')`,
                  [r.contrato_id, r.id]
                );
                const jaAmortizado = parseFloat(saldoRes.rows?.[0]?.total_amort ?? "0");
                amortValor = Math.min(amortValor, Math.max(0, adiantTotal - jaAmortizado));
              }
            }
          }
          valorLiquido = Math.max(0, Math.round((valorBruto - amortValor - retValor) * 100) / 100);
          if (amortValor > 0 || retValor > 0) {
            await dbExecute(db,
              `UPDATE terceiro_medicoes SET adiantamento_amortizacao_valor=$1, retencao_garantia_valor=$2, valor_liquido_pagamento=$3 WHERE id=$4`,
              [String(amortValor.toFixed(2)), String(retValor.toFixed(2)), String(valorLiquido.toFixed(2)), r.id]
            ).catch((e: any) => console.warn("[Bridge][terceiros] UPDATE deduções falhou:", e?.message));
          } else {
            valorLiquido = valorBruto;
          }
        } catch (e: any) {
          console.warn("[FinancialBridge][terceiros] Erro ao calcular deduções:", e?.message);
          valorLiquido = valorBruto;
        }
      }

      // Rev. 4798 — FD abatido SEMPRE desconta do título a pagar (Poka-Yoke:
      // nunca pagar mais do que o combinado). valor_liquido_pagamento e as
      // deduções acima NÃO incluem FD — o desconto entra só aqui.
      const fdAbatido = parseFloat(r.fd_total_abatido ?? "0");
      if (fdAbatido > 0) {
        valorLiquido = Math.max(0, Math.round((valorLiquido - fdAbatido) * 100) / 100);
      }
      if (valorLiquido <= 0) continue; // 100% abatido em FD → nada a pagar

      // Rev. 4832 — vencimento respeita a condição de pagamento do contrato
      // (herdada da obra): dia de pagamento no MÊS SEGUINTE ao mês de referência
      // da medição (fluxo padrão: mede até 25, aprova até dia 1º, paga dia 10).
      // "Conforme recebimento": sem dia fixo → previsão = último dia do mês seguinte.
      const mesRef = r.data_referencia
        ? r.data_referencia.toString().substring(0, 7)
        : targetMes;
      const [anoRef, mmRef] = mesRef.split("-").map((s: string) => parseInt(s, 10));
      const anoPag = mmRef === 12 ? anoRef + 1 : anoRef;
      const mesPag = mmRef === 12 ? 1 : mmRef + 1;
      const ultimoDiaMesPag = new Date(anoPag, mesPag, 0).getDate(); // dia 0 do mês seguinte = último dia
      const conformeReceb = Number(r.tc_conforme_receb ?? r.obra_conforme_receb ?? 0) === 1;
      const diaPagBruto = conformeReceb
        ? ultimoDiaMesPag
        : parseInt(String(r.tc_dia_pagamento ?? r.obra_dia_pagamento ?? 10), 10) || 10;
      const diaPag = Math.min(Math.max(diaPagBruto, 1), ultimoDiaMesPag);
      const dataVenc = `${anoPag}-${String(mesPag).padStart(2, "0")}-${String(diaPag).padStart(2, "0")}`;
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome,
        contaNome: "Serviços de Terceiros",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valorLiquido,
        valorRealizado: r.status === "paga" ? valorLiquido : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        dataPagamento: r.status === "paga" ? dataVenc : null,
        status: r.status === "paga" ? "pago" : "a_pagar",
        origemModulo: "terceiro_medicao",
        origemId: r.id,
        // Rev. 4850 — identificação completa no Contas a Pagar (pedido do usuário):
        // fornecedor + nº do contrato + medição + período, pra ficar claro o que se paga.
        origemDescricao: `Medição #${r.id} — ${r.nome_empresa}${r.numero_contrato ? ` — Contrato ${r.numero_contrato}` : ""} — ${r.tipo_servico ?? "Serviço"} — ${r.periodo}`,
        descricao: `Terceiro: ${r.nome_empresa}${r.numero_contrato ? ` — ${r.numero_contrato}` : ""} — Medição #${r.id} — ${r.periodo}${conformeReceb ? " (pagto conforme recebimento do cliente)" : ""}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][terceiros]", e);
  }

  await logImport(db, companyId, "terceiro_medicao", targetMes, imported, erros);
  return imported;
}

// 2.5 — Parceiros conveniados (pagamentos_parceiros → contas a pagar)
// Fundamentação: contratos de subempreitada (art. 652 CC/2002)
export async function importParceirosToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pp.id, pp.valor_total, pp.status, pp.data_pagamento, pp.competencia_pagamento,
              pp.comprovante_pagamento_url,
              pc.razao_social AS parceiro_nome, pc.cnpj
       FROM pagamentos_parceiros pp
       JOIN parceiros_conveniados pc ON pc.id = pp."parceiroId"
       WHERE pp."companyId"=$1 AND pp.competencia_pagamento=$2`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "pagamento_parceiro", r.id)) continue;
      const valor = parseFloat(r.valor_total ?? "0");
      if (valor <= 0) continue;
      const dataVenc = targetMes + "-10";
      await insertEntry(db, {
        companyId,
        contaNome: "MÃO DE OBRA TERCEIRIZADA / SUBEMPREITEIRO",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.status === "pago" ? valor : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        dataPagamento: r.data_pagamento ? r.data_pagamento.toString().split("T")[0] : null,
        status: r.status === "pago" ? "pago" : "a_pagar",
        origemModulo: "pagamento_parceiro",
        origemId: r.id,
        origemDescricao: `Parceiro: ${r.parceiro_nome} — Competência ${r.competencia_pagamento}`,
        descricao: `Pagamento parceiro conveniado ${r.parceiro_nome}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][parceiros]", e);
  }

  await logImport(db, companyId, "pagamento_parceiro", targetMes, imported, erros);
  return imported;
}

// 2.6 — Frotas (manutenções + abastecimentos → contas a pagar)
// Fundamentação: Custo fixo/variável operacional (NBC TG 03 — Demonstração dos Fluxos de Caixa)
export async function importFrotasToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  const [ano, mes] = targetMes.split("-");
  let imported = 0;
  let erros = 0;

  // Manutenções
  try {
    const { rows } = await dbExecute(db,
      `SELECT fm.id, fm.custo AS custo_total, fm.data_manutencao, fm.descricao AS desc_manut,
              fm.tipo AS tipo_manutencao, fm.status, fm.vehicle_id,
              v."companyId" AS company_id_v, v.modelo, v.placa
       FROM fleet_maintenances fm
       JOIN vehicles v ON v.id = fm.vehicle_id
       WHERE v."companyId"=$1
         AND TO_CHAR(fm.data_manutencao,'YYYY-MM')=$2
         AND fm.custo > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "frota_manutencao", r.id)) continue;
      const valor = parseFloat(r.custo_total ?? "0");
      if (valor <= 0) continue;
      const dataExec = r.data_manutencao ? r.data_manutencao.toString().split("T")[0] : today();
      await insertEntry(db, {
        companyId,
        contaNome: "Manutenção de Veículos",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.status === "concluida" ? valor : null,
        dataCompetencia: `${ano}-${mes}-01`,
        dataVencimento: dataExec,
        dataPagamento: r.status === "concluida" ? dataExec : null,
        status: r.status === "concluida" ? "pago" : "a_pagar",
        origemModulo: "frota_manutencao",
        origemId: r.id,
        origemDescricao: `Manutenção ${r.tipo_manutencao ?? "geral"} — ${r.modelo} (${r.placa})`,
        descricao: r.desc_manut ?? `Manutenção veículo ${r.placa}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][frotas-manut]", e);
  }

  // Abastecimentos
  try {
    const { rows } = await dbExecute(db,
      `SELECT ffr.id, ffr.valor_total, ffr.data, ffr.tipo_combustivel,
              ffr.vehicle_id, v.modelo, v.placa
       FROM fleet_fuel_records ffr
       JOIN vehicles v ON v.id = ffr.vehicle_id
       WHERE v."companyId"=$1
         AND TO_CHAR(ffr.data,'YYYY-MM')=$2
         AND ffr.valor_total > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "frota_abastecimento", r.id)) continue;
      const valor = parseFloat(r.valor_total ?? "0");
      if (valor <= 0) continue;
      const dataExec = (r.data ?? r.data_abastecimento) ? (r.data ?? r.data_abastecimento).toString().split("T")[0] : today();
      await insertEntry(db, {
        companyId,
        contaNome: "Combustíveis e Lubrificantes",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: valor,
        dataCompetencia: `${ano}-${mes}-01`,
        dataVencimento: dataExec,
        dataPagamento: dataExec,
        status: "pago",
        origemModulo: "frota_abastecimento",
        origemId: r.id,
        origemDescricao: `Abastecimento ${r.tipo_combustivel ?? "combustível"} — ${r.modelo} (${r.placa})`,
        descricao: `Combustível ${r.modelo} ${r.placa}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][frotas-fuel]", e);
  }

  await logImport(db, companyId, "frota", targetMes, imported, erros);
  return imported;
}

// 2.7 — Benefícios VR/VA (vr_benefits → contas a pagar)
// Fundamentação: CLT art. 457 §2° (benefícios não integram salário)
export async function importBeneficiosToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT vb.id, vb."companyId", vb."mesReferencia", vb."valorTotal",
              vb."valorVa", vb.status, vb.operadora,
              e."nomeCompleto" AS nome_completo
       FROM vr_benefits vb
       JOIN employees e ON e.id = vb."employeeId"
       WHERE vb."companyId"=$1 AND vb."mesReferencia"=$2`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      const valorVR = parseFloat(r.valorTotal ?? "0");
      const valorVA = parseFloat(r.valorVa ?? "0");

      // VR (Vale Refeição)
      if (valorVR > 0) {
        const modulo = "beneficio_vr";
        if (!(await entryExists(db, companyId, modulo, r.id))) {
          await insertEntry(db, {
            companyId,
            contaNome: "VALE ALIMENTAÇÃO",
            tipo: "despesa",
            natureza: "variavel",
            valorPrevisto: valorVR,
            valorRealizado: r.status === "processado" ? valorVR : null,
            dataCompetencia: targetMes + "-01",
            dataVencimento: targetMes + "-05",
            dataPagamento: r.status === "processado" ? targetMes + "-05" : null,
            status: r.status === "processado" ? "pago" : "a_pagar",
            origemModulo: modulo,
            origemId: r.id,
            origemDescricao: `VR ${targetMes} — ${r.nome_completo ?? ""} — ${r.operadora}`,
            descricao: `Vale Refeição ${targetMes}: ${r.nome_completo ?? ""}`,
          });
          imported++;
        }
      }

      // VA (Vale Alimentação)
      if (valorVA > 0) {
        const modulo = "beneficio_va";
        if (!(await entryExists(db, companyId, modulo, r.id))) {
          await insertEntry(db, {
            companyId,
            contaNome: "VALE ALIMENTAÇÃO",
            tipo: "despesa",
            natureza: "variavel",
            valorPrevisto: valorVA,
            valorRealizado: r.status === "processado" ? valorVA : null,
            dataCompetencia: targetMes + "-01",
            dataVencimento: targetMes + "-05",
            dataPagamento: r.status === "processado" ? targetMes + "-05" : null,
            status: r.status === "processado" ? "pago" : "a_pagar",
            origemModulo: modulo,
            origemId: r.id,
            origemDescricao: `VA ${targetMes} — ${r.nome_completo ?? ""} — ${r.operadora}`,
            descricao: `Vale Alimentação ${targetMes}: ${r.nome_completo ?? ""}`,
          });
          imported++;
        }
      }
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][beneficios]", e);
  }

  await logImport(db, companyId, "beneficio", targetMes, imported, erros);
  return imported;
}

// 2.8 — Seguro Vida (seguro_vida_importacoes → custo mensal)
// Fundamentação: Normas regulamentadoras MTE — prêmio coletivo
export async function importSeguroVidaToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT id, company_id, competencia, total_ok
       FROM seguro_vida_importacoes
       WHERE company_id=$1 AND competencia=$2
       LIMIT 1`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute
    if (rows.length === 0) return 0;
    const r = rows[0];

    if (await entryExists(db, companyId, "seguro_vida", r.id)) return 0;

    // Custo médio aproximado: R$ 15/segurado (valor referência mercado)
    const totalSegurados = parseInt(r.total_ok ?? "0");
    if (totalSegurados <= 0) return 0;
    const valorEstimado = totalSegurados * 15; // será ajustado quando apólice tiver valor real

    await insertEntry(db, {
      companyId,
      contaNome: "Seguro de Vida Coletivo",
      tipo: "despesa",
      natureza: "fixo",
      valorPrevisto: valorEstimado,
      dataCompetencia: targetMes + "-01",
      dataVencimento: targetMes + "-10",
      status: "a_pagar",
      origemModulo: "seguro_vida",
      origemId: r.id,
      origemDescricao: `Seguro Vida ${targetMes} — ${totalSegurados} segurados`,
      descricao: `Prêmio seguro de vida coletivo ${targetMes}`,
    });
    imported++;
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][seguro_vida]", e);
  }

  await logImport(db, companyId, "seguro_vida", targetMes, imported, erros);
  return imported;
}

// 2.9 — Adiantamentos salariais (advances → contas a pagar)
// Fundamentação: CLT art. 462 — adiantamento não pode ultrapassar 40% do salário
export async function importAdiantamentosToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT a.id, a."valorAdiantamento", a."valorLiquido", a."mesReferencia",
              a."dataPagamento", a.aprovado, a."bancoDestino",
              e."nomeCompleto" AS nome_completo
       FROM advances a
       JOIN employees e ON e.id = a."employeeId"
       WHERE a."companyId"=$1 AND a."mesReferencia"=$2
         AND a.aprovado IN ('Aprovado','Pago')`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "adiantamento", r.id)) continue;
      const valor = parseFloat(r.valorLiquido ?? r.valorAdiantamento ?? "0");
      if (valor <= 0) continue;
      const dataVenc = targetMes + "-15";
      await insertEntry(db, {
        companyId,
        contaNome: "Adiantamentos Salariais",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.aprovado === "Pago" ? valor : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        dataPagamento: r.dataPagamento ? r.dataPagamento.toString().split("T")[0] : null,
        status: r.aprovado === "Pago" ? "pago" : "a_pagar",
        origemModulo: "adiantamento",
        origemId: r.id,
        origemDescricao: `Adiantamento ${targetMes} — ${r.nome_completo}`,
        descricao: `Adiantamento salarial ${targetMes}: ${r.nome_completo}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][adiantamentos]", e);
  }

  await logImport(db, companyId, "adiantamento", targetMes, imported, erros);
  return imported;
}

// 2.10 — Pró-labore sócios (company_partners → contas a pagar)
// Fundamentação: RIR/2018 art. 625 — pró-labore sujeito a INSS e IRRF
export async function importProLaboreToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT id, nome, valor_pro_labore, dia_vencimento, ativo
       FROM company_partners
       WHERE company_id=$1 AND ativo=1 AND valor_pro_labore > 0`,
      [companyId]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      const origemId = parseInt(`${r.id}${targetMes.replace("-", "")}`);
      if (await entryExists(db, companyId, "pro_labore", origemId)) continue;
      const valor = parseFloat(r.valor_pro_labore ?? "0");
      if (valor <= 0) continue;
      const dia = String(r.dia_vencimento ?? 5).padStart(2, "0");
      const dataVenc = `${targetMes}-${dia}`;
      await insertEntry(db, {
        companyId,
        contaNome: "Pró-Labore Sócios",
        tipo: "despesa",
        natureza: "fixo",
        valorPrevisto: valor,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        status: "a_pagar",
        origemModulo: "pro_labore",
        origemId: origemId,
        origemDescricao: `Pró-Labore ${targetMes} — ${r.nome}`,
        descricao: `Pró-labore sócio ${r.nome} — ${targetMes}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][pro_labore]", e);
  }

  await logImport(db, companyId, "pro_labore", targetMes, imported, erros);
  return imported;
}

// 2.11 — Planejamento (compras de obra → previsão financeira)
// Fundamentação: NBC TG 11 — contratos de construção
export async function importPlanejamentoComprasToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pc.id, pc.item AS descricao,
              COALESCE(pc.quantidade * pc.custo_unitario, 0) AS valor_total,
              pc.data_necessaria AS data_prevista, pc.status,
              pc.projeto_id, pc.fornecedor,
              pp.obra_id, pp.nome AS projeto_nome,
              o.nome AS obra_nome
       FROM planejamento_compras pc
       JOIN planejamento_projetos pp ON pp.id = pc.projeto_id
       LEFT JOIN obras o ON o.id = pp.obra_id
       WHERE pp.company_id=$1
         AND TO_CHAR(COALESCE(pc.data_necessaria, NOW()), 'YYYY-MM')=$2
         AND pc.status NOT IN ('cancelada')
         AND COALESCE(pc.quantidade * pc.custo_unitario, 0) > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "planejamento_compra", r.id)) continue;
      const valor = parseFloat(r.valor_total ?? "0");
      if (valor <= 0) continue;
      const dataVenc = r.data_prevista ? r.data_prevista.toString().split("T")[0] : targetMes + "-28";
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome ?? r.projeto_nome,
        contaNome: "Materiais de Construção / Insumos",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        status: "previsto",
        origemModulo: "planejamento_compra",
        origemId: r.id,
        origemDescricao: `Compra planejada: ${r.descricao} — ${r.projeto_nome}`,
        descricao: r.descricao ?? `Compra planejamento ${targetMes}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][planejamento_compras]", e);
  }

  await logImport(db, companyId, "planejamento_compra", targetMes, imported, erros);
  return imported;
}

// 2.12 — Almoxarifado (saídas diretas → despesa variável)
// Fundamentação: NBC TG 16 — estoques (custo de saída = despesa)
export async function importAlmoxarifadoToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  const [ano, mes] = targetMes.split("-");
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT asi.id,
              asi.quantidade * COALESCE(ai.valor_unitario, 0) AS valor_total,
              asi.created_at, asi.motivo,
              asi.obra_id,
              ai.nome AS item_nome,
              o.nome AS obra_nome
       FROM almoxarifado_saidas_insumo asi
       JOIN almoxarifado_itens ai ON ai.id = asi.item_id
       LEFT JOIN obras o ON o.id = asi.obra_id
       WHERE asi.company_id=$1
         AND TO_CHAR(asi.created_at,'YYYY-MM')=$2
         AND asi.quantidade > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "almoxarifado_saida", r.id)) continue;
      const valor = parseFloat(r.valor_total ?? "0");
      if (valor <= 0) continue;
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome,
        contaNome: "Materiais de Consumo / Almoxarifado",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: valor,
        dataCompetencia: `${ano}-${mes}-01`,
        status: "pago",
        origemModulo: "almoxarifado_saida",
        origemId: r.id,
        origemDescricao: `Saída almoxarifado: ${r.item_nome} ${r.motivo ? "— " + r.motivo : ""}`,
        descricao: `Consumo material: ${r.item_nome}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][almoxarifado]", e);
  }

  await logImport(db, companyId, "almoxarifado_saida", targetMes, imported, erros);
  return imported;
}

// 2.14 — Processos trabalhistas (condenações/acordos → provisão)
// Fundamentação: NBC TG 25 — provisões, passivos contingentes e ativos contingentes
export async function importProcessosTrabalistasToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT id, "valorCondenacao", "valorAcordo", "valorPago",
              "reclamante", "tipoAcao", "dataDistribuicao", status
       FROM processos_trabalhistas
       WHERE "companyId"=$1
         AND ("valorCondenacao" IS NOT NULL OR "valorAcordo" IS NOT NULL)
         AND status IN ('condenado','acordo','pago')`,
      [companyId]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "processo_trabalhista", r.id)) continue;
      const valor = parseFloat(r.valorAcordo ?? r.valorCondenacao ?? "0");
      if (valor <= 0) continue;
      const valorPago = parseFloat(r.valorPago ?? "0");
      await insertEntry(db, {
        companyId,
        contaNome: "Provisão Passivos Trabalhistas",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: valorPago > 0 ? valorPago : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-30",
        status: r.status === "pago" ? "pago" : "a_pagar",
        origemModulo: "processo_trabalhista",
        origemId: r.id,
        origemDescricao: `Processo Trabalhista — ${r.reclamante} — ${r.tipoAcao}`,
        descricao: `Provisão processo: ${r.reclamante}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][processos]", e);
  }

  await logImport(db, companyId, "processo_trabalhista", targetMes, imported, erros);
  return imported;
}

// 2.15 — Guias tributárias (ISS, INSS, FGTS, IRPJ)
// Fundamentação: IN RFB 1.234/2012 — retenções na fonte
export async function gerarGuiasTributarias(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let gerado = 0;
  let erros = 0;

  try {
    // Buscar configuração tributária
    const { rows: cfgRows } = await dbExecute(db,
      `SELECT * FROM financial_tax_config WHERE company_id=$1 AND ativo=1 LIMIT 1`,
      [companyId]
    );
    const cfg = cfgRows[0];
    if (!cfg) return 0;

    // Base de cálculo: receitas realizadas no mês
    const { rows: baseRows } = await dbExecute(db,
      `SELECT COALESCE(SUM(valor_realizado),0) AS base
       FROM financial_entries
       WHERE company_id=$1
         AND tipo='receita'
         AND status IN ('recebido','pago','a_receber')
         AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
      [companyId, targetMes]
    );
    const base = parseFloat(baseRows[0]?.base ?? "0");

    // Base folha: despesas com salários do mês
    const { rows: folhaRows } = await dbExecute(db,
      `SELECT COALESCE(SUM(valor_previsto),0) AS base
       FROM financial_entries
       WHERE company_id=$1
         AND origem_modulo='folha_clt'
         AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
      [companyId, targetMes]
    );
    const baseFolha = parseFloat(folhaRows[0]?.base ?? "0");

    const [ano, mes] = targetMes.split("-");
    const guias: { tipo: string; valor: number; vencimento: string; codigoReceita: string }[] = [];

    if (cfg.regime_tributario === "simples_nacional" && cfg.aliquota_simples) {
      const das = base * (parseFloat(cfg.aliquota_simples) / 100);
      if (das > 0) guias.push({ tipo: "das_simples", valor: das, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-20`, codigoReceita: "6106" });
    } else {
      if (base > 0) {
        const iss = base * (parseFloat(cfg.aliquota_iss ?? "3") / 100);
        if (iss > 0) guias.push({ tipo: "iss", valor: iss, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-${String(cfg.dia_pagamento_iss ?? 10).padStart(2, "0")}`, codigoReceita: "ISS" });

        const pis = base * (parseFloat(cfg.aliquota_pis ?? "0.65") / 100);
        if (pis > 0) guias.push({ tipo: "darf_pis", valor: pis, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-${String(cfg.dia_pagamento_pis ?? 25).padStart(2, "0")}`, codigoReceita: "8109" });

        const cofins = base * (parseFloat(cfg.aliquota_cofins ?? "3") / 100);
        if (cofins > 0) guias.push({ tipo: "darf_cofins", valor: cofins, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-${String(cfg.dia_pagamento_cofins ?? 25).padStart(2, "0")}`, codigoReceita: "2172" });
      }
    }

    // GPS (INSS Empresa)
    if (baseFolha > 0) {
      const inss = baseFolha * (parseFloat(cfg.aliquota_inss_empresa ?? "20") / 100);
      if (inss > 0) guias.push({ tipo: "gps_inss", valor: inss, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-${String(cfg.dia_pagamento_gps ?? 20).padStart(2, "0")}`, codigoReceita: "2100" });

      // FGTS
      const fgts = baseFolha * (parseFloat(cfg.aliquota_fgts ?? "8") / 100);
      if (fgts > 0) guias.push({ tipo: "guia_fgts", valor: fgts, vencimento: `${ano}-${String(parseInt(mes) + 1).padStart(2, "0")}-07`, codigoReceita: "GFIP" });
    }

    for (const g of guias) {
      // Verificar se já existe
      const { rows: existsRows } = await dbExecute(db,
        `SELECT id FROM financial_tax_obligations WHERE company_id=$1 AND tipo=$2 AND mes_competencia=$3 LIMIT 1`,
        [companyId, g.tipo, targetMes]
      );
      if (existsRows.length > 0) continue;

      // Inserir na tabela de obrigações tributárias
      const { rows: obrigRows } = await dbExecute(db,
        `INSERT INTO financial_tax_obligations (company_id, tipo, mes_competencia, valor_principal, valor_total, data_vencimento, codigo_receita, status, gerada_automaticamente)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'a_pagar',1)
         RETURNING id`,
        [companyId, g.tipo, targetMes, g.valor.toFixed(2), g.valor.toFixed(2), g.vencimento, g.codigoReceita]
      );
      const obrigId = obrigRows[0]?.id;

      // Criar lançamento financeiro correspondente
      if (obrigId) {
        await insertEntry(db, {
          companyId,
          contaNome: `Tributo: ${g.tipo.toUpperCase().replace("_", " ")}`,
          tipo: "despesa",
          natureza: "fixo",
          valorPrevisto: g.valor,
          dataCompetencia: targetMes + "-01",
          dataVencimento: g.vencimento,
          status: "a_pagar",
          origemModulo: "guia_tributaria",
          origemId: obrigId,
          origemDescricao: `${g.tipo.toUpperCase()} ${targetMes} — Código: ${g.codigoReceita}`,
          descricao: `Guia ${g.tipo} competência ${targetMes}`,
        });
        gerado++;
      }
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][guias_tributarias]", e);
  }

  await logImport(db, companyId, "guia_tributaria", targetMes, gerado, erros);
  return gerado;
}

// ─────────────────────────────────────────────────────────────
// FASE 3 — CONTAS A RECEBER
// ─────────────────────────────────────────────────────────────

// 3.1 — Medições de obra (planejamento_medicoes → receita)
// Fundamentação: NBC TG 47 (IFRS 15) — reconhecimento de receita
export async function importMedicoesObraToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pm.id, pm.valor_medido, pm.valor_previsto, pm.competencia, pm.status, pm.numero,
              pp.obra_id, pp.nome AS projeto_nome, pp.company_id,
              o.nome AS obra_nome, o.cliente AS cliente_nome
       FROM planejamento_medicoes pm
       JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
       LEFT JOIN obras o ON o.id = pp.obra_id
       WHERE pp.company_id=$1
         AND pm.competencia=$2
         AND pm.status IN ('aprovada','faturada')`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "medicao_obra", r.id)) continue;
      const valor = parseFloat(r.valor_medido ?? r.valor_previsto ?? "0");
      if (valor <= 0) continue;

      // Criar em financial_revenue também
      const { rows: revRows } = await dbExecute(db,
        `INSERT INTO financial_revenue (company_id, obra_id, obra_nome, cliente_nome,
         valor_medicao, medicao_numero, percentual_medicao, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'a_faturar',NOW(),NOW())
         RETURNING id`,
        [
          companyId, r.obra_id, r.obra_nome ?? r.projeto_nome, r.cliente_nome,
          valor.toFixed(2), r.numero,
          parseFloat(r.percentual_medido ?? "0").toFixed(2),
        ]
      );
      const revenueId = revRows[0]?.id;

      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome ?? r.projeto_nome,
        contaNome: "Faturamento de Obras",
        tipo: "receita",
        natureza: "variavel",
        valorPrevisto: valor,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-30",
        status: "a_receber",
        origemModulo: "medicao_obra",
        origemId: r.id,
        origemDescricao: `Medição #${r.numero} — ${r.obra_nome ?? r.projeto_nome} — ${r.competencia}`,
        descricao: `Faturamento medição ${r.numero} — ${r.obra_nome}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][medicoes_obra]", e);
  }

  await logImport(db, companyId, "medicao_obra", targetMes, imported, erros);
  return imported;
}

// 3.2 — Medições PJ (pj_medicoes → receita cobrável)
export async function importMedicoesPJToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pjm.id, pjm."valorBruto", pjm."valorLiquido", pjm."mesReferencia", pjm.status,
              pjc."razaoSocialPrestador" AS empresa_nome
       FROM pj_medicoes pjm
       JOIN pj_contracts pjc ON pjc.id = pjm."contractId"
       WHERE pjc."companyId"=$1
         AND pjm."mesReferencia"=$2
         AND pjm.status IN ('aprovada','faturada','paga')`,
      [companyId, targetMes]
    );

    for (const r of rows) {
      if (await entryExists(db, companyId, "medicao_pj", r.id)) continue;
      const valor = parseFloat(r.valorBruto ?? r.valor_bruto ?? "0");
      if (valor <= 0) continue;
      await insertEntry(db, {
        companyId,
        contaNome: "Serviços PJ Cobráveis",
        tipo: "receita",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.status === "paga" ? parseFloat(r.valorLiquido ?? r.valor_liquido ?? String(valor)) : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-30",
        dataPagamento: r.status === "paga" ? targetMes + "-30" : null,
        status: r.status === "paga" ? "recebido" : "a_receber",
        origemModulo: "medicao_pj",
        origemId: r.id,
        origemDescricao: `Medição PJ #${r.id} — ${r.empresa_nome}`,
        descricao: `Cobrança PJ ${r.empresa_nome} — ${targetMes}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][medicoes_pj]", e);
  }

  await logImport(db, companyId, "medicao_pj", targetMes, imported, erros);
  return imported;
}

// 3.4 — Terceiro medições cobráveis ao cliente
export async function importTerceiroCobravelToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT tm.id, tm.valor_medido, tm.periodo, tm.status, tm.obra_id,
              COALESCE(et.nome_fantasia, et.razao_social) AS nome_empresa,
              tc.descricao AS tipo_servico,
              o.nome AS obra_nome, o.cliente
       FROM terceiro_medicoes tm
       JOIN terceiro_contratos tc ON tc.id = tm.contrato_id
       JOIN empresas_terceiras et ON et.id = tc.empresa_terceira_id
       LEFT JOIN obras o ON o.id = tm.obra_id
       WHERE tm.company_id=$1
         AND tm.periodo=$2
         AND tm.status IN ('aprovada','faturada')`,
      [companyId, targetMes]
    );

    for (const r of rows) {
      const modulo = "terceiro_cobravel";
      if (await entryExists(db, companyId, modulo, r.id)) continue;
      const valor = parseFloat(r.valor_medido ?? "0");
      if (valor <= 0) continue;
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome,
        contaNome: "Repassess Cobráveis ao Cliente",
        tipo: "receita",
        natureza: "variavel",
        valorPrevisto: valor,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-30",
        status: "a_receber",
        origemModulo: modulo,
        origemId: r.id,
        origemDescricao: `Repasse cobrável — ${r.nome_empresa} — ${r.tipo_servico ?? "Serviço"} — ${r.cliente ?? "Cliente"}`,
        descricao: `Repasse terceiro cobrável ${r.nome_empresa}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][terceiro_cobravel]", e);
  }

  await logImport(db, companyId, "terceiro_cobravel", targetMes, imported, erros);
  return imported;
}

// ─────────────────────────────────────────────────────────────
// FASE 4 — CAMINHO REVERSO (impacto financeiro)
// ─────────────────────────────────────────────────────────────

// 4.1 — Hook verificarImpactoFinanceiro
// Retorna impacto de uma operação antes de executar
// Fundamentação: COSO Framework 2013 — Avaliação de Risco
export async function verificarImpactoFinanceiro(
  companyId: number,
  origemModulo: string,
  origemId: number
): Promise<{
  temImpacto: boolean;
  entryIds: number[];
  valorTotal: number;
  status: string;
  alerta?: string;
}> {
  const db = await getDb();
  if (!db) return { temImpacto: false, entryIds: [], valorTotal: 0, status: "ok" };

  const { rows } = await dbExecute(db,
    `SELECT id, valor_previsto, status FROM financial_entries
     WHERE company_id=$1 AND origem_modulo=$2 AND origem_id=$3 AND status NOT IN ('cancelado')`,
    [companyId, origemModulo, origemId]
  );
  // rows extracted by dbExecute

  if (rows.length === 0) return { temImpacto: false, entryIds: [], valorTotal: 0, status: "ok" };

  const total = rows.reduce((s: number, r: any) => s + parseFloat(r.valor_previsto ?? "0"), 0);
  const entryIds = rows.map((r: any) => r.id);

  let alerta: string | undefined;
  if (total > 5000) alerta = "APROVAÇÃO DIRETORIA OBRIGATÓRIA — valor acima de R$ 5.000 (alçada diretoria)";
  else if (total > 500) alerta = "APROVAÇÃO GERENCIAL REQUERIDA — valor entre R$ 500 e R$ 5.000";

  return { temImpacto: true, entryIds, valorTotal: total, status: rows[0]?.status ?? "previsto", alerta };
}

// 4.2 — Solicitar aprovação por alçada (COSO Framework)
export async function solicitarAprovacaoPorAlcada(
  companyId: number,
  entryId: number,
  valor: number,
  solicitanteId: number,
  solicitanteNome: string
): Promise<{ nivel: string; aprovacaoId: number | null }> {
  const db = await getDb();
  if (!db) return { nivel: "nenhum", aprovacaoId: null };

  // Regras de alçada (COSO Framework 2013)
  let nivel = "coordenador";
  if (valor > 5000) nivel = "diretoria";
  else if (valor > 500) nivel = "gerente";

  // Definir expiração: 48h
  const expiradoEm = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const { rows: aprovRows } = await dbExecute(db,
    `INSERT INTO financial_payment_approvals
     (company_id, entry_id, valor, nivel, status, solicitante_id, solicitante_nome, expirado_em)
     VALUES ($1,$2,$3,$4,'pendente',$5,$6,$7)
     RETURNING id`,
    [companyId, entryId, valor.toFixed(2), nivel, solicitanteId, solicitanteNome, expiradoEm]
  );
  const aprovacaoId = aprovRows[0]?.id ?? null;

  // Criar alerta
  await dbExecute(db,
    `INSERT INTO financial_revision_alerts
     (company_id, entry_id, tipo, nivel, titulo, descricao, valor_referencia, responsavel_nome)
     VALUES ($1,$2,'aprovacao_pendente','warning',$3,$4,$5,$6)`,
    [
      companyId, entryId,
      `Aprovação Pendente — Nível ${nivel}`,
      `Lançamento financeiro R$ ${valor.toFixed(2)} aguarda aprovação nível ${nivel}`,
      valor.toFixed(2),
      `Alçada: ${nivel}`,
    ]
  );

  return { nivel, aprovacaoId };
}

// 4.3 — Rollback financeiro ao cancelar origem
export async function rollbackFinanceiroPorOrigem(
  companyId: number,
  origemModulo: string,
  origemId: number,
  motivo: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const { rows: cancelRows } = await dbExecute(db,
    `UPDATE financial_entries
     SET status='cancelado', motivo_cancelamento=$1, updated_at=NOW()
     WHERE company_id=$2 AND origem_modulo=$3 AND origem_id=$4
       AND status NOT IN ('pago','recebido','cancelado')
     RETURNING id`,
    [motivo, companyId, origemModulo, origemId]
  );
  const affected = cancelRows.length;

  if (affected > 0) {
    console.log(`[FinancialBridge][rollback] ${origemModulo}#${origemId} → ${affected} entries cancelados`);
  }
  return affected;
}

// 4.4 — Sincronizar status de pagamento com módulo de origem
export async function sincronizarStatusPagamento(
  companyId: number,
  entryId: number,
  novoStatus: string,
  dataPagamento?: string,
  valorRealizado?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await dbExecute(db,
    `UPDATE financial_entries
     SET status=$1,
         data_pagamento=COALESCE($2, data_pagamento),
         valor_realizado=COALESCE($3, valor_realizado),
         updated_at=NOW()
     WHERE id=$4 AND company_id=$5`,
    [novoStatus, dataPagamento ?? null, valorRealizado ?? null, entryId, companyId]
  );

  // Atualizar financial_revenue se for receita
  await dbExecute(db,
    `UPDATE financial_revenue fr
     SET status=$1, data_recebimento=COALESCE($2, fr.data_recebimento), updated_at=NOW()
     FROM financial_entries fe
     WHERE fe.id=$3 AND fe.tipo='receita'
       AND fr.medicao_id = fe.origem_id
       AND fr.company_id=$4`,
    [novoStatus === "recebido" ? "recebido_total" : novoStatus, dataPagamento ?? null, entryId, companyId]
  );
}

// 4.6 — Gerar alertas de vencimento (executar diariamente)
// Fundamentação: Boa prática — alert 3/7/15 dias antes do vencimento
export async function gerarAlertasVencimento(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let gerados = 0;

  try {
    // Vencimentos próximos (até 7 dias)
    const { rows } = await dbExecute(db,
      `SELECT id, valor_previsto, data_vencimento, status, descricao, tipo
       FROM financial_entries
       WHERE company_id=$1
         AND status IN ('a_pagar','a_receber','previsto')
         AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
         AND id NOT IN (
           SELECT COALESCE(entry_id,0) FROM financial_revision_alerts
           WHERE company_id=$2 AND tipo='vencimento_proximo' AND resolvido=0
         )`,
      [companyId, companyId]
    );

    for (const r of rows) {
      const diasRestantes = Math.ceil((new Date(r.data_vencimento).getTime() - Date.now()) / 86400000);
      const nivel = diasRestantes <= 1 ? "critical" : diasRestantes <= 3 ? "warning" : "info";
      await dbExecute(db,
        `INSERT INTO financial_revision_alerts
         (company_id, entry_id, tipo, nivel, titulo, descricao, valor_referencia, data_referencia)
         VALUES ($1,$2,'vencimento_proximo',$3,$4,$5,$6,$7)`,
        [
          companyId, r.id, nivel,
          `Vencimento em ${diasRestantes} dia(s) — ${r.tipo === "despesa" ? "Conta a Pagar" : "Conta a Receber"}`,
          r.descricao ?? "Lançamento financeiro",
          r.valor_previsto, r.data_vencimento,
        ]
      );
      gerados++;
    }

    // Vencimentos atrasados
    const { rows: atrasRows } = await dbExecute(db,
      `SELECT id, valor_previsto, data_vencimento, status, descricao, tipo
       FROM financial_entries
       WHERE company_id=$1
         AND status IN ('a_pagar','a_receber')
         AND data_vencimento < CURRENT_DATE
         AND id NOT IN (
           SELECT COALESCE(entry_id,0) FROM financial_revision_alerts
           WHERE company_id=$2 AND tipo='vencimento_atrasado' AND resolvido=0
         )`,
      [companyId, companyId]
    );
    for (const r of atrasRows) {
      await dbExecute(db,
        `INSERT INTO financial_revision_alerts
         (company_id, entry_id, tipo, nivel, titulo, descricao, valor_referencia, data_referencia)
         VALUES ($1,$2,'vencimento_atrasado','critical',$3,$4,$5,$6)`,
        [
          companyId, r.id,
          `ATRASADO — ${r.tipo === "despesa" ? "Pagamento" : "Recebimento"} vencido`,
          r.descricao ?? "Lançamento financeiro em atraso",
          r.valor_previsto, r.data_vencimento,
        ]
      );
      gerados++;
    }
  } catch (e) {
    console.error("[FinancialBridge][alertas_vencimento]", e);
  }

  return gerados;
}

// ─────────────────────────────────────────────────────────────
// 2.13 — Compras (Ordens de Compra aprovadas → contas a pagar)
// Fundamentação: NBC TG 16 — estoques; accrual no recebimento
// ─────────────────────────────────────────────────────────────
export async function importComprasOrdensToFinancial(companyId: number, mesRef?: string): Promise<number> {
  // Rev. 1622 — DESATIVADO. A criação de financial_entries para OCs é responsabilidade
  // exclusiva de purchaseFinancialBridge.criarParcelasFinanceiras (event-driven, em
  // tempo real, com parcelas individuais e integração com purchase_accounts_payable).
  // Esta função criava registros redundantes com origem_modulo='compra_oc' que
  // duplicavam visualmente o Contas a Pagar. Mantida como no-op p/ retro-compat.
  console.log(`[FinancialBridge][compras_ordens] DISABLED (Rev.1622) company=${companyId} mes=${mesRef ?? mesComp()}`);
  return 0;

  // eslint-disable-next-line no-unreachable
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT co.id, co.numero_oc, co.total, co.subtotal, co.status, co.aprovacao_status,
              co.obra_id, co.fornecedor_nome, co.data_entrega_prevista, co.data_vencimento,
              co.forma_pagamento, co.condicao_pagamento, co.created_at,
              o.nome AS obra_nome
       FROM compras_ordens co
       LEFT JOIN obras o ON o.id = co.obra_id
       WHERE co.company_id = $1
         AND co.status NOT IN ('cancelada','recusada')
         AND TO_CHAR(COALESCE(co.data_entrega_prevista::date, co.created_at::date, NOW()), 'YYYY-MM') = $2
         AND COALESCE(co.total::numeric, 0) > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "compra_oc", r.id)) continue;
      const valor = parseFloat(r.total ?? r.subtotal ?? "0");
      if (valor <= 0) continue;
      const dataVenc = r.data_vencimento
        ? r.data_vencimento.toString().split("T")[0]
        : (r.data_entrega_prevista ? r.data_entrega_prevista.toString().split("T")[0] : targetMes + "-28");
      const statusFin = r.aprovacao_status === "aprovado" ? "pendente" : "previsto";
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome ?? null,
        contaNome: "Materiais / Compras",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        status: statusFin,
        origemModulo: "compra_oc",
        origemId: r.id,
        origemDescricao: `OC ${r.numero_oc} — ${r.fornecedor_nome ?? "Fornecedor"}`,
        descricao: `Ordem de Compra ${r.numero_oc}${r.fornecedor_nome ? " — " + r.fornecedor_nome : ""}`,
        formaPagamento: r.forma_pagamento ?? null,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][compras_ordens]", e);
  }

  await logImport(db, companyId, "compra_oc", targetMes, imported, erros);
  return imported;
}

// ─────────────────────────────────────────────────────────────
// 2.14 — RH/DP — Folha de Pagamento (lançamentos consolidados → CDO ou Folha)
// Fundamentação: CLT Arts. 457-462; NBC TG 33 — benefícios a empregados
// Roteamento automático (Rev. 3809):
//   - categoria_mo 'direto'         → MÃO DE OBRA DIRETA (conta 22, CDO, variavel)
//   - categoria_mo 'indireta_obra'  → MÃO DE OBRA INDIRETA (conta 21, CDO, variavel)
//   - categoria_mo 'escritorio_central' ou NULL → FOLHA DE PAGAMENTO (conta 506, fixo)
// ─────────────────────────────────────────────────────────────

/** Configuração de conta por categoria_mo */
const FOLHA_CATEGORIA_CONFIG: Record<string, { contaId: number; contaNome: string; natureza: "fixo" | "variavel" }> = {
  direto:             { contaId: 22,  contaNome: "MÃO DE OBRA DIRETA",    natureza: "variavel" },
  indireta_obra:      { contaId: 21,  contaNome: "MÃO DE OBRA INDIRETA",  natureza: "variavel" },
  escritorio_central: { contaId: 506, contaNome: "FOLHA DE PAGAMENTO",    natureza: "fixo"     },
  __default__:        { contaId: 506, contaNome: "FOLHA DE PAGAMENTO",    natureza: "fixo"     },
};

function _folhaCatConfig(cat: string | null | undefined) {
  return FOLHA_CATEGORIA_CONFIG[cat ?? "__default__"] ?? FOLHA_CATEGORIA_CONFIG.__default__;
}

export async function importFolhaRHToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    // ── PATH 1: folha_lancamentos + folha_itens (PDF importado via módulo RH) ──
    const { rows } = await dbExecute(db,
      `SELECT fl.id, fl."mesReferencia", fl."tipoLancamento", fl.status,
              fl."totalProventos", fl."totalDescontos", fl."totalLiquido", fl."totalFuncionarios"
       FROM folha_lancamentos fl
       WHERE fl."companyId" = $1
         AND fl."mesReferencia" = $2
         AND fl.status IN ('consolidado','validado','aprovado','importado')
         AND COALESCE(fl."totalProventos"::numeric, 0) > 0`,
      [companyId, targetMes]
    );

    for (const r of rows) {
      const lancId = r.id as number;
      const valorBruto = parseFloat(r.totalProventos ?? "0");
      if (valorBruto <= 0) continue;
      const tipoLanc = r.tipoLancamento ?? "";
      const descTipo = tipoLanc === "vale"   ? "Adiantamento/Vale Folha" :
                       tipoLanc === "ferias" ? "Férias — RH" :
                       tipoLanc === "decimo" ? "13° Salário — RH" : "Folha de Pagamento CLT";
      const entryStatus = r.status === "consolidado" ? "pendente" : "previsto";

      // Carregar folha_itens com categoria_mo e obra de cada funcionário
      const { rows: itens } = await dbExecute(db,
        `SELECT fi."totalProventos",
                fi."employeeId",
                COALESCE(jf.categoria_mo, 'escritorio_central') AS categoria_mo,
                COALESCE(moa."obraId", tr_obra."obraId")        AS obra_id,
                (SELECT o.nome FROM obras o
                 WHERE o.id = COALESCE(moa."obraId", tr_obra."obraId") LIMIT 1) AS obra_nome
         FROM folha_itens fi
         LEFT JOIN job_functions jf
           ON LOWER(TRIM(jf.nome)) = LOWER(TRIM(fi.funcao))
           AND jf."companyId" = fi."companyId"
         LEFT JOIN LATERAL (
           SELECT moa2."obraId" FROM manual_obra_assignments moa2
           WHERE moa2."employeeId" = fi."employeeId"
             AND moa2."mesReferencia" = $3
             AND moa2."companyId"    = $1
           ORDER BY moa2."createdAt" DESC LIMIT 1
         ) moa ON true
         LEFT JOIN LATERAL (
           SELECT tr."obraId" FROM time_records tr
           WHERE tr."employeeId"   = fi."employeeId"
             AND tr."mesReferencia" = $3
             AND tr."obraId"       IS NOT NULL
             AND tr."companyId"    = $1
           LIMIT 1
         ) tr_obra ON true
         WHERE fi."folhaLancamentoId" = $2
           AND fi."companyId" = $1`,
        [companyId, lancId, targetMes]
      );

      if (itens.length > 0) {
        // Agrupar por categoria_mo (3 grupos no máximo)
        const grupos: Record<string, {
          cat: string; total: number; cnt: number;
          obras: Record<number, number>; // obraId → count of employees
        }> = {};
        for (const item of itens) {
          const cat = (item.categoria_mo as string) || "escritorio_central";
          if (!grupos[cat]) grupos[cat] = { cat, total: 0, cnt: 0, obras: {} };
          grupos[cat].total += parseFloat(item.totalProventos ?? "0");
          grupos[cat].cnt++;
          const oId = item.obra_id ? Number(item.obra_id) : null;
          if (oId) grupos[cat].obras[oId] = (grupos[cat].obras[oId] ?? 0) + 1;
        }

        for (const [cat, grupo] of Object.entries(grupos)) {
          if (grupo.total <= 0) continue;
          const origemModulo = `folha_rh_${cat === "direto" ? "direto" : cat === "indireta_obra" ? "indireta" : "adm"}`;
          if (await entryExists(db, companyId, origemModulo, lancId)) continue;

          const cfg = _folhaCatConfig(cat);
          const isCDO = cat === "direto" || cat === "indireta_obra";

          // Obra primária = a mais frequente entre os funcionários do grupo
          const obraEntries = Object.entries(grupo.obras) as [string, number][];
          const primaryObraId = obraEntries.length === 0 ? null :
            obraEntries.sort((a, b) => b[1] - a[1])[0][0];
          const { rows: obraRows } = primaryObraId
            ? await dbExecute(db, `SELECT nome FROM obras WHERE id=$1 LIMIT 1`, [Number(primaryObraId)])
            : { rows: [] };
          const primaryObraNome = obraRows[0]?.nome ?? null;

          await insertEntry(db, {
            companyId,
            contaId:   cfg.contaId,
            contaNome: cat === "escritorio_central" || cat === "__default__" ? descTipo : cfg.contaNome,
            obraId:    isCDO ? (primaryObraId ? Number(primaryObraId) : null) : null,
            obraNome:  isCDO ? primaryObraNome : null,
            tipo:      "despesa",
            natureza:  cfg.natureza,
            valorPrevisto: grupo.total,
            dataCompetencia: targetMes + "-01",
            dataVencimento:  targetMes + "-05",
            status: entryStatus,
            origemModulo,
            origemId: lancId,
            origemDescricao: `${descTipo} — ${grupo.cnt} func. [${cat}]`,
            descricao: `${descTipo} ${targetMes} (${cfg.contaNome})`,
          });
          imported++;
        }
      } else {
        // Fallback: sem folha_itens → lançamento agregado em conta 506 (comportamento legado)
        if (await entryExists(db, companyId, "folha_rh", lancId)) continue;
        const nFunc = r.totalFuncionarios ?? 0;
        await insertEntry(db, {
          companyId,
          contaNome: descTipo,
          tipo: "despesa",
          natureza: "fixo",
          valorPrevisto: valorBruto,
          dataCompetencia: targetMes + "-01",
          dataVencimento:  targetMes + "-05",
          status: entryStatus,
          origemModulo: "folha_rh",
          origemId: lancId,
          origemDescricao: `${descTipo} — ${nFunc} funcionário(s)`,
          descricao: `${descTipo} ${targetMes}`,
        });
        imported++;
      }
    }

    // ── PATH 2: tabela payroll (contracheques individuais do engine) ──
    const { rows: rows2 } = await dbExecute(db,
      `SELECT p.id, p."mesReferencia", p."tipoFolha", p."employeeId",
              p."salarioBruto", p."totalProventos", p.inss, p.irrf, p.fgts,
              COALESCE(jf.categoria_mo, 'escritorio_central') AS categoria_mo,
              COALESCE(moa."obraId", tr_obra."obraId")        AS obra_id
       FROM payroll p
       LEFT JOIN employees e
         ON e.id = p."employeeId" AND e."companyId" = p."companyId"
       LEFT JOIN job_functions jf
         ON LOWER(TRIM(jf.nome)) = LOWER(TRIM(e.funcao))
         AND jf."companyId" = p."companyId"
       LEFT JOIN LATERAL (
         SELECT moa2."obraId" FROM manual_obra_assignments moa2
         WHERE moa2."employeeId" = p."employeeId"
           AND moa2."mesReferencia" = $2
           AND moa2."companyId"    = $1
         ORDER BY moa2."createdAt" DESC LIMIT 1
       ) moa ON true
       LEFT JOIN LATERAL (
         SELECT tr."obraId" FROM time_records tr
         WHERE tr."employeeId"   = p."employeeId"
           AND tr."mesReferencia" = $2
           AND tr."obraId"       IS NOT NULL
           AND tr."companyId"    = $1
         LIMIT 1
       ) tr_obra ON true
       WHERE p."companyId" = $1
         AND p."mesReferencia" = $2
         AND COALESCE(p."salarioBruto"::numeric, 0) > 0`,
      [companyId, targetMes]
    );

    // Agrupar por (tipoFolha, categoria_mo)
    const gruposPay: Record<string, {
      tipo: string; cat: string; total: number;
      fgts: number; inss: number; irrf: number; count: number;
      obras: Record<number, number>;
    }> = {};
    for (const r of rows2) {
      const tipo = r.tipoFolha ?? "mensal";
      const cat  = (r.categoria_mo as string) || "escritorio_central";
      const key  = `${tipo}|${cat}`;
      if (!gruposPay[key]) gruposPay[key] = { tipo, cat, total: 0, fgts: 0, inss: 0, irrf: 0, count: 0, obras: {} };
      gruposPay[key].total += parseFloat(r.salarioBruto ?? r.totalProventos ?? "0");
      gruposPay[key].fgts  += parseFloat(r.fgts ?? "0");
      gruposPay[key].inss  += parseFloat(r.inss ?? "0");
      gruposPay[key].irrf  += parseFloat(r.irrf ?? "0");
      gruposPay[key].count++;
      const oId = r.obra_id ? Number(r.obra_id) : null;
      if (oId) gruposPay[key].obras[oId] = (gruposPay[key].obras[oId] ?? 0) + 1;
    }

    for (const [, dados] of Object.entries(gruposPay)) {
      if (dados.total <= 0) continue;
      const origemModulo = `payroll_${dados.cat === "direto" ? "direto" : dados.cat === "indireta_obra" ? "indireta" : "adm"}`;
      // origemId sintético: hash de company+mes+tipo+categoria
      const catCode  = dados.cat === "direto" ? 1 : dados.cat === "indireta_obra" ? 2 : 0;
      const origemId = Math.abs(
        (companyId * 1000) + parseInt(targetMes.replace("-", "")) % 10000 + dados.tipo.length * 10 + catCode
      );
      if (await entryExists(db, companyId, origemModulo, origemId)) continue;

      const cfg   = _folhaCatConfig(dados.cat);
      const isCDO = dados.cat === "direto" || dados.cat === "indireta_obra";
      const obraEntries = Object.entries(dados.obras) as [string, number][];
      const primaryObraId = obraEntries.length === 0 ? null :
        Number(obraEntries.sort((a, b) => b[1] - a[1])[0][0]);

      await insertEntry(db, {
        companyId,
        contaId:   cfg.contaId,
        contaNome: cfg.contaNome,
        obraId:    isCDO ? primaryObraId : null,
        tipo: "despesa",
        natureza:  cfg.natureza,
        valorPrevisto: dados.total,
        dataCompetencia: targetMes + "-01",
        dataVencimento:  targetMes + "-05",
        status: "pendente",
        origemModulo,
        origemId,
        origemDescricao: `Folha ${dados.tipo} — ${dados.count} func. [${dados.cat}] — FGTS R$${dados.fgts.toFixed(2)}`,
        descricao: `Folha ${dados.tipo} ${targetMes} (${cfg.contaNome})`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][folha_rh]", e);
  }

  await logImport(db, companyId, "folha_rh", targetMes, imported, erros);
  return imported;
}

// ─────────────────────────────────────────────────────────────
// 3.4 — Planejamento Medições (medições aprovadas → receita de contrato)
// Fundamentação: IFRS 15 / NBC TG 47 — reconhecimento de receita por avanço físico
// ─────────────────────────────────────────────────────────────
export async function importPlanejamentoMedicoesToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pm.id, pm.numero, pm.competencia, pm.valor_previsto, pm.valor_medido,
              pm.percentual_medido, pm.status,
              pp.nome AS projeto_nome, pp.cliente, pp.valor_contrato, pp.obra_id,
              pp.company_id,
              o.nome AS obra_nome
       FROM planejamento_medicoes pm
       JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
       LEFT JOIN obras o ON o.id = pp.obra_id
       WHERE pp.company_id = $1
         AND pm.competencia = $2
         AND pm.status NOT IN ('cancelada','rejeitada')
         AND COALESCE(pm.valor_medido::numeric, pm.valor_previsto::numeric, 0) > 0`,
      [companyId, targetMes]
    );
    // rows extracted by dbExecute

    for (const r of rows) {
      const valorMedido = parseFloat(r.valor_medido ?? "0");
      const valorPrevisto = parseFloat(r.valor_previsto ?? "0");
      const valor = valorMedido > 0 ? valorMedido : valorPrevisto;
      if (valor <= 0) continue;

      const statusFin = r.status === "aprovada" || r.status === "faturada" ? "pendente" : "previsto";
      const statusRev = r.status === "faturada" ? "faturado" : "a_faturar";
      const pct = parseFloat(r.percentual_medido ?? "0");
      const dataVenc = targetMes + "-28";

      // ── 1. financial_entries (livro geral) ──────────────────────
      // Rev. 3162 — DESLIGADA a materialização automática da medição como
      // lançamento de receita (origem='planejamento_medicao', "Previsto") no
      // livro/Contas a Receber. O usuário NÃO quer que recebíveis caiam sozinhos
      // em Lançamentos; agora ele escolhe o que lançar pela tela "Recebíveis
      // Previstos" (financial.getRecebiveisPrevistos / transferirRecebiveisPrevistos).
      // Mantemos ABAIXO a escrita em financial_revenue (a FONTE da lista de
      // previstos), cujo dedup é próprio (por medicao_id) e independe do entry.
      // void statusFin/valor preservados p/ não quebrar tipos.
      void statusFin;

      // ── 2. financial_revenue (Contas a Receber) ──────────────────
      // Verifica se já existe pelo medicao_id para evitar duplicata
      const { rows: revExists } = await dbExecute(db,
        `SELECT id FROM financial_revenue WHERE company_id=$1 AND medicao_id=$2 LIMIT 1`,
        [companyId, r.id]
      );
      if (revExists.length === 0) {
        await dbExecute(db,
          `INSERT INTO financial_revenue
           (company_id, obra_id, obra_nome, cliente_nome,
            valor_contrato, medicao_id, medicao_numero, percentual_medicao,
            valor_medicao, valor_liquido_receber,
            data_vencimento, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
          [
            companyId,
            r.obra_id ?? null,
            r.obra_nome ?? r.projeto_nome ?? null,
            r.cliente ?? null,
            parseFloat(r.valor_contrato ?? "0"),
            r.id,
            r.numero ?? null,
            pct.toFixed(4),
            valor.toFixed(2),
            valor.toFixed(2),
            dataVenc,
            statusRev,
          ]
        );
      } else {
        // Atualizar status e valor se mudou
        await dbExecute(db,
          `UPDATE financial_revenue
           SET status=$1, valor_medicao=$2, valor_liquido_receber=$3, updated_at=NOW()
           WHERE company_id=$4 AND medicao_id=$5`,
          [statusRev, valor.toFixed(2), valor.toFixed(2), companyId, r.id]
        );
      }
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][planejamento_medicoes]", e);
  }

  await logImport(db, companyId, "planejamento_medicao", targetMes, imported, erros);
  return imported;
}

// 3.5 — financial_revenue histórico → financial_entries (receitas de obras cadastradas)
// Garante que qualquer receita criada manualmente apareça no Contas a Receber
export async function importFinancialRevenueToEntries(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let imported = 0;
  let erros = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT fr.id, fr.obra_id, fr.obra_nome, fr.cliente_nome, fr.valor_medicao,
              fr.valor_liquido_receber, fr.medicao_numero, fr.data_vencimento,
              fr.status, fr.created_at
       FROM financial_revenue fr
       WHERE fr.company_id = $1
         AND fr.status NOT IN ('cancelado','recebido_total')
         AND fr.valor_medicao > 0
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe
           WHERE fe.origem_modulo = 'revenue'
             AND fe.origem_id = fr.id
             AND fe.company_id = $2
         )
         -- Rev. 3013 — NÃO duplicar: se a medição já tem lançamento pelo lado
         -- 'planejamento_medicao' (livro/Contas a Receber), o "Faturamento de
         -- Obras" via financial_revenue seria a SEGUNDA cópia. Pula nesse caso.
         -- (medicao_id NULL = receita manual → segue normalmente, sem par.)
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe2
           WHERE fe2.company_id = fr.company_id
             AND fe2.origem_modulo = 'planejamento_medicao'
             AND fe2.origem_id = fr.medicao_id
             AND COALESCE(fe2.status, '') <> 'cancelado'
         )
       ORDER BY fr.created_at DESC
       LIMIT 500`,
      [companyId, companyId]
    );

    const statusMap: Record<string, string> = {
      a_faturar: "a_receber",
      faturado: "a_receber",
      a_receber: "a_receber",
      recebido_parcial: "recebido_parcial",
      recebido_total: "recebido",
      cancelado: "cancelado",
    };

    for (const r of rows) {
      const valor = parseFloat(r.valor_liquido_receber ?? r.valor_medicao ?? "0");
      if (valor <= 0) continue;
      // data_vencimento vem como string "YYYY-MM-DD" do banco; created_at como Date — usar mesComp() quando nulo
      const vencimento = r.data_vencimento
        ? String(r.data_vencimento).substring(0, 10)
        : mesComp() + "-30";
      const mesCompetencia = vencimento.substring(0, 7);
      const numInfo = r.medicao_numero ? ` #${r.medicao_numero}` : "";
      const clienteInfo = r.cliente_nome ? ` — ${r.cliente_nome}` : "";
      const entryStatus = statusMap[r.status] ?? "a_receber";

      await insertEntry(db, {
        companyId,
        obraId: r.obra_id ?? null,
        obraNome: r.obra_nome ?? null,
        contaNome: "Faturamento de Obras",
        tipo: "receita",
        natureza: "variavel",
        valorPrevisto: valor,
        dataCompetencia: mesCompetencia + "-01",
        dataVencimento: vencimento,
        status: entryStatus,
        origemModulo: "revenue",
        origemId: r.id,
        origemDescricao: `Medição${numInfo} — ${r.obra_nome ?? "Obra"}${clienteInfo}`,
        descricao: `Faturamento${numInfo}: ${r.obra_nome ?? "Obra"}`,
      });
      imported++;
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][financial_revenue]", e);
  }

  await logImport(db, companyId, "financial_revenue", mesRef ?? mesComp(), imported, erros);
  return imported;
}

// ─────────────────────────────────────────────────────────────
// MASTER: executar todos os imports de despesa
// ─────────────────────────────────────────────────────────────
export async function runAllDespesasImport(companyId: number, mesRef?: string) {
  const mes = mesRef ?? mesComp();
  const results = await Promise.allSettled([
    importTerceirosToFinancial(companyId, mes),
    importParceirosToFinancial(companyId, mes),
    importFrotasToFinancial(companyId, mes),
    importBeneficiosToFinancial(companyId, mes),
    importSeguroVidaToFinancial(companyId, mes),
    importAdiantamentosToFinancial(companyId, mes),
    importProLaboreToFinancial(companyId, mes),
    importPlanejamentoComprasToFinancial(companyId, mes),
    importAlmoxarifadoToFinancial(companyId, mes),
    importProcessosTrabalistasToFinancial(companyId, mes),
    gerarGuiasTributarias(companyId, mes),
    // NOVOS — Compras e RH/DP
    // Rev. 1622 — importComprasOrdensToFinancial REMOVIDO do pipeline.
    // OCs vão para Contas a Pagar via purchaseFinancialBridge.criarParcelasFinanceiras
    // (event-driven). Esta função gerava lançamentos duplicados com origem='compra_oc'.
    // importComprasOrdensToFinancial(companyId, mes),
    importFolhaRHToFinancial(companyId, mes),
  ]);

  const totals = results.map(r => r.status === "fulfilled" ? r.value : 0);
  const total = totals.reduce((a, b) => a + b, 0);
  console.log(`[FinancialBridge][despesas] company=${companyId} mes=${mes} total=${total}`);
  return total;
}

// ─────────────────────────────────────────────────────────────
// PREVISTO — distribui valor_contrato linearmente pelos meses
// do projeto (data_inicio → data_termino_contratual).
// Grava em financial_entries (livro geral) E financial_revenue
// (Contas a Receber) com status 'a_faturar'.
// Dedup entries: (company_id, origem_modulo, origem_id, data_competencia)
// Dedup revenue: (company_id, obra_nome, data_vencimento, observacoes='planejamento_previsto')
// ─────────────────────────────────────────────────────────────
export async function importPlanejamentoProjetosPrevistoToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let imported = 0;
  let erros = 0;

  try {
    // Diagnóstico: conta todos os registros sem filtro para detectar dados ausentes
    const { rows: diagRows } = await dbExecute(db,
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE valor_contrato IS NOT NULL AND valor_contrato::numeric > 0) AS com_valor,
              COUNT(*) FILTER (WHERE data_inicio IS NOT NULL) AS com_inicio,
              COUNT(*) FILTER (WHERE data_termino_contratual IS NOT NULL) AS com_termino,
              COUNT(*) FILTER (WHERE status NOT IN ('cancelado','encerrado','Cancelado','Encerrado')) AS status_ok
       FROM planejamento_projetos
       WHERE company_id = $1`,
      [companyId]
    );
    const diag = diagRows[0] ?? {};
    if (Number(diag.total) > 0) {
      console.log(`[FinancialBridge][previsto][diag] company=${companyId} total=${diag.total} com_valor=${diag.com_valor} com_inicio=${diag.com_inicio} com_termino=${diag.com_termino} status_ok=${diag.status_ok}`);
    }

    const { rows: projetos } = await dbExecute(db,
      `SELECT pp.id, pp.obra_id, pp.nome, pp.cliente,
              pp.valor_contrato, pp.data_inicio, pp.data_termino_contratual, pp.status,
              o.nome AS obra_nome_ref
       FROM planejamento_projetos pp
       LEFT JOIN obras o ON o.id = pp.obra_id
       WHERE pp.company_id = $1
         AND pp.valor_contrato IS NOT NULL
         AND pp.valor_contrato::numeric > 0
         AND pp.data_inicio IS NOT NULL
         AND pp.data_termino_contratual IS NOT NULL
         AND pp.status NOT IN ('cancelado', 'encerrado', 'Cancelado', 'Encerrado')`,
      [companyId]
    );

    console.log(`[FinancialBridge][previsto] company=${companyId} projetos=${projetos.length}`);

    for (const proj of projetos) {
      const valorContrato = parseFloat(proj.valor_contrato ?? "0");
      if (valorContrato <= 0) continue;

      // Normalise dates — banco retorna string "YYYY-MM-DD" ou Date
      const inicioStr = String(proj.data_inicio).substring(0, 10);
      const terminoStr = String(proj.data_termino_contratual).substring(0, 10);
      const [iniY, iniM] = inicioStr.split("-").map(Number);
      const [terY, terM] = terminoStr.split("-").map(Number);

      if (!iniY || !iniM || !terY || !terM) continue;

      // Constrói lista de meses (YYYY-MM) entre início e término
      const meses: string[] = [];
      let y = iniY, m = iniM;
      while (y < terY || (y === terY && m <= terM)) {
        meses.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) { m = 1; y++; }
        if (meses.length > 120) break; // proteção: máx 10 anos
      }
      if (meses.length === 0) continue;

      const valorMensal = Math.round((valorContrato / meses.length) * 100) / 100;
      const nomeProjeto = proj.obra_nome_ref ?? proj.nome;
      const pct = (1 / meses.length);

      for (const mes of meses) {
        const dataCompetencia = mes + "-01";
        const dataVencimento = mes + "-30";

        // ── 1. financial_entries (livro geral) ──────────────────
        // Rev. 3162 — DESLIGADA a materialização automática da previsão de
        // projeto como lançamento de receita ("Previsto") no livro. Recebível
        // só entra no livro por decisão manual (tela "Recebíveis Previstos").
        // A escrita em financial_revenue (FONTE da lista) permanece ABAIXO,
        // com dedup próprio (observacoes='planejamento_previsto').

        // ── 2. financial_revenue (Contas a Receber) ─────────────
        // Dedup: obra_nome + data_vencimento + observacoes='planejamento_previsto'
        // Não cria se já existe uma medição real para o mesmo mês/obra
        const { rows: revExisting } = await dbExecute(db,
          `SELECT id FROM financial_revenue
           WHERE company_id=$1
             AND COALESCE(obra_id::text,'') = $2
             AND data_vencimento=$3
             AND observacoes='planejamento_previsto'
           LIMIT 1`,
          [companyId, String(proj.obra_id ?? ""), dataVencimento]
        );
        if (revExisting.length === 0) {
          // Verificar se já existe medição real para não sobrepor
          const { rows: realMedicao } = await dbExecute(db,
            `SELECT id FROM financial_revenue
             WHERE company_id=$1 AND obra_id=$2 AND medicao_id IS NOT NULL
               AND data_vencimento BETWEEN $3 AND $4
             LIMIT 1`,
            [companyId, proj.obra_id ?? null, mes + "-01", mes + "-31"]
          );
          if (realMedicao.length === 0) {
            await dbExecute(db,
              `INSERT INTO financial_revenue
               (company_id, obra_id, obra_nome, cliente_nome,
                valor_contrato, medicao_numero, percentual_medicao,
                valor_medicao, valor_liquido_receber,
                data_vencimento, status, observacoes, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
              [
                companyId,
                proj.obra_id ?? null,
                nomeProjeto,
                proj.cliente ?? null,
                valorContrato.toFixed(2),
                null,
                pct.toFixed(4),
                valorMensal.toFixed(2),
                valorMensal.toFixed(2),
                dataVencimento,
                "a_faturar",
                "planejamento_previsto",
              ]
            );
          }
        }
      }
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][planejamento_projeto_previsto]", e);
  }

  await logImport(db, companyId, "planejamento_projeto_previsto", mesRef ?? mesComp(), imported, erros);
  return imported;
}

// ── NOVO: obras ativas → Contas a Receber (financial_revenue) ──────────────
export async function importObrasToFinancialRevenue(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let imported = 0;
  let erros = 0;

  try {
    // Busca todas obras ativas (com ou sem valor de contrato)
    // Tenta pegar valorContrato da obra OU do planejamento_projetos vinculado
    const cid = Number(companyId);
    const { rows: obras } = await dbExecute(db,
      `SELECT o.id, o.nome, o.cliente,
              COALESCE(o."valorContrato"::numeric, pp.valor_contrato::numeric) AS valor_contrato,
              o."dataInicio" AS data_inicio,
              o."dataPrevisaoFim" AS data_previsao_fim,
              o.status
       FROM obras o
       LEFT JOIN planejamento_projetos pp ON pp.obra_id = o.id AND pp.company_id = $1
       WHERE o."companyId" = $2
         AND o."deletedAt" IS NULL
         AND o."isActive" = 1
         AND o."dataInicio" IS NOT NULL
         AND o."dataPrevisaoFim" IS NOT NULL
         AND o.status NOT IN ('Concluída','Concluida','Cancelada','Cancelado','Encerrada','Encerrado','Inativa','Inativo')`,
      [cid, cid]
    );

    console.log(`[FinancialBridge][obras_previsto] company=${companyId} obras=${obras.length}`);

    for (const obra of obras) {
      const valorContrato = parseFloat(obra.valor_contrato ?? "0");

      const inicioStr = String(obra.data_inicio).substring(0, 10);
      const terminoStr = String(obra.data_previsao_fim).substring(0, 10);
      const [iniY, iniM] = inicioStr.split("-").map(Number);
      const [terY, terM] = terminoStr.split("-").map(Number);
      if (!iniY || !iniM || !terY || !terM) continue;

      // Lista de meses de vigência do contrato
      const meses: string[] = [];
      let y = iniY, m = iniM;
      while (y < terY || (y === terY && m <= terM)) {
        meses.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) { m = 1; y++; }
        if (meses.length > 120) break;
      }
      if (meses.length === 0) continue;

      const valorMensal = valorContrato > 0
        ? Math.round((valorContrato / meses.length) * 100) / 100
        : 0;

      // Só criar entradas na Contas a Receber se houver valor real de contrato
      if (valorMensal <= 0) continue;

      for (const mes of meses) {
        const dataCompetencia = mes + "-01";
        const dataVencimento = mes + "-28";

        // ── 1. financial_revenue (aparece em Contas a Receber) ──────────
        const { rows: revExist } = await dbExecute(db,
          `SELECT id FROM financial_revenue
           WHERE company_id=$1 AND obra_id=$2 AND observacoes='obra_previsto'
             AND data_vencimento=$3
           LIMIT 1`,
          [companyId, obra.id, dataVencimento]
        );
        if (revExist.length === 0) {
          await dbExecute(db,
            `INSERT INTO financial_revenue
             (company_id, obra_id, obra_nome, cliente_nome,
              valor_contrato, valor_medicao, data_vencimento,
              status, observacoes, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'a_faturar','obra_previsto',NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [companyId, obra.id, obra.nome, obra.cliente ?? null,
             valorContrato.toFixed(2),
             valorMensal.toFixed(2), dataVencimento]
          );
          imported++;
        }

        // ── 2. financial_entries (fluxo de caixa projetado) ──────────────
        // Rev. 3162 — DESLIGADA a materialização automática da previsão de obra
        // (origem='obra_previsto', "A Receber") no livro. Recebível só entra no
        // livro por decisão manual (tela "Recebíveis Previstos"). A escrita em
        // financial_revenue (FONTE da lista, observacoes='obra_previsto') segue
        // ACIMA com dedup próprio.
        void dataCompetencia;
      }
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][obras_previsto]", e);
  }

  await logImport(db, companyId, "obra_previsto", mesRef ?? mesComp(), imported, erros);
  return imported;
}

// Importa atividades do cronograma (planejamento_atividades) como despesas previstas no fluxo de caixa
export async function importAtividadesCronogramaToFinancial(
  companyId: number,
  mesRef?: string,
  opts?: { projetoId?: number }
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let imported = 0;
  let erros = 0;

  try {
    // Busca projetos vinculados a obras desta empresa (incluindo projetos com valor_contrato=0)
    // Inclui fallback de valor via orcamento vinculado (por orcamento_id ou por obra_id)
    const projetoFilter = opts?.projetoId ? `AND pp.id = ${Number(opts.projetoId)}` : "";
    const { rows: projetos } = await dbExecute(db,
      `SELECT pp.id AS projeto_id, pp.obra_id, pp.nome,
              pp.valor_contrato::numeric AS valor_contrato,
              pp.orcamento_id,
              o.nome AS obra_nome,
              COALESCE(
                NULLIF(pp.valor_contrato::numeric, 0),
                orc_direto.valor_negociado::numeric,
                orc_direto."totalVenda"::numeric,
                orc_direto."totalCusto"::numeric,
                orc_obra.valor_negociado::numeric,
                orc_obra."totalVenda"::numeric,
                orc_obra."totalCusto"::numeric,
                0
              ) AS valor_base
       FROM planejamento_projetos pp
       JOIN obras o ON o.id = pp.obra_id
       LEFT JOIN orcamentos orc_direto ON orc_direto.id = pp.orcamento_id
                                      AND orc_direto.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT valor_negociado, "totalVenda", "totalCusto"
         FROM orcamentos
         WHERE "obraId" = pp.obra_id AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1
       ) orc_obra ON true
       WHERE pp.company_id = $1
         AND o."deletedAt" IS NULL
         ${projetoFilter}`,
      [companyId]
    );

    console.log(`[FinancialBridge][cronograma] company=${companyId} projetos encontrados=${projetos.length}`);

    for (const proj of projetos) {
      const valorContrato = parseFloat(proj.valor_contrato ?? "0");
      const valorBase = parseFloat(proj.valor_base ?? "0");
      const semValorBase = valorBase === 0;

      if (semValorBase) {
        console.warn(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} (${proj.nome}) sem valor_contrato nem orçamento — criando entradas com valor R$0 (placeholder)`);
      }

      // Pega a revisão mais recente aprovada; se não houver, usa a mais recente qualquer
      const { rows: revs } = await dbExecute(db,
        `SELECT id FROM planejamento_revisoes
         WHERE projeto_id = $1
         ORDER BY (CASE WHEN status = 'aprovada' THEN 0 ELSE 1 END), numero DESC
         LIMIT 1`,
        [proj.projeto_id]
      );
      if (revs.length === 0) {
        console.log(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} sem revisão, pulando`);
        continue;
      }
      const revisaoId = revs[0].id;
      console.log(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} valorContrato=${valorContrato} valorBase=${valorBase} revisao=${revisaoId}`);

      // Busca atividades desta revisão (ignora grupos e desabilitados)
      // Quando valor_base > 0: usa peso_financeiro * valor_base
      // Quando valor_base = 0: usa quantidade_planejada diretamente (BRL)
      // Quando ambos = 0: cria entradas placeholder com valor 0 (para mostrar o cronograma no financeiro)
      const { rows: atividades } = await dbExecute(db,
        `SELECT id, nome, eap_codigo, data_inicio, data_fim,
                peso_financeiro::numeric AS peso,
                quantidade_planejada::numeric AS quantidade_planejada,
                is_indireta
         FROM planejamento_atividades
         WHERE revisao_id = $1
           AND is_grupo = false
           AND disabled = false
           AND data_inicio IS NOT NULL
           AND data_fim IS NOT NULL`,
        [revisaoId]
      );

      console.log(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} atividades=${atividades.length}`);

      if (atividades.length === 0) continue;

      // Pré-busca todas as entradas existentes deste projeto (1 query em vez de N queries)
      // Rev. 2923 — `data_competencia` é coluna DATE; o driver pg a devolve como
      // objeto Date → `String(date)` = "Sun Jun 01 2026…" (NÃO "2026-06-01"), então a
      // chave de dedup `origem_id|data` NUNCA casava com a esperada e TODA reimportação
      // reinseria tudo (duplicação até 18×). Forçamos a data como texto YYYY-MM-DD no SQL.
      const { rows: existentes } = await dbExecute(db,
        `SELECT origem_id::integer, TO_CHAR(data_competencia,'YYYY-MM-DD') AS data_competencia, valor_previsto FROM financial_entries
         WHERE company_id=$1 AND origem_modulo='cronograma_atividade' AND obra_id=$2`,
        [companyId, proj.obra_id]
      );
      const existMap = new Map<string, number>();
      for (const e of existentes) {
        existMap.set(`${e.origem_id}|${String(e.data_competencia).substring(0, 10)}`, parseFloat(e.valor_previsto ?? "0"));
      }

      // Calcula todas as entradas esperadas em memória
      type EntradaCronograma = {
        companyId: number; obraId: number; obraNome: string; contaNome: string;
        valorMensal: number; dataComp: string; dataVenc: string;
        origemId: number; origemDesc: string; descricao: string;
      };
      const toInsert: EntradaCronograma[] = [];
      const toUpdate: EntradaCronograma[] = [];
      // Rastreia todos os pares (origemId|dataComp) esperados — usados para limpar órfãos
      const expectedKeys = new Set<string>();

      for (const at of atividades) {
        const peso = parseFloat(at.peso ?? "0");
        const quantidadePlanejada = parseFloat(at.quantidade_planejada ?? "0");

        let valorTotalAt: number;
        if (valorBase > 0 && peso > 0) {
          valorTotalAt = Math.round((peso / 100) * valorBase * 100) / 100;
        } else if (quantidadePlanejada > 0) {
          valorTotalAt = Math.round(quantidadePlanejada * 100) / 100;
        } else {
          valorTotalAt = 0;
        }

        const inicioStr = String(at.data_inicio).substring(0, 10);
        const fimStr = String(at.data_fim).substring(0, 10);
        const [iniY, iniM] = inicioStr.split("-").map(Number);
        const [terY, terM] = fimStr.split("-").map(Number);
        if (!iniY || !iniM || !terY || !terM) continue;

        const meses: string[] = [];
        let y = iniY, m = iniM;
        while (y < terY || (y === terY && m <= terM)) {
          meses.push(`${y}-${String(m).padStart(2, "0")}`);
          m++; if (m > 12) { m = 1; y++; }
          if (meses.length > 60) break;
        }
        if (meses.length === 0) continue;

        const valorMensal = Math.round((valorTotalAt / meses.length) * 100) / 100;
        const contaNome = at.is_indireta ? "Custos Indiretos" : "Custos Diretos de Obra";
        const origemDesc = `${at.eap_codigo ?? ""} - ${at.nome}`.trim().replace(/^- /, "");

        for (const mes of meses) {
          const dataComp = mes + "-01";
          const dataVenc = mes + "-28";
          const descricao = semValorBase
            ? `Cronograma (sem valor): ${origemDesc} (${mes}) — configure valor_contrato no projeto`
            : `Cronograma: ${origemDesc} (${mes})`;

          const key = `${at.id}|${dataComp}`;
          expectedKeys.add(key);

          if (!existMap.has(key)) {
            toInsert.push({ companyId, obraId: proj.obra_id, obraNome: proj.obra_nome,
              contaNome, valorMensal, dataComp, dataVenc,
              origemId: at.id, origemDesc, descricao });
          } else {
            const existVal = existMap.get(key)!;
            if (Math.abs(existVal - valorMensal) > 0.005) {
              toUpdate.push({ companyId, obraId: proj.obra_id, obraNome: proj.obra_nome,
                contaNome, valorMensal, dataComp, dataVenc,
                origemId: at.id, origemDesc, descricao });
            }
          }
        }
      }

      // ─── LIMPEZA DE ÓRFÃOS (REGRA DE OURO) ───────────────────────────────
      // Quando o cronograma é revisado (atividades removidas, datas encurtadas),
      // as entradas financeiras que não correspondem mais ao cronograma atual
      // devem ser removidas para manter o caixa sempre sincronizado.
      const orphanKeys = [...existMap.keys()].filter(k => !expectedKeys.has(k));
      if (orphanKeys.length > 0) {
        const pgPool2 = (db as any).$client;
        for (const orphanKey of orphanKeys) {
          const [origemIdStr, dataCompStr] = orphanKey.split("|");
          const origemIdNum = parseInt(origemIdStr);
          if (!origemIdNum || !dataCompStr) continue;
          if (pgPool2 && typeof pgPool2.query === "function") {
            await pgPool2.query(
              `DELETE FROM financial_entries
               WHERE company_id=$1 AND origem_modulo='cronograma_atividade'
                 AND origem_id=$2 AND data_competencia=$3 AND status='previsto'`,
              [companyId, origemIdNum, dataCompStr]
            );
          } else {
            await dbExecute(db,
              `DELETE FROM financial_entries
               WHERE company_id=$1 AND origem_modulo='cronograma_atividade'
                 AND origem_id=$2 AND data_competencia=$3 AND status='previsto'`,
              [companyId, origemIdNum, dataCompStr]
            );
          }
        }
        console.log(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} órfãos removidos=${orphanKeys.length}`);
      }

      // Bulk INSERT via pg pool nativo (evita stack overflow do Drizzle SQL builder)
      // db.$client é o Pool do node-postgres
      const pgPool = (db as any).$client;
      const BATCH = 200;

      if (pgPool && typeof pgPool.query === "function") {
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH);
          if (batch.length === 0) continue;
          const vals = batch.map((_, idx) => {
            const b = idx * 15;
            return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},NOW(),NOW())`;
          }).join(",");
          const params = batch.flatMap(e => [
            e.companyId, e.obraId, e.obraNome, e.contaNome, "despesa", "variavel",
            e.valorMensal, null, e.dataComp, e.dataVenc, "previsto",
            "cronograma_atividade", e.origemId, e.origemDesc, e.descricao
          ]);
          await pgPool.query(
            `INSERT INTO financial_entries
             (company_id,obra_id,obra_nome,conta_nome,tipo,natureza,
              valor_previsto,valor_realizado,data_competencia,data_vencimento,
              status,origem_modulo,origem_id,origem_descricao,descricao,created_at,updated_at)
             VALUES ${vals} ON CONFLICT DO NOTHING`,
            params
          );
          imported += batch.length;
        }

        // UPDATE para entradas com valor mudado
        for (const e of toUpdate) {
          await pgPool.query(
            `UPDATE financial_entries
             SET valor_previsto=$1, obra_nome=$2, conta_nome=$3, descricao=$4, updated_at=NOW()
             WHERE company_id=$5 AND origem_modulo='cronograma_atividade' AND origem_id=$6 AND data_competencia=$7`,
            [e.valorMensal, e.obraNome, e.contaNome, e.descricao, e.companyId, e.origemId, e.dataComp]
          );
          imported++;
        }
      } else {
        // Fallback: individual inserts se o pool não estiver acessível
        for (const e of toInsert) {
          await dbExecute(db,
            `INSERT INTO financial_entries
             (company_id,obra_id,obra_nome,conta_nome,tipo,natureza,
              valor_previsto,valor_realizado,data_competencia,data_vencimento,
              status,origem_modulo,origem_id,origem_descricao,descricao,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [e.companyId, e.obraId, e.obraNome, e.contaNome, "despesa", "variavel",
             e.valorMensal, null, e.dataComp, e.dataVenc, "previsto",
             "cronograma_atividade", e.origemId, e.origemDesc, e.descricao]
          );
          imported++;
        }
        for (const e of toUpdate) {
          await dbExecute(db,
            `UPDATE financial_entries
             SET valor_previsto=$1, obra_nome=$2, conta_nome=$3, descricao=$4, updated_at=NOW()
             WHERE company_id=$5 AND origem_modulo='cronograma_atividade' AND origem_id=$6 AND data_competencia=$7`,
            [e.valorMensal, e.obraNome, e.contaNome, e.descricao, e.companyId, e.origemId, e.dataComp]
          );
          imported++;
        }
      }

      console.log(`[FinancialBridge][cronograma] projeto=${proj.projeto_id} inseridos=${toInsert.length} atualizados=${toUpdate.length}`);
    }
  } catch (e) {
    erros++;
    console.error("[FinancialBridge][cronograma_atividade]", e);
  }

  await logImport(db, companyId, "cronograma_atividade", mesRef ?? mesComp(), imported, erros);
  return imported;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.6 — Import ALL months of planejamento_medicoes as receita prevista
// Creates financial_entries for EVERY future month in the measurement schedule
// ─────────────────────────────────────────────────────────────────────────────
export async function importAllMedicoesPrevistaToFinancial(companyId: number): Promise<number> {
  // Rev. 3162 — NO-OP (corpo removido). Esta função materializava TODAS as
  // medições previstas como lançamentos de receita ("Previsto",
  // origem='planejamento_medicao') no livro — em todos os meses, no startup
  // (_core/index.ts) e no sync manual. O usuário NÃO quer recebíveis caindo
  // sozinhos em Lançamentos; agora ele escolhe o que lançar pela tela
  // "Recebíveis Previstos". A FONTE da lista (financial_revenue) continua sendo
  // populada por importAllMedicoesPrevistaToRevenue. Mantida exportada
  // (chamadores no startup/endpoint) como no-op idempotente que retorna 0.
  void companyId;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.7 — Todos os meses de planejamento_medicoes → financial_revenue (Contas a Receber)
// Garante que cada parcela do cronograma financeiro apareça no Contas a Receber
// ─────────────────────────────────────────────────────────────────────────────
export async function importAllMedicoesPrevistaToRevenue(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let imported = 0;

  try {
    const { rows } = await dbExecute(db,
      `SELECT pm.id, pm.numero, pm.competencia,
              pm.valor_previsto, pm.valor_medido,
              pm.percentual_previsto, pm.status,
              pp.nome  AS projeto_nome,
              pp.cliente,
              pp.valor_contrato,
              pp.obra_id,
              o.nome   AS obra_nome
       FROM planejamento_medicoes pm
       JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
       LEFT JOIN obras o ON o.id = pp.obra_id
       WHERE pp.company_id = $1
         AND pm.status NOT IN ('cancelada','rejeitada')
         AND COALESCE(pm.valor_previsto::numeric, pm.valor_medido::numeric, 0) > 0
       ORDER BY pm.competencia`,
      [companyId]
    );

    for (const r of rows) {
      const valorMedido   = parseFloat(r.valor_medido   ?? "0");
      const valorPrevisto = parseFloat(r.valor_previsto ?? "0");
      const valor = valorMedido > 0 ? valorMedido : valorPrevisto;
      if (valor <= 0) continue;

      const mes        = String(r.competencia).substring(0, 7);
      const dataVenc   = mes + "-28";
      const statusRev  = r.status === "faturada"   ? "faturado"
                       : r.status === "aprovada"   ? "a_receber"
                       : r.status === "confirmado" ? "recebido_total"
                       : "a_faturar";
      const pct        = parseFloat(r.percentual_previsto ?? "0");
      const obraNome   = r.obra_nome ?? r.projeto_nome ?? null;

      // Checar se já existe pelo medicao_id
      const { rows: existing } = await dbExecute(db,
        `SELECT id FROM financial_revenue WHERE company_id=$1 AND medicao_id=$2 LIMIT 1`,
        [companyId, r.id]
      );

      if (existing.length === 0) {
        const vrIns = statusRev === "recebido_total" ? valor.toFixed(2) : null;
        await dbExecute(db,
          `INSERT INTO financial_revenue
           (company_id, obra_id, obra_nome, cliente_nome,
            valor_contrato, medicao_id, medicao_numero, percentual_medicao,
            valor_medicao, valor_liquido_receber, valor_recebido,
            data_vencimento, status, observacoes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cronograma_financeiro',NOW(),NOW())`,
          [
            companyId,
            r.obra_id ?? null,
            obraNome,
            r.cliente ?? null,
            parseFloat(r.valor_contrato ?? "0").toFixed(2),
            r.id,
            r.numero ?? null,
            pct.toFixed(4),
            valor.toFixed(2),
            valor.toFixed(2),
            vrIns,
            dataVenc,
            statusRev,
          ]
        );
        imported++;
      } else {
        // Atualizar valor e status se mudou.
        // Para 'confirmado' também salva valor_recebido = valor_medido da PM.
        await dbExecute(db,
          `UPDATE financial_revenue
           SET status=$1, valor_medicao=$2, valor_liquido_receber=$3,
               valor_recebido = CASE WHEN $6 = 'recebido_total' THEN $2 ELSE valor_recebido END,
               updated_at=NOW()
           WHERE company_id=$4 AND medicao_id=$5
             AND status NOT IN ('recebido_total','cancelado')`,
          [statusRev, valor.toFixed(2), valor.toFixed(2), companyId, r.id, statusRev]
        );
      }
    }

    console.log(`[FinancialBridge][cronograma→receita] company=${companyId} importados=${imported}`);
  } catch (e) {
    console.error("[FinancialBridge][cronograma→receita]", e);
  }

  return imported;
}

// MASTER: executar todos os imports de receita + previsões + cronograma
export async function runAllReceitasImport(companyId: number, mesRef?: string) {
  const mes = mesRef ?? mesComp();
  const results = await Promise.allSettled([
    importMedicoesObraToFinancial(companyId, mes),
    importMedicoesPJToFinancial(companyId, mes),
    importTerceiroCobravelToFinancial(companyId, mes),
    importPlanejamentoMedicoesToFinancial(companyId, mes),
    importPlanejamentoProjetosPrevistoToFinancial(companyId, mes),
    importObrasToFinancialRevenue(companyId, mes),
    importAllMedicoesPrevistaToRevenue(companyId),
    // Rev. 3161 — DESLIGADA a materialização automática financial_revenue →
    // financial_entries. Antes, excluir uma receita prevista no Financeiro era
    // inócuo: o próximo sync recriava o lançamento (origem='revenue'), então a
    // exclusão "não colava". Agora a transferência é MANUAL e consciente, via a
    // tela "Recebíveis Previstos" (financial.transferirRecebiveisPrevistos).
    // Mantemos ACIMA os importers que POPULAM financial_revenue — a lista de
    // previstos e o aviso automático (alerta "receita_prevista") seguem vivos.
    // importFinancialRevenueToEntries(companyId, mes),
    importAtividadesCronogramaToFinancial(companyId, mes),
  ]);

  const totals = results.map(r => r.status === "fulfilled" ? r.value : 0);
  const total = totals.reduce((a, b) => a + b, 0);
  console.log(`[FinancialBridge][receitas] company=${companyId} mes=${mes} total=${total}`);
  return total;
}
