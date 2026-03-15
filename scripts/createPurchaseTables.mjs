import pg from 'pg';
import { readFileSync } from 'fs';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SQL = `
ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'todos',
  ADD COLUMN IF NOT EXISTS avaliacao_media NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_avaliacoes INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS purchase_catalog_items (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, nome VARCHAR(255) NOT NULL, nome_abreviado VARCHAR(100), codigo VARCHAR(50), unidade VARCHAR(20) NOT NULL DEFAULT 'un', categoria VARCHAR(100), ncm VARCHAR(10), foto_url TEXT, codigo_sinapi VARCHAR(20), conta_financeira_id INTEGER, conta_financeira_nome VARCHAR(255), natureza_financeira TEXT DEFAULT 'variavel', ativo SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pci_company ON purchase_catalog_items(company_id);

CREATE TABLE IF NOT EXISTS supplier_price_history (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, catalog_item_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL, supplier_nome VARCHAR(255), valor_unitario NUMERIC(10,2) NOT NULL, valor_frete NUMERIC(10,2) DEFAULT 0, valor_total_unitario NUMERIC(10,2), unidade VARCHAR(20), data_referencia DATE NOT NULL, cotacao_id INTEGER, ordem_compra_id INTEGER, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sph_item ON supplier_price_history(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_sph_supplier ON supplier_price_history(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_evaluations (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL, ordem_compra_id INTEGER, nota_prazo INTEGER, nota_qualidade INTEGER, nota_atendimento INTEGER, media_geral NUMERIC(3,2), observacoes TEXT, avaliador_id INTEGER, avaliador_nome VARCHAR(255), created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_se_supplier ON supplier_evaluations(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_contracts (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL, supplier_nome VARCHAR(255), catalog_item_id INTEGER, item_nome VARCHAR(255), valor_unitario NUMERIC(10,2) NOT NULL, unidade VARCHAR(20), data_inicio DATE NOT NULL, data_fim DATE NOT NULL, observacoes TEXT, status TEXT NOT NULL DEFAULT 'ativo', alerta_enviado SMALLINT DEFAULT 0, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sc_company ON supplier_contracts(company_id);

CREATE TABLE IF NOT EXISTS purchase_approval_rules (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, nome VARCHAR(255) NOT NULL, obra_id INTEGER, nivel1_aprovador_tipo TEXT, nivel1_aprovador_id INTEGER, nivel1_cargo VARCHAR(100), nivel1_prazo_horas INTEGER DEFAULT 24, nivel2_ativo SMALLINT DEFAULT 1, nivel2_aprovador_tipo TEXT, nivel2_aprovador_id INTEGER, nivel2_prazo_horas INTEGER DEFAULT 8, limite_compra_direta NUMERIC(10,2) DEFAULT 500, limite_caixa_minimo_oc NUMERIC(15,2), sla_emergencial_horas INTEGER DEFAULT 4, ativo SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_par_company ON purchase_approval_rules(company_id);

CREATE TABLE IF NOT EXISTS purchase_spending_limits (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, nome VARCHAR(255), obra_id INTEGER, catalog_categoria VARCHAR(100), periodo_tipo TEXT DEFAULT 'mensal', valor_limite NUMERIC(15,2) NOT NULL, acao_ao_atingir TEXT DEFAULT 'alertar', alerta_percentual INTEGER DEFAULT 80, ativo SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_psl_company ON purchase_spending_limits(company_id);

CREATE TABLE IF NOT EXISTS oc_number_config (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, prefixo VARCHAR(20) DEFAULT 'OC', separador VARCHAR(5) DEFAULT '-', formato_ano TEXT DEFAULT '4dig', digitos_sequencial INTEGER DEFAULT 3, reiniciar_anualmente SMALLINT DEFAULT 1, proximo_numero INTEGER DEFAULT 1, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_onc_company ON oc_number_config(company_id);

CREATE TABLE IF NOT EXISTS purchase_requests (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER NOT NULL, obra_nome VARCHAR(255), eap_item_id INTEGER, eap_item_nome VARCHAR(255), solicitante_id INTEGER NOT NULL, solicitante_nome VARCHAR(255), tipo TEXT NOT NULL DEFAULT 'compra', status TEXT NOT NULL DEFAULT 'rascunho', emergencial SMALLINT NOT NULL DEFAULT 0, justificativa_emergencial TEXT, prazo_necessidade DATE, justificativa_recusa TEXT, aprovador_id INTEGER, aprovador_nome VARCHAR(255), aprovado_em TIMESTAMP, valor_estimado_total NUMERIC(15,2), valor_meta_total NUMERIC(15,2), estourou_meta SMALLINT DEFAULT 0, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pr_company ON purchase_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pr_obra ON purchase_requests(obra_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_emergencial ON purchase_requests(emergencial);

CREATE TABLE IF NOT EXISTS purchase_request_items (id SERIAL PRIMARY KEY, solicitacao_id INTEGER NOT NULL, catalog_item_id INTEGER, insumo_nome VARCHAR(255) NOT NULL, unidade VARCHAR(20) NOT NULL, quantidade NUMERIC(10,3) NOT NULL, quantidade_estoque_disponivel NUMERIC(10,3) DEFAULT 0, quantidade_retirada_estoque NUMERIC(10,3) DEFAULT 0, quantidade_a_comprar NUMERIC(10,3), valor_meta_unitario NUMERIC(10,2), valor_ultima_compra NUMERIC(10,2), observacoes TEXT);
CREATE INDEX IF NOT EXISTS idx_pri_sc ON purchase_request_items(solicitacao_id);

CREATE TABLE IF NOT EXISTS purchase_quotations (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, solicitacao_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'aberta', minimo_fornecedores INTEGER DEFAULT 3, fornecedor_vencedor_id INTEGER, justificativa_vencedor TEXT, comprador_id INTEGER, comprador_nome VARCHAR(255), validade_dias INTEGER DEFAULT 5, validade_ate DATE, email_enviado SMALLINT DEFAULT 0, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pq_company ON purchase_quotations(company_id);

CREATE TABLE IF NOT EXISTS purchase_quotation_suppliers (id SERIAL PRIMARY KEY, cotacao_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL, supplier_nome VARCHAR(255), status TEXT NOT NULL DEFAULT 'aguardando', valor_unitario NUMERIC(10,2), valor_frete NUMERIC(10,2) DEFAULT 0, frete_tipo TEXT DEFAULT 'cif', valor_total_com_frete NUMERIC(10,2), prazo_entrega_dias INTEGER, condicao_pagamento VARCHAR(255), validade_dias INTEGER DEFAULT 5, observacoes TEXT, respondido_em TIMESTAMP, score_total NUMERIC(5,2));
CREATE INDEX IF NOT EXISTS idx_pqs_cotacao ON purchase_quotation_suppliers(cotacao_id);

CREATE TABLE IF NOT EXISTS purchase_quotation_tokens (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, cotacao_id INTEGER NOT NULL, quotation_supplier_id INTEGER NOT NULL, supplier_id INTEGER, supplier_nome VARCHAR(255), supplier_email VARCHAR(255), token VARCHAR(64) NOT NULL, expires_at TIMESTAMP, accessed_at TIMESTAMP, responded_at TIMESTAMP, status TEXT DEFAULT 'enviado', created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pqt_token ON purchase_quotation_tokens(token);

CREATE TABLE IF NOT EXISTS purchase_negotiations (id SERIAL PRIMARY KEY, cotacao_id INTEGER NOT NULL, quotation_supplier_id INTEGER, rodada INTEGER DEFAULT 1, tipo TEXT, valor_unitario_proposto NUMERIC(10,2), mensagem TEXT, autor VARCHAR(100), autor_nome VARCHAR(255), criado_em TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pn_cotacao ON purchase_negotiations(cotacao_id);

CREATE TABLE IF NOT EXISTS purchase_orders (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, numero VARCHAR(20), solicitacao_id INTEGER, cotacao_id INTEGER, supplier_id INTEGER NOT NULL, supplier_nome VARCHAR(255), obra_id INTEGER, obra_nome VARCHAR(255), comprador_id INTEGER, comprador_nome VARCHAR(255), tipo TEXT NOT NULL DEFAULT 'compra', status TEXT NOT NULL DEFAULT 'emitida', valor_itens NUMERIC(15,2), valor_frete NUMERIC(15,2) DEFAULT 0, frete_tipo TEXT DEFAULT 'cif', valor_total NUMERIC(15,2), forma_pagamento VARCHAR(255), numero_parcelas INTEGER DEFAULT 1, prazo_entrega DATE, cnpj_comprador VARCHAR(20), inscricao_estadual VARCHAR(30), endereco_entrega TEXT, cidade_entrega VARCHAR(100), estado_entrega VARCHAR(2), cep_entrega VARCHAR(10), locacao_data_inicio DATE, locacao_data_fim DATE, locacao_valor_diario NUMERIC(10,2), financial_entry_id INTEGER, accounts_payable_id INTEGER, retencao_inss NUMERIC(10,2) DEFAULT 0, retencao_ir NUMERIC(10,2) DEFAULT 0, retencao_iss NUMERIC(10,2) DEFAULT 0, observacoes TEXT, pdf_url TEXT, emitida_em TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_obra ON purchase_orders(obra_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS purchase_order_items (id SERIAL PRIMARY KEY, ordem_id INTEGER NOT NULL, catalog_item_id INTEGER, insumo_nome VARCHAR(255) NOT NULL, unidade VARCHAR(20) NOT NULL, quantidade_pedida NUMERIC(10,3) NOT NULL, quantidade_recebida NUMERIC(10,3) DEFAULT 0, valor_unitario NUMERIC(10,2) NOT NULL, valor_total NUMERIC(10,2) NOT NULL, valor_meta_unitario NUMERIC(10,2), conta_financeira_id INTEGER);
CREATE INDEX IF NOT EXISTS idx_poi_ordem ON purchase_order_items(ordem_id);

CREATE TABLE IF NOT EXISTS purchase_receipts (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, ordem_id INTEGER NOT NULL, obra_id INTEGER, recebedor_id INTEGER, recebedor_nome VARCHAR(255), status TEXT NOT NULL, nota_fiscal_numero VARCHAR(100), nota_fiscal_url TEXT, foto_material_url TEXT, observacoes TEXT, financial_entry_liberado_id INTEGER, valor_liberado NUMERIC(15,2), recebido_em TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_prec_ordem ON purchase_receipts(ordem_id);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (id SERIAL PRIMARY KEY, recebimento_id INTEGER NOT NULL, ordem_item_id INTEGER NOT NULL, insumo_nome VARCHAR(255), unidade VARCHAR(20), quantidade_pedida NUMERIC(10,3), quantidade_recebida NUMERIC(10,3) NOT NULL, quantidade_pendente NUMERIC(10,3));
CREATE INDEX IF NOT EXISTS idx_preci_receb ON purchase_receipt_items(recebimento_id);

CREATE TABLE IF NOT EXISTS purchase_returns (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, ordem_id INTEGER NOT NULL, motivo TEXT NOT NULL, itens TEXT, status TEXT DEFAULT 'solicitada', valor_estornado NUMERIC(15,2), financial_entry_estorno_id INTEGER, solicitante_id INTEGER, solicitante_nome VARCHAR(255), created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pret_ordem ON purchase_returns(ordem_id);

CREATE TABLE IF NOT EXISTS purchase_accounts_payable (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, ordem_id INTEGER, supplier_id INTEGER, supplier_nome VARCHAR(255), obra_id INTEGER, descricao TEXT, valor_total NUMERIC(15,2) NOT NULL, valor_pago NUMERIC(15,2) DEFAULT 0, status TEXT NOT NULL DEFAULT 'bloqueado', forma_pagamento VARCHAR(50), data_vencimento DATE, data_pagamento DATE, supplier_banco VARCHAR(100), supplier_agencia VARCHAR(20), supplier_conta VARCHAR(30), supplier_pix VARCHAR(255), supplier_cnpj VARCHAR(20), comprovante_url TEXT, financial_entry_id INTEGER, parcela_numero INTEGER DEFAULT 1, parcela_total INTEGER DEFAULT 1, parcela_grupo_id VARCHAR(36), created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pap_company ON purchase_accounts_payable(company_id);
CREATE INDEX IF NOT EXISTS idx_pap_status ON purchase_accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_pap_vencimento ON purchase_accounts_payable(data_vencimento);

CREATE TABLE IF NOT EXISTS budget_reallocations (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER NOT NULL, origem_eap_item_id INTEGER, origem_eap_item_nome VARCHAR(255), destino_eap_item_id INTEGER, destino_eap_item_nome VARCHAR(255), valor_realocado NUMERIC(15,2) NOT NULL, motivo TEXT NOT NULL, usuario_id INTEGER, usuario_nome VARCHAR(255), created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_br_obra ON budget_reallocations(obra_id);

CREATE TABLE IF NOT EXISTS buyer_commissions (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER NOT NULL, obra_nome VARCHAR(255), comprador_id INTEGER NOT NULL, comprador_nome VARCHAR(255), valor_meta_total NUMERIC(15,2), valor_comprado_total NUMERIC(15,2), economia_total NUMERIC(15,2), percentual_participacao NUMERIC(5,2), valor_comissao NUMERIC(15,2), status TEXT NOT NULL DEFAULT 'em_aberto', aprovado_por VARCHAR(255), aprovado_em TIMESTAMP, financial_entry_id INTEGER, calculado_em TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bc_obra ON buyer_commissions(obra_id);

CREATE TABLE IF NOT EXISTS emergency_metrics (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, engenheiro_id INTEGER NOT NULL, engenheiro_nome VARCHAR(255), obra_id INTEGER, obra_nome VARCHAR(255), mes INTEGER NOT NULL, ano INTEGER NOT NULL, total_solicitacoes INTEGER DEFAULT 0, total_emergenciais INTEGER DEFAULT 0, percentual_emergencial NUMERIC(5,2) DEFAULT 0, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_em_eng ON emergency_metrics(engenheiro_id);

CREATE TABLE IF NOT EXISTS purchase_cancellations (id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, tipo TEXT NOT NULL, referencia_id INTEGER NOT NULL, motivo TEXT NOT NULL, efeitos TEXT, cancelado_por_id INTEGER, cancelado_por_nome VARCHAR(255), cancelado_em TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pc_company ON purchase_cancellations(company_id);

CREATE TABLE IF NOT EXISTS sinapi_price_cache (id SERIAL PRIMARY KEY, codigo VARCHAR(20), descricao VARCHAR(500), unidade VARCHAR(20), estado VARCHAR(2), mes_referencia VARCHAR(7), preco_sem_desoneracao NUMERIC(10,2), preco_com_desoneracao NUMERIC(10,2), atualizado_em TIMESTAMP DEFAULT NOW() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sinapi_codigo ON sinapi_price_cache(codigo);
`;

const client = await pool.connect();
try {
  const statements = SQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch(e) {
      if (!e.message.includes('already exists')) {
        console.error('Error in:', stmt.substring(0, 80), '->', e.message);
      }
    }
  }
  console.log('✅ Tabelas de compras criadas com sucesso!');
} finally {
  client.release();
  await pool.end();
}
