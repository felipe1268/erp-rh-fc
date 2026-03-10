CREATE TABLE `custom_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
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
ALTER TABLE `employees` MODIFY COLUMN `tipoContrato` enum('CLT','PJ','Temporario','Estagio','Aprendiz','Horista') DEFAULT 'CLT';--> statement-breakpoint
CREATE INDEX `ce_company` ON `custom_exams` (`companyId`);--> statement-breakpoint
CREATE INDEX `esh_company` ON `employee_site_history` (`companyId`);--> statement-breakpoint
CREATE INDEX `esh_employee` ON `employee_site_history` (`employeeId`);--> statement-breakpoint
CREATE INDEX `esh_obra` ON `employee_site_history` (`obraId`);--> statement-breakpoint
CREATE INDEX `esh_data` ON `employee_site_history` (`dataInicio`,`dataFim`);--> statement-breakpoint
CREATE INDEX `opi_company` ON `obra_ponto_inconsistencies` (`companyId`);--> statement-breakpoint
CREATE INDEX `opi_employee` ON `obra_ponto_inconsistencies` (`employeeId`);--> statement-breakpoint
CREATE INDEX `opi_status` ON `obra_ponto_inconsistencies` (`status`);--> statement-breakpoint
CREATE INDEX `opi_data` ON `obra_ponto_inconsistencies` (`dataPonto`);