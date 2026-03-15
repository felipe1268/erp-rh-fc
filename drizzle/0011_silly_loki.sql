CREATE TABLE "budget_reallocations" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer NOT NULL,
	"origem_eap_item_id" integer,
	"origem_eap_item_nome" varchar(255),
	"destino_eap_item_id" integer,
	"destino_eap_item_nome" varchar(255),
	"valor_realocado" numeric(15, 2) NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" integer,
	"usuario_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_commissions" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer NOT NULL,
	"obra_nome" varchar(255),
	"comprador_id" integer NOT NULL,
	"comprador_nome" varchar(255),
	"valor_meta_total" numeric(15, 2),
	"valor_comprado_total" numeric(15, 2),
	"economia_total" numeric(15, 2),
	"percentual_participacao" numeric(5, 2),
	"valor_comissao" numeric(15, 2),
	"status" text DEFAULT 'em_aberto' NOT NULL,
	"aprovado_por" varchar(255),
	"aprovado_em" timestamp,
	"financial_entry_id" integer,
	"calculado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_metrics" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"engenheiro_id" integer NOT NULL,
	"engenheiro_nome" varchar(255),
	"obra_id" integer,
	"obra_nome" varchar(255),
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"total_solicitacoes" integer DEFAULT 0,
	"total_emergenciais" integer DEFAULT 0,
	"percentual_emergencial" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oc_number_config" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"prefixo" varchar(20) DEFAULT 'OC',
	"separador" varchar(5) DEFAULT '-',
	"formato_ano" text DEFAULT '4dig',
	"digitos_sequencial" integer DEFAULT 3,
	"reiniciar_anualmente" smallint DEFAULT 1,
	"proximo_numero" integer DEFAULT 1,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_accounts_payable" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"ordem_id" integer,
	"supplier_id" integer,
	"supplier_nome" varchar(255),
	"obra_id" integer,
	"descricao" text,
	"valor_total" numeric(15, 2) NOT NULL,
	"valor_pago" numeric(15, 2) DEFAULT '0',
	"status" text DEFAULT 'bloqueado' NOT NULL,
	"forma_pagamento" varchar(50),
	"data_vencimento" date,
	"data_pagamento" date,
	"supplier_banco" varchar(100),
	"supplier_agencia" varchar(20),
	"supplier_conta" varchar(30),
	"supplier_pix" varchar(255),
	"supplier_cnpj" varchar(20),
	"comprovante_url" text,
	"financial_entry_id" integer,
	"parcela_numero" integer DEFAULT 1,
	"parcela_total" integer DEFAULT 1,
	"parcela_grupo_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_approval_rules" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"obra_id" integer,
	"nivel1_aprovador_tipo" text,
	"nivel1_aprovador_id" integer,
	"nivel1_cargo" varchar(100),
	"nivel1_prazo_horas" integer DEFAULT 24,
	"nivel2_ativo" smallint DEFAULT 1,
	"nivel2_aprovador_tipo" text,
	"nivel2_aprovador_id" integer,
	"nivel2_prazo_horas" integer DEFAULT 8,
	"limite_compra_direta" numeric(10, 2) DEFAULT '500',
	"limite_caixa_minimo_oc" numeric(15, 2),
	"sla_emergencial_horas" integer DEFAULT 4,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_cancellations" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"referencia_id" integer NOT NULL,
	"motivo" text NOT NULL,
	"efeitos" text,
	"cancelado_por_id" integer,
	"cancelado_por_nome" varchar(255),
	"cancelado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_catalog_items" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"nome_abreviado" varchar(100),
	"codigo" varchar(50),
	"unidade" varchar(20) DEFAULT 'un' NOT NULL,
	"categoria" varchar(100),
	"ncm" varchar(10),
	"foto_url" text,
	"codigo_sinapi" varchar(20),
	"conta_financeira_id" integer,
	"conta_financeira_nome" varchar(255),
	"natureza_financeira" text DEFAULT 'variavel',
	"ativo" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_negotiations" (
	"id" serial NOT NULL,
	"cotacao_id" integer NOT NULL,
	"quotation_supplier_id" integer,
	"rodada" integer DEFAULT 1,
	"tipo" text,
	"valor_unitario_proposto" numeric(10, 2),
	"mensagem" text,
	"autor" varchar(100),
	"autor_nome" varchar(255),
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial NOT NULL,
	"ordem_id" integer NOT NULL,
	"catalog_item_id" integer,
	"insumo_nome" varchar(255) NOT NULL,
	"unidade" varchar(20) NOT NULL,
	"quantidade_pedida" numeric(10, 3) NOT NULL,
	"quantidade_recebida" numeric(10, 3) DEFAULT '0',
	"valor_unitario" numeric(10, 2) NOT NULL,
	"valor_total" numeric(10, 2) NOT NULL,
	"valor_meta_unitario" numeric(10, 2),
	"conta_financeira_id" integer
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"numero" varchar(20),
	"solicitacao_id" integer,
	"cotacao_id" integer,
	"supplier_id" integer NOT NULL,
	"supplier_nome" varchar(255),
	"obra_id" integer,
	"obra_nome" varchar(255),
	"comprador_id" integer,
	"comprador_nome" varchar(255),
	"tipo" text DEFAULT 'compra' NOT NULL,
	"status" text DEFAULT 'emitida' NOT NULL,
	"valor_itens" numeric(15, 2),
	"valor_frete" numeric(15, 2) DEFAULT '0',
	"frete_tipo" text DEFAULT 'cif',
	"valor_total" numeric(15, 2),
	"forma_pagamento" varchar(255),
	"numero_parcelas" integer DEFAULT 1,
	"prazo_entrega" date,
	"cnpj_comprador" varchar(20),
	"inscricao_estadual" varchar(30),
	"endereco_entrega" text,
	"cidade_entrega" varchar(100),
	"estado_entrega" varchar(2),
	"cep_entrega" varchar(10),
	"locacao_data_inicio" date,
	"locacao_data_fim" date,
	"locacao_valor_diario" numeric(10, 2),
	"financial_entry_id" integer,
	"accounts_payable_id" integer,
	"retencao_inss" numeric(10, 2) DEFAULT '0',
	"retencao_ir" numeric(10, 2) DEFAULT '0',
	"retencao_iss" numeric(10, 2) DEFAULT '0',
	"observacoes" text,
	"pdf_url" text,
	"emitida_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_quotation_suppliers" (
	"id" serial NOT NULL,
	"cotacao_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_nome" varchar(255),
	"status" text DEFAULT 'aguardando' NOT NULL,
	"valor_unitario" numeric(10, 2),
	"valor_frete" numeric(10, 2) DEFAULT '0',
	"frete_tipo" text DEFAULT 'cif',
	"valor_total_com_frete" numeric(10, 2),
	"prazo_entrega_dias" integer,
	"condicao_pagamento" varchar(255),
	"validade_dias" integer DEFAULT 5,
	"observacoes" text,
	"respondido_em" timestamp,
	"score_total" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "purchase_quotation_tokens" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"cotacao_id" integer NOT NULL,
	"quotation_supplier_id" integer NOT NULL,
	"supplier_id" integer,
	"supplier_nome" varchar(255),
	"supplier_email" varchar(255),
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp,
	"accessed_at" timestamp,
	"responded_at" timestamp,
	"status" text DEFAULT 'enviado',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_quotations" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"solicitacao_id" integer NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"minimo_fornecedores" integer DEFAULT 3,
	"fornecedor_vencedor_id" integer,
	"justificativa_vencedor" text,
	"comprador_id" integer,
	"comprador_nome" varchar(255),
	"validade_dias" integer DEFAULT 5,
	"validade_ate" date,
	"email_enviado" smallint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_items" (
	"id" serial NOT NULL,
	"recebimento_id" integer NOT NULL,
	"ordem_item_id" integer NOT NULL,
	"insumo_nome" varchar(255),
	"unidade" varchar(20),
	"quantidade_pedida" numeric(10, 3),
	"quantidade_recebida" numeric(10, 3) NOT NULL,
	"quantidade_pendente" numeric(10, 3)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"ordem_id" integer NOT NULL,
	"obra_id" integer,
	"recebedor_id" integer,
	"recebedor_nome" varchar(255),
	"status" text NOT NULL,
	"nota_fiscal_numero" varchar(100),
	"nota_fiscal_url" text,
	"foto_material_url" text,
	"observacoes" text,
	"financial_entry_liberado_id" integer,
	"valor_liberado" numeric(15, 2),
	"recebido_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" serial NOT NULL,
	"solicitacao_id" integer NOT NULL,
	"catalog_item_id" integer,
	"insumo_nome" varchar(255) NOT NULL,
	"unidade" varchar(20) NOT NULL,
	"quantidade" numeric(10, 3) NOT NULL,
	"quantidade_estoque_disponivel" numeric(10, 3) DEFAULT '0',
	"quantidade_retirada_estoque" numeric(10, 3) DEFAULT '0',
	"quantidade_a_comprar" numeric(10, 3),
	"valor_meta_unitario" numeric(10, 2),
	"valor_ultima_compra" numeric(10, 2),
	"observacoes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer NOT NULL,
	"obra_nome" varchar(255),
	"eap_item_id" integer,
	"eap_item_nome" varchar(255),
	"solicitante_id" integer NOT NULL,
	"solicitante_nome" varchar(255),
	"tipo" text DEFAULT 'compra' NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"emergencial" smallint DEFAULT 0 NOT NULL,
	"justificativa_emergencial" text,
	"prazo_necessidade" date,
	"justificativa_recusa" text,
	"aprovador_id" integer,
	"aprovador_nome" varchar(255),
	"aprovado_em" timestamp,
	"valor_estimado_total" numeric(15, 2),
	"valor_meta_total" numeric(15, 2),
	"estourou_meta" smallint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"ordem_id" integer NOT NULL,
	"motivo" text NOT NULL,
	"itens" text,
	"status" text DEFAULT 'solicitada',
	"valor_estornado" numeric(15, 2),
	"financial_entry_estorno_id" integer,
	"solicitante_id" integer,
	"solicitante_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_spending_limits" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(255),
	"obra_id" integer,
	"catalog_categoria" varchar(100),
	"periodo_tipo" text DEFAULT 'mensal',
	"valor_limite" numeric(15, 2) NOT NULL,
	"acao_ao_atingir" text DEFAULT 'alertar',
	"alerta_percentual" integer DEFAULT 80,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinapi_price_cache" (
	"id" serial NOT NULL,
	"codigo" varchar(20),
	"descricao" varchar(500),
	"unidade" varchar(20),
	"estado" varchar(2),
	"mes_referencia" varchar(7),
	"preco_sem_desoneracao" numeric(10, 2),
	"preco_com_desoneracao" numeric(10, 2),
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contracts" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_nome" varchar(255),
	"catalog_item_id" integer,
	"item_nome" varchar(255),
	"valor_unitario" numeric(10, 2) NOT NULL,
	"unidade" varchar(20),
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"observacoes" text,
	"status" text DEFAULT 'ativo' NOT NULL,
	"alerta_enviado" smallint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_evaluations" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"ordem_compra_id" integer,
	"nota_prazo" integer,
	"nota_qualidade" integer,
	"nota_atendimento" integer,
	"media_geral" numeric(3, 2),
	"observacoes" text,
	"avaliador_id" integer,
	"avaliador_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_price_history" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_nome" varchar(255),
	"valor_unitario" numeric(10, 2) NOT NULL,
	"valor_frete" numeric(10, 2) DEFAULT '0',
	"valor_total_unitario" numeric(10, 2),
	"unidade" varchar(20),
	"data_referencia" date NOT NULL,
	"cotacao_id" integer,
	"ordem_compra_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_contrato_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrato_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"planejamento_atividade_id" integer,
	"eap_codigo" varchar(100),
	"orcamento_item_id" integer,
	"descricao" varchar(500) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(18, 4) DEFAULT '1',
	"valor_unitario" numeric(18, 4) DEFAULT '0',
	"valor_total" numeric(18, 2) DEFAULT '0',
	"percentual_medido_acumulado" numeric(8, 4) DEFAULT '0',
	"valor_medido_acumulado" numeric(18, 2) DEFAULT '0',
	"ordem" integer DEFAULT 0,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_contratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"empresa_terceira_id" integer NOT NULL,
	"obra_id" integer,
	"obra_nome" varchar(255),
	"planejamento_projeto_id" integer,
	"orcamento_id" integer,
	"numero_contrato" varchar(50),
	"descricao" varchar(500) NOT NULL,
	"tipo_contrato" varchar(50) DEFAULT 'empreitada_global',
	"valor_total" numeric(18, 2) DEFAULT '0',
	"valor_pago" numeric(18, 2) DEFAULT '0',
	"data_inicio" date,
	"data_termino" date,
	"status" varchar(50) DEFAULT 'ativo',
	"observacoes" text,
	"criado_por" varchar(255),
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrato_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"empresa_terceira_id" integer NOT NULL,
	"tipo" varchar(100) NOT NULL,
	"descricao" varchar(255),
	"competencia" varchar(7),
	"url" varchar(500),
	"data_vencimento" date,
	"status" varchar(50) DEFAULT 'pendente',
	"bloqueia_pagamento" boolean DEFAULT false,
	"observacoes" text,
	"enviado_por" varchar(255),
	"validado_por" varchar(255),
	"validado_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_medicao_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"medicao_id" integer NOT NULL,
	"contrato_item_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"descricao" varchar(500),
	"percentual_avanco_fisico" numeric(8, 4) DEFAULT '0',
	"percentual_acumulado_anterior" numeric(8, 4) DEFAULT '0',
	"percentual_medido_periodo" numeric(8, 4) DEFAULT '0',
	"valor_medido_periodo" numeric(18, 2) DEFAULT '0',
	"valor_acumulado" numeric(18, 2) DEFAULT '0',
	"observacoes" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_medicoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrato_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"empresa_terceira_id" integer NOT NULL,
	"obra_id" integer,
	"numero" integer DEFAULT 1,
	"periodo" varchar(7) NOT NULL,
	"data_referencia" date,
	"valor_medido" numeric(18, 2) DEFAULT '0',
	"valor_acumulado" numeric(18, 2) DEFAULT '0',
	"percentual_global" numeric(8, 4) DEFAULT '0',
	"status" varchar(50) DEFAULT 'rascunho',
	"aprovado_por" varchar(255),
	"aprovado_em" timestamp,
	"observacoes" text,
	"motivo_rejeicao" text,
	"gerado_automaticamente" boolean DEFAULT false,
	"criado_por" varchar(255),
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_br_obra" ON "budget_reallocations" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_bc_obra" ON "buyer_commissions" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_em_eng" ON "emergency_metrics" USING btree ("engenheiro_id");--> statement-breakpoint
CREATE INDEX "idx_onc_company" ON "oc_number_config" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pap_company" ON "purchase_accounts_payable" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pap_status" ON "purchase_accounts_payable" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pap_vencimento" ON "purchase_accounts_payable" USING btree ("data_vencimento");--> statement-breakpoint
CREATE INDEX "idx_par_company" ON "purchase_approval_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pc_company" ON "purchase_cancellations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pci_company" ON "purchase_catalog_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pn_cotacao" ON "purchase_negotiations" USING btree ("cotacao_id");--> statement-breakpoint
CREATE INDEX "idx_poi_ordem" ON "purchase_order_items" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "idx_po_company" ON "purchase_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_po_obra" ON "purchase_orders" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_po_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pqs_cotacao" ON "purchase_quotation_suppliers" USING btree ("cotacao_id");--> statement-breakpoint
CREATE INDEX "idx_pqt_token" ON "purchase_quotation_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_pq_company" ON "purchase_quotations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_preci_receb" ON "purchase_receipt_items" USING btree ("recebimento_id");--> statement-breakpoint
CREATE INDEX "idx_prec_ordem" ON "purchase_receipts" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "idx_pri_sc" ON "purchase_request_items" USING btree ("solicitacao_id");--> statement-breakpoint
CREATE INDEX "idx_pr_company" ON "purchase_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pr_obra" ON "purchase_requests" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_pr_status" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pr_emergencial" ON "purchase_requests" USING btree ("emergencial");--> statement-breakpoint
CREATE INDEX "idx_pret_ordem" ON "purchase_returns" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "idx_psl_company" ON "purchase_spending_limits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_sinapi_codigo" ON "sinapi_price_cache" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "idx_sc_company" ON "supplier_contracts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_se_supplier" ON "supplier_evaluations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_sph_item" ON "supplier_price_history" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "idx_sph_supplier" ON "supplier_price_history" USING btree ("supplier_id");