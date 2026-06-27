import { getDb } from "../db";

// ============================================================
// KPIs FINANCEIROS — FC Engenharia
// Fase 5: Inteligência Financeira
//
// Fundamentação bibliográfica:
// - Brigham & Houston, "Fundamentals of Financial Management", 16ª ed.
// - Assaf Neto, "Finanças Corporativas e Valor", 8ª ed. (Atlas)
// - CPC 03(R2) — Demonstração dos Fluxos de Caixa
// - NBC TG 03(R3) — DFC (IASB — IAS 7)
// - FIPECAFI — Manual de Contabilidade Societária
// - Legislação: Lei 6.404/76, RIR/2018
// ============================================================

function r(v: any): any[] { return (v as any)?.rows ?? (v as any) ?? []; }
function n(v: any): number { return parseFloat(v ?? "0") || 0; }

// IMPORTANTE: o `.execute(stringSQL, [params])` do drizzle node-postgres IGNORA o
// array de parâmetros posicionais — os placeholders $1/$2/$3 chegam ao Postgres sem
// bind e a query falha ("there is no parameter $1"). Para queries com parâmetros
// posicionais usamos o pool pg subjacente (`$client.query`), que faz o bind correto.
async function q(db: any, text: string, params: any[] = []): Promise<{ rows: any[] }> {
  return await db.$client.query(text, params);
}

function mesComp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface FinancialKpis {
  // Liquidez (Brigham & Houston ch. 13)
  caixaLivre: number;              // FCL = FCO − CAPEX
  saldoCaixaAtual: number;         // Saldo bancário total
  liquidezCorrente: number;        // AC / PC (ideal > 1.5)
  capitalGiroLiquido: number;      // AC − PC (Working Capital)

  // Eficiência operacional (Assaf Neto)
  dso: number;                     // DSO = (CR / Receita) × 30 dias
  dpo: number;                     // DPO = (CP / Compras) × 30 dias
  burnRate: number;                // Burn Rate mensal (despesas fixas)
  prazoMedioRecebimento: number;   // = DSO em dias
  prazoMedioPagamento: number;     // = DPO em dias

  // Endividamento (CPC 03)
  indiceEndividamento: number;     // Passivo Total / Ativo Total
  coberturaJuros: number;          // EBIT / Despesas Financeiras

  // Resultado
  receitaBruta: number;            // Total receitas previstas no mês
  receitaRealizada: number;        // Total receitas recebidas
  despesaTotal: number;            // Total despesas previstas no mês
  despesaRealizada: number;        // Total despesas pagas
  resultadoBruto: number;          // Receita − Despesa (lucro/prejuízo)
  margemBruta: number;             // ResultadoBruto / ReceitaBruta (%)
  ebitda: number;                  // Receita − Custos Operacionais (sem juros/deprec.)

  // Por obra
  margemPorObra: MargemObra[];

  // Fluxo de caixa projetado 90 dias
  fluxoCaixaProjetado: FluxoDia[];

  // Inadimplência
  totalInadimplente: number;       // Vencidos a receber
  totalAtrasadoPagar: number;      // Vencidos a pagar
  diasAtrasoMedioPagar: number;

  // Tributos
  tributosMes: number;             // Total guias tributárias do mês

  // Metadados
  periodo: string;
  calculadoEm: string;
}

export interface MargemObra {
  obraId: number;
  obraNome: string;
  receita: number;
  despesa: number;
  margem: number;
  margemPct: number;
}

export interface FluxoDia {
  data: string;
  entradas: number;
  saidas: number;
  saldoAcumulado: number;
}

export async function calcularKpis(
  companyId: number,
  periodo?: string
): Promise<FinancialKpis> {
  const db = await getDb();
  const mes = periodo ?? mesComp();
  const hoje = new Date().toISOString().split("T")[0];

  // 1. Receitas do mês
  const recRes = await q(db!,
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS bruta,
       COALESCE(SUM(CASE WHEN status IN ('recebido','pago') THEN valor_realizado ELSE 0 END), 0) AS realizada
     FROM financial_entries
     WHERE company_id=$1 AND tipo='receita'
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
    [companyId, mes]
  );
  const rec = r(recRes)[0] ?? {};
  const receitaBruta = n(rec.bruta);
  const receitaRealizada = n(rec.realizada);

  // 2. Despesas do mês
  const despRes = await q(db!,
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS total,
       COALESCE(SUM(CASE WHEN status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS realizada
     FROM financial_entries
     WHERE company_id=$1 AND tipo='despesa'
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
    [companyId, mes]
  );
  const desp = r(despRes)[0] ?? {};
  const despesaTotal = n(desp.total);
  const despesaRealizada = n(desp.realizada);

  // 3. Saldo bancário atual
  const saldoRes = await q(db!,
    `SELECT COALESCE(SUM(fob.valor), 0) AS saldo
     FROM financial_opening_balances fob
     JOIN company_bank_accounts cba ON cba.id = fob.conta_bancaria_id
     WHERE fob.company_id=$1 AND cba.ativo=1 AND cba."deletedAt" IS NULL`,
    [companyId]
  );
  const saldoCaixaAtual = n(r(saldoRes)[0]?.saldo);

  // 4. A receber total (contas a receber)
  const arRes = await q(db!,
    `SELECT COALESCE(SUM(valor_previsto), 0) AS total
     FROM financial_entries
     WHERE company_id=$1 AND tipo='receita' AND status IN ('a_receber','previsto')`,
    [companyId]
  );
  const contasReceber = n(r(arRes)[0]?.total);

  // 5. A pagar total (contas a pagar)
  const apRes = await q(db!,
    `SELECT COALESCE(SUM(valor_previsto), 0) AS total
     FROM financial_entries
     WHERE company_id=$1 AND tipo='despesa' AND status IN ('a_pagar','previsto')`,
    [companyId]
  );
  const contasPagar = n(r(apRes)[0]?.total);

  // 6. DSO — Days Sales Outstanding (Brigham & Houston, Formula 13.3)
  // DSO = Contas a Receber / (Receita Diária Média) = CR / (Receita / 30)
  const receitaDiaria = receitaBruta / 30;
  const dso = receitaDiaria > 0 ? contasReceber / receitaDiaria : 0;

  // 7. DPO — Days Payables Outstanding
  // DPO = Contas a Pagar / (Compras / 30)
  const comprasRes = await q(db!,
    `SELECT COALESCE(SUM(valor_previsto), 0) AS total
     FROM financial_entries
     WHERE company_id=$1 AND tipo='despesa'
       AND origem_modulo IN ('compras','terceiro_medicao','pagamento_parceiro')
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
    [companyId, mes]
  );
  const comprasMes = n(r(comprasRes)[0]?.total);
  const comprasDiaria = comprasMes / 30;
  const dpo = comprasDiaria > 0 ? contasPagar / comprasDiaria : 0;

  // 8. Burn Rate (despesas fixas mensais — custos independentes de receita)
  const burnRes = await q(db!,
    `SELECT COALESCE(SUM(valor_previsto), 0) AS burn
     FROM financial_entries
     WHERE company_id=$1 AND tipo='despesa' AND natureza='fixo'
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2
       AND status NOT IN ('cancelado')`,
    [companyId, mes]
  );
  const burnRate = n(r(burnRes)[0]?.burn);

  // 9. Capital de Giro Líquido = Ativo Corrente − Passivo Corrente
  // AC = Caixa + A Receber; PC = A Pagar
  const ativoCorrente = saldoCaixaAtual + contasReceber;
  const passivoCorrente = contasPagar;
  const capitalGiroLiquido = ativoCorrente - passivoCorrente;
  const liquidezCorrente = passivoCorrente > 0 ? ativoCorrente / passivoCorrente : 999;

  // 10. Caixa Livre (FCL = FCO − CAPEX)
  // FCO = Receita Realizada − Despesa Realizada
  const fco = receitaRealizada - despesaRealizada;
  // CAPEX: investimentos em veículos/equipamentos no mês
  const capexRes = await q(db!,
    `SELECT COALESCE(SUM(valor_previsto), 0) AS capex
     FROM financial_entries
     WHERE company_id=$1 AND tipo='despesa'
       AND (conta_nome ILIKE '%veículo%' OR conta_nome ILIKE '%equipamento%' OR origem_modulo='frota_manutencao')
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
    [companyId, mes]
  );
  const capex = n(r(capexRes)[0]?.capex);
  const caixaLivre = fco - capex;

  // 11. Resultado e Margem Bruta
  const resultadoBruto = receitaRealizada - despesaRealizada;
  const margemBruta = receitaBruta > 0 ? (resultadoBruto / receitaBruta) * 100 : 0;
  const ebitda = resultadoBruto; // Simplificado — sem depreciação

  // 12. Margem por Obra
  const obraRes = await q(db!,
    `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
            COALESCE(SUM(CASE WHEN tipo='receita' AND status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS receita,
            COALESCE(SUM(CASE WHEN tipo='despesa' AND status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS despesa
     FROM financial_entries
     WHERE company_id=$1
       AND TO_CHAR(data_competencia,'YYYY-MM')=$2
       AND obra_id IS NOT NULL
     GROUP BY obra_id, obra_nome
     ORDER BY receita DESC
     LIMIT 20`,
    [companyId, mes]
  );
  const margemPorObra: MargemObra[] = r(obraRes).map((row: any) => {
    const rec = n(row.receita);
    const desp = n(row.despesa);
    const margem = rec - desp;
    return {
      obraId: row.obraId,
      obraNome: row.obraNome ?? "Obra sem nome",
      receita: rec,
      despesa: desp,
      margem,
      margemPct: rec > 0 ? (margem / rec) * 100 : 0,
    };
  });

  // 13. Inadimplência
  const inadimRes = await q(db!,
    `SELECT
       COALESCE(SUM(CASE WHEN tipo='receita' AND status='a_receber' AND data_vencimento < CURRENT_DATE THEN valor_previsto ELSE 0 END), 0) AS inadimplente,
       COALESCE(SUM(CASE WHEN tipo='despesa' AND status='a_pagar' AND data_vencimento < CURRENT_DATE THEN valor_previsto ELSE 0 END), 0) AS atrasado_pagar,
       COALESCE(AVG(CASE WHEN tipo='despesa' AND status='a_pagar' AND data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE NULL END), 0) AS dias_atraso
     FROM financial_entries
     WHERE company_id=$1 AND status NOT IN ('cancelado')`,
    [companyId]
  );
  const inadim = r(inadimRes)[0] ?? {};
  const totalInadimplente = n(inadim.inadimplente);
  const totalAtrasadoPagar = n(inadim.atrasado_pagar);
  const diasAtrasoMedioPagar = n(inadim.dias_atraso);

  // 14. Tributos do mês
  const tributosRes = await q(db!,
    `SELECT COALESCE(SUM(valor_total), 0) AS total
     FROM financial_tax_obligations
     WHERE company_id=$1 AND mes_competencia=$2`,
    [companyId, mes]
  );
  const tributosMes = n(r(tributosRes)[0]?.total);

  // 15. Índice de Endividamento = Passivo Total / Ativo Total
  const passivoTotal = contasPagar + tributosMes;
  const ativoTotal = saldoCaixaAtual + contasReceber;
  const indiceEndividamento = ativoTotal > 0 ? passivoTotal / ativoTotal : 0;

  // 16. Cobertura de Juros (simplificado: EBIT / tributos)
  const coberturaJuros = tributosMes > 0 ? ebitda / tributosMes : 999;

  // 17. Projeção de fluxo de caixa — próximos 90 dias
  const fluxoRes = await q(db!,
    `SELECT data_vencimento::text AS data,
            COALESCE(SUM(CASE WHEN tipo='receita' THEN valor_previsto ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor_previsto ELSE 0 END), 0) AS saidas
     FROM financial_entries
     WHERE company_id=$1
       AND status IN ('a_pagar','a_receber','previsto')
       AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
     GROUP BY data_vencimento
     ORDER BY data_vencimento`,
    [companyId]
  );
  let saldoAcumulado = saldoCaixaAtual;
  const fluxoCaixaProjetado: FluxoDia[] = r(fluxoRes).map((row: any) => {
    const entradas = n(row.entradas);
    const saidas = n(row.saidas);
    saldoAcumulado = saldoAcumulado + entradas - saidas;
    return { data: row.data, entradas, saidas, saldoAcumulado };
  });

  const kpis: FinancialKpis = {
    caixaLivre,
    saldoCaixaAtual,
    liquidezCorrente: Math.round(liquidezCorrente * 100) / 100,
    capitalGiroLiquido,
    dso: Math.round(dso * 10) / 10,
    dpo: Math.round(dpo * 10) / 10,
    burnRate,
    prazoMedioRecebimento: Math.round(dso),
    prazoMedioPagamento: Math.round(dpo),
    indiceEndividamento: Math.round(indiceEndividamento * 100) / 100,
    coberturaJuros: Math.round(coberturaJuros * 10) / 10,
    receitaBruta,
    receitaRealizada,
    despesaTotal,
    despesaRealizada,
    resultadoBruto,
    margemBruta: Math.round(margemBruta * 10) / 10,
    ebitda,
    margemPorObra,
    fluxoCaixaProjetado,
    totalInadimplente,
    totalAtrasadoPagar,
    diasAtrasoMedioPagar: Math.round(diasAtrasoMedioPagar),
    tributosMes,
    periodo: mes,
    calculadoEm: new Date().toISOString(),
  };

  // Salvar no cache
  try {
    await q(db!,
      `INSERT INTO financial_kpi_cache (company_id, periodo, tipo_periodo, kpi_json, calculado_em)
       VALUES ($1,$2,'mensal',$3,NOW())
       ON CONFLICT (company_id, periodo) DO UPDATE SET kpi_json=EXCLUDED.kpi_json, calculado_em=NOW()`,
      [companyId, mes, JSON.stringify(kpis)]
    );
  } catch {}

  return kpis;
}

// DRE Automático (Lei 6.404/76 art. 187 + NBC TG 26)
// Resolve o intervalo [mesIni, mesFim] (formato 'YYYY-MM') a partir do período + tipo.
// mensal: o próprio mês. trimestral: o trimestre que contém o mês.
// semestral: o semestre que contém o mês (1º=Jan-Jun, 2º=Jul-Dez). anual: ano inteiro.
function dreRange(
  periodo: string,
  tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual",
): [string, string] {
  if (tipoPeriodo === "anual") {
    const ano = (periodo || "").slice(0, 4);
    return [`${ano}-01`, `${ano}-12`];
  }
  const [ano, mesStr] = (periodo || "").split("-");
  const mes = parseInt(mesStr || "1", 10) || 1;
  if (tipoPeriodo === "trimestral") {
    const ini = Math.floor((mes - 1) / 3) * 3 + 1;
    const fim = ini + 2;
    return [`${ano}-${String(ini).padStart(2, "0")}`, `${ano}-${String(fim).padStart(2, "0")}`];
  }
  if (tipoPeriodo === "semestral") {
    const ini = mes <= 6 ? 1 : 7;
    const fim = ini + 5;
    return [`${ano}-${String(ini).padStart(2, "0")}`, `${ano}-${String(fim).padStart(2, "0")}`];
  }
  const mm = String(mes).padStart(2, "0");
  return [`${ano}-${mm}`, `${ano}-${mm}`];
}

// Origens de lançamento que compõem cada bucket do DRE. Ficam em UM lugar só
// (módulo) p/ que o cálculo (calcularDRE) e o detalhamento clicável
// (calcularDRELinhaDetalhe) usem EXATAMENTE a mesma classificação — o total da
// linha sempre fecha com a soma dos itens do drill-down.
const DRE_ORIGEM_OBRA = "('cronograma_atividade','compras','compra_oc','almoxarifado_saida')";
const DRE_ORIGEM_FIN = "('despesa_financeira','juros','tarifa_bancaria','iof')";

export type DRELinhaKey =
  | "receitaBruta"
  | "receitasFinanceiras"
  | "custosObra"
  | "impostos"
  | "despesasFinanceiras"
  | "despesasFixas"
  | "despesasVariaveis";

// Predicado SQL de CADA linha detalhável do DRE. Pressupõe que a query exponha
// os aliases `origem` = LOWER(COALESCE(origem_modulo,'')) e
// `conta` = LOWER(COALESCE(conta_nome,'')) — exatamente como a CTE `e` faz.
// FONTE ÚNICA: calcularDRE usa estes mesmos predicados nos seus FILTER(...).
function dreLinhaPredicate(linha: DRELinhaKey): string {
  switch (linha) {
    case "receitaBruta":
      return `tipo='receita' AND origem NOT IN ('aplicacao_financeira','rendimento_financeiro') AND conta NOT LIKE '%juros%' AND conta NOT LIKE '%rendiment%'`;
    case "receitasFinanceiras":
      return `tipo='receita' AND (origem IN ('aplicacao_financeira','rendimento_financeiro') OR conta LIKE '%juros%' OR conta LIKE '%rendiment%')`;
    case "custosObra":
      return `tipo='despesa' AND origem IN ${DRE_ORIGEM_OBRA}`;
    case "impostos":
      return `tipo='despesa' AND origem='guia_tributaria'`;
    case "despesasFinanceiras":
      return `tipo='despesa' AND (origem IN ${DRE_ORIGEM_FIN} OR conta LIKE '%juros%' OR conta LIKE '%tarifa banc%' OR conta LIKE '%iof%')`;
    case "despesasFixas":
      return `tipo='despesa' AND natureza='fixo' AND origem NOT IN ${DRE_ORIGEM_OBRA} AND origem NOT IN ${DRE_ORIGEM_FIN} AND origem <> 'guia_tributaria' AND conta NOT LIKE '%juros%' AND conta NOT LIKE '%tarifa banc%' AND conta NOT LIKE '%iof%'`;
    case "despesasVariaveis":
      return `tipo='despesa' AND COALESCE(natureza,'') <> 'fixo' AND origem NOT IN ${DRE_ORIGEM_OBRA} AND origem NOT IN ${DRE_ORIGEM_FIN} AND origem <> 'guia_tributaria' AND conta NOT LIKE '%juros%' AND conta NOT LIKE '%tarifa banc%' AND conta NOT LIKE '%iof%'`;
  }
}

// DRE no padrão CPC (gerencial) calculada a partir dos lançamentos financeiros.
// Classificação dos lançamentos (financial_entries, status != cancelado, tipo != transferencia):
//  - Receita Bruta: tipo='receita' (exceto receitas financeiras).
//  - Custos Diretos das Obras: despesa com origem de obra (cronograma_atividade/compras/compra_oc/almoxarifado_saida).
//  - Despesas Fixas: demais despesas com `natureza='fixo'` (exceto obra/impostos/financeiras).
//  - Despesas Variáveis: TODAS as demais despesas operacionais (natureza 'variavel', nula ou inesperada) —
//    bucket RESIDUAL p/ não dropar silenciosamente lançamentos sem `natureza` (exceto obra/impostos/financeiras).
//  - Receitas/Despesas Financeiras: marcadas por origem/conta (juros, tarifa, IOF, rendimento).
//  - Impostos sobre o resultado: lançamentos `guia_tributaria` + obrigações em financial_tax_obligations.
export async function calcularDRE(
  companyId: number,
  periodo: string,
  tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual" = "mensal",
) {
  const db = await getDb();
  const [mesIni, mesFim] = dreRange(periodo, tipoPeriodo);

  const res = await q(db!,
    `WITH e AS (
       SELECT tipo, natureza,
              LOWER(COALESCE(origem_modulo,'')) AS origem,
              LOWER(COALESCE(conta_nome,'')) AS conta,
              COALESCE(valor_realizado, 0)::numeric AS v
       FROM financial_entries
       WHERE company_id=$1
         AND status NOT IN ('cancelado','estornado')
         AND tipo <> 'transferencia'
         AND data_competencia IS NOT NULL
         AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $2 AND $3
     )
     SELECT
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("receitaBruta")}),0) AS receita_bruta,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("receitasFinanceiras")}),0) AS receitas_financeiras,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("custosObra")}),0) AS custos_obra,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("impostos")}),0) AS impostos_lanc,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("despesasFinanceiras")}),0) AS despesas_financeiras,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("despesasFixas")}),0) AS despesas_fixas,
       COALESCE(SUM(v) FILTER (WHERE ${dreLinhaPredicate("despesasVariaveis")}),0) AS despesas_variaveis
     FROM e`,
    [companyId, mesIni, mesFim]
  );
  const agg = r(res)[0] ?? {};

  // Tributos sobre o resultado (obrigações) no intervalo
  const tributosRes = await q(db!,
    `SELECT COALESCE(SUM(valor_total),0) AS total
     FROM financial_tax_obligations
     WHERE company_id=$1 AND mes_competencia BETWEEN $2 AND $3`,
    [companyId, mesIni, mesFim]
  );
  const totalTributos = n(r(tributosRes)[0]?.total);

  const receitaBruta = n(agg.receita_bruta);
  const deducoes = 0;
  const receitaLiquida = receitaBruta - deducoes;
  const custosObra = n(agg.custos_obra);
  const lucroBruto = receitaLiquida - custosObra;
  const despesasFixas = n(agg.despesas_fixas);
  const despesasVariaveis = n(agg.despesas_variaveis);
  const ebitda = lucroBruto - despesasFixas - despesasVariaveis;
  const receitasFinanceiras = n(agg.receitas_financeiras);
  const despesasFinanceiras = n(agg.despesas_financeiras);
  const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras;
  const lair = ebitda + resultadoFinanceiro;
  const impostos = n(agg.impostos_lanc) + totalTributos;
  const lucroLiquido = lair - impostos;
  const pct = (parte: number) => (receitaLiquida > 0 ? (parte / receitaLiquida) * 100 : 0);

  return {
    periodo,
    tipoPeriodo,
    mesIni,
    mesFim,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custosObra,
    lucroBruto,
    margemBruta: pct(lucroBruto),
    despesasFixas,
    despesasVariaveis,
    ebitda,
    margemEbitda: pct(ebitda),
    receitasFinanceiras,
    despesasFinanceiras,
    resultadoFinanceiro,
    lair,
    impostos,
    lucroLiquido,
    margemLiquida: pct(lucroLiquido),
    calculadoEm: new Date().toISOString(),
  };
}

// Rótulos legíveis dos tributos apurados (financial_tax_obligations.tipo) para o
// detalhamento da linha "Impostos sobre o Resultado".
const TRIBUTO_LABELS: Record<string, string> = {
  das_simples: "DAS (Simples Nacional)",
  darf_irpj: "DARF — IRPJ",
  darf_csll: "DARF — CSLL",
  darf_pis: "DARF — PIS",
  darf_cofins: "DARF — COFINS",
  gps_inss: "GPS — INSS",
  guia_fgts: "Guia FGTS",
  iss: "ISS",
  icms: "ICMS",
};

// Detalhamento (drill-down) de UMA linha do DRE: devolve os lançamentos que a
// compõem, o agrupamento por categoria (conta) e o total — que SEMPRE fecha com
// o valor exibido na linha, pois reusa o mesmo predicado de calcularDRE.
// `itens` é limitado p/ não estourar o payload; `total`/`porConta` são exatos
// (somados no banco sobre TODAS as linhas, sem o limite).
export async function calcularDRELinhaDetalhe(
  companyId: number,
  periodo: string,
  tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual",
  linha: DRELinhaKey,
) {
  const db = await getDb();
  const [mesIni, mesFim] = dreRange(periodo, tipoPeriodo);
  const pred = dreLinhaPredicate(linha);
  const ITENS_LIMITE = 1000;

  // CTE base: mesmas regras-mãe de calcularDRE + aliases origem/conta p/ o predicado.
  const baseCte = `
    WITH e AS (
      SELECT id, data_competencia, descricao, origem_descricao, obra_nome,
             fornecedor_nome, cliente_nome, status,
             COALESCE(NULLIF(conta_nome,''),'(Sem categoria)') AS conta_label,
             LOWER(COALESCE(origem_modulo,'')) AS origem,
             LOWER(COALESCE(conta_nome,'')) AS conta,
             tipo, natureza,
             COALESCE(valor_realizado, 0)::numeric AS v
      FROM financial_entries
      WHERE company_id=$1
        AND status NOT IN ('cancelado','estornado')
        AND tipo <> 'transferencia'
        AND data_competencia IS NOT NULL
        AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $2 AND $3
    )`;

  const grpRes = await q(db!,
    `${baseCte}
     SELECT conta_label AS conta, COUNT(*)::int AS qtd, COALESCE(SUM(v),0) AS total
     FROM e WHERE ${pred}
     GROUP BY conta_label
     ORDER BY SUM(v) DESC`,
    [companyId, mesIni, mesFim]
  );
  const porConta = r(grpRes).map((row: any) => ({
    conta: row.conta as string,
    qtd: Number(row.qtd) || 0,
    total: n(row.total),
  }));

  const itensRes = await q(db!,
    `${baseCte}
     SELECT id, data_competencia AS data, descricao, origem_descricao, obra_nome,
            fornecedor_nome, cliente_nome, status, conta_label AS conta, origem, v AS valor
     FROM e WHERE ${pred}
     ORDER BY v DESC, id DESC
     LIMIT ${ITENS_LIMITE}`,
    [companyId, mesIni, mesFim]
  );
  const itens = r(itensRes).map((row: any) => ({
    id: Number(row.id),
    data: row.data as string,
    descricao: (row.descricao || row.origem_descricao || "—") as string,
    conta: row.conta as string,
    origem: (row.origem || "") as string,
    contraparte: (row.fornecedor_nome || row.cliente_nome || null) as string | null,
    obraNome: (row.obra_nome || null) as string | null,
    status: (row.status || "") as string,
    valor: n(row.valor),
    fonte: "lancamento" as const,
  }));

  let total = porConta.reduce((s, c) => s + c.total, 0);
  let qtdTotal = porConta.reduce((s, c) => s + c.qtd, 0);

  // "Impostos" tem 2 fontes (espelhando calcularDRE): lançamentos guia_tributaria
  // (já no predicado) + obrigações apuradas em financial_tax_obligations.
  if (linha === "impostos") {
    const tribRes = await q(db!,
      `SELECT id, tipo, mes_competencia, COALESCE(valor_total,0) AS valor, data_vencimento, status
       FROM financial_tax_obligations
       WHERE company_id=$1 AND mes_competencia BETWEEN $2 AND $3
       ORDER BY valor_total DESC`,
      [companyId, mesIni, mesFim]
    );
    const tribs = r(tribRes);
    let tribTotal = 0;
    const grpTribMap = new Map<string, { conta: string; qtd: number; total: number }>();
    for (const t of tribs) {
      const valor = n(t.valor);
      tribTotal += valor;
      const label = TRIBUTO_LABELS[t.tipo] || `Tributo (${t.tipo})`;
      itens.push({
        id: Number(t.id),
        data: (t.data_vencimento || `${t.mes_competencia}-01`) as string,
        descricao: `${label} · competência ${t.mes_competencia}`,
        conta: "Obrigações tributárias apuradas",
        origem: "guia_tributaria_apurada",
        contraparte: null,
        obraNome: null,
        status: (t.status || "") as string,
        valor,
        fonte: "lancamento",
      } as any);
      const g = grpTribMap.get(label) || { conta: `Apuração — ${label}`, qtd: 0, total: 0 };
      g.qtd += 1;
      g.total += valor;
      grpTribMap.set(label, g);
    }
    for (const g of grpTribMap.values()) porConta.push(g);
    porConta.sort((a, b) => b.total - a.total);
    itens.sort((a, b) => b.valor - a.valor);
    total += tribTotal;
    qtdTotal += tribs.length;
  }

  return {
    linha,
    periodo,
    tipoPeriodo,
    mesIni,
    mesFim,
    total,
    qtdTotal,
    porConta,
    itens,
    itensTruncados: itens.length >= ITENS_LIMITE,
    calculadoEm: new Date().toISOString(),
  };
}

// Disponibilidade de dados por mês de um ano (para o seletor de meses do DRE).
// Para cada mês 1..12 retorna { n, nRealizado }:
//  - n         = total de lançamentos no mês (status != cancelado, tipo != transferencia)
//  - nRealizado= lançamentos já realizados (valor_realizado preenchido / status pago)
// Cliente deriva: n===0 → "sem_dados"; n>0 e nRealizado===n → "consolidado"; senão "lancamento".
export async function dreDisponibilidade(companyId: number, ano: string) {
  const db = await getDb();
  const yyyy = (ano || "").slice(0, 4);
  const res = await q(db!,
    `SELECT TO_CHAR(data_competencia,'MM') AS mes,
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE status='pago' OR valor_realizado IS NOT NULL) AS n_realizado
     FROM financial_entries
     WHERE company_id=$1
       AND status NOT IN ('cancelado')
       AND tipo <> 'transferencia'
       AND data_competencia IS NOT NULL
       AND TO_CHAR(data_competencia,'YYYY') = $2
     GROUP BY TO_CHAR(data_competencia,'MM')`,
    [companyId, yyyy]
  );
  const meses: Record<number, { n: number; nRealizado: number }> = {};
  for (let m = 1; m <= 12; m++) meses[m] = { n: 0, nRealizado: 0 };
  for (const row of r(res)) {
    const m = parseInt(row.mes, 10);
    if (m >= 1 && m <= 12) meses[m] = { n: n(row.n), nRealizado: n(row.n_realizado) };
  }
  return { ano: yyyy, meses };
}

// Projeção de Caixa 90 dias
export async function projetarFluxoCaixa90Dias(companyId: number) {
  const db = await getDb();

  const res = await q(db!,
    `SELECT data_vencimento::text AS data,
            COALESCE(SUM(CASE WHEN tipo='receita' THEN valor_previsto ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor_previsto ELSE 0 END), 0) AS saidas,
            COUNT(*) AS qtd_lancamentos
     FROM financial_entries
     WHERE company_id=$1
       AND status IN ('a_pagar','a_receber','previsto')
       AND data_vencimento IS NOT NULL
       AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
     GROUP BY data_vencimento
     ORDER BY data_vencimento`,
    [companyId]
  );

  // Saldo atual
  const saldoRes = await q(db!,
    `SELECT COALESCE(SUM(fob.valor), 0) AS saldo
     FROM financial_opening_balances fob
     JOIN company_bank_accounts cba ON cba.id = fob.conta_bancaria_id
     WHERE fob.company_id=$1 AND cba.ativo=1 AND cba."deletedAt" IS NULL`,
    [companyId]
  );
  let saldo = n(r(saldoRes)[0]?.saldo);

  const dias = r(res).map((row: any) => {
    const entradas = n(row.entradas);
    const saidas = n(row.saidas);
    saldo = saldo + entradas - saidas;
    return {
      data: row.data,
      entradas,
      saidas,
      saldo,
      qtdLancamentos: parseInt(row.qtd_lancamentos ?? "0"),
      alerta: saldo < 0 ? "SALDO NEGATIVO" : saldo < 10000 ? "SALDO BAIXO" : null,
    };
  });

  return {
    saldoInicial: n(r(saldoRes)[0]?.saldo),
    dias,
    totalEntradas: dias.reduce((s, d) => s + d.entradas, 0),
    totalSaidas: dias.reduce((s, d) => s + d.saidas, 0),
    saldoFinal: saldo,
    alertas: dias.filter(d => d.alerta),
    calculadoEm: new Date().toISOString(),
  };
}

// EFD-REINF (IN RFB 2.043/2021) — Escrituração Fiscal Digital
export async function gerarEFDReinf(companyId: number, mesRef: string) {
  const db = await getDb();

  // EFD-Reinf · R-2010 — Retenção de Contribuição Previdenciária (INSS) sobre SERVIÇOS TOMADOS
  // mediante cessão de mão de obra/empreitada. A fonte de verdade são as MEDIÇÕES de terceiros
  // (empresas com CNPJ), que já carregam os valores de retenção REALMENTE calculados/configurados
  // por contrato (`retencao_inss` etc.) — nada é recalculado aqui (evita fabricar retenção).
  // Agregado POR PRESTADOR (CNPJ), como o EFD-Reinf espera (1 R-2010 por estabelecimento prestador).
  const tercRes = await q(db!,
    `SELECT et.cnpj                                   AS cnpj,
            et.razao_social                           AS razao_social,
            et.nome_fantasia                          AS nome_fantasia,
            COUNT(tm.id)                              AS qtd_medicoes,
            COALESCE(SUM(tm.valor_medido), 0)         AS valor_bruto,
            COALESCE(SUM(tm.retencao_inss), 0)        AS retencao_inss,
            COALESCE(SUM(tm.retencao_iss), 0)         AS retencao_iss,
            COALESCE(SUM(tm.retencao_irrf), 0)        AS retencao_irrf,
            COALESCE(SUM(tm.outras_retencoes), 0)     AS outras_retencoes
     FROM terceiro_medicoes tm
     JOIN terceiro_contratos tc ON tc.id = tm.contrato_id AND tc.company_id = tm.company_id
     JOIN empresas_terceiras et ON et.id = tm.empresa_terceira_id AND et."companyId" = tm.company_id
     WHERE tm.company_id = $1
       AND tm.periodo = $2
       AND tm.status IN ('aprovada','faturada','paga')
       AND tm.retencao_inss > 0
     GROUP BY et.cnpj, et.razao_social, et.nome_fantasia
     ORDER BY COALESCE(SUM(tm.retencao_inss), 0) DESC`,
    [companyId, mesRef]
  );
  const tercs = r(tercRes);

  const prestadores = tercs.map((t: any) => ({
    cnpj: t.cnpj,
    razaoSocial: t.razao_social,
    nomeFantasia: t.nome_fantasia ?? null,
    qtdMedicoes: Number(t.qtd_medicoes) || 0,
    valorBruto: n(t.valor_bruto),
    retencaoINSS: n(t.retencao_inss),
    retencaoISS: n(t.retencao_iss),
    retencaoIRRF: n(t.retencao_irrf),
    outrasRetencoes: n(t.outras_retencoes),
  }));

  const soma = (campo: keyof (typeof prestadores)[number]) =>
    prestadores.reduce((s: number, p: any) => s + (Number(p[campo]) || 0), 0);

  return {
    periodo: mesRef,
    tipoRegistro: "R-2010",
    fundamentacao:
      "EFD-Reinf · R-2010 — Retenção de Contribuição Previdenciária (INSS) sobre serviços tomados " +
      "mediante cessão de mão de obra/empreitada (IN RFB 2.043/2021).",
    totalPrestadores: prestadores.length,
    totalValorBruto: soma("valorBruto"),
    totalRetencaoINSS: soma("retencaoINSS"),
    totalRetencaoISS: soma("retencaoISS"),
    totalRetencaoIRRF: soma("retencaoIRRF"),
    totalOutrasRetencoes: soma("outrasRetencoes"),
    prestadores,
    geradoEm: new Date().toISOString(),
  };
}
