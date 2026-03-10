ALTER TABLE `vr_benefits` ADD `valorCafe` varchar(20) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `valorLanche` varchar(20) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `valorJanta` varchar(20) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `valorVA` varchar(20) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `status` enum('pendente','aprovado','pago','cancelado') DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `motivoAlteracao` text;--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `geradoPor` varchar(255);--> statement-breakpoint
ALTER TABLE `vr_benefits` ADD `aprovadoPor` varchar(255);--> statement-breakpoint
CREATE INDEX `vr_company_mes` ON `vr_benefits` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `vr_employee` ON `vr_benefits` (`employeeId`);