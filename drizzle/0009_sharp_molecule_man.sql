CREATE TABLE `obra_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`obraId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`funcaoNaObra` varchar(100),
	`dataInicio` date,
	`dataFim` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `obra_funcionarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obra_horas_rateio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int NOT NULL,
	`employeeId` int NOT NULL,
	`dixiDeviceId` int,
	`mesAno` varchar(7) NOT NULL,
	`horasNormais` varchar(10),
	`horasExtras` varchar(10),
	`horasNoturnas` varchar(10),
	`totalHoras` varchar(10),
	`diasTrabalhados` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `obra_horas_rateio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`codigo` varchar(50),
	`cliente` varchar(255),
	`responsavel` varchar(255),
	`endereco` text,
	`cidade` varchar(100),
	`estado` varchar(2),
	`cep` varchar(10),
	`dataInicio` date,
	`dataPrevisaoFim` date,
	`dataFimReal` date,
	`status` enum('Planejamento','Em_Andamento','Paralisada','Concluida','Cancelada') NOT NULL DEFAULT 'Planejamento',
	`valorContrato` varchar(20),
	`observacoes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `obras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dixi_devices` ADD `obraId` int;--> statement-breakpoint
ALTER TABLE `employees` ADD `obraAtualId` int;