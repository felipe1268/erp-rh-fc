CREATE TABLE `backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` enum('automatico','manual') NOT NULL DEFAULT 'automatico',
	`status` enum('em_andamento','concluido','erro') NOT NULL DEFAULT 'em_andamento',
	`tabelasExportadas` int NOT NULL DEFAULT 0,
	`registrosExportados` int NOT NULL DEFAULT 0,
	`tamanhoBytes` int NOT NULL DEFAULT 0,
	`s3Key` varchar(500),
	`s3Url` varchar(1000),
	`erro` text,
	`iniciadoPor` varchar(255) DEFAULT 'Sistema',
	`iniciadoEm` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`concluidoEm` timestamp
);
--> statement-breakpoint
CREATE INDEX `bkp_status` ON `backups` (`status`);--> statement-breakpoint
CREATE INDEX `bkp_tipo` ON `backups` (`tipo`);--> statement-breakpoint
CREATE INDEX `bkp_iniciado` ON `backups` (`iniciadoEm`);