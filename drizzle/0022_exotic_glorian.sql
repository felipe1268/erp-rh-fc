CREATE TABLE `he_solicitacao_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`solicitacaoId` int NOT NULL,
	`employeeId` int NOT NULL,
	`horasRealizadas` varchar(10),
	`status` enum('pendente','realizada','nao_realizada') NOT NULL DEFAULT 'pendente',
	`observacao` text
);
--> statement-breakpoint
CREATE TABLE `he_solicitacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`dataSolicitacao` date NOT NULL,
	`horaInicio` varchar(10),
	`horaFim` varchar(10),
	`motivo` text NOT NULL,
	`status` enum('pendente','aprovada','rejeitada','cancelada') NOT NULL DEFAULT 'pendente',
	`solicitadoPor` varchar(255) NOT NULL,
	`solicitadoPorId` int NOT NULL,
	`aprovadoPor` varchar(255),
	`aprovadoPorId` int,
	`aprovadoEm` timestamp,
	`motivoRejeicao` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ponto_descontos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('atraso','saida_antecipada','falta_injustificada','falta_dsr','falta_feriado','he_nao_autorizada') NOT NULL,
	`minutosAtraso` int DEFAULT 0,
	`minutosHe` int DEFAULT 0,
	`valorDesconto` varchar(20) DEFAULT '0',
	`valorDsr` varchar(20) DEFAULT '0',
	`valorTotal` varchar(20) DEFAULT '0',
	`baseCalculo` text,
	`timeRecordId` int,
	`heSolicitacaoId` int,
	`status` enum('calculado','revisado','abonado','fechado') NOT NULL DEFAULT 'calculado',
	`abonadoPor` varchar(255),
	`abonadoEm` timestamp,
	`motivoAbono` text,
	`fundamentacaoLegal` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ponto_descontos_resumo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`totalAtrasos` int DEFAULT 0,
	`totalMinutosAtraso` int DEFAULT 0,
	`totalFaltasInjustificadas` int DEFAULT 0,
	`totalSaidasAntecipadas` int DEFAULT 0,
	`totalMinutosSaidaAntecipada` int DEFAULT 0,
	`totalDsrPerdidos` int DEFAULT 0,
	`totalFeriadosPerdidos` int DEFAULT 0,
	`totalHeNaoAutorizadas` int DEFAULT 0,
	`totalMinutosHeNaoAutorizada` int DEFAULT 0,
	`valorTotalAtrasos` varchar(20) DEFAULT '0',
	`valorTotalFaltas` varchar(20) DEFAULT '0',
	`valorTotalDsr` varchar(20) DEFAULT '0',
	`valorTotalFeriados` varchar(20) DEFAULT '0',
	`valorTotalSaidasAntecipadas` varchar(20) DEFAULT '0',
	`valorTotalHeNaoAutorizada` varchar(20) DEFAULT '0',
	`valorTotalDescontos` varchar(20) DEFAULT '0',
	`faltasAcumuladasPeriodoAquisitivo` int DEFAULT 0,
	`diasFeriasResultante` int DEFAULT 30,
	`status` enum('calculado','revisado','fechado') NOT NULL DEFAULT 'calculado',
	`revisadoPor` varchar(255),
	`revisadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `he_sol_func_sol` ON `he_solicitacao_funcionarios` (`solicitacaoId`);--> statement-breakpoint
CREATE INDEX `he_sol_func_emp` ON `he_solicitacao_funcionarios` (`employeeId`);--> statement-breakpoint
CREATE INDEX `he_sol_company` ON `he_solicitacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `he_sol_obra` ON `he_solicitacoes` (`obraId`);--> statement-breakpoint
CREATE INDEX `he_sol_data` ON `he_solicitacoes` (`dataSolicitacao`);--> statement-breakpoint
CREATE INDEX `he_sol_status` ON `he_solicitacoes` (`status`);--> statement-breakpoint
CREATE INDEX `he_sol_company_status` ON `he_solicitacoes` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `pd_company_mes` ON `ponto_descontos` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pd_employee_mes` ON `ponto_descontos` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pd_tipo` ON `ponto_descontos` (`tipo`);--> statement-breakpoint
CREATE INDEX `pd_status` ON `ponto_descontos` (`status`);--> statement-breakpoint
CREATE INDEX `pd_data` ON `ponto_descontos` (`data`);--> statement-breakpoint
CREATE INDEX `pdr_company_mes` ON `ponto_descontos_resumo` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pdr_employee_mes` ON `ponto_descontos_resumo` (`employeeId`,`mesReferencia`);