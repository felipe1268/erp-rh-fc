import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, date, varchar, mysqlEnum, text, timestamp, index, tinyint, boolean, json, decimal } from "drizzle-orm/mysql-core"
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const asos = mysqlTable("asos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	dataExame: date({ mode: 'string' }).notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	dataEmissao: date({ mode: 'string' }).notNull(),
	diasAfastamento: int().default(0),
	dataRetorno: date({ mode: 'string' }),
	cid: varchar({ length: 20 }),
	medico: varchar({ length: 255 }),
	crm: varchar({ length: 20 }),
	descricao: text(),
	motivo: varchar({ length: 100 }),
	motivoOutro: text(),
	documentoUrl: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	inscricaoEstadual: varchar({ length: 30 }),
	inscricaoMunicipal: varchar({ length: 30 }),
	logoUrl: text(),
	prefixoCodigo: varchar({ length: 10 }).default('EMP'),
	nextCodigoInterno: int().default(1).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("companies_cnpj_unique").on(table.cnpj),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const dixiDevices = mysqlTable("dixi_devices", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	serialNumber: varchar({ length: 50 }).notNull(),
	obraName: varchar({ length: 255 }).notNull(),
	location: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
		obraId: int(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

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
	tipoContrato: mysqlEnum(['CLT','PJ','Temporario','Estagio','Aprendiz','Horista']),
	jornadaTrabalho: varchar({ length: 50 }),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	listaNegra: tinyint().default(0).notNull(),
	motivoListaNegra: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	dataListaNegra: date({ mode: 'string' }),
	listaNegraPor: varchar({ length: 255 }), // Nome do usuário que colocou na lista negra
	listaNegraUserId: int(), // ID do usuário que colocou na lista negra
	desligadoPor: varchar({ length: 255 }), // Nome do usuário que desligou
	desligadoUserId: int(), // ID do usuário que desligou
	dataDesligamentoEfetiva: date({ mode: 'string' }), // Data efetiva do desligamento
	motivoDesligamento: text(), // Motivo do desligamento (descrição detalhada)
	categoriaDesligamento: varchar({ length: 50 }), // Categoria: Término de contrato, Justa causa, Pedido de demissão, Acordo mútuo, Fim de obra, Baixo desempenho, Indisciplina, Outros
	obraAtualId: int(),
	codigoContabil: varchar({ length: 20 }),
	codigoInterno: varchar({ length: 10 }),
	// Complemento salarial (pagamento por fora)
	recebeComplemento: tinyint().default(0).notNull(),
	valorComplemento: varchar({ length: 20 }),
	descricaoComplemento: varchar({ length: 255 }),
	// Acordo individual de horas extras
	acordoHoraExtra: tinyint().default(0).notNull(),
	heNormal50: varchar({ length: 10 }).default('50'),
	heNoturna: varchar({ length: 10 }).default('20'),
	he100: varchar({ length: 10 }).default('100'),
	heFeriado: varchar({ length: 10 }).default('100'),
	heInterjornada: varchar({ length: 10 }).default('50'),
	obsAcordoHe: text(),
	contaBancariaEmpresaId: int(), // FK para company_bank_accounts - qual conta da empresa paga este funcionário
	// Contrato de Experiência CLT
	experienciaTipo: mysqlEnum(['30_30','45_45']), // 30+30=60 dias ou 45+45=90 dias
	experienciaInicio: date({ mode: 'string' }), // Data início da experiência (geralmente = dataAdmissao)
	experienciaFim1: date({ mode: 'string' }), // Fim do 1º período (calculado automaticamente)
	experienciaFim2: date({ mode: 'string' }), // Fim do 2º período / efetivação (calculado automaticamente)
	experienciaStatus: mysqlEnum(['em_experiencia','prorrogado','efetivado','desligado_experiencia']).default('em_experiencia'),
	experienciaProrrogadoEm: date({ mode: 'string' }), // Data em que foi prorrogado
	experienciaProrrogadoPor: varchar({ length: 255 }), // Quem prorrogou
	experienciaEfetivadoEm: date({ mode: 'string' }), // Data em que foi efetivado
	experienciaEfetivadoPor: varchar({ length: 255 }), // Quem efetivou
	experienciaObs: text(), // Observações sobre a experiência
	// Vale Transporte (gestão completa)
	vtRecebe: varchar({ length: 20 }), // sim, nao
	vtTipo: mysqlEnum(['nenhum','onibus','van','misto']),
	vtValorDiario: varchar({ length: 20 }), // Valor diário do VT
	vtOperadora: varchar({ length: 100 }), // Operadora/empresa de transporte
	vtNumeroCartao: varchar({ length: 50 }), // Número do cartão VT
	vtLinhas: varchar({ length: 255 }), // Linhas utilizadas
	vtDescontoFolha: varchar({ length: 20 }), // Valor descontado na folha (6% salário ou fixo)
	// Vale Alimentação / Refeição
	vaRecebe: varchar({ length: 20 }), // va, vr, ambos, nao
	vaValor: varchar({ length: 20 }), // Valor mensal VA/VR
	vaOperadora: varchar({ length: 100 }), // Operadora (Alelo, Sodexo, VR, etc.)
	vaNumeroCartao: varchar({ length: 50 }), // Número do cartão VA/VR
	// Outros Benefícios
	auxFarmacia: varchar({ length: 20 }), // sim, nao
	auxFarmaciaValor: varchar({ length: 20 }), // Valor do auxílio farmácia
	planoSaude: varchar({ length: 20 }), // sim, nao
	planoSaudeOperadora: varchar({ length: 100 }), // Operadora do plano
	planoSaudeValor: varchar({ length: 20 }), // Valor do plano
	benefObs: text(), // Observações de benefícios
	// Pensão Alimentícia
	pensaoAlimenticia: tinyint().default(0),
	pensaoValor: varchar({ length: 20 }), // Valor fixo ou percentual
	pensaoTipo: mysqlEnum(['percentual','valor_fixo']),
	pensaoPercentual: varchar({ length: 10 }), // Ex: "30" para 30%
	pensaoBeneficiario: varchar({ length: 255 }),
	pensaoBanco: varchar({ length: 100 }),
	pensaoAgencia: varchar({ length: 20 }),
	pensaoConta: varchar({ length: 30 }),
	pensaoObservacoes: text(),
	// Licença Maternidade/Paternidade
	licencaMaternidade: tinyint().default(0),
	licencaTipo: mysqlEnum(['maternidade_120','maternidade_180','paternidade_5','paternidade_20']),
	licencaDataInicio: date({ mode: 'string' }),
	licencaDataFim: date({ mode: 'string' }),
	licencaObservacoes: text(),
	// Campos rateáveis por obra
	seguroVida: varchar({ length: 20 }), // Valor do seguro de vida
	contribuicaoSindical: varchar({ length: 20 }), // Valor contribuição assistencial/sindical
	fgtsPercentual: varchar({ length: 10 }).default('8'), // Percentual FGTS (padrão 8%)
	inssPercentual: varchar({ length: 10 }), // Faixa INSS
	dissidioData: date({ mode: 'string' }), // Data do último dissídio
	dissidioPercentual: varchar({ length: 10 }), // Percentual do dissídio
	convencaoColetiva: varchar({ length: 255 }), // Nome/número da CCT
	convencaoVigencia: date({ mode: 'string' }), // Vigência da CCT
	ddsParticipacao: tinyint().default(1), // Participa do DDS (Diálogo Diário de Segurança)
	// Upload de documentos pessoais (URLs S3)
	docRgUrl: text(),
	docCnhUrl: text(),
	docCtpsUrl: text(),
	docComprovanteResidenciaUrl: text(),
	docCertidaoNascimentoUrl: text(),
	docTituloEleitorUrl: text(),
	docReservistaUrl: text(),
	docOutrosUrl: text(), // JSON array com {nome, url}
	// Soft Delete
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	deleteReason: text(),
});

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
	motivoTroca: varchar("motivo_troca", { length: 50 }),
	valorCobrado: decimal("valor_cobrado", { precision: 10, scale: 2 }),
	fichaUrl: text("ficha_url"),
	fotoEstadoUrl: text("foto_estado_url"),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
export const epis = mysqlTable("epis", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 1000 }).notNull(),
	ca: varchar({ length: 20 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	validadeCa: date({ mode: 'string' }),
	fabricante: varchar({ length: 255 }),
	fornecedor: varchar({ length: 255 }),
	fornecedorCnpj: varchar("fornecedor_cnpj", { length: 20 }),
	fornecedorContato: varchar("fornecedor_contato", { length: 255 }),
	fornecedorTelefone: varchar("fornecedor_telefone", { length: 30 }),
	fornecedorEmail: varchar("fornecedor_email", { length: 255 }),
	fornecedorEndereco: varchar("fornecedor_endereco", { length: 500 }),
	categoria: mysqlEnum('categoria', ['EPI','Uniforme','Calcado']).default('EPI').notNull(),
	tamanho: varchar({ length: 20 }), // P, M, G, GG, XGG, XXGG ou 34-48 para calçados
	quantidadeEstoque: int().default(0),
	valorProduto: decimal("valor_produto", { precision: 10, scale: 2 }),
	tempoMinimoTroca: int("tempo_minimo_troca"),
	corCapacete: varchar("cor_capacete", { length: 30 }),
	condicao: mysqlEnum('condicao', ['Novo','Reutilizado']).default('Novo').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const jobFunctions = mysqlTable("job_functions", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 100 }).notNull(),
	descricao: text(),
	ordemServico: text(),
	cbo: varchar({ length: 10 }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	numOrcamento: varchar({ length: 50 }),
	snRelogioPonto: varchar({ length: 50 }),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const risks = mysqlTable("risks", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	setor: varchar({ length: 100 }).notNull(),
	agenteRisco: varchar({ length: 255 }).notNull(),
	tipoRisco: mysqlEnum(['Fisico','Quimico','Biologico','Ergonomico','Acidente']).notNull(),
	fonteGeradora: varchar({ length: 255 }),
	grauRisco: mysqlEnum(['Baixo','Medio','Alto','Critico']).notNull(),
	medidasControle: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const sectors = mysqlTable("sectors", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 100 }).notNull(),
	descricao: varchar({ length: 255 }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
export const timeRecords = mysqlTable("time_records", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int(),
	mesReferencia: varchar({ length: 7 }),
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
	fonte: varchar({ length: 50 }).default('dixi'),
	ajusteManual: tinyint().default(0),
	ajustadoPor: varchar({ length: 255 }),
	batidasBrutas: json(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("time_records_emp_date").on(table.employeeId, table.data),
	index("time_records_company_mes").on(table.companyId, table.mesReferencia),
]);

export const timeInconsistencies = mysqlTable("time_inconsistencies", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int(),
	timeRecordId: int(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	data: date({ mode: 'string' }).notNull(),
	tipoInconsistencia: mysqlEnum(['batida_impar','falta_batida','horario_divergente','batida_duplicada','sem_registro']).notNull(),
	descricao: text(),
	status: mysqlEnum(['pendente','justificado','ajustado','advertencia']).default('pendente').notNull(),
	justificativa: text(),
	resolvidoPor: varchar({ length: 255 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	resolvidoEm: date({ mode: 'string' }),
	warningId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("time_incons_emp_mes").on(table.employeeId, table.mesReferencia),
]);

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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
export const userProfiles = mysqlTable("user_profiles", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	companyId: int().notNull(),
	profileType: mysqlEnum(['adm_master','adm','operacional','avaliador','consulta']).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin','admin_master']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).defaultNow().notNull(),
	username: varchar({ length: 100 }),
	password: varchar({ length: 255 }),
	mustChangePassword: tinyint().default(1),
	avatarUrl: text(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
	modulesAccess: text().$type<string>(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const warnings = mysqlTable("warnings", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipoAdvertencia: mysqlEnum(['Verbal','Escrita','Suspensao','JustaCausa','OSS']).notNull(),
	sequencia: int().default(1),
	dataOcorrencia: date({ mode: 'string' }).notNull(),
	motivo: text().notNull(),
	descricao: text(),
	testemunhas: text(),
	aplicadoPor: varchar({ length: 255 }),
	diasSuspensao: int(),
	documentoUrl: text(),
	origemModulo: varchar({ length: 50 }),
		origemId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
// ============================================================
// FOLHA DE PAGAMENTO - LANÇAMENTOS IMPORTADOS DA CONTABILIDADE
// ============================================================
export const folhaLancamentos = mysqlTable("folha_lancamentos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	tipoLancamento: mysqlEnum(['vale','pagamento','decimo_terceiro_1','decimo_terceiro_2']).notNull(),
	status: mysqlEnum(['importado','validado','consolidado']).default('importado').notNull(),
	// Arquivos importados
	analiticoUploadId: int(),
	sinteticoUploadId: int(),

	// Totais gerais
	totalFuncionarios: int().default(0),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	totalLiquido: varchar({ length: 20 }),
	// Divergências
	totalDivergencias: int().default(0),
	divergenciasResolvidas: int().default(0),
	// Metadados
	importadoPor: varchar({ length: 255 }),
	importadoEm: timestamp({ mode: 'string' }),
	validadoPor: varchar({ length: 255 }),
	validadoEm: timestamp({ mode: 'string' }),
	consolidadoPor: varchar({ length: 255 }),
	consolidadoEm: timestamp({ mode: 'string' }),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("folha_lanc_company_mes").on(table.companyId, table.mesReferencia),
]);

// Itens individuais por funcionário em cada lançamento
export const folhaItens = mysqlTable("folha_itens", {
	id: int().autoincrement().notNull(),
	folhaLancamentoId: int().notNull(),
	companyId: int().notNull(),
	employeeId: int(),
	// Dados do PDF (para match)
	codigoContabil: varchar({ length: 20 }),
	nomeColaborador: varchar({ length: 255 }).notNull(),
	// Dados de admissão/função do PDF
	dataAdmissao: date({ mode: 'string' }),
	salarioBase: varchar({ length: 20 }),
	horasMensais: varchar({ length: 10 }),
	funcao: varchar({ length: 100 }),
	sf: int().default(0),
	ir: int().default(0),
	// Proventos e descontos (JSON array)
	proventos: json(),
	descontos: json(),
	totalProventos: varchar({ length: 20 }),
	totalDescontos: varchar({ length: 20 }),
	// Bases e impostos
	baseInss: varchar({ length: 20 }),
	valorInss: varchar({ length: 20 }),
	baseFgts: varchar({ length: 20 }),
	valorFgts: varchar({ length: 20 }),
	baseIrrf: varchar({ length: 20 }),
	valorIrrf: varchar({ length: 20 }),
	// Líquido
	liquido: varchar({ length: 20 }),

	// Situações especiais
	situacaoEspecial: text(),
	// Validação cruzada
	matchStatus: mysqlEnum(['matched','unmatched','divergente']).default('unmatched').notNull(),
	divergencias: json(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("folha_itens_lanc").on(table.folhaLancamentoId),
	index("folha_itens_emp").on(table.employeeId),
]);

// ============================================================
// INFERRED TYPES
// ============================================================
// CONSOLIDAÇÃO MENSAL DE PONTO
// ============================================================
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ponto_consolidacao_company_mes").on(table.companyId, table.mesReferencia),
]);

// ============================================================
// Tabela de SNs (relógios de ponto) vinculados a obras
// Um SN só pode estar ativo em uma obra por vez
// Quando a obra muda para Concluída/Paralisada/Cancelada, os SNs são liberados
export const obraSns = mysqlTable("obra_sns", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	sn: varchar({ length: 50 }).notNull(),
	apelido: varchar({ length: 100 }),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	dataVinculo: date({ mode: 'string' }),
	dataLiberacao: date({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("obra_sn_company").on(table.companyId),
	index("obra_sn_obra").on(table.obraId),
	index("obra_sn_sn").on(table.sn),
]);
// ============================================================
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type InsertCompany = typeof companies.$inferInsert;
export type InsertEmployee = typeof employees.$inferInsert;
export type InsertEmployeeHistory = typeof employeeHistory.$inferInsert;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
// ============================================================
// Modelos de Documentos (Advertência, Suspensão, etc.) - Editáveis pelo Admin Master
// ============================================================
export const documentTemplates = mysqlTable("document_templates", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['advertencia_verbal','advertencia_escrita','suspensao','justa_causa','contrato_pj','outros']).notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	conteudo: text().notNull(),
	ativo: tinyint().default(1).notNull(),
	criadoPor: varchar({ length: 255 }),
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("doc_templates_company_tipo").on(table.companyId, table.tipo),
]);

export type InsertPermission = typeof permissions.$inferInsert;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type InsertObra = typeof obras.$inferInsert;
export type InsertSector = typeof sectors.$inferInsert;
export type InsertJobFunction = typeof jobFunctions.$inferInsert;


// ============================================================
// CRITÉRIOS DO SISTEMA (configurações globais por empresa)
// ============================================================
export const systemCriteria = mysqlTable("system_criteria", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	categoria: varchar({ length: 50 }).notNull(), // horas_extras, jornada, folha, advertencias, beneficios, ponto
	chave: varchar({ length: 100 }).notNull(),
	valor: varchar({ length: 255 }).notNull(),
	descricao: varchar({ length: 500 }),
	valorPadraoClt: varchar({ length: 255 }), // valor padrão CLT para referência
	unidade: varchar({ length: 50 }), // %, min, horas, dias, R$
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("sys_criteria_company_cat").on(table.companyId, table.categoria),
	index("sys_criteria_company_key").on(table.companyId, table.chave),
]);


// Vinculação manual de funcionário a obra (quando não há registro de ponto)
export const manualObraAssignments = mysqlTable("manual_obra_assignments", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	obraId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(), // "2026-01"
	justificativa: text().notNull(),
	percentual: int().default(100).notNull(), // percentual de alocação (0-100)
	atribuidoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("moa_company_mes").on(table.companyId, table.mesReferencia),
	index("moa_employee_mes").on(table.employeeId, table.mesReferencia),
]);


// Contas Bancárias da Empresa (para débito de pagamentos)
export const companyBankAccounts = mysqlTable("company_bank_accounts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	banco: varchar({ length: 100 }).notNull(), // Ex: "Caixa Econômica Federal", "Santander"
	codigoBanco: varchar({ length: 10 }), // Ex: "104", "033"
	agencia: varchar({ length: 20 }).notNull(),
	conta: varchar({ length: 30 }).notNull(),
	tipoConta: mysqlEnum(['corrente', 'poupanca']).default('corrente').notNull(),
	apelido: varchar({ length: 100 }), // Ex: "CEF Principal", "Santander Folha"
	cnpjTitular: varchar({ length: 20 }),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("cba_company").on(table.companyId),
]);


// ============================================================
// PROCESSOS TRABALHISTAS
// ============================================================
export const processosTrabalhistas = mysqlTable("processos_trabalhistas", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(), // FK para employees (funcionário desligado)
	// Dados do processo
	numeroProcesso: varchar({ length: 50 }).notNull(), // Número do processo judicial
	vara: varchar({ length: 100 }), // Vara do Trabalho
	comarca: varchar({ length: 100 }), // Cidade/Comarca
	tribunal: varchar({ length: 100 }), // Ex: TRT-2, TRT-15
	justica: mysqlEnum(['trabalho','federal','estadual','outros']).default('trabalho').notNull(), // JT, JF, JE
	tipoAcao: mysqlEnum(['reclamatoria', 'indenizatoria', 'rescisao_indireta', 'acidente_trabalho', 'doenca_ocupacional', 'assedio', 'execucao_fiscal', 'mandado_seguranca', 'acao_civil_publica', 'outros']).default('reclamatoria').notNull(),
	// Partes
	reclamante: varchar({ length: 255 }).notNull(), // Nome do reclamante (funcionário)
	advogadoReclamante: varchar({ length: 255 }),
	advogadoEmpresa: varchar({ length: 255 }),
	// Valores
	valorCausa: varchar({ length: 20 }), // Valor da causa
	valorCondenacao: varchar({ length: 20 }), // Valor da condenação (se houver)
	valorAcordo: varchar({ length: 20 }), // Valor do acordo (se houver)
	valorPago: varchar({ length: 20 }), // Valor efetivamente pago
	// Datas
	dataDistribuicao: date({ mode: 'string' }), // Data da distribuição do processo
	dataDesligamento: date({ mode: 'string' }), // Data do desligamento do funcionário
	dataCitacao: date({ mode: 'string' }), // Data da citação da empresa
	dataAudiencia: date({ mode: 'string' }), // Próxima audiência
	dataEncerramento: date({ mode: 'string' }), // Data de encerramento/trânsito em julgado
	// Status e classificação
	status: mysqlEnum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'acordo', 'sentenca', 'recurso', 'execucao', 'arquivado', 'encerrado']).default('em_andamento').notNull(),
	fase: mysqlEnum(['conhecimento', 'recursal', 'execucao', 'encerrado']).default('conhecimento').notNull(),
	risco: mysqlEnum(['baixo', 'medio', 'alto', 'critico']).default('medio').notNull(),
	// Pedidos do reclamante (JSON array)
	pedidos: json(), // Ex: ["Horas extras", "Adicional noturno", "Danos morais"]
	// Cliente (corresponsável)
	clienteCnpj: varchar({ length: 20 }),
	clienteRazaoSocial: varchar({ length: 255 }),
	clienteNomeFantasia: varchar({ length: 255 }),
	// Observações
	observacoes: text(),
	// Metadados
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("pt_company").on(table.companyId),
	index("pt_employee").on(table.employeeId),
	index("pt_status").on(table.companyId, table.status),
	index("pt_numero").on(table.numeroProcesso),
]);

// Andamentos do processo trabalhista (timeline)
export const processosAndamentos = mysqlTable("processos_andamentos", {
	id: int().autoincrement().notNull(),
	processoId: int().notNull(), // FK para processos_trabalhistas
	data: date({ mode: 'string' }).notNull(),
	tipo: mysqlEnum(['audiencia', 'despacho', 'sentenca', 'recurso', 'pericia', 'acordo', 'pagamento', 'citacao', 'intimacao', 'peticao', 'outros']).default('outros').notNull(),
	descricao: text().notNull(),
	// Resultado (se aplicável)
	resultado: varchar({ length: 255 }),
	// Documentos vinculados
	documentoUrl: varchar({ length: 500 }),
	documentoNome: varchar({ length: 255 }),
	// Metadados
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("pa_processo").on(table.processoId),
	index("pa_data").on(table.processoId, table.data),
]);


// Configuração personalizada do menu lateral (por usuário)
export const menuConfig = mysqlTable("menu_config", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	// JSON com a configuração completa do menu: seções, itens, ordem
	configJson: text().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("mc_user").on(table.userId),
]);

export const goldenRules = mysqlTable("golden_rules", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 200 }).notNull(),
	descricao: text().notNull(),
	categoria: mysqlEnum(['seguranca', 'qualidade', 'rh', 'operacional', 'juridico', 'financeiro', 'geral']).default('geral').notNull(),
	prioridade: mysqlEnum(['critica', 'alta', 'media', 'baixa']).default('alta').notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
});
export type InsertGoldenRule = typeof goldenRules.$inferInsert;
export type SelectGoldenRule = typeof goldenRules.$inferSelect;


// ============================================================
// SEGURO DE VIDA - CONFIGURAÇÃO DE ALERTAS AUTOMÁTICOS
// Dispara alertas para Corretor, Usuário e Diretoria
// em cada movimentação: Admissão, Afastamento, Reclusão, Desligamento
// ============================================================
export const insuranceAlertConfig = mysqlTable("insurance_alert_config", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	isActive: tinyint().default(1).notNull(), // Liga/desliga o sistema de alertas
	// Textos padrão para cada tipo de movimentação (editáveis pelo admin)
	textoAdmissao: text(), // Texto do alerta para admissão
	textoAfastamento: text(), // Texto do alerta para afastamento
	textoReclusao: text(), // Texto do alerta para reclusão
	textoDesligamento: text(), // Texto do alerta para desligamento
	// Dados da seguradora/corretor
	seguradora: varchar({ length: 255 }), // Nome da seguradora
	apolice: varchar({ length: 100 }), // Número da apólice
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	atualizadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("iac_company").on(table.companyId),
]);

// Destinatários dos alertas de seguro de vida
export const insuranceAlertRecipients = mysqlTable("insurance_alert_recipients", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	configId: int().notNull(), // FK para insurance_alert_config
	tipoDestinatario: mysqlEnum(['corretor', 'diretoria', 'usuario_sistema', 'outro']).notNull(),
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	telefone: varchar({ length: 20 }),
	cargo: varchar({ length: 100 }),
	recebeAdmissao: tinyint().default(1).notNull(),
	recebeAfastamento: tinyint().default(1).notNull(),
	recebeReclusao: tinyint().default(1).notNull(),
	recebeDesligamento: tinyint().default(1).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("iar_company").on(table.companyId),
	index("iar_config").on(table.configId),
]);

// Log de alertas enviados (auditoria completa)
export const insuranceAlertsLog = mysqlTable("insurance_alerts_log", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(), // Funcionário que gerou o alerta
	tipoMovimentacao: mysqlEnum(['admissao', 'afastamento', 'reclusao', 'desligamento']).notNull(),
	statusAnterior: varchar({ length: 50 }), // Status antes da movimentação
	statusNovo: varchar({ length: 50 }), // Status após a movimentação
	textoAlerta: text().notNull(), // Texto completo do alerta enviado
	// Dados do funcionário no momento do alerta (snapshot)
	nomeFuncionario: varchar({ length: 255 }).notNull(),
	cpfFuncionario: varchar({ length: 14 }),
	funcaoFuncionario: varchar({ length: 100 }),
	obraFuncionario: varchar({ length: 255 }),
	// Destinatários que receberam
	destinatarios: json(), // Array de {nome, email, tipo}
	// Quem disparou
	disparadoPor: varchar({ length: 255 }), // Usuário que fez a movimentação
	disparoAutomatico: tinyint().default(1).notNull(), // 1 = automático, 0 = manual
	// Status do envio
	statusEnvio: mysqlEnum(['enviado', 'erro', 'pendente']).default('pendente').notNull(),
	erroMensagem: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ial_company").on(table.companyId),
	index("ial_employee").on(table.employeeId),
	index("ial_tipo").on(table.companyId, table.tipoMovimentacao),
	index("ial_data").on(table.companyId, table.createdAt),
]);


// NOTIFICAÇÕES - DESTINATÁRIOS DE E-MAIL
// ============================================================
export const notificationRecipients = mysqlTable("notification_recipients", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	// Tipos de notificação que este destinatário recebe
	notificarContratacao: boolean().default(true).notNull(),
	notificarDemissao: boolean().default(true).notNull(),
	notificarTransferencia: boolean().default(false).notNull(),
	notificarAfastamento: boolean().default(false).notNull(),
	ativo: boolean().default(true).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("nr_company").on(table.companyId),
	index("nr_email").on(table.email),
]);


// ============================================================
// LOG DE NOTIFICAÇÕES ENVIADAS - RASTREAMENTO COMPLETO
// ============================================================
export const notificationLogs = mysqlTable("notification_logs", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	// Dados do funcionário que gerou a notificação
	employeeId: int(),
	employeeName: varchar({ length: 255 }).notNull(),
	employeeCpf: varchar({ length: 20 }),
	employeeFuncao: varchar({ length: 100 }),
	// Tipo de movimentação
	tipoMovimentacao: mysqlEnum(['contratacao', 'demissao', 'transferencia', 'afastamento']).notNull(),
	statusAnterior: varchar({ length: 50 }),
	statusNovo: varchar({ length: 50 }),
	// Destinatário
	recipientId: int(),
	recipientName: varchar({ length: 255 }).notNull(),
	recipientEmail: varchar({ length: 255 }).notNull(),
	// Conteúdo
	titulo: varchar({ length: 500 }).notNull(),
	corpo: text(),
	// Status do envio
	statusEnvio: mysqlEnum(['enviado', 'erro', 'pendente']).default('pendente').notNull(),
	erroMensagem: text(),
	// Rastreamento de leitura
	trackingId: varchar({ length: 64 }), // UUID único para pixel de rastreamento
	lido: boolean().default(false).notNull(),
	lidoEm: timestamp({ mode: 'string' }),
	// Quem disparou
	disparadoPor: varchar({ length: 255 }),
	disparadoPorId: int(),
	// Timestamps
	enviadoEm: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("nl_company").on(table.companyId),
	index("nl_employee").on(table.employeeId),
	index("nl_tipo").on(table.companyId, table.tipoMovimentacao),
	index("nl_tracking").on(table.trackingId),
	index("nl_data").on(table.companyId, table.enviadoEm),
]);

export const menuLabels = mysqlTable("menu_labels", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	originalLabel: varchar({ length: 255 }).notNull(),
	customLabel: varchar({ length: 255 }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ml_company").on(table.companyId),
]);

// ============================================================
// SOLICITAÇÕES DE REATIVAÇÃO DE LISTA NEGRA
// Requer aprovação de 2 diretores para reativar funcionário da Lista Negra
// ============================================================
export const blacklistReactivationRequests = mysqlTable("blacklist_reactivation_requests", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	employeeName: varchar({ length: 255 }).notNull(),
	employeeCpf: varchar({ length: 14 }),
	// Quem solicitou
	solicitadoPor: varchar({ length: 255 }).notNull(),
	solicitadoPorId: int().notNull(),
	motivoReativacao: text().notNull(), // Justificativa para reativação
	// Status do pedido
	status: mysqlEnum(['pendente', 'aprovado', 'rejeitado', 'cancelado']).default('pendente').notNull(),
	// Aprovação 1
	aprovador1Nome: varchar({ length: 255 }),
	aprovador1Id: int(),
	aprovador1Data: timestamp({ mode: 'string' }),
	aprovador1Parecer: text(),
	// Aprovação 2
	aprovador2Nome: varchar({ length: 255 }),
	aprovador2Id: int(),
	aprovador2Data: timestamp({ mode: 'string' }),
	aprovador2Parecer: text(),
	// Rejeição (qualquer diretor pode rejeitar)
	rejeitadoPor: varchar({ length: 255 }),
	rejeitadoPorId: int(),
	motivoRejeicao: text(),
	// Timestamps
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("brr_company").on(table.companyId),
	index("brr_employee").on(table.employeeId),
	index("brr_status").on(table.companyId, table.status),
]);


// ============================================================
// TEMPLATES DE E-MAIL PERSONALIZÁVEIS
// ============================================================
export const emailTemplates = mysqlTable("email_templates", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	tipo: mysqlEnum(['contratacao', 'demissao', 'transferencia', 'afastamento']).notNull(),
	// Campos editáveis do template
	assunto: varchar({ length: 500 }), // Assunto customizado (null = usar padrão)
	saudacao: text(), // Texto de saudação/introdução (null = usar padrão)
	corpoTexto: text(), // Corpo principal do e-mail (null = usar padrão)
	providencias: text(), // Lista de providências (null = usar padrão)
	rodape: text(), // Texto do rodapé (null = usar padrão)
	// Controle
	ativo: boolean().default(true).notNull(),
	atualizadoPor: varchar({ length: 255 }),
	atualizadoPorId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("et_company").on(table.companyId),
	index("et_company_tipo").on(table.companyId, table.tipo),
]);


// ============================================================
// AVISO PRÉVIO
// ============================================================
export const terminationNotices = mysqlTable("termination_notices", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: mysqlEnum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']).notNull(),
	dataInicio: date({ mode: 'string' }).notNull(),
	dataFim: date({ mode: 'string' }).notNull(),
	diasAviso: int().notNull().default(30), // 30 + 3 por ano (max 90)
	anosServico: int().default(0),
	// Redução de jornada (Art. 488 CLT)
	reducaoJornada: mysqlEnum(['2h_dia','7_dias_corridos','nenhuma']).default('nenhuma'),
	// Previsão financeira
	salarioBase: varchar({ length: 20 }),
	previsaoRescisao: text(), // JSON com breakdown: saldo salário, 13º prop, férias prop, FGTS, multa 40%
	valorEstimadoTotal: varchar({ length: 20 }),
	// Status
	status: mysqlEnum(['em_andamento','concluido','cancelado']).default('em_andamento').notNull(),
	dataConclusao: date({ mode: 'string' }),
	motivoCancelamento: text(),
	// Observações
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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

// ============================================================
// CONTROLE DE FÉRIAS
// ============================================================
export const vacationPeriods = mysqlTable("vacation_periods", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	// Período aquisitivo
	periodoAquisitivoInicio: date({ mode: 'string' }).notNull(),
	periodoAquisitivoFim: date({ mode: 'string' }).notNull(),
	// Período concessivo (12 meses após aquisitivo)
	periodoConcessivoFim: date({ mode: 'string' }).notNull(),
	// Dados das férias
	dataInicio: date({ mode: 'string' }),
	dataFim: date({ mode: 'string' }),
	diasGozo: int().default(30),
	// Fracionamento (até 3 períodos - Reforma Trabalhista)
	fracionamento: int().default(1), // 1, 2 ou 3 períodos
	periodo2Inicio: date({ mode: 'string' }),
	periodo2Fim: date({ mode: 'string' }),
	periodo3Inicio: date({ mode: 'string' }),
	periodo3Fim: date({ mode: 'string' }),
	// Abono pecuniário (1/3 em dinheiro)
	abonoPecuniario: tinyint().default(0),
	// Financeiro
	valorFerias: varchar({ length: 20 }),
	valorTercoConstitucional: varchar({ length: 20 }),
	valorAbono: varchar({ length: 20 }),
	valorTotal: varchar({ length: 20 }),
	dataPagamento: date({ mode: 'string' }),
	// Status
	status: mysqlEnum(['pendente','agendada','em_gozo','concluida','vencida','cancelada']).default('pendente').notNull(),
	vencida: tinyint().default(0), // flag para férias vencidas (não concedidas no prazo)
	pagamentoEmDobro: tinyint().default(0), // se deve pagar em dobro
	// Observações
	observacoes: text(),
	aprovadoPor: varchar({ length: 255 }),
	aprovadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
	deletedByUserId: int(),
},
(table) => [
	index("vp_company").on(table.companyId),
	index("vp_employee").on(table.employeeId),
	index("vp_status").on(table.status),
	index("vp_concessivo").on(table.periodoConcessivoFim),
]);

// ============================================================
// CIPA - Reuniões e Atas (complemento às tabelas existentes cipaElections + cipaMembers)
// ============================================================
export const cipaMeetings = mysqlTable("cipa_meetings", {
	id: int().autoincrement().notNull(),
	mandateId: int().notNull(),
	companyId: int().notNull(),
	// Reunião
	tipo: mysqlEnum(['ordinaria','extraordinaria']).default('ordinaria').notNull(),
	dataReuniao: date({ mode: 'string' }).notNull(),
	horaInicio: varchar({ length: 10 }),
	horaFim: varchar({ length: 10 }),
	local: varchar({ length: 255 }),
	pauta: text(),
	// Ata
	ataTexto: text(),
	ataDocumentoUrl: text(),
	// Presença
	presentesJson: text(), // JSON array com IDs dos membros presentes
	// Status
	status: mysqlEnum(['agendada','realizada','cancelada']).default('agendada').notNull(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("cmt_mandate").on(table.mandateId),
	index("cmt_company").on(table.companyId),
	index("cmt_data").on(table.dataReuniao),
]);

// ============================================================
// CONTRATOS PJ
// ============================================================
export const pjContracts = mysqlTable("pj_contracts", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(), // colaborador PJ
	// Dados do contrato
	numeroContrato: varchar({ length: 50 }),
	cnpjPrestador: varchar({ length: 20 }),
	razaoSocialPrestador: varchar({ length: 255 }),
	objetoContrato: text(),
	// Vigência
	dataInicio: date({ mode: 'string' }).notNull(),
	dataFim: date({ mode: 'string' }).notNull(),
	renovacaoAutomatica: tinyint().default(0),
	// Financeiro
	valorMensal: varchar({ length: 20 }),
	percentualAdiantamento: int().default(40), // 40% no vale
	percentualFechamento: int().default(60), // 60% no fechamento
	diaAdiantamento: int().default(15), // dia do mês para adiantamento
	diaFechamento: int().default(5), // dia do mês para fechamento
	// Documento
	modeloContratoUrl: text(), // URL do modelo/template
	contratoAssinadoUrl: text(), // URL do contrato assinado
	tipoAssinatura: mysqlEnum(['manual','digital','pendente']).default('pendente'),
	// Status
	status: mysqlEnum(['ativo','vencido','renovado','cancelado','pendente_assinatura']).default('pendente_assinatura').notNull(),
	alertaVencimentoEnviado: tinyint().default(0),
	// Histórico
	contratoAnteriorId: int(), // FK para contrato anterior (renovação)
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	criadoPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
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

export const pjPayments = mysqlTable("pj_payments", {
	id: int().autoincrement().notNull(),
	contractId: int().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	// Pagamento
	mesReferencia: varchar({ length: 7 }).notNull(), // "2026-01"
	tipo: mysqlEnum(['adiantamento','fechamento','bonificacao']).notNull(),
	valor: varchar({ length: 20 }).notNull(),
	descricao: text(),
	// Status
	dataPagamento: date({ mode: 'string' }),
	status: mysqlEnum(['pendente','pago','cancelado']).default('pendente').notNull(),
	comprovanteUrl: text(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pjp_contract").on(table.contractId),
	index("pjp_company_mes").on(table.companyId, table.mesReferencia),
	index("pjp_employee").on(table.employeeId),
]);


// ============================================================
// CONTROLE DE REVISÕES DO SISTEMA
// ============================================================
export const systemRevisions = mysqlTable("system_revisions", {
	id: int().autoincrement().notNull(),
	version: int().notNull(), // Número da revisão (ex: 64, 65, 66)
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text().notNull(), // Descrição detalhada das mudanças
	tipo: mysqlEnum(['feature','bugfix','melhoria','seguranca','performance']).notNull(),
	modulos: text(), // Módulos afetados (JSON array)
	criadoPor: varchar({ length: 255 }).notNull(),
	dataPublicacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("sr_version").on(table.version),
]);


// ============================================================
// REGISTROS DIXI NÃO IDENTIFICADOS (pendentes de vinculação)
// ============================================================
export const unmatchedDixiRecords = mysqlTable("unmatched_dixi_records", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	dixiName: varchar({ length: 255 }).notNull(), // Nome original do relógio DIXI
	dixiId: varchar({ length: 50 }), // ID do funcionário no relógio (se disponível)
	data: date({ mode: 'string' }).notNull(),
	entrada1: varchar({ length: 10 }),
	saida1: varchar({ length: 10 }),
	entrada2: varchar({ length: 10 }),
	saida2: varchar({ length: 10 }),
	entrada3: varchar({ length: 10 }),
	saida3: varchar({ length: 10 }),
	batidasBrutas: json(), // Todas as batidas originais
	status: mysqlEnum(['pendente','vinculado','descartado']).default('pendente').notNull(),
	linkedEmployeeId: int(), // Funcionário vinculado pelo usuário
	resolvidoPor: varchar({ length: 255 }),
	resolvidoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("udr_company_mes").on(table.companyId, table.mesReferencia),
	index("udr_status").on(table.status),
	index("udr_dixi_name").on(table.dixiName),
]);


// ============================================================
// MEMÓRIA DE VINCULAÇÃO DIXI (nome relógio ↔ colaborador)
// ============================================================
export const dixiNameMappings = mysqlTable("dixi_name_mappings", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	dixiName: varchar({ length: 255 }).notNull(), // Nome como aparece no relógio DIXI
	dixiId: varchar({ length: 50 }), // ID do funcionário no relógio (se disponível)
	employeeId: int().notNull(), // Colaborador vinculado
	employeeName: varchar({ length: 255 }).notNull(), // Nome do colaborador (cache para exibição)
	source: mysqlEnum(['manual','import_link']).default('manual').notNull(), // Como foi criada
	createdBy: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("dnm_company").on(table.companyId),
	index("dnm_dixi_name").on(table.companyId, table.dixiName),
	index("dnm_employee").on(table.employeeId),
]);


// ============================================================
// BASE DE DADOS CAEPI (Certificados de Aprovação do MTE)
// ============================================================
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
}, (table) => [
	index("caepi_ca_idx").on(table.ca),
]);

// ============================================================
// ALERTAS DE DESCONTO DE EPI
// ============================================================
// ============================================================
// DIXI AFD - LOG DE IMPORTAÇÕES
// ============================================================
export const dixiAfdImportacoes = mysqlTable("dixi_afd_importacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	dataImportacao: timestamp({ mode: 'string' }).defaultNow().notNull(),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dai_company").on(table.companyId),
	index("dai_sn").on(table.snRelogio),
	index("dai_data").on(table.dataImportacao),
]);

// ============================================================
// DIXI AFD - MARCAÇÕES BRUTAS (registros individuais do AFD)
// ============================================================
export const dixiAfdMarcacoes = mysqlTable("dixi_afd_marcacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	importacaoId: int().notNull(),
	nsr: varchar({ length: 20 }),
	cpf: varchar({ length: 14 }).notNull(),
	data: date({ mode: 'string' }).notNull(),
	hora: varchar({ length: 10 }).notNull(),
	snRelogio: varchar({ length: 50 }),
	obraId: int(),
	employeeId: int(),
	employeeName: varchar({ length: 255 }),
	status: mysqlEnum(['processado','cpf_nao_encontrado','duplicado','erro']).default('processado').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dam_company").on(table.companyId),
	index("dam_importacao").on(table.importacaoId),
	index("dam_cpf").on(table.cpf),
	index("dam_data").on(table.data),
	index("dam_employee").on(table.employeeId),
]);

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
	motivoCobranca: varchar("motivo_cobranca", { length: 100 }).notNull(), // mau_uso, perda, furto, extravio
	mesReferencia: varchar("mes_referencia", { length: 7 }).notNull(), // YYYY-MM
	status: mysqlEnum(['pendente','confirmado','cancelado']).default('pendente').notNull(),
	validadoPor: varchar("validado_por", { length: 255 }),
	validadoPorUserId: int("validado_por_user_id"),
	dataValidacao: timestamp("data_validacao", { mode: 'string' }),
	justificativa: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("eda_company").on(table.companyId),
	index("eda_employee").on(table.employeeId),
	index("eda_delivery").on(table.epiDeliveryId),
	index("eda_status").on(table.status),
	index("eda_mes").on(table.companyId, table.mesReferencia),
]);


// ============================================================
// Solicitações de Horas Extras
// Fluxo: Gestor solicita → Admin Master aprova/rejeita
// No fechamento, sistema cruza batida com solicitação aprovada
export const heSolicitacoes = mysqlTable("he_solicitacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(),
	dataSolicitacao: date({ mode: 'string' }).notNull(), // Data em que a HE será realizada
	horaInicio: varchar({ length: 10 }), // Horário previsto de início da HE
	horaFim: varchar({ length: 10 }), // Horário previsto de fim da HE
	motivo: text().notNull(),
	status: mysqlEnum(['pendente','aprovada','rejeitada','cancelada']).default('pendente').notNull(),
	solicitadoPor: varchar({ length: 255 }).notNull(), // Nome do solicitante
	solicitadoPorId: int().notNull(), // ID do usuário solicitante
	aprovadoPor: varchar({ length: 255 }), // Nome do admin que aprovou/rejeitou
	aprovadoPorId: int(), // ID do admin
	aprovadoEm: timestamp({ mode: 'string' }),
	motivoRejeicao: text(),
	observacoes: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("he_sol_company").on(table.companyId),
	index("he_sol_obra").on(table.obraId),
	index("he_sol_data").on(table.dataSolicitacao),
	index("he_sol_status").on(table.status),
	index("he_sol_company_status").on(table.companyId, table.status),
]);

// Funcionários vinculados a uma solicitação de HE
export const heSolicitacaoFuncionarios = mysqlTable("he_solicitacao_funcionarios", {
	id: int().autoincrement().notNull(),
	solicitacaoId: int().notNull(),
	employeeId: int().notNull(),
	horasRealizadas: varchar({ length: 10 }), // Preenchido após fechamento
	status: mysqlEnum(['pendente','realizada','nao_realizada']).default('pendente').notNull(),
	observacao: text(),
}, (table) => [
	index("he_sol_func_sol").on(table.solicitacaoId),
	index("he_sol_func_emp").on(table.employeeId),
]);

// ============================================================
// Descontos calculados automaticamente pelo motor CLT
// Gerados no fechamento de ponto, revisados pelo RH
export const pontoDescontos = mysqlTable("ponto_descontos", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(), // YYYY-MM
	data: date({ mode: 'string' }).notNull(), // Data do evento
	tipo: mysqlEnum([
		'atraso',           // Atraso além da tolerância
		'saida_antecipada', // Saída antes do horário
		'falta_injustificada', // Falta sem justificativa
		'falta_dsr',        // Perda do DSR por falta/atraso na semana
		'falta_feriado',    // Perda do feriado por falta na semana
		'he_nao_autorizada' // Hora extra sem solicitação aprovada
	]).notNull(),
	// Valores de tempo
	minutosAtraso: int().default(0), // Minutos de atraso/saída antecipada
	minutosHe: int().default(0), // Minutos de HE não autorizada
	// Valores monetários calculados
	valorDesconto: varchar({ length: 20 }).default('0'), // Valor em R$ do desconto
	valorDsr: varchar({ length: 20 }).default('0'), // Valor em R$ do DSR perdido
	valorTotal: varchar({ length: 20 }).default('0'), // valorDesconto + valorDsr
	// Detalhes do cálculo
	baseCalculo: text(), // JSON com detalhes: salário, valor hora, fórmula usada
	// Referências
	timeRecordId: int(), // FK para time_records
	heSolicitacaoId: int(), // FK para he_solicitacoes (quando HE não autorizada)
	// Controle de revisão
	status: mysqlEnum(['calculado','revisado','abonado','fechado']).default('calculado').notNull(),
	abonadoPor: varchar({ length: 255 }),
	abonadoEm: timestamp({ mode: 'string' }),
	motivoAbono: text(),
	// Artigo CLT de referência
	fundamentacaoLegal: varchar({ length: 255 }), // Ex: "Art. 58 §1º CLT", "Lei 605/49 Art. 6º"
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("pd_company_mes").on(table.companyId, table.mesReferencia),
	index("pd_employee_mes").on(table.employeeId, table.mesReferencia),
	index("pd_tipo").on(table.tipo),
	index("pd_status").on(table.status),
	index("pd_data").on(table.data),
]);

// ============================================================
// Resumo mensal de descontos por funcionário (consolidado)
export const pontoDescontosResumo = mysqlTable("ponto_descontos_resumo", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(),
	// Contadores
	totalAtrasos: int().default(0),
	totalMinutosAtraso: int().default(0),
	totalFaltasInjustificadas: int().default(0),
	totalSaidasAntecipadas: int().default(0),
	totalMinutosSaidaAntecipada: int().default(0),
	totalDsrPerdidos: int().default(0),
	totalFeriadosPerdidos: int().default(0),
	totalHeNaoAutorizadas: int().default(0),
	totalMinutosHeNaoAutorizada: int().default(0),
	// Valores monetários
	valorTotalAtrasos: varchar({ length: 20 }).default('0'),
	valorTotalFaltas: varchar({ length: 20 }).default('0'),
	valorTotalDsr: varchar({ length: 20 }).default('0'),
	valorTotalFeriados: varchar({ length: 20 }).default('0'),
	valorTotalSaidasAntecipadas: varchar({ length: 20 }).default('0'),
	valorTotalHeNaoAutorizada: varchar({ length: 20 }).default('0'),
	valorTotalDescontos: varchar({ length: 20 }).default('0'), // Soma de todos
	// Reflexo nas férias (Art. 130 CLT)
	faltasAcumuladasPeriodoAquisitivo: int().default(0),
	diasFeriasResultante: int().default(30), // 30, 24, 18, 12 ou 0
	// Status
	status: mysqlEnum(['calculado','revisado','fechado']).default('calculado').notNull(),
	revisadoPor: varchar({ length: 255 }),
	revisadoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("pdr_company_mes").on(table.companyId, table.mesReferencia),
	index("pdr_employee_mes").on(table.employeeId, table.mesReferencia),
]);

// ============================================================
// TABELA DE FERIADOS (nacionais + estaduais + municipais)
// ============================================================
export const feriados = mysqlTable("feriados", {
	id: int().autoincrement().notNull(),
	companyId: int(), // NULL = feriado nacional (todas as empresas)
	nome: varchar({ length: 255 }).notNull(),
	data: date({ mode: 'string' }).notNull(), // Data fixa (ex: "2026-01-01") ou recorrente
	tipo: mysqlEnum(['nacional','estadual','municipal','ponto_facultativo','compensado']).notNull(),
	recorrente: tinyint().default(1).notNull(), // 1 = repete todo ano, 0 = apenas naquele ano
	estado: varchar({ length: 2 }), // Para feriados estaduais
	cidade: varchar({ length: 100 }), // Para feriados municipais
	ativo: tinyint().default(1).notNull(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("fer_company").on(table.companyId),
	index("fer_data").on(table.data),
	index("fer_tipo").on(table.tipo),
]);

// ============================================================
// DOCUMENTOS DO FUNCIONÁRIO (upload S3 com metadados)
// ============================================================
export const employeeDocuments = mysqlTable("employee_documents", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	tipo: mysqlEnum(['rg','cnh','ctps','comprovante_residencia','certidao_nascimento','titulo_eleitor','reservista','pis','foto_3x4','contrato_trabalho','termo_rescisao','atestado_medico','diploma','certificado','outros']).notNull(),
	nome: varchar({ length: 255 }).notNull(), // Nome do arquivo
	descricao: varchar({ length: 500 }),
	fileUrl: text().notNull(), // URL S3
	fileKey: text().notNull(), // Key S3
	mimeType: varchar({ length: 100 }),
	fileSize: int(), // em bytes
	dataValidade: date({ mode: 'string' }), // Para documentos com validade
	uploadPor: varchar({ length: 255 }),
	uploadPorUserId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp({ mode: 'string' }),
	deletedBy: varchar({ length: 255 }),
}, (table) => [
	index("edoc_company").on(table.companyId),
	index("edoc_employee").on(table.employeeId),
	index("edoc_tipo").on(table.tipo),
]);

// ============================================================
// PJ MEDIÇÕES MENSAIS (horas trabalhadas x valor hora)
// ============================================================
export const pjMedicoes = mysqlTable("pj_medicoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	contractId: int().notNull(), // FK pj_contracts
	employeeId: int().notNull(),
	mesReferencia: varchar({ length: 7 }).notNull(), // "2026-01"
	// Horas trabalhadas
	horasTrabalhadas: varchar({ length: 20 }).notNull(), // Total de horas no mês
	valorHora: varchar({ length: 20 }).notNull(), // Valor da hora contratada
	valorBruto: varchar({ length: 20 }).notNull(), // horas x valorHora
	// Deduções/acréscimos
	descontos: varchar({ length: 20 }).default('0'),
	acrescimos: varchar({ length: 20 }).default('0'),
	descricaoDescontos: text(),
	descricaoAcrescimos: text(),
	// Valor final
	valorLiquido: varchar({ length: 20 }).notNull(),
	// Nota fiscal
	notaFiscalNumero: varchar({ length: 50 }),
	notaFiscalUrl: text(),
	// Status
	status: mysqlEnum(['rascunho','pendente_aprovacao','aprovada','paga','cancelada']).default('rascunho').notNull(),
	aprovadoPor: varchar({ length: 255 }),
	aprovadoEm: timestamp({ mode: 'string' }),
	dataPagamento: date({ mode: 'string' }),
	comprovanteUrl: text(),
	observacoes: text(),
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("pjm_company_mes").on(table.companyId, table.mesReferencia),
	index("pjm_contract").on(table.contractId),
	index("pjm_employee").on(table.employeeId),
	index("pjm_status").on(table.status),
]);

// ============================================================
// DISSÍDIO COLETIVO — HISTÓRICO POR ANO
// Fundamentação Legal:
// - Art. 611 CLT: Convenção Coletiva de Trabalho (CCT)
// - Art. 611-A CLT: Prevalência do negociado sobre o legislado
// - Art. 614 §3º CLT: Vigência máxima de 2 anos
// - Art. 616 CLT: Obrigatoriedade de negociação coletiva
// - MTE: Data-base anual para reajuste salarial
// - Lei 10.192/2001 Art. 13: Vedação de reajuste automático por índice
// ============================================================
export const dissidios = mysqlTable("dissidios", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	// Identificação do dissídio
	anoReferencia: int().notNull(), // Ex: 2025, 2026
	titulo: varchar({ length: 255 }).notNull(), // Ex: "Dissídio 2025/2026 - SINTRACON-SP"
	sindicato: varchar({ length: 255 }), // Nome do sindicato
	numeroCCT: varchar({ length: 100 }), // Número da CCT/ACT
	// Data-base e vigência
	mesDataBase: int().default(5).notNull(), // Mês da data-base (padrão: maio = 5)
	dataBaseInicio: date({ mode: 'string' }).notNull(), // Data início vigência (ex: 2025-05-01)
	dataBaseFim: date({ mode: 'string' }).notNull(), // Data fim vigência (ex: 2026-04-30)
	// Percentuais de reajuste
	percentualReajuste: varchar({ length: 10 }).notNull(), // Percentual geral (ex: "5.50")
	percentualINPC: varchar({ length: 10 }), // INPC acumulado do período
	percentualGanhoReal: varchar({ length: 10 }), // Ganho real acima do INPC
	// Piso salarial
	pisoSalarial: varchar({ length: 20 }), // Valor do piso salarial da categoria
	pisoSalarialAnterior: varchar({ length: 20 }), // Piso do ano anterior para comparação
	// Benefícios da CCT
	valorVA: varchar({ length: 20 }), // Valor VA definido na CCT
	valorVT: varchar({ length: 20 }), // Valor VT definido na CCT
	valorSeguroVida: varchar({ length: 20 }), // Seguro de vida obrigatório
	contribuicaoAssistencial: varchar({ length: 10 }), // Percentual contribuição assistencial
	// Aplicação
	dataAplicacao: date({ mode: 'string' }), // Data em que o dissídio foi aplicado
	aplicadoPor: varchar({ length: 255 }),
	retroativo: tinyint().default(1).notNull(), // Se o reajuste é retroativo à data-base
	dataRetroativoInicio: date({ mode: 'string' }), // Se retroativo, desde quando
	// Status
	status: mysqlEnum(['rascunho','aguardando_homologacao','homologado','aplicado','cancelado']).default('rascunho').notNull(),
	// Observações
	observacoes: text(),
	documentoUrl: text(), // URL do documento da CCT/ACT
	// Metadados
	criadoPor: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("diss_company_ano").on(table.companyId, table.anoReferencia),
	index("diss_status").on(table.companyId, table.status),
]);

// Registro individual de aplicação do dissídio por funcionário
export const dissidioFuncionarios = mysqlTable("dissidio_funcionarios", {
	id: int().autoincrement().notNull(),
	dissidioId: int().notNull(), // FK para dissidios
	employeeId: int().notNull(), // FK para employees
	companyId: int().notNull(),
	// Valores antes e depois
	salarioAnterior: varchar({ length: 20 }).notNull(),
	salarioNovo: varchar({ length: 20 }).notNull(),
	percentualAplicado: varchar({ length: 10 }).notNull(), // Pode ser diferente do geral
	diferencaValor: varchar({ length: 20 }), // Diferença em R$
	// Retroativo
	mesesRetroativos: int().default(0), // Quantidade de meses retroativos
	valorRetroativo: varchar({ length: 20 }), // Valor total retroativo a pagar
	// Status
	status: mysqlEnum(['pendente','aplicado','excluido']).default('pendente').notNull(),
	motivoExclusao: text(), // Se excluído, motivo
	// Metadados
	aplicadoEm: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("df_dissidio").on(table.dissidioId),
	index("df_employee").on(table.employeeId),
	index("df_company").on(table.companyId),
]);


// ============================================================
// VÍNCULO USUÁRIO ↔ EMPRESA (controle de acesso por empresa)
// Admin Master vê todas; demais usuários só veem empresas vinculadas
// ============================================================
export const userCompanies = mysqlTable("user_companies", {
	id: int().autoincrement().notNull(),
	userId: int('user_id').notNull(),
	companyId: int('company_id').notNull(),
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("uc_user").on(table.userId),
	index("uc_company").on(table.companyId),
]);

// ============================================================
// PERMISSÕES GRANULARES POR MÓDULO E FUNCIONALIDADE
// Define quais módulos e funcionalidades cada usuário pode acessar
// Admin Master ignora essas restrições (acesso total)
// ============================================================
export const userPermissions = mysqlTable("user_permissions", {
	id: int().autoincrement().notNull(),
	userId: int('user_id').notNull(),
	moduleId: varchar('module_id', { length: 50 }).notNull(), // 'rh-dp', 'sst', 'juridico'
	featureKey: varchar('feature_key', { length: 100 }).notNull(), // 'colaboradores', 'folha-pagamento', etc.
	canAccess: tinyint('can_access').default(1).notNull(), // 1 = pode acessar, 0 = bloqueado
	createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("up_user").on(table.userId),
	index("up_module").on(table.moduleId),
	index("up_user_module").on(table.userId, table.moduleId),
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
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// ============================================================
// CONFIGURAÇÃO DE BENEFÍCIOS DE ALIMENTAÇÃO POR OBRA
// ============================================================
export const mealBenefitConfigs = mysqlTable("meal_benefit_configs", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	obraId: int(), // NULL = padrão da empresa
	nome: varchar({ length: 255 }).notNull().default('Padrão'),
	cafeManhaDia: varchar({ length: 20 }).default('0'), // valor diário café da manhã
	lancheTardeDia: varchar({ length: 20 }).default('0'), // valor diário lanche da tarde
	valeAlimentacaoMes: varchar({ length: 20 }).default('0'), // valor mensal VA (iFood)
jantaDia: varchar({ length: 20 }).default('0'), // valor diário jantar (se necessário)
		totalVA_iFood: varchar({ length: 20 }).default('0'), // total VA mensal calculado
		diasUteisRef: int().default(22), // dias úteis referência para cálculo
		cafeAtivo: tinyint().default(1), // 1 = ativo, 0 = desativado
		lancheAtivo: tinyint().default(1), // 1 = ativo, 0 = desativado
		jantaAtivo: tinyint().default(0), // 1 = ativo, 0 = desativado
	observacoes: text(),
	ativo: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("mbc_company").on(table.companyId),
	index("mbc_obra").on(table.obraId),
]);

// ============================================================
// AVALIAÇÃO DE DESEMPENHO
// ============================================================

// ============================================================
// MÓDULO AVALIAÇÃO DE DESEMPENHO (Fusão fc-engenharia-avaliacao)
// ============================================================

// Avaliadores vinculados a usuários do ERP (login único)
export const evalAvaliadores = mysqlTable("eval_avaliadores", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	userId: int('user_id'), // vínculo com usuário do ERP (login único)
	nome: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	passwordHash: varchar({ length: 255 }).default('').notNull(),
	emailVerified: tinyint().default(0),
	mustChangePassword: tinyint().default(0),
	obraId: int(), // obra vinculada
	evaluationFrequency: mysqlEnum(['daily','weekly','monthly','quarterly','annual']).default('monthly').notNull(),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }),
},
(table) => [
	index("eva_company").on(table.companyId),
	index("eva_email").on(table.email),
]);

// Revisões de critérios de avaliação
export const evalCriteriaRevisions = mysqlTable("eval_criteria_revisions", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	version: int().default(1).notNull(),
	descricao: varchar({ length: 255 }),
	isActive: tinyint().default(0).notNull(),
	createdBy: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ecr_company").on(table.companyId),
]);

// Pilares de avaliação (vinculados a uma revisão)
export const evalPillars = mysqlTable("eval_pillars", {
	id: int().autoincrement().notNull(),
	revisionId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	ordem: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ep_revision").on(table.revisionId),
]);

// Critérios individuais (vinculados a um pilar)
export const evalCriteria = mysqlTable("eval_criteria", {
	id: int().autoincrement().notNull(),
	pillarId: int().notNull(),
	revisionId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	descricao: text(),
	fieldKey: varchar({ length: 100 }), // chave técnica ex: "comportamento"
	ordem: int().default(0).notNull(),
	ativo: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ec_pillar").on(table.pillarId),
	index("ec_revision").on(table.revisionId),
]);

// Avaliações de desempenho (12 critérios fixos + dinâmicos)
export const evalAvaliacoes = mysqlTable("eval_avaliacoes", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	employeeId: int().notNull(),
	evaluatorId: int().notNull(), // eval_avaliadores.id ou users.id
	obraId: int('obra_id'), // obra onde o funcionário foi avaliado
	evaluatorName: varchar('evaluator_name', { length: 255 }), // nome do avaliador (snapshot)
	// Pilar 1 - Postura e Disciplina
	comportamento: int(), // 1-5
	pontualidade: int(), // 1-5
	assiduidade: int(), // 1-5
	segurancaEpis: int(), // 1-5
	// Pilar 2 - Desempenho Técnico
	qualidadeAcabamento: int(), // 1-5
	produtividadeRitmo: int(), // 1-5
	cuidadoFerramentas: int(), // 1-5
	economiaMateriais: int(), // 1-5
	// Pilar 3 - Atitude e Crescimento
	trabalhoEquipe: int(), // 1-5
	iniciativaProatividade: int(), // 1-5
	disponibilidadeFlexibilidade: int(), // 1-5
	organizacaoLimpeza: int(), // 1-5
	// Médias calculadas
	mediaPilar1: decimal({ precision: 3, scale: 1 }),
	mediaPilar2: decimal({ precision: 3, scale: 1 }),
	mediaPilar3: decimal({ precision: 3, scale: 1 }),
	mediaGeral: decimal({ precision: 3, scale: 1 }),
	recomendacao: varchar({ length: 100 }), // recomendação automática
	observacoes: text(),
	mesReferencia: varchar({ length: 7 }), // "2026-02"
	locked: tinyint().default(1).notNull(), // imutável após criação
	startedAt: timestamp({ mode: 'string' }),
	durationSeconds: int(), // tempo para completar
	deviceType: varchar({ length: 20 }),
	revisionId: int(), // revisão de critérios vigente
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ea_company").on(table.companyId),
	index("ea_employee").on(table.employeeId),
	index("ea_evaluator").on(table.evaluatorId),
	index("ea_mes").on(table.mesReferencia),
]);

// Notas dinâmicas por critério (quando usa critérios configuráveis)
export const evalScores = mysqlTable("eval_scores", {
	id: int().autoincrement().notNull(),
	evaluationId: int().notNull(),
	criterionId: int().notNull(),
	nota: int().notNull(), // 1-5
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("es_evaluation").on(table.evaluationId),
	index("es_criterion").on(table.criterionId),
]);

// Pesquisas customizadas
export const evalSurveys = mysqlTable("eval_surveys", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	tipo: mysqlEnum(['setor','cliente','outro']).default('outro').notNull(),
	anonimo: tinyint().default(0),
	status: mysqlEnum(['ativa','encerrada','rascunho']).default('rascunho').notNull(),
	isEvaluation: tinyint('is_evaluation').default(0), // 1 = avaliação de desempenho (avaliador seleciona funcionário)
	allowEmployeeSelection: tinyint('allow_employee_selection').default(1), // avaliador pode selecionar funcionário
	obraId: int(),
	publicToken: varchar('public_token', { length: 64 }), // token para link público
	expiresAt: timestamp('expires_at', { mode: 'string' }), // data de expiração
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("esu_company").on(table.companyId),
]);

// Perguntas da pesquisa
export const evalSurveyQuestions = mysqlTable("eval_survey_questions", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	texto: text().notNull(),
	tipo: mysqlEnum(['nota','texto','sim_nao']).default('nota').notNull(),
	ordem: int().default(0).notNull(),
	obrigatoria: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("esq_survey").on(table.surveyId),
]);

// Respostas da pesquisa
export const evalSurveyResponses = mysqlTable("eval_survey_responses", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	respondentName: varchar({ length: 255 }),
	respondentEmail: varchar({ length: 320 }),
	employeeId: int('employee_id'), // funcionário avaliado (quando isEvaluation=1)
	evaluatorUserId: int('evaluator_user_id'), // usuário que fez a avaliação
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("esr_survey").on(table.surveyId),
]);

// Respostas individuais por pergunta
export const evalSurveyAnswers = mysqlTable("eval_survey_answers", {
	id: int().autoincrement().notNull(),
	responseId: int().notNull(),
	questionId: int().notNull(),
	valor: varchar({ length: 20 }),
	textoLivre: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("esa_response").on(table.responseId),
	index("esa_question").on(table.questionId),
]);

// Vínculo pesquisa-avaliador
export const evalSurveyEvaluators = mysqlTable("eval_survey_evaluators", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	evaluatorId: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ese_survey").on(table.surveyId),
	index("ese_evaluator").on(table.evaluatorId),
]);

// Pesquisas de clima organizacional
export const evalClimateSurveys = mysqlTable("eval_climate_surveys", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descricao: text(),
	status: mysqlEnum(['ativa','encerrada','rascunho']).default('rascunho').notNull(),
	publicToken: varchar('public_token', { length: 64 }), // token para link público
	expiresAt: timestamp('expires_at', { mode: 'string' }), // data de expiração
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ecs_company").on(table.companyId),
]);

// Perguntas de clima (com categorias)
export const evalClimateQuestions = mysqlTable("eval_climate_questions", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	texto: text().notNull(),
	categoria: mysqlEnum(['empresa','gestor','ambiente','seguranca','crescimento','recomendacao']).default('empresa').notNull(),
	tipo: mysqlEnum(['nota','texto','sim_nao']).default('nota').notNull(),
	ordem: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ecq_survey").on(table.surveyId),
]);

// Respostas de clima (com cpfHash SHA-256 para dedup anônima)
export const evalClimateResponses = mysqlTable("eval_climate_responses", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	cpfHash: varchar({ length: 64 }), // SHA-256 do CPF
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("eclr_survey").on(table.surveyId),
]);

// Respostas individuais de clima
export const evalClimateAnswers = mysqlTable("eval_climate_answers", {
	id: int().autoincrement().notNull(),
	responseId: int().notNull(),
	questionId: int().notNull(),
	valor: varchar({ length: 20 }),
	textoLivre: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ecla_response").on(table.responseId),
	index("ecla_question").on(table.questionId),
]);

// Participantes externos (clientes, fornecedores)
export const evalExternalParticipants = mysqlTable("eval_external_participants", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	nome: varchar({ length: 255 }).notNull(),
	empresa: varchar({ length: 255 }),
	tipo: mysqlEnum(['cliente','fornecedor']).default('cliente').notNull(),
	email: varchar({ length: 320 }),
	telefone: varchar({ length: 20 }),
	status: mysqlEnum(['ativo','inativo']).default('ativo').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("eep_company").on(table.companyId),
]);

// Tokens únicos para pesquisa de clima via link (participantes externos)
export const evalClimateExternalTokens = mysqlTable("eval_climate_external_tokens", {
	id: int().autoincrement().notNull(),
	surveyId: int().notNull(),
	participantId: int().notNull(),
	token: varchar({ length: 64 }).notNull(),
	used: tinyint().default(0),
	usedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("ecet_survey").on(table.surveyId),
	index("ecet_token").on(table.token),
]);

// Log de auditoria do módulo de avaliação
export const evalAuditLog = mysqlTable("eval_audit_log", {
	id: int().autoincrement().notNull(),
	companyId: int().notNull(),
	action: varchar({ length: 100 }).notNull(),
	actorType: mysqlEnum(['admin','evaluator','system','anonymous']).default('system').notNull(),
	actorId: int(),
	actorName: varchar({ length: 255 }),
	targetType: varchar({ length: 50 }),
	targetId: int(),
	details: text(), // JSON
	ipAddress: varchar({ length: 45 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("eal_company").on(table.companyId),
	index("eal_action").on(table.action),
	index("eal_actor").on(table.actorType, table.actorId),
]);

