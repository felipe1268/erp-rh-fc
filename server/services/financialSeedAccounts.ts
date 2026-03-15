import { getDb } from "../db";

export const PLANO_DE_CONTAS_PADRAO = [
  // ────────────────── RECEITAS BRUTAS ──────────────────
  { codigo: "1", nome: "RECEITAS BRUTAS", tipo: "receita_bruta", natureza: "credora", nivel: 1, classificacaoDRE: "receita_bruta", ordem: 1 },
  { codigo: "1.1", nome: "Serviços de Engenharia Civil", tipo: "receita_bruta", natureza: "credora", nivel: 2, classificacaoDRE: "receita_bruta", ordem: 2 },
  { codigo: "1.1.1", nome: "Medições de Obras", tipo: "receita_bruta", natureza: "credora", nivel: 3, classificacaoDRE: "receita_bruta", ordem: 3 },
  { codigo: "1.1.2", nome: "Aditivos Contratuais", tipo: "receita_bruta", natureza: "credora", nivel: 3, classificacaoDRE: "receita_bruta", ordem: 4 },
  { codigo: "1.1.3", nome: "Projetos e Consultoria", tipo: "receita_bruta", natureza: "credora", nivel: 3, classificacaoDRE: "receita_bruta", ordem: 5 },
  { codigo: "1.2", nome: "Outras Receitas Operacionais", tipo: "receita_bruta", natureza: "credora", nivel: 2, classificacaoDRE: "receita_bruta", ordem: 6 },
  // ────────────────── DEDUÇÕES DA RECEITA ──────────────────
  { codigo: "2", nome: "DEDUÇÕES DA RECEITA BRUTA", tipo: "deducao_receita", natureza: "devedora", nivel: 1, classificacaoDRE: "deducao_receita", ordem: 10 },
  { codigo: "2.1", nome: "ISS", tipo: "deducao_receita", natureza: "devedora", nivel: 2, classificacaoDRE: "deducao_receita", ordem: 11 },
  { codigo: "2.2", nome: "PIS", tipo: "deducao_receita", natureza: "devedora", nivel: 2, classificacaoDRE: "deducao_receita", ordem: 12 },
  { codigo: "2.3", nome: "COFINS", tipo: "deducao_receita", natureza: "devedora", nivel: 2, classificacaoDRE: "deducao_receita", ordem: 13 },
  { codigo: "2.4", nome: "Retenções de Clientes (INSS/IR)", tipo: "deducao_receita", natureza: "devedora", nivel: 2, classificacaoDRE: "deducao_receita", ordem: 14 },
  { codigo: "2.5", nome: "Devoluções e Cancelamentos", tipo: "deducao_receita", natureza: "devedora", nivel: 2, classificacaoDRE: "deducao_receita", ordem: 15 },
  // ────────────────── CUSTOS DAS OBRAS ──────────────────
  { codigo: "3", nome: "CUSTOS DIRETOS DAS OBRAS (CDO)", tipo: "custo_obra", natureza: "devedora", nivel: 1, classificacaoDRE: "custo_obra", ordem: 20 },
  { codigo: "3.1", nome: "Mão de Obra Direta", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 21 },
  { codigo: "3.1.1", nome: "Salários e Horas Extras (CLT)", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 22 },
  { codigo: "3.1.2", nome: "Encargos Sociais (FGTS/INSS)", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 23 },
  { codigo: "3.1.3", nome: "13º Salário e Férias Proporcionais", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 24 },
  { codigo: "3.1.4", nome: "Serviços PJ / Terceirizados", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 25 },
  { codigo: "3.2", nome: "Materiais de Construção", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 26 },
  { codigo: "3.3", nome: "Equipamentos e Locações", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 27 },
  { codigo: "3.3.1", nome: "Aluguel de Equipamentos", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 28 },
  { codigo: "3.3.2", nome: "Manutenção de Equipamentos", tipo: "custo_obra", natureza: "devedora", nivel: 3, classificacaoDRE: "custo_obra", ordem: 29 },
  { codigo: "3.4", nome: "Subempreiteiros", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 30 },
  { codigo: "3.5", nome: "Transporte e Logística", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 31 },
  { codigo: "3.6", nome: "Seguros de Obra", tipo: "custo_obra", natureza: "devedora", nivel: 2, classificacaoDRE: "custo_obra", ordem: 32 },
  // ────────────────── DESPESAS ADMINISTRATIVAS (FIXAS) ──────────────────
  { codigo: "4", nome: "DESPESAS FIXAS ADMINISTRATIVAS", tipo: "despesa_fixa", natureza: "devedora", nivel: 1, classificacaoDRE: "despesa_fixa", ordem: 40 },
  { codigo: "4.1", nome: "Pró-labore dos Sócios", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 41 },
  { codigo: "4.2", nome: "Salários Administrativos", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 42 },
  { codigo: "4.3", nome: "Encargos Administrativos", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 43 },
  { codigo: "4.4", nome: "Aluguéis e Locações", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 44 },
  { codigo: "4.4.1", nome: "Aluguel de Escritório", tipo: "despesa_fixa", natureza: "devedora", nivel: 3, classificacaoDRE: "despesa_fixa", ordem: 45 },
  { codigo: "4.4.2", nome: "Aluguel de Veículos", tipo: "despesa_fixa", natureza: "devedora", nivel: 3, classificacaoDRE: "despesa_fixa", ordem: 46 },
  { codigo: "4.5", nome: "Serviços de Terceiros (PJ Admin)", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 47 },
  { codigo: "4.6", nome: "Utilidades e Comunicação", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 48 },
  { codigo: "4.6.1", nome: "Energia Elétrica", tipo: "despesa_fixa", natureza: "devedora", nivel: 3, classificacaoDRE: "despesa_fixa", ordem: 49 },
  { codigo: "4.6.2", nome: "Telefonia e Internet", tipo: "despesa_fixa", natureza: "devedora", nivel: 3, classificacaoDRE: "despesa_fixa", ordem: 50 },
  { codigo: "4.7", nome: "Seguros Empresariais", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 51 },
  { codigo: "4.8", nome: "Software e Licenças", tipo: "despesa_fixa", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_fixa", ordem: 52 },
  // ────────────────── DESPESAS VARIÁVEIS ──────────────────
  { codigo: "5", nome: "DESPESAS VARIÁVEIS", tipo: "despesa_variavel", natureza: "devedora", nivel: 1, classificacaoDRE: "despesa_variavel", ordem: 60 },
  { codigo: "5.1", nome: "Comissões e Bonificações", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 61 },
  { codigo: "5.2", nome: "Marketing e Publicidade", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 62 },
  { codigo: "5.3", nome: "Viagens e Deslocamentos", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 63 },
  { codigo: "5.4", nome: "Alimentação e Refeições", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 64 },
  { codigo: "5.5", nome: "EPIs e Uniformes", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 65 },
  { codigo: "5.6", nome: "Material de Escritório", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 66 },
  { codigo: "5.7", nome: "Multas e Penalidades", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 67 },
  { codigo: "5.8", nome: "Outras Despesas Variáveis", tipo: "despesa_variavel", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_variavel", ordem: 68 },
  // ────────────────── DESPESAS FINANCEIRAS ──────────────────
  { codigo: "6", nome: "DESPESAS FINANCEIRAS", tipo: "despesa_financeira", natureza: "devedora", nivel: 1, classificacaoDRE: "despesa_financeira", ordem: 70 },
  { codigo: "6.1", nome: "Juros de Empréstimos", tipo: "despesa_financeira", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_financeira", ordem: 71 },
  { codigo: "6.2", nome: "Tarifas e Taxas Bancárias", tipo: "despesa_financeira", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_financeira", ordem: 72 },
  { codigo: "6.3", nome: "Descontos Concedidos", tipo: "despesa_financeira", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_financeira", ordem: 73 },
  { codigo: "6.4", nome: "IOF e Outras Taxas", tipo: "despesa_financeira", natureza: "devedora", nivel: 2, classificacaoDRE: "despesa_financeira", ordem: 74 },
  // ────────────────── RECEITAS FINANCEIRAS ──────────────────
  { codigo: "7", nome: "RECEITAS FINANCEIRAS", tipo: "receita_financeira", natureza: "credora", nivel: 1, classificacaoDRE: "receita_financeira", ordem: 80 },
  { codigo: "7.1", nome: "Rendimentos de Aplicações", tipo: "receita_financeira", natureza: "credora", nivel: 2, classificacaoDRE: "receita_financeira", ordem: 81 },
  { codigo: "7.2", nome: "Juros Recebidos", tipo: "receita_financeira", natureza: "credora", nivel: 2, classificacaoDRE: "receita_financeira", ordem: 82 },
  { codigo: "7.3", nome: "Descontos Obtidos", tipo: "receita_financeira", natureza: "credora", nivel: 2, classificacaoDRE: "receita_financeira", ordem: 83 },
  // ────────────────── IMPOSTOS SOBRE RESULTADO ──────────────────
  { codigo: "8", nome: "IMPOSTOS SOBRE O RESULTADO", tipo: "imposto_resultado", natureza: "devedora", nivel: 1, classificacaoDRE: "imposto_resultado", ordem: 90 },
  { codigo: "8.1", nome: "DAS (Simples Nacional)", tipo: "imposto_resultado", natureza: "devedora", nivel: 2, classificacaoDRE: "imposto_resultado", ordem: 91 },
  { codigo: "8.2", nome: "IRPJ", tipo: "imposto_resultado", natureza: "devedora", nivel: 2, classificacaoDRE: "imposto_resultado", ordem: 92 },
  { codigo: "8.3", nome: "CSLL", tipo: "imposto_resultado", natureza: "devedora", nivel: 2, classificacaoDRE: "imposto_resultado", ordem: 93 },
];

export async function seedPlanoDeConta(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db.execute(
    `SELECT COUNT(*) AS count FROM financial_accounts WHERE company_id = $1`,
    [companyId]
  );
  const rows = (existing as any)?.rows ?? (existing as any) ?? [];
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    console.log(`[FinancialSeed] Plano de contas já existente para company ${companyId} (${count} contas)`);
    return;
  }

  for (const conta of PLANO_DE_CONTAS_PADRAO) {
    await db.execute(
      `INSERT INTO financial_accounts (company_id, codigo, nome, tipo, natureza, nivel, classificacao_dre, ativo, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
      [companyId, conta.codigo, conta.nome, conta.tipo, conta.natureza, conta.nivel, conta.classificacaoDRE, conta.ordem]
    );
  }

  console.log(`[FinancialSeed] ${PLANO_DE_CONTAS_PADRAO.length} contas do plano de contas seedadas para company ${companyId}`);
}

export async function ensureTaxConfig(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.execute(
    `SELECT id FROM financial_tax_config WHERE company_id = $1 LIMIT 1`,
    [companyId]
  );
  const rows = (existing as any)?.rows ?? (existing as any) ?? [];
  if (rows.length > 0) return;

  await db.execute(
    `INSERT INTO financial_tax_config (company_id, regime_tributario, aliquota_simples, aliquota_iss, aliquota_pis, aliquota_cofins, aliquota_irpj, aliquota_csll, aliquota_inss_empresa, aliquota_fgts, aliquota_rat, ativo)
     VALUES ($1, 'simples_nacional', 6.00, 3.00, 0.65, 3.00, 15.00, 9.00, 20.00, 8.00, 3.00, 1)`,
    [companyId]
  );
  console.log(`[FinancialSeed] Configuração tributária padrão criada para company ${companyId}`);
}
