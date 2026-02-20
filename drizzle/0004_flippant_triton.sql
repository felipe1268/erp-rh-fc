CREATE TABLE `advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`valorAdiantamento` varchar(20),
	`valorLiquido` varchar(20),
	`descontoIR` varchar(20),
	`bancoDestino` varchar(100),
	`diasFaltas` int DEFAULT 0,
	`aprovado` enum('Pendente','Aprovado','Reprovado') NOT NULL DEFAULT 'Pendente',
	`motivoReprovacao` text,
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `advances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extra_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipoExtra` enum('Diferenca_Salario','Horas_Extras','Reembolso','Bonus','Outro') NOT NULL,
	`descricao` text,
	`valorHoraBase` varchar(20),
	`percentualAcrescimo` varchar(10),
	`quantidadeHoras` varchar(10),
	`valorTotal` varchar(20) NOT NULL,
	`bancoDestino` varchar(100),
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extra_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_payroll_summary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`nomeColaborador` varchar(255),
	`codigoContabil` varchar(20),
	`funcao` varchar(100),
	`dataAdmissao` date,
	`salarioBaseHora` varchar(20),
	`horasMensais` varchar(10),
	`adiantamentoBruto` varchar(20),
	`adiantamentoDescontos` varchar(20),
	`adiantamentoLiquido` varchar(20),
	`salarioHorista` varchar(20),
	`dsr` varchar(20),
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`folhaLiquido` varchar(20),
	`baseINSS` varchar(20),
	`valorINSS` varchar(20),
	`baseFGTS` varchar(20),
	`valorFGTS` varchar(20),
	`baseIRRF` varchar(20),
	`valorIRRF` varchar(20),
	`diferencaSalario` varchar(20),
	`horasExtrasValor` varchar(20),
	`vrBeneficio` varchar(20),
	`bancoAdiantamento` varchar(100),
	`bancoFolha` varchar(100),
	`custoTotalMes` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_payroll_summary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vr_benefits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`valorDiario` varchar(20),
	`diasUteis` int,
	`valorTotal` varchar(20) NOT NULL,
	`operadora` varchar(100) DEFAULT 'iFood Benefícios',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vr_benefits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `banco` enum('Caixa_Economica','Santander','Outro');--> statement-breakpoint
ALTER TABLE `payroll_uploads` MODIFY COLUMN `category` enum('cartao_ponto','espelho_adiantamento_analitico','adiantamento_sintetico','adiantamento_banco_cef','adiantamento_banco_santander','espelho_folha_analitico','folha_sintetico','pagamento_banco_cef','pagamento_banco_santander') NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `valorHora` varchar(20);--> statement-breakpoint
ALTER TABLE `employees` ADD `bancoNome` varchar(100);