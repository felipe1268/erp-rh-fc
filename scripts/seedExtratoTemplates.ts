/**
 * scripts/seedExtratoTemplates.ts — Rev. 3879
 *
 * Semente os templates de extrato bancário para todas as empresas.
 * Bancos: Caixa Econômica Federal, Santander IBPJ, Banco do Brasil.
 *
 * Execução: pnpm tsx scripts/seedExtratoTemplates.ts
 *
 * Idempotente: usa INSERT ... WHERE NOT EXISTS para não duplicar.
 */

import { config } from "dotenv";
config();

import pg from "pg";

const { Client } = pg;

const TEMPLATES = [
  // ── 1. CAIXA ECONÔMICA FEDERAL ─────────────────────────────────────────────
  {
    bancoNome:     "Caixa Econômica Federal — Extrato Online",
    palavrasChave: JSON.stringify([
      "CAIXA ECONOMICA FEDERAL",
      "Extrato no período",
      "Extrato de Conta",
      "www.caixa.gov.br",
    ]),
    skipPrefixes:  JSON.stringify([
      "SALDO DIA",
      "Saldo Anterior",
      "SALDO ANTERIOR",
      "Saldo do dia",
      "Data  Doc",
      "Data     Doc",
    ]),
    instrucoesIa:  `Extrato da Caixa Econômica Federal gerado pelo Internet Banking.
Layout em colunas com posições X estáveis no PDF:
- Data (DD/MM/AAAA): coluna da esquerda
- Documento: coluna central
- Histórico/Descrição: coluna central-direita
- Valor (R$): coluna da direita (débito = "- R$" ou valor com "D"; crédito = "R$" com "C")
- Saldo (R$ ... C ou D): coluna mais à direita

REGRAS DE EXTRAÇÃO:
- Cada transação pode ocupar múltiplas linhas (o histórico vem antes ou após a data).
- Linhas de saldo (SALDO DIA, Saldo Anterior) NÃO são transações — ignore.
- Débito = "D" após o saldo ou "- R$" antes do valor.
- Crédito = "C" após o saldo ou valor positivo sem sinal.
- Data no formato DD/MM/AAAA. Se aparecer DD/MM HH:MM é hora efetiva, use a data da linha anterior.
- Valores: "R$ 1.234,56" → 1234.56; "- R$ 1.234,56" → -1234.56.
- Inclua contraparte/CNPJ na descrição quando disponível.`,
  },

  // ── 2. SANTANDER — INTERNET BANKING EMPRESARIAL PJ (IBPJ) ──────────────────
  {
    bancoNome:     "Santander — Internet Banking Empresarial PJ (IBPJ)",
    palavrasChave: JSON.stringify([
      "Internet Banking Empresarial",
      "IBPJ",
      "Banco Santander",
      "santander.com.br",
    ]),
    skipPrefixes:  JSON.stringify([
      "Saldo do dia",
      "Saldo anterior",
      "Saldo em",
      "SALDO",
      "Data  Histórico",
      "Data Histórico",
      "Período:",
    ]),
    instrucoesIa:  `Extrato do Santander Internet Banking Empresarial PJ (IBPJ).
Cada linha de transação contém: DATA (DD/MM/AAAA) + DESCRIÇÃO + VALOR.

REGRAS DE EXTRAÇÃO:
- Débito: valor precedido de "- R$" (ex.: - R$ 1.234,56 → -1234.56).
- Crédito: valor precedido apenas de "R$" sem sinal negativo (ex.: R$ 500,00 → 500.00).
- Data no formato DD/MM/AAAA.
- Ignore linhas que começam com "Saldo do dia", "Saldo anterior", "Saldo em" ou similares.
- Descrição pode incluir contraparte, CPF/CNPJ e complemento na mesma linha ou na seguinte.
- Valores em formato BR: ponto como milhar, vírgula como decimal ("1.234,56" → 1234.56).
- Saldo ao final de cada linha (quando presente) indica o saldo após o lançamento.`,
  },

  // ── 3. BANCO DO BRASIL — EXTRATO WEB (FORMATO NOVO (+)/(-)) ─────────────────
  {
    bancoNome:     "Banco do Brasil — Extrato de Conta Corrente (Internet Banking PJ)",
    palavrasChave: JSON.stringify([
      "Extrato de Conta Corrente",
      "Banco do Brasil",
      "BB Empresas",
      "bancodobrasil.com.br",
    ]),
    skipPrefixes:  JSON.stringify([
      "Saldo do dia",
      "Saldo Anterior",
      "SALDO",
      "S A L D O",
      "Data  Histórico",
      "Lote  Documento",
    ]),
    instrucoesIa:  `Extrato do Banco do Brasil (Internet Banking PJ) — dois formatos possíveis:

FORMATO NOVO (mais comum, identifique por "(+)" ou "(-)"):
- Cada transação pode ocupar DUAS linhas:
  • Linha 1: DATA (DD/MM/AAAA) [+ descrição opcional]
  • Linha 2: lote + número do documento + [descrição complementar] + VALOR "(+)" ou "(-)"
- "(+)" = crédito (positivo); "(-)" = débito (negativo).
- Linhas de saldo têm o mesmo formato mas começam com "Saldo" — ignore-as.
- Exemplo crédito: "2.100,00 (+)" → +2100.00
- Exemplo débito: "1,44 (-)" → -1.44

FORMATO LEGADO (cada transação em UMA linha, identifique por "C" ou "D" ao final):
- DATA + zeros + DESCRIÇÃO + VALOR + "C" (crédito) ou "D" (débito)
- "C" = crédito (positivo); "D" = débito (negativo).
- Linhas de saldo terminam em "C" ou "D" mas começam com "Saldo Anterior" ou "S A L D O" — ignore-as.

REGRAS GERAIS:
- Data formato DD/MM/AAAA.
- Valores BR: ponto milhar, vírgula decimal ("2.100,00" → 2100.00).
- Inclua número de documento e contraparte/CNPJ na descrição quando disponível.`,
  },
];

// ── Santander Consolidado (arquivo grande "Consolidado Inteligente") ──────────
// Rev. 4083 — palavrasChave corrigidas; instruções descrevem o layout real do PDF.
const TEMPLATE_SANTANDER_CONSOLIDADO = {
  bancoNome:     "Santander — Extrato Consolidado Inteligente",
  palavrasChave: JSON.stringify([
    "EXTRATO CONSOLIDADO INTELIGENTE",
    "Extrato_PJ_A4_Inteligente",
    "Extrato Consolidado",
    "Santander",
  ]),
  skipPrefixes:  JSON.stringify([
    "SALDO EM",
    "Saldo em",
    "Saldo anterior",
    "Total de entradas",
    "Total de saídas",
    "Saldo final",
    "Período:",
    "Data          Descrição",
    "Créditos      Débitos",
  ]),
  instrucoesIa:  `Extrato Santander "Extrato Consolidado Inteligente" — PDF gerado pelo sistema do banco (texto selecionável, múltiplas páginas).

Layout em COLUNAS:
  Data (DD/MM) | Descrição + Nº Doc | Créditos (R$) | Débitos (R$) | Saldo (R$)

REGRAS DE EXTRAÇÃO:
- Cada transação pode ocupar MÚLTIPLAS LINHAS: a 1ª tem a data DD/MM + início da descrição; continuações NÃO têm data.
- Débito: valor na coluna "Débitos" — aparece com sufixo "-" (ex.: 1.234,56-  → -1234.56).
- Crédito: valor na coluna "Créditos" — aparece sem sufixo (ex.: 1.200,00 → +1200.00).
- Uma linha pode ter APENAS crédito OU apenas débito (colunas independentes).
- A última coluna de cada linha é o Saldo — ignore-a.
- Linhas "SALDO EM DD/MM" não são transações — ignore-as.
- Nº de documento de 6 dígitos isolado na linha não é valor — ignore-o.
- Data no formato DD/MM; use o ano do cabeçalho do extrato.
- Valores BR: ponto como milhar, vírgula como decimal ("1.234,56" → 1234.56).`,
};

async function main() {
  const connStr = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("❌ NEON_DATABASE_URL ou DATABASE_URL não definido.");
    process.exit(1);
  }

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Conectado ao banco.");

  // Buscar todas as empresas ativas
  const { rows: companies } = await client.query<{ id: number; razaoSocial: string }>(
    `SELECT id, "razaoSocial" FROM companies WHERE "isActive" = 1 OR "isActive" IS NULL ORDER BY id`
  );
  console.log(`📋 ${companies.length} empresa(s) encontrada(s).\n`);

  const allTemplates = [...TEMPLATES, TEMPLATE_SANTANDER_CONSOLIDADO];
  let inserted = 0;
  let skipped  = 0;

  for (const co of companies) {
    console.log(`\n🏢 ${co.razaoSocial} (id=${co.id})`);

    for (const tpl of allTemplates) {
      // Verifica se já existe template com este nome para esta empresa
      const { rows: existing } = await client.query(
        `SELECT id FROM bank_statement_templates
         WHERE company_id = $1 AND banco_nome = $2`,
        [co.id, tpl.bancoNome]
      );

      if (existing.length > 0) {
        console.log(`   ⏭  Já existe: ${tpl.bancoNome}`);
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO bank_statement_templates
           (company_id, banco_nome, palavras_chave, skip_prefixes, instrucoes_ia,
            ativo, revisao, notas_revisao, criado_por_nome)
         VALUES ($1, $2, $3, $4, $5, 1, 1, $6, 'Seed automático Rev. 3879')`,
        [
          co.id,
          tpl.bancoNome,
          tpl.palavrasChave,
          tpl.skipPrefixes,
          tpl.instrucoesIa,
          "Pré-configurado automaticamente com base nos extratos analisados.",
        ]
      );
      console.log(`   ✅ Inserido: ${tpl.bancoNome}`);
      inserted++;
    }
  }

  await client.end();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Seed concluído: ${inserted} inserido(s), ${skipped} já existia(m).`);
}

main().catch(e => {
  console.error("❌ Erro:", e?.message || e);
  process.exit(1);
});
