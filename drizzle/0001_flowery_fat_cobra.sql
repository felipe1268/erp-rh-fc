ALTER TABLE `eval_avaliadores` MODIFY COLUMN `passwordHash` varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `eval_avaliadores` MODIFY COLUMN `mustChangePassword` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `eval_avaliadores` ADD `user_id` int;