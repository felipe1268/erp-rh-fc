CREATE TABLE `employee_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` enum('rg','cnh','ctps','comprovante_residencia','certidao_nascimento','titulo_eleitor','reservista','pis','foto_3x4','contrato_trabalho','termo_rescisao','atestado_medico','diploma','certificado','outros') NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` varchar(500),
	`fileUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`dataValidade` date,
	`uploadPor` varchar(255),
	`uploadPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255)
);
--> statement-breakpoint
CREATE TABLE `feriados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`nome` varchar(255) NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('nacional','estadual','municipal','ponto_facultativo','compensado') NOT NULL,
	`recorrente` tinyint NOT NULL DEFAULT 1,
	`estado` varchar(2),
	`cidade` varchar(100),
	`ativo` tinyint NOT NULL DEFAULT 1,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `pj_medicoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`contractId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`horasTrabalhadas` varchar(20) NOT NULL,
	`valorHora` varchar(20) NOT NULL,
	`valorBruto` varchar(20) NOT NULL,
	`descontos` varchar(20) DEFAULT '0',
	`acrescimos` varchar(20) DEFAULT '0',
	`descricaoDescontos` text,
	`descricaoAcrescimos` text,
	`valorLiquido` varchar(20) NOT NULL,
	`notaFiscalNumero` varchar(50),
	`notaFiscalUrl` text,
	`status` enum('rascunho','pendente_aprovacao','aprovada','paga','cancelada') NOT NULL DEFAULT 'rascunho',
	`aprovadoPor` varchar(255),
	`aprovadoEm` timestamp,
	`dataPagamento` date,
	`comprovanteUrl` text,
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `vtTipo` enum('nenhum','onibus','van','misto');--> statement-breakpoint
ALTER TABLE `employees` ADD `vtValorDiario` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `vtOperadora` varchar(100);--> statement-breakpoint
ALTER TABLE `employees` ADD `vtLinhas` varchar(255);--> statement-breakpoint
ALTER TABLE `employees` ADD `vtDescontoFolha` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoAlimenticia` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoValor` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoTipo` enum('percentual','valor_fixo');--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoPercentual` varchar(10);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoBeneficiario` varchar(255);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoBanco` varchar(100);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoAgencia` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoConta` varchar(30);--> statement-breakpoint
ALTER TABLE `employees` ADD `pensaoObservacoes` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `licencaMaternidade` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `employees` ADD `licencaTipo` enum('maternidade_120','maternidade_180','paternidade_5','paternidade_20');--> statement-breakpoint
ALTER TABLE `employees` ADD `licencaDataInicio` date;--> statement-breakpoint
ALTER TABLE `employees` ADD `licencaDataFim` date;--> statement-breakpoint
ALTER TABLE `employees` ADD `licencaObservacoes` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `seguroVida` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `contribuicaoSindical` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `fgtsPercentual` varchar(10) DEFAULT '8';--> statement-breakpoint
ALTER TABLE `employees` ADD `inssPercentual` varchar(10);--> statement-breakpoint
ALTER TABLE `employees` ADD `dissidioData` date;--> statement-breakpoint
ALTER TABLE `employees` ADD `dissidioPercentual` varchar(10);--> statement-breakpoint
ALTER TABLE `employees` ADD `convencaoColetiva` varchar(255);--> statement-breakpoint
ALTER TABLE `employees` ADD `convencaoVigencia` date;--> statement-breakpoint
ALTER TABLE `employees` ADD `ddsParticipacao` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `employees` ADD `docRgUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docCnhUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docCtpsUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docComprovanteResidenciaUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docCertidaoNascimentoUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docTituloEleitorUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docReservistaUrl` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `docOutrosUrl` text;--> statement-breakpoint
CREATE INDEX `edoc_company` ON `employee_documents` (`companyId`);--> statement-breakpoint
CREATE INDEX `edoc_employee` ON `employee_documents` (`employeeId`);--> statement-breakpoint
CREATE INDEX `edoc_tipo` ON `employee_documents` (`tipo`);--> statement-breakpoint
CREATE INDEX `fer_company` ON `feriados` (`companyId`);--> statement-breakpoint
CREATE INDEX `fer_data` ON `feriados` (`data`);--> statement-breakpoint
CREATE INDEX `fer_tipo` ON `feriados` (`tipo`);--> statement-breakpoint
CREATE INDEX `pjm_company_mes` ON `pj_medicoes` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pjm_contract` ON `pj_medicoes` (`contractId`);--> statement-breakpoint
CREATE INDEX `pjm_employee` ON `pj_medicoes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `pjm_status` ON `pj_medicoes` (`status`);