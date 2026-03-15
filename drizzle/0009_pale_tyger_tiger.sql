CREATE TABLE "he_solicitacao_atividades" (
	"id" serial NOT NULL,
	"solicitacao_id" integer NOT NULL,
	"atividade_id" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "he_sol_atv_sol" ON "he_solicitacao_atividades" USING btree ("solicitacao_id");--> statement-breakpoint
CREATE INDEX "he_sol_atv_atv" ON "he_solicitacao_atividades" USING btree ("atividade_id");