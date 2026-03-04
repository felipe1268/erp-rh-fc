CREATE TABLE `convenio_lancamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`convenioId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`valor` varchar(20) NOT NULL,
	`dataCompra` date,
	`descricao` varchar(500),
	`notaFiscal` varchar(100),
	`comprovante` varchar(500),
	`status` enum('pendente','aprovado','descontado','cancelado') NOT NULL DEFAULT 'pendente',
	`aprovadoPor` varchar(255),
	`aprovadoEm` timestamp,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `convenio_lancamentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `convenios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('farmacia','posto_gasolina','supermercado','otica','outro') NOT NULL,
	`cnpj` varchar(20),
	`contato` varchar(255),
	`telefone` varchar(30),
	`email` varchar(255),
	`endereco` text,
	`limiteIndividual` varchar(20),
	`diaCorte` int DEFAULT 25,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `convenios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cl_company_mes` ON `convenio_lancamentos` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `cl_convenio` ON `convenio_lancamentos` (`convenioId`);--> statement-breakpoint
CREATE INDEX `cl_employee` ON `convenio_lancamentos` (`employeeId`);--> statement-breakpoint
CREATE INDEX `cl_status` ON `convenio_lancamentos` (`status`);--> statement-breakpoint
CREATE INDEX `conv_company` ON `convenios` (`companyId`);--> statement-breakpoint
CREATE INDEX `conv_tipo` ON `convenios` (`tipo`);--> statement-breakpoint
CREATE INDEX `conv_ativo` ON `convenios` (`ativo`);