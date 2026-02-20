CREATE TABLE `dixi_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`serialNumber` varchar(50) NOT NULL,
	`obraName` varchar(255) NOT NULL,
	`location` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dixi_devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`category` enum('cartao_ponto','folha_pagamento','vale_adiantamento') NOT NULL,
	`month` varchar(7) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`uploadStatus` enum('pendente','processando','processado','erro') NOT NULL DEFAULT 'pendente',
	`recordsProcessed` int DEFAULT 0,
	`errorMessage` text,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainingId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `status` enum('Ativo','Ferias','Afastado','Licenca','Desligado','Recluso','Lista_Negra') NOT NULL DEFAULT 'Ativo';--> statement-breakpoint
ALTER TABLE `employees` ADD `listaNegra` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `motivoListaNegra` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `dataListaNegra` date;