CREATE TABLE `dixi_afd_importacoes` (
`id` int AUTO_INCREMENT NOT NULL,
`companyId` int NOT NULL,
`dataImportacao` timestamp NOT NULL DEFAULT (now()),
`metodo` enum('AFD','API','XLS') NOT NULL DEFAULT 'AFD',
`arquivoNome` varchar(255),
`snRelogio` varchar(50),
`obraId` int,
`obraNome` varchar(255),
`totalMarcacoes` int NOT NULL DEFAULT 0,
`totalFuncionarios` int NOT NULL DEFAULT 0,
`totalInconsistencias` int NOT NULL DEFAULT 0,
`periodoInicio` varchar(10),
`periodoFim` varchar(10),
`status` enum('sucesso','parcial','erro') NOT NULL DEFAULT 'sucesso',
`importadoPor` varchar(255),
`detalhes` json,
`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `dixi_afd_marcacoes` (
`id` int AUTO_INCREMENT NOT NULL,
`companyId` int NOT NULL,
`importacaoId` int NOT NULL,
`nsr` varchar(20),
`cpf` varchar(14) NOT NULL,
`data` date NOT NULL,
`hora` varchar(10) NOT NULL,
`snRelogio` varchar(50),
`obraId` int,
`employeeId` int,
`employeeName` varchar(255),
`status` enum('processado','cpf_nao_encontrado','duplicado','erro') NOT NULL DEFAULT 'processado',
`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `dai_company` ON `dixi_afd_importacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `dai_sn` ON `dixi_afd_importacoes` (`snRelogio`);--> statement-breakpoint
CREATE INDEX `dai_data` ON `dixi_afd_importacoes` (`dataImportacao`);--> statement-breakpoint
CREATE INDEX `dam_company` ON `dixi_afd_marcacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `dam_importacao` ON `dixi_afd_marcacoes` (`importacaoId`);--> statement-breakpoint
CREATE INDEX `dam_cpf` ON `dixi_afd_marcacoes` (`cpf`);--> statement-breakpoint
CREATE INDEX `dam_data` ON `dixi_afd_marcacoes` (`data`);--> statement-breakpoint
CREATE INDEX `dam_employee` ON `dixi_afd_marcacoes` (`employeeId`);
