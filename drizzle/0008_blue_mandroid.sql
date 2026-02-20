ALTER TABLE `employees` MODIFY COLUMN `tipoConta` enum('Corrente','Poupanca','Salario');--> statement-breakpoint
ALTER TABLE `employees` ADD `tipoChavePix` enum('CPF','Celular','Email','Aleatoria');--> statement-breakpoint
ALTER TABLE `employees` ADD `contaPix` varchar(100);--> statement-breakpoint
ALTER TABLE `employees` ADD `bancoPix` varchar(100);