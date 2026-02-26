CREATE TABLE `user_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `uc_user` ON `user_companies` (`userId`);--> statement-breakpoint
CREATE INDEX `uc_company` ON `user_companies` (`companyId`);