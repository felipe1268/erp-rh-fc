CREATE INDEX `idx_aso_company` ON `asos` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_aso_employee` ON `asos` (`employeeId`);--> statement-breakpoint
CREATE INDEX `idx_aso_validade` ON `asos` (`companyId`,`dataValidade`);--> statement-breakpoint
CREATE INDEX `idx_emp_company` ON `employees` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_emp_status` ON `employees` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_obra_company` ON `obras` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_obra_status` ON `obras` (`companyId`,`status`);