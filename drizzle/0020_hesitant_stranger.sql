CREATE TABLE `epi_ai_analises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('automatica','manual') NOT NULL DEFAULT 'manual',
	`resultado` text NOT NULL,
	`sugestoes` json,
	`status` enum('nova','visualizada','aplicada','descartada') NOT NULL DEFAULT 'nova',
	`aplicadaPor` varchar(255),
	`aplicadaPorUserId` int,
	`aplicadaEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `epi_assinaturas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`deliveryId` int,
	`employeeId` int NOT NULL,
	`tipo` enum('entrega','devolucao') NOT NULL,
	`assinaturaUrl` text NOT NULL,
	`assinadoEm` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`ipAddress` varchar(45),
	`userAgent` text,
	`entregadorNome` varchar(255),
	`entregadorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `epi_checklist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistId` int NOT NULL,
	`nomeEpi` varchar(255) NOT NULL,
	`categoria` enum('EPI','Uniforme','Calcado') NOT NULL DEFAULT 'EPI',
	`quantidade` int NOT NULL DEFAULT 1,
	`entregue` tinyint NOT NULL DEFAULT 0,
	`devolvido` tinyint NOT NULL DEFAULT 0,
	`epiId` int,
	`deliveryId` int,
	`dataEntrega` date,
	`dataDevolucao` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `epi_checklists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`kitId` int,
	`tipo` enum('contratacao','devolucao') NOT NULL DEFAULT 'contratacao',
	`status` enum('pendente','parcial','concluido','cancelado') NOT NULL DEFAULT 'pendente',
	`observacoes` text,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`concluidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_cores_capacete` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`cor` varchar(50) NOT NULL,
	`hexColor` varchar(10),
	`funcoes` text NOT NULL,
	`descricao` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_estoque_minimo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`epiId` int NOT NULL,
	`obraId` int,
	`quantidadeMinima` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_kit_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kitId` int NOT NULL,
	`epiId` int,
	`nomeEpi` varchar(255) NOT NULL,
	`categoria` enum('EPI','Uniforme','Calcado') NOT NULL DEFAULT 'EPI',
	`quantidade` int NOT NULL DEFAULT 1,
	`obrigatorio` tinyint NOT NULL DEFAULT 1,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `epi_kits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`funcao` varchar(100) NOT NULL,
	`descricao` text,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_treinamentos_vinculados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nomeEpi` varchar(255) NOT NULL,
	`categoriaEpi` varchar(100),
	`normaExigida` varchar(50) NOT NULL,
	`nomeTreinamento` varchar(255) NOT NULL,
	`obrigatorio` tinyint NOT NULL DEFAULT 1,
	`descricao` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epi_vida_util` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nomeEpi` varchar(255) NOT NULL,
	`categoriaEpi` varchar(100),
	`vidaUtilMeses` int NOT NULL,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `epi_deliveries` ADD `data_validade` date;--> statement-breakpoint
ALTER TABLE `epi_deliveries` ADD `assinatura_url` text;--> statement-breakpoint
ALTER TABLE `epis` ADD `vida_util_meses` int;--> statement-breakpoint
CREATE INDEX `eaia_company` ON `epi_ai_analises` (`companyId`);--> statement-breakpoint
CREATE INDEX `eaia_status` ON `epi_ai_analises` (`status`);--> statement-breakpoint
CREATE INDEX `eas_company` ON `epi_assinaturas` (`companyId`);--> statement-breakpoint
CREATE INDEX `eas_delivery` ON `epi_assinaturas` (`deliveryId`);--> statement-breakpoint
CREATE INDEX `eas_employee` ON `epi_assinaturas` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ecli_checklist` ON `epi_checklist_items` (`checklistId`);--> statement-breakpoint
CREATE INDEX `ecli_epi` ON `epi_checklist_items` (`epiId`);--> statement-breakpoint
CREATE INDEX `ecl_company` ON `epi_checklists` (`companyId`);--> statement-breakpoint
CREATE INDEX `ecl_employee` ON `epi_checklists` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ecl_status` ON `epi_checklists` (`status`);--> statement-breakpoint
CREATE INDEX `ecc_company` ON `epi_cores_capacete` (`companyId`);--> statement-breakpoint
CREATE INDEX `eem_company` ON `epi_estoque_minimo` (`companyId`);--> statement-breakpoint
CREATE INDEX `eem_epi` ON `epi_estoque_minimo` (`epiId`);--> statement-breakpoint
CREATE INDEX `eem_obra` ON `epi_estoque_minimo` (`obraId`);--> statement-breakpoint
CREATE INDEX `eki_kit` ON `epi_kit_items` (`kitId`);--> statement-breakpoint
CREATE INDEX `eki_epi` ON `epi_kit_items` (`epiId`);--> statement-breakpoint
CREATE INDEX `ek_company` ON `epi_kits` (`companyId`);--> statement-breakpoint
CREATE INDEX `ek_funcao` ON `epi_kits` (`funcao`);--> statement-breakpoint
CREATE INDEX `etv_company` ON `epi_treinamentos_vinculados` (`companyId`);--> statement-breakpoint
CREATE INDEX `etv_norma` ON `epi_treinamentos_vinculados` (`normaExigida`);--> statement-breakpoint
CREATE INDEX `evu_company` ON `epi_vida_util` (`companyId`);