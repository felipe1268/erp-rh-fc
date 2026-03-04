CREATE TABLE `epi_estoque_obra` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`epiId` int NOT NULL,
	`obraId` int NOT NULL,
	`quantidade` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_transferencias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`epiId` int NOT NULL,
	`quantidade` int NOT NULL,
	`tipo_origem` enum('central','obra') NOT NULL,
	`origem_obra_id` int,
	`destino_obra_id` int NOT NULL,
	`data` date NOT NULL,
	`observacoes` text,
	`criado_por` varchar(255),
	`criado_por_user_id` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `epi_deliveries` ADD `origem_entrega` enum('central','obra') DEFAULT 'central' NOT NULL;--> statement-breakpoint
ALTER TABLE `epi_deliveries` ADD `obra_id` int;--> statement-breakpoint
CREATE INDEX `idx_eeo_company` ON `epi_estoque_obra` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_eeo_epi` ON `epi_estoque_obra` (`epiId`);--> statement-breakpoint
CREATE INDEX `idx_eeo_obra` ON `epi_estoque_obra` (`obraId`);--> statement-breakpoint
CREATE INDEX `idx_eeo_epi_obra` ON `epi_estoque_obra` (`epiId`,`obraId`);--> statement-breakpoint
CREATE INDEX `idx_et_company` ON `epi_transferencias` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_et_epi` ON `epi_transferencias` (`epiId`);--> statement-breakpoint
CREATE INDEX `idx_et_destino` ON `epi_transferencias` (`destino_obra_id`);--> statement-breakpoint
CREATE INDEX `idx_et_data` ON `epi_transferencias` (`companyId`,`data`);--> statement-breakpoint
CREATE INDEX `idx_ed_company` ON `epi_deliveries` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_ed_employee` ON `epi_deliveries` (`employeeId`);--> statement-breakpoint
CREATE INDEX `idx_ed_epi` ON `epi_deliveries` (`epiId`);--> statement-breakpoint
CREATE INDEX `idx_ed_origem` ON `epi_deliveries` (`origem_entrega`);--> statement-breakpoint
CREATE INDEX `idx_ed_obra` ON `epi_deliveries` (`obra_id`);