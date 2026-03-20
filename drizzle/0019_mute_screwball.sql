ALTER TABLE "termination_notices" ADD COLUMN "fgtsReal" varchar(20);--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "fgtsEditadoManualmente" smallint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "fgtsEditadoEm" timestamp;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "fgtsEditadoPor" varchar(255);--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "descontosAcerto" varchar(20);--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "descontosAcertoDesc" text;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "acrescimosAcerto" varchar(20);--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "acrescimosAcertoDesc" text;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "novoEmpregoAtivo" smallint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "novoEmpregoComunicadoEm" date;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "novoEmpregoCartaUrl" text;