CREATE TABLE `company_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('PGR','PCMSO','LTCAT','AET','LAUDO_INSALUBRIDADE','LAUDO_PERICULOSIDADE','ALVARA','CONTRATO_SOCIAL','CNPJ_CARTAO','CERTIDAO_NEGATIVA','OUTRO') NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`documentoUrl` text,
	`dataEmissao` date,
	`dataValidade` date,
	`elaboradoPor` varchar(255),
	`status` enum('vigente','vencido','pendente','em_renovacao') NOT NULL DEFAULT 'pendente',
	`observacoes` text,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `convencao_coletiva` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`nome` varchar(255) NOT NULL,
	`sindicato` varchar(255),
	`cnpjSindicato` varchar(18),
	`dataBase` varchar(20),
	`vigenciaInicio` date,
	`vigenciaFim` date,
	`pisoSalarial` varchar(20),
	`percentualReajuste` varchar(10),
	`adicionalInsalubridade` varchar(10),
	`adicionalPericulosidade` varchar(10),
	`horaExtraDiurna` varchar(10),
	`horaExtraNoturna` varchar(10),
	`horaExtraDomingo` varchar(10),
	`adicionalNoturno` varchar(10),
	`valeRefeicao` varchar(20),
	`valeAlimentacao` varchar(20),
	`valeTransporte` varchar(20),
	`cestaBasica` varchar(20),
	`auxilioFarmacia` varchar(20),
	`planoSaude` varchar(255),
	`seguroVida` varchar(20),
	`outrosBeneficios` text,
	`clausulasEspeciais` text,
	`documentoUrl` text,
	`isMatriz` tinyint NOT NULL DEFAULT 0,
	`status` enum('vigente','vencida','em_negociacao') NOT NULL DEFAULT 'vigente',
	`observacoes` text,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `employee_aptidao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`status` enum('apto','inapto','pendente') NOT NULL DEFAULT 'pendente',
	`motivoInapto` text,
	`ultimaVerificacao` timestamp,
	`asoVigente` tinyint NOT NULL DEFAULT 0,
	`treinamentosObrigatoriosOk` tinyint NOT NULL DEFAULT 0,
	`documentosPessoaisOk` tinyint NOT NULL DEFAULT 0,
	`nrObrigatoriasOk` tinyint NOT NULL DEFAULT 0,
	`verificadoPor` varchar(255),
	`verificadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `cd_company` ON `company_documents` (`companyId`);--> statement-breakpoint
CREATE INDEX `cd_tipo` ON `company_documents` (`tipo`);--> statement-breakpoint
CREATE INDEX `cd_validade` ON `company_documents` (`dataValidade`);--> statement-breakpoint
CREATE INDEX `cc_company` ON `convencao_coletiva` (`companyId`);--> statement-breakpoint
CREATE INDEX `cc_obra` ON `convencao_coletiva` (`obraId`);--> statement-breakpoint
CREATE INDEX `cc_vigencia` ON `convencao_coletiva` (`vigenciaInicio`,`vigenciaFim`);--> statement-breakpoint
CREATE INDEX `ea_company` ON `employee_aptidao` (`companyId`);--> statement-breakpoint
CREATE INDEX `ea_employee` ON `employee_aptidao` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ea_status` ON `employee_aptidao` (`status`);