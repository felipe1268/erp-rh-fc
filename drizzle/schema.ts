import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, date, varchar, mysqlEnum, text, timestamp, tinyint, index, decimal, json } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const accidents = mysqlTable("accidents", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAcidente: date({ mode: 'string' }).notNull(),
	horaAcidente: varchar({ length: 10 }),
	tipoAcidente: mysqlEnum(['Tipico','Trajeto','Doenca_Ocupacional']).notNull(),
	gravidade: mysqlEnum(['Leve','Moderado','Grave','Fatal']).notNull(),
	localAcidente: varchar({ length: 255 }),
	descricao: text(),
	parteCorpoAtingida: varchar({ length: 255 }),
	catNumero: varchar({ length: 50 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	catData: date({ mode: 'string' }),
	diasAfastamento: int().default(0),
	testemunhas: text(),
	acaoCorretiva: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const actionPlans = mysqlTable("action_plans", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	deviationId: int(),
	oQue: text().notNull(),
	porQue: text(),
	onde: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	quando: date({ mode: 'string' }),
	quem: varchar({ length: 255 }),
	como: text(),
	quantoCusta: varchar({ length: 50 }),
	statusPlano: mysqlEnum(['Pendente','Em_Andamento','Concluido','Cancelado']).default('Pendente').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataConclusao: date({ mode: 'string' }),
	evidencia: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const advances = mysqlTable("advances", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	valorAdiantamento: varchar({ length: 20 }),
	valorLiquido: varchar({ length: 20 }),
	descontoIr: varchar({ length: 20 }),
	bancoDestino: varchar({ length: 100 }),
	diasFaltas: int().default(0),
	aprovado: mysqlEnum(['Pendente','Aprovado','Reprovado']).default('Pendente').notNull(),
	motivoReprovacao: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const asos = mysqlTable("asos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataExame: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataValidade: date({ mode: 'string' }).notNull(),
	validadeDias: int().default(365),
	resultado: varchar({ length: 50 }).default('Apto').notNull(),
	medico: varchar({ length: 255 }),
	crm: varchar({ length: 20 }),
	examesRealizados: text(),
	jaAtualizou: tinyint().default(0),
	clinica: varchar({ length: 255 }),
	observacoes: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const atestados = mysqlTable("atestados", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: varchar({ length: 100 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEmissao: date({ mode: 'string' }).notNull(),
	diasAfastamento: int().default(0),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataRetorno: date({ mode: 'string' }),
	cid: varchar({ length: 20 }),
	medico: varchar({ length: 255 }),
	crm: varchar({ length: 20 }),
	descricao: text(),
	motivo: varchar({ length: 100 }),
	motivoOutro: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const auditLogs = mysqlTable("audit_logs", {
	id: int().autoincrement().notNull(),
	userId: int(),
	userName: varchar({ length: 255 }),
	companyId: int(),
	action: varchar({ length: 50 }).notNull(),
	module: varchar({ length: 50 }).notNull(),
	entityType: varchar({ length: 50 }),
	entityId: int(),
	details: text(),
	ipAddress: varchar({ length: 45 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const audits = mysqlTable("audits", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	tipoAuditoria: mysqlEnum(['Interna','Externa','Cliente','Certificadora']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAuditoria: date({ mode: 'string' }).notNull(),
	auditor: varchar({ length: 255 }),
	setor: varchar({ length: 100 }),
	resultadoAuditoria: mysqlEnum(['Conforme','Nao_Conforme','Observacao','Pendente']).default('Pendente').notNull(),
	descricao: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const avaliacaoAvaliadores = mysqlTable("avaliacao_avaliadores", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	avaliadorUserId: int().notNull(),
	employeeId: int().notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("aa_company").on(table.companyId),
	index("aa_avaliador").on(table.avaliadorUserId),
	index("aa_employee").on(table.employeeId),
]);

export const avaliacaoCiclos = mysqlTable("avaliacao_ciclos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	questionarioId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }).notNull(),
	status: mysqlEnum(['rascunho','aberto','fechado']).default('rascunho').notNull(),
	criadoPor: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ac_company").on(table.companyId),
	index("ac_questionario").on(table.questionarioId),
]);

export const avaliacaoConfig = mysqlTable("avaliacao_config", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	notaMinima: decimal({ precision: 5, scale: 2 }).default('0'),
	notaMaxima: decimal({ precision: 5, scale: 2 }).default('5'),
	permitirAutoAvaliacao: tinyint().default(0),
	exibirRankingParaAvaliadores: tinyint().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("acfg_company").on(table.companyId),
]);

export const avaliacaoPerguntas = mysqlTable("avaliacao_perguntas", {
	id: int().autoincrement().notNull(),
	questionarioId: int().notNull(),
	texto: text().notNull(),
	tipo: mysqlEnum(['nota_1_5','nota_1_10','sim_nao','texto_livre']).default('nota_1_5').notNull(),
	peso: int().default(1).notNull(),
	ordem: int().default(0).notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ap_questionario").on(table.questionarioId),
]);

export const avaliacaoQuestionarios = mysqlTable("avaliacao_questionarios", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	frequencia: mysqlEnum(['diaria','semanal','mensal','trimestral','semestral','anual']).default('mensal').notNull(),
	ativo: tinyint().default(1).notNull(),
	criadoPor: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("aq_company").on(table.companyId),
]);

export const avaliacaoRespostas = mysqlTable("avaliacao_respostas", {
	id: int().autoincrement().notNull(),
	avaliacaoId: int().notNull(),
	perguntaId: int().notNull(),
	valor: varchar({ length: 20 }),
	textoLivre: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ar_avaliacao").on(table.avaliacaoId),
	index("ar_pergunta").on(table.perguntaId),
]);

export const avaliacoes = mysqlTable("avaliacoes", {
	id: int().autoincrement().notNull(),
	cicloId: int().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	avaliadorId: int().notNull(),
	avaliadorNome: varchar({ length: 255 }),
	status: mysqlEnum(['pendente','em_andamento','finalizada']).default('pendente').notNull(),
	notaFinal: decimal({ precision: 5, scale: 2 }),
	observacoes: text(),
	tempoAvaliacao: int(),
	finalizadaEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("av_ciclo").on(table.cicloId),
	index("av_company").on(table.companyId),
	index("av_employee").on(table.employeeId),
	index("av_avaliador").on(table.avaliadorId),
]);

export const blacklistReactivationRequests = mysqlTable("blacklist_reactivation_requests", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	employeeName: varchar({ length: 255 }).notNull(),
	employeeCpf: varchar({ length: 14 }),
	solicitadoPor: varchar({ length: 255 }).notNull(),
	solicitadoPorId: int().notNull(),
	motivoReativacao: text().notNull(),
	status: mysqlEnum(['pendente','aprovado','rejeitado','cancelado']).default('pendente').notNull(),
	aprovador1Nome: varchar({ length: 255 }),
	aprovador1Id: int(),
	aprovador1Data: timestamp({ mode: 'string' }),
	aprovador1Parecer: text(),
	aprovador2Nome: varchar({ length: 255 }),
	aprovador2Id: int(),
	aprovador2Data: timestamp({ mode: 'string' }),
	aprovador2Parecer: text(),
	rejeitadoPor: varchar({ length: 255 }),
	rejeitadoPorId: int(),
	motivoRejeicao: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("brr_company").on(table.companyId),
	index("brr_employee").on(table.employeeId),
	index("brr_status").on(table.companyId, table.status),
]);

export const caepiDatabase = mysqlTable("caepi_database", {
	id: int().autoincrement().notNull(),
	ca: varchar({ length: 20 }).notNull(),
	validade: varchar({ length: 20 }),
	situacao: varchar({ length: 30 }),
	cnpj: varchar({ length: 20 }),
	fabricante: varchar({ length: 500 }),
	natureza: varchar({ length: 50 }),
	equipamento: varchar({ length: 500 }),
	descricao: text(),
	referencia: varchar({ length: 500 }),
	cor: varchar({ length: 100 }),
	aprovadoPara: text("aprovado_para"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("caepi_ca_idx").on(table.ca),
]);

export const chemicals = mysqlTable("chemicals", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	fabricante: varchar({ length: 255 }),
	numeroCas: varchar({ length: 50 }),
	classificacaoPerigo: varchar({ length: 255 }),
	localArmazenamento: varchar({ length: 255 }),
	quantidadeEstoque: varchar({ length: 50 }),
	fispqUrl: text(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const cipaElections = mysqlTable("cipa_elections", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	mandatoInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	mandatoFim: date({ mode: 'string' }).notNull(),
	statusEleicao: mysqlEnum(['Planejamento','Inscricao','Campanha','Votacao','Apuracao','Concluida']).default('Planejamento').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEdital: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInscricaoInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInscricaoFim: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEleicao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPosse: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const cipaMeetings = mysqlTable("cipa_meetings", {
	id: int().autoincrement().notNull(),
	mandateId: int().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['ordinaria','extraordinaria']).default('ordinaria').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataReuniao: date({ mode: 'string' }).notNull(),
	horaInicio: varchar({ length: 10 }),
	horaFim: varchar({ length: 10 }),
	local: varchar({ length: 255 }),
	pauta: text(),
	ataTexto: text(),
	ataDocumentoUrl: text(),
	presentesJson: text(),
	status: mysqlEnum(['agendada','realizada','cancelada']).default('agendada').notNull(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("cmt_mandate").on(table.mandateId),
	index("cmt_company").on(table.companyId),
	index("cmt_data").on(table.dataReuniao),
]);

export const cipaMembers = mysqlTable("cipa_members", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	electionId: int().notNull(),
	employeeId: int().notNull(),
	cargoCipa: mysqlEnum(['Presidente','Vice_Presidente','Secretario','Membro_Titular','Membro_Suplente']).notNull(),
	representacao: mysqlEnum(['Empregador','Empregados']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	inicioEstabilidade: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	fimEstabilidade: date({ mode: 'string' }),
	statusMembro: mysqlEnum(['Ativo','Desligado','Substituido']).default('Ativo').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const companies = mysqlTable("companies", {
	id: int().autoincrement().notNull(),
	cnpj: varchar({ length: 18 }).notNull(),
	razaoSocial: varchar({ length: 255 }).notNull(),
	nomeFantasia: varchar({ length: 255 }),
	endereco: text(),
	cidade: varchar({ length: 100 }),
	estado: varchar({ length: 2 }),
	cep: varchar({ length: 10 }),
	telefone: varchar({ length: 20 }),
	email: varchar({ length: 320 }),
	logoUrl: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	prefixoCodigo: varchar({ length: 10 }).default('EMP'),
	nextCodigoInterno: int().default(1).notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	inscricaoEstadual: varchar({ length: 30 }),
	inscricaoMunicipal: varchar({ length: 30 }),
},
(table) => [
	index("companies_cnpj_unique").on(table.cnpj),
]);

export const companyBankAccounts = mysqlTable("company_bank_accounts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	banco: varchar({ length: 100 }).notNull(),
	codigoBanco: varchar({ length: 10 }),
	agencia: varchar({ length: 20 }).notNull(),
	conta: varchar({ length: 30 }).notNull(),
	tipoConta: mysqlEnum(['corrente','poupanca']).default('corrente').notNull(),
	apelido: varchar({ length: 100 }),
	cnpjTitular: varchar({ length: 20 }),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("cba_company").on(table.companyId),
]);

export const companyDocuments = mysqlTable("company_documents", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['PGR','PCMSO','LTCAT','AET','LAUDO_INSALUBRIDADE','LAUDO_PERICULOSIDADE','ALVARA','CONTRATO_SOCIAL','CNPJ_CARTAO','CERTIDAO_NEGATIVA','OUTRO']).notNull(),
	nome: varchar({ length: 255 }).notNull(),
	descricao: text(),
	documentoUrl: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEmissao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataValidade: date({ mode: 'string' }),
	elaboradoPor: varchar({ length: 255 }),
	status: mysqlEnum(['vigente','vencido','pendente','em_renovacao']).default('pendente').notNull(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("cd_company").on(table.companyId),
	index("cd_tipo").on(table.tipo),
	index("cd_validade").on(table.dataValidade),
]);

export const convencaoColetiva = mysqlTable("convencao_coletiva", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	nome: varchar({ length: 255 }).notNull(),
	sindicato: varchar({ length: 255 }),
	cnpjSindicato: varchar({ length: 18 }),
	dataBase: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenciaInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	vigenciaFim: date({ mode: 'string' }),
	pisoSalarial: varchar({ length: 20 }),
	percentualReajuste: varchar({ length: 10 }),
	adicionalInsalubridade: varchar({ length: 10 }),
	adicionalPericulosidade: varchar({ length: 10 }),
	horaExtraDiurna: varchar({ length: 10 }),
	horaExtraNoturna: varchar({ length: 10 }),
	horaExtraDomingo: varchar({ length: 10 }),
	adicionalNoturno: varchar({ length: 10 }),
	valeRefeicao: varchar({ length: 20 }),
	valeAlimentacao: varchar({ length: 20 }),
	valeTransporte: varchar({ length: 20 }),
	cestaBasica: varchar({ length: 20 }),
	auxilioFarmacia: varchar({ length: 20 }),
	planoSaude: varchar({ length: 255 }),
	seguroVida: varchar({ length: 20 }),
	outrosBeneficios: text(),
	clausulasEspeciais: text(),
	documentoUrl: text(),
	isMatriz: tinyint().default(0).notNull(),
	status: mysqlEnum(['vigente','vencida','em_negociacao']).default('vigente').notNull(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("cc_company").on(table.companyId),
	index("cc_obra").on(table.obraId),
	index("cc_vigencia").on(table.vigenciaInicio, table.vigenciaFim),
]);

export const customExams = mysqlTable("custom_exams", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ce_company").on(table.companyId),
	index("unique_exam").on(table.companyId, table.nome),
]);

export const datajudAlerts = mysqlTable("datajud_alerts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	processoId: int(),
	tipo: mysqlEnum(['nova_movimentacao','audiencia_marcada','sentenca','recurso','acordo','penhora','execucao','arquivamento','novo_processo','erro_consulta']).notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	prioridade: mysqlEnum(['baixa','media','alta','critica']).default('media').notNull(),
	lido: tinyint().default(0).notNull(),
	lidoPor: varchar({ length: 255 }),
	lidoEm: timestamp({ mode: 'string' }),
	dados: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("dja_company").on(table.companyId),
	index("dja_company_lido").on(table.companyId, table.lido),
	index("dja_processo").on(table.processoId),
]);

export const datajudAutoCheckConfig = mysqlTable("datajud_auto_check_config", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	isActive: tinyint().default(1).notNull(),
	intervaloMinutos: int().default(60).notNull(),
	ultimaVerificacao: timestamp({ mode: 'string' }),
	totalVerificacoes: int().default(0).notNull(),
	totalAlertas: int().default(0).notNull(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("djac_company").on(table.companyId),
]);

export const dds = mysqlTable("dds", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tema: varchar({ length: 255 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataRealizacao: date({ mode: 'string' }).notNull(),
	responsavel: varchar({ length: 255 }),
	participantes: text(),
	descricao: text(),
	documentoUrl: text(),
	fotosUrls: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const deviations = mysqlTable("deviations", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	auditId: int(),
	titulo: varchar({ length: 255 }).notNull(),
	tipoDesvio: mysqlEnum(['NC_Maior','NC_Menor','Observacao','Oportunidade_Melhoria']).notNull(),
	setor: varchar({ length: 100 }),
	descricao: text(),
	causaRaiz: text(),
	statusDesvio: mysqlEnum(['Aberto','Em_Andamento','Fechado','Cancelado']).default('Aberto').notNull(),
	responsavel: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	prazo: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataConclusao: date({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const dissidioFuncionarios = mysqlTable("dissidio_funcionarios", {
	id: int().autoincrement().notNull(),
	dissidioId: int().notNull(),
	employeeId: int().notNull(),
	companyId: int().notNull(),
	salarioAnterior: varchar({ length: 20 }).notNull(),
	salarioNovo: varchar({ length: 20 }).notNull(),
	percentualAplicado: varchar({ length: 10 }).notNull(),
	diferencaValor: varchar({ length: 20 }),
	mesesRetroativos: int().default(0),
	valorRetroativo: varchar({ length: 20 }),
	status: mysqlEnum(['pendente','aplicado','excluido']).default('pendente').notNull(),
	motivoExclusao: text(),
	aplicadoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("df_dissidio").on(table.dissidioId),
	index("df_employee").on(table.employeeId),
	index("df_company").on(table.companyId),
]);

export const dissidios = mysqlTable("dissidios", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	anoReferencia: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	sindicato: varchar({ length: 255 }),
	numeroCct: varchar({ length: 100 }),
	mesDataBase: int().default(5).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataBaseInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataBaseFim: date({ mode: 'string' }).notNull(),
	percentualReajuste: varchar({ length: 10 }).notNull(),
	percentualInpc: varchar({ length: 10 }),
	percentualGanhoReal: varchar({ length: 10 }),
	pisoSalarial: varchar({ length: 20 }),
	pisoSalarialAnterior: varchar({ length: 20 }),
	valorVa: varchar({ length: 20 }),
	valorVt: varchar({ length: 20 }),
	valorSeguroVida: varchar({ length: 20 }),
	contribuicaoAssistencial: varchar({ length: 10 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAplicacao: date({ mode: 'string' }),
	aplicadoPor: varchar({ length: 255 }),
	retroativo: tinyint().default(1).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataRetroativoInicio: date({ mode: 'string' }),
	status: mysqlEnum(['rascunho','aguardando_homologacao','homologado','aplicado','cancelado']).default('rascunho').notNull(),
	observacoes: text(),
	documentoUrl: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("diss_company_ano").on(table.companyId, table.anoReferencia),
	index("diss_status").on(table.companyId, table.status),
]);

export const dixiAfdImportacoes = mysqlTable("dixi_afd_importacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	dataImportacao: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	metodo: mysqlEnum(['AFD','API','XLS']).default('AFD').notNull(),
	arquivoNome: varchar({ length: 255 }),
	snRelogio: varchar({ length: 50 }),
	obraId: int(),
	obraNome: varchar({ length: 255 }),
	totalMarcacoes: int().default(0).notNull(),
	totalFuncionarios: int().default(0).notNull(),
	totalInconsistencias: int().default(0).notNull(),
	periodoInicio: varchar({ length: 10 }),
	periodoFim: varchar({ length: 10 }),
	status: mysqlEnum(['sucesso','parcial','erro']).default('sucesso').notNull(),
	importadoPor: varchar({ length: 255 }),
	detalhes: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("dai_company").on(table.companyId),
	index("dai_sn").on(table.snRelogio),
	index("dai_data").on(table.dataImportacao),
]);

export const dixiAfdMarcacoes = mysqlTable("dixi_afd_marcacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	importacaoId: int().notNull(),
	nsr: varchar({ length: 20 }),
	cpf: varchar({ length: 14 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	hora: varchar({ length: 10 }).notNull(),
	snRelogio: varchar({ length: 50 }),
	obraId: int(),
	employeeId: int(),
	employeeName: varchar({ length: 255 }),
	status: mysqlEnum(['processado','cpf_nao_encontrado','duplicado','erro']).default('processado').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("dam_company").on(table.companyId),
	index("dam_importacao").on(table.importacaoId),
	index("dam_cpf").on(table.cpf),
	index("dam_data").on(table.data),
	index("dam_employee").on(table.employeeId),
]);

export const dixiDevices = mysqlTable("dixi_devices", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	serialNumber: varchar({ length: 50 }).notNull(),
	obraName: varchar({ length: 255 }).notNull(),
	location: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	obraId: int(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const dixiNameMappings = mysqlTable("dixi_name_mappings", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	dixiName: varchar({ length: 255 }).notNull(),
	dixiId: varchar({ length: 50 }),
	employeeId: int().notNull(),
	employeeName: varchar({ length: 255 }).notNull(),
	source: mysqlEnum(['manual','import_link']).default('manual').notNull(),
	createdBy: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("dnm_company").on(table.companyId),
	index("dnm_dixi_name").on(table.companyId, table.dixiName),
	index("dnm_employee").on(table.employeeId),
]);

export const documentTemplates = mysqlTable("document_templates", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['advertencia_verbal','advertencia_escrita','suspensao','justa_causa','contrato_pj','outros']).notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	conteudo: text().notNull(),
	ativo: tinyint().default(1).notNull(),
	criadoPor: varchar({ length: 255 }),
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("doc_templates_company_tipo").on(table.companyId, table.tipo),
]);

export const emailTemplates = mysqlTable("email_templates", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	assunto: varchar({ length: 255 }).notNull(),
	corpo: text().notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const employeeAptidao = mysqlTable("employee_aptidao", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	status: mysqlEnum(['apto','inapto','pendente']).default('pendente').notNull(),
	motivoInapto: text(),
	ultimaVerificacao: timestamp({ mode: 'string' }),
	asoVigente: tinyint().default(0).notNull(),
	treinamentosObrigatoriosOk: tinyint().default(0).notNull(),
	documentosPessoaisOk: tinyint().default(0).notNull(),
	nrObrigatoriasOk: tinyint().default(0).notNull(),
	verificadoPor: varchar({ length: 255 }),
	verificadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ea_company").on(table.companyId),
	index("ea_employee").on(table.employeeId),
	index("ea_status").on(table.status),
]);

export const employeeDocuments = mysqlTable("employee_documents", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: mysqlEnum(['rg','cnh','ctps','comprovante_residencia','certidao_nascimento','titulo_eleitor','reservista','pis','foto_3x4','contrato_trabalho','termo_rescisao','atestado_medico','diploma','certificado','outros']).notNull(),
	nome: varchar({ length: 255 }).notNull(),
	descricao: varchar({ length: 500 }),
	fileUrl: text().notNull(),
	fileKey: text().notNull(),
	mimeType: varchar({ length: 100 }),
	fileSize: int(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataValidade: date({ mode: 'string' }),
	uploadPor: varchar({ length: 255 }),
	uploadPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
},
(table) => [
	index("edoc_company").on(table.companyId),
	index("edoc_employee").on(table.employeeId),
	index("edoc_tipo").on(table.tipo),
]);

export const employeeHistory = mysqlTable("employee_history", {
	id: int().autoincrement().notNull(),
	employeeId: int().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['Admissao','Promocao','Transferencia','Mudanca_Funcao','Mudanca_Setor','Mudanca_Salario','Afastamento','Retorno','Ferias','Desligamento','Outros']).notNull(),
	descricao: text(),
	valorAnterior: text(),
	valorNovo: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEvento: date({ mode: 'string' }).notNull(),
	registradoPor: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const employeeSiteHistory = mysqlTable("employee_site_history", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int().notNull(),
	tipo: mysqlEnum(['alocacao','transferencia','retorno','saida','temporario']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }),
	motivoTransferencia: text(),
	obraOrigemId: int(),
	registradoPor: varchar({ length: 255 }),
	registradoPorUserId: int(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("esh_company").on(table.companyId),
	index("esh_employee").on(table.employeeId),
	index("esh_obra").on(table.obraId),
	index("esh_data").on(table.dataInicio, table.dataFim),
]);

export const employees = mysqlTable("employees", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	matricula: varchar({ length: 20 }),
	nomeCompleto: varchar({ length: 255 }).notNull(),
	cpf: varchar({ length: 14 }).notNull(),
	rg: varchar({ length: 20 }),
	orgaoEmissor: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataNascimento: date({ mode: 'string' }),
	sexo: mysqlEnum(['M','F','Outro']),
	estadoCivil: mysqlEnum(['Solteiro','Casado','Divorciado','Viuvo','Uniao_Estavel','Amasiado','Separado','Separado_Judicialmente','Outro']),
	nacionalidade: varchar({ length: 50 }),
	naturalidade: varchar({ length: 100 }),
	nomeMae: varchar({ length: 255 }),
	nomePai: varchar({ length: 255 }),
	ctps: varchar({ length: 20 }),
	serieCtps: varchar({ length: 10 }),
	pis: varchar({ length: 20 }),
	tituloEleitor: varchar({ length: 20 }),
	certificadoReservista: varchar({ length: 20 }),
	cnh: varchar({ length: 20 }),
	categoriaCnh: varchar({ length: 5 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validadeCnh: date({ mode: 'string' }),
	logradouro: varchar({ length: 255 }),
	numero: varchar({ length: 20 }),
	complemento: varchar({ length: 100 }),
	bairro: varchar({ length: 100 }),
	cidade: varchar({ length: 100 }),
	estado: varchar({ length: 2 }),
	cep: varchar({ length: 10 }),
	telefone: varchar({ length: 20 }),
	celular: varchar({ length: 20 }),
	email: varchar({ length: 320 }),
	contatoEmergencia: varchar({ length: 255 }),
	telefoneEmergencia: varchar({ length: 20 }),
	parentescoEmergencia: varchar({ length: 100 }),
	cargo: varchar({ length: 100 }),
	funcao: varchar({ length: 100 }),
	setor: varchar({ length: 100 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAdmissao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataDemissao: date({ mode: 'string' }),
	salarioBase: varchar({ length: 20 }),
	valorHora: varchar({ length: 20 }),
	horasMensais: varchar({ length: 10 }),
	tipoContrato: mysqlEnum(['CLT','PJ','Temporario','Estagio','Aprendiz']),
	jornadaTrabalho: text(),
	banco: varchar({ length: 100 }),
	bancoNome: varchar({ length: 100 }),
	agencia: varchar({ length: 20 }),
	conta: varchar({ length: 30 }),
	tipoConta: mysqlEnum(['Corrente','Poupanca','Salario']),
	tipoChavePix: mysqlEnum(['CPF','Celular','Email','Aleatoria']),
	chavePix: varchar({ length: 100 }),
	contaPix: varchar({ length: 100 }),
	bancoPix: varchar({ length: 100 }),
	status: mysqlEnum(['Ativo','Ferias','Afastado','Licenca','Desligado','Recluso','Lista_Negra']).default('Ativo').notNull(),
	fotoUrl: text(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	listaNegra: tinyint().default(0).notNull(),
	motivoListaNegra: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataListaNegra: date({ mode: 'string' }),
	obraAtualId: int(),
	codigoContabil: varchar({ length: 20 }),
	codigoInterno: varchar({ length: 10 }),
	recebeComplemento: tinyint().default(0).notNull(),
	valorComplemento: varchar({ length: 20 }),
	descricaoComplemento: varchar({ length: 255 }),
	acordoHoraExtra: tinyint().default(0).notNull(),
	heNormal50: varchar({ length: 10 }).default('50'),
	heNoturna: varchar({ length: 10 }).default('20'),
	he100: varchar({ length: 10 }).default('100'),
	heFeriado: varchar({ length: 10 }).default('100'),
	heInterjornada: varchar({ length: 10 }).default('50'),
	obsAcordoHe: text(),
	contaBancariaEmpresaId: int(),
	listaNegraPor: varchar({ length: 255 }),
	listaNegraUserId: int(),
	desligadoPor: varchar({ length: 255 }),
	desligadoUserId: int(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataDesligamentoEfetiva: date({ mode: 'string' }),
	motivoDesligamento: text(),
	categoriaDesligamento: varchar({ length: 50 }),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	deleteReason: text(),
	experienciaTipo: mysqlEnum(['30_30','45_45']),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	experienciaInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	experienciaFim1: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	experienciaFim2: date({ mode: 'string' }),
	experienciaStatus: mysqlEnum(['em_experiencia','prorrogado','efetivado','desligado_experiencia']).default('em_experiencia'),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	experienciaProrrogadoEm: date({ mode: 'string' }),
	experienciaProrrogadoPor: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	experienciaEfetivadoEm: date({ mode: 'string' }),
	experienciaEfetivadoPor: varchar({ length: 255 }),
	experienciaObs: text(),
	vtTipo: mysqlEnum(['nenhum','onibus','van','misto']),
	vtValorDiario: varchar({ length: 20 }),
	vtOperadora: varchar({ length: 100 }),
	vtLinhas: varchar({ length: 255 }),
	vtDescontoFolha: varchar({ length: 20 }),
	pensaoAlimenticia: tinyint().default(0),
	pensaoValor: varchar({ length: 20 }),
	pensaoTipo: mysqlEnum(['percentual','valor_fixo']),
	pensaoPercentual: varchar({ length: 10 }),
	pensaoBeneficiario: varchar({ length: 255 }),
	pensaoBanco: varchar({ length: 100 }),
	pensaoAgencia: varchar({ length: 20 }),
	pensaoConta: varchar({ length: 30 }),
	pensaoObservacoes: text(),
	licencaMaternidade: tinyint().default(0),
	licencaTipo: mysqlEnum(['maternidade_120','maternidade_180','paternidade_5','paternidade_20']),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	licencaDataInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	licencaDataFim: date({ mode: 'string' }),
	licencaObservacoes: text(),
	seguroVida: varchar({ length: 20 }),
	contribuicaoSindical: varchar({ length: 20 }),
	fgtsPercentual: varchar({ length: 10 }).default('8'),
	inssPercentual: varchar({ length: 10 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dissidioData: date({ mode: 'string' }),
	dissidioPercentual: varchar({ length: 10 }),
	convencaoColetiva: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	convencaoVigencia: date({ mode: 'string' }),
	ddsParticipacao: tinyint().default(1),
	docRgUrl: text(),
	docCnhUrl: text(),
	docCtpsUrl: text(),
	docComprovanteResidenciaUrl: text(),
	docCertidaoNascimentoUrl: text(),
	docTituloEleitorUrl: text(),
	docReservistaUrl: text(),
	docOutrosUrl: text(),
	vrBeneficio: varchar({ length: 20 }),
	vtRecebe: varchar({ length: 20 }),
	vtNumeroCartao: varchar({ length: 50 }),
	vaRecebe: varchar({ length: 20 }),
	vaValor: varchar({ length: 20 }),
	vaOperadora: varchar({ length: 100 }),
	vaNumeroCartao: varchar({ length: 50 }),
	auxFarmacia: varchar({ length: 20 }),
	auxFarmaciaValor: varchar({ length: 20 }),
	planoSaude: varchar({ length: 20 }),
	planoSaudeOperadora: varchar({ length: 100 }),
	planoSaudeValor: varchar({ length: 20 }),
	benefObs: text(),
},
(table) => [
	index("idx_company_codigo_interno").on(table.companyId, table.codigoInterno),
]);

export const epiDeliveries = mysqlTable("epi_deliveries", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	epiId: int().notNull(),
	employeeId: int().notNull(),
	quantidade: int().default(1).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEntrega: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataDevolucao: date({ mode: 'string' }),
	motivo: varchar({ length: 255 }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	motivoTroca: varchar("motivo_troca", { length: 50 }),
	valorCobrado: decimal("valor_cobrado", { precision: 10, scale: 2 }),
	fichaUrl: text("ficha_url"),
	fotoEstadoUrl: text("foto_estado_url"),
});

export const epiDiscountAlerts = mysqlTable("epi_discount_alerts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	epiDeliveryId: int().notNull(),
	epiNome: varchar("epi_nome", { length: 1000 }).notNull(),
	ca: varchar({ length: 20 }),
	quantidade: int().default(1).notNull(),
	valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2 }).notNull(),
	valorTotal: decimal("valor_total", { precision: 10, scale: 2 }).notNull(),
	motivoCobranca: varchar("motivo_cobranca", { length: 100 }).notNull(),
	mesReferencia: varchar("mes_referencia", { length: 7 }).notNull(),
	status: mysqlEnum(['pendente','confirmado','cancelado']).default('pendente').notNull(),
	validadoPor: varchar("validado_por", { length: 255 }),
	validadoPorUserId: int("validado_por_user_id"),
	dataValidacao: timestamp("data_validacao", { mode: 'string' }),
	justificativa: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("eda_company").on(table.companyId),
	index("eda_employee").on(table.employeeId),
	index("eda_delivery").on(table.epiDeliveryId),
	index("eda_status").on(table.status),
	index("eda_mes").on(table.companyId, table.mesReferencia),
]);

export const epis = mysqlTable("epis", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 1000 }).notNull(),
	ca: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validadeCa: date({ mode: 'string' }),
	fabricante: varchar({ length: 255 }),
	fornecedor: varchar({ length: 255 }),
	quantidadeEstoque: int().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	valorProduto: decimal("valor_produto", { precision: 10, scale: 2 }),
	tempoMinimoTroca: int("tempo_minimo_troca"),
	categoria: mysqlEnum(['EPI','Uniforme','Calcado']).default('EPI').notNull(),
	tamanho: varchar({ length: 20 }),
	fornecedorCnpj: varchar("fornecedor_cnpj", { length: 20 }),
	fornecedorContato: varchar("fornecedor_contato", { length: 255 }),
	fornecedorTelefone: varchar("fornecedor_telefone", { length: 30 }),
	fornecedorEmail: varchar("fornecedor_email", { length: 255 }),
	fornecedorEndereco: varchar("fornecedor_endereco", { length: 500 }),
	corCapacete: varchar("cor_capacete", { length: 30 }),
	condicao: mysqlEnum(['Novo','Reutilizado']).default('Novo').notNull(),
});

export const equipment = mysqlTable("equipment", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	patrimonio: varchar({ length: 50 }),
	tipoEquipamento: varchar({ length: 100 }),
	marca: varchar({ length: 100 }),
	modelo: varchar({ length: 100 }),
	numeroSerie: varchar({ length: 100 }),
	localizacao: varchar({ length: 255 }),
	responsavel: varchar({ length: 255 }),
	statusEquipamento: mysqlEnum(['Ativo','Manutencao','Inativo','Descartado']).default('Ativo').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAquisicao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	proximaManutencao: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const evalAuditLog = mysqlTable("eval_audit_log", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	action: varchar({ length: 100 }).notNull(),
	actorType: mysqlEnum(['admin','evaluator','system','anonymous']).default('system').notNull(),
	actorId: int(),
	actorName: varchar({ length: 255 }),
	targetType: varchar({ length: 50 }),
	targetId: int(),
	details: text(),
	ipAddress: varchar({ length: 45 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("eal_company").on(table.companyId),
	index("eal_action").on(table.action),
	index("eal_actor").on(table.actorType, table.actorId),
]);

export const evalAvaliacoes = mysqlTable("eval_avaliacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	evaluatorId: int().notNull(),
	comportamento: int(),
	pontualidade: int(),
	assiduidade: int(),
	segurancaEpis: int(),
	qualidadeAcabamento: int(),
	produtividadeRitmo: int(),
	cuidadoFerramentas: int(),
	economiaMateriais: int(),
	trabalhoEquipe: int(),
	iniciativaProatividade: int(),
	disponibilidadeFlexibilidade: int(),
	organizacaoLimpeza: int(),
	mediaPilar1: decimal({ precision: 3, scale: 1 }),
	mediaPilar2: decimal({ precision: 3, scale: 1 }),
	mediaPilar3: decimal({ precision: 3, scale: 1 }),
	mediaGeral: decimal({ precision: 3, scale: 1 }),
	recomendacao: varchar({ length: 100 }),
	observacoes: text(),
	mesReferencia: varchar({ length: 7 }),
	locked: tinyint().default(1).notNull(),
	startedAt: timestamp({ mode: 'string' }),
	durationSeconds: int(),
	deviceType: varchar({ length: 20 }),
	revisionId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	obraId: int("obra_id"),
	evaluatorName: varchar("evaluator_name", { length: 255 }),
},
(table) => [
	index("ea_company").on(table.companyId),
	index("ea_employee").on(table.employeeId),
	index("ea_evaluator").on(table.evaluatorId),
	index("ea_mes").on(table.mesReferencia),
]);

export const evalAvaliadores = mysqlTable("eval_avaliadores", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	userId: int("user_id"),
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	passwordHash: varchar({ length: 255 }).notNull(),
	emailVerified: tinyint().default(0),
	mustChangePassword: tinyint().default(1),
	obraId: int(),
	evaluationFrequency: mysqlEnum(['daily','weekly','monthly','quarterly','annual']).default('monthly').notNull(),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }),
},
(table) => [
	index("eva_company").on(table.companyId),
	index("eva_email").on(table.email),
]);

export const evalClimateAnswers = mysqlTable("eval_climate_answers", {
	id: int().autoincrement().notNull(),
	responseId: int().notNull(),
	questionId: int().notNull(),
	valor: varchar({ length: 20 }),
	textoLivre: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ecla_response").on(table.responseId),
	index("ecla_question").on(table.questionId),
]);

export const evalClimateExternalTokens = mysqlTable("eval_climate_external_tokens", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	participantId: int().notNull(),
	token: varchar({ length: 64 }).notNull(),
	used: tinyint().default(0),
	usedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ecet_survey").on(table.surveyId),
	index("ecet_token").on(table.token),
]);

export const evalClimateQuestions = mysqlTable("eval_climate_questions", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	texto: text().notNull(),
	categoria: mysqlEnum(['empresa','gestor','ambiente','seguranca','crescimento','recomendacao']).default('empresa').notNull(),
	tipo: mysqlEnum(['nota','texto','sim_nao']).default('nota').notNull(),
	ordem: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ecq_survey").on(table.surveyId),
]);

export const evalClimateResponses = mysqlTable("eval_climate_responses", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	cpfHash: varchar({ length: 64 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("eclr_survey").on(table.surveyId),
]);

export const evalClimateSurveys = mysqlTable("eval_climate_surveys", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	status: mysqlEnum(['ativa','encerrada','rascunho']).default('rascunho').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	publicToken: varchar("public_token", { length: 64 }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
},
(table) => [
	index("ecs_company").on(table.companyId),
]);

export const evalCriteria = mysqlTable("eval_criteria", {
	id: int().autoincrement().notNull(),
	pillarId: int().notNull(),
	revisionId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	descricao: text(),
	fieldKey: varchar({ length: 100 }),
	ordem: int().default(0).notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ec_pillar").on(table.pillarId),
	index("ec_revision").on(table.revisionId),
]);

export const evalCriteriaRevisions = mysqlTable("eval_criteria_revisions", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	version: int().default(1).notNull(),
	descricao: varchar({ length: 255 }),
	isActive: tinyint().default(0).notNull(),
	createdBy: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ecr_company").on(table.companyId),
]);

export const evalExternalParticipants = mysqlTable("eval_external_participants", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	empresa: varchar({ length: 255 }),
	tipo: mysqlEnum(['cliente','fornecedor']).default('cliente').notNull(),
	email: varchar({ length: 320 }),
	telefone: varchar({ length: 20 }),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("eep_company").on(table.companyId),
]);

export const evalPillars = mysqlTable("eval_pillars", {
	id: int().autoincrement().notNull(),
	revisionId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	ordem: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ep_revision").on(table.revisionId),
]);

export const evalScores = mysqlTable("eval_scores", {
	id: int().autoincrement().notNull(),
	evaluationId: int().notNull(),
	criterionId: int().notNull(),
	nota: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("es_evaluation").on(table.evaluationId),
	index("es_criterion").on(table.criterionId),
]);

export const evalSurveyAnswers = mysqlTable("eval_survey_answers", {
	id: int().autoincrement().notNull(),
	responseId: int().notNull(),
	questionId: int().notNull(),
	valor: varchar({ length: 20 }),
	textoLivre: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("esa_response").on(table.responseId),
	index("esa_question").on(table.questionId),
]);

export const evalSurveyEvaluators = mysqlTable("eval_survey_evaluators", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	evaluatorId: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ese_survey").on(table.surveyId),
	index("ese_evaluator").on(table.evaluatorId),
]);

export const evalSurveyQuestions = mysqlTable("eval_survey_questions", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	texto: text().notNull(),
	tipo: mysqlEnum(['nota','texto','sim_nao']).default('nota').notNull(),
	ordem: int().default(0).notNull(),
	obrigatoria: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("esq_survey").on(table.surveyId),
]);

export const evalSurveyResponses = mysqlTable("eval_survey_responses", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	respondentName: varchar({ length: 255 }),
	respondentEmail: varchar({ length: 320 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	employeeId: int("employee_id"),
	evaluatorUserId: int("evaluator_user_id"),
},
(table) => [
	index("esr_survey").on(table.surveyId),
]);

export const evalSurveys = mysqlTable("eval_surveys", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	tipo: mysqlEnum(['setor','cliente','outro']).default('outro').notNull(),
	anonimo: tinyint().default(0),
	status: mysqlEnum(['ativa','encerrada','rascunho']).default('rascunho').notNull(),
	obraId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	publicToken: varchar("public_token", { length: 64 }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	isEvaluation: tinyint("is_evaluation").default(0),
	allowEmployeeSelection: tinyint("allow_employee_selection").default(1),
},
(table) => [
	index("esu_company").on(table.companyId),
]);

export const extinguishers = mysqlTable("extinguishers", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	numero: varchar({ length: 20 }).notNull(),
	tipoExtintor: mysqlEnum(['PQS','CO2','Agua','Espuma','AP']).notNull(),
	capacidade: varchar({ length: 20 }),
	localizacao: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataRecarga: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validadeRecarga: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataTesteHidrostatico: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validadeTesteHidrostatico: date({ mode: 'string' }),
	statusExtintor: mysqlEnum(['OK','Vencido','Manutencao']).default('OK').notNull(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const extraPayments = mysqlTable("extra_payments", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	tipoExtra: mysqlEnum(['Diferenca_Salario','Horas_Extras','Reembolso','Bonus','Outro']).notNull(),
	descricao: text(),
	valorHoraBase: varchar({ length: 20 }),
	percentualAcrescimo: varchar({ length: 10 }),
	quantidadeHoras: varchar({ length: 10 }),
	valorTotal: varchar({ length: 20 }).notNull(),
	bancoDestino: varchar({ length: 100 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const feriados = mysqlTable("feriados", {
	id: int().autoincrement().notNull(),
	companyId: int(),
	nome: varchar({ length: 255 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	tipo: mysqlEnum(['nacional','estadual','municipal','ponto_facultativo','compensado']).notNull(),
	recorrente: tinyint().default(1).notNull(),
	estado: varchar({ length: 2 }),
	cidade: varchar({ length: 100 }),
	ativo: tinyint().default(1).notNull(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("fer_company").on(table.companyId),
	index("fer_data").on(table.data),
	index("fer_tipo").on(table.tipo),
]);

export const folhaItens = mysqlTable("folha_itens", {
	id: int().autoincrement().notNull(),
	folhaLancamentoId: int().notNull(),
	companyId: int().notNull(),
	employeeId: int(),
	codigoContabil: varchar({ length: 20 }),
	nomeColaborador: varchar({ length: 255 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAdmissao: date({ mode: 'string' }),
	salarioBase: varchar({ length: 20 }),
	horasMensais: varchar({ length: 10 }),
	funcao: varchar({ length: 100 }),
	sf: int().default(0),
	ir: int().default(0),
	proventos: json(),
	descontos: json(),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	baseInss: varchar({ length: 20 }),
	valorInss: varchar({ length: 20 }),
	baseFgts: varchar({ length: 20 }),
	valorFgts: varchar({ length: 20 }),
	baseIrrf: varchar({ length: 20 }),
	valorIrrf: varchar({ length: 20 }),
	liquido: varchar({ length: 20 }),
	situacaoEspecial: text(),
	matchStatus: mysqlEnum(['matched','unmatched','divergente']).default('unmatched').notNull(),
	divergencias: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("folha_itens_lanc").on(table.folhaLancamentoId),
	index("folha_itens_emp").on(table.employeeId),
]);

export const folhaLancamentos = mysqlTable("folha_lancamentos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	tipoLancamento: mysqlEnum(['vale','pagamento','decimo_terceiro_1','decimo_terceiro_2']).notNull(),
	status: mysqlEnum(['importado','validado','consolidado']).default('importado').notNull(),
	analiticoUploadId: int(),
	sinteticoUploadId: int(),
	totalFuncionarios: int().default(0),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	totalLiquido: varchar({ length: 20 }),
	totalDivergencias: int().default(0),
	divergenciasResolvidas: int().default(0),
	importadoPor: varchar({ length: 255 }),
	importadoEm: timestamp({ mode: 'string' }),
	validadoPor: varchar({ length: 255 }),
	validadoEm: timestamp({ mode: 'string' }),
	consolidadoPor: varchar({ length: 255 }),
	consolidadoEm: timestamp({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("folha_lanc_company_mes").on(table.companyId, table.mesReferencia),
]);

export const fornecedoresEpi = mysqlTable("fornecedores_epi", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	cnpj: varchar({ length: 20 }),
	contato: varchar({ length: 255 }),
	telefone: varchar({ length: 30 }),
	email: varchar({ length: 255 }),
	endereco: varchar({ length: 500 }),
	observacoes: text(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const goldenRules = mysqlTable("golden_rules", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 200 }).notNull(),
	descricao: text().notNull(),
	categoria: mysqlEnum(['seguranca','qualidade','rh','operacional','juridico','financeiro','geral']).default('geral').notNull(),
	prioridade: mysqlEnum(['critica','alta','media','baixa']).default('alta').notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const heSolicitacaoFuncionarios = mysqlTable("he_solicitacao_funcionarios", {
	id: int().autoincrement().notNull(),
	solicitacaoId: int().notNull(),
	employeeId: int().notNull(),
	horasRealizadas: varchar({ length: 10 }),
	status: mysqlEnum(['pendente','realizada','nao_realizada']).default('pendente').notNull(),
	observacao: text(),
},
(table) => [
	index("he_sol_func_sol").on(table.solicitacaoId),
	index("he_sol_func_emp").on(table.employeeId),
]);

export const heSolicitacoes = mysqlTable("he_solicitacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataSolicitacao: date({ mode: 'string' }).notNull(),
	horaInicio: varchar({ length: 10 }),
	horaFim: varchar({ length: 10 }),
	motivo: text().notNull(),
	status: mysqlEnum(['pendente','aprovada','rejeitada','cancelada']).default('pendente').notNull(),
	solicitadoPor: varchar({ length: 255 }).notNull(),
	solicitadoPorId: int().notNull(),
	aprovadoPor: varchar({ length: 255 }),
	aprovadoPorId: int(),
	aprovadoEm: timestamp({ mode: 'string' }),
	motivoRejeicao: text(),
	observacaoAdmin: text(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("he_sol_company").on(table.companyId),
	index("he_sol_obra").on(table.obraId),
	index("he_sol_data").on(table.dataSolicitacao),
	index("he_sol_status").on(table.status),
	index("he_sol_company_status").on(table.companyId, table.status),
]);

export const hydrants = mysqlTable("hydrants", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	numero: varchar({ length: 20 }).notNull(),
	localizacao: varchar({ length: 255 }),
	tipoHidrante: varchar({ length: 50 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	ultimaInspecao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	proximaInspecao: date({ mode: 'string' }),
	statusHidrante: mysqlEnum(['OK','Manutencao','Inativo']).default('OK').notNull(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const insuranceAlertConfig = mysqlTable("insurance_alert_config", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	isActive: tinyint().default(1).notNull(),
	textoAdmissao: text(),
	textoAfastamento: text(),
	textoReclusao: text(),
	textoDesligamento: text(),
	seguradora: varchar({ length: 255 }),
	apolice: varchar({ length: 100 }),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("iac_company").on(table.companyId),
]);

export const insuranceAlertRecipients = mysqlTable("insurance_alert_recipients", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	configId: int().notNull(),
	tipoDestinatario: mysqlEnum(['corretor','diretoria','usuario_sistema','outro']).notNull(),
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	telefone: varchar({ length: 20 }),
	cargo: varchar({ length: 100 }),
	recebeAdmissao: tinyint().default(1).notNull(),
	recebeAfastamento: tinyint().default(1).notNull(),
	recebeReclusao: tinyint().default(1).notNull(),
	recebeDesligamento: tinyint().default(1).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("iar_company").on(table.companyId),
	index("iar_config").on(table.configId),
]);

export const insuranceAlertsLog = mysqlTable("insurance_alerts_log", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipoMovimentacao: mysqlEnum(['admissao','afastamento','reclusao','desligamento']).notNull(),
	statusAnterior: varchar({ length: 50 }),
	statusNovo: varchar({ length: 50 }),
	textoAlerta: text().notNull(),
	nomeFuncionario: varchar({ length: 255 }).notNull(),
	cpfFuncionario: varchar({ length: 14 }),
	funcaoFuncionario: varchar({ length: 100 }),
	obraFuncionario: varchar({ length: 255 }),
	destinatarios: json(),
	disparadoPor: varchar({ length: 255 }),
	disparoAutomatico: tinyint().default(1).notNull(),
	statusEnvio: mysqlEnum(['enviado','erro','pendente']).default('pendente').notNull(),
	erroMensagem: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("ial_company").on(table.companyId),
	index("ial_employee").on(table.employeeId),
	index("ial_tipo").on(table.companyId, table.tipoMovimentacao),
	index("ial_data").on(table.companyId, table.createdAt),
]);

export const jobFunctions = mysqlTable("job_functions", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 100 }).notNull(),
	descricao: text(),
	ordemServico: text(),
	cbo: varchar({ length: 10 }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const manualObraAssignments = mysqlTable("manual_obra_assignments", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	justificativa: text().notNull(),
	percentual: int().default(100).notNull(),
	atribuidoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("moa_company_mes").on(table.companyId, table.mesReferencia),
	index("moa_employee_mes").on(table.employeeId, table.mesReferencia),
]);

export const mealBenefitConfigs = mysqlTable("meal_benefit_configs", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	nome: varchar({ length: 255 }).default('Padrão').notNull(),
	cafeManhaDia: varchar({ length: 20 }).default('0'),
	lancheTardeDia: varchar({ length: 20 }).default('0'),
	valeAlimentacaoMes: varchar({ length: 20 }).default('0'),
	jantaDia: varchar({ length: 20 }).default('0'),
	totalVaIFood: varchar("totalVA_iFood", { length: 20 }).default('0'),
	diasUteisRef: int().default(22),
	observacoes: text(),
	ativo: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP'),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
	cafeAtivo: tinyint().default(1),
	lancheAtivo: tinyint().default(1),
	jantaAtivo: tinyint().default(0),
},
(table) => [
	index("idx_meal_company").on(table.companyId),
	index("idx_meal_obra").on(table.obraId),
]);

export const menuConfig = mysqlTable("menu_config", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	configJson: text().notNull(),
	updatedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("mc_user").on(table.userId),
]);

export const menuLabels = mysqlTable("menu_labels", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	originalLabel: varchar({ length: 255 }).notNull(),
	customLabel: varchar({ length: 255 }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ml_company_label").on(table.companyId, table.originalLabel),
	index("ml_company").on(table.companyId),
]);

export const monthlyPayrollSummary = mysqlTable("monthly_payroll_summary", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	nomeColaborador: varchar({ length: 255 }),
	codigoContabil: varchar({ length: 20 }),
	funcao: varchar({ length: 100 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAdmissao: date({ mode: 'string' }),
	salarioBaseHora: varchar({ length: 20 }),
	horasMensais: varchar({ length: 10 }),
	adiantamentoBruto: varchar({ length: 20 }),
	adiantamentoDescontos: varchar({ length: 20 }),
	adiantamentoLiquido: varchar({ length: 20 }),
	salarioHorista: varchar({ length: 20 }),
	dsr: varchar({ length: 20 }),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	folhaLiquido: varchar({ length: 20 }),
	baseInss: varchar({ length: 20 }),
	valorInss: varchar({ length: 20 }),
	baseFgts: varchar({ length: 20 }),
	valorFgts: varchar({ length: 20 }),
	baseIrrf: varchar({ length: 20 }),
	valorIrrf: varchar({ length: 20 }),
	diferencaSalario: varchar({ length: 20 }),
	horasExtrasValor: varchar({ length: 20 }),
	vrBeneficio: varchar({ length: 20 }),
	bancoAdiantamento: varchar({ length: 100 }),
	bancoFolha: varchar({ length: 100 }),
	custoTotalMes: varchar({ length: 20 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const notificationLogs = mysqlTable("notification_logs", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int(),
	employeeName: varchar({ length: 255 }).notNull(),
	employeeCpf: varchar({ length: 20 }),
	employeeFuncao: varchar({ length: 100 }),
	tipoMovimentacao: mysqlEnum(['contratacao','demissao','transferencia','afastamento']).notNull(),
	statusAnterior: varchar({ length: 50 }),
	statusNovo: varchar({ length: 50 }),
	recipientId: int(),
	recipientName: varchar({ length: 255 }).notNull(),
	recipientEmail: varchar({ length: 255 }).notNull(),
	titulo: varchar({ length: 500 }).notNull(),
	corpo: text(),
	statusEnvio: mysqlEnum(['enviado','erro','pendente']).default('pendente').notNull(),
	erroMensagem: text(),
	trackingId: varchar({ length: 64 }),
	lido: tinyint().default(0).notNull(),
	lidoEm: timestamp({ mode: 'string' }),
	disparadoPor: varchar({ length: 255 }),
	disparadoPorId: int(),
	enviadoEm: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("nl_company").on(table.companyId),
	index("nl_employee").on(table.employeeId),
	index("nl_tipo").on(table.companyId, table.tipoMovimentacao),
	index("nl_tracking").on(table.trackingId),
	index("nl_data").on(table.companyId, table.enviadoEm),
]);

export const notificationRecipients = mysqlTable("notification_recipients", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	notificarContratacao: tinyint().default(1).notNull(),
	notificarDemissao: tinyint().default(1).notNull(),
	notificarTransferencia: tinyint().default(0).notNull(),
	notificarAfastamento: tinyint().default(0).notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("nr_company").on(table.companyId),
	index("nr_email").on(table.email),
]);

export const obraFuncionarios = mysqlTable("obra_funcionarios", {
	id: int().autoincrement().notNull(),
	obraId: int().notNull(),
	employeeId: int().notNull(),
	companyId: int().notNull(),
	funcaoNaObra: varchar({ length: 100 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const obraHorasRateio = mysqlTable("obra_horas_rateio", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int().notNull(),
	employeeId: int().notNull(),
	dixiDeviceId: int(),
	mesAno: varchar({ length: 7 }).notNull(),
	horasNormais: varchar({ length: 10 }),
	horasExtras: varchar({ length: 10 }),
	horasNoturnas: varchar({ length: 10 }),
	totalHoras: varchar({ length: 10 }),
	diasTrabalhados: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const obraPontoInconsistencies = mysqlTable("obra_ponto_inconsistencies", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraAlocadaId: int(),
	obraPontoId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPonto: date({ mode: 'string' }).notNull(),
	snRelogio: varchar({ length: 50 }),
	status: mysqlEnum(['pendente','esporadico','transferido','ignorado']).default('pendente').notNull(),
	resolvidoPor: varchar({ length: 255 }),
	resolvidoPorUserId: int(),
	resolvidoEm: timestamp({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("opi_company").on(table.companyId),
	index("opi_employee").on(table.employeeId),
	index("opi_status").on(table.status),
	index("opi_data").on(table.dataPonto),
]);

export const obraSns = mysqlTable("obra_sns", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	sn: varchar({ length: 50 }).notNull(),
	apelido: varchar({ length: 100 }),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataVinculo: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataLiberacao: date({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("obra_sn_company").on(table.companyId),
	index("obra_sn_obra").on(table.obraId),
	index("obra_sn_sn").on(table.sn),
]);

export const obras = mysqlTable("obras", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	codigo: varchar({ length: 50 }),
	cliente: varchar({ length: 255 }),
	responsavel: varchar({ length: 255 }),
	endereco: text(),
	cidade: varchar({ length: 100 }),
	estado: varchar({ length: 2 }),
	cep: varchar({ length: 10 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPrevisaoFim: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFimReal: date({ mode: 'string' }),
	status: mysqlEnum(['Planejamento','Em_Andamento','Paralisada','Concluida','Cancelada']).default('Planejamento').notNull(),
	valorContrato: varchar({ length: 20 }),
	observacoes: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	numOrcamento: varchar({ length: 50 }),
	snRelogioPonto: varchar({ length: 50 }),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	usarConvencaoMatriz: tinyint().default(1).notNull(),
	convencaoId: int(),
	convencaoDivergencias: text(),
});

export const payroll = mysqlTable("payroll", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	tipoFolha: mysqlEnum(['Mensal','Adiantamento','Ferias','Rescisao','PLR','13_Salario']).notNull(),
	salarioBruto: varchar({ length: 20 }),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	salarioLiquido: varchar({ length: 20 }),
	inss: varchar({ length: 20 }),
	irrf: varchar({ length: 20 }),
	fgts: varchar({ length: 20 }),
	valeTransporte: varchar({ length: 20 }),
	valeAlimentacao: varchar({ length: 20 }),
	outrosProventos: text(),
	outrosDescontos: text(),
	bancoDestino: varchar({ length: 100 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const payrollUploads = mysqlTable("payroll_uploads", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	category: mysqlEnum(['cartao_ponto','espelho_adiantamento_analitico','adiantamento_sintetico','espelho_folha_analitico','folha_sintetico']).notNull(),
	month: varchar({ length: 7 }).notNull(),
	fileName: varchar({ length: 255 }).notNull(),
	fileUrl: text().notNull(),
	fileKey: varchar({ length: 500 }).notNull(),
	fileSize: int(),
	mimeType: varchar({ length: 100 }),
	uploadStatus: mysqlEnum(['pendente','processando','processado','erro']).default('pendente').notNull(),
	recordsProcessed: int().default(0),
	errorMessage: text(),
	uploadedBy: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const permissions = mysqlTable("permissions", {
	id: int().autoincrement().notNull(),
	profileId: int().notNull(),
	module: varchar({ length: 50 }).notNull(),
	canView: tinyint().default(0).notNull(),
	canCreate: tinyint().default(0).notNull(),
	canEdit: tinyint().default(0).notNull(),
	canDelete: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const pjContracts = mysqlTable("pj_contracts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	numeroContrato: varchar({ length: 50 }),
	cnpjPrestador: varchar({ length: 20 }),
	razaoSocialPrestador: varchar({ length: 255 }),
	objetoContrato: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }).notNull(),
	renovacaoAutomatica: tinyint().default(0),
	valorMensal: varchar({ length: 20 }),
	percentualAdiantamento: int().default(40),
	percentualFechamento: int().default(60),
	diaAdiantamento: int().default(15),
	diaFechamento: int().default(5),
	modeloContratoUrl: text(),
	contratoAssinadoUrl: text(),
	tipoAssinatura: mysqlEnum(['manual','digital','pendente']).default('pendente'),
	status: mysqlEnum(['ativo','vencido','renovado','cancelado','pendente_assinatura']).default('pendente_assinatura').notNull(),
	alertaVencimentoEnviado: tinyint().default(0),
	contratoAnteriorId: int(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("pjc_company").on(table.companyId),
	index("pjc_employee").on(table.employeeId),
	index("pjc_status").on(table.status),
	index("pjc_vencimento").on(table.dataFim),
]);

export const pjMedicoes = mysqlTable("pj_medicoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	contractId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	horasTrabalhadas: varchar({ length: 20 }).notNull(),
	valorHora: varchar({ length: 20 }).notNull(),
	valorBruto: varchar({ length: 20 }).notNull(),
	descontos: varchar({ length: 20 }).default('0'),
	acrescimos: varchar({ length: 20 }).default('0'),
	descricaoDescontos: text(),
	descricaoAcrescimos: text(),
	valorLiquido: varchar({ length: 20 }).notNull(),
	notaFiscalNumero: varchar({ length: 50 }),
	notaFiscalUrl: text(),
	status: mysqlEnum(['rascunho','pendente_aprovacao','aprovada','paga','cancelada']).default('rascunho').notNull(),
	aprovadoPor: varchar({ length: 255 }),
	aprovadoEm: timestamp({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	comprovanteUrl: text(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pjm_company_mes").on(table.companyId, table.mesReferencia),
	index("pjm_contract").on(table.contractId),
	index("pjm_employee").on(table.employeeId),
	index("pjm_status").on(table.status),
]);

export const pjPayments = mysqlTable("pj_payments", {
	id: int().autoincrement().notNull(),
	contractId: int().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	tipo: mysqlEnum(['adiantamento','fechamento','bonificacao']).notNull(),
	valor: varchar({ length: 20 }).notNull(),
	descricao: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	status: mysqlEnum(['pendente','pago','cancelado']).default('pendente').notNull(),
	comprovanteUrl: text(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pjp_contract").on(table.contractId),
	index("pjp_company_mes").on(table.companyId, table.mesReferencia),
	index("pjp_employee").on(table.employeeId),
]);

export const pontoConsolidacao = mysqlTable("ponto_consolidacao", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	status: mysqlEnum(['aberto','consolidado']).default('aberto').notNull(),
	consolidadoPor: varchar({ length: 255 }),
	consolidadoEm: timestamp({ mode: 'string' }),
	desconsolidadoPor: varchar({ length: 255 }),
	desconsolidadoEm: timestamp({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ponto_consolidacao_company_mes").on(table.companyId, table.mesReferencia),
]);

export const pontoDescontos = mysqlTable("ponto_descontos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	tipo: mysqlEnum(['atraso','saida_antecipada','falta_injustificada','falta_dsr','falta_feriado','he_nao_autorizada']).notNull(),
	minutosAtraso: int().default(0),
	minutosHe: int().default(0),
	valorDesconto: varchar({ length: 20 }).default('0'),
	valorDsr: varchar({ length: 20 }).default('0'),
	valorTotal: varchar({ length: 20 }).default('0'),
	baseCalculo: text(),
	timeRecordId: int(),
	heSolicitacaoId: int(),
	status: mysqlEnum(['calculado','revisado','abonado','fechado']).default('calculado').notNull(),
	abonadoPor: varchar({ length: 255 }),
	abonadoEm: timestamp({ mode: 'string' }),
	motivoAbono: text(),
	fundamentacaoLegal: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pd_company_mes").on(table.companyId, table.mesReferencia),
	index("pd_employee_mes").on(table.employeeId, table.mesReferencia),
	index("pd_tipo").on(table.tipo),
	index("pd_status").on(table.status),
	index("pd_data").on(table.data),
]);

export const pontoDescontosResumo = mysqlTable("ponto_descontos_resumo", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	totalAtrasos: int().default(0),
	totalMinutosAtraso: int().default(0),
	totalFaltasInjustificadas: int().default(0),
	totalSaidasAntecipadas: int().default(0),
	totalMinutosSaidaAntecipada: int().default(0),
	totalDsrPerdidos: int().default(0),
	totalFeriadosPerdidos: int().default(0),
	totalHeNaoAutorizadas: int().default(0),
	totalMinutosHeNaoAutorizada: int().default(0),
	valorTotalAtrasos: varchar({ length: 20 }).default('0'),
	valorTotalFaltas: varchar({ length: 20 }).default('0'),
	valorTotalDsr: varchar({ length: 20 }).default('0'),
	valorTotalFeriados: varchar({ length: 20 }).default('0'),
	valorTotalSaidasAntecipadas: varchar({ length: 20 }).default('0'),
	valorTotalHeNaoAutorizada: varchar({ length: 20 }).default('0'),
	valorTotalDescontos: varchar({ length: 20 }).default('0'),
	faltasAcumuladasPeriodoAquisitivo: int().default(0),
	diasFeriasResultante: int().default(30),
	status: mysqlEnum(['calculado','revisado','fechado']).default('calculado').notNull(),
	revisadoPor: varchar({ length: 255 }),
	revisadoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pdr_company_mes").on(table.companyId, table.mesReferencia),
	index("pdr_employee_mes").on(table.employeeId, table.mesReferencia),
]);

export const processoAnalises = mysqlTable("processo_analises", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	processoId: int().notNull(),
	resumoExecutivo: text(),
	valorEstimadoRisco: decimal({ precision: 15, scale: 2 }),
	valorEstimadoAcordo: decimal({ precision: 15, scale: 2 }),
	probabilidadeCondenacao: int(),
	probabilidadeAcordo: int(),
	probabilidadeArquivamento: int(),
	pontosFortes: json(),
	pontosFracos: json(),
	caminhosPositivos: json(),
	jurisprudenciaRelevante: json(),
	recomendacaoEstrategica: text(),
	insightsAdicionais: json(),
	valorCausaExtraido: decimal({ precision: 15, scale: 2 }),
	pedidosExtraidos: json(),
	modeloIa: varchar({ length: 100 }),
	promptUsado: text(),
	respostaCompleta: text(),
	tempoAnaliseMs: int(),
	versaoAnalise: int().default(1),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pa_company").on(table.companyId),
	index("pa_processo").on(table.processoId),
]);

export const processoAprendizado = mysqlTable("processo_aprendizado", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipoProcesso: varchar({ length: 100 }),
	assuntos: json(),
	pedidos: json(),
	riscoInicial: varchar({ length: 20 }),
	valorCausa: decimal({ precision: 15, scale: 2 }),
	resultadoFinal: mysqlEnum(['condenacao_total','condenacao_parcial','acordo','improcedente','arquivado','desistencia']),
	valorFinalCondenacao: decimal({ precision: 15, scale: 2 }),
	valorFinalAcordo: decimal({ precision: 15, scale: 2 }),
	duracaoMeses: int(),
	estrategiaAdotada: text(),
	resultadoEstrategia: text(),
	licaoAprendida: text(),
	processoId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("papr_company").on(table.companyId),
	index("papr_tipo").on(table.tipoProcesso),
	index("papr_resultado").on(table.resultadoFinal),
]);

export const processoDocumentos = mysqlTable("processo_documentos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	processoId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	tipo: mysqlEnum(['peticao_inicial','contestacao','sentenca','recurso','acordo','pericia','audiencia','despacho','mandado','outros']).default('outros').notNull(),
	descricao: text(),
	fileKey: varchar({ length: 500 }).notNull(),
	fileUrl: varchar({ length: 1000 }).notNull(),
	mimeType: varchar({ length: 100 }),
	tamanhoBytes: int(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	deletedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("pd_company").on(table.companyId),
	index("pd_processo").on(table.processoId),
]);

export const processosAndamentos = mysqlTable("processos_andamentos", {
	id: int().autoincrement().notNull(),
	processoId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	tipo: mysqlEnum(['audiencia','despacho','sentenca','recurso','pericia','acordo','pagamento','citacao','intimacao','peticao','outros']).default('outros').notNull(),
	descricao: text().notNull(),
	resultado: varchar({ length: 255 }),
	documentoUrl: varchar({ length: 500 }),
	documentoNome: varchar({ length: 255 }),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("pa_processo").on(table.processoId),
	index("pa_data").on(table.processoId, table.data),
]);

export const processosTrabalhistas = mysqlTable("processos_trabalhistas", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	numeroProcesso: varchar({ length: 50 }).notNull(),
	vara: varchar({ length: 100 }),
	comarca: varchar({ length: 100 }),
	tribunal: varchar({ length: 100 }),
	tipoAcao: mysqlEnum(['reclamatoria','indenizatoria','rescisao_indireta','acidente_trabalho','doenca_ocupacional','assedio','execucao_fiscal','mandado_seguranca','acao_civil_publica','outros']).default('reclamatoria').notNull(),
	reclamante: varchar({ length: 255 }).notNull(),
	advogadoReclamante: varchar({ length: 255 }),
	advogadoEmpresa: varchar({ length: 255 }),
	valorCausa: varchar({ length: 20 }),
	valorCondenacao: varchar({ length: 20 }),
	valorAcordo: varchar({ length: 20 }),
	valorPago: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataDistribuicao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataDesligamento: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataCitacao: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataAudiencia: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataEncerramento: date({ mode: 'string' }),
	status: mysqlEnum(['em_andamento','aguardando_audiencia','aguardando_pericia','acordo','sentenca','recurso','execucao','arquivado','encerrado']).default('em_andamento').notNull(),
	fase: mysqlEnum(['conhecimento','recursal','execucao','encerrado']).default('conhecimento').notNull(),
	risco: mysqlEnum(['baixo','medio','alto','critico']).default('medio').notNull(),
	pedidos: json(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	clienteCnpj: varchar({ length: 20 }),
	clienteRazaoSocial: varchar({ length: 255 }),
	clienteNomeFantasia: varchar({ length: 255 }),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	justica: mysqlEnum(['trabalho','federal','estadual','outros']).default('trabalho').notNull(),
	datajudId: varchar("datajud_id", { length: 255 }),
	datajudUltimaConsulta: timestamp("datajud_ultima_consulta", { mode: 'string' }),
	datajudUltimaAtualizacao: varchar("datajud_ultima_atualizacao", { length: 100 }),
	datajudGrau: varchar("datajud_grau", { length: 20 }),
	datajudClasse: varchar("datajud_classe", { length: 255 }),
	datajudAssuntos: json("datajud_assuntos"),
	datajudOrgaoJulgador: varchar("datajud_orgao_julgador", { length: 255 }),
	datajudSistema: varchar("datajud_sistema", { length: 100 }),
	datajudFormato: varchar("datajud_formato", { length: 50 }),
	datajudMovimentos: json("datajud_movimentos"),
	datajudTotalMovimentos: int("datajud_total_movimentos"),
	datajudAutoDetectado: tinyint("datajud_auto_detectado").default(0).notNull(),
},
(table) => [
	index("pt_company").on(table.companyId),
	index("pt_employee").on(table.employeeId),
	index("pt_status").on(table.companyId, table.status),
	index("pt_numero").on(table.numeroProcesso),
]);

export const risks = mysqlTable("risks", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	setor: varchar({ length: 100 }).notNull(),
	agenteRisco: varchar({ length: 255 }).notNull(),
	tipoRisco: mysqlEnum(['Fisico','Quimico','Biologico','Ergonomico','Acidente']).notNull(),
	fonteGeradora: varchar({ length: 255 }),
	grauRisco: mysqlEnum(['Baixo','Medio','Alto','Critico']).notNull(),
	medidasControle: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const sectors = mysqlTable("sectors", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 100 }).notNull(),
	descricao: varchar({ length: 255 }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const systemCriteria = mysqlTable("system_criteria", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	categoria: varchar({ length: 50 }).notNull(),
	chave: varchar({ length: 100 }).notNull(),
	valor: varchar({ length: 255 }).notNull(),
	descricao: varchar({ length: 500 }),
	valorPadraoClt: varchar({ length: 255 }),
	unidade: varchar({ length: 50 }),
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("sys_criteria_company_cat").on(table.companyId, table.categoria),
	index("sys_criteria_company_key").on(table.companyId, table.chave),
]);

export const systemRevisions = mysqlTable("system_revisions", {
	id: int().autoincrement().notNull(),
	version: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text().notNull(),
	tipo: mysqlEnum(['feature','bugfix','melhoria','seguranca','performance']).notNull(),
	modulos: text(),
	criadoPor: varchar({ length: 255 }).notNull(),
	dataPublicacao: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("sr_version").on(table.version),
]);

export const terminationNotices = mysqlTable("termination_notices", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: mysqlEnum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }).notNull(),
	diasAviso: int().default(30).notNull(),
	anosServico: int().default(0),
	reducaoJornada: mysqlEnum(['2h_dia','7_dias_corridos','nenhuma']).default('nenhuma'),
	salarioBase: varchar({ length: 20 }),
	previsaoRescisao: text(),
	valorEstimadoTotal: varchar({ length: 20 }),
	status: mysqlEnum(['em_andamento','concluido','cancelado']).default('em_andamento').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataConclusao: date({ mode: 'string' }),
	motivoCancelamento: text(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("tn_company").on(table.companyId),
	index("tn_employee").on(table.employeeId),
	index("tn_status").on(table.status),
]);

export const timeInconsistencies = mysqlTable("time_inconsistencies", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int(),
	timeRecordId: int(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	tipoInconsistencia: mysqlEnum(['batida_impar','falta_batida','horario_divergente','batida_duplicada','sem_registro']).notNull(),
	descricao: text(),
	status: mysqlEnum(['pendente','justificado','ajustado','advertencia']).default('pendente').notNull(),
	justificativa: text(),
	resolvidoPor: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	resolvidoEm: date({ mode: 'string' }),
	warningId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("time_incons_emp_mes").on(table.employeeId, table.mesReferencia),
]);

export const timeRecords = mysqlTable("time_records", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	entrada1: varchar({ length: 10 }),
	saida1: varchar({ length: 10 }),
	entrada2: varchar({ length: 10 }),
	saida2: varchar({ length: 10 }),
	entrada3: varchar({ length: 10 }),
	saida3: varchar({ length: 10 }),
	horasTrabalhadas: varchar({ length: 10 }),
	horasExtras: varchar({ length: 10 }),
	horasNoturnas: varchar({ length: 10 }),
	faltas: varchar({ length: 10 }),
	atrasos: varchar({ length: 10 }),
	justificativa: text(),
	fonte: varchar({ length: 50 }).default('manual'),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	obraId: int(),
	mesReferencia: varchar({ length: 7 }),
	ajusteManual: tinyint().default(0),
	ajustadoPor: varchar({ length: 255 }),
	batidasBrutas: json(),
});

export const trainingDocuments = mysqlTable("training_documents", {
	id: int().autoincrement().notNull(),
	trainingId: int().notNull(),
	employeeId: int().notNull(),
	companyId: int().notNull(),
	fileName: varchar({ length: 255 }).notNull(),
	fileUrl: text().notNull(),
	fileKey: varchar({ length: 500 }).notNull(),
	fileSize: int(),
	mimeType: varchar({ length: 100 }),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const trainings = mysqlTable("trainings", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	norma: varchar({ length: 50 }),
	cargaHoraria: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataRealizacao: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataValidade: date({ mode: 'string' }),
	instrutor: varchar({ length: 255 }),
	entidade: varchar({ length: 255 }),
	certificadoUrl: text(),
	statusTreinamento: mysqlEnum(['Valido','Vencido','A_Vencer']).default('Valido').notNull(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});

export const unmatchedDixiRecords = mysqlTable("unmatched_dixi_records", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	dixiName: varchar({ length: 255 }).notNull(),
	dixiId: varchar({ length: 50 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	data: date({ mode: 'string' }).notNull(),
	entrada1: varchar({ length: 10 }),
	saida1: varchar({ length: 10 }),
	entrada2: varchar({ length: 10 }),
	saida2: varchar({ length: 10 }),
	entrada3: varchar({ length: 10 }),
	saida3: varchar({ length: 10 }),
	batidasBrutas: json(),
	status: mysqlEnum(['pendente','vinculado','descartado']).default('pendente').notNull(),
	linkedEmployeeId: int(),
	resolvidoPor: varchar({ length: 255 }),
	resolvidoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("udr_company_mes").on(table.companyId, table.mesReferencia),
	index("udr_status").on(table.status),
	index("udr_dixi_name").on(table.dixiName),
]);

export const userCompanies = mysqlTable("user_companies", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull(),
	companyId: int("company_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("uk_user_company").on(table.userId, table.companyId),
]);

export const userPermissions = mysqlTable("user_permissions", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull(),
	moduleId: varchar("module_id", { length: 50 }).notNull(),
	featureKey: varchar("feature_key", { length: 100 }).notNull(),
	canAccess: tinyint("can_access").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("up_user").on(table.userId),
	index("up_module").on(table.moduleId),
	index("up_user_module").on(table.userId, table.moduleId),
]);

export const userProfiles = mysqlTable("user_profiles", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	companyId: int().notNull(),
	profileType: mysqlEnum(['adm_master','adm','operacional','avaliador','consulta']).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin','admin_master']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	username: varchar({ length: 100 }),
	password: varchar({ length: 255 }),
	mustChangePassword: tinyint().default(1),
	avatarUrl: text(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	modulesAccess: text(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);

export const vacationPeriods = mysqlTable("vacation_periods", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodoAquisitivoInicio: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodoAquisitivoFim: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodoConcessivoFim: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataFim: date({ mode: 'string' }),
	diasGozo: int().default(30),
	fracionamento: int().default(1),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodo2Inicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodo2Fim: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodo3Inicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodo3Fim: date({ mode: 'string' }),
	abonoPecuniario: tinyint().default(0),
	valorFerias: varchar({ length: 20 }),
	valorTercoConstitucional: varchar({ length: 20 }),
	valorAbono: varchar({ length: 20 }),
	valorTotal: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataPagamento: date({ mode: 'string' }),
	status: mysqlEnum(['pendente','agendada','em_gozo','concluida','vencida','cancelada']).default('pendente').notNull(),
	vencida: tinyint().default(0),
	pagamentoEmDobro: tinyint().default(0),
	observacoes: text(),
	aprovadoPor: varchar({ length: 255 }),
	aprovadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataSugeridaInicio: date({ mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataSugeridaFim: date({ mode: 'string' }),
	dataAlteradaPeloRh: tinyint().default(0),
	numeroPeriodo: int().default(1),
},
(table) => [
	index("vp_company").on(table.companyId),
	index("vp_employee").on(table.employeeId),
	index("vp_status").on(table.status),
	index("vp_concessivo").on(table.periodoConcessivoFim),
]);

export const vehicles = mysqlTable("vehicles", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipoVeiculo: mysqlEnum(['Carro','Caminhao','Van','Moto','Maquina_Pesada','Outro']).notNull(),
	placa: varchar({ length: 10 }),
	modelo: varchar({ length: 100 }).notNull(),
	marca: varchar({ length: 100 }),
	anoFabricacao: varchar({ length: 4 }),
	renavam: varchar({ length: 20 }),
	chassi: varchar({ length: 30 }),
	responsavel: varchar({ length: 255 }),
	statusVeiculo: mysqlEnum(['Ativo','Manutencao','Inativo']).default('Ativo').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	proximaManutencao: date({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const vrBenefits = mysqlTable("vr_benefits", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	valorDiario: varchar({ length: 20 }),
	diasUteis: int(),
	valorTotal: varchar({ length: 20 }).notNull(),
	operadora: varchar({ length: 100 }).default('iFood Benefícios'),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	valorCafe: varchar({ length: 20 }).default('0'),
	valorLanche: varchar({ length: 20 }).default('0'),
	valorJanta: varchar({ length: 20 }).default('0'),
	valorVa: varchar({ length: 20 }).default('0'),
	status: mysqlEnum(['pendente','aprovado','pago','cancelado']).default('pendente').notNull(),
	motivoAlteracao: text(),
	geradoPor: varchar({ length: 255 }),
	aprovadoPor: varchar({ length: 255 }),
},
(table) => [
	index("vr_company_mes").on(table.companyId, table.mesReferencia),
	index("vr_employee").on(table.employeeId),
]);

export const warningTemplates = mysqlTable("warning_templates", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['Verbal','Escrita','Suspensao','JustaCausa']).notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	textoModelo: text().notNull(),
	baseJuridica: text(),
	isDefault: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const warnings = mysqlTable("warnings", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipoAdvertencia: mysqlEnum(['Verbal','Escrita','Suspensao','JustaCausa','OSS']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataOcorrencia: date({ mode: 'string' }).notNull(),
	motivo: text().notNull(),
	descricao: text(),
	testemunhas: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	numeroSequencial: int().default(1),
	diasSupensao: int(),
	sequencia: int().default(1),
	aplicadoPor: varchar({ length: 255 }),
	diasSuspensao: int(),
	origemModulo: varchar({ length: 50 }),
	origemId: int(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});


// ============================================================
// MÓDULO TERCEIROS - Empresas Terceirizadas e Subcontratadas
// ============================================================

export const empresasTerceiras = mysqlTable("empresas_terceiras", {
  id: int().primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
  nomeFantasia: varchar("nome_fantasia", { length: 255 }),
  cnpj: varchar({ length: 20 }).notNull(),
  inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
  inscricaoMunicipal: varchar("inscricao_municipal", { length: 30 }),
  // Endereço
  cep: varchar({ length: 10 }),
  logradouro: varchar({ length: 255 }),
  numero: varchar({ length: 20 }),
  complemento: varchar({ length: 100 }),
  bairro: varchar({ length: 100 }),
  cidade: varchar({ length: 100 }),
  estado: varchar({ length: 2 }),
  // Contato
  telefone: varchar({ length: 30 }),
  celular: varchar({ length: 30 }),
  email: varchar({ length: 255 }),
  emailFinanceiro: varchar("email_financeiro", { length: 255 }),
  responsavelNome: varchar("responsavel_nome", { length: 255 }),
  responsavelCargo: varchar("responsavel_cargo", { length: 100 }),
  // Tipo de serviço
  tipoServico: varchar("tipo_servico", { length: 255 }),
  descricaoServico: text("descricao_servico"),
  // Documentos da empresa
  pgrUrl: varchar("pgr_url", { length: 500 }),
  pgrValidade: timestamp("pgr_validade", { mode: "string" }),
  pcmsoUrl: varchar("pcmso_url", { length: 500 }),
  pcmsoValidade: timestamp("pcmso_validade", { mode: "string" }),
  contratoSocialUrl: varchar("contrato_social_url", { length: 500 }),
  alvaraUrl: varchar("alvara_url", { length: 500 }),
  alvaraValidade: timestamp("alvara_validade", { mode: "string" }),
  seguroVidaUrl: varchar("seguro_vida_url", { length: 500 }),
  seguroVidaValidade: timestamp("seguro_vida_validade", { mode: "string" }),
  // Dados bancários
  banco: varchar({ length: 100 }),
  agencia: varchar({ length: 20 }),
  conta: varchar({ length: 30 }),
  tipoConta: mysqlEnum("tipo_conta", ["corrente", "poupanca"]),
  titularConta: varchar("titular_conta", { length: 255 }),
  cpfCnpjTitular: varchar("cpf_cnpj_titular", { length: 20 }),
  // Forma de pagamento
  formaPagamento: mysqlEnum("forma_pagamento", ["pix", "boleto", "transferencia", "deposito"]),
  pixChave: varchar("pix_chave", { length: 255 }),
  pixTipoChave: mysqlEnum("pix_tipo_chave", ["cpf", "cnpj", "email", "telefone", "aleatoria"]),
  // Status
  status: mysqlEnum("status_terceira", ["ativa", "suspensa", "inativa"]).default("ativa").notNull(),
  observacoes: text(),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const funcionariosTerceiros = mysqlTable("funcionarios_terceiros", {
  id: int().primaryKey().autoincrement(),
  empresaTerceiraId: int("empresa_terceira_id").notNull(),
  companyId: int("company_id").notNull(),
  // Dados pessoais
  nome: varchar({ length: 255 }).notNull(),
  cpf: varchar({ length: 14 }),
  rg: varchar({ length: 20 }),
  dataNascimento: timestamp("data_nascimento", { mode: "string" }),
  fotoUrl: varchar("foto_url", { length: 500 }),
  funcao: varchar({ length: 100 }),
  telefone: varchar({ length: 30 }),
  email: varchar({ length: 255 }),
  // Documentos
  asoUrl: varchar("aso_url", { length: 500 }),
  asoValidade: timestamp("aso_validade", { mode: "string" }),
  treinamentoNrUrl: varchar("treinamento_nr_url", { length: 500 }),
  treinamentoNrValidade: timestamp("treinamento_nr_validade", { mode: "string" }),
  certificadosUrl: varchar("certificados_url", { length: 500 }),
  // Alocação
  obraId: int("obra_id"),
  obraNome: varchar("obra_nome", { length: 255 }),
  // Status de aptidão
  statusAptidao: mysqlEnum("status_aptidao_terceiro", ["apto", "inapto", "pendente"]).default("pendente").notNull(),
  motivoInapto: text("motivo_inapto"),
  // Portal - dados extras
  nomeCompleto: varchar("nome_completo", { length: 255 }),
  dataAdmissao: timestamp("data_admissao", { mode: "string" }),
  asoDocUrl: varchar("aso_doc_url", { length: 500 }),
  nr35Validade: timestamp("nr35_validade", { mode: "string" }),
  nr35DocUrl: varchar("nr35_doc_url", { length: 500 }),
  nr10Validade: timestamp("nr10_validade", { mode: "string" }),
  nr10DocUrl: varchar("nr10_doc_url", { length: 500 }),
  nr33Validade: timestamp("nr33_validade", { mode: "string" }),
  nr33DocUrl: varchar("nr33_doc_url", { length: 500 }),
  integracaoDocUrl: varchar("integracao_doc_url", { length: 500 }),
  // Aprovação
  observacaoAprovacao: text("observacao_aprovacao"),
  aprovadoPor: varchar("aprovado_por", { length: 255 }),
  dataAprovacao: timestamp("data_aprovacao", { mode: "string" }),
  cadastradoPor: varchar("cadastrado_por", { length: 50 }).default("rh"),
  // Controle
  status: mysqlEnum("status_func_terceiro", ["ativo", "inativo", "afastado"]).default("ativo").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const obrigacoesMensaisTerceiros = mysqlTable("obrigacoes_mensais_terceiros", {
  id: int().primaryKey().autoincrement(),
  empresaTerceiraId: int("empresa_terceira_id").notNull(),
  companyId: int("company_id").notNull(),
  competencia: varchar({ length: 7 }).notNull(), // YYYY-MM
  // Documentos mensais
  fgtsUrl: varchar("fgts_url", { length: 500 }),
  fgtsStatus: mysqlEnum("fgts_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  inssUrl: varchar("inss_url", { length: 500 }),
  inssStatus: mysqlEnum("inss_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  folhaPagamentoUrl: varchar("folha_pagamento_url", { length: 500 }),
  folhaPagamentoStatus: mysqlEnum("folha_pagamento_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  comprovantePagamentoUrl: varchar("comprovante_pagamento_url", { length: 500 }),
  comprovantePagamentoStatus: mysqlEnum("comprovante_pagamento_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  gpsUrl: varchar("gps_url", { length: 500 }),
  gpsStatus: mysqlEnum("gps_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  cndUrl: varchar("cnd_url", { length: 500 }),
  cndStatus: mysqlEnum("cnd_status", ["pendente", "enviado", "aprovado", "rejeitado"]).default("pendente").notNull(),
  // Status geral
  statusGeral: mysqlEnum("status_geral_obrigacao", ["pendente", "parcial", "completo", "atrasado"]).default("pendente").notNull(),
  observacoes: text(),
  validadoPor: varchar("validado_por", { length: 255 }),
  validadoEm: timestamp("validado_em", { mode: "string" }),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const alertasTerceiros = mysqlTable("alertas_terceiros", {
  id: int().primaryKey().autoincrement(),
  empresaTerceiraId: int("empresa_terceira_id").notNull(),
  companyId: int("company_id").notNull(),
  tipo: mysqlEnum("tipo_alerta", ["documento_vencendo", "obrigacao_pendente", "documento_vencido", "obrigacao_atrasada"]).notNull(),
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  dataVencimento: timestamp("data_vencimento", { mode: "string" }),
  emailEnviado: tinyint("email_enviado").default(0),
  emailEnviadoEm: timestamp("email_enviado_em", { mode: "string" }),
  resolvido: tinyint().default(0),
  resolvidoEm: timestamp("resolvido_em", { mode: "string" }),
  resolvidoPor: varchar("resolvido_por", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

// ============================================================
// MÓDULO PARCEIROS - Portal de Parceiros Conveniados
// ============================================================

export const parceirosConveniados = mysqlTable("parceiros_conveniados", {
  id: int().primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  // Dados da empresa
  razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
  nomeFantasia: varchar("nome_fantasia", { length: 255 }),
  cnpj: varchar({ length: 20 }).notNull(),
  inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
  inscricaoMunicipal: varchar("inscricao_municipal", { length: 30 }),
  // Endereço
  cep: varchar({ length: 10 }),
  logradouro: varchar({ length: 255 }),
  numero: varchar({ length: 20 }),
  complemento: varchar({ length: 100 }),
  bairro: varchar({ length: 100 }),
  cidade: varchar({ length: 100 }),
  estado: varchar({ length: 2 }),
  // Contato
  telefone: varchar({ length: 30 }),
  celular: varchar({ length: 30 }),
  emailPrincipal: varchar("email_principal", { length: 255 }),
  emailFinanceiro: varchar("email_financeiro", { length: 255 }),
  responsavelNome: varchar("responsavel_nome", { length: 255 }),
  responsavelCargo: varchar("responsavel_cargo", { length: 100 }),
  // Tipo de convênio
  tipoConvenio: mysqlEnum("tipo_convenio", ["farmacia", "posto_combustivel", "restaurante", "mercado", "outros"]).notNull(),
  tipoConvenioOutro: varchar("tipo_convenio_outro", { length: 100 }),
  // Dados bancários
  banco: varchar("banco_parceiro", { length: 100 }),
  agencia: varchar("agencia_parceiro", { length: 20 }),
  conta: varchar("conta_parceiro", { length: 30 }),
  tipoConta: mysqlEnum("tipo_conta_parceiro", ["corrente", "poupanca"]),
  titularConta: varchar("titular_conta_parceiro", { length: 255 }),
  cpfCnpjTitular: varchar("cpf_cnpj_titular_parceiro", { length: 20 }),
  // Forma de pagamento
  formaPagamento: mysqlEnum("forma_pagamento_parceiro", ["pix", "boleto", "transferencia", "deposito"]),
  pixChave: varchar("pix_chave_parceiro", { length: 255 }),
  pixTipoChave: mysqlEnum("pix_tipo_chave_parceiro", ["cpf", "cnpj", "email", "telefone", "aleatoria"]),
  // Condições do convênio
  diaFechamento: int("dia_fechamento"),
  prazoPagamento: int("prazo_pagamento"),
  limiteMensalPorColaborador: decimal("limite_mensal_por_colaborador", { precision: 10, scale: 2 }),
  // Documentos
  contratoConvenioUrl: varchar("contrato_convenio_url", { length: 500 }),
  contratoSocialUrl: varchar("contrato_social_url_parceiro", { length: 500 }),
  alvaraUrl: varchar("alvara_url_parceiro", { length: 500 }),
  // Status
  status: mysqlEnum("status_parceiro", ["ativo", "suspenso", "inativo"]).default("ativo").notNull(),
  observacoes: text("observacoes_parceiro"),
  // Acesso externo
  loginEmail: varchar("login_email", { length: 255 }),
  loginSenhaHash: varchar("login_senha_hash", { length: 255 }),
  acessoExternoAtivo: tinyint("acesso_externo_ativo").default(0),
  // Controle
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const lancamentosParceiros = mysqlTable("lancamentos_parceiros", {
  id: int().primaryKey().autoincrement(),
  parceiroId: int("parceiro_id").notNull(),
  companyId: int("company_id").notNull(),
  employeeId: int("employee_id").notNull(),
  employeeNome: varchar("employee_nome", { length: 255 }).notNull(),
  // Dados do lançamento
  dataCompra: timestamp("data_compra", { mode: "string" }).notNull(),
  descricaoItens: text("descricao_itens"),
  valor: decimal({ precision: 10, scale: 2 }).notNull(),
  comprovanteUrl: varchar("comprovante_url", { length: 500 }),
  // Status
  status: mysqlEnum("status_lancamento_parceiro", ["pendente", "aprovado", "rejeitado"]).default("pendente").notNull(),
  motivoRejeicao: text("motivo_rejeicao"),
  comentarioAdmin: text("comentario_admin"),
  aprovadoPor: varchar("aprovado_por", { length: 255 }),
  aprovadoEm: timestamp("aprovado_em", { mode: "string" }),
  // Competência para desconto
  competenciaDesconto: varchar("competencia_desconto", { length: 7 }), // YYYY-MM
  // Controle
  lancadoPor: varchar("lancado_por", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const pagamentosParceiros = mysqlTable("pagamentos_parceiros", {
  id: int().primaryKey().autoincrement(),
  parceiroId: int("parceiro_id").notNull(),
  companyId: int("company_id").notNull(),
  competencia: varchar("competencia_pagamento", { length: 7 }).notNull(), // YYYY-MM
  valorTotal: decimal("valor_total", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status_pagamento_parceiro", ["pendente", "pago", "cancelado"]).default("pendente").notNull(),
  dataPagamento: timestamp("data_pagamento", { mode: "string" }),
  comprovanteUrl: varchar("comprovante_pagamento_url", { length: 500 }),
  observacoes: text("observacoes_pagamento"),
  pagoBy: varchar("pago_by", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});


// ========== CONFIGURAÇÃO DE MÓDULOS POR EMPRESA ==========
export const moduleConfig = mysqlTable("module_config", {
  id: int().primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  moduleKey: varchar("module_key", { length: 50 }).notNull(), // rh, sst, juridico, avaliacao, terceiros, parceiros
  enabled: tinyint("enabled").default(1).notNull(), // 1 = habilitado, 0 = desabilitado
  enabledAt: timestamp("enabled_at", { mode: "string" }).defaultNow(),
  disabledAt: timestamp("disabled_at", { mode: "string" }),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("mc_company_module").on(table.companyId, table.moduleKey),
]);


// ========== PORTAL EXTERNO - CREDENCIAIS ==========
export const portalCredentials = mysqlTable("portal_credentials", {
  id: int().primaryKey().autoincrement(),
  tipo: mysqlEnum(["terceiro", "parceiro"]).notNull(),
  empresaTerceiraId: int("empresa_terceira_id"),
  parceiroId: int("parceiro_id"),
  companyId: int("company_id").notNull(),
  cnpj: varchar({ length: 20 }).notNull(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  nomeEmpresa: varchar("nome_empresa", { length: 255 }),
  emailResponsavel: varchar("email_responsavel", { length: 255 }),
  nomeResponsavel: varchar("nome_responsavel", { length: 255 }),
  primeiroAcesso: tinyint("primeiro_acesso").default(1).notNull(),
  ativo: tinyint().default(1).notNull(),
  ultimoLogin: timestamp("ultimo_login", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("pc_cnpj").on(table.cnpj),
  index("pc_tipo_empresa").on(table.tipo, table.empresaTerceiraId),
  index("pc_tipo_parceiro").on(table.tipo, table.parceiroId),
]);
