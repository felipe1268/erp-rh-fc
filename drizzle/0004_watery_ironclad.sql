CREATE TABLE `processo_analises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processoId` int NOT NULL,
	`resumoExecutivo` text,
	`valorEstimadoRisco` decimal(15,2),
	`valorEstimadoAcordo` decimal(15,2),
	`probabilidadeCondenacao` int,
	`probabilidadeAcordo` int,
	`probabilidadeArquivamento` int,
	`pontosFortes` json,
	`pontosFracos` json,
	`caminhosPositivos` json,
	`jurisprudenciaRelevante` json,
	`recomendacaoEstrategica` text,
	`insightsAdicionais` json,
	`valorCausaExtraido` decimal(15,2),
	`pedidosExtraidos` json,
	`modeloIA` varchar(100),
	`promptUsado` text,
	`respostaCompleta` text,
	`tempoAnaliseMs` int,
	`versaoAnalise` int DEFAULT 1,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `processo_aprendizado` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipoProcesso` varchar(100),
	`assuntos` json,
	`pedidos` json,
	`riscoInicial` varchar(20),
	`valorCausa` decimal(15,2),
	`resultadoFinal` enum('condenacao_total','condenacao_parcial','acordo','improcedente','arquivado','desistencia'),
	`valorFinalCondenacao` decimal(15,2),
	`valorFinalAcordo` decimal(15,2),
	`duracaoMeses` int,
	`estrategiaAdotada` text,
	`resultadoEstrategia` text,
	`licaoAprendida` text,
	`processoId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `processo_documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`processoId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('peticao_inicial','contestacao','sentenca','recurso','acordo','pericia','audiencia','despacho','mandado','outros') NOT NULL DEFAULT 'outros',
	`descricao` text,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`mimeType` varchar(100),
	`tamanhoBytes` int,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp
);
--> statement-breakpoint
CREATE INDEX `pa_company` ON `processo_analises` (`companyId`);--> statement-breakpoint
CREATE INDEX `pa_processo` ON `processo_analises` (`processoId`);--> statement-breakpoint
CREATE INDEX `papr_company` ON `processo_aprendizado` (`companyId`);--> statement-breakpoint
CREATE INDEX `papr_tipo` ON `processo_aprendizado` (`tipoProcesso`);--> statement-breakpoint
CREATE INDEX `papr_resultado` ON `processo_aprendizado` (`resultadoFinal`);--> statement-breakpoint
CREATE INDEX `pd_company` ON `processo_documentos` (`companyId`);--> statement-breakpoint
CREATE INDEX `pd_processo` ON `processo_documentos` (`processoId`);