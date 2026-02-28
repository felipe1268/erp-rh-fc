CREATE TABLE `datajud_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processoId` int,
	`tipo` enum('nova_movimentacao','audiencia_marcada','sentenca','recurso','acordo','penhora','execucao','arquivamento','novo_processo','erro_consulta') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`prioridade` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`lido` tinyint NOT NULL DEFAULT 0,
	`lidoPor` varchar(255),
	`lidoEm` timestamp,
	`dados` json,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `datajud_auto_check_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`intervaloMinutos` int NOT NULL DEFAULT 60,
	`ultimaVerificacao` timestamp,
	`totalVerificacoes` int NOT NULL DEFAULT 0,
	`totalAlertas` int NOT NULL DEFAULT 0,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `dja_company` ON `datajud_alerts` (`companyId`);--> statement-breakpoint
CREATE INDEX `dja_company_lido` ON `datajud_alerts` (`companyId`,`lido`);--> statement-breakpoint
CREATE INDEX `dja_processo` ON `datajud_alerts` (`processoId`);--> statement-breakpoint
CREATE INDEX `djac_company` ON `datajud_auto_check_config` (`companyId`);