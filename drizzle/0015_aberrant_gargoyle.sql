CREATE TABLE `caepi_database` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ca` varchar(20) NOT NULL,
	`validade` varchar(20),
	`situacao` varchar(30),
	`cnpj` varchar(20),
	`fabricante` varchar(500),
	`natureza` varchar(50),
	`equipamento` varchar(500),
	`descricao` text,
	`referencia` varchar(500),
	`cor` varchar(100),
	`aprovado_para` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_discount_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`epiDeliveryId` int NOT NULL,
	`epi_nome` varchar(500) NOT NULL,
	`ca` varchar(20),
	`quantidade` int NOT NULL DEFAULT 1,
	`valor_unitario` decimal(10,2) NOT NULL,
	`valor_total` decimal(10,2) NOT NULL,
	`motivo_cobranca` varchar(100) NOT NULL,
	`mes_referencia` varchar(7) NOT NULL,
	`status` enum('pendente','confirmado','cancelado') NOT NULL DEFAULT 'pendente',
	`validado_por` varchar(255),
	`validado_por_user_id` int,
	`data_validacao` timestamp,
	`justificativa` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `caepi_ca_idx` ON `caepi_database` (`ca`);--> statement-breakpoint
CREATE INDEX `eda_company` ON `epi_discount_alerts` (`companyId`);--> statement-breakpoint
CREATE INDEX `eda_employee` ON `epi_discount_alerts` (`employeeId`);--> statement-breakpoint
CREATE INDEX `eda_delivery` ON `epi_discount_alerts` (`epiDeliveryId`);--> statement-breakpoint
CREATE INDEX `eda_status` ON `epi_discount_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `eda_mes` ON `epi_discount_alerts` (`companyId`,`mes_referencia`);