ALTER TABLE `employee_documents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `feriados` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `pj_medicoes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());