CREATE TABLE `accidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`dataAcidente` date NOT NULL,
	`horaAcidente` varchar(10),
	`tipoAcidente` enum('Tipico','Trajeto','Doenca_Ocupacional') NOT NULL,
	`gravidade` enum('Leve','Moderado','Grave','Fatal') NOT NULL,
	`localAcidente` varchar(255),
	`descricao` text,
	`parteCorpoAtingida` varchar(255),
	`catNumero` varchar(50),
	`catData` date,
	`diasAfastamento` int DEFAULT 0,
	`testemunhas` text,
	`acaoCorretiva` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `action_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`deviationId` int,
	`oQue` text NOT NULL,
	`porQue` text,
	`onde` varchar(255),
	`quando` date,
	`quem` varchar(255),
	`como` text,
	`quantoCusta` varchar(50),
	`statusPlano` enum('Pendente','Em_Andamento','Concluido','Cancelado') NOT NULL DEFAULT 'Pendente',
	`dataConclusao` date,
	`evidencia` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`valorAdiantamento` varchar(20),
	`valorLiquido` varchar(20),
	`descontoIr` varchar(20),
	`bancoDestino` varchar(100),
	`diasFaltas` int DEFAULT 0,
	`aprovado` enum('Pendente','Aprovado','Reprovado') NOT NULL DEFAULT 'Pendente',
	`motivoReprovacao` text,
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `asos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` varchar(50) NOT NULL,
	`dataExame` date NOT NULL,
	`dataValidade` date NOT NULL,
	`validadeDias` int DEFAULT 365,
	`resultado` varchar(50) NOT NULL DEFAULT 'Apto',
	`medico` varchar(255),
	`crm` varchar(20),
	`examesRealizados` text,
	`jaAtualizou` tinyint DEFAULT 0,
	`clinica` varchar(255),
	`observacoes` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `atestados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` varchar(100) NOT NULL,
	`dataEmissao` date NOT NULL,
	`diasAfastamento` int DEFAULT 0,
	`dataRetorno` date,
	`cid` varchar(20),
	`medico` varchar(255),
	`crm` varchar(20),
	`descricao` text,
	`motivo` varchar(100),
	`motivoOutro` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(255),
	`companyId` int,
	`action` varchar(50) NOT NULL,
	`module` varchar(50) NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`details` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`tipoAuditoria` enum('Interna','Externa','Cliente','Certificadora') NOT NULL,
	`dataAuditoria` date NOT NULL,
	`auditor` varchar(255),
	`setor` varchar(100),
	`resultadoAuditoria` enum('Conforme','Nao_Conforme','Observacao','Pendente') NOT NULL DEFAULT 'Pendente',
	`descricao` text,
	`documentoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `blacklist_reactivation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`employeeCpf` varchar(14),
	`solicitadoPor` varchar(255) NOT NULL,
	`solicitadoPorId` int NOT NULL,
	`motivoReativacao` text NOT NULL,
	`status` enum('pendente','aprovado','rejeitado','cancelado') NOT NULL DEFAULT 'pendente',
	`aprovador1Nome` varchar(255),
	`aprovador1Id` int,
	`aprovador1Data` timestamp,
	`aprovador1Parecer` text,
	`aprovador2Nome` varchar(255),
	`aprovador2Id` int,
	`aprovador2Data` timestamp,
	`aprovador2Parecer` text,
	`rejeitadoPor` varchar(255),
	`rejeitadoPorId` int,
	`motivoRejeicao` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `caepi_database` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ca` varchar(20) NOT NULL,
	`validade` varchar(20),
	`situacao` varchar(30),
	`cnpj` varchar(20),
	`fabricante` varchar(500),
	`natureza` varchar(50),
	`equipamento` varchar(500),
	`descricao` text,
	`referencia` varchar(500),
	`cor` varchar(100),
	`aprovado_para` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `chemicals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`fabricante` varchar(255),
	`numeroCas` varchar(50),
	`classificacaoPerigo` varchar(255),
	`localArmazenamento` varchar(255),
	`quantidadeEstoque` varchar(50),
	`fispqUrl` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `cipa_elections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mandatoInicio` date NOT NULL,
	`mandatoFim` date NOT NULL,
	`statusEleicao` enum('Planejamento','Inscricao','Campanha','Votacao','Apuracao','Concluida') NOT NULL DEFAULT 'Planejamento',
	`dataEdital` date,
	`dataInscricaoInicio` date,
	`dataInscricaoFim` date,
	`dataEleicao` date,
	`dataPosse` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `cipa_meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mandateId` int NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('ordinaria','extraordinaria') NOT NULL DEFAULT 'ordinaria',
	`dataReuniao` date NOT NULL,
	`horaInicio` varchar(10),
	`horaFim` varchar(10),
	`local` varchar(255),
	`pauta` text,
	`ataTexto` text,
	`ataDocumentoUrl` text,
	`presentesJson` text,
	`status` enum('agendada','realizada','cancelada') NOT NULL DEFAULT 'agendada',
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `cipa_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`electionId` int NOT NULL,
	`employeeId` int NOT NULL,
	`cargoCipa` enum('Presidente','Vice_Presidente','Secretario','Membro_Titular','Membro_Suplente') NOT NULL,
	`representacao` enum('Empregador','Empregados') NOT NULL,
	`inicioEstabilidade` date,
	`fimEstabilidade` date,
	`statusMembro` enum('Ativo','Desligado','Substituido') NOT NULL DEFAULT 'Ativo',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`razaoSocial` varchar(255) NOT NULL,
	`nomeFantasia` varchar(255),
	`endereco` text,
	`cidade` varchar(100),
	`estado` varchar(2),
	`cep` varchar(10),
	`telefone` varchar(20),
	`email` varchar(320),
	`inscricaoEstadual` varchar(30),
	`inscricaoMunicipal` varchar(30),
	`logoUrl` text,
	`prefixoCodigo` varchar(10) DEFAULT 'EMP',
	`nextCodigoInterno` int NOT NULL DEFAULT 1,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `company_bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`banco` varchar(100) NOT NULL,
	`codigoBanco` varchar(10),
	`agencia` varchar(20) NOT NULL,
	`conta` varchar(30) NOT NULL,
	`tipoConta` enum('corrente','poupanca') NOT NULL DEFAULT 'corrente',
	`apelido` varchar(100),
	`cnpjTitular` varchar(20),
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `dds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tema` varchar(255) NOT NULL,
	`dataRealizacao` date NOT NULL,
	`responsavel` varchar(255),
	`participantes` text,
	`descricao` text,
	`documentoUrl` text,
	`fotosUrls` json,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `deviations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`auditId` int,
	`titulo` varchar(255) NOT NULL,
	`tipoDesvio` enum('NC_Maior','NC_Menor','Observacao','Oportunidade_Melhoria') NOT NULL,
	`setor` varchar(100),
	`descricao` text,
	`causaRaiz` text,
	`statusDesvio` enum('Aberto','Em_Andamento','Fechado','Cancelado') NOT NULL DEFAULT 'Aberto',
	`responsavel` varchar(255),
	`prazo` date,
	`dataConclusao` date,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `dissidio_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dissidioId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`salarioAnterior` varchar(20) NOT NULL,
	`salarioNovo` varchar(20) NOT NULL,
	`percentualAplicado` varchar(10) NOT NULL,
	`diferencaValor` varchar(20),
	`mesesRetroativos` int DEFAULT 0,
	`valorRetroativo` varchar(20),
	`status` enum('pendente','aplicado','excluido') NOT NULL DEFAULT 'pendente',
	`motivoExclusao` text,
	`aplicadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `dissidios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`anoReferencia` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`sindicato` varchar(255),
	`numeroCCT` varchar(100),
	`mesDataBase` int NOT NULL DEFAULT 5,
	`dataBaseInicio` date NOT NULL,
	`dataBaseFim` date NOT NULL,
	`percentualReajuste` varchar(10) NOT NULL,
	`percentualINPC` varchar(10),
	`percentualGanhoReal` varchar(10),
	`pisoSalarial` varchar(20),
	`pisoSalarialAnterior` varchar(20),
	`valorVA` varchar(20),
	`valorVT` varchar(20),
	`valorSeguroVida` varchar(20),
	`contribuicaoAssistencial` varchar(10),
	`dataAplicacao` date,
	`aplicadoPor` varchar(255),
	`retroativo` tinyint NOT NULL DEFAULT 1,
	`dataRetroativoInicio` date,
	`status` enum('rascunho','aguardando_homologacao','homologado','aplicado','cancelado') NOT NULL DEFAULT 'rascunho',
	`observacoes` text,
	`documentoUrl` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `dixi_afd_importacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`dataImportacao` timestamp NOT NULL DEFAULT (now()),
	`metodo` enum('AFD','API','XLS') NOT NULL DEFAULT 'AFD',
	`arquivoNome` varchar(255),
	`snRelogio` varchar(50),
	`obraId` int,
	`obraNome` varchar(255),
	`totalMarcacoes` int NOT NULL DEFAULT 0,
	`totalFuncionarios` int NOT NULL DEFAULT 0,
	`totalInconsistencias` int NOT NULL DEFAULT 0,
	`periodoInicio` varchar(10),
	`periodoFim` varchar(10),
	`status` enum('sucesso','parcial','erro') NOT NULL DEFAULT 'sucesso',
	`importadoPor` varchar(255),
	`detalhes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `dixi_afd_marcacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`importacaoId` int NOT NULL,
	`nsr` varchar(20),
	`cpf` varchar(14) NOT NULL,
	`data` date NOT NULL,
	`hora` varchar(10) NOT NULL,
	`snRelogio` varchar(50),
	`obraId` int,
	`employeeId` int,
	`employeeName` varchar(255),
	`status` enum('processado','cpf_nao_encontrado','duplicado','erro') NOT NULL DEFAULT 'processado',
	`createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `dixi_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`serialNumber` varchar(50) NOT NULL,
	`obraName` varchar(255) NOT NULL,
	`location` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`obraId` int,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `dixi_name_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`dixiName` varchar(255) NOT NULL,
	`dixiId` varchar(50),
	`employeeId` int NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`source` enum('manual','import_link') NOT NULL DEFAULT 'manual',
	`createdBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `document_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('advertencia_verbal','advertencia_escrita','suspensao','justa_causa','contrato_pj','outros') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`conteudo` text NOT NULL,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`criadoPor` varchar(255),
	`atualizadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('contratacao','demissao','transferencia','afastamento') NOT NULL,
	`assunto` varchar(500),
	`saudacao` text,
	`corpoTexto` text,
	`providencias` text,
	`rodape` text,
	`ativo` boolean NOT NULL DEFAULT true,
	`atualizadoPor` varchar(255),
	`atualizadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` enum('rg','cnh','ctps','comprovante_residencia','certidao_nascimento','titulo_eleitor','reservista','pis','foto_3x4','contrato_trabalho','termo_rescisao','atestado_medico','diploma','certificado','outros') NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` varchar(500),
	`fileUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`dataValidade` date,
	`uploadPor` varchar(255),
	`uploadPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255)
);
--> statement-breakpoint
CREATE TABLE `employee_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`tipo` enum('Admissao','Promocao','Transferencia','Mudanca_Funcao','Mudanca_Setor','Mudanca_Salario','Afastamento','Retorno','Ferias','Desligamento','Outros') NOT NULL,
	`descricao` text,
	`valorAnterior` text,
	`valorNovo` text,
	`dataEvento` date NOT NULL,
	`registradoPor` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`matricula` varchar(20),
	`nomeCompleto` varchar(255) NOT NULL,
	`cpf` varchar(14) NOT NULL,
	`rg` varchar(20),
	`orgaoEmissor` varchar(20),
	`dataNascimento` date,
	`sexo` enum('M','F','Outro'),
	`estadoCivil` enum('Solteiro','Casado','Divorciado','Viuvo','Uniao_Estavel','Amasiado','Separado','Separado_Judicialmente','Outro'),
	`nacionalidade` varchar(50),
	`naturalidade` varchar(100),
	`nomeMae` varchar(255),
	`nomePai` varchar(255),
	`ctps` varchar(20),
	`serieCtps` varchar(10),
	`pis` varchar(20),
	`tituloEleitor` varchar(20),
	`certificadoReservista` varchar(20),
	`cnh` varchar(20),
	`categoriaCnh` varchar(5),
	`validadeCnh` date,
	`logradouro` varchar(255),
	`numero` varchar(20),
	`complemento` varchar(100),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`estado` varchar(2),
	`cep` varchar(10),
	`telefone` varchar(20),
	`celular` varchar(20),
	`email` varchar(320),
	`contatoEmergencia` varchar(255),
	`telefoneEmergencia` varchar(20),
	`parentescoEmergencia` varchar(100),
	`cargo` varchar(100),
	`funcao` varchar(100),
	`setor` varchar(100),
	`dataAdmissao` date,
	`dataDemissao` date,
	`salarioBase` varchar(20),
	`valorHora` varchar(20),
	`horasMensais` varchar(10),
	`tipoContrato` enum('CLT','PJ','Temporario','Estagio','Aprendiz','Horista'),
	`jornadaTrabalho` varchar(50),
	`banco` varchar(100),
	`bancoNome` varchar(100),
	`agencia` varchar(20),
	`conta` varchar(30),
	`tipoConta` enum('Corrente','Poupanca','Salario'),
	`tipoChavePix` enum('CPF','Celular','Email','Aleatoria'),
	`chavePix` varchar(100),
	`contaPix` varchar(100),
	`bancoPix` varchar(100),
	`status` enum('Ativo','Ferias','Afastado','Licenca','Desligado','Recluso','Lista_Negra') NOT NULL DEFAULT 'Ativo',
	`fotoUrl` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`listaNegra` tinyint NOT NULL DEFAULT 0,
	`motivoListaNegra` text,
	`dataListaNegra` date,
	`listaNegraPor` varchar(255),
	`listaNegraUserId` int,
	`desligadoPor` varchar(255),
	`desligadoUserId` int,
	`dataDesligamentoEfetiva` date,
	`motivoDesligamento` text,
	`categoriaDesligamento` varchar(50),
	`obraAtualId` int,
	`codigoContabil` varchar(20),
	`codigoInterno` varchar(10),
	`recebeComplemento` tinyint NOT NULL DEFAULT 0,
	`valorComplemento` varchar(20),
	`descricaoComplemento` varchar(255),
	`acordoHoraExtra` tinyint NOT NULL DEFAULT 0,
	`heNormal50` varchar(10) DEFAULT '50',
	`heNoturna` varchar(10) DEFAULT '20',
	`he100` varchar(10) DEFAULT '100',
	`heFeriado` varchar(10) DEFAULT '100',
	`heInterjornada` varchar(10) DEFAULT '50',
	`obsAcordoHe` text,
	`contaBancariaEmpresaId` int,
	`experienciaTipo` enum('30_30','45_45'),
	`experienciaInicio` date,
	`experienciaFim1` date,
	`experienciaFim2` date,
	`experienciaStatus` enum('em_experiencia','prorrogado','efetivado','desligado_experiencia') DEFAULT 'em_experiencia',
	`experienciaProrrogadoEm` date,
	`experienciaProrrogadoPor` varchar(255),
	`experienciaEfetivadoEm` date,
	`experienciaEfetivadoPor` varchar(255),
	`experienciaObs` text,
	`vtRecebe` varchar(20),
	`vtTipo` enum('nenhum','onibus','van','misto'),
	`vtValorDiario` varchar(20),
	`vtOperadora` varchar(100),
	`vtNumeroCartao` varchar(50),
	`vtLinhas` varchar(255),
	`vtDescontoFolha` varchar(20),
	`vaRecebe` varchar(20),
	`vaValor` varchar(20),
	`vaOperadora` varchar(100),
	`vaNumeroCartao` varchar(50),
	`auxFarmacia` varchar(20),
	`auxFarmaciaValor` varchar(20),
	`planoSaude` varchar(20),
	`planoSaudeOperadora` varchar(100),
	`planoSaudeValor` varchar(20),
	`benefObs` text,
	`pensaoAlimenticia` tinyint DEFAULT 0,
	`pensaoValor` varchar(20),
	`pensaoTipo` enum('percentual','valor_fixo'),
	`pensaoPercentual` varchar(10),
	`pensaoBeneficiario` varchar(255),
	`pensaoBanco` varchar(100),
	`pensaoAgencia` varchar(20),
	`pensaoConta` varchar(30),
	`pensaoObservacoes` text,
	`licencaMaternidade` tinyint DEFAULT 0,
	`licencaTipo` enum('maternidade_120','maternidade_180','paternidade_5','paternidade_20'),
	`licencaDataInicio` date,
	`licencaDataFim` date,
	`licencaObservacoes` text,
	`seguroVida` varchar(20),
	`contribuicaoSindical` varchar(20),
	`fgtsPercentual` varchar(10) DEFAULT '8',
	`inssPercentual` varchar(10),
	`dissidioData` date,
	`dissidioPercentual` varchar(10),
	`convencaoColetiva` varchar(255),
	`convencaoVigencia` date,
	`ddsParticipacao` tinyint DEFAULT 1,
	`docRgUrl` text,
	`docCnhUrl` text,
	`docCtpsUrl` text,
	`docComprovanteResidenciaUrl` text,
	`docCertidaoNascimentoUrl` text,
	`docTituloEleitorUrl` text,
	`docReservistaUrl` text,
	`docOutrosUrl` text,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int,
	`deleteReason` text
);
--> statement-breakpoint
CREATE TABLE `epi_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`epiId` int NOT NULL,
	`employeeId` int NOT NULL,
	`quantidade` int NOT NULL DEFAULT 1,
	`dataEntrega` date NOT NULL,
	`dataDevolucao` date,
	`motivo` varchar(255),
	`observacoes` text,
	`motivo_troca` varchar(50),
	`valor_cobrado` decimal(10,2),
	`ficha_url` text,
	`foto_estado_url` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `epi_discount_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`epiDeliveryId` int NOT NULL,
	`epi_nome` varchar(1000) NOT NULL,
	`ca` varchar(20),
	`quantidade` int NOT NULL DEFAULT 1,
	`valor_unitario` decimal(10,2) NOT NULL,
	`valor_total` decimal(10,2) NOT NULL,
	`motivo_cobranca` varchar(100) NOT NULL,
	`mes_referencia` varchar(7) NOT NULL,
	`status` enum('pendente','confirmado','cancelado') NOT NULL DEFAULT 'pendente',
	`validado_por` varchar(255),
	`validado_por_user_id` int,
	`data_validacao` timestamp,
	`justificativa` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `epis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(1000) NOT NULL,
	`ca` varchar(20),
	`validadeCa` date,
	`fabricante` varchar(255),
	`fornecedor` varchar(255),
	`fornecedor_cnpj` varchar(20),
	`fornecedor_contato` varchar(255),
	`fornecedor_telefone` varchar(30),
	`fornecedor_email` varchar(255),
	`fornecedor_endereco` varchar(500),
	`categoria` enum('EPI','Uniforme','Calcado') NOT NULL DEFAULT 'EPI',
	`tamanho` varchar(20),
	`quantidadeEstoque` int DEFAULT 0,
	`valor_produto` decimal(10,2),
	`tempo_minimo_troca` int,
	`cor_capacete` varchar(30),
	`condicao` enum('Novo','Reutilizado') NOT NULL DEFAULT 'Novo',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`patrimonio` varchar(50),
	`tipoEquipamento` varchar(100),
	`marca` varchar(100),
	`modelo` varchar(100),
	`numeroSerie` varchar(100),
	`localizacao` varchar(255),
	`responsavel` varchar(255),
	`statusEquipamento` enum('Ativo','Manutencao','Inativo','Descartado') NOT NULL DEFAULT 'Ativo',
	`dataAquisicao` date,
	`proximaManutencao` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `eval_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`actorType` enum('admin','evaluator','system','anonymous') NOT NULL DEFAULT 'system',
	`actorId` int,
	`actorName` varchar(255),
	`targetType` varchar(50),
	`targetId` int,
	`details` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_avaliacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`evaluatorId` int NOT NULL,
	`obra_id` int,
	`evaluator_name` varchar(255),
	`comportamento` int,
	`pontualidade` int,
	`assiduidade` int,
	`segurancaEpis` int,
	`qualidadeAcabamento` int,
	`produtividadeRitmo` int,
	`cuidadoFerramentas` int,
	`economiaMateriais` int,
	`trabalhoEquipe` int,
	`iniciativaProatividade` int,
	`disponibilidadeFlexibilidade` int,
	`organizacaoLimpeza` int,
	`mediaPilar1` decimal(3,1),
	`mediaPilar2` decimal(3,1),
	`mediaPilar3` decimal(3,1),
	`mediaGeral` decimal(3,1),
	`recomendacao` varchar(100),
	`observacoes` text,
	`mesReferencia` varchar(7),
	`locked` tinyint NOT NULL DEFAULT 1,
	`startedAt` timestamp,
	`durationSeconds` int,
	`deviceType` varchar(20),
	`revisionId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `eval_avaliadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`emailVerified` tinyint DEFAULT 0,
	`mustChangePassword` tinyint DEFAULT 1,
	`obraId` int,
	`evaluationFrequency` enum('daily','weekly','monthly','quarterly','annual') NOT NULL DEFAULT 'monthly',
	`status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp
);
--> statement-breakpoint
CREATE TABLE `eval_climate_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`responseId` int NOT NULL,
	`questionId` int NOT NULL,
	`valor` varchar(20),
	`textoLivre` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_climate_external_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`participantId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`used` tinyint DEFAULT 0,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_climate_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`texto` text NOT NULL,
	`categoria` enum('empresa','gestor','ambiente','seguranca','crescimento','recomendacao') NOT NULL DEFAULT 'empresa',
	`tipo` enum('nota','texto','sim_nao') NOT NULL DEFAULT 'nota',
	`ordem` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_climate_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`cpfHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_climate_surveys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`status` enum('ativa','encerrada','rascunho') NOT NULL DEFAULT 'rascunho',
	`public_token` varchar(64),
	`expires_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `eval_criteria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pillarId` int NOT NULL,
	`revisionId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`fieldKey` varchar(100),
	`ordem` int NOT NULL DEFAULT 0,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_criteria_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`descricao` varchar(255),
	`isActive` tinyint NOT NULL DEFAULT 0,
	`createdBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_external_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`empresa` varchar(255),
	`tipo` enum('cliente','fornecedor') NOT NULL DEFAULT 'cliente',
	`email` varchar(320),
	`telefone` varchar(20),
	`status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `eval_pillars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`revisionId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`evaluationId` int NOT NULL,
	`criterionId` int NOT NULL,
	`nota` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_survey_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`responseId` int NOT NULL,
	`questionId` int NOT NULL,
	`valor` varchar(20),
	`textoLivre` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_survey_evaluators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`evaluatorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_survey_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`texto` text NOT NULL,
	`tipo` enum('nota','texto','sim_nao') NOT NULL DEFAULT 'nota',
	`ordem` int NOT NULL DEFAULT 0,
	`obrigatoria` tinyint DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_survey_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surveyId` int NOT NULL,
	`respondentName` varchar(255),
	`respondentEmail` varchar(320),
	`employee_id` int,
	`evaluator_user_id` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `eval_surveys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`tipo` enum('setor','cliente','outro') NOT NULL DEFAULT 'outro',
	`anonimo` tinyint DEFAULT 0,
	`status` enum('ativa','encerrada','rascunho') NOT NULL DEFAULT 'rascunho',
	`is_evaluation` tinyint DEFAULT 0,
	`allow_employee_selection` tinyint DEFAULT 1,
	`obraId` int,
	`public_token` varchar(64),
	`expires_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `extinguishers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`numero` varchar(20) NOT NULL,
	`tipoExtintor` enum('PQS','CO2','Agua','Espuma','AP') NOT NULL,
	`capacidade` varchar(20),
	`localizacao` varchar(255),
	`dataRecarga` date,
	`validadeRecarga` date,
	`dataTesteHidrostatico` date,
	`validadeTesteHidrostatico` date,
	`statusExtintor` enum('OK','Vencido','Manutencao') NOT NULL DEFAULT 'OK',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `extra_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipoExtra` enum('Diferenca_Salario','Horas_Extras','Reembolso','Bonus','Outro') NOT NULL,
	`descricao` text,
	`valorHoraBase` varchar(20),
	`percentualAcrescimo` varchar(10),
	`quantidadeHoras` varchar(10),
	`valorTotal` varchar(20) NOT NULL,
	`bancoDestino` varchar(100),
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `feriados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`nome` varchar(255) NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('nacional','estadual','municipal','ponto_facultativo','compensado') NOT NULL,
	`recorrente` tinyint NOT NULL DEFAULT 1,
	`estado` varchar(2),
	`cidade` varchar(100),
	`ativo` tinyint NOT NULL DEFAULT 1,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `folha_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folhaLancamentoId` int NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int,
	`codigoContabil` varchar(20),
	`nomeColaborador` varchar(255) NOT NULL,
	`dataAdmissao` date,
	`salarioBase` varchar(20),
	`horasMensais` varchar(10),
	`funcao` varchar(100),
	`sf` int DEFAULT 0,
	`ir` int DEFAULT 0,
	`proventos` json,
	`descontos` json,
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`baseInss` varchar(20),
	`valorInss` varchar(20),
	`baseFgts` varchar(20),
	`valorFgts` varchar(20),
	`baseIrrf` varchar(20),
	`valorIrrf` varchar(20),
	`liquido` varchar(20),
	`situacaoEspecial` text,
	`matchStatus` enum('matched','unmatched','divergente') NOT NULL DEFAULT 'unmatched',
	`divergencias` json,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `folha_lancamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipoLancamento` enum('vale','pagamento','decimo_terceiro_1','decimo_terceiro_2') NOT NULL,
	`status` enum('importado','validado','consolidado') NOT NULL DEFAULT 'importado',
	`analiticoUploadId` int,
	`sinteticoUploadId` int,
	`totalFuncionarios` int DEFAULT 0,
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`totalLiquido` varchar(20),
	`totalDivergencias` int DEFAULT 0,
	`divergenciasResolvidas` int DEFAULT 0,
	`importadoPor` varchar(255),
	`importadoEm` timestamp,
	`validadoPor` varchar(255),
	`validadoEm` timestamp,
	`consolidadoPor` varchar(255),
	`consolidadoEm` timestamp,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `fornecedores_epi` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`contato` varchar(255),
	`telefone` varchar(30),
	`email` varchar(255),
	`endereco` varchar(500),
	`observacoes` text,
	`ativo` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `golden_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`titulo` varchar(200) NOT NULL,
	`descricao` text NOT NULL,
	`categoria` enum('seguranca','qualidade','rh','operacional','juridico','financeiro','geral') NOT NULL DEFAULT 'geral',
	`prioridade` enum('critica','alta','media','baixa') NOT NULL DEFAULT 'alta',
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `he_solicitacao_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`solicitacaoId` int NOT NULL,
	`employeeId` int NOT NULL,
	`horasRealizadas` varchar(10),
	`status` enum('pendente','realizada','nao_realizada') NOT NULL DEFAULT 'pendente',
	`observacao` text
);
--> statement-breakpoint
CREATE TABLE `he_solicitacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`dataSolicitacao` date NOT NULL,
	`horaInicio` varchar(10),
	`horaFim` varchar(10),
	`motivo` text NOT NULL,
	`status` enum('pendente','aprovada','rejeitada','cancelada') NOT NULL DEFAULT 'pendente',
	`solicitadoPor` varchar(255) NOT NULL,
	`solicitadoPorId` int NOT NULL,
	`aprovadoPor` varchar(255),
	`aprovadoPorId` int,
	`aprovadoEm` timestamp,
	`motivoRejeicao` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `hydrants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`numero` varchar(20) NOT NULL,
	`localizacao` varchar(255),
	`tipoHidrante` varchar(50),
	`ultimaInspecao` date,
	`proximaInspecao` date,
	`statusHidrante` enum('OK','Manutencao','Inativo') NOT NULL DEFAULT 'OK',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `insurance_alert_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`textoAdmissao` text,
	`textoAfastamento` text,
	`textoReclusao` text,
	`textoDesligamento` text,
	`seguradora` varchar(255),
	`apolice` varchar(100),
	`observacoes` text,
	`criadoPor` varchar(255),
	`atualizadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `insurance_alert_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`configId` int NOT NULL,
	`tipoDestinatario` enum('corretor','diretoria','usuario_sistema','outro') NOT NULL,
	`nome` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`telefone` varchar(20),
	`cargo` varchar(100),
	`recebeAdmissao` tinyint NOT NULL DEFAULT 1,
	`recebeAfastamento` tinyint NOT NULL DEFAULT 1,
	`recebeReclusao` tinyint NOT NULL DEFAULT 1,
	`recebeDesligamento` tinyint NOT NULL DEFAULT 1,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `insurance_alerts_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipoMovimentacao` enum('admissao','afastamento','reclusao','desligamento') NOT NULL,
	`statusAnterior` varchar(50),
	`statusNovo` varchar(50),
	`textoAlerta` text NOT NULL,
	`nomeFuncionario` varchar(255) NOT NULL,
	`cpfFuncionario` varchar(14),
	`funcaoFuncionario` varchar(100),
	`obraFuncionario` varchar(255),
	`destinatarios` json,
	`disparadoPor` varchar(255),
	`disparoAutomatico` tinyint NOT NULL DEFAULT 1,
	`statusEnvio` enum('enviado','erro','pendente') NOT NULL DEFAULT 'pendente',
	`erroMensagem` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `job_functions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` text,
	`ordemServico` text,
	`cbo` varchar(10),
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `manual_obra_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`justificativa` text NOT NULL,
	`percentual` int NOT NULL DEFAULT 100,
	`atribuidoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `meal_benefit_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`nome` varchar(255) NOT NULL DEFAULT 'Padrão',
	`cafeManhaDia` varchar(20) DEFAULT '0',
	`lancheTardeDia` varchar(20) DEFAULT '0',
	`valeAlimentacaoMes` varchar(20) DEFAULT '0',
	`jantaDia` varchar(20) DEFAULT '0',
	`totalVA_iFood` varchar(20) DEFAULT '0',
	`diasUteisRef` int DEFAULT 22,
	`cafeAtivo` tinyint DEFAULT 1,
	`lancheAtivo` tinyint DEFAULT 1,
	`jantaAtivo` tinyint DEFAULT 0,
	`observacoes` text,
	`ativo` tinyint DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `menu_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`configJson` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `menu_labels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`originalLabel` varchar(255) NOT NULL,
	`customLabel` varchar(255) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `monthly_payroll_summary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`nomeColaborador` varchar(255),
	`codigoContabil` varchar(20),
	`funcao` varchar(100),
	`dataAdmissao` date,
	`salarioBaseHora` varchar(20),
	`horasMensais` varchar(10),
	`adiantamentoBruto` varchar(20),
	`adiantamentoDescontos` varchar(20),
	`adiantamentoLiquido` varchar(20),
	`salarioHorista` varchar(20),
	`dsr` varchar(20),
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`folhaLiquido` varchar(20),
	`baseInss` varchar(20),
	`valorInss` varchar(20),
	`baseFgts` varchar(20),
	`valorFgts` varchar(20),
	`baseIrrf` varchar(20),
	`valorIrrf` varchar(20),
	`diferencaSalario` varchar(20),
	`horasExtrasValor` varchar(20),
	`vrBeneficio` varchar(20),
	`bancoAdiantamento` varchar(100),
	`bancoFolha` varchar(100),
	`custoTotalMes` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int,
	`employeeName` varchar(255) NOT NULL,
	`employeeCpf` varchar(20),
	`employeeFuncao` varchar(100),
	`tipoMovimentacao` enum('contratacao','demissao','transferencia','afastamento') NOT NULL,
	`statusAnterior` varchar(50),
	`statusNovo` varchar(50),
	`recipientId` int,
	`recipientName` varchar(255) NOT NULL,
	`recipientEmail` varchar(255) NOT NULL,
	`titulo` varchar(500) NOT NULL,
	`corpo` text,
	`statusEnvio` enum('enviado','erro','pendente') NOT NULL DEFAULT 'pendente',
	`erroMensagem` text,
	`trackingId` varchar(64),
	`lido` boolean NOT NULL DEFAULT false,
	`lidoEm` timestamp,
	`disparadoPor` varchar(255),
	`disparadoPorId` int,
	`enviadoEm` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `notification_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`notificarContratacao` boolean NOT NULL DEFAULT true,
	`notificarDemissao` boolean NOT NULL DEFAULT true,
	`notificarTransferencia` boolean NOT NULL DEFAULT false,
	`notificarAfastamento` boolean NOT NULL DEFAULT false,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `obra_funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`obraId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`funcaoNaObra` varchar(100),
	`dataInicio` date,
	`dataFim` date,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `obra_horas_rateio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int NOT NULL,
	`employeeId` int NOT NULL,
	`dixiDeviceId` int,
	`mesAno` varchar(7) NOT NULL,
	`horasNormais` varchar(10),
	`horasExtras` varchar(10),
	`horasNoturnas` varchar(10),
	`totalHoras` varchar(10),
	`diasTrabalhados` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `obra_sns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`sn` varchar(50) NOT NULL,
	`apelido` varchar(100),
	`status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
	`dataVinculo` date,
	`dataLiberacao` date,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `obras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`codigo` varchar(50),
	`cliente` varchar(255),
	`responsavel` varchar(255),
	`endereco` text,
	`cidade` varchar(100),
	`estado` varchar(2),
	`cep` varchar(10),
	`dataInicio` date,
	`dataPrevisaoFim` date,
	`dataFimReal` date,
	`status` enum('Planejamento','Em_Andamento','Paralisada','Concluida','Cancelada') NOT NULL DEFAULT 'Planejamento',
	`valorContrato` varchar(20),
	`observacoes` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`numOrcamento` varchar(50),
	`snRelogioPonto` varchar(50),
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `payroll` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipoFolha` enum('Mensal','Adiantamento','Ferias','Rescisao','PLR','13_Salario') NOT NULL,
	`salarioBruto` varchar(20),
	`totalProventos` varchar(20),
	`totalDescontos` varchar(20),
	`salarioLiquido` varchar(20),
	`inss` varchar(20),
	`irrf` varchar(20),
	`fgts` varchar(20),
	`valeTransporte` varchar(20),
	`valeAlimentacao` varchar(20),
	`outrosProventos` text,
	`outrosDescontos` text,
	`bancoDestino` varchar(100),
	`dataPagamento` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `payroll_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`category` enum('cartao_ponto','espelho_adiantamento_analitico','adiantamento_sintetico','espelho_folha_analitico','folha_sintetico') NOT NULL,
	`month` varchar(7) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`uploadStatus` enum('pendente','processando','processado','erro') NOT NULL DEFAULT 'pendente',
	`recordsProcessed` int DEFAULT 0,
	`errorMessage` text,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`module` varchar(50) NOT NULL,
	`canView` tinyint NOT NULL DEFAULT 0,
	`canCreate` tinyint NOT NULL DEFAULT 0,
	`canEdit` tinyint NOT NULL DEFAULT 0,
	`canDelete` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `pj_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`numeroContrato` varchar(50),
	`cnpjPrestador` varchar(20),
	`razaoSocialPrestador` varchar(255),
	`objetoContrato` text,
	`dataInicio` date NOT NULL,
	`dataFim` date NOT NULL,
	`renovacaoAutomatica` tinyint DEFAULT 0,
	`valorMensal` varchar(20),
	`percentualAdiantamento` int DEFAULT 40,
	`percentualFechamento` int DEFAULT 60,
	`diaAdiantamento` int DEFAULT 15,
	`diaFechamento` int DEFAULT 5,
	`modeloContratoUrl` text,
	`contratoAssinadoUrl` text,
	`tipoAssinatura` enum('manual','digital','pendente') DEFAULT 'pendente',
	`status` enum('ativo','vencido','renovado','cancelado','pendente_assinatura') NOT NULL DEFAULT 'pendente_assinatura',
	`alertaVencimentoEnviado` tinyint DEFAULT 0,
	`contratoAnteriorId` int,
	`observacoes` text,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `pj_medicoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`contractId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`horasTrabalhadas` varchar(20) NOT NULL,
	`valorHora` varchar(20) NOT NULL,
	`valorBruto` varchar(20) NOT NULL,
	`descontos` varchar(20) DEFAULT '0',
	`acrescimos` varchar(20) DEFAULT '0',
	`descricaoDescontos` text,
	`descricaoAcrescimos` text,
	`valorLiquido` varchar(20) NOT NULL,
	`notaFiscalNumero` varchar(50),
	`notaFiscalUrl` text,
	`status` enum('rascunho','pendente_aprovacao','aprovada','paga','cancelada') NOT NULL DEFAULT 'rascunho',
	`aprovadoPor` varchar(255),
	`aprovadoEm` timestamp,
	`dataPagamento` date,
	`comprovanteUrl` text,
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `pj_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`tipo` enum('adiantamento','fechamento','bonificacao') NOT NULL,
	`valor` varchar(20) NOT NULL,
	`descricao` text,
	`dataPagamento` date,
	`status` enum('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
	`comprovanteUrl` text,
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ponto_consolidacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`status` enum('aberto','consolidado') NOT NULL DEFAULT 'aberto',
	`consolidadoPor` varchar(255),
	`consolidadoEm` timestamp,
	`desconsolidadoPor` varchar(255),
	`desconsolidadoEm` timestamp,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ponto_descontos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('atraso','saida_antecipada','falta_injustificada','falta_dsr','falta_feriado','he_nao_autorizada') NOT NULL,
	`minutosAtraso` int DEFAULT 0,
	`minutosHe` int DEFAULT 0,
	`valorDesconto` varchar(20) DEFAULT '0',
	`valorDsr` varchar(20) DEFAULT '0',
	`valorTotal` varchar(20) DEFAULT '0',
	`baseCalculo` text,
	`timeRecordId` int,
	`heSolicitacaoId` int,
	`status` enum('calculado','revisado','abonado','fechado') NOT NULL DEFAULT 'calculado',
	`abonadoPor` varchar(255),
	`abonadoEm` timestamp,
	`motivoAbono` text,
	`fundamentacaoLegal` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ponto_descontos_resumo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`totalAtrasos` int DEFAULT 0,
	`totalMinutosAtraso` int DEFAULT 0,
	`totalFaltasInjustificadas` int DEFAULT 0,
	`totalSaidasAntecipadas` int DEFAULT 0,
	`totalMinutosSaidaAntecipada` int DEFAULT 0,
	`totalDsrPerdidos` int DEFAULT 0,
	`totalFeriadosPerdidos` int DEFAULT 0,
	`totalHeNaoAutorizadas` int DEFAULT 0,
	`totalMinutosHeNaoAutorizada` int DEFAULT 0,
	`valorTotalAtrasos` varchar(20) DEFAULT '0',
	`valorTotalFaltas` varchar(20) DEFAULT '0',
	`valorTotalDsr` varchar(20) DEFAULT '0',
	`valorTotalFeriados` varchar(20) DEFAULT '0',
	`valorTotalSaidasAntecipadas` varchar(20) DEFAULT '0',
	`valorTotalHeNaoAutorizada` varchar(20) DEFAULT '0',
	`valorTotalDescontos` varchar(20) DEFAULT '0',
	`faltasAcumuladasPeriodoAquisitivo` int DEFAULT 0,
	`diasFeriasResultante` int DEFAULT 30,
	`status` enum('calculado','revisado','fechado') NOT NULL DEFAULT 'calculado',
	`revisadoPor` varchar(255),
	`revisadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `processos_andamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`data` date NOT NULL,
	`tipo` enum('audiencia','despacho','sentenca','recurso','pericia','acordo','pagamento','citacao','intimacao','peticao','outros') NOT NULL DEFAULT 'outros',
	`descricao` text NOT NULL,
	`resultado` varchar(255),
	`documentoUrl` varchar(500),
	`documentoNome` varchar(255),
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `processos_trabalhistas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`numeroProcesso` varchar(50) NOT NULL,
	`vara` varchar(100),
	`comarca` varchar(100),
	`tribunal` varchar(100),
	`justica` enum('trabalho','federal','estadual','outros') NOT NULL DEFAULT 'trabalho',
	`tipoAcao` enum('reclamatoria','indenizatoria','rescisao_indireta','acidente_trabalho','doenca_ocupacional','assedio','execucao_fiscal','mandado_seguranca','acao_civil_publica','outros') NOT NULL DEFAULT 'reclamatoria',
	`reclamante` varchar(255) NOT NULL,
	`advogadoReclamante` varchar(255),
	`advogadoEmpresa` varchar(255),
	`valorCausa` varchar(20),
	`valorCondenacao` varchar(20),
	`valorAcordo` varchar(20),
	`valorPago` varchar(20),
	`dataDistribuicao` date,
	`dataDesligamento` date,
	`dataCitacao` date,
	`dataAudiencia` date,
	`dataEncerramento` date,
	`status` enum('em_andamento','aguardando_audiencia','aguardando_pericia','acordo','sentenca','recurso','execucao','arquivado','encerrado') NOT NULL DEFAULT 'em_andamento',
	`fase` enum('conhecimento','recursal','execucao','encerrado') NOT NULL DEFAULT 'conhecimento',
	`risco` enum('baixo','medio','alto','critico') NOT NULL DEFAULT 'medio',
	`pedidos` json,
	`clienteCnpj` varchar(20),
	`clienteRazaoSocial` varchar(255),
	`clienteNomeFantasia` varchar(255),
	`observacoes` text,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`setor` varchar(100) NOT NULL,
	`agenteRisco` varchar(255) NOT NULL,
	`tipoRisco` enum('Fisico','Quimico','Biologico','Ergonomico','Acidente') NOT NULL,
	`fonteGeradora` varchar(255),
	`grauRisco` enum('Baixo','Medio','Alto','Critico') NOT NULL,
	`medidasControle` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `sectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` varchar(255),
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `system_criteria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`categoria` varchar(50) NOT NULL,
	`chave` varchar(100) NOT NULL,
	`valor` varchar(255) NOT NULL,
	`descricao` varchar(500),
	`valorPadraoClt` varchar(255),
	`unidade` varchar(50),
	`atualizadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `system_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text NOT NULL,
	`tipo` enum('feature','bugfix','melhoria','seguranca','performance') NOT NULL,
	`modulos` text,
	`criadoPor` varchar(255) NOT NULL,
	`dataPublicacao` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `termination_notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipo` enum('empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado') NOT NULL,
	`dataInicio` date NOT NULL,
	`dataFim` date NOT NULL,
	`diasAviso` int NOT NULL DEFAULT 30,
	`anosServico` int DEFAULT 0,
	`reducaoJornada` enum('2h_dia','7_dias_corridos','nenhuma') DEFAULT 'nenhuma',
	`salarioBase` varchar(20),
	`previsaoRescisao` text,
	`valorEstimadoTotal` varchar(20),
	`status` enum('em_andamento','concluido','cancelado') NOT NULL DEFAULT 'em_andamento',
	`dataConclusao` date,
	`motivoCancelamento` text,
	`observacoes` text,
	`criadoPor` varchar(255),
	`criadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `time_inconsistencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraId` int,
	`timeRecordId` int,
	`mesReferencia` varchar(7) NOT NULL,
	`data` date NOT NULL,
	`tipoInconsistencia` enum('batida_impar','falta_batida','horario_divergente','batida_duplicada','sem_registro') NOT NULL,
	`descricao` text,
	`status` enum('pendente','justificado','ajustado','advertencia') NOT NULL DEFAULT 'pendente',
	`justificativa` text,
	`resolvidoPor` varchar(255),
	`resolvidoEm` date,
	`warningId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `time_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`obraId` int,
	`mesReferencia` varchar(7),
	`data` date NOT NULL,
	`entrada1` varchar(10),
	`saida1` varchar(10),
	`entrada2` varchar(10),
	`saida2` varchar(10),
	`entrada3` varchar(10),
	`saida3` varchar(10),
	`horasTrabalhadas` varchar(10),
	`horasExtras` varchar(10),
	`horasNoturnas` varchar(10),
	`faltas` varchar(10),
	`atrasos` varchar(10),
	`justificativa` text,
	`fonte` varchar(50) DEFAULT 'dixi',
	`ajusteManual` tinyint DEFAULT 0,
	`ajustadoPor` varchar(255),
	`batidasBrutas` json,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `training_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainingId` int NOT NULL,
	`employeeId` int NOT NULL,
	`companyId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`norma` varchar(50),
	`cargaHoraria` varchar(20),
	`dataRealizacao` date NOT NULL,
	`dataValidade` date,
	`instrutor` varchar(255),
	`entidade` varchar(255),
	`certificadoUrl` text,
	`statusTreinamento` enum('Valido','Vencido','A_Vencer') NOT NULL DEFAULT 'Valido',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `unmatched_dixi_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`obraId` int,
	`mesReferencia` varchar(7) NOT NULL,
	`dixiName` varchar(255) NOT NULL,
	`dixiId` varchar(50),
	`data` date NOT NULL,
	`entrada1` varchar(10),
	`saida1` varchar(10),
	`entrada2` varchar(10),
	`saida2` varchar(10),
	`entrada3` varchar(10),
	`saida3` varchar(10),
	`batidasBrutas` json,
	`status` enum('pendente','vinculado','descartado') NOT NULL DEFAULT 'pendente',
	`linkedEmployeeId` int,
	`resolvidoPor` varchar(255),
	`resolvidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `user_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`company_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`module_id` varchar(50) NOT NULL,
	`feature_key` varchar(100) NOT NULL,
	`can_access` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`profileType` enum('adm_master','adm','operacional','avaliador','consulta') NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin','admin_master') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`username` varchar(100),
	`password` varchar(255),
	`mustChangePassword` tinyint DEFAULT 1,
	`avatarUrl` text,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int,
	`modulesAccess` text
);
--> statement-breakpoint
CREATE TABLE `vacation_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`periodoAquisitivoInicio` date NOT NULL,
	`periodoAquisitivoFim` date NOT NULL,
	`periodoConcessivoFim` date NOT NULL,
	`dataInicio` date,
	`dataFim` date,
	`diasGozo` int DEFAULT 30,
	`fracionamento` int DEFAULT 1,
	`periodo2Inicio` date,
	`periodo2Fim` date,
	`periodo3Inicio` date,
	`periodo3Fim` date,
	`abonoPecuniario` tinyint DEFAULT 0,
	`valorFerias` varchar(20),
	`valorTercoConstitucional` varchar(20),
	`valorAbono` varchar(20),
	`valorTotal` varchar(20),
	`dataPagamento` date,
	`status` enum('pendente','agendada','em_gozo','concluida','vencida','cancelada') NOT NULL DEFAULT 'pendente',
	`vencida` tinyint DEFAULT 0,
	`pagamentoEmDobro` tinyint DEFAULT 0,
	`observacoes` text,
	`aprovadoPor` varchar(255),
	`aprovadoPorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`tipoVeiculo` enum('Carro','Caminhao','Van','Moto','Maquina_Pesada','Outro') NOT NULL,
	`placa` varchar(10),
	`modelo` varchar(100) NOT NULL,
	`marca` varchar(100),
	`anoFabricacao` varchar(4),
	`renavam` varchar(20),
	`chassi` varchar(30),
	`responsavel` varchar(255),
	`statusVeiculo` enum('Ativo','Manutencao','Inativo') NOT NULL DEFAULT 'Ativo',
	`proximaManutencao` date,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `vr_benefits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`mesReferencia` varchar(7) NOT NULL,
	`valorDiario` varchar(20),
	`diasUteis` int,
	`valorTotal` varchar(20) NOT NULL,
	`operadora` varchar(100) DEFAULT 'iFood Benefícios',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`tipoAdvertencia` enum('Verbal','Escrita','Suspensao','JustaCausa','OSS') NOT NULL,
	`sequencia` int DEFAULT 1,
	`dataOcorrencia` date NOT NULL,
	`motivo` text NOT NULL,
	`descricao` text,
	`testemunhas` text,
	`aplicadoPor` varchar(255),
	`diasSuspensao` int,
	`documentoUrl` text,
	`origemModulo` varchar(50),
	`origemId` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedBy` varchar(255),
	`deletedByUserId` int
);
--> statement-breakpoint
CREATE INDEX `brr_company` ON `blacklist_reactivation_requests` (`companyId`);--> statement-breakpoint
CREATE INDEX `brr_employee` ON `blacklist_reactivation_requests` (`employeeId`);--> statement-breakpoint
CREATE INDEX `brr_status` ON `blacklist_reactivation_requests` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `caepi_ca_idx` ON `caepi_database` (`ca`);--> statement-breakpoint
CREATE INDEX `cmt_mandate` ON `cipa_meetings` (`mandateId`);--> statement-breakpoint
CREATE INDEX `cmt_company` ON `cipa_meetings` (`companyId`);--> statement-breakpoint
CREATE INDEX `cmt_data` ON `cipa_meetings` (`dataReuniao`);--> statement-breakpoint
CREATE INDEX `companies_cnpj_unique` ON `companies` (`cnpj`);--> statement-breakpoint
CREATE INDEX `cba_company` ON `company_bank_accounts` (`companyId`);--> statement-breakpoint
CREATE INDEX `df_dissidio` ON `dissidio_funcionarios` (`dissidioId`);--> statement-breakpoint
CREATE INDEX `df_employee` ON `dissidio_funcionarios` (`employeeId`);--> statement-breakpoint
CREATE INDEX `df_company` ON `dissidio_funcionarios` (`companyId`);--> statement-breakpoint
CREATE INDEX `diss_company_ano` ON `dissidios` (`companyId`,`anoReferencia`);--> statement-breakpoint
CREATE INDEX `diss_status` ON `dissidios` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `dai_company` ON `dixi_afd_importacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `dai_sn` ON `dixi_afd_importacoes` (`snRelogio`);--> statement-breakpoint
CREATE INDEX `dai_data` ON `dixi_afd_importacoes` (`dataImportacao`);--> statement-breakpoint
CREATE INDEX `dam_company` ON `dixi_afd_marcacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `dam_importacao` ON `dixi_afd_marcacoes` (`importacaoId`);--> statement-breakpoint
CREATE INDEX `dam_cpf` ON `dixi_afd_marcacoes` (`cpf`);--> statement-breakpoint
CREATE INDEX `dam_data` ON `dixi_afd_marcacoes` (`data`);--> statement-breakpoint
CREATE INDEX `dam_employee` ON `dixi_afd_marcacoes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `dnm_company` ON `dixi_name_mappings` (`companyId`);--> statement-breakpoint
CREATE INDEX `dnm_dixi_name` ON `dixi_name_mappings` (`companyId`,`dixiName`);--> statement-breakpoint
CREATE INDEX `dnm_employee` ON `dixi_name_mappings` (`employeeId`);--> statement-breakpoint
CREATE INDEX `doc_templates_company_tipo` ON `document_templates` (`companyId`,`tipo`);--> statement-breakpoint
CREATE INDEX `et_company` ON `email_templates` (`companyId`);--> statement-breakpoint
CREATE INDEX `et_company_tipo` ON `email_templates` (`companyId`,`tipo`);--> statement-breakpoint
CREATE INDEX `edoc_company` ON `employee_documents` (`companyId`);--> statement-breakpoint
CREATE INDEX `edoc_employee` ON `employee_documents` (`employeeId`);--> statement-breakpoint
CREATE INDEX `edoc_tipo` ON `employee_documents` (`tipo`);--> statement-breakpoint
CREATE INDEX `eda_company` ON `epi_discount_alerts` (`companyId`);--> statement-breakpoint
CREATE INDEX `eda_employee` ON `epi_discount_alerts` (`employeeId`);--> statement-breakpoint
CREATE INDEX `eda_delivery` ON `epi_discount_alerts` (`epiDeliveryId`);--> statement-breakpoint
CREATE INDEX `eda_status` ON `epi_discount_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `eda_mes` ON `epi_discount_alerts` (`companyId`,`mes_referencia`);--> statement-breakpoint
CREATE INDEX `eal_company` ON `eval_audit_log` (`companyId`);--> statement-breakpoint
CREATE INDEX `eal_action` ON `eval_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `eal_actor` ON `eval_audit_log` (`actorType`,`actorId`);--> statement-breakpoint
CREATE INDEX `ea_company` ON `eval_avaliacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `ea_employee` ON `eval_avaliacoes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ea_evaluator` ON `eval_avaliacoes` (`evaluatorId`);--> statement-breakpoint
CREATE INDEX `ea_mes` ON `eval_avaliacoes` (`mesReferencia`);--> statement-breakpoint
CREATE INDEX `eva_company` ON `eval_avaliadores` (`companyId`);--> statement-breakpoint
CREATE INDEX `eva_email` ON `eval_avaliadores` (`email`);--> statement-breakpoint
CREATE INDEX `ecla_response` ON `eval_climate_answers` (`responseId`);--> statement-breakpoint
CREATE INDEX `ecla_question` ON `eval_climate_answers` (`questionId`);--> statement-breakpoint
CREATE INDEX `ecet_survey` ON `eval_climate_external_tokens` (`surveyId`);--> statement-breakpoint
CREATE INDEX `ecet_token` ON `eval_climate_external_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `ecq_survey` ON `eval_climate_questions` (`surveyId`);--> statement-breakpoint
CREATE INDEX `eclr_survey` ON `eval_climate_responses` (`surveyId`);--> statement-breakpoint
CREATE INDEX `ecs_company` ON `eval_climate_surveys` (`companyId`);--> statement-breakpoint
CREATE INDEX `ec_pillar` ON `eval_criteria` (`pillarId`);--> statement-breakpoint
CREATE INDEX `ec_revision` ON `eval_criteria` (`revisionId`);--> statement-breakpoint
CREATE INDEX `ecr_company` ON `eval_criteria_revisions` (`companyId`);--> statement-breakpoint
CREATE INDEX `eep_company` ON `eval_external_participants` (`companyId`);--> statement-breakpoint
CREATE INDEX `ep_revision` ON `eval_pillars` (`revisionId`);--> statement-breakpoint
CREATE INDEX `es_evaluation` ON `eval_scores` (`evaluationId`);--> statement-breakpoint
CREATE INDEX `es_criterion` ON `eval_scores` (`criterionId`);--> statement-breakpoint
CREATE INDEX `esa_response` ON `eval_survey_answers` (`responseId`);--> statement-breakpoint
CREATE INDEX `esa_question` ON `eval_survey_answers` (`questionId`);--> statement-breakpoint
CREATE INDEX `ese_survey` ON `eval_survey_evaluators` (`surveyId`);--> statement-breakpoint
CREATE INDEX `ese_evaluator` ON `eval_survey_evaluators` (`evaluatorId`);--> statement-breakpoint
CREATE INDEX `esq_survey` ON `eval_survey_questions` (`surveyId`);--> statement-breakpoint
CREATE INDEX `esr_survey` ON `eval_survey_responses` (`surveyId`);--> statement-breakpoint
CREATE INDEX `esu_company` ON `eval_surveys` (`companyId`);--> statement-breakpoint
CREATE INDEX `fer_company` ON `feriados` (`companyId`);--> statement-breakpoint
CREATE INDEX `fer_data` ON `feriados` (`data`);--> statement-breakpoint
CREATE INDEX `fer_tipo` ON `feriados` (`tipo`);--> statement-breakpoint
CREATE INDEX `folha_itens_lanc` ON `folha_itens` (`folhaLancamentoId`);--> statement-breakpoint
CREATE INDEX `folha_itens_emp` ON `folha_itens` (`employeeId`);--> statement-breakpoint
CREATE INDEX `folha_lanc_company_mes` ON `folha_lancamentos` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `he_sol_func_sol` ON `he_solicitacao_funcionarios` (`solicitacaoId`);--> statement-breakpoint
CREATE INDEX `he_sol_func_emp` ON `he_solicitacao_funcionarios` (`employeeId`);--> statement-breakpoint
CREATE INDEX `he_sol_company` ON `he_solicitacoes` (`companyId`);--> statement-breakpoint
CREATE INDEX `he_sol_obra` ON `he_solicitacoes` (`obraId`);--> statement-breakpoint
CREATE INDEX `he_sol_data` ON `he_solicitacoes` (`dataSolicitacao`);--> statement-breakpoint
CREATE INDEX `he_sol_status` ON `he_solicitacoes` (`status`);--> statement-breakpoint
CREATE INDEX `he_sol_company_status` ON `he_solicitacoes` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `iac_company` ON `insurance_alert_config` (`companyId`);--> statement-breakpoint
CREATE INDEX `iar_company` ON `insurance_alert_recipients` (`companyId`);--> statement-breakpoint
CREATE INDEX `iar_config` ON `insurance_alert_recipients` (`configId`);--> statement-breakpoint
CREATE INDEX `ial_company` ON `insurance_alerts_log` (`companyId`);--> statement-breakpoint
CREATE INDEX `ial_employee` ON `insurance_alerts_log` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ial_tipo` ON `insurance_alerts_log` (`companyId`,`tipoMovimentacao`);--> statement-breakpoint
CREATE INDEX `ial_data` ON `insurance_alerts_log` (`companyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `moa_company_mes` ON `manual_obra_assignments` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `moa_employee_mes` ON `manual_obra_assignments` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `mbc_company` ON `meal_benefit_configs` (`companyId`);--> statement-breakpoint
CREATE INDEX `mbc_obra` ON `meal_benefit_configs` (`obraId`);--> statement-breakpoint
CREATE INDEX `mc_user` ON `menu_config` (`userId`);--> statement-breakpoint
CREATE INDEX `ml_company` ON `menu_labels` (`companyId`);--> statement-breakpoint
CREATE INDEX `nl_company` ON `notification_logs` (`companyId`);--> statement-breakpoint
CREATE INDEX `nl_employee` ON `notification_logs` (`employeeId`);--> statement-breakpoint
CREATE INDEX `nl_tipo` ON `notification_logs` (`companyId`,`tipoMovimentacao`);--> statement-breakpoint
CREATE INDEX `nl_tracking` ON `notification_logs` (`trackingId`);--> statement-breakpoint
CREATE INDEX `nl_data` ON `notification_logs` (`companyId`,`enviadoEm`);--> statement-breakpoint
CREATE INDEX `nr_company` ON `notification_recipients` (`companyId`);--> statement-breakpoint
CREATE INDEX `nr_email` ON `notification_recipients` (`email`);--> statement-breakpoint
CREATE INDEX `obra_sn_company` ON `obra_sns` (`companyId`);--> statement-breakpoint
CREATE INDEX `obra_sn_obra` ON `obra_sns` (`obraId`);--> statement-breakpoint
CREATE INDEX `obra_sn_sn` ON `obra_sns` (`sn`);--> statement-breakpoint
CREATE INDEX `pjc_company` ON `pj_contracts` (`companyId`);--> statement-breakpoint
CREATE INDEX `pjc_employee` ON `pj_contracts` (`employeeId`);--> statement-breakpoint
CREATE INDEX `pjc_status` ON `pj_contracts` (`status`);--> statement-breakpoint
CREATE INDEX `pjc_vencimento` ON `pj_contracts` (`dataFim`);--> statement-breakpoint
CREATE INDEX `pjm_company_mes` ON `pj_medicoes` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pjm_contract` ON `pj_medicoes` (`contractId`);--> statement-breakpoint
CREATE INDEX `pjm_employee` ON `pj_medicoes` (`employeeId`);--> statement-breakpoint
CREATE INDEX `pjm_status` ON `pj_medicoes` (`status`);--> statement-breakpoint
CREATE INDEX `pjp_contract` ON `pj_payments` (`contractId`);--> statement-breakpoint
CREATE INDEX `pjp_company_mes` ON `pj_payments` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pjp_employee` ON `pj_payments` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ponto_consolidacao_company_mes` ON `ponto_consolidacao` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pd_company_mes` ON `ponto_descontos` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pd_employee_mes` ON `ponto_descontos` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pd_tipo` ON `ponto_descontos` (`tipo`);--> statement-breakpoint
CREATE INDEX `pd_status` ON `ponto_descontos` (`status`);--> statement-breakpoint
CREATE INDEX `pd_data` ON `ponto_descontos` (`data`);--> statement-breakpoint
CREATE INDEX `pdr_company_mes` ON `ponto_descontos_resumo` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pdr_employee_mes` ON `ponto_descontos_resumo` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `pa_processo` ON `processos_andamentos` (`processoId`);--> statement-breakpoint
CREATE INDEX `pa_data` ON `processos_andamentos` (`processoId`,`data`);--> statement-breakpoint
CREATE INDEX `pt_company` ON `processos_trabalhistas` (`companyId`);--> statement-breakpoint
CREATE INDEX `pt_employee` ON `processos_trabalhistas` (`employeeId`);--> statement-breakpoint
CREATE INDEX `pt_status` ON `processos_trabalhistas` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `pt_numero` ON `processos_trabalhistas` (`numeroProcesso`);--> statement-breakpoint
CREATE INDEX `sys_criteria_company_cat` ON `system_criteria` (`companyId`,`categoria`);--> statement-breakpoint
CREATE INDEX `sys_criteria_company_key` ON `system_criteria` (`companyId`,`chave`);--> statement-breakpoint
CREATE INDEX `sr_version` ON `system_revisions` (`version`);--> statement-breakpoint
CREATE INDEX `tn_company` ON `termination_notices` (`companyId`);--> statement-breakpoint
CREATE INDEX `tn_employee` ON `termination_notices` (`employeeId`);--> statement-breakpoint
CREATE INDEX `tn_status` ON `termination_notices` (`status`);--> statement-breakpoint
CREATE INDEX `time_incons_emp_mes` ON `time_inconsistencies` (`employeeId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `time_records_emp_date` ON `time_records` (`employeeId`,`data`);--> statement-breakpoint
CREATE INDEX `time_records_company_mes` ON `time_records` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `udr_company_mes` ON `unmatched_dixi_records` (`companyId`,`mesReferencia`);--> statement-breakpoint
CREATE INDEX `udr_status` ON `unmatched_dixi_records` (`status`);--> statement-breakpoint
CREATE INDEX `udr_dixi_name` ON `unmatched_dixi_records` (`dixiName`);--> statement-breakpoint
CREATE INDEX `uc_user` ON `user_companies` (`user_id`);--> statement-breakpoint
CREATE INDEX `uc_company` ON `user_companies` (`company_id`);--> statement-breakpoint
CREATE INDEX `up_user` ON `user_permissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `up_module` ON `user_permissions` (`module_id`);--> statement-breakpoint
CREATE INDEX `up_user_module` ON `user_permissions` (`user_id`,`module_id`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `vp_company` ON `vacation_periods` (`companyId`);--> statement-breakpoint
CREATE INDEX `vp_employee` ON `vacation_periods` (`employeeId`);--> statement-breakpoint
CREATE INDEX `vp_status` ON `vacation_periods` (`status`);--> statement-breakpoint
CREATE INDEX `vp_concessivo` ON `vacation_periods` (`periodoConcessivoFim`);