CREATE TABLE `dissidio_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dissidioId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`salarioAnterior` varchar(20) NOT NULL,
	`salarioNovo` varchar(20) NOT NULL,
	`percentualAplicado` varchar(10) NOT NULL,
	`diferencaValor` varchar(20),
	`mesesRetroativos` int DEFAULT 0,
	`valorRetroativo` varchar(20),
	`status` enum('pendente','aplicado','excluido') NOT NULL DEFAULT 'pendente',
	`motivoExclusao` text,
	`aplicadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `dissidios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`anoReferencia` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`sindicato` varchar(255),
	`numeroCCT` varchar(100),
	`mesDataBase` int NOT NULL DEFAULT 5,
	`dataBaseInicio` date NOT NULL,
	`dataBaseFim` date NOT NULL,
	`percentualReajuste` varchar(10) NOT NULL,
	`percentualINPC` varchar(10),
	`percentualGanhoReal` varchar(10),
	`pisoSalarial` varchar(20),
	`pisoSalarialAnterior` varchar(20),
	`valorVA` varchar(20),
	`valorVT` varchar(20),
	`valorSeguroVida` varchar(20),
	`contribuicaoAssistencial` varchar(10),
	`dataAplicacao` date,
	`aplicadoPor` varchar(255),
	`retroativo` tinyint NOT NULL DEFAULT 1,
	`dataRetroativoInicio` date,
	`status` enum('rascunho','aguardando_homologacao','homologado','aplicado','cancelado') NOT NULL DEFAULT 'rascunho',
	`observacoes` text,
	`documentoUrl` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `df_dissidio` ON `dissidio_funcionarios` (`dissidioId`);--> statement-breakpoint
CREATE INDEX `df_employee` ON `dissidio_funcionarios` (`employeeId`);--> statement-breakpoint
CREATE INDEX `df_company` ON `dissidio_funcionarios` (`companyId`);--> statement-breakpoint
CREATE INDEX `diss_company_ano` ON `dissidios` (`companyId`,`anoReferencia`);--> statement-breakpoint
CREATE INDEX `diss_status` ON `dissidios` (`companyId`,`status`);