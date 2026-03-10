CREATE TABLE `contract_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('experiencia','indeterminado','prorrogacao') NOT NULL,
	`nome` varchar(255) NOT NULL,
	`conteudoHtml` text NOT NULL,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `employee_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`templateId` int,
	`tipo` enum('experiencia','indeterminado','prorrogacao') NOT NULL,
	`status` enum('vigente','prorrogado','efetivado','encerrado','rescindido') NOT NULL DEFAULT 'vigente',
	`dataInicio` date NOT NULL,
	`dataFim` date,
	`prazoExperienciaDias` int,
	`prazoProrrogacaoDias` int,
	`dataProrrogacao` date,
	`dataEfetivacao` date,
	`salarioBase` varchar(20),
	`valorHora` varchar(20),
	`funcao` varchar(100),
	`jornadaTrabalho` text,
	`localTrabalho` text,
	`conteudoGerado` text,
	`contratoAssinadoUrl` text,
	`contratoAssinadoKey` text,
	`prorrogacaoAssinadaUrl` text,
	`prorrogacaoAssinadaKey` text,
	`observacoes` text,
	`contratoAnteriorId` int,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `ct_company` ON `contract_templates` (`companyId`);--> statement-breakpoint
CREATE INDEX `ct_tipo` ON `contract_templates` (`tipo`);--> statement-breakpoint
CREATE INDEX `ct_ativo` ON `contract_templates` (`ativo`);--> statement-breakpoint
CREATE INDEX `ec_company` ON `employee_contracts` (`companyId`);--> statement-breakpoint
CREATE INDEX `ec_employee` ON `employee_contracts` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ec_tipo` ON `employee_contracts` (`tipo`);--> statement-breakpoint
CREATE INDEX `ec_status` ON `employee_contracts` (`status`);--> statement-breakpoint
CREATE INDEX `ec_data_inicio` ON `employee_contracts` (`dataInicio`);--> statement-breakpoint
CREATE INDEX `ec_data_fim` ON `employee_contracts` (`dataFim`);