ALTER TABLE `vacation_periods` ADD `dataSugeridaInicio` date;--> statement-breakpoint
ALTER TABLE `vacation_periods` ADD `dataSugeridaFim` date;--> statement-breakpoint
ALTER TABLE `vacation_periods` ADD `dataAlteradaPeloRH` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `vacation_periods` ADD `numeroPeriodo` int DEFAULT 1;