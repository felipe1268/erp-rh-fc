CREATE TABLE `employee_site_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraId` int NOT NULL,
	`tipo` enum('alocacao','transferencia','retorno','saida','temporario') NOT NULL,
	`dataInicio` date NOT NULL,
	`dataFim` date,
	`motivoTransferencia` text,
	`obraOrigemId` int,
	`registradoPor` varchar(255),
	`registradoPorUserId` int,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `esh_company` ON `employee_site_history` (`companyId`);--> statement-breakpoint
CREATE INDEX `esh_employee` ON `employee_site_history` (`employeeId`);--> statement-breakpoint
CREATE INDEX `esh_obra` ON `employee_site_history` (`obraId`);--> statement-breakpoint
CREATE INDEX `esh_data` ON `employee_site_history` (`dataInicio`,`dataFim`);