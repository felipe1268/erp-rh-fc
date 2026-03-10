CREATE TABLE `employee_skills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`skillId` int NOT NULL,
	`companyId` int NOT NULL,
	`nivel` enum('Basico','Intermediario','Avancado') NOT NULL DEFAULT 'Basico',
	`tempoExperiencia` varchar(100),
	`observacao` text,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`categoria` varchar(100),
	`descricao` text,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `es_employee` ON `employee_skills` (`employeeId`);--> statement-breakpoint
CREATE INDEX `es_skill` ON `employee_skills` (`skillId`);--> statement-breakpoint
CREATE INDEX `es_company` ON `employee_skills` (`companyId`);--> statement-breakpoint
CREATE INDEX `sk_company` ON `skills` (`companyId`);--> statement-breakpoint
CREATE INDEX `sk_categoria` ON `skills` (`categoria`);