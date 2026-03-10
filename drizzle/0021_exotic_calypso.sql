ALTER TABLE `epi_assinaturas` ADD `hashSha256` varchar(64);--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `latitude` varchar(20);--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `longitude` varchar(20);--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `geoAccuracy` varchar(20);--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `termoAceito` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `textoTermo` text;--> statement-breakpoint
ALTER TABLE `epi_assinaturas` ADD `dispositivoInfo` text;