CREATE TABLE "banco_horas_lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"hePeriodId" integer,
	"tipo" text NOT NULL,
	"minutos" integer NOT NULL,
	"descricao" text NOT NULL,
	"data" date NOT NULL,
	"criadoPor" text,
	"criadoEm" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "banco_horas_saldo" (
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"saldoMinutos" integer DEFAULT 0 NOT NULL,
	"atualizadoEm" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "he_period_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"hePeriodId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"nome" text,
	"heUtilMins" integer DEFAULT 0,
	"heFimMins" integer DEFAULT 0,
	"heTotalMins" integer DEFAULT 0,
	"valorHEUtil" numeric(15, 2) DEFAULT '0',
	"valorHEFim" numeric(15, 2) DEFAULT '0',
	"valorHETotal" numeric(15, 2) DEFAULT '0',
	"salarioBruto" numeric(15, 2) DEFAULT '0',
	"valorHora" numeric(15, 4) DEFAULT '0',
	"destinacao" text DEFAULT 'pagamento'
);
--> statement-breakpoint
CREATE TABLE "he_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"mesReferencia" text NOT NULL,
	"dataInicio" date NOT NULL,
	"dataFim" date NOT NULL,
	"status" text DEFAULT 'calculado' NOT NULL,
	"totalFuncionarios" integer DEFAULT 0,
	"totalHEMins" integer DEFAULT 0,
	"totalValorHE" numeric(15, 2) DEFAULT '0',
	"criadoPor" text,
	"aprovadoPor" text,
	"aprovadoEm" timestamp,
	"pagoPor" text,
	"pagoEm" timestamp,
	"criadoEm" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pj_contract_revisoes" (
	"id" serial NOT NULL,
	"contractId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"revisaoNum" varchar(10) NOT NULL,
	"motivo" text,
	"snapshot" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"criadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pj_documentos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"contractId" integer,
	"nome" varchar(255) NOT NULL,
	"tipo" varchar(100) DEFAULT 'outro',
	"url" text NOT NULL,
	"storageKey" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "pj_contracts" ADD COLUMN "revisao" varchar(10) DEFAULT '01';--> statement-breakpoint
ALTER TABLE "pj_contracts" ADD COLUMN "revisaoMotivo" text;--> statement-breakpoint
CREATE INDEX "bhl_emp" ON "banco_horas_lancamentos" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "bhl_company" ON "banco_horas_lancamentos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "bhl_data" ON "banco_horas_lancamentos" USING btree ("data");--> statement-breakpoint
CREATE INDEX "he_pe_period" ON "he_period_employees" USING btree ("hePeriodId");--> statement-breakpoint
CREATE INDEX "he_pe_emp" ON "he_period_employees" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "he_pe_company" ON "he_period_employees" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "he_periods_company" ON "he_periods" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "he_periods_mes" ON "he_periods" USING btree ("mesReferencia");--> statement-breakpoint
CREATE INDEX "he_periods_status" ON "he_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pjcr_contract" ON "pj_contract_revisoes" USING btree ("contractId");--> statement-breakpoint
CREATE INDEX "pjcr_company" ON "pj_contract_revisoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pjd_company" ON "pj_documentos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pjd_employee" ON "pj_documentos" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "pjd_contract" ON "pj_documentos" USING btree ("contractId");