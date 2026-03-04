CREATE TABLE `field_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraId` int,
	`data` date NOT NULL,
	`tipoOcorrencia` enum('falta','atraso','saida_antecipada','abandono_posto','insubordinacao','acidente','atestado_medico','desvio_conduta','elogio','outro') NOT NULL,
	`descricao` text NOT NULL,
	`solicitanteNome` varchar(255) NOT NULL,
	`solicitanteId` varchar(255),
	`evidenciaUrl` varchar(500),
	`prioridade` enum('baixa','media','alta','urgente') NOT NULL DEFAULT 'media',
	`status` enum('pendente','em_analise','resolvido','arquivado') NOT NULL DEFAULT 'pendente',
	`respostaRH` text,
	`acaoTomada` enum('nenhuma','advertencia_verbal','advertencia_escrita','suspensao','desconto_folha','ajuste_ponto','encaminhamento_medico','outro'),
	`resolvidoPor` varchar(255),
	`resolvidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `field_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `fn_company` ON `field_notes` (`companyId`);--> statement-breakpoint
CREATE INDEX `fn_employee` ON `field_notes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `fn_obra` ON `field_notes` (`obraId`);--> statement-breakpoint
CREATE INDEX `fn_status` ON `field_notes` (`status`);--> statement-breakpoint
CREATE INDEX `fn_data` ON `field_notes` (`data`);--> statement-breakpoint
CREATE INDEX `fn_tipo` ON `field_notes` (`tipoOcorrencia`);