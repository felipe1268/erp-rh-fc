CREATE TABLE `obra_ponto_inconsistencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraAlocadaId` int,
	`obraPontoId` int NOT NULL,
	`dataPonto` date NOT NULL,
	`snRelogio` varchar(50),
	`status` enum('pendente','esporadico','transferido','ignorado') NOT NULL DEFAULT 'pendente',
	`resolvidoPor` varchar(255),
	`resolvidoPorUserId` int,
	`resolvidoEm` timestamp,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `opi_company` ON `obra_ponto_inconsistencies` (`companyId`);--> statement-breakpoint
CREATE INDEX `opi_employee` ON `obra_ponto_inconsistencies` (`employeeId`);--> statement-breakpoint
CREATE INDEX `opi_status` ON `obra_ponto_inconsistencies` (`status`);--> statement-breakpoint
CREATE INDEX `opi_data` ON `obra_ponto_inconsistencies` (`dataPonto`);