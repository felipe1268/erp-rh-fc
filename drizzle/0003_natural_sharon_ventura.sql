ALTER TABLE `processos_trabalhistas` ADD `datajudId` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudUltimaConsulta` timestamp;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudUltimaAtualizacao` varchar(100);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudGrau` varchar(20);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudClasse` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudAssuntos` json;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudOrgaoJulgador` varchar(255);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudSistema` varchar(100);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudFormato` varchar(50);--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudMovimentos` json;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudTotalMovimentos` int;--> statement-breakpoint
ALTER TABLE `processos_trabalhistas` ADD `datajudAutoDetectado` tinyint DEFAULT 0;