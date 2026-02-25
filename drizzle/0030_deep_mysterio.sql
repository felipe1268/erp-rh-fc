CREATE TABLE `fornecedores_epi` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`contato` varchar(255),
	`telefone` varchar(30),
	`email` varchar(255),
	`endereco` varchar(500),
	`observacoes` text,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
