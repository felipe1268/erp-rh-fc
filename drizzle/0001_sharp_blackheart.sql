CREATE TABLE "almoxarifado_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"unidade" varchar(20) DEFAULT 'un' NOT NULL,
	"categoria" varchar(100),
	"codigo_interno" varchar(50),
	"quantidade_atual" numeric(14, 3) DEFAULT '0',
	"quantidade_minima" numeric(14, 3) DEFAULT '0',
	"observacoes" text,
	"ativo" boolean DEFAULT true,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "almoxarifado_movimentacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"obra_id" integer,
	"obra_nome" varchar(255),
	"motivo" text,
	"usuario_id" integer,
	"usuario_nome" varchar(255),
	"observacoes" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_adm_central" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"codigo" varchar(30),
	"descricao" varchar(255),
	"base" numeric(18, 2) DEFAULT '0',
	"tempo_obra" numeric(10, 2) DEFAULT '0',
	"encargos" numeric(18, 4) DEFAULT '0',
	"beneficios" numeric(18, 2) DEFAULT '0',
	"total" numeric(18, 2) DEFAULT '0',
	"is_header" boolean DEFAULT false,
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_despesas_financeiras" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"codigo" varchar(30),
	"descricao" varchar(255),
	"valor" numeric(18, 8) DEFAULT '0',
	"unidade" varchar(50),
	"is_header" boolean DEFAULT false,
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_fd" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"codigo_insumo" varchar(30),
	"descricao" varchar(255),
	"unidade" varchar(20),
	"qtd_orcada" numeric(18, 4) DEFAULT '0',
	"preco_unit" numeric(18, 6) DEFAULT '0',
	"total" numeric(18, 2) DEFAULT '0',
	"fornecedor" varchar(255),
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_indiretos" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"secao" varchar(20),
	"codigo" varchar(30),
	"descricao" varchar(255),
	"modalidade" varchar(50),
	"tipo_contrato" varchar(30),
	"quantidade" numeric(10, 3) DEFAULT '0',
	"meses_obra" numeric(10, 2) DEFAULT '0',
	"salario_base" numeric(18, 2) DEFAULT '0',
	"bonus_mensal" numeric(18, 2) DEFAULT '0',
	"tx_transferencia" numeric(10, 6) DEFAULT '0',
	"decimo_terceiro_ferias" numeric(18, 2) DEFAULT '0',
	"valor_hora" numeric(18, 6) DEFAULT '0',
	"total_mes" numeric(18, 2) DEFAULT '0',
	"total_obra" numeric(18, 2) DEFAULT '0',
	"unidade" varchar(20),
	"vida_util" numeric(10, 2) DEFAULT '0',
	"delta_t" numeric(10, 2),
	"pct_incidencia" numeric(10, 6) DEFAULT '1',
	"valor_unit" numeric(18, 2) DEFAULT '0',
	"total_linha" numeric(18, 2) DEFAULT '0',
	"is_header" boolean DEFAULT false,
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_taxa_comercializacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"codigo" varchar(30),
	"descricao" varchar(255),
	"percentual" numeric(10, 8) DEFAULT '0',
	"valor" numeric(18, 2) DEFAULT '0',
	"is_header" boolean DEFAULT false,
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bdi_tributos" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"codigo" varchar(30),
	"descricao" varchar(255),
	"aliquota" numeric(10, 8) DEFAULT '0',
	"base_calculo" varchar(50),
	"valor_calculado" numeric(18, 2) DEFAULT '0',
	"is_header" boolean DEFAULT false,
	"ordem" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composicao_insumos" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"composicao_codigo" varchar(100) NOT NULL,
	"insumo_codigo" varchar(100),
	"insumo_descricao" varchar(1000),
	"unidade" varchar(30),
	"quantidade" numeric(18, 6) DEFAULT '0',
	"preco_unitario" numeric(18, 4) DEFAULT '0',
	"alocacao_mat" numeric(18, 6) DEFAULT '0',
	"alocacao_mdo" numeric(18, 6) DEFAULT '0',
	"custo_unit_total" numeric(18, 6) DEFAULT '0',
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composicoes_catalogo" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(100),
	"descricao" varchar(1000) NOT NULL,
	"unidade" varchar(30),
	"tipo" varchar(100),
	"custoUnitMat" numeric(18, 4),
	"custoUnitMdo" numeric(18, 4),
	"custoUnitTotal" numeric(18, 4),
	"totalOrcamentos" integer DEFAULT 0 NOT NULL,
	"chaveNorm" varchar(500) NOT NULL,
	"ultimaAtualizacao" timestamp DEFAULT now() NOT NULL,
	"criadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_cotacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"numero_cotacao" varchar(20) NOT NULL,
	"solicitacao_id" integer,
	"obra_id" integer,
	"fornecedor_id" integer,
	"descricao" varchar(200),
	"prioridade" varchar(20) DEFAULT 'normal',
	"data_validade" varchar(10),
	"condicao_pagamento" varchar(100),
	"prazo_entrega_dias" integer,
	"status" varchar(30) DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"total" numeric(14, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_cotacoes_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"cotacao_id" integer NOT NULL,
	"solicitacao_item_id" integer,
	"descricao" varchar(300) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"preco_unitario" numeric(14, 4) DEFAULT '0',
	"desconto_pct" numeric(5, 2) DEFAULT '0',
	"total" numeric(14, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "compras_ordens" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"numero_oc" varchar(20) NOT NULL,
	"cotacao_id" integer,
	"obra_id" integer,
	"fornecedor_id" integer,
	"solicitante_id" integer,
	"data_entrega_prevista" varchar(10),
	"data_entrega_real" varchar(10),
	"status" varchar(30) DEFAULT 'pendente' NOT NULL,
	"aprovacao_status" varchar(30) DEFAULT 'aguardando',
	"aprovador_id" integer,
	"subtotal" numeric(14, 2) DEFAULT '0',
	"frete" numeric(14, 2) DEFAULT '0',
	"outras_despesas" numeric(14, 2) DEFAULT '0',
	"impostos" numeric(14, 2) DEFAULT '0',
	"desconto" numeric(14, 2) DEFAULT '0',
	"total" numeric(14, 2) DEFAULT '0',
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_ordens_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"ordem_id" integer NOT NULL,
	"solicitacao_item_id" integer,
	"descricao" varchar(300) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"quantidade_entregue" numeric(10, 3) DEFAULT '0',
	"preco_unitario" numeric(14, 4) DEFAULT '0',
	"total" numeric(14, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "compras_solicitacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"numero_sc" varchar(20) NOT NULL,
	"obra_id" integer,
	"projeto_id" integer,
	"solicitante_id" integer,
	"departamento" varchar(100),
	"titulo" varchar(200),
	"data_necessidade" varchar(10),
	"prioridade" varchar(20) DEFAULT 'normal',
	"status" varchar(30) DEFAULT 'rascunho' NOT NULL,
	"aprovacao_status" varchar(30) DEFAULT 'aguardando',
	"aprovador_id" integer,
	"aprovado_em" timestamp,
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_solicitacoes_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitacao_id" integer NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"quantidade_atendida" numeric(10, 3) DEFAULT '0',
	"status_item" varchar(30) DEFAULT 'pendente',
	"observacoes" text
);
--> statement-breakpoint
CREATE TABLE "encargos_sociais" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"grupo" varchar(5) NOT NULL,
	"codigo" varchar(5) NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(10, 4) DEFAULT '0' NOT NULL,
	"calculado" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"cnpj" varchar(18),
	"razao_social" varchar(255) NOT NULL,
	"nome_fantasia" varchar(255),
	"situacao_receita" varchar(50),
	"endereco" varchar(255),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"estado" varchar(2),
	"cep" varchar(10),
	"telefone" varchar(20),
	"email" varchar(255),
	"contato_nome" varchar(255),
	"contato_celular" varchar(20),
	"contato_email" varchar(255),
	"banco" varchar(100),
	"agencia" varchar(20),
	"conta" varchar(30),
	"pix" varchar(255),
	"categorias" json DEFAULT '[]'::json,
	"ativo" boolean DEFAULT true,
	"observacoes" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ia_cronograma_alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"atividade_id" integer,
	"nome_atividade" varchar(500),
	"data_alerta" date NOT NULL,
	"tipo_alerta" varchar(50) NOT NULL,
	"severidade" varchar(20) DEFAULT 'media' NOT NULL,
	"descricao" text,
	"reconhecido" boolean DEFAULT false NOT NULL,
	"gerado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ia_cronograma_cenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"company_id" integer,
	"titulo" varchar(200) NOT NULL,
	"descricao" text,
	"tipo_cenario" varchar(50) DEFAULT 'outro',
	"parametros" json DEFAULT '{}'::json,
	"resultado_ia" text,
	"plano_acao" text,
	"atividades_afetadas" json DEFAULT '[]'::json,
	"status" varchar(30) DEFAULT 'rascunho',
	"aprovado_em" timestamp,
	"aprovado_por" varchar(200),
	"criado_por" varchar(200),
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ia_cronograma_chat" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"company_id" integer,
	"sessao_id" varchar(50) NOT NULL,
	"role" varchar(20) NOT NULL,
	"conteudo" text NOT NULL,
	"tipo" varchar(30) DEFAULT 'chat',
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ia_cronograma_conhecimento" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"palavras_chave" text NOT NULL,
	"tipo_atividade" varchar(100),
	"recursos_equipamentos" json DEFAULT '[]'::json,
	"recursos_efetivo" json DEFAULT '[]'::json,
	"sensibilidade_clima" json DEFAULT '{}'::json,
	"contexto_obra" text,
	"confirmacoes" integer DEFAULT 0 NOT NULL,
	"rejeicoes" integer DEFAULT 0 NOT NULL,
	"fonte" varchar(50) DEFAULT 'ia',
	"criado_por" varchar(200),
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ia_cronograma_monitoramento" (
	"id" serial PRIMARY KEY NOT NULL,
	"cenario_id" integer NOT NULL,
	"projeto_id" integer NOT NULL,
	"company_id" integer,
	"semana" varchar(10) NOT NULL,
	"avanco_real" numeric(6, 2),
	"spi_fim" numeric(6, 4),
	"custo_realizado" numeric(16, 2),
	"observacao" text,
	"status" varchar(20) DEFAULT 'no_prazo',
	"registrado_por" varchar(200),
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "insumos_catalogo" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(100),
	"descricao" varchar(1000) NOT NULL,
	"unidade" varchar(30),
	"tipo" varchar(100),
	"precoUnitario" numeric(18, 4),
	"precoMin" numeric(18, 4),
	"precoMax" numeric(18, 4),
	"precoMedio" numeric(18, 4),
	"totalOrcamentos" integer DEFAULT 0 NOT NULL,
	"totalQuantidade" numeric(18, 4),
	"chaveNorm" varchar(500) NOT NULL,
	"ultimaAtualizacao" timestamp DEFAULT now() NOT NULL,
	"criadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos_grupos" (
	"id" serial NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(150) NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lob_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"buffer_minimo_dias" integer DEFAULT 5 NOT NULL,
	"ritmo_alvo_pavs_semana" numeric(10, 2) DEFAULT '1.0',
	"pavimentos_excluidos" json DEFAULT '[]'::json,
	"disciplinas_config" json DEFAULT '[]'::json,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now(),
	CONSTRAINT "lob_config_projeto_id_unique" UNIQUE("projeto_id")
);
--> statement-breakpoint
CREATE TABLE "mas_controle_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"login_email" varchar(255),
	"token" varchar(500),
	"api_ok" boolean DEFAULT false,
	"migrated_at" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mas_controle_config_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "migration_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fonte" varchar(50) DEFAULT 'mas_controle' NOT NULL,
	"tipo_dado" varchar(50) NOT NULL,
	"total_encontrado" integer DEFAULT 0,
	"total_importado" integer DEFAULT 0,
	"total_duplicado" integer DEFAULT 0,
	"total_erro" integer DEFAULT 0,
	"detalhes" json DEFAULT '[]'::json,
	"executado_por_id" integer,
	"executado_por_nome" varchar(255),
	"via" varchar(20) DEFAULT 'csv',
	"executado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_parametros" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"ls" numeric(10, 4) DEFAULT '0' NOT NULL,
	"he" numeric(10, 4) DEFAULT '0' NOT NULL,
	"criadoEm" timestamp DEFAULT now() NOT NULL,
	"atualizadoEm" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orcamento_parametros_companyId_unique" UNIQUE("companyId")
);
--> statement-breakpoint
CREATE TABLE "orcamento_revisoes" (
	"id" serial NOT NULL,
	"orcamento_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"revisao_label" varchar(50),
	"user_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"total_custo_antes" numeric(18, 2) DEFAULT '0',
	"total_custo_depois" numeric(18, 2) DEFAULT '0',
	"total_venda_antes" numeric(18, 2) DEFAULT '0',
	"total_venda_depois" numeric(18, 2) DEFAULT '0',
	"itens_adicionados" integer DEFAULT 0,
	"itens_removidos" integer DEFAULT 0,
	"itens_alterados" integer DEFAULT 0,
	"resumo" text,
	"diff_json" text
);
--> statement-breakpoint
CREATE TABLE "orcamento_sec_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"secId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"eapCodigo" varchar(50) NOT NULL,
	"nivel" integer NOT NULL,
	"tipo" varchar(50),
	"descricao" varchar(1000) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(18, 4),
	"custoUnitMat" numeric(18, 4),
	"custoUnitMdo" numeric(18, 4),
	"custoUnitTotal" numeric(18, 4),
	"vendaUnitTotal" numeric(18, 4),
	"custoTotalMat" numeric(18, 2),
	"custoTotalMdo" numeric(18, 2),
	"custoTotal" numeric(18, 2),
	"vendaTotal" numeric(18, 2),
	"ordem" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_secs" (
	"id" serial PRIMARY KEY NOT NULL,
	"orcamentoId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"numero" integer NOT NULL,
	"codigo" varchar(100) NOT NULL,
	"descricao" varchar(500),
	"fase" varchar(30) DEFAULT 'elaboracao' NOT NULL,
	"bdiPercentual" numeric(8, 4),
	"totalCusto" numeric(18, 2) DEFAULT '0',
	"totalVenda" numeric(18, 2) DEFAULT '0',
	"totalMateriais" numeric(18, 2) DEFAULT '0',
	"totalMdo" numeric(18, 2) DEFAULT '0',
	"totalEquipamentos" numeric(18, 2) DEFAULT '0',
	"totalMeta" numeric(18, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "planejamento_atividades" (
	"id" serial PRIMARY KEY NOT NULL,
	"revisao_id" integer NOT NULL,
	"projeto_id" integer NOT NULL,
	"eap_codigo" varchar(50),
	"nome" varchar(500) NOT NULL,
	"nivel" integer DEFAULT 1,
	"data_inicio" date,
	"data_fim" date,
	"duracao_dias" integer DEFAULT 0,
	"predecessora" varchar(100),
	"peso_financeiro" numeric(10, 4) DEFAULT '0',
	"recurso_principal" varchar(200),
	"quantidade_planejada" numeric(18, 4) DEFAULT '0',
	"unidade" varchar(30),
	"ordem" integer DEFAULT 0,
	"is_grupo" boolean DEFAULT false,
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planejamento_avancos" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"atividade_id" integer NOT NULL,
	"revisao_id" integer NOT NULL,
	"semana" date NOT NULL,
	"percentual_acumulado" numeric(8, 4) DEFAULT '0',
	"percentual_semanal" numeric(8, 4) DEFAULT '0',
	"observacao" text,
	"criado_em" timestamp DEFAULT now(),
	"criado_por" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "planejamento_compras" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"revisao" integer DEFAULT 1 NOT NULL,
	"fonte" varchar(20) DEFAULT 'manual' NOT NULL,
	"item" varchar(300) NOT NULL,
	"unidade" varchar(50) DEFAULT 'un',
	"quantidade" numeric(18, 3) DEFAULT '1',
	"custo_unitario" numeric(18, 2) DEFAULT '0',
	"data_necessaria" date NOT NULL,
	"atividade_data_inicio" date,
	"lead_time" integer DEFAULT 30 NOT NULL,
	"eap_codigo" varchar(100),
	"data_pedido" date,
	"status" varchar(50) DEFAULT 'pendente',
	"fornecedor" varchar(200),
	"observacoes" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planejamento_compras_revisoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"revisao" integer NOT NULL,
	"descricao" text,
	"lead_time" integer DEFAULT 30 NOT NULL,
	"total_itens" integer DEFAULT 0 NOT NULL,
	"total_custo" numeric(18, 2) DEFAULT '0' NOT NULL,
	"gerado_em" timestamp DEFAULT now(),
	"gerado_por_revisao_cronograma" integer
);
--> statement-breakpoint
CREATE TABLE "planejamento_medicao_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"tipo_medicao" varchar(20) DEFAULT 'avanco' NOT NULL,
	"dia_corte" integer DEFAULT 25 NOT NULL,
	"entrada" numeric(18, 2) DEFAULT '0',
	"numero_parcelas" integer DEFAULT 6,
	"inicio_faturamento" date,
	"sinal_pct" numeric(10, 2) DEFAULT '0',
	"retencao_pct" numeric(10, 2) DEFAULT '5',
	"data_inicio_obra" date,
	"bloqueado" boolean DEFAULT false,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now(),
	CONSTRAINT "planejamento_medicao_config_projeto_id_unique" UNIQUE("projeto_id")
);
--> statement-breakpoint
CREATE TABLE "planejamento_medicoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"valor_previsto" numeric(18, 2) DEFAULT '0',
	"valor_medido" numeric(18, 2) DEFAULT '0',
	"percentual_previsto" numeric(10, 4) DEFAULT '0',
	"percentual_medido" numeric(10, 4) DEFAULT '0',
	"status" varchar(50) DEFAULT 'pendente',
	"observacoes" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planejamento_projetos" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer,
	"orcamento_id" integer,
	"nome" varchar(300) NOT NULL,
	"cliente" varchar(200),
	"local" varchar(200),
	"responsavel" varchar(200),
	"data_inicio" date,
	"data_termino_contratual" date,
	"valor_contrato" numeric(18, 2) DEFAULT '0',
	"status" varchar(50) DEFAULT 'Em andamento',
	"descricao" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planejamento_refis" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"semana" date NOT NULL,
	"numero" integer,
	"data_emissao" date,
	"avanco_previsto" numeric(8, 4) DEFAULT '0',
	"avanco_realizado" numeric(8, 4) DEFAULT '0',
	"avanco_semanal_previsto" numeric(8, 4) DEFAULT '0',
	"avanco_semanal_realizado" numeric(8, 4) DEFAULT '0',
	"spi" numeric(10, 4) DEFAULT '1',
	"cpi" numeric(10, 4) DEFAULT '1',
	"custo_previsto" numeric(18, 2) DEFAULT '0',
	"custo_realizado" numeric(18, 2) DEFAULT '0',
	"observacoes" text,
	"status" varchar(50) DEFAULT 'rascunho',
	"criado_em" timestamp DEFAULT now(),
	"criado_por" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "planejamento_revisoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"descricao" varchar(200),
	"data_revisao" date NOT NULL,
	"motivo" text,
	"responsavel" varchar(200),
	"aprovado_por" varchar(200),
	"status" varchar(50) DEFAULT 'aprovada',
	"observacao" text,
	"is_baseline" boolean DEFAULT false,
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "orcamento_bdi" ADD COLUMN "nomeAba" varchar(100) DEFAULT 'BDI';--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "data_inicio" date;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "eventual_atraso_meses" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "dissidio_pct" numeric(6, 4) DEFAULT '0.0500';--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "dissidio_data" date;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "dissidio_incidencia_meses" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "valor_negociado" numeric(18, 2);--> statement-breakpoint
CREATE INDEX "idx_bdiadm_orc" ON "bdi_adm_central" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "idx_bdidf_orc" ON "bdi_despesas_financeiras" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "idx_bdifd_orc" ON "bdi_fd" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "idx_bdind_orc" ON "bdi_indiretos" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "idx_bditc_orc" ON "bdi_taxa_comercializacao" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "idx_bditrib_orc" ON "bdi_tributos" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "ci_company" ON "composicao_insumos" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ci_comp" ON "composicao_insumos" USING btree ("composicao_codigo");--> statement-breakpoint
CREATE INDEX "ci_insumo" ON "composicao_insumos" USING btree ("insumo_codigo");--> statement-breakpoint
CREATE INDEX "compc_company" ON "composicoes_catalogo" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "compc_codigo" ON "composicoes_catalogo" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "compc_chave" ON "composicoes_catalogo" USING btree ("chaveNorm");--> statement-breakpoint
CREATE INDEX "insc_company" ON "insumos_catalogo" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "insc_codigo" ON "insumos_catalogo" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "insc_chave" ON "insumos_catalogo" USING btree ("chaveNorm");--> statement-breakpoint
CREATE INDEX "ig_company" ON "insumos_grupos" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_orc_revisoes_orc" ON "orcamento_revisoes" USING btree ("orcamento_id");--> statement-breakpoint
CREATE INDEX "seci_sec" ON "orcamento_sec_itens" USING btree ("secId");--> statement-breakpoint
CREATE INDEX "seci_company" ON "orcamento_sec_itens" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "sec_orcamento" ON "orcamento_secs" USING btree ("orcamentoId");--> statement-breakpoint
CREATE INDEX "sec_company" ON "orcamento_secs" USING btree ("companyId");