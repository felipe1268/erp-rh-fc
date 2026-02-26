CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`moduleId` varchar(50) NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`canAccess` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `up_user` ON `user_permissions` (`userId`);--> statement-breakpoint
CREATE INDEX `up_module` ON `user_permissions` (`moduleId`);--> statement-breakpoint
CREATE INDEX `up_user_module` ON `user_permissions` (`userId`,`moduleId`);