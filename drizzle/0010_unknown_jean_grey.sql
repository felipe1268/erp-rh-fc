CREATE TABLE `alertas_terceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresa_terceira_id` int NOT NULL,
	`company_id` int NOT NULL,
	`tipo_alerta` enum('documento_vencendo','obrigacao_pendente','documento_vencido','obrigacao_atrasada') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`data_vencimento` timestamp,
	`email_enviado` tinyint DEFAULT 0,
	`email_enviado_em` timestamp,
	`resolvido` tinyint DEFAULT 0,
	`resolvido_em` timestamp,
	`resolvido_por` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alertas_terceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avaliacao_avaliadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`avaliadorUserId` int NOT NULL,
	`employeeId` int NOT NULL,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `avaliacao_ciclos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`questionarioId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`dataInicio` date NOT NULL,
	`dataFim` date NOT NULL,
	`status` enum('rascunho','aberto','fechado') NOT NULL DEFAULT 'rascunho',
	`criadoPor` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `avaliacao_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`notaMinima` decimal(5,2) DEFAULT '0',
	`notaMaxima` decimal(5,2) DEFAULT '5',
	`permitirAutoAvaliacao` tinyint DEFAULT 0,
	`exibirRankingParaAvaliadores` tinyint DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `avaliacao_perguntas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionarioId` int NOT NULL,
	`texto` text NOT NULL,
	`tipo` enum('nota_1_5','nota_1_10','sim_nao','texto_livre') NOT NULL DEFAULT 'nota_1_5',
	`peso` int NOT NULL DEFAULT 1,
	`ordem` int NOT NULL DEFAULT 0,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `avaliacao_questionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`frequencia` enum('diaria','semanal','mensal','trimestral','semestral','anual') NOT NULL DEFAULT 'mensal',
	`ativo` tinyint NOT NULL DEFAULT 1,
	`criadoPor` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `avaliacao_respostas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`avaliacaoId` int NOT NULL,
	`perguntaId` int NOT NULL,
	`valor` varchar(20),
	`textoLivre` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `avaliacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cicloId` int NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`avaliadorId` int NOT NULL,
	`avaliadorNome` varchar(255),
	`status` enum('pendente','em_andamento','finalizada') NOT NULL DEFAULT 'pendente',
	`notaFinal` decimal(5,2),
	`observacoes` text,
	`tempoAvaliacao` int,
	`finalizadaEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `empresas_terceiras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`razao_social` varchar(255) NOT NULL,
	`nome_fantasia` varchar(255),
	`cnpj` varchar(20) NOT NULL,
	`inscricao_estadual` varchar(30),
	`inscricao_municipal` varchar(30),
	`cep` varchar(10),
	`logradouro` varchar(255),
	`numero` varchar(20),
	`complemento` varchar(100),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`estado` varchar(2),
	`telefone` varchar(30),
	`celular` varchar(30),
	`email` varchar(255),
	`email_financeiro` varchar(255),
	`responsavel_nome` varchar(255),
	`responsavel_cargo` varchar(100),
	`tipo_servico` varchar(255),
	`descricao_servico` text,
	`pgr_url` varchar(500),
	`pgr_validade` timestamp,
	`pcmso_url` varchar(500),
	`pcmso_validade` timestamp,
	`contrato_social_url` varchar(500),
	`alvara_url` varchar(500),
	`alvara_validade` timestamp,
	`seguro_vida_url` varchar(500),
	`seguro_vida_validade` timestamp,
	`banco` varchar(100),
	`agencia` varchar(20),
	`conta` varchar(30),
	`tipo_conta` enum('corrente','poupanca'),
	`titular_conta` varchar(255),
	`cpf_cnpj_titular` varchar(20),
	`forma_pagamento` enum('pix','boleto','transferencia','deposito'),
	`pix_chave` varchar(255),
	`pix_tipo_chave` enum('cpf','cnpj','email','telefone','aleatoria'),
	`status_terceira` enum('ativa','suspensa','inativa') NOT NULL DEFAULT 'ativa',
	`observacoes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`created_by` varchar(255),
	`deleted_at` timestamp,
	CONSTRAINT `empresas_terceiras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('saida_vale','saida_pagamento','saida_he','saida_vr','saida_vt','saida_encargos','entrada_desconto','ajuste') NOT NULL,
	`categoria` varchar(50) NOT NULL DEFAULT 'folha_pagamento',
	`subcategoria` varchar(100),
	`mesCompetencia` varchar(7) NOT NULL,
	`dataPrevista` date NOT NULL,
	`dataEfetiva` date,
	`valor` varchar(20) NOT NULL,
	`status` enum('previsto','consolidado','pago','cancelado') NOT NULL DEFAULT 'previsto',
	`employeeId` int,
	`employeeName` varchar(255),
	`obraId` int,
	`obraNome` varchar(255),
	`descricao` text,
	`origemTipo` varchar(50),
	`origemId` int,
	`criadoPor` varchar(255),
	`atualizadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `funcionarios_terceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresa_terceira_id` int NOT NULL,
	`company_id` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cpf` varchar(14),
	`rg` varchar(20),
	`data_nascimento` timestamp,
	`foto_url` varchar(500),
	`funcao` varchar(100),
	`telefone` varchar(30),
	`email` varchar(255),
	`aso_url` varchar(500),
	`aso_validade` timestamp,
	`treinamento_nr_url` varchar(500),
	`treinamento_nr_validade` timestamp,
	`certificados_url` varchar(500),
	`obra_id` int,
	`obra_nome` varchar(255),
	`status_aptidao_terceiro` enum('apto','inapto','pendente') NOT NULL DEFAULT 'pendente',
	`motivo_inapto` text,
	`nome_completo` varchar(255),
	`data_admissao` timestamp,
	`aso_doc_url` varchar(500),
	`nr35_validade` timestamp,
	`nr35_doc_url` varchar(500),
	`nr10_validade` timestamp,
	`nr10_doc_url` varchar(500),
	`nr33_validade` timestamp,
	`nr33_doc_url` varchar(500),
	`integracao_doc_url` varchar(500),
	`observacao_aprovacao` text,
	`aprovado_por` varchar(255),
	`data_aprovacao` timestamp,
	`cadastrado_por` varchar(50) DEFAULT 'rh',
	`status_func_terceiro` enum('ativo','inativo','afastado','desligado') NOT NULL DEFAULT 'ativo',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `funcionarios_terceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lancamentos_parceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parceiro_id` int NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`employee_nome` varchar(255) NOT NULL,
	`data_compra` timestamp NOT NULL,
	`descricao_itens` text,
	`valor` decimal(10,2) NOT NULL,
	`comprovante_url` varchar(500),
	`status_lancamento_parceiro` enum('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`motivo_rejeicao` text,
	`comentario_admin` text,
	`aprovado_por` varchar(255),
	`aprovado_em` timestamp,
	`competencia_desconto` varchar(7),
	`lancado_por` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lancamentos_parceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `module_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`module_key` varchar(50) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`enabled_at` timestamp DEFAULT (now()),
	`disabled_at` timestamp,
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `module_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obrigacoes_mensais_terceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresa_terceira_id` int NOT NULL,
	`company_id` int NOT NULL,
	`competencia` varchar(7) NOT NULL,
	`fgts_url` varchar(500),
	`fgts_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`inss_url` varchar(500),
	`inss_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`folha_pagamento_url` varchar(500),
	`folha_pagamento_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`comprovante_pagamento_url` varchar(500),
	`comprovante_pagamento_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`gps_url` varchar(500),
	`gps_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`cnd_url` varchar(500),
	`cnd_status` enum('pendente','enviado','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`status_geral_obrigacao` enum('pendente','parcial','completo','atrasado') NOT NULL DEFAULT 'pendente',
	`observacoes` text,
	`validado_por` varchar(255),
	`validado_em` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `obrigacoes_mensais_terceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pagamentos_parceiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parceiro_id` int NOT NULL,
	`company_id` int NOT NULL,
	`competencia_pagamento` varchar(7) NOT NULL,
	`valor_total` decimal(10,2) NOT NULL,
	`status_pagamento_parceiro` enum('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
	`data_pagamento` timestamp,
	`comprovante_pagamento_url` varchar(500),
	`observacoes_pagamento` text,
	`pago_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pagamentos_parceiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parceiros_conveniados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`razao_social` varchar(255) NOT NULL,
	`nome_fantasia` varchar(255),
	`cnpj` varchar(20) NOT NULL,
	`inscricao_estadual` varchar(30),
	`inscricao_municipal` varchar(30),
	`cep` varchar(10),
	`logradouro` varchar(255),
	`numero` varchar(20),
	`complemento` varchar(100),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`estado` varchar(2),
	`telefone` varchar(30),
	`celular` varchar(30),
	`email_principal` varchar(255),
	`email_financeiro` varchar(255),
	`responsavel_nome` varchar(255),
	`responsavel_cargo` varchar(100),
	`tipo_convenio` enum('farmacia','posto_combustivel','restaurante','mercado','outros') NOT NULL,
	`tipo_convenio_outro` varchar(100),
	`banco_parceiro` varchar(100),
	`agencia_parceiro` varchar(20),
	`conta_parceiro` varchar(30),
	`tipo_conta_parceiro` enum('corrente','poupanca'),
	`titular_conta_parceiro` varchar(255),
	`cpf_cnpj_titular_parceiro` varchar(20),
	`forma_pagamento_parceiro` enum('pix','boleto','transferencia','deposito'),
	`pix_chave_parceiro` varchar(255),
	`pix_tipo_chave_parceiro` enum('cpf','cnpj','email','telefone','aleatoria'),
	`dia_fechamento` int,
	`prazo_pagamento` int,
	`limite_mensal_por_colaborador` decimal(10,2),
	`contrato_convenio_url` varchar(500),
	`contrato_social_url_parceiro` varchar(500),
	`alvara_url_parceiro` varchar(500),
	`status_parceiro` enum('ativo','suspenso','inativo') NOT NULL DEFAULT 'ativo',
	`observacoes_parceiro` text,
	`login_email` varchar(255),
	`login_senha_hash` varchar(255),
	`acesso_externo_ativo` tinyint DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`created_by` varchar(255),
	`deleted_at` timestamp,
	CONSTRAINT `parceiros_conveniados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesOrigem` varchar(7) NOT NULL,
	`mesDesconto` varchar(7) NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('falta','atraso','saida_antecipada','he_nao_autorizada','outro') NOT NULL,
	`descricao` text,
	`valorDesconto` varchar(20) NOT NULL,
	`valorVrDesconto` varchar(20) DEFAULT '0',
	`valorVtDesconto` varchar(20) DEFAULT '0',
	`valorTotal` varchar(20) NOT NULL,
	`timecardDailyId` int,
	`paymentId` int,
	`status` enum('pendente','aplicado','abonado','cancelado') NOT NULL DEFAULT 'pendente',
	`abonadoPor` varchar(255),
	`abonadoEm` timestamp,
	`motivoAbono` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `payroll_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`periodId` int,
	`salarioBrutoMes` varchar(20) NOT NULL,
	`percentualAdiantamento` int DEFAULT 40,
	`valorAdiantamento` varchar(20) NOT NULL,
	`valorHorasExtras` varchar(20) DEFAULT '0',
	`horasExtrasQtd` varchar(10) DEFAULT '0',
	`valorTotalVale` varchar(20) NOT NULL,
	`bloqueado` tinyint NOT NULL DEFAULT 0,
	`motivoBloqueio` varchar(255),
	`faltasNoPeriodo` int DEFAULT 0,
	`valorHora` varchar(20),
	`cargaHorariaDiaria` int DEFAULT 8,
	`diasUteisNoMes` int,
	`status` enum('calculado','aprovado','pago','cancelado') NOT NULL DEFAULT 'calculado',
	`dataPagamento` date,
	`aprovadoPor` varchar(255),
	`aprovadoEm` timestamp,
	`bancoDestino` varchar(100),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `payroll_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipo` enum('ponto_nao_importado','vale_nao_gerado','pagamento_pendente','divergencias_aferidas','funcionario_bloqueado','prazo_proximo') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`prioridade` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`lido` tinyint NOT NULL DEFAULT 0,
	`lidoEm` timestamp,
	`lidoPor` varchar(255),
	`resolvido` tinyint NOT NULL DEFAULT 0,
	`resolvidoEm` timestamp,
	`resolvidoPor` varchar(255),
	`employeeId` int,
	`periodId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `payroll_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`periodId` int,
	`valorHora` varchar(20),
	`cargaHorariaDiaria` int DEFAULT 8,
	`diasUteisNoMes` int,
	`salarioBrutoMes` varchar(20) NOT NULL,
	`horasExtrasValor` varchar(20) DEFAULT '0',
	`adicionaisValor` varchar(20) DEFAULT '0',
	`adicionaisDetalhes` json,
	`totalProventos` varchar(20) NOT NULL,
	`descontoAdiantamento` varchar(20) DEFAULT '0',
	`descontoFaltas` varchar(20) DEFAULT '0',
	`descontoFaltasQtd` int DEFAULT 0,
	`descontoAtrasos` varchar(20) DEFAULT '0',
	`descontoAtrasosMinutos` int DEFAULT 0,
	`descontoVrFaltas` varchar(20) DEFAULT '0',
	`descontoVtFaltas` varchar(20) DEFAULT '0',
	`descontoPensao` varchar(20) DEFAULT '0',
	`descontoInss` varchar(20) DEFAULT '0',
	`descontoIrrf` varchar(20) DEFAULT '0',
	`descontoFgts` varchar(20) DEFAULT '0',
	`descontoEpi` varchar(20) DEFAULT '0',
	`descontoOutros` varchar(20) DEFAULT '0',
	`descontoOutrosDetalhes` json,
	`totalDescontos` varchar(20) NOT NULL,
	`acertoEscuroValor` varchar(20) DEFAULT '0',
	`acertoEscuroDetalhes` json,
	`salarioLiquido` varchar(20) NOT NULL,
	`status` enum('simulado','consolidado','pago','cancelado') NOT NULL DEFAULT 'simulado',
	`dataPagamento` date,
	`dataPagamentoPrevista` date,
	`consolidadoPor` varchar(255),
	`consolidadoEm` timestamp,
	`bancoDestino` varchar(100),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`pontoInicio` date,
	`pontoFim` date,
	`escuroInicio` date,
	`escuroFim` date,
	`status` enum('aberta','ponto_importado','vale_gerado','pagamento_simulado','consolidada','travada') NOT NULL DEFAULT 'aberta',
	`pontoImportadoEm` timestamp,
	`pontoImportadoPor` varchar(255),
	`valeGeradoEm` timestamp,
	`valeGeradoPor` varchar(255),
	`pagamentoSimuladoEm` timestamp,
	`pagamentoSimuladoPor` varchar(255),
	`consolidadoEm` timestamp,
	`consolidadoPor` varchar(255),
	`travadoEm` timestamp,
	`travadoPor` varchar(255),
	`afericaoRealizada` tinyint NOT NULL DEFAULT 0,
	`afericaoEm` timestamp,
	`afericaoPor` varchar(255),
	`totalDivergenciasAferidas` int DEFAULT 0,
	`retificadoEm` timestamp,
	`retificadoPor` varchar(255),
	`motivoRetificacao` text,
	`totalFuncionarios` int DEFAULT 0,
	`totalSalarioBruto` varchar(20) DEFAULT '0',
	`totalVale` varchar(20) DEFAULT '0',
	`totalHorasExtras` varchar(20) DEFAULT '0',
	`totalDescontos` varchar(20) DEFAULT '0',
	`totalLiquido` varchar(20) DEFAULT '0',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `portal_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` enum('terceiro','parceiro') NOT NULL,
	`empresa_terceira_id` int,
	`parceiro_id` int,
	`company_id` int NOT NULL,
	`cnpj` varchar(20) NOT NULL,
	`senha_hash` varchar(255) NOT NULL,
	`nome_empresa` varchar(255),
	`email_responsavel` varchar(255),
	`nome_responsavel` varchar(255),
	`primeiro_acesso` tinyint NOT NULL DEFAULT 1,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`ultimo_login` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portal_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `timecard_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`data` date NOT NULL,
	`mesCompetencia` varchar(7) NOT NULL,
	`statusDia` enum('registrado','escuro','aferido') NOT NULL DEFAULT 'registrado',
	`entrada1` varchar(10),
	`saida1` varchar(10),
	`entrada2` varchar(10),
	`saida2` varchar(10),
	`entrada3` varchar(10),
	`saida3` varchar(10),
	`horasTrabalhadas` varchar(10),
	`horasExtras` varchar(10),
	`horasNoturnas` varchar(10),
	`isFalta` tinyint NOT NULL DEFAULT 0,
	`isAtraso` tinyint NOT NULL DEFAULT 0,
	`isSaidaAntecipada` tinyint NOT NULL DEFAULT 0,
	`minutosAtraso` int DEFAULT 0,
	`minutosSaidaAntecipada` int DEFAULT 0,
	`tipoDia` enum('util','sabado','domingo','feriado','compensado') NOT NULL DEFAULT 'util',
	`timeRecordId` int,
	`obraId` int,
	`statusAnterior` enum('registrado','escuro','aferido'),
	`afericaoResultado` enum('ok','falta','atraso','saida_antecipada','divergencia'),
	`afericaoObs` text,
	`afericaoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `user_group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `user_group_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`rota` varchar(200) NOT NULL,
	`can_view` tinyint NOT NULL DEFAULT 1,
	`can_edit` tinyint NOT NULL DEFAULT 0,
	`can_create` tinyint NOT NULL DEFAULT 0,
	`can_delete` tinyint NOT NULL DEFAULT 0,
	`ocultar_valores` tinyint NOT NULL DEFAULT 0,
	`ocultar_documentos` tinyint NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` varchar(255),
	`cor` varchar(20) DEFAULT '#6b7280',
	`icone` varchar(50) DEFAULT 'Users',
	`ativo` tinyint NOT NULL DEFAULT 1,
	`somente_visualizacao` tinyint NOT NULL DEFAULT 1,
	`ocultar_dados_sensiveis` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `warning_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('Verbal','Escrita','Suspensao','JustaCausa') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`textoModelo` text NOT NULL,
	`baseJuridica` text,
	`isDefault` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
DROP INDEX `et_company` ON `email_templates`;--> statement-breakpoint
DROP INDEX `et_company_tipo` ON `email_templates`;--> statement-breakpoint
DROP INDEX `mbc_company` ON `meal_benefit_configs`;--> statement-breakpoint
DROP INDEX `mbc_obra` ON `meal_benefit_configs`;--> statement-breakpoint
DROP INDEX `time_records_emp_date` ON `time_records`;--> statement-breakpoint
DROP INDEX `time_records_company_mes` ON `time_records`;--> statement-breakpoint
DROP INDEX `uc_user` ON `user_companies`;--> statement-breakpoint
DROP INDEX `uc_company` ON `user_companies`;--> statement-breakpoint
ALTER TABLE `accidents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `action_plans` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `advances` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `asos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `atestados` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `audits` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `blacklist_reactivation_requests` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `chemicals` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `cipa_elections` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `cipa_meetings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `cipa_members` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `company_bank_accounts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `company_documents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `convencao_coletiva` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `custom_exams` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `datajud_alerts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `datajud_auto_check_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dds` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `deviations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dissidio_funcionarios` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dissidios` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dixi_afd_importacoes` MODIFY COLUMN `dataImportacao` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dixi_afd_importacoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dixi_afd_marcacoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dixi_devices` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dixi_name_mappings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `document_templates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `tipo` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `assunto` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `ativo` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employee_aptidao` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employee_documents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employee_history` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employee_site_history` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `tipoContrato` enum('CLT','PJ','Temporario','Estagio','Aprendiz');--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `jornadaTrabalho` text;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `epi_deliveries` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `epi_discount_alerts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `epis` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `equipment` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_audit_log` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_avaliacoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_avaliadores` MODIFY COLUMN `passwordHash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_avaliadores` MODIFY COLUMN `mustChangePassword` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `eval_avaliadores` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_climate_answers` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_climate_external_tokens` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_climate_questions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_climate_responses` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_climate_surveys` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_criteria` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_criteria_revisions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_external_participants` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_pillars` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_scores` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_survey_answers` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_survey_evaluators` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_survey_questions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_survey_responses` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `eval_surveys` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `extinguishers` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `extra_payments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `feriados` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `folha_itens` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `folha_lancamentos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fornecedores_epi` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `golden_rules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `he_solicitacoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `hydrants` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `insurance_alert_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `insurance_alert_recipients` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `insurance_alerts_log` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `job_functions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `manual_obra_assignments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `meal_benefit_configs` MODIFY COLUMN `createdAt` timestamp DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `meal_benefit_configs` MODIFY COLUMN `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `menu_config` MODIFY COLUMN `updatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `monthly_payroll_summary` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notification_logs` MODIFY COLUMN `lido` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_logs` MODIFY COLUMN `lido` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notification_logs` MODIFY COLUMN `enviadoEm` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notification_logs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarContratacao` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarDemissao` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarTransferencia` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarTransferencia` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarAfastamento` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `notificarAfastamento` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `ativo` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notification_recipients` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `obra_funcionarios` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `obra_horas_rateio` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `obra_ponto_inconsistencies` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `obra_sns` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `obras` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_uploads` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `permissions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `pj_contracts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `pj_medicoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `pj_payments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `ponto_consolidacao` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `ponto_descontos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `ponto_descontos_resumo` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `processo_analises` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `processo_aprendizado` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `processo_documentos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `processos_andamentos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` MODIFY COLUMN `fase` enum('conhecimento','instrucao','decisoria','recursal','execucao','encerrado') NOT NULL DEFAULT 'conhecimento';--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `risks` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `sectors` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `system_criteria` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `system_revisions` MODIFY COLUMN `dataPublicacao` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `system_revisions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `termination_notices` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `time_inconsistencies` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `time_records` MODIFY COLUMN `fonte` varchar(50) DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `time_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `training_documents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `trainings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `unmatched_dixi_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_companies` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_permissions` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_profiles` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vacation_periods` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vr_benefits` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `warnings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `dissidios` ADD `numeroCct` varchar(100);--> statement-breakpoint
ALTER TABLE `dissidios` ADD `percentualInpc` varchar(10);--> statement-breakpoint
ALTER TABLE `dissidios` ADD `valorVa` varchar(20);--> statement-breakpoint
ALTER TABLE `dissidios` ADD `valorVt` varchar(20);--> statement-breakpoint
ALTER TABLE `email_templates` ADD `corpo` text NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `vrBeneficio` varchar(20);--> statement-breakpoint
ALTER TABLE `obras` ADD `usar_convencao_matriz` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `obras` ADD `convencao_id` int;--> statement-breakpoint
ALTER TABLE `obras` ADD `convencao_divergencias` text;--> statement-breakpoint
ALTER TABLE `processo_analises` ADD `modeloIa` varchar(100);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_id` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_ultima_consulta` timestamp;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_ultima_atualizacao` varchar(100);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_grau` varchar(20);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_classe` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_assuntos` json;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_orgao_julgador` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_sistema` varchar(100);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_formato` varchar(50);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_movimentos` json;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_total_movimentos` int;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajud_auto_detectado` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `termination_notices` ADD `revertidoManualmente` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `vacation_periods` ADD `dataAlteradaPeloRh` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `valorVa` varchar(20) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `warnings` ADD `numeroSequencial` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `warnings` ADD `diasSupensao` int;--> statement-breakpoint
CREATE INDEX `aa_company` ON `avaliacao_avaliadores` (`companyId`);--> statement-breakpoint
CREATE INDEX `aa_avaliador` ON `avaliacao_avaliadores` (`avaliadorUserId`);--> statement-breakpoint
CREATE INDEX `aa_employee` ON `avaliacao_avaliadores` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ac_company` ON `avaliacao_ciclos` (`companyId`);--> statement-breakpoint
CREATE INDEX `ac_questionario` ON `avaliacao_ciclos` (`questionarioId`);--> statement-breakpoint
CREATE INDEX `acfg_company` ON `avaliacao_config` (`companyId`);--> statement-breakpoint
CREATE INDEX `ap_questionario` ON `avaliacao_perguntas` (`questionarioId`);--> statement-breakpoint
CREATE INDEX `aq_company` ON `avaliacao_questionarios` (`companyId`);--> statement-breakpoint
CREATE INDEX `ar_avaliacao` ON `avaliacao_respostas` (`avaliacaoId`);--> statement-breakpoint
CREATE INDEX `ar_pergunta` ON `avaliacao_respostas` (`perguntaId`);--> statement-breakpoint
CREATE INDEX `av_ciclo` ON `avaliacoes` (`cicloId`);--> statement-breakpoint
CREATE INDEX `av_company` ON `avaliacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `av_employee` ON `avaliacoes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `av_avaliador` ON `avaliacoes` (`avaliadorId`);--> statement-breakpoint
CREATE INDEX `fe_company_mes` ON `financial_events` (`companyId`,`mesCompetencia`);--> statement-breakpoint
CREATE INDEX `fe_tipo` ON `financial_events` (`tipo`);--> statement-breakpoint
CREATE INDEX `fe_status` ON `financial_events` (`status`);--> statement-breakpoint
CREATE INDEX `fe_data_prevista` ON `financial_events` (`dataPrevista`);--> statement-breakpoint
CREATE INDEX `fe_employee` ON `financial_events` (`employeeId`);--> statement-breakpoint
CREATE INDEX `fe_obra` ON `financial_events` (`obraId`);--> statement-breakpoint
CREATE INDEX `mc_company_module` ON `module_config` (`company_id`,`module_key`);--> statement-breakpoint
CREATE INDEX `padj_company_origem` ON `payroll_adjustments` (`companyId`,`mesOrigem`);--> statement-breakpoint
CREATE INDEX `padj_company_desconto` ON `payroll_adjustments` (`companyId`,`mesDesconto`);--> statement-breakpoint
CREATE INDEX `padj_employee` ON `payroll_adjustments` (`employeeId`);--> statement-breakpoint
CREATE INDEX `padj_status` ON `payroll_adjustments` (`status`);--> statement-breakpoint
CREATE INDEX `pa_company_mes` ON `payroll_advances` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pa_employee_mes` ON `payroll_advances` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pa_period` ON `payroll_advances` (`periodId`);--> statement-breakpoint
CREATE INDEX `pa_status` ON `payroll_advances` (`status`);--> statement-breakpoint
CREATE INDEX `pal_company_mes` ON `payroll_alerts` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pal_tipo` ON `payroll_alerts` (`tipo`);--> statement-breakpoint
CREATE INDEX `pal_lido` ON `payroll_alerts` (`lido`);--> statement-breakpoint
CREATE INDEX `ppay_company_mes` ON `payroll_payments` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `ppay_employee_mes` ON `payroll_payments` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `ppay_period` ON `payroll_payments` (`periodId`);--> statement-breakpoint
CREATE INDEX `ppay_status` ON `payroll_payments` (`status`);--> statement-breakpoint
CREATE INDEX `pp_company_mes` ON `payroll_periods` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pp_status` ON `payroll_periods` (`status`);--> statement-breakpoint
CREATE INDEX `pc_cnpj` ON `portal_credentials` (`cnpj`);--> statement-breakpoint
CREATE INDEX `pc_tipo_empresa` ON `portal_credentials` (`tipo`,`empresa_terceira_id`);--> statement-breakpoint
CREATE INDEX `pc_tipo_parceiro` ON `portal_credentials` (`tipo`,`parceiro_id`);--> statement-breakpoint
CREATE INDEX `td_company_emp_data` ON `timecard_daily` (`companyId`,`employeeId`,`data`);--> statement-breakpoint
CREATE INDEX `td_company_mes` ON `timecard_daily` (`companyId`,`mesCompetencia`);--> statement-breakpoint
CREATE INDEX `td_status` ON `timecard_daily` (`statusDia`);--> statement-breakpoint
CREATE INDEX `td_employee_mes` ON `timecard_daily` (`employeeId`,`mesCompetencia`);--> statement-breakpoint
CREATE INDEX `ugm_group` ON `user_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `ugm_user` ON `user_group_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `ugm_group_user` ON `user_group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `ugp_group` ON `user_group_permissions` (`group_id`);--> statement-breakpoint
CREATE INDEX `ugp_group_rota` ON `user_group_permissions` (`group_id`,`rota`);--> statement-breakpoint
CREATE INDEX `ug_nome` ON `user_groups` (`nome`);--> statement-breakpoint
CREATE INDEX `unique_exam` ON `custom_exams` (`companyId`,`nome`);--> statement-breakpoint
CREATE INDEX `idx_company_codigo_interno` ON `employees` (`companyId`,`codigoInterno`);--> statement-breakpoint
CREATE INDEX `idx_meal_company` ON `meal_benefit_configs` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_meal_obra` ON `meal_benefit_configs` (`obraId`);--> statement-breakpoint
CREATE INDEX `ml_company_label` ON `menu_labels` (`companyId`,`originalLabel`);--> statement-breakpoint
CREATE INDEX `uk_user_company` ON `user_companies` (`user_id`,`company_id`);--> statement-breakpoint
ALTER TABLE `dissidios` DROP COLUMN `numeroCCT`;--> statement-breakpoint
ALTER TABLE `dissidios` DROP COLUMN `percentualINPC`;--> statement-breakpoint
ALTER TABLE `dissidios` DROP COLUMN `valorVA`;--> statement-breakpoint
ALTER TABLE `dissidios` DROP COLUMN `valorVT`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `saudacao`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `corpoTexto`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `providencias`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `rodape`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `atualizadoPor`;--> statement-breakpoint
ALTER TABLE `email_templates` DROP COLUMN `atualizadoPorId`;--> statement-breakpoint
ALTER TABLE `processo_analises` DROP COLUMN `modeloIA`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudId`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudUltimaConsulta`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudUltimaAtualizacao`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudGrau`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudClasse`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudAssuntos`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudOrgaoJulgador`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudSistema`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudFormato`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudMovimentos`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudTotalMovimentos`;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` DROP COLUMN `datajudAutoDetectado`;--> statement-breakpoint
ALTER TABLE `vacation_periods` DROP COLUMN `dataAlteradaPeloRH`;--> statement-breakpoint
ALTER TABLE `vr_benefits` DROP COLUMN `valorVA`;