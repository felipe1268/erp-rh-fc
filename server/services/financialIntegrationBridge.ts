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

async function insertEntry(db: any, data: {
  companyId: number;
  obraId?: number | null;
  obraNome?: string | null;
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
  const { rows } = await dbExecute(db,
    `INSERT INTO financial_entries
     (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
      valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
      status, origem_modulo, origem_id, origem_descricao, descricao, forma_pagamento,
      created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      data.companyId,
      data.obraId ?? null,
      data.obraNome ?? null,
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
      `SELECT tm.id, tm.valor_medido, tm.data_referencia, tm.status, tm.periodo, tm.obra_id,
              COALESCE(et.nome_fantasia, et.razao_social) AS nome_empresa,
              tc.descricao AS tipo_servico, tc.valor_total AS valor_contrato,
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
      const valor = parseFloat(r.valor_medido ?? "0");
      if (valor <= 0) continue;
      const dataVenc = r.data_referencia
        ? r.data_referencia.toString().substring(0, 7) + "-25"
        : targetMes + "-25";
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id,
        obraNome: r.obra_nome,
        contaNome: "Serviços de Terceiros",
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.status === "paga" ? valor : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: dataVenc,
        dataPagamento: r.status === "paga" ? dataVenc : null,
        status: r.status === "paga" ? "pago" : "a_pagar",
        origemModulo: "terceiro_medicao",
        origemId: r.id,
        origemDescricao: `Medição #${r.id} — ${r.nome_empresa} — ${r.tipo_servico ?? "Serviço"} — ${r.periodo}`,
        descricao: `Terceiro: ${r.nome_empresa} — ${r.periodo}`,
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
        contaNome: "Subempreiteiros",
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
            contaNome: "Vale Refeição / Alimentação",
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
            contaNome: "Vale Alimentação",
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
// 2.14 — RH/DP — Folha de Pagamento (lançamentos consolidados → despesa pessoal)
// Fundamentação: CLT Arts. 457-462; NBC TG 33 — benefícios a empregados
// ─────────────────────────────────────────────────────────────
export async function importFolhaRHToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const targetMes = mesRef ?? mesComp();
  let imported = 0;
  let erros = 0;

  try {
    // Lançamentos consolidados da folha (summary por período)
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
    // rows extracted by dbExecute

    for (const r of rows) {
      if (await entryExists(db, companyId, "folha_rh", r.id)) continue;
      const valorBruto = parseFloat(r.totalProventos ?? r["totalProventos"] ?? "0");
      if (valorBruto <= 0) continue;
      const tipoLanc = r.tipoLancamento ?? r["tipoLancamento"] ?? "";
      const tipo = tipoLanc === "vale" ? "Adiantamento/Vale Folha" :
                   tipoLanc === "ferias" ? "Férias — RH" :
                   tipoLanc === "decimo" ? "13° Salário — RH" : "Folha de Pagamento CLT";
      const nFunc = r.totalFuncionarios ?? r["totalFuncionarios"] ?? 0;
      await insertEntry(db, {
        companyId,
        contaNome: tipo,
        tipo: "despesa",
        natureza: "fixo",
        valorPrevisto: valorBruto,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-05",
        status: r.status === "consolidado" ? "pendente" : "previsto",
        origemModulo: "folha_rh",
        origemId: r.id,
        origemDescricao: `${tipo} — ${nFunc} funcionário(s)`,
        descricao: `${tipo} ${targetMes}`,
      });
      imported++;
    }

    // Também importa registros individuais da payroll (funcionários com contracheque completo)
    const { rows: rows2 } = await dbExecute(db,
      `SELECT p.id, p."mesReferencia", p."tipoFolha",
              p."salarioBruto", p."totalProventos", p.inss, p.irrf, p.fgts
       FROM payroll p
       WHERE p."companyId" = $1
         AND p."mesReferencia" = $2
         AND COALESCE(p."salarioBruto"::numeric, 0) > 0`,
      [companyId, targetMes]
    );

    // Agrupa payroll por tipo_folha para não gerar um lançamento por funcionário
    const totaisPorTipo: Record<string, { total: number; fgts: number; inss: number; irrf: number; count: number }> = {};
    for (const r of rows2) {
      const tipo = r.tipoFolha ?? r["tipoFolha"] ?? "mensal";
      if (!totaisPorTipo[tipo]) totaisPorTipo[tipo] = { total: 0, fgts: 0, inss: 0, irrf: 0, count: 0 };
      totaisPorTipo[tipo].total += parseFloat(r.salarioBruto ?? r["salarioBruto"] ?? r.totalProventos ?? r["totalProventos"] ?? "0");
      totaisPorTipo[tipo].fgts += parseFloat(r.fgts ?? "0");
      totaisPorTipo[tipo].inss += parseFloat(r.inss ?? "0");
      totaisPorTipo[tipo].irrf += parseFloat(r.irrf ?? "0");
      totaisPorTipo[tipo].count++;
    }

    for (const [tipo, dados] of Object.entries(totaisPorTipo)) {
      if (dados.total <= 0) continue;
      // Usa id sintético = hash de company+mes+tipo para deduplicação
      const origemId = Math.abs((companyId * 1000) + parseInt(targetMes.replace("-", "")) % 10000 + tipo.length);
      if (await entryExists(db, companyId, "payroll_agregado", origemId)) continue;
      await insertEntry(db, {
        companyId,
        contaNome: `Folha ${tipo} — RH/DP`,
        tipo: "despesa",
        natureza: "fixo",
        valorPrevisto: dados.total,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-05",
        status: "pendente",
        origemModulo: "payroll_agregado",
        origemId,
        origemDescricao: `Folha ${tipo} — ${dados.count} funcionário(s) — FGTS R$${dados.fgts.toFixed(2)}`,
        descricao: `Folha ${tipo} ${targetMes} (${dados.count} func.)`,
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
      if (await entryExists(db, companyId, "planejamento_medicao", r.id)) continue;
      const valorMedido = parseFloat(r.valor_medido ?? "0");
      const valorPrevisto = parseFloat(r.valor_previsto ?? "0");
      const valor = valorMedido > 0 ? valorMedido : valorPrevisto;
      if (valor <= 0) continue;
      const statusFin = r.status === "aprovada" || r.status === "faturada" ? "pendente" : "previsto";
      await insertEntry(db, {
        companyId,
        obraId: r.obra_id ?? null,
        obraNome: r.obra_nome ?? r.projeto_nome ?? null,
        contaNome: "Receita de Medições / Contratos",
        tipo: "receita",
        natureza: "variavel",
        valorPrevisto: valor,
        valorRealizado: r.status === "faturada" ? valor : null,
        dataCompetencia: targetMes + "-01",
        dataVencimento: targetMes + "-28",
        status: statusFin,
        origemModulo: "planejamento_medicao",
        origemId: r.id,
        origemDescricao: `Medição #${r.numero} — ${r.projeto_nome}${r.cliente ? " (" + r.cliente + ")" : ""}`,
        descricao: `Medição ${r.numero} — ${r.projeto_nome} (${(parseFloat(r.percentual_medido ?? "0") * 100).toFixed(1)}%)`,
      });
      imported++;
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
    importComprasOrdensToFinancial(companyId, mes),
    importFolhaRHToFinancial(companyId, mes),
  ]);

  const totals = results.map(r => r.status === "fulfilled" ? r.value : 0);
  const total = totals.reduce((a, b) => a + b, 0);
  console.log(`[FinancialBridge][despesas] company=${companyId} mes=${mes} total=${total}`);
  return total;
}

// MASTER: executar todos os imports de receita
export async function runAllReceitasImport(companyId: number, mesRef?: string) {
  const mes = mesRef ?? mesComp();
  const results = await Promise.allSettled([
    importMedicoesObraToFinancial(companyId, mes),
    importMedicoesPJToFinancial(companyId, mes),
    importTerceiroCobravelToFinancial(companyId, mes),
    importPlanejamentoMedicoesToFinancial(companyId, mes),
    // Importar receitas cadastradas manualmente em Receitas de Obras → Contas a Receber
    importFinancialRevenueToEntries(companyId, mes),
  ]);

  const totals = results.map(r => r.status === "fulfilled" ? r.value : 0);
  const total = totals.reduce((a, b) => a + b, 0);
  console.log(`[FinancialBridge][receitas] company=${companyId} mes=${mes} total=${total}`);
  return total;
}
