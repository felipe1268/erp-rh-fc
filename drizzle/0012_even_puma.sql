ALTER TABLE `timecard_daily` ADD `origemRegistro` varchar(20) DEFAULT 'dixi' NOT NULL;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `numBatidas` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `isInconsistente` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `inconsistenciaTipo` varchar(50);--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `resolucaoTipo` varchar(50);--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `resolucaoObs` text;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `resolucaoEm` timestamp;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `resolucaoPor` varchar(255);--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `atestadoId` int;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `advertenciaId` int;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `obraSecundariaId` int;--> statement-breakpoint
ALTER TABLE `timecard_daily` ADD `rateioPercentual` int;