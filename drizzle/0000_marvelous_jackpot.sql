CREATE TABLE "accidents" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"dataAcidente" date NOT NULL,
	"horaAcidente" varchar(10),
	"tipoAcidente" text NOT NULL,
	"gravidade" text NOT NULL,
	"localAcidente" varchar(255),
	"descricao" text,
	"parteCorpoAtingida" varchar(255),
	"catNumero" varchar(50),
	"catData" date,
	"diasAfastamento" integer DEFAULT 0,
	"testemunhas" text,
	"acaoCorretiva" text,
	"documentoUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"deviationId" integer,
	"oQue" text NOT NULL,
	"porQue" text,
	"onde" varchar(255),
	"quando" date,
	"quem" varchar(255),
	"como" text,
	"quantoCusta" varchar(50),
	"statusPlano" text DEFAULT 'Pendente' NOT NULL,
	"dataConclusao" date,
	"evidencia" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advances" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"valorAdiantamento" varchar(20),
	"valorLiquido" varchar(20),
	"descontoIr" varchar(20),
	"bancoDestino" varchar(100),
	"diasFaltas" integer DEFAULT 0,
	"aprovado" text DEFAULT 'Pendente' NOT NULL,
	"motivoReprovacao" text,
	"dataPagamento" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertas_terceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresaTerceiraId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"data_vencimento" timestamp,
	"emailEnviado" smallint DEFAULT 0,
	"email_enviado_em" timestamp,
	"resolvido" smallint DEFAULT 0,
	"resolvido_em" timestamp,
	"resolvido_por" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"dataExame" date NOT NULL,
	"dataValidade" date NOT NULL,
	"validadeDias" integer DEFAULT 365,
	"resultado" varchar(50) DEFAULT 'Apto' NOT NULL,
	"medico" varchar(255),
	"crm" varchar(20),
	"examesRealizados" text,
	"jaAtualizou" smallint DEFAULT 0,
	"clinica" varchar(255),
	"observacoes" text,
	"documentoUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "atestados" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipo" varchar(100) NOT NULL,
	"dataEmissao" date NOT NULL,
	"diasAfastamento" integer DEFAULT 0,
	"dataRetorno" date,
	"cid" varchar(20),
	"medico" varchar(255),
	"crm" varchar(20),
	"descricao" text,
	"motivo" varchar(100),
	"motivoOutro" text,
	"documentoUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial NOT NULL,
	"userId" integer,
	"userName" varchar(255),
	"companyId" integer,
	"action" varchar(50) NOT NULL,
	"module" varchar(50) NOT NULL,
	"entityType" varchar(50),
	"entityId" integer,
	"details" text,
	"ipAddress" varchar(45),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"tipoAuditoria" text NOT NULL,
	"dataAuditoria" date NOT NULL,
	"auditor" varchar(255),
	"setor" varchar(100),
	"resultadoAuditoria" text DEFAULT 'Pendente' NOT NULL,
	"descricao" text,
	"documentoUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_avaliadores" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"avaliadorUserId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_ciclos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"questionarioId" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"dataInicio" date NOT NULL,
	"dataFim" date NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"criadoPor" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_config" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"notaMinima" numeric(5, 2) DEFAULT '0',
	"notaMaxima" numeric(5, 2) DEFAULT '5',
	"permitirAutoAvaliacao" smallint DEFAULT 0,
	"exibirRankingParaAvaliadores" smallint DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_perguntas" (
	"id" serial NOT NULL,
	"questionarioId" integer NOT NULL,
	"texto" text NOT NULL,
	"tipo" text DEFAULT 'nota_1_5' NOT NULL,
	"peso" integer DEFAULT 1 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_questionarios" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"frequencia" text DEFAULT 'mensal' NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"criadoPor" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_respostas" (
	"id" serial NOT NULL,
	"avaliacaoId" integer NOT NULL,
	"perguntaId" integer NOT NULL,
	"valor" varchar(20),
	"textoLivre" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacoes" (
	"id" serial NOT NULL,
	"cicloId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"avaliadorId" integer NOT NULL,
	"avaliadorNome" varchar(255),
	"status" text DEFAULT 'pendente' NOT NULL,
	"notaFinal" numeric(5, 2),
	"observacoes" text,
	"tempoAvaliacao" integer,
	"finalizadaEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial NOT NULL,
	"tipo" text DEFAULT 'automatico' NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"tabelasExportadas" integer DEFAULT 0 NOT NULL,
	"registrosExportados" integer DEFAULT 0 NOT NULL,
	"tamanhoBytes" integer DEFAULT 0 NOT NULL,
	"s3Key" varchar(500),
	"s3Url" varchar(1000),
	"erro" text,
	"iniciadoPor" varchar(255) DEFAULT 'Sistema',
	"iniciadoEm" timestamp DEFAULT now() NOT NULL,
	"concluidoEm" timestamp
);
--> statement-breakpoint
CREATE TABLE "blacklist_reactivation_requests" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"employeeName" varchar(255) NOT NULL,
	"employeeCpf" varchar(14),
	"solicitadoPor" varchar(255) NOT NULL,
	"solicitadoPorId" integer NOT NULL,
	"motivoReativacao" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"aprovador1Nome" varchar(255),
	"aprovador1Id" integer,
	"aprovador1Data" timestamp,
	"aprovador1Parecer" text,
	"aprovador2Nome" varchar(255),
	"aprovador2Id" integer,
	"aprovador2Data" timestamp,
	"aprovador2Parecer" text,
	"rejeitadoPor" varchar(255),
	"rejeitadoPorId" integer,
	"motivoRejeicao" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caepi_database" (
	"id" serial NOT NULL,
	"ca" varchar(20) NOT NULL,
	"validade" varchar(20),
	"situacao" varchar(30),
	"cnpj" varchar(20),
	"fabricante" varchar(500),
	"natureza" varchar(50),
	"equipamento" varchar(500),
	"descricao" text,
	"referencia" varchar(500),
	"cor" varchar(100),
	"aprovado_para" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chemicals" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"fabricante" varchar(255),
	"numeroCas" varchar(50),
	"classificacaoPerigo" varchar(255),
	"localArmazenamento" varchar(255),
	"quantidadeEstoque" varchar(50),
	"fispqUrl" text,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cipa_elections" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"mandatoInicio" date NOT NULL,
	"mandatoFim" date NOT NULL,
	"statusEleicao" text DEFAULT 'Planejamento' NOT NULL,
	"dataEdital" date,
	"dataInscricaoInicio" date,
	"dataInscricaoFim" date,
	"dataEleicao" date,
	"dataPosse" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cipa_meetings" (
	"id" serial NOT NULL,
	"mandateId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text DEFAULT 'ordinaria' NOT NULL,
	"dataReuniao" date NOT NULL,
	"horaInicio" varchar(10),
	"horaFim" varchar(10),
	"local" varchar(255),
	"pauta" text,
	"ataTexto" text,
	"ataDocumentoUrl" text,
	"presentesJson" text,
	"status" text DEFAULT 'agendada' NOT NULL,
	"observacoes" text,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cipa_members" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"electionId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"cargoCipa" text NOT NULL,
	"representacao" text NOT NULL,
	"inicioEstabilidade" date,
	"fimEstabilidade" date,
	"statusMembro" text DEFAULT 'Ativo' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicas" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"endereco" varchar(500),
	"telefone" varchar(50),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial NOT NULL,
	"cnpj" varchar(18) NOT NULL,
	"razaoSocial" varchar(255) NOT NULL,
	"nomeFantasia" varchar(255),
	"endereco" text,
	"cidade" varchar(100),
	"estado" varchar(2),
	"cep" varchar(10),
	"telefone" varchar(20),
	"email" varchar(320),
	"logoUrl" text,
	"site" varchar(255),
	"grupoEmpresarial" varchar(100),
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"prefixoCodigo" varchar(10) DEFAULT 'EMP',
	"nextCodigoInterno" integer DEFAULT 1 NOT NULL,
	"numerosProibidos" varchar(500) DEFAULT '13,17,22,24,69,171,666',
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"inscricaoEstadual" varchar(30),
	"inscricaoMunicipal" varchar(30),
	"compartilhaRecursos" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_bank_accounts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"banco" varchar(100) NOT NULL,
	"codigoBanco" varchar(10),
	"agencia" varchar(20) NOT NULL,
	"conta" varchar(30) NOT NULL,
	"tipoConta" text DEFAULT 'corrente' NOT NULL,
	"apelido" varchar(100),
	"cnpjTitular" varchar(20),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"documentoUrl" text,
	"dataEmissao" date,
	"dataValidade" date,
	"elaboradoPor" varchar(255),
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"conteudoHtml" text NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convencao_coletiva" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"nome" varchar(255) NOT NULL,
	"sindicato" varchar(255),
	"cnpjSindicato" varchar(18),
	"dataBase" varchar(20),
	"vigenciaInicio" date,
	"vigenciaFim" date,
	"pisoSalarial" varchar(20),
	"percentualReajuste" varchar(10),
	"adicionalInsalubridade" varchar(10),
	"adicionalPericulosidade" varchar(10),
	"horaExtraDiurna" varchar(10),
	"horaExtraNoturna" varchar(10),
	"horaExtraDomingo" varchar(10),
	"adicionalNoturno" varchar(10),
	"valeRefeicao" varchar(20),
	"valeAlimentacao" varchar(20),
	"valeTransporte" varchar(20),
	"cestaBasica" varchar(20),
	"auxilioFarmacia" varchar(20),
	"planoSaude" varchar(255),
	"seguroVida" varchar(20),
	"outrosBeneficios" text,
	"clausulasEspeciais" text,
	"documentoUrl" text,
	"isMatriz" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"observacoes" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_exams" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datajud_alerts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"processoId" integer,
	"tipo" text NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"lido" smallint DEFAULT 0 NOT NULL,
	"lidoPor" varchar(255),
	"lidoEm" timestamp,
	"dados" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datajud_auto_check_config" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"intervaloMinutos" integer DEFAULT 60 NOT NULL,
	"ultimaVerificacao" timestamp,
	"totalVerificacoes" integer DEFAULT 0 NOT NULL,
	"totalAlertas" integer DEFAULT 0 NOT NULL,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dds" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tema" varchar(255) NOT NULL,
	"dataRealizacao" date NOT NULL,
	"responsavel" varchar(255),
	"participantes" text,
	"descricao" text,
	"documentoUrl" text,
	"fotosUrls" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deviations" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"auditId" integer,
	"titulo" varchar(255) NOT NULL,
	"tipoDesvio" text NOT NULL,
	"setor" varchar(100),
	"descricao" text,
	"causaRaiz" text,
	"statusDesvio" text DEFAULT 'Aberto' NOT NULL,
	"responsavel" varchar(255),
	"prazo" date,
	"dataConclusao" date,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dissidio_funcionarios" (
	"id" serial NOT NULL,
	"dissidioId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"salarioAnterior" varchar(20) NOT NULL,
	"salarioNovo" varchar(20) NOT NULL,
	"percentualAplicado" varchar(10) NOT NULL,
	"diferencaValor" varchar(20),
	"mesesRetroativos" integer DEFAULT 0,
	"valorRetroativo" varchar(20),
	"status" text DEFAULT 'pendente' NOT NULL,
	"motivoExclusao" text,
	"aplicadoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dissidios" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"anoReferencia" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"sindicato" varchar(255),
	"numeroCct" varchar(100),
	"mesDataBase" integer DEFAULT 5 NOT NULL,
	"dataBaseInicio" date NOT NULL,
	"dataBaseFim" date NOT NULL,
	"percentualReajuste" varchar(10) NOT NULL,
	"percentualInpc" varchar(10),
	"percentualGanhoReal" varchar(10),
	"pisoSalarial" varchar(20),
	"pisoSalarialAnterior" varchar(20),
	"valorVa" varchar(20),
	"valorVt" varchar(20),
	"valorSeguroVida" varchar(20),
	"contribuicaoAssistencial" varchar(10),
	"dataAplicacao" date,
	"aplicadoPor" varchar(255),
	"retroativo" smallint DEFAULT 1 NOT NULL,
	"dataRetroativoInicio" date,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"observacoes" text,
	"documentoUrl" text,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dixi_afd_importacoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"dataImportacao" timestamp DEFAULT now() NOT NULL,
	"metodo" text DEFAULT 'AFD' NOT NULL,
	"arquivoNome" varchar(255),
	"snRelogio" varchar(50),
	"obraId" integer,
	"obraNome" varchar(255),
	"totalMarcacoes" integer DEFAULT 0 NOT NULL,
	"totalFuncionarios" integer DEFAULT 0 NOT NULL,
	"totalInconsistencias" integer DEFAULT 0 NOT NULL,
	"periodoInicio" varchar(10),
	"periodoFim" varchar(10),
	"status" text DEFAULT 'sucesso' NOT NULL,
	"importadoPor" varchar(255),
	"detalhes" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dixi_afd_marcacoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"importacaoId" integer NOT NULL,
	"nsr" varchar(20),
	"cpf" varchar(14) NOT NULL,
	"data" date NOT NULL,
	"hora" varchar(10) NOT NULL,
	"snRelogio" varchar(50),
	"obraId" integer,
	"employeeId" integer,
	"employeeName" varchar(255),
	"status" text DEFAULT 'processado' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dixi_devices" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"serialNumber" varchar(50) NOT NULL,
	"obraName" varchar(255) NOT NULL,
	"location" text,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"obraId" integer,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "dixi_name_mappings" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"dixiName" varchar(255) NOT NULL,
	"dixiId" varchar(50),
	"employeeId" integer NOT NULL,
	"employeeName" varchar(255) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"createdBy" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"conteudo" text NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"criadoPor" varchar(255),
	"atualizadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"assunto" varchar(255) NOT NULL,
	"corpo" text NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_aptidao" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"motivoInapto" text,
	"ultimaVerificacao" timestamp,
	"asoVigente" smallint DEFAULT 0 NOT NULL,
	"treinamentosObrigatoriosOk" smallint DEFAULT 0 NOT NULL,
	"documentosPessoaisOk" smallint DEFAULT 0 NOT NULL,
	"nrObrigatoriasOk" smallint DEFAULT 0 NOT NULL,
	"verificadoPor" varchar(255),
	"verificadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_contracts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"templateId" integer,
	"tipo" text NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"dataInicio" date NOT NULL,
	"dataFim" date,
	"prazoExperienciaDias" integer,
	"prazoProrrogacaoDias" integer,
	"dataProrrogacao" date,
	"dataEfetivacao" date,
	"salarioBase" varchar(20),
	"valorHora" varchar(20),
	"funcao" varchar(100),
	"jornadaTrabalho" text,
	"localTrabalho" text,
	"conteudoGerado" text,
	"contratoAssinadoUrl" text,
	"contratoAssinadoKey" text,
	"prorrogacaoAssinadaUrl" text,
	"prorrogacaoAssinadaKey" text,
	"observacoes" text,
	"contratoAnteriorId" integer,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipo" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" varchar(500),
	"fileUrl" text NOT NULL,
	"fileKey" text NOT NULL,
	"mimeType" varchar(100),
	"fileSize" integer,
	"dataValidade" date,
	"uploadPor" varchar(255),
	"uploadPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "employee_history" (
	"id" serial NOT NULL,
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"valorAnterior" text,
	"valorNovo" text,
	"dataEvento" date NOT NULL,
	"registradoPor" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_site_history" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"obraId" integer NOT NULL,
	"tipo" text NOT NULL,
	"dataInicio" date NOT NULL,
	"dataFim" date,
	"motivoTransferencia" text,
	"obraOrigemId" integer,
	"registradoPor" varchar(255),
	"registradoPorUserId" integer,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_skills" (
	"id" serial NOT NULL,
	"employeeId" integer NOT NULL,
	"skillId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"nivel" text DEFAULT 'Basico' NOT NULL,
	"tempoExperiencia" varchar(100),
	"observacao" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"matricula" varchar(20),
	"nomeCompleto" varchar(255) NOT NULL,
	"cpf" varchar(14) NOT NULL,
	"rg" varchar(20),
	"orgaoEmissor" varchar(20),
	"dataNascimento" date,
	"sexo" text,
	"estadoCivil" text,
	"nacionalidade" varchar(50),
	"naturalidade" varchar(100),
	"nomeMae" varchar(255),
	"nomePai" varchar(255),
	"ctps" varchar(20),
	"serieCtps" varchar(10),
	"pis" varchar(20),
	"tituloEleitor" varchar(20),
	"certificadoReservista" varchar(20),
	"cnh" varchar(20),
	"categoriaCnh" varchar(5),
	"validadeCnh" date,
	"logradouro" varchar(255),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"estado" varchar(2),
	"cep" varchar(10),
	"telefone" varchar(20),
	"celular" varchar(20),
	"email" varchar(320),
	"contatoEmergencia" varchar(255),
	"telefoneEmergencia" varchar(20),
	"parentescoEmergencia" varchar(100),
	"cargo" varchar(100),
	"funcao" varchar(100),
	"setor" varchar(100),
	"dataAdmissao" date,
	"dataDemissao" date,
	"salarioBase" varchar(20),
	"valorHora" varchar(20),
	"horasMensais" varchar(10),
	"tipoContrato" text,
	"jornadaTrabalho" text,
	"banco" varchar(100),
	"bancoNome" varchar(100),
	"agencia" varchar(20),
	"conta" varchar(30),
	"tipoConta" text,
	"tipoChavePix" text,
	"chavePix" varchar(100),
	"contaPix" varchar(100),
	"bancoPix" varchar(100),
	"status" text DEFAULT 'Ativo' NOT NULL,
	"fotoUrl" text,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"listaNegra" smallint DEFAULT 0 NOT NULL,
	"motivoListaNegra" text,
	"dataListaNegra" date,
	"codigoContabil" varchar(20),
	"codigoInterno" varchar(10),
	"recebeComplemento" smallint DEFAULT 0 NOT NULL,
	"valorComplemento" varchar(20),
	"descricaoComplemento" varchar(255),
	"acordoHoraExtra" smallint DEFAULT 0 NOT NULL,
	"heNormal50" varchar(10) DEFAULT '50',
	"heNoturna" varchar(10) DEFAULT '20',
	"he100" varchar(10) DEFAULT '100',
	"heFeriado" varchar(10) DEFAULT '100',
	"heInterjornada" varchar(10) DEFAULT '50',
	"obsAcordoHe" text,
	"contaBancariaEmpresaId" integer,
	"listaNegraPor" varchar(255),
	"listaNegraUserId" integer,
	"desligadoPor" varchar(255),
	"desligadoUserId" integer,
	"dataDesligamentoEfetiva" date,
	"motivoDesligamento" text,
	"categoriaDesligamento" varchar(50),
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"deleteReason" text,
	"experienciaTipo" text,
	"experienciaInicio" date,
	"experienciaFim1" date,
	"experienciaFim2" date,
	"experienciaStatus" text DEFAULT 'em_experiencia',
	"experienciaProrrogadoEm" date,
	"experienciaProrrogadoPor" varchar(255),
	"experienciaEfetivadoEm" date,
	"experienciaEfetivadoPor" varchar(255),
	"experienciaObs" text,
	"vtTipo" text,
	"vtValorDiario" varchar(20),
	"vtOperadora" varchar(100),
	"vtLinhas" varchar(255),
	"vtDescontoFolha" varchar(20),
	"pensaoAlimenticia" smallint DEFAULT 0,
	"pensaoValor" varchar(20),
	"pensaoTipo" text,
	"pensaoPercentual" varchar(10),
	"pensaoBeneficiario" varchar(255),
	"pensaoBanco" varchar(100),
	"pensaoAgencia" varchar(20),
	"pensaoConta" varchar(30),
	"pensaoObservacoes" text,
	"licencaMaternidade" smallint DEFAULT 0,
	"licencaTipo" text,
	"licencaDataInicio" date,
	"licencaDataFim" date,
	"licencaObservacoes" text,
	"seguroVida" varchar(20),
	"contribuicaoSindical" varchar(20),
	"fgtsPercentual" varchar(10) DEFAULT '8',
	"inssPercentual" varchar(10),
	"dissidioData" date,
	"dissidioPercentual" varchar(10),
	"convencaoColetiva" varchar(255),
	"convencaoVigencia" date,
	"ddsParticipacao" smallint DEFAULT 1,
	"docRgUrl" text,
	"docCnhUrl" text,
	"docCtpsUrl" text,
	"docComprovanteResidenciaUrl" text,
	"docCertidaoNascimentoUrl" text,
	"docTituloEleitorUrl" text,
	"docReservistaUrl" text,
	"docOutrosUrl" text,
	"vrBeneficio" varchar(20),
	"vtRecebe" varchar(20),
	"vtNumeroCartao" varchar(50),
	"vaRecebe" varchar(20),
	"vaValor" varchar(20),
	"vaOperadora" varchar(100),
	"vaNumeroCartao" varchar(50),
	"auxFarmacia" varchar(20),
	"auxFarmaciaValor" varchar(20),
	"planoSaude" varchar(20),
	"planoSaudeOperadora" varchar(100),
	"planoSaudeValor" varchar(20),
	"benefObs" text
);
--> statement-breakpoint
CREATE TABLE "empresas_terceiras" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"razao_social" varchar(255) NOT NULL,
	"nome_fantasia" varchar(255),
	"cnpj" varchar(20) NOT NULL,
	"inscricao_estadual" varchar(30),
	"inscricao_municipal" varchar(30),
	"cep" varchar(10),
	"logradouro" varchar(255),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"estado" varchar(2),
	"telefone" varchar(30),
	"celular" varchar(30),
	"email" varchar(255),
	"email_financeiro" varchar(255),
	"responsavel_nome" varchar(255),
	"responsavel_cargo" varchar(100),
	"tipo_servico" varchar(255),
	"descricao_servico" text,
	"pgr_url" varchar(500),
	"pgr_validade" timestamp,
	"pcmso_url" varchar(500),
	"pcmso_validade" timestamp,
	"contrato_social_url" varchar(500),
	"alvara_url" varchar(500),
	"alvara_validade" timestamp,
	"seguro_vida_url" varchar(500),
	"seguro_vida_validade" timestamp,
	"banco" varchar(100),
	"agencia" varchar(20),
	"conta" varchar(30),
	"tipoConta" text,
	"titular_conta" varchar(255),
	"cpf_cnpj_titular" varchar(20),
	"formaPagamento" text,
	"pix_chave" varchar(255),
	"pixTipoChave" text,
	"status" text DEFAULT 'ativa' NOT NULL,
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(255),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "epi_ai_analises" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"resultado" text NOT NULL,
	"sugestoes" json,
	"status" text DEFAULT 'nova' NOT NULL,
	"aplicadaPor" varchar(255),
	"aplicadaPorUserId" integer,
	"aplicadaEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_alerta_capacidade" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"limiar" integer DEFAULT 5 NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"emailDestinatarios" text,
	"ultimoAlertaEm" timestamp,
	"ultimaCapacidade" integer,
	"intervaloMinHoras" integer DEFAULT 24 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_alerta_capacidade_log" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"capacidade" integer NOT NULL,
	"limiar" integer NOT NULL,
	"gargaloItem" varchar(255),
	"gargaloEstoque" integer,
	"destinatariosEnviados" text,
	"emailsEnviados" integer DEFAULT 0 NOT NULL,
	"emailsErros" integer DEFAULT 0 NOT NULL,
	"enviadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_assinaturas" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"deliveryId" integer,
	"employeeId" integer NOT NULL,
	"tipo" text NOT NULL,
	"assinaturaUrl" text NOT NULL,
	"assinadoEm" timestamp DEFAULT now() NOT NULL,
	"ipAddress" varchar(45),
	"userAgent" text,
	"entregadorNome" varchar(255),
	"entregadorUserId" integer,
	"hashSha256" varchar(64),
	"latitude" varchar(20),
	"longitude" varchar(20),
	"geoAccuracy" varchar(20),
	"termoAceito" smallint DEFAULT 0,
	"textoTermo" text,
	"dispositivoInfo" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_checklist_items" (
	"id" serial NOT NULL,
	"checklistId" integer NOT NULL,
	"nomeEpi" varchar(255) NOT NULL,
	"categoria" text DEFAULT 'EPI' NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"entregue" smallint DEFAULT 0 NOT NULL,
	"devolvido" smallint DEFAULT 0 NOT NULL,
	"epiId" integer,
	"deliveryId" integer,
	"dataEntrega" date,
	"dataDevolucao" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_checklists" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"kitId" integer,
	"tipo" text DEFAULT 'contratacao' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"concluidoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_cores_capacete" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"cor" varchar(50) NOT NULL,
	"hexColor" varchar(10),
	"funcoes" text NOT NULL,
	"descricao" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_deliveries" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"epiId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"dataEntrega" date NOT NULL,
	"dataDevolucao" date,
	"motivo" varchar(255),
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"motivo_troca" varchar(50),
	"valor_cobrado" numeric(10, 2),
	"ficha_url" text,
	"foto_estado_url" text,
	"origemEntrega" text DEFAULT 'central' NOT NULL,
	"obraId" integer,
	"data_validade" date,
	"assinatura_url" text
);
--> statement-breakpoint
CREATE TABLE "epi_discount_alerts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"epiDeliveryId" integer NOT NULL,
	"epi_nome" varchar(1000) NOT NULL,
	"ca" varchar(20),
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor_unitario" numeric(10, 2) NOT NULL,
	"valor_total" numeric(10, 2) NOT NULL,
	"motivo_cobranca" varchar(100) NOT NULL,
	"mes_referencia" varchar(7) NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"validado_por" varchar(255),
	"validadoPorUserId" integer,
	"data_validacao" timestamp,
	"justificativa" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_estoque_minimo" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"epiId" integer NOT NULL,
	"obraId" integer,
	"quantidadeMinima" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_estoque_obra" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"epiId" integer NOT NULL,
	"obraId" integer NOT NULL,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"criado_por" varchar(255),
	"alterado_por" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "epi_kit_items" (
	"id" serial NOT NULL,
	"kitId" integer NOT NULL,
	"epiId" integer,
	"nomeEpi" varchar(255) NOT NULL,
	"categoria" text DEFAULT 'EPI' NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"obrigatorio" smallint DEFAULT 1 NOT NULL,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_kits" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"funcao" varchar(100) NOT NULL,
	"descricao" text,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_transferencias" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"epiId" integer NOT NULL,
	"quantidade" integer NOT NULL,
	"tipoOrigem" text NOT NULL,
	"origemObraId" integer,
	"destinoObraId" integer NOT NULL,
	"data" date NOT NULL,
	"observacoes" text,
	"criado_por" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_treinamentos_vinculados" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nomeEpi" varchar(255) NOT NULL,
	"categoriaEpi" varchar(100),
	"normaExigida" varchar(50) NOT NULL,
	"nomeTreinamento" varchar(255) NOT NULL,
	"obrigatorio" smallint DEFAULT 1 NOT NULL,
	"descricao" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epi_vida_util" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nomeEpi" varchar(255) NOT NULL,
	"categoriaEpi" varchar(100),
	"vidaUtilMeses" integer NOT NULL,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epis" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(1000) NOT NULL,
	"ca" varchar(20),
	"validadeCa" date,
	"fabricante" varchar(255),
	"fornecedor" varchar(255),
	"quantidadeEstoque" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"valor_produto" numeric(10, 2),
	"tempoMinimoTroca" integer,
	"vidaUtilMeses" integer,
	"categoria" text DEFAULT 'EPI' NOT NULL,
	"tamanho" varchar(20),
	"fornecedor_cnpj" varchar(20),
	"fornecedor_contato" varchar(255),
	"fornecedor_telefone" varchar(30),
	"fornecedor_email" varchar(255),
	"fornecedor_endereco" varchar(500),
	"cor_capacete" varchar(30),
	"condicao" text DEFAULT 'Novo' NOT NULL,
	"criado_por" varchar(255),
	"alterado_por" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"patrimonio" varchar(50),
	"tipoEquipamento" varchar(100),
	"marca" varchar(100),
	"modelo" varchar(100),
	"numeroSerie" varchar(100),
	"localizacao" varchar(255),
	"responsavel" varchar(255),
	"statusEquipamento" text DEFAULT 'Ativo' NOT NULL,
	"dataAquisicao" date,
	"proximaManutencao" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_audit_log" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"actorType" text DEFAULT 'system' NOT NULL,
	"actorId" integer,
	"actorName" varchar(255),
	"targetType" varchar(50),
	"targetId" integer,
	"details" text,
	"ipAddress" varchar(45),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_avaliacoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"evaluatorId" integer NOT NULL,
	"comportamento" integer,
	"pontualidade" integer,
	"assiduidade" integer,
	"segurancaEpis" integer,
	"qualidadeAcabamento" integer,
	"produtividadeRitmo" integer,
	"cuidadoFerramentas" integer,
	"economiaMateriais" integer,
	"trabalhoEquipe" integer,
	"iniciativaProatividade" integer,
	"disponibilidadeFlexibilidade" integer,
	"organizacaoLimpeza" integer,
	"mediaPilar1" numeric(3, 1),
	"mediaPilar2" numeric(3, 1),
	"mediaPilar3" numeric(3, 1),
	"mediaGeral" numeric(3, 1),
	"recomendacao" varchar(100),
	"observacoes" text,
	"mesReferencia" varchar(7),
	"locked" smallint DEFAULT 1 NOT NULL,
	"startedAt" timestamp,
	"durationSeconds" integer,
	"deviceType" varchar(20),
	"revisionId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"obraId" integer,
	"evaluator_name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "eval_avaliadores" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"userId" integer,
	"nome" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"passwordHash" varchar(255) NOT NULL,
	"emailVerified" smallint DEFAULT 0,
	"mustChangePassword" smallint DEFAULT 1,
	"obraId" integer,
	"evaluationFrequency" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp
);
--> statement-breakpoint
CREATE TABLE "eval_climate_answers" (
	"id" serial NOT NULL,
	"responseId" integer NOT NULL,
	"questionId" integer NOT NULL,
	"valor" varchar(20),
	"textoLivre" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_climate_external_tokens" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"participantId" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"used" smallint DEFAULT 0,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_climate_questions" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"texto" text NOT NULL,
	"categoria" text DEFAULT 'empresa' NOT NULL,
	"tipo" text DEFAULT 'nota' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_climate_responses" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"cpfHash" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_climate_surveys" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"public_token" varchar(64),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "eval_criteria" (
	"id" serial NOT NULL,
	"pillarId" integer NOT NULL,
	"revisionId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"fieldKey" varchar(100),
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_criteria_revisions" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"descricao" varchar(255),
	"isActive" smallint DEFAULT 0 NOT NULL,
	"createdBy" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_external_participants" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"empresa" varchar(255),
	"tipo" text DEFAULT 'cliente' NOT NULL,
	"email" varchar(320),
	"telefone" varchar(20),
	"status" text DEFAULT 'ativo' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_pillars" (
	"id" serial NOT NULL,
	"revisionId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_scores" (
	"id" serial NOT NULL,
	"evaluationId" integer NOT NULL,
	"criterionId" integer NOT NULL,
	"nota" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_survey_answers" (
	"id" serial NOT NULL,
	"responseId" integer NOT NULL,
	"questionId" integer NOT NULL,
	"valor" varchar(20),
	"textoLivre" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_survey_evaluators" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"evaluatorId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_survey_questions" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"texto" text NOT NULL,
	"tipo" text DEFAULT 'nota' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"obrigatoria" smallint DEFAULT 1,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_survey_responses" (
	"id" serial NOT NULL,
	"surveyId" integer NOT NULL,
	"respondentName" varchar(255),
	"respondentEmail" varchar(320),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"employeeId" integer,
	"evaluatorUserId" integer
);
--> statement-breakpoint
CREATE TABLE "eval_surveys" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"tipo" text DEFAULT 'outro' NOT NULL,
	"anonimo" smallint DEFAULT 0,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"obraId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"public_token" varchar(64),
	"expires_at" timestamp,
	"isEvaluation" smallint DEFAULT 0,
	"allowEmployeeSelection" smallint DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "extinguishers" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"tipoExtintor" text NOT NULL,
	"capacidade" varchar(20),
	"localizacao" varchar(255),
	"dataRecarga" date,
	"validadeRecarga" date,
	"dataTesteHidrostatico" date,
	"validadeTesteHidrostatico" date,
	"statusExtintor" text DEFAULT 'OK' NOT NULL,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_payments" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"tipoExtra" text NOT NULL,
	"descricao" text,
	"valorHoraBase" varchar(20),
	"percentualAcrescimo" varchar(10),
	"quantidadeHoras" varchar(10),
	"valorTotal" varchar(20) NOT NULL,
	"bancoDestino" varchar(100),
	"dataPagamento" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" serial NOT NULL,
	"companyId" integer,
	"nome" varchar(255) NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"recorrente" smallint DEFAULT 1 NOT NULL,
	"estado" varchar(2),
	"cidade" varchar(100),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"obraId" integer,
	"data" date NOT NULL,
	"tipoOcorrencia" text NOT NULL,
	"descricao" text NOT NULL,
	"solicitanteNome" varchar(255) NOT NULL,
	"solicitanteId" varchar(255),
	"evidenciaUrl" varchar(500),
	"prioridade" text DEFAULT 'media' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"respostaRH" text,
	"acaoTomada" text,
	"resolvidoPor" varchar(255),
	"resolvidoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "financial_events" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"categoria" varchar(50) DEFAULT 'folha_pagamento' NOT NULL,
	"subcategoria" varchar(100),
	"mesCompetencia" varchar(7) NOT NULL,
	"dataPrevista" date NOT NULL,
	"dataEfetiva" date,
	"valor" varchar(20) NOT NULL,
	"status" text DEFAULT 'previsto' NOT NULL,
	"employeeId" integer,
	"employeeName" varchar(255),
	"obraId" integer,
	"obraNome" varchar(255),
	"descricao" text,
	"origemTipo" varchar(50),
	"origemId" integer,
	"criadoPor" varchar(255),
	"atualizadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folha_itens" (
	"id" serial NOT NULL,
	"folhaLancamentoId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer,
	"codigoContabil" varchar(20),
	"nomeColaborador" varchar(255) NOT NULL,
	"dataAdmissao" date,
	"salarioBase" varchar(20),
	"horasMensais" varchar(10),
	"funcao" varchar(100),
	"sf" integer DEFAULT 0,
	"ir" integer DEFAULT 0,
	"proventos" json,
	"descontos" json,
	"totalProventos" varchar(20),
	"totalDescontos" varchar(20),
	"baseInss" varchar(20),
	"valorInss" varchar(20),
	"baseFgts" varchar(20),
	"valorFgts" varchar(20),
	"baseIrrf" varchar(20),
	"valorIrrf" varchar(20),
	"liquido" varchar(20),
	"situacaoEspecial" text,
	"matchStatus" text DEFAULT 'unmatched' NOT NULL,
	"divergencias" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folha_lancamentos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"tipoLancamento" text NOT NULL,
	"status" text DEFAULT 'importado' NOT NULL,
	"analiticoUploadId" integer,
	"sinteticoUploadId" integer,
	"totalFuncionarios" integer DEFAULT 0,
	"totalProventos" varchar(20),
	"totalDescontos" varchar(20),
	"totalLiquido" varchar(20),
	"totalDivergencias" integer DEFAULT 0,
	"divergenciasResolvidas" integer DEFAULT 0,
	"importadoPor" varchar(255),
	"importadoEm" timestamp,
	"validadoPor" varchar(255),
	"validadoEm" timestamp,
	"consolidadoPor" varchar(255),
	"consolidadoEm" timestamp,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedores_epi" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"cnpj" varchar(20),
	"contato" varchar(255),
	"telefone" varchar(30),
	"email" varchar(255),
	"endereco" varchar(500),
	"observacoes" text,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcionarios_terceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresaTerceiraId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"cpf" varchar(14),
	"rg" varchar(20),
	"data_nascimento" timestamp,
	"foto_url" varchar(500),
	"funcao" varchar(100),
	"telefone" varchar(30),
	"email" varchar(255),
	"aso_url" varchar(500),
	"aso_validade" timestamp,
	"treinamento_nr_url" varchar(500),
	"treinamento_nr_validade" timestamp,
	"certificados_url" varchar(500),
	"obraId" integer,
	"obra_nome" varchar(255),
	"statusAptidao" text DEFAULT 'pendente' NOT NULL,
	"motivo_inapto" text,
	"nome_completo" varchar(255),
	"data_admissao" timestamp,
	"aso_doc_url" varchar(500),
	"nr35_validade" timestamp,
	"nr35_doc_url" varchar(500),
	"nr10_validade" timestamp,
	"nr10_doc_url" varchar(500),
	"nr33_validade" timestamp,
	"nr33_doc_url" varchar(500),
	"integracao_doc_url" varchar(500),
	"observacao_aprovacao" text,
	"aprovado_por" varchar(255),
	"data_aprovacao" timestamp,
	"cadastrado_por" varchar(50) DEFAULT 'rh',
	"status" text DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "golden_rules" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"descricao" text NOT NULL,
	"categoria" text DEFAULT 'geral' NOT NULL,
	"prioridade" text DEFAULT 'alta' NOT NULL,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "he_solicitacao_funcionarios" (
	"id" serial NOT NULL,
	"solicitacaoId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"horasRealizadas" varchar(10),
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "he_solicitacoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"dataSolicitacao" date NOT NULL,
	"horaInicio" varchar(10),
	"horaFim" varchar(10),
	"motivo" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"solicitadoPor" varchar(255) NOT NULL,
	"solicitadoPorId" integer NOT NULL,
	"aprovadoPor" varchar(255),
	"aprovadoPorId" integer,
	"aprovadoEm" timestamp,
	"motivoRejeicao" text,
	"observacaoAdmin" text,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hydrants" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"localizacao" varchar(255),
	"tipoHidrante" varchar(50),
	"ultimaInspecao" date,
	"proximaInspecao" date,
	"statusHidrante" text DEFAULT 'OK' NOT NULL,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_alert_config" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"textoAdmissao" text,
	"textoAfastamento" text,
	"textoReclusao" text,
	"textoDesligamento" text,
	"seguradora" varchar(255),
	"apolice" varchar(100),
	"observacoes" text,
	"criadoPor" varchar(255),
	"atualizadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_alert_recipients" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"configId" integer NOT NULL,
	"tipoDestinatario" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"telefone" varchar(20),
	"cargo" varchar(100),
	"recebeAdmissao" smallint DEFAULT 1 NOT NULL,
	"recebeAfastamento" smallint DEFAULT 1 NOT NULL,
	"recebeReclusao" smallint DEFAULT 1 NOT NULL,
	"recebeDesligamento" smallint DEFAULT 1 NOT NULL,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_alerts_log" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipoMovimentacao" text NOT NULL,
	"statusAnterior" varchar(50),
	"statusNovo" varchar(50),
	"textoAlerta" text NOT NULL,
	"nomeFuncionario" varchar(255) NOT NULL,
	"cpfFuncionario" varchar(14),
	"funcaoFuncionario" varchar(100),
	"obraFuncionario" varchar(255),
	"destinatarios" json,
	"disparadoPor" varchar(255),
	"disparoAutomatico" smallint DEFAULT 1 NOT NULL,
	"statusEnvio" text DEFAULT 'pendente' NOT NULL,
	"erroMensagem" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_functions" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" text,
	"ordemServico" text,
	"cbo" varchar(10),
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "lancamentos_parceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"parceiroId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"employee_nome" varchar(255) NOT NULL,
	"data_compra" timestamp NOT NULL,
	"descricao_itens" text,
	"valor" numeric(10, 2) NOT NULL,
	"comprovante_url" varchar(500),
	"status" text DEFAULT 'pendente' NOT NULL,
	"motivo_rejeicao" text,
	"comentario_admin" text,
	"aprovado_por" varchar(255),
	"aprovado_em" timestamp,
	"competencia_desconto" varchar(7),
	"lancado_por" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_obra_assignments" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"obraId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"justificativa" text NOT NULL,
	"percentual" integer DEFAULT 100 NOT NULL,
	"atribuidoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_benefit_configs" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"nome" varchar(255) DEFAULT 'Padrão' NOT NULL,
	"cafeManhaDia" varchar(20) DEFAULT '0',
	"lancheTardeDia" varchar(20) DEFAULT '0',
	"valeAlimentacaoMes" varchar(20) DEFAULT '0',
	"jantaDia" varchar(20) DEFAULT '0',
	"totalVA_iFood" varchar(20) DEFAULT '0',
	"diasUteisRef" integer DEFAULT 22,
	"observacoes" text,
	"ativo" smallint DEFAULT 1,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"cafeAtivo" smallint DEFAULT 1,
	"lancheAtivo" smallint DEFAULT 1,
	"jantaAtivo" smallint DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "medicos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"crm" varchar(50) NOT NULL,
	"especialidade" varchar(255),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_config" (
	"id" serial NOT NULL,
	"userId" integer NOT NULL,
	"configJson" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_labels" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"originalLabel" varchar(255) NOT NULL,
	"customLabel" varchar(255) NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"enabled" smallint DEFAULT 1 NOT NULL,
	"enabled_at" timestamp DEFAULT now(),
	"disabled_at" timestamp,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_payroll_summary" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"nomeColaborador" varchar(255),
	"codigoContabil" varchar(20),
	"funcao" varchar(100),
	"dataAdmissao" date,
	"salarioBaseHora" varchar(20),
	"horasMensais" varchar(10),
	"adiantamentoBruto" varchar(20),
	"adiantamentoDescontos" varchar(20),
	"adiantamentoLiquido" varchar(20),
	"salarioHorista" varchar(20),
	"dsr" varchar(20),
	"totalProventos" varchar(20),
	"totalDescontos" varchar(20),
	"folhaLiquido" varchar(20),
	"baseInss" varchar(20),
	"valorInss" varchar(20),
	"baseFgts" varchar(20),
	"valorFgts" varchar(20),
	"baseIrrf" varchar(20),
	"valorIrrf" varchar(20),
	"diferencaSalario" varchar(20),
	"horasExtrasValor" varchar(20),
	"vrBeneficio" varchar(20),
	"bancoAdiantamento" varchar(100),
	"bancoFolha" varchar(100),
	"custoTotalMes" varchar(20),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer,
	"employeeName" varchar(255) NOT NULL,
	"employeeCpf" varchar(20),
	"employeeFuncao" varchar(100),
	"tipoMovimentacao" text NOT NULL,
	"statusAnterior" varchar(50),
	"statusNovo" varchar(50),
	"recipientId" integer,
	"recipientName" varchar(255) NOT NULL,
	"recipientEmail" varchar(255) NOT NULL,
	"titulo" varchar(500) NOT NULL,
	"corpo" text,
	"statusEnvio" text DEFAULT 'pendente' NOT NULL,
	"erroMensagem" text,
	"trackingId" varchar(64),
	"lido" smallint DEFAULT 0 NOT NULL,
	"lidoEm" timestamp,
	"disparadoPor" varchar(255),
	"disparadoPorId" integer,
	"enviadoEm" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_recipients" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"notificarContratacao" smallint DEFAULT 1 NOT NULL,
	"notificarDemissao" smallint DEFAULT 1 NOT NULL,
	"notificarTransferencia" smallint DEFAULT 0 NOT NULL,
	"notificarAfastamento" smallint DEFAULT 0 NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_funcionarios" (
	"id" serial NOT NULL,
	"obraId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"funcaoNaObra" varchar(100),
	"dataInicio" date,
	"dataFim" date,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_horas_rateio" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"dixiDeviceId" integer,
	"mesAno" varchar(7) NOT NULL,
	"horasNormais" varchar(10),
	"horasExtras" varchar(10),
	"horasNoturnas" varchar(10),
	"totalHoras" varchar(10),
	"diasTrabalhados" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_ponto_inconsistencies" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"obraAlocadaId" integer,
	"obraPontoId" integer NOT NULL,
	"dataPonto" date NOT NULL,
	"snRelogio" varchar(50),
	"status" text DEFAULT 'pendente' NOT NULL,
	"resolvidoPor" varchar(255),
	"resolvidoPorUserId" integer,
	"resolvidoEm" timestamp,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_sns" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"sn" varchar(50) NOT NULL,
	"apelido" varchar(100),
	"status" text DEFAULT 'ativo' NOT NULL,
	"dataVinculo" date,
	"dataLiberacao" date,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obras" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"codigo" varchar(50),
	"cliente" varchar(255),
	"responsavel" varchar(255),
	"endereco" text,
	"cidade" varchar(100),
	"estado" varchar(2),
	"cep" varchar(10),
	"dataInicio" date,
	"dataPrevisaoFim" date,
	"dataFimReal" date,
	"status" text DEFAULT 'Planejamento' NOT NULL,
	"valorContrato" varchar(20),
	"observacoes" text,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"numOrcamento" varchar(50),
	"snRelogioPonto" varchar(50),
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"usarConvencaoMatriz" smallint DEFAULT 1 NOT NULL,
	"convencaoId" integer,
	"convencao_divergencias" text
);
--> statement-breakpoint
CREATE TABLE "obrigacoes_mensais_terceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresaTerceiraId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"fgts_url" varchar(500),
	"fgtsStatus" text DEFAULT 'pendente' NOT NULL,
	"inss_url" varchar(500),
	"inssStatus" text DEFAULT 'pendente' NOT NULL,
	"folha_pagamento_url" varchar(500),
	"folhaPagamentoStatus" text DEFAULT 'pendente' NOT NULL,
	"comprovante_pagamento_url" varchar(500),
	"comprovantePagamentoStatus" text DEFAULT 'pendente' NOT NULL,
	"gps_url" varchar(500),
	"gpsStatus" text DEFAULT 'pendente' NOT NULL,
	"cnd_url" varchar(500),
	"cndStatus" text DEFAULT 'pendente' NOT NULL,
	"statusGeral" text DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"validado_por" varchar(255),
	"validado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_bdi" (
	"id" serial NOT NULL,
	"orcamentoId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(30),
	"descricao" varchar(255),
	"percentual" numeric(10, 6),
	"valorAbsoluto" numeric(18, 2),
	"ordem" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_insumos" (
	"id" serial NOT NULL,
	"orcamentoId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(50),
	"descricao" varchar(500) NOT NULL,
	"unidade" varchar(30),
	"tipo" varchar(100),
	"precoUnitBase" numeric(18, 4),
	"precoUnitComEncargos" numeric(18, 4),
	"quantidadeTotal" numeric(18, 4),
	"custoTotal" numeric(18, 2),
	"percentualTotal" numeric(8, 6),
	"percentualAcumulado" numeric(8, 6),
	"curvaAbc" varchar(1),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento_itens" (
	"id" serial NOT NULL,
	"orcamentoId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"eapCodigo" varchar(50) NOT NULL,
	"nivel" integer NOT NULL,
	"tipo" varchar(50),
	"composicaoTipo" varchar(20),
	"servicoCodigo" varchar(50),
	"descricao" varchar(1000) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(18, 4),
	"custoUnitMat" numeric(18, 4),
	"custoUnitMdo" numeric(18, 4),
	"custoUnitTotal" numeric(18, 4),
	"vendaUnitTotal" numeric(18, 4),
	"metaUnitTotal" numeric(18, 4),
	"custoTotalMat" numeric(18, 2),
	"custoTotalMdo" numeric(18, 2),
	"custoTotal" numeric(18, 2),
	"vendaTotal" numeric(18, 2),
	"metaTotal" numeric(18, 2),
	"abcServico" varchar(5),
	"ordem" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"codigo" varchar(100) NOT NULL,
	"descricao" varchar(500),
	"revisao" varchar(20),
	"cliente" varchar(255),
	"local" varchar(255),
	"dataBase" varchar(20),
	"tempoObraMeses" integer,
	"areaIntervencao" numeric(14, 2),
	"bdiPercentual" numeric(8, 4),
	"metaPercentual" numeric(8, 4) DEFAULT '0.2000',
	"totalVenda" numeric(18, 2),
	"totalCusto" numeric(18, 2),
	"totalMeta" numeric(18, 2),
	"totalMateriais" numeric(18, 2),
	"totalMdo" numeric(18, 2),
	"totalEquipamentos" numeric(18, 2),
	"status" text DEFAULT 'rascunho',
	"metaAprovadaPor" varchar(255),
	"metaAprovadaEm" timestamp,
	"metaAprovadaUserId" integer,
	"importadoPor" varchar(255),
	"importadoEm" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos_parceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"parceiroId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"competencia_pagamento" varchar(7) NOT NULL,
	"valor_total" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"data_pagamento" timestamp,
	"comprovante_pagamento_url" varchar(500),
	"observacoes_pagamento" text,
	"pago_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parceiros_conveniados" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" integer NOT NULL,
	"razao_social" varchar(255) NOT NULL,
	"nome_fantasia" varchar(255),
	"cnpj" varchar(20) NOT NULL,
	"inscricao_estadual" varchar(30),
	"inscricao_municipal" varchar(30),
	"cep" varchar(10),
	"logradouro" varchar(255),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"estado" varchar(2),
	"telefone" varchar(30),
	"celular" varchar(30),
	"email_principal" varchar(255),
	"email_financeiro" varchar(255),
	"responsavel_nome" varchar(255),
	"responsavel_cargo" varchar(100),
	"tipoConvenio" text NOT NULL,
	"tipo_convenio_outro" varchar(100),
	"banco_parceiro" varchar(100),
	"agencia_parceiro" varchar(20),
	"conta_parceiro" varchar(30),
	"tipoConta" text,
	"titular_conta_parceiro" varchar(255),
	"cpf_cnpj_titular_parceiro" varchar(20),
	"formaPagamento" text,
	"pix_chave_parceiro" varchar(255),
	"pixTipoChave" text,
	"diaFechamento" integer,
	"prazoPagamento" integer,
	"limite_mensal_por_colaborador" numeric(10, 2),
	"contrato_convenio_url" varchar(500),
	"contrato_social_url_parceiro" varchar(500),
	"alvara_url_parceiro" varchar(500),
	"status" text DEFAULT 'ativo' NOT NULL,
	"observacoes_parceiro" text,
	"login_email" varchar(255),
	"login_senha_hash" varchar(255),
	"acessoExternoAtivo" smallint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(255),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payroll" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"tipoFolha" text NOT NULL,
	"salarioBruto" varchar(20),
	"totalProventos" varchar(20),
	"totalDescontos" varchar(20),
	"salarioLiquido" varchar(20),
	"inss" varchar(20),
	"irrf" varchar(20),
	"fgts" varchar(20),
	"valeTransporte" varchar(20),
	"valeAlimentacao" varchar(20),
	"outrosProventos" text,
	"outrosDescontos" text,
	"bancoDestino" varchar(100),
	"dataPagamento" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesOrigem" varchar(7) NOT NULL,
	"mesDesconto" varchar(7) NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"valorDesconto" varchar(20) NOT NULL,
	"valorVrDesconto" varchar(20) DEFAULT '0',
	"valorVtDesconto" varchar(20) DEFAULT '0',
	"valorTotal" varchar(20) NOT NULL,
	"timecardDailyId" integer,
	"paymentId" integer,
	"status" text DEFAULT 'pendente' NOT NULL,
	"abonadoPor" varchar(255),
	"abonadoEm" timestamp,
	"motivoAbono" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_advances" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"periodId" integer,
	"salarioBrutoMes" varchar(20) NOT NULL,
	"percentualAdiantamento" integer DEFAULT 40,
	"valorAdiantamento" varchar(20) NOT NULL,
	"valorHorasExtras" varchar(20) DEFAULT '0',
	"horasExtrasQtd" varchar(10) DEFAULT '0',
	"valorTotalVale" varchar(20) NOT NULL,
	"bloqueado" smallint DEFAULT 0 NOT NULL,
	"motivoBloqueio" varchar(255),
	"faltasNoPeriodo" integer DEFAULT 0,
	"valorHora" varchar(20),
	"cargaHorariaDiaria" integer DEFAULT 8,
	"diasUteisNoMes" integer,
	"status" text DEFAULT 'calculado' NOT NULL,
	"dataPagamento" date,
	"aprovadoPor" varchar(255),
	"aprovadoEm" timestamp,
	"bancoDestino" varchar(100),
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_alerts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"tipo" text NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"lido" smallint DEFAULT 0 NOT NULL,
	"lidoEm" timestamp,
	"lidoPor" varchar(255),
	"resolvido" smallint DEFAULT 0 NOT NULL,
	"resolvidoEm" timestamp,
	"resolvidoPor" varchar(255),
	"employeeId" integer,
	"periodId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_payments" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"periodId" integer,
	"valorHora" varchar(20),
	"cargaHorariaDiaria" integer DEFAULT 8,
	"diasUteisNoMes" integer,
	"salarioBrutoMes" varchar(20) NOT NULL,
	"horasExtrasValor" varchar(20) DEFAULT '0',
	"adicionaisValor" varchar(20) DEFAULT '0',
	"adicionaisDetalhes" json,
	"totalProventos" varchar(20) NOT NULL,
	"descontoAdiantamento" varchar(20) DEFAULT '0',
	"descontoFaltas" varchar(20) DEFAULT '0',
	"descontoFaltasQtd" integer DEFAULT 0,
	"descontoAtrasos" varchar(20) DEFAULT '0',
	"descontoAtrasosMinutos" integer DEFAULT 0,
	"descontoVrFaltas" varchar(20) DEFAULT '0',
	"descontoVtFaltas" varchar(20) DEFAULT '0',
	"descontoPensao" varchar(20) DEFAULT '0',
	"descontoInss" varchar(20) DEFAULT '0',
	"descontoIrrf" varchar(20) DEFAULT '0',
	"descontoFgts" varchar(20) DEFAULT '0',
	"descontoEpi" varchar(20) DEFAULT '0',
	"descontoOutros" varchar(20) DEFAULT '0',
	"descontoOutrosDetalhes" json,
	"totalDescontos" varchar(20) NOT NULL,
	"acertoEscuroValor" varchar(20) DEFAULT '0',
	"acertoEscuroDetalhes" json,
	"salarioLiquido" varchar(20) NOT NULL,
	"status" text DEFAULT 'simulado' NOT NULL,
	"dataPagamento" date,
	"dataPagamentoPrevista" date,
	"consolidadoPor" varchar(255),
	"consolidadoEm" timestamp,
	"bancoDestino" varchar(100),
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"pontoInicio" date,
	"pontoFim" date,
	"escuroInicio" date,
	"escuroFim" date,
	"status" text DEFAULT 'aberta' NOT NULL,
	"pontoImportadoEm" timestamp,
	"pontoImportadoPor" varchar(255),
	"valeGeradoEm" timestamp,
	"valeGeradoPor" varchar(255),
	"pagamentoSimuladoEm" timestamp,
	"pagamentoSimuladoPor" varchar(255),
	"consolidadoEm" timestamp,
	"consolidadoPor" varchar(255),
	"travadoEm" timestamp,
	"travadoPor" varchar(255),
	"afericaoRealizada" smallint DEFAULT 0 NOT NULL,
	"afericaoEm" timestamp,
	"afericaoPor" varchar(255),
	"totalDivergenciasAferidas" integer DEFAULT 0,
	"retificadoEm" timestamp,
	"retificadoPor" varchar(255),
	"motivoRetificacao" text,
	"totalFuncionarios" integer DEFAULT 0,
	"totalSalarioBruto" varchar(20) DEFAULT '0',
	"totalVale" varchar(20) DEFAULT '0',
	"totalHorasExtras" varchar(20) DEFAULT '0',
	"totalDescontos" varchar(20) DEFAULT '0',
	"totalLiquido" varchar(20) DEFAULT '0',
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_uploads" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"category" text NOT NULL,
	"month" varchar(7) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"fileSize" integer,
	"mimeType" varchar(100),
	"uploadStatus" text DEFAULT 'pendente' NOT NULL,
	"recordsProcessed" integer DEFAULT 0,
	"errorMessage" text,
	"uploadedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial NOT NULL,
	"profileId" integer NOT NULL,
	"module" varchar(50) NOT NULL,
	"canView" smallint DEFAULT 0 NOT NULL,
	"canCreate" smallint DEFAULT 0 NOT NULL,
	"canEdit" smallint DEFAULT 0 NOT NULL,
	"canDelete" smallint DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pj_contracts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"numeroContrato" varchar(50),
	"cnpjPrestador" varchar(20),
	"razaoSocialPrestador" varchar(255),
	"objetoContrato" text,
	"dataInicio" date NOT NULL,
	"dataFim" date NOT NULL,
	"renovacaoAutomatica" smallint DEFAULT 0,
	"valorMensal" varchar(20),
	"percentualAdiantamento" integer DEFAULT 40,
	"percentualFechamento" integer DEFAULT 60,
	"diaAdiantamento" integer DEFAULT 15,
	"diaFechamento" integer DEFAULT 5,
	"modeloContratoUrl" text,
	"contratoAssinadoUrl" text,
	"tipoAssinatura" text DEFAULT 'pendente',
	"status" text DEFAULT 'pendente_assinatura' NOT NULL,
	"alertaVencimentoEnviado" smallint DEFAULT 0,
	"contratoAnteriorId" integer,
	"observacoes" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "pj_medicoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"contractId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"horasTrabalhadas" varchar(20) NOT NULL,
	"valorHora" varchar(20) NOT NULL,
	"valorBruto" varchar(20) NOT NULL,
	"descontos" varchar(20) DEFAULT '0',
	"acrescimos" varchar(20) DEFAULT '0',
	"descricaoDescontos" text,
	"descricaoAcrescimos" text,
	"valorLiquido" varchar(20) NOT NULL,
	"notaFiscalNumero" varchar(50),
	"notaFiscalUrl" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"aprovadoPor" varchar(255),
	"aprovadoEm" timestamp,
	"dataPagamento" date,
	"comprovanteUrl" text,
	"observacoes" text,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pj_payments" (
	"id" serial NOT NULL,
	"contractId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"tipo" text NOT NULL,
	"valor" varchar(20) NOT NULL,
	"descricao" text,
	"dataPagamento" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"comprovanteUrl" text,
	"observacoes" text,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ponto_consolidacao" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"consolidadoPor" varchar(255),
	"consolidadoEm" timestamp,
	"desconsolidadoPor" varchar(255),
	"desconsolidadoEm" timestamp,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ponto_descontos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"minutosAtraso" integer DEFAULT 0,
	"minutosHe" integer DEFAULT 0,
	"valorDesconto" varchar(20) DEFAULT '0',
	"valorDsr" varchar(20) DEFAULT '0',
	"valorTotal" varchar(20) DEFAULT '0',
	"baseCalculo" text,
	"timeRecordId" integer,
	"heSolicitacaoId" integer,
	"status" text DEFAULT 'calculado' NOT NULL,
	"abonadoPor" varchar(255),
	"abonadoEm" timestamp,
	"motivoAbono" text,
	"fundamentacaoLegal" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ponto_descontos_resumo" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"totalAtrasos" integer DEFAULT 0,
	"totalMinutosAtraso" integer DEFAULT 0,
	"totalFaltasInjustificadas" integer DEFAULT 0,
	"totalSaidasAntecipadas" integer DEFAULT 0,
	"totalMinutosSaidaAntecipada" integer DEFAULT 0,
	"totalDsrPerdidos" integer DEFAULT 0,
	"totalFeriadosPerdidos" integer DEFAULT 0,
	"totalHeNaoAutorizadas" integer DEFAULT 0,
	"totalMinutosHeNaoAutorizada" integer DEFAULT 0,
	"valorTotalAtrasos" varchar(20) DEFAULT '0',
	"valorTotalFaltas" varchar(20) DEFAULT '0',
	"valorTotalDsr" varchar(20) DEFAULT '0',
	"valorTotalFeriados" varchar(20) DEFAULT '0',
	"valorTotalSaidasAntecipadas" varchar(20) DEFAULT '0',
	"valorTotalHeNaoAutorizada" varchar(20) DEFAULT '0',
	"valorTotalDescontos" varchar(20) DEFAULT '0',
	"faltasAcumuladasPeriodoAquisitivo" integer DEFAULT 0,
	"diasFeriasResultante" integer DEFAULT 30,
	"status" text DEFAULT 'calculado' NOT NULL,
	"revisadoPor" varchar(255),
	"revisadoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"empresaTerceiraId" integer,
	"parceiroId" integer,
	"companyId" integer NOT NULL,
	"cnpj" varchar(20) NOT NULL,
	"senha_hash" varchar(255) NOT NULL,
	"nome_empresa" varchar(255),
	"email_responsavel" varchar(255),
	"nome_responsavel" varchar(255),
	"primeiroAcesso" smallint DEFAULT 1 NOT NULL,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"ultimo_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processo_analises" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"processoId" integer NOT NULL,
	"resumoExecutivo" text,
	"valorEstimadoRisco" numeric(15, 2),
	"valorEstimadoAcordo" numeric(15, 2),
	"probabilidadeCondenacao" integer,
	"probabilidadeAcordo" integer,
	"probabilidadeArquivamento" integer,
	"pontosFortes" json,
	"pontosFracos" json,
	"caminhosPositivos" json,
	"jurisprudenciaRelevante" json,
	"recomendacaoEstrategica" text,
	"insightsAdicionais" json,
	"valorCausaExtraido" numeric(15, 2),
	"pedidosExtraidos" json,
	"modeloIa" varchar(100),
	"promptUsado" text,
	"respostaCompleta" text,
	"tempoAnaliseMs" integer,
	"versaoAnalise" integer DEFAULT 1,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processo_aprendizado" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipoProcesso" varchar(100),
	"assuntos" json,
	"pedidos" json,
	"riscoInicial" varchar(20),
	"valorCausa" numeric(15, 2),
	"resultadoFinal" text,
	"valorFinalCondenacao" numeric(15, 2),
	"valorFinalAcordo" numeric(15, 2),
	"duracaoMeses" integer,
	"estrategiaAdotada" text,
	"resultadoEstrategia" text,
	"licaoAprendida" text,
	"processoId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processo_documentos" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"processoId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" text DEFAULT 'outros' NOT NULL,
	"descricao" text,
	"fileKey" varchar(500) NOT NULL,
	"fileUrl" varchar(1000) NOT NULL,
	"mimeType" varchar(100),
	"tamanhoBytes" integer,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "processos_andamentos" (
	"id" serial NOT NULL,
	"processoId" integer NOT NULL,
	"data" date NOT NULL,
	"tipo" text DEFAULT 'outros' NOT NULL,
	"descricao" text NOT NULL,
	"resultado" varchar(255),
	"documentoUrl" varchar(500),
	"documentoNome" varchar(255),
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processos_trabalhistas" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"numeroProcesso" varchar(50) NOT NULL,
	"vara" varchar(100),
	"comarca" varchar(100),
	"tribunal" varchar(100),
	"tipoAcao" text DEFAULT 'reclamatoria' NOT NULL,
	"reclamante" varchar(255) NOT NULL,
	"advogadoReclamante" varchar(255),
	"advogadoEmpresa" varchar(255),
	"valorCausa" varchar(20),
	"valorCondenacao" varchar(20),
	"valorAcordo" varchar(20),
	"valorPago" varchar(20),
	"dataDistribuicao" date,
	"dataDesligamento" date,
	"dataCitacao" date,
	"dataAudiencia" date,
	"dataEncerramento" date,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"fase" text DEFAULT 'conhecimento' NOT NULL,
	"risco" text DEFAULT 'medio' NOT NULL,
	"pedidos" json,
	"observacoes" text,
	"criadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"clienteCnpj" varchar(20),
	"clienteRazaoSocial" varchar(255),
	"clienteNomeFantasia" varchar(255),
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"justica" text DEFAULT 'trabalho' NOT NULL,
	"datajud_id" varchar(255),
	"datajud_ultima_consulta" timestamp,
	"datajud_ultima_atualizacao" varchar(100),
	"datajud_grau" varchar(20),
	"datajud_classe" varchar(255),
	"datajud_assuntos" json,
	"datajud_orgao_julgador" varchar(255),
	"datajud_sistema" varchar(100),
	"datajud_formato" varchar(50),
	"datajud_movimentos" json,
	"datajudTotalMovimentos" integer,
	"datajudAutoDetectado" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"setor" varchar(100) NOT NULL,
	"agenteRisco" varchar(255) NOT NULL,
	"tipoRisco" text NOT NULL,
	"fonteGeradora" varchar(255),
	"grauRisco" text NOT NULL,
	"medidasControle" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" varchar(255),
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"categoria" varchar(100),
	"descricao" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_criteria" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"categoria" varchar(50) NOT NULL,
	"chave" varchar(100) NOT NULL,
	"valor" varchar(255) NOT NULL,
	"descricao" varchar(500),
	"valorPadraoClt" varchar(255),
	"unidade" varchar(50),
	"atualizadoPor" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_revisions" (
	"id" serial NOT NULL,
	"version" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text NOT NULL,
	"tipo" text NOT NULL,
	"modulos" text,
	"criadoPor" varchar(255) NOT NULL,
	"dataPublicacao" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "termination_notices" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipo" text NOT NULL,
	"dataInicio" date NOT NULL,
	"dataFim" date NOT NULL,
	"diasAviso" integer DEFAULT 30 NOT NULL,
	"anosServico" integer DEFAULT 0,
	"reducaoJornada" text DEFAULT 'nenhuma',
	"salarioBase" varchar(20),
	"previsaoRescisao" text,
	"valorEstimadoTotal" varchar(20),
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"dataConclusao" date,
	"motivoCancelamento" text,
	"observacoes" text,
	"criadoPor" varchar(255),
	"criadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"revertidoManualmente" smallint DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "time_inconsistencies" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"obraId" integer,
	"timeRecordId" integer,
	"mesReferencia" varchar(7) NOT NULL,
	"data" date NOT NULL,
	"tipoInconsistencia" text NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"justificativa" text,
	"resolvidoPor" varchar(255),
	"resolvidoEm" date,
	"warningId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_records" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"data" date NOT NULL,
	"entrada1" varchar(10),
	"saida1" varchar(10),
	"entrada2" varchar(10),
	"saida2" varchar(10),
	"entrada3" varchar(10),
	"saida3" varchar(10),
	"horasTrabalhadas" varchar(10),
	"horasExtras" varchar(10),
	"horasNoturnas" varchar(10),
	"faltas" varchar(10),
	"atrasos" varchar(10),
	"justificativa" text,
	"fonte" varchar(50) DEFAULT 'manual',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"obraId" integer,
	"mesReferencia" varchar(7),
	"ajusteManual" smallint DEFAULT 0,
	"ajustadoPor" varchar(255),
	"batidasBrutas" json
);
--> statement-breakpoint
CREATE TABLE "timecard_daily" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"data" date NOT NULL,
	"mesCompetencia" varchar(7) NOT NULL,
	"statusDia" text DEFAULT 'registrado' NOT NULL,
	"entrada1" varchar(10),
	"saida1" varchar(10),
	"entrada2" varchar(10),
	"saida2" varchar(10),
	"entrada3" varchar(10),
	"saida3" varchar(10),
	"horasTrabalhadas" varchar(10),
	"horasExtras" varchar(10),
	"horasNoturnas" varchar(10),
	"isFalta" smallint DEFAULT 0 NOT NULL,
	"isAtraso" smallint DEFAULT 0 NOT NULL,
	"isSaidaAntecipada" smallint DEFAULT 0 NOT NULL,
	"minutosAtraso" integer DEFAULT 0,
	"minutosSaidaAntecipada" integer DEFAULT 0,
	"tipoDia" text DEFAULT 'util' NOT NULL,
	"timeRecordId" integer,
	"obraId" integer,
	"origemRegistro" varchar(20) DEFAULT 'dixi' NOT NULL,
	"numBatidas" integer DEFAULT 0,
	"isInconsistente" smallint DEFAULT 0 NOT NULL,
	"inconsistenciaTipo" varchar(50),
	"resolucaoTipo" varchar(50),
	"resolucaoObs" text,
	"resolucaoEm" timestamp,
	"resolucaoPor" varchar(255),
	"atestadoId" integer,
	"advertenciaId" integer,
	"obraSecundariaId" integer,
	"rateioPercentual" integer,
	"statusAnterior" text,
	"afericaoResultado" text,
	"afericaoObs" text,
	"afericaoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_documents" (
	"id" serial NOT NULL,
	"trainingId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"fileSize" integer,
	"mimeType" varchar(100),
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"norma" varchar(50),
	"cargaHoraria" varchar(20),
	"dataRealizacao" date NOT NULL,
	"dataValidade" date,
	"instrutor" varchar(255),
	"entidade" varchar(255),
	"certificadoUrl" text,
	"statusTreinamento" text DEFAULT 'Valido' NOT NULL,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "unmatched_dixi_records" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obraId" integer,
	"mesReferencia" varchar(7) NOT NULL,
	"dixiName" varchar(255) NOT NULL,
	"dixiId" varchar(50),
	"data" date NOT NULL,
	"entrada1" varchar(10),
	"saida1" varchar(10),
	"entrada2" varchar(10),
	"saida2" varchar(10),
	"entrada3" varchar(10),
	"saida3" varchar(10),
	"batidasBrutas" json,
	"status" text DEFAULT 'pendente' NOT NULL,
	"linkedEmployeeId" integer,
	"resolvidoPor" varchar(255),
	"resolvidoEm" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"id" serial NOT NULL,
	"userId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_members" (
	"id" serial NOT NULL,
	"groupId" integer NOT NULL,
	"userId" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_permissions" (
	"id" serial NOT NULL,
	"groupId" integer NOT NULL,
	"rota" varchar(200) NOT NULL,
	"canView" smallint DEFAULT 1 NOT NULL,
	"canEdit" smallint DEFAULT 0 NOT NULL,
	"canCreate" smallint DEFAULT 0 NOT NULL,
	"canDelete" smallint DEFAULT 0 NOT NULL,
	"ocultarValores" smallint DEFAULT 0 NOT NULL,
	"ocultarDocumentos" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" serial NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" varchar(255),
	"cor" varchar(20) DEFAULT '#6b7280',
	"icone" varchar(50) DEFAULT 'Users',
	"ativo" smallint DEFAULT 1 NOT NULL,
	"somenteVisualizacao" smallint DEFAULT 1 NOT NULL,
	"ocultarDadosSensiveis" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" serial NOT NULL,
	"userId" integer NOT NULL,
	"module_id" varchar(50) NOT NULL,
	"feature_key" varchar(100) NOT NULL,
	"canAccess" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial NOT NULL,
	"userId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"profileType" text NOT NULL,
	"isActive" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"username" varchar(100),
	"password" varchar(255),
	"mustChangePassword" smallint DEFAULT 1,
	"avatarUrl" text,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"modulesAccess" text
);
--> statement-breakpoint
CREATE TABLE "vacation_periods" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"periodoAquisitivoInicio" date NOT NULL,
	"periodoAquisitivoFim" date NOT NULL,
	"periodoConcessivoFim" date NOT NULL,
	"dataInicio" date,
	"dataFim" date,
	"diasGozo" integer DEFAULT 30,
	"fracionamento" integer DEFAULT 1,
	"periodo2Inicio" date,
	"periodo2Fim" date,
	"periodo3Inicio" date,
	"periodo3Fim" date,
	"abonoPecuniario" smallint DEFAULT 0,
	"valorFerias" varchar(20),
	"valorTercoConstitucional" varchar(20),
	"valorAbono" varchar(20),
	"valorTotal" varchar(20),
	"dataPagamento" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"vencida" smallint DEFAULT 0,
	"pagamentoEmDobro" smallint DEFAULT 0,
	"observacoes" text,
	"aprovadoPor" varchar(255),
	"aprovadoPorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer,
	"dataSugeridaInicio" date,
	"dataSugeridaFim" date,
	"dataAlteradaPeloRh" smallint DEFAULT 0,
	"numeroPeriodo" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipoVeiculo" text NOT NULL,
	"placa" varchar(10),
	"modelo" varchar(100) NOT NULL,
	"marca" varchar(100),
	"anoFabricacao" varchar(4),
	"renavam" varchar(20),
	"chassi" varchar(30),
	"responsavel" varchar(255),
	"statusVeiculo" text DEFAULT 'Ativo' NOT NULL,
	"proximaManutencao" date,
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vr_benefits" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"mesReferencia" varchar(7) NOT NULL,
	"valorDiario" varchar(20),
	"diasUteis" integer,
	"valorTotal" varchar(20) NOT NULL,
	"operadora" varchar(100) DEFAULT 'iFood Benefícios',
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"valorCafe" varchar(20) DEFAULT '0',
	"valorLanche" varchar(20) DEFAULT '0',
	"valorJanta" varchar(20) DEFAULT '0',
	"valorVa" varchar(20) DEFAULT '0',
	"status" text DEFAULT 'pendente' NOT NULL,
	"motivoAlteracao" text,
	"geradoPor" varchar(255),
	"aprovadoPor" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "warning_templates" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"textoModelo" text NOT NULL,
	"baseJuridica" text,
	"isDefault" smallint DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"tipoAdvertencia" text NOT NULL,
	"dataOcorrencia" date NOT NULL,
	"motivo" text NOT NULL,
	"descricao" text,
	"testemunhas" text,
	"documentoUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"numeroSequencial" integer DEFAULT 1,
	"diasSupensao" integer,
	"sequencia" integer DEFAULT 1,
	"aplicadoPor" varchar(255),
	"diasSuspensao" integer,
	"origemModulo" varchar(50),
	"origemId" integer,
	"deletedAt" timestamp,
	"deletedBy" varchar(255),
	"deletedByUserId" integer
);
--> statement-breakpoint
CREATE INDEX "idx_aso_company" ON "asos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_aso_employee" ON "asos" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "idx_aso_validade" ON "asos" USING btree ("companyId","dataValidade");--> statement-breakpoint
CREATE INDEX "aa_company" ON "avaliacao_avaliadores" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "aa_avaliador" ON "avaliacao_avaliadores" USING btree ("avaliadorUserId");--> statement-breakpoint
CREATE INDEX "aa_employee" ON "avaliacao_avaliadores" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ac_company" ON "avaliacao_ciclos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ac_questionario" ON "avaliacao_ciclos" USING btree ("questionarioId");--> statement-breakpoint
CREATE INDEX "acfg_company" ON "avaliacao_config" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ap_questionario" ON "avaliacao_perguntas" USING btree ("questionarioId");--> statement-breakpoint
CREATE INDEX "aq_company" ON "avaliacao_questionarios" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ar_avaliacao" ON "avaliacao_respostas" USING btree ("avaliacaoId");--> statement-breakpoint
CREATE INDEX "ar_pergunta" ON "avaliacao_respostas" USING btree ("perguntaId");--> statement-breakpoint
CREATE INDEX "av_ciclo" ON "avaliacoes" USING btree ("cicloId");--> statement-breakpoint
CREATE INDEX "av_company" ON "avaliacoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "av_employee" ON "avaliacoes" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "av_avaliador" ON "avaliacoes" USING btree ("avaliadorId");--> statement-breakpoint
CREATE INDEX "bkp_status" ON "backups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bkp_tipo" ON "backups" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "bkp_iniciado" ON "backups" USING btree ("iniciadoEm");--> statement-breakpoint
CREATE INDEX "brr_company" ON "blacklist_reactivation_requests" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "brr_employee" ON "blacklist_reactivation_requests" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "brr_status" ON "blacklist_reactivation_requests" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "caepi_ca_idx" ON "caepi_database" USING btree ("ca");--> statement-breakpoint
CREATE INDEX "cmt_mandate" ON "cipa_meetings" USING btree ("mandateId");--> statement-breakpoint
CREATE INDEX "cmt_company" ON "cipa_meetings" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "cmt_data" ON "cipa_meetings" USING btree ("dataReuniao");--> statement-breakpoint
CREATE INDEX "clin_company" ON "clinicas" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "companies_cnpj_unique" ON "companies" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "cba_company" ON "company_bank_accounts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "cd_company" ON "company_documents" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "cd_tipo" ON "company_documents" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "cd_validade" ON "company_documents" USING btree ("dataValidade");--> statement-breakpoint
CREATE INDEX "ct_company" ON "contract_templates" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ct_tipo" ON "contract_templates" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "ct_ativo" ON "contract_templates" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "cc_company" ON "convencao_coletiva" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "cc_obra" ON "convencao_coletiva" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "cc_vigencia" ON "convencao_coletiva" USING btree ("vigenciaInicio","vigenciaFim");--> statement-breakpoint
CREATE INDEX "ce_company" ON "custom_exams" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "unique_exam" ON "custom_exams" USING btree ("companyId","nome");--> statement-breakpoint
CREATE INDEX "dja_company" ON "datajud_alerts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "dja_company_lido" ON "datajud_alerts" USING btree ("companyId","lido");--> statement-breakpoint
CREATE INDEX "dja_processo" ON "datajud_alerts" USING btree ("processoId");--> statement-breakpoint
CREATE INDEX "djac_company" ON "datajud_auto_check_config" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "df_dissidio" ON "dissidio_funcionarios" USING btree ("dissidioId");--> statement-breakpoint
CREATE INDEX "df_employee" ON "dissidio_funcionarios" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "df_company" ON "dissidio_funcionarios" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "diss_company_ano" ON "dissidios" USING btree ("companyId","anoReferencia");--> statement-breakpoint
CREATE INDEX "diss_status" ON "dissidios" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "dai_company" ON "dixi_afd_importacoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "dai_sn" ON "dixi_afd_importacoes" USING btree ("snRelogio");--> statement-breakpoint
CREATE INDEX "dai_data" ON "dixi_afd_importacoes" USING btree ("dataImportacao");--> statement-breakpoint
CREATE INDEX "dam_company" ON "dixi_afd_marcacoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "dam_importacao" ON "dixi_afd_marcacoes" USING btree ("importacaoId");--> statement-breakpoint
CREATE INDEX "dam_cpf" ON "dixi_afd_marcacoes" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "dam_data" ON "dixi_afd_marcacoes" USING btree ("data");--> statement-breakpoint
CREATE INDEX "dam_employee" ON "dixi_afd_marcacoes" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "dnm_company" ON "dixi_name_mappings" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "dnm_dixi_name" ON "dixi_name_mappings" USING btree ("companyId","dixiName");--> statement-breakpoint
CREATE INDEX "dnm_employee" ON "dixi_name_mappings" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "doc_templates_company_tipo" ON "document_templates" USING btree ("companyId","tipo");--> statement-breakpoint
CREATE INDEX "ea_company" ON "employee_aptidao" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ea_employee" ON "employee_aptidao" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ea_status" ON "employee_aptidao" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ec_company" ON "employee_contracts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ec_employee" ON "employee_contracts" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ec_tipo" ON "employee_contracts" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "ec_status" ON "employee_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ec_data_inicio" ON "employee_contracts" USING btree ("dataInicio");--> statement-breakpoint
CREATE INDEX "ec_data_fim" ON "employee_contracts" USING btree ("dataFim");--> statement-breakpoint
CREATE INDEX "edoc_company" ON "employee_documents" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "edoc_employee" ON "employee_documents" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "edoc_tipo" ON "employee_documents" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "esh_company" ON "employee_site_history" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "esh_employee" ON "employee_site_history" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "esh_obra" ON "employee_site_history" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "esh_data" ON "employee_site_history" USING btree ("dataInicio","dataFim");--> statement-breakpoint
CREATE INDEX "es_employee" ON "employee_skills" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "es_skill" ON "employee_skills" USING btree ("skillId");--> statement-breakpoint
CREATE INDEX "es_company" ON "employee_skills" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_company_codigo_interno" ON "employees" USING btree ("companyId","codigoInterno");--> statement-breakpoint
CREATE INDEX "idx_emp_company" ON "employees" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_emp_status" ON "employees" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "eaia_company" ON "epi_ai_analises" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eaia_status" ON "epi_ai_analises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eac_company" ON "epi_alerta_capacidade" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eacl_company" ON "epi_alerta_capacidade_log" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eacl_enviado" ON "epi_alerta_capacidade_log" USING btree ("enviadoEm");--> statement-breakpoint
CREATE INDEX "eas_company" ON "epi_assinaturas" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eas_delivery" ON "epi_assinaturas" USING btree ("deliveryId");--> statement-breakpoint
CREATE INDEX "eas_employee" ON "epi_assinaturas" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ecli_checklist" ON "epi_checklist_items" USING btree ("checklistId");--> statement-breakpoint
CREATE INDEX "ecli_epi" ON "epi_checklist_items" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "ecl_company" ON "epi_checklists" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ecl_employee" ON "epi_checklists" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ecl_status" ON "epi_checklists" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ecc_company" ON "epi_cores_capacete" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_ed_company" ON "epi_deliveries" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_ed_employee" ON "epi_deliveries" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "idx_ed_epi" ON "epi_deliveries" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "idx_ed_origem" ON "epi_deliveries" USING btree ("origemEntrega");--> statement-breakpoint
CREATE INDEX "idx_ed_obra" ON "epi_deliveries" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "eda_company" ON "epi_discount_alerts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eda_employee" ON "epi_discount_alerts" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "eda_delivery" ON "epi_discount_alerts" USING btree ("epiDeliveryId");--> statement-breakpoint
CREATE INDEX "eda_status" ON "epi_discount_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eda_mes" ON "epi_discount_alerts" USING btree ("companyId","mes_referencia");--> statement-breakpoint
CREATE INDEX "eem_company" ON "epi_estoque_minimo" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eem_epi" ON "epi_estoque_minimo" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "eem_obra" ON "epi_estoque_minimo" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "idx_eeo_company" ON "epi_estoque_obra" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_eeo_epi" ON "epi_estoque_obra" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "idx_eeo_obra" ON "epi_estoque_obra" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "idx_eeo_epi_obra" ON "epi_estoque_obra" USING btree ("epiId","obraId");--> statement-breakpoint
CREATE INDEX "eki_kit" ON "epi_kit_items" USING btree ("kitId");--> statement-breakpoint
CREATE INDEX "eki_epi" ON "epi_kit_items" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "ek_company" ON "epi_kits" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ek_funcao" ON "epi_kits" USING btree ("funcao");--> statement-breakpoint
CREATE INDEX "idx_et_company" ON "epi_transferencias" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_et_epi" ON "epi_transferencias" USING btree ("epiId");--> statement-breakpoint
CREATE INDEX "idx_et_destino" ON "epi_transferencias" USING btree ("destinoObraId");--> statement-breakpoint
CREATE INDEX "idx_et_data" ON "epi_transferencias" USING btree ("companyId","data");--> statement-breakpoint
CREATE INDEX "etv_company" ON "epi_treinamentos_vinculados" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "etv_norma" ON "epi_treinamentos_vinculados" USING btree ("normaExigida");--> statement-breakpoint
CREATE INDEX "evu_company" ON "epi_vida_util" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eal_company" ON "eval_audit_log" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eal_action" ON "eval_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "eal_actor" ON "eval_audit_log" USING btree ("actorType","actorId");--> statement-breakpoint
CREATE INDEX "eav_company" ON "eval_avaliacoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eav_employee" ON "eval_avaliacoes" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "eav_evaluator" ON "eval_avaliacoes" USING btree ("evaluatorId");--> statement-breakpoint
CREATE INDEX "eav_mes" ON "eval_avaliacoes" USING btree ("mesReferencia");--> statement-breakpoint
CREATE INDEX "eva_company" ON "eval_avaliadores" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eva_email" ON "eval_avaliadores" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ecla_response" ON "eval_climate_answers" USING btree ("responseId");--> statement-breakpoint
CREATE INDEX "ecla_question" ON "eval_climate_answers" USING btree ("questionId");--> statement-breakpoint
CREATE INDEX "ecet_survey" ON "eval_climate_external_tokens" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "ecet_token" ON "eval_climate_external_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "ecq_survey" ON "eval_climate_questions" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "eclr_survey" ON "eval_climate_responses" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "ecs_company" ON "eval_climate_surveys" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ec_pillar" ON "eval_criteria" USING btree ("pillarId");--> statement-breakpoint
CREATE INDEX "ec_revision" ON "eval_criteria" USING btree ("revisionId");--> statement-breakpoint
CREATE INDEX "ecr_company" ON "eval_criteria_revisions" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "eep_company" ON "eval_external_participants" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ep_revision" ON "eval_pillars" USING btree ("revisionId");--> statement-breakpoint
CREATE INDEX "es_evaluation" ON "eval_scores" USING btree ("evaluationId");--> statement-breakpoint
CREATE INDEX "es_criterion" ON "eval_scores" USING btree ("criterionId");--> statement-breakpoint
CREATE INDEX "esa_response" ON "eval_survey_answers" USING btree ("responseId");--> statement-breakpoint
CREATE INDEX "esa_question" ON "eval_survey_answers" USING btree ("questionId");--> statement-breakpoint
CREATE INDEX "ese_survey" ON "eval_survey_evaluators" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "ese_evaluator" ON "eval_survey_evaluators" USING btree ("evaluatorId");--> statement-breakpoint
CREATE INDEX "esq_survey" ON "eval_survey_questions" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "esr_survey" ON "eval_survey_responses" USING btree ("surveyId");--> statement-breakpoint
CREATE INDEX "esu_company" ON "eval_surveys" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "fer_company" ON "feriados" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "fer_data" ON "feriados" USING btree ("data");--> statement-breakpoint
CREATE INDEX "fer_tipo" ON "feriados" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "fn_company" ON "field_notes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "fn_employee" ON "field_notes" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "fn_obra" ON "field_notes" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "fn_status" ON "field_notes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fn_data" ON "field_notes" USING btree ("data");--> statement-breakpoint
CREATE INDEX "fn_tipo" ON "field_notes" USING btree ("tipoOcorrencia");--> statement-breakpoint
CREATE INDEX "fe_company_mes" ON "financial_events" USING btree ("companyId","mesCompetencia");--> statement-breakpoint
CREATE INDEX "fe_tipo" ON "financial_events" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "fe_status" ON "financial_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fe_data_prevista" ON "financial_events" USING btree ("dataPrevista");--> statement-breakpoint
CREATE INDEX "fe_employee" ON "financial_events" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "fe_obra" ON "financial_events" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "folha_itens_lanc" ON "folha_itens" USING btree ("folhaLancamentoId");--> statement-breakpoint
CREATE INDEX "folha_itens_emp" ON "folha_itens" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "folha_lanc_company_mes" ON "folha_lancamentos" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "he_sol_func_sol" ON "he_solicitacao_funcionarios" USING btree ("solicitacaoId");--> statement-breakpoint
CREATE INDEX "he_sol_func_emp" ON "he_solicitacao_funcionarios" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "he_sol_company" ON "he_solicitacoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "he_sol_obra" ON "he_solicitacoes" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "he_sol_data" ON "he_solicitacoes" USING btree ("dataSolicitacao");--> statement-breakpoint
CREATE INDEX "he_sol_status" ON "he_solicitacoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "he_sol_company_status" ON "he_solicitacoes" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "iac_company" ON "insurance_alert_config" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "iar_company" ON "insurance_alert_recipients" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "iar_config" ON "insurance_alert_recipients" USING btree ("configId");--> statement-breakpoint
CREATE INDEX "ial_company" ON "insurance_alerts_log" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "ial_employee" ON "insurance_alerts_log" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ial_tipo" ON "insurance_alerts_log" USING btree ("companyId","tipoMovimentacao");--> statement-breakpoint
CREATE INDEX "ial_data" ON "insurance_alerts_log" USING btree ("companyId","createdAt");--> statement-breakpoint
CREATE INDEX "moa_company_mes" ON "manual_obra_assignments" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "moa_employee_mes" ON "manual_obra_assignments" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "idx_meal_company" ON "meal_benefit_configs" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_meal_obra" ON "meal_benefit_configs" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "med_company" ON "medicos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "med_crm" ON "medicos" USING btree ("crm");--> statement-breakpoint
CREATE INDEX "mc_user" ON "menu_config" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ml_company_label" ON "menu_labels" USING btree ("companyId","originalLabel");--> statement-breakpoint
CREATE INDEX "ml_company" ON "menu_labels" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "mc_company_module" ON "module_config" USING btree ("companyId","module_key");--> statement-breakpoint
CREATE INDEX "nl_company" ON "notification_logs" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "nl_employee" ON "notification_logs" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "nl_tipo" ON "notification_logs" USING btree ("companyId","tipoMovimentacao");--> statement-breakpoint
CREATE INDEX "nl_tracking" ON "notification_logs" USING btree ("trackingId");--> statement-breakpoint
CREATE INDEX "nl_data" ON "notification_logs" USING btree ("companyId","enviadoEm");--> statement-breakpoint
CREATE INDEX "nr_company" ON "notification_recipients" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "nr_email" ON "notification_recipients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "opi_company" ON "obra_ponto_inconsistencies" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "opi_employee" ON "obra_ponto_inconsistencies" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "opi_status" ON "obra_ponto_inconsistencies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opi_data" ON "obra_ponto_inconsistencies" USING btree ("dataPonto");--> statement-breakpoint
CREATE INDEX "obra_sn_company" ON "obra_sns" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "obra_sn_obra" ON "obra_sns" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "obra_sn_sn" ON "obra_sns" USING btree ("sn");--> statement-breakpoint
CREATE INDEX "idx_obra_company" ON "obras" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_obra_status" ON "obras" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "orbdi_orcamento" ON "orcamento_bdi" USING btree ("orcamentoId");--> statement-breakpoint
CREATE INDEX "orins_orcamento" ON "orcamento_insumos" USING btree ("orcamentoId");--> statement-breakpoint
CREATE INDEX "orins_company" ON "orcamento_insumos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "orins_tipo" ON "orcamento_insumos" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "orci_orcamento" ON "orcamento_itens" USING btree ("orcamentoId");--> statement-breakpoint
CREATE INDEX "orci_company" ON "orcamento_itens" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "orci_eap" ON "orcamento_itens" USING btree ("eapCodigo");--> statement-breakpoint
CREATE INDEX "orc_company" ON "orcamentos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "orc_obra" ON "orcamentos" USING btree ("obraId");--> statement-breakpoint
CREATE INDEX "orc_status" ON "orcamentos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "padj_company_origem" ON "payroll_adjustments" USING btree ("companyId","mesOrigem");--> statement-breakpoint
CREATE INDEX "padj_company_desconto" ON "payroll_adjustments" USING btree ("companyId","mesDesconto");--> statement-breakpoint
CREATE INDEX "padj_employee" ON "payroll_adjustments" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "padj_status" ON "payroll_adjustments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pa_company_mes" ON "payroll_advances" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pa_employee_mes" ON "payroll_advances" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pa_period" ON "payroll_advances" USING btree ("periodId");--> statement-breakpoint
CREATE INDEX "pa_status" ON "payroll_advances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pal_company_mes" ON "payroll_alerts" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pal_tipo" ON "payroll_alerts" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "pal_lido" ON "payroll_alerts" USING btree ("lido");--> statement-breakpoint
CREATE INDEX "ppay_company_mes" ON "payroll_payments" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "ppay_employee_mes" ON "payroll_payments" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "ppay_period" ON "payroll_payments" USING btree ("periodId");--> statement-breakpoint
CREATE INDEX "ppay_status" ON "payroll_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pp_company_mes" ON "payroll_periods" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pp_status" ON "payroll_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pjc_company" ON "pj_contracts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pjc_employee" ON "pj_contracts" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "pjc_status" ON "pj_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pjc_vencimento" ON "pj_contracts" USING btree ("dataFim");--> statement-breakpoint
CREATE INDEX "pjm_company_mes" ON "pj_medicoes" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pjm_contract" ON "pj_medicoes" USING btree ("contractId");--> statement-breakpoint
CREATE INDEX "pjm_employee" ON "pj_medicoes" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "pjm_status" ON "pj_medicoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pjp_contract" ON "pj_payments" USING btree ("contractId");--> statement-breakpoint
CREATE INDEX "pjp_company_mes" ON "pj_payments" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pjp_employee" ON "pj_payments" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "ponto_consolidacao_company_mes" ON "ponto_consolidacao" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pd_company_mes" ON "ponto_descontos" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pd_employee_mes" ON "ponto_descontos" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pd_tipo" ON "ponto_descontos" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "pd_status" ON "ponto_descontos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pd_data" ON "ponto_descontos" USING btree ("data");--> statement-breakpoint
CREATE INDEX "pdr_company_mes" ON "ponto_descontos_resumo" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pdr_employee_mes" ON "ponto_descontos_resumo" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "pc_cnpj" ON "portal_credentials" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "pc_tipo_empresa" ON "portal_credentials" USING btree ("tipo","empresaTerceiraId");--> statement-breakpoint
CREATE INDEX "pc_tipo_parceiro" ON "portal_credentials" USING btree ("tipo","parceiroId");--> statement-breakpoint
CREATE INDEX "pa_company" ON "processo_analises" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pa_processo" ON "processo_analises" USING btree ("processoId");--> statement-breakpoint
CREATE INDEX "papr_company" ON "processo_aprendizado" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "papr_tipo" ON "processo_aprendizado" USING btree ("tipoProcesso");--> statement-breakpoint
CREATE INDEX "papr_resultado" ON "processo_aprendizado" USING btree ("resultadoFinal");--> statement-breakpoint
CREATE INDEX "pd_company" ON "processo_documentos" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pd_processo" ON "processo_documentos" USING btree ("processoId");--> statement-breakpoint
CREATE INDEX "pal_processo" ON "processos_andamentos" USING btree ("processoId");--> statement-breakpoint
CREATE INDEX "pal_data" ON "processos_andamentos" USING btree ("processoId","data");--> statement-breakpoint
CREATE INDEX "pt_company" ON "processos_trabalhistas" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "pt_employee" ON "processos_trabalhistas" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "pt_status" ON "processos_trabalhistas" USING btree ("companyId","status");--> statement-breakpoint
CREATE INDEX "pt_numero" ON "processos_trabalhistas" USING btree ("numeroProcesso");--> statement-breakpoint
CREATE INDEX "sk_company" ON "skills" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "sk_categoria" ON "skills" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "sys_criteria_company_cat" ON "system_criteria" USING btree ("companyId","categoria");--> statement-breakpoint
CREATE INDEX "sys_criteria_company_key" ON "system_criteria" USING btree ("companyId","chave");--> statement-breakpoint
CREATE INDEX "sr_version" ON "system_revisions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "tn_company" ON "termination_notices" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "tn_employee" ON "termination_notices" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "tn_status" ON "termination_notices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_incons_emp_mes" ON "time_inconsistencies" USING btree ("employeeId","mesReferencia");--> statement-breakpoint
CREATE INDEX "td_company_emp_data" ON "timecard_daily" USING btree ("companyId","employeeId","data");--> statement-breakpoint
CREATE INDEX "td_company_mes" ON "timecard_daily" USING btree ("companyId","mesCompetencia");--> statement-breakpoint
CREATE INDEX "td_status" ON "timecard_daily" USING btree ("statusDia");--> statement-breakpoint
CREATE INDEX "td_employee_mes" ON "timecard_daily" USING btree ("employeeId","mesCompetencia");--> statement-breakpoint
CREATE INDEX "udr_company_mes" ON "unmatched_dixi_records" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "udr_status" ON "unmatched_dixi_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "udr_dixi_name" ON "unmatched_dixi_records" USING btree ("dixiName");--> statement-breakpoint
CREATE INDEX "uk_user_company" ON "user_companies" USING btree ("userId","companyId");--> statement-breakpoint
CREATE INDEX "ugm_group" ON "user_group_members" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "ugm_user" ON "user_group_members" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ugm_group_user" ON "user_group_members" USING btree ("groupId","userId");--> statement-breakpoint
CREATE INDEX "ugp_group" ON "user_group_permissions" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "ugp_group_rota" ON "user_group_permissions" USING btree ("groupId","rota");--> statement-breakpoint
CREATE INDEX "ug_nome" ON "user_groups" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "up_user" ON "user_permissions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "up_module" ON "user_permissions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "up_user_module" ON "user_permissions" USING btree ("userId","module_id");--> statement-breakpoint
CREATE INDEX "users_openId_unique" ON "users" USING btree ("openId");--> statement-breakpoint
CREATE INDEX "vp_company" ON "vacation_periods" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "vp_employee" ON "vacation_periods" USING btree ("employeeId");--> statement-breakpoint
CREATE INDEX "vp_status" ON "vacation_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vp_concessivo" ON "vacation_periods" USING btree ("periodoConcessivoFim");--> statement-breakpoint
CREATE INDEX "vr_company_mes" ON "vr_benefits" USING btree ("companyId","mesReferencia");--> statement-breakpoint
CREATE INDEX "vr_employee" ON "vr_benefits" USING btree ("employeeId");