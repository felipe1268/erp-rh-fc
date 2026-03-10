CREATE TABLE `clinicas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`endereco` varchar(500),
	`telefone` varchar(50),
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `medicos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`crm` varchar(50) NOT NULL,
	`especialidade` varchar(255),
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `clin_company` ON `clinicas` (`companyId`);--> statement-breakpoint
CREATE INDEX `med_company` ON `medicos` (`companyId`);--> statement-breakpoint
CREATE INDEX `med_crm` ON `medicos` (`crm`);