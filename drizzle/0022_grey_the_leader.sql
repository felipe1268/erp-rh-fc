CREATE TABLE `epi_alerta_capacidade` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`limiar` int NOT NULL DEFAULT 5,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`emailDestinatarios` text,
	`ultimoAlertaEm` timestamp,
	`ultimaCapacidade` int,
	`intervaloMinHoras` int NOT NULL DEFAULT 24,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_alerta_capacidade_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`capacidade` int NOT NULL,
	`limiar` int NOT NULL,
	`gargaloItem` varchar(255),
	`gargaloEstoque` int,
	`destinatariosEnviados` text,
	`emailsEnviados` int NOT NULL DEFAULT 0,
	`emailsErros` int NOT NULL DEFAULT 0,
	`enviadoEm` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `eac_company` ON `epi_alerta_capacidade` (`companyId`);--> statement-breakpoint
CREATE INDEX `eacl_company` ON `epi_alerta_capacidade_log` (`companyId`);--> statement-breakpoint
CREATE INDEX `eacl_enviado` ON `epi_alerta_capacidade_log` (`enviadoEm`);