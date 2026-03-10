CREATE TABLE `custom_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `ce_company` ON `custom_exams` (`companyId`);