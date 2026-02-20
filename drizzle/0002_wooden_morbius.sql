CREATE TABLE `accidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`dataAcidente` date NOT NULL,
	`horaAcidente` varchar(10),
	`tipoAcidente` enum('Tipico','Trajeto','Doenca_Ocupacional') NOT NULL,
	`gravidade` enum('Leve','Moderado','Grave','Fatal') NOT NULL,
	`localAcidente` varchar(255),
	`descricao` text,
	`parteCorpoAtingida` varchar(255),
	`catNumero` varchar(50),
	`catData` date,
	`diasAfastamento` int DEFAULT 0,
	`testemunhas` text,
	`acaoCorretiva` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `action_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`deviationId` int,
	`oQue` text NOT NULL,
	`porQue` text,
	`onde` varchar(255),
	`quando` date,
	`quem` varchar(255),
	`como` text,
	`quantoCusta` varchar(50),
	`statusPlano` enum('Pendente','Em_Andamento','Concluido','Cancelado') NOT NULL DEFAULT 'Pendente',
	`dataConclusao` date,
	`evidencia` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` enum('Admissional','Periodico','Retorno','Mudanca_Funcao','Demissional') NOT NULL,
	`dataExame` date NOT NULL,
	`dataValidade` date NOT NULL,
	`resultado` enum('Apto','Inapto','Apto_Restricao') NOT NULL DEFAULT 'Apto',
	`medico` varchar(255),
	`crm` varchar(20),
	`clinica` varchar(255),
	`observacoes` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`tipoAuditoria` enum('Interna','Externa','Cliente','Certificadora') NOT NULL,
	`dataAuditoria` date NOT NULL,
	`auditor` varchar(255),
	`setor` varchar(100),
	`resultadoAuditoria` enum('Conforme','Nao_Conforme','Observacao','Pendente') NOT NULL DEFAULT 'Pendente',
	`descricao` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chemicals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`fabricante` varchar(255),
	`numeroCAS` varchar(50),
	`classificacaoPerigo` varchar(255),
	`localArmazenamento` varchar(255),
	`quantidadeEstoque` varchar(50),
	`fispqUrl` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chemicals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cipa_elections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mandatoInicio` date NOT NULL,
	`mandatoFim` date NOT NULL,
	`statusEleicao` enum('Planejamento','Inscricao','Campanha','Votacao','Apuracao','Concluida') NOT NULL DEFAULT 'Planejamento',
	`dataEdital` date,
	`dataInscricaoInicio` date,
	`dataInscricaoFim` date,
	`dataEleicao` date,
	`dataPosse` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cipa_elections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cipa_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`electionId` int NOT NULL,
	`employeeId` int NOT NULL,
	`cargoCipa` enum('Presidente','Vice_Presidente','Secretario','Membro_Titular','Membro_Suplente') NOT NULL,
	`representacao` enum('Empregador','Empregados') NOT NULL,
	`inicioEstabilidade` date,
	`fimEstabilidade` date,
	`statusMembro` enum('Ativo','Desligado','Substituido') NOT NULL DEFAULT 'Ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cipa_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tema` varchar(255) NOT NULL,
	`dataRealizacao` date NOT NULL,
	`responsavel` varchar(255),
	`participantes` text,
	`descricao` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deviations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`auditId` int,
	`titulo` varchar(255) NOT NULL,
	`tipoDesvio` enum('NC_Maior','NC_Menor','Observacao','Oportunidade_Melhoria') NOT NULL,
	`setor` varchar(100),
	`descricao` text,
	`causaRaiz` text,
	`statusDesvio` enum('Aberto','Em_Andamento','Fechado','Cancelado') NOT NULL DEFAULT 'Aberto',
	`responsavel` varchar(255),
	`prazo` date,
	`dataConclusao` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deviations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `epi_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`epiId` int NOT NULL,
	`employeeId` int NOT NULL,
	`quantidade` int NOT NULL DEFAULT 1,
	`dataEntrega` date NOT NULL,
	`dataDevolucao` date,
	`motivo` varchar(255),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `epi_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `epis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`ca` varchar(20),
	`validadeCA` date,
	`fabricante` varchar(255),
	`quantidadeEstoque` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `epis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`patrimonio` varchar(50),
	`tipoEquipamento` varchar(100),
	`marca` varchar(100),
	`modelo` varchar(100),
	`numeroSerie` varchar(100),
	`localizacao` varchar(255),
	`responsavel` varchar(255),
	`statusEquipamento` enum('Ativo','Manutencao','Inativo','Descartado') NOT NULL DEFAULT 'Ativo',
	`dataAquisicao` date,
	`proximaManutencao` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extinguishers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`numero` varchar(20) NOT NULL,
	`tipoExtintor` enum('PQS','CO2','Agua','Espuma','AP') NOT NULL,
	`capacidade` varchar(20),
	`localizacao` varchar(255),
	`dataRecarga` date,
	`validadeRecarga` date,
	`dataTesteHidrostatico` date,
	`validadeTesteHidrostatico` date,
	`statusExtintor` enum('OK','Vencido','Manutencao') NOT NULL DEFAULT 'OK',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extinguishers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hydrants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`numero` varchar(20) NOT NULL,
	`localizacao` varchar(255),
	`tipoHidrante` varchar(50),
	`ultimaInspecao` date,
	`proximaInspecao` date,
	`statusHidrante` enum('OK','Manutencao','Inativo') NOT NULL DEFAULT 'OK',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hydrants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipoFolha` enum('Mensal','Adiantamento','Ferias','Rescisao','PLR','13_Salario') NOT NULL,
	`salarioBruto` varchar(20),
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`salarioLiquido` varchar(20),
	`inss` varchar(20),
	`irrf` varchar(20),
	`fgts` varchar(20),
	`valeTransporte` varchar(20),
	`valeAlimentacao` varchar(20),
	`outrosProventos` text,
	`outrosDescontos` text,
	`bancoDestino` varchar(100),
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`setor` varchar(100) NOT NULL,
	`agenteRisco` varchar(255) NOT NULL,
	`tipoRisco` enum('Fisico','Quimico','Biologico','Ergonomico','Acidente') NOT NULL,
	`fonteGeradora` varchar(255),
	`grauRisco` enum('Baixo','Medio','Alto','Critico') NOT NULL,
	`medidasControle` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`data` date NOT NULL,
	`entrada1` varchar(10),
	`saida1` varchar(10),
	`entrada2` varchar(10),
	`saida2` varchar(10),
	`entrada3` varchar(10),
	`saida3` varchar(10),
	`horasTrabalhadas` varchar(10),
	`horasExtras` varchar(10),
	`horasNoturnas` varchar(10),
	`faltas` varchar(10),
	`atrasos` varchar(10),
	`justificativa` text,
	`fonte` varchar(50) DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`norma` varchar(50),
	`cargaHoraria` varchar(20),
	`dataRealizacao` date NOT NULL,
	`dataValidade` date,
	`instrutor` varchar(255),
	`entidade` varchar(255),
	`certificadoUrl` text,
	`statusTreinamento` enum('Valido','Vencido','A_Vencer') NOT NULL DEFAULT 'Valido',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipoVeiculo` enum('Carro','Caminhao','Van','Moto','Maquina_Pesada','Outro') NOT NULL,
	`placa` varchar(10),
	`modelo` varchar(100) NOT NULL,
	`marca` varchar(100),
	`anoFabricacao` varchar(4),
	`renavam` varchar(20),
	`chassi` varchar(30),
	`responsavel` varchar(255),
	`statusVeiculo` enum('Ativo','Manutencao','Inativo') NOT NULL DEFAULT 'Ativo',
	`proximaManutencao` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipoAdvertencia` enum('Verbal','Escrita','Suspensao','OSS') NOT NULL,
	`dataOcorrencia` date NOT NULL,
	`motivo` text NOT NULL,
	`descricao` text,
	`testemunhas` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warnings_id` PRIMARY KEY(`id`)
);
