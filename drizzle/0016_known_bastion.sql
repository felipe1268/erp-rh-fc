ALTER TABLE `epis` ADD `categoria` enum('EPI','Uniforme','Calcado') DEFAULT 'EPI' NOT NULL;--> statement-breakpoint
ALTER TABLE `epis` ADD `tamanho` varchar(20);